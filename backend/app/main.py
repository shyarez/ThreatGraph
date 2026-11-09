"""ThreatGraph REST API."""
from __future__ import annotations

import math
from contextlib import asynccontextmanager
import shutil
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

from . import db, store
from .config import DEFAULT_PARAMS, MAX_UPLOAD_BYTES, UPLOAD_DIR
from .pipeline import ingest, report, runner
from .pipeline.graph import layout_subgraph
from .sample_data import generate_sample

@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="ThreatGraph API", version="1.0.0", lifespan=lifespan,
              description="Graph-based detection of coordinated network intrusions.")
app.add_middleware(
    CORSMiddleware,
    # Any local port, so the UI still works if Next.js falls back from 3000 to 3001.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)


def clean(o: Any) -> Any:
    """Make values JSON-safe (NaN/inf -> None, numpy -> python)."""
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, set)):
        return [clean(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        f = float(o)
        return None if math.isnan(f) or math.isinf(f) else f
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, pd.Timestamp):
        return None if pd.isna(o) else o.isoformat()
    return o


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/params/defaults")
def default_params():
    return DEFAULT_PARAMS


# ---- datasets -------------------------------------------------------------

def _register_file(path: Path, name: str, filename: str) -> dict:
    try:
        df = ingest.read_csv(path)
    except Exception as exc:
        path.unlink(missing_ok=True)
        kind = "Parquet" if ingest.is_parquet(path) else "CSV"
        raise HTTPException(400, f"Could not parse {kind}: {exc}")
    profile = clean(ingest.profile_dataset(df))
    if not profile["valid"]:
        path.unlink(missing_ok=True)
        raise HTTPException(422, {"message": "Dataset failed validation", "errors": profile["errors"],
                                  "warnings": profile["warnings"]})
    return db.insert_dataset(name, filename, str(path), path.stat().st_size, profile)


async def _save_uploads(uploads: list[UploadFile]) -> list[Path]:
    """Stream uploads to disk, enforcing MAX_UPLOAD_BYTES across all files combined."""
    saved: list[Path] = []
    total = 0
    try:
        for up in uploads:
            dest = UPLOAD_DIR / f"{db.new_id()}_{Path(up.filename).name}"
            saved.append(dest)
            with open(dest, "wb") as fh:
                while chunk := await up.read(1 << 20):
                    total += len(chunk)
                    if total > MAX_UPLOAD_BYTES:
                        raise HTTPException(
                            413, f"Upload exceeds the {MAX_UPLOAD_BYTES // 2**20} MB limit "
                                 "(all files combined).")
                    fh.write(chunk)
    except BaseException:
        for p in saved:
            p.unlink(missing_ok=True)
        raise
    return saved


@app.post("/api/datasets")
async def upload_dataset(
    file: UploadFile | None = File(None),
    files: list[UploadFile] | None = File(None),
    name: str | None = Form(None),
):
    """Upload one file (`file`) or several (`files`). Several files are merged into one dataset."""
    uploads = [u for u in ([file] if file else []) + (files or []) if u is not None]
    if not uploads:
        raise HTTPException(400, "No file uploaded.")
    for up in uploads:
        if not up.filename or not up.filename.lower().endswith(ingest.SUPPORTED_EXTENSIONS):
            raise HTTPException(400, f"'{up.filename}' is not a .csv or .parquet file.")
    filenames = [up.filename for up in uploads]
    if len(set(filenames)) != len(filenames):
        raise HTTPException(400, "The same file was selected more than once.")

    paths = await _save_uploads(uploads)
    if len(paths) == 1:
        return _register_file(paths[0], name or Path(filenames[0]).stem, filenames[0])

    try:
        frames = []
        for p, fn in zip(paths, filenames):
            try:
                frames.append(ingest.read_csv(p))
            except Exception as exc:
                kind = "Parquet" if ingest.is_parquet(p) else "CSV"
                raise HTTPException(400, f"Could not parse {kind} '{fn}': {exc}")
        try:
            df = ingest.merge_frames(frames, filenames)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        del frames
        dest = ingest.write_merged(df, UPLOAD_DIR / f"{db.new_id()}_merged_{len(paths)}_files")
        del df
    finally:
        for p in paths:
            p.unlink(missing_ok=True)

    default_name = f"{Path(filenames[0]).stem} + {len(filenames) - 1} more"
    ds = _register_file(dest, name or default_name, ", ".join(filenames))
    return ds


class SampleRequest(BaseModel):
    n_benign: int = Field(12_000, ge=1000, le=500_000)
    seed: int = 7


@app.post("/api/datasets/sample")
def create_sample(req: SampleRequest):
    dest = UPLOAD_DIR / f"{db.new_id()}_synthetic_cicids_style.csv"
    generate_sample(dest, n_benign=req.n_benign, seed=req.seed)
    return _register_file(dest, "Synthetic CIC-IDS2017-style demo", dest.name)


@app.get("/api/datasets")
def list_datasets():
    return db.list_datasets()


@app.get("/api/datasets/{ds_id}")
def get_dataset(ds_id: str):
    ds = db.get_dataset(ds_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return ds


@app.get("/api/datasets/{ds_id}/preview")
def preview_dataset(ds_id: str, rows: int = Query(15, le=100)):
    ds = get_dataset(ds_id)
    df = ingest.read_csv(ds["path"], nrows=rows)
    return {"columns": list(df.columns), "rows": clean(df.astype(object).where(df.notna(), None).values.tolist())}


@app.delete("/api/datasets/{ds_id}")
def delete_dataset(ds_id: str):
    ds = get_dataset(ds_id)
    for r in db.list_runs(ds_id):
        _delete_run_files(r["id"])
    Path(ds["path"]).unlink(missing_ok=True)
    db.delete_dataset(ds_id)
    return {"deleted": ds_id}


# ---- runs -----------------------------------------------------------------

class RunRequest(BaseModel):
    dataset_id: str
    params: dict[str, Any] = Field(default_factory=dict)


def _validate_params(p: dict) -> dict:
    p = runner.merge_params(p)
    c = p["if_contamination"]
    if c != "auto":
        try:
            c = float(c)
        except (TypeError, ValueError):
            raise HTTPException(422, "if_contamination must be 'auto' or a number in (0, 0.5]")
        if not 0 < c <= 0.5:
            raise HTTPException(422, "if_contamination must be in (0, 0.5]")
        p["if_contamination"] = c
    if p["dbscan_eps"] in ("", None):
        p["dbscan_eps"] = None
    elif float(p["dbscan_eps"]) <= 0:
        raise HTTPException(422, "dbscan_eps must be positive")
    else:
        p["dbscan_eps"] = float(p["dbscan_eps"])
    if p["max_rows"] in ("", None, 0):
        p["max_rows"] = None
    ints = ("if_n_estimators", "dbscan_min_samples", "dbscan_sample_size", "pca_components",
            "min_anomalous_flows", "max_suspicious_sources", "random_state")
    for k in ints:
        p[k] = int(p[k])
        if p[k] < (0 if k == "random_state" else 1):
            raise HTTPException(422, f"{k} must be positive")
    if p["max_rows"] is not None:
        p["max_rows"] = int(p["max_rows"])
    for k in ("coordination_threshold", "temporal_tolerance_minutes", "louvain_resolution"):
        p[k] = float(p[k])
    return p


@app.post("/api/runs")
def create_run(req: RunRequest):
    ds = get_dataset(req.dataset_id)
    params = _validate_params(req.params)
    run = db.insert_run(ds["id"], params)
    runner.start_run_thread(run["id"], ds["path"], params)
    return run


@app.get("/api/runs")
def list_runs(dataset_id: str | None = None):
    return db.list_runs(dataset_id)


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    run["stages"] = [{"key": k, "title": t} for k, t in runner.STAGES]
    return run


def _delete_run_files(run_id: str):
    store.evict(run_id)
    shutil.rmtree(runner.run_dir(run_id), ignore_errors=True)


@app.delete("/api/runs/{run_id}")
def delete_run(run_id: str):
    get_run(run_id)
    _delete_run_files(run_id)
    db.delete_run(run_id)
    return {"deleted": run_id}


def _artifacts(run_id: str) -> store.RunArtifacts:
    run = get_run(run_id)
    if run["status"] != "completed":
        raise HTTPException(409, f"Run is {run['status']}")
    try:
        return store.load(run_id)
    except FileNotFoundError:
        raise HTTPException(410, "Run artefacts are missing on disk")


@app.get("/api/runs/{run_id}/results")
def get_results(run_id: str):
    return JSONResponse(clean(_artifacts(run_id).results))


@app.get("/api/runs/{run_id}/flows")
def get_flows(run_id: str, page: int = 1, page_size: int = Query(50, le=500),
              only_anomalous: bool = True, cluster: int | None = None, ip: str | None = None,
              label: str | None = None, sort: str = "score", desc: bool = True):
    f = _artifacts(run_id).flows
    m = pd.Series(True, index=f.index)
    if only_anomalous:
        m &= f["is_anomaly"]
    if cluster is not None:
        m &= f["cluster"] == cluster
    if ip:
        m &= (f["src_ip"] == ip) | (f["dst_ip"] == ip)
    if label:
        m &= f["label"] == label
    sel = f[m]
    if sort in sel.columns:
        sel = sel.sort_values(sort, ascending=not desc, kind="stable")
    total = len(sel)
    chunk = sel.iloc[(page - 1) * page_size: page * page_size]
    rows = []
    for r in chunk.itertuples(index=False):
        rows.append({"row": int(r.row), "src_ip": r.src_ip, "dst_ip": r.dst_ip,
                     "src_port": int(r.src_port), "dst_port": int(r.dst_port), "protocol": int(r.protocol),
                     "timestamp": None if pd.isna(r.timestamp) else pd.Timestamp(r.timestamp).isoformat(),
                     "label": r.label, "score": float(r.score), "is_anomaly": bool(r.is_anomaly),
                     "cluster": int(r.cluster)})
    return {"total": total, "page": page, "page_size": page_size, "rows": rows}


TIER_RANK = {"investigate": 0, "monitor": 1, "low": 2}


@app.get("/api/runs/{run_id}/graph")
def get_graph(run_id: str, community: int | None = None, max_nodes: int = Query(250, ge=10, le=1500),
              tier: str | None = None, include_communication: bool = True):
    art = _artifacts(run_id)
    G = art.G
    if G is None:
        raise HTTPException(404, art.results["graph"].get("reason", "Graph not available"))
    key = (community, max_nodes, tier)
    if key not in art.layouts:
        cand = list(G.nodes)
        if community is not None:
            cand = [n for n in cand if G.nodes[n].get("community") == community]
        if tier:
            tiers = set(tier.split(","))
            cand = [n for n in cand if G.nodes[n].get("tier") in tiers]
        cand.sort(key=lambda n: (TIER_RANK.get(G.nodes[n].get("tier"), 3),
                                 -G.nodes[n]["anomalous_flows"], -G.degree(n)))
        chosen = cand[:max_nodes]
        art.layouts[key] = (chosen, layout_subgraph(G, chosen), len(cand))
    chosen, pos, n_cand = art.layouts[key]
    sub = G.subgraph(chosen)
    nodes = []
    for n in chosen:
        d = G.nodes[n]
        x, y = pos.get(n, (0.0, 0.0))
        nodes.append({"data": {"id": n, "label": n, "community": d.get("community"), "tier": d.get("tier"),
                               "flows": d["flows"], "anomalous_flows": d["anomalous_flows"],
                               "anomaly_rate": d["anomaly_rate"], "max_score": d["max_score"],
                               "suspicious": d["suspicious"], "degree": G.degree(n)},
                      "position": {"x": x, "y": y}})
    edges = []
    for u, v, d in sub.edges(data=True):
        coord = "coordination" in d["kinds"]
        if not include_communication and not coord:
            continue
        edges.append({"data": {"id": f"{u}|{v}", "source": u, "target": v,
                               "kind": "coordination" if coord else "communication",
                               "kinds": d["kinds"], "weight": d["weight"], "flows": d.get("flows", 0),
                               "anomalous_flows": d.get("anomalous_flows", 0),
                               "coordination_score": d["coordination"]["score"] if coord else None}})
    return clean({"nodes": nodes, "edges": edges, "total_candidates": n_cand, "shown": len(nodes),
                  "total_nodes": G.number_of_nodes(), "total_edges": G.number_of_edges()})


@app.get("/api/runs/{run_id}/edges")
def get_edge(run_id: str, source: str, target: str):
    G = _artifacts(run_id).G
    if G is None or not G.has_edge(source, target):
        raise HTTPException(404, "Edge not found")
    return clean({"source": source, "target": target, **G[source][target]})


@app.get("/api/runs/{run_id}/nodes/{ip}")
def get_node(run_id: str, ip: str):
    art = _artifacts(run_id)
    G, f = art.G, art.flows
    if G is None or ip not in G:
        raise HTTPException(404, "IP not found in graph")
    d = dict(G.nodes[ip])
    out_f = f[f["src_ip"] == ip]
    in_f = f[f["dst_ip"] == ip]

    def peers(frame, col):
        g = frame.groupby(col).agg(flows=("row", "size"), anomalous=("is_anomaly", "sum"))
        g = g.sort_values(["anomalous", "flows"], ascending=False).head(10)
        return [{"ip": k, "flows": int(r.flows), "anomalous": int(r.anomalous)} for k, r in g.iterrows()]

    both = pd.concat([out_f, in_f])
    coord = []
    for nb in G.neighbors(ip):
        e = G[ip][nb]
        if "coordination" in e:
            coord.append({"peer": nb, **e["coordination"]})
    coord.sort(key=lambda e: -e["score"])
    comm_id = d.get("community")
    comm = next((c for c in art.results.get("communities", []) if c["id"] == comm_id), None)
    return clean({
        "ip": ip, **d, "degree": G.degree(ip),
        "top_destinations": peers(out_f, "dst_ip"),
        "top_sources": peers(in_f, "src_ip"),
        "top_dst_ports": [{"port": int(p), "flows": int(n)}
                          for p, n in out_f["dst_port"].value_counts().head(8).items() if p >= 0],
        "clusters": [{"cluster": int(c), "flows": int(n)} for c, n in both["cluster"].value_counts().head(8).items()],
        "labels": ([{"label": str(k), "count": int(v)} for k, v in both["label"].value_counts().head(6).items()]
                   if both["label"].notna().any() else None),
        "first_seen": both["timestamp"].min(), "last_seen": both["timestamp"].max(),
        "coordination": coord[:25],
        "community_summary": None if comm is None else {
            k: comm[k] for k in ("id", "size", "tier", "priority_score", "evidence")},
    })


@app.get("/api/runs/{run_id}/communities/{cid}")
def get_community(run_id: str, cid: int):
    art = _artifacts(run_id)
    comm = next((c for c in art.results.get("communities", []) if c["id"] == cid), None)
    if comm is None:
        raise HTTPException(404, "Community not found (singletons are not analysed)")
    G = art.G
    members = [n for n, d in G.nodes(data=True) if d.get("community") == cid]
    sub = G.subgraph(members)
    coord = [{"source": u, "target": v, **d["coordination"]} for u, v, d in sub.edges(data=True)
             if "coordination" in d]
    coord.sort(key=lambda e: -e["score"])
    member_rows = sorted(
        ({"ip": n, "flows": G.nodes[n]["flows"], "anomalous_flows": G.nodes[n]["anomalous_flows"],
          "anomaly_rate": G.nodes[n]["anomaly_rate"], "suspicious": G.nodes[n]["suspicious"],
          "degree": G.degree(n)} for n in members),
        key=lambda r: (-r["anomalous_flows"], -r["degree"]))
    return clean({**comm, "member_details": member_rows[:500], "coordination_pairs": coord[:200]})


# ---- reports & notes --------------------------------------------------------

def _report(run_id: str) -> dict:
    art = _artifacts(run_id)
    run = get_run(run_id)
    ds = db.get_dataset(run["dataset_id"])
    return clean(report.build_report(run, ds, art.results, db.list_notes(run_id)))


@app.get("/api/runs/{run_id}/report")
def get_report(run_id: str, format: str = Query("json", pattern="^(json|md|html)$")):
    r = _report(run_id)
    fname = f"threatgraph_report_{run_id}"
    if format == "md":
        return PlainTextResponse(report.to_markdown(r), media_type="text/markdown",
                                 headers={"Content-Disposition": f'attachment; filename="{fname}.md"'})
    if format == "html":
        return HTMLResponse(report.to_html(r))
    return JSONResponse(r, headers={"Content-Disposition": f'inline; filename="{fname}.json"'})


class NoteRequest(BaseModel):
    target_type: str = Field("run", pattern="^(run|community|node)$")
    target_id: str | None = None
    text: str = Field(..., min_length=1, max_length=5000)


@app.get("/api/runs/{run_id}/notes")
def list_notes(run_id: str):
    get_run(run_id)
    return db.list_notes(run_id)


@app.post("/api/runs/{run_id}/notes")
def add_note(run_id: str, req: NoteRequest):
    get_run(run_id)
    return db.insert_note(run_id, req.target_type, req.target_id, req.text)


@app.delete("/api/notes/{note_id}")
def delete_note(note_id: str):
    db.delete_note(note_id)
    return {"deleted": note_id}
