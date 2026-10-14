import { NextResponse } from "next/server";
import { sendAdReports } from "@/lib/ad-emails";
import { createAdminClient } from "@/lib/supabase/admin";
import { tickLife } from "@/app/play/life-tick";
import { clearOldTownHall } from "@/lib/town-hall";
import { confirmPack } from "@/app/play/pack-actions";
import { confirmTopUp } from "@/app/play/topup-actions";

// Vercel runs this once a day (see vercel.json): tops broke players up to the floor,
// deletes chats (and voice notes) from finished maps, and nudges the round clock in
// case the every-minute database job is not running.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const db = createAdminClient();
  let tick = await db.rpc("tick_with_extras");
  if (tick.error) tick = await db.rpc("tick");
  const upkeep = await db.rpc("daily_upkeep");
  const error = tick.error ?? upkeep.error;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Old chats: everything from rounds that finished more than an hour ago.
  const { data: old } = await db
    .from("rounds")
    .select("id")
    .eq("status", "done")
    .lt("finished_at", new Date(Date.now() - 3600_000).toISOString());
  const roundIds = (old ?? []).map((r) => r.id);
  let removed = 0;
  for (let i = 0; i < roundIds.length; i += 50) {
    const batch = roundIds.slice(i, i + 50);
    // Only what's over a week old: on the real map chats (private ones included) and the Town Hall
    // aren't per round, and the chat screens keep a week of them.
    const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: voice } = await db.from("chat_messages").select("audio_path").in("round_id", batch).lt("created_at", week).not("audio_path", "is", null);
    const paths = (voice ?? []).map((v) => v.audio_path as string);
    for (let j = 0; j < paths.length; j += 500) await db.storage.from("voice").remove(paths.slice(j, j + 500));
    // Private messages (no room), then places' chats (the Town Hall clears itself, below).
    const dms = await db.from("chat_messages").delete({ count: "exact" }).in("round_id", batch).lt("created_at", week).is("room", null);
    const rooms = await db.from("chat_messages").delete({ count: "exact" }).in("round_id", batch).lt("created_at", week).not("room", "like", "town:%");
    removed += (dms.count ?? 0) + (rooms.count ?? 0);
  }
  // The Town Hall: everything over a day old (and its photos).
  try {
    for (let k = 0; k < 20 && (await clearOldTownHall(1000)) > 0; k++);
  } catch (e) {
    console.error("Clearing the Town Hall failed", e);
  }
  // Pay day for players who haven't been in: a game week or more of pay from their job and side
  // hustles goes into their wallets (tickLife pays it; game-db/049_reports_and_work.sql).
  let paid = 0;
  try {
    const { data: due } = await db.rpc("life_pay_due", { p_limit: 500 });
    for (const id of (due ?? []) as string[]) {
      await tickLife(id);
      paid++;
    }
  } catch (e) {
    console.error("Weekly pay run failed", e);
  }
  // Payments still waiting (top-ups and starter packs) from the last three days: asked again, and
  // credited if Paystack says they went through (in case the webhook and the player both missed it).
  let credited = 0;
  try {
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const [tu, pk] = await Promise.all([
      db.from("topups").select("reference").eq("status", "pending").gte("created_at", since).limit(300),
      db.from("starter_payments").select("reference").eq("status", "pending").gte("created_at", since).limit(100),
    ]);
    for (const r of tu.data ?? []) if ((await confirmTopUp(String(r.reference)).catch(() => null))?.fresh) credited++;
    for (const r of pk.data ?? []) if ((await confirmPack(String(r.reference)).catch(() => null))?.ok) credited++;
  } catch (e) {
    console.error("Payment re-check failed", e);
  }
  // Advertisers' and sponsors' daily report emails (never allowed to break this job).
  let ads: unknown = null;
  try {
    ads = await sendAdReports();
  } catch (e) {
    console.error("Ad reports failed", e);
  }
  return NextResponse.json({ ok: true, tick: tick.data, upkeep: upkeep.data, chatRemoved: removed, ads, paid, credited });
}
