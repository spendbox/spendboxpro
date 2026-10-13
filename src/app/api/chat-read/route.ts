import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/chat-read { from }: you've read your private messages from this person (game-db/071).
 * They see "Opened", and those messages stop counting on all your phones. A plain request, so it
 * never waits behind the game's other calls. Before part 71 is run it does nothing (and says so).
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  const body = (await req.json().catch(() => null)) as { from?: unknown } | null;
  const from = String(body?.from ?? "");
  if (!userId || !/^[0-9a-f-]{36}$/i.test(from)) return NextResponse.json({ ok: false });
  const { error } = await createAdminClient()
    .from("chat_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .eq("sender_id", from)
    .is("read_at", null);
  return NextResponse.json({ ok: !error });
}
