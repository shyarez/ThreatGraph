"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Meter, Stat } from "@/components/common";
import type { Results } from "@/lib/api";
import { colorFor, fmtInt, fmtNum, fmtPct } from "@/lib/format";
import { AXIS, COLORS, GRID, TOOLTIP } from "./chart-theme";

export function ClustersTab({ results }: { results: Results }) {
  const c = results.clustering;
  const [colorBy, setColorBy] = useState<"cluster" | "anomaly">("cluster");

  const series = useMemo(() => {
    const pts = results.projection;
    if (colorBy === "anomaly") {
      return [
        { name: "Normal", color: "#475569", data: pts.filter((p) => !p.anomaly) },
        { name: "Flagged", color: COLORS.anomaly, data: pts.filter((p) => p.anomaly) },
      ];
    }
    const groups = new Map<number, typeof pts>();
    for (const p of pts) groups.set(p.cluster, [...(groups.get(p.cluster) ?? []), p]);
    return [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([k, data]) => ({ name: k === -1 ? "Noise" : `Cluster ${k}`, color: colorFor(k), data }));
  }, [results.projection, colorBy]);

  const clusters = [...results.clusters].sort((a, b) => b.anomaly_rate - a.anomaly_rate || b.size - a.size);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Clusters" value={c.n_clusters} />
        <Stat label="Noise" value={`${fmtNum(c.noise_percentage, 1)}%`} hint={`${fmtInt(c.noise_points)} flows`} />
        <Stat label="Silhouette" value={fmtNum(c.silhouette)} hint="−1 … 1, higher is better" />
        <Stat label="Davies-Bouldin" value={fmtNum(c.davies_bouldin)} hint="lower is better" />
        <Stat label="Purity (labels)" value={fmtNum(c.purity)} />
        <Stat label="eps" value={fmtNum(c.eps)} hint={`${c.eps_estimated ? "k-distance knee" : "user-set"} · min_samples ${c.min_samples}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Behavioural space (PCA 1 × PCA 2)</CardTitle>
              <CardDescription>
                {fmtInt(results.projection.length)} sampled flows. DBSCAN ran in {c.pca_components}-D PCA space
                ({fmtPct(c.pca_explained_variance)} variance) on {fmtInt(c.sample_size)} flows; the rest were assigned to their nearest core point.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="colorby" checked={colorBy === "anomaly"} onCheckedChange={(v) => setColorBy(v ? "anomaly" : "cluster")} />
              <Label htmlFor="colorby" className="text-xs">Colour by flag</Label>
            </div>
          </CardHeader>
          <CardContent className="h-[420px]">
            <ResponsiveContainer>
              <ScatterChart>
                <CartesianGrid {...GRID} />
                <XAxis type="number" dataKey="x" name="PC1" {...AXIS} />
                <YAxis type="number" dataKey="y" name="PC2" {...AXIS} />
                <ZAxis range={[14, 14]} />
                <Tooltip {...TOOLTIP} cursor={false}
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload as Results["projection"][number] | undefined;
                    if (!p) return null;
                    return (
                      <div className="rounded border border-[#6b8bb3]/50 bg-[#0e121c] p-2 text-xs">
                        <div>Cluster: {p.cluster === -1 ? "noise" : p.cluster}</div>
                        <div>Flagged: {p.anomaly ? "yes" : "no"}</div>
                        {p.label && <div>Label: {p.label}</div>}
                      </div>
                    );
                  }}
                />
                {series.map((s) => (
                  <Scatter key={s.name} name={s.name} data={s.data} fill={s.color} fillOpacity={0.7} isAnimationActive={false} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        {c.kdist_curve.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>k-distance curve</CardTitle>
              <CardDescription>Sorted distance to the {c.min_samples}-th neighbour; eps chosen at the knee.</CardDescription>
            </CardHeader>
            <CardContent className="h-[420px]">
              <ResponsiveContainer>
                <LineChart data={c.kdist_curve}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="rank" {...AXIS} />
                  <YAxis {...AXIS} />
                  <Tooltip {...TOOLTIP} />
                  <ReferenceLine y={c.eps} stroke={COLORS.anomaly} strokeDasharray="4 2" label={{ value: `eps ${c.eps.toFixed(2)}`, fill: COLORS.anomaly, fontSize: 11 }} />
                  <Line type="monotone" dataKey="k_distance" stroke={COLORS.benign} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cluster profiles</CardTitle>
          <CardDescription>Distinctive features are the largest mean z-scores (after log transform) relative to all flows.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cluster</TableHead><TableHead className="text-right">Flows</TableHead><TableHead className="w-40">Flag rate</TableHead>
                <TableHead>Distinctive features</TableHead><TableHead>Ports</TableHead><TableHead className="text-right">Src / dst IPs</TableHead>
                {results.anomaly.has_labels && <TableHead>Majority label (eval)</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {clusters.map((k) => (
                <TableRow key={k.cluster}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: colorFor(k.cluster) }} />
                      {k.is_noise ? "Noise" : k.cluster}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(k.size)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Meter value={k.anomaly_rate} color={COLORS.anomaly} />
                      <span className="w-10 text-right text-xs tabular-nums">{fmtPct(k.anomaly_rate, 0)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[360px] text-xs">
                    {k.distinctive_features.slice(0, 3).map((f) => (
                      <span key={f.feature} className="mr-2 inline-block">
                        {f.feature.trim()} <span className={f.z > 0 ? "text-amber-300" : "text-sky-300"}>{f.z > 0 ? "+" : ""}{f.z.toFixed(1)}σ</span>
                      </span>
                    ))}
                  </TableCell>
                  <TableCell className="text-xs">{k.top_dst_ports.slice(0, 4).join(", ")}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{k.unique_src_ips ?? "—"} / {k.unique_dst_ips ?? "—"}</TableCell>
                  {results.anomaly.has_labels && <TableCell className={k.majority_label === "BENIGN" ? "text-xs" : "text-xs text-red-300"}>{k.majority_label}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
