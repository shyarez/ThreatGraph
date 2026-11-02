"""Module 2a: Isolation Forest anomaly detection and its evaluation."""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)


def run_isolation_forest(
    X: np.ndarray,
    n_estimators: int = 200,
    contamination: float | str = 0.1,
    random_state: int = 42,
) -> tuple[np.ndarray, np.ndarray, float]:
    """Return (anomaly_score, is_anomaly, threshold).

    ``anomaly_score`` is the isolation score s(x, n) from Liu et al. (2008), in (0, 1]:
    higher means easier to isolate. It is a ranking score, not a probability of attack.
    """
    if contamination != "auto":
        contamination = float(contamination)
    model = IsolationForest(
        n_estimators=n_estimators,
        contamination=contamination,
        random_state=random_state,
        n_jobs=-1,
    )
    model.fit(X)
    score = -model.score_samples(X)
    threshold = float(-model.offset_)
    is_anomaly = score > threshold
    return score.astype(np.float32), is_anomaly, threshold


def evaluate(labels: pd.Series | None, score: np.ndarray, is_anomaly: np.ndarray) -> dict:
    """Compare flagged flows with ground-truth labels (labels are never used for detection)."""
    out: dict = {
        "flagged": int(is_anomaly.sum()),
        "flagged_fraction": float(is_anomaly.mean()),
        "score_hist": _histogram(score, labels),
    }
    if labels is None or labels.isna().all():
        out["has_labels"] = False
        return out
    known = (labels != "UNKNOWN").to_numpy()
    y_true = (labels != "BENIGN").to_numpy()[known]
    y_pred = is_anomaly[known]
    s = score[known]
    out["has_labels"] = True
    out["evaluated_flows"] = int(known.sum())
    out["attack_fraction"] = float(y_true.mean())
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[False, True]).ravel()
    out["confusion_matrix"] = {"tp": int(tp), "fp": int(fp), "tn": int(tn), "fn": int(fn)}
    out["precision"] = float(precision_score(y_true, y_pred, zero_division=0))
    out["recall"] = float(recall_score(y_true, y_pred, zero_division=0))
    out["f1"] = float(f1_score(y_true, y_pred, zero_division=0))
    out["false_positive_rate"] = float(fp / (fp + tn)) if (fp + tn) else None
    out["accuracy"] = float((tp + tn) / max(len(y_true), 1))
    if 0 < y_true.sum() < len(y_true):
        out["roc_auc"] = float(roc_auc_score(y_true, s))
        out["average_precision"] = float(average_precision_score(y_true, s))
    # Detection rate per attack class.
    lab = labels[known].reset_index(drop=True)
    per = []
    for name, idx in lab.groupby(lab).groups.items():
        idx = np.asarray(list(idx))
        per.append({
            "label": str(name),
            "flows": int(len(idx)),
            "flagged": int(y_pred[idx].sum()),
            "flag_rate": float(y_pred[idx].mean()),
            "mean_score": float(s[idx].mean()),
        })
    out["per_label"] = sorted(per, key=lambda r: -r["flows"])
    return out


def _histogram(score: np.ndarray, labels: pd.Series | None, bins: int = 40) -> list[dict]:
    edges = np.linspace(float(score.min()), float(score.max()) + 1e-9, bins + 1)
    rows = []
    if labels is not None and not labels.isna().all():
        benign = (labels == "BENIGN").to_numpy()
        hb, _ = np.histogram(score[benign], edges)
        ha, _ = np.histogram(score[~benign], edges)
        for i in range(bins):
            rows.append({"bin": round(float((edges[i] + edges[i + 1]) / 2), 4),
                         "benign": int(hb[i]), "attack": int(ha[i])})
    else:
        h, _ = np.histogram(score, edges)
        for i in range(bins):
            rows.append({"bin": round(float((edges[i] + edges[i + 1]) / 2), 4), "count": int(h[i])})
    return rows
