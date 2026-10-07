// Decides what stands on every tile of the city, and its street address. Pure maths, no drawing.
//
// Tiles are laid out in a square spiral from the centre (tile 0), so new tiles always
// appear on the outside edge and the city grows outwards. The database uses the same
// spiral (spiral_xy) to work out which tiles are "nearby" for sweeps.
// Each round gets its own seed, so the street grid, downtowns and parks differ every round,
// but a given tile always looks the same for everyone during that round.

import { ABBREV, FLAVORS, type Flavor } from "./places";

export type TileKind =
  | "road"
  | "bridge"
  | "river"
  | "lake"
  | "tower"
  | "office"
  | "house"
  | "park"
  | "trees"
  | "plaza"
  | "pond"
  | "ferris"
  | "stadium"
  | "turbine"
  | "billboard"
  | "hospital"
  | "clock"
  | "crane"
  | "watertower"
  | "mast"
  | "fuel"
  | "police"
  | "structure";

/** Big buildings that span a 2×2 block of tiles. */
export type StructureType =
  | "mall"
  | "twin"
  | "museum"
  | "funfair"
  | "market"
  | "arena"
  | "campus"
  | "hotel"
  | "solar"
  | "airport"
  | "port"
  | "military"
  | "power"
  | "dam"
  | "oilrig";

export type Tile = {
  i: number;
  x: number;
  z: number;
  kind: TileKind;
  /** Height of the tallest thing on the tile (for placing markers above it). */
  top: number;
  /** Road direction: along x, along z, or a crossing. */
  road?: "x" | "z" | "cross";
  /** Which neighbours are road (1 north, 2 east, 4 south, 8 west): shapes bends and junctions. */
  mask?: number;
  /** A crossing built as a roundabout. */
  roundabout?: boolean;
  /** Billboards: which design, and which side faces the road (0 +x, 1 -x, 2 +z, 3 -z). */
  billboard?: { id: string; design: number; face: number };
  /** Shape variant for towers, offices and houses, so neighbours don't all look alike. */
  v?: number;
  /** Part of a 2×2 building: which one, where its corner is, and the tile it stands on otherwise. */
  structure?: { type: StructureType; ax: number; az: number; anchor: boolean; name: string };
  /** What this tile shows until all four tiles of its big building exist. */
  fallback?: Tile;
  /** Stable random numbers for this tile (0..1). */
  r: [number, number, number, number];
  /** A straight stretch of road dug up for road works (cars can't get through). */
  works?: boolean;
  /** Something stopped at the side of a straight road: a broken-down car or a police car. */
  incident?: "breakdown" | "police";
  /** The railway viaduct passes over this tile (and the station stands here). */
  rail?: boolean;
  station?: boolean;
};

export const KIND_LABEL: Record<TileKind, string> = {
  road: "Road",
  tower: "Skyscraper",
  office: "Office block",
  house: "House",
  park: "Park",
  trees: "Woods",
  plaza: "Plaza",
  pond: "Pond",
  bridge: "Bridge",
  river: "River",
  lake: "Lake",
  ferris: "Ferris wheel",
  stadium: "Stadium",
  turbine: "Wind turbine",
  billboard: "Billboard",
  hospital: "Hospital",
  clock: "Clock tower",
  crane: "Construction site",
  watertower: "Water tower",
  mast: "Radio mast",
  fuel: "Fuel station",
  police: "Police station",
  structure: "Landmark",
};

export const STRUCTURE_LABEL: Record<StructureType, string> = {
  mall: "Shopping mall",
  twin: "Twin towers",
  museum: "Museum",
  funfair: "Funfair",
  market: "Market",
  arena: "Arena",
  campus: "University",
  hotel: "Hotel",
  solar: "Solar farm",
  airport: "Airport",
  port: "Sea port",
  military: "Military camp",
  power: "Power station",
  dam: "Dam",
  oilrig: "Oil rig",
};

