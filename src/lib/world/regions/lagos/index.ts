// Lagos: Ikeja down to the coast, Festac across to Ajah (about 45 × 25 km, 450 × 250 tiles).
// Later more of Lagos State (Badagry, Ikorodu, Epe) joins on by making the box bigger.

import type { Region } from "../../region.ts";
import { FOUND, ROAD_GRID, ROUTES, WATER } from "./baked.ts";
import { CORRECTIONS } from "./corrections.ts";
import { DISTRICTS } from "./districts.ts";
import { LANDMARKS } from "./landmarks.ts";

export const LAGOS: Region = {
  id: "lagos",
  name: "Lagos",
  flavor: "ng",
  seed: 6453339,
  palette: "coastal",
  box: { south: 6.392, west: 3.2, north: 6.617, east: 3.605 },
  start: { lat: 6.4535, lon: 3.3925 },
  landmarks: LANDMARKS,
  districts: DISTRICTS,
  water: WATER,
  roadGrid: ROAD_GRID,
  roads: ROUTES,
  found: FOUND,
  corrections: CORRECTIONS,
  bake: {
    // The Commodore Channel, the harbour mouth between the moles: the lagoon side of it is lagoon.
    // (Checked against the map after baking: see the preview the bake prints.)
    seaGates: [[[6.4195, 3.3700], [6.4195, 3.4200]]],
    roads: "secondary",
  },
};
