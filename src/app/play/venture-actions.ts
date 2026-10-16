"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { VENTURE_KIND_BY_ID, inCrisis, newVenture, readyToGrow, type Venture, type VentureKindId } from "@/lib/world/ventures";
import { openVenture, rowOf, settleVenture } from "./ventures-server";

// Careers (docs/LIFE_WHEEL.md, phase 5; src/lib/world/ventures.ts, game-db/115): starting a
// business, running its days (paying you your share), and closing it. Its moments are settled with
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

/** Your business, for the career screen. */
export type Career = {
  open: {
    venture: Venture;
    startedAt: string;
    crisis: boolean;
    ready: boolean;
    /** What it paid you just now, catching up (naira). */
    justPaid: number;
  } | null;
  /** It just went under (counting its days). */
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
  const found = await openVenture(m.db, m.userId);
  const [{ data: past }, spend] = await Promise.all([
    found.missing ? Promise.resolve({ data: [] as Record<string, unknown>[] }) : m.db.from("ventures").select("*").eq("user_id", m.userId).not("closed_at", "is", null).order("closed_at", { ascending: false }).limit(10),
    m.db.rpc("life_can_spend", { p_user: m.userId, p_pots: [] }),
  ]);
  let open: Career["open"] = null;
  let justClosed = false;
  if (found.row) {
    const s = await settleVenture(m.db, m.userId, m.perMint, found.row);
    justClosed = s.closed;
    if (s.row) {
      open = { venture: s.row.venture, startedAt: s.row.startedAt, crisis: inCrisis(s.row.venture), ready: readyToGrow(s.row.venture), justPaid: s.paid };
    }
  }
  return {
    open,
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
  const { error } = await m.db.rpc("venture_start", {
    p_user: m.userId,
    p_kind: k.id,
    p_name: clean,
    p_cost: Math.round((k.start / m.perMint) * 100) / 100,
    p_state: newVenture(k.id, clean),
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("not_enough")) return { ok: false, error: "You don't have enough in your wallet to start this yet." };
    if (msg.includes("has_one")) return { ok: false, error: "You already run a business." };
    if (msg.includes("venture_start")) return { ok: false, error: "Businesses are switched on soon." };
    console.error("Start a business", msg);
    return { ok: false, error: "Something went wrong. Try again." };
  }
  return { ok: true };
}

/** Close your business for good (you keep what it paid you; its cash, in debt or not, goes with it). */
export async function closeVenture(): Promise<{ ok: boolean }> {
  const m = await me().catch(() => null);
  if (!m) return { ok: false };
  const found = await openVenture(m.db, m.userId);
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
