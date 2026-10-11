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
export type SpanLine = {
  kind: SpanKind;
  pts: { x: number; z: number }[];
  raised: boolean;
  overWater: (x: number, z: number) => boolean;
  major: boolean;
  /** Its level where bridges cross (1 the usual, 2 above that...). */
  layer?: number;
  /**
   * Whether each end (start, end) joins another bridge rather than coming down to the road:
   * a joined end stays up, so an interchange's decks meet instead of dipping to the ground.
   */
  joins?: [boolean, boolean];
  /**
   * How high each joined end must be to meet the deck it joins (set by settleJoins), so a ramp
   * between levels meets both decks with no step.
   */
  meet?: [number | null, number | null];
};

/** How high a road deck runs over land and over water, and a railway viaduct. */
export const DECK = { land: 0.62, water: 0.5, rail: 0.55 };
/** How much higher each level above the first stands (decks that cross never touch). */
export const LEVEL = 0.32;
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

/** Lengths along a line's points (tiles): [0, ..., total]. */
function lengths(pts: { x: number; z: number }[]) {
  const len: number[] = [0];
  for (let k = 1; k < pts.length; k++) len.push(len[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
  return len;
}

/** How high a line's deck is at each distance along it (tiles), ramps and joins included. */
export function heightAlong(line: SpanLine): (s: number) => number {
  const pts = line.pts;
  const len = lengths(pts);
  const total = len[len.length - 1];
  const at = (s: number) => {
    let k = 1;
    while (k < pts.length - 1 && len[k] < s) k++;
    const f = (s - len[k - 1]) / Math.max(1e-9, len[k] - len[k - 1]);
    return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * f, z: pts[k - 1].z + (pts[k].z - pts[k - 1].z) * f };
  };
  const ground = line.kind === "rail" && !line.raised;
  const extra = ((line.layer ?? 1) - 1) * LEVEL;
  const top = (p: { x: number; z: number }) => extra + (line.kind === "rail" ? DECK.rail : line.overWater(Math.round(p.x), Math.round(p.z)) ? DECK.water : DECK.land);
  // Short bridges (over a canal, a creek) only hump up a little; long ones ramp to full height.
  // An end that joins another bridge doesn't come down to the road: it meets that deck's height.
  const [joinA, joinB] = line.joins ?? [false, false];
  const [meetA, meetB] = line.meet ?? [null, null];
  const ramps = (joinA ? 0 : 1) + (joinB ? 0 : 1);
  const ramp = Math.min(RAMP + extra * 2, total / Math.max(1, ramps * 1.25));
  return (s: number) => {
    if (ground) return 0.07;
    const p = at(s);
    const up = Math.min(1, joinA ? 1 : s / ramp, joinB ? 1 : (total - s) / ramp);
    const full = total < 2 && !joinA && !joinB ? 0.22 : top(p);
    let h = 0.07 + (full - 0.07) * Math.max(0, up);
    // Blend into the height of the deck each joined end meets, over a ramp's length.
    // (Never longer than the deck itself, so a short stub off a flyover still reaches the ground.)
    const blend = Math.min(Math.max(ramp, RAMP), joinA && joinB ? total / 2 : total);
    if (joinA && meetA != null && s < blend) h = meetA + (h - meetA) * (s / blend);
    if (joinB && meetB != null && total - s < blend) h = meetB + (h - meetB) * ((total - s) / blend);
    return h;
  };
}

/** Cut a line into pieces with heights: up a ramp at each end (unless on the ground), level between. */
export function piecesOf(line: SpanLine): Piece[] {
  const pts = line.pts;
  const len = lengths(pts);
  const total = len[len.length - 1];
  if (total < 0.05) return [];
  const at = (s: number) => {
    let k = 1;
    while (k < pts.length - 1 && len[k] < s) k++;
    const f = (s - len[k - 1]) / Math.max(1e-9, len[k] - len[k - 1]);
    return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * f, z: pts[k - 1].z + (pts[k].z - pts[k - 1].z) * f };
  };
  const ground = line.kind === "rail" && !line.raised;
  const height = heightAlong(line);
  const n = Math.max(1, Math.ceil(total / STEP));
  const out: Piece[] = [];
  let lastPier = -Infinity;
  for (let k = 0; k < n; k++) {
    const s0 = (total * k) / n;
    const s1 = (total * (k + 1)) / n;
    const a = at(s0);
    const b = at(s1);
    const ay = height(s0);
    const pier = !ground && ay > 0.3 && s0 - lastPier >= PIER_EVERY;
    if (pier) lastPier = s0;
    out.push({ kind: line.kind, ax: a.x, az: a.z, ay, bx: b.x, bz: b.z, by: height(s1), width: line.kind === "rail" ? 0.3 : line.major ? 0.44 : 0.32, pier, ground });
  }
  return out;
}

