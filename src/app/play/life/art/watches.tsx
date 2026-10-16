// Watches for the shop (../item-art.tsx): one watch, drawn carefully, and the details that tell a
// diver from a chronograph from an octagon: the case's shape, the metal, the dial, the bezel, small
// dials, and the strap or bracelet. No brand's marks: each is drawn to read as its kind.

type Metal = "steel" | "gold" | "rose" | "platinum" | "black";
type WatchStyle = {
  shape: "round" | "octagon" | "tonneau" | "cushion";
  metal: Metal;
  dial: string;
  /** The ring around the glass. */
  bezel?: "plain" | "diver" | "tachy" | "fluted" | "screws";
  /** Small dials (chronographs). */
  subdials?: 0 | 2 | 3;
  strap: "leather" | "links" | "integrated" | "rubber" | "president";
  strapColour?: string;
  /** A date window at three. */
  date?: boolean;
  /** Little diamonds instead of hour marks. */
  diamonds?: boolean;
  /** The dial cut away to show the movement (skeleton). */
  skeleton?: boolean;
  /** A small seconds dial at six instead of a seconds hand. */
  smallSeconds?: boolean;
  /** Tapisserie grid on the dial. */
  grid?: boolean;
  /** Horizontal ridges on the dial. */
  ridges?: boolean;
};

const METALS: Record<Metal, [string, string, string, string]> = {
  steel: ["#ffffff", "#c9d1d9", "#7d8791", "#e6eaee"],
  gold: ["#fff6cf", "#f2c14e", "#a8740f", "#ffe08a"],
  rose: ["#ffe7dc", "#e8a58a", "#a2604a", "#f6c7b3"],
  platinum: ["#ffffff", "#dde3ea", "#9aa4b1", "#f1f4f8"],
  black: ["#6b7280", "#30343b", "#0f1115", "#4b5058"],
};

