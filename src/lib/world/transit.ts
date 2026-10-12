// The real map's railway routes and lagoon ferry crossings (no drawing here, so the tests can run
// it): rail lines joined end to end into long routes, ferry ways over open water between the
// jetties, and the out-and-back timetables both run to. Drawn and ridden in
// src/app/play/city/real-transit.ts.

import type { RegionMap } from "./compile.ts";

export type Pt = { x: number; y: number; z: number };
/** A path (tiles) with the distance along it at each point. */
export type Path = { pts: Pt[]; at: number[]; len: number };
/** A stop part way along a route (distance along it, and its name). */
export type Stop = { s: number; name: string };
/** One leg of a vehicle's timetable: from s0 to s1 between t0 and t1 seconds (s0 = s1: waiting). */
export type Leg = { t0: number; t1: number; s0: number; s1: number };


export function pathOf(pts: Pt[]): Path {
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { pts, at, len: at[at.length - 1] };
}

/** The point and heading at distance s along a path. */
export function sample(p: Path, s: number, out: { x: number; y: number; z: number; dx: number; dz: number }) {
  const d = Math.max(0, Math.min(p.len, s));
  let lo = 0;
  let hi = p.at.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p.at[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = p.pts[lo];
  const b = p.pts[hi];
  const seg = p.at[hi] - p.at[lo] || 1;
  const u = (d - p.at[lo]) / seg;
  out.x = a.x + (b.x - a.x) * u;
  out.y = a.y + (b.y - a.y) * u;
  out.z = a.z + (b.z - a.z) * u;
  const n = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  out.dx = (b.x - a.x) / n;
  out.dz = (b.z - a.z) / n;
}

/**
 * The railways joined end to end into long routes: start from the longest line still free and keep
 * adding the longest line that carries on from either end (the map splits a railway at every
 * bridge and junction). The longest few routes, each at least 3 km.
 */
export function railRoutes(map: RegionMap): Pt[][] {
  const lines = map.rails.map((r) => r.pts).filter((p) => p.length > 1);
  const length = (p: Pt[]) => pathOf(p).len;
  const used = new Set<number>();
  const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z) < 1.2;
  const order = lines.map((p, i) => ({ i, len: length(p) })).sort((a, b) => b.len - a.len);
  const routes: Pt[][] = [];
  for (const { i } of order) {
    if (used.has(i)) continue;
    used.add(i);
    let route = [...lines[i]];
    for (let grew = true; grew; ) {
      grew = false;
      let best: { j: number; pts: Pt[]; atEnd: boolean; len: number } | null = null;
      for (let j = 0; j < lines.length; j++) {
        if (used.has(j)) continue;
        const l = lines[j];
        const end = route[route.length - 1];
        const start = route[0];
        const len = length(l);
        const tryIt = (pts: Pt[], atEnd: boolean) => {
          if (!best || len > best.len) best = { j, pts, atEnd, len };
        };
        if (near(end, l[0])) tryIt(l, true);
        else if (near(end, l[l.length - 1])) tryIt([...l].reverse(), true);
        else if (near(start, l[l.length - 1])) tryIt(l, false);
        else if (near(start, l[0])) tryIt([...l].reverse(), false);
      }
      if (best) {
        const b = best as { j: number; pts: Pt[]; atEnd: boolean };
        used.add(b.j);
        route = b.atEnd ? [...route, ...b.pts.slice(1)] : [...b.pts.slice(0, -1), ...route];
        grew = true;
      }
    }
    if (length(route) >= 30) routes.push(route);
  }
  return routes.sort((a, b) => length(b) - length(a)).slice(0, 4);
}

