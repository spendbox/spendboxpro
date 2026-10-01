import { NextResponse } from "next/server";
import { notifyRewardsReady } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";

// Vercel runs this once a day (see vercel.json) to hand out birthday treats.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { data, error } = await createAdminClient().rpc("sync_birthday_rewards");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await notifyRewardsReady();
  return NextResponse.json({ ok: true, membersChecked: data });
}
