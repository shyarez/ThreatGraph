"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Callout, DISCLAIMER, Empty, Meter, TierBadge } from "@/components/common";
import { api, type CommunityDetail, type Results, type Tier } from "@/lib/api";
import { TIER_COLORS, fmtDate, fmtInt, fmtNum, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EvidenceBars } from "./graph-tab";
import { NoteBox } from "./note-box";

export function CommunitiesTab({ runId, results, selected, setSelected, onOpenGraph }: {
  runId: string;
  results: Results;
  selected: number | null;
  setSelected: (c: number | null) => void;
  onOpenGraph: (cid: number) => void;
}) {
  const [tierFilter, setTierFilter] = useState<Tier | "all">("all");
  const list = useMemo(
    () => results.communities.filter((c) => tierFilter === "all" || c.tier === tierFilter),
    [results.communities, tierFilter],
  );
  const current = selected ?? results.communities[0]?.id ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card className="max-h-[calc(100vh-180px)] overflow-hidden">
        <CardHeader>
          <CardTitle>Communities</CardTitle>
          <CardDescription>
            {results.communities.length} non-singleton Louvain communities · Q = {fmtNum(results.community_stats?.modularity)}
          </CardDescription>
          <div className="flex flex-wrap gap-1 pt-2">
            {(["all", "investigate", "monitor", "low"] as const).map((t) => (
              <Button key={t} size="sm" variant={tierFilter === t ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setTierFilter(t)}>
                {t === "all" ? "All" : t}
                <span className="text-muted-foreground">
                  {t === "all" ? results.communities.length : results.communities.filter((c) => c.tier === t).length}
                </span>
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="flex max-h-[calc(100vh-330px)] flex-col gap-2 overflow-y-auto">
          {list.length === 0 && <Empty>None in this tier.</Empty>}
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={cn("rounded-md border p-2.5 text-left transition-colors", c.id === current ? "border-sky-500 bg-sky-950/30" : "hover:bg-accent/40")}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">#{c.id}</span>
                <TierBadge tier={c.tier} />
              </div>
              <div className="mt-1.5"><Meter value={c.priority_score} color={TIER_COLORS[c.tier]} /></div>
              <div className="mt-1 text-xs text-muted-foreground">
                {c.size} IPs · {fmtInt(c.anomalous_flows)} flagged · {c.coordination_edges} coord. edges · {fmtNum(c.priority_score, 2)}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
      {current == null ? <Empty>No communities.</Empty> : <CommunityDetailView key={current} runId={runId} cid={current} onOpenGraph={onOpenGraph} hasLabels={results.anomaly.has_labels} />}
    </div>
  );
}

const COMPONENT_LABELS: Record<string, [string, number]> = {
  anomaly_rate: ["Anomalous share of member flows", 0.35],
  coordination: ["Coordinated sources (÷3, capped)", 0.35],
  temporal_concentration: ["Temporal concentration", 0.15],
  behavioural_homogeneity: ["Behavioural homogeneity", 0.15],
};

function CommunityDetailView({ runId, cid, onOpenGraph, hasLabels }: { runId: string; cid: number; onOpenGraph: (cid: number) => void; hasLabels: boolean }) {
  const [c, setC] = useState<CommunityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.community(runId, cid).then(setC).catch((e) => setError((e as Error).message));
  }, [runId, cid]);

  if (error) return <Callout tone="error">{error}</Callout>;
  if (!c) return <Loader2 className="mx-auto mt-20 size-8 animate-spin" />;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">Community #{c.id} <TierBadge tier={c.tier} /></CardTitle>
            <CardDescription>
              {c.size} IPs · {c.internal_edges} internal edges · density {fmtNum(c.density)} · {fmtInt(c.flows_from_members)} flows originated by members
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => onOpenGraph(c.id)}><Network /> View in graph</Button>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-medium">Why this community was {c.tier === "low" ? "ranked low" : "flagged"}</div>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
              {c.evidence.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
          <div>
            <div className="mb-2 flex justify-between text-sm font-medium">
              <span>Priority score</span>
              <span className="tabular-nums" style={{ color: TIER_COLORS[c.tier] }}>{fmtNum(c.priority_score, 3)}</span>
            </div>
            <div className="flex flex-col gap-2">
              {Object.entries(COMPONENT_LABELS).map(([k, [label, w]]) => (
                <div key={k}>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{label} × {w}</span>
                    <span className="tabular-nums">{fmtNum(c.score_components[k], 2)}</span>
                  </div>
                  <Meter value={c.score_components[k] ?? 0} color={TIER_COLORS[c.tier]} />
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">{DISCLAIMER}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Shared targets</CardTitle><CardDescription>Destinations of flagged flows from members</CardDescription></CardHeader>
          <CardContent>
            {c.shared_targets.length === 0 ? <Empty>No flagged flows.</Empty> : (
              <Table>
                <TableHeader><TableRow><TableHead>Destination</TableHead><TableHead className="text-right">Member sources</TableHead><TableHead className="text-right">Flagged flows</TableHead><TableHead>Ports</TableHead></TableRow></TableHeader>
                <TableBody>
                  {c.shared_targets.map((t) => (
                    <TableRow key={t.ip}>
                      <TableCell className="font-mono text-xs">{t.ip}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", t.member_sources >= 2 && "text-orange-300")}>{t.member_sources}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(t.anomalous_flows)}</TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs">{t.ports.join(", ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {c.anomalous_window && (
              <p className="mt-3 text-xs text-muted-foreground">
                Flagged activity window: {fmtDate(c.anomalous_window.start)} → {fmtDate(c.anomalous_window.end)} ({c.anomalous_window.minutes.toFixed(1)} min)
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Members</CardTitle><CardDescription>Sorted by flagged flows</CardDescription></CardHeader>
          <CardContent className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>IP</TableHead><TableHead className="text-right">Flows</TableHead><TableHead className="text-right">Flagged</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Degree</TableHead></TableRow></TableHeader>
              <TableBody>
                {c.member_details.map((m) => (
                  <TableRow key={m.ip}>
                    <TableCell className={cn("font-mono text-xs", m.suspicious && "text-red-300")}>{m.ip}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(m.flows)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(m.anomalous_flows)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPct(m.anomaly_rate, 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.degree}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {c.coordination_pairs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Coordination evidence ({c.coordination_pairs.length} pairs)</CardTitle>
            <CardDescription>Inferred links between suspicious sources, computed from their flagged flows.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {c.coordination_pairs.slice(0, 12).map((p) => (
              <div key={`${p.source}-${p.target}`} className="rounded-md border p-3">
                <div className="flex justify-between font-mono text-xs">
                  <span>{p.source} ↔ {p.target}</span>
                  <span className="text-orange-300">{p.score.toFixed(2)}</span>
                </div>
                <EvidenceBars e={p} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {hasLabels && c.ground_truth_labels && (
          <Card>
            <CardHeader><CardTitle>Ground-truth labels (evaluation only)</CardTitle><CardDescription>Labels of flows originated by members</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {c.ground_truth_labels.map((l) => (
                <span key={l.label} className={cn("rounded px-2 py-1 text-xs", l.label === "BENIGN" ? "bg-muted" : "bg-red-950 text-red-200")}>
                  {l.label} · {fmtInt(l.count)}
                </span>
              ))}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle>Investigation note</CardTitle></CardHeader>
          <CardContent><NoteBox runId={runId} targetType="community" targetId={String(c.id)} /></CardContent>
        </Card>
      </div>
    </div>
  );
}
