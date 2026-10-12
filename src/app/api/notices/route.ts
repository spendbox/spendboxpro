import { NextResponse, type NextRequest } from "next/server";
import { mintify } from "@/lib/brand";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/notices?after=<id>: your newest notices on the real map (a gift, someone at your door, a
 * sale, a thank-you) after that id, oldest first. The game asks every few seconds, and straight
 * away when a push arrives, so they pop up while you play (one at a time).
 */
export async function GET(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ notices: [] });
  const after = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get("after")) || 0));
  const { data } = await createAdminClient()
    .from("notifications")
    .select("id, kind, body, tile, created_at")
    .eq("user_id", userId)
    .or("round_id.is.null,kind.in.(hug,handshake,gift,spray,thanks)")
    .gt("id", after)
    .gte("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString())
    .order("id", { ascending: true })
    .limit(20);
  const notices = (data ?? []).map((n) => ({ id: Number(n.id), kind: String(n.kind), body: mintify(String(n.body)), tile: (n.tile ?? null) as number | null, at: String(n.created_at) }));
  return NextResponse.json({ notices }, { headers: { "Cache-Control": "no-store" } });
}
