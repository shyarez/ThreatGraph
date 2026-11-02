"""Module 5: investigation report generation (JSON, Markdown, HTML)."""
from __future__ import annotations

import html
from datetime import datetime, timezone

DISCLAIMER = (
    "ThreatGraph surfaces statistically unusual traffic and correlations between network entities. "
    "Anomaly scores are Isolation Forest isolation scores and priority scores are heuristic rankings; "
    "neither is a calibrated probability of attack. A community flagged for investigation shows "
    "correlated suspicious behaviour, not confirmed malicious coordination. Ground-truth labels, when "
    "present, are used only to compute evaluation metrics."
)


def build_report(run: dict, dataset: dict | None, results: dict, notes: list[dict],
                 max_communities: int = 10) -> dict:
    comms = [c for c in results.get("communities", []) if c["tier"] != "low"][:max_communities]
    return {
        "title": "ThreatGraph Investigation Report",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "run": {"id": run["id"], "created_at": run["created_at"], "finished_at": run.get("finished_at"),
                "params": results["params"]},
        "dataset": {"name": dataset["name"] if dataset else run.get("dataset_name"),
                    "rows": (dataset or {}).get("profile", {}).get("rows")},
        "preprocessing": {k: results["preprocessing"].get(k) for k in
                          ("input_rows", "rows_analysed", "sampling", "features_used",
                           "infinite_values_replaced", "missing_values_imputed", "transform")},
        "anomaly_detection": {k: v for k, v in results["anomaly"].items() if k != "score_hist"},
        "clustering": {k: v for k, v in results["clustering"].items() if k != "kdist_curve"},
        "graph": results["graph"],
        "communities_summary": results.get("community_stats"),
        "graph_evaluation": results.get("graph_evaluation"),
        "priority_communities": comms,
        "top_anomalous_ips": results.get("top_anomalous_ips", []),
        "performance": results["performance"],
        "analyst_notes": notes,
        "disclaimer": DISCLAIMER,
    }


def _fmt(v, pct=False, digits=3):
    if v is None:
        return "n/a"
    if isinstance(v, float):
        return f"{v:.1%}" if pct else f"{v:.{digits}f}"
    if isinstance(v, int):
        return f"{v:,}"
    return str(v)


def to_markdown(r: dict) -> str:
    a, c, g = r["anomaly_detection"], r["clustering"], r["graph"]
    cs = r["communities_summary"] or {}
    L = [f"# {r['title']}", "",
         f"- **Dataset:** {r['dataset']['name']}",
         f"- **Run:** `{r['run']['id']}` (finished {r['run']['finished_at']})",
         f"- **Generated:** {r['generated_at']}", "",
         f"> {r['disclaimer']}", "",
         "## 1. Data preparation", "",
         f"- Rows in file: {_fmt(r['preprocessing']['input_rows'])}; rows analysed: "
         f"{_fmt(r['preprocessing']['rows_analysed'])}",
         f"- Features used: {_fmt(r['preprocessing']['features_used'])} ({r['preprocessing']['transform']})",
         f"- Infinite values replaced: {_fmt(r['preprocessing']['infinite_values_replaced'])}; "
         f"missing values imputed: {_fmt(r['preprocessing']['missing_values_imputed'])}"]
    if r["preprocessing"].get("sampling"):
        L.append(f"- Sampling: {r['preprocessing']['sampling']}")
    L += ["", "## 2. Isolation Forest anomaly detection", "",
          f"- Flows flagged: {_fmt(a['flagged'])} ({_fmt(a['flagged_fraction'], pct=True)})",
          f"- Score threshold: {_fmt(a.get('threshold'))}"]
    if a.get("has_labels"):
        L += ["", "| Metric | Value |", "|---|---|",
              f"| Precision | {_fmt(a['precision'])} |", f"| Recall | {_fmt(a['recall'])} |",
              f"| F1-score | {_fmt(a['f1'])} |", f"| False positive rate | {_fmt(a['false_positive_rate'])} |",
              f"| ROC-AUC | {_fmt(a.get('roc_auc'))} |", f"| Average precision | {_fmt(a.get('average_precision'))} |"]
    L += ["", "## 3. DBSCAN behavioural clustering", "",
          f"- eps = {_fmt(c['eps'])} ({'estimated from k-distance knee' if c['eps_estimated'] else 'user-set'}), "
          f"min_samples = {c['min_samples']}",
          f"- Clusters: {c['n_clusters']}; noise: {_fmt(c['noise_percentage'], digits=2)}%",
          f"- Silhouette: {_fmt(c['silhouette'])}; Davies-Bouldin: {_fmt(c['davies_bouldin'])}; "
          f"purity: {_fmt(c['purity'])}"]
    L += ["", "## 4. Relationship graph & Louvain communities", ""]
    if g.get("available"):
        L += [f"- Nodes: {_fmt(g['nodes'])}; edges: {_fmt(g['edges'])} "
              f"({_fmt(g['communication_edges'])} communication, {_fmt(g['coordination_edges'])} coordination)",
              f"- Suspicious sources: {_fmt(g['suspicious_sources'])}",
              f"- Modularity: {_fmt(cs.get('modularity'))}; communities: {_fmt(cs.get('n_communities'))}; "
              f"tiers: {cs.get('tiers')}"]
        ge = r.get("graph_evaluation")
        if ge:
            inv = ge["investigate"]
            L.append(f"- IP-level check (investigate tier): precision {_fmt(inv['precision'])}, "
                     f"recall {_fmt(inv['recall'])} over {ge['attack_source_ips']} attack-source IPs")
    else:
        L.append(f"- Graph unavailable: {g.get('reason')}")
    L += ["", "## 5. Priority communities", ""]
    if not r["priority_communities"]:
        L.append("No communities reached the monitor or investigate tier.")
    for comm in r["priority_communities"]:
        L += [f"### Community {comm['id']} — {comm['tier'].upper()} (priority {comm['priority_score']:.2f})", "",
              f"- Members: {comm['size']} — {', '.join(comm['members'][:12])}{' …' if comm['size'] > 12 else ''}",
              "- Evidence:"]
        L += [f"  - {e}" for e in comm["evidence"]]
        if comm.get("ground_truth_labels"):
            L.append("- Ground-truth labels (evaluation only): " +
                     ", ".join(f"{x['label']} ({x['count']:,})" for x in comm["ground_truth_labels"]))
        L.append("")
    if r["top_anomalous_ips"]:
        L += ["## 6. Most anomalous source IPs", "", "| IP | Flows | Flagged | Rate | Max score | Targets |",
              "|---|---|---|---|---|---|"]
        L += [f"| {x['ip']} | {x['flows']:,} | {x['anomalous']:,} | {x['anomaly_rate']:.0%} | "
              f"{x['max_score']:.3f} | {x['targets']} |" for x in r["top_anomalous_ips"]]
    p = r["performance"]
    L += ["", "## 7. Performance", "", f"- Total processing time: {p['total_seconds']:.2f} s; "
          f"peak memory (RSS): {p['peak_rss_mb']:.0f} MB", "", "| Stage | Seconds | Peak RSS (MB) |",
          "|---|---|---|"]
    L += [f"| {s['title']} | {s['seconds']:.2f} | {s['peak_rss_mb']:.0f} |" for s in p["stages"]]
    if r["analyst_notes"]:
        L += ["", "## 8. Analyst notes", ""]
        L += [f"- [{n['created_at']}] ({n['target_type']}{' ' + n['target_id'] if n['target_id'] else ''}) "
              f"{n['text']}" for n in r["analyst_notes"]]
    return "\n".join(L) + "\n"


