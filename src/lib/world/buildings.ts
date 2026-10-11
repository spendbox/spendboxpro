// What every building on the real map is: its kind, storeys, state and the units it's split
// into (flats, rooms, shops, offices, a whole house, a plot of land), all worked out from where it
// stands, the same way every time. Nothing here is stored: only a change an owner makes (a
// renovation, a rebuild) will be, on top of this. See docs/PROPERTY.md.
//
// A tile shows one property standing on its plot; plot and floor sizes follow real ones (a
// standard Lagos plot is 648 m², 60 × 120 ft), so values are realistic even though the map
// draws one building per 100 m tile.

import type { Tile } from "../city/layout.ts";
import { hash } from "../city/noise.ts";

export type BuildingKind =
  // Homes
  | "bungalow"
  | "duplex"
  /** A "face-me-I-face-you": a row of single rooms off a corridor, shared kitchen and bathroom. */
  | "rooming"
  /** A block of flats, two to four storeys, water tanks on the roof. */
  | "flats"
  /** A row of terraced houses (an estate's). */
  | "terrace"
  /** An apartment tower. */
  | "apartments"
  // Business
  /** A row of lock-up shops. */
  | "shops"
  /** A shopping plaza: shops below, offices above. */
  | "plaza"
  /** Shops on the ground floor, flats above. */
  | "mixed"
  | "offices"
  /** A glass office tower. */
  | "glass"
  | "warehouse"
  // Open plots
  /** An empty plot behind a wall ("This land is not for sale"). */
  | "land"
  | "farm";

/** Built, left unfinished (rods sticking out of the roof), or a building site. */
export type BuildingState = "built" | "uncompleted" | "site";

/** What a unit is used for: how it can earn (see docs/PROPERTY.md, section 3). */
export type UnitUse = "home" | "shop" | "office" | "industry" | "land";

export type Unit = {
  /** Stays the same for good: "<building id>/<n>". */
  id: string;
  label: string;
  use: UnitUse;
  /** 0 is the ground floor. */
  floor: number;
  /** Floor area in m² (for land: the plot). */
  area: number;
};

export type Building = {
  /** Stays the same for good: "<region>:<x>,<z>" (the tile it stands on). */
  id: string;
  kind: BuildingKind;
  state: BuildingState;
  storeys: number;
  /** The plot it stands on (m²). */
  plot: number;
  units: Unit[];
  /** Shape choices for drawing it (0..1, stable): colours, footprint, roof, extras. */
  look: [number, number, number, number, number];
  /** Which way its front (gate, door, shopfronts) faces: 0 +z, 1 +x, 2 -z, 3 -x. */
  face: 0 | 1 | 2 | 3;
  /** Its owner's name for it ("Ada's Place"), if they've given it one (see ./owned). */
  name?: string;
  /** Part of a gated estate: its name, and which sides of this lot carry the estate's wall. */
  estate?: { id: string; name: string; walls: [boolean, boolean, boolean, boolean]; gate: boolean };
};

/** A gated estate: a whole block of matching houses inside one wall (decided per block). */
export type EstatePlan = { id: string; name: string; kind: BuildingKind; look: [number, number, number, number, number]; walls: [boolean, boolean, boolean, boolean]; gate: boolean };

export const BUILDING_LABEL: Record<BuildingKind, string> = {
  bungalow: "Bungalow",
  duplex: "Duplex",
  rooming: "Rooming house",
  flats: "Block of flats",
  terrace: "Terraced houses",
  apartments: "Apartment tower",
  shops: "Lock-up shops",
  plaza: "Shopping plaza",
  mixed: "Shops and flats",
  offices: "Office block",
  glass: "Office tower",
  warehouse: "Warehouse",
  land: "Plot of land",
  farm: "Farmland",
};

/** Which kinds can stand on each kind of lot, and how often (weights). */
type Mix = Partial<Record<BuildingKind, number>>;
const QUIET: Mix = { bungalow: 26, duplex: 16, rooming: 20, flats: 14, terrace: 6, shops: 6, land: 8, mixed: 4 };
const BUSY: Mix = { flats: 24, mixed: 22, shops: 12, plaza: 14, offices: 12, warehouse: 4, rooming: 6, duplex: 6 };
const CENTRAL: Mix = { glass: 46, apartments: 38, plaza: 8, offices: 8 };
/** Out at the edges, where the city thins out. */
const EDGE: Mix = { bungalow: 26, land: 26, farm: 6, rooming: 16, duplex: 8, shops: 6, flats: 6 };

/** How often a building is left unfinished, or is a building site, by kind of lot. */
const UNFINISHED = { quiet: 0.09, busy: 0.07, central: 0.06, edge: 0.12 };
const SITE = 0.025;

