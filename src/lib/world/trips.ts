// Getting from one spot to another on a real map: by road where the land (and its bridges) joins
// up, and by ferry where it doesn't (an island with no bridge, across the lagoon). Lagos has real
// ferries (LAGFERRY): the fare is a crossing plus the ride on land either side.
//
// Which pieces of land join up is worked out once per region: every land tile, and every road
// over the water (a bridge), flood-filled into pieces. Two spots on the same piece go by road.

import type { RegionMap } from "./compile.ts";
import { regionMap } from "./index.ts";

const pieces = new WeakMap<RegionMap, { W: number; id: Int32Array }>();

/** Which piece of land each tile is on (-1 for open water). */
function landPieces(map: RegionMap) {
  const hit = pieces.get(map);
  if (hit) return hit;
  const { x0, x1, z0, z1 } = map.bounds;
  const W = x1 - x0 + 1;
  const H = z1 - z0 + 1;
  const id = new Int32Array(W * H).fill(-2);
  const dry = (x: number, z: number) => !map.waterAt(x, z) || !!map.roadAt(x, z);
  let next = 0;
  const stack: number[] = [];
  for (let k = 0; k < W * H; k++) {
    if (id[k] !== -2) continue;
    const x = x0 + (k % W);
    const z = z0 + Math.floor(k / W);
    if (!dry(x, z)) {
      id[k] = -1;
      continue;
    }
    const piece = next++;
    id[k] = piece;
    stack.push(k);
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % W;
      const cz = Math.floor(c / W);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const n = nz * W + nx;
        if (id[n] !== -2) continue;
        if (!dry(x0 + nx, z0 + nz)) {
          id[n] = -1;
          continue;
        }
        id[n] = piece;
        stack.push(n);
      }
    }
  }
  const out = { W, id };
  pieces.set(map, out);
  return out;
}

/** The piece of land a spot is on (the nearest dry tile's, for a spot right on the shore). */
function pieceAt(map: RegionMap, x: number, z: number) {
  const { W, id } = landPieces(map);
  const { x0, z0 } = map.bounds;
  for (let r = 0; r <= 2; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (!map.inside(x + dx, z + dz)) continue;
        const v = id[(z + dz - z0) * W + (x + dx - x0)];
        if (v >= 0) return v;
      }
    }
  }
  return -1;
}

/**
 * How much of a trip (km) is by ferry: 0 when both ends are joined by land or bridges, otherwise
 * the open water the straight way crosses (at least half a km).
 */
export function ferryKm(map: RegionMap, a: { x: number; z: number }, b: { x: number; z: number }) {
  const pa = pieceAt(map, Math.round(a.x), Math.round(a.z));
  const pb = pieceAt(map, Math.round(b.x), Math.round(b.z));
  if (pa === pb || pa < 0 || pb < 0) return 0;
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(d / 0.25));
  let wet = 0;
  for (let k = 0; k <= steps; k++) {
    const x = Math.round(a.x + ((b.x - a.x) * k) / steps);
    const z = Math.round(a.z + ((b.z - a.z) * k) / steps);
    if (map.waterAt(x, z) && !map.roadAt(x, z)) wet++;
  }
  return Math.max(0.5, Math.round((wet / (steps + 1)) * d * 0.1 * 10) / 10);
}

/** The ferry part of a trip between two ids ("lagos:12,-40/3", "lagos:20,-31"), in km (0: by road). */
export function ferryKmBetween(from: string, to: string): number {
  const a = /^([a-z0-9-]+):(-?\d+),(-?\d+)/.exec(from);
  const b = /^([a-z0-9-]+):(-?\d+),(-?\d+)/.exec(to);
  if (!a || !b || a[1] !== b[1]) return 0;
  const map = regionMap(a[1]);
  return map ? ferryKm(map, { x: Number(a[2]), z: Number(a[3]) }, { x: Number(b[2]), z: Number(b[3]) }) : 0;
}
