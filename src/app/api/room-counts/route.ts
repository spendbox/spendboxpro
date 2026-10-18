import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";

/** How far round the spot asked about (tiles, 10 to a km), and the grid it's rounded to (so phones share answers). */
const R = 60;
const GRID = 20;

/**
 * GET /api/room-counts?region=lagos&x=..&z=..: how many people are in each room on this part of the
 * map (game-db/127), for the numbers over the buildings: { counts: { "<room>": n } }. The same for
 * everyone looking there, so the spot is rounded to a grid and the CDN keeps each answer 30 s.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const region = q.get("region") ?? "";
  if (!REGIONS[region]) return NextResponse.json({ counts: {} }, { status: 400 });
  const cx = Math.round((Number(q.get("x")) || 0) / GRID) * GRID;
  const cz = Math.round((Number(q.get("z")) || 0) / GRID) * GRID;
  const { data, error } = await createAdminClient().rpc("room_counts", { p_region: region, p_x0: cx - R, p_x1: cx + R, p_z0: cz - R, p_z1: cz + R });
  if (error) return NextResponse.json({ counts: {} }, { headers: { "Cache-Control": "public, s-maxage=300" } });
  return NextResponse.json({ counts: (data ?? {}) as Record<string, number> }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
}
