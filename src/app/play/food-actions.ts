"use server";

// Ordering at a table (docs/FOOD.md): the bill is worked out here from the menu and from what
// stands where you are (a hotel costs more than a buka), never from what the phone says, and paid
// from your Fun money, then savings, then essentials (game-db/120).

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { spiralXY } from "@/lib/city/layout";
import { CLUB_PLACES, whatIsAt } from "@/lib/world/what-is";
import { billNaira, MENU_BY_ID } from "@/lib/world/menu";
import { BOTTLE_BY_ID, BOTTLES_MAX, bottlesNaira } from "@/lib/world/bottles";
import { clubEntryNaira } from "@/lib/fees";

type Fail = { ok: false; error: string };

const whatIs = whatIsAt;

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

export async function orderMeal(region: string, place: string, ids: string[]): Promise<{ ok: true; paid: number; naira: number } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to order." };
  const map = regionMap(region);
  if (!map) return { ok: false, error: "Unknown place." };
  const what = whatIs(region, String(place ?? ""));
  if (!what) return { ok: false, error: "You can only order inside a place." };
  const list = Array.isArray(ids) ? ids.map(String).filter((id) => MENU_BY_ID.has(id)) : [];
  const naira = billNaira(list, what);
  if (naira === null) return { ok: false, error: "Pick up to six things from the menu." };
  const mint = Math.round((naira / map.region.prices.perMint) * 100) / 100;
  const names = list.map((id) => MENU_BY_ID.get(id)!.name).join(", ");
  const { data, error } = await createAdminClient().rpc("life_order_food", { p_user: userId, p_place: place, p_items: names.slice(0, 200), p_cost: mint });
  if (error) {
    if (/life_order_food/.test(error.message)) return { ok: false, error: "Paying for food is switched on soon." };
    if (error.message.startsWith("not_enough")) return { ok: false, error: "You don't have enough money for that." };
    if (error.message.startsWith("no_life")) return { ok: false, error: "Start your life in the city first." };
    return { ok: false, error: "That didn't go through. Try again." };
  }
  return { ok: true, paid: n(data), naira };
}

/**
 * Bottle service in a club (game-db/126): the bill from the bottle list and the club (the ₦10m-door
 * clubs charge more), paid from your Fun money, then savings. Only in a club.
 */
export async function orderBottles(region: string, place: string, ids: string[]): Promise<{ ok: true; paid: number; naira: number } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to order." };
  const map = regionMap(region);
  if (!map) return { ok: false, error: "Unknown place." };
  const p = String(place ?? "");
  const what = whatIs(region, p);
  if (!what || !CLUB_PLACES.has(what)) return { ok: false, error: "Bottle service is only in clubs." };
  const [x, z] = spiralXY(Number(p.slice(2)));
  const door = clubEntryNaira(p, "club", map.spotAt(x, z)?.door);
  const list = Array.isArray(ids) ? ids.map(String).filter((id) => BOTTLE_BY_ID.has(id)) : [];
  const naira = bottlesNaira(list, door);
  if (naira === null) return { ok: false, error: `Pick up to ${BOTTLES_MAX} bottles.` };
  const mint = Math.round((naira / map.region.prices.perMint) * 100) / 100;
  const names = list.map((id) => BOTTLE_BY_ID.get(id)!.name).join(", ");
  const { data, error } = await createAdminClient().rpc("life_order_bottles", { p_user: userId, p_place: p, p_items: names.slice(0, 200), p_cost: mint });
  if (error) {
    if (/life_order_bottles/.test(error.message)) return { ok: false, error: "Bottle service is switched on soon." };
    if (error.message.startsWith("not_enough")) return { ok: false, error: "You don't have enough money for that (bottles come from your Fun money and savings)." };
    if (error.message.startsWith("no_life")) return { ok: false, error: "Start your life in the city first." };
    if (error.message.startsWith("frozen")) return { ok: false, error: "Your account is paused right now." };
    return { ok: false, error: "That didn't go through. Try again." };
  }
  return { ok: true, paid: n(data), naira };
}