/** Everything the city can be made of, for the help screen. */
export const CITY_ASSETS = {
  big: [
    "Airports", "Sea ports", "Military camps", "Shopping malls", "Twin towers with a sky bridge", "Domed museums", "Funfairs", "Open-air markets", "Arenas",
    "University campuses", "Hotels with rooftop pools", "Solar farms", "Power stations with steaming cooling towers", "Dams with spillways", "Oil rigs with gas flares",
  ],
  tiles: [
    "Skyscrapers (stepped, round glass, twisted, needle spire, helipad)",
    "Office blocks (plain, L-shaped, rooftop garden)",
    "Houses (pitched bungalow, flat modern with pool, duplex with garage)",
    "Hospitals", "Police stations", "Clock towers", "Construction sites with cranes", "Water towers", "Radio masts", "Fuel stations",
    "Parks", "Woods", "Plazas with fountains", "Ponds", "Ferris wheels", "Wind turbines", "Billboards",
    "Roads", "Bridges", "A river (sometimes)", "Small lakes", "Road works", "Hills and mountains around the city", "A railway on a viaduct, with a station",
  ],
  moving: [
    "Cars, taxis, vans, buses, trucks and articulated lorries (and the odd traffic jam)", "Trains", "People out walking (with umbrellas when it rains)", "Boats",
    "Pigeons, gulls, swallows, geese flying in a V and the odd eagle", "Clouds", "Hot-air balloons", "Planes", "Buildings going up during the hunt",
    "Ferris wheels, carousels, cranes and turbines",
  ],
};

/** Square spiral: tile n → grid (x, z). Must match spiral_xy in the database. */
export function spiralXY(n: number): [number, number] {
  if (n <= 0) return [0, 0];
  const p = n + 1;
  const k = Math.ceil((Math.sqrt(p) - 1) / 2);
  let t = 2 * k + 1;
  let m = t * t;
  t -= 1;
  if (p >= m - t) return [k - (m - p), -k];
  m -= t;
  if (p >= m - t) return [-k, -k + (m - p)];
  m -= t;
  if (p >= m - t) return [-k + (m - p), k];
  return [k, k - (m - p - t)];
}

