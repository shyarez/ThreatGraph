"""SQLite persistence for datasets, pipeline runs and investigation notes."""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from .config import DB_PATH

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    profile_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    params_json TEXT NOT NULL,
    status TEXT NOT NULL,
    stage TEXT,
    progress REAL NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL,
    finished_at TEXT,
    summary_json TEXT
);
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id TEXT,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return uuid.uuid4().hex[:12]


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with _lock:
            yield conn
            conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        # Runs interrupted by a server restart can never finish.
        conn.execute(
            "UPDATE runs SET status='failed', error='Interrupted by server restart' "
            "WHERE status IN ('queued', 'running')"
        )


def _row(row: sqlite3.Row | None, json_fields: tuple[str, ...]) -> dict[str, Any] | None:
    if row is None:
        return None
    d = dict(row)
    for f in json_fields:
        key = f.removesuffix("_json")
        raw = d.pop(f, None)
        d[key] = json.loads(raw) if raw else None
    return d


# ---- datasets -------------------------------------------------------------

def insert_dataset(name: str, filename: str, path: str, size_bytes: int, profile: dict) -> dict:
    ds_id = new_id()
    with connect() as conn:
        conn.execute(
            "INSERT INTO datasets VALUES (?,?,?,?,?,?,?)",
            (ds_id, name, filename, path, size_bytes, now_iso(), json.dumps(profile)),
        )
    return get_dataset(ds_id)  # type: ignore[return-value]


def get_dataset(ds_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM datasets WHERE id=?", (ds_id,)).fetchone()
    return _row(row, ("profile_json",))


def list_datasets() -> list[dict]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM datasets ORDER BY created_at DESC").fetchall()
    return [_row(r, ("profile_json",)) for r in rows]  # type: ignore[misc]


def delete_dataset(ds_id: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM datasets WHERE id=?", (ds_id,))


# ---- runs -----------------------------------------------------------------

def insert_run(dataset_id: str, params: dict) -> dict:
    run_id = new_id()
    with connect() as conn:
        conn.execute(
            "INSERT INTO runs (id, dataset_id, params_json, status, stage, progress, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (run_id, dataset_id, json.dumps(params), "queued", "queued", 0.0, now_iso()),
        )
    return get_run(run_id)  # type: ignore[return-value]


def update_run(run_id: str, **fields: Any) -> None:
    if "summary" in fields:
        fields["summary_json"] = json.dumps(fields.pop("summary"))
    cols = ", ".join(f"{k}=?" for k in fields)
    with connect() as conn:
        conn.execute(f"UPDATE runs SET {cols} WHERE id=?", (*fields.values(), run_id))


def get_run(run_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT runs.*, datasets.name AS dataset_name FROM runs "
            "LEFT JOIN datasets ON datasets.id = runs.dataset_id WHERE runs.id=?",
            (run_id,),
        ).fetchone()
    return _row(row, ("params_json", "summary_json"))


def list_runs(dataset_id: str | None = None) -> list[dict]:
    sql = (
        "SELECT runs.*, datasets.name AS dataset_name FROM runs "
        "LEFT JOIN datasets ON datasets.id = runs.dataset_id"
    )
    args: tuple = ()
    if dataset_id:
        sql += " WHERE dataset_id=?"
        args = (dataset_id,)
    sql += " ORDER BY runs.created_at DESC"
    with connect() as conn:
        rows = conn.execute(sql, args).fetchall()
    return [_row(r, ("params_json", "summary_json")) for r in rows]  # type: ignore[misc]


def delete_run(run_id: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM runs WHERE id=?", (run_id,))


# ---- notes ----------------------------------------------------------------

def insert_note(run_id: str, target_type: str, target_id: str | None, text: str) -> dict:
    note_id = new_id()
    created = now_iso()
    with connect() as conn:
        conn.execute(
            "INSERT INTO notes VALUES (?,?,?,?,?,?)",
            (note_id, run_id, target_type, target_id, text, created),
        )
    return {"id": note_id, "run_id": run_id, "target_type": target_type,
            "target_id": target_id, "text": text, "created_at": created}


def list_notes(run_id: str) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM notes WHERE run_id=? ORDER BY created_at DESC", (run_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def delete_note(note_id: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM notes WHERE id=?", (note_id,))
