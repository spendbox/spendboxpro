// What a region of the real world is made of. Each region (Lagos first) is a folder of small data
// files under ./regions: its landmarks, districts and fixes are written by hand; its land, water
// and main roads are baked from OpenStreetMap by scripts/world/bake.mjs. Everything else (the
// side streets, the houses, the shops) is filled in by the city layout, the same way every time.
//
// Corrections go in the region's corrections.ts: each one changes only the tiles it covers, so a
// fix never moves anything else.

import type { StructureType, TileKind } from "@/lib/city/layout";
import type { LatLon, LatLonBox } from "./geo.ts";

/** [latitude, longitude] pairs: the shape of a road or an area. */
export type Path = [number, number][];

/**
 * A map of the region's tiles baked from the map data: one string per row of tiles, north to
 * south, each row runs of a letter and a count ("L120W35L4S9"). A row that ends early carries on
 * with nothing (land, no road) to the end.
 *  - Water: L land, W lagoon or creek, S sea.
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

/** A part of town with its own character: busy high-rises, quiet leafy streets, crowded markets. */
export type District = {
  id: string;
  name: string;
  at: LatLon;
  /** How far its character reaches (km). */
  radiusKm: number;
  /** How built-up its middle is: about 0.4 quiet suburb, 0.7 busy, 1.1+ skyscrapers. */
  density: number;
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
  | { kind: "no-landmark"; note?: string; id: string };

export type Region = {
  id: string;
  /** The name players see ("Lagos"). */
  name: string;
  /** The street-name style (see FLAVORS in src/lib/city/places.ts). */
  flavor: string;
  /** Fixed for good, so the same city is built every time. */
  seed: number;
  /** The city's colours (see PALETTES in src/lib/city/layout.ts). */
  palette?: string;
  /** The part of the world this region covers. */
  box: LatLonBox;
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
  };
};
