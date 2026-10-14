import { randomBytes } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearOldTownHall, removeTownImage, TOWN_BUCKET, townError, townImageUrl, type TownMessage } from "@/lib/town-hall";
import { REGIONS } from "@/lib/world";

// Town Hall (game-db/085, 086): one chat for each state that everyone online can talk in.
// GET ?region=: the last 24 hours (newest 80), the same answer for everyone, so the CDN can hand it
//   out for a couple of seconds (thousands of phones asking every few seconds cost very little).
// POST: say something. JSON { region, text, reply? }, or a form with a photo too
//   (region, text, reply, photo: a JPEG the phone has already shrunk).

export type { TownMessage };

const MAX_PHOTO = 600_000;

export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get("region") ?? "";
  if (!REGIONS[region]) return NextResponse.json({ messages: [] });
  const db = createAdminClient();
  const feed = await db.rpc("town_hall_feed", { p_region: region });
  let messages: TownMessage[];
  if (!feed.error) {
    messages = ((feed.data ?? []) as (Omit<TownMessage, "image"> & { image: string | null })[]).map((m) => ({ ...m, text: m.text ?? "", image: townImageUrl(m.image), reactions: m.reactions ?? {} }));
  } else {
    // Before game-db/086: the plain messages.
    const { data, error } = await db.from("chat_messages").select("id, sender_id, sender_name, body, created_at").eq("room", `town:${region}`).order("id", { ascending: false }).limit(50);
    if (error) return NextResponse.json({ messages: [], off: true }, { headers: { "Cache-Control": "public, s-maxage=30" } });
    const rows = (data ?? []) as { id: number; sender_id: string; sender_name: string; body: string | null; created_at: string }[];
    const ids = [...new Set(rows.map((r) => r.sender_id))];
    const { data: faces } = ids.length ? await db.from("profiles").select("id, avatar").in("id", ids) : { data: [] };
    const faceOf = new Map(((faces ?? []) as { id: string; avatar: unknown }[]).map((f) => [f.id, f.avatar]));
    messages = rows.reverse().map((r) => ({ id: r.id, from: r.sender_id, name: r.sender_name, avatar: faceOf.get(r.sender_id) ?? null, text: r.body ?? "", image: null, at: r.created_at, reply: null, reactions: {} }));
  }
  return NextResponse.json({ messages }, { headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=4" } });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in to talk in the Town Hall." }, { status: 401 });
  let region = "";
  let text = "";
  let reply: number | null = null;
  let photo: Blob | null = null;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    region = String(form?.get("region") ?? "");
    text = String(form?.get("text") ?? "");
    reply = Number(form?.get("reply")) || null;
    const f = form?.get("photo");
    if (f instanceof Blob && f.size > 0) photo = f;
  } else {
    const body = (await req.json().catch(() => null)) as { region?: unknown; text?: unknown; reply?: unknown } | null;
    region = String(body?.region ?? "");
    text = String(body?.text ?? "");
    reply = Number(body?.reply) || null;
  }
  text = text.slice(0, 400);
  if (!REGIONS[region]) return NextResponse.json({ ok: false, error: townError("bad_room") });
  const db = createAdminClient();
  // A photo: checked, then stored, then sent with the message.
  let image: string | null = null;
  if (photo) {
    if (photo.size > MAX_PHOTO) return NextResponse.json({ ok: false, error: "That photo is too big. Try another." });
    const bytes = new Uint8Array(await photo.arrayBuffer());
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return NextResponse.json({ ok: false, error: "Please send a JPG photo." });
    const name = `${userId}/${randomBytes(12).toString("base64url")}.jpg`;
    const up = await db.storage.from(TOWN_BUCKET).upload(name, bytes, { contentType: "image/jpeg", cacheControl: "86400", upsert: false });
    if (up.error) return NextResponse.json({ ok: false, error: /bucket/i.test(up.error.message) ? "Photos in the Town Hall are switched on soon." : "Couldn't send the photo. Try again." });
    image = `${TOWN_BUCKET}/${name}`;
  }
  let { data, error } = await db.rpc("town_hall_post", { p_user: userId, p_region: region, p_body: text, p_reply: reply, p_image: image });
  // Before game-db/086: plain text only.
  if (error && /town_hall_post/.test(error.message) && !image) ({ data, error } = await db.rpc("town_hall_send", { p_user: userId, p_region: region, p_body: text }));
  if (error) {
    await removeTownImage(image);
    return NextResponse.json({ ok: false, error: townError(error.message) });
  }
  // Now and then, after answering: photos and messages over a day old go.
  if (Math.random() < 0.05) after(() => clearOldTownHall().then(() => {}, () => {}));
  const m = data as { id: number; sender_id: string; sender_name: string; body: string; image_path: string | null; reply_to: number | null; created_at: string };
  const message: TownMessage = {
    id: m.id,
    from: m.sender_id,
    name: m.sender_name,
    avatar: null,
    text: m.body,
    image: townImageUrl(m.image_path),
    at: m.created_at,
    reply: m.reply_to ? { id: m.reply_to, name: "", text: "" } : null,
    reactions: {},
  };
  return NextResponse.json({ ok: true, message });
}
