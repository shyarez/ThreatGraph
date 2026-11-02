# ThreatGraph

**Detection of Coordinated Network Intrusions Using Graph-Based Data Mining and Clustering Techniques**

ThreatGraph is a full-stack cybersecurity investigation platform. Instead of only asking *"is this flow
suspicious?"*, it asks *"which network entities are behaving together?"* It links IP addresses by shared
targets, matching ports, overlapping activity windows and similar flow behaviour, then surfaces **communities**
of related IPs that may be acting in a coordinated way, along with the evidence behind each one.

```
Network flows ─► Isolation Forest ─► DBSCAN ─► NetworkX relationship graph ─► Louvain ─► Evidence & reports
               (anomaly scores)   (behaviour   (communication + inferred      (communities,
                                   clusters)    coordination edges)            priority tiers)
```

> ThreatGraph surfaces **correlations worth investigating**, not confirmed attacks. Anomaly scores are
> Isolation Forest isolation scores and priority scores are heuristic rankings; neither is a calibrated
> probability of attack.

---

## Features

| Module | What it does |
|---|---|
| **1 · Ingestion & preprocessing** | CSV upload with validation, automatic detection of IP / port / protocol / timestamp / label columns, inf & missing-value handling, constant/duplicate column removal, dataset statistics and preview |
| **2 · Anomaly detection & clustering** | Isolation Forest anomaly scores and flags; DBSCAN behavioural clusters with automatic `eps` selection, cluster profiles and distinctive features |
| **3 · Graph & community analysis** | NetworkX graph of IPs with observed *communication* edges and inferred *coordination* edges; Louvain communities ranked by an evidence-based priority score |
| **4 · Interactive visualisation** | Dashboard, Cytoscape.js threat graph (filter by community/tier, search IPs, inspect nodes & edges), Recharts analytics |
| **5 · Investigation & reporting** | Evidence summaries per community, evaluation metrics, analyst notes, investigation history, HTML / Markdown / JSON report export |

### Evaluation metrics (computed, never hard-coded)

- **Isolation Forest:** precision, recall, F1, false-positive rate, accuracy, ROC-AUC, average precision, per-class detection rate
- **DBSCAN:** silhouette score, Davies-Bouldin index, cluster purity, noise percentage
- **Louvain:** modularity, community count & size distribution, partition coverage & performance, IP-level precision/recall of flagged communities
- **Pipeline:** processing time and peak memory (RSS) per stage

Ground-truth labels are used **only** to compute these metrics, never as inputs to detection.

### Interface

A midnight-black, space-themed UI: a twinkling starfield background, an animated landing intro (orbital rings
and a "decrypting" title, skippable with a click or key press), Orbitron/Exo 2 typography and
frosted-glass panels. All animation is disabled automatically for users who prefer reduced motion.

---

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Cytoscape.js, Recharts |
| Backend | Python, FastAPI, Uvicorn |
| Machine learning | pandas, NumPy, scikit-learn (Isolation Forest, DBSCAN, PCA) |
| Graph analysis | NetworkX (graph construction, Louvain community detection, modularity) |
| Storage | SQLite (datasets, runs, notes) + local files (uploads, run artefacts) |

## Project structure

```
ThreatGraph/
├── backend/
│   ├── app/
│   │   ├── main.py           REST API (FastAPI)
│   │   ├── config.py         paths and default pipeline parameters
│   │   ├── db.py             SQLite persistence
│   │   ├── store.py          cached loading of run artefacts
│   │   ├── sample_data.py    synthetic CIC-IDS2017-format demo data generator
│   │   └── pipeline/
│   │       ├── ingest.py     CSV reading, schema detection, profiling
│   │       ├── preprocess.py cleaning and feature preparation
│   │       ├── anomaly.py    Isolation Forest + metrics
│   │       ├── clustering.py DBSCAN + metrics + cluster profiles
│   │       ├── graph.py      NetworkX graph and coordination evidence
│   │       ├── community.py  Louvain, community analysis, priority tiers
│   │       ├── report.py     JSON / Markdown / HTML reports
│   │       └── runner.py     orchestration, timing, memory sampling
│   ├── tests/                pytest suite
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/              pages: dashboard, datasets, runs/[id], history
│       ├── components/       app shell, intro, starfield, run workspace tabs, shadcn/ui
│       └── lib/              typed API client and formatting helpers
└── start.ps1                 launches backend and frontend on Windows
```

---

## Getting started

### Requirements

- Python 3.11+ (tested on 3.14). On Windows use the `py` launcher.
- Node.js 20+ (tested on 22)

### 1. Backend setup

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
```

### 2. Frontend setup

```powershell
cd frontend
npm install
```

### 3. Run

Open **two terminals**:

```powershell
# Terminal 1: API on http://localhost:8000 (interactive docs at /docs)
cd backend
.\.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

```powershell
# Terminal 2: UI
cd frontend
npm run dev
```

Open the **Local:** URL that Next.js prints (normally http://localhost:3000; if that port is busy it uses 3001,
and the API accepts any localhost port). On Windows you can instead run `.\start.ps1` from the project root to
open both in separate windows.

To point the UI at a different API address, create `frontend/.env.local` with
`NEXT_PUBLIC_API_URL=http://host:port`.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `ModuleNotFoundError: No module named 'pandas'` | You ran the global Python. Use `.\.venv\Scripts\python ...` (or activate the venv first). |
| UI says *Cannot reach the ThreatGraph API* | The backend isn't running. Start Terminal 1 and keep it open. |
| `ENOENT ... package.json` | Run `npm run dev` **inside `frontend/`**. The project root has no `package.json`. |
| Pages return 404 on port 3000 | Another app owns port 3000. Use the URL `npm run dev` prints (e.g. 3001). |
| Pages return 500 after a build | Stop the dev server, delete `frontend/.next`, run `npm run dev` again. |

