"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { MOMENT_BY_ID, fillMoment, type MomentVars } from "@/lib/world/moments";
import {
  BUSINESS_EVERY_H,
  CRISIS_EVERY_H,
  FIRST_MOMENT_H,
  MAX_VENTURES,
  VENTURE_KIND_BY_ID,
  changeWords,
  inCrisis,
  newVenture,
  nextStage,
  readyToGrow,
  ventureHourly,
  type Venture,
  type VentureKindId,
} from "@/lib/world/ventures";
import { openVenture, openVentures, rowOf, settleVenture } from "./ventures-server";

// Careers (docs/LIFE_WHEEL.md, phase 5; src/lib/world/ventures.ts, game-db/115): starting a
// business (several at once), running their days (paying you your share), and closing one. Its moments are settled with
// the rest (./moment-actions.ts).

const n = (v: unknown) => Number(v) || 0;

async function me() {
  const userId = await currentUserId();
  if (!userId) return null;
  const db = createAdminClient();
  const { data: life } = await db.from("lives").select("region").eq("user_id", userId).maybeSingle();
  if (!life) return null;
  const perMint = regionMap(String(life.region ?? "lagos"))?.region.prices.perMint ?? 1500;
  return { userId, db, perMint };
}

/** One business you run, for the career screen. */
export type OpenBusiness = {
  id: number;
  venture: Venture;
  startedAt: string;
  crisis: boolean;
  ready: boolean;
  /** What it paid you just now, catching up (naira). */
  justPaid: number;
  /** What it makes an hour on an ordinary day as it is now (naira): paid to you, and its own profit (below 0: losing). */
  hourly: { pay: number; profit: number };
  /** When its next day of business is counted, and when its next decision can come. */
  nextDayAt: string;
  nextMomentAt: string;
  /** What it still needs for the next stage (null at Empire). */
  next: ReturnType<typeof nextStage>;
  /** Your last decisions for it: the moment, what you chose, what happened, and what it did. */
  decisions: { title: string; emoji: string; chose: string; text: string; did: string[]; at: string }[];
};

/** Your businesses, for the career screen. */
export type Career = {
  /** The ones you run now, oldest first. */
  open: OpenBusiness[];
  /** How many you can run at once. */
  max: number;
  /** One just went under (counting its days). */
  justClosed: boolean;
  past: { kind: VentureKindId; name: string; best: number; paid: number; startedAt: string; closedAt: string }[];
  /** What you can spend (mint), and naira per mint. */
  canSpend: number;
  perMint: number;
  /** game-db/115 not run yet. */
  missing: boolean;
};

