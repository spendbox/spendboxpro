import { NextResponse, type NextRequest } from "next/server";
import { REGIONS } from "@/lib/world";
import { nextGrowthAt } from "@/lib/world/growth";
import { syncGrowth } from "@/lib/world/growth-server";

/**
 * GET /api/city-growth?region=lagos: how far the city has grown (docs/GROWTH.md), so the map draws
 * the same buildings the server prices. { level, next } (players needed for the next level).
 */
export async function GET(request: NextRequest) {
  const region = request.nextUrl.searchParams.get("region") ?? "";
  if (!REGIONS[region]) return NextResponse.json({ level: 0, next: null }, { status: 400 });
  const level = await syncGrowth(region).catch(() => 0);
  return NextResponse.json({ level, next: nextGrowthAt(level) }, { headers: { "Cache-Control": "public, max-age=120, s-maxage=120" } });
}
