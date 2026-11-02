"""Module 3a: relationship graph construction with NetworkX.

Nodes are IP addresses. Two kinds of undirected, weighted edges are created:

* **communication** — observed: at least one flow between the two IPs.
  weight = log1p(flows) * (1 + anomalous_share)
* **coordination** — inferred between two *suspicious sources* (IPs that originated
  at least ``min_anomalous_flows`` flagged flows), scored from four pieces of
  evidence computed on their flagged flows only:
    - shared destinations   (Jaccard of destination IP sets)
    - shared service ports  (Jaccard of destination port sets)
    - temporal overlap      (overlap of active windows / shorter window)
    - behavioural similarity(DBSCAN cluster-distribution cosine and
                             feature-profile cosine in PCA space)
  An edge is kept only if the weighted score passes ``coordination_threshold`` and
  there is a concrete shared-target signal. weight = 3 * score.

These edges express *correlation* worth investigating, not proof of coordination.
"""
from __future__ import annotations

import math
from itertools import combinations

import networkx as nx
import numpy as np
import pandas as pd

EVIDENCE_WEIGHTS = {"destinations": 0.35, "ports": 0.20, "temporal": 0.20, "behaviour": 0.25}
COORDINATION_WEIGHT_SCALE = 3.0


def _iso(ts) -> str | None:
    return None if ts is None or pd.isna(ts) else pd.Timestamp(ts).isoformat()


def build_graph(flows: pd.DataFrame, Z: np.ndarray, params: dict) -> tuple[nx.Graph, dict]:
    G = nx.Graph()
    has_time = flows["timestamp"].notna().any()

    # ---- node statistics --------------------------------------------------
    out = flows.groupby("src_ip").agg(
        out_flows=("row", "size"), out_anomalous=("is_anomaly", "sum"),
        out_max_score=("score", "max"), out_peers=("dst_ip", "nunique"))
    inn = flows.groupby("dst_ip").agg(
        in_flows=("row", "size"), in_anomalous=("is_anomaly", "sum"),
        in_max_score=("score", "max"), in_peers=("src_ip", "nunique"))
    nodes = out.join(inn, how="outer").fillna(0)
    for r in nodes.itertuples():
        ip = r.Index
        flows_total = int(r.out_flows + r.in_flows)
        anomalous = int(r.out_anomalous + r.in_anomalous)
        G.add_node(ip, flows=flows_total, out_flows=int(r.out_flows), in_flows=int(r.in_flows),
                   anomalous_flows=anomalous, out_anomalous=int(r.out_anomalous),
                   in_anomalous=int(r.in_anomalous),
                   anomaly_rate=anomalous / flows_total if flows_total else 0.0,
                   max_score=float(max(r.out_max_score, r.in_max_score)),
                   suspicious=False)

    # ---- communication edges ---------------------------------------------
    a = flows["src_ip"].where(flows["src_ip"] <= flows["dst_ip"], flows["dst_ip"])
    b = flows["dst_ip"].where(flows["src_ip"] <= flows["dst_ip"], flows["src_ip"])
    f = flows.assign(a=a, b=b)
    pair_agg = {"flows": ("row", "size"), "anomalous": ("is_anomaly", "sum"),
                "mean_score": ("score", "mean"), "max_score": ("score", "max")}
    if has_time:
        pair_agg |= {"first": ("timestamp", "min"), "last": ("timestamp", "max")}
    pairs = f.groupby(["a", "b"]).agg(**pair_agg)
    ports = (f[f["dst_port"] >= 0].groupby(["a", "b", "dst_port"]).size()
             .rename("n").reset_index().sort_values("n", ascending=False)
             .groupby(["a", "b"]).head(3).groupby(["a", "b"])["dst_port"].apply(list))
    for r in pairs.reset_index().itertuples(index=False):
        u, v = r.a, r.b
        if u == v:
            continue
        flows_n = int(r.flows)
        anom = int(r.anomalous)
        G.add_edge(u, v, kinds=["communication"], flows=flows_n, anomalous_flows=anom,
                   mean_score=float(r.mean_score), max_score=float(r.max_score),
                   ports=[int(p) for p in ports.get((u, v), [])],
                   first_seen=_iso(getattr(r, "first", None)), last_seen=_iso(getattr(r, "last", None)),
                   weight=math.log1p(flows_n) * (1 + anom / flows_n))

    # ---- coordination edges ----------------------------------------------
    anom = flows[flows["is_anomaly"]]
    counts = anom.groupby("src_ip").size().sort_values(ascending=False)
    suspicious = counts[counts >= params["min_anomalous_flows"]].head(params["max_suspicious_sources"])
    for ip in suspicious.index:
        G.nodes[ip]["suspicious"] = True

    clusters = sorted(set(anom["cluster"].tolist()) - {-1})
    cidx = {c: i for i, c in enumerate(clusters)}
    tol = pd.Timedelta(minutes=params["temporal_tolerance_minutes"])
    profiles: dict[str, dict] = {}
    for ip, g in anom[anom["src_ip"].isin(suspicious.index)].groupby("src_ip"):
        cvec = np.zeros(max(len(clusters), 1))
        for c, n in g["cluster"].value_counts().items():
            if c != -1:
                cvec[cidx[c]] = n
        ts = g["timestamp"].dropna()
        profiles[ip] = {
            "dsts": set(g["dst_ip"]),
            "ports": set(int(p) for p in g["dst_port"] if p >= 0),
            "window": (ts.min() - tol, ts.max() + tol) if len(ts) else None,
            "raw_window": (ts.min(), ts.max()) if len(ts) else None,
            "cvec": cvec,
            "profile": Z[g.index.to_numpy()].mean(axis=0),
            "clusters": set(int(c) for c in g["cluster"].unique() if c != -1),
        }

    coord_edges = 0
    pairs_evaluated = 0
    for u, v in combinations(profiles.keys(), 2):
        pu, pv = profiles[u], profiles[v]
        pairs_evaluated += 1
        ev = _coordination_evidence(pu, pv)
        gate = ev["destination_jaccard"] > 0 or (
            ev["port_jaccard"] >= 0.5 and (ev["temporal_overlap"] or 0) >= 0.5)
        if not gate or ev["score"] < params["coordination_threshold"]:
            continue
        coord_edges += 1
        coord_w = COORDINATION_WEIGHT_SCALE * ev["score"]
        if G.has_edge(u, v):
            G[u][v]["kinds"].append("coordination")
            G[u][v]["weight"] += coord_w
            G[u][v]["coordination"] = ev
        else:
            G.add_edge(u, v, kinds=["coordination"], flows=0, anomalous_flows=0, weight=coord_w,
                       coordination=ev)

    info = {
        "nodes": G.number_of_nodes(),
        "edges": G.number_of_edges(),
        "communication_edges": sum(1 for *_, d in G.edges(data=True) if "communication" in d["kinds"]),
        "coordination_edges": coord_edges,
        "suspicious_sources": int(len(suspicious)),
        "coordination_pairs_evaluated": pairs_evaluated,
        "density": float(nx.density(G)) if G.number_of_nodes() > 1 else 0.0,
        "connected_components": nx.number_connected_components(G) if G.number_of_nodes() else 0,
        "evidence_weights": EVIDENCE_WEIGHTS,
        "has_timestamps": bool(has_time),
    }
    degrees = [d for _, d in G.degree()]
    info["mean_degree"] = float(np.mean(degrees)) if degrees else 0.0
    info["max_degree"] = int(max(degrees)) if degrees else 0
    return G, info


