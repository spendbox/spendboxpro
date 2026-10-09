import { NextResponse } from "next/server";
import { UUID_RE, viewerKey } from "@/lib/ads";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

type Reason = "signed_out" | "daily_limit" | "already_today" | "pool_empty";
const REASONS: Reason[] = ["signed_out", "daily_limit", "already_today", "pool_empty"];

/**
 * POST /api/ads/cta  body { adId } → { ok: true, coins, leftToday, reason? }
 * Someone tapped the ad's button ("Visit <brand>", or "Thanks, <brand>!" when it has no link).
 * A signed-in player gets 5 mint from the ad's pool (at most 5 ads a day, once per ad): that's
 * the paid view the advertiser pays for. When coins is 0, reason says why. The tap also
 * counts as a link click when the ad has a link.
 */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  let adId = "";
  try {
    adId = String(((await request.json()) as { adId?: unknown }).adId ?? "");
  } catch {}
  if (!UUID_RE.test(adId)) return NextResponse.json({ ok: false, error: "That ad wasn't found." }, { status: 400, headers });
  const userId = await currentUserId().catch(() => null);
  const { data, error } = await createAdminClient().rpc("ad_cta", {
    p_ad: adId.toLowerCase(),
    p_user: userId,
    p_viewer: viewerKey(request),
  });
  if (error) {
    const gone = error.message.includes("isn't showing");
    if (!gone) console.error("Ad button tap failed", error);
    return NextResponse.json(
      { ok: false, error: gone ? "That ad isn't showing any more." : "Something went wrong. Please try again." },
      { status: gone ? 404 : 500, headers },
    );
  }
  const r = (data ?? {}) as { coins?: number; left_today?: number; reason?: string | null };
  const coins = Number(r.coins ?? 0);
  const reason = REASONS.find((x) => x === r.reason);
  return NextResponse.json(
    { ok: true, coins, leftToday: Number(r.left_today ?? 0), ...(coins > 0 || !reason ? {} : { reason }) },
    { headers },
  );
}
