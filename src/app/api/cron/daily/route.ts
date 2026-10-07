import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Vercel runs this once a day (see vercel.json): tops broke players up to the floor,
// and nudges the round clock in case the every-minute database job is not running.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const db = createAdminClient();
  const tick = await db.rpc("tick");
  const upkeep = await db.rpc("daily_upkeep");
  const error = tick.error ?? upkeep.error;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tick: tick.data, upkeep: upkeep.data });
}
