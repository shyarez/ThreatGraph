"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Landing intro shown on every full page load: orbital rings sweep in, the title
 * "decrypts" from random glyphs, and a short boot sequence runs before the app is revealed.
 * Client-side navigation keeps the layout mounted, so it doesn't replay between pages.
 * Click or press any key to skip. Skipped for reduced-motion users (an inline script in
 * the layout hides it before first paint).
 */

const TITLE = "THREATGRAPH";
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@<>/\\[]{}=+*";
const BOOT = ["Ingesting network flows", "Isolation Forest armed", "DBSCAN clustering ready", "Louvain graph online"];
const DURATION = 3600;

export function Intro() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [title, setTitle] = useState(() => TITLE.replace(/./g, " "));
  const [progress, setProgress] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = useCallback(() => {
    setLeaving(true);
    timers.current.push(setTimeout(() => setVisible(false), 650));
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(false);
      return;
    }

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = now - start;
      // Decrypt: each letter scrambles, then locks in left-to-right between 500ms and 1700ms.
      setTitle(
        TITLE.split("")
          .map((ch, i) => {
            const lockAt = 500 + i * 110;
            if (t >= lockAt) return ch;
            if (t < 250 + i * 40) return " ";
            return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          })
          .join(""),
      );
      setProgress(Math.min(1, Math.max(0, (t - 1500) / 1700)));
      if (t < DURATION) raf = requestAnimationFrame(tick);
      else finish();
    };
    raf = requestAnimationFrame(tick);

    const skip = () => finish();
    window.addEventListener("keydown", skip);
    const pending = timers.current;
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", skip);
      pending.forEach(clearTimeout);
    };
  }, [finish]);

  if (!visible) return null;
  const bootStep = Math.min(BOOT.length - 1, Math.floor(progress * BOOT.length));

  return (
    <div
      className="tg-intro fixed inset-0 z-[100] flex cursor-pointer items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(2,3,10,0.55),#02030a_70%)]"
      style={leaving ? { animation: "intro-exit 0.65s ease-in forwards" } : undefined}
      onClick={finish}
      role="presentation"
    >
      {/* sweeping scan line */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-transparent via-[#7dd3fc]/10 to-transparent"
        style={{ animation: "intro-scan 2.6s ease-in-out 0.2s both" }}
      />

      {/* orbital rings */}
      <svg viewBox="-200 -200 400 400" className="pointer-events-none absolute size-[min(92vw,640px)]" aria-hidden>
        <g style={{ animation: "intro-ring 2.2s cubic-bezier(0.2,0.7,0.2,1) both", transformOrigin: "0 0" }}>
          <circle r="190" fill="none" stroke="rgba(148,190,230,0.22)" strokeDasharray="1 7" />
          <circle r="150" fill="none" stroke="rgba(148,190,230,0.35)" strokeDasharray="60 14 4 14" />
          <circle cx="150" cy="0" r="3" fill="#7dd3fc" />
        </g>
        <g style={{ animation: "intro-ring 2.6s cubic-bezier(0.2,0.7,0.2,1) 0.15s both", transformOrigin: "0 0" }}>
          <ellipse rx="175" ry="62" fill="none" stroke="rgba(255,210,63,0.45)" strokeWidth="1.2" transform="rotate(-16)" />
          <circle cx="-168" cy="48" r="2.5" fill="#ffd23f" />
        </g>
      </svg>

      <div className="relative flex flex-col items-center px-6 text-center">
        <div
          className="mb-6 h-px w-[min(70vw,420px)] origin-center bg-gradient-to-r from-transparent via-[#7dd3fc] to-transparent"
          style={{ animation: "intro-line 0.9s ease-out 0.3s both" }}
        />
        <h1
          className="font-display text-4xl font-black text-white text-glow sm:text-6xl"
          style={{ animation: "intro-zoom 1.1s cubic-bezier(0.2,0.7,0.2,1) both", letterSpacing: "0.18em" }}
          aria-label={TITLE}
        >
          {title.split("").map((ch, i) => (
            <span key={i} className={i >= 6 ? "text-primary" : undefined} style={{ display: "inline-block", minWidth: "0.7em" }}>
              {ch === " " ? " " : ch}
            </span>
          ))}
        </h1>
        <p
          className="mt-5 font-display text-[11px] uppercase text-[#9fb3cc] sm:text-xs"
          style={{ animation: "intro-fade-up 0.9s ease-out 1.5s both", letterSpacing: "0.35em" }}
        >
          Coordinated intrusion detection
        </p>

        <div className="mt-10 w-[min(70vw,320px)]" style={{ animation: "intro-fade-up 0.6s ease-out 1.6s both" }}>
          <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-widest text-[#7d8aa0]">
            <span>{progress >= 1 ? "Systems online" : BOOT[bootStep]}</span>
            <span className="tabular-nums">{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-[3px] overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#7dd3fc] to-[#ffd23f]" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
        className="absolute bottom-6 right-6 font-display text-[10px] uppercase tracking-[0.3em] text-[#7d8aa0] transition-colors hover:text-white"
      >
        Skip ›
      </button>
    </div>
  );
}
