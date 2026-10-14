import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthOf, setGrowth } from "./growth";

// The city's growth level on the server (docs/GROWTH.md): read from the database (game-db/091) at
// most every few minutes, so the buildings worked out here match the ones players see.

const checked = new Map<string, number>();
const EVERY = 5 * 60_000;

/** Bring a city's growth level up to date (cheap: once every few minutes). Returns it. */
export async function syncGrowth(region: string): Promise<number> {
  const at = checked.get(region) ?? 0;
  if (Date.now() - at < EVERY) return growthOf(region);
  checked.set(region, Date.now());
  // Before part 91 is run there's no level: the city stays as it is (level 0).
  const { data, error } = await createAdminClient().rpc("city_growth_level", { p_region: region });
  if (!error && typeof data === "number") setGrowth(region, data);
  return growthOf(region);
}
