"""Filesystem locations and default pipeline parameters."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("THREATGRAPH_DATA_DIR", BASE_DIR / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
RUNS_DIR = DATA_DIR / "runs"
DB_PATH = DATA_DIR / "threatgraph.db"

for _d in (DATA_DIR, UPLOAD_DIR, RUNS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = int(os.environ.get("THREATGRAPH_MAX_UPLOAD_MB", "3072")) * 1024 * 1024

DEFAULT_PARAMS: dict = {
    # Row cap applied before analysis (random sample, fixed seed). None = use every row.
    "max_rows": 200_000,
    "random_state": 42,
    # Isolation Forest
    "if_n_estimators": 200,
    "if_contamination": 0.1,  # float in (0, 0.5] or "auto"
    # DBSCAN
    "dbscan_eps": None,  # None = estimate from k-distance knee
    "dbscan_min_samples": 10,
    "dbscan_sample_size": 15_000,
    "pca_components": 10,
    # Graph construction
    "min_anomalous_flows": 3,  # a source needs this many flagged flows to be "suspicious"
    "max_suspicious_sources": 300,
    "coordination_threshold": 0.45,
    "temporal_tolerance_minutes": 5,
    # Louvain
    "louvain_resolution": 1.0,
}
