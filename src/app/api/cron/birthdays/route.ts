import { NextResponse } from "next/server";
import { runBillingCheck } from "@/lib/billing-server";
import { notifyRewardsReady } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

// Vercel runs this once a day (see vercel.json): hands out birthday treats, and
// sends plan reminders and pauses businesses that haven't paid (fair use).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("sync_birthday_rewards");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await notifyRewardsReady();
  const billing = await runBillingCheck().catch((e) => {
    console.error("Billing check failed", e);
    return null;
  });
  return NextResponse.json({ ok: true, membersChecked: data, billing });
}
