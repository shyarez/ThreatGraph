"""Synthetic demo dataset in the CIC-IDS2017 "TrafficLabelling" column format.

This is SYNTHETIC traffic, generated so the full pipeline can be demonstrated without
downloading CIC-IDS2017. It is clearly labelled as such in the UI. Flow features are
drawn from per-traffic-type distributions; nothing about the detection results is
hard-coded — the pipeline must discover the scenarios from the features alone.

Scenarios injected (ground-truth labels):
  * PortScan    — 5 external hosts scanning 192.168.10.50 within the same 20 minutes
  * DDoS        — 8 bots flooding 192.168.10.51:80 within the same 20 minutes
  * SSH-Patator — 3 hosts brute-forcing 192.168.10.52:22 within the same 40 minutes
  * Infiltration— one internal host sending large uploads to an external IP all day
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

DAY = pd.Timestamp("2017-07-05 09:00:00")
DAY_SECONDS = 8 * 3600

# Column names copied from CIC-IDS2017, including its leading spaces.
COLS = ["Flow ID", " Source IP", " Source Port", " Destination IP", " Destination Port", " Protocol",
        " Timestamp", " Flow Duration", " Total Fwd Packets", " Total Backward Packets",
        "Total Length of Fwd Packets", " Total Length of Bwd Packets", " Fwd Packet Length Max",
        " Fwd Packet Length Mean", "Bwd Packet Length Max", " Bwd Packet Length Mean", "Flow Bytes/s",
        " Flow Packets/s", " Flow IAT Mean", " Flow IAT Std", "Fwd IAT Total", " Bwd IAT Mean",
        " SYN Flag Count", " RST Flag Count", " PSH Flag Count", " ACK Flag Count",
        "Init_Win_bytes_forward", " Init_Win_bytes_backward", " Average Packet Size", " Label"]


def _flows(rng, n, src, dst, dport, proto, t0, t1, dur, fwd, bwd, fsize, bsize, syn, rst, psh, ack,
           win_f, win_b, label):
    src = np.asarray(src)
    dst = np.asarray(dst)
    duration = np.maximum(1, dur(n)).astype(np.int64)  # microseconds
    nf = np.maximum(1, fwd(n)).astype(np.int64)
    nb = np.maximum(0, bwd(n)).astype(np.int64)
    fmean = np.maximum(0, fsize(n))
    bmean = np.where(nb > 0, np.maximum(0, bsize(n)), 0)
    flen = (nf * fmean).round()
    blen = (nb * bmean).round()
    secs = duration / 1e6
    with np.errstate(divide="ignore", invalid="ignore"):
        bytes_s = (flen + blen) / secs
        pkts_s = (nf + nb) / secs
    iat = duration / np.maximum(nf + nb - 1, 1)
    ts = DAY + pd.to_timedelta(rng.uniform(t0, t1, n), unit="s")
    sport = rng.integers(1024, 65535, n)
    dports = dport(n) if callable(dport) else np.full(n, dport)
    return pd.DataFrame({
        "Flow ID": [f"{d}-{s}-{dp}-{sp}-{proto}" for s, d, sp, dp in zip(src, dst, sport, dports)],
        " Source IP": src, " Source Port": sport, " Destination IP": dst, " Destination Port": dports,
        " Protocol": proto, " Timestamp": ts, " Flow Duration": duration,
        " Total Fwd Packets": nf, " Total Backward Packets": nb,
        "Total Length of Fwd Packets": flen, " Total Length of Bwd Packets": blen,
        " Fwd Packet Length Max": (fmean * rng.uniform(1.0, 1.6, n)).round(),
        " Fwd Packet Length Mean": fmean.round(2),
        "Bwd Packet Length Max": (bmean * rng.uniform(1.0, 1.6, n)).round(),
        " Bwd Packet Length Mean": np.round(bmean, 2),
        "Flow Bytes/s": bytes_s, " Flow Packets/s": pkts_s,
        " Flow IAT Mean": iat.round(2), " Flow IAT Std": (iat * rng.uniform(0.1, 1.2, n)).round(2),
        "Fwd IAT Total": (duration * rng.uniform(0.6, 1.0, n)).round(),
        " Bwd IAT Mean": np.where(nb > 1, iat * rng.uniform(0.8, 1.5, n), 0).round(2),
        " SYN Flag Count": syn(n), " RST Flag Count": rst(n), " PSH Flag Count": psh(n),
        " ACK Flag Count": ack(n),
        "Init_Win_bytes_forward": win_f(n), " Init_Win_bytes_backward": win_b(n),
        " Average Packet Size": ((flen + blen) / np.maximum(nf + nb, 1)).round(2),
        " Label": label,
    })


def generate_sample(path: str | Path, n_benign: int = 12_000, seed: int = 7) -> Path:
    rng = np.random.default_rng(seed)
    clients = [f"192.168.10.{i}" for i in range(5, 45)]
    servers = {"192.168.10.3": (53, 17), "192.168.10.50": (80, 6), "192.168.10.51": (443, 6),
               "192.168.10.52": (22, 6)}
    external = [f"{a}.{b}.{c}.{d}" for a, b, c, d in rng.integers(1, 223, (60, 4))]
    lognorm = lambda m, s: (lambda n: rng.lognormal(m, s, n))  # noqa: E731
    pois = lambda lam: (lambda n: rng.poisson(lam, n))  # noqa: E731
    flag = lambda p: (lambda n: (rng.random(n) < p).astype(int))  # noqa: E731
    choice = lambda vals: (lambda n: rng.choice(vals, n))  # noqa: E731
    parts = []

    # --- benign traffic: DNS, internal web/ssh, external HTTPS -------------------
    n_dns, n_int = int(n_benign * 0.3), int(n_benign * 0.25)
    n_ext = n_benign - n_dns - n_int
    parts.append(_flows(rng, n_dns, rng.choice(clients, n_dns), ["192.168.10.3"] * n_dns, 53, 17,
                        0, DAY_SECONDS, lognorm(10, 1.2), pois(1.2), pois(1.2), lognorm(3.8, 0.3),
                        lognorm(4.6, 0.4), flag(0), flag(0), flag(0), flag(0), choice([-1]), choice([-1]),
                        "BENIGN"))
    srv = rng.choice(["192.168.10.50", "192.168.10.51", "192.168.10.52"], n_int, p=[0.5, 0.4, 0.1])
    ports = np.array([servers[s][0] for s in srv])
    parts.append(_flows(rng, n_int, rng.choice(clients, n_int), srv, lambda n: ports, 6, 0, DAY_SECONDS,
                        lognorm(13, 1.8), pois(9), pois(11), lognorm(5.0, 0.8), lognorm(6.5, 0.9),
                        flag(0.05), flag(0.03), flag(0.6), flag(0.9), choice([8192, 29200, 65535, 251]),
                        choice([229, 28960, 65160, -1]), "BENIGN"))
    parts.append(_flows(rng, n_ext, rng.choice(clients, n_ext), rng.choice(external, n_ext),
                        choice([443, 443, 443, 80, 8080]), 6, 0, DAY_SECONDS, lognorm(14, 2.0), pois(12),
                        pois(16), lognorm(5.2, 0.9), lognorm(6.8, 0.8), flag(0.05), flag(0.04), flag(0.7),
                        flag(0.95), choice([8192, 29200, 65535]), choice([28960, 65160, 1452]), "BENIGN"))

    # --- coordinated port scan: 5 scanners, same victim, same window ------------
    scanners = [f"205.174.165.{i}" for i in range(70, 75)]
    per = 200
    for s in scanners:
        parts.append(_flows(rng, per, [s] * per, ["192.168.10.50"] * per, lambda n: rng.integers(1, 1025, n),
                            6, 5400, 6600, lognorm(4.0, 0.6), pois(0.3), pois(0.4),
                            lognorm(1.5, 0.5), lognorm(1.2, 0.5), flag(0.95), flag(0.9), flag(0),
                            flag(0.1), choice([1024, 29200]), choice([0, -1]), "PortScan"))

    # --- DDoS: 8 bots flooding one web server ----------------------------------
    bots = [f"172.16.0.{i}" for i in range(10, 18)]
    per = 150
    for b in bots:
        parts.append(_flows(rng, per, [b] * per, ["192.168.10.51"] * per, 80, 6, 14400, 15600,
                            lognorm(11.5, 0.5), pois(40), pois(1), lognorm(6.9, 0.15), lognorm(2.5, 0.5),
                            flag(0.3), flag(0.2), flag(0.95), flag(0.5), choice([8192, 256]),
                            choice([-1, 0]), "DDoS"))

    # --- SSH brute force: 3 hosts against the SSH server -------------------------
    brute = ["198.51.100.20", "198.51.100.21", "198.51.100.22"]
    per = 100
    for b in brute:
        parts.append(_flows(rng, per, [b] * per, ["192.168.10.52"] * per, 22, 6, 21600, 24000,
                            lognorm(15.2, 0.25), pois(22), pois(33), lognorm(4.3, 0.15), lognorm(4.7, 0.15),
                            flag(0.02), flag(0.01), flag(0.9), flag(1), choice([29200]), choice([247]),
                            "SSH-Patator"))

    # --- single-host exfiltration (not coordinated) ----------------------------
    parts.append(_flows(rng, 40, ["192.168.10.25"] * 40, ["203.0.113.99"] * 40, 4444, 6, 0, DAY_SECONDS,
                        lognorm(17, 0.4), pois(900), pois(60), lognorm(7.2, 0.05), lognorm(3.5, 0.3),
                        flag(0), flag(0), flag(1), flag(1), choice([65535]), choice([65535]), "Infiltration"))

    df = pd.concat(parts, ignore_index=True)
    df = df.sort_values(" Timestamp").reset_index(drop=True)
    # CIC-IDS2017 quirks: day-first minute-precision timestamps, inf/NaN rates for zero-length flows.
    df[" Timestamp"] = df[" Timestamp"].dt.strftime("%d/%m/%Y %H:%M:%S").str.lstrip("0")
    zero = rng.random(len(df)) < 0.003
    df.loc[zero, "Flow Bytes/s"] = np.inf
    df.loc[rng.random(len(df)) < 0.001, "Flow Bytes/s"] = np.nan
    df = df[COLS]
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    return path
