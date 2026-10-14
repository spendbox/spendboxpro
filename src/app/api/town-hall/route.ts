import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";

// Town Hall (game-db/085): one chat for each state that everyone online can talk in.
// GET: the latest 50 messages, the same answer for everyone (so the CDN can hand it out for a
// couple of seconds: thousands of phones asking every few seconds cost the database very little).
// POST { region, text }: say something (one message every 5 seconds).

export type TownMessage = { id: number; from: string; name: string; avatar: unknown; text: string; at: string };

const words: Record<string, string> = {
  too_fast: "One message every 5 seconds. Take a breath!",
  too_long: "That's a bit long: 300 letters at most.",
  empty: "Type something first.",
  frozen: "Your account is paused, so you can't talk here right now.",
  no_name: "Pick a player name first.",
  bad_room: "That Town Hall isn't open.",
};

export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get("region") ?? "";
  if (!REGIONS[region]) return NextResponse.json({ messages: [] });
  const db = createAdminClient();
  const { data, error } = await db
    .from("chat_messages")
    .select("id, sender_id, sender_name, body, created_at")
    .eq("room", `town:${region}`)
    .order("id", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ messages: [], off: true }, { headers: { "Cache-Control": "public, s-maxage=30" } });
  const rows = (data ?? []) as { id: number; sender_id: string; sender_name: string; body: string | null; created_at: string }[];
  const ids = [...new Set(rows.map((r) => r.sender_id))];
  const { data: faces } = ids.length ? await db.from("profiles").select("id, avatar").in("id", ids) : { data: [] };
  const faceOf = new Map(((faces ?? []) as { id: string; avatar: unknown }[]).map((f) => [f.id, f.avatar]));
  const messages: TownMessage[] = rows
    .reverse()
    .map((r) => ({ id: r.id, from: r.sender_id, name: r.sender_name, avatar: faceOf.get(r.sender_id) ?? null, text: r.body ?? "", at: r.created_at }));
  return NextResponse.json({ messages }, { headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=4" } });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in to talk in the Town Hall." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { region?: unknown; text?: unknown } | null;
  const region = String(body?.region ?? "");
  const text = String(body?.text ?? "").slice(0, 400);
  if (!REGIONS[region]) return NextResponse.json({ ok: false, error: words.bad_room });
  const { data, error } = await createAdminClient().rpc("town_hall_send", { p_user: userId, p_region: region, p_body: text });
  if (error) {
    if (/town_hall_send|does not exist/.test(error.message)) return NextResponse.json({ ok: false, error: "The Town Hall opens soon." });
    const code = Object.keys(words).find((k) => error.message.includes(k));
    return NextResponse.json({ ok: false, error: code ? words[code] : "Couldn't send. Try again." });
  }
  const m = data as { id: number; sender_id: string; sender_name: string; body: string; created_at: string };
  return NextResponse.json({ ok: true, message: { id: m.id, from: m.sender_id, name: m.sender_name, avatar: null, text: m.body, at: m.created_at } satisfies TownMessage });
}
