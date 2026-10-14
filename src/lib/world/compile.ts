// Turns a region's data files into quick lookups for the city layout: is this tile water, is a
// main road here, which landmark stands here. Worked out once per region (a few milliseconds),
// then every question is a single lookup, so even a huge region costs nothing per frame.

import type { StructureType, TileKind } from "@/lib/city/layout";
import { type Frame, type LatLon, toTile, tileBounds } from "./geo.ts";
import type { BakedGrid, Landmark, Region, Road, RoadKind } from "./region.ts";
import { fillArea, line4 } from "./raster.ts";
import { auditSpans, chainLines, findJoins, piecesOf, placeStations, tilesUnder, type Piece, type SpanFault, type SpanLine, type StationPlan } from "./spans.ts";

export { fillArea, line4 };

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
  /** Every single-tile landmark with where it stands (for lists: Explore). */
  spotList: (Spot & { x: number; z: number })[];
  /** Downtowns and quieter districts, for how built-up each spot is (as CityPlan centres). */
  centres: { x: number; z: number; radius: number; weight: number }[];
  /** Is there a footbridge over the road here (from the map)? */
  footbridgeAt: (x: number, z: number) => boolean;
  /** A road raised over land here (a flyover, an interchange, a bridge's approach)? */
  flyoverAt: (x: number, z: number) => boolean;
  /** The pieces of bridges, flyovers and railways to draw on this tile (by where each one's middle is). */
  piecesAt: (x: number, z: number) => Piece[] | undefined;
  /** Every road bridge and flyover deck as a path along its top (tiles, y the deck's height), for traffic. */
  decks: { pts: { x: number; y: number; z: number }[]; width: number }[];
  /** Every railway as a path along the top of its rails (tiles, y its height): for the trains. */
  rails: { pts: { x: number; y: number; z: number }[]; raised: boolean }[];
  /**
   * Kept clear of buildings: under a deck, along a railway on the ground, a station's site, or the
   * open ground in front of a landmark's main entrance (its gate and name sign are never hidden).
   */
  clearAt: (x: number, z: number) => "deck" | "track" | "station" | "entrance" | undefined;
  /**
   * Which way a landmark's main entrance faces (its gate and name sign stand just outside that
   * side), by its corner tile: one step out of it (dx, dz), or undefined for one without a gate.
   */
  entranceAt: (ax: number, az: number) => { dx: number; dz: number } | undefined;
  /** A station standing on this tile (its middle). */
  stationAt: (x: number, z: number) => StationPlan | undefined;
  stations: StationPlan[];
  /** A pedestrian crossing from the map on this road tile: 0 zebra, 1 lights, 2 ladder, 3 island. */
  crossingAt: (x: number, z: number) => number | undefined;
  /** What land costs at a spot, per m², in the region's currency: the districts' prices blended. */
  landPriceAt: (x: number, z: number) => number;
  /**
   * What a spot is called: "Akoka · Yaba" (its neighbourhood and its district), just the district
   * when no neighbourhood is near, or the water's own name.
   */
  areaAt: (x: number, z: number) => string;
  /** Landmarks left out because they overlapped one placed before them (worth a correction). */
  skipped: { id: string; reason: string }[];
  /** Decks that end in mid-air or meet another with a step (the tests want none). */
  spanFaults: SpanFault[];
};

/** Every big building type's size in tiles when a landmark doesn't give one. */
const SIZE: Partial<Record<StructureType, [number, number]>> = {
  bank: [3, 3], arena: [4, 4], capitol: [3, 3], megamall: [3, 3], bigpark: [5, 5], gym: [3, 3], cathedral: [4, 4],
  grandmosque: [4, 4], spa: [3, 3], intlairport: [16, 10], spaceport: [5, 5],
};

const STRUCTURES = new Set<string>([
  "mall", "twin", "museum", "funfair", "market", "arena", "campus", "hotel", "solar", "airport", "port", "military", "power", "dam",
  "oilrig", "waterpark", "court", "boxing", "wrestling", "capitol", "megamall", "bank", "bigpark", "gym", "spa", "cathedral",
  "grandmosque", "intlairport", "spaceport",
]);

export const isStructureType = (t: string): t is StructureType => STRUCTURES.has(t);

const tileKey = (x: number, z: number) => (x + 32768) * 65536 + (z + 32768);

