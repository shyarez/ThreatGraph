"use client";

import { AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TIER_COLORS, TIER_LABEL } from "@/lib/format";
import type { Tier } from "@/lib/api";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-xl font-bold uppercase tracking-[0.12em] text-glow md:text-2xl">{title}</h1>
        {description && <p className="mt-3 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "danger" | "warn" | "ok" }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <div className="font-display text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
        <div
          className={cn(
            "mt-2 text-2xl font-semibold tabular-nums",
            tone === "danger" && "text-red-400",
            tone === "warn" && "text-amber-400",
            tone === "ok" && "text-emerald-400",
          )}
        >
          {value}
        </div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <Badge variant="outline" style={{ borderColor: TIER_COLORS[tier], color: TIER_COLORS[tier] }}>
      {TIER_LABEL[tier]}
    </Badge>
  );
}

export function Callout({ children, tone = "info", className }: { children: React.ReactNode; tone?: "info" | "warn" | "error"; className?: string }) {
  const Icon = tone === "info" ? Info : AlertTriangle;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-3 text-sm",
        tone === "info" && "border-[#6b8bb3]/40 bg-[#6b8bb3]/10 text-[#d6e2f0]",
        tone === "warn" && "border-amber-900 bg-amber-950/40 text-amber-200",
        tone === "error" && "border-red-900 bg-red-950/40 text-red-200",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Meter({ value, color = "#38bdf8" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-[#6b8bb3]/40 bg-black/10 p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export const DISCLAIMER =
  "Anomaly scores are Isolation Forest isolation scores and priority scores are heuristic rankings — neither is a probability of attack. Flagged communities show correlated suspicious behaviour, not confirmed malicious coordination.";
