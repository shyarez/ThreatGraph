export const fmtInt = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString());

export const fmtNum = (v: number | null | undefined, digits = 3) =>
  v == null || Number.isNaN(v) ? "—" : v.toFixed(digits);

export const fmtPct = (v: number | null | undefined, digits = 1) =>
  v == null || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(digits)}%`;

export const fmtBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

export const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const PROTOCOLS: Record<number, string> = { 1: "ICMP", 6: "TCP", 17: "UDP" };

// Categorical palette for communities / clusters (distinguishable on dark backgrounds).
export const PALETTE = [
  "#38bdf8", "#a78bfa", "#34d399", "#fb923c", "#f472b6", "#facc15", "#60a5fa", "#4ade80",
  "#c084fc", "#2dd4bf", "#f87171", "#a3e635", "#e879f9", "#fbbf24", "#22d3ee", "#818cf8",
];
export const colorFor = (i: number) => (i < 0 ? "#64748b" : PALETTE[i % PALETTE.length]);

export const TIER_COLORS = { investigate: "#ef4444", monitor: "#f59e0b", low: "#64748b" } as const;
export const TIER_LABEL = { investigate: "Investigate", monitor: "Monitor", low: "Low" } as const;