def _jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if (a or b) else 0.0


def _cos(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    return float(max(0.0, a @ b / (na * nb))) if na and nb else 0.0


def _coordination_evidence(pu: dict, pv: dict) -> dict:
    dj = _jaccard(pu["dsts"], pv["dsts"])
    pj = _jaccard(pu["ports"], pv["ports"])
    temporal = None
    overlap_window = None
    if pu["window"] and pv["window"]:
        (a1, a2), (b1, b2) = pu["window"], pv["window"]
        start, end = max(a1, b1), min(a2, b2)
        overlap = max(pd.Timedelta(0), end - start)
        shorter = min(a2 - a1, b2 - b1)
        temporal = float(min(1.0, overlap / shorter)) if shorter > pd.Timedelta(0) else 0.0
        if overlap > pd.Timedelta(0):
            overlap_window = [_iso(max(pu["raw_window"][0], pv["raw_window"][0])),
                              _iso(min(pu["raw_window"][1], pv["raw_window"][1]))]
    cluster_cos = _cos(pu["cvec"], pv["cvec"])
    profile_cos = _cos(pu["profile"], pv["profile"])
    behaviour = 0.5 * cluster_cos + 0.5 * profile_cos

    parts = {"destinations": dj, "ports": pj, "behaviour": behaviour}
    if temporal is not None:
        parts["temporal"] = temporal
    total_w = sum(EVIDENCE_WEIGHTS[k] for k in parts)
    score = sum(EVIDENCE_WEIGHTS[k] * v for k, v in parts.items()) / total_w

    return {
        "score": float(score),
        "destination_jaccard": float(dj),
        "shared_destinations": sorted(pu["dsts"] & pv["dsts"])[:10],
        "shared_destination_count": len(pu["dsts"] & pv["dsts"]),
        "port_jaccard": float(pj),
        "shared_ports": sorted(pu["ports"] & pv["ports"])[:15],
        "temporal_overlap": temporal,
        "overlap_window": overlap_window,
        "behaviour_similarity": float(behaviour),
        "cluster_cosine": float(cluster_cos),
        "profile_cosine": float(profile_cos),
        "shared_clusters": sorted(pu["clusters"] & pv["clusters"]),
    }


def layout_subgraph(G: nx.Graph, node_ids: list[str], seed: int = 42) -> dict[str, tuple[float, float]]:
    sub = G.subgraph(node_ids)
    if sub.number_of_nodes() == 0:
        return {}
    k = 1.5 / math.sqrt(max(sub.number_of_nodes(), 1))
    pos = nx.spring_layout(sub, weight="weight", seed=seed, k=k, iterations=60)
    return {n: (float(x) * 900, float(y) * 900) for n, (x, y) in pos.items()}
