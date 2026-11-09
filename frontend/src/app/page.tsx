"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BarChart3, ChevronDown, Database, FileText, GitBranch, Loader2, MousePointerClick,
  Network, Play, Rocket, ScanSearch, Sparkles, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/common";
import { OrbitalNetwork, SatelliteIcon } from "@/components/space-art";
import { api } from "@/lib/api";
import { TIER_COLORS } from "@/lib/format";
import { cn } from "@/lib/utils";

const PIPELINE = [
  {
    icon: Database, verb: "Ingest", algo: "Preprocessing",
    text: "Reads your CSV of network flows, finds the IP, port, time and label columns, and cleans broken values.",
  },
  {
    icon: ScanSearch, verb: "Detect", algo: "Isolation Forest",
    text: "Gives every flow an anomaly score: how easy it is to single out from normal traffic. The most unusual are flagged.",
  },
  {
    icon: Sparkles, verb: "Cluster", algo: "DBSCAN",
    text: "Groups flows that behave alike, so repeated attack patterns show up as tight clusters.",
  },
  {
    icon: GitBranch, verb: "Connect", algo: "NetworkX graph",
    text: "Turns IPs into nodes. Real connections and inferred “moving together” links become edges, each backed by evidence.",
  },
  {
    icon: Network, verb: "Discover", algo: "Louvain",
    text: "Finds tightly linked groups of IPs and ranks them by how suspicious their shared behaviour looks.",
  },
];

const STEPS = [
  {
    icon: Upload, title: "Add a dataset", where: "Datasets & Runs",
    text: "Drop in a network-flow CSV, or click Generate synthetic demo dataset to try it instantly. ThreatGraph validates the file and shows what it found.",
    href: "/datasets",
  },
  {
    icon: Play, title: "Run the pipeline", where: "Datasets & Runs → Run pipeline",
    text: "The default settings work well. Click Run pipeline and watch each stage complete; small files take a few seconds.",
    href: "/datasets",
  },
  {
    icon: BarChart3, title: "Explore the results", where: "Overview · Anomalies · Clusters",
    text: "Start on Overview for the headline numbers, then dig into the flagged flows and the behaviour clusters behind them.",
  },
  {
    icon: MousePointerClick, title: "Investigate the graph", where: "Threat graph · Communities",
    text: "Click any IP or link to see the evidence. Open Communities and start with the red Investigate groups: each lists exactly why it was flagged.",
  },
  {
    icon: FileText, title: "Report your findings", where: "Report & notes",
    text: "Add notes as you go, then export a report as HTML (print to PDF), Markdown or JSON.",
  },
];

const COLUMNS: [string, string, boolean][] = [
  ["Source IP", "Who sent the traffic", true],
  ["Destination IP", "Who received it", true],
  ["Destination Port", "Which service was targeted", false],
  ["Timestamp", "When it happened (enables timing evidence)", false],
  ["Label", "Ground truth, used only to score accuracy", false],
  ["Numeric flow features", "Packets, bytes, duration, rates… (at least 3)", true],
];

