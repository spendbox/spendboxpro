// Turns a clue's tile into words people would use ("Allen Avenue", "the Ikeja City Mall"),
// with this round's street names. Liars pick a random spot the same way.

import { addressOf, makePlan, tileAt, type CityPlan } from "@/lib/city/layout";
import type { Rand } from "./rng";

let cached: { seed: number; plan: CityPlan } | null = null;

function planFor(roundId: number) {
  if (!cached || cached.seed !== roundId) cached = { seed: roundId, plan: makePlan(roundId) };
  return cached.plan;
}

/** "14 Adekunle Street" → "Adekunle Street"; "City Mall, 12 X Road" → "City Mall"; junctions stay as they are. */
export function areaName(roundId: number, tile: number): string {
  try {
    const plan = planFor(roundId);
    let s = addressOf(plan, tileAt(plan, tile)).split(",")[0].trim();
    s = s.replace(/^\d+\s+/, "").replace(/\bby \d+\s+/, "by ");
    if (/^The /.test(s)) s = `the ${s.slice(4)}`;
    return s || "the middle of town";
  } catch {
    return "the middle of town";
  }
}

/** Somewhere random in the city (a liar's favourite kind of place). */
export function fakeAreaName(roundId: number, rand: Rand): string {
  // The first 400 tiles are always on the map.
  return areaName(roundId, Math.floor(rand() * 400));
}
