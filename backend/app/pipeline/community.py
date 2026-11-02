"""Module 3b: Louvain community detection and suspicious-group analysis.

Each community gets a *priority score* in [0, 1] that ranks it for investigation:

    0.35 * anomalous share of flows originated by members
  + 0.35 * min(1, coordinated sources / 3)
  + 0.15 * temporal concentration (1 - anomalous window / dataset time span)
  + 0.15 * behavioural homogeneity (share of flagged flows in the dominant DBSCAN cluster)

It is a heuristic ranking, not a calibrated probability that an attack occurred.
"""
from __future__ import annotations

import networkx as nx
import numpy as np
import pandas as pd

TIER_INVESTIGATE = "investigate"
TIER_MONITOR = "monitor"
TIER_LOW = "low"


def detect_communities(G: nx.Graph, resolution: float = 1.0, seed: int = 42) -> tuple[dict[str, int], dict]:
    if G.number_of_edges() == 0:
        partition = {n: i for i, n in enumerate(G.nodes)}
        return partition, {"modularity": None, "n_communities": len(partition)}
    comms = nx.community.louvain_communities(G, weight="weight", resolution=resolution, seed=seed)
    comms = sorted(comms, key=len, reverse=True)
    partition = {n: cid for cid, members in enumerate(comms) for n in members}
    sizes = [len(c) for c in comms]
    stats = {
        "modularity": float(nx.community.modularity(G, comms, weight="weight", resolution=resolution)),
        "n_communities": len(comms),
        "non_singleton_communities": sum(1 for s in sizes if s > 1),
        "largest_community": max(sizes),
        "mean_community_size": float(np.mean(sizes)),
        "median_community_size": float(np.median(sizes)),
        "size_distribution": _size_buckets(sizes),
        "resolution": resolution,
    }
    if G.number_of_nodes() <= 20_000:
        coverage, performance = nx.community.partition_quality(G, comms)
        stats["coverage"] = float(coverage)
        stats["performance"] = float(performance)
    return partition, stats


def _size_buckets(sizes: list[int]) -> list[dict]:
    buckets = [(1, 1), (2, 2), (3, 5), (6, 10), (11, 25), (26, 50), (51, 100), (101, 10**9)]
    out = []
    for lo, hi in buckets:
        n = sum(1 for s in sizes if lo <= s <= hi)
        label = str(lo) if lo == hi else (f"{lo}+" if hi >= 10**9 else f"{lo}-{hi}")
        out.append({"size": label, "communities": n})
    return out


def analyse_communities(G: nx.Graph, partition: dict[str, int], flows: pd.DataFrame,
                        params: dict) -> list[dict]:
    flows = flows.assign(src_comm=flows["src_ip"].map(partition), dst_comm=flows["dst_ip"].map(partition))
    has_time = flows["timestamp"].notna().any()
    has_labels = flows["label"].notna().any()
    span = (flows["timestamp"].max() - flows["timestamp"].min()) if has_time else None

    members_by_comm: dict[int, list[str]] = {}
    for n, c in partition.items():
        members_by_comm.setdefault(c, []).append(n)

    by_src = dict(tuple(flows.groupby("src_comm")))
    results = []
    for cid, members in members_by_comm.items():
        if len(members) < 2:
            continue
        sub = G.subgraph(members)
        coord = [(u, v, d["coordination"]) for u, v, d in sub.edges(data=True) if "coordination" in d]
        coordinated_sources = sorted({x for u, v, _ in coord for x in (u, v)})
        out_flows = by_src.get(cid, flows.iloc[0:0])
        anom = out_flows[out_flows["is_anomaly"]]
        n_out = len(out_flows)
        anomaly_rate = float(len(anom) / n_out) if n_out else 0.0

        # Destinations hit by flagged flows from more than one member.
        targets = []
        if len(anom):
            tg = anom.groupby("dst_ip").agg(flows=("row", "size"), sources=("src_ip", "nunique"),
                                            ports=("dst_port", lambda s: sorted(set(int(p) for p in s if p >= 0))[:8]))
            tg = tg.sort_values(["sources", "flows"], ascending=False).head(8)
            targets = [{"ip": ip, "anomalous_flows": int(r.flows), "member_sources": int(r.sources),
                        "ports": r.ports} for ip, r in tg.iterrows()]
        top_ports = [{"port": int(p), "flows": int(n)}
                     for p, n in anom["dst_port"].value_counts().head(8).items() if p >= 0]

        window = None
        temporal_conc = 0.0
        if has_time and len(anom):
            ts = anom["timestamp"].dropna()
            if len(ts):
                start, end = ts.min(), ts.max()
                window = {"start": start.isoformat(), "end": end.isoformat(),
                          "minutes": float((end - start).total_seconds() / 60)}
                if span and span.total_seconds() > 0 and len(ts) >= 2:
                    temporal_conc = float(max(0.0, 1 - (end - start) / span))

        dominant_cluster = None
        homogeneity = 0.0
        if len(anom):
            vc = anom["cluster"].value_counts()
            vc_nn = vc.drop(index=-1, errors="ignore")
            if len(vc_nn):
                dominant_cluster = int(vc_nn.index[0])
                homogeneity = float(vc_nn.iloc[0] / len(anom))
            noise_share = float(vc.get(-1, 0) / len(anom))
        else:
            noise_share = 0.0

        c_term = min(1.0, len(coordinated_sources) / 3)
        score = 0.35 * anomaly_rate + 0.35 * c_term + 0.15 * temporal_conc + 0.15 * homogeneity
        if len(coordinated_sources) >= 2 and score >= 0.5:
            tier = TIER_INVESTIGATE
        elif len(anom) >= params["min_anomalous_flows"] and score >= 0.3:
            tier = TIER_MONITOR
        else:
            tier = TIER_LOW

        internal_flows = int(sum(d.get("flows", 0) for *_, d in sub.edges(data=True)))
        ranked_members = sorted(members, key=lambda n: (-G.nodes[n]["anomalous_flows"], -G.degree(n)))
        comm = {
            "id": int(cid),
            "size": len(members),
            "members": ranked_members[:50],
            "internal_edges": sub.number_of_edges(),
            "density": float(nx.density(sub)),
            "internal_flows": internal_flows,
            "flows_from_members": int(n_out),
            "anomalous_flows": int(len(anom)),
            "anomaly_rate": anomaly_rate,
            "mean_anomaly_score": float(anom["score"].mean()) if len(anom) else None,
            "suspicious_sources": [n for n in ranked_members if G.nodes[n]["suspicious"]][:50],
            "coordinated_sources": coordinated_sources[:50],
            "coordination_edges": len(coord),
            "mean_coordination_score": float(np.mean([e["score"] for *_, e in coord])) if coord else None,
            "shared_targets": targets,
            "top_ports": top_ports,
            "anomalous_window": window,
            "temporal_concentration": temporal_conc,
            "dominant_cluster": dominant_cluster,
            "behavioural_homogeneity": homogeneity,
            "noise_share": noise_share,
            "priority_score": float(score),
            "score_components": {"anomaly_rate": anomaly_rate, "coordination": c_term,
                                 "temporal_concentration": temporal_conc, "behavioural_homogeneity": homogeneity},
            "tier": tier,
        }
        if has_labels:
            lab = out_flows["label"].value_counts()
            comm["ground_truth_labels"] = [{"label": str(k), "count": int(v)} for k, v in lab.head(6).items()]
        comm["evidence"] = _evidence(comm, coord)
        results.append(comm)

    results.sort(key=lambda c: (-c["priority_score"], -c["anomalous_flows"]))
    return results


