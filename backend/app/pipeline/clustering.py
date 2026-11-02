"""Module 2b: DBSCAN behavioural clustering.

DBSCAN's neighbourhood queries are memory-hungry on hundreds of thousands of flows,
so the algorithm is fitted on a random sample in PCA space. Identical sample points
are collapsed and passed as ``sample_weight`` (exactly equivalent for DBSCAN), then
every remaining flow is assigned the cluster of its nearest core point if it lies
within ``eps`` (otherwise noise) — the standard way to extend a fitted DBSCAN model.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN
from sklearn.decomposition import PCA
from sklearn.metrics import davies_bouldin_score, silhouette_score
from sklearn.neighbors import NearestNeighbors


def estimate_eps(Z: np.ndarray, min_samples: int) -> tuple[float, list[dict]]:
    """Pick eps at the knee of the sorted k-distance curve (max distance to chord)."""
    k = min(min_samples, len(Z) - 1)
    nn = NearestNeighbors(n_neighbors=k + 1).fit(Z)
    dist, _ = nn.kneighbors(Z)
    kd = np.sort(dist[:, -1])
    n = len(kd)
    x = np.linspace(0, 1, n)
    y = (kd - kd[0]) / (kd[-1] - kd[0] + 1e-12)
    # distance from each point to the line through (0,0) and (1,1)
    knee = int(np.argmax(np.abs(y - x) * (x > y)) if np.any(x > y) else np.argmax(np.abs(y - x)))
    eps = float(kd[knee])
    if eps <= 0:
        positive = kd[kd > 0]
        eps = float(np.percentile(positive, 50)) if len(positive) else 0.5
    curve_idx = np.linspace(0, n - 1, min(n, 200)).astype(int)
    curve = [{"rank": int(i), "k_distance": float(kd[i])} for i in curve_idx]
    return eps, curve


def run_dbscan(
    X: np.ndarray,
    eps: float | None = None,
    min_samples: int = 10,
    sample_size: int = 15_000,
    pca_components: int = 10,
    random_state: int = 42,
) -> dict:
    n = len(X)
    n_comp = max(2, min(pca_components, X.shape[1]))
    pca = PCA(n_components=n_comp, random_state=random_state)
    Z = pca.fit_transform(X).astype(np.float32)

    rng = np.random.default_rng(random_state)
    sample_idx = np.sort(rng.choice(n, size=min(sample_size, n), replace=False))
    Zs = Z[sample_idx]

    # Collapse duplicates so dense identical flows don't explode neighbourhood memory.
    rounded = np.round(Zs, 5)
    uniq, inverse, counts = np.unique(rounded, axis=0, return_inverse=True, return_counts=True)
    inverse = inverse.ravel()

    eps_estimated = eps is None
    kdist_curve: list[dict] = []
    if eps is None:
        eps, kdist_curve = estimate_eps(uniq, min_samples)

    db = DBSCAN(eps=eps, min_samples=min_samples, n_jobs=-1)
    db.fit(uniq, sample_weight=counts)
    uniq_labels = db.labels_
    sample_labels = uniq_labels[inverse]

    labels = np.full(n, -1, dtype=np.int32)
    labels[sample_idx] = sample_labels
    core_mask = np.zeros(len(uniq), dtype=bool)
    core_mask[db.core_sample_indices_] = True
    rest = np.setdiff1d(np.arange(n), sample_idx, assume_unique=True)
    if core_mask.any() and len(rest):
        core_pts = uniq[core_mask]
        core_lab = uniq_labels[core_mask]
        nn = NearestNeighbors(n_neighbors=1).fit(core_pts)
        for start in range(0, len(rest), 50_000):
            chunk = rest[start:start + 50_000]
            d, j = nn.kneighbors(Z[chunk])
            labels[chunk] = np.where(d[:, 0] <= eps, core_lab[j[:, 0]], -1)

    return {
        "labels": labels,
        "Z": Z,
        "sample_idx": sample_idx,
        "sample_labels": sample_labels,
        "eps": float(eps),
        "eps_estimated": eps_estimated,
        "min_samples": int(min_samples),
        "kdist_curve": kdist_curve,
        "pca_explained_variance": float(pca.explained_variance_ratio_.sum()),
        "pca_components": int(n_comp),
        "unique_sample_points": int(len(uniq)),
    }


def evaluate(result: dict, labels_gt: pd.Series | None, random_state: int = 42) -> dict:
    """Silhouette / Davies-Bouldin on the fitted sample, purity against labels, noise share."""
    labels = result["labels"]
    s_idx = result["sample_idx"]
    s_lab = result["sample_labels"]
    Zs = result["Z"][s_idx]
    clusters = sorted(set(labels.tolist()) - {-1})
    out: dict = {
        "n_clusters": len(clusters),
        "noise_points": int((labels == -1).sum()),
        "noise_percentage": float((labels == -1).mean() * 100),
        "sample_size": int(len(s_idx)),
        "sample_noise_percentage": float((s_lab == -1).mean() * 100),
        "silhouette": None,
        "davies_bouldin": None,
        "purity": None,
    }
    mask = s_lab != -1
    if len(set(s_lab[mask].tolist())) >= 2:
        n_eval = min(5000, int(mask.sum()))
        out["silhouette"] = float(silhouette_score(
            Zs[mask], s_lab[mask], sample_size=n_eval, random_state=random_state))
        out["davies_bouldin"] = float(davies_bouldin_score(Zs[mask], s_lab[mask]))
        out["silhouette_note"] = (f"Computed on {n_eval:,} non-noise points of the fitted sample "
                                  "in PCA space.")
    if labels_gt is not None and not labels_gt.isna().all():
        lab = labels_gt.to_numpy()
        clustered = labels != -1
        if clustered.any():
            ct = pd.crosstab(labels[clustered], lab[clustered])
            out["purity"] = float(ct.max(axis=1).sum() / clustered.sum())
            out["purity_note"] = "Share of clustered flows whose ground-truth label matches their cluster's majority label."
    return out


def cluster_profiles(
    labels: np.ndarray,
    X: np.ndarray,
    feature_names: list[str],
    flows: pd.DataFrame,
    score: np.ndarray,
    is_anomaly: np.ndarray,
) -> list[dict]:
    """Per-cluster statistics with the features that most distinguish each cluster."""
    profiles = []
    has_labels = flows["label"].notna().any()
    for c in sorted(set(labels.tolist())):
        m = labels == c
        size = int(m.sum())
        mean_z = X[m].mean(axis=0)
        top = np.argsort(-np.abs(mean_z))[:4]
        p = {
            "cluster": int(c),
            "is_noise": c == -1,
            "size": size,
            "share": float(size / len(labels)),
            "anomalous_flows": int(is_anomaly[m].sum()),
            "anomaly_rate": float(is_anomaly[m].mean()),
            "mean_anomaly_score": float(score[m].mean()),
            "distinctive_features": [
                {"feature": feature_names[i], "z": float(mean_z[i])} for i in top
            ],
            "unique_src_ips": int(flows.loc[m, "src_ip"].nunique()) if flows["src_ip"].notna().any() else None,
            "unique_dst_ips": int(flows.loc[m, "dst_ip"].nunique()) if flows["dst_ip"].notna().any() else None,
            "top_dst_ports": [int(x) for x in flows.loc[m, "dst_port"].value_counts().head(5).index if x >= 0],
        }
        if has_labels:
            vc = flows.loc[m, "label"].value_counts()
            p["label_composition"] = [{"label": str(k), "count": int(v)} for k, v in vc.head(5).items()]
            p["majority_label"] = str(vc.index[0]) if len(vc) else None
        profiles.append(p)
    return profiles


def projection(result: dict, is_anomaly: np.ndarray, flows: pd.DataFrame, max_points: int = 2500,
               random_state: int = 42) -> list[dict]:
    """2-D PCA scatter (first two components) of a subsample, for the cluster chart."""
    s_idx = result["sample_idx"]
    rng = np.random.default_rng(random_state)
    pick = s_idx if len(s_idx) <= max_points else np.sort(rng.choice(s_idx, max_points, replace=False))
    Z = result["Z"]
    labels = result["labels"]
    lab = flows["label"]
    return [
        {
            "x": round(float(Z[i, 0]), 4),
            "y": round(float(Z[i, 1]), 4),
            "cluster": int(labels[i]),
            "anomaly": bool(is_anomaly[i]),
            "label": None if lab.iloc[i] is None else str(lab.iloc[i]),
        }
        for i in pick
    ]
