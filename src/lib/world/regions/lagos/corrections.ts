// Fixes to Lagos, on top of the baked map data and the landmark list. Each fix changes only the
// tiles it covers, so nothing else in the city moves. Add new ones at the end with a short note.
//
//   { kind: "land", note: "...", area: [[lat, lon], [lat, lon], ...] }     make an area land
//   { kind: "lagoon" | "sea", note: "...", area: [...] }                    make an area water
//   { kind: "road", note: "...", road: { id, name, kind, bridge?, path } } add a road or bridge
//   { kind: "no-road", note: "...", area: [...] }                          take the main roads out of an area
//   { kind: "landmark", note: "...", id: "...", set: { at: { lat, lon } } } move/rename/resize
//   { kind: "no-landmark", note: "...", id: "..." }                        take a landmark out
//
// Coordinates can be copied from any map app (latitude first).

import type { Correction } from "../../region.ts";

export const CORRECTIONS: Correction[] = [
  {
    kind: "landmark",
    note: "Its real spot (6.4500, 3.3964) is ~120 m from Freedom Park and City Hall: just west of them (~180 m) so all three fit.",
    id: "holy-cross-cathedral",
    set: { at: { lat: 6.45015, lon: 3.39481 }, approx: false },
  },
  {
    kind: "no-landmark",
    note: "The map has it at 6.6229, 3.3569, just north of the area Lagos covers for now. Take this out when the area grows north.",
    id: "new-afrika-shrine",
  },
];