/** Single-tile famous places that get a main gate with their name (as the big landmarks do). */
export const GATED_SPOTS = new Set(["hospital", "campus", "arena", "museum", "hotel", "megamall", "worship", "cathedral", "grandmosque", "market", "capitol"]);

/**
 * The side a landmark's main entrance faces: the one with the most road along it (south first on a
 * tie, then north, east, west), never one where the ground right in front of its middle is water,
 * the edge of the map or another landmark.
 */
export function entranceSide(
  l: { ax: number; az: number; w: number; d: number },
  roadAt: (x: number, z: number) => boolean,
  blocked: (x: number, z: number) => boolean,
): { dx: number; dz: number } {
  const sides = [
    { dx: 0, dz: 1, n: 0 },
    { dx: 0, dz: -1, n: 0 },
    { dx: 1, dz: 0, n: 0 },
    { dx: -1, dz: 0, n: 0 },
  ];
  for (const sd of sides) {
    if (sd.dz) for (let x = l.ax; x < l.ax + l.w; x++) if (roadAt(x, sd.dz > 0 ? l.az + l.d : l.az - 1)) sd.n++;
    if (sd.dx) for (let z = l.az; z < l.az + l.d; z++) if (roadAt(sd.dx > 0 ? l.ax + l.w : l.ax - 1, z)) sd.n++;
    const [mx, mz] = entranceFront(l, sd)[Math.floor(entranceFront(l, sd).length / 2)];
    if (blocked(mx, mz)) sd.n -= 1000;
  }
  const best = sides.reduce((a, b) => (b.n > a.n ? b : a), sides[0]);
  return { dx: best.dx, dz: best.dz };
}

