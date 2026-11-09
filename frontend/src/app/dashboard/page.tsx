"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout, Empty, PageHeader } from "@/components/common";
import { RunStatusBadge } from "@/components/run-status";
import { OverviewTab } from "@/components/run/overview-tab";
import { api, type Results, type Run } from "@/lib/api";
import { fmtDate, fmtInt } from "@/lib/format";

export default function Dashboard() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .runs()
      .then(async (rs) => {
        setRuns(rs);
        const latest = rs.find((r) => r.status === "completed");
        if (latest) setResults(await api.results(latest.id));
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const latest = runs?.find((r) => r.status === "completed");

  return (
    <>
      <PageHeader
        title="Mission Control"
        description="Your latest investigation at a glance. Start a new one from Datasets & Runs."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/#how-to-use"><BookOpen /> How to use</Link>
            </Button>
            <Button asChild>
              <Link href="/datasets"><Rocket /> New investigation</Link>
            </Button>
          </>
        }
      />
      {error && <Callout tone="error" className="mb-4">{error}</Callout>}

      {runs && runs.length === 0 && (
        <Empty>
          No investigations yet.{" "}
          <Link href="/datasets" className="text-sky-400 hover:underline">Add a dataset</Link> to begin, or follow the{" "}
          <Link href="/#how-to-use" className="text-sky-400 hover:underline">step-by-step guide</Link>.
        </Empty>
      )}

      {latest && results && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-glow">Latest mission</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {latest.dataset_name} · run <span className="font-mono">{latest.id}</span> · {fmtDate(latest.finished_at)}
              </p>
            </div>
            <Button variant="outline" asChild><Link href={`/runs/${latest.id}`}>Open full workspace <ArrowRight /></Link></Button>
          </div>
          <OverviewTab
            results={results}
            onOpenCommunity={() => router.push(`/runs/${latest.id}`)}
            onOpenGraph={() => router.push(`/runs/${latest.id}`)}
          />
        </div>
      )}

      {runs && runs.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
            <CardDescription>{runs.length} total</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {runs.slice(0, 8).map((r) => (
              <Link
                key={r.id}
                href={`/runs/${r.id}`}
                className="flex min-w-0 flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-accent/40"
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-mono text-sm">{r.id}</span>
                  <span className="shrink-0"><RunStatusBadge status={r.status} /></span>
                </div>
                <div className="truncate text-xs text-muted-foreground" title={r.dataset_name ?? undefined}>{r.dataset_name}</div>
                {r.summary && (
                  <div className="grid grid-cols-3 divide-x divide-border rounded-md border bg-background/30">
                    <MiniStat label="Flagged" value={fmtInt(r.summary.flagged)} />
                    <MiniStat label="Comms" value={fmtInt(r.summary.n_communities)} />
                    <MiniStat label="Investigate" value={fmtInt(r.summary.investigate)} danger />
                  </div>
                )}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function MiniStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="min-w-0 px-2 py-1.5 text-center">
      <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground" title={label}>{label}</div>
      <div className={`truncate text-sm font-semibold tabular-nums ${danger ? "text-red-400" : ""}`}>{value}</div>
    </div>
  );
}
