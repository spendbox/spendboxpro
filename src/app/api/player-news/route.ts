import { NextResponse, type NextRequest } from "next/server";
import { playerNews } from "@/app/play/news-actions";
import { REGIONS } from "@/lib/world";

/**
 * GET /api/player-news?region=lagos: players in the news (big buys, businesses, rich arrivals,
 * challenges won, big parties). The same for everyone, so the CDN hands out one answer a minute
 * instead of every phone asking the database (docs/COSTS.md).
 */
export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get("region") ?? "";
  if (!REGIONS[region]) return NextResponse.json({ events: [] }, { status: 400 });
  const events = await playerNews(region);
  return NextResponse.json({ events }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
}
