// The real-world regions the game can show, by id.

import { compileRegion, type RegionMap } from "./compile.ts";
import type { Region } from "./region.ts";
import { LAGOS } from "./regions/lagos/index.ts";

export const REGIONS: Record<string, Region> = { lagos: LAGOS };

/** A region's lookups (worked out once), or null for an unknown id. */
export function regionMap(id: string | null | undefined): RegionMap | null {
  const r = id ? REGIONS[id] : undefined;
  return r ? compileRegion(r) : null;
}
