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
  | "structure";

/** Big buildings that span a 2×2 block of tiles. */
export type StructureType = "mall" | "twin" | "museum" | "funfair" | "market" | "arena" | "campus" | "hotel" | "solar";

export type Tile = {
  i: number;
  x: number;
  z: number;
  kind: TileKind;
  /** Height of the tallest thing on the tile (for placing markers above it). */
  top: number;
  /** Road direction: along x, along z, or a crossing. */
  road?: "x" | "z" | "cross";
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
};

/** Everything the city can be made of, for the help screen. */
export const CITY_ASSETS = {
  big: ["Shopping malls", "Twin towers with a sky bridge", "Domed museums", "Funfairs", "Open-air markets", "Arenas", "University campuses", "Hotels with rooftop pools", "Solar farms"],
  tiles: [
    "Skyscrapers (stepped, round glass, twisted, needle spire, helipad)",
    "Office blocks (plain, L-shaped, rooftop garden)",
    "Houses (pitched bungalow, flat modern with pool, duplex with garage)",
    "Hospitals", "Clock towers", "Construction sites with cranes", "Water towers", "Radio masts", "Fuel stations",
    "Parks", "Woods", "Plazas with fountains", "Ponds", "Ferris wheels", "Wind turbines", "Billboards",
    "Roads", "Bridges", "A river (sometimes)", "Small lakes",
  ],
  moving: ["Cars", "Boats", "Birds", "Clouds", "Hot-air balloons", "Planes", "Ferris wheels, carousels, cranes and turbines"],
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
function noise(x: number, z: number, s: number) {
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
  periodX: number;
  periodZ: number;
  offX: number;
  offZ: number;
  centres: { x: number; z: number; radius: number; weight: number }[];
  /** Billboard choice per 10×10 block (filled in as needed). */
  cache: Map<string, { x: number; z: number; face: number } | null>;
  structures: Map<string, { type: StructureType; name: string } | null>;
  /** A river winding across the city (along x or z), or none. */
  river: { along: "x" | "z"; at: number; amp: number; wave: number; phase: number; width: number } | null;
  palette: Palette;
};

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

export function makePlan(seed: number): CityPlan {
  const r = (k: number) => hash(seed, k, 9173);
  const centres = [{ x: 0, z: 0, radius: 2.2 + r(1) * 2, weight: 1 }];
  const extra = 1 + Math.floor(r(2) * 3);
  for (let k = 0; k < extra; k++) {
    const angle = r(10 + k) * Math.PI * 2;
    const dist = 12 + r(20 + k) * 18;
    centres.push({
      x: Math.round(Math.cos(angle) * dist),
      z: Math.round(Math.sin(angle) * dist),
      radius: 1.5 + r(30 + k) * 2,
      weight: 0.65 + r(40 + k) * 0.3,
    });
  }
  const periodX = 4 + Math.floor(r(3) * 3);
  const periodZ = 4 + Math.floor(r(4) * 3);
  const offX = Math.floor(r(5) * 6);
  const offZ = Math.floor(r(6) * 6);
  // About one city in three gets a river. It runs midway between two parallel streets and
  // wiggles only a little, so it never swallows a street: streets cross it on bridges.
  const along = r(51) < 0.5 ? "x" : "z";
  const period = along === "x" ? periodZ : periodX;
  const off = along === "x" ? offZ : offX;
  const lane = Math.round((r(52) - 0.5) * 4);
  const river =
    r(50) < 0.35
      ? {
          along: along as "x" | "z",
          at: off + lane * period + period / 2,
          amp: Math.max(0, period / 2 - 1.6) + r(53) * 0.3,
          wave: 2.5 + r(54) * 2,
          phase: r(55) * 6.28,
          width: 0.5,
        }
      : null;
  // The city's name and street names.
  let pickW = r(60) * FLAVORS.reduce((t, f) => t + f.weight, 0);
  const flavor = FLAVORS.find((f) => (pickW -= f.weight) < 0) ?? FLAVORS[0];
  const cityName = flavor.cities[Math.floor(r(61) * flavor.cities.length)];
  const streets = [...flavor.streets].sort((a, b) => hash(a.length, a.charCodeAt(0) + a.charCodeAt(a.length - 1) * 31, seed) - hash(b.length, b.charCodeAt(0) + b.charCodeAt(b.length - 1) * 31, seed));
  return {
    seed,
    city: { name: cityName, flavor, streets },
    river,
    cache: new Map(),
    structures: new Map(),
    periodX,
    periodZ,
    offX,
    offZ,
    centres,
    palette: PALETTES[Math.floor(r(7) * PALETTES.length)],
  };
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

const LOTS: TileKind[] = ["house", "office", "park", "trees", "plaza"];
const isRoad = (plan: CityPlan, x: number, z: number) =>
  mod(z - plan.offZ, plan.periodZ) === 0 || mod(x - plan.offX, plan.periodX) === 0;

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
      if (!LOTS.includes(baseTile(plan, tx, tz).kind) || structureAt(plan, tx, tz)) continue;
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
  return density + (noise(x / 3, z / 3, plan.seed + 7) - 0.5) * 0.25;
}

const STRUCTURES_BY_ZONE: { min: number; chance: number; types: StructureType[] }[] = [
  { min: 0.56, chance: 0.12, types: ["twin", "hotel", "mall", "museum"] },
  { min: 0.24, chance: 0.14, types: ["mall", "market", "museum", "campus", "arena", "funfair", "hotel"] },
  { min: -9, chance: 0.08, types: ["funfair", "solar", "arena", "campus", "market"] },
];

/**
 * Big 2×2 buildings. Blocks between streets are split into 2×2 cells starting at the street
 * edge; some cells, whose four tiles are all plain lots, become a landmark.
 */
function structureAt(plan: CityPlan, x: number, z: number) {
  const lx = mod(x - plan.offX, plan.periodX);
  const lz = mod(z - plan.offZ, plan.periodZ);
  if (lx === 0 || lz === 0) return null;
  const ax = x - ((lx - 1) % 2);
  const az = z - ((lz - 1) % 2);
  // The cell must fit inside the block.
  if (mod(ax - plan.offX, plan.periodX) + 1 >= plan.periodX || mod(az - plan.offZ, plan.periodZ) + 1 >= plan.periodZ) return null;
  const key = `${ax},${az}`;
  if (!plan.structures.has(key)) {
    let found: { type: StructureType; name: string } | null = null;
    const d = densityAt(plan, ax + 0.5, az + 0.5);
    const zone = STRUCTURES_BY_ZONE.find((zn) => d >= zn.min)!;
    const roll = hash(ax, az, plan.seed + 501);
    const members = [[ax, az], [ax + 1, az], [ax, az + 1], [ax + 1, az + 1]];
    if (roll < zone.chance && members.every(([mx, mz]) => LOTS.includes(baseTile(plan, mx, mz).kind))) {
      const type = zone.types[Math.floor(hash(ax, az, plan.seed + 502) * zone.types.length)];
      found = { type, name: structureName(plan, type, ax, az) };
    }
    plan.structures.set(key, found);
  }
  const st = plan.structures.get(key);
  return st ? { ...st, ax, az, anchor: x === ax && z === az } : null;
}

function structureName(plan: CityPlan, type: StructureType, ax: number, az: number) {
  const pick = <T,>(list: T[], k: number) => list[Math.floor(hash(ax, az, plan.seed + k) * list.length) % list.length];
  const city = plan.city.name;
  const street = streetBase(plan, "x", Math.round((az - plan.offZ) / plan.periodZ));
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
  }
}

