import { NextResponse } from "next/server";
import { fetchRates } from "@/lib/rates";

/**
 * GET /api/rates: naira for one of each currency players can show money in, today. The same for
 * everyone, so the CDN hands out one answer every few hours (docs/COSTS.md). With no feed
 * answering, an empty table: phones keep the rough built-in rates.
 */
export async function GET() {
  const rates = await fetchRates();
  if (!rates) return NextResponse.json({ rates: {}, at: 0 }, { headers: { "Cache-Control": "public, s-maxage=600" } });
  return NextResponse.json({ rates, at: Date.now() }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
}
