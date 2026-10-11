// Bridges, flyovers and railways with their real curves (from the map), turned into short
// straight pieces for drawing: each piece knows where it starts and ends (in tiles) and how high,
// so a bridge rises off the road, runs along on piers and comes down again, smoothly, with no
// steps. Also which tiles they pass over, so nothing is ever built where a deck or a track runs
// (no bridge passes through a building), and where the stations stand along the railways.

import { line4 } from "./raster.ts";

export type SpanKind = "road" | "rail";

/** One straight piece of a bridge, flyover or railway. */
export type Piece = {
  kind: SpanKind;
  ax: number;
  az: number;
  ay: number;
  bx: number;
  bz: number;
  by: number;
  /** Deck width (tiles). */
  width: number;
  /** A pier under its start. */
  pier: boolean;
  /** On the ground (a railway at grade): ballast and rails, no deck. */
  ground: boolean;
};

export type StationPlan = { name: string; x: number; z: number; /** Along the line (radians, as ry). */ ry: number; raised: boolean };

/** A line in tiles, with what it is. */
export type SpanLine = { kind: SpanKind; pts: { x: number; z: number }[]; raised: boolean; overWater: (x: number, z: number) => boolean; major: boolean };

/** How high a road deck runs over land and over water, and a railway viaduct. */
export const DECK = { land: 0.62, water: 0.5, rail: 0.55 };
/** How long (tiles) a ramp up or down takes. */
const RAMP = 1.2;
/** How long each drawn piece is at most (tiles). */
const STEP = 0.35;
/** Piers every this far (tiles). */
const PIER_EVERY = 0.9;

/**
 * Join pieces of the same bridge that the map split in two (so a flyover doesn't dip in the
 * middle where one piece of it ends and the next begins): lines whose ends meet are chained.
 */
export function chainLines(lines: { x: number; z: number }[][]): { x: number; z: number }[][] {
  const key = (p: { x: number; z: number }) => `${Math.round(p.x * 20)},${Math.round(p.z * 20)}`;
  const ends = new Map<string, number[]>();
  lines.forEach((l, k) => {
    for (const p of [l[0], l[l.length - 1]]) ends.set(key(p), [...(ends.get(key(p)) ?? []), k]);
  });
  const used = new Set<number>();
  const out: { x: number; z: number }[][] = [];
  for (let k = 0; k < lines.length; k++) {
    if (used.has(k)) continue;
    used.add(k);
    let chain = [...lines[k]];
    // Grow from both ends while exactly one other line meets there.
    for (let grew = true; grew; ) {
      grew = false;
      for (const atEnd of [true, false]) {
        const p = atEnd ? chain[chain.length - 1] : chain[0];
        const next = (ends.get(key(p)) ?? []).filter((n) => !used.has(n));
        if (next.length !== 1) continue;
        const n = next[0];
        used.add(n);
        let l = lines[n];
        const startsHere = key(l[0]) === key(p);
        if (atEnd) chain = [...chain, ...(startsHere ? l : [...l].reverse()).slice(1)];
        else {
          l = startsHere ? [...l].reverse() : l;
          chain = [...l.slice(0, -1), ...chain];
        }
        grew = true;
      }
    }
    out.push(chain);
  }
  return out;
}

/** Cut a line into pieces with heights: up a ramp at each end (unless on the ground), level between. */
export function piecesOf(line: SpanLine): Piece[] {
  const pts = line.pts;
  const len: number[] = [0];
  for (let k = 1; k < pts.length; k++) len.push(len[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
  const total = len[len.length - 1];
  if (total < 0.05) return [];
  const at = (s: number) => {
    let k = 1;
    while (k < pts.length - 1 && len[k] < s) k++;
    const f = (s - len[k - 1]) / Math.max(1e-9, len[k] - len[k - 1]);
    return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * f, z: pts[k - 1].z + (pts[k].z - pts[k - 1].z) * f };
  };
  const ground = line.kind === "rail" && !line.raised;
  const top = (p: { x: number; z: number }) => (line.kind === "rail" ? DECK.rail : line.overWater(Math.round(p.x), Math.round(p.z)) ? DECK.water : DECK.land);
  // Short bridges (over a canal, a creek) only hump up a little; long ones ramp to full height.
  const ramp = Math.min(RAMP, total / 2.5);
  const height = (s: number, p: { x: number; z: number }) => {
    if (ground) return 0.07;
    const up = Math.min(1, s / ramp, (total - s) / ramp);
    const full = total < 2 ? 0.22 : top(p);
    return 0.07 + (full - 0.07) * Math.max(0, up);
  };
  const n = Math.max(1, Math.ceil(total / STEP));
  const out: Piece[] = [];
  let lastPier = -Infinity;
  for (let k = 0; k < n; k++) {
    const s0 = (total * k) / n;
    const s1 = (total * (k + 1)) / n;
    const a = at(s0);
    const b = at(s1);
    const ay = height(s0, a);
    const pier = !ground && ay > 0.3 && s0 - lastPier >= PIER_EVERY;
    if (pier) lastPier = s0;
    out.push({ kind: line.kind, ax: a.x, az: a.z, ay, bx: b.x, bz: b.z, by: height(s1, b), width: line.kind === "rail" ? 0.3 : line.major ? 0.44 : 0.32, pier, ground });
  }
  return out;
}

/** Every tile a line's deck covers (its centre line, and its edges), for keeping buildings off it. */
export function tilesUnder(line: SpanLine, put: (x: number, z: number) => void) {
  const half = line.kind === "rail" ? 0.25 : line.major ? 0.3 : 0.22;
  const pts = line.pts;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / d;
    const nz = (b.x - a.x) / d;
    for (const o of [-half, 0, half]) line4(a.x + nx * o, a.z + nz * o, b.x + nx * o, b.z + nz * o, put);
  }
}

/** Where each station stands: on the nearest point of a railway, lined up with it. */
export function placeStations(stations: { name: string; x: number; z: number }[], lines: SpanLine[]): StationPlan[] {
  const out: StationPlan[] = [];
  for (const st of stations) {
    let best: StationPlan | null = null;
    let bestD = 4; // within 400 m of a railway, or it isn't one of ours
    for (const l of lines) {
      if (l.kind !== "rail") continue;
      for (let k = 1; k < l.pts.length; k++) {
        const a = l.pts[k - 1];
        const b = l.pts[k];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len2 = dx * dx + dz * dz || 1;
        const f = Math.max(0, Math.min(1, ((st.x - a.x) * dx + (st.z - a.z) * dz) / len2));
        const px = a.x + dx * f;
        const pz = a.z + dz * f;
        const d = Math.hypot(st.x - px, st.z - pz);
        if (d < bestD) {
          bestD = d;
          best = { name: st.name, x: px, z: pz, ry: -Math.atan2(dz, dx), raised: l.raised };
        }
      }
    }
    if (best) out.push(best);
  }
  return out;
}
