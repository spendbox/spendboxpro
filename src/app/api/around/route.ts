import { NextResponse, type NextRequest } from "next/server";
import { peopleNear } from "@/app/play/people-actions";
import { marksNear } from "@/app/play/mark-actions";
import { createAdminClient } from "@/lib/supabase/admin";

// The map's regular look round (people about, marks left) as a plain GET, not a server action:
// a phone runs server actions one at a time, so polls done that way made taps on tabs wait.

/** How many are online in each city, worked out at most every 30 s per server (the same for everyone). */
const onlineCache = new Map<string, { at: number; n: number }>();
async function onlineIn(region: string) {
  const hit = onlineCache.get(region);
  if (hit && Date.now() - hit.at < 30_000) return hit.n;
  const { count } = await createAdminClient().from("lives").select("user_id", { count: "exact", head: true }).eq("region", region).gt("seen_at", new Date(Date.now() - 4 * 60_000).toISOString());
  const n = count ?? hit?.n ?? 0;
  onlineCache.set(region, { at: Date.now(), n });
  return n;
}

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
          online: await onlineIn(region),
        }
      : what === "marks"
        ? { marks: await marksNear(region, x, z) }
        : {};
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
