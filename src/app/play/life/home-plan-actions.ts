"use server";

import { currentUserId } from "@/lib/game";
import { cleanPlan, starterPlan, type HomePlan } from "@/lib/home-plan";
import { createAdminClient } from "@/lib/supabase/admin";

// Your home's plan (game-db/063_home_plans.sql): one per player, for the home you live in.

type Fail = { ok: false; error: string };

async function myHome() {
  const userId = await currentUserId();
  if (!userId) return null;
  const db = createAdminClient();
  const { data } = await db.from("lives").select("home_unit").eq("user_id", userId).maybeSingle();
  return { db, userId, unit: (data?.home_unit as string | null) ?? null };
}

/** Your plan, or a starter one if you haven't drawn yours yet (or moved house since). */
export async function loadHomePlan(): Promise<{ ok: true; plan: HomePlan; saved: boolean } | Fail> {
  const me = await myHome();
  if (!me) return { ok: false, error: "Sign in to plan your home." };
  if (!me.unit) return { ok: false, error: "Find a home first, then plan it." };
  const { data, error } = await me.db.from("home_plans").select("unit, plan").eq("user_id", me.userId).maybeSingle();
  if (error && !/home_plans/.test(error.message)) return { ok: false, error: "Couldn't open your plan. Try again." };
  const plan = data && data.unit === me.unit ? cleanPlan(data.plan) : null;
  return { ok: true, plan: plan ?? starterPlan(), saved: !!plan };
}

export async function saveHomePlan(raw: unknown): Promise<{ ok: true } | Fail> {
  const me = await myHome();
  if (!me) return { ok: false, error: "Sign in to plan your home." };
  if (!me.unit) return { ok: false, error: "Find a home first, then plan it." };
  const plan = cleanPlan(raw);
  if (!plan) return { ok: false, error: "That plan couldn't be saved." };
  const { error } = await me.db.from("home_plans").upsert({ user_id: me.userId, unit: me.unit, plan, updated_at: new Date().toISOString() });
  if (error) {
    if (/home_plans/.test(error.message)) return { ok: false, error: "Saving plans is switched on soon (the game's owner has one update to run)." };
    console.error("Home plan save", error.message);
    return { ok: false, error: "Couldn't save your plan. Try again." };
  }
  return { ok: true };
}