/**
 * The mix shifted by how wealthy the area is (0 poorest, 1 richest, from its land price): rich
 * streets have duplexes, terraces and apartments and no rooming houses; poor ones more rooming
 * houses and bungalows.
 */
function shifted(mix: Mix, wealth: number): Mix {
  const f: Partial<Record<BuildingKind, number>> = {
    rooming: Math.max(0, 1 - wealth) ** 2 * 2.2,
    bungalow: 1.3 - wealth * 0.7,
    duplex: 0.4 + wealth * 1.8,
    terrace: 0.3 + wealth * 2.4,
    flats: 0.8 + wealth * 0.5,
    apartments: 0.5 + wealth,
    plaza: 0.6 + wealth * 0.8,
    offices: 0.5 + wealth,
    shops: 1.2 - wealth * 0.6,
    land: 1.1 - wealth * 0.5,
  };
  const out: Mix = {};
  for (const [k, w] of Object.entries(mix) as [BuildingKind, number][]) out[k] = w * (f[k] ?? 1);
  return out;
}

/** How wealthy a spot is (0..1) from what its land costs (per m²): about 30,000 → 0, 1,200,000 → 1. */
export function wealthOf(landPerM2: number) {
  return Math.max(0, Math.min(1, Math.log10(Math.max(1, landPerM2) / 30_000) / Math.log10(40)));
}

function pickFrom(mix: Mix, roll: number): BuildingKind {
  const entries = Object.entries(mix) as [BuildingKind, number][];
  let left = roll * entries.reduce((t, [, w]) => t + w, 0);
  for (const [k, w] of entries) if ((left -= w) < 0) return k;
  return entries[entries.length - 1][0];
}

/** Storeys for a kind (rough real ranges), from a 0..1 roll. */
function storeysFor(kind: BuildingKind, roll: number, density: number): number {
  const between = (lo: number, hi: number) => lo + Math.floor(roll * (hi - lo + 1));
  switch (kind) {
    case "bungalow":
    case "rooming":
    case "shops":
    case "warehouse":
      return 1;
    case "duplex":
    case "terrace":
      return 2;
    case "flats":
      return between(2, 4);
    case "mixed":
      return between(2, 4);
    case "plaza":
      return between(2, 3);
    case "offices":
      return between(3, 7);
    case "apartments":
      return Math.round(between(8, 14) * (0.8 + Math.min(1, density) * 0.5));
    case "glass":
      return Math.round(between(10, 24) * (0.8 + Math.min(1, density) * 0.5));
    default:
      return 0;
  }
}

/** The plot (m²), by kind, from a roll. */
function plotFor(kind: BuildingKind, roll: number): number {
  const plots = (n: number) => Math.round(648 * n);
  switch (kind) {
    case "land":
      return plots(1 + Math.floor(roll * 3));
    case "farm":
      return 10_000;
    case "flats":
    case "mixed":
    case "terrace":
      return plots(1 + Math.floor(roll * 2));
    case "plaza":
    case "offices":
      return plots(2 + Math.floor(roll * 2));
    case "apartments":
    case "glass":
      return plots(3 + Math.floor(roll * 3));
    case "warehouse":
      return plots(4 + Math.floor(roll * 3));
    default:
      return plots(1);
  }
}

