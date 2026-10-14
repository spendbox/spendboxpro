import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { townError } from "@/lib/town-hall";

/** POST { id, emoji }: react to a Town Hall message (emoji null or "": take it back). */
export async function POST(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in to react." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: unknown; emoji?: unknown } | null;
  const id = Number(body?.id);
  const emoji = typeof body?.emoji === "string" ? body.emoji.slice(0, 16) : null;
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "That message has gone." });
  const { error } = await createAdminClient().rpc("town_hall_react", { p_user: userId, p_message: id, p_emoji: emoji || null });
  return NextResponse.json(error ? { ok: false, error: townError(error.message) } : { ok: true });
}
