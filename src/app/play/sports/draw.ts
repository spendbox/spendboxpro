// Canvas drawing for the tactical match view: a cached background per sport (pitch, court,
// ring) and the moving parts drawn every animation frame from two keyframes and a tween.

import { colourGap, teamProfile } from "@/lib/sports/teams";
import type { BasketballFrame, BoxingFrame, FootballFrame, Frame, MatchInfo, Sport, WrestlingFrame } from "@/lib/sports/types";

// ---------------------------------------------------------------- geometry

type World = { x0: number; y0: number; x1: number; y1: number };

const WORLD: Record<Sport, World> = {
  football: { x0: -45, y0: -40, x1: 1095, y1: 760 },
  basketball: { x0: -14, y0: -12, x1: 294, y1: 186 },
  boxing: { x0: -80, y0: -80, x1: 1080, y1: 1080 },
  wrestling: { x0: -215, y0: -215, x1: 1215, y1: 1215 },
};

export type View = {
  sport: Sport;
  /** CSS pixels. */
  w: number;
  h: number;
  dpr: number;
  /** Football and basketball turn sideways on narrow screens (x runs up the screen). */
  vertical: boolean;
  /** CSS px per world unit. */
  k: number;
  ox: number;
  oy: number;
  world: World;
};

/** Fits the sport's world into a box `cssW` wide, at most `maxH` tall. */
export function makeView(sport: Sport, cssW: number, maxH: number, dpr: number): View {
  const world = WORLD[sport];
  const ww = world.x1 - world.x0;
  const wh = world.y1 - world.y0;
  const vertical = (sport === "football" || sport === "basketball") && cssW < 560;
  const sw = vertical ? wh : ww;
  const sh = vertical ? ww : wh;
  let k = cssW / sw;
  let h = sh * k;
  if (h > maxH) {
    k = maxH / sh;
    h = maxH;
  }
  const ox = (cssW - sw * k) / 2;
  return { sport, w: cssW, h: Math.round(h), dpr, vertical, k, ox, oy: 0, world };
}

/** World -> CSS pixel position (written into `out`). */
export function toScreen(v: View, x: number, y: number, out: { x: number; y: number }) {
  if (v.vertical) {
    out.x = v.ox + (y - v.world.y0) * v.k;
    out.y = v.oy + (v.world.x1 - x) * v.k;
  } else {
    out.x = v.ox + (x - v.world.x0) * v.k;
    out.y = v.oy + (y - v.world.y0) * v.k;
  }
  return out;
}

/** Puts the context into world coordinates (for drawing the background). */
function worldTransform(c: CanvasRenderingContext2D, v: View) {
  const s = v.k * v.dpr;
  if (v.vertical) c.setTransform(0, -s, s, 0, (v.ox - v.world.y0 * v.k) * v.dpr, (v.oy + v.world.x1 * v.k) * v.dpr);
  else c.setTransform(s, 0, 0, s, (v.ox - v.world.x0 * v.k) * v.dpr, (v.oy - v.world.y0 * v.k) * v.dpr);
}

/** Screen angle (radians) of a world direction. */
function screenAngle(v: View, deg: number): number {
  const a = (deg * Math.PI) / 180;
  if (!v.vertical) return a;
  return Math.atan2(-Math.cos(a), Math.sin(a));
}

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** Catmull-Rom through four points. */
function cr(p0: number, p1: number, p2: number, p3: number, u: number) {
  const u2 = u * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u2 * u);
}
function lerpAngle(a: number, b: number, u: number) {
  let d = ((b - a + 540) % 360) - 180;
  if (d < -180) d += 360;
  return a + d * u;
}

// ---------------------------------------------------------------- backgrounds

export function paintBackground(v: View, match: MatchInfo): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(v.w * v.dpr));
  cv.height = Math.max(1, Math.round(v.h * v.dpr));
  const c = cv.getContext("2d");
  if (!c) return cv;
  c.fillStyle = v.sport === "football" ? "#2c6e31" : v.sport === "basketball" ? "#3b2a1f" : "#0f172a";
  c.fillRect(0, 0, cv.width, cv.height);
  worldTransform(c, v);
  const px = 1 / (v.k * v.dpr);
  if (v.sport === "football") paintPitch(c, px);
  else if (v.sport === "basketball") paintCourt(c, px, match);
  else if (v.sport === "boxing") paintBoxingRing(c, px, match);
  else paintWrestlingRing(c, px, match);
  c.setTransform(1, 0, 0, 1, 0, 0);
  return cv;
}

