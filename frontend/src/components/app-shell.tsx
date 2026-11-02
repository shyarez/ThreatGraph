"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Database, History, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { SatelliteIcon } from "@/components/space-art";

const NAV = [
  { href: "/", label: "Mission Control", icon: LayoutDashboard },
  { href: "/datasets", label: "Datasets & Runs", icon: Database },
  { href: "/history", label: "Investigation Log", icon: History },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => api.health().then(() => setOnline(true)).catch(() => setOnline(false));
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar backdrop-blur-xl max-md:hidden">
        <Link href="/" className="group flex items-center gap-3 px-5 py-6">
          <SatelliteIcon className="size-9 drop-shadow-[0_0_10px_rgba(125,211,252,0.45)]" />
          <div>
            <div className="font-display text-base font-bold text-glow">Threat<span className="text-primary">Graph</span></div>
            <div className="mt-1 text-[11px] text-muted-foreground">Coordinated intrusion analysis</div>
          </div>
        </Link>
        <nav className="flex flex-col gap-1.5 px-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
                  active
                    ? "bg-[#6b8bb3]/25 text-white shadow-[inset_0_0_0_1px_rgba(150,170,200,0.4),0_0_20px_-6px_rgba(110,160,210,0.9)]"
                    : "text-muted-foreground hover:bg-[#6b8bb3]/12 hover:text-foreground",
                )}
              >
                {active && <span className="absolute -left-3 top-1/2 h-6 w-1.5 -translate-y-1/2 bg-primary" />}
                <Icon className={cn("size-4", active && "text-primary")} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-5 py-5">
          <div className="rounded-lg border border-sidebar-border bg-black/20 px-3 py-2.5 text-xs">
            <div className="font-display text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Ground link</div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="relative flex size-2.5">
                {online && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
                <span
                  className={cn(
                    "relative inline-flex size-2.5 rounded-full",
                    online == null ? "bg-slate-500" : online ? "bg-emerald-400" : "bg-red-500",
                  )}
                />
              </span>
              API {online == null ? "checking…" : online ? "connected" : "offline"}
            </div>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-sidebar-border bg-sidebar px-4 py-3 backdrop-blur-xl md:hidden">
          <SatelliteIcon className="size-7" />
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} className="text-sm text-muted-foreground">
              {label}
            </Link>
          ))}
        </header>
        <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 md:p-8">
          <div key={pathname} className="animate-page-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
