// Lagos: all of Lagos State, from Seme on the Benin border across to Epe and the far end of the
// Lekki peninsula, and from Agege and Ikorodu down to the coast (about 183 × 38 km, 1,831 × 378
// tiles). It began as Ikeja to the coast, Festac to Ajah (45 × 25 km): that part is kept exactly
// as it was baked (bake.keep), and the rest of the state was baked round it. Land in the box but
// over the state's border (Ogun State, Benin) isn't part of it.

import type { Region } from "../../region.ts";
import { AREAS, CROSSINGS, FOOTBRIDGES, FOUND, RAIL, ROAD_GRID, ROUTES, STATIONS, WATER } from "./baked.ts";
import { CORRECTIONS } from "./corrections.ts";
import { DISTRICTS } from "./districts.ts";
import { LANDMARKS } from "./landmarks.ts";
import { PRICES } from "./prices.ts";

export const LAGOS: Region = {
  id: "lagos",
  name: "Lagos",
  state: "Lagos State",
  waterNames: { lagoon: "Lagos Lagoon", sea: "Atlantic Ocean" },
  flavor: "ng",
  seed: 6453339,
  palette: "coastal",
  // The middle of the first box (Ikeja to the coast, Festac to Ajah). Never change it: every
  // building's address is counted from here.
  origin: { lat: 6.5045, lon: 3.4025 },
  box: { south: 6.362, west: 2.7, north: 6.7, east: 4.355 },
  // Where the first box's side streets were numbered from. Never change it (see Region).
  streetsFrom: -228,
  // Free starter rooms: in the city (Ikeja to the coast, Festac to Ajah), not out in Badagry or Epe.
  starterBox: { south: 6.392, west: 3.2, north: 6.617, east: 3.605 },
  prices: PRICES,
  start: { lat: 6.4535, lon: 3.3925 },
  landmarks: LANDMARKS,
  districts: DISTRICTS,
  water: WATER,
  roadGrid: ROAD_GRID,
  roads: ROUTES,
  areas: AREAS,
  footbridges: FOOTBRIDGES,
  rail: RAIL,
  stations: STATIONS,
  crossings: CROSSINGS,
  found: FOUND,
  corrections: CORRECTIONS,
  bake: {
    // The Commodore Channel, the harbour mouth between the moles: the lagoon side of it is lagoon.
    // (Checked against the map after baking: see the preview the bake prints.)
    seaGates: [[[6.4195, 3.3700], [6.4195, 3.4200]]],
    roads: "secondary",
    // Lagos State in OpenStreetMap.
    border: 3718182,
    // The first box, baked on 2026-10-11 (with property on it): kept as it is.
    keep: { south: 6.392, west: 3.2, north: 6.617, east: 3.605 },
  },
};