function paintPitch(c: CanvasRenderingContext2D, px: number) {
  const W = 1050;
  const H = 680;
  c.fillStyle = "#2f7a34";
  c.fillRect(-45, -40, W + 90, H + 120);
  const stripes = 14;
  for (let i = 0; i < stripes; i++) {
    c.fillStyle = i % 2 ? "#3f9145" : "#46994b";
    c.fillRect((i * W) / stripes, 0, W / stripes + 0.5, H);
  }
  // Tunnel.
  c.fillStyle = "#1f2937";
  c.fillRect(W / 2 - 45, H + 38, 90, 40);
  c.fillStyle = "#111827";
  c.fillRect(W / 2 - 30, H + 52, 60, 30);
  c.strokeStyle = "rgba(255,255,255,0.92)";
  c.lineWidth = Math.max(1.2, 1.3 * px);
  c.lineJoin = "round";
  c.beginPath();
  c.rect(0, 0, W, H);
  c.moveTo(W / 2, 0);
  c.lineTo(W / 2, H);
  c.moveTo(W / 2 + 91.5, H / 2);
  c.arc(W / 2, H / 2, 91.5, 0, Math.PI * 2);
  for (const side of [0, 1]) {
    const x = side ? W : 0;
    const d = side ? -1 : 1;
    c.rect(Math.min(x, x + d * 165), H / 2 - 201.6, 165, 403.2);
    c.rect(Math.min(x, x + d * 55), H / 2 - 91.6, 55, 183.2);
    // Penalty arc (outside the box only).
    const sx = x + d * 110;
    const a = Math.acos(55 / 91.5);
    c.moveTo(sx + d * 55, H / 2 - Math.sin(a) * 91.5);
    if (side) c.arc(sx, H / 2, 91.5, Math.PI + a, Math.PI - a, true);
    else c.arc(sx, H / 2, 91.5, -a, a);
    // Corner arcs.
    c.moveTo(x, 10);
    c.arc(x, 0, 10, Math.PI / 2, side ? Math.PI : 0, !!side);
    c.moveTo(x, H - 10);
    c.arc(x, H, 10, side ? Math.PI : 0, -Math.PI / 2, side ? false : true);
  }
  c.stroke();
  c.fillStyle = "rgba(255,255,255,0.95)";
  for (const [x, y] of [
    [W / 2, H / 2],
    [110, H / 2],
    [W - 110, H / 2],
  ]) {
    c.beginPath();
    c.arc(x, y, Math.max(3, 2.5 * px), 0, Math.PI * 2);
    c.fill();
  }
  // Goals with nets.
  for (const side of [0, 1]) {
    const x0 = side ? W : -20;
    c.fillStyle = "rgba(255,255,255,0.18)";
    c.fillRect(x0, H / 2 - 36.6, 20, 73.2);
    c.strokeStyle = "rgba(255,255,255,0.35)";
    c.lineWidth = Math.max(0.6, 0.6 * px);
    c.beginPath();
    for (let y = H / 2 - 36.6; y <= H / 2 + 36.6; y += 9) {
      c.moveTo(x0, y);
      c.lineTo(x0 + 20, y);
    }
    for (let x = x0; x <= x0 + 20; x += 7) {
      c.moveTo(x, H / 2 - 36.6);
      c.lineTo(x, H / 2 + 36.6);
    }
    c.stroke();
    c.strokeStyle = "#ffffff";
    c.lineWidth = Math.max(1.6, 2 * px);
    c.strokeRect(x0, H / 2 - 36.6, 20, 73.2);
  }
}

function paintCourt(c: CanvasRenderingContext2D, px: number, match: MatchInfo) {
  const W = 280;
  const H = 150;
  c.fillStyle = "#3b2a1f";
  c.fillRect(-14, -12, W + 28, H + 50);
  // Planks.
  for (let y = 0, i = 0; y < H; y += 5, i++) {
    c.fillStyle = i % 3 === 0 ? "#d6a46b" : i % 3 === 1 ? "#dcab72" : "#d39f66";
    c.fillRect(0, y, W, 5.2);
  }
  c.strokeStyle = "rgba(120,72,30,0.18)";
  c.lineWidth = Math.max(0.4, 0.5 * px);
  c.beginPath();
  for (let y = 5; y < H; y += 5) {
    c.moveTo(0, y);
    c.lineTo(W, y);
  }
  c.stroke();
  // Painted keys in the home and away colours.
  for (const side of [0, 1]) {
    const x = side ? W - 58 : 0;
    c.fillStyle = side ? match.away.colour : match.home.colour;
    c.globalAlpha = 0.55;
    c.fillRect(x, 75 - 24.5, 58, 49);
    c.globalAlpha = 1;
  }
  // Centre circle tint.
  c.fillStyle = "rgba(255,255,255,0.12)";
  c.beginPath();
  c.arc(W / 2, 75, 18, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.95)";
  c.lineWidth = Math.max(1, 0.8 * px);
  c.beginPath();
  c.rect(0, 0, W, H);
  c.moveTo(W / 2, 0);
  c.lineTo(W / 2, H);
  c.moveTo(W / 2 + 18, 75);
  c.arc(W / 2, 75, 18, 0, Math.PI * 2);
  for (const side of [0, 1]) {
    const rim = side ? W - 15.75 : 15.75;
    const d = side ? -1 : 1;
    const base = side ? W : 0;
    // Three-point line: straight in the corners, then the arc.
    const r3 = 67.5;
    const yc = 66;
    const xs = rim + d * Math.sqrt(r3 * r3 - yc * yc);
    c.moveTo(base, 75 - yc);
    c.lineTo(xs, 75 - yc);
    const a = Math.asin(yc / r3);
    if (side) c.arc(rim, 75, r3, Math.PI + a, Math.PI - a, true);
    else c.arc(rim, 75, r3, -a, a);
    c.lineTo(base, 75 + yc);
    // Key and free-throw circle.
    c.rect(Math.min(base, base + d * 58), 75 - 24.5, 58, 49);
    c.moveTo(base + d * 58 + 18, 75);
    c.arc(base + d * 58, 75, 18, 0, Math.PI * 2);
    // Restricted area.
    c.moveTo(rim, 75 - 12.5);
    if (side) c.arc(rim, 75, 12.5, -Math.PI / 2, Math.PI / 2, true);
    else c.arc(rim, 75, 12.5, -Math.PI / 2, Math.PI / 2);
  }
  c.stroke();
  // Backboards and rims.
  for (const side of [0, 1]) {
    const rim = side ? W - 15.75 : 15.75;
    const bx = side ? W - 12 : 12;
    c.strokeStyle = "#f8fafc";
    c.lineWidth = Math.max(2, 1.6 * px);
    c.beginPath();
    c.moveTo(bx, 75 - 9);
    c.lineTo(bx, 75 + 9);
    c.stroke();
    c.strokeStyle = "#f97316";
    c.lineWidth = Math.max(1.6, 1.2 * px);
    c.beginPath();
    c.arc(rim, 75, 2.6, 0, Math.PI * 2);
    c.stroke();
  }
  // Benches.
  c.fillStyle = "#1f2937";
  c.fillRect(W / 2 - 98, H + 10, 82, 14);
  c.fillRect(W / 2 + 16, H + 10, 82, 14);
  c.fillStyle = match.home.colour;
  c.fillRect(W / 2 - 98, H + 10, 82, 2.5);
  c.fillStyle = match.away.colour;
  c.fillRect(W / 2 + 16, H + 10, 82, 2.5);
}

