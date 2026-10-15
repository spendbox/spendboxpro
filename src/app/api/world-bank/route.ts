import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/world-bank: what the World Bank holds (everything players pay the city, game-db/089)
 * and what came in today, in mint. The same for everyone: the CDN hands out one answer every 15 s.
 */
export async function GET() {
  const { data, error } = await createAdminClient().rpc("world_bank_view");
  if (error || !data) return NextResponse.json(null);
  const d = data as { balance?: number; today?: number };
  return NextResponse.json({ balance: Number(d.balance ?? 0), today: Number(d.today ?? 0) }, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } });
}
