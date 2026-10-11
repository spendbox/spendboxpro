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

export const CORRECTIONS: Correction[] = [];
