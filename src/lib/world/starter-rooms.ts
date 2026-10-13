// Free starter rooms (docs/STARTER_ROOMS.md): every room in the city's rooming houses
// ("face-me-I-face-you"), cheapest areas first, worked out once per server from the map.

import { spiralIndex, tileAt, type CityPlan } from "../city/layout.ts";
import type { Building } from "./buildings.ts";
import type { RegionMap } from "./compile.ts";
import { landNow, valueOf } from "./value.ts";

export type StarterBuilding = { building: Building; x: number; z: number; area: string; rooms: number[]; price: number };

const cache = new Map<string, StarterBuilding[]>();

/** Every built rooming house in the region with its home rooms, the cheaper half (by a room's value). */
export function starterBuildings(region: RegionMap, plan: CityPlan): StarterBuilding[] {
  const hit = cache.get(region.region.id);
  if (hit) return hit;
  const { x0, x1, z0, z1 } = region.bounds;
  const prices = region.region.prices;
  const all: StarterBuilding[] = [];
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      if (!region.inside(x, z)) continue;
      const t = tileAt(plan, spiralIndex(x, z));
      const b = t.building;
      if (!b || b.kind !== "rooming" || b.state !== "built" || t.home) continue;
      const rooms = b.units.flatMap((u, k) => (u.use === "home" ? [k] : []));
      if (!rooms.length) continue;
      const v = valueOf(b, landNow(region, x, z), prices);
      all.push({ building: b, x, z, area: region.areaAt(x, z), rooms, price: v.units[rooms[0]] ?? 0 });
    }
  all.sort((a, b) => a.price - b.price);
  const cheap = all.slice(0, Math.max(1, Math.ceil(all.length / 2)));
  cache.set(region.region.id, cheap);
  return cheap;
}

/** A shuffled copy (so new players spread across the city). */
export function shuffled<T>(list: T[], rnd = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
