"use server";

import { makePlan, type CityPlan } from "@/lib/city/layout";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import type { Neighbour, PaySettled, PropertyResult, WorkStatus } from "@/lib/world/property-api";
import { COMMUTES, fareMint, fareOrBus, needsInterview, payDay, tripKmBetween, type Commute } from "@/lib/world/work";
import { ferryKmBetween } from "@/lib/world/trips";
import { CERT_LABEL } from "@/lib/world/living";
import { workplaceById } from "@/lib/world/workplace";
import { unseal } from "@/lib/game-seal";
import { dayFits, tickLife } from "./life-tick";

// Working on the real map (docs/WORK.md; the database part is game-db/039_work.sql). What a job
// pays and what the trip to it costs are always worked out here, from the map, never taken from
// the phone.

const plans = new Map<string, CityPlan>();
function planFor(region: string): CityPlan | null {
  const map = regionMap(region);
  if (!map) return null;
  let plan = plans.get(region);
  if (!plan) {
    plan = makePlan(map.region.seed, map);
    plans.set(region, plan);
  }
  return plan;
}

const n = (v: unknown) => Number(v ?? 0) || 0;

function say(message: string | undefined): PropertyResult {
  const [code, arg] = (message ?? "").split(":");
  const words: Record<string, string> = {
    no_life: "Start your life first.",
    home_first: "Buy a home first: you need somewhere to live before you can work.",
    need_level: `This job needs level ${arg} in its skill. Start lower and work up.`,
    already: "That's already your job.",
    no_job: "You don't have a job right now.",
    bad_mode: "You can't get there that way.",
    bad_job: "That job isn't there any more.",
    frozen: "Your account is paused right now.",
    unknown_player: "Please sign in again.",
  };
  if (words[code]) return { ok: false, error: words[code] };
  console.error("Work action failed", message);
  return { ok: false, error: "That didn't work just now. Try again." };
}

function settled(d: Record<string, unknown> | null | undefined): PaySettled {
  return { days: n(d?.days), gross: n(d?.gross), tax: n(d?.tax), fares: n(d?.fares), net: n(d?.net) };
}

/** Your home and job as the database has them, and what one trip between them costs now (your life brought up to now first). */
async function whereYouAre(userId: string) {
  await tickLife(userId);
  const db = createAdminClient();
  const [{ data: life }, { data: job }] = await Promise.all([
    db.from("lives").select("region, home_unit").eq("user_id", userId).maybeSingle(),
    db.from("life_jobs").select("place_id, mode").eq("user_id", userId).maybeSingle(),
  ]);
  const map = life ? regionMap(life.region as string) : null;
  const km = life?.home_unit && job ? tripKmBetween(life.home_unit as string, job.place_id as string) : null;
  const ferry = life?.home_unit && job ? ferryKmBetween(life.home_unit as string, job.place_id as string) : 0;
  const fare = map && km !== null && job ? fareOrBus(job.mode as Commute, km, map.region.prices, ferry) : 0;
  return { region: (life?.region as string) ?? null, home: (life?.home_unit as string) ?? null, job, fare };
}

/** Your job and skills. */
export async function workStatus(): Promise<WorkStatus | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await createAdminClient().rpc("life_work_status", { p_user: userId });
  if (error) return null;
  return data as WorkStatus;
}

