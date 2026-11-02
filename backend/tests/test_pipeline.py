import numpy as np
import pandas as pd
import pytest

from app.pipeline import anomaly, clustering, community, graph, ingest, preprocess, runner


def test_detect_roles_handles_cic_whitespace_and_aliases():
    roles = ingest.detect_roles([" Source IP", " Destination IP", " Destination Port", " Timestamp", " Label"])
    assert roles["src_ip"] == " Source IP"
    assert roles["dst_port"] == " Destination Port"
    unsw = ingest.detect_roles(["srcip", "dstip", "dsport", "stime", "label", "attack_cat"])
    assert unsw["src_ip"] == "srcip" and unsw["label"] == "attack_cat"


def test_normalise_labels():
    s = ingest.normalise_labels(pd.Series(["BENIGN", "normal", "Web Attack � Brute Force", "0", "1"]))
    assert list(s) == ["BENIGN", "BENIGN", "Web Attack - Brute Force", "BENIGN", "ATTACK"]


def test_profile_flags_missing_ip_columns():
    df = pd.DataFrame(np.random.default_rng(0).random((50, 5)), columns=list("abcde"))
    prof = ingest.profile_dataset(df)
    assert prof["valid"] and not prof["graph_capable"]
    assert any("IP" in w for w in prof["warnings"])


def test_profile_rejects_too_few_features():
    prof = ingest.profile_dataset(pd.DataFrame({"x": [1, 2, 3]}))
    assert not prof["valid"]


def test_preprocess_cleans_inf_nan_and_constants(sample_csv):
    df = ingest.read_csv(sample_csv)
    df["const"] = 1.0
    prep = preprocess.prepare(df)
    assert np.isfinite(prep.X).all()
    assert "const" in prep.report["dropped_columns"]["constant"]
    assert prep.report["infinite_values_replaced"] > 0
    assert len(prep.flows) == len(df) == prep.X.shape[0]
    assert prep.flows["timestamp"].notna().mean() > 0.99


def test_isolation_forest_finds_injected_outliers():
    rng = np.random.default_rng(0)
    X = np.vstack([rng.normal(0, 1, (1000, 4)), rng.normal(8, 0.5, (20, 4))]).astype(np.float32)
    labels = pd.Series(["BENIGN"] * 1000 + ["ATTACK"] * 20)
    score, flag, thr = anomaly.run_isolation_forest(X, 100, 0.02, 0)
    m = anomaly.evaluate(labels, score, flag)
    assert m["recall"] >= 0.9 and m["precision"] >= 0.9
    assert 0 <= m["false_positive_rate"] <= 0.01
    assert m["confusion_matrix"]["tp"] + m["confusion_matrix"]["fn"] == 20


def test_dbscan_separates_blobs_and_extends_to_unsampled_points():
    rng = np.random.default_rng(1)
    X = np.vstack([rng.normal(0, 0.1, (3000, 3)), rng.normal(5, 0.1, (3000, 3))]).astype(np.float32)
    res = clustering.run_dbscan(X, eps=0.5, min_samples=5, sample_size=1000, pca_components=3)
    assert len(set(res["labels"].tolist()) - {-1}) == 2
    assert (res["labels"] == -1).mean() < 0.01  # unsampled points assigned to clusters
    labels = pd.Series(["a"] * 3000 + ["b"] * 3000)
    m = clustering.evaluate(res, labels)
    assert m["purity"] > 0.99 and m["silhouette"] > 0.8


def test_eps_estimation_is_positive():
    rng = np.random.default_rng(2)
    eps, curve = clustering.estimate_eps(rng.normal(0, 1, (500, 3)), 5)
    assert eps > 0 and len(curve) > 0


def test_coordination_edges_link_sources_sharing_a_target():
    ts = pd.Timestamp("2017-07-05 10:00")
    rows = []
    for i, src in enumerate(["10.0.0.1", "10.0.0.2", "10.0.0.3"]):
        for k in range(5):
            rows.append({"src_ip": src, "dst_ip": "192.168.1.5", "dst_port": 80 + k % 2,
                         "timestamp": ts + pd.Timedelta(minutes=k), "is_anomaly": True, "cluster": 0})
    for k in range(10):  # unrelated benign traffic
        rows.append({"src_ip": "10.9.9.9", "dst_ip": "8.8.8.8", "dst_port": 53,
                     "timestamp": ts + pd.Timedelta(hours=3, minutes=k), "is_anomaly": False, "cluster": 1})
    flows = pd.DataFrame(rows)
    flows["row"] = np.arange(len(flows))
    flows["score"] = np.where(flows["is_anomaly"], 0.7, 0.4)
    flows["label"] = None
    Z = np.tile([1.0, 0.5], (len(flows), 1))
    params = runner.merge_params({"min_anomalous_flows": 3})
    G, info = graph.build_graph(flows, Z, params)
    assert info["suspicious_sources"] == 3
    assert info["coordination_edges"] == 3
    ev = G["10.0.0.1"]["10.0.0.2"]["coordination"]
    assert ev["destination_jaccard"] == 1.0 and ev["shared_destinations"] == ["192.168.1.5"]
    assert ev["temporal_overlap"] == pytest.approx(1.0)
    assert not G.has_edge("10.0.0.1", "10.9.9.9")

    partition, stats = community.detect_communities(G)
    assert partition["10.0.0.1"] == partition["10.0.0.2"] == partition["10.0.0.3"]
    assert partition["10.9.9.9"] != partition["10.0.0.1"]
    comms = community.analyse_communities(G, partition, flows, params)
    top = comms[0]
    assert top["tier"] == community.TIER_INVESTIGATE
    assert set(top["coordinated_sources"]) == {"10.0.0.1", "10.0.0.2", "10.0.0.3"}
    assert top["evidence"]


def test_full_pipeline_on_sample(sample_csv, tmp_path):
    res = runner.execute("test-run", str(sample_csv), runner.merge_params({}))
    assert res["anomaly"]["has_labels"]
    for k in ("precision", "recall", "f1", "false_positive_rate"):
        assert 0 <= res["anomaly"][k] <= 1
    assert res["clustering"]["n_clusters"] >= 2
    assert res["graph"]["available"] and res["graph"]["coordination_edges"] > 0
    assert -0.5 <= res["community_stats"]["modularity"] <= 1
    investigate = [c for c in res["communities"] if c["tier"] == "investigate"]
    assert investigate, "expected at least one community flagged for investigation"
    assert res["performance"]["total_seconds"] > 0
    assert {s["stage"] for s in res["performance"]["stages"]} == {s for s, _ in runner.STAGES}


def test_pipeline_without_ip_columns(tmp_path):
    rng = np.random.default_rng(0)
    df = pd.DataFrame(rng.lognormal(0, 1, (800, 6)), columns=[f"f{i}" for i in range(6)])
    df["Label"] = "BENIGN"
    p = tmp_path / "noip.csv"
    df.to_csv(p, index=False)
    res = runner.execute("noip", str(p), runner.merge_params({}))
    assert res["graph"]["available"] is False
    assert res["communities"] == []
