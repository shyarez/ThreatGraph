"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Callout, Empty, PageHeader } from "@/components/common";
import { RunStatusBadge } from "@/components/run-status";
import { api, type Run } from "@/lib/api";
import { fmtDate, fmtInt, fmtNum } from "@/lib/format";

export default function HistoryPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api.runs().then(setRuns).catch((e) => setError((e as Error).message)), []);
  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm(`Delete run ${id} and its notes?`)) return;
    await api.deleteRun(id);
    load();
  }

  return (
    <>
      <PageHeader title="Investigation History" description="Every pipeline run with its parameters and headline metrics. Compare runs to see how parameters change outcomes." />
      {error && <Callout tone="error" className="mb-4">{error}</Callout>}
      {runs && runs.length === 0 && <Empty>No runs yet.</Empty>}
      {runs && runs.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead><TableHead>Dataset</TableHead><TableHead>Status</TableHead><TableHead>Started</TableHead>
                  <TableHead className="text-right">Contam.</TableHead><TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Flagged</TableHead><TableHead className="text-right">P / R / F1</TableHead>
                  <TableHead className="text-right">FPR</TableHead><TableHead className="text-right">Clusters</TableHead>
                  <TableHead className="text-right">Silhouette</TableHead><TableHead className="text-right">Modularity</TableHead>
                  <TableHead className="text-right">Invest.</TableHead><TableHead className="text-right">Time</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => {
                  const s = r.summary;
                  return (
                    <TableRow key={r.id}>
                      <TableCell><Link className="font-mono text-sky-400 hover:underline" href={`/runs/${r.id}`}>{r.id}</Link></TableCell>
                      <TableCell className="max-w-[200px] truncate">{r.dataset_name}</TableCell>
                      <TableCell><RunStatusBadge status={r.status} />{r.error && <div className="max-w-[200px] truncate text-[11px] text-red-300" title={r.error}>{r.error}</div>}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.created_at)}</TableCell>
                      <TableCell className="text-right tabular-nums">{String(r.params.if_contamination)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(s?.rows)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(s?.flagged)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{s ? `${fmtNum(s.precision, 2)} / ${fmtNum(s.recall, 2)} / ${fmtNum(s.f1, 2)}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(s?.false_positive_rate, 3)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(s?.n_clusters)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(s?.silhouette, 2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(s?.modularity, 3)}</TableCell>
                      <TableCell className="text-right tabular-nums text-red-300">{fmtInt(s?.investigate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{s ? `${s.total_seconds.toFixed(1)} s` : "—"}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => remove(r.id)}><Trash2 className="size-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
