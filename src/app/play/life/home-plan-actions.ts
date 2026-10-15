"use server";

import { currentUserId } from "@/lib/game";
import { cleanPaid, cleanPlan, mergePaid, packHomePlan, paidFor, planBill, starterPlan, type HomePlan, type PlanPaid } from "@/lib/home-plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { packById } from "@/lib/world/packs";

// Your home's plan (game-db/063_home_plans.sql, 064_home_upgrades.sql): one per player, for the
// home you live in. Planning is free; saving pays for new floors and furniture (the game works
// out the bill here, from the plan itself, never from what the phone says it costs).

type Fail = { ok: false; error: string };

/** A number from a player's id (the same every time), so their gift home is always the same design. */
const seedOf = (id: string) => {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h % 1_000_000;
};

/**
 * The home a paid starter pack furnishes (docs/PACKS.md), for players who haven't saved a plan of
 * their own yet: what it looks like, and everything in it as already paid for. Null for the rest.
 */
async function giftHome(db: ReturnType<typeof createAdminClient>, userId: string): Promise<{ plan: HomePlan; paid: PlanPaid } | null> {
  const { data } = await db.from("starter_payments").select("pack").eq("user_id", userId).eq("status", "paid").limit(1);
  const furnished = packById(String(data?.[0]?.pack ?? ""))?.furnished;
  if (!furnished) return null;
  const plan = packHomePlan(furnished, seedOf(userId));
  return { plan, paid: paidFor(plan) };
}

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

/** canSpend: what building can be paid from (savings and wallet, mint), the same sum the save checks. */
export type HomePlanLoad = { ok: true; plan: HomePlan; saved: boolean; paid: PlanPaid; perMint: number; owner: boolean; canSpend: number | null };

/** Your plan (or a starter one if you haven't drawn yours yet, or moved house since), and what you've paid for. */
export async function loadHomePlan(): Promise<HomePlanLoad | Fail> {
  const me = await myHome();
  if (!me) return { ok: false, error: "Sign in to plan your home." };
  if (!me.unit) return { ok: false, error: "Find a home first, then plan it." };
  const row = await savedRow(me.db, me.userId).catch(() => null);
  const mine = row && row.unit === me.unit ? row : null;
  const plan = mine ? cleanPlan(mine.plan) : null;
  // A paid pack's furnished home, until the player saves a plan of their own.
  const gift = plan ? null : await giftHome(me.db, me.userId).catch(() => null);
  const shown = plan ?? gift?.plan ?? starterPlan();
  const paid = cleanPaid(mine?.paid, shown.size);
  const spend = await me.db.rpc("life_can_spend", { p_user: me.userId, p_pots: ["savings"] }).then((r) => (r.error ? null : Number(r.data)), () => null);
  return { ok: true, plan: shown, saved: !!plan, paid: gift ? mergePaid(paid, gift.paid) : paid, perMint: me.perMint, owner: me.owner, canSpend: spend };
}

export async function saveHomePlan(raw: unknown): Promise<{ ok: true; paidMint: number; paid: PlanPaid } | (Fail & { short?: { cost: number; have: number } })> {
  const me = await myHome();
  if (!me) return { ok: false, error: "Sign in to plan your home." };
  if (!me.unit) return { ok: false, error: "Find a home first, then plan it." };
  const plan = cleanPlan(raw);
  if (!plan) return { ok: false, error: "That plan couldn't be saved." };
  const row = await savedRow(me.db, me.userId).catch(() => null);
  const saved = row && row.unit === me.unit ? row : null;
  // What's been built so far is measured at the size of the home that was built (the saved plan,
  // or the starter home), never at the size of the new plan.
  const builtSize = (saved && cleanPlan(saved.plan)?.size) || starterPlan().size;
  let paidBefore = cleanPaid(saved ? saved.paid : null, builtSize);
  // The first save of a pack's furnished home: what came with it isn't charged for.
  if (!saved) {
    const gift = await giftHome(me.db, me.userId).catch(() => null);
    if (gift) paidBefore = mergePaid(paidBefore, gift.paid);
  }
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
  if (msg.includes("not_enough")) {
    const have = await me.db.rpc("life_can_spend", { p_user: me.userId, p_pots: ["savings"] }).then((r) => Number(r.data) || 0, () => 0);
    return { ok: false, error: "You don't have enough in your savings and wallet for that.", short: { cost: mint, have } };
  }
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
  if (row) return cleanPlan(row.plan);
  // Nobody's planned theirs yet: a paid pack's furnished home, if one of them has it.
  for (const r of residents.slice(0, 4)) {
    const gift = await giftHome(db, r.user_id).catch(() => null);
    if (gift) return gift.plan;
  }
  return null;
}
