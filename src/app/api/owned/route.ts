import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";

/**
 * GET /api/owned?region=lagos[&since=<ms>]: the city's owned buildings, as bought (for drawing
 * them on the map): all of them, or (since) only those that changed after then (game-db/125).
 * The same for everyone, so the CDN keeps each answer a little while and the database is asked
 * about once a minute per city, not once a minute per player. The phones round `since` down to
 * the minute, so they share answers too (fresh=1 skips the CDN: just after you bought or named
 * something). Answers { at (ms: ask from here next time), rows, full (all of them) }.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const region = q.get("region") ?? "";
  if (!REGIONS[region]) return NextResponse.json({ at: 0, rows: [], full: true }, { status: 400 });
  const sinceMs = Number(q.get("since"));
  const since = Number.isFinite(sinceMs) && sinceMs > 0 ? new Date(sinceMs).toISOString() : null;
  const db = createAdminClient();
  let body: { at: number; rows: unknown[]; full: boolean };
  const res = await db.rpc("owned_buildings_since", { p_region: region, p_since: since });
  if (!res.error && res.data) {
    const d = res.data as { at: number; rows: unknown[] };
    body = { at: Number(d.at) || Date.now(), rows: d.rows ?? [], full: !since };
  } else {
    // Before part 125 is run: everything, every time (as before).
    const all = await db.rpc("owned_buildings", { p_region: region });
    if (all.error) return NextResponse.json({ at: 0, rows: [], full: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
    body = { at: Date.now(), rows: (all.data as unknown[]) ?? [], full: true };
  }
  const cache = q.get("fresh") ? "no-store" : since ? "public, s-maxage=30, stale-while-revalidate=60" : "public, s-maxage=60, stale-while-revalidate=300";
  return NextResponse.json(body, { headers: { "Cache-Control": cache } });
}
