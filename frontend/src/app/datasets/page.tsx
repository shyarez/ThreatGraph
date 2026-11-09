"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Beaker, FileUp, Loader2, Network, Play, ScanSearch, Sparkles, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Callout, Empty, PageHeader, Stat } from "@/components/common";
import { RunStatusBadge } from "@/components/run-status";
import { api, type Dataset, type Params, type Run } from "@/lib/api";
import { fmtBytes, fmtDate, fmtInt, fmtNum, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const load = useCallback(async () => {
    try {
      const ds = await api.datasets();
      setDatasets(ds);
      setSelected((s) => s ?? ds[0]?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(fileList: FileList | null | undefined) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setBusy(files.length > 1 ? `upload:${files.length}` : "upload");
    setError(null);
    try {
      const ds = await api.upload(files);
      await load();
      setSelected(ds.id);
    } catch (e) {
      const err = e as Error & { detail?: { errors?: string[] } };
      setError([err.message, ...(err.detail?.errors ?? [])].join(" — "));
    } finally {
      setBusy(null);
    }
  }

  async function sample() {
    setBusy("sample");
    setError(null);
    try {
      const ds = await api.sample();
      await load();
      setSelected(ds.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this dataset and all of its runs?")) return;
    await api.deleteDataset(id);
    setSelected(null);
    load();
  }

  const ds = datasets.find((d) => d.id === selected) ?? null;

  return (
    <>
      <PageHeader
        title="Datasets & Runs"
        description="Upload labelled network-flow CSVs (CIC-IDS2017 TrafficLabelling format recommended), inspect them, and run the ThreatGraph pipeline."
      />
      {error && <Callout tone="error" className="mb-4">{error}</Callout>}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Add dataset</CardTitle>
              <CardDescription>CSV or Parquet with flow features; select several files with the same columns to merge them. IP and timestamp columns enable graph analysis.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  upload(e.dataTransfer.files);
                }}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm transition-colors",
                  dragging ? "border-sky-400 bg-sky-950/30" : "hover:bg-accent/40",
                )}
              >
                {busy?.startsWith("upload") ? <Loader2 className="size-6 animate-spin" /> : <FileUp className="size-6 text-sky-400" />}
                <div>
                  {busy === "upload"
                    ? "Uploading & validating…"
                    : busy?.startsWith("upload:")
                      ? `Uploading & merging ${busy.split(":")[1]} files…`
                      : "Drop CSV or Parquet files here or click to browse"}
                </div>
                <div className="text-xs text-muted-foreground">Select several files to merge them into one dataset</div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.parquet,.pq"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    upload(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
              <Button variant="outline" onClick={sample} disabled={!!busy}>
                {busy === "sample" ? <Loader2 className="animate-spin" /> : <Beaker />}
                Generate synthetic demo dataset
              </Button>
              <p className="text-xs text-muted-foreground">
                The demo generator creates <strong>synthetic</strong> flows in the CIC-IDS2017 column format with injected
                port-scan, DDoS, SSH brute-force and exfiltration scenarios. Use real CIC-IDS2017 files for evaluation.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Datasets</CardTitle>
              <CardDescription>{datasets.length} uploaded</CardDescription>
            </CardHeader>
            <CardContent className="flex max-h-[38vh] flex-col gap-2 overflow-y-auto">
              {datasets.length === 0 && <Empty>No datasets yet.</Empty>}
              {datasets.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelected(d.id)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    d.id === selected ? "border-sky-500 bg-sky-950/30" : "hover:bg-accent/40",
                  )}
                >
                  <div className="truncate font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtInt(d.profile.rows)} rows · {fmtBytes(d.size_bytes)} · {fmtDate(d.created_at)}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {ds ? <DatasetDetail key={ds.id} ds={ds} onDelete={() => remove(ds.id)} /> : <Empty>Select or add a dataset.</Empty>}
        </div>
      </div>
    </>
  );
}

