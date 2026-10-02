import { timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { syncConnection } from "@/lib/bank/sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Mono calls this when a connected account has new data, or needs the
// business to log in to its bank again. Set it up in the Mono dashboard:
// Settings → Webhooks → https://<your site>/api/mono/webhook, with the same
// secret as MONO_WEBHOOK_SECRET.

function secretMatches(given: string | null) {
  const expected = process.env.MONO_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Raw = Record<string, unknown>;

function accountIdOf(data: Raw | undefined) {
  const account = data?.account as Raw | string | undefined;
  const id = typeof account === "string" ? account : (account?._id ?? account?.id ?? data?.id ?? data?._id);
  return typeof id === "string" ? id : null;
}

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("mono-webhook-secret"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { event?: string; data?: Raw } | null;
  const event = body?.event ?? "";
  const accountId = accountIdOf(body?.data);
  if (!accountId) return NextResponse.json({ ok: true, ignored: true });

  const admin = createAdminClient();
  const { data: conn } = await admin.from("bank_connections").select("id").eq("mono_account_id", accountId).maybeSingle();
  if (!conn) return NextResponse.json({ ok: true, ignored: true });

  if (event === "mono.events.reauthorisation_required") {
    await admin.from("bank_connections").update({ status: "reauth" }).eq("id", conn.id);
  } else if (event === "mono.events.account_updated" || event === "mono.events.account_reauthorized") {
    // Answer Mono straight away; fetch the new payments in the background.
    after(() => syncConnection(conn.id).catch((e) => console.error("Mono sync failed", e)));
  }
  return NextResponse.json({ ok: true });
}
