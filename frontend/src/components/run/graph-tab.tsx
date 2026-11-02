"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Core, ElementDefinition, LayoutOptions } from "cytoscape";
import { Loader2, Maximize2, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Callout, Meter, TierBadge } from "@/components/common";
import { api, type CoordinationEvidence, type EdgeDetail, type GraphPayload, type NodeDetail, type Results } from "@/lib/api";
import { TIER_COLORS, colorFor, fmtDate, fmtInt, fmtNum, fmtPct } from "@/lib/format";
import { NoteBox } from "./note-box";

type Selection = { type: "node"; id: string } | { type: "edge"; source: string; target: string } | null;
type ColorMode = "community" | "tier" | "anomaly";

const selectCls = "h-8 rounded-md border bg-background px-2 text-sm";

export function GraphTab({ runId, results, community, setCommunity, focusIp, active, onOpenCommunity }: {
  runId: string;
  results: Results;
  community: number | null;
  setCommunity: (c: number | null) => void;
  focusIp: string | null;
  active: boolean;
  onOpenCommunity: (cid: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [data, setData] = useState<GraphPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxNodes, setMaxNodes] = useState(250);
  const [tier, setTier] = useState<string>("");
  const [showComm, setShowComm] = useState(true);
  const [colorMode, setColorMode] = useState<ColorMode>("community");
  const [selection, setSelection] = useState<Selection>(null);
  const [search, setSearch] = useState("");

  const communityOptions = useMemo(() => results.communities.slice(0, 300), [results.communities]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .graph(runId, { community, max_nodes: maxNodes, tier: tier || null })
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [runId, community, maxNodes, tier]);

  useEffect(() => {
    if (focusIp) setSelection({ type: "node", id: focusIp });
  }, [focusIp]);

  // Build / rebuild the Cytoscape instance whenever the graph payload changes.
  useEffect(() => {
    if (!data || !containerRef.current) return;
    let disposed = false;
    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      if (disposed || !containerRef.current) return;
      cyRef.current?.destroy();
      const maxFlows = Math.max(1, ...data.nodes.map((n) => n.data.flows));
      const elements: ElementDefinition[] = [
        ...data.nodes.map((n) => ({
          group: "nodes" as const,
          data: { ...n.data, size: 14 + 34 * Math.sqrt(Math.log1p(n.data.flows) / Math.log1p(maxFlows)), color: nodeColor(n.data, colorMode) },
          position: n.position,
        })),
        ...data.edges.map((e) => ({
          group: "edges" as const,
          data: { ...e.data, w: Math.min(6, 0.6 + Math.log1p(e.data.weight)) },
        })),
      ];
      const cy = cytoscape({
        container: containerRef.current,
        elements,
        layout: { name: "preset" },
        wheelSensitivity: 0.25,
        minZoom: 0.05,
        maxZoom: 4,
        style: [
          {
            selector: "node",
            style: {
              "background-color": "data(color)",
              width: "data(size)",
              height: "data(size)",
              label: "data(label)",
              color: "#d5dbe6",
              "font-size": 8,
              "text-valign": "bottom",
              "text-margin-y": 3,
              "text-opacity": 0.85,
              "min-zoomed-font-size": 7,
              "border-width": 0,
            },
          },
          { selector: "node[?suspicious]", style: { "border-width": 3, "border-color": "#ef4444" } },
          {
            selector: "edge",
            style: {
              width: "data(w)",
              "line-color": "#2a3448",
              opacity: 0.55,
              "curve-style": "haystack",
            },
          },
          {
            selector: "edge[kind = 'coordination']",
            style: { "line-color": "#f97316", "line-style": "dashed", opacity: 0.9, "curve-style": "bezier", "z-index": 10 },
          },
          { selector: "edge[anomalous_flows > 0][kind = 'communication']", style: { "line-color": "#b45309", opacity: 0.7 } },
          { selector: ":selected", style: { "border-width": 4, "border-color": "#ffd23f", "line-color": "#ffd23f", opacity: 1 } },
          { selector: ".faded", style: { opacity: 0.12, "text-opacity": 0 } },
        ],
      });
      cy.on("tap", "node", (e) => setSelection({ type: "node", id: e.target.id() }));
      cy.on("tap", "edge", (e) => setSelection({ type: "edge", source: e.target.data("source"), target: e.target.data("target") }));
      cy.on("tap", (e) => {
        if (e.target === cy) setSelection(null);
      });
      cy.on("mouseover", "node", (e) => {
        const nb = e.target.closedNeighborhood();
        cy.elements().not(nb).addClass("faded");
      });
      cy.on("mouseout", "node", () => cy.elements().removeClass("faded"));
      cyRef.current = cy;
      cy.fit(undefined, 30);
    })();
    return () => {
      disposed = true;
    };
    // colorMode is applied separately below so toggling it doesn't rebuild the graph
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => () => cyRef.current?.destroy(), []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => cy.nodes().forEach((n) => { n.data("color", nodeColor(n.data(), colorMode)); }));
  }, [colorMode, data]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.edges("[kind = 'communication']").style("display", showComm ? "element" : "none");
  }, [showComm, data]);

  useEffect(() => {
    if (active) setTimeout(() => cyRef.current?.resize(), 50);
  }, [active]);

  // Highlight the selected node in the canvas.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().unselect();
    if (selection?.type === "node") {
      const n = cy.getElementById(selection.id);
      if (n.nonempty()) {
        n.select();
        cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), 1.2) }, { duration: 300 });
      }
    }
  }, [selection, data]);

  function doSearch() {
    const ip = search.trim();
    if (ip) setSelection({ type: "node", id: ip });
  }

  function relayout() {
    const cy = cyRef.current;
    if (!cy) return;
    cy.layout({ name: "cose", animate: true, animationDuration: 800, nodeRepulsion: () => 8000, idealEdgeLength: () => 60, randomize: false } as LayoutOptions).run();
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="py-3">
        <CardContent className="flex flex-wrap items-end gap-4 px-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Community</Label>
            <select className={selectCls} value={community ?? ""} onChange={(e) => setCommunity(e.target.value === "" ? null : Number(e.target.value))}>
              <option value="">All (prioritised)</option>
              {communityOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.id} · {c.tier} · {c.size} IPs · {fmtNum(c.priority_score, 2)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Tier</Label>
            <select className={selectCls} value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="">Any</option>
              <option value="investigate">Investigate</option>
              <option value="investigate,monitor">Investigate + monitor</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Max nodes</Label>
            <select className={selectCls} value={maxNodes} onChange={(e) => setMaxNodes(Number(e.target.value))}>
              {[100, 250, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Colour by</Label>
            <select className={selectCls} value={colorMode} onChange={(e) => setColorMode(e.target.value as ColorMode)}>
              <option value="community">Community</option>
              <option value="tier">Community tier</option>
              <option value="anomaly">Anomaly rate</option>
            </select>
          </div>
          <div className="flex items-center gap-2 pb-1.5">
            <Switch id="comm" checked={showComm} onCheckedChange={setShowComm} />
            <Label htmlFor="comm" className="text-xs">Communication edges</Label>
          </div>
          <div className="flex items-end gap-1">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Find IP</Label>
              <Input className="h-8 w-40" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()} placeholder="10.0.0.1" />
            </div>
            <Button size="icon" variant="outline" className="size-8" onClick={doSearch}><Search /></Button>
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={relayout}><RefreshCw /> Re-layout</Button>
            <Button size="sm" variant="outline" onClick={() => cyRef.current?.fit(undefined, 30)}><Maximize2 /> Fit</Button>
          </div>
        </CardContent>
      </Card>

      {error && <Callout tone="error">{error}</Callout>}

      <div className="grid gap-3 xl:grid-cols-[1fr_400px]">
        <Card className="relative overflow-hidden p-0">
          <div ref={containerRef} className="h-[640px] w-full bg-[radial-gradient(ellipse_at_center,rgba(14,22,40,0.55),rgba(6,5,26,0.85))]" />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#04050a]/60">
              <Loader2 className="size-8 animate-spin" />
            </div>
          )}
          {data && (
            <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col gap-1 rounded-md border border-[#6b8bb3]/30 bg-[#0a0d16]/90 p-2 text-[11px]">
              <div>Showing {fmtInt(data.shown)} of {fmtInt(data.total_candidates)} matching IPs ({fmtInt(data.total_nodes)} total)</div>
              <div className="flex items-center gap-2"><span className="inline-block size-3 rounded-full border-2 border-red-500" /> suspicious source (≥{results.params.min_anomalous_flows} flagged flows)</div>
              <div className="flex items-center gap-2"><span className="inline-block h-0 w-5 border-t-2 border-dashed border-orange-500" /> inferred coordination edge</div>
              <div className="flex items-center gap-2"><span className="inline-block h-0 w-5 border-t-2 border-amber-700" /> communication with flagged flows</div>
              <div className="flex items-center gap-2"><span className="inline-block h-0 w-5 border-t-2 border-slate-600" /> communication</div>
              <div className="text-muted-foreground">Node size ∝ log(flows)</div>
            </div>
          )}
        </Card>

        <Card className="max-h-[640px] overflow-y-auto">
          <CardContent>
            {!selection && (
              <p className="text-sm text-muted-foreground">
                Click a node to inspect an IP address or an edge to see its relationship evidence. Hover a node to highlight its neighbourhood.
              </p>
            )}
            {selection?.type === "node" && (
              <NodePanel runId={runId} ip={selection.id} onClose={() => setSelection(null)}
                onShowCommunity={(cid) => setCommunity(cid)} onOpenCommunity={onOpenCommunity}
                onSelectPeer={(ip) => setSelection({ type: "node", id: ip })} />
            )}
            {selection?.type === "edge" && (
              <EdgePanel runId={runId} source={selection.source} target={selection.target} onClose={() => setSelection(null)}
                onSelectNode={(ip) => setSelection({ type: "node", id: ip })} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function nodeColor(d: { community: number; tier: keyof typeof TIER_COLORS; anomaly_rate: number }, mode: ColorMode) {
  if (mode === "tier") return TIER_COLORS[d.tier] ?? TIER_COLORS.low;
  if (mode === "anomaly") {
    const t = Math.min(1, d.anomaly_rate * 1.5);
    const r = Math.round(71 + (239 - 71) * t), g = Math.round(85 + (68 - 85) * t), b = Math.round(105 + (68 - 105) * t);
    return `rgb(${r},${g},${b})`;
  }
  return colorFor(d.community);
}

function PanelHeader({ title, onClose, children }: { title: React.ReactNode; onClose: () => void; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div>
        <div className="font-mono text-base font-semibold">{title}</div>
        {children}
      </div>
      <Button size="icon" variant="ghost" className="size-7" onClick={onClose}><X /></Button>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 py-0.5 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right tabular-nums">{v}</span>
    </div>
  );
}

function NodePanel({ runId, ip, onClose, onShowCommunity, onOpenCommunity, onSelectPeer }: {
  runId: string; ip: string; onClose: () => void; onShowCommunity: (cid: number) => void;
  onOpenCommunity: (cid: number) => void; onSelectPeer: (ip: string) => void;
}) {
  const [d, setD] = useState<NodeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setD(null);
    setError(null);
    api.node(runId, ip).then(setD).catch((e) => setError((e as Error).message));
  }, [runId, ip]);

  if (error) return <><PanelHeader title={ip} onClose={onClose} /><Callout tone="warn">{error}</Callout></>;
  if (!d) return <Loader2 className="mx-auto my-8 animate-spin" />;
  return (
    <div className="flex flex-col gap-4">
      <PanelHeader title={ip} onClose={onClose}>
        <div className="mt-1 flex items-center gap-2 text-xs">
          Community #{d.community} <TierBadge tier={d.tier} />
          {d.suspicious && <span className="text-red-400">suspicious source</span>}
        </div>
      </PanelHeader>
      <div>
        <KV k="Flows (out / in)" v={`${fmtInt(d.out_flows)} / ${fmtInt(d.in_flows)}`} />
        <KV k="Flagged (out / in)" v={`${fmtInt(d.out_anomalous)} / ${fmtInt(d.in_anomalous)}`} />
        <KV k="Anomaly rate" v={fmtPct(d.anomaly_rate)} />
        <KV k="Max isolation score" v={fmtNum(d.max_score)} />
        <KV k="Graph degree" v={d.degree} />
        <KV k="Active" v={<span className="text-xs">{fmtDate(d.first_seen)} → {fmtDate(d.last_seen)}</span>} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onShowCommunity(d.community)}>Show community</Button>
        {d.community_summary && <Button size="sm" variant="outline" onClick={() => onOpenCommunity(d.community)}>Community evidence</Button>}
      </div>

      {d.coordination.length > 0 && (
        <Section title={`Coordination links (${d.coordination.length})`}>
          {d.coordination.slice(0, 8).map((c) => (
            <div key={c.peer} className="rounded border p-2">
              <div className="flex items-center justify-between text-sm">
                <button className="font-mono text-sky-400 hover:underline" onClick={() => onSelectPeer(c.peer)}>{c.peer}</button>
                <span className="tabular-nums text-orange-300">{fmtNum(c.score, 2)}</span>
              </div>
              <EvidenceBars e={c} />
            </div>
          ))}
        </Section>
      )}

      <Section title="Top destinations">
        {d.top_destinations.length === 0 && <span className="text-xs text-muted-foreground">None (not a source)</span>}
        {d.top_destinations.map((p) => (
          <PeerRow key={p.ip} p={p} onClick={() => onSelectPeer(p.ip)} />
        ))}
      </Section>
      {d.top_sources.length > 0 && (
        <Section title="Top sources">
          {d.top_sources.map((p) => <PeerRow key={p.ip} p={p} onClick={() => onSelectPeer(p.ip)} />)}
        </Section>
      )}
      {d.top_dst_ports.length > 0 && (
        <Section title="Destination ports">
          <div className="flex flex-wrap gap-1 text-xs">
            {d.top_dst_ports.map((p) => <span key={p.port} className="rounded bg-muted px-1.5 py-0.5">{p.port} · {fmtInt(p.flows)}</span>)}
          </div>
        </Section>
      )}
      <Section title="DBSCAN clusters of its flows">
        <div className="flex flex-wrap gap-1 text-xs">
          {d.clusters.map((c) => (
            <span key={c.cluster} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <span className="size-2 rounded-full" style={{ background: colorFor(c.cluster) }} />
              {c.cluster === -1 ? "noise" : c.cluster} · {fmtInt(c.flows)}
            </span>
          ))}
        </div>
      </Section>
      {d.labels && (
        <Section title="Ground-truth labels (evaluation only)">
          <div className="flex flex-wrap gap-1 text-xs">
            {d.labels.map((l) => <span key={l.label} className={`rounded px-1.5 py-0.5 ${l.label === "BENIGN" ? "bg-muted" : "bg-red-950 text-red-200"}`}>{l.label} · {fmtInt(l.count)}</span>)}
          </div>
        </Section>
      )}
      <Section title="Note">
        <NoteBox runId={runId} targetType="node" targetId={ip} />
      </Section>
    </div>
  );
}

function PeerRow({ p, onClick }: { p: { ip: string; flows: number; anomalous: number }; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <button className="font-mono text-sky-400 hover:underline" onClick={onClick}>{p.ip}</button>
      <span className="tabular-nums text-muted-foreground">
        {fmtInt(p.flows)} flows{p.anomalous > 0 && <span className="text-amber-300"> · {fmtInt(p.anomalous)} flagged</span>}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

export function EvidenceBars({ e }: { e: CoordinationEvidence }) {
  const rows: [string, number | null, string][] = [
    ["Shared destinations", e.destination_jaccard, e.shared_destinations.slice(0, 3).join(", ")],
    ["Shared ports", e.port_jaccard, e.shared_ports.slice(0, 6).join(", ")],
    ["Temporal overlap", e.temporal_overlap, e.overlap_window ? `${fmtDate(e.overlap_window[0])} → ${fmtDate(e.overlap_window[1])}` : ""],
    ["Behavioural similarity", e.behaviour_similarity, e.shared_clusters.length ? `clusters ${e.shared_clusters.join(", ")}` : ""],
  ];
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {rows.map(([k, v, detail]) => (
        <div key={k}>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{k}</span>
            <span className="tabular-nums">{v == null ? "n/a" : v.toFixed(2)}</span>
          </div>
          <Meter value={v ?? 0} color="#f97316" />
          {detail && <div className="truncate font-mono text-[10px] text-muted-foreground">{detail}</div>}
        </div>
      ))}
    </div>
  );
}

function EdgePanel({ runId, source, target, onClose, onSelectNode }: {
  runId: string; source: string; target: string; onClose: () => void; onSelectNode: (ip: string) => void;
}) {
  const [d, setD] = useState<EdgeDetail | null>(null);
  useEffect(() => {
    setD(null);
    api.edge(runId, source, target).then(setD).catch(() => setD(null));
  }, [runId, source, target]);
  if (!d) return <Loader2 className="mx-auto my-8 animate-spin" />;
  return (
    <div className="flex flex-col gap-4">
      <PanelHeader title="Relationship" onClose={onClose}>
        <div className="mt-1 flex items-center gap-2 font-mono text-sm">
          <button className="text-sky-400 hover:underline" onClick={() => onSelectNode(source)}>{source}</button> ↔
          <button className="text-sky-400 hover:underline" onClick={() => onSelectNode(target)}>{target}</button>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{d.kinds.join(" + ")}</div>
      </PanelHeader>
      {d.kinds.includes("communication") && (
        <Section title="Observed communication">
          <KV k="Flows" v={fmtInt(d.flows)} />
          <KV k="Flagged flows" v={fmtInt(d.anomalous_flows)} />
          <KV k="Mean / max score" v={`${fmtNum(d.mean_score)} / ${fmtNum(d.max_score)}`} />
          <KV k="Top ports" v={d.ports?.join(", ") || "—"} />
          <KV k="Seen" v={<span className="text-xs">{fmtDate(d.first_seen)} → {fmtDate(d.last_seen)}</span>} />
        </Section>
      )}
      {d.coordination && (
        <Section title={`Inferred coordination · score ${fmtNum(d.coordination.score, 2)}`}>
          <EvidenceBars e={d.coordination} />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Score = weighted mean of the evidence above (destinations 0.35, ports 0.20, temporal 0.20, behaviour 0.25),
            computed only on each source&apos;s flagged flows. It indicates correlated behaviour, not proven coordination.
          </p>
        </Section>
      )}
    </div>
  );
}
