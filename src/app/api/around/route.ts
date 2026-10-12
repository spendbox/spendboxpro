import { NextResponse, type NextRequest } from "next/server";
import { peopleNear } from "@/app/play/people-actions";
import { marksNear } from "@/app/play/mark-actions";

// The map's regular look round (people about, marks left) as a plain GET, not a server action:
// a phone runs server actions one at a time, so polls done that way made taps on tabs wait.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const region = q.get("region") ?? "";
  const x = Number(q.get("x")) || 0;
  const z = Number(q.get("z")) || 0;
  const what = q.get("what");
  const body = what === "people" ? { people: await peopleNear(region, x, z) } : what === "marks" ? { marks: await marksNear(region, x, z) } : {};
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
