"use client";

import { ArrowRight, Network } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Callout, DISCLAIMER, Empty, Meter, Stat, TierBadge } from "@/components/common";
import type { Results } from "@/lib/api";
import { TIER_COLORS, fmtInt, fmtNum, fmtPct, fmtTime } from "@/lib/format";
import { AXIS, COLORS, GRID, TOOLTIP } from "./chart-theme";

export function OverviewTab({ results, onOpenCommunity, onOpenGraph }: {
  results: Results;
  onOpenCommunity: (cid: number) => void;
  onOpenGraph: (cid: number | null, ip?: string) => void;
}) {
  const a = results.anomaly;
  const c = results.clustering;
  const g = results.graph;
  const cs = results.community_stats;
  const priority = results.communities.filter((x) => x.tier !== "low").slice(0, 6);
  const pre = results.preprocessing;

  return (
    <div className="flex flex-col gap-4">
      <Callout>{DISCLAIMER}</Callout>
      {pre.sampling && <Callout tone="warn">{pre.sampling} Original file had {fmtInt(pre.input_rows)} rows.</Callout>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Flows analysed" value={fmtInt(pre.rows_analysed)} hint={`${pre.features_used} features`} />
        <Stat label="Flagged flows" value={fmtInt(a.flagged)} hint={`${fmtPct(a.flagged_fraction)} · threshold ${fmtNum(a.threshold)}`} tone="warn" />
        <Stat label="F1 (vs labels)" value={a.has_labels ? fmtNum(a.f1) : "—"} hint={a.has_labels ? `P ${fmtNum(a.precision)} · R ${fmtNum(a.recall)}` : "no labels"} />
        <Stat label="DBSCAN clusters" value={c.n_clusters} hint={`${fmtNum(c.noise_percentage, 1)}% noise`} />
        <Stat label="Graph" value={g.available ? `${fmtInt(g.nodes)} IPs` : "n/a"} hint={g.available ? `${fmtInt(g.edges)} edges · ${fmtInt(g.coordination_edges)} coordination` : g.reason} />
        <Stat label="To investigate" value={cs?.tiers?.investigate ?? "—"} hint={cs ? `${cs.tiers?.monitor ?? 0} monitor · Q = ${fmtNum(cs.modularity)}` : undefined} tone="danger" />
      </div>

      {results.timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Traffic timeline</CardTitle>
            <CardDescription>All flows vs flows flagged by Isolation Forest{a.has_labels ? " vs ground-truth attack flows" : ""}.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <AreaChart data={results.timeline}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="time" tickFormatter={fmtTime} {...AXIS} minTickGap={40} />
                <YAxis {...AXIS} />
                <Tooltip {...TOOLTIP} labelFormatter={(v) => new Date(v as string).toLocaleString()} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="flows" name="All flows" stroke={COLORS.flows} fill={COLORS.flows} fillOpacity={0.25} />
                <Area type="monotone" dataKey="anomalous" name="Flagged" stroke={COLORS.anomaly} fill={COLORS.anomaly} fillOpacity={0.35} />
                {a.has_labels && <Area type="monotone" dataKey="attacks" name="Labelled attacks" stroke={COLORS.attack} fill="none" strokeDasharray="4 3" />}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Priority communities</CardTitle>
              <CardDescription>Ranked by evidence-based priority score (heuristic).</CardDescription>
            </div>
            {g.available && <Button size="sm" variant="outline" onClick={() => onOpenGraph(null)}><Network /> Open graph</Button>}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!g.available && <Empty>{g.reason}</Empty>}
            {g.available && priority.length === 0 && <Empty>No community reached the monitor or investigate tier.</Empty>}
            {priority.map((cm) => (
              <button key={cm.id} onClick={() => onOpenCommunity(cm.id)} className="rounded-lg border p-3 text-left transition-colors hover:bg-accent/40">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium">
                    Community {cm.id} <TierBadge tier={cm.tier} />
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">priority {fmtNum(cm.priority_score, 2)}</span>
                </div>
                <div className="mt-2"><Meter value={cm.priority_score} color={TIER_COLORS[cm.tier]} /></div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {cm.size} IPs · {fmtInt(cm.anomalous_flows)} flagged flows · {cm.coordinated_sources.length} coordinated sources
                </div>
                <p className="mt-1 line-clamp-2 text-sm">{cm.evidence[1] ?? cm.evidence[0]}</p>
                <div className="mt-1 flex items-center gap-1 text-xs text-sky-400">View evidence <ArrowRight className="size-3" /></div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most anomalous source IPs</CardTitle>
            <CardDescription>Sources ranked by number of flagged flows.</CardDescription>
          </CardHeader>
          <CardContent>
            {results.top_anomalous_ips.length === 0 ? <Empty>No IP data.</Empty> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source IP</TableHead><TableHead className="text-right">Flagged</TableHead>
                    <TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Max score</TableHead>
                    <TableHead className="text-right">Targets</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.top_anomalous_ips.map((r) => (
                    <TableRow key={r.ip} className="cursor-pointer" onClick={() => g.available && onOpenGraph(null, r.ip)}>
                      <TableCell className="font-mono text-sky-400">{r.ip}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(r.anomalous)} / {fmtInt(r.flows)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(r.anomaly_rate, 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.max_score)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.targets}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
