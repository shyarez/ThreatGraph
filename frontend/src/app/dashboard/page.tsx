"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout, Empty, PageHeader, Stat } from "@/components/common";
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
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {runs.slice(0, 8).map((r) => (
              <Link key={r.id} href={`/runs/${r.id}`} className="rounded-lg border p-3 transition-colors hover:bg-accent/40">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">{r.id}</span>
                  <RunStatusBadge status={r.status} />
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{r.dataset_name}</div>
                {r.summary && (
                  <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                    <Stat label="flagged" value={<span className="text-sm">{fmtInt(r.summary.flagged)}</span>} />
                    <Stat label="comms" value={<span className="text-sm">{fmtInt(r.summary.n_communities)}</span>} />
                    <Stat label="investigate" value={<span className="text-sm">{fmtInt(r.summary.investigate)}</span>} tone="danger" />
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