export async function myCareer(): Promise<Career | null> {
  const m = await me().catch(() => null);
  if (!m) return null;
  const found = await openVentures(m.db, m.userId);
  const [{ data: past }, spend] = await Promise.all([
    found.missing ? Promise.resolve({ data: [] as Record<string, unknown>[] }) : m.db.from("ventures").select("*").eq("user_id", m.userId).not("closed_at", "is", null).order("closed_at", { ascending: false }).limit(10),
    m.db.rpc("life_can_spend", { p_user: m.userId, p_pots: [] }),
  ]);
  const settled = await Promise.all(found.rows.map((r) => settleVenture(m.db, m.userId, m.perMint, r)));
  const justClosed = settled.some((s) => s.closed);
  const running = settled.flatMap((s) => (s.row ? [{ row: s.row, paid: s.paid }] : []));
  // Your business decisions since the first of them started (each says which business it was for;
  // older ones, from when you could run only one, belong to whichever was running then).
  const since = running.reduce((a, r) => (r.row.startedAt < a ? r.row.startedAt : a), running[0]?.row.startedAt ?? new Date().toISOString());
  const { data: rows } = running.length
    ? await m.db
        .from("moments")
        .select("moment, vars, choice, outcome, marks, answered_at, created_at")
        .eq("user_id", m.userId)
        .like("moment", "biz_%")
        .gte("created_at", since)
        .gte("choice", 0)
        .order("answered_at", { ascending: false })
        .limit(60)
    : { data: [] as Record<string, unknown>[] };
  const money = (x: number) => `₦${Math.round(x).toLocaleString("en-GB")}`;
  const open: OpenBusiness[] = running.map(({ row, paid }) => {
    const v = row.venture;
    const crisis = inCrisis(v);
    const decisions = (rows ?? [])
      .filter((r) => {
        const which = n(((r.vars ?? {}) as { venture?: unknown }).venture);
        return which ? which === row.id : String(r.created_at) >= row.startedAt;
      })
      .slice(0, 10)
      .flatMap((r) => {
        const def = MOMENT_BY_ID.get(String(r.moment));
        const c = def?.choices[n(r.choice)];
        if (!def || !c) return [];
        const vars = (r.vars ?? {}) as MomentVars;
        const marks = (r.marks ?? {}) as { biz?: Parameters<typeof changeWords>[0] };
        return [{ title: def.title, emoji: def.emoji, chose: fillMoment(c.label, { name: vars.name ?? "", ask: n(vars.ask), place: vars.place ?? "" }, money), text: String((r.outcome as { text?: string } | null)?.text ?? ""), did: marks.biz ? changeWords(marks.biz) : [], at: String(r.answered_at) }];
      });
    return {
      id: row.id,
      venture: v,
      startedAt: row.startedAt,
      crisis,
      ready: readyToGrow(v),
      justPaid: paid,
      hourly: ventureHourly(v),
      nextDayAt: new Date(Date.parse(row.settledAt) + 86_400_000).toISOString(),
      nextMomentAt: new Date(Date.parse(row.lastMomentAt) + (crisis ? CRISIS_EVERY_H : BUSINESS_EVERY_H) * 3_600_000).toISOString(),
      next: nextStage(v),
      decisions,
    };
  });
  return {
    open,
    max: MAX_VENTURES,
    justClosed,
    past: (past ?? []).map((r) => {
      const row = rowOf(r);
      return { kind: row.venture.kind, name: row.venture.name, best: row.venture.best, paid: row.venture.paid, startedAt: row.startedAt, closedAt: String(r.closed_at) };
    }),
    canSpend: spend.error ? 0 : n(spend.data),
    perMint: m.perMint,
    missing: found.missing,
  };
}

/** Start a business of this kind, with this name. */
export async function startVenture(kind: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await me().catch(() => null);
  if (!m) return { ok: false, error: "Sign in first." };
  const k = VENTURE_KIND_BY_ID.get(kind as VentureKindId);
  const clean = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!k) return { ok: false, error: "Pick what to start." };
  if (clean.length < 2) return { ok: false, error: "Give it a name." };
  const { data: id, error } = await m.db.rpc("venture_start", {
    p_user: m.userId,
    p_kind: k.id,
    p_name: clean,
    p_cost: Math.round((k.start / m.perMint) * 100) / 100,
    p_state: newVenture(k.id, clean),
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("not_enough")) return { ok: false, error: "You don't have enough in your wallet to start this yet." };
    // Before game-db/129 is run, one at a time.
    if (msg.includes("has_one")) return { ok: false, error: "You already run a business. Running more than one is switched on soon." };
    if (msg.includes("too_many")) return { ok: false, error: `You already run ${MAX_VENTURES} businesses, the most at once. Close one to start another.` };
    if (msg.includes("venture_start")) return { ok: false, error: "Businesses are switched on soon." };
    console.error("Start a business", msg);
    return { ok: false, error: "Something went wrong. Try again." };
  }
  // Its first decision comes within a few hours, not days.
  await m.db
    .from("ventures")
    .update({ last_moment_at: new Date(Date.now() - (BUSINESS_EVERY_H - FIRST_MOMENT_H) * 3_600_000).toISOString() })
    .eq("id", n(id))
    .eq("user_id", m.userId)
    .then(
      () => null,
      () => null,
    );
  return { ok: true };
}

/** Close one of your businesses for good (you keep what it paid you; its cash, in debt or not, goes with it). */
export async function closeVenture(id: number): Promise<{ ok: boolean }> {
  const m = await me().catch(() => null);
  if (!m || !(n(id) > 0)) return { ok: false };
  const found = await openVenture(m.db, m.userId, n(id));
  if (!found.row) return { ok: false };
  const { error } = await m.db.rpc("venture_save", {
    p_user: m.userId,
    p_id: found.row.id,
    p_was: found.row.settledAt,
    p_state: found.row.venture,
    p_pay: 0,
    p_settled: null,
    p_moment: false,
    p_close: true,
  });
  return { ok: !error };
}
