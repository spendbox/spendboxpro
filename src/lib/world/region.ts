// What a region of the real world is made of. Each region (Lagos first) is a folder of small data
// files under ./regions: its landmarks, districts and fixes are written by hand; its land, water
// and main roads are baked from OpenStreetMap by scripts/world/bake.mjs. Everything else (the
// side streets, the houses, the shops) is filled in by the city layout, the same way every time.
//
// Corrections go in the region's corrections.ts: each one changes only the tiles it covers, so a
// fix never moves anything else.

import type { StructureType, TileKind } from "@/lib/city/layout";
import type { BuildingKind } from "./buildings.ts";
import type { LatLon, LatLonBox } from "./geo.ts";

/** [latitude, longitude] pairs: the shape of a road or an area. */
export type Path = [number, number][];

/**
 * A map of the region's tiles baked from the map data: one string per row of tiles, north to
 * south, each row runs of a letter and a count ("L120W35L4S9"). A row that ends early carries on
 * with nothing (land, no road) to the end.
 *  - Water: L land, W lagoon or creek, S sea, X land over the region's border (not part of it).
 *  - Roads: N none; A motorway, B trunk, C primary, D secondary, E tertiary (lower case: on a bridge).
 */
export type BakedGrid = {
  /** The region's tile at the start of the first row. */
  x0: number;
  z0: number;
  rows: string[];
};

export type RoadKind = "motorway" | "trunk" | "primary" | "secondary" | "tertiary";

export type Road = {
  id: string;
  name: string;
  kind: RoadKind;
  /** Crosses water (Third Mainland Bridge, Carter Bridge...). */
  bridge?: boolean;
  /** Where bridges cross each other: which level (1 just above the ground, 2 above that...). */
  layer?: number;
  path: Path;
};

export type Landmark = {
  /** Stays the same for good: corrections and saved places refer to it. */
  id: string;
  name: string;
  /** Where its middle is. */
  at: LatLon;
  /** What gets built there: a big building type, or a single-tile place (a club, a hospital...). */
  type: StructureType | TileKind;
  /** Size in tiles (east–west, north–south); each building type has its own when left out. */
  w?: number;
  d?: number;
  /** Names for the rooms inside, in order. */
  inside?: string[];
  /** Placed from memory: the bake looks for it in the map data, and it moves there if found. */
  approx?: boolean;
  /** What it's called in the map data, when that differs (a pattern, ignoring case). */
  osm?: string;
};

/** A stretch of railway with its real curves (raised on a viaduct where `bridge`). */
export type Rail = { id: string; name: string; bridge?: boolean; path: Path };

/** A railway station: its name and where it is (it's built along the nearest railway). */
export type Station = { name: string; at: [number, number] };

/** A named neighbourhood, town or village: its middle, and how big a place it is. */
export type Area = { name: string; at: [number, number]; kind: "town" | "suburb" | "neighbourhood" | "village" };

/** A part of town with its own character: busy high-rises, quiet leafy streets, crowded markets. */
export type District = {
  id: string;
  name: string;
  at: LatLon;
  /** How far its character reaches (km). */
  radiusKm: number;
  /** How built-up its middle is: about 0.4 quiet suburb, 0.7 busy, 1.1+ skyscrapers. */
  density: number;
  /** What land costs in its middle, per m², in the region's currency (see Prices). */
  landPrice?: number;
};

/** Real prices for a region, in its own currency (see docs/PROPERTY.md, section 2). */
export type Prices = {
  /** The local currency ("NGN"), and how much of it one mint is worth. */
  currency: string;
  /** Shown before local amounts ("₦"). */
  symbol: string;
  perMint: number;
  /** Land per m² where no district says otherwise. */
  land: number;
  /** What land costs in the game against those real prices (0.1: a tenth). Left out: the same. */
  landScale?: number;
  /** What it costs to build, per m² of floor, by kind of building. */
  build: Record<BuildingKind, number>;
};

