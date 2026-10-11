"use server";

import { businessesIn } from "@/lib/business";
import { REGIONS } from "@/lib/world";
import { BUSINESS_HITS, type BusinessHit, type MapBusiness } from "@/lib/world/business";
import { createAdminClient } from "@/lib/supabase/admin";

// Businesses on the map (src/lib/business.ts): the list for drawing them, and counting what people
// do with them (taps, calls, directions...) for their owners.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Live businesses in a region (empty when the database isn't there, as in the world lab). */
export async function mapBusinesses(region: string): Promise<MapBusiness[]> {
  if (!REGIONS[region]) return [];
  try {
    return await businessesIn(region);
  } catch {
    return [];
  }
}

/** Count something someone did with a business. */
export async function hitBusiness(id: string, kind: BusinessHit): Promise<void> {
  if (!UUID.test(id ?? "") || !BUSINESS_HITS.includes(kind)) return;
  try {
    await createAdminClient().rpc("business_hit", { p_lease: id, p_kind: kind });
  } catch {
    // Counting is best-effort.
  }
}
