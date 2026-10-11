// Turns a region's data files into quick lookups for the city layout: is this tile water, is a
// main road here, which landmark stands here. Worked out once per region (a few milliseconds),
// then every question is a single lookup, so even a huge region costs nothing per frame.

import type { StructureType, TileKind } from "@/lib/city/layout";
import { type Frame, type LatLon, toTile, tileBounds } from "./geo.ts";
import type { BakedGrid, Landmark, Region, Road, RoadKind } from "./region.ts";

/** 0 land, 1 lagoon or creek, 2 sea. */
export type Water = 0 | 1 | 2;

export type PlacedLandmark = { id: string; type: StructureType; name: string; ax: number; az: number; w: number; d: number; inside?: string[] };
export type Spot = { id: string; kind: TileKind; name: string };
export type RoadTile = { kind: RoadKind; bridge: boolean; name?: string };

export type RegionMap = {
  region: Region;
  frame: Frame;
  /** The tiles the region covers (inclusive). */
  bounds: { x0: number; x1: number; z0: number; z1: number };
  inside: (x: number, z: number) => boolean;
  waterAt: (x: number, z: number) => Water;
  roadAt: (x: number, z: number) => RoadTile | undefined;
  /** Big landmark buildings, in the order they were placed. */
  landmarks: PlacedLandmark[];
  /** Single-tile landmarks (a famous club, a hospital...). */
  spotAt: (x: number, z: number) => Spot | undefined;
  /** Downtowns and quieter districts, for how built-up each spot is (as CityPlan centres). */
  centres: { x: number; z: number; radius: number; weight: number }[];
  /** Is there a footbridge over the road here (from the map)? */
  footbridgeAt: (x: number, z: number) => boolean;
  /** A road raised over land here (a flyover, an interchange, a bridge's approach)? */
  flyoverAt: (x: number, z: number) => boolean;
  /** What land costs at a spot, per m², in the region's currency: the districts' prices blended. */
  landPriceAt: (x: number, z: number) => number;
  /**
   * What a spot is called: "Akoka · Yaba" (its neighbourhood and its district), just the district
   * when no neighbourhood is near, or the water's own name.
   */
  areaAt: (x: number, z: number) => string;
  /** Landmarks left out because they overlapped one placed before them (worth a correction). */
  skipped: { id: string; reason: string }[];
};

/** Every big building type's size in tiles when a landmark doesn't give one. */
const SIZE: Partial<Record<StructureType, [number, number]>> = {
  bank: [3, 3], arena: [4, 4], capitol: [3, 3], megamall: [3, 3], bigpark: [5, 5], gym: [3, 3], cathedral: [4, 4],
  grandmosque: [4, 4], spa: [3, 3], intlairport: [7, 5], spaceport: [5, 5],
};

const STRUCTURES = new Set<string>([
  "mall", "twin", "museum", "funfair", "market", "arena", "campus", "hotel", "solar", "airport", "port", "military", "power", "dam",
  "oilrig", "waterpark", "court", "boxing", "wrestling", "capitol", "megamall", "bank", "bigpark", "gym", "spa", "cathedral",
  "grandmosque", "intlairport", "spaceport",
]);

export const isStructureType = (t: string): t is StructureType => STRUCTURES.has(t);

const tileKey = (x: number, z: number) => (x + 32768) * 65536 + (z + 32768);

const cache = new WeakMap<Region, RegionMap>();