/** The nearest point of a line to p: how far, and how far along the line it is (tiles). */
function nearest(p: { x: number; z: number }, pts: { x: number; z: number }[]) {
  let best = { d: Infinity, s: 0 };
  let run = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const seg = Math.hypot(dx, dz);
    const f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(p.x - (a.x + dx * f), p.z - (a.z + dz * f));
    if (d < best.d) best = { d, s: run + seg * f };
    run += seg;
  }
  return best;
}

/** The way a line runs out of its start (end = false) or its end (end = true), as a unit vector. */
function outward(pts: { x: number; z: number }[], end: boolean) {
  const [tip, ...rest] = end ? [...pts].reverse() : pts;
  // Look back about half a tile, so a tiny kink at the very end doesn't count.
  let back = rest[0] ?? tip;
  for (const q of rest) {
    back = q;
    if (Math.hypot(q.x - tip.x, q.z - tip.z) > 0.5) break;
  }
  const d = Math.hypot(tip.x - back.x, tip.z - back.z) || 1;
  return { x: (tip.x - back.x) / d, z: (tip.z - back.z) / d };
}

/** How close (tiles) an end must come to another deck to join it. */
const JOIN_REACH = 0.35;

/**
 * For each line, whether its ends join another line of the same kind (see SpanLine.joins).
 * Joining means the road carries on along the other deck: two carriageways of one flyover that
 * simply end side by side don't hold each other up (that left both hanging in mid-air).
 */
export function findJoins(lines: SpanLine[]) {
  const partners: { line: SpanLine; s: number }[][] = [];
  for (const l of lines) {
    if (!l.raised) continue;
    const joins: [boolean, boolean] = [false, false];
    for (const end of [false, true]) {
      const e = end ? l.pts[l.pts.length - 1] : l.pts[0];
      const u = outward(l.pts, end);
      for (const o of lines) {
        if (o === l || o.kind !== l.kind || !o.raised) continue;
        const near = nearest(e, o.pts);
        if (near.d >= JOIN_REACH) continue;
        const total = lengths(o.pts).at(-1)!;
        // Which ways the other deck goes on from where they meet: both ways from its middle,
        // one way from either of its ends.
        const ways: { x: number; z: number }[] = [];
        if (near.s > 0.3) ways.push(outward(o.pts, false));
        if (total - near.s > 0.3) ways.push(outward(o.pts, true));
        // The road carries on if one of those ways doesn't lead straight back where we came from.
        if (ways.some((v) => u.x * v.x + u.z * v.z > -0.5)) {
          joins[end ? 1 : 0] = true;
          (partners[lines.indexOf(l)] ??= [])[end ? 1 : 0] = { line: o, s: near.s };
          break;
        }
      }
    }
    l.joins = joins;
  }
  settleJoins(lines, partners);
}

/**
 * Each joined end meets the deck it joins at that deck's own height there (a few rounds, as
 * ends that join each other settle), so ramps between levels have no step and a deck that
 * joins one that is itself coming down comes down with it.
 */
