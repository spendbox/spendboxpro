"use server";

import { currentUserId } from "@/lib/game";
import { cleanPaid, cleanPlan, planBill, starterPlan, type HomePlan, type PlanPaid } from "@/lib/home-plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";

// Your home's plan (game-db/063_home_plans.sql, 064_home_upgrades.sql): one per player, for the
// home you live in. Planning is free; saving pays for new floors and furniture (the game works
// out the bill here, from the plan itself, never from what the phone says it costs).

type Fail = { ok: false; error: string };

async function myHome() {
  const userId = await currentUserId();
  if (!userId) return null;
  const db = createAdminClient();
  const { data } = await db.from("lives").select("home_unit, region").eq("user_id", userId).maybeSingle();
  const unit = (data?.home_unit as string | null) ?? null;
  const { data: owned } = unit ? await db.from("property_units").select("owner_id").eq("unit_id", unit).maybeSingle() : { data: null };
  const perMint = regionMap((data?.region as string) ?? "lagos")?.region.prices.perMint ?? 1500;
  return { db, userId, unit, perMint, owner: owned?.owner_id === userId };
}

async function savedRow(db: ReturnType<typeof createAdminClient>, userId: string) {
  const full = await db.from("home_plans").select("unit, plan, paid").eq("user_id", userId).maybeSingle();
  if (!full.error) return full.data as { unit: string; plan: unknown; paid: unknown } | null;
  // Part 64 not run yet: no "paid" column.
  const { data } = await db.from("home_plans").select("unit, plan").eq("user_id", userId).maybeSingle();
  return (data as { unit: string; plan: unknown } | null) ? { ...(data as { unit: string; plan: unknown }), paid: null } : null;
}

export type HomePlanLoad = { ok: true; plan: HomePlan; saved: boolean; paid: PlanPaid; perMint: number; owner: boolean };

/** Your plan (or a starter one if you haven't drawn yours yet, or moved house since), and what you've paid for. */
export async function loadHomePlan(): Promise<HomePlanLoad | Fail> {
  const me = await myHome();
  if (!me) return { ok: false, error: "Sign in to plan your home." };
  if (!me.unit) return { ok: false, error: "Find a home first, then plan it." };
  const row = await savedRow(me.db, me.userId).catch(() => null);
  const mine = row && row.unit === me.unit ? row : null;
  const plan = mine ? cleanPlan(mine.plan) : null;
  const shown = plan ?? starterPlan();
  return { ok: true, plan: shown, saved: !!plan, paid: cleanPaid(mine?.paid, shown.size), perMint: me.perMint, owner: me.owner };
}

export async function saveHomePlan(raw: unknown): Promise<{ ok: true; paidMint: number; paid: PlanPaid } | Fail> {
  const me = await myHome();
  if (!me) return { ok: false, error: "Sign in to plan your home." };
  if (!me.unit) return { ok: false, error: "Find a home first, then plan it." };
  const plan = cleanPlan(raw);
  if (!plan) return { ok: false, error: "That plan couldn't be saved." };
  const row = await savedRow(me.db, me.userId).catch(() => null);
  const paidBefore = cleanPaid(row && row.unit === me.unit ? row.paid : null, plan.size);
  const bill = planBill(plan, paidBefore);
  const mint = Math.round((bill.naira / me.perMint) * 100) / 100;
  if (mint > 0 && !me.owner) return { ok: false, error: "You rent this home, so you can't build onto it or buy furniture for it here. Rearranging is free." };
  const { error } = await me.db.rpc("home_plan_save", {
    p_user: me.userId,
    p_unit: me.unit,
    p_plan: plan,
    p_paid: bill.paid,
    p_cost: mint,
    p_value: Math.round((bill.valueNaira / me.perMint) * 100) / 100,
  });
  if (!error) return { ok: true, paidMint: mint, paid: bill.paid };
  const msg = error.message ?? "";
  if (msg.includes("not_enough")) return { ok: false, error: "You don't have enough in your savings and wallet for that. Take something out, or save up." };
  if (msg.includes("not_owner")) return { ok: false, error: "You rent this home, so you can't build onto it or buy furniture for it here. Rearranging is free." };
  if (msg.includes("too_dear")) return { ok: false, error: "That's too much to build in one go. Save part of it first." };
  if (/home_plan_save|home_plans/.test(msg)) {
    // Part 64 not run yet: rearranging (nothing to pay) still saves.
    if (mint === 0) {
      const up = await me.db.from("home_plans").upsert({ user_id: me.userId, unit: me.unit, plan, updated_at: new Date().toISOString() });
      if (!up.error) return { ok: true, paidMint: 0, paid: paidBefore };
    }
    return { ok: false, error: "Building onto homes is switched on soon (the game's owner has one update to run)." };
  }
  console.error("Home plan save", msg);
  return { ok: false, error: "Couldn't save your plan. Try again." };
}

const BUILDING_RE = /^[a-z0-9-]+:-?[0-9]+,-?[0-9]+$/;

/**
 * The plan of a home in this building, for anyone walking in (visitors see it too): yours if you
 * live there, otherwise the plan of whoever does. Null when nobody there has planned their home.
 */
export async function homePlanFor(building: string): Promise<HomePlan | null> {
  if (typeof building !== "string" || !BUILDING_RE.test(building)) return null;
  const db = createAdminClient();
  const me = await currentUserId().catch(() => null);
  const { data: lives } = await db.from("lives").select("user_id, home_unit").like("home_unit", `${building}/%`).limit(20);
  const residents = (lives ?? []) as { user_id: string; home_unit: string }[];
  if (!residents.length) return null;
  const { data: plans } = await db.from("home_plans").select("user_id, unit, plan").in("user_id", residents.map((r) => r.user_id));
  const rows = ((plans ?? []) as { user_id: string; unit: string; plan: unknown }[]).filter((p) => residents.some((r) => r.user_id === p.user_id && r.home_unit === p.unit));
  const row = rows.find((r) => r.user_id === me) ?? rows[0];
  return row ? cleanPlan(row.plan) : null;
}