---

## Usage

1. **Datasets & Runs** → upload a CSV, or click *Generate synthetic demo dataset*.
2. Review the dataset profile (detected columns, data quality, label distribution, feature statistics).
3. Adjust pipeline parameters if needed and click **Run pipeline**. Stage-by-stage progress is shown live.
4. Explore the run workspace:
   - **Overview:** KPIs, traffic timeline, priority communities, most anomalous source IPs
   - **Anomalies:** isolation-score histogram, flag rate per label, filterable flow explorer
   - **Clusters:** PCA scatter of behaviour space, k-distance curve, cluster profiles
   - **Threat graph:** interactive network; click nodes and edges to see relationship evidence
   - **Communities:** ranked communities with evidence statements and score breakdown
   - **Evaluation:** every metric listed above, plus stage timing and memory
   - **Report & notes:** add analyst notes and export HTML (print to PDF), Markdown or JSON
5. **Investigation Log** lists every run with its parameters and headline metrics for comparison.

## Datasets

### CIC-IDS2017 (recommended)

Download the **`GeneratedLabelledFlows` / `TrafficLabelling`** CSVs from the
[Canadian Institute for Cybersecurity](https://www.unb.ca/cic/datasets/ids-2017.html). They contain
`Source IP`, `Destination IP`, `Destination Port` and `Timestamp`, which the graph stage needs.

- The `MachineLearningCVE` CSVs have **no IP columns**: anomaly detection and clustering still run, but the graph and community stages are skipped.
- Good starting files: *Wednesday* (DoS), *Friday-Afternoon-PortScan*, *Friday-Afternoon-DDoS*.
- Large files are uniformly sampled to `max_rows` (default 200,000; leave blank to use every row).

Other flow datasets (UNSW-NB15, NetFlow or Zeek exports) are recognised through column-name aliases.

### Synthetic demo data

`backend/app/sample_data.py` generates **synthetic** flows in the CIC-IDS2017 column format, including its
quirks (leading spaces in headers, day-first timestamps, inf/NaN rates). It injects four scenarios:
a 5-host coordinated port scan, an 8-bot DDoS, a 3-host SSH brute force and a single-host exfiltration.
Nothing about the results is hard-coded; the pipeline has to discover these from the flow features.

Example run with default parameters:

| Stage | Result |
|---|---|
| Isolation Forest | precision 0.91 · recall 0.52 · FPR 0.010 · ROC-AUC 0.93 |
| DBSCAN | 27 clusters · purity 0.98 · silhouette 0.27 · 4.1% noise |
| Louvain | modularity 0.13 · port-scan and DDoS groups are the two *investigate* communities |
| Performance | ~4.6 s for 14,540 flows · peak RSS ~320 MB |

The SSH brute-force flows are statistically close to normal SSH traffic and are mostly **not** flagged, a
genuine limitation of unsupervised detection on that pattern. Use real CIC-IDS2017 data for reportable results.

---

## Methods

| Stage | Details |
|---|---|
| **Preprocessing** | Identifier columns excluded from features; ±inf → missing; median imputation; constant and duplicate columns dropped; signed `log1p` transform then z-score standardisation |
| **Isolation Forest** | 200 trees; `contamination` sets the threshold. Score s(x, n) ∈ (0, 1] from Liu et al. (2008): a ranking, not a probability |
| **DBSCAN** | Fitted in PCA space on a random sample, with identical points collapsed via `sample_weight`. `eps` comes from the k-distance knee unless set manually. Remaining flows are assigned to the nearest core point within `eps`, otherwise noise |
| **Graph** | Nodes are IPs. *Communication* edges come from observed flows (weight = log1p(flows) · (1 + flagged share)). *Coordination* edges link suspicious sources (≥ N flagged flows), scored as 0.35·destination Jaccard + 0.20·port Jaccard + 0.20·temporal overlap + 0.25·behavioural similarity, and only kept when there is a shared-target signal |
| **Louvain** | `networkx.community.louvain_communities` on the weighted graph; modularity, coverage and performance reported |
| **Priority score** | 0.35·anomalous share of member flows + 0.35·coordinated sources (÷3, capped) + 0.15·temporal concentration + 0.15·behavioural homogeneity → **investigate / monitor / low** |

## API overview

Interactive documentation: http://localhost:8000/docs

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/datasets` | Upload and validate a CSV |
| `POST` | `/api/datasets/sample` | Generate the synthetic demo dataset |
| `GET` | `/api/datasets`, `/api/datasets/{id}`, `/api/datasets/{id}/preview` | List, profile and preview datasets |
| `POST` | `/api/runs` | Start a pipeline run |
| `GET` | `/api/runs/{id}`, `/api/runs/{id}/results` | Run status and full results |
| `GET` | `/api/runs/{id}/flows` | Paginated, filterable flows |
| `GET` | `/api/runs/{id}/graph` | Graph subset with layout for Cytoscape |
| `GET` | `/api/runs/{id}/nodes/{ip}`, `/api/runs/{id}/edges` | Node and edge evidence |
| `GET` | `/api/runs/{id}/communities/{cid}` | Community detail and coordination pairs |
| `GET` | `/api/runs/{id}/report?format=html\|md\|json` | Export the investigation report |
| `GET/POST` | `/api/runs/{id}/notes` | Analyst notes |

## Testing

```powershell
cd backend
.\.venv\Scripts\python -m pytest -q
```

17 tests cover schema detection, cleaning, Isolation Forest and DBSCAN on controlled data, coordination
evidence, Louvain grouping, the full pipeline, datasets without IP columns, and every API endpoint.

Frontend checks:

```powershell
cd frontend
npx tsc --noEmit
npx eslint src
```