function Defs({ id, s }: { id: string; s: WatchStyle }) {
  const m = METALS[s.metal];
  return (
    <defs>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={m[0]} />
        <stop offset="0.35" stopColor={m[1]} />
        <stop offset="0.62" stopColor={m[2]} />
        <stop offset="1" stopColor={m[3]} />
      </linearGradient>
      <linearGradient id={`${id}-metalH`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={m[2]} />
        <stop offset="0.5" stopColor={m[0]} />
        <stop offset="1" stopColor={m[2]} />
      </linearGradient>
      <radialGradient id={`${id}-sheen`} cx="35%" cy="30%" r="70%">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
        <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${id}-strap`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={s.strapColour ?? "#4a2511"} stopOpacity="1" />
        <stop offset="0.5" stopColor={s.strapColour ?? "#8b4a22"} stopOpacity="0.8" />
        <stop offset="1" stopColor={s.strapColour ?? "#4a2511"} stopOpacity="1" />
      </linearGradient>
    </defs>
  );
}

/** The bracelet or strap above and below the case. */
function Strap({ id, s }: { id: string; s: WatchStyle }) {
  if (s.strap === "leather" || s.strap === "rubber") {
    const dark = s.strap === "rubber" ? (s.strapColour ?? "#1f2328") : undefined;
    return (
      <g>
        <path d="M46 4 H74 L71 34 H49 Z" fill={dark ?? `url(#${id}-strap)`} />
        <path d="M49 86 H71 L74 116 H46 Z" fill={dark ?? `url(#${id}-strap)`} />
        {s.strap === "leather" ? (
          <path d="M48.5 7 L51 32 M71.5 7 L69 32 M51 88 L48.5 113 M69 88 L71.5 113" stroke="#e8c39e" strokeWidth="0.7" strokeDasharray="2 1.6" opacity="0.8" />
        ) : (
          [10, 16, 22, 96, 102, 108].map((y) => <rect key={y} x="52" y={y} width="16" height="2.2" rx="1.1" fill="#000" opacity="0.25" />)
        )}
      </g>
    );
  }
  // Metal: rows of links, three across (oyster), five (president), or tapering (integrated).
  const rows = [6, 13, 20, 27, 88, 95, 102, 109];
  return (
    <g>
      {rows.map((y) => {
        const w = s.strap === "integrated" ? (y < 60 ? 22 + (y - 6) * 0.35 : 31 - (y - 88) * 0.35) : 24;
        const x = 60 - w / 2;
        return (
          <g key={y}>
            <rect x={x} y={y} width={w} height="6.4" rx="1.4" fill={`url(#${id}-metalH)`} stroke="#00000033" strokeWidth="0.5" />
            {s.strap === "links" && <rect x={60 - w / 6} y={y + 0.4} width={w / 3} height="5.6" rx="1" fill={`url(#${id}-metal)`} opacity="0.9" />}
            {s.strap === "president" &&
              [0, 1, 2].map((k) => <rect key={k} x={x + w * (0.18 + k * 0.25)} y={y + 0.6} width={w * 0.2} height="5.2" rx="2.2" fill={`url(#${id}-metal)`} />)}
          </g>
        );
      })}
    </g>
  );
}

/** The case outline for each shape, centred on (60, 60). */
function casePath(shape: WatchStyle["shape"], r: number) {
  if (shape === "octagon") {
    const pts = Array.from({ length: 8 }, (_, i) => {
      const a = ((i + 0.5) * Math.PI) / 4;
      return `${60 + Math.cos(a) * r},${60 + Math.sin(a) * r}`;
    });
    return `M${pts.join(" L")} Z`;
  }
  if (shape === "tonneau") return `M${60 - r * 0.78},${60 - r} Q60,${60 - r * 1.12} ${60 + r * 0.78},${60 - r} Q${60 + r * 0.98},60 ${60 + r * 0.78},${60 + r} Q60,${60 + r * 1.12} ${60 - r * 0.78},${60 + r} Q${60 - r * 0.98},60 ${60 - r * 0.78},${60 - r} Z`;
  if (shape === "cushion") return `M${60 - r * 0.85},${60 - r * 0.85} Q60,${60 - r * 1.08} ${60 + r * 0.85},${60 - r * 0.85} Q${60 + r * 1.08},60 ${60 + r * 0.85},${60 + r * 0.85} Q60,${60 + r * 1.08} ${60 - r * 0.85},${60 + r * 0.85} Q${60 - r * 1.08},60 ${60 - r * 0.85},${60 - r * 0.85} Z`;
  return `M${60 - r},60 A${r},${r} 0 1 0 ${60 + r},60 A${r},${r} 0 1 0 ${60 - r},60 Z`;
}

export function Watch({ id, s }: { id: string; s: WatchStyle }) {
  const ink = s.dial === "#f4f1ea" || s.dial === "#ffffff" || s.dial === "#e9ecef" ? "#1f2933" : "#f8f9fa";
  const hands = s.metal === "gold" || s.metal === "rose" ? `url(#${id}-metal)` : ink;
  const dialR = s.shape === "round" ? 22 : 21;
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <Defs id={id} s={s} />
      <Strap id={id} s={s} />
      {/* lugs and crown */}
      <rect x="45" y="30" width="30" height="10" rx="3" fill={`url(#${id}-metal)`} />
      <rect x="45" y="80" width="30" height="10" rx="3" fill={`url(#${id}-metal)`} />
      <rect x="87" y="55" width="7" height="10" rx="2" fill={`url(#${id}-metal)`} stroke="#00000044" strokeWidth="0.5" />
      {(s.subdials ?? 0) > 0 && (
        <>
          <rect x="85" y="44" width="6" height="5" rx="1.5" fill={`url(#${id}-metal)`} />
          <rect x="85" y="71" width="6" height="5" rx="1.5" fill={`url(#${id}-metal)`} />
        </>
      )}
      {/* case */}
      <path d={casePath(s.shape, 29)} fill={`url(#${id}-metal)`} stroke="#00000055" strokeWidth="0.8" />
      {/* bezel */}
      {s.bezel === "diver" && <circle cx="60" cy="60" r="26.5" fill="#14213d" stroke="#00000066" strokeWidth="0.5" />}
      {s.bezel === "diver" &&
        Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return <circle key={i} cx={60 + Math.sin(a) * 24.8} cy={60 - Math.cos(a) * 24.8} r={i === 0 ? 1.5 : 0.8} fill="#f8f9fa" />;
        })}
      {s.bezel === "tachy" && <circle cx="60" cy="60" r="26.5" fill="#1f2328" />}
      {s.bezel === "tachy" &&
        Array.from({ length: 24 }, (_, i) => {
          const a = (i * Math.PI) / 12;
          return <line key={i} x1={60 + Math.sin(a) * 24} y1={60 - Math.cos(a) * 24} x2={60 + Math.sin(a) * 26} y2={60 - Math.cos(a) * 26} stroke="#e9ecef" strokeWidth="0.6" />;
        })}
      {s.bezel === "fluted" &&
        Array.from({ length: 36 }, (_, i) => {
          const a = (i * Math.PI) / 18;
          return <line key={i} x1={60 + Math.sin(a) * 23.5} y1={60 - Math.cos(a) * 23.5} x2={60 + Math.sin(a) * 27.5} y2={60 - Math.cos(a) * 27.5} stroke="#00000040" strokeWidth="1" />;
        })}
      {s.bezel === "screws" &&
        Array.from({ length: 8 }, (_, i) => {
          const a = ((i + 0.5) * Math.PI) / 4;
          return (
            <g key={i}>
              <circle cx={60 + Math.cos(a) * 25.5} cy={60 + Math.sin(a) * 25.5} r="1.6" fill={`url(#${id}-metalH)`} stroke="#00000066" strokeWidth="0.4" />
              <line x1={60 + Math.cos(a) * 25.5 - 1} y1={60 + Math.sin(a) * 25.5} x2={60 + Math.cos(a) * 25.5 + 1} y2={60 + Math.sin(a) * 25.5} stroke="#00000088" strokeWidth="0.5" />
            </g>
          );
        })}
      {/* dial */}
      <path d={casePath(s.shape === "octagon" ? "round" : s.shape, dialR)} fill={s.dial} stroke="#00000033" strokeWidth="0.6" />
      <path d={casePath(s.shape === "octagon" ? "round" : s.shape, dialR)} fill={`url(#${id}-sheen)`} />
      {s.grid &&
        Array.from({ length: 9 }, (_, i) => (
          <g key={i} opacity="0.22">
            <line x1={42 + i * 4.5} y1="40" x2={42 + i * 4.5} y2="80" stroke="#000" strokeWidth="0.5" />
            <line x1="40" y1={42 + i * 4.5} x2="80" y2={42 + i * 4.5} stroke="#000" strokeWidth="0.5" />
          </g>
        ))}
      {s.ridges && Array.from({ length: 8 }, (_, i) => <line key={i} x1="41" y1={44 + i * 4.5} x2="79" y2={44 + i * 4.5} stroke="#ffffff" strokeWidth="0.5" opacity="0.25" />)}
      {s.skeleton && (
        <g opacity="0.9">
          <circle cx="60" cy="60" r="14" fill="none" stroke={`url(#${id}-metal)`} strokeWidth="2.5" />
          {[0, 1, 2, 3, 4].map((k) => {
            const a = (k * 2 * Math.PI) / 5;
            return <line key={k} x1="60" y1="60" x2={60 + Math.cos(a) * 14} y2={60 + Math.sin(a) * 14} stroke={`url(#${id}-metal)`} strokeWidth="1.6" />;
          })}
          <circle cx="51" cy="69" r="4" fill="none" stroke="#d6336c" strokeWidth="1.2" />
          <circle cx="69" cy="51" r="3" fill="#d6336c" opacity="0.8" />
        </g>
      )}
      {/* hour marks */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        const big = i % 3 === 0;
        if (s.date && i === 3) return null;
        if (s.diamonds) return <circle key={i} cx={60 + Math.sin(a) * 18.5} cy={60 - Math.cos(a) * 18.5} r={big ? 1.6 : 1.1} fill="#ffffff" stroke="#9ec5fe" strokeWidth="0.4" />;
        return (
          <line
            key={i}
            x1={60 + Math.sin(a) * (big ? 15.5 : 17.5)}
            y1={60 - Math.cos(a) * (big ? 15.5 : 17.5)}
            x2={60 + Math.sin(a) * 20}
            y2={60 - Math.cos(a) * 20}
            stroke={s.metal === "gold" || s.metal === "rose" ? `url(#${id}-metal)` : ink}
            strokeWidth={big ? 2.4 : 1.1}
            strokeLinecap="round"
          />
        );
      })}
      {/* small dials */}
      {(s.subdials ?? 0) >= 2 && (
        <>
          <circle cx="51" cy="61" r="5.2" fill="#00000022" stroke={ink} strokeWidth="0.5" />
          <circle cx="69" cy="61" r="5.2" fill="#00000022" stroke={ink} strokeWidth="0.5" />
          <line x1="51" y1="61" x2="51" y2="57" stroke={ink} strokeWidth="0.8" />
          <line x1="69" y1="61" x2="72" y2="59" stroke={ink} strokeWidth="0.8" />
        </>
      )}
      {(s.subdials ?? 0) === 3 && <circle cx="60" cy="71" r="5.2" fill="#00000022" stroke={ink} strokeWidth="0.5" />}
      {s.smallSeconds && <circle cx="60" cy="70" r="5" fill="none" stroke={ink} strokeWidth="0.6" />}
      {s.date && (
        <>
          <rect x="72" y="57.5" width="7" height="5" rx="0.6" fill="#ffffff" stroke="#00000044" strokeWidth="0.4" />
          <text x="75.5" y="61.6" textAnchor="middle" fontSize="3.6" fontWeight="700" fill="#1f2933" fontFamily="Arial, sans-serif">
            16
          </text>
        </>
      )}
      {/* ten past ten */}
      <line x1="60" y1="60" x2={60 + Math.sin(-1.05) * 12} y2={60 - Math.cos(-1.05) * 12} stroke={hands} strokeWidth="2.6" strokeLinecap="round" />
      <line x1="60" y1="60" x2={60 + Math.sin(1.05) * 17.5} y2={60 - Math.cos(1.05) * 17.5} stroke={hands} strokeWidth="1.7" strokeLinecap="round" />
      {!s.smallSeconds && <line x1="60" y1="65" x2="60" y2="41" stroke={s.bezel === "diver" ? "#e03131" : "#d6336c"} strokeWidth="0.7" strokeLinecap="round" />}
      <circle cx="60" cy="60" r="1.8" fill={hands} />
      {/* the glass catching the light */}
      <path d="M45 50 A18 18 0 0 1 62 40" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

