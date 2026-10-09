import { NextResponse } from "next/server";
import { UUID_RE, viewerKey } from "@/lib/ads";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/ads/track  body { views: { "<ad id>": count } } → { ok: true }
 * Counts "seen on billboards" (an ad on someone's screen). Never charged to the advertiser:
 * paid views are taps on the ad's button (see /api/ads/cta). Each viewer can add only a limited number per ad
 * per hour (the database enforces it); silly numbers are ignored.
 */
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 8000) return NextResponse.json({ ok: true });
    const body = JSON.parse(text) as { views?: unknown };
    const views: Record<string, number> = {};
    if (body.views && typeof body.views === "object" && !Array.isArray(body.views)) {
      for (const [id, count] of Object.entries(body.views as Record<string, unknown>).slice(0, 40)) {
        const c = Math.floor(Number(count));
        if (UUID_RE.test(id) && Number.isFinite(c) && c > 0) views[id.toLowerCase()] = Math.min(c, 30);
      }
    }
    if (Object.keys(views).length > 0) {
      const { error } = await createAdminClient().rpc("ad_track_views", { p_views: views, p_viewer: viewerKey(request) });
      if (error) console.error("Tracking ad views failed", error);
    }
  } catch {
    // A bad request is simply ignored.
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
