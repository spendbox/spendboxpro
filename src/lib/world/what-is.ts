// What stands at a place on a real map ("b:<tile>"), worked out on the server from the map itself,
// never from what the phone says: a big building's type ("megamall", "hotel"...) or the tile's
// kind ("club", "restaurant"...). The city's plan is made once per region per server.

import { makePlan, spiralIndex, spiralXY, tileAt, type CityPlan } from "@/lib/city/layout";
import { regionMap } from "@/lib/world";

const plans = new Map<string, CityPlan>();

export function whatIsAt(region: string, place: string): string | null {
  const map = regionMap(region);
  const m = /^b:(\d{1,7})$/.exec(place);
  if (!map || !m) return null;
  let plan = plans.get(region);
  if (!plan) {
    plan = makePlan(map.region.seed, map);
    plans.set(region, plan);
  }
  const [x, z] = spiralXY(Number(m[1]));
  if (!map.inside(x, z)) return null;
  const t = tileAt(plan, spiralIndex(x, z));
  return t.kind === "structure" && t.structure ? t.structure.type : t.kind;
}

/** Places with a club that charges at the door: a club, and a mega mall's club floor. */
export const CLUB_PLACES = new Set(["club", "megamall"]);
