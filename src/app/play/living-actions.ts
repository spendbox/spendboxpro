"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { careById, cleanBudget, courseById, POTS, priceOf, procedureById, type Budget, type Pot } from "@/lib/world/living";
import type { LifeStatus, MoneyDay, MoneyFlow, PropertyResult } from "@/lib/world/property-api";
import { STUDY_HOURS } from "@/lib/world/day";
import { dayFits, tickLife } from "./life-tick";

// Living on the real map (docs/LIVING.md; the database part is game-db/040_living.sql): your
// budget and pots, health care, treats and school. Every price is worked out here.

const n = (v: unknown) => Number(v ?? 0) || 0;

function say(message: string | undefined): PropertyResult {
  const [code, arg] = (message ?? "").split(":");
  const words: Record<string, string> = {
    no_life: "Start your life first.",
    home_first: "Buy a home first.",
    not_enough: `You need ₥${arg} for that.`,
    bad_budget: "A budget can't add up to more than 100%.",
    bad_move: "You can't move money like that.",
    studying: "Finish the course you're on first.",
    done_already: "You've done that course already.",
    recovering: "You're still recovering from the last one.",
    bad_item: "That isn't on offer.",
  };
  if (words[code]) return { ok: false, error: words[code] };
  console.error("Living action failed", message);
  return { ok: false, error: "That didn't work just now. Try again." };
}

/** You, your region's prices, brought up to now. */
async function me() {
  const userId = await currentUserId();
  if (!userId) return null;
  const status = await tickLife(userId);
  const { data } = await createAdminClient().from("lives").select("region").eq("user_id", userId).maybeSingle();
  const map = data ? regionMap(data.region as string) : null;
  return map ? { userId, status, prices: map.region.prices } : null;
}

/** Your life now. */
export async function lifeStatus(): Promise<LifeStatus | null> {
  const userId = await currentUserId();
  return userId ? tickLife(userId) : null;
}

/** Set how each income is shared out. */
export async function setBudget(budget: Budget): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { error } = await createAdminClient().rpc("life_budget_set", { p_user: userId, p_budget: cleanBudget(budget) });
  return error ? say(error.message) : { ok: true };
}

/** Move money between pots and your wallet. */
export async function movePot(from: Pot | "wallet", to: Pot | "wallet", amount: number): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const ok = (p: string) => p === "wallet" || (POTS as string[]).includes(p);
  if (!ok(from) || !ok(to)) return say("bad_move");
  const { error } = await createAdminClient().rpc("life_pot_move", { p_user: userId, p_from: from, p_to: to, p_amount: Math.round(n(amount) * 100) / 100 });
  return error ? say(error.message) : { ok: true };
}

/** Health care. */
export async function care(id: string): Promise<PropertyResult> {
  const c = careById(id);
  const m = await me();
  if (!m) return { ok: false, error: "Please sign in again." };
  if (!c) return say("bad_item");
  const price = priceOf(c.fee, m.prices, !c.public);
  const { data, error } = await createAdminClient().rpc("life_care", {
    p_user: m.userId,
    p_care: c.id,
    p_title: c.title,
    p_fee: price.base,
    p_vat: price.tax,
    p_gain: c.health,
    p_mind_gain: c.mind ?? 0,
    p_away_days: c.away ?? 0,
    p_public: c.public,
    // A weekend away comes out of Treats; care out of Essentials.
    p_pots: c.away ? ["fun", "savings"] : ["essentials"],
  });
  if (error) return say(error.message);
  return { ok: true, coins: n((data as Record<string, unknown>)?.coins) };
}

/** A cosmetic procedure. */
export async function procedure(id: string): Promise<PropertyResult> {
  const p = procedureById(id);
  const m = await me();
  if (!m) return { ok: false, error: "Please sign in again." };
  if (!p) return say("bad_item");
  const price = priceOf(p.fee, m.prices, true);
  const { data, error } = await createAdminClient().rpc("life_procedure", {
    p_user: m.userId,
    p_procedure: p.id,
    p_title: p.title,
    p_fee: price.base,
    p_vat: price.tax,
    p_recovery: p.recovery,
  });
  if (error) return say(error.message);
  return { ok: true, coins: n((data as Record<string, unknown>)?.coins) };
}

/** Start a course. */
export async function enrol(id: string): Promise<PropertyResult> {
  const c = courseById(id);
  const m = await me();
  if (!m) return { ok: false, error: "Please sign in again." };
  if (!c) return say("bad_item");
  if (!(await dayFits(m.userId, { studyHours: STUDY_HOURS[c.kind] })).fits) return { ok: false, error: "That won't fit in your day, even with only 4 hours' sleep. Stop a side hustle or some exercise first." };
  const { data, error } = await createAdminClient().rpc("life_enrol", {
    p_user: m.userId,
    p_course: c.id,
    p_title: c.title,
    p_skill: c.skill,
    p_grants: c.grants,
    p_cert: c.cert ?? null,
    p_fee: priceOf(c.fee, m.prices, false).total,
    p_days: c.days,
    p_public: c.public,
  });
  if (error) return say(error.message);
  return { ok: true, coins: n((data as Record<string, unknown>)?.coins) };
}

/** Money in and out over the last `hours` real hours, by kind. */
export async function money(hours: number): Promise<MoneyFlow> {
  const userId = await currentUserId();
  if (!userId) return {};
  const { data, error } = await createAdminClient().rpc("life_money", { p_user: userId, p_hours: Math.round(n(hours)) || 24 });
  if (error || !data) return {};
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, n(v)]));
}

/** Your money day by day (game-db/050_economy_items.sql): earned, living costs, things bought. */
export async function moneyDays(days: number): Promise<MoneyDay[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data, error } = await createAdminClient().rpc("life_money_days", { p_user: userId, p_days: Math.min(90, Math.max(1, Math.round(n(days)) || 7)) });
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((d) => ({ day: String(d.day), earned: n(d.earned), costs: n(d.costs), bought: n(d.bought) }));
}
