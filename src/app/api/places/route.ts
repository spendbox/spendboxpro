import { NextResponse, type NextRequest } from "next/server";
import { searchNamedPlaces } from "@/lib/place-search";

/** GET /api/places?region=lagos&q=tolu → { places: [{ label, note, building }] }: names players gave places. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  try {
    const places = await searchNamedPlaces(q.get("region") ?? "", q.get("q") ?? "");
    return NextResponse.json({ places }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch {
    return NextResponse.json({ places: [] });
  }
}
