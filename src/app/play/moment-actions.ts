"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { MOMENT_BY_ID, MOMENT_RULES, isDayInLagos, momentVars, pickMoment, rollOutcome, type MomentSpot, type MomentVars } from "@/lib/world/moments";

// Moments (docs/MOMENTS.md, game-db/109_moments.sql): the game picks one that fits where you are
// and fills it in; when you answer, it rolls what happens (never the phone) and the database
// settles the money and reputation, within the day's limits.

const SPOTS: MomentSpot[] = ["street", "home", "food", "night", "sport", "shop", "worship", "outdoors", "work"];
const n = (v: unknown) => Number(v) || 0;

/** A moment to show: its id, which story, what's filled in, and how much you can spend (mint). */
export type MomentShown = { id: number; moment: string; vars: MomentVars & { seed: number }; perMint: number; canSpend: number };

async function me() {
  const userId = await currentUserId();
  if (!userId) return null;
  const db = createAdminClient();
  const { data: life } = await db.from("lives").select("region").eq("user_id", userId).maybeSingle();
  if (!life) return null;
  const perMint = regionMap(String(life.region ?? "lagos"))?.region.prices.perMint ?? 1500;
  return { userId, db, perMint };
}

/** The next moment, if it's time for one (null: not now). */
export async function momentNext(input: { spot: MomentSpot; place?: string }): Promise<MomentShown | null> {
  const m = await me().catch(() => null);
  if (!m) return null;
  const spot: MomentSpot = SPOTS.includes(input?.spot) ? input.spot : "street";
  const place = typeof input?.place === "string" ? input.place.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const [{ data: prof }, recentRes, dueRes, spendRes] = await Promise.all([
    m.db.from("profiles").select("level, frozen").eq("id", m.userId).maybeSingle(),
    m.db.from("moments").select("moment, created_at").eq("user_id", m.userId).order("created_at", { ascending: false }).limit(25),
    m.db.from("moment_followups").select("id, moment, vars").eq("user_id", m.userId).lte("due_at", new Date().toISOString()).order("due_at").limit(1),
    m.db.rpc("life_can_spend", { p_user: m.userId, p_pots: ["fun"] }),
  ]);
  // Part 109 not run yet: no moments.
  if (recentRes.error) return null;
  if (prof?.frozen) return null;
  const last = recentRes.data?.[0]?.created_at as string | undefined;
  if (last && Date.now() - Date.parse(last) < MOMENT_RULES.gapSeconds * 1000) return null;
  const level = Math.max(1, n(prof?.level));
  const seed = Math.floor(Math.random() * 2 ** 31);
  // Something coming back from before comes first.
  const due = dueRes.data?.[0];
  const followed = due ? MOMENT_BY_ID.get(String(due.moment)) : undefined;
  const def = followed ?? pickMoment({ spot, day: isDayInLagos(), level, recent: (recentRes.data ?? []).map((r) => String(r.moment)), rand: Math.random });
  if (!def) return null;
  const vars = momentVars(def, seed, level, place);
  // A follow-up keeps the name from before.
  const kept = (due?.vars ?? {}) as Partial<MomentVars>;
  if (followed && typeof kept.name === "string") vars.name = kept.name;
  const full = { ...vars, seed };
  const { data: id, error } = await m.db.rpc("moment_open", {
    p_user: m.userId,
    p_moment: def.id,
    p_vars: full,
    p_spot: spot,
    p_gap: MOMENT_RULES.gapSeconds,
    p_per_day: MOMENT_RULES.perDay,
    p_follow: followed ? due!.id : null,
  });
  if (error || id == null) return null;
  return { id: n(id), moment: def.id, vars: full, perMint: m.perMint, canSpend: spendRes.error ? 0 : n(spendRes.data) };
}

/** What came of your choice: which outcome, and the money (mint) and reputation that came of it. */
export type MomentResult = { ok: true; outcome: number; cash: number; rep: number } | { ok: false; error: string };

export async function momentAnswer(id: number, choice: number): Promise<MomentResult> {
  const m = await me().catch(() => null);
  if (!m) return { ok: false, error: "Sign in first." };
  const { data: row } = await m.db.from("moments").select("moment, vars, answered_at").eq("id", Math.round(n(id))).eq("user_id", m.userId).maybeSingle();
  if (!row || row.answered_at) return { ok: false, error: "That moment has passed." };
  const def = MOMENT_BY_ID.get(String(row.moment));
  const c = def?.choices[Math.round(n(choice))];
  if (!def || !c) return { ok: false, error: "That moment has passed." };
  const vars = (row.vars ?? {}) as MomentVars;
  const outcome = rollOutcome(c, Math.random);
  const naira = ((outcome.get ?? 0) - (outcome.pay ?? 0)) * n(vars.ask);
  const mint = Math.round((naira / m.perMint) * 100) / 100;
  const text = outcome.text
    .replace(/\{name\}/g, String(vars.name ?? ""))
    .replace(/\{ask\}/g, `₦${Math.round(n(vars.ask)).toLocaleString("en-GB")}`)
    .replace(/\{place\}/g, String(vars.place ?? ""));
  const { data, error } = await m.db.rpc("moment_answer", {
    p_user: m.userId,
    p_id: Math.round(n(id)),
    p_choice: Math.round(n(choice)),
    p_text: text,
    p_cash: mint,
    p_rep: outcome.rep ?? 0,
    p_follow: outcome.follow ?? null,
    p_follow_vars: outcome.follow ? { name: vars.name, place: vars.place } : null,
    // Back some hours later: half a day to two days.
    p_follow_hours: outcome.follow ? 12 + Math.random() * 36 : null,
    p_answer_secs: MOMENT_RULES.answerSeconds,
    p_gain_day: MOMENT_RULES.gainPerDay / m.perMint,
    p_rep_day: MOMENT_RULES.repPerDay,
    p_rep_min: MOMENT_RULES.repMin,
    p_rep_max: MOMENT_RULES.repMax,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("not_enough")) return { ok: false, error: "You don't have that much on you right now." };
    if (msg.includes("too_late") || msg.includes("no_moment")) return { ok: false, error: "That moment has passed." };
    console.error("Moment answer", msg);
    return { ok: false, error: "Something went wrong. Try again." };
  }
  const d = (data ?? {}) as { cash?: number; rep?: number };
  return { ok: true, outcome: c.outcomes.indexOf(outcome), cash: n(d.cash), rep: n(d.rep) };
}