export function compileRegion(region: Region): RegionMap {
  const hit = cache.get(region);
  if (hit) return hit;
  const frame: Frame = { origin: region.origin };
  const bounds = tileBounds(frame, region.box);
  const W = bounds.x1 - bounds.x0 + 1;
  const H = bounds.z1 - bounds.z0 + 1;
  const inside = (x: number, z: number) => x >= bounds.x0 && x <= bounds.x1 && z >= bounds.z0 && z <= bounds.z1;
  const at = (p: LatLon) => toTile(frame, p);

  const cell = (x: number, z: number) => (z - bounds.z0) * W + (x - bounds.x0);
  const area = (path: [number, number][], put: (x: number, z: number) => void) =>
    fillArea(path.map(([lat, lon]) => at({ lat, lon })), (x, z) => inside(x, z) && put(x, z));

  // ---- land and water: the baked map, then the fixes in order
  const water = new Uint8Array(W * H);
  if (region.water) readGrid(region.water, inside, (x, z, ch) => (water[cell(x, z)] = ch === "S" ? 2 : ch === "W" ? 1 : 0));
  for (const c of region.corrections) {
    if (c.kind === "land" || c.kind === "lagoon" || c.kind === "sea") {
      const v = c.kind === "sea" ? 2 : c.kind === "lagoon" ? 1 : 0;
      area(c.area, (x, z) => (water[cell(x, z)] = v));
    }
  }
  const waterAt = (x: number, z: number): Water => (inside(x, z) ? (water[cell(x, z)] as Water) : 0);

  // ---- main roads and bridges: the baked map, the roads with real curves, then the fixes in order
  // 0 none, 1-5 tertiary to motorway, +8 on a bridge.
  const road = new Uint8Array(W * H);
  const LETTER: Record<string, number> = { E: 1, D: 2, C: 3, B: 4, A: 5 };
  if (region.roadGrid) {
    readGrid(region.roadGrid, inside, (x, z, ch) => {
      const v = LETTER[ch.toUpperCase()];
      if (v) road[cell(x, z)] = v + (ch === ch.toLowerCase() ? 8 : 0);
    });
  }
  const RANK: Record<RoadKind, number> = { tertiary: 1, secondary: 2, primary: 3, trunk: 4, motorway: 5 };
  const names = new Map<number, string>();
  const draw = (r: Road) => {
    const v = RANK[r.kind] + (r.bridge ? 8 : 0);
    const pts = r.path.map(([lat, lon]) => at({ lat, lon }));
    for (let k = 1; k < pts.length; k++) {
      line4(pts[k - 1].x, pts[k - 1].z, pts[k].x, pts[k].z, (x, z) => {
        if (!inside(x, z)) return;
        const old = road[cell(x, z)];
        // Where roads cross, the tile belongs to the bigger road (a bridge wins).
        if (!old || (v & 7) > (old & 7) || (v > 8 && old < 8)) {
          road[cell(x, z)] = v;
          names.set(cell(x, z), r.name);
        }
      });
    }
  };
  region.roads.forEach(draw);
  for (const c of region.corrections) {
    if (c.kind === "road") draw(c.road);
    else if (c.kind === "no-road") area(c.area, (x, z) => (road[cell(x, z)] = 0));
  }
  const KIND: RoadKind[] = ["tertiary", "tertiary", "secondary", "primary", "trunk", "motorway"];
  const roadAt = (x: number, z: number): RoadTile | undefined => {
    if (!inside(x, z)) return undefined;
    const v = road[cell(x, z)];
    if (!v) return undefined;
    const name = names.get(cell(x, z));
    return name ? { kind: KIND[v & 7], bridge: v > 8, name } : { kind: KIND[v & 7], bridge: v > 8 };
  };

  // ---- landmarks
  const removed = new Set(region.corrections.flatMap((c) => (c.kind === "no-landmark" ? [c.id] : [])));
  const patched: Landmark[] = region.landmarks
    .filter((l) => !removed.has(l.id))
    .map((l) => {
      // Where the map data has it, for ones placed from memory.
      let out = l.approx && region.found[l.id] ? { ...l, at: region.found[l.id] } : l;
      for (const c of region.corrections) if (c.kind === "landmark" && c.id === l.id) out = { ...out, ...c.set };
      return out;
    });
  const landmarks: PlacedLandmark[] = [];
  const spots = new Map<number, Spot>();
  const taken = new Set<number>();
  const skipped: RegionMap["skipped"] = [];
  for (const l of patched) {
    const c = at(l.at);
    if (!isStructureType(l.type)) {
      const x = Math.round(c.x);
      const z = Math.round(c.z);
      if (!inside(x, z)) skipped.push({ id: l.id, reason: "outside the region" });
      else if (taken.has(tileKey(x, z))) skipped.push({ id: l.id, reason: "overlaps another landmark" });
      else {
        spots.set(tileKey(x, z), { id: l.id, kind: l.type, name: l.name });
        taken.add(tileKey(x, z));
      }
      continue;
    }
    const [dw, dd] = SIZE[l.type] ?? [2, 2];
    const w = l.w ?? dw;
    const d = l.d ?? dd;
    const ax = Math.round(c.x - (w - 1) / 2);
    const az = Math.round(c.z - (d - 1) / 2);
    let free = inside(ax, az) && inside(ax + w - 1, az + d - 1);
    if (!free) {
      skipped.push({ id: l.id, reason: "outside the region" });
      continue;
    }
    for (let x = ax; x < ax + w && free; x++) for (let z = az; z < az + d && free; z++) free = !taken.has(tileKey(x, z));
    if (!free) {
      skipped.push({ id: l.id, reason: "overlaps another landmark" });
      continue;
    }
    for (let x = ax; x < ax + w; x++) for (let z = az; z < az + d; z++) taken.add(tileKey(x, z));
    const placed: PlacedLandmark = { id: l.id, type: l.type, name: l.name, ax, az, w, d };
    if (l.inside) placed.inside = l.inside;
    landmarks.push(placed);
  }

  // ---- districts: a district's character fades out over about its radius
  const centres = region.districts.map((d) => {
    const c = at(d.at);
    return { x: Math.round(c.x), z: Math.round(c.z), radius: (d.radiusKm * 10) / 1.5, weight: d.density };
  });

  // ---- names for spots: the map's neighbourhoods and towns (in 20-tile cells for quick search),
  // the districts when none is near, the water's own name out on the water
  const REACH: Record<string, number> = { neighbourhood: 12, village: 15, suburb: 25, town: 40 };
  const AREA_CELL = 20;
  const areaCells = new Map<number, { name: string; x: number; z: number; reach: number }[]>();
  const noArea = new Set(region.corrections.flatMap((c) => (c.kind === "no-area" ? [c.name] : [])));
  const areas = [...region.areas.filter((a) => !noArea.has(a.name)), ...region.corrections.flatMap((c) => (c.kind === "area" ? [c.area] : []))];
  for (const a of areas) {
    const c = at({ lat: a.at[0], lon: a.at[1] });
    const key = tileKey(Math.floor(c.x / AREA_CELL), Math.floor(c.z / AREA_CELL));
    const list = areaCells.get(key) ?? [];
    list.push({ name: a.name, x: c.x, z: c.z, reach: REACH[a.kind] ?? 15 });
    areaCells.set(key, list);
  }
  const districtAt = region.districts.map((d) => ({ name: d.name, ...at(d.at), r: d.radiusKm * 10 }));
  const areaAt = (x: number, z: number) => {
    const w = waterAt(x, z);
    if (w === 1 && region.waterNames?.lagoon) return region.waterNames.lagoon;
    if (w === 2 && region.waterNames?.sea) return region.waterNames.sea;
    let best: string | null = null;
    let bestScore = Infinity;
    const cx = Math.floor(x / AREA_CELL);
    const cz = Math.floor(z / AREA_CELL);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (const a of areaCells.get(tileKey(cx + dx, cz + dz)) ?? []) {
          // Nearest, counting bigger places as nearer (a town's name reaches further).
          const score = Math.hypot(x - a.x, z - a.z) / a.reach;
          if (score < 1 && score < bestScore) [best, bestScore] = [a.name, score];
        }
      }
    }
    // The district: the nearest by its size (Yaba, Surulere...), when one reaches this far.
    let district: string | null = null;
    let nearScore = Infinity;
    for (const d of districtAt) {
      const score = Math.hypot(x - d.x, z - d.z) / d.r;
      if (score < nearScore) [district, nearScore] = [d.name, score];
    }
    if (nearScore > 2.5) district = null;
    if (best && district && best !== district) return `${best} · ${district}`;
    return best ?? district ?? region.name;
  };

  // ---- land prices: each district's price fades out over about its radius into its
  // neighbours' (and the region's own price where no district reaches)
  const priced = region.districts.flatMap((d) => (d.landPrice ? [{ ...at(d.at), r: d.radiusKm * 10, p: d.landPrice }] : []));
  const landPriceAt = (x: number, z: number) => {
    let sum = 0.15 * region.prices.land;
    let weight = 0.15;
    for (const d of priced) {
      const k = Math.exp(-((Math.hypot(x - d.x, z - d.z) / (d.r * 1.4)) ** 2));
      sum += k * d.p;
      weight += k;
    }
    return sum / weight;
  };

  // ---- footbridges: on the road tile under each one's middle (or the road right next to it)
  const footbridges = new Set<number>();
  for (const [lat, lon] of region.footbridges) {
    const c = at({ lat, lon });
    const x = Math.round(c.x);
    const z = Math.round(c.z);
    const spot = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) => road[cell(x + dx, z + dz)] && inside(x + dx, z + dz));
    if (spot) footbridges.add(tileKey(x + spot[0], z + spot[1]));
  }

  const map: RegionMap = {
    region,
    frame,
    bounds,
    inside,
    waterAt,
    roadAt,
    landmarks,
    spotAt: (x, z) => spots.get(tileKey(x, z)),
    centres,
    areaAt,
    landPriceAt,
    footbridgeAt: (x, z) => footbridges.has(tileKey(x, z)),
    flyoverAt: (x, z) => inside(x, z) && road[cell(x, z)] > 8 && !water[cell(x, z)],
    skipped,
  };
  cache.set(region, map);
  return map;
}

