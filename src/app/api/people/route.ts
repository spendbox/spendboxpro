import { NextResponse, type NextRequest } from "next/server";
import { findPeople } from "@/app/play/people-actions";

/**
 * GET /api/people?region=&x=&z=&q=: everyone on the map, nearest first (or matching a name). A
 * plain request, so opening the list doesn't wait behind other things the game is doing.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const people = await findPeople(String(p.get("region") ?? ""), Number(p.get("x")) || 0, Number(p.get("z")) || 0, String(p.get("q") ?? "")).catch(() => []);
  return NextResponse.json({ people }, { headers: { "Cache-Control": "no-store" } });
}
