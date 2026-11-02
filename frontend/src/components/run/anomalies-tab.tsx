"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type FlowRow, type Results } from "@/lib/api";
import { PROTOCOLS, colorFor, fmtDate, fmtInt, fmtNum } from "@/lib/format";
import { AXIS, COLORS, GRID, TOOLTIP } from "./chart-theme";

const PAGE = 50;

export function AnomaliesTab({ runId, results, onOpenIp }: { runId: string; results: Results; onOpenIp: (ip: string) => void }) {
  const a = results.anomaly;
  const [rows, setRows] = useState<FlowRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [onlyAnom, setOnlyAnom] = useState(true);
  const [ip, setIp] = useState("");
  const [cluster, setCluster] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api
        .flows(runId, { page, page_size: PAGE, only_anomalous: onlyAnom, ip: ip.trim() || null, cluster: cluster === "" ? null : Number(cluster) })
        .then((r) => {
          setRows(r.rows);
          setTotal(r.total);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [runId, page, onlyAnom, ip, cluster]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const hasLabels = a.has_labels;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Isolation score distribution</CardTitle>
            <CardDescription>
              Isolation Forest score s(x, n) ∈ (0, 1]; flows right of the threshold ({fmtNum(a.threshold)}) are flagged.
              {hasLabels && " Bars are split by ground-truth label."}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <BarChart data={a.score_hist} barCategoryGap={1}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="bin" {...AXIS} tickFormatter={(v) => Number(v).toFixed(2)} />
                <YAxis {...AXIS} scale="sqrt" />
                <Tooltip {...TOOLTIP} labelFormatter={(v) => `score ≈ ${Number(v).toFixed(3)}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {hasLabels ? (
                  <>
                    <Bar dataKey="benign" name="Benign" stackId="s" fill={COLORS.benign} />
                    <Bar dataKey="attack" name="Attack (label)" stackId="s" fill={COLORS.attack} />
                  </>
                ) : (
                  <Bar dataKey="count" name="Flows" fill={COLORS.benign} />
                )}
                <ReferenceLine x={closestBin(a.score_hist, a.threshold)} stroke={COLORS.anomaly} strokeDasharray="4 2" label={{ value: "threshold", fill: COLORS.anomaly, fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        {a.per_label && (
          <Card>
            <CardHeader>
              <CardTitle>Flag rate by label</CardTitle>
              <CardDescription>Share of each ground-truth class flagged as anomalous.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Label</TableHead><TableHead className="text-right">Flows</TableHead><TableHead className="text-right">Flagged</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {a.per_label.map((r) => (
                    <TableRow key={r.label}>
                      <TableCell className={r.label === "BENIGN" ? "" : "text-red-300"}>{r.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(r.flows)}</TableCell>
                      <TableCell className="text-right tabular-nums">{(r.flag_rate * 100).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Flow explorer</CardTitle>
          <CardDescription>{fmtInt(total)} flows match · sorted by isolation score</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2">
              <Switch id="onlyanom" checked={onlyAnom} onCheckedChange={(v) => { setOnlyAnom(v); setPage(1); }} />
              <Label htmlFor="onlyanom">Flagged only</Label>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">IP address</Label>
              <Input className="h-8 w-48" placeholder="e.g. 192.168.10.50" value={ip} onChange={(e) => { setIp(e.target.value); setPage(1); }} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">DBSCAN cluster</Label>
              <Input className="h-8 w-28" placeholder="-1 = noise" value={cluster} onChange={(e) => { setCluster(e.target.value.replace(/[^-\d]/g, "")); setPage(1); }} />
            </div>
            <div className="ml-auto flex items-center gap-2 text-sm">
              <Button size="icon" variant="outline" className="size-8" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
              <span className="tabular-nums">{page} / {pages}</span>
              <Button size="icon" variant="outline" className="size-8" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
            </div>
          </div>
          <div className={loading ? "opacity-60" : ""}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead><TableHead>Time</TableHead><TableHead>Source</TableHead><TableHead>Destination</TableHead>
                  <TableHead>Proto</TableHead><TableHead className="text-right">Score</TableHead><TableHead>Flag</TableHead>
                  <TableHead>Cluster</TableHead>{hasLabels && <TableHead>Label (eval)</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.row}>
                    <TableCell className="tabular-nums text-muted-foreground">{r.row}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.timestamp)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <button className="text-sky-400 hover:underline" onClick={() => r.src_ip && onOpenIp(r.src_ip)}>{r.src_ip}</button>
                      {r.src_port >= 0 && <span className="text-muted-foreground">:{r.src_port}</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <button className="text-sky-400 hover:underline" onClick={() => r.dst_ip && onOpenIp(r.dst_ip)}>{r.dst_ip}</button>
                      {r.dst_port >= 0 && <span className="text-muted-foreground">:{r.dst_port}</span>}
                    </TableCell>
                    <TableCell className="text-xs">{PROTOCOLS[r.protocol] ?? (r.protocol >= 0 ? r.protocol : "—")}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.score.toFixed(3)}</TableCell>
                    <TableCell>{r.is_anomaly ? <Badge variant="outline" className="border-amber-500 text-amber-300">anomaly</Badge> : <span className="text-xs text-muted-foreground">normal</span>}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-xs">
                        <span className="size-2 rounded-full" style={{ background: colorFor(r.cluster) }} />
                        {r.cluster === -1 ? "noise" : r.cluster}
                      </span>
                    </TableCell>
                    {hasLabels && <TableCell className={r.label === "BENIGN" ? "text-xs text-muted-foreground" : "text-xs text-red-300"}>{r.label}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function closestBin(hist: { bin: number }[], t: number) {
  let best = hist[0]?.bin;
  for (const h of hist) if (Math.abs(h.bin - t) < Math.abs((best ?? 0) - t)) best = h.bin;
  return best;
}