/** Reads a baked grid (see BakedGrid), calling put for every tile with something on it. */
function readGrid(g: BakedGrid, inside: (x: number, z: number) => boolean, put: (x: number, z: number, ch: string) => void) {
  g.rows.forEach((row, k) => {
    const z = g.z0 + k;
    let x = g.x0;
    for (const m of row.matchAll(/([A-Za-z])(\d+)/g)) {
      const n = Number(m[2]);
      if (m[1] !== "L" && m[1] !== "N") for (let j = 0; j < n; j++) if (inside(x + j, z)) put(x + j, z, m[1]);
      x += n;
    }
  });
}

/**
 * Every tile a straight line between two points passes through, stepping only sideways or
 * up/down (never corner to corner), so a road drawn from it is always joined up.
 */
export function line4(x0: number, z0: number, x1: number, z1: number, put: (x: number, z: number) => void) {
  let x = Math.round(x0);
  let z = Math.round(z0);
  const tx = Math.round(x1);
  const tz = Math.round(z1);
  const dx = x1 - x0;
  const dz = z1 - z0;
  const off = (px: number, pz: number) => Math.abs(dz * (px - x0) - dx * (pz - z0));
  put(x, z);
  while (x !== tx || z !== tz) {
    const sx = Math.sign(tx - x);
    const sz = Math.sign(tz - z);
    if (sx && sz) {
      if (off(x + sx, z) <= off(x, z + sz)) x += sx;
      else z += sz;
    } else if (sx) x += sx;
    else z += sz;
    put(x, z);
  }
}

/** Every tile whose middle is inside a shape (points in order round it). */
export function fillArea(ring: { x: number; z: number }[], put: (x: number, z: number) => void) {
  if (ring.length < 3) return;
  const zs = ring.map((p) => p.z);
  const zMin = Math.ceil(Math.min(...zs));
  const zMax = Math.floor(Math.max(...zs));
  for (let z = zMin; z <= zMax; z++) {
    // Where each edge crosses this row, left to right; fill between pairs.
    const cuts: number[] = [];
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k];
      const b = ring[(k + 1) % ring.length];
      if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) cuts.push(a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x));
    }
    cuts.sort((p, q) => p - q);
    for (let k = 0; k + 1 < cuts.length; k += 2) for (let x = Math.ceil(cuts[k]); x <= Math.floor(cuts[k + 1]); x++) put(x, z);
  }
}
