"""Module 1b: cleaning and feature preparation.

Produces two things:
  * ``flows`` — a compact per-flow frame of identifiers (IPs, ports, time, label)
    used by graph construction and the UI.
  * ``X`` — a standardised numeric feature matrix used by Isolation Forest and DBSCAN.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

from .ingest import detect_roles, normalise_labels, numeric_feature_columns, parse_timestamps


@dataclass
class Prepared:
    flows: pd.DataFrame
    X: np.ndarray
    feature_names: list[str]
    report: dict = field(default_factory=dict)


def prepare(df: pd.DataFrame, max_rows: int | None = None, random_state: int = 42) -> Prepared:
    report: dict = {"input_rows": int(len(df))}
    roles = detect_roles(list(df.columns))

    if max_rows and len(df) > max_rows:
        df = df.sample(n=max_rows, random_state=random_state).sort_index()
        report["sampled_rows"] = int(max_rows)
        report["sampling"] = f"Uniform random sample of {max_rows:,} rows (seed {random_state})."
    df = df.reset_index(drop=True)

    features = numeric_feature_columns(df, roles)
    if not features:
        raise ValueError("Dataset has no numeric feature columns.")
    num = df[features].apply(pd.to_numeric, errors="coerce").astype("float64")

    inf_mask = np.isinf(num.to_numpy())
    report["infinite_values_replaced"] = int(inf_mask.sum())
    num = num.mask(np.isinf(num), np.nan)

    all_nan = [c for c in features if num[c].isna().all()]
    num = num.drop(columns=all_nan)
    report["missing_values_imputed"] = int(num.isna().sum().sum())
    medians = num.median()
    num = num.fillna(medians).fillna(0.0)

    constant = [c for c in num.columns if num[c].nunique() <= 1]
    num = num.drop(columns=constant)

    # Drop columns that are exact copies of an earlier column (common in CIC-IDS2017).
    hashes = {c: pd.util.hash_pandas_object(num[c], index=False).sum() for c in num.columns}
    seen: dict = {}
    duplicate_cols = []
    for c, h in hashes.items():
        if h in seen and num[c].equals(num[seen[h]]):
            duplicate_cols.append(c)
        else:
            seen.setdefault(h, c)
    num = num.drop(columns=duplicate_cols)

    report["dropped_columns"] = {
        "all_missing": all_nan, "constant": constant, "duplicate": duplicate_cols,
    }
    if num.shape[1] < 2:
        raise ValueError("Fewer than 2 informative numeric features remain after cleaning.")

    # Flow statistics are heavy-tailed (bytes/s spans 10+ orders of magnitude);
    # a signed log transform keeps distances meaningful before standardisation.
    transformed = np.sign(num.to_numpy()) * np.log1p(np.abs(num.to_numpy()))
    X = StandardScaler().fit_transform(transformed).astype(np.float32)
    report["features_used"] = int(X.shape[1])
    report["transform"] = "signed log1p, then z-score standardisation"

    flows = pd.DataFrame(index=df.index)
    flows["row"] = np.arange(len(df))
    flows["src_ip"] = df[roles["src_ip"]].astype(str).str.strip() if "src_ip" in roles else None
    flows["dst_ip"] = df[roles["dst_ip"]].astype(str).str.strip() if "dst_ip" in roles else None
    flows["src_port"] = _int_col(df, roles.get("src_port"))
    flows["dst_port"] = _int_col(df, roles.get("dst_port"))
    flows["protocol"] = _int_col(df, roles.get("protocol"))
    flows["timestamp"] = parse_timestamps(df[roles["timestamp"]]) if "timestamp" in roles else pd.NaT
    flows["label"] = normalise_labels(df[roles["label"]]) if "label" in roles else None

    report["rows_analysed"] = int(len(flows))
    report["roles"] = roles
    return Prepared(flows=flows, X=X, feature_names=list(num.columns), report=report)


def _int_col(df: pd.DataFrame, col: str | None) -> pd.Series:
    if not col:
        return pd.Series(-1, index=df.index, dtype="int64")
    return pd.to_numeric(df[col], errors="coerce").fillna(-1).astype("int64")