def to_html(r: dict) -> str:
    """Self-contained printable HTML (print to PDF from the browser)."""
    md = to_markdown(r)
    body = []
    in_table = False
    in_list = False
    for line in md.splitlines():
        esc = html.escape(line)
        if line.startswith("|"):
            cells = [x.strip() for x in line.strip("|").split("|")]
            if set(line.replace("|", "").strip()) <= {"-"}:
                continue
            if not in_table:
                body.append("<table>")
                in_table = True
                body.append("<tr>" + "".join(f"<th>{html.escape(x)}</th>" for x in cells) + "</tr>")
            else:
                body.append("<tr>" + "".join(f"<td>{html.escape(x)}</td>" for x in cells) + "</tr>")
            continue
        if in_table:
            body.append("</table>")
            in_table = False
        if line.lstrip().startswith("- "):
            if not in_list:
                body.append("<ul>")
                in_list = True
            depth = "sub" if line.startswith("  ") else ""
            body.append(f"<li class='{depth}'>{_inline(esc.lstrip()[2:])}</li>")
            continue
        if in_list:
            body.append("</ul>")
            in_list = False
        if line.startswith("### "):
            body.append(f"<h3>{_inline(esc[4:])}</h3>")
        elif line.startswith("## "):
            body.append(f"<h2>{_inline(esc[3:])}</h2>")
        elif line.startswith("# "):
            body.append(f"<h1>{_inline(esc[2:])}</h1>")
        elif line.startswith("&gt; "):
            body.append(f"<blockquote>{esc[5:]}</blockquote>")
        elif line.strip():
            body.append(f"<p>{_inline(esc)}</p>")
    if in_table:
        body.append("</table>")
    if in_list:
        body.append("</ul>")
    css = """body{font-family:system-ui,Segoe UI,sans-serif;max-width:960px;margin:32px auto;padding:0 16px;
color:#0f172a;line-height:1.5}h1{border-bottom:3px solid #0f172a;padding-bottom:6px}h2{margin-top:28px;
border-bottom:1px solid #cbd5e1}table{border-collapse:collapse;margin:8px 0;font-size:14px}td,th{border:1px solid
#cbd5e1;padding:4px 10px;text-align:left}th{background:#f1f5f9}blockquote{background:#fef9c3;border-left:4px solid
#ca8a04;margin:12px 0;padding:8px 12px;font-size:14px}code{background:#f1f5f9;padding:1px 4px}li.sub{margin-left:20px;
list-style:circle}@media print{body{margin:0}}"""
    return (f"<!doctype html><html><head><meta charset='utf-8'><title>{html.escape(r['title'])}</title>"
            f"<style>{css}</style></head><body>{''.join(body)}</body></html>")


def _inline(s: str) -> str:
    import re
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    return s
