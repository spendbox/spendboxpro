import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/active: a minute of you actually playing (the game sends it at most once a minute,
 * only while it's open in front of you and you've touched it lately). It counts towards tomorrow's
 * daily gift (game-db/073; the database counts one a minute at most, whatever is sent).
 */
export async function POST() {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ ok: false });
  const { data, error } = await createAdminClient().rpc("active_ping", { p_user: userId });
  return NextResponse.json({ ok: !error, minutes: Number(data ?? 0) || 0 });
}
