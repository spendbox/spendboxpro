"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { EXERCISE, type Exercise } from "@/lib/world/day";
import { hustleById, hustleDay, hustleStart } from "@/lib/world/hustles";
import type { PropertyResult } from "@/lib/world/property-api";
import { skillLevel } from "@/lib/world/work";
import { dayFits, tickLife } from "./life-tick";

// Your day (docs/DAY.md; the database part is game-db/041_your_day.sql): a side hustle, exercise,
// and where your time went. What a hustle earns and costs is worked out here, and every change must
// fit in the day.

const n = (v: unknown) => Number(v ?? 0) || 0;

function say(message: string | undefined): PropertyResult {
  const [code, arg] = (message ?? "").split(":");
  const words: Record<string, string> = {
    no_life: "Start your life first.",
    home_first: "Buy a home first.",
    not_enough: `You need ₥${arg} to start that.`,
    already: "That's already your side hustle.",
    bad_item: "That isn't on offer.",
  };
  if (words[code]) return { ok: false, error: words[code] };
  console.error("Day action failed", message);
  return { ok: false, error: "That didn't work just now. Try again." };
}

async function region(userId: string) {
  const { data } = await createAdminClient().from("lives").select("region").eq("user_id", userId).maybeSingle();
  return data ? regionMap(data.region as string) : null;
}

/** Start a side hustle (the one you had stops). */
export async function startHustle(id: string): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const h = hustleById(id);
  if (!h) return say("bad_item");
  await tickLife(userId);
  const map = await region(userId);
  if (!map) return say("no_life");
  const db = createAdminClient();
  const { data: skill } = await db.from("life_skills").select("days").eq("user_id", userId).eq("skill", h.skill).maybeSingle();
  if (h.level && skillLevel(n(skill?.days)) < h.level) return { ok: false, error: `You need ${h.skill} level ${h.level} for that.` };
  if (!(await dayFits(userId, { hustleHours: h.hours })).fits) return { ok: false, error: "That won't fit in your day. Cut back somewhere first." };
  const { data, error } = await db.rpc("life_hustle_start", {
    p_user: userId,
    p_hustle: h.id,
    p_title: h.title,
    p_skill: h.skill,
    p_pay_day: hustleDay(h, map.region.prices),
    p_swing: h.swing,
    p_hours: h.hours,
    p_cost: hustleStart(h, map.region.prices),
  });
  if (error) return say(error.message);
  return { ok: true, coins: n((data as Record<string, unknown>)?.coins) };
}

/** Stop your side hustle (what it made is collected first). */
export async function stopHustle(): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  await tickLife(userId);
  const { data, error } = await createAdminClient().rpc("life_hustle_stop", { p_user: userId });
  if (error) return say(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, pay: { days: n(d.days), gross: 0, tax: 0, fares: 0, net: 0, hustle: { gross: n(d.gross), tax: n(d.tax), net: n(d.net) } } };
}

/** How you exercise. */
export async function setExercise(ex: Exercise): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  if (!(ex in EXERCISE)) return say("bad_item");
  await tickLife(userId);
  if (!(await dayFits(userId, { exercise: ex })).fits) return { ok: false, error: "That won't fit in your day." };
  const { error } = await createAdminClient().rpc("life_set_exercise", { p_user: userId, p_exercise: ex });
  return error ? say(error.message) : { ok: true };
}

/** Hours spent by kind over the last `hours` real hours. */
export async function lifeTime(hours: number): Promise<Record<string, number>> {
  const userId = await currentUserId();
  if (!userId) return {};
  const { data } = await createAdminClient().rpc("life_time", { p_user: userId, p_hours: Math.round(n(hours)) || 24 });
  return Object.fromEntries(Object.entries((data ?? {}) as Record<string, unknown>).map(([k, v]) => [k, n(v)]));
}
