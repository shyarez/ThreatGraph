import time

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def completed_run(client, sample_csv):
    with open(sample_csv, "rb") as fh:
        r = client.post("/api/datasets", files={"file": ("sample.csv", fh, "text/csv")})
    assert r.status_code == 200, r.text
    ds = r.json()
    assert ds["profile"]["graph_capable"]
    r = client.post("/api/runs", json={"dataset_id": ds["id"], "params": {"if_contamination": 0.12}})
    assert r.status_code == 200, r.text
    run_id = r.json()["id"]
    for _ in range(240):
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] in ("completed", "failed"):
            break
        time.sleep(0.5)
    assert run["status"] == "completed", run.get("error")
    return run


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_rejects_non_csv(client):
    r = client.post("/api/datasets", files={"file": ("x.txt", b"hello", "text/plain")})
    assert r.status_code == 400


def test_rejects_invalid_params(client, completed_run):
    r = client.post("/api/runs", json={"dataset_id": completed_run["dataset_id"],
                                       "params": {"if_contamination": 0.9}})
    assert r.status_code == 422


def test_results_and_queries(client, completed_run):
    rid = completed_run["id"]
    assert completed_run["summary"]["flagged"] > 0
    res = client.get(f"/api/runs/{rid}/results").json()
    assert res["anomaly"]["precision"] is not None

    flows = client.get(f"/api/runs/{rid}/flows", params={"page_size": 10}).json()
    assert flows["total"] == res["anomaly"]["flagged"] and len(flows["rows"]) == 10
    assert flows["rows"][0]["score"] >= flows["rows"][-1]["score"]

    g = client.get(f"/api/runs/{rid}/graph", params={"max_nodes": 50}).json()
    assert 0 < g["shown"] <= 50 and g["edges"]
    ip = g["nodes"][0]["data"]["id"]
    node = client.get(f"/api/runs/{rid}/nodes/{ip}").json()
    assert node["ip"] == ip and "community" in node

    cid = res["communities"][0]["id"]
    comm = client.get(f"/api/runs/{rid}/communities/{cid}").json()
    assert comm["member_details"]
    g2 = client.get(f"/api/runs/{rid}/graph", params={"community": cid}).json()
    assert all(n["data"]["community"] == cid for n in g2["nodes"])


def test_notes_and_reports(client, completed_run):
    rid = completed_run["id"]
    r = client.post(f"/api/runs/{rid}/notes", json={"target_type": "community", "target_id": "0",
                                                    "text": "Escalated to SOC"})
    assert r.status_code == 200
    assert client.get(f"/api/runs/{rid}/notes").json()[0]["text"] == "Escalated to SOC"
    md = client.get(f"/api/runs/{rid}/report", params={"format": "md"})
    assert md.status_code == 200 and "Escalated to SOC" in md.text and "Isolation Forest" in md.text
    html = client.get(f"/api/runs/{rid}/report", params={"format": "html"})
    assert html.text.startswith("<!doctype html>")
    js = client.get(f"/api/runs/{rid}/report").json()
    assert "disclaimer" in js


def test_sample_endpoint(client):
    r = client.post("/api/datasets/sample", json={"n_benign": 2000})
    assert r.status_code == 200 and r.json()["profile"]["valid"]


def test_upload_parquet(client, sample_csv, tmp_path):
    from app.pipeline import ingest

    pq_path = tmp_path / "sample.parquet"
    ingest.read_csv(sample_csv).to_parquet(pq_path, index=False)
    with open(pq_path, "rb") as fh:
        r = client.post("/api/datasets", files={"file": ("sample.parquet", fh, "application/octet-stream")})
    assert r.status_code == 200, r.text
    ds = r.json()
    assert ds["profile"]["graph_capable"]
    preview = client.get(f"/api/datasets/{ds['id']}/preview", params={"rows": 5}).json()
    assert len(preview["rows"]) == 5
    client.delete(f"/api/datasets/{ds['id']}")


def test_upload_rejects_other_extensions(client):
    r = client.post("/api/datasets", files={"file": ("data.xlsx", b"x", "application/octet-stream")})
    assert r.status_code == 400


def test_upload_multiple_files_merges(client, sample_csv, tmp_path):
    from app.pipeline import ingest

    df = ingest.read_csv(sample_csv)
    half = len(df) // 2
    a, b = tmp_path / "day1.parquet", tmp_path / "day2.csv"
    df.iloc[:half].to_parquet(a, index=False)
    df.iloc[half:][list(reversed(df.columns))].to_csv(b, index=False)  # column order may differ
    with open(a, "rb") as fa, open(b, "rb") as fb:
        r = client.post("/api/datasets", files=[
            ("files", ("day1.parquet", fa, "application/octet-stream")),
            ("files", ("day2.csv", fb, "text/csv")),
        ])
    assert r.status_code == 200, r.text
    ds = r.json()
    assert ds["profile"]["rows"] == len(df)
    assert ds["name"] == "day1 + 1 more"
    client.delete(f"/api/datasets/{ds['id']}")


def test_upload_multiple_files_rejects_column_mismatch(client, sample_csv, tmp_path):
    from app.pipeline import ingest

    df = ingest.read_csv(sample_csv)
    a, b = tmp_path / "a.parquet", tmp_path / "b.parquet"
    df.to_parquet(a, index=False)
    df.drop(columns=[df.columns[-1]]).to_parquet(b, index=False)
    with open(a, "rb") as fa, open(b, "rb") as fb:
        r = client.post("/api/datasets", files=[
            ("files", ("a.parquet", fa, "application/octet-stream")),
            ("files", ("b.parquet", fb, "application/octet-stream")),
        ])
    assert r.status_code == 400
    assert "different columns" in r.json()["detail"]
