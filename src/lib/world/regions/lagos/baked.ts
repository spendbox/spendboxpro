// Made by scripts/world/bake.mjs from OpenStreetMap data (© OpenStreetMap contributors, ODbL).
// Don't edit by hand: put fixes in corrections.ts. Empty until the bake has been run.

import type { LatLon } from "../../geo.ts";
import type { BakedGrid, Road } from "../../region.ts";

export const WATER: BakedGrid | null = null;
export const ROAD_GRID: BakedGrid | null = null;
export const ROUTES: Road[] = [];
export const FOUND: Record<string, LatLon> = {};