function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setShown(true);
        io.disconnect();
      }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SectionTitle({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return (
    <Reveal className="mx-auto mb-12 max-w-2xl text-center">
      <div className="font-display text-[11px] uppercase tracking-[0.4em] text-[#7dd3fc]">{kicker}</div>
      <h2 className="mt-3 font-display text-2xl font-bold uppercase tracking-[0.08em] text-glow md:text-3xl">{title}</h2>
      <p className="mt-4 text-[#aab4c4]">{text}</p>
    </Reveal>
  );
}

export default function Landing() {
  const router = useRouter();
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  async function tryDemo() {
    setDemoBusy(true);
    setDemoError(null);
    try {
      const ds = await api.sample();
      const run = await api.startRun(ds.id, {});
      router.push(`/runs/${run.id}`);
    } catch (e) {
      setDemoError((e as Error).message);
      setDemoBusy(false);
    }
  }

  return (
    <div className="relative">
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#02030a]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <SatelliteIcon className="size-7" />
            <span className="font-display text-sm font-bold tracking-[0.12em]">Threat<span className="text-primary">Graph</span></span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#how-it-works" className="rounded-md px-3 py-1.5 text-[#aab4c4] transition-colors hover:text-white max-sm:hidden">How it works</a>
            <a href="#how-to-use" className="rounded-md px-3 py-1.5 text-[#aab4c4] transition-colors hover:text-white max-sm:hidden">How to use</a>
            <Button asChild size="sm" className="ml-2">
              <Link href="/dashboard">Launch app <ArrowRight /></Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid min-h-[calc(100vh-57px)] max-w-6xl items-center gap-10 px-5 py-16 lg:grid-cols-[1.15fr_1fr]">
        <div className="animate-page-in">
          <h1 className="font-display text-5xl font-black uppercase leading-[1.05] tracking-[0.08em] text-glow md:text-7xl">
            Threat<br /><span className="text-primary">Graph</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg text-[#c3ccd9] md:text-xl">
            Find network attackers who work <span className="text-white">together</span>.
          </p>
          <p className="mt-3 max-w-xl text-[#8e99ab]">
            Traditional intrusion detection flags suspicious traffic one event at a time. ThreatGraph connects those events,
            maps which IP addresses behave alike and target the same systems, and shows you the evidence for every link.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button size="lg" onClick={tryDemo} disabled={demoBusy}>
              {demoBusy ? <Loader2 className="animate-spin" /> : <Rocket />} Try it with demo data
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#how-to-use">How to use it <ChevronDown /></a>
            </Button>
          </div>
          {demoError && <Callout tone="error" className="mt-4 max-w-xl">{demoError}</Callout>}
          <p className="mt-4 text-xs text-[#6f7a8c]">
            The demo creates a synthetic dataset with hidden attack scenarios and runs the full analysis in a few seconds.
          </p>
        </div>
        <div className="animate-page-in" style={{ animationDelay: "150ms" }}>
          <OrbitalNetwork className="mx-auto w-full max-w-[460px] drop-shadow-[0_0_50px_rgba(110,160,210,0.3)]" />
        </div>
        <a href="#how-it-works" aria-label="Scroll to how it works"
          className="col-span-full mx-auto -mt-6 flex flex-col items-center gap-1 text-[10px] uppercase tracking-[0.3em] text-[#6f7a8c] transition-colors hover:text-white">
          Scroll <ChevronDown className="size-4 animate-bounce motion-reduce:animate-none" />
        </a>
      </section>

      {/* how it works */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
        <SectionTitle
          kicker="How it works"
          title="From raw traffic to suspicious groups"
          text="Five data-mining stages run in sequence. Each one feeds the next, so isolated alerts become a connected picture."
        />
        <div className="relative grid gap-4 md:grid-cols-5">
          <div className="pointer-events-none absolute left-[10%] right-[10%] top-9 hidden h-px bg-gradient-to-r from-transparent via-[#7dd3fc]/40 to-transparent md:block" />
          {PIPELINE.map((p, i) => (
            <Reveal key={p.verb} delay={i * 110}>
              <div className="group relative flex h-full flex-col items-center rounded-2xl border border-white/8 bg-[#070a12]/80 p-5 text-center transition-all hover:-translate-y-1 hover:border-[#7dd3fc]/30">
                <div className="relative flex size-14 items-center justify-center rounded-full border border-[#7dd3fc]/30 bg-[#02030a] shadow-[0_0_24px_-6px_rgba(125,211,252,0.6)]">
                  <p.icon className="size-6 text-[#7dd3fc] transition-transform group-hover:scale-110" />
                  <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary font-display text-[10px] font-bold text-primary-foreground">{i + 1}</span>
                </div>
                <div className="mt-4 font-display text-sm font-bold uppercase tracking-[0.15em]">{p.verb}</div>
                <div className="mt-1 text-xs text-[#7dd3fc]">{p.algo}</div>
                <p className="mt-3 flex-1 text-sm text-[#9aa5b6]">{p.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* how to use */}
      <section id="how-to-use" className="mx-auto max-w-4xl scroll-mt-20 px-5 py-24">
        <SectionTitle
          kicker="How to use it"
          title="Your first investigation in five steps"
          text="No setup inside the app is needed. Follow these steps the first time; afterwards everything lives in Mission Control."
        />
        <ol className="relative flex flex-col gap-5">
          <div className="pointer-events-none absolute bottom-6 left-[27px] top-6 w-px bg-gradient-to-b from-[#7dd3fc]/50 via-[#7dd3fc]/20 to-transparent max-sm:hidden" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 90}>
              <li className="relative flex gap-5">
                <div className="relative z-10 flex size-14 shrink-0 items-center justify-center rounded-2xl border border-[#7dd3fc]/30 bg-[#02030a] max-sm:hidden">
                  <s.icon className="size-5 text-[#7dd3fc]" />
                </div>
                <div className="flex-1 rounded-2xl border border-white/8 bg-[#070a12]/80 p-5 transition-colors hover:border-[#7dd3fc]/25">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-display text-xs font-bold text-primary">0{i + 1}</span>
                      <h3 className="font-display text-sm font-bold uppercase tracking-[0.12em]">{s.title}</h3>
                    </div>
                    <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-[#9aa5b6]">{s.where}</span>
                  </div>
                  <p className="mt-2 text-sm text-[#aab4c4]">{s.text}</p>
                  {s.href && (
                    <Link href={s.href} className="mt-3 inline-flex items-center gap-1 text-xs text-[#7dd3fc] hover:underline">
                      Go to {s.where.split(" →")[0]} <ArrowRight className="size-3" />
                    </Link>
                  )}
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* data + reading results */}
      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-16 lg:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-2xl border border-white/8 bg-[#070a12]/80 p-6">
            <div className="font-display text-[11px] uppercase tracking-[0.35em] text-[#7dd3fc]">What data you need</div>
            <h3 className="mt-2 font-display text-lg font-bold uppercase tracking-[0.08em]">A CSV of network flows</h3>
            <p className="mt-2 text-sm text-[#9aa5b6]">
              One row per connection. Column names are detected automatically. The{" "}
              <a className="text-[#7dd3fc] hover:underline" href="https://www.unb.ca/cic/datasets/ids-2017.html" target="_blank" rel="noreferrer">CIC-IDS2017</a>{" "}
              <span className="text-white">TrafficLabelling</span> files work out of the box.
            </p>
            <ul className="mt-5 flex flex-col divide-y divide-white/5 text-sm">
              {COLUMNS.map(([col, why, required]) => (
                <li key={col} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="font-medium">{col}</div>
                    <div className="text-xs text-[#8e99ab]">{why}</div>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
                    required ? "bg-primary/15 text-primary" : "bg-white/5 text-[#8e99ab]")}>
                    {required ? "Needed" : "Optional"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-[#6f7a8c]">Without IP columns, detection and clustering still run, but the graph is skipped.</p>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="h-full rounded-2xl border border-white/8 bg-[#070a12]/80 p-6">
            <div className="font-display text-[11px] uppercase tracking-[0.35em] text-[#7dd3fc]">Reading the results</div>
            <h3 className="mt-2 font-display text-lg font-bold uppercase tracking-[0.08em]">What the signals mean</h3>
            <div className="mt-5 flex flex-col gap-4 text-sm">
              {([
                ["investigate", "Investigate", "Several sources share targets, timing and behaviour, with a high share of flagged traffic. Look here first."],
                ["monitor", "Monitor", "Clearly unusual activity, but weaker evidence that sources are working together."],
                ["low", "Low", "Mostly normal traffic."],
              ] as const).map(([tier, name, text]) => (
                <div key={tier} className="flex gap-3">
                  <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: TIER_COLORS[tier], boxShadow: `0 0 12px ${TIER_COLORS[tier]}` }} />
                  <div><span className="font-medium">{name}</span> <span className="text-[#9aa5b6]">· {text}</span></div>
                </div>
              ))}
              <div className="my-1 h-px bg-white/5" />
              <div className="flex gap-3">
                <span className="mt-2 h-0 w-5 shrink-0 border-t-2 border-dashed border-orange-500" />
                <div><span className="font-medium">Dashed orange link</span> <span className="text-[#9aa5b6]">· two sources inferred to be acting together. Click it to see why.</span></div>
              </div>
              <div className="flex gap-3">
                <span className="mt-0.5 size-4 shrink-0 rounded-full border-2 border-red-500" />
                <div><span className="font-medium">Red ring</span> <span className="text-[#9aa5b6]">· a source IP with several flagged flows.</span></div>
              </div>
              <div className="flex gap-3">
                <span className="mt-0.5 font-display text-xs font-bold text-primary">0–1</span>
                <div><span className="font-medium">Anomaly score</span> <span className="text-[#9aa5b6]">· higher means more unusual. It is a ranking, not a probability of attack.</span></div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* final CTA */}
      <section className="mx-auto max-w-4xl px-5 pb-28 pt-16">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-[#7dd3fc]/20 bg-gradient-to-b from-[#0b1220]/90 to-[#04060c]/90 px-6 py-14 text-center">
            <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-[70%] -translate-x-1/2 rounded-full bg-[#7dd3fc]/10 blur-3xl" />
            <h2 className="relative font-display text-2xl font-bold uppercase tracking-[0.1em] text-glow md:text-3xl">Ready for launch?</h2>
            <p className="relative mx-auto mt-4 max-w-lg text-[#aab4c4]">
              Run the demo to see a full investigation in seconds, or bring your own CIC-IDS2017 data.
            </p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={tryDemo} disabled={demoBusy}>
                {demoBusy ? <Loader2 className="animate-spin" /> : <Rocket />} Try it with demo data
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/datasets"><Upload /> Upload my own CSV</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-[#6f7a8c]">
        ThreatGraph · Detection of coordinated network intrusions using graph-based data mining and clustering
      </footer>
    </div>
  );
}
