// Decides what stands on every tile of the city, and its street address. Pure maths, no drawing.
//
// Tiles are laid out in a square spiral from the centre (tile 0), so new tiles always
// appear on the outside edge and the city grows outwards. The database uses the same
// spiral (spiral_xy) to work out which tiles are "nearby" for sweeps.
// Each round gets its own seed, so the street grid, downtowns and parks differ every round,
// but a given tile always looks the same for everyone during that round.

import type { HouseInterior, HouseStyle, TownHouse } from "@/lib/houses";
import { ABBREV, CLUB_NAMES, eggChoices, FLAVORS, landmarkChoices, nameOf, RESTAURANT_NAMES, type EasterEgg, type Flavor, type LandmarkKey, type Named } from "./places";

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
  | "fire"
  | "club"
  | "restaurant"
  | "structure"
  // Neighbourhood places, one every few dozen lots in the suburbs (see featureAt).
  | "school"
  | "worship"
  | "pitch"
  | "playground"
  | "monument";

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
  | "oilrig"
  | "waterpark"
  // Sports venues (every city tries to have one of each, see placeVenues): "arena" is the
  // football stadium; "court" a basketball court with an indoor hall; boxing and wrestling arenas.
  | "court"
  | "boxing"
  | "wrestling"
  // Big landmarks (3×3 and up, see MEGAS): a domed capitol with gardens, a mega mall.
  | "capitol"
  | "megamall";

/** The sport played at a venue. */
export type Sport = "football" | "basketball" | "boxing" | "wrestling";
export const VENUE_SPORT: Partial<Record<StructureType, Sport>> = { arena: "football", court: "basketball", boxing: "boxing", wrestling: "wrestling" };

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
  /**
   * Part of a big building (2×2 unless w / d say otherwise): which one, where its corner is, and
   * the tile it stands on otherwise.
   */
  structure?: {
    type: StructureType;
    ax: number;
    az: number;
    anchor: boolean;
    name: string;
    /** Names for its levels (rooms inside), in order. */
    inside?: string[];
    /** Size in tiles along x and z (2 when missing). */
    w?: number;
    d?: number;
  };
  /** A single-tile landmark's own name ("Teslim Balogun Stadium", "Club Gbedu"...). */
  name?: string;
  /** A little named decoration on this lot (a suya spot, a danfo park...), and which side faces the road. */
  egg?: EasterEgg & { face: number };
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
  /** A street crossing a lake on a low causeway (water either side). */
  causeway?: boolean;
  /** The open square either side of the station's glass hall. */
  forecourt?: boolean;
  /** Open sea (big towns reach the coast). */
  sea?: boolean;
  /** A lake or sea tile by the shore with a wooden jetty (which side faces land: 0 +x, 1 -x, 2 +z, 3 -z). */
  jetty?: number;
  /** A player's house stands here (see src/lib/city/houses.ts). */
  home?: { slot: number; name: string; owner: string; ownerId: string; style: HouseStyle; wall: string; roof: string; interior: HouseInterior };
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
  fire: "Fire station",
  club: "Nightclub",
  restaurant: "Restaurant",
  structure: "Landmark",
  school: "School",
  worship: "Place of worship",
  pitch: "Football pitch",
  playground: "Playground",
  monument: "Monument",
};

export const STRUCTURE_LABEL: Record<StructureType, string> = {
  mall: "Shopping mall",
  twin: "Twin towers",
  museum: "Museum",
  funfair: "Funfair",
  market: "Market",
  arena: "Football stadium",
  campus: "University",
  hotel: "Hotel",
  solar: "Solar farm",
  airport: "Airport",
  port: "Sea port",
  military: "Military camp",
  power: "Power station",
  dam: "Dam",
  oilrig: "Oil rig",
  waterpark: "Water park",
  court: "Basketball court",
  boxing: "Boxing arena",
  wrestling: "Wrestling arena",
  capitol: "Capitol",
  megamall: "Mega mall",
};

