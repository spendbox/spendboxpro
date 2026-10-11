// Where the jobs are on a real map: every business building and landmark with its jobs. Used by
// the server to check a job is really there (and what it pays) and by the screens to list work
// near your home.

import { addressOf, spiralIndex, tileAt, type CityPlan, type Tile } from "../city/layout.ts";
import { BUILDING_LABEL } from "./buildings.ts";
import { jobsAtPlace, jobsInBuilding, type WorkJob } from "./work.ts";

export type Workplace = {
  /** "<region>:<x>,<z>": the building's id, or a landmark's corner tile. */
  id: string;
  name: string;
  /** Where it stands (a landmark's corner tile). */
  x: number;
  z: number;
  jobs: WorkJob[];
};

/** The workplace a tile belongs to, if anyone works there. */
export function workplaceOfTile(plan: CityPlan, t: Tile): Workplace | null {
  const region = plan.region?.region.id;
  if (!region) return null;
  if (t.kind === "structure" && t.structure) {
    const jobs = jobsAtPlace(t.structure.type);
    const { ax, az } = t.structure;
    return jobs.length ? { id: `${region}:${ax},${az}`, name: t.structure.name, x: ax, z: az, jobs } : null;
  }
  if (t.building) {
    const jobs = jobsInBuilding(t.building);
    if (!jobs.length) return null;
    const what = t.building.state === "site" ? "Building site" : (t.building.name ?? BUILDING_LABEL[t.building.kind]);
    return { id: t.building.id, name: `${what}, ${addressOf(plan, t)}`, x: t.x, z: t.z, jobs };
  }
  if (t.name) {
    const jobs = jobsAtPlace(t.kind);
    return jobs.length ? { id: `${region}:${t.x},${t.z}`, name: t.name, x: t.x, z: t.z, jobs } : null;
  }
  return null;
}

/** The workplace with this id ("lagos:12,-40"), as the map has it now. */
export function workplaceById(plan: CityPlan, id: string): Workplace | null {
  const m = /^([a-z0-9-]+):(-?\d+),(-?\d+)$/.exec(id);
  if (!m || m[1] !== plan.region?.region.id) return null;
  const w = workplaceOfTile(plan, tileAt(plan, spiralIndex(Number(m[2]), Number(m[3]))));
  return w && w.id === id ? w : null;
}

/** Workplaces within `radius` tiles of a spot, nearest first. */
export function workplacesNear(plan: CityPlan, x: number, z: number, radius: number): (Workplace & { tiles: number })[] {
  const out = new Map<string, Workplace & { tiles: number }>();
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const tx = x + dx;
      const tz = z + dz;
      if (plan.region && !plan.region.inside(tx, tz)) continue;
      const w = workplaceOfTile(plan, tileAt(plan, spiralIndex(tx, tz)));
      if (!w) continue;
      const tiles = Math.hypot(w.x - x, w.z - z);
      if (!out.has(w.id) || out.get(w.id)!.tiles > tiles) out.set(w.id, { ...w, tiles });
    }
  }
  return [...out.values()].sort((a, b) => a.tiles - b.tiles);
}
