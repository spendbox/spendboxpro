import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

const n = (v: unknown) => Number(v ?? 0) || 0;

/**
 * POST /api/income: pay what your property has earned since last time (game-db/079; docs/MONEY.md).
 * Answers { paid, perDay, at, coins, total, now } in mint (at: what it's counted up to; now: the
 * server's clock, so the screen counts from the same time), or null before
 * part 79 is run or when signed out.
 */
export async function POST() {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json(null);
  const db = createAdminClient();
  // At most once a minute (game-db/079 property_income_settle_soft); the plain one before that's run.
  let { data, error } = await db.rpc("property_income_settle_soft", { p_user: userId });
  if (error) ({ data, error } = await db.rpc("property_income_settle", { p_user: userId }));
  if (error || !data) return NextResponse.json(null);
  const d = data as Record<string, unknown>;
  return NextResponse.json({ paid: n(d.paid), perDay: n(d.per_day), at: d.at ? String(d.at) : null, coins: n(d.coins), total: n(d.total), now: Date.now() });
}