export const WATCHES: Record<string, WatchStyle> = {
  luxury_watch: { shape: "round", metal: "gold", dial: "#f4f1ea", bezel: "plain", strap: "leather", strapColour: "#2b1408", date: true },
  rolex_submariner: { shape: "round", metal: "steel", dial: "#111418", bezel: "diver", strap: "links", date: true },
  rolex_daytona: { shape: "round", metal: "gold", dial: "#e9ecef", bezel: "tachy", subdials: 3, strap: "links" },
  ap_royal_oak: { shape: "octagon", metal: "steel", dial: "#1d3557", bezel: "screws", strap: "integrated", grid: true, date: true },
  rolex_day_date: { shape: "round", metal: "platinum", dial: "#a8dadc", bezel: "fluted", strap: "president" },
  patek_nautilus: { shape: "cushion", metal: "steel", dial: "#1f3a5f", strap: "integrated", ridges: true, date: true },
  richard_mille: { shape: "tonneau", metal: "black", dial: "#2b2d31", bezel: "screws", strap: "rubber", strapColour: "#e03131", skeleton: true },
  patek_grandmaster: { shape: "round", metal: "rose", dial: "#f4f1ea", bezel: "plain", strap: "leather", strapColour: "#1b1b1b", smallSeconds: true, diamonds: true },
};
