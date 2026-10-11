import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { AUTO_CARE, billsFor, priceOf } from "@/lib/world/living";
import type { LifeStatus } from "@/lib/world/property-api";

/**
 * Bring a player's life up to now (game-db/040_living.sql's life_tick): the bills for their home
 * are worked out here from its size, and the price of a check-up, never taken from the phone.
 * Every life action calls this first, so health, bills and finished courses are always current.
 */
export async function tickLife(userId: string): Promise<LifeStatus | null> {
  const db = createAdminClient();
  const { data: life } = await db.from("lives").select("region, home_unit").eq("user_id", userId).maybeSingle();
  if (!life) return null;
  const map = regionMap(life.region as string);
  if (!map) return null;
  const prices = map.region.prices;
  let bills: LifeStatus["bills"] = null;
  if (life.home_unit) {
    const { data: unit } = await db.from("property_units").select("area").eq("unit_id", life.home_unit).maybeSingle();
    const b = billsFor(Number(unit?.area ?? 30), prices);
    bills = { power: b.power, waste: b.waste };
  }
  const { data, error } = await db.rpc("life_tick", {
    p_user: userId,
    p_power_day: bills?.power ?? 0,
    p_waste_day: bills?.waste ?? 0,
    p_care_fee: priceOf(AUTO_CARE.fee, prices, false).total,
  });
  if (error || !data) {
    if (error) console.error("life_tick failed", error.message);
    return null;
  }
  const s = data as Omit<LifeStatus, "bills">;
  return { ...s, health: Number(s.health), wallet: Number(s.wallet), powerOwed: Number(s.powerOwed), wasteOwed: Number(s.wasteOwed), payOwed: Number(s.payOwed), bills };
}
