"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Callout, PageHeader } from "@/components/common";
import { RunStatusBadge } from "@/components/run-status";
import { OverviewTab } from "@/components/run/overview-tab";
import { AnomaliesTab } from "@/components/run/anomalies-tab";
import { ClustersTab } from "@/components/run/clusters-tab";
import { GraphTab } from "@/components/run/graph-tab";
import { CommunitiesTab } from "@/components/run/communities-tab";
import { EvaluationTab } from "@/components/run/evaluation-tab";
import { ReportTab } from "@/components/run/report-tab";
import { api, type Results, type Run } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<Run | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [focusCommunity, setFocusCommunity] = useState<number | null>(null);
  const [focusIp, setFocusIp] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await api.run(id);
        if (cancelled) return;
        setRun(r);
        if (r.status === "completed") {
          setResults(await api.results(id));
        } else if (r.status !== "failed") {
          timer = setTimeout(poll, 800);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  const openCommunity = (cid: number) => {
    setFocusCommunity(cid);
    setTab("communities");
  };
  const openInGraph = (cid: number | null, ip?: string) => {
    setFocusCommunity(cid);
    setFocusIp(ip ?? null);
    setTab("graph");
  };

  if (error) return <Callout tone="error">{error}</Callout>;
  if (!run) return <Loader2 className="mx-auto mt-20 size-8 animate-spin text-muted-foreground" />;

  return (
    <>
      <PageHeader
        title={`Investigation ${run.id}`}
        description={
          <>
            Dataset <Link className="text-sky-400 hover:underline" href="/datasets">{run.dataset_name ?? run.dataset_id}</Link>
            {" · "}started {fmtDate(run.created_at)} <RunStatusBadge status={run.status} />
          </>
        }
      />
      {run.status !== "completed" ? (
        <RunProgress run={run} />
      ) : !results ? (
        <Loader2 className="mx-auto mt-20 size-8 animate-spin text-muted-foreground" />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
            <TabsTrigger value="clusters">Clusters</TabsTrigger>
            <TabsTrigger value="graph" disabled={!results.graph.available}>Threat graph</TabsTrigger>
            <TabsTrigger value="communities" disabled={!results.graph.available}>Communities</TabsTrigger>
            <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
            <TabsTrigger value="report">Report & notes</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><OverviewTab results={results} onOpenCommunity={openCommunity} onOpenGraph={openInGraph} /></TabsContent>
          <TabsContent value="anomalies"><AnomaliesTab runId={id} results={results} onOpenIp={(ip) => openInGraph(null, ip)} /></TabsContent>
          <TabsContent value="clusters"><ClustersTab results={results} /></TabsContent>
          <TabsContent value="graph" forceMount hidden={tab !== "graph"}>
            {results.graph.available && (
              <GraphTab runId={id} results={results} community={focusCommunity} setCommunity={setFocusCommunity}
                focusIp={focusIp} active={tab === "graph"} onOpenCommunity={openCommunity} />
            )}
          </TabsContent>
          <TabsContent value="communities">
            <CommunitiesTab runId={id} results={results} selected={focusCommunity} setSelected={setFocusCommunity}
              onOpenGraph={(cid) => openInGraph(cid)} />
          </TabsContent>
          <TabsContent value="evaluation"><EvaluationTab results={results} /></TabsContent>
          <TabsContent value="report"><ReportTab runId={id} results={results} /></TabsContent>
        </Tabs>
      )}
    </>
  );
}

function RunProgress({ run }: { run: Run }) {
  const stages = run.stages ?? [];
  const current = stages.findIndex((s) => s.key === run.stage);
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>{run.status === "failed" ? "Pipeline failed" : "Running pipeline…"}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {run.status === "failed" ? (
          <Callout tone="error">{run.error}</Callout>
        ) : (
          <Progress value={Math.round(run.progress * 100)} />
        )}
        <ol className="flex flex-col gap-2">
          {stages.map((s, i) => {
            const done = i < current;
            const active = i === current && run.status === "running";
            const failed = i === current && run.status === "failed";
            return (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                {failed ? <XCircle className="size-4 text-red-400" />
                  : done ? <CheckCircle2 className="size-4 text-emerald-400" />
                  : active ? <Loader2 className="size-4 animate-spin text-sky-400" />
                  : <Circle className="size-4 text-muted-foreground" />}
                <span className={active ? "text-foreground" : "text-muted-foreground"}>{s.title}</span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
