import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cleanAvatar } from "@/lib/avatar";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// Your profile photo, used instead of your drawn face (game-db/085's public "faces" bucket).
// POST (form: photo, a small square JPEG the phone has already shrunk): save it as your face.
// DELETE: back to your drawn face (the photo is removed).

const MAX_BYTES = 400_000;
const BUCKET = "faces";

async function myAvatar(userId: string) {
  const { data } = await createAdminClient().from("profiles").select("avatar, username").eq("id", userId).maybeSingle();
  return { avatar: cleanAvatar(data?.avatar, String(data?.username ?? userId)), raw: data?.avatar };
}

/** The file of an old photo of yours (to remove it when replaced). */
const pathOf = (url: string | undefined, userId: string) => {
  const m = url ? new RegExp(`/faces/(${userId}/[A-Za-z0-9_-]+\\.jpg)$`).exec(url) : null;
  return m ? m[1] : null;
};

export async function POST(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in again." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!file || typeof file === "string" || file.size === 0) return NextResponse.json({ ok: false, error: "Pick a photo first." });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "That photo is too big. Try another." });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return NextResponse.json({ ok: false, error: "Please use a JPG photo." });
  const db = createAdminClient();
  const path = `${userId}/${randomBytes(12).toString("base64url")}.jpg`;
  const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (up.error) {
    console.error("Profile photo upload failed", up.error.message);
    return NextResponse.json({ ok: false, error: /bucket/i.test(up.error.message) ? "Profile photos are switched on soon." : "Couldn't save your photo. Try again." });
  }
  const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { avatar } = await myAvatar(userId);
  const old = pathOf(avatar.photo, userId);
  const { error } = await db.from("profiles").update({ avatar: { ...avatar, photo: url } }).eq("id", userId);
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save your photo. Try again." });
  if (old) await db.storage.from(BUCKET).remove([old]).catch(() => {});
  return NextResponse.json({ ok: true, photo: url });
}

export async function DELETE() {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in again." }, { status: 401 });
  const db = createAdminClient();
  const { avatar } = await myAvatar(userId);
  const old = pathOf(avatar.photo, userId);
  delete avatar.photo;
  const { error } = await db.from("profiles").update({ avatar }).eq("id", userId);
  if (error) return NextResponse.json({ ok: false, error: "That didn't work. Try again." });
  if (old) await db.storage.from(BUCKET).remove([old]).catch(() => {});
  return NextResponse.json({ ok: true });
}
