import { NextResponse, type NextRequest } from "next/server";
import { peopleNear } from "@/app/play/people-actions";
import { marksNear } from "@/app/play/mark-actions";
import { createAdminClient } from "@/lib/supabase/admin";

// The map's regular look round (people about, marks left) as a plain GET, not a server action:
// a phone runs server actions one at a time, so polls done that way made taps on tabs wait.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const region = q.get("region") ?? "";
  const x = Number(q.get("x")) || 0;
  const z = Number(q.get("z")) || 0;
  const what = q.get("what");
  const body =
    what === "people"
      ? {
          people: await peopleNear(region, x, z),
          // Everyone online in the city right now (seen in the last 4 minutes).
          online: (await createAdminClient().from("lives").select("user_id", { count: "exact", head: true }).eq("region", region).gt("seen_at", new Date(Date.now() - 4 * 60_000).toISOString())).count ?? 0,
        }
      : what === "marks"
        ? { marks: await marksNear(region, x, z) }
        : {};
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
