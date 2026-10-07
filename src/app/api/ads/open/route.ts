import { NextResponse } from "next/server";
import { UUID_RE, viewerKey } from "@/lib/ads";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/ads/open  body { adId } → { ok: true, coins, leftToday }
 * Someone tapped a billboard to look at the ad. Signed-in players earn a few coins (a limited
 * number of times a day, once per ad); visitors without an account get none.
 */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  let adId = "";
  try {
    adId = String(((await request.json()) as { adId?: unknown }).adId ?? "");
  } catch {}
  if (!UUID_RE.test(adId)) return NextResponse.json({ ok: false, error: "That ad wasn't found." }, { status: 400, headers });
  const userId = await currentUserId().catch(() => null);
  const { data, error } = await createAdminClient().rpc("ad_open", {
    p_ad: adId.toLowerCase(),
    p_user: userId,
    p_viewer: viewerKey(request),
  });
  if (error) {
    const gone = error.message.includes("isn't showing");
    if (!gone) console.error("Opening ad failed", error);
    return NextResponse.json(
      { ok: false, error: gone ? "That ad isn't showing any more." : "Something went wrong. Please try again." },
      { status: gone ? 404 : 500, headers },
    );
  }
  const r = (data ?? {}) as { coins?: number; left_today?: number };
  return NextResponse.json({ ok: true, coins: Number(r.coins ?? 0), leftToday: Number(r.left_today ?? 0) }, { headers });
}
