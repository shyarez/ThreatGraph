"""Loads and caches a completed run's artefacts for API queries."""
from __future__ import annotations

import json
import pickle
import threading
from collections import OrderedDict
from dataclasses import dataclass

import networkx as nx
import pandas as pd

from .pipeline.runner import run_dir


@dataclass
class RunArtifacts:
    results: dict
    flows: pd.DataFrame
    G: nx.Graph | None
    layouts: dict


_cache: "OrderedDict[str, RunArtifacts]" = OrderedDict()
_lock = threading.Lock()
MAX_CACHED = 3


def load(run_id: str) -> RunArtifacts:
    with _lock:
        if run_id in _cache:
            _cache.move_to_end(run_id)
            return _cache[run_id]
    d = run_dir(run_id)
    with open(d / "results.json", encoding="utf-8") as fh:
        results = json.load(fh)
    flows = pd.read_pickle(d / "flows.pkl")
    G = None
    if (d / "graph.pkl").exists():
        with open(d / "graph.pkl", "rb") as fh:
            G = pickle.load(fh)
    art = RunArtifacts(results, flows, G, {})
    with _lock:
        _cache[run_id] = art
        while len(_cache) > MAX_CACHED:
            _cache.popitem(last=False)
    return art


def evict(run_id: str) -> None:
    with _lock:
        _cache.pop(run_id, None)
