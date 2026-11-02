/** Pixel-art space illustrations (pure SVG + CSS animation, no JS). */

export function SatelliteIcon({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} shapeRendering="crispEdges" aria-hidden>
      <g fill="#2b3a8f">
        <rect x="1" y="12" width="9" height="8" />
        <rect x="22" y="12" width="9" height="8" />
      </g>
      <g fill="#5c7bff">
        <rect x="2" y="13" width="2" height="6" /><rect x="5" y="13" width="2" height="6" /><rect x="8" y="13" width="1" height="6" />
        <rect x="23" y="13" width="2" height="6" /><rect x="26" y="13" width="2" height="6" /><rect x="29" y="13" width="1" height="6" />
      </g>
      <rect x="10" y="15" width="2" height="2" fill="#9aa3c7" />
      <rect x="20" y="15" width="2" height="2" fill="#9aa3c7" />
      <rect x="12" y="11" width="8" height="10" fill="#e4e6f5" />
      <rect x="14" y="13" width="4" height="4" fill="#ffd23f" />
      <rect x="15" y="7" width="2" height="4" fill="#9aa3c7" />
      <rect x="13" y="5" width="6" height="2" fill="#e4e6f5" />
      <rect x="15" y="22" width="2" height="2" fill="#5ce1e6" className="animate-blink" />
    </svg>
  );
}

const ORBITS = [
  { r: 70, dur: "18s", sats: [{ a: 0, c: "#5ce1e6" }, { a: 180, c: "#ff6bd6" }] },
  { r: 112, dur: "32s", rev: true, sats: [{ a: 60, c: "#ffd23f" }, { a: 200, c: "#7cf2a6" }, { a: 300, c: "#9fc3e6" }] },
  { r: 152, dur: "48s", sats: [{ a: 120, c: "#5ce1e6" }, { a: 260, c: "#ff8a5c" }] },
];

/**
 * A planet with three rotating orbits of glowing nodes. Inner nodes beam to the planet;
 * this mirrors ThreatGraph: entities linked around a shared target.
 */
export function OrbitalNetwork({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="-180 -180 360 360" className={className} aria-hidden>
      <defs>
        <radialGradient id="planet" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#cfe3f5" />
          <stop offset="45%" stopColor="#6b8bb3" />
          <stop offset="100%" stopColor="#0b1424" />
        </radialGradient>
        <radialGradient id="halo">
          <stop offset="55%" stopColor="#6b8bb3" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#6b8bb3" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle r="72" fill="url(#halo)" />
      {ORBITS.map((o) => (
        <circle key={o.r} r={o.r} fill="none" stroke="rgba(150,170,200,0.28)" strokeDasharray="2 6" />
      ))}

      {/* detection pulses from the planet */}
      <circle r="38" fill="none" stroke="#ffd23f" strokeOpacity="0.6" className="pulse-ring" />
      <circle r="38" fill="none" stroke="#5ce1e6" strokeOpacity="0.5" className="pulse-ring" style={{ animationDelay: "1.2s" }} />

      {/* planet + ring */}
      <circle r="38" fill="url(#planet)" />
      <g shapeRendering="crispEdges" fill="#ffffff" opacity="0.18">
        <rect x="-20" y="-14" width="10" height="4" /><rect x="4" y="-24" width="8" height="4" />
        <rect x="-8" y="8" width="14" height="4" /><rect x="12" y="2" width="6" height="4" />
      </g>
      <ellipse rx="60" ry="12" fill="none" stroke="#ffd23f" strokeOpacity="0.7" strokeWidth="3" transform="rotate(-18)" />

      {ORBITS.map((o) => (
        <g key={o.r} className={o.rev ? "animate-orbit-rev" : "animate-orbit"} style={{ ["--dur" as string]: o.dur, transformOrigin: "0 0" }}>
          {o.sats.map((s, i) => {
            const rad = (s.a * Math.PI) / 180;
            const x = Math.cos(rad) * o.r, y = Math.sin(rad) * o.r;
            return (
              <g key={i}>
                {o.r < 120 && (
                  <line x1={x} y1={y} x2={x * 0.33} y2={y * 0.33} stroke={s.c} strokeOpacity="0.55" strokeWidth="1.5" className="animate-beam" />
                )}
                <g transform={`translate(${x} ${y})`}>
                  <circle r="10" fill={s.c} opacity="0.14" />
                  <circle r="3.5" fill={s.c} />
                  <circle r="1.5" fill="#ffffff" />
                </g>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
