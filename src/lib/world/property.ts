// Everything a player sees about a property when they tap it: what it is, where, what it's worth
// (land and building), and each unit in it with its value and how it can earn
// (docs/PROPERTY.md, sections 2 and 3).

import { BUILDING_LABEL, type Building, type UnitUse } from "./buildings.ts";
import type { RegionMap } from "./compile.ts";
import { landNow, shortLocal, toMint, valueOf, worthTrend } from "./value.ts";
import type { Workplace } from "./workplace.ts";

export type PropertyUnit = { id: string; label: string; use: UnitUse; floor: number; area: number; mint: number; local: string; earns: string };

export type PropertyInfo = {
  id: string;
  /** Its owner's name for it, or what it is ("Block of flats"). */
  title: string;
  /** What it is, when it has its own name. */
  kind: string | null;
  /** "Unfinished", "Building site" or null when it's finished. */
  state: string | null;
  address: string;
  area: string;
  estate: string | null;
  storeys: number;
  plot: number;
  mint: number;
  local: string;
  landMint: number;
  buildingMint: number;
  units: PropertyUnit[];
  /** How its worth moved over the last game month (+0.024 = up 2.4%), and its worth (mint) at each of the last 6 game months. */
  trend: { month: number; history: number[] };
  /** Who works here (shops, offices, warehouses, building sites), when anyone does. */
  workplace?: Workplace | null;
};

/** How a unit of this use can earn (as real estate does). */
const EARNS: Record<UnitUse, string> = {
  home: "Live in it, or let it out for rent each game month",
  shop: "Let it to a business for rent each game day",
  office: "Let it to a business for rent each game day",
  industry: "Let it to a business for rent each game day",
  land: "Earns nothing, grows in value; build on it to make it earn",
};

export function propertyInfo(b: Building, x: number, z: number, address: string, region: RegionMap): PropertyInfo {
  const prices = region.region.prices;
  const v = valueOf(b, landNow(region, x, z), prices);
  const trend = worthTrend(b, region, x, z, prices);
  return {
    id: b.id,
    title: b.name ?? BUILDING_LABEL[b.kind],
    kind: b.name ? BUILDING_LABEL[b.kind] : null,
    state: b.state === "uncompleted" ? "Unfinished" : b.state === "site" ? "Building site" : null,
    address,
    area: region.areaAt(x, z),
    estate: b.estate?.name ?? null,
    storeys: b.storeys,
    plot: b.plot,
    mint: toMint(v.total, prices),
    local: shortLocal(v.total, prices),
    landMint: toMint(v.land, prices),
    buildingMint: toMint(v.building, prices),
    trend: { month: trend.month, history: trend.history.map((h) => toMint(h, prices)) },
    units: b.units.map((u, k) => ({
      id: u.id,
      label: u.label,
      use: u.use,
      floor: u.floor,
      area: u.area,
      mint: toMint(v.units[k], prices),
      local: shortLocal(v.units[k], prices),
      earns: EARNS[u.use],
    })),
  };
}
