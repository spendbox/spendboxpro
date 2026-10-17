// Pictures of the things in the shop (src/lib/world/items.ts), drawn to look like the real thing:
// the shop list shows them small, and the "It's yours!" pop-up big. Every kind in the shop has its
// own drawing (./art/: watches, things you wear, things for home, the market and museum, cars). A kind that isn't drawn
// (an invention a player made) shows its category's drawing on the category's coloured tile.

import type { ItemCategory } from "@/lib/world/items";
import { ART as CARS } from "./art/cars";
import { ART as HOME } from "./art/home";
import { ART as MARKET } from "./art/market";
import { ART as MORE } from "./art/more";
import { WATCHES, Watch } from "./art/watches";
import { ART as WEAR } from "./art/wear";

/**
 * Points along a hanging necklace: a U from one shoulder (x = cx - w, y = top) down to the front
 * (y = top + drop) and up to the other, spaced evenly along the string, `gap` apart.
 */
function hang(w: number, top: number, drop: number, gap: number, cx = 60): { x: number; y: number }[] {
  const T = 1.25;
  const at = (t: number) => ({ x: cx + (w * Math.sin(t)) / Math.sin(T), y: top + (drop * (Math.cos(t) - Math.cos(T))) / (1 - Math.cos(T)) });
  // Walk the curve finely and drop a point every `gap` along it.
  const out = [at(-T)];
  let last = out[0];
  let walked = 0;
  for (let i = 1; i <= 600; i++) {
    const p = at(-T + (2 * T * i) / 600);
    walked += Math.hypot(p.x - last.x, p.y - last.y);
    last = p;
    if (walked >= gap) {
      out.push(p);
      walked = 0;
    }
  }
  return out;
}

/** Coral bead necklace: three strands of red coral, the chieftaincy kind, with gold spacers and a big bead at the front. */
function CoralBeads({ id }: { id: string }) {
  const strands = [
    { w: 30, top: 12, drop: 46, r: 3.9 },
    { w: 37, top: 13, drop: 61, r: 4.4 },
    { w: 44, top: 14, drop: 76, r: 4.9 },
  ];
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <radialGradient id={`${id}-coral`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ffb4a2" />
          <stop offset="0.35" stopColor="#f2542d" />
          <stop offset="0.8" stopColor="#b3261e" />
          <stop offset="1" stopColor="#7a1712" />
        </radialGradient>
        <radialGradient id={`${id}-gold`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.45" stopColor="#f5c242" />
          <stop offset="1" stopColor="#9a6a0c" />
        </radialGradient>
        <radialGradient id={`${id}-big`} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#ffc6b8" />
          <stop offset="0.4" stopColor="#e8442a" />
          <stop offset="1" stopColor="#6e130f" />
        </radialGradient>
      </defs>
      {strands.map((s, k) =>
        hang(s.w, s.top, s.drop, s.r * 2.05).map((p, i) => {
          const gold = i % 6 === 3;
          return <circle key={`${k}-${i}`} cx={p.x} cy={p.y} r={gold ? s.r * 0.7 : s.r} fill={`url(#${id}-${gold ? "gold" : "coral"})`} stroke="#5c0f0b" strokeWidth="0.4" />;
        }),
      )}
      {/* the big bead hanging at the front, with a gold cap */}
      <rect x="57" y="92" width="6" height="4" rx="1.5" fill={`url(#${id}-gold)`} stroke="#7a5208" strokeWidth="0.4" />
      <ellipse cx="60" cy="105" rx="8" ry="9.5" fill={`url(#${id}-big)`} stroke="#5c0f0b" strokeWidth="0.5" />
      <ellipse cx="57" cy="101" rx="2.2" ry="3" fill="#fff" opacity="0.45" />
    </svg>
  );
}

/** Gold chain: chunky Cuban links, close enough to interlock, hanging in a U. */
function GoldChain({ id }: { id: string }) {
  const pts = hang(42, 12, 86, 6.6);
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6cf" />
          <stop offset="0.3" stopColor="#f7c948" />
          <stop offset="0.55" stopColor="#c8901a" />
          <stop offset="0.8" stopColor="#ffe08a" />
          <stop offset="1" stopColor="#8a5c08" />
        </linearGradient>
      </defs>
      {pts.map((p, i) => {
        const q = pts[Math.min(pts.length - 1, i + 1)];
        const r = pts[Math.max(0, i - 1)];
        const a = (Math.atan2(q.y - r.y, q.x - r.x) * 180) / Math.PI;
        // Links alternate flat and on edge, so it reads as a chain.
        const flat = i % 2 === 0;
        return (
          <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${a})`}>
            <ellipse rx="5.4" ry={flat ? 3.8 : 2} fill="none" stroke="#6b4505" strokeWidth="3.6" />
            <ellipse rx="5.4" ry={flat ? 3.8 : 2} fill="none" stroke={`url(#${id}-g)`} strokeWidth="2.6" />
            {flat && <ellipse cx="-1.8" cy="-1.9" rx="1.7" ry="0.7" fill="#fff" opacity="0.75" />}
          </g>
        );
      })}
    </svg>
  );
}

