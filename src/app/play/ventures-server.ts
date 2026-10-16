// The books of someone's business, on the server only (docs/LIFE_WHEEL.md, phase 5; game-db/115):
// reading it, counting its days and paying the owner. Used by ./venture-actions.ts and
// ./moment-actions.ts; not an action itself, so phones can't call it.

import type { createAdminClient } from "@/lib/supabase/admin";
import { MAX_CATCH_UP_DAYS, VENTURE_KIND_BY_ID, VENTURE_STAGES, goneUnder, newVenture, ventureDays, type Venture, type VentureKindId } from "@/lib/world/ventures";

const n = (v: unknown) => Number(v) || 0;
const DAY = 86_400_000;
type Db = ReturnType<typeof createAdminClient>;

/** An open business as the database keeps it: `settledAt` exactly as stored (the save checks it). */
export type VentureRow = { id: number; venture: Venture; startedAt: string; settledAt: string; lastMomentAt: string };

export function rowOf(r: Record<string, unknown>): VentureRow {
  const kind = String(r.kind) as VentureKindId;
  const base = newVenture(VENTURE_KIND_BY_ID.has(kind) ? kind : "suya", String(r.name));
  return {
    id: n(r.id),
    venture: { ...base, ...((r.state ?? {}) as Partial<Venture>), kind, name: String(r.name) },
    startedAt: String(r.started_at),
    settledAt: String(r.settled_at),
    lastMomentAt: String(r.last_moment_at),
  };
}

/** Someone's open business (null: none, or game-db/115 not run yet: then `missing`). */
export async function openVenture(db: Db, userId: string): Promise<{ row: VentureRow | null; missing: boolean }> {
  const { data, error } = await db.from("ventures").select("*").eq("user_id", userId).is("closed_at", null).maybeSingle();
  if (error) return { row: null, missing: true };
  return { row: data ? rowOf(data) : null, missing: false };
}

/**
 * Count the days since it was last counted (up to a week; it waits while you're away longer), pay
 * you what it earned, and close it if it has gone under. Returns the business as it is now (null if
 * it closed), and what it paid (naira).
 */
export async function settleVenture(db: Db, userId: string, perMint: number, row: VentureRow): Promise<{ row: VentureRow | null; paid: number; closed: boolean }> {
  const days = Math.floor((Date.now() - Date.parse(row.settledAt)) / DAY);
  if (days < 1) return { row, paid: 0, closed: false };
  const { venture, pay } = ventureDays(row.venture, days, Math.random);
  const closed = goneUnder(venture);
  // Counted up to whole days from before; after a long time away, from now.
  const settled = days > MAX_CATCH_UP_DAYS ? new Date() : new Date(Date.parse(row.settledAt) + days * DAY);
  const { error } = await db.rpc("venture_save", {
    p_user: userId,
    p_id: row.id,
    p_was: row.settledAt,
    p_state: venture,
    p_pay: Math.round((pay / perMint) * 100) / 100,
    p_settled: settled.toISOString(),
    p_moment: false,
    p_close: closed,
  });
  // Someone else counted it at the same moment: theirs stands.
  if (error) return { row, paid: 0, closed: false };
  if (closed) return { row: null, paid: pay, closed: true };
  return { row: { ...row, venture, settledAt: settled.toISOString() }, paid: pay, closed: false };
}

/** What a business moment's amounts are scaled by, at each stage (a shop's problems cost more than a stall's). */
export function stageScale(stage: number) {
  return [1, 2.5, 8, 30, 100][Math.max(0, Math.min(VENTURE_STAGES.length - 1, stage))];
}
