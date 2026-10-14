import { NextResponse, type NextRequest } from "next/server";
import { eventView, eventsAround } from "@/app/play/events/event-actions";

/**
 * GET /api/events: the events in a region that aren't over (?region=&x=&z=), or one event as it is
 * now (?id=). The game asks every so often; as a plain request (not a server action) it never holds
 * up the taps queued behind it.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const headers = { "Cache-Control": "no-store" };
  if (p.get("id") !== null) {
    const id = Number(p.get("id"));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ view: null }, { headers });
    return NextResponse.json({ view: await eventView(id).catch(() => null) }, { headers });
  }
  const x = Number(p.get("x"));
  const z = Number(p.get("z"));
  if (!Number.isFinite(x) || !Number.isFinite(z)) return NextResponse.json({ list: [] }, { headers });
  return NextResponse.json(await eventsAround(String(p.get("region") ?? ""), x, z).catch(() => ({ list: [] })), { headers });
}