/** The jetties ferries run between (approximately; each moves to the nearest open water). */
export const JETTIES: { name: string; lat: number; lon: number }[] = [
  { name: "CMS", lat: 6.4505, lon: 3.3925 },
  { name: "Falomo", lat: 6.4415, lon: 3.4285 },
  { name: "Ebute Ero", lat: 6.4635, lon: 3.3855 },
  { name: "Ikorodu", lat: 6.6085, lon: 3.4955 },
  { name: "Mile 2", lat: 6.4595, lon: 3.3195 },
  { name: "Badore", lat: 6.5065, lon: 3.5605 },
  { name: "Five Cowries", lat: 6.4385, lon: 3.4205 },
  { name: "Ijede", lat: 6.5745, lon: 3.5945 },
];
export const FERRY_ROUTES: [string, string][] = [
  ["CMS", "Ikorodu"],
  ["Ebute Ero", "Falomo"],
  ["Five Cowries", "Badore"],
  ["Mile 2", "CMS"],
  ["Falomo", "Ijede"],
];

/** The shortest way over water between two spots (8 ways round each tile), smoothed; null if none. */
export function waterWay(map: RegionMap, from: { x: number; z: number }, to: { x: number; z: number }): Pt[] | null {
  const { x0, x1, z0, z1 } = map.bounds;
  const W = x1 - x0 + 1;
  const H = z1 - z0 + 1;
  const wet = (x: number, z: number) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && map.waterAt(x, z) > 0;
  // Each end moves to the nearest water (within a kilometre).
  const snap = (p: { x: number; z: number }) => {
    for (let r = 0; r <= 10; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === r && wet(Math.round(p.x) + dx, Math.round(p.z) + dz)) return { x: Math.round(p.x) + dx, z: Math.round(p.z) + dz };
    return null;
  };
  const a = snap(from);
  const b = snap(to);
  if (!a || !b) return null;
  const idx = (x: number, z: number) => (z - z0) * W + (x - x0);
  const prev = new Int32Array(W * H).fill(-1);
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  prev[idx(a.x, a.z)] = idx(a.x, a.z);
  queue[tail++] = idx(a.x, a.z);
  const goal = idx(b.x, b.z);
  while (head < tail && prev[goal] < 0) {
    const c = queue[head++];
    const cx = (c % W) + x0;
    const cz = Math.floor(c / W) + z0;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (!wet(nx, nz)) continue;
        // No cutting corners across land.
        if (dx && dz && (!wet(cx + dx, cz) || !wet(cx, cz + dz))) continue;
        const k = idx(nx, nz);
        if (prev[k] >= 0) continue;
        prev[k] = c;
        queue[tail++] = k;
      }
  }
  if (prev[goal] < 0) return null;
  const cells: Pt[] = [];
  for (let k = goal; ; k = prev[k]) {
    cells.push({ x: (k % W) + x0, y: 0, z: Math.floor(k / W) + z0 });
    if (k === prev[k]) break;
  }
  cells.reverse();
  // Smooth the staircase: average each point with its neighbours a few times.
  let pts = cells;
  for (let pass = 0; pass < 4; pass++)
    pts = pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : { x: (pts[i - 1].x + p.x * 2 + pts[i + 1].x) / 4, y: 0, z: (pts[i - 1].z + p.z * 2 + pts[i + 1].z) / 4 }));
  return pts.length > 3 ? pts : null;
}

/** Out along the path stopping at each stop, a wait at the end, and back the same way. */
export function timetable(path: Path, stops: Stop[], speed: number, dwell: number, turn: number) {
  const marks = [0, ...stops.map((s) => s.s).filter((s) => s > 0.5 && s < path.len - 0.5), path.len].sort((a, b) => a - b);
  const legs: Leg[] = [];
  let t = 0;
  const run = (from: number, to: number) => {
    // A little longer than flat out: pulling away and slowing down for the stop.
    const T = (Math.abs(to - from) / speed) * 1.25 + 4;
    legs.push({ t0: t, t1: t + T, s0: from, s1: to });
    t += T;
  };
  const wait = (s: number, T: number) => {
    legs.push({ t0: t, t1: t + T, s0: s, s1: s });
    t += T;
  };
  for (let k = 1; k < marks.length; k++) {
    run(marks[k - 1], marks[k]);
    wait(marks[k], k === marks.length - 1 ? turn : dwell);
  }
  for (let k = marks.length - 2; k >= 0; k--) {
    run(marks[k + 1], marks[k]);
    wait(marks[k], k === 0 ? turn : dwell);
  }
  return { legs, period: t };
}

