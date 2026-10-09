// Where players' houses stand in a game's town. Pure maths, the same for everyone: the database
// says which houses are in the game and in which order (their slots, see
// game-db/023_houses.sql); this picks a lot for each slot, walking out from the busy middle of
// town so houses stand in the populated districts, a little apart from each other, each on a
// plain lot facing a street (never on a road, water, the railway, a landmark or a big building).

import type { TownHouse } from "@/lib/houses";
import { hash, isRoad, lotAt, spiralXY, type CityPlan } from "./layout";

/** How far out we look for lots before giving up (houses beyond this simply aren't drawn). */
const MAX_SCAN = 120_000;
const LOT_KINDS = new Set(["house", "office", "park", "trees"]);

const cache = new Map<string, number[]>();

/**
 * Tile numbers for house slots 0..count-1 (fewer if the town hasn't enough lots).
 * Stable for the same city, size and count.
 */
export function houseTiles(plan: CityPlan, tileCount: number, count: number): number[] {
  if (count <= 0 || tileCount <= 0) return [];
  const key = `${plan.seed}|${tileCount}|${count}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out: number[] = [];
  const used = new Set<number>();
  const taken = new Set<string>();
  const limit = Math.min(tileCount, MAX_SCAN);
  // Three passes, each less picky, so every house finds a lot when the town is crowded:
  // 1. about half of the good lots (a stable roll), never side by side, so houses spread
  //    through the districts instead of filling every lot in the middle;
  // 2. any good lot, still never side by side;
  // 3. any good lot.
  for (let pass = 1; pass <= 3 && out.length < count; pass++) {
    // Skip the very middle (the main square and its first ring) so the town keeps its heart.
    for (let i = 9; i < limit && out.length < count; i++) {
      if (used.has(i)) continue;
      const [x, z] = spiralXY(i);
      if (pass === 1 && hash(x, z, plan.seed + 881) > 0.55) continue;
      if (pass < 3 && taken.has(`${x},${z}`)) continue;
      const t = lotAt(plan, i);
      if (!LOT_KINDS.has(t.kind) || t.rail || t.station || t.name || t.egg || t.works) continue;
      if (!(isRoad(plan, x + 1, z) || isRoad(plan, x - 1, z) || isRoad(plan, x, z + 1) || isRoad(plan, x, z - 1))) continue;
      out.push(i);
      used.add(i);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) taken.add(`${x + dx},${z + dz}`);
    }
  }
  // Slot order follows the walk outwards: pass 1's lots are the nearest the middle.
  if (cache.size > 20) cache.clear();
  cache.set(key, out);
  return out;
}

/** Puts this game's houses on the plan (tileAt then shows them). Returns tile → house. */
export function placeHouses(plan: CityPlan, tileCount: number, houses: TownHouse[] | null | undefined): Map<number, TownHouse> {
  const list = [...(houses ?? [])].sort((a, b) => a.slot - b.slot);
  const homes = new Map<number, TownHouse>();
  if (list.length) {
    const spots = houseTiles(plan, tileCount, list.length);
    list.forEach((h, k) => {
      if (k < spots.length) homes.set(spots[k], h);
    });
  }
  plan.homes = homes;
  return homes;
}

/** The tile of a player's house in this game, or null if it isn't standing. */
export function houseTileOf(plan: CityPlan, tileCount: number, houses: TownHouse[] | null | undefined, ownerId: string): number | null {
  const homes = placeHouses(plan, tileCount, houses);
  for (const [tile, h] of homes) if (h.ownerId === ownerId) return tile;
  return null;
}