/** Integer hash → 0..1, stable for the same inputs. */
export function hash(x: number, z: number, s: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth random field (value noise), 0..1. */
export function smoothNoise(x: number, z: number, s: number) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0, s);
  const b = hash(x0 + 1, z0, s);
  const c = hash(x0, z0 + 1, s);
  const d = hash(x0 + 1, z0 + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export type CityPlan = {
  seed: number;
  /** The real-world place this round's city is named after, and its street-name style. */
  city: { name: string; flavor: Flavor; streets: string[] };
  /** Streets: x positions of the north–south streets, z positions of the east–west ones. */
  xs: number[];
  zs: number[];
  xAt: Map<number, number>;
  zAt: Map<number, number>;
  /** Index of the first street at or past 0 (so street numbers can go negative). */
  x0: number;
  z0: number;
  /** How this city is built: how tall, how green, how many gaps in the street grid. */
  style: { towers: number; green: number; gaps: number; roundabouts: number };
  centres: { x: number; z: number; radius: number; weight: number }[];
  /** Billboard choice per 10×10 block (filled in as needed). */
  cache: Map<string, { x: number; z: number; face: number } | null>;
  structures: Map<string, { type: StructureType; name: string } | null>;
  /** A river winding across the city (along x or z), or none. */
  river: { along: "x" | "z"; at: number; amp: number; wave: number; phase: number; width: number } | null;
  /**
   * A railway on a viaduct above one long street: it runs along x (fixed z = at) or along z
   * (fixed x = at). The station is a 3-tile platform centred at `station` along the line.
   */
  rail: { along: "x" | "z"; at: number; station: number | null } | null;
  palette: Palette;
};

/** Is (x, z) under the railway viaduct? */
export function onRail(plan: CityPlan, x: number, z: number) {
  const r = plan.rail;
  return !!r && (r.along === "z" ? x === r.at : z === r.at);
}

/** Where the river's centre line is, for a position along it. */
export function riverCentre(plan: CityPlan, along: number) {
  const r = plan.river!;
  return r.at + r.amp * Math.sin(along / r.wave + r.phase);
}

export type Palette = {
  name: string;
  towers: number[];
  offices: number[];
  walls: number[];
  roofs: number[];
  leaves: number[];
  car: number[];
};

const PALETTES: Palette[] = [
  {
    name: "coastal",
    towers: [0x9ec9e2, 0xb8d4e8, 0x7fb0cf, 0xd5e3ec, 0xa7bfd1],
    offices: [0xf2e3cf, 0xe9d2c0, 0xf5efe6, 0xdcd2c6, 0xf0c9a8],
    walls: [0xffffff, 0xf7f0e6, 0xf3e9dc, 0xeef2f3],
    roofs: [0xd9734e, 0xc8644a, 0x6f7f8f, 0xb85c42],
    leaves: [0x7bc47f, 0x5fae6a, 0x9ad08b, 0x4f9a5e],
    car: [0xff6b6b, 0xffd166, 0x4dabf7, 0xffffff, 0x495057, 0x63e6be],
  },
  {
    name: "sunset",
    towers: [0xf4c7b8, 0xe8b4a6, 0xd9a7c7, 0xf1d1c1, 0xc9b6e4],
    offices: [0xfbe8d3, 0xf6d6bd, 0xf8efe4, 0xe7cfc0, 0xf2c6a0],
    walls: [0xfffaf3, 0xfdf0e2, 0xf8e8da, 0xffffff],
    roofs: [0x8c5a7a, 0xb35d4f, 0x6c5b7b, 0xd07a5a],
    leaves: [0x8cc084, 0x6aa96f, 0xa9cf8e, 0x5b9a6a],
    car: [0xff8787, 0x748ffc, 0xffe066, 0xffffff, 0x343a40, 0x69db7c],
  },
  {
    name: "modern",
    towers: [0xcfd8e3, 0xb6c3d1, 0xe3e8ee, 0x9fb3c8, 0xdfe7f0],
    offices: [0xe9ecef, 0xdee2e6, 0xf1f3f5, 0xced4da, 0xe6e0d6],
    walls: [0xffffff, 0xf1f3f5, 0xe9ecef, 0xf8f9fa],
    roofs: [0x7a8794, 0x8f9ba7, 0x6b7785, 0xa08c78],
    leaves: [0x74b816, 0x5c940d, 0x8ce99a, 0x40c057],
    car: [0xfa5252, 0x228be6, 0xfab005, 0xffffff, 0x212529, 0x12b886],
  },
];

/** Street positions: irregular gaps (2 to 5 lots wide), so blocks come in different sizes. */
function streetLines(seed: number, salt: number) {
  const out: number[] = [];
  const gap = (k: number) => {
    const g = hash(k, salt, seed + 41);
    return 3 + (g < 0.25 ? 0 : g < 0.6 ? 1 : g < 0.85 ? 2 : 3);
  };
  const start = Math.floor(hash(salt, 1, seed + 42) * 4) - 1;
  for (let p = start, k = 0; p <= 160; p += gap(k++)) out.push(p);
  for (let p = start - gap(-1), k = -2; p >= -160; p -= gap(k--)) out.unshift(p);
  return out;
}

export function makePlan(seed: number): CityPlan {
  const r = (k: number) => hash(seed, k, 9173);
  // Downtowns can be anywhere (not always the middle), and some cities barely have one.
  const centres: CityPlan["centres"] = [];
  const count = 1 + Math.floor(r(2) * 3);
  for (let k = 0; k < count; k++) {
    const angle = r(10 + k) * Math.PI * 2;
    const dist = k === 0 ? r(20) * 12 : 8 + r(20 + k) * 20;
    centres.push({
      x: Math.round(Math.cos(angle) * dist),
      z: Math.round(Math.sin(angle) * dist),
      radius: 2 + r(30 + k) * 2.8,
      weight: 0.7 + r(40 + k) * 0.45,
    });
  }
  const style = {
    towers: 0.55 + r(70) * 0.75,
    green: (r(71) - 0.5) * 0.16,
    gaps: 0.06 + r(72) * 0.16,
    roundabouts: 0.06 + r(73) * 0.16,
  };
  const xs = streetLines(seed, 1);
  const zs = streetLines(seed, 2);
  const xAt = new Map(xs.map((v, k) => [v, k]));
  const zAt = new Map(zs.map((v, k) => [v, k]));
  const x0 = xs.findIndex((v) => v >= 0);
  const z0 = zs.findIndex((v) => v >= 0);

  // About one city in three gets a river, running through the middle of a wide block between
  // two parallel streets, so it never swallows a street: the cross streets bridge it.
  let river: CityPlan["river"] = null;
  if (r(50) < 0.35) {
    const along: "x" | "z" = r(51) < 0.5 ? "x" : "z";
    const lines = along === "x" ? zs : xs;
    const zero = along === "x" ? z0 : x0;
    const options: number[] = [];
    for (let k = zero - 4; k <= zero + 3; k++) if (lines[k + 1] - lines[k] >= 5) options.push(k);
    if (options.length) {
      const k = options[Math.floor(r(52) * options.length)];
      const gap = lines[k + 1] - lines[k];
      river = { along, at: (lines[k] + lines[k + 1]) / 2, amp: Math.max(0, gap / 2 - 1.6) + r(53) * 0.2, wave: 2.5 + r(54) * 2, phase: r(55) * 6.28, width: 0.5 };
    }
  }

  // About two cities in three have a railway, on a viaduct above a street near the middle.
  let rail: CityPlan["rail"] = null;
  if (r(80) < 0.7) {
    const along: "x" | "z" = r(81) < 0.5 ? "x" : "z";
    const lines = along === "z" ? xs : zs; // the street it runs above
    const cross = along === "z" ? zs : xs; // the streets it crosses
    const zero = along === "z" ? x0 : z0;
    const czero = along === "z" ? z0 : x0;
    const at = lines[zero + Math.floor(r(82) * 5) - 2];
    // The station sits on a straight stretch between two cross streets at least 4 apart.
    let station: number | null = null;
    for (const d of [0, -1, 1, -2, 2]) {
      const k = czero + d;
      if (cross[k + 1] - cross[k] >= 4) {
        station = cross[k] + 2;
        break;
      }
    }
    if (at !== undefined) rail = { along, at, station };
  }

  // The city's name and street names.
  let pickW = r(60) * FLAVORS.reduce((t, f) => t + f.weight, 0);
  const flavor = FLAVORS.find((f) => (pickW -= f.weight) < 0) ?? FLAVORS[0];
  const cityName = flavor.cities[Math.floor(r(61) * flavor.cities.length)];
  const streets = [...flavor.streets].sort(
    (a, b) =>
      hash(a.length, a.charCodeAt(0) + a.charCodeAt(a.length - 1) * 31, seed) -
      hash(b.length, b.charCodeAt(0) + b.charCodeAt(b.length - 1) * 31, seed),
  );
  return {
    seed,
    city: { name: cityName, flavor, streets },
    xs,
    zs,
    xAt,
    zAt,
    x0,
    z0,
    style,
    centres,
    river,
    rail,
    cache: new Map(),
    structures: new Map(),
    palette: PALETTES[Math.floor(r(7) * PALETTES.length)],
  };
}

/** Index of the last line at or before v. */
function below(lines: number[], v: number) {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// Some stretches of street are left out, so blocks join up, roads bend and end, and there's
// room for parks. (k = which street, j = which stretch of it.)
const gapNS = (plan: CityPlan, k: number, j: number) => hash(k * 7 + 1, j * 13 + 3, plan.seed + 333) < plan.style.gaps;
const gapEW = (plan: CityPlan, j: number, k: number) => hash(j * 11 + 5, k * 17 + 2, plan.seed + 334) < plan.style.gaps;

/** Is there road at (x, z)? */
export function isRoad(plan: CityPlan, x: number, z: number) {
  const k = plan.xAt.get(x);
  const j = plan.zAt.get(z);
  if (k !== undefined && j !== undefined) {
    return !gapNS(plan, k, j - 1) || !gapNS(plan, k, j) || !gapEW(plan, j, k - 1) || !gapEW(plan, j, k);
  }
  if (k !== undefined) return !gapNS(plan, k, below(plan.zs, z));
  if (j !== undefined) return !gapEW(plan, j, below(plan.xs, x));
  return false;
}

/** Which neighbours are road: 1 north (z-1), 2 east (x+1), 4 south (z+1), 8 west (x-1). */
export function roadMask(plan: CityPlan, x: number, z: number) {
  return (
    (isRoad(plan, x, z - 1) ? 1 : 0) |
    (isRoad(plan, x + 1, z) ? 2 : 0) |
    (isRoad(plan, x, z + 1) ? 4 : 0) |
    (isRoad(plan, x - 1, z) ? 8 : 0)
  );
}

const LOTS: TileKind[] = ["house", "office", "park", "trees", "plaza"];

/** One billboard per 10×10 block of the city, on a lot right next to a road, facing it. */
function blockBillboard(plan: CityPlan, x: number, z: number) {
  const bx = Math.floor(x / 10);
  const bz = Math.floor(z / 10);
  const key = `${bx},${bz}`;
  if (plan.cache.has(key)) return plan.cache.get(key)!;
  let best: { x: number; z: number; face: number; score: number } | null = null;
  for (let dx = 1; dx < 9; dx++) {
    for (let dz = 1; dz < 9; dz++) {
      const tx = bx * 10 + dx;
      const tz = bz * 10 + dz;
      if (!LOTS.includes(baseTile(plan, tx, tz).kind) || onRail(plan, tx, tz) || structureAt(plan, tx, tz)) continue;
      const faces = [isRoad(plan, tx + 1, tz), isRoad(plan, tx - 1, tz), isRoad(plan, tx, tz + 1), isRoad(plan, tx, tz - 1)];
      const face = faces.findIndex(Boolean);
      if (face < 0) continue;
      const score = hash(tx, tz, plan.seed + 77);
      if (!best || score > best.score) best = { x: tx, z: tz, face, score };
    }
  }
  const pick = best ? { x: best.x, z: best.z, face: best.face } : null;
  plan.cache.set(key, pick);
  return pick;
}

/** How "downtown" a spot is: 1 in a city centre, falling to 0 in the suburbs. */
function densityAt(plan: CityPlan, x: number, z: number) {
  let density = 0;
  for (const c of plan.centres) {
    const d = Math.hypot(x - c.x, z - c.z);
    density = Math.max(density, c.weight * Math.exp(-d / (c.radius * 1.5)));
  }
  return density + (smoothNoise(x / 3, z / 3, plan.seed + 7) - 0.5) * 0.3;
}

const STRUCTURES_BY_ZONE: { min: number; chance: number; types: StructureType[] }[] = [
  { min: 0.56, chance: 0.12, types: ["twin", "hotel", "mall", "museum"] },
  { min: 0.24, chance: 0.14, types: ["mall", "market", "museum", "campus", "arena", "funfair", "hotel"] },
  { min: -9, chance: 0.1, types: ["funfair", "solar", "arena", "campus", "market", "airport", "port", "military", "airport", "power", "oilrig", "dam", "dam"] },
];

/**
 * Big 2×2 buildings. Blocks between streets are split into 2×2 cells starting at the street
 * edge; some cells, whose four tiles are all plain lots, become a landmark.
 */
function structureAt(plan: CityPlan, x: number, z: number) {
  if (plan.xAt.has(x) || plan.zAt.has(z)) return null;
  const kx = below(plan.xs, x);
  const kz = below(plan.zs, z);
  const ax = x - ((x - plan.xs[kx] - 1) % 2);
  const az = z - ((z - plan.zs[kz] - 1) % 2);
  // The cell must fit inside the block.
  if (ax + 1 >= plan.xs[kx + 1] || az + 1 >= plan.zs[kz + 1]) return null;
  const key = `${ax},${az}`;
  if (!plan.structures.has(key)) {
    let found: { type: StructureType; name: string } | null = null;
    const d = densityAt(plan, ax + 0.5, az + 0.5);
    const zone = STRUCTURES_BY_ZONE.find((zn) => d >= zn.min)!;
    const roll = hash(ax, az, plan.seed + 501);
    const members = [[ax, az], [ax + 1, az], [ax, az + 1], [ax + 1, az + 1]];
    if (roll < zone.chance && members.every(([mx, mz]) => LOTS.includes(baseTile(plan, mx, mz).kind))) {
      let type = zone.types[Math.floor(hash(ax, az, plan.seed + 502) * zone.types.length)];
      // A dam needs water next to it (the river or a lake); otherwise it's a power station.
      if (type === "dam" && !nearWater(plan, ax, az)) type = "power";
      found = { type, name: structureName(plan, type, ax, az) };
    }
    plan.structures.set(key, found);
  }
  const st = plan.structures.get(key);
  return st ? { ...st, ax, az, anchor: x === ax && z === az } : null;
}

/** Is there river or lake right round the 2×2 cell at (ax, az)? */
function nearWater(plan: CityPlan, ax: number, az: number) {
  for (let dx = -1; dx <= 2; dx++) {
    for (let dz = -1; dz <= 2; dz++) {
      if (dx >= 0 && dx <= 1 && dz >= 0 && dz <= 1) continue;
      const k = baseTile(plan, ax + dx, az + dz).kind;
      if (k === "river" || k === "lake" || k === "bridge") return true;
    }
  }
  return false;
}

function structureName(plan: CityPlan, type: StructureType, ax: number, az: number) {
  const pick = <T,>(list: T[], k: number) => list[Math.floor(hash(ax, az, plan.seed + k) * list.length) % list.length];
  const city = plan.city.name;
  const street = streetBase(plan, "x", nearestLine(plan.zs, plan.z0, az).k);
  switch (type) {
    case "mall":
      return pick([`${city} Mall`, `${street} Shopping Centre`, `${city} City Mall`, `The Palms`, `${street} Plaza`], 1);
    case "twin":
      return pick([`${city} Twin Towers`, `${street} Towers`, "The Twins"], 2);
    case "museum":
      return pick([`${city} National Museum`, `${city} Art Gallery`, "Museum of the City"], 3);
    case "funfair":
      return pick([`${street} Funfair`, `${street} Wonderland`, `${street} Fun Park`], 4);
    case "market":
      return plan.city.flavor.markets ? pick(plan.city.flavor.markets, 5) : `${city} Market`;
    case "arena":
      return pick([`${city} Arena`, `${street} Stadium`, `${city} Sports Centre`], 6);
    case "campus":
      return pick([`University of ${city}`, `${city} Polytechnic`, `${street} College`], 7);
    case "hotel":
      return pick([`Grand ${city} Hotel`, `The ${street}`, `${city} Continental`], 8);
    case "solar":
      return `${street} Solar Farm`;
    case "airport":
      return pick([`${city} Airport`, `${street} Airfield`, `${city} International`], 9);
    case "port":
      return pick([`${city} Harbour`, `${street} Docks`, `Port of ${city}`], 10);
    case "military":
      return pick([`${street} Barracks`, `${city} Army Camp`, `Fort ${street}`], 11);
    case "power":
      return pick([`${city} Power Station`, `${street} Power Plant`, `${city} Energy Centre`], 12);
    case "dam":
      return pick([`${city} Dam`, `${street} Dam`, `${city} Reservoir Dam`], 13);
    case "oilrig":
      return pick([`${city} Oil Platform`, `${street} Oil Rig`, `${city} Offshore Rig`], 14);
  }
}

export function tileAt(plan: CityPlan, i: number): Tile {
  const [x, z] = spiralXY(i);
  const t = baseTile(plan, x, z);
  t.i = i;
  if (onRail(plan, x, z)) {
    t.rail = true;
    const along = plan.rail!.along === "z" ? z : x;
    if (plan.rail!.station !== null && Math.abs(along - plan.rail!.station) <= 1) t.station = true;
    t.top = Math.max(t.top, t.station ? 1.75 : 1.2);
  }
  if (!LOTS.includes(t.kind)) return t;
  const st = t.rail ? null : structureAt(plan, x, z);
  if (st) {
    const heights: Record<StructureType, number> = {
      mall: 1.2, twin: 7, museum: 1.8, funfair: 2.8, market: 0.7, arena: 1.1, campus: 1.6, hotel: 4.4, solar: 0.5, airport: 1.6, port: 1.8, military: 1.2,
      power: 3.4, dam: 0.9, oilrig: 2.8,
    };
    return { ...t, kind: "structure", top: heights[st.type], structure: st, fallback: t };
  }
  const b = blockBillboard(plan, x, z);
  if (b && b.x === x && b.z === z) {
    return {
      ...t,
      kind: "billboard",
      top: 2.8,
      billboard: { id: `${Math.floor(x / 10)}.${Math.floor(z / 10)}`, design: Math.floor(t.r[2] * 4), face: b.face },
    };
  }
  return t;
}

// ---------------------------------------------------------------- addresses

function streetBase(plan: CityPlan, axis: "x" | "z", k: number) {
  const list = plan.city.streets;
  return list[mod(2 * k + (axis === "x" ? 0 : 1), list.length)];
}

/** The full name of a street: x-streets run along x (fixed z), z-streets along z (fixed x). */
export function streetName(plan: CityPlan, axis: "x" | "z", k: number, short = false) {
  const suffixes = plan.city.flavor.suffixes;
  const suffix = suffixes[Math.floor(hash(k, axis === "x" ? 1 : 2, plan.seed + 900) * suffixes.length)];
  return `${streetBase(plan, axis, k)} ${short ? (ABBREV[suffix] ?? suffix) : suffix}`;
}

/** The street nearest to a position along one axis: its number, and how far away it is. */
function nearestLine(lines: number[], zero: number, v: number) {
  const k = below(lines, v);
  const a = lines[k];
  const b = lines[k + 1] ?? a;
  return v - a <= b - v ? { k: k - zero, at: a, d: v - a } : { k: k + 1 - zero, at: b, d: b - v };
}

/** A human address for a tile: "14 Adekunle Street", "Harvey Rd & Oak Ave", "Ikeja City Mall". */
export function addressOf(plan: CityPlan, t: Tile): string {
  // Every tile of a big building shares the address of its corner tile.
  if (t.kind === "structure" && t.structure && (t.x !== t.structure.ax || t.z !== t.structure.az)) {
    return addressOf(plan, { ...t, x: t.structure.ax, z: t.structure.az });
  }
  const ew = nearestLine(plan.zs, plan.z0, t.z); // east–west street (runs along x)
  const ns = nearestLine(plan.xs, plan.x0, t.x); // north–south street (runs along z)
  if (t.kind === "road" || t.kind === "bridge") {
    const onEW = ew.d === 0;
    const onNS = ns.d === 0;
    if (onEW && onNS) {
      const name = `${streetName(plan, "x", ew.k, true)} & ${streetName(plan, "z", ns.k, true)}`;
      return t.roundabout ? `${name} roundabout` : name;
    }
    const name = onEW ? streetName(plan, "x", ew.k) : streetName(plan, "z", ns.k);
    return t.kind === "bridge" ? `${name} Bridge` : name;
  }
  // Lots take the number of the nearest street.
  const onX = ew.d <= ns.d;
  const street = onX ? streetName(plan, "x", ew.k) : streetName(plan, "z", ns.k);
  const along = onX ? t.x : t.z;
  const side = onX ? t.z > ew.at : t.x > ns.at;
  const number = Math.abs(along) * 2 + (side ? 1 : 2) + (along < 0 ? 40 : 0);
  const place = `${number} ${street}`;
  if (t.kind === "structure" && t.structure) return `${t.structure.name}, ${place}`;
  if (t.kind === "river") return `The river by ${place}`;
  if (t.kind === "lake") return `The lake by ${place}`;
  return place;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

function baseTile(plan: CityPlan, x: number, z: number): Tile {
  const i = -1;
  const s = plan.seed;
  const r: Tile["r"] = [hash(x, z, s), hash(x, z, s + 1), hash(x, z, s + 2), hash(x, z, s + 3)];
  const onLine = plan.xAt.has(x) || plan.zAt.has(z);
  const road = isRoad(plan, x, z);

  // The river: streets cross it on bridges, so every street stays connected.
  if (plan.river) {
    const along = plan.river.along === "x" ? x : z;
    const across = plan.river.along === "x" ? z : x;
    if (Math.abs(across - riverCentre(plan, along)) <= plan.river.width) {
      if (road) return { i, x, z, kind: "bridge", top: 0.35, road: plan.river.along === "x" ? "z" : "x", mask: 0, r };
      return { i, x, z, kind: "river", top: 0.1, r };
    }
  }

  if (road) {
    const mask = roadMask(plan, x, z);
    const ew = (mask & 2) || (mask & 8);
    const ns = (mask & 1) || (mask & 4);
    const dir: Tile["road"] = ew && ns ? "cross" : ew ? "x" : "z";
    const roundabout = mask === 15 && plan.xAt.has(x) && plan.zAt.has(z) && hash(x, z, s + 808) < plan.style.roundabouts;
    // Now and then a straight stretch is dug up for road works, or has a car stopped at the side.
    const straight = mask === 5 || mask === 10;
    const works = straight && Math.hypot(x, z) > 2.5 && hash(x, z, s + 1201) < 0.02;
    const roll = hash(x, z, s + 1301);
    const incident = straight && !works ? (roll < 0.007 ? "breakdown" : roll < 0.011 ? "police" : undefined) : undefined;
    return { i, x, z, kind: "road", top: works ? 0.45 : roundabout ? 0.3 : 0.05, road: dir, mask, roundabout, r, works: works || undefined, incident };
  }

  // Where a stretch of street was left out: a strip of park or a little square.
  if (onLine) return { i, x, z, kind: r[0] < 0.75 ? "park" : "plaza", top: r[0] < 0.75 ? 0.9 : 0.6, r };

  // The odd small lake, inside a block, away from the busiest areas.
  if (Math.hypot(x, z) > 9 && smoothNoise(x / 4 - 9, z / 4 + 4, s + 23) > 0.88) return { i, x, z, kind: "lake", top: 0.1, r };

  const density = densityAt(plan, x, z);

  const green = smoothNoise(x / 6 + 31, z / 6 - 17, s + 11) - plan.style.green;
  if (green > 0.7 && density < 0.6) {
    if (green > 0.82 && r[0] < 0.3) return { i, x, z, kind: "pond", top: 0.5, r };
    if (r[3] < 0.035) return { i, x, z, kind: "ferris", top: 2.6, r };
    return { i, x, z, kind: "park", top: 0.9, r };
  }
  const nextToRoad = isRoad(plan, x + 1, z) || isRoad(plan, x - 1, z) || isRoad(plan, x, z + 1) || isRoad(plan, x, z - 1);
  if (density > 0.56) {
    const v = Math.floor(r[3] * 5);
    const h = (1.6 + density * 5.5 * (0.5 + r[1] * 0.9)) * plan.style.towers;
    return { i, x, z, kind: "tower", top: Math.max(1.6, h) + (v === 3 ? 1.6 : 0.4), r, v };
  }
  if (density > 0.24) {
    if (r[0] < 0.06) return { i, x, z, kind: "plaza", top: 0.6, r };
    if (r[0] < 0.075) return { i, x, z, kind: "hospital", top: 1.7, r };
    if (r[0] < 0.09) return { i, x, z, kind: "clock", top: 2.6, r };
    if (r[0] < 0.11) return { i, x, z, kind: "crane", top: 3.2, r };
    if (r[0] < 0.122 && nextToRoad) return { i, x, z, kind: "police", top: 1.1, r };
    if (r[0] > 0.988 && nextToRoad) return { i, x, z, kind: "fuel", top: 0.5, r };
    return { i, x, z, kind: "office", top: 0.9 + r[1] * 1.8 + density * 1.2, r, v: Math.floor(r[2] * 3) };
  }
  if (Math.hypot(x, z) > 13 && r[2] < 0.035) return { i, x, z, kind: "turbine", top: 3.2, r };
  if (r[3] > 0.997) return { i, x, z, kind: "ferris", top: 2.6, r };
  if (r[0] < 0.16) return { i, x, z, kind: "trees", top: 1, r };
  if (r[0] < 0.175) return { i, x, z, kind: "watertower", top: 2.2, r };
  if (r[0] < 0.182) return { i, x, z, kind: "mast", top: 4, r };
  if (r[0] > 0.99 && nextToRoad) return { i, x, z, kind: "fuel", top: 0.5, r };
  const v = Math.floor(r[1] * 3);
  return { i, x, z, kind: "house", top: v === 2 ? 1.1 : 0.95, r, v };
}