/** Everything the city can be made of, for the help screen. */
export const CITY_ASSETS = {
  big: [
    "Football stadiums (a bowl of stands round the pitch, under a ring of roof)", "Domed capitols in gardens, with a statue out front", "Mega malls under glass",
    "A grand station under a glass vault", "Airports", "Sea ports", "Military camps", "Shopping malls", "Twin towers with a sky bridge", "Domed museums", "Funfairs", "Open-air markets", "Arenas",
    "University campuses", "Hotels with rooftop pools", "Solar farms", "Power stations with steaming cooling towers", "Dams with spillways", "Oil rigs with gas flares",
    "Water parks with twisting slides",
  ],
  tiles: [
    "Skyscrapers (stepped, round glass, twisted, needle spire, helipad)",
    "Office blocks (plain, L-shaped, rooftop garden)",
    "Houses (pitched bungalow, flat modern with pool, duplex with garage)",
    "Hospitals", "Police stations", "Fire stations", "Nightclubs", "Restaurants", "Clock towers", "Construction sites with cranes", "Water towers", "Radio masts", "Fuel stations",
    "Supertall skyscrapers in the biggest downtowns", "Schools", "Mosques and churches", "Five-a-side pitches", "Playgrounds", "Monuments and statues",
    "Parks", "Woods", "Plazas with fountains or statues", "Ponds", "Ferris wheels", "Wind turbines", "Billboards",
    "Roads", "Winding lanes in the suburbs", "Bridges", "A river (sometimes)", "Big lakes with causeways and jetties", "The sea (when a town grows really big)",
    "Road works", "Hills and mountains around the city", "A railway on a viaduct sweeping round in curves",
  ],
  moving: [
    "Cars, taxis, vans, buses, trucks and articulated lorries (and the odd traffic jam)", "Trains", "People out walking (with umbrellas when it rains)", "Boats",
    "Pigeons, gulls, swallows, geese flying in a V and the odd eagle", "Clouds", "Hot-air balloons", "Planes", "Buildings going up during the hunt",
    "Ferris wheels, carousels, cranes and turbines",
  ],
  fun: ["Famous local landmarks (Unilag, Third Mainland Bridge, Big Ben, Willis Tower...)", "Suya spots, danfo parks, Mama Put stands, phone boxes and other easter eggs"],
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

/** The tile number at (x, z): the opposite of spiralXY (same as npc_xy_tile in the database). */
export function spiralIndex(x: number, z: number): number {
  const k = Math.max(Math.abs(x), Math.abs(z));
  if (k === 0) return 0;
  const big = (2 * k + 1) * (2 * k + 1);
  if (z === -k) return big - (k - x) - 1;
  if (x === -k) return big - 2 * k - (z + k) - 1;
  if (z === k) return big - 4 * k - (x + k) - 1;
  return big - 6 * k - (k - z) - 1;
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
  structures: Map<string, StructureInfo | null>;
  /** The 2×2 cells ("ax,az") kept for the sports venues, and which venue each one is. */
  venues: Map<string, StructureType>;
  /** Easter egg choice per 7×7 block (filled in as needed). */
  eggs: Map<string, { x: number; z: number; face: number; egg: EasterEgg } | null>;
  /** A river winding across the city (along x or z), or none. */
  river: { along: "x" | "z"; at: number; amp: number; wave: number; phase: number; width: number } | null;
  /**
   * A railway on a viaduct sweeping across the city in gentle S-bends: along x its centre line
   * is z = at + amp·sin(x / wave + phase) (along z the same with x and z swapped; see
   * railCentre). The station is a 5-tile glass hall on a straight stretch at `station`.
   */
  rail: { along: "x" | "z"; at: number; station: number | null; amp: number; wave: number; phase: number } | null;
  /** Big lakes (wobbly ovals). */
  lakes: { x: number; z: number; rx: number; rz: number }[];
  /** The coast: the sea starts about `dist` out in direction (nx, nz) (only very big towns reach it). */
  sea: { nx: number; nz: number; dist: number };
  /** Big landmarks of 3×3 tiles and up (the stadium, the capitol, mega malls), and what's where. */
  megas: Mega[];
  megaAt: Map<number, number>;
  /** Winding lanes per 16×16 stretch of suburb (filled in as needed). */
  lanes: Map<string, Set<number> | null>;
  /** One neighbourhood place per 6×6 cell of suburb (filled in as needed). */
  features: Map<string, { x: number; z: number; kind: TileKind } | null>;
  palette: Palette;
  /** Players' houses in this game, by tile (set by placeHouses in ./houses.ts). */
  homes?: Map<number, TownHouse>;
};

/** A big landmark of 3×3 tiles or more. */
export type Mega = { type: StructureType; ax: number; az: number; w: number; d: number; name: string; inside?: string[] };

/** A number for a grid spot (for quick lookups). */
const nkey = (x: number, z: number) => (x + 32768) * 65536 + (z + 32768);

/** Where the railway's centre line is across the line, at a position along it. */
export function railCentre(plan: CityPlan, along: number) {
  const r = plan.rail!;
  return r.at + r.amp * Math.sin(along / r.wave + r.phase);
}

/** The railway's tile at a position along the line (one per step along). */
export function railRow(plan: CityPlan, along: number) {
  return Math.round(railCentre(plan, along));
}

/** Is (x, z) under the railway viaduct? */
export function onRail(plan: CityPlan, x: number, z: number) {
  const r = plan.rail;
  if (!r) return false;
  return r.along === "z" ? x === railRow(plan, z) : z === railRow(plan, x);
}

/** The station's middle tile (where its entrance is). */
export function stationXZ(plan: CityPlan): { x: number; z: number } | null {
  const r = plan.rail;
  if (!r || r.station === null) return null;
  const c = railRow(plan, r.station);
  return r.along === "z" ? { x: c, z: r.station } : { x: r.station, z: c };
}

/** A big building's size in tiles. */
export function structureSize(st: { w?: number; d?: number }) {
  return { w: st.w ?? 2, d: st.d ?? 2 };
}

/** The middle of a big building (city units). */
export function structureCentre(st: { ax: number; az: number; w?: number; d?: number }) {
  const { w, d } = structureSize(st);
  return { x: st.ax + (w - 1) / 2, z: st.az + (d - 1) / 2 };
}

/** Is (x, z) in a big lake? */
export function inLake(plan: CityPlan, x: number, z: number) {
  for (const L of plan.lakes) {
    const dx = (x - L.x) / L.rx;
    const dz = (z - L.z) / L.rz;
    if (Math.abs(dx) > 1.6 || Math.abs(dz) > 1.6) continue;
    const wobble = (smoothNoise(x / 2.5 + L.x, z / 2.5 + L.z, plan.seed + 31) - 0.5) * 0.7;
    if (Math.hypot(dx, dz) + wobble < 1) return true;
  }
  return false;
}

/** Is (x, z) out at sea? */
export function inSea(plan: CityPlan, x: number, z: number) {
  const { nx, nz, dist } = plan.sea;
  const out = x * nx + z * nz;
  if (out < dist - 6) return false;
  const along = -x * nz + z * nx;
  // A wavy coastline with bays and headlands.
  const coast = dist + (smoothNoise(along / 7, 3.3, plan.seed + 37) - 0.5) * 12 + Math.sin(along / 11 + plan.seed) * 2;
  return out > coast;
}

/**
 * Is (x, z) in the river? Every tile the river's centre line passes over between this step and
 * the next, so where it bends it fills in the corner and flows on unbroken.
 */
function inRiver(plan: CityPlan, x: number, z: number) {
  if (!plan.river) return false;
  const along = plan.river.along === "x" ? x : z;
  const across = plan.river.along === "x" ? z : x;
  const a = riverCentre(plan, along - 0.5);
  const b = riverCentre(plan, along);
  const c = riverCentre(plan, along + 0.5);
  const w = plan.river.width;
  return across >= Math.min(a, b, c) - w && across <= Math.max(a, b, c) + w;
}

/** Any water: river, lake or sea (not the little ponds and lakes inside blocks). */
function wet(plan: CityPlan, x: number, z: number) {
  return inRiver(plan, x, z) || inLake(plan, x, z) || inSea(plan, x, z);
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
  // Further out, more downtowns that only appear as the town grows: a big town becomes a
  // megacity with skyline after skyline (and they're taller the further out they are).
  for (let k = 0; k < 7; k++) {
    const angle = r(100 + k) * Math.PI * 2;
    const dist = 30 + k * 15 + r(110 + k) * 8;
    centres.push({
      x: Math.round(Math.cos(angle) * dist),
      z: Math.round(Math.sin(angle) * dist),
      radius: 3 + r(120 + k) * 3,
      weight: 0.95 + Math.min(0.35, k * 0.06) + r(130 + k) * 0.15,
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

  // About two cities in three have a railway: a viaduct sweeping across the city in gentle
  // S-bends, with a big glass station hall on a straight stretch near the middle.
  let rail: CityPlan["rail"] = null;
  if (r(80) < 0.7) {
    const along: "x" | "z" = r(81) < 0.5 ? "x" : "z";
    const wave = 7 + r(83) * 6;
    // Now and then nearly straight; mostly properly curvy (but gentle enough for trains).
    const amp = Math.min(wave * 0.42, r(84) < 0.15 ? 0.6 : 2.5 + r(85) * 2.5);
    const phase = r(86) * Math.PI * 2;
    const at0 = Math.round((r(82) - 0.5) * 8);
    // The station: on a crest of the curve nearest the middle (where the line runs straight).
    let station = 0;
    for (let k = -4; k <= 4; k++) {
      const a = wave * (Math.PI / 2 - phase + k * Math.PI);
      if (k === -4 || Math.abs(a) < Math.abs(station)) station = a;
    }
    station = Math.round(station);
    // Line the crest up with a row of tiles, so the station hall sits square on it.
    const c = at0 + amp * Math.sin(station / wave + phase);
    rail = { along, at: at0 + (Math.round(c) - c), station, amp, wave, phase };
  }

  // Big lakes out in the districts, and (for really big towns) the coast.
  const lakes: CityPlan["lakes"] = [];
  const lakeCount = 1 + (r(140) < 0.65 ? 1 : 0) + (r(141) < 0.35 ? 1 : 0);
  for (let k = 0; k < lakeCount + 3; k++) {
    const angle = r(150 + k) * Math.PI * 2;
    // The first ones near enough to see in a small town; the rest further out.
    const dist = k < lakeCount ? 13 + r(160 + k) * 20 : 38 + (k - lakeCount) * 16 + r(160 + k) * 10;
    lakes.push({ x: Math.round(Math.cos(angle) * dist), z: Math.round(Math.sin(angle) * dist), rx: 2.6 + r(170 + k) * 3.4, rz: 2.6 + r(180 + k) * 3.4 });
  }
  const seaAngle = r(190) * Math.PI * 2;
  const sea = { nx: Math.cos(seaAngle), nz: Math.sin(seaAngle), dist: 48 + r(191) * 18 };

  // The city's name and street names.
  let pickW = r(60) * FLAVORS.reduce((t, f) => t + f.weight, 0);
  const flavor = FLAVORS.find((f) => (pickW -= f.weight) < 0) ?? FLAVORS[0];
  const cityName = flavor.cities[Math.floor(r(61) * flavor.cities.length)];
  const streets = [...flavor.streets].sort(
    (a, b) =>
      hash(a.length, a.charCodeAt(0) + a.charCodeAt(a.length - 1) * 31, seed) -
      hash(b.length, b.charCodeAt(0) + b.charCodeAt(b.length - 1) * 31, seed),
  );
  const plan: CityPlan = {
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
    lakes,
    sea,
    megas: [],
    megaAt: new Map(),
    lanes: new Map(),
    features: new Map(),
    cache: new Map(),
    structures: new Map(),
    venues: new Map(),
    eggs: new Map(),
    palette: PALETTES[Math.floor(r(7) * PALETTES.length)],
  };
  placeMegas(plan);
  placeVenues(plan);
  return plan;
}

/**
 * The big landmarks, from the middle outwards: the football stadium (4×4), the capitol (3×3)
 * and a mega mall near the middle, then more as the town grows into a megacity. Each takes over
 * whatever streets ran through its spot (they end at its plaza). Never on water, the railway or
 * another landmark.
 */
const MEGAS: { type: StructureType; w: number; d: number; min: number; max: number }[] = [
  { type: "arena", w: 4, d: 4, min: 3.5, max: 7.5 },
  { type: "capitol", w: 3, d: 3, min: 6.5, max: 11 },
  { type: "megamall", w: 3, d: 3, min: 11, max: 20 },
  { type: "arena", w: 4, d: 4, min: 30, max: 44 },
  { type: "megamall", w: 3, d: 3, min: 38, max: 54 },
  { type: "capitol", w: 3, d: 3, min: 50, max: 68 },
  { type: "megamall", w: 3, d: 3, min: 62, max: 84 },
];

function placeMegas(plan: CityPlan) {
  const st = plan.rail && plan.rail.station !== null ? stationXZ(plan) : null;
  MEGAS.forEach((m, k) => {
    for (let tries = 0; tries < 40; tries++) {
      const angle = hash(k, tries, plan.seed + 700) * Math.PI * 2;
      const dist = m.min + hash(tries, k, plan.seed + 701) * (m.max - m.min);
      const ax = Math.round(Math.cos(angle) * dist - m.w / 2);
      const az = Math.round(Math.sin(angle) * dist - m.d / 2);
      let ok = true;
      for (let x = ax - 2; x < ax + m.w + 2 && ok; x++) {
        for (let z = az - 2; z < az + m.d + 2 && ok; z++) {
          // Two tiles clear of other landmarks and the railway, one clear of water.
          const ring = Math.max(ax - x, x - (ax + m.w - 1), az - z, z - (az + m.d - 1), 0);
          if (plan.megaAt.has(nkey(x, z)) || onRail(plan, x, z)) ok = false;
          else if (st && Math.abs(x - st.x) <= 3 && Math.abs(z - st.z) <= 3) ok = false;
          else if (ring <= 1 && wet(plan, x, z)) ok = false;
        }
      }
      if (!ok) continue;
      const known = famous(plan, m.type, ax, az, 520, 0.8);
      const name = known ? nameOf(known) : structureName(plan, m.type, ax, az);
      const mega: Mega = { type: m.type, ax, az, w: m.w, d: m.d, name };
      if (known && typeof known !== "string" && known.inside) mega.inside = known.inside;
      const id = plan.megas.length;
      plan.megas.push(mega);
      for (let x = ax; x < ax + m.w; x++) for (let z = az; z < az + m.d; z++) plan.megaAt.set(nkey(x, z), id);
      return;
    }
  });
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
  // Big landmarks take over the streets through their spot, and roads stop at the sea.
  if (plan.megaAt.has(nkey(x, z)) || inSea(plan, x, z)) return false;
  const k = plan.xAt.get(x);
  const j = plan.zAt.get(z);
  // Every other street crosses a big lake on a causeway; the rest stop at the shore.
  if ((k !== undefined || j !== undefined) && inLake(plan, x, z) && !((k ?? 1) % 2 === 0 || (j ?? 1) % 2 === 0)) return false;
  let grid = false;
  if (k !== undefined && j !== undefined) {
    grid = !gapNS(plan, k, j - 1) || !gapNS(plan, k, j) || !gapEW(plan, j, k - 1) || !gapEW(plan, j, k);
  } else if (k !== undefined) grid = !gapNS(plan, k, below(plan.zs, z));
  else if (j !== undefined) grid = !gapEW(plan, j, below(plan.xs, x));
  return grid || laneAt(plan, x, z);
}

// ---------------------------------------------------------------- winding lanes
// Out in the suburbs, a 16×16 stretch now and then gets a lane that wanders between two streets,
// kinking sideways every few lots (each kink drawn as two rounded bends), so not every road is
// a straight line on a grid.
const LANE = 16;

function laneAt(plan: CityPlan, x: number, z: number) {
  const bx = Math.floor(x / LANE);
  const bz = Math.floor(z / LANE);
  const key = `${bx},${bz}`;
  let set = plan.lanes.get(key);
  if (set === undefined) {
    set = makeLane(plan, bx, bz);
    plan.lanes.set(key, set);
  }
  return !!set && set.has(nkey(x, z));
}

function makeLane(plan: CityPlan, bx: number, bz: number): Set<number> | null {
  const cx = bx * LANE + LANE / 2;
  const cz = bz * LANE + LANE / 2;
  if (Math.hypot(cx, cz) < 10 || hash(bx, bz, plan.seed + 900) > 0.55 || densityAt(plan, cx, cz) > 0.3) return null;
  const alongX = hash(bz, bx, plan.seed + 901) < 0.5;
  // a = along the lane, c = across it.
  const crossLines = alongX ? plan.xs : plan.zs;
  const crossAt = alongX ? plan.xAt : plan.zAt;
  const sideAt = alongX ? plan.zAt : plan.xAt;
  const a0 = (alongX ? bx : bz) * LANE;
  const c0 = (alongX ? bz : bx) * LANE;
  // From the first street in the stretch to the last, so both ends join the grid.
  const inside = crossLines.filter((v) => v >= a0 && v < a0 + LANE);
  if (inside.length < 2 || inside[inside.length - 1] - inside[0] < 4) return null;
  const near = (c: number) => sideAt.has(c - 1) || sideAt.has(c) || sideAt.has(c + 1);
  let c = c0 + 2 + Math.floor(hash(bx, bz, plan.seed + 902) * (LANE - 4));
  for (let t = 0; t < LANE && near(c); t++) c = c0 + 2 + ((c - c0 - 1) % (LANE - 4));
  if (near(c)) return null;
  const out = new Set<number>();
  const put = (a: number, cc: number) => {
    const x = alongX ? a : cc;
    const z = alongX ? cc : a;
    if (!wet(plan, x, z) && !plan.megaAt.has(nkey(x, z))) out.add(nkey(x, z));
  };
  let lastKink = -9;
  for (let a = inside[0]; a <= inside[inside.length - 1]; a++) {
    put(a, c);
    const kink = hash(a, c, plan.seed + 903) < 0.62;
    if (kink && a - lastKink >= 2 && a > inside[0] && a < inside[inside.length - 1] && !crossAt.has(a)) {
      const nc = c + (hash(c, a, plan.seed + 904) < 0.5 ? -1 : 1);
      if (nc > c0 && nc < c0 + LANE - 1 && !near(nc)) {
        put(a, nc);
        c = nc;
        lastKink = a;
      }
    }
  }
  return out.size ? out : null;
}

// ---------------------------------------------------------------- neighbourhood places
// Every 6×6 cell of suburb gets one interesting place on a lot by a road (most cells): a
// school, a mosque or church, a little football pitch, a playground or a monument.
const FEATURE = 6;
const FEATURE_KINDS: TileKind[] = ["school", "worship", "pitch", "playground", "worship", "school", "pitch", "playground", "monument"];

function featureAt(plan: CityPlan, x: number, z: number): TileKind | null {
  const fx = Math.floor(x / FEATURE);
  const fz = Math.floor(z / FEATURE);
  const key = `${fx},${fz}`;
  let f = plan.features.get(key);
  if (f === undefined) {
    f = pickFeature(plan, fx, fz);
    plan.features.set(key, f);
  }
  return f && f.x === x && f.z === z ? f.kind : null;
}

function pickFeature(plan: CityPlan, fx: number, fz: number) {
  if (hash(fx, fz, plan.seed + 950) > 0.8) return null;
  let best: { x: number; z: number; score: number } | null = null;
  for (let dx = 0; dx < FEATURE; dx++) {
    for (let dz = 0; dz < FEATURE; dz++) {
      const x = fx * FEATURE + dx;
      const z = fz * FEATURE + dz;
      if (Math.hypot(x, z) < 6 || plan.xAt.has(x) || plan.zAt.has(z) || isRoad(plan, x, z)) continue;
      if (plan.megaAt.has(nkey(x, z)) || wet(plan, x, z) || onRail(plan, x, z)) continue;
      if (smoothNoise(x / 4 - 9, z / 4 + 4, plan.seed + 23) > 0.88) continue;
      if (densityAt(plan, x, z) > 0.24) continue;
      if (smoothNoise(x / 6 + 31, z / 6 - 17, plan.seed + 11) - plan.style.green > 0.7) continue;
      if (!(isRoad(plan, x + 1, z) || isRoad(plan, x - 1, z) || isRoad(plan, x, z + 1) || isRoad(plan, x, z - 1))) continue;
      const score = hash(x, z, plan.seed + 951);
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  if (!best) return null;
  const kind = FEATURE_KINDS[Math.floor(hash(fz, fx, plan.seed + 952) * FEATURE_KINDS.length) % FEATURE_KINDS.length];
  return { x: best.x, z: best.z, kind };
}

/** Is (x, z) one of the open squares either side of the station hall? */
function isForecourt(plan: CityPlan, x: number, z: number) {
  const r = plan.rail;
  if (!r || r.station === null) return false;
  const along = r.along === "z" ? z : x;
  const across = r.along === "z" ? x : z;
  return Math.abs(along - r.station) <= 2 && Math.abs(across - railRow(plan, along)) === 1;
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
/** What can stay under the railway viaduct (everything else makes way for paving). */
const UNDER_RAIL = new Set<TileKind>(["road", "bridge", "river", "lake", "park", "plaza", "trees", "pond"]);
/** What stays round the station (roads and water; the rest becomes its square). */
const UNDER_RAIL_KEEP = new Set<TileKind>(["road", "bridge", "river", "lake", "structure"]);

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

// (Stadiums and the other sports venues are placed on purpose, see placeVenues.)
const STRUCTURES_BY_ZONE: { min: number; chance: number; types: StructureType[] }[] = [
  { min: 0.56, chance: 0.12, types: ["twin", "hotel", "mall", "museum"] },
  { min: 0.24, chance: 0.14, types: ["mall", "market", "museum", "campus", "funfair", "hotel", "waterpark", "waterpark"] },
  { min: -9, chance: 0.1, types: ["funfair", "solar", "campus", "market", "airport", "port", "military", "airport", "power", "oilrig", "dam", "dam", "waterpark"] },
];

/**
 * The smaller sports venues: a basketball court, a boxing arena and a wrestling arena, each on
 * a 2×2 cell of plain lots near the middle of the city (so even small cities have them), nearest
 * first, not right next to each other, taking turns (by round). (The football stadium is one of
 * the big landmarks, see MEGAS.) Cities with no room left (rare) go without.
 */
function placeVenues(plan: CityPlan) {
  const cells: { ax: number; az: number; d: number }[] = [];
  for (let kx = plan.x0 - 3; kx <= plan.x0 + 2; kx++) {
    for (let kz = plan.z0 - 3; kz <= plan.z0 + 2; kz++) {
      const x0 = plan.xs[kx];
      const x1 = plan.xs[kx + 1];
      const z0 = plan.zs[kz];
      const z1 = plan.zs[kz + 1];
      if (x0 === undefined || x1 === undefined || z0 === undefined || z1 === undefined) continue;
      // Cells start at the street edge, two lots at a time (as in structureAt).
      for (let ax = x0 + 1; ax + 1 < x1; ax += 2) {
        for (let az = z0 + 1; az + 1 < z1; az += 2) {
          const d = Math.hypot(ax + 0.5, az + 0.5) + hash(ax, az, plan.seed + 610) * 2.5;
          if (d > 11) continue;
          const members = [[ax, az], [ax + 1, az], [ax, az + 1], [ax + 1, az + 1]];
          if (!members.every(([mx, mz]) => LOTS.includes(baseTile(plan, mx, mz).kind) && !onRail(plan, mx, mz))) continue;
          cells.push({ ax, az, d });
        }
      }
    }
  }
  cells.sort((a, b) => a.d - b.d);
  const rest: StructureType[] = ["court", "boxing", "wrestling"];
  rest.sort((a, b) => hash(a.length, a.charCodeAt(0), plan.seed + 611) - hash(b.length, b.charCodeAt(0), plan.seed + 611));
  const taken: { ax: number; az: number }[] = [];
  for (const type of rest) {
    const c = cells.find((c) => taken.every((o) => Math.abs(o.ax - c.ax) + Math.abs(o.az - c.az) >= 4));
    if (!c) break;
    taken.push(c);
    plan.venues.set(`${c.ax},${c.az}`, type);
  }
}

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
    let found: StructureInfo | null = null;
    const d = densityAt(plan, ax + 0.5, az + 0.5);
    const zone = STRUCTURES_BY_ZONE.find((zn) => d >= zn.min)!;
    const roll = hash(ax, az, plan.seed + 501);
    const members = [[ax, az], [ax + 1, az], [ax, az + 1], [ax + 1, az + 1]];
    const venue = plan.venues.get(key);
    if (venue) found = structureNamed(plan, venue, ax, az);
    else if (
      roll < zone.chance &&
      members.every(([mx, mz]) => LOTS.includes(baseTile(plan, mx, mz).kind) && !onRail(plan, mx, mz) && !isForecourt(plan, mx, mz))
    ) {
      let type = zone.types[Math.floor(hash(ax, az, plan.seed + 502) * zone.types.length)];
      // A dam needs water next to it (the river or a lake); otherwise it's a power station.
      if (type === "dam" && !nearWater(plan, ax, az)) type = "power";
      found = structureNamed(plan, type, ax, az);
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

type StructureInfo = { type: StructureType; name: string; inside?: string[]; around?: Partial<Record<LandmarkKey, string[]>> };

/**
 * A real local name for something, when the city has one: its own landmarks first (most of the
 * time), then the flavour's. Null now and then (or when there are none): the caller makes one up.
 */
function famous(plan: CityPlan, key: LandmarkKey, x: number, z: number, salt: number, chance = 0.85): Named | null {
  const { local, wide } = landmarkChoices(plan.city.flavor.id, plan.city.name, key);
  const roll = hash(x, z, plan.seed + salt);
  const k = hash(z, x, plan.seed + salt + 1);
  if (local.length && roll < chance) return local[Math.floor(k * local.length) % local.length];
  if (wide.length && roll < chance * 0.75 + (local.length ? 0 : 0.15)) return wide[Math.floor(k * wide.length) % wide.length];
  return null;
}

function structureNamed(plan: CityPlan, type: StructureType, ax: number, az: number): StructureInfo {
  const known = famous(plan, type, ax, az, 520, type === "solar" ? 0 : 0.8);
  if (known) {
    const info: StructureInfo = { type, name: nameOf(known) };
    if (typeof known !== "string") {
      info.inside = known.inside;
      info.around = known.around;
    }
    return info;
  }
  return { type, name: structureName(plan, type, ax, az) };
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
      return pick([`${city} Stadium`, `${street} Stadium`, `${city} City Stadium`], 6);
    case "court":
      return pick([`${city} Indoor Sports Hall`, `${street} Basketball Court`, `${city} Hoops Arena`], 16);
    case "boxing":
      return pick([`${city} Boxing Arena`, `${street} Boxing Club`, `${city} Fight Night Arena`], 17);
    case "wrestling":
      return pick([`${city} Wrestling Arena`, `${street} Wrestling Hall`, `${city} Grapple Dome`], 18);
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
    case "waterpark":
      return pick([`${city} Water Park`, `${street} Splash Park`, `${city} Aqua World`], 15);
    case "capitol":
      return pick([`${city} City Hall`, `${city} State House`, `The ${city} Capitol`, `${city} Parliament`], 19);
    case "megamall":
      return pick([`${city} Mega Mall`, `${street} Galleria`, `${city} Grand Mall`, `The ${city} Dome`], 20);
  }
}

/** The big building whose "around" names reach (x, z): a university's lagoon front, its gate... */
function aroundName(plan: CityPlan, key: LandmarkKey, x: number, z: number) {
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      const st = structureAt(plan, x + dx, z + dz);
      if (!st) continue;
      const info = plan.structures.get(`${st.ax},${st.az}`);
      const list = info?.around?.[key];
      if (list?.length) return list[Math.floor(hash(x, z, plan.seed + 530) * list.length) % list.length];
    }
  }
  return null;
}

/** A single-tile landmark's name (a stadium, a famous park, a club...), or undefined. */
function tileName(plan: CityPlan, t: Tile): string | undefined {
  const { x, z } = t;
  const roll = hash(x, z, plan.seed + 540);
  const any = (key: LandmarkKey, chance: number) => {
    const n = famous(plan, key, x, z, 541, chance);
    return n ? nameOf(n) : undefined;
  };
  switch (t.kind) {
    case "stadium":
      return any("stadium", 0.9) ?? any("arena", 0.9);
    case "ferris":
      return any("ferris", 0.95);
    case "hospital":
      return aroundName(plan, "hospital", x, z) ?? any("hospital", 0.9);
    case "police":
      return any("police", 0.9);
    case "fire":
      return any("fire", 0.9);
    case "clock":
      return roll < 0.7 ? any("clock", 1) : undefined;
    case "tower":
      return t.top > 4.6 && roll < 0.4 ? any("tower", 1) : undefined;
    case "park":
      return aroundName(plan, "park", x, z) ?? (roll < 0.14 ? any("park", 1) : undefined);
    case "plaza":
      return aroundName(plan, "plaza", x, z) ?? (roll < 0.3 ? any("plaza", 1) : undefined);
    case "pond":
      return aroundName(plan, "pond", x, z) ?? (roll < 0.4 ? any("pond", 1) : undefined);
    case "club":
      return aroundName(plan, "club", x, z) ?? any("club", 0.9) ?? CLUB_NAMES[Math.floor(roll * CLUB_NAMES.length) % CLUB_NAMES.length];
    case "restaurant":
      return aroundName(plan, "restaurant", x, z) ?? any("restaurant", 0.9) ?? RESTAURANT_NAMES[Math.floor(roll * RESTAURANT_NAMES.length) % RESTAURANT_NAMES.length];
  }
  return undefined;
}

/** A name for a club or restaurant floor inside a bigger building (stable for the tile). */
export function venueName(plan: CityPlan, kind: "club" | "restaurant", x: number, z: number) {
  const n = famous(plan, kind, x, z, 550, 0.9);
  if (n) return nameOf(n);
  const list = kind === "club" ? CLUB_NAMES : RESTAURANT_NAMES;
  return list[Math.floor(hash(x, z, plan.seed + 551) * list.length) % list.length];
}

/** The railway station's name. */
export function stationName(plan: CityPlan) {
  const r = plan.rail;
  const n = r ? famous(plan, "station", r.at, r.station ?? 0, 560, 0.9) : null;
  return n ? nameOf(n) : `${plan.city.name} Central Station`;
}

/** One easter egg per 9×9 block (most blocks), on a park, square or wood next to a road. */
function blockEgg(plan: CityPlan, x: number, z: number) {
  const B = 9;
  const bx = Math.floor((x + 4) / B);
  const bz = Math.floor((z + 4) / B);
  const key = `${bx},${bz}`;
  if (plan.eggs.has(key)) return plan.eggs.get(key)!;
  let best: { x: number; z: number; face: number; score: number } | null = null;
  const eggs = eggChoices(plan.city.flavor.id, plan.city.name);
  if (eggs.length && hash(bx, bz, plan.seed + 570) < 0.75) {
    for (let dx = 0; dx < B; dx++) {
      for (let dz = 0; dz < B; dz++) {
        const tx = bx * B - 4 + dx;
        const tz = bz * B - 4 + dz;
        const k = baseTile(plan, tx, tz).kind;
        if ((k !== "park" && k !== "plaza" && k !== "trees") || onRail(plan, tx, tz) || structureAt(plan, tx, tz)) continue;
        const b = blockBillboard(plan, tx, tz);
        if (b && b.x === tx && b.z === tz) continue;
        const faces = [isRoad(plan, tx + 1, tz), isRoad(plan, tx - 1, tz), isRoad(plan, tx, tz + 1), isRoad(plan, tx, tz - 1)];
        const face = faces.findIndex(Boolean);
        if (face < 0) continue;
        const score = hash(tx, tz, plan.seed + 571);
        if (!best || score > best.score) best = { x: tx, z: tz, face, score };
      }
    }
  }
  // Neighbouring blocks get different ones (the city's own first, then the rest in turn).
  const turn = mod(bx * 3 + bz * 5 + Math.floor(hash(plan.seed, 1, 572) * 97), eggs.length);
  const pick = best ? { x: best.x, z: best.z, face: best.face, egg: eggs[turn] } : null;
  plan.eggs.set(key, pick);
  return pick;
}

/** What stands on tile i (a player's house, if one was placed there). */
export function tileAt(plan: CityPlan, i: number): Tile {
  const t = lotAt(plan, i);
  const h = plan.homes?.get(i);
  return h ? homeTile(t, h) : t;
}

/** How tall each house style stands, and which of the city's house shapes it is built from. */
const HOME_SHAPE: Record<HouseStyle, { top: number; v: number }> = {
  cottage: { top: 0.76, v: 0 },
  bungalow: { top: 0.68, v: 0 },
  modern: { top: 0.42, v: 1 },
  duplex: { top: 0.94, v: 2 },
  villa: { top: 0.66, v: 1 },
};

function homeTile(t: Tile, h: TownHouse): Tile {
  const shape = HOME_SHAPE[h.style] ?? HOME_SHAPE.cottage;
  return {
    i: t.i,
    x: t.x,
    z: t.z,
    r: t.r,
    kind: "house",
    top: shape.top,
    v: shape.v,
    name: h.name,
    home: { slot: h.slot, name: h.name, owner: h.owner, ownerId: h.ownerId, style: h.style, wall: h.wall, roof: h.roof, interior: h.interior },
  };
}

/** What the city plan puts on tile i, before any player's house. */
export function lotAt(plan: CityPlan, i: number): Tile {
  const [x, z] = spiralXY(i);
  let t = baseTile(plan, x, z);
  t.i = i;
  if (onRail(plan, x, z)) {
    // Under the viaduct: roads, water and open ground carry on; buildings make way for a strip
    // of paving with the viaduct's legs.
    if (!UNDER_RAIL.has(t.kind)) t = { i, x, z, kind: "plaza", top: 0.6, r: t.r };
    t.rail = true;
    const along = plan.rail!.along === "z" ? z : x;
    if (plan.rail!.station !== null && Math.abs(along - plan.rail!.station) <= 2) t.station = true;
    t.top = Math.max(t.top, t.station ? 2 : 1.2);
  } else if (isForecourt(plan, x, z) && !UNDER_RAIL_KEEP.has(t.kind)) {
    // Either side of the station: an open square under the glass hall's roof.
    return { i, x, z, kind: "plaza", top: 1.9, r: t.r, forecourt: true };
  }
  if (!LOTS.includes(t.kind)) {
    const named = t.rail ? undefined : tileName(plan, t);
    if (named) t.name = named;
    return t;
  }
  const st = t.rail ? null : structureAt(plan, x, z);
  if (st) {
    const heights: Record<StructureType, number> = {
      mall: 1.2, twin: 7, museum: 1.8, funfair: 2.8, market: 0.7, arena: 1.1, campus: 1.6, hotel: 4.4, solar: 0.5, airport: 1.6, port: 1.8, military: 1.2,
      power: 3.4, dam: 0.9, oilrig: 2.8, waterpark: 1.3, court: 0.9, boxing: 1.35, wrestling: 1.35, capitol: 2.3, megamall: 1.2,
    };
    const info = plan.structures.get(`${st.ax},${st.az}`);
    const structure: NonNullable<Tile["structure"]> = { type: st.type, name: st.name, ax: st.ax, az: st.az, anchor: st.anchor };
    if (info?.inside) structure.inside = info.inside;
    const fallback = { ...t };
    const named = tileName(plan, fallback);
    if (named) fallback.name = named;
    return { ...t, kind: "structure", top: heights[st.type], structure, fallback };
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
  const named = tileName(plan, t);
  if (named) t.name = named;
  const egg = blockEgg(plan, x, z);
  if (egg && egg.x === x && egg.z === z) t.egg = { ...egg.egg, face: egg.face };
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
    if (t.kind === "bridge") {
      // Famous bridges: every bridge on a street shares its name.
      const k = onEW ? ew.k * 2 : ns.k * 2 + 1;
      const known = famous(plan, "bridge", k, 7, 580, 0.75);
      return known ? `${nameOf(known)} (${name})` : `${name} Bridge`;
    }
    return name;
  }
  // Lots take the number of the nearest street.
  const onX = ew.d <= ns.d;
  const street = onX ? streetName(plan, "x", ew.k) : streetName(plan, "z", ns.k);
  const along = onX ? t.x : t.z;
  const side = onX ? t.z > ew.at : t.x > ns.at;
  const number = Math.abs(along) * 2 + (side ? 1 : 2) + (along < 0 ? 40 : 0);
  const place = `${number} ${street}`;
  if (t.kind === "structure" && t.structure) return `${t.structure.name}, ${place}`;
  if (t.name) return `${t.name}, ${place}`;
  if (t.kind === "river") return `The river by ${place}`;
  if (t.kind === "lake") return `The lake by ${place}`;
  return place;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** How tall each big landmark stands (for markers above it). */
const MEGA_TOP: Partial<Record<StructureType, number>> = { arena: 1.1, capitol: 2.3, megamall: 1.2 };

/** A road tile: its direction, bends and junctions, roundabouts, road works. */
function roadTile(plan: CityPlan, x: number, z: number, r: Tile["r"]): Tile {
  const s = plan.seed;
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
  return { i: -1, x, z, kind: "road", top: works ? 0.45 : roundabout ? 0.3 : 0.05, road: dir, mask, roundabout, r, works: works || undefined, incident };
}

/** A wooden jetty on some lake and sea tiles right by the shore (facing the land). */
function jettyAt(plan: CityPlan, x: number, z: number) {
  if (hash(x, z, plan.seed + 960) > 0.14) return undefined;
  const sides: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const face = sides.findIndex(([dx, dz]) => !wet(plan, x + dx, z + dz) && !plan.megaAt.has(nkey(x + dx, z + dz)));
  return face >= 0 ? face : undefined;
}

function baseTile(plan: CityPlan, x: number, z: number): Tile {
  const i = -1;
  const s = plan.seed;
  const r: Tile["r"] = [hash(x, z, s), hash(x, z, s + 1), hash(x, z, s + 2), hash(x, z, s + 3)];

  // A big landmark: the stadium, the capitol, a mega mall.
  const mi = plan.megaAt.get(nkey(x, z));
  if (mi !== undefined) {
    const m = plan.megas[mi];
    const structure: NonNullable<Tile["structure"]> = { type: m.type, name: m.name, ax: m.ax, az: m.az, anchor: x === m.ax && z === m.az, w: m.w, d: m.d };
    if (m.inside) structure.inside = m.inside;
    return { i, x, z, kind: "structure", top: MEGA_TOP[m.type] ?? 1.5, r, structure };
  }
  // The sea (only very big towns get this far out).
  if (inSea(plan, x, z)) return { i, x, z, kind: "lake", top: 0.1, r, sea: true, jetty: jettyAt(plan, x, z) };

  const onLine = plan.xAt.has(x) || plan.zAt.has(z);
  const road = isRoad(plan, x, z);

  // The river: streets cross it on bridges, so every street stays connected.
  if (inRiver(plan, x, z)) {
    if (road) return { i, x, z, kind: "bridge", top: 0.35, road: plan.river!.along === "x" ? "z" : "x", mask: 0, r };
    return { i, x, z, kind: "river", top: 0.1, r };
  }

  // Big lakes: streets cross them on low causeways, so every street stays connected.
  if (inLake(plan, x, z)) {
    if (road) {
      const t = roadTile(plan, x, z, r);
      return { ...t, top: 0.05, roundabout: false, works: undefined, incident: undefined, causeway: true };
    }
    return { i, x, z, kind: "lake", top: 0.1, r, jetty: jettyAt(plan, x, z) };
  }

  if (road) return roadTile(plan, x, z, r);

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
    const h = (1.6 + density * 5.5 * (0.5 + r[1] * 0.9)) * plan.style.towers;
    // The heart of a big downtown now and then gets a supertall: setbacks, a crown and a spire.
    if (density > 0.92 && r[2] < 0.14) return { i, x, z, kind: "tower", top: Math.max(5, h * 1.5) + 1.4, r, v: 5 };
    const v = Math.floor(r[3] * 5);
    return { i, x, z, kind: "tower", top: Math.max(1.6, h) + (v === 3 ? 1.6 : 0.4), r, v };
  }
  if (density > 0.24) {
    if (r[0] < 0.06) return { i, x, z, kind: "plaza", top: 0.6, r };
    if (r[0] < 0.075) return { i, x, z, kind: "hospital", top: 1.7, r };
    if (r[0] < 0.09) return { i, x, z, kind: "clock", top: 2.6, r };
    if (r[0] < 0.11) return { i, x, z, kind: "crane", top: 3.2, r };
    if (r[0] < 0.122 && nextToRoad) return { i, x, z, kind: "police", top: 1.1, r };
    if (r[0] >= 0.122 && r[0] < 0.133 && nextToRoad) return { i, x, z, kind: "fire", top: 1.0, r };
    if (r[0] >= 0.133 && r[0] < 0.158 && nextToRoad) return { i, x, z, kind: "club", top: 0.85, r, v: Math.floor(r[2] * 2) };
    if (r[0] >= 0.158 && r[0] < 0.18 && nextToRoad) return { i, x, z, kind: "restaurant", top: 0.75, r, v: Math.floor(r[2] * 2) };
    if (r[0] > 0.988 && nextToRoad) return { i, x, z, kind: "fuel", top: 0.5, r };
    return { i, x, z, kind: "office", top: 0.9 + r[1] * 1.8 + density * 1.2, r, v: Math.floor(r[2] * 3) };
  }
  // The neighbourhood's own place (a school, a mosque or church, a pitch, a playground…).
  const feature = featureAt(plan, x, z);
  if (feature) {
    const tops: Partial<Record<TileKind, number>> = { school: 0.9, worship: 1.6, pitch: 0.3, playground: 0.5, monument: 1.4 };
    return { i, x, z, kind: feature, top: tops[feature] ?? 0.8, r, v: Math.floor(r[2] * 2) };
  }
  if (Math.hypot(x, z) > 13 && r[2] < 0.035) return { i, x, z, kind: "turbine", top: 3.2, r };
  if (r[3] > 0.997) return { i, x, z, kind: "ferris", top: 2.6, r };
  if (r[0] < 0.16) return { i, x, z, kind: "trees", top: 1, r };
  if (r[0] < 0.175) return { i, x, z, kind: "watertower", top: 2.2, r };
  if (r[0] < 0.182) return { i, x, z, kind: "mast", top: 4, r };
  if (r[0] > 0.99 && nextToRoad) return { i, x, z, kind: "fuel", top: 0.5, r };
  if (r[0] >= 0.182 && r[0] < 0.192 && nextToRoad) return { i, x, z, kind: "restaurant", top: 0.75, r, v: Math.floor(r[2] * 2) };
  const v = Math.floor(r[1] * 3);
  return { i, x, z, kind: "house", top: v === 2 ? 1.1 : 0.95, r, v };
}
