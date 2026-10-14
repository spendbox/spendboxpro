import { NextResponse, type NextRequest } from "next/server";
import { playerCard } from "@/app/play/people-actions";

/**
 * GET /api/people/card?id=: anyone's card. A plain request (not a server action), so opening a
 * card never waits behind something else the game is doing.
 */
export async function GET(req: NextRequest) {
  const card = await playerCard(String(req.nextUrl.searchParams.get("id") ?? "")).catch(() => null);
  return NextResponse.json({ card }, { headers: { "Cache-Control": "private, no-store" } });
}