function DatasetDetail({ ds, onDelete }: { ds: Dataset; onDelete: () => void }) {
  const p = ds.profile;
  const [preview, setPreview] = useState<{ columns: string[]; rows: unknown[][] } | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    api.preview(ds.id).then(setPreview).catch(() => setPreview(null));
    api.runs(ds.id).then(setRuns).catch(() => setRuns([]));
  }, [ds.id]);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-lg">{ds.name}</CardTitle>
            <CardDescription>{ds.filename}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 /> Delete
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Rows" value={fmtInt(p.rows)} />
            <Stat label="Numeric features" value={p.n_features} hint={`${p.columns} columns total`} />
            <Stat label="Source / dest IPs" value={p.graph_capable ? `${fmtInt(p.unique_src_ips)} / ${fmtInt(p.unique_dst_ips)}` : "—"} />
            <Stat label="Attack share (labels)" value={p.has_labels ? fmtPct(p.attack_fraction) : "—"} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(p.roles).map(([role, col]) => (
              <Badge key={role} variant="secondary">
                {role}: <span className="font-mono">{col}</span>
              </Badge>
            ))}
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
            <div>Missing values: <span className="text-foreground">{fmtInt(p.missing_values)}</span></div>
            <div>Infinite values: <span className="text-foreground">{fmtInt(p.infinite_values)}</span></div>
            <div>Duplicate rows: <span className="text-foreground">{fmtInt(p.duplicate_rows)}</span></div>
            {p.time_start && <div className="md:col-span-3">Time range: <span className="text-foreground">{fmtDate(p.time_start)} → {fmtDate(p.time_end)}</span></div>}
          </div>
          {p.warnings.map((w) => (
            <Callout key={w} tone="warn">{w}</Callout>
          ))}
        </CardContent>
      </Card>

      <RunConfig ds={ds} />

      {runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Runs on this dataset</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead><TableHead>Status</TableHead><TableHead>Started</TableHead>
                  <TableHead className="text-right">Flagged</TableHead><TableHead className="text-right">F1</TableHead>
                  <TableHead className="text-right">Investigate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Link className="font-mono text-sky-400 hover:underline" href={`/runs/${r.id}`}>{r.id}</Link></TableCell>
                    <TableCell><RunStatusBadge status={r.status} /></TableCell>
                    <TableCell>{fmtDate(r.created_at)}</TableCell>
                    <TableCell className="text-right">{fmtInt(r.summary?.flagged)}</TableCell>
                    <TableCell className="text-right">{fmtNum(r.summary?.f1)}</TableCell>
                    <TableCell className="text-right">{fmtInt(r.summary?.investigate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {p.label_distribution && (
          <Card className={cn(!p.feature_stats && "xl:col-span-2")}>
            <CardHeader><CardTitle>Ground-truth label distribution</CardTitle><CardDescription>Used only for evaluation, never for detection.</CardDescription></CardHeader>
            <CardContent className="min-h-64 flex-1">
              <ResponsiveContainer width="100%" height="100%" minHeight={256}>
                <BarChart data={p.label_distribution.slice(0, 12)} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,170,200,0.14)" />
                  <XAxis type="number" scale="log" domain={[1, "auto"]} allowDataOverflow stroke="#94a3b8" fontSize={11} />
                  <YAxis type="category" dataKey="label" width={110} stroke="#94a3b8" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#0e121c", border: "1px solid rgba(110,160,210,0.5)" }} />
                  <Bar dataKey="count" fill="#5ce1e6" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {p.feature_stats && (
          <Card className={cn(!p.label_distribution && "xl:col-span-2")}>
            <CardHeader><CardTitle>Key feature statistics</CardTitle><CardDescription>Raw values before cleaning and scaling.</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Feature</TableHead><TableHead className="text-right">Mean</TableHead><TableHead className="text-right">Median</TableHead><TableHead className="text-right">Max</TableHead></TableRow></TableHeader>
                <TableBody>
                  {p.feature_stats.map((f) => (
                    <TableRow key={f.feature}>
                      <TableCell className="max-w-[180px] truncate">{f.feature}</TableCell>
                      <TableCell className="text-right tabular-nums">{compact(f.mean)}</TableCell>
                      <TableCell className="text-right tabular-nums">{compact(f.median)}</TableCell>
                      <TableCell className="text-right tabular-nums">{compact(f.max)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {preview && (
        <Card>
          <CardHeader><CardTitle>Preview (first {preview.rows.length} rows)</CardTitle></CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr>{preview.columns.map((c) => <th key={c} className="whitespace-nowrap border-b px-2 py-1 text-left font-medium">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className="odd:bg-muted/30">
                      {r.map((v, j) => <td key={j} className="whitespace-nowrap px-2 py-1 font-mono">{v == null ? "" : String(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

const compact = (v: number | null) =>
  v == null ? "—" : Math.abs(v) >= 1e5 ? v.toExponential(2) : v.toLocaleString(undefined, { maximumFractionDigits: 2 });

type FieldDef = { key: keyof Params; label: string; hint: string; step?: string };
const FIELDS: { group: string; icon: typeof Play; fields: FieldDef[] }[] = [
  {
    group: "Data & Isolation Forest",
    icon: ScanSearch,
    fields: [
      { key: "max_rows", label: "Max rows", hint: "Sample cap · blank = all" },
      { key: "random_state", label: "Random seed", hint: "Same seed = same result" },
      { key: "if_contamination", label: "Contamination", hint: "Anomaly share (0–0.5] or auto", step: "0.01" },
      { key: "if_n_estimators", label: "Trees", hint: "Isolation trees" },
    ],
  },
  {
    group: "DBSCAN clustering",
    icon: Sparkles,
    fields: [
      { key: "dbscan_eps", label: "eps", hint: "Blank = k-distance knee", step: "0.01" },
      { key: "dbscan_min_samples", label: "min_samples", hint: "Core neighbourhood size" },
      { key: "dbscan_sample_size", label: "Fit sample size", hint: "Flows used to fit" },
      { key: "pca_components", label: "PCA components", hint: "Dimensions before clustering" },
    ],
  },
  {
    group: "Graph & Louvain",
    icon: Network,
    fields: [
      { key: "min_anomalous_flows", label: "Min flagged flows", hint: "To mark a source suspicious" },
      { key: "coordination_threshold", label: "Coordination threshold", hint: "Min edge evidence score", step: "0.05" },
      { key: "temporal_tolerance_minutes", label: "Time tolerance (min)", hint: "Window padding" },
      { key: "louvain_resolution", label: "Louvain resolution", hint: ">1 = smaller communities", step: "0.1" },
    ],
  },
];

function RunConfig({ ds }: { ds: Dataset }) {
  const router = useRouter();
  const [params, setParams] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.defaults().then((d) => {
      const p: Record<string, string> = {};
      for (const [k, v] of Object.entries(d)) p[k] = v == null ? "" : String(v);
      setParams(p);
    });
  }, []);

  async function start() {
    setStarting(true);
    setError(null);
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === "") body[k] = null;
      else if (k === "if_contamination" && v === "auto") body[k] = "auto";
      else body[k] = Number(v);
    }
    try {
      const run = await api.startRun(ds.id, body as Partial<Params>);
      router.push(`/runs/${run.id}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Run the ThreatGraph pipeline</CardTitle>
          <CardDescription>Preprocess → Isolation Forest → DBSCAN → NetworkX graph → Louvain → evidence.</CardDescription>
        </div>
        <Button onClick={start} disabled={starting || !ds.profile.valid}>
          {starting ? <Loader2 className="animate-spin" /> : <Play />} Run pipeline
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Callout tone="error">{error}</Callout>}
        <div className="grid gap-4 md:grid-cols-3">
          {FIELDS.map((g) => (
            <div key={g.group} className="flex flex-col gap-3 rounded-lg border bg-black/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <g.icon className="size-4 text-[#7dd3fc]" /> {g.group}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {g.fields.map((f) => (
                <div key={f.key} className="flex min-w-0 flex-col gap-1">
                  <Label htmlFor={f.key} className="truncate text-xs" title={f.label}>{f.label}</Label>
                  <Input
                    id={f.key}
                    value={params[f.key] ?? ""}
                    step={f.step}
                    onChange={(e) => setParams((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="h-8"
                  />
                  <span className="truncate text-[11px] text-muted-foreground" title={f.hint}>{f.hint}</span>
                </div>
              ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