def _evidence(c: dict, coord: list) -> list[str]:
    ev: list[str] = []
    if c["anomalous_flows"]:
        ev.append(f"{c['anomalous_flows']:,} of {c['flows_from_members']:,} flows originated by members "
                  f"({c['anomaly_rate']:.0%}) were flagged by Isolation Forest.")
    else:
        ev.append("No flows originated by members were flagged by Isolation Forest.")
    if c["coordination_edges"]:
        ev.append(f"{len(c['coordinated_sources'])} source IPs are linked by {c['coordination_edges']} "
                  f"inferred coordination edges (mean evidence score {c['mean_coordination_score']:.2f}).")
    shared = [t for t in c["shared_targets"] if t["member_sources"] >= 2]
    if shared:
        t = shared[0]
        ports = ", ".join(map(str, t["ports"][:5])) or "n/a"
        ev.append(f"{t['member_sources']} member sources sent flagged traffic to {t['ip']} "
                  f"({t['anomalous_flows']:,} flows; ports {ports}).")
        if len(shared) > 1:
            ev.append(f"{len(shared)} destinations in total were targeted by multiple member sources.")
    if coord:
        best = max(coord, key=lambda e: e[2]["score"])
        u, v, e = best
        parts = [f"destination Jaccard {e['destination_jaccard']:.2f}", f"port Jaccard {e['port_jaccard']:.2f}"]
        if e["temporal_overlap"] is not None:
            parts.append(f"temporal overlap {e['temporal_overlap']:.2f}")
        parts.append(f"behavioural similarity {e['behaviour_similarity']:.2f}")
        ev.append(f"Strongest pair {u} ↔ {v}: " + ", ".join(parts) + ".")
    if c["anomalous_window"] and c["anomalous_flows"] >= 2:
        w = c["anomalous_window"]
        ev.append(f"Flagged activity spans {w['minutes']:.1f} minutes ({w['start']} → {w['end']}); "
                  f"temporal concentration {c['temporal_concentration']:.2f}.")
    if c["dominant_cluster"] is not None and c["behavioural_homogeneity"] >= 0.3:
        ev.append(f"{c['behavioural_homogeneity']:.0%} of flagged flows fall in DBSCAN cluster "
                  f"{c['dominant_cluster']} (similar flow behaviour).")
    if c["top_ports"]:
        ev.append("Most targeted ports in flagged flows: " +
                  ", ".join(f"{p['port']} ({p['flows']:,})" for p in c["top_ports"][:4]) + ".")
    return ev


def evaluate_against_labels(G: nx.Graph, communities: list[dict], flows: pd.DataFrame) -> dict | None:
    """IP-level check of flagged communities against ground truth (evaluation only)."""
    if not flows["label"].notna().any():
        return None
    attack_src = set(flows.loc[flows["label"] != "BENIGN", "src_ip"])
    sources = set(flows["src_ip"])
    out: dict = {"attack_source_ips": len(attack_src), "source_ips": len(sources)}
    for name, tiers in (("investigate", {TIER_INVESTIGATE}), ("investigate_or_monitor", {TIER_INVESTIGATE, TIER_MONITOR})):
        flagged = set()
        for c in communities:
            if c["tier"] in tiers:
                flagged |= {n for n in _all_members(G, c) if n in sources}
        tp = len(flagged & attack_src)
        out[name] = {
            "flagged_source_ips": len(flagged),
            "precision": tp / len(flagged) if flagged else None,
            "recall": tp / len(attack_src) if attack_src else None,
        }
    out["note"] = ("A source IP counts as an attack source if it originated at least one flow with a "
                   "non-BENIGN ground-truth label. Labels are used only for this evaluation.")
    return out


def _all_members(G: nx.Graph, c: dict) -> set[str]:
    return {n for n, d in G.nodes(data=True) if d.get("community") == c["id"]}
