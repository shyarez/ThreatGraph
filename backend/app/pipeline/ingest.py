"""Module 1a: CSV loading, schema detection and dataset profiling.

Supports CIC-IDS2017 "GeneratedLabelledFlows"/"TrafficLabelling" CSVs (which have
leading spaces in column names and occasional non-UTF-8 bytes), plus other flow
datasets that use common aliases (UNSW-NB15, NetFlow-style exports, Zeek conn logs).
"""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

# Canonical role -> accepted column names (normalised: lowercase, single spaces).
COLUMN_ALIASES: dict[str, list[str]] = {
    "flow_id": ["flow id", "flowid"],
    "src_ip": ["source ip", "src ip", "srcip", "src addr", "saddr", "sourceip", "id.orig h",
               "ipv4 src addr", "src ip addr"],
    "dst_ip": ["destination ip", "dst ip", "dstip", "dst addr", "daddr", "destinationip",
               "id.resp h", "ipv4 dst addr", "dst ip addr"],
    "src_port": ["source port", "src port", "sport", "srcport", "id.orig p", "l4 src port"],
    "dst_port": ["destination port", "dst port", "dsport", "dport", "dstport", "id.resp p",
                 "l4 dst port"],
    "protocol": ["protocol", "proto"],
    "timestamp": ["timestamp", "stime", "ts", "time", "start time", "flow start", "date first seen"],
    "label": ["label", "class", "attack", "attack cat", "attack_cat"],
}

BENIGN_VALUES = {"benign", "normal", "0", "0.0", "false", "background"}


def normalise_name(name: str) -> str:
    return re.sub(r"[\s_]+", " ", str(name).strip().lower())


SUPPORTED_EXTENSIONS = (".csv", ".parquet", ".pq")


def is_parquet(path: str | Path) -> bool:
    return str(path).lower().endswith((".parquet", ".pq"))


def _read_parquet(path: str | Path, nrows: int | None) -> pd.DataFrame:
    if nrows is None:
        return pd.read_parquet(path)
    import pyarrow as pa
    import pyarrow.parquet as pq

    # Read only the first batch(es) so previews of large files stay cheap.
    batches, got = [], 0
    pf = pq.ParquetFile(path)
    for batch in pf.iter_batches(batch_size=max(nrows, 1)):
        batches.append(batch)
        got += batch.num_rows
        if got >= nrows:
            break
    if not batches:
        return pf.schema_arrow.empty_table().to_pandas()
    return pa.Table.from_batches(batches).to_pandas().head(nrows)


def read_csv(path: str | Path, nrows: int | None = None) -> pd.DataFrame:
    """Read a flow dataset (CSV or Parquet) robustly: tolerant of bad bytes and stray whitespace."""
    if is_parquet(path):
        df = _read_parquet(path, nrows)
    else:
        df = pd.read_csv(
            path,
            nrows=nrows,
            low_memory=False,
            skipinitialspace=True,
            encoding="utf-8",
            encoding_errors="replace",
            on_bad_lines="skip",
        )
    df.columns = [str(c).strip() for c in df.columns]
    # CIC-IDS2017 duplicates "Fwd Header Length"; pandas renames it ".1" — harmless.
    df = df.loc[:, ~df.columns.duplicated()]
    # Fully empty trailing rows appear in some CIC-IDS2017 files.
    df = df.dropna(how="all")
    return df


def detect_roles(columns: list[str]) -> dict[str, str]:
    """Map canonical roles to actual column names present in the file."""
    norm = {normalise_name(c): c for c in columns}
    roles: dict[str, str] = {}
    for role, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in norm:
                roles[role] = norm[alias]
                break
    # UNSW-NB15 has both a binary "label" and a textual "attack_cat"; prefer the text.
    if "attack cat" in norm and roles.get("label") == norm.get("label"):
        roles["label"] = norm["attack cat"]
    return roles


def parse_timestamps(series: pd.Series) -> pd.Series:
    """Parse timestamps; numeric values are treated as epoch seconds (or ms)."""
    if pd.api.types.is_numeric_dtype(series):
        s = pd.to_numeric(series, errors="coerce")
        unit = "ms" if s.dropna().median() > 1e11 else "s"
        return pd.to_datetime(s, unit=unit, errors="coerce")
    # CIC-IDS2017 uses day-first strings like "5/7/2017 8:42" (5 July 2017).
    return pd.to_datetime(series.astype(str).str.strip(), errors="coerce", dayfirst=True, format="mixed")


def normalise_labels(series: pd.Series) -> pd.Series:
    s = series.astype(str).str.strip()
    s = s.str.replace("�", "-", regex=False)  # "Web Attack � Brute Force" in CIC-IDS2017
    s = s.str.replace(r"\s+", " ", regex=True)
    lowered = s.str.lower()
    s = s.mask(lowered.isin(BENIGN_VALUES), "BENIGN")
    s = s.mask(lowered.isin({"1", "1.0", "true"}), "ATTACK")
    s = s.mask(lowered.isin({"nan", "", "none", "-"}), "UNKNOWN")
    return s