/** Take a job at a workplace on the map, getting there by `mode`. */
export async function takeJob(placeId: string, jobId: string, mode: Commute, ticket?: string): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to work." };
  if (!COMMUTES.includes(mode)) return say("bad_mode");
  const region = /^([a-z0-9-]+):/.exec(placeId ?? "")?.[1];
  const plan = region ? planFor(region) : null;
  const place = plan ? workplaceById(plan, placeId) : null;
  const job = place?.jobs.find((j) => j.job === jobId);
  if (!plan?.region || !place || !job) return say("bad_job");
  const now = await whereYouAre(userId);
  if (!now.home) return say(now.region ? "home_first" : "no_life");
  const km = tripKmBetween(now.home, placeId);
  if (km === null || fareMint(mode, km, plan.region.region.prices, ferryKmBetween(now.home, placeId)) === null) return { ok: false, error: "It's too far to get there that way." };
  if (job.cert) {
    const { data: done } = await createAdminClient().from("life_courses").select("course").eq("user_id", userId).eq("cert", job.cert).not("done_at", "is", null).limit(1);
    if (!done?.length) return { ok: false, error: `This job needs a ${CERT_LABEL[job.cert]}. Take the course under Life → School.` };
  }
  // Skilled jobs need a passed interview (a sealed pass from interview-actions.ts, for this job here).
  if (needsInterview(job)) {
    const pass = ticket ? unseal<{ user: string; place: string; job: string }>(ticket) : null;
    if (!pass || pass.user !== userId || pass.place !== placeId || pass.job !== jobId) return { ok: false, error: "This job needs an interview first." };
  }
  const fit = await dayFits(userId, { job: true, commute: { mode, km } });
  if (!fit.fits) return { ok: false, error: "That won't fit in your day, even with only 4 hours' sleep. Stop a side hustle, a course or some exercise first." };
  const { data, error } = await createAdminClient().rpc("life_work_take", {
    p_user: userId,
    p_region: region,
    p_place: placeId,
    p_place_name: place.name,
    p_job: job.job,
    p_title: job.title,
    p_skill: job.skill,
    p_pay_day: payDay(job, plan.region.region.prices),
    p_need_level: job.level,
    p_mode: mode,
    p_old_fare: now.fare,
  });
  if (error) return say(error.message);
  if (job.state) await createAdminClient().rpc("life_work_set_state", { p_user: userId, p_state: true });
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, coins: n(d.coins), pay: settled(d.collected as Record<string, unknown>) };
}

/** Change how you get to work. */
export async function setCommute(mode: Commute): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  if (!COMMUTES.includes(mode)) return say("bad_mode");
  const now = await whereYouAre(userId);
  if (!now.job || !now.home || !now.region) return say("no_job");
  const km = tripKmBetween(now.home, now.job.place_id as string);
  const map = regionMap(now.region);
  if (km === null || !map || fareMint(mode, km, map.region.prices, ferryKmBetween(now.home, now.job.place_id as string)) === null) return { ok: false, error: "It's too far to go that way." };
  if (!(await dayFits(userId, { commute: { mode, km } })).fits) return { ok: false, error: "That way takes too long, even with only 4 hours' sleep." };
  const { data, error } = await createAdminClient().rpc("life_work_mode", { p_user: userId, p_mode: mode, p_old_fare: now.fare });
  if (error) return say(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, coins: n(d.coins), pay: settled(d) };
}

/** Collect your pay and what your side hustle made (less income tax and fares). */
export async function collectPay(): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const now = await whereYouAre(userId);
  const db = createAdminClient();
  const { data, error } = await db.rpc("life_work_collect", { p_user: userId, p_fare_trip: now.fare });
  if (error) return say(error.message);
  const { data: h } = await db.rpc("life_hustle_collect", { p_user: userId });
  const d = (data ?? {}) as Record<string, unknown>;
  const hd = (h ?? {}) as Record<string, unknown>;
  const { data: prof } = await db.from("profiles").select("coins").eq("id", userId).maybeSingle();
  return { ok: true, coins: n(prof?.coins ?? d.coins), pay: { ...settled(d), hustle: { gross: n(hd.gross), tax: n(hd.tax), net: n(hd.net) } } };
}

/** Leave your job (paid up first). */
export async function quitJob(): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const now = await whereYouAre(userId);
  const { data, error } = await createAdminClient().rpc("life_work_quit", { p_user: userId, p_fare_trip: now.fare });
  if (error) return say(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, coins: n(d.coins), pay: settled(d) };
}

/** Players living near you, nearest first. */
export async function neighbours(): Promise<Neighbour[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data, error } = await createAdminClient().rpc("life_neighbours", { p_user: userId, p_radius: 6 });
  if (error || !Array.isArray(data)) return [];
  return (data as Neighbour[]).map((x) => ({ ...x, tiles: n(x.tiles) }));
}
