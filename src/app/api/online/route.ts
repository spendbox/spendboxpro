import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/online?ids=a,b,c: which of these players are online right now (seen in the last four
 * minutes, the same as the people list). Used by the recent people down the left side.
 */
export async function GET(req: NextRequest) {
  const ids = String(req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 20);
  if (!ids.length || !(await currentUserId().catch(() => null))) return NextResponse.json({ online: [] }, { headers: { "Cache-Control": "no-store" } });
  const since = new Date(Date.now() - 4 * 60_000).toISOString();
  const { data } = await createAdminClient().from("lives").select("user_id").in("user_id", ids).gt("seen_at", since);
  const online = [...new Set(((data ?? []) as { user_id: string }[]).map((r) => String(r.user_id)))];
  return NextResponse.json({ online }, { headers: { "Cache-Control": "no-store" } });
}