/** The units a building is split into. */
function unitsFor(id: string, kind: BuildingKind, storeys: number, plot: number, roll: number): Unit[] {
  const out: Unit[] = [];
  const add = (label: string, use: UnitUse, floor: number, area: number) => out.push({ id: `${id}/${out.length}`, label, use, floor, area: Math.round(area) });
  const floorName = (f: number) => (f === 0 ? "ground floor" : `floor ${f}`);
  switch (kind) {
    case "bungalow":
      add("The whole bungalow", "home", 0, 140 + roll * 110);
      break;
    case "duplex":
      add("The whole duplex", "home", 0, 300 + roll * 180);
      break;
    case "rooming": {
      const rooms = 8 + Math.floor(roll * 5);
      for (let k = 0; k < rooms; k++) add(`Room ${k + 1}`, "home", 0, 12 + roll * 4);
      break;
    }
    case "terrace": {
      const houses = 3 + Math.floor(roll * 3);
      for (let k = 0; k < houses; k++) add(`House ${k + 1}`, "home", 0, 200 + roll * 60);
      break;
    }
    case "flats":
      for (let f = 0; f < storeys; f++) for (const side of ["left", "right"]) add(`Flat, ${floorName(f)}, ${side}`, "home", f, 95 + roll * 50);
      break;
    case "apartments": {
      const per = 4;
      for (let f = 1; f < storeys; f++) for (let k = 0; k < per; k++) add(`Apartment ${f}${String.fromCharCode(65 + k)}`, "home", f, 120 + roll * 130);
      add("Lobby shop", "shop", 0, 60);
      break;
    }
    case "shops": {
      const n = 4 + Math.floor(roll * 5);
      for (let k = 0; k < n; k++) add(`Shop ${k + 1}`, "shop", 0, 18 + roll * 22);
      break;
    }
    case "plaza":
      for (let k = 0; k < 8; k++) add(`Shop ${k + 1}, ground floor`, "shop", 0, 25 + roll * 20);
      for (let f = 1; f < storeys; f++) for (let k = 0; k < 4; k++) add(`Office ${f}${String.fromCharCode(65 + k)}`, "office", f, 50 + roll * 40);
      break;
    case "mixed":
      for (let k = 0; k < 3; k++) add(`Shop ${k + 1}, ground floor`, "shop", 0, 25 + roll * 15);
      for (let f = 1; f < storeys; f++) for (const side of ["left", "right"]) add(`Flat, ${floorName(f)}, ${side}`, "home", f, 90 + roll * 40);
      break;
    case "offices":
      for (let f = 0; f < storeys; f++) for (const side of ["east", "west"]) add(`Office suite, ${floorName(f)}, ${side}`, "office", f, 180 + roll * 120);
      break;
    case "glass":
      add("Ground floor shops", "shop", 0, 400);
      for (let f = 1; f < storeys; f++) add(`Office floor ${f}`, "office", f, 800 + roll * 700);
      break;
    case "warehouse":
      add("The whole warehouse", "industry", 0, plot * 0.6);
      break;
    case "land":
      add("The whole plot", "land", 0, plot);
      break;
    case "farm":
      add("The whole farm", "land", 0, plot);
      break;
  }
  return out;
}

/** The kinds of lot the city layout makes that hold a property. */
const LOTS = new Set<Tile["kind"]>(["house", "office", "tower"]);

/**
 * The building on a tile of a real place, or null when the tile isn't a property (a road, a
 * park, a landmark, a school...). `density` is how built-up the spot is (the layout's); `wealth`
 * how well-off the area is (see wealthOf).
 */
export function buildingFor(
  regionId: string,
  t: Tile,
  density: number,
  seed: number,
  wealth = 0.5,
  where: { face?: 0 | 1 | 2 | 3; estate?: EstatePlan | null } = {},
): Building | null {
  if (!LOTS.has(t.kind) || t.home) return null;
  const id = `${regionId}:${t.x},${t.z}`;
  const h = (k: number) => hash(t.x, t.z, seed + 7700 + k);
  const zone = t.kind === "tower" ? "central" : t.kind === "office" ? "busy" : density < 0.04 ? "edge" : "quiet";
  const mix = zone === "central" ? CENTRAL : zone === "busy" ? BUSY : zone === "edge" ? EDGE : QUIET;
  const estate = zone === "quiet" ? where.estate : null;
  const kind = estate ? estate.kind : pickFrom(shifted(mix, wealth), h(1));
  const open = kind === "land" || kind === "farm";
  const roll = h(2);
  const r3 = h(3);
  const state: BuildingState = open ? "built" : r3 < SITE ? "site" : r3 < SITE + UNFINISHED[zone] ? "uncompleted" : "built";
  const storeys = storeysFor(kind, roll, density);
  const plot = plotFor(kind, h(4));
  const look: Building["look"] = estate ? estate.look : [h(5), h(6), h(7), h(8), h(9)];
  const b: Building = { id, kind, state: estate ? "built" : state, storeys, plot, units: unitsFor(id, kind, storeys, plot, roll), look, face: where.face ?? 0 };
  if (estate) b.estate = { id: estate.id, name: estate.name, walls: estate.walls, gate: estate.gate };
  return b;
}

/** The kinds a gated estate is built of. */
export const ESTATE_KINDS: BuildingKind[] = ["duplex", "terrace", "bungalow", "duplex", "terrace"];

/** How tall a building stands (city units), for the layout's `top`. */
export const STOREY = 0.3;
export function buildingTop(b: Building) {
  if (b.kind === "land" || b.kind === "farm") return 0.25;
  const built = b.state === "built" ? b.storeys : b.state === "uncompleted" ? Math.max(1, Math.ceil(b.storeys * 0.6)) : 1;
  return 0.08 + built * STOREY + (b.kind === "bungalow" || b.kind === "duplex" || b.kind === "terrace" || b.kind === "rooming" ? 0.25 : 0.1);
}