export function tileAt(plan: CityPlan, i: number): Tile {
  const [x, z] = spiralXY(i);
  const t = baseTile(plan, x, z);
  t.i = i;
  if (!LOTS.includes(t.kind)) return t;
  const st = structureAt(plan, x, z);
  if (st) {
    const heights: Record<StructureType, number> = { mall: 1.2, twin: 7, museum: 1.8, funfair: 2.8, market: 0.7, arena: 1.1, campus: 1.6, hotel: 4.4, solar: 0.5 };
    return { ...t, kind: "structure", top: heights[st.type], structure: st, fallback: t };
  }
  const b = blockBillboard(plan, x, z);
  if (b && b.x === x && b.z === z) {
    return {
      ...t,
      kind: "billboard",
      top: 1.5,
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

/** A human address for a tile: "14 Adekunle Street", "Harvey Rd & Oak Ave", "Ikeja City Mall". */
export function addressOf(plan: CityPlan, t: Tile): string {
  const kx = Math.round((t.z - plan.offZ) / plan.periodZ); // street running along x
  const kz = Math.round((t.x - plan.offX) / plan.periodX); // street running along z
  if (t.kind === "road" || t.kind === "bridge") {
    if (t.road === "cross") return `${streetName(plan, "x", kx, true)} & ${streetName(plan, "z", kz, true)}`;
    const name = t.road === "x" ? streetName(plan, "x", kx) : streetName(plan, "z", kz);
    return t.kind === "bridge" ? `${name} Bridge` : name;
  }
  // Every tile of a big building shares the address of its corner tile.
  if (t.kind === "structure" && t.structure && (t.x !== t.structure.ax || t.z !== t.structure.az)) {
    return addressOf(plan, { ...t, x: t.structure.ax, z: t.structure.az });
  }
  // Lots take the number of the nearest street.
  const dz = Math.abs(t.z - (plan.offZ + kx * plan.periodZ));
  const dx = Math.abs(t.x - (plan.offX + kz * plan.periodX));
  const onX = dz <= dx;
  const street = onX ? streetName(plan, "x", kx) : streetName(plan, "z", kz);
  const along = onX ? t.x : t.z;
  const side = onX ? t.z > plan.offZ + kx * plan.periodZ : t.x > plan.offX + kz * plan.periodX;
  const number = Math.abs(along) * 2 + (side ? 1 : 2) + (along < 0 ? 40 : 0);
  const place = `${number} ${street}`;
  if (t.kind === "structure" && t.structure) return `${t.structure.name}, ${place}`;
  if (t.kind === "river") return `The river by ${place}`;
  if (t.kind === "lake") return `The lake by ${place}`;
  return place;
}

function baseTile(plan: CityPlan, x: number, z: number): Tile {
  const i = -1;
  const s = plan.seed;
  const r: Tile["r"] = [hash(x, z, s), hash(x, z, s + 1), hash(x, z, s + 2), hash(x, z, s + 3)];

  const roadX = mod(z - plan.offZ, plan.periodZ) === 0; // runs along x
  const roadZ = mod(x - plan.offX, plan.periodX) === 0; // runs along z
  const road: Tile["road"] = roadX && roadZ ? "cross" : roadX ? "x" : "z";

  // The river: streets cross it on bridges, so every street stays connected.
  if (plan.river) {
    const along = plan.river.along === "x" ? x : z;
    const across = plan.river.along === "x" ? z : x;
    if (Math.abs(across - riverCentre(plan, along)) <= plan.river.width) {
      if (roadX || roadZ) {
        const dir = plan.river.along === "x" ? "z" : "x";
        return { i, x, z, kind: "bridge", top: 0.35, road: dir, r };
      }
      return { i, x, z, kind: "river", top: 0.1, r };
    }
  }

  if (roadX || roadZ) return { i, x, z, kind: "road", top: 0.05, road, r };

  // The odd small lake, inside a block, away from downtown.
  if (Math.hypot(x, z) > 9 && noise(x / 4 - 9, z / 4 + 4, s + 23) > 0.88) return { i, x, z, kind: "lake", top: 0.1, r };

  const density = densityAt(plan, x, z);

  const green = noise(x / 6 + 31, z / 6 - 17, s + 11);
  if (green > 0.7 && density < 0.6) {
    if (green > 0.82 && r[0] < 0.3) return { i, x, z, kind: "pond", top: 0.5, r };
    if (r[3] < 0.035) return { i, x, z, kind: "ferris", top: 2.6, r };
    return { i, x, z, kind: "park", top: 0.9, r };
  }
  const nextToRoad = isRoad(plan, x + 1, z) || isRoad(plan, x - 1, z) || isRoad(plan, x, z + 1) || isRoad(plan, x, z - 1);
  if (density > 0.56) {
    const v = Math.floor(r[3] * 5);
    const h = 2.4 + density * 5.5 * (0.6 + r[1] * 0.8);
    return { i, x, z, kind: "tower", top: h + (v === 3 ? 1.6 : 0.4), r, v };
  }
  if (density > 0.24) {
    if (r[0] < 0.06) return { i, x, z, kind: "plaza", top: 0.6, r };
    if (r[0] < 0.075) return { i, x, z, kind: "hospital", top: 1.7, r };
    if (r[0] < 0.09) return { i, x, z, kind: "clock", top: 2.6, r };
    if (r[0] < 0.11) return { i, x, z, kind: "crane", top: 3.2, r };
    if (r[0] > 0.988 && nextToRoad) return { i, x, z, kind: "fuel", top: 0.5, r };
    return { i, x, z, kind: "office", top: 0.9 + r[1] * 1.6 + density * 1.5, r, v: Math.floor(r[2] * 3) };
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