function ringLogo(c: CanvasRenderingContext2D, text: string, size: number, colour: string) {
  c.save();
  c.translate(500, 500);
  c.fillStyle = colour;
  c.font = `800 ${size}px system-ui, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 0, 0);
  c.restore();
}

function paintBoxingRing(c: CanvasRenderingContext2D, px: number, match: MatchInfo) {
  c.fillStyle = "#0f172a";
  c.fillRect(-80, -80, 1160, 1160);
  // Apron.
  c.fillStyle = "#1e293b";
  c.fillRect(-70, -70, 1140, 1140);
  // Canvas mat.
  c.fillStyle = "#dfe7f1";
  c.fillRect(-40, -40, 1080, 1080);
  c.strokeStyle = "rgba(15,23,42,0.08)";
  c.lineWidth = 6;
  c.beginPath();
  c.arc(500, 500, 170, 0, Math.PI * 2);
  c.stroke();
  ringLogo(c, (match.league ?? "Fight night").split(" · ")[0].toUpperCase().slice(0, 22), 46, "rgba(15,23,42,0.1)");
  // Red and blue corner pads.
  c.fillStyle = match.home.colour;
  c.globalAlpha = 0.25;
  c.fillRect(-40, -40, 150, 150);
  c.fillStyle = match.away.colour;
  c.fillRect(890, 890, 150, 150);
  c.globalAlpha = 1;
  // Ropes.
  const ropes = ["#ef4444", "#f8fafc", "#3b82f6"];
  ropes.forEach((col, i) => {
    c.strokeStyle = col;
    c.lineWidth = Math.max(5, 2 * px);
    const o = -6 - i * 9;
    c.strokeRect(o, o, 1000 - 2 * o, 1000 - 2 * o);
  });
  // Corner posts.
  const posts: [number, number, string][] = [
    [-20, -20, match.home.colour],
    [1020, 1020, match.away.colour],
    [1020, -20, "#f8fafc"],
    [-20, 1020, "#f8fafc"],
  ];
  for (const [x, y, col] of posts) {
    c.fillStyle = col;
    c.beginPath();
    c.arc(x, y, 30, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.4)";
    c.lineWidth = 4;
    c.stroke();
  }
}

function paintWrestlingRing(c: CanvasRenderingContext2D, px: number, match: MatchInfo) {
  c.fillStyle = "#0b1020";
  c.fillRect(-215, -215, 1430, 1430);
  // Mats on the floor and the barricade.
  c.fillStyle = "#1c2333";
  c.fillRect(-190, -190, 1380, 1380);
  c.strokeStyle = "#64748b";
  c.lineWidth = 10;
  c.strokeRect(-200, -200, 1400, 1400);
  // Entrance ramp.
  c.fillStyle = "#334155";
  c.fillRect(420, -215, 160, 30);
  // Apron with the show's name.
  c.fillStyle = "#111827";
  c.fillRect(-80, -80, 1160, 1160);
  c.fillStyle = "#c9d2dc";
  c.fillRect(-40, -40, 1080, 1080);
  ringLogo(c, (match.league ?? "Wrestling").split(" · ")[0].toUpperCase().slice(0, 24), 54, "rgba(220,38,38,0.14)");
  c.strokeStyle = "rgba(0,0,0,0.06)";
  c.lineWidth = 8;
  c.beginPath();
  c.arc(500, 500, 230, 0, Math.PI * 2);
  c.stroke();
  const ropes = ["#dc2626", "#f8fafc", "#1d4ed8"];
  ropes.forEach((col, i) => {
    c.strokeStyle = col;
    c.lineWidth = Math.max(6, 2 * px);
    const o = -8 - i * 10;
    c.strokeRect(o, o, 1000 - 2 * o, 1000 - 2 * o);
  });
  for (const [x, y] of [
    [-22, -22],
    [1022, -22],
    [-22, 1022],
    [1022, 1022],
  ]) {
    c.fillStyle = "#e11d48";
    c.beginPath();
    c.arc(x, y, 34, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#111827";
    c.beginPath();
    c.arc(x, y, 14, 0, Math.PI * 2);
    c.fill();
  }
}

// ---------------------------------------------------------------- per-frame state

const TRAIL = 16;

export type Render = {
  trail: Float32Array;
  trailN: number;
  trailHead: number;
  trailAt: number;
  /** Shirt numbers per player slot (football 22, basketball 10), kept up to date with subs. */
  nums: number[];
  numStr: string[];
  applied: number;
  gk: [string, string];
  homeText: string;
  awayText: string;
  match: MatchInfo;
  pt: { x: number; y: number };
  pt2: { x: number; y: number };
};

function textOn(bg: string): string {
  return colourGap(bg, "#ffffff") > colourGap(bg, "#111827") ? "#ffffff" : "#111827";
}

const KEEPER_KITS = ["#facc15", "#22d3ee", "#f472b6", "#a3e635", "#fb923c", "#e5e7eb", "#111827"];

export function makeRender(match: MatchInfo): Render {
  const pick = (avoid: string[]) => KEEPER_KITS.find((k) => avoid.every((a) => colourGap(k, a) > 220)) ?? "#facc15";
  const gkH = pick([match.home.colour, match.away.colour, "#46994b"]);
  const gkA = pick([match.home.colour, match.away.colour, "#46994b", gkH]);
  const r: Render = {
    trail: new Float32Array(TRAIL * 2),
    trailN: 0,
    trailHead: 0,
    trailAt: 0,
    nums: [],
    numStr: [],
    applied: -1,
    gk: [gkH, gkA],
    homeText: textOn(match.home.colour),
    awayText: textOn(match.away.colour),
    match,
    pt: { x: 0, y: 0 },
    pt2: { x: 0, y: 0 },
  };
  resetNumbers(r);
  return r;
}

function resetNumbers(r: Render) {
  const m = r.match;
  if (m.sport === "football") {
    const h = teamProfile("football", m.home.name).numbers.slice(0, 11);
    const a = teamProfile("football", m.away.name).numbers.slice(0, 11);
    r.nums = [...h, ...a];
  } else if (m.sport === "basketball") {
    const h = teamProfile("basketball", m.home.name).numbers.slice(0, 5);
    const a = teamProfile("basketball", m.away.name).numbers.slice(0, 5);
    r.nums = [...h, ...a];
  } else r.nums = [];
  r.numStr = r.nums.map(String);
  r.applied = -1;
}

/** Applies substitutions (new shirt numbers) up to frame `idx`. */
function syncNumbers(r: Render, frames: Frame[], idx: number) {
  if (!r.nums.length) return;
  if (idx < r.applied) resetNumbers(r);
  const per = r.match.sport === "football" ? 11 : 5;
  for (let i = r.applied + 1; i <= idx; i++) {
    const es = frames[i]?.e;
    if (!es) continue;
    for (const e of es) {
      if (e.k === "sub" && e.s !== undefined && e.i !== undefined && e.n !== undefined) {
        const k = e.s * per + e.i;
        r.nums[k] = e.n;
        r.numStr[k] = String(e.n);
      }
    }
  }
  r.applied = Math.max(r.applied, idx);
}

function pushTrail(r: Render, x: number, y: number, now: number) {
  if (now - r.trailAt < 30) return;
  r.trailAt = now;
  r.trail[r.trailHead * 2] = x;
  r.trail[r.trailHead * 2 + 1] = y;
  r.trailHead = (r.trailHead + 1) % TRAIL;
  r.trailN = Math.min(TRAIL, r.trailN + 1);
}
export function clearTrail(r: Render) {
  r.trailN = 0;
}

function drawTrail(c: CanvasRenderingContext2D, r: Render, colour: string, width: number) {
  if (r.trailN < 2) return;
  c.strokeStyle = colour;
  c.lineCap = "round";
  for (let j = 1; j < r.trailN; j++) {
    const a = (r.trailHead - j + TRAIL) % TRAIL;
    const b = (r.trailHead - j - 1 + TRAIL) % TRAIL;
    c.globalAlpha = 0.5 * (1 - j / r.trailN);
    c.lineWidth = width * (1 - j / (r.trailN + 2));
    c.beginPath();
    c.moveTo(r.trail[a * 2], r.trail[a * 2 + 1]);
    c.lineTo(r.trail[b * 2], r.trail[b * 2 + 1]);
    c.stroke();
  }
  c.globalAlpha = 1;
}

function dot(c: CanvasRenderingContext2D, x: number, y: number, rad: number, fill: string, stroke: string, lw: number) {
  c.beginPath();
  c.arc(x, y, rad, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (lw > 0) {
    c.lineWidth = lw;
    c.strokeStyle = stroke;
    c.stroke();
  }
}

/** The four frames around `i` for smooth curves. */
type Quad<F> = { p0: F; a: F; b: F; p3: F; u: number };
const QUAD: Quad<Frame> = { p0: null as unknown as Frame, a: null as unknown as Frame, b: null as unknown as Frame, p3: null as unknown as Frame, u: 0 };

// ---------------------------------------------------------------- football

function drawFootball(c: CanvasRenderingContext2D, v: View, r: Render, q: Quad<FootballFrame>, now: number, flashUntil: number) {
  const { p0, a, b, p3, u } = q;
  const m = r.match;
  const rad = clamp(v.k * 13, 6, 11);
  const pt = r.pt;
  // Pass and shot lines.
  if (a.a && a.a !== "d" && (a.b[0] !== b.b[0] || a.b[1] !== b.b[1])) {
    toScreen(v, a.b[0], a.b[1], pt);
    toScreen(v, b.b[0], b.b[1], r.pt2);
    const shot = a.a === "s" || a.a === "h";
    c.strokeStyle = shot ? "rgba(255,214,102,0.9)" : "rgba(255,255,255,0.55)";
    c.lineWidth = shot ? 2 : 1.3;
    c.setLineDash(shot ? [] : [4, 4]);
    c.globalAlpha = shot ? 0.8 * (1 - u * 0.5) : 0.7 * (1 - u * 0.6);
    c.beginPath();
    c.moveTo(pt.x, pt.y);
    c.lineTo(r.pt2.x, r.pt2.y);
    c.stroke();
    c.setLineDash([]);
    c.globalAlpha = 1;
  }
  // Goal flash on the net the ball went into.
  if (now < flashUntil) {
    const side = b.b[0] > 525 ? 1 : 0;
    const pulse = 0.35 + 0.35 * Math.sin(now / 70);
    c.save();
    c.globalAlpha = pulse;
    c.fillStyle = "#fff7c2";
    toScreen(v, side ? 1050 : -20, 303, pt);
    toScreen(v, side ? 1070 : 0, 377, r.pt2);
    c.fillRect(Math.min(pt.x, r.pt2.x) - 3, Math.min(pt.y, r.pt2.y) - 3, Math.abs(r.pt2.x - pt.x) + 6, Math.abs(r.pt2.y - pt.y) + 6);
    c.restore();
  }
  // Players.
  const carrier = u < 0.5 ? a.k : b.k;
  c.font = `700 ${Math.max(7, Math.round(rad * 1.1))}px system-ui, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  for (let i = 0; i < 22; i++) {
    const x = cr(p0.p[2 * i], a.p[2 * i], b.p[2 * i], p3.p[2 * i], u);
    const y = cr(p0.p[2 * i + 1], a.p[2 * i + 1], b.p[2 * i + 1], p3.p[2 * i + 1], u);
    if (y < -90 || y > 820) continue;
    toScreen(v, x, y, pt);
    const home = i < 11;
    const keeper = i % 11 === 0;
    const fill = keeper ? r.gk[home ? 0 : 1] : home ? m.home.colour : m.away.colour;
    // Shadow.
    c.fillStyle = "rgba(0,0,0,0.22)";
    c.beginPath();
    c.arc(pt.x + 1.2, pt.y + 1.6, rad, 0, Math.PI * 2);
    c.fill();
    dot(c, pt.x, pt.y, rad, fill, i === carrier ? "#ffffff" : "rgba(17,24,39,0.75)", i === carrier ? 2.2 : 1.2);
    c.fillStyle = keeper ? textOn(fill) : home ? r.homeText : r.awayText;
    c.fillText(r.numStr[i] ?? "", pt.x, pt.y + 0.5);
  }
  // Ball: straight between touches, lofted for long balls, crosses and clearances.
  const bx = lerp(a.b[0], b.b[0], u);
  const by = lerp(a.b[1], b.b[1], u);
  const lift = a.a === "l" ? 70 : a.a === "c" ? 55 : a.a === "k" ? 60 : a.a === "s" ? 18 : 0;
  const h = lerp(a.b[2], b.b[2], u) + 4 * lift * u * (1 - u);
  toScreen(v, bx, by, pt);
  pushTrail(r, pt.x, pt.y - h * v.k * 0.6, now);
  drawTrail(c, r, "#ffffff", rad * 0.7);
  const br = Math.max(3, rad * 0.55) * (1 + h / 160);
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.beginPath();
  c.ellipse(pt.x + 1, pt.y + 1.5, br, br * 0.7, 0, 0, Math.PI * 2);
  c.fill();
  dot(c, pt.x, pt.y - h * v.k * 0.6, br, "#ffffff", "#111827", 1.1);
}

