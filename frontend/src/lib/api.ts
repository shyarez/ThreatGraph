export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Profile = {
  rows: number;
  columns: number;
  column_names: string[];
  roles: Record<string, string>;
  feature_columns: string[];
  n_features: number;
  constant_features: string[];
  missing_values: number;
  infinite_values: number;
  duplicate_rows: number | null;
  graph_capable: boolean;
  has_labels: boolean;
  has_timestamps: boolean;
  warnings: string[];
  errors: string[];
  valid: boolean;
  unique_src_ips?: number;
  unique_dst_ips?: number;
  top_dst_ports?: { port: string; count: number }[];
  protocols?: { protocol: string; count: number }[];
  label_distribution?: { label: string; count: number }[];
  attack_fraction?: number;
  time_start?: string;
  time_end?: string;
  timestamp_parse_rate?: number;
  feature_stats?: { feature: string; mean: number | null; std: number | null; min: number | null; median: number | null; max: number | null }[];
};

export type Dataset = {
  id: string;
  name: string;
  filename: string;
  path: string;
  size_bytes: number;
  created_at: string;
  profile: Profile;
};

export type Params = {
  max_rows: number | null;
  random_state: number;
  if_n_estimators: number;
  if_contamination: number | "auto";
  dbscan_eps: number | null;
  dbscan_min_samples: number;
  dbscan_sample_size: number;
  pca_components: number;
  min_anomalous_flows: number;
  max_suspicious_sources: number;
  coordination_threshold: number;
  temporal_tolerance_minutes: number;
  louvain_resolution: number;
};

export type RunSummary = {
  rows: number;
  features: number;
  flagged: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  false_positive_rate: number | null;
  n_clusters: number;
  noise_percentage: number;
  silhouette: number | null;
  graph_available: boolean;
  nodes: number | null;
  edges: number | null;
  coordination_edges: number | null;
  modularity: number | null;
  n_communities: number | null;
  investigate: number | null;
  monitor: number | null;
  total_seconds: number;
  peak_rss_mb: number;
};

export type Run = {
  id: string;
  dataset_id: string;
  dataset_name: string | null;
  params: Params;
  status: "queued" | "running" | "completed" | "failed";
  stage: string | null;
  progress: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  summary: RunSummary | null;
  stages?: { key: string; title: string }[];
};

export type Tier = "investigate" | "monitor" | "low";

export type CoordinationEvidence = {
  score: number;
  destination_jaccard: number;
  shared_destinations: string[];
  shared_destination_count: number;
  port_jaccard: number;
  shared_ports: number[];
  temporal_overlap: number | null;
  overlap_window: [string, string] | null;
  behaviour_similarity: number;
  cluster_cosine: number;
  profile_cosine: number;
  shared_clusters: number[];
};

export type Community = {
  id: number;
  size: number;
  members: string[];
  internal_edges: number;
  density: number;
  internal_flows: number;
  flows_from_members: number;
  anomalous_flows: number;
  anomaly_rate: number;
  mean_anomaly_score: number | null;
  suspicious_sources: string[];
  coordinated_sources: string[];
  coordination_edges: number;
  mean_coordination_score: number | null;
  shared_targets: { ip: string; anomalous_flows: number; member_sources: number; ports: number[] }[];
  top_ports: { port: number; flows: number }[];
  anomalous_window: { start: string; end: string; minutes: number } | null;
  temporal_concentration: number;
  dominant_cluster: number | null;
  behavioural_homogeneity: number;
  noise_share: number;
  priority_score: number;
  score_components: Record<string, number>;
  tier: Tier;
  ground_truth_labels?: { label: string; count: number }[];
  evidence: string[];
};

export type CommunityDetail = Community & {
  member_details: { ip: string; flows: number; anomalous_flows: number; anomaly_rate: number; suspicious: boolean; degree: number }[];
  coordination_pairs: (CoordinationEvidence & { source: string; target: string })[];
};

export type ClusterProfile = {
  cluster: number;
  is_noise: boolean;
  size: number;
  share: number;
  anomalous_flows: number;
  anomaly_rate: number;
  mean_anomaly_score: number;
  distinctive_features: { feature: string; z: number }[];
  unique_src_ips: number | null;
  unique_dst_ips: number | null;
  top_dst_ports: number[];
  label_composition?: { label: string; count: number }[];
  majority_label?: string | null;
};

