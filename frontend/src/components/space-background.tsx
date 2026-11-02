"use client";

import { useEffect, useRef } from "react";

/**
 * Full-screen night sky: stars at three depths that twinkle and drift very slowly, with a
 * rare shooting star. Renders a single static frame when the user prefers reduced motion.
 */

type Star = { x: number; y: number; r: number; depth: number; phase: number; speed: number; color: string };
type Shooting = { x: number; y: number; vx: number; vy: number; life: number };

const STAR_COLORS = ["#ffffff", "#ffffff", "#ffffff", "#dbe7ff", "#cfe3ff", "#fff4dc"];

export function SpaceBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0, h = 0;
    let stars: Star[] = [];
    const shooting: Shooting[] = [];
    let raf = 0;
    let nextShoot = 6000;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    function seed() {
      const count = Math.min(520, Math.floor((w * h) / 3200));
      stars = Array.from({ length: count }, () => {
        const depth = Math.random();
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          r: depth > 0.92 ? rand(1.1, 1.6) : depth > 0.6 ? rand(0.6, 1.0) : rand(0.3, 0.6),
          depth,
          phase: Math.random() * Math.PI * 2,
          speed: rand(0.4, 1.8),
          color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
        };
      });
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function frame(t: number) {
      const c = ctx!;
      c.clearRect(0, 0, w, h);

      for (const st of stars) {
        const drift = reduced ? 0 : (t * 0.0025 * (0.15 + st.depth)) % w;
        let x = st.x - drift;
        if (x < 0) x += w;
        const tw = reduced ? 0.8 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(st.phase + (t / 1000) * st.speed));
        c.globalAlpha = tw * (0.3 + 0.7 * st.depth);
        c.fillStyle = st.color;
        c.beginPath();
        c.arc(x, st.y, st.r, 0, Math.PI * 2);
        c.fill();
        // soft glow + cross flare on the brightest stars at their peak
        if (st.r > 1.1 && tw > 0.85) {
          const g = c.createRadialGradient(x, st.y, 0, x, st.y, st.r * 6);
          g.addColorStop(0, "rgba(200,225,255,0.35)");
          g.addColorStop(1, "rgba(200,225,255,0)");
          c.globalAlpha = (tw - 0.85) * 6;
          c.fillStyle = g;
          c.fillRect(x - st.r * 6, st.y - st.r * 6, st.r * 12, st.r * 12);
          c.fillStyle = "#ffffff";
          c.fillRect(x - st.r * 4, st.y - 0.25, st.r * 8, 0.5);
          c.fillRect(x - 0.25, st.y - st.r * 4, 0.5, st.r * 8);
        }
      }
      c.globalAlpha = 1;

      if (!reduced) {
        if (t > nextShoot) {
          shooting.push({ x: rand(w * 0.35, w), y: rand(-20, h * 0.35), vx: -rand(7, 10), vy: rand(2.5, 4), life: 1 });
          nextShoot = t + rand(9000, 18000);
        }
        for (let k = shooting.length - 1; k >= 0; k--) {
          const s = shooting[k];
          s.x += s.vx;
          s.y += s.vy;
          s.life -= 0.02;
          if (s.life <= 0) {
            shooting.splice(k, 1);
            continue;
          }
          const grad = c.createLinearGradient(s.x, s.y, s.x - s.vx * 14, s.y - s.vy * 14);
          grad.addColorStop(0, `rgba(255,255,255,${s.life})`);
          grad.addColorStop(1, "rgba(255,255,255,0)");
          c.strokeStyle = grad;
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(s.x, s.y);
          c.lineTo(s.x - s.vx * 14, s.y - s.vy * 14);
          c.stroke();
        }
        raf = requestAnimationFrame(frame);
      }
    }

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0" />;
}
