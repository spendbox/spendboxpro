import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// A slide for a talk (game-db/095's public "events" bucket). POST (form: id, the event; photo, a
// JPEG the phone has already shrunk): only the event's host, while it isn't over. Returns its url;
// the host then puts it on the stage (setStage).

const MAX_BYTES = 600_000;
const BUCKET = "events";

export async function POST(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in again." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const id = Number(form?.get("id"));
  const file = form?.get("photo");
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Unknown event." });
  if (!file || typeof file === "string" || file.size === 0) return NextResponse.json({ ok: false, error: "Pick a picture first." });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "That picture is too big. Try another." });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return NextResponse.json({ ok: false, error: "Please use a JPG picture." });
  const db = createAdminClient();
  const { data: ev } = await db.from("hosted_events").select("host_id, status, ends_at").eq("id", id).maybeSingle();
  if (!ev || ev.host_id !== userId) return NextResponse.json({ ok: false, error: "Only the host can add slides." });
  if (ev.status !== "on" || Date.parse(String(ev.ends_at)) <= Date.now()) return NextResponse.json({ ok: false, error: "That event is over." });
  const path = `${id}/${randomBytes(12).toString("base64url")}.jpg`;
  const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (up.error) {
    console.error("Slide upload failed", up.error.message);
    return NextResponse.json({ ok: false, error: /bucket/i.test(up.error.message) ? "Slides are switched on soon." : "Couldn't save that slide. Try again." });
  }
  return NextResponse.json({ ok: true, url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
}