export type Results = {
  run_id: string;
  params: Params;
  preprocessing: {
    input_rows: number;
    sampled_rows?: number;
    sampling?: string;
    rows_analysed: number;
    features_used: number;
    infinite_values_replaced: number;
    missing_values_imputed: number;
    dropped_columns: { all_missing: string[]; constant: string[]; duplicate: string[] };
    transform: string;
    feature_names: string[];
    roles: Record<string, string>;
  };
  anomaly: {
    flagged: number;
    flagged_fraction: number;
    threshold: number;
    has_labels: boolean;
    score_hist: { bin: number; benign?: number; attack?: number; count?: number }[];
    evaluated_flows?: number;
    attack_fraction?: number;
    confusion_matrix?: { tp: number; fp: number; tn: number; fn: number };
    precision?: number;
    recall?: number;
    f1?: number;
    false_positive_rate?: number | null;
    accuracy?: number;
    roc_auc?: number;
    average_precision?: number;
    per_label?: { label: string; flows: number; flagged: number; flag_rate: number; mean_score: number }[];
  };
  clustering: {
    n_clusters: number;
    noise_points: number;
    noise_percentage: number;
    sample_size: number;
    sample_noise_percentage: number;
    silhouette: number | null;
    davies_bouldin: number | null;
    purity: number | null;
    silhouette_note?: string;
    purity_note?: string;
    eps: number;
    eps_estimated: boolean;
    min_samples: number;
    pca_components: number;
    pca_explained_variance: number;
    unique_sample_points: number;
    kdist_curve: { rank: number; k_distance: number }[];
  };
  clusters: ClusterProfile[];
  projection: { x: number; y: number; cluster: number; anomaly: boolean; label: string | null }[];
  graph: {
    available: boolean;
    reason?: string;
    nodes?: number;
    edges?: number;
    communication_edges?: number;
    coordination_edges?: number;
    suspicious_sources?: number;
    coordination_pairs_evaluated?: number;
    density?: number;
    connected_components?: number;
    mean_degree?: number;
    max_degree?: number;
    evidence_weights?: Record<string, number>;
    has_timestamps?: boolean;
  };
  community_stats: {
    modularity: number | null;
    n_communities: number;
    non_singleton_communities?: number;
    largest_community?: number;
    mean_community_size?: number;
    median_community_size?: number;
    size_distribution?: { size: string; communities: number }[];
    coverage?: number;
    performance?: number;
    resolution?: number;
    tiers?: Record<Tier, number>;
  } | null;
  communities: Community[];
  graph_evaluation: {
    attack_source_ips: number;
    source_ips: number;
    investigate: { flagged_source_ips: number; precision: number | null; recall: number | null };
    investigate_or_monitor: { flagged_source_ips: number; precision: number | null; recall: number | null };
    note: string;
  } | null;
  timeline: { time: string; flows: number; anomalous: number; attacks?: number }[];
  top_anomalous_ips: { ip: string; flows: number; anomalous: number; anomaly_rate: number; max_score: number; targets: number }[];
  performance: {
    total_seconds: number;
    rows_per_second: number | null;
    stages: { stage: string; title: string; seconds: number; peak_rss_mb: number }[];
    peak_rss_mb: number;
    baseline_rss_mb: number;
  };
};

export type FlowRow = {
  row: number;
  src_ip: string | null;
  dst_ip: string | null;
  src_port: number;
  dst_port: number;
  protocol: number;
  timestamp: string | null;
  label: string | null;
  score: number;
  is_anomaly: boolean;
  cluster: number;
};

export type GraphPayload = {
  nodes: {
    data: {
      id: string; label: string; community: number; tier: Tier; flows: number; anomalous_flows: number;
      anomaly_rate: number; max_score: number; suspicious: boolean; degree: number;
    };
    position: { x: number; y: number };
  }[];
  edges: {
    data: {
      id: string; source: string; target: string; kind: "communication" | "coordination"; kinds: string[];
      weight: number; flows: number; anomalous_flows: number; coordination_score: number | null;
    };
  }[];
  total_candidates: number;
  shown: number;
  total_nodes: number;
  total_edges: number;
};