/** Wristwatch: a steel case, a white dial at ten past ten, and a brown leather strap. */
function Wristwatch({ id }: { id: string }) {
  const ticks = Array.from({ length: 12 }, (_, i) => i);
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-leather`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4a2511" />
          <stop offset="0.5" stopColor="#8b4a22" />
          <stop offset="1" stopColor="#4a2511" />
        </linearGradient>
        <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#c9d1d9" />
          <stop offset="0.6" stopColor="#7d8791" />
          <stop offset="1" stopColor="#e6eaee" />
        </linearGradient>
        <radialGradient id={`${id}-dial`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e3e7ec" />
        </radialGradient>
      </defs>
      {/* strap, top and bottom, with stitching, holes and the buckle */}
      <path d="M45 6 H75 L72 34 H48 Z" fill={`url(#${id}-leather)`} />
      <path d="M48 86 H72 L75 116 H45 Z" fill={`url(#${id}-leather)`} />
      <path
        d="M47.5 9 L50 32 M72.5 9 L70 32 M50 88 L47.5 113 M70 88 L72.5 113"
        stroke="#e8c39e"
        strokeWidth="0.7"
        strokeDasharray="2 1.6"
        opacity="0.8"
      />
      {[96, 102, 108].map((y) => (
        <ellipse key={y} cx="60" cy={y} rx="1.4" ry="1" fill="#2b1408" />
      ))}
      <rect
        x="49"
        y="4"
        width="22"
        height="5"
        rx="2"
        fill="none"
        stroke={`url(#${id}-steel)`}
        strokeWidth="2"
      />
      {/* lugs and crown */}
      <rect
        x="44"
        y="30"
        width="32"
        height="10"
        rx="3"
        fill={`url(#${id}-steel)`}
      />
      <rect
        x="44"
        y="80"
        width="32"
        height="10"
        rx="3"
        fill={`url(#${id}-steel)`}
      />
      <rect
        x="87"
        y="56"
        width="7"
        height="8"
        rx="2"
        fill={`url(#${id}-steel)`}
        stroke="#6c757d"
        strokeWidth="0.5"
      />
      {/* case, bezel, dial */}
      <circle
        cx="60"
        cy="60"
        r="29"
        fill={`url(#${id}-steel)`}
        stroke="#6c757d"
        strokeWidth="0.8"
      />
      <circle
        cx="60"
        cy="60"
        r="24.5"
        fill={`url(#${id}-dial)`}
        stroke="#9aa4ae"
        strokeWidth="0.8"
      />
      {ticks.map((i) => {
        const a = (i * Math.PI) / 6;
        const big = i % 3 === 0;
        const r1 = big ? 17.5 : 19.5;
        return (
          <line
            key={i}
            x1={60 + Math.sin(a) * r1}
            y1={60 - Math.cos(a) * r1}
            x2={60 + Math.sin(a) * 22}
            y2={60 - Math.cos(a) * 22}
            stroke="#1f2933"
            strokeWidth={big ? 2.2 : 1}
            strokeLinecap="round"
          />
        );
      })}
      <text
        x="60"
        y="49"
        textAnchor="middle"
        fontSize="4"
        fontWeight="700"
        fill="#1f2933"
        fontFamily="Georgia, serif"
        letterSpacing="0.6"
      >
        NEWTOWN
      </text>
      {/* ten past ten */}
      <line
        x1="60"
        y1="60"
        x2={60 + Math.sin(-1.05) * 13}
        y2={60 - Math.cos(-1.05) * 13}
        stroke="#1f2933"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1="60"
        y1="60"
        x2={60 + Math.sin(1.05) * 19}
        y2={60 - Math.cos(1.05) * 19}
        stroke="#1f2933"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="60"
        y1="66"
        x2="60"
        y2="38"
        stroke="#d6336c"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      <circle cx="60" cy="60" r="2" fill="#1f2933" />
      {/* the glass catching the light */}
      <path
        d="M44 48 A20 20 0 0 1 62 37"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

const DRAWN: Partial<
  Record<string, (p: { id: string }) => React.ReactElement>
> = {
  beads: CoralBeads,
  gold_chain: GoldChain,
  wristwatch: Wristwatch,
  ...Object.fromEntries(Object.entries(WATCHES).map(([k, style]) => [k, ({ id }: { id: string }) => <Watch id={id} s={style} />])),
  ...WEAR,
  ...HOME,
  ...MORE,
  ...MARKET,
  ...CARS,
};

/** Each category's own picture (a kind that stands for it) and tile colours, for things not drawn. */
const CATEGORY_SIGN: Record<ItemCategory, { kind: string; from: string; to: string }> = {
  jewellery: { kind: "gold_chain", from: "#fff3bf", to: "#ffd43b" },
  clothing: { kind: "ankara", from: "#e7f5ff", to: "#a5d8ff" },
  book: { kind: "novel", from: "#fff4e6", to: "#ffc078" },
  gadget: { kind: "smartphone", from: "#f3f0ff", to: "#b197fc" },
  home: { kind: "fan", from: "#ebfbee", to: "#8ce99a" },
  art: { kind: "painting", from: "#fff0f6", to: "#faa2c1" },
  fitness: { kind: "dumbbells", from: "#e6fcf5", to: "#63e6be" },
  car: { kind: "car_corolla", from: "#f1f3f5", to: "#adb5bd" },
};

/** Whether a kind has its own picture yet. */
export const hasItemArt = (kind: string) => kind in DRAWN;

/** A thing's picture: its own drawing, or its category's sign on a coloured tile. */
export function ItemArt({
  kind,
  category,
  size = 48,
  className,
}: {
  kind: string;
  category: ItemCategory;
  size?: number;
  className?: string;
}) {
  const own = DRAWN[kind];
  const c = CATEGORY_SIGN[category];
  const Drawn = own ?? DRAWN[c.kind];
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-2xl ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: own ? "radial-gradient(circle at 50% 40%, #ffffff, #f1f3f5)" : `linear-gradient(145deg, ${c.from}, ${c.to})`,
      }}
    >
      {Drawn && (
        <span className={own ? "size-full" : "size-[78%]"}>
          <Drawn id={`art-${kind}-${size}`} />
        </span>
      )}
    </span>
  );
}
