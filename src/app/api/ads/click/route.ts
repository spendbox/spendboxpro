import { NextResponse } from "next/server";
import { UUID_RE, viewerKey } from "@/lib/ads";
import { createAdminClient } from "@/lib/supabase/admin";

/** POST /api/ads/click  body { adId } → { ok: true }. Someone followed the ad's link. */
export async function POST(request: Request) {
  try {
    const adId = String(((await request.json()) as { adId?: unknown }).adId ?? "");
    if (UUID_RE.test(adId)) {
      const { error } = await createAdminClient().rpc("ad_click", { p_ad: adId.toLowerCase(), p_viewer: viewerKey(request) });
      if (error) console.error("Counting ad click failed", error);
    }
  } catch {}
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