// ---------------------------------------------------------------- basketball

function drawBasketball(c: CanvasRenderingContext2D, v: View, r: Render, q: Quad<BasketballFrame>, now: number, flash: { until: number; side: number; pts: number }) {
  const { p0, a, b, p3, u } = q;
  const m = r.match;
  const rad = clamp(v.k * 7.5, 6, 13);
  const pt = r.pt;
  // Score flash at the rim.
  if (now < flash.until) {
    const rimX = b.b[0] > 140 ? 264 : 16;
    toScreen(v, rimX, 75, pt);
    const life = (flash.until - now) / 1600;
    c.globalAlpha = life;
    c.strokeStyle = flash.side ? m.away.colour : m.home.colour;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(pt.x, pt.y, rad * (1.2 + (1 - life) * 2.2), 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "#ffffff";
    c.font = `900 ${Math.round(rad * 1.6)}px system-ui, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(`+${flash.pts}`, pt.x, pt.y - rad * (2 + (1 - life) * 2));
    c.globalAlpha = 1;
  }
  const handler = u < 0.5 ? a.k : b.k;
  c.font = `700 ${Math.max(7, Math.round(rad * 0.95))}px system-ui, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  for (let i = 0; i < 10; i++) {
    const x = cr(p0.p[2 * i], a.p[2 * i], b.p[2 * i], p3.p[2 * i], u);
    const y = cr(p0.p[2 * i + 1], a.p[2 * i + 1], b.p[2 * i + 1], p3.p[2 * i + 1], u);
    toScreen(v, x, y, pt);
    const home = i < 5;
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.beginPath();
    c.arc(pt.x + 1.2, pt.y + 1.8, rad, 0, Math.PI * 2);
    c.fill();
    dot(c, pt.x, pt.y, rad, home ? m.home.colour : m.away.colour, i === handler ? "#ffffff" : "rgba(17,24,39,0.8)", i === handler ? 2.4 : 1.3);
    c.fillStyle = home ? r.homeText : r.awayText;
    c.fillText(r.numStr[i] ?? "", pt.x, pt.y + 0.5);
  }
  // Ball: dribbled at the handler's side, arcing on passes and shots.
  const shot = a.a === "s2" || a.a === "s3" || a.a === "ft";
  const lift = shot ? (a.a === "s3" ? 70 : 52) : a.a === "p" ? 10 : a.a === "r" ? 16 : 0;
  let bx = lerp(a.b[0], b.b[0], u);
  let by = lerp(a.b[1], b.b[1], u);
  let h = lerp(a.b[2], b.b[2], u) + 4 * lift * u * (1 - u);
  if (a.a === "m") h = lerp(30, 0, u);
  if (!shot && handler >= 0 && a.a !== "p" && a.a !== "r" && a.a !== "m") {
    // Bouncing dribble.
    bx += 4;
    by += 4;
    h = Math.abs(Math.sin(now / 110)) * 9;
  }
  toScreen(v, bx, by, pt);
  if (shot || a.a === "p") pushTrail(r, pt.x, pt.y - h * v.k * 0.55, now);
  else clearTrail(r);
  drawTrail(c, r, "#fb923c", rad * 0.6);
  const br = Math.max(3.2, rad * 0.5) * (1 + h / 120);
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.beginPath();
  c.ellipse(pt.x + 1, pt.y + 1.5, br * 0.9, br * 0.6, 0, 0, Math.PI * 2);
  c.fill();
  const hy = pt.y - h * v.k * 0.55;
  dot(c, pt.x, hy, br, "#f97316", "#7c2d12", 1.1);
  c.strokeStyle = "rgba(60,20,0,0.65)";
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(pt.x - br, hy);
  c.lineTo(pt.x + br, hy);
  c.moveTo(pt.x, hy - br);
  c.lineTo(pt.x, hy + br);
  c.stroke();
}

// ---------------------------------------------------------------- boxing and wrestling figures

const SKIN = ["#8d5524", "#6b3e1e", "#a0662c", "#5a3418", "#c68642"];

function skinOf(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return SKIN[Math.abs(h) % SKIN.length];
}

type Fighter = {
  x: number;
  y: number;
  ang: number;
  colour: string;
  colour2: string;
  skin: string;
  /** 0 standing .. 1 flat on the canvas. */
  down: number;
  /** Lead / rear glove reach 0..1 and the punch type. */
  lead: number;
  rear: number;
  hook: number;
  scale: number;
  lift: number;
  wrestler: boolean;
};

function drawFighter(c: CanvasRenderingContext2D, f: Fighter) {
  const s = f.scale;
  c.save();
  c.translate(f.x, f.y);
  // Shadow (bigger when they're up on the top rope).
  c.fillStyle = "rgba(0,0,0,0.25)";
  c.beginPath();
  c.ellipse(3 * s + f.lift * 6, 4 * s + f.lift * 8, (f.wrestler ? 30 : 26) * s * (1 + f.down * 0.6), 20 * s, f.ang, 0, Math.PI * 2);
  c.fill();
  c.translate(-f.lift * 3, -f.lift * 6);
  c.rotate(f.ang);
  const k = 1 + f.lift * 0.15;
  c.scale(k, k);
  if (f.down > 0.5) {
    // Lying flat: body stretched out behind the head.
    c.fillStyle = f.colour;
    c.beginPath();
    c.ellipse(-20 * s, 0, 34 * s, 16 * s, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.6)";
    c.lineWidth = 1.8;
    c.stroke();
    c.fillStyle = f.skin;
    c.beginPath();
    c.ellipse(-56 * s, 0, 14 * s, 9 * s, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(18 * s, 0, 12 * s, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = f.wrestler ? f.skin : f.colour2;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.arc(4 * s, side * 22 * s, (f.wrestler ? 7 : 9) * s, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    return;
  }
  // Shoulders.
  const squash = 1 - f.down * 0.4;
  c.fillStyle = f.colour;
  c.beginPath();
  c.ellipse(0, 0, 13 * s * squash, (f.wrestler ? 30 : 26) * s, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "rgba(0,0,0,0.6)";
  c.lineWidth = 1.8;
  c.stroke();
  // Gloves / hands.
  const reach = (f.wrestler ? 20 : 54) * s;
  for (const side of [-1, 1]) {
    const ext = side < 0 ? f.lead : f.rear;
    const hook = f.hook * ext;
    const gx = 12 * s + ext * reach + hook * 6 * s;
    const gy = side * (18 - ext * 12 + hook * 14) * s;
    c.fillStyle = f.wrestler ? f.skin : f.colour2;
    c.beginPath();
    c.arc(gx, gy, (f.wrestler ? 7 : 9.5) * s, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.5)";
    c.lineWidth = 1;
    c.stroke();
  }
  // Head.
  c.fillStyle = f.skin;
  c.beginPath();
  c.arc(3 * s, 0, 12 * s, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(20,12,6,0.7)";
  c.beginPath();
  c.arc(1 * s, 0, 8.5 * s, Math.PI * 0.5, Math.PI * 1.5);
  c.fill();
  c.restore();
}

function drawReferee(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.fillStyle = "rgba(0,0,0,0.22)";
  c.beginPath();
  c.arc(x + 2 * s, y + 3 * s, 15 * s, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#f8fafc";
  c.beginPath();
  c.arc(x, y, 15 * s, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#111827";
  c.lineWidth = Math.max(1, 2.2 * s);
  c.beginPath();
  c.moveTo(x - 9 * s, y - 11 * s);
  c.lineTo(x - 9 * s, y + 11 * s);
  c.moveTo(x, y - 15 * s);
  c.lineTo(x, y + 15 * s);
  c.moveTo(x + 9 * s, y - 11 * s);
  c.lineTo(x + 9 * s, y + 11 * s);
  c.stroke();
  c.fillStyle = "#3b2416";
  c.beginPath();
  c.arc(x, y, 7 * s, 0, Math.PI * 2);
  c.fill();
}

function burst(c: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string, alpha: number) {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = colour;
  c.beginPath();
  const n = 8;
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? size * 0.45 : size;
    const a = (i / (n * 2)) * Math.PI * 2;
    if (i === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
  c.restore();
}

const fA: Fighter = { x: 0, y: 0, ang: 0, colour: "", colour2: "", skin: "", down: 0, lead: 0, rear: 0, hook: 0, scale: 1, lift: 0, wrestler: false };
const fB: Fighter = { ...fA };

function drawBoxing(c: CanvasRenderingContext2D, v: View, r: Render, q: Quad<BoxingFrame>) {
  const { p0, a, b, p3, u } = q;
  const m = r.match;
  const s = v.k * 2.3;
  const pt = r.pt;
  const pu = a.pu;
  const down = a.dn ?? -1;
  for (let i = 0; i < 2; i++) {
    const f = i === 0 ? fA : fB;
    const x = cr(p0.f[3 * i], a.f[3 * i], b.f[3 * i], p3.f[3 * i], u);
    const y = cr(p0.f[3 * i + 1], a.f[3 * i + 1], b.f[3 * i + 1], p3.f[3 * i + 1], u);
    toScreen(v, x, y, pt);
    f.x = pt.x;
    f.y = pt.y;
    f.ang = screenAngle(v, lerpAngle(a.f[3 * i + 2], b.f[3 * i + 2], u));
    const side = i === 0 ? m.home : m.away;
    f.colour = side.colour;
    f.colour2 = side.colour2;
    f.skin = skinOf(side.name);
    f.down = down === i && (a.ph === 3 || a.ph === 4) ? 1 : 0;
    f.lead = 0;
    f.rear = 0;
    f.hook = 0;
    f.scale = s;
    f.lift = 0;
    f.wrestler = false;
    if (pu && pu[0] === i && a.ph === 1) {
      const e = u < 0.55 ? Math.sin((u / 0.55) * Math.PI) : 0;
      if (pu[1] === 0) f.lead = e;
      else f.rear = e;
      f.hook = pu[2] === 2 ? 1 : pu[2] === 3 ? -0.5 : 0;
    } else if (a.ph === 1) {
      // Guard up, a little bounce.
      f.lead = 0.12;
      f.rear = 0.05;
    }
  }
  // Referee: off to the side of the action, or over a fighter who's down.
  let rx = (fA.x + fB.x) / 2;
  let ry = (fA.y + fB.y) / 2;
  const dx = fB.x - fA.x;
  const dy = fB.y - fA.y;
  const l = Math.hypot(dx, dy) || 1;
  if (down >= 0 && a.ph >= 3) {
    const d = down === 0 ? fA : fB;
    rx = d.x + 42 * s;
    ry = d.y - 30 * s;
  } else {
    rx += (-dy / l) * 150 * s;
    ry += (dx / l) * 150 * s;
  }
  const lo = toScreen(v, -20, -20, r.pt2);
  const minX = lo.x;
  const minY = lo.y;
  const hi = toScreen(v, 1020, 1020, r.pt2);
  rx = clamp(rx, Math.min(minX, hi.x), Math.max(minX, hi.x));
  ry = clamp(ry, Math.min(minY, hi.y), Math.max(minY, hi.y));
  drawReferee(c, rx, ry, s);
  // The one punching is drawn on top.
  if (pu && pu[0] === 0) {
    drawFighter(c, fB);
    drawFighter(c, fA);
  } else {
    drawFighter(c, fA);
    drawFighter(c, fB);
  }
  if (pu && a.ph === 1 && pu[3] >= 1 && u > 0.2 && u < 0.75) {
    const tgt = pu[0] === 0 ? fB : fA;
    const life = 1 - (u - 0.2) / 0.55;
    if (pu[3] >= 2) burst(c, tgt.x, tgt.y, (pu[3] === 3 ? 26 : 15) * s, pu[3] === 3 ? "#fde047" : "#ffffff", life);
    else burst(c, (tgt.x + (pu[0] === 0 ? fA : fB).x) / 2, (tgt.y + (pu[0] === 0 ? fA : fB).y) / 2, 9 * s, "#cbd5e1", life * 0.8);
  }
}

function drawWrestling(c: CanvasRenderingContext2D, v: View, r: Render, q: Quad<WrestlingFrame>) {
  const { p0, a, b, p3, u } = q;
  const m = r.match;
  const s = v.k * 2.2;
  const pt = r.pt;
  const st = u < 0.5 ? a.st : b.st;
  const mv = a.mv;
  for (let i = 0; i < 2; i++) {
    const f = i === 0 ? fA : fB;
    const x = cr(p0.w[3 * i], a.w[3 * i], b.w[3 * i], p3.w[3 * i], u);
    const y = cr(p0.w[3 * i + 1], a.w[3 * i + 1], b.w[3 * i + 1], p3.w[3 * i + 1], u);
    toScreen(v, x, y, pt);
    f.x = pt.x;
    f.y = pt.y;
    f.ang = screenAngle(v, lerpAngle(a.w[3 * i + 2], b.w[3 * i + 2], u));
    const side = i === 0 ? m.home : m.away;
    f.colour = side.colour;
    f.colour2 = side.colour2;
    f.skin = skinOf(side.name);
    const s1 = st[i];
    f.down = s1 === "d" ? 1 : s1 === "g" ? 0.45 : 0;
    f.lead = s1 === "h" || s1 === "p" ? 0.7 : 0;
    f.rear = s1 === "h" || s1 === "p" ? 0.7 : 0;
    f.hook = 0;
    f.scale = s;
    f.lift = s1 === "t" ? 1 : 0;
    f.wrestler = true;
    if (mv && mv[0] === i && mv[2] === 0 && u < 0.6) {
      const e = Math.sin((u / 0.6) * Math.PI);
      f.rear = Math.max(f.rear, e);
    }
    if (s1 === "r") {
      // Motion lines while running the ropes.
      c.strokeStyle = "rgba(255,255,255,0.55)";
      c.lineWidth = 1.5;
      c.beginPath();
      const back = f.ang + Math.PI;
      for (const o of [-8, 0, 8]) {
        const ox = Math.cos(back + Math.PI / 2) * o * s;
        const oy = Math.sin(back + Math.PI / 2) * o * s;
        c.moveTo(f.x + Math.cos(back) * 30 * s + ox, f.y + Math.sin(back) * 30 * s + oy);
        c.lineTo(f.x + Math.cos(back) * 58 * s + ox, f.y + Math.sin(back) * 58 * s + oy);
      }
      c.stroke();
    }
  }
  // Referee nearby (down on the mat counting a pin).
  const pin = (a.nk === "p" && a.n) || st.includes("p");
  let rx = (fA.x + fB.x) / 2;
  let ry = (fA.y + fB.y) / 2;
  const dx = fB.x - fA.x;
  const dy = fB.y - fA.y;
  const l = Math.hypot(dx, dy) || 1;
  const off = pin ? 70 : a.nk === "o" ? 0 : 170;
  rx += (-dy / l) * off * s;
  ry += (dx / l) * off * s;
  if (a.nk === "o") {
    const mid = toScreen(v, 500, 500, r.pt2);
    rx = lerp(rx, mid.x, 0.5);
    ry = lerp(ry, mid.y, 0.5);
  } else {
    // Keep the referee inside the ropes.
    const lo = toScreen(v, 40, 40, r.pt2);
    const lx = lo.x;
    const ly = lo.y;
    const hi = toScreen(v, 960, 960, r.pt2);
    rx = clamp(rx, Math.min(lx, hi.x), Math.max(lx, hi.x));
    ry = clamp(ry, Math.min(ly, hi.y), Math.max(ly, hi.y));
  }
  drawReferee(c, rx, ry, s);
  // Whoever is on top is drawn last.
  const top = st[0] === "d" ? 1 : st[1] === "d" ? 0 : mv ? mv[0] : 0;
  if (top === 0) {
    drawFighter(c, fB);
    drawFighter(c, fA);
  } else {
    drawFighter(c, fA);
    drawFighter(c, fB);
  }
  if (mv && u > 0.4 && u < 0.95 && mv[2] !== 5 && mv[2] !== 6) {
    const victim = mv[0] === 0 ? fB : fA;
    const life = 1 - (u - 0.4) / 0.55;
    burst(c, victim.x, victim.y, (mv[2] >= 3 ? 34 : 18) * s, mv[2] >= 3 ? "#fde047" : "#ffffff", life * 0.9);
  }
}

// ---------------------------------------------------------------- one animation frame

export type Flash = { until: number; side: number; pts: number };

/** Draws the frame at playback time `t` (ms after kick-off). `i` is the index of the frame at or before `t`. */
export function drawMatch(
  c: CanvasRenderingContext2D,
  v: View,
  bg: HTMLCanvasElement,
  r: Render,
  frames: Frame[],
  i: number,
  t: number,
  now: number,
  flash: Flash,
) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(bg, 0, 0);
  if (!frames.length) return;
  const a = frames[i];
  const b = frames[Math.min(frames.length - 1, i + 1)];
  const p0 = frames[Math.max(0, i - 1)];
  const p3 = frames[Math.min(frames.length - 1, i + 2)];
  const u = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
  syncNumbers(r, frames, i);
  c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  QUAD.p0 = p0;
  QUAD.a = a;
  QUAD.b = b;
  QUAD.p3 = p3;
  QUAD.u = u;
  switch (v.sport) {
    case "football":
      drawFootball(c, v, r, QUAD as Quad<FootballFrame>, now, flash.until);
      break;
    case "basketball":
      drawBasketball(c, v, r, QUAD as Quad<BasketballFrame>, now, flash);
      break;
    case "boxing":
      drawBoxing(c, v, r, QUAD as Quad<BoxingFrame>);
      break;
    case "wrestling":
      drawWrestling(c, v, r, QUAD as Quad<WrestlingFrame>);
      break;
  }
}

/** Index of the last frame with frame.t <= t (0 if none), starting the search from `hint`. */
export function frameAt(frames: Frame[], t: number, hint: number): number {
  const n = frames.length;
  if (!n) return 0;
  let i = clamp(hint, 0, n - 1);
  if (frames[i].t <= t && (i === n - 1 || frames[i + 1].t > t)) return i;
  if (frames[i].t <= t && i + 2 < n && frames[i + 1].t <= t && frames[i + 2].t > t) return i + 1;
  let lo = 0;
  let hi = n - 1;
  if (frames[0].t > t) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  i = lo;
  return i;
}