def is_benign(labels: pd.Series) -> pd.Series:
    return labels == "BENIGN"


def numeric_feature_columns(df: pd.DataFrame, roles: dict[str, str]) -> list[str]:
    """Numeric columns usable as behavioural features (identifiers excluded)."""
    excluded = {roles.get(r) for r in ("flow_id", "src_ip", "dst_ip", "src_port", "dst_port",
                                        "protocol", "timestamp", "label")}
    excluded |= {c for c in df.columns if normalise_name(c) in {"label", "attack cat", "stime", "ltime"}}
    cols = []
    for c in df.columns:
        if c in excluded:
            continue
        if pd.api.types.is_numeric_dtype(df[c]):
            cols.append(c)
    return cols


def profile_dataset(df: pd.DataFrame) -> dict:
    """Validate a dataset and compute descriptive statistics for the UI."""
    roles = detect_roles(list(df.columns))
    features = numeric_feature_columns(df, roles)
    warnings: list[str] = []
    errors: list[str] = []

    if len(df) == 0:
        errors.append("The file contains no data rows.")
    if len(features) < 3:
        errors.append(
            f"Only {len(features)} numeric feature columns found; at least 3 are needed for "
            "anomaly detection and clustering."
        )
    graph_capable = "src_ip" in roles and "dst_ip" in roles
    if not graph_capable:
        warnings.append(
            "No source/destination IP columns detected. Anomaly detection and clustering will run, "
            "but the relationship graph and community analysis need IP identifiers. For CIC-IDS2017 use "
            "the 'GeneratedLabelledFlows' (TrafficLabelling) CSVs, not 'MachineLearningCVE'."
        )
    if "timestamp" not in roles:
        warnings.append("No timestamp column detected; temporal-overlap evidence will be unavailable.")
    if "label" not in roles:
        warnings.append("No ground-truth label column detected; evaluation metrics that need labels "
                        "(precision, recall, purity) will be skipped.")

    numeric = df[features] if features else pd.DataFrame(index=df.index)
    arr = numeric.to_numpy(dtype="float64", na_value=np.nan) if features else np.empty((len(df), 0))
    inf_count = int(np.isinf(arr).sum()) if arr.size else 0
    nan_count = int(np.isnan(arr).sum()) if arr.size else 0
    constant = [c for c in features if numeric[c].nunique(dropna=True) <= 1]

    profile: dict = {
        "rows": int(len(df)),
        "columns": int(df.shape[1]),
        "column_names": list(df.columns),
        "roles": roles,
        "feature_columns": features,
        "n_features": len(features),
        "constant_features": constant,
        "missing_values": nan_count,
        "infinite_values": inf_count,
        "duplicate_rows": int(df.duplicated().sum()) if len(df) <= 500_000 else None,
        "graph_capable": graph_capable,
        "has_labels": "label" in roles,
        "has_timestamps": "timestamp" in roles,
        "warnings": warnings,
        "errors": errors,
        "valid": not errors,
    }

    if graph_capable:
        profile["unique_src_ips"] = int(df[roles["src_ip"]].nunique())
        profile["unique_dst_ips"] = int(df[roles["dst_ip"]].nunique())
    if "dst_port" in roles:
        top = df[roles["dst_port"]].value_counts().head(10)
        profile["top_dst_ports"] = [{"port": str(k), "count": int(v)} for k, v in top.items()]
    if "protocol" in roles:
        top = df[roles["protocol"]].value_counts().head(5)
        profile["protocols"] = [{"protocol": str(k), "count": int(v)} for k, v in top.items()]
    if "label" in roles:
        labels = normalise_labels(df[roles["label"]])
        counts = labels.value_counts()
        profile["label_distribution"] = [{"label": str(k), "count": int(v)} for k, v in counts.items()]
        profile["attack_fraction"] = float((~is_benign(labels)).mean())
    if "timestamp" in roles:
        ts = parse_timestamps(df[roles["timestamp"]])
        valid = ts.dropna()
        profile["timestamp_parse_rate"] = float(len(valid) / max(len(ts), 1))
        if len(valid):
            profile["time_start"] = valid.min().isoformat()
            profile["time_end"] = valid.max().isoformat()
        if profile["timestamp_parse_rate"] < 0.5:
            warnings.append("Fewer than half of the timestamps could be parsed.")

    # Summary statistics for a handful of key features (shown in the UI).
    key = [c for c in features if normalise_name(c) in {
        "flow duration", "total fwd packets", "total backward packets", "flow bytes/s",
        "flow packets/s", "total length of fwd packets", "dur", "sbytes", "dbytes", "spkts", "dpkts"}]
    for c in (key or features)[:8]:
        col = pd.to_numeric(df[c], errors="coerce").replace([np.inf, -np.inf], np.nan)
        profile.setdefault("feature_stats", []).append({
            "feature": c,
            "mean": _f(col.mean()), "std": _f(col.std()), "min": _f(col.min()),
            "median": _f(col.median()), "max": _f(col.max()),
        })
    return profile


def _f(v) -> float | None:
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(v) or np.isinf(v) else v
