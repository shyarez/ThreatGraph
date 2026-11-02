"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Database, GitBranch, Network, Rocket, ScanSearch, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout, Empty, Stat } from "@/components/common";
import { OrbitalNetwork } from "@/components/space-art";
import { RunStatusBadge } from "@/components/run-status";
import { OverviewTab } from "@/components/run/overview-tab";
import { api, type Results, type Run } from "@/lib/api";
import { fmtDate, fmtInt } from "@/lib/format";
import { useRouter } from "next/navigation";

const STEPS = [
  { icon: Database, title: "Ingest", text: "Validate CSV, detect IP/port/time/label columns, clean inf & missing values." },
  { icon: ScanSearch, title: "Isolation Forest", text: "Score every flow by how easily it is isolated; flag the most unusual." },
  { icon: Sparkles, title: "DBSCAN", text: "Group flows with similar behaviour; low-density flows become noise." },
  { icon: GitBranch, title: "NetworkX graph", text: "IPs as nodes; observed communication + inferred coordination edges." },
  { icon: Network, title: "Louvain", text: "Find densely connected communities and rank them by evidence." },
];

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
      <section className="relative mb-10 grid items-center gap-8 overflow-hidden rounded-2xl border border-[#6b8bb3]/30 bg-[#0a0d16]/55 px-6 py-10 backdrop-blur-md md:px-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="relative z-10">
          <h1 className="font-display text-4xl font-black uppercase leading-tight tracking-[0.1em] text-glow md:text-6xl">
            Threat<span className="text-primary">Graph</span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-[#c3ccd9] md:text-lg">
            Every IP is a satellite. ThreatGraph maps who talks to whom, finds the ones moving in formation,
            and shows you the evidence: shared targets, matching ports, overlapping timing and similar behaviour.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/datasets"><Rocket /> Launch investigation</Link>
            </Button>
            {latest && (
              <Button asChild size="lg" variant="outline">
                <Link href={`/runs/${latest.id}`}>Resume latest mission <ArrowRight /></Link>
              </Button>
            )}
          </div>
        </div>
        <OrbitalNetwork className="relative z-10 mx-auto w-full max-w-[420px] drop-shadow-[0_0_40px_rgba(110,160,210,0.35)]" />
      </section>
      {error && <Callout tone="error" className="mb-4">{error}</Callout>}

      <h2 className="mb-4 font-display text-xs uppercase tracking-[0.3em] text-muted-foreground">Mission stages</h2>
      <div className="mb-10 grid gap-3 md:grid-cols-5">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <Card key={title} className="group gap-2 py-4 transition-transform hover:-translate-y-1">
            <CardContent className="px-4">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center border-2 border-black bg-primary font-display text-[10px] text-primary-foreground shadow-[2px_2px_0_0_#000]">{i + 1}</span>
                <Icon className="size-4 text-[#5ce1e6] transition-transform group-hover:scale-125" />
              </div>
              <div className="mt-3 text-sm font-semibold">{title}</div>
              <p className="mt-1 text-xs text-muted-foreground">{text}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {runs && runs.length === 0 && (
        <Empty>
          No investigations yet. <Link href="/datasets" className="text-sky-400 hover:underline">Upload a dataset or generate the demo dataset</Link> to begin.
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