/** The tiles just outside a landmark's entrance side: its middle three (all of a narrow side). */
export function entranceFront(l: { ax: number; az: number; w: number; d: number }, side: { dx: number; dz: number }): [number, number][] {
  const along = side.dz ? l.w : l.d;
  const keep = Math.min(along, 3);
  const from = Math.floor((along - keep) / 2);
  const out: [number, number][] = [];
  for (let k = from; k < from + keep; k++) {
    if (side.dz) out.push([l.ax + k, side.dz > 0 ? l.az + l.d : l.az - 1]);
    else out.push([side.dx > 0 ? l.ax + l.w : l.ax - 1, l.az + k]);
  }
  return out;
}

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

  // ---- bridges, flyovers and railways, with their real curves
  // Chained per level, so a deck on the second level never merges with one below it.
  const bridgeRoads = [...region.roads, ...region.corrections.flatMap((c) => (c.kind === "road" ? [c.road] : []))].filter((r) => r.bridge);
  const levels = [...new Set(bridgeRoads.map((r) => r.layer ?? 1))];
  const bridgeLines = levels.flatMap((layer) =>
    chainLines(bridgeRoads.filter((r) => (r.layer ?? 1) === layer).map((r) => r.path.map(([lat, lon]) => at({ lat, lon })))).map((pts) => ({ pts, layer })),
  );
  const majorAt = (p: { x: number; z: number }) => {
    const r = roadAt(Math.round(p.x), Math.round(p.z));
    return !!r && (r.kind === "motorway" || r.kind === "trunk");
  };
  const overWater = (x: number, z: number) => waterAt(x, z) > 0;
  const lines: SpanLine[] = bridgeLines.map(({ pts, layer }) => ({ kind: "road", pts, raised: true, overWater, major: majorAt(pts[Math.floor(pts.length / 2)]), layer }));
  for (const raised of [true, false]) {
    for (const pts of chainLines(region.rail.filter((r) => !!r.bridge === raised).map((r) => r.path.map(([lat, lon]) => at({ lat, lon }))))) {
      lines.push({ kind: "rail", pts, raised, overWater, major: false });
    }
  }
  findJoins(lines);
  // The ground under every raised deck: no landmark stands there (a stadium's bowl or a
  // tower would have a flyover running through it).
  const underDeck = new Set<number>();
  for (const line of lines) if (line.raised) tilesUnder(line, (x, z) => underDeck.add(tileKey(x, z)));

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
  const spotList: RegionMap["spotList"] = [];
  const taken = new Set<number>();
  const skipped: RegionMap["skipped"] = [];
  // Every landmark's own spot, so one moved off a road never lands on another's.
  const own = new Map<number, string>();
  for (const l of patched) {
    const c = at(l.at);
    const [w, d] = isStructureType(l.type) ? [l.w ?? (SIZE[l.type] ?? [2, 2])[0], l.d ?? (SIZE[l.type] ?? [2, 2])[1]] : [1, 1];
    const ax = Math.round(c.x - (w - 1) / 2);
    const az = Math.round(c.z - (d - 1) / 2);
    for (let x = ax; x < ax + w; x++) for (let z = az; z < az + d; z++) if (!own.has(tileKey(x, z))) own.set(tileKey(x, z), l.id);
  }
  for (const l of patched) {
    const c = at(l.at);
    if (!isStructureType(l.type)) {
      const x = Math.round(c.x);
      const z = Math.round(c.z);
      if (!inside(x, z)) skipped.push({ id: l.id, reason: "outside the region" });
      else if (taken.has(tileKey(x, z))) skipped.push({ id: l.id, reason: "overlaps another landmark" });
      else {
        spots.set(tileKey(x, z), { id: l.id, kind: l.type, name: l.name });
        spotList.push({ id: l.id, kind: l.type, name: l.name, x, z });
        taken.add(tileKey(x, z));
      }
      continue;
    }
    const [dw, dd] = SIZE[l.type] ?? [2, 2];
    let w = l.w ?? dw;
    let d = l.d ?? dd;
    // Where it stands: on its real spot, unless that would cut a main road in two (a road
    // through a landmark stops at it). Then the nearest spot a few tiles off that doesn't, or,
    // where the streets are too close together for that, a slightly smaller one on its spot.
    const fits = (ax: number, az: number, w: number, d: number) => {
      let roads = 0;
      let wet = 0;
      for (let x = ax; x < ax + w; x++) {
        for (let z = az; z < az + d; z++) {
          if (!inside(x, z) || taken.has(tileKey(x, z))) return Infinity;
          if (underDeck.has(tileKey(x, z))) roads += 100;
          const mine = own.get(tileKey(x, z));
          if (mine && mine !== l.id) return Infinity;
          if (road[cell(x, z)]) roads++;
          if (water[cell(x, z)]) wet++;
        }
      }
      return roads * 100 + wet;
    };
    let ax = Math.round(c.x - (w - 1) / 2);
    let az = Math.round(c.z - (d - 1) / 2);
    const here = fits(ax, az, w, d);
    if (here >= 100 && here < Infinity) {
      const sizes = [[w, d], [w - 1, d - 1], [w - 2, d - 2]].filter(([sw, sd]) => sw >= 2 && sd >= 2);
      // Further when it would stand under a deck: moving it beats a flyover through it.
      const reach = Math.max(3, Math.ceil(Math.max(w, d) / 2) + 1) + (here >= 10000 ? 3 : 0);
      for (const [sw, sd] of sizes) {
        const bx = Math.round(c.x - (sw - 1) / 2);
        const bz = Math.round(c.z - (sd - 1) / 2);
        let best: { ax: number; az: number; score: number } | null = null;
        for (let dx = -reach; dx <= reach; dx++) {
          for (let dz = -reach; dz <= reach; dz++) {
            const f = fits(bx + dx, bz + dz, sw, sd);
            if (f >= 100 || f > here % 100) continue;
            const score = f + Math.hypot(dx, dz);
            if (!best || score < best.score) best = { ax: bx + dx, az: bz + dz, score };
          }
        }
        if (best) {
          ax = best.ax;
          az = best.az;
          w = sw;
          d = sd;
          break;
        }
      }
    }
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

  const pieces = new Map<number, Piece[]>();
  const clear = new Map<number, "deck" | "track" | "station" | "entrance">();
  const decks: RegionMap["decks"] = [];
  const rails: RegionMap["rails"] = [];
  for (const line of lines) {
    const ps = piecesOf(line);
    if (line.kind === "rail" && ps.length > 0) rails.push({ pts: [{ x: ps[0].ax, y: ps[0].ay, z: ps[0].az }, ...ps.map((p) => ({ x: p.bx, y: p.by, z: p.bz }))], raised: line.raised });
    if (line.kind === "road" && line.raised && ps.length > 1) {
      decks.push({ pts: [{ x: ps[0].ax, y: ps[0].ay, z: ps[0].az }, ...ps.map((p) => ({ x: p.bx, y: p.by, z: p.bz }))], width: ps[0].width });
    }
    for (const p of ps) {
      const key = tileKey(Math.round((p.ax + p.bx) / 2), Math.round((p.az + p.bz) / 2));
      const list = pieces.get(key);
      if (list) list.push(p);
      else pieces.set(key, [p]);
    }
    tilesUnder(line, (x, z) => {
      if (!inside(x, z) || waterAt(x, z)) return;
      const key = tileKey(x, z);
      if (line.kind === "rail" && !line.raised) clear.set(key, "track");
      else if (!clear.has(key)) clear.set(key, "deck");
    });
  }
  const stations = placeStations(
    region.stations.map((s) => ({ name: s.name, ...at({ lat: s.at[0], lon: s.at[1] }) })),
    lines,
  );
  const stationTiles = new Map<number, StationPlan>();
  for (const st of stations) {
    stationTiles.set(tileKey(Math.round(st.x), Math.round(st.z)), st);
    // Its site: a tile either side along the line, and the tiles beside it (the station hall).
    const ax = Math.cos(st.ry);
    const az = -Math.sin(st.ry);
    for (let a = -1; a <= 1; a++) {
      for (let c = -1; c <= 1; c++) {
        const x = Math.round(st.x + ax * a - az * c * 0.8);
        const z = Math.round(st.z + az * a + ax * c * 0.8);
        if (inside(x, z) && !waterAt(x, z)) clear.set(tileKey(x, z), "station");
      }
    }
  }

  // ---- landmark entrances: each big landmark (and each famous hospital, campus, hotel...) has a
  // main gate with its name, on the side with the most road along it. The ground in front of it is
  // kept open (no building, billboard or structure ever stands there), and if there's no road right
  // in front, the next tile out too, so the gate can always be seen from the street.
  const entrances = new Map<number, { dx: number; dz: number }>();
  const blocked = (x: number, z: number) => !inside(x, z) || !!water[cell(x, z)] || taken.has(tileKey(x, z));
  const gated = [
    ...landmarks.map((l) => ({ ax: l.ax, az: l.az, w: l.w, d: l.d })),
    ...spotList.filter((sp) => GATED_SPOTS.has(String(sp.kind))).map((sp) => ({ ax: sp.x, az: sp.z, w: 1, d: 1 })),
  ];
  for (const l of gated) {
    const side = entranceSide(l, (x, z) => !!road[cell(x, z)] && inside(x, z), blocked);
    entrances.set(tileKey(l.ax, l.az), side);
    for (const [fx, fz] of entranceFront(l, side)) {
      for (let out = 0; out < 2; out++) {
        const x = fx + side.dx * out;
        const z = fz + side.dz * out;
        if (blocked(x, z)) break;
        if (road[cell(x, z)]) break; // the street itself: open already
        if (!clear.has(tileKey(x, z))) clear.set(tileKey(x, z), "entrance");
      }
    }
  }

  // ---- pedestrian crossings from the map, on the road tile under each (or right next to it)
  const crossings = new Map<number, number>();
  for (const [lat, lon, type] of region.crossings) {
    const c = at({ lat, lon });
    const x = Math.round(c.x);
    const z = Math.round(c.z);
    const spot = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) => inside(x + dx, z + dz) && road[cell(x + dx, z + dz)] && road[cell(x + dx, z + dz)] < 8);
    if (spot) crossings.set(tileKey(x + spot[0], z + spot[1]), type);
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
    spotList,
    centres,
    areaAt,
    landPriceAt,
    footbridgeAt: (x, z) => footbridges.has(tileKey(x, z)),
    flyoverAt: (x, z) => inside(x, z) && road[cell(x, z)] > 8 && !water[cell(x, z)],
    piecesAt: (x, z) => pieces.get(tileKey(x, z)),
    decks,
    rails,
    clearAt: (x, z) => clear.get(tileKey(x, z)),
    entranceAt: (ax, az) => entrances.get(tileKey(ax, az)),
    stationAt: (x, z) => stationTiles.get(tileKey(x, z)),
    stations,
    crossingAt: (x, z) => crossings.get(tileKey(x, z)),
    skipped,
    spanFaults: auditSpans(lines),
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
