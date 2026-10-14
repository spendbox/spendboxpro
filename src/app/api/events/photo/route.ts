import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// A photo said in an event's chat (game-db/095's public "events" bucket, under chat/). POST (form:
// id, the event; photo, a JPEG the phone has already shrunk): only someone who came in (or the
// host), while it's on. Returns its url; the phone sends it to the room.

const MAX_BYTES = 600_000;
const BUCKET = "events";

export async function POST(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in again." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const id = Number(form?.get("id"));
  const file = form?.get("photo");
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Unknown event." });
  if (!file || typeof file === "string" || file.size === 0) return NextResponse.json({ ok: false, error: "Pick a photo first." });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "That photo is too big. Try another." });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return NextResponse.json({ ok: false, error: "Please use a JPG photo." });
  const db = createAdminClient();
  const [{ data: ev }, { data: me }] = await Promise.all([
    db.from("hosted_events").select("host_id, status, ends_at").eq("id", id).maybeSingle(),
    db.from("hosted_event_guests").select("entered_at").eq("event_id", id).eq("user_id", userId).maybeSingle(),
  ]);
  if (!ev || ev.status !== "on" || Date.parse(String(ev.ends_at)) <= Date.now()) return NextResponse.json({ ok: false, error: "That event is over." });
  if (ev.host_id !== userId && !me?.entered_at) return NextResponse.json({ ok: false, error: "Go in first to send photos." });
  const path = `chat/${id}/${randomBytes(12).toString("base64url")}.jpg`;
  const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (up.error) {
    console.error("Event photo upload failed", up.error.message);
    return NextResponse.json({ ok: false, error: /bucket/i.test(up.error.message) ? "Photos are switched on soon." : "Couldn't send that photo. Try again." });
  }
  return NextResponse.json({ ok: true, url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
}
