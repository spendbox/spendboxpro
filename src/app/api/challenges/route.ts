import { NextResponse, type NextRequest } from "next/server";
import { challengeView, nearbyChallenges } from "@/app/play/fight/challenge-actions";

/**
 * GET /api/challenges: challenges near a spot (?region=&x=&z=), or one challenge as it is now
 * (?id=). The game asks every few seconds; as a plain request (not a server action) it never
 * holds up the taps queued behind it (going somewhere, opening a list).
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const headers = { "Cache-Control": "no-store" };
  const id = Number(p.get("id"));
  if (p.get("id") !== null) {
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ view: null }, { headers });
    return NextResponse.json({ view: await challengeView(id).catch(() => null) }, { headers });
  }
  const region = String(p.get("region") ?? "");
  const x = Number(p.get("x"));
  const z = Number(p.get("z"));
  if (!Number.isFinite(x) || !Number.isFinite(z)) return NextResponse.json({ list: [], mine: null }, { headers });
  return NextResponse.json(await nearbyChallenges(region, x, z).catch(() => ({ list: [], mine: null })), { headers });
}
