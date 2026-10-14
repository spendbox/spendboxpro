import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/active: a minute of you actually playing (the game sends it at most once a minute,
 * only while it's open in front of you and you've touched it lately). It counts towards tomorrow's
 * daily gift (game-db/073) and pays you for being online (game-db/083; up to 4 hours a day).
 * Answers { ok, minutes, paid, rate, left } (paid and rate in mint).
 */
export async function POST() {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ ok: false });
  const db = createAdminClient();
  const { data, error } = await db.rpc("online_ping", { p_user: userId });
  if (!error && data) {
    const d = data as { minutes?: number; paid?: number; rate?: number; left?: number };
    return NextResponse.json({ ok: true, minutes: Number(d.minutes ?? 0), paid: Number(d.paid ?? 0), rate: Number(d.rate ?? 0), left: Number(d.left ?? 0) });
  }
  // Before part 83 is run: counted, not paid.
  const { data: m, error: e2 } = await db.rpc("active_ping", { p_user: userId });
  return NextResponse.json({ ok: !e2, minutes: Number(m ?? 0) || 0, paid: 0, rate: 0, left: 0 });
}
