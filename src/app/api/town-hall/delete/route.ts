import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeTownImage, townError } from "@/lib/town-hall";

/**
 * POST { id }: delete a Town Hall message. Your own goes for everyone; someone else's is hidden for
 * you, and goes for everyone once 3 people have deleted it (game-db/086).
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in again." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: true, result: "deleted" });
  const { data, error } = await createAdminClient().rpc("town_hall_delete", { p_user: userId, p_message: id });
  if (error) return NextResponse.json({ ok: false, error: townError(error.message) });
  const r = data as { result: "deleted" | "removed" | "hidden"; image: string | null };
  await removeTownImage(r.image);
  return NextResponse.json({ ok: true, result: r.result });
}
