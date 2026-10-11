// Quick search for a first home: for each neighbourhood, the cheapest room, flat and house on
// sale near its middle, so a new player can see what their budget buys without tapping around.

import { spiralIndex, tileAt, type CityPlan } from "../city/layout.ts";
import type { BuildingKind } from "./buildings.ts";
import type { RegionMap } from "./compile.ts";
import { toTile } from "./geo.ts";
import { landNow, toMint, valueOf } from "./value.ts";

export type HomeKind = "room" | "flat" | "house";

export const HOME_KIND_LABEL: Record<HomeKind, string> = { room: "Room", flat: "Flat", house: "House" };

const KIND_OF: Partial<Record<BuildingKind, HomeKind>> = {
  rooming: "room",
  flats: "flat",
  apartments: "flat",
  mixed: "flat",
  bungalow: "house",
  duplex: "house",
  terrace: "house",
};

/** The cheapest home of one kind near a neighbourhood: where it stands and what it costs. */
export type HomeFind = { kind: HomeKind; mint: number; x: number; z: number };

export type AreaHomes = { area: string; x: number; z: number; homes: HomeFind[] };

/** How far around a neighbourhood's middle to look (tiles each way). */
const REACH = 4;

/** Every neighbourhood's cheapest room, flat and house, cheapest neighbourhood first. */
export function homesByArea(region: RegionMap, plan: CityPlan): AreaHomes[] {
  const prices = region.region.prices;
  const out: AreaHomes[] = [];
  const seen = new Set<string>();
  for (const a of region.region.areas) {
    if (seen.has(a.name)) continue;
    seen.add(a.name);
    const at = toTile(region.frame, { lat: a.at[0], lon: a.at[1] });
    const c = { x: Math.round(at.x), z: Math.round(at.z) };
    const best = new Map<HomeKind, HomeFind>();
    for (let dz = -REACH; dz <= REACH; dz++) {
      for (let dx = -REACH; dx <= REACH; dx++) {
        const x = c.x + dx;
        const z = c.z + dz;
        if (!region.inside(x, z)) continue;
        const t = tileAt(plan, spiralIndex(x, z));
        const b = t.building;
        if (!b || b.state !== "built" || t.home) continue;
        const kind = KIND_OF[b.kind];
        if (!kind) continue;
        const v = valueOf(b, landNow(region, x, z), prices);
        // Houses sell whole; rooms and flats one unit at a time.
        let cost = Infinity;
        b.units.forEach((u, k) => {
          if (u.use === "home") cost = Math.min(cost, v.units[k]);
        });
        if (!Number.isFinite(cost)) continue;
        const mint = toMint(cost, prices);
        const was = best.get(kind);
        if (!was || mint < was.mint) best.set(kind, { kind, mint, x, z });
      }
    }
    if (best.size) out.push({ area: a.name, x: c.x, z: c.z, homes: [...best.values()].sort((p, q) => p.mint - q.mint) });
  }
  return out.sort((p, q) => p.homes[0].mint - q.homes[0].mint);
}
