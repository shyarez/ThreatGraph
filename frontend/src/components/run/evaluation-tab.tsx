"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Callout } from "@/components/common";
import type { Results } from "@/lib/api";
import { fmtInt, fmtNum, fmtPct } from "@/lib/format";
import { AXIS, COLORS, GRID, TOOLTIP } from "./chart-theme";

function MetricTable({ rows }: { rows: [string, React.ReactNode, string?][] }) {
  return (
    <Table>
      <TableBody>
        {rows.map(([k, v, note]) => (
          <TableRow key={k}>
            <TableCell className="text-muted-foreground">{k}{note && <div className="text-[11px]">{note}</div>}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">{v}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function EvaluationTab({ results }: { results: Results }) {
  const a = results.anomaly;
  const c = results.clustering;
  const cs = results.community_stats;
  const ge = results.graph_evaluation;
  const p = results.performance;
  const cm = a.confusion_matrix;

  return (
    <div className="flex flex-col gap-4">
      <Callout>
        All values below are computed from this run. Precision, recall, purity and IP-level checks compare outputs with the dataset&apos;s
        ground-truth labels, which are never used as inputs to detection.
      </Callout>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Isolation Forest</CardTitle><CardDescription>Flow-level detection against labels</CardDescription></CardHeader>
          <CardContent>
            {a.has_labels ? (
              <>
                <MetricTable rows={[
                  ["Precision", fmtNum(a.precision)],
                  ["Recall (detection rate)", fmtNum(a.recall)],
                  ["F1-score", fmtNum(a.f1)],
                  ["False positive rate", fmtNum(a.false_positive_rate, 4)],
                  ["Accuracy", fmtNum(a.accuracy)],
                  ["ROC-AUC", fmtNum(a.roc_auc), "threshold-free, from isolation scores"],
                  ["Average precision", fmtNum(a.average_precision)],
                  ["Attack share in data", fmtPct(a.attack_fraction)],
                ]} />
                {cm && (
                  <div className="mt-4 grid grid-cols-[auto_1fr_1fr] gap-1 text-center text-xs">
                    <div />
                    <div className="text-muted-foreground">Pred. anomaly</div>
                    <div className="text-muted-foreground">Pred. normal</div>
                    <div className="pr-2 text-right text-muted-foreground">Attack</div>
                    <div className="rounded bg-emerald-950 p-2 tabular-nums">TP {fmtInt(cm.tp)}</div>
                    <div className="rounded bg-red-950 p-2 tabular-nums">FN {fmtInt(cm.fn)}</div>
                    <div className="pr-2 text-right text-muted-foreground">Benign</div>
                    <div className="rounded bg-amber-950 p-2 tabular-nums">FP {fmtInt(cm.fp)}</div>
                    <div className="rounded bg-slate-800 p-2 tabular-nums">TN {fmtInt(cm.tn)}</div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No labels in dataset — supervised metrics unavailable. {fmtInt(a.flagged)} flows flagged.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>DBSCAN</CardTitle><CardDescription>Cluster quality</CardDescription></CardHeader>
          <CardContent>
            <MetricTable rows={[
              ["Silhouette score", fmtNum(c.silhouette), c.silhouette_note],
              ["Davies-Bouldin index", fmtNum(c.davies_bouldin)],
              ["Cluster purity", fmtNum(c.purity), c.purity_note],
              ["Noise percentage", `${fmtNum(c.noise_percentage, 2)}%`],
              ["Clusters found", c.n_clusters],
              ["eps / min_samples", `${fmtNum(c.eps)} / ${c.min_samples}`],
              ["Fit sample (unique points)", `${fmtInt(c.sample_size)} (${fmtInt(c.unique_sample_points)})`],
            ]} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Louvain</CardTitle><CardDescription>Community structure of the relationship graph</CardDescription></CardHeader>
          <CardContent>
            {cs ? (
              <MetricTable rows={[
                ["Modularity (Q)", fmtNum(cs.modularity)],
                ["Communities", fmtInt(cs.n_communities)],
                ["Non-singleton communities", fmtInt(cs.non_singleton_communities)],
                ["Largest / median size", `${fmtInt(cs.largest_community)} / ${fmtNum(cs.median_community_size, 1)}`],
                ["Partition coverage", fmtNum(cs.coverage)],
                ["Partition performance", fmtNum(cs.performance)],
                ["Tiers (investigate / monitor / low)", `${cs.tiers?.investigate ?? 0} / ${cs.tiers?.monitor ?? 0} / ${cs.tiers?.low ?? 0}`],
              ]} />
            ) : <p className="text-sm text-muted-foreground">{results.graph.reason}</p>}
            {ge && (
              <div className="mt-4">
                <div className="mb-1 text-sm font-medium">IP-level check against labels</div>
                <MetricTable rows={[
                  ["Attack-source IPs in data", fmtInt(ge.attack_source_ips)],
                  ["Investigate tier: precision / recall", `${fmtNum(ge.investigate.precision)} / ${fmtNum(ge.investigate.recall)}`],
                  ["Investigate + monitor: precision / recall", `${fmtNum(ge.investigate_or_monitor.precision)} / ${fmtNum(ge.investigate_or_monitor.recall)}`],
                ]} />
                <p className="mt-2 text-[11px] text-muted-foreground">{ge.note}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline performance</CardTitle>
            <CardDescription>
              Total {p.total_seconds.toFixed(2)} s · {p.rows_per_second ? `${fmtInt(Math.round(p.rows_per_second))} flows/s` : ""} · peak RSS {p.peak_rss_mb.toFixed(0)} MB
              (baseline {p.baseline_rss_mb.toFixed(0)} MB)
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <BarChart data={p.stages} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid {...GRID} />
                <XAxis type="number" {...AXIS} unit=" s" />
                <YAxis type="category" dataKey="stage" width={80} {...AXIS} />
                <Tooltip {...TOOLTIP} formatter={(v: number) => `${v.toFixed(3)} s`} />
                <Bar dataKey="seconds" fill={COLORS.benign} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Stage memory</CardTitle><CardDescription>Peak process resident memory sampled during each stage</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Stage</TableHead><TableHead className="text-right">Seconds</TableHead><TableHead className="text-right">Peak RSS (MB)</TableHead></TableRow></TableHeader>
              <TableBody>
                {p.stages.map((s) => (
                  <TableRow key={s.stage}>
                    <TableCell>{s.title}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.seconds.toFixed(3)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.peak_rss_mb.toFixed(0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {cs?.size_distribution && (
        <Card>
          <CardHeader><CardTitle>Community size distribution</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer>
              <BarChart data={cs.size_distribution}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="size" {...AXIS} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip {...TOOLTIP} />
                <Bar dataKey="communities" fill="#9fc3e6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