export type Correction =
  /** Paint an area as land or water (draw round it, points in order). */
  | { kind: "land" | "lagoon" | "sea"; note?: string; area: Path }
  /** Add a road, or a bridge over water. */
  | { kind: "road"; note?: string; road: Road }
  /** Take the baked main roads out of an area (side streets are still filled in). */
  | { kind: "no-road"; note?: string; area: Path }
  /** Change a landmark (by its id): move it, rename it, resize it. */
  | { kind: "landmark"; note?: string; id: string; set: Partial<Omit<Landmark, "id">> }
  /** Take a landmark out. */
  | { kind: "no-landmark"; note?: string; id: string }
  /** Add a named place the map data doesn't have (or doesn't have where it should be). */
  | { kind: "area"; note?: string; area: Area }
  /** Take a wrongly named place out (by its name). */
  | { kind: "no-area"; note?: string; name: string };

export type Region = {
  id: string;
  /** The name players see ("Lagos"). */
  name: string;
  /** The state or province it's in, as players see it ("Lagos State"). */
  state: string;
  /** What its open water is called, for naming the spot under the pointer. */
  waterNames?: { lagoon?: string; sea?: string };
  /** The street-name style (see FLAVORS in src/lib/city/places.ts). */
  flavor: string;
  /** Fixed for good, so the same city is built every time. */
  seed: number;
  /** The city's colours (see PALETTES in src/lib/city/layout.ts). */
  palette?: string;
  /**
   * Where its own flat map is centred. Fixed for good: every building's address (and so who owns
   * it) is counted from here, so the box can grow without anything moving.
   */
  origin: LatLon;
  /** The part of the world this region covers (it can grow; the origin stays). */
  box: LatLonBox;
  /**
   * Where the side streets' numbering starts (tiles west and north of the origin): fixed for good
   * once set, like the origin, so growing the box west or north adds streets without renumbering
   * the ones already there (which would reshuffle every street, building and estate in the city).
   */
  streetsFrom?: number;
  /**
   * Where the free starter rooms are (docs/STARTER_ROOMS.md): the busy city, so new players start
   * where things happen, not out at the far ends of the region. The whole box when left out.
   */
  starterBox?: LatLonBox;
  prices: Prices;
  /** Where the camera starts. */
  start: LatLon;
  landmarks: Landmark[];
  districts: District[];
  /** Null until the map data has been baked: the region is all land. */
  water: BakedGrid | null;
  /** The main roads, as baked from the map (null until baked). */
  roadGrid: BakedGrid | null;
  /**
   * Bridges and expressways with their real curves (Third Mainland Bridge...), for drawing them
   * smoothly. Their tiles are roads too.
   */
  roads: Road[];
  /** Footbridges over the roads, from the map: [latitude, longitude] of each one's middle. */
  footbridges: [number, number][];
  /** Railways and their stations, from the map. */
  rail: Rail[];
  stations: Station[];
  /**
   * Pedestrian crossings from the map: [latitude, longitude, type]: 0 zebra, 1 with its own
   * traffic lights, 2 marked (ladder), 3 with a refuge island.
   */
  crossings: [number, number, number][];
  /** Named neighbourhoods and towns from the map (Obalende, Ojuelegba...), for naming spots. */
  areas: Area[];
  /** Where the map data has each landmark (by id), found by the bake: used for landmarks marked approx. */
  found: Record<string, LatLon>;
  corrections: Correction[];
  /** How the bake reads the map data for this region (scripts/world/bake.mjs). */
  bake?: {
    /**
     * Lines across harbour mouths (from shore to shore): water inside them is lagoon, outside
     * them sea. Without them, all water joined to the open sea counts as sea.
     */
    seaGates?: Path[];
    /** The smallest roads baked in (default "secondary"); the layout fills in the rest. */
    roads?: RoadKind;
    /**
     * The region's own border (an OpenStreetMap boundary relation, by id): land in the box but
     * outside it is baked as beyond the region (nothing built, nothing to buy). Water stays water.
     */
    border?: number;
    /**
     * Part of the box already baked, kept exactly as it is when the box grows (`--grow`): only the
     * new land round it is baked, so nothing already there (or owned there) moves.
     */
    keep?: LatLonBox;
  };
};
