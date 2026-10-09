import { useId } from "react";
import type { HouseDesign, HouseInterior, HouseStyle } from "@/lib/houses";

// A flat, friendly drawing of a player's house: the chosen style, wall and roof colours, a peek at
// the room style through the windows, and the name on a little sign in the front garden.
// Plain SVG, no images to download, so it's instant and stays sharp at any size.

// ---------------------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------------------

function rgb(hex: string): [number, number, number] {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(/^[0-9a-f]{6}$/i.test(h) ? h : "888888", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** a mixed towards b by t (0 = a, 1 = b). */
function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}
const dark = (c: string, t: number) => mix(c, "#18202b", t);
const light = (c: string, t: number) => mix(c, "#ffffff", t);

/** The light in the windows, by room style. */
const PANE: Record<HouseInterior, string> = {
  living: "#fff1b8",
  lounge: "#ffc98f",
  studio: "#d7efff",
  party: "#f1c4fb",
  dining: "#ffdcae",
};

// ---------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------

/** What you can see through a window: a hint of the room inside. */
function Peek({ x, y, w, h, kind }: { x: number; y: number; w: number; h: number; kind: HouseInterior }) {
  const ink = dark(PANE[kind], 0.5);
  switch (kind) {
    case "living": // a sofa
      return (
        <g fill={ink}>
          <rect x={x + w * 0.2} y={y + h * 0.5} width={w * 0.6} height={h * 0.18} rx={1.5} />
          <rect x={x + w * 0.16} y={y + h * 0.6} width={w * 0.68} height={h * 0.22} rx={1.5} />
        </g>
      );
    case "lounge": // a low lamp and a bar stool
      return (
        <g fill={ink}>
          <path d={`M${x + w * 0.22} ${y + h * 0.5} h${w * 0.26} l${-w * 0.06} ${-h * 0.2} h${-w * 0.14} z`} />
          <rect x={x + w * 0.34} y={y + h * 0.5} width={w * 0.03 + 0.6} height={h * 0.36} />
          <rect x={x + w * 0.58} y={y + h * 0.56} width={w * 0.2} height={h * 0.06} rx={1} />
          <rect x={x + w * 0.665} y={y + h * 0.6} width={w * 0.03 + 0.6} height={h * 0.26} />
        </g>
      );
    case "studio": // a desk and a screen
      return (
        <g fill={ink}>
          <rect x={x + w * 0.36} y={y + h * 0.3} width={w * 0.3} height={h * 0.24} rx={1} />
          <rect x={x + w * 0.14} y={y + h * 0.62} width={w * 0.72} height={h * 0.07} />
          <rect x={x + w * 0.2} y={y + h * 0.66} width={w * 0.04 + 0.6} height={h * 0.22} />
          <rect x={x + w * 0.76} y={y + h * 0.66} width={w * 0.04 + 0.6} height={h * 0.22} />
        </g>
      );
    case "party": // a mirror ball and coloured lights
      return (
        <g>
          <line x1={x + w * 0.5} y1={y} x2={x + w * 0.5} y2={y + h * 0.18} stroke={ink} strokeWidth={0.8} />
          <circle cx={x + w * 0.5} cy={y + h * 0.3} r={Math.min(w, h) * 0.13} fill="#f1f3f5" stroke={ink} strokeWidth={0.6} />
          <circle cx={x + w * 0.22} cy={y + h * 0.72} r={Math.min(w, h) * 0.1} fill="#f06595" />
          <circle cx={x + w * 0.5} cy={y + h * 0.8} r={Math.min(w, h) * 0.1} fill="#4dabf7" />
          <circle cx={x + w * 0.78} cy={y + h * 0.68} r={Math.min(w, h) * 0.1} fill="#fcc419" />
        </g>
      );
    case "dining": // a table under a pendant light
      return (
        <g fill={ink}>
          <line x1={x + w * 0.5} y1={y} x2={x + w * 0.5} y2={y + h * 0.3} stroke={ink} strokeWidth={0.8} />
          <path d={`M${x + w * 0.38} ${y + h * 0.4} q${w * 0.12} ${-h * 0.16} ${w * 0.24} 0 z`} />
          <rect x={x + w * 0.14} y={y + h * 0.62} width={w * 0.72} height={h * 0.07} />
          <rect x={x + w * 0.22} y={y + h * 0.66} width={w * 0.04 + 0.6} height={h * 0.22} />
          <rect x={x + w * 0.74} y={y + h * 0.66} width={w * 0.04 + 0.6} height={h * 0.22} />
        </g>
      );
  }
}

/** A window with its frame, glazing bars, sill and a peek at the room. */
function Win({ x, y, w, h, kind, bars = "cross", sill = true }: {
  x: number; y: number; w: number; h: number; kind: HouseInterior; bars?: "cross" | "none" | "split"; sill?: boolean;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={PANE[kind]} />
      <Peek x={x} y={y} w={w} h={h} kind={kind} />
      {/* a soft reflection */}
      <path d={`M${x + w * 0.62} ${y} h${w * 0.16} l${-w * 0.3} ${h} h${-w * 0.16} z`} fill="#ffffff" opacity={0.28} />
      {bars === "cross" && (
        <path d={`M${x + w / 2} ${y} v${h} M${x} ${y + h / 2} h${w}`} stroke="#ffffff" strokeWidth={1.4} opacity={0.95} />
      )}
      {bars === "split" && <path d={`M${x + w / 2} ${y} v${h}`} stroke="#ffffff" strokeWidth={1.4} opacity={0.95} />}
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#ffffff" strokeWidth={1.8} />
      {sill && <rect x={x - 2} y={y + h} width={w + 4} height={2.6} rx={1} fill="#f8f9fa" stroke="#ced4da" strokeWidth={0.5} />}
    </g>
  );
}

function Door({ x, y, w, h, colour, double }: { x: number; y: number; w: number; h: number; colour: string; double?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2} fill={colour} stroke={dark(colour, 0.35)} strokeWidth={1} />
      {double ? (
        <>
          <path d={`M${x + w / 2} ${y + 1} v${h - 1}`} stroke={dark(colour, 0.35)} strokeWidth={0.8} />
          <circle cx={x + w / 2 - 2.2} cy={y + h * 0.56} r={1.1} fill="#ffd43b" />
          <circle cx={x + w / 2 + 2.2} cy={y + h * 0.56} r={1.1} fill="#ffd43b" />
        </>
      ) : (
        <>
          <rect x={x + w * 0.2} y={y + h * 0.12} width={w * 0.6} height={h * 0.22} rx={1} fill={light(colour, 0.25)} />
          <circle cx={x + w * 0.78} cy={y + h * 0.56} r={1.3} fill="#ffd43b" />
        </>
      )}
      <rect x={x - 3} y={y + h} width={w + 6} height={2.5} rx={1} fill="#ced4da" />
    </g>
  );
}

