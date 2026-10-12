// Inside a planned home (docs/HOME_PLANNER.md): the home's plan built at full size, one floor at
// a time, with the same room builder (and furniture, lights and decorations) as every other place
// in the game (src/app/play/city/interiors.ts). The stairs take you up or down a floor.

import { createInterior, type Interior } from "../city/interiors";
import type { HomePlan } from "@/lib/home-plan";

export type HomeInterior = Interior & {
  /** Which floor of the plan this is, and how many there are. */
  level: number;
  floors: number;
};

export function createHomeInterior(plan: HomePlan, level: number, key = "home"): HomeInterior {
  const lv = Math.max(0, Math.min(plan.floors.length - 1, level));
  const room = createInterior({ theme: "living", key: `${key}|plan`, floor: lv, name: "", city: "", places: [], home: { plan, level: lv } });
  return { ...room, level: lv, floors: plan.floors.length };
}
