import "server-only";

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { drawEvent, EVENT_HOURS, eventComes, showEvent } from "@/lib/world/breakthroughs";
import { dayOf, dayPlan, EXERCISE, hoursOf, type DayInput, type Exercise } from "@/lib/world/day";
import { AUTO_CARE, billsFor, foodDay, priceOf } from "@/lib/world/living";
import type { LifeStatus } from "@/lib/world/property-api";
import { ferryKmBetween } from "@/lib/world/trips";
import { effectsOf, type ItemEffect } from "@/lib/world/items";
import { fareOrBus, GAME_DAY_HOURS, tripKmBetween, type Commute } from "@/lib/world/work";

/** Everything about a player's day as the database has it. */
export async function lifeRows(userId: string) {
  const db = createAdminClient();
  const [{ data: life }, { data: job }, { data: hustleRows }, { data: course }] = await Promise.all([
    db.from("lives").select("region, home_unit, exercise, health_at, power_owed, waste_owed").eq("user_id", userId).maybeSingle(),
    db.from("life_jobs").select("place_id, mode, skill, pay_day, paid_until").eq("user_id", userId).maybeSingle(),
    db.from("life_hustles").select("hustle, hours, paid_until").eq("user_id", userId),
    db.from("life_courses").select("course").eq("user_id", userId).is("done_at", null).maybeSingle(),
  ]);
  if (!life) return null;
  const hustles = hustleRows ?? [];
  const day: DayInput = dayOf({
    homeUnit: (life.home_unit as string) ?? null,
    job: job ? { place: job.place_id as string, mode: job.mode as Commute } : null,
    hustleHours: hustles.reduce((t, h) => t + Number(h.hours), 0),
    course: (course?.course as string) ?? null,
    exercise: ((life.exercise as Exercise) ?? "none") as Exercise,
    owing: Number(life.power_owed) + Number(life.waste_owed) > 0,
  });
  return { life, job, hustles, course, day };
}

/**
 * Bring a player's life up to now (game-db/041_your_day.sql's life_tick): bills for their home,
 * the gym, how their days move body and mind, and the hours they spent, all worked out here from
 * the map and the rules, never taken from the phone. Then, now and then, a breakthrough moment
 * (src/lib/world/breakthroughs.ts). Every life action calls this first.
 */
