import { NextResponse } from "next/server";
import { syncConnection } from "@/lib/bank/sync";
import { notifyRewardsReady } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

// Vercel runs this once a day (see vercel.json): hands out birthday treats and
// fetches bank payments Mono hasn't told us about (a safety net for webhooks).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("sync_birthday_rewards");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await notifyRewardsReady();

  let banksSynced = 0;
  if (process.env.MONO_SECRET_KEY) {
    const { data: connections } = await admin.from("bank_connections").select("id").neq("status", "reauth");
    for (const c of connections ?? []) {
      await syncConnection(c.id).catch((e) => console.error("Mono sync failed", e));
      banksSynced += 1;
    }
  }
  return NextResponse.json({ ok: true, membersChecked: data, banksSynced });
}
