import { NextResponse } from "next/server";
import { adImageUrl } from "@/lib/ads";
import { createAdminClient } from "@/lib/supabase/admin";

const NO_STORE = { "Cache-Control": "no-store" };

type Served = { id: string; image_path: string; headline: string; brand: string; link_url: string | null };

/**
 * GET /api/ads/serve?n=24&region=lagos → { ads: [{ id, image, headline, brand, link }] }
 * A fresh, weighted pick of live ads for the billboards: only ads that are running, not paused,
 * and can still pay a reward. Ads with more coins to spend per hour left come up more. With a
 * region, only ads for that region (or for everywhere) (game-db/084).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const raw = Number(params.get("n") ?? 24);
  const n = Math.max(1, Math.min(Number.isFinite(raw) ? Math.floor(raw) : 24, 40));
  const region = params.get("region");
  try {
    const db = createAdminClient();
    let { data, error } = region && /^[a-z0-9-]{1,40}$/.test(region) ? await db.rpc("ad_serve_in", { p_n: n, p_region: region }) : await db.rpc("ad_serve", { p_n: n });
    // Before game-db/084 is run there are no regions: every ad, as before.
    if (error && region) ({ data, error } = await db.rpc("ad_serve", { p_n: n }));
    if (error) throw error;
    const ads = ((data ?? []) as Served[]).map((a) => ({
      id: a.id,
      image: adImageUrl(a.image_path),
      headline: a.headline,
      brand: a.brand,
      link: a.link_url ?? null,
    }));
    return NextResponse.json({ ads }, { headers: NO_STORE });
  } catch (error) {
    console.error("Serving ads failed", error);
    return NextResponse.json({ ads: [] }, { headers: NO_STORE });
  }
}