function Bush({ x, y, r = 8 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x - r * 0.55} cy={y + r * 0.15} r={r * 0.75} fill="#40c057" />
      <circle cx={x + r * 0.55} cy={y + r * 0.15} r={r * 0.75} fill="#40c057" />
      <circle cx={x} cy={y - r * 0.2} r={r} fill="#51cf66" />
      <circle cx={x - r * 0.3} cy={y - r * 0.45} r={r * 0.25} fill="#8ce99a" opacity={0.8} />
    </g>
  );
}

function Flowers({ x, y, w }: { x: number; y: number; w: number }) {
  const n = Math.max(2, Math.round(w / 6));
  return (
    <g>
      <rect x={x} y={y} width={w} height={4} rx={1} fill="#a9744f" />
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={x + (w / n) * (i + 0.5)} cy={y - 0.6} r={1.9} fill={i % 2 ? "#ffd43b" : "#f783ac"} />
      ))}
    </g>
  );
}

function Pool({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <path d={`M${x + 8} ${y} h${w - 16} l8 18 h${-w} z`} fill="#f1f3f5" />
      <path d={`M${x + 11} ${y + 2.5} h${w - 22} l6.5 13 h${-w + 9} z`} fill="#4dabf7" />
      <path d={`M${x + 16} ${y + 7} q4 -2 8 0 t8 0 M${x + w - 34} ${y + 11} q4 -2 8 0 t8 0`} stroke="#d0ebff" strokeWidth={1.2} fill="none" />
    </g>
  );
}

