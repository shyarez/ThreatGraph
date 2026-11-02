"""Pipeline orchestration: runs every stage, measures time and memory, persists artefacts."""
from __future__ import annotations

import json
import pickle
import threading
import time
import traceback
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd
import psutil

from .. import db
from ..config import DEFAULT_PARAMS, RUNS_DIR
from . import anomaly, clustering, community, graph, ingest, preprocess


class MemorySampler:
    """Samples process RSS in a background thread to record peak memory per stage."""

    def __init__(self, interval: float = 0.05):
        self.proc = psutil.Process()
        self.interval = interval
        self.peak = self.proc.memory_info().rss
        self._stop = threading.Event()
        self._t = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        while not self._stop.is_set():
            self.peak = max(self.peak, self.proc.memory_info().rss)
            self._stop.wait(self.interval)

    def __enter__(self):
        self._t.start()
        return self

    def __exit__(self, *exc):
        self._stop.set()
        self._t.join()
        self.peak = max(self.peak, self.proc.memory_info().rss)


def run_dir(run_id: str) -> Path:
    return RUNS_DIR / run_id


def merge_params(params: dict | None) -> dict:
    merged = dict(DEFAULT_PARAMS)
    for k, v in (params or {}).items():
        if k in merged:
            merged[k] = v
    return merged


STAGES = [
    ("load", "Loading dataset"),
    ("preprocess", "Cleaning & feature extraction"),
    ("anomaly", "Isolation Forest anomaly detection"),
    ("clustering", "DBSCAN behavioural clustering"),
    ("graph", "Graph construction (NetworkX)"),
    ("community", "Louvain community detection"),
    ("finalise", "Saving results"),
]