export type NodeDetail = {
  ip: string;
  flows: number;
  out_flows: number;
  in_flows: number;
  anomalous_flows: number;
  out_anomalous: number;
  in_anomalous: number;
  anomaly_rate: number;
  max_score: number;
  suspicious: boolean;
  community: number;
  tier: Tier;
  degree: number;
  top_destinations: { ip: string; flows: number; anomalous: number }[];
  top_sources: { ip: string; flows: number; anomalous: number }[];
  top_dst_ports: { port: number; flows: number }[];
  clusters: { cluster: number; flows: number }[];
  labels: { label: string; count: number }[] | null;
  first_seen: string | null;
  last_seen: string | null;
  coordination: (CoordinationEvidence & { peer: string })[];
  community_summary: { id: number; size: number; tier: Tier; priority_score: number; evidence: string[] } | null;
};

export type EdgeDetail = {
  source: string;
  target: string;
  kinds: string[];
  flows: number;
  anomalous_flows: number;
  mean_score?: number;
  max_score?: number;
  ports?: number[];
  first_seen?: string | null;
  last_seen?: string | null;
  weight: number;
  coordination?: CoordinationEvidence;
};

export type Note = {
  id: string;
  run_id: string;
  target_type: "run" | "community" | "node";
  target_id: string | null;
  text: string;
  created_at: string;
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new ApiError(0, `Cannot reach the ThreatGraph API at ${API_URL}. Is the backend running?`);
  }
  if (!res.ok) {
    let detail: unknown = undefined;
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail = body.detail;
      if (typeof body.detail === "string") message = body.detail;
      else if (body.detail?.message) message = body.detail.message;
      else if (Array.isArray(body.detail)) message = body.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, detail);
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
}

export const api = {
  health: () => request<{ status: string }>("/api/health"),
  defaults: () => request<Params>("/api/params/defaults"),
  datasets: () => request<Dataset[]>("/api/datasets"),
  dataset: (id: string) => request<Dataset>(`/api/datasets/${id}`),
  preview: (id: string) => request<{ columns: string[]; rows: unknown[][] }>(`/api/datasets/${id}/preview`),
  upload: (file: File, name?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (name) fd.append("name", name);
    return request<Dataset>("/api/datasets", { method: "POST", body: fd });
  },
  sample: (n_benign = 12000) => request<Dataset>("/api/datasets/sample", json({ n_benign })),
  deleteDataset: (id: string) => request(`/api/datasets/${id}`, { method: "DELETE" }),
  runs: (dataset_id?: string) => request<Run[]>(`/api/runs${qs({ dataset_id })}`),
  run: (id: string) => request<Run>(`/api/runs/${id}`),
  startRun: (dataset_id: string, params: Partial<Params>) => request<Run>("/api/runs", json({ dataset_id, params })),
  deleteRun: (id: string) => request(`/api/runs/${id}`, { method: "DELETE" }),
  results: (id: string) => request<Results>(`/api/runs/${id}/results`),
  flows: (id: string, p: Record<string, string | number | boolean | null | undefined>) =>
    request<{ total: number; page: number; page_size: number; rows: FlowRow[] }>(`/api/runs/${id}/flows${qs(p)}`),
  graph: (id: string, p: { community?: number | null; max_nodes?: number; tier?: string | null }) =>
    request<GraphPayload>(`/api/runs/${id}/graph${qs(p)}`),
  node: (id: string, ip: string) => request<NodeDetail>(`/api/runs/${id}/nodes/${encodeURIComponent(ip)}`),
  edge: (id: string, source: string, target: string) =>
    request<EdgeDetail>(`/api/runs/${id}/edges${qs({ source, target })}`),
  community: (id: string, cid: number) => request<CommunityDetail>(`/api/runs/${id}/communities/${cid}`),
  notes: (id: string) => request<Note[]>(`/api/runs/${id}/notes`),
  addNote: (id: string, note: { target_type: string; target_id?: string | null; text: string }) =>
    request<Note>(`/api/runs/${id}/notes`, json(note)),
  deleteNote: (noteId: string) => request(`/api/notes/${noteId}`, { method: "DELETE" }),
  reportUrl: (id: string, format: "json" | "md" | "html") => `${API_URL}/api/runs/${id}/report?format=${format}`,
};