function Palm({ x }: { x: number }) {
  return (
    <g>
      <path d={`M${x} 170 q-2 -30 8 -56`} stroke="#9c6b47" strokeWidth={4} fill="none" strokeLinecap="round" />
      <g fill="#2f9e44">
        <path d={`M${x + 8} 114 q-18 -6 -26 6 q12 -10 26 -6 z`} />
        <path d={`M${x + 8} 114 q-12 -16 -26 -12 q16 0 26 12 z`} />
        <path d={`M${x + 8} 114 q4 -18 20 -18 q-14 4 -20 18 z`} />
        <path d={`M${x + 8} 114 q18 -6 26 6 q-12 -10 -26 -6 z`} />
        <path d={`M${x + 8} 114 q14 4 18 18 q-8 -12 -18 -18 z`} />
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------------------
// The five styles
// ---------------------------------------------------------------------------------------

type Paint = { wall: string; wallEdge: string; wallShade: string; roof: string; roofEdge: string; roofShade: string; door: string; room: HouseInterior };

function Cottage({ p }: { p: Paint }) {
  return (
    <g>
      <rect x={184} y={68} width={13} height={30} fill="#b5654a" stroke="#8a4a35" strokeWidth={1} />
      <rect x={181.5} y={65} width={18} height={5} rx={1} fill="#8a4a35" />
      <rect x={112} y={112} width={96} height={58} fill={p.wall} stroke={p.wallEdge} strokeWidth={1.4} />
      <path d="M98 116 L160 62 L222 116 Z" fill={p.roof} stroke={p.roofEdge} strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M98 116 L160 62 L160 70 L106 116 Z" fill={p.roofShade} opacity={0.5} />
      <circle cx={160} cy={96} r={7.5} fill={PANE[p.room]} stroke="#ffffff" strokeWidth={1.8} />
      <Win x={121} y={124} w={21} h={19} kind={p.room} />
      <Win x={178} y={124} w={21} h={19} kind={p.room} />
      <Flowers x={120} y={146} w={25} />
      <Flowers x={176} y={146} w={25} />
      <Door x={150} y={136} w={20} h={34} colour={p.door} />
      <Bush x={104} y={164} />
      <Bush x={216} y={164} />
    </g>
  );
}

function Bungalow({ p }: { p: Paint }) {
  return (
    <g>
      <rect x={72} y={118} width={176} height={52} fill={p.wall} stroke={p.wallEdge} strokeWidth={1.4} />
      <rect x={128} y={124} width={64} height={46} fill={p.wallShade} />
      <path d="M58 122 L96 86 L224 86 L262 122 Z" fill={p.roof} stroke={p.roofEdge} strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M58 122 L96 86 L102 86 L68 122 Z" fill={p.roofShade} opacity={0.5} />
      <rect x={56} y={120} width={208} height={5} rx={1} fill={p.roofShade} />
      <Win x={84} y={132} w={32} h={20} kind={p.room} />
      <Win x={204} y={132} w={32} h={20} kind={p.room} />
      <Flowers x={84} y={155} w={32} />
      <Flowers x={204} y={155} w={32} />
      <Door x={150} y={136} w={20} h={34} colour={p.door} />
      <rect x={128} y={125} width={5} height={45} fill="#f8f9fa" stroke="#ced4da" strokeWidth={0.6} />
      <rect x={187} y={125} width={5} height={45} fill="#f8f9fa" stroke="#ced4da" strokeWidth={0.6} />
      <Bush x={66} y={165} r={7} />
      <Bush x={254} y={165} r={7} />
    </g>
  );
}

function Modern({ p }: { p: Paint }) {
  return (
    <g>
      <rect x={70} y={118} width={150} height={52} fill={p.wall} stroke={p.wallEdge} strokeWidth={1.4} />
      <rect x={128} y={80} width={104} height={40} fill={p.wall} stroke={p.wallEdge} strokeWidth={1.4} />
      <rect x={128} y={116} width={92} height={4} fill={p.wallShade} />
      <rect x={124} y={75} width={112} height={6} fill={p.roof} stroke={p.roofEdge} strokeWidth={1} />
      <rect x={66} y={114} width={64} height={6} fill={p.roof} stroke={p.roofEdge} strokeWidth={1} />
      {/* roof terrace with a glass rail */}
      <rect x={72} y={101} width={54} height={13} fill="#d0ebff" opacity={0.55} stroke="#adb5bd" strokeWidth={0.8} />
      <path d="M72 101 h54 M90 101 v13 M108 101 v13" stroke="#adb5bd" strokeWidth={0.8} />
      <Win x={140} y={89} w={80} h={20} kind={p.room} bars="split" sill={false} />
      <Win x={80} y={128} w={64} h={34} kind={p.room} bars="split" sill={false} />
      <rect x={152} y={128} width={24} height={42} fill={p.wallShade} />
      <Door x={190} y={134} w={20} h={36} colour={p.door} />
      <Pool x={226} y={176} w={80} />
      <Bush x={56} y={165} r={7} />
    </g>
  );
}

function Duplex({ p }: { p: Paint }) {
  return (
    <g>
      <rect x={220} y={128} width={56} height={42} fill={p.wallShade} stroke={p.wallEdge} strokeWidth={1.4} />
      <rect x={216} y={123} width={64} height={6} fill={p.roof} stroke={p.roofEdge} strokeWidth={1} />
      <rect x={229} y={137} width={38} height={33} fill="#dee2e6" stroke="#adb5bd" strokeWidth={1} />
      <path d="M229 144 h38 M229 151 h38 M229 158 h38 M229 165 h38" stroke="#adb5bd" strokeWidth={0.8} />
      <rect x={96} y={96} width={124} height={74} fill={p.wall} stroke={p.wallEdge} strokeWidth={1.4} />
      <rect x={96} y={132} width={124} height={3} fill={p.wallShade} />
      <path d="M84 100 L158 50 L232 100 Z" fill={p.roof} stroke={p.roofEdge} strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M84 100 L158 50 L158 58 L94 100 Z" fill={p.roofShade} opacity={0.5} />
      <circle cx={158} cy={82} r={6.5} fill={PANE[p.room]} stroke="#ffffff" strokeWidth={1.6} />
      <Win x={110} y={106} w={24} h={19} kind={p.room} />
      <Win x={182} y={106} w={24} h={19} kind={p.room} />
      <Win x={108} y={142} w={28} h={19} kind={p.room} />
      <Win x={184} y={142} w={24} h={19} kind={p.room} />
      <Door x={148} y={138} w={21} h={32} colour={p.door} />
      <Bush x={90} y={165} r={7} />
    </g>
  );
}

function Villa({ p }: { p: Paint }) {
  return (
    <g>
      <Palm x={26} />
      <rect x={58} y={98} width={204} height={72} fill={p.wall} stroke={p.wallEdge} strokeWidth={1.4} />
      <rect x={58} y={134} width={204} height={3} fill={p.wallShade} />
      <path d="M44 102 L88 64 L232 64 L276 102 Z" fill={p.roof} stroke={p.roofEdge} strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M44 102 L88 64 L94 64 L54 102 Z" fill={p.roofShade} opacity={0.5} />
      <rect x={42} y={100} width={236} height={5} rx={1} fill={p.roofShade} />
      {[70, 98, 200, 228].map((x) => (
        <g key={x}>
          <Win x={x} y={110} w={22} h={18} kind={p.room} />
          <Win x={x} y={144} w={22} h={19} kind={p.room} />
        </g>
      ))}
      {/* the front porch: columns under a little pediment */}
      <path d="M124 104 L160 82 L196 104 Z" fill={light(p.wall, 0.4)} stroke={p.wallEdge} strokeWidth={1.2} strokeLinejoin="round" />
      <rect x={126} y={104} width={68} height={6} fill={light(p.wall, 0.5)} stroke={p.wallEdge} strokeWidth={1} />
      <Door x={149} y={138} w={22} h={32} colour={p.door} double />
      {[130, 142, 172, 184].map((x) => (
        <rect key={x} x={x} y={110} width={6} height={60} fill="#f8f9fa" stroke="#ced4da" strokeWidth={0.7} />
      ))}
      <Pool x={222} y={176} w={86} />
    </g>
  );
}

const STYLE_ART: Record<HouseStyle, (props: { p: Paint }) => React.ReactElement> = {
  cottage: Cottage,
  bungalow: Bungalow,
  modern: Modern,
  duplex: Duplex,
  villa: Villa,
};

// ---------------------------------------------------------------------------------------
// The picture
// ---------------------------------------------------------------------------------------

/** Name sign in the front garden: it grows with the name and squeezes long ones to fit. */
function Sign({ text, muted }: { text: string; muted?: boolean }) {
  const size = 10.5;
  const est = text.length * size * 0.6;
  const maxText = 108;
  const w = Math.max(56, Math.min(maxText, est) + 16);
  const cx = 72;
  return (
    <g>
      <rect x={cx - w / 2 + 8} y={190} width={3.5} height={16} fill="#8d5a3b" />
      <rect x={cx + w / 2 - 11.5} y={190} width={3.5} height={16} fill="#8d5a3b" />
      <rect x={cx - w / 2} y={176} width={w} height={19} rx={3.5} fill="#fff9db" stroke="#8d5a3b" strokeWidth={1.6} />
      <text
        x={cx}
        y={189.2}
        textAnchor="middle"
        fontSize={size}
        fontWeight={700}
        fill={muted ? "#a08a6a" : "#3b2a1a"}
        fontStyle={muted ? "italic" : undefined}
        {...(est > maxText ? { textLength: maxText, lengthAdjust: "spacingAndGlyphs" } : {})}
      >
        {text}
      </text>
    </g>
  );
}

/**
 * The house picture. `sign` is the text on the name sign (no sign when it's left out);
 * `compact` drops the sky details and zooms in on the house, for small previews.
 */
export function HouseArt({
  design,
  sign,
  signMuted,
  compact,
  className,
  label,
}: {
  design: HouseDesign;
  sign?: string | null;
  signMuted?: boolean;
  compact?: boolean;
  className?: string;
  label?: string;
}) {
  const p: Paint = {
    wall: design.wall,
    wallEdge: dark(design.wall, 0.32),
    wallShade: dark(design.wall, 0.1),
    roof: design.roof,
    roofEdge: dark(design.roof, 0.3),
    roofShade: dark(design.roof, 0.22),
    door: mix(design.roof, "#6b4430", 0.55),
    room: design.interior,
  };
  const Art = STYLE_ART[design.style] ?? Cottage;
  const sky = `house-sky-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      viewBox={compact ? "34 42 252 150" : "0 0 320 210"}
      className={className}
      role="img"
      aria-label={label ?? `${design.style} house`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe0ff" />
          <stop offset="1" stopColor="#eef7ff" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={320} height={172} fill={`url(#${sky})`} />
      {!compact && (
        <g>
          <circle cx={276} cy={34} r={15} fill="#ffd43b" opacity={0.9} />
          <g fill="#ffffff" opacity={0.92}>
            <ellipse cx={58} cy={38} rx={20} ry={8} />
            <ellipse cx={72} cy={32} rx={13} ry={9} />
            <ellipse cx={206} cy={24} rx={16} ry={6} />
            <ellipse cx={217} cy={20} rx={9} ry={6} />
          </g>
        </g>
      )}
      <path d="M0 160 Q60 140 120 156 T240 150 T320 156 V172 H0 Z" fill="#b2f2bb" />
      <rect x={0} y={168} width={320} height={42} fill="#8ce99a" />
      <rect x={0} y={168} width={320} height={3} fill="#69db7c" />
      <path d="M150 171 h20 l18 39 h-56 z" fill="#e9ecef" />
      <path d="M150 171 h20 l2 4 h-24 z" fill="#dee2e6" />
      <Art p={p} />
      {!compact && sign != null && sign !== "" && <Sign text={sign} muted={signMuted} />}
    </svg>
  );
}