function settleJoins(lines: SpanLine[], partners: { line: SpanLine; s: number }[][]) {
  // Two decks that join each other end to end (a ramp between levels) meet halfway between
  // their own heights; every other joined end takes the height of the deck it runs into.
  const natural = new Map(lines.map((l) => [l, heightAlong(l)]));
  const fixed = new Map<SpanLine, [number | null, number | null]>();
  lines.forEach((l, k) => {
    const ps = partners[k];
    if (!ps) return;
    const total = lengths(l.pts).at(-1)!;
    for (const i of [0, 1] as const) {
      const p = ps[i];
      if (!p) continue;
      const back = partners[lines.indexOf(p.line)]?.findIndex((q) => q?.line === l) ?? -1;
      if (back < 0) continue;
      const oTotal = lengths(p.line.pts).at(-1)!;
      const h = (natural.get(l)!(i ? total : 0) + natural.get(p.line)!(back ? oTotal : 0)) / 2;
      const f = fixed.get(l) ?? [null, null];
      f[i] = h;
      fixed.set(l, f);
    }
  });
  for (const [l, f] of fixed) l.meet = [...f];
  for (let round = 0; round < 4; round++) {
    const heights = new Map(lines.map((l) => [l, heightAlong(l)]));
    let moved = false;
    lines.forEach((l, k) => {
      const ps = partners[k];
      if (!ps) return;
      const meet: [number | null, number | null] = [...(l.meet ?? [null, null])];
      for (const i of [0, 1] as const) {
        if (!ps[i] || fixed.get(l)?.[i] != null) continue;
        const h = heights.get(ps[i].line)!(ps[i].s);
        if (meet[i] == null || Math.abs(meet[i]! - h) > 1e-4) moved = true;
        meet[i] = h;
      }
      l.meet = meet;
    });
    if (!moved) break;
  }
}

/** A deck that ends in mid-air, or meets another with a step: what auditSpans finds. */
export type SpanFault = { x: number; z: number; what: "hanging" | "step" };

/**
 * Checks every raised deck's two ends: each must come down to the ground or meet another deck
 * at its own height. The tests run it over each whole region, so a fresh bake with a new kind
 * of broken bridge fails the tests instead of showing up in the game.
 */
export function auditSpans(lines: SpanLine[]): SpanFault[] {
  const faults: SpanFault[] = [];
  const heights = new Map(lines.map((l) => [l, heightAlong(l)]));
  for (const l of lines) {
    if (!l.raised) continue;
    const total = lengths(l.pts).at(-1)!;
    if (total < 0.05) continue;
    for (const end of [false, true]) {
      const e = end ? l.pts[l.pts.length - 1] : l.pts[0];
      const h = heights.get(l)!(end ? total : 0);
      if (h < 0.15) continue;
      let met = false;
      let step = false;
      for (const o of lines) {
        if (o === l || o.kind !== l.kind || !o.raised) continue;
        const near = nearest(e, o.pts);
        if (near.d >= JOIN_REACH) continue;
        const oTotal = lengths(o.pts).at(-1)!;
        // Meeting another deck only where it carries on (not side by side at its own dead end).
        const u = outward(l.pts, end);
        const ways: { x: number; z: number }[] = [];
        if (near.s > 0.3) ways.push(outward(o.pts, false));
        if (oTotal - near.s > 0.3) ways.push(outward(o.pts, true));
        if (!ways.some((v) => u.x * v.x + u.z * v.z > -0.5)) continue;
        // Where it meets: the nearest point, or either end of the other deck (a looping ramp
        // can pass close by its own start just where it ends).
        const spots = [near.s, ...[0, oTotal].filter((t) => Math.hypot((t ? o.pts[o.pts.length - 1] : o.pts[0]).x - e.x, (t ? o.pts[o.pts.length - 1] : o.pts[0]).z - e.z) < JOIN_REACH * 1.5)];
        if (spots.some((t) => Math.abs(heights.get(o)!(t) - h) < 0.05)) met = true;
        else step = true;
      }
      if (!met) faults.push({ x: e.x, z: e.z, what: step ? "step" : "hanging" });
    }
  }
  return faults;
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
