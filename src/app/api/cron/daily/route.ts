import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const { data: voice } = await db.from("chat_messages").select("audio_path").in("round_id", batch).not("audio_path", "is", null);
    const paths = (voice ?? []).map((v) => v.audio_path as string);
    for (let j = 0; j < paths.length; j += 500) await db.storage.from("voice").remove(paths.slice(j, j + 500));
    const { count } = await db.from("chat_messages").delete({ count: "exact" }).in("round_id", batch);
    removed += count ?? 0;
  }
  return NextResponse.json({ ok: true, tick: tick.data, upkeep: upkeep.data, chatRemoved: removed });
}
