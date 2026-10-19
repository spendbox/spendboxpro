import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// Photos on your profile (game-db/130's public "posts" bucket and profile_posts table).
// GET ?user=<id>: their photos, newest first (empty, with friendsOnly, if they show them to friends
//   only and you aren't one).
// POST (form: photo, a JPEG the phone has already shrunk; caption, optional): post one.
// DELETE ?id=<post>: take one of yours down.

const MAX_BYTES = 600_000;
const BUCKET = "posts";
const PER_DAY = 6;
const SHOWN = 60;
const CAPTION_MAX = 140;

export type ProfilePost = { id: number; url: string; caption: string | null; at: string };

const isId = (v: string | null): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v);
/** The table or bucket isn't there yet (part 130 not run). */
const notYet = (msg: string | undefined) => !!msg && /profile_posts|photos_for|bucket|does not exist/i.test(msg);

async function friends(a: string, b: string) {
  const { data } = await createAdminClient()
    .from("friendships")
    .select("accepted_at")
    .or(`and(requester.eq.${a},addressee.eq.${b}),and(requester.eq.${b},addressee.eq.${a})`)
    .not("accepted_at", "is", null)
    .limit(1);
  return !!data?.length;
}

export async function GET(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ posts: [] }, { status: 401 });
  const target = req.nextUrl.searchParams.get("user");
  if (!isId(target)) return NextResponse.json({ posts: [] }, { status: 400 });
  const db = createAdminClient();
  if (target !== userId) {
    const { data: who } = await db.from("profiles").select("photos_for").eq("id", target).maybeSingle();
    if (who?.photos_for === "friends" && !(await friends(userId, target))) return NextResponse.json({ posts: [], friendsOnly: true });
  }
  const { data, error } = await db.from("profile_posts").select("id, url, caption, created_at").eq("user_id", target).order("id", { ascending: false }).limit(SHOWN);
  if (error) return NextResponse.json({ posts: [], off: notYet(error.message) });
  const posts: ProfilePost[] = (data ?? []).map((p) => ({ id: Number(p.id), url: String(p.url), caption: p.caption ?? null, at: String(p.created_at) }));
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in again." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  const caption = String(form?.get("caption") ?? "").replace(/\s+/g, " ").trim().slice(0, CAPTION_MAX) || null;
  if (!file || typeof file === "string" || file.size === 0) return NextResponse.json({ ok: false, error: "Pick a photo first." });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "That photo is too big. Try another." });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return NextResponse.json({ ok: false, error: "Please use a JPG photo." });
  const db = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count, error: countError } = await db.from("profile_posts").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  if (countError) return NextResponse.json({ ok: false, error: notYet(countError.message) ? "Posting photos is switched on soon." : "Couldn't post it. Try again." });
  if ((count ?? 0) >= PER_DAY) return NextResponse.json({ ok: false, error: `That's ${PER_DAY} photos today. Post more tomorrow.` });
  const path = `${userId}/${randomBytes(12).toString("base64url")}.jpg`;
  const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (up.error) {
    console.error("Profile post upload failed", up.error.message);
    return NextResponse.json({ ok: false, error: notYet(up.error.message) ? "Posting photos is switched on soon." : "Couldn't post it. Try again." });
  }
  const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { data, error } = await db.from("profile_posts").insert({ user_id: userId, url, caption }).select("id, created_at").single();
  if (error || !data) {
    await db.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ ok: false, error: "Couldn't post it. Try again." });
  }
  const post: ProfilePost = { id: Number(data.id), url, caption, at: String(data.created_at) };
  return NextResponse.json({ ok: true, post });
}

export async function DELETE(req: NextRequest) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in again." }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "That photo isn't there." });
  const db = createAdminClient();
  const { data } = await db.from("profile_posts").delete().eq("id", id).eq("user_id", userId).select("url").maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "That photo isn't there." });
  const m = new RegExp(`/posts/(${userId}/[A-Za-z0-9_-]+\\.jpg)$`).exec(String(data.url));
  if (m) await db.storage.from(BUCKET).remove([m[1]]).catch(() => {});
  return NextResponse.json({ ok: true });
}