def execute(run_id: str, dataset_path: str, params: dict,
            progress: Callable[[str, float], None] | None = None) -> dict:
    """Run the full pipeline. Returns the results dict (also written to disk)."""
    progress = progress or (lambda s, p: None)
    timings: list[dict] = []
    out_dir = run_dir(run_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    rs = params["random_state"]
    t_start = time.perf_counter()
    rss_start = psutil.Process().memory_info().rss
    state: dict = {}

    def stage(key: str, fn: Callable[[], None]):
        idx = [s[0] for s in STAGES].index(key)
        progress(key, idx / len(STAGES))
        t0 = time.perf_counter()
        with MemorySampler() as mem:
            fn()
        timings.append({"stage": key, "title": dict(STAGES)[key],
                        "seconds": time.perf_counter() - t0,
                        "peak_rss_mb": mem.peak / 2**20})

    def s_load():
        state["df"] = ingest.read_csv(dataset_path)

    def s_pre():
        prep = preprocess.prepare(state.pop("df"), params["max_rows"], rs)
        state["prep"] = prep

    def s_anom():
        prep = state["prep"]
        score, flag, thr = anomaly.run_isolation_forest(
            prep.X, params["if_n_estimators"], params["if_contamination"], rs)
        prep.flows["score"] = score
        prep.flows["is_anomaly"] = flag
        labels = prep.flows["label"] if prep.flows["label"].notna().any() else None
        state["anomaly_metrics"] = anomaly.evaluate(labels, score, flag) | {"threshold": thr}

    def s_clu():
        prep = state["prep"]
        res = clustering.run_dbscan(prep.X, params["dbscan_eps"], params["dbscan_min_samples"],
                                    params["dbscan_sample_size"], params["pca_components"], rs)
        prep.flows["cluster"] = res["labels"]
        labels = prep.flows["label"] if prep.flows["label"].notna().any() else None
        metrics = clustering.evaluate(res, labels, rs)
        metrics |= {k: res[k] for k in ("eps", "eps_estimated", "min_samples", "pca_components",
                                        "pca_explained_variance", "unique_sample_points", "kdist_curve")}
        state["cluster_metrics"] = metrics
        state["cluster_profiles"] = clustering.cluster_profiles(
            res["labels"], prep.X, prep.feature_names, prep.flows,
            prep.flows["score"].to_numpy(), prep.flows["is_anomaly"].to_numpy())
        state["projection"] = clustering.projection(res, prep.flows["is_anomaly"].to_numpy(), prep.flows)
        state["Z"] = res["Z"]

    def s_graph():
        flows = state["prep"].flows
        if flows["src_ip"].isna().all() or flows["dst_ip"].isna().all():
            state["graph_info"] = {"available": False,
                                   "reason": "Dataset has no source/destination IP columns."}
            return
        G, info = graph.build_graph(flows, state["Z"], params)
        state["G"] = G
        state["graph_info"] = info | {"available": True}

    def s_comm():
        if "G" not in state:
            state["community_stats"] = None
            state["communities"] = []
            return
        G = state["G"]
        partition, stats = community.detect_communities(G, params["louvain_resolution"], rs)
        for n, c in partition.items():
            G.nodes[n]["community"] = c
        comms = community.analyse_communities(G, partition, state["prep"].flows, params)
        tier_of = {c["id"]: c["tier"] for c in comms}
        for n in G.nodes:
            G.nodes[n]["tier"] = tier_of.get(G.nodes[n]["community"], community.TIER_LOW)
        stats["tiers"] = {t: sum(1 for c in comms if c["tier"] == t)
                          for t in (community.TIER_INVESTIGATE, community.TIER_MONITOR, community.TIER_LOW)}
        state["community_stats"] = stats
        state["communities"] = comms
        state["graph_eval"] = community.evaluate_against_labels(G, comms, state["prep"].flows)

    def s_final():
        prep = state["prep"]
        flows = prep.flows
        flows.to_pickle(out_dir / "flows.pkl")
        if "G" in state:
            with open(out_dir / "graph.pkl", "wb") as fh:
                pickle.dump(state["G"], fh, protocol=pickle.HIGHEST_PROTOCOL)

    stage("load", s_load)
    stage("preprocess", s_pre)
    stage("anomaly", s_anom)
    stage("clustering", s_clu)
    stage("graph", s_graph)
    stage("community", s_comm)
    stage("finalise", s_final)

    flows = state["prep"].flows
    total = time.perf_counter() - t_start
    results = {
        "run_id": run_id,
        "params": params,
        "preprocessing": state["prep"].report | {"feature_names": state["prep"].feature_names},
        "anomaly": state["anomaly_metrics"],
        "clustering": state["cluster_metrics"],
        "clusters": state["cluster_profiles"],
        "projection": state["projection"],
        "graph": state["graph_info"],
        "community_stats": state.get("community_stats"),
        "communities": state.get("communities", []),
        "graph_evaluation": state.get("graph_eval"),
        "timeline": _timeline(flows),
        "top_anomalous_ips": _top_ips(flows),
        "performance": {
            "total_seconds": total,
            "rows_per_second": len(flows) / total if total else None,
            "stages": timings,
            "peak_rss_mb": max(t["peak_rss_mb"] for t in timings),
            "baseline_rss_mb": rss_start / 2**20,
        },
    }
    with open(out_dir / "results.json", "w", encoding="utf-8") as fh:
        json.dump(results, fh, default=_json_default)
    progress("done", 1.0)
    return results


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if np.isnan(o) else float(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (pd.Timestamp,)):
        return o.isoformat()
    if isinstance(o, set):
        return sorted(o)
    raise TypeError(f"Not serialisable: {type(o)}")


def _timeline(flows: pd.DataFrame, buckets: int = 60) -> list[dict]:
    ts = flows["timestamp"]
    if ts.isna().all():
        return []
    valid = flows[ts.notna()]
    lo, hi = valid["timestamp"].min(), valid["timestamp"].max()
    if lo == hi:
        return [{"time": lo.isoformat(), "flows": int(len(valid)),
                 "anomalous": int(valid["is_anomaly"].sum())}]
    edges = pd.date_range(lo, hi, periods=buckets + 1)
    b = pd.cut(valid["timestamp"], edges, include_lowest=True, labels=False)
    g = valid.groupby(b).agg(flows=("row", "size"), anomalous=("is_anomaly", "sum"))
    if valid["label"].notna().any():
        g["attacks"] = (valid["label"] != "BENIGN").groupby(b).sum()
    out = []
    for i in range(buckets):
        r = g.loc[i] if i in g.index else None
        row = {"time": edges[i].isoformat(),
               "flows": int(r["flows"]) if r is not None else 0,
               "anomalous": int(r["anomalous"]) if r is not None else 0}
        if "attacks" in g.columns:
            row["attacks"] = int(r["attacks"]) if r is not None else 0
        out.append(row)
    return out


def _top_ips(flows: pd.DataFrame, n: int = 15) -> list[dict]:
    if flows["src_ip"].isna().all():
        return []
    g = flows.groupby("src_ip").agg(flows=("row", "size"), anomalous=("is_anomaly", "sum"),
                                    max_score=("score", "max"), targets=("dst_ip", "nunique"))
    g = g[g["anomalous"] > 0].sort_values(["anomalous", "max_score"], ascending=False).head(n)
    return [{"ip": ip, "flows": int(r.flows), "anomalous": int(r.anomalous),
             "anomaly_rate": float(r.anomalous / r.flows), "max_score": float(r.max_score),
             "targets": int(r.targets)} for ip, r in g.iterrows()]


# ---- background execution -------------------------------------------------

def start_run_thread(run_id: str, dataset_path: str, params: dict) -> threading.Thread:
    def progress(stage: str, frac: float):
        db.update_run(run_id, stage=stage, progress=frac, status="running")

    def target():
        try:
            db.update_run(run_id, status="running", stage="load", progress=0.0)
            res = execute(run_id, dataset_path, params, progress)
            db.update_run(run_id, status="completed", stage="done", progress=1.0,
                          finished_at=db.now_iso(), summary=summarise(res))
        except Exception as exc:  # surface failures to the UI
            traceback.print_exc()
            db.update_run(run_id, status="failed", error=f"{type(exc).__name__}: {exc}",
                          finished_at=db.now_iso())

    t = threading.Thread(target=target, daemon=True, name=f"run-{run_id}")
    t.start()
    return t


def summarise(res: dict) -> dict:
    a, c, g, cs = res["anomaly"], res["clustering"], res["graph"], res["community_stats"] or {}
    return {
        "rows": res["preprocessing"]["rows_analysed"],
        "features": res["preprocessing"]["features_used"],
        "flagged": a["flagged"],
        "precision": a.get("precision"), "recall": a.get("recall"), "f1": a.get("f1"),
        "false_positive_rate": a.get("false_positive_rate"),
        "n_clusters": c["n_clusters"], "noise_percentage": c["noise_percentage"],
        "silhouette": c["silhouette"],
        "graph_available": g.get("available", False),
        "nodes": g.get("nodes"), "edges": g.get("edges"),
        "coordination_edges": g.get("coordination_edges"),
        "modularity": cs.get("modularity"), "n_communities": cs.get("n_communities"),
        "investigate": (cs.get("tiers") or {}).get("investigate"),
        "monitor": (cs.get("tiers") or {}).get("monitor"),
        "total_seconds": res["performance"]["total_seconds"],
        "peak_rss_mb": res["performance"]["peak_rss_mb"],
    }