export async function tickLife(userId: string): Promise<LifeStatus | null> {
  const rows = await lifeRows(userId);
  if (!rows) return null;
  const { life, job, hustles } = rows;
  const map = regionMap(life.region as string);
  if (!map) return null;
  const prices = map.region.prices;
  const db = createAdminClient();
  let bills: LifeStatus["bills"] = null;
  if (life.home_unit) {
    const { data: unit } = await db.from("property_units").select("area").eq("unit_id", life.home_unit).maybeSingle();
    const b = billsFor(Number(unit?.area ?? 30), prices);
    bills = { power: b.power, waste: b.waste, food: b.food };
  }
  // Food is paid with the bills, home or not (src/lib/world/living.ts FOOD_MONTH).
  const food = foodDay(prices);
  const plan = dayPlan(rows.day);
  // What your things do for you (a good bed, a TV, a bicycle...): added to how your days move
  // body and mind (src/lib/world/items.ts, capped).
  const { data: things } = await db.from("items").select("effect").eq("owner", userId);
  const fromThings = effectsOf((things ?? []).map((t) => ({ effect: (t.effect ?? {}) as ItemEffect })));
  const ex = EXERCISE[rows.day.exercise];
  const days = Math.max(0, (Date.now() - Date.parse(String(life.health_at))) / (GAME_DAY_HOURS * 3_600_000));
  const args = {
    p_user: userId,
    p_power_day: bills?.power ?? 0,
    p_waste_day: bills?.waste ?? 0,
    p_care_fee: priceOf(AUTO_CARE.fee, prices, false).total,
    p_body_day: Math.round((plan.body + fromThings.body) * 100) / 100,
    p_mind_day: Math.round((plan.mind + fromThings.mind) * 100) / 100,
    p_gym_day: ex.fee ? Math.round((ex.fee / 30 / prices.perMint) * 100) / 100 : 0,
    p_hours: hoursOf(plan),
  };
  let { data, error } = await db.rpc("life_tick", { ...args, p_food_day: food });
  // Part 65 (food) not run yet: the old life_tick, without food.
  if (error && /p_food_day|life_tick/.test(error.message ?? "") && /function|schema cache/i.test(error.message ?? "")) {
    ({ data, error } = await db.rpc("life_tick", args));
  }
  if (error || !data) {
    if (error) console.error("life_tick failed", error.message);
    return null;
  }
  const s = data as Omit<LifeStatus, "bills" | "event"> & { event: { id: string; source: "job" | "hustle"; key: string; title: string; expiresAt: string } | null };
  let event = s.event;

  // Now and then, a breakthrough moment at work or in the side hustle.
  if (!event) {
    const sources: { source: "job" | "hustle"; of: string }[] = [];
    if (job) sources.push({ source: "job", of: job.skill as string });
    if (hustles.length) sources.push({ source: "hustle", of: hustles[Math.floor(Math.random() * hustles.length)].hustle as string });
    for (const src of sources) {
      if (!eventComes(src.source, days)) continue;
      const b = drawEvent(src.source, src.of);
      if (!b) continue;
      const id = `evt-${randomBytes(8).toString("hex")}`;
      const { data: opened } = await db.rpc("life_event_open", { p_user: userId, p_id: id, p_source: src.source, p_key: b.id, p_title: b.title, p_hours: EVENT_HOURS });
      if (opened) event = { id, source: src.source, key: b.id, title: b.title, expiresAt: new Date(Date.now() + EVENT_HOURS * 3_600_000).toISOString() };
      break;
    }
  }
  const shown = event ? showEvent(event.key) : null;

  // Pay day: once a game week of pay has built up, it goes into your wallet by itself (your job
  // after tax and fares, and your side hustles). Nothing to tap.
  const week = 7 * GAME_DAY_HOURS * 3_600_000;
  let paid = false;
  if (job && Date.now() - Date.parse(String(job.paid_until)) >= week) {
    const home = (life.home_unit as string | null) ?? null;
    const km = home ? tripKmBetween(home, job.place_id as string) : null;
    const fare = home && km !== null ? fareOrBus(job.mode as Commute, km, prices, ferryKmBetween(home, job.place_id as string)) : 0;
    const { error: payError } = await db.rpc("life_work_collect", { p_user: userId, p_fare_trip: fare });
    if (payError) console.error("Weekly pay failed", payError.message);
    else paid = true;
  }
  if (hustles.some((h) => Date.now() - Date.parse(String(h.paid_until)) >= week)) {
    const { error: payError } = await db.rpc("life_hustle_collect", { p_user: userId });
    if (payError) console.error("Weekly hustle pay failed", payError.message);
    else paid = true;
  }
  if (paid) {
    const { data: wallet } = await db.from("profiles").select("coins").eq("id", userId).maybeSingle();
    if (wallet) s.wallet = Number(wallet.coins);
  }
  return {
    ...s,
    health: Number(s.health),
    mind: Number(s.mind),
    wallet: Number(s.wallet),
    powerOwed: Number(s.powerOwed),
    wasteOwed: Number(s.wasteOwed),
    payOwed: Number(s.payOwed),
    bills,
    event: event && shown ? { ...event, text: shown.text, choices: shown.choices } : null,
  };
}

/**
 * Whether a day with this change would still fit in 24 hours with at least 4 hours' sleep (short
 * nights are allowed: they stress the mind). The change can be worked out from the day as it is.
 */
export async function dayFits(userId: string, change: Partial<DayInput> | ((day: DayInput) => Partial<DayInput>)) {
  const rows = await lifeRows(userId);
  if (!rows) return { fits: true, plan: null };
  const plan = dayPlan({ ...rows.day, ...(typeof change === "function" ? change(rows.day) : change) });
  return { fits: plan.fits, plan };
}
