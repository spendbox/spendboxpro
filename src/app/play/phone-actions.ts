"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// The phone's gallery: pictures belong to your account (game-db/034_phone_photos.sql), so they
// go with you from town to town. The files live in a private bucket; the gallery hands out
// links that work for an hour.

type Fail = { ok: false; error: string };

export type PhonePhoto = {
  id: number;
  kind: "photo" | "selfie";
  place: string | null;
  city: string | null;
  width: number;
  height: number;
  createdAt: string;
  url: string;
};

type Row = { id: number; path: string; kind: string; place: string | null; city: string | null; width: number; height: number; created_at: string };

const BUCKET = "photos";
const MAX_BYTES = 1_500_000;
const LINK_SECONDS = 3600;

function say(message: string | undefined, fallback: string) {
  const map: Record<string, string> = {
    unknown_player: "Please sign in again.",
    frozen: "Your account is paused right now.",
    too_many: "That's a lot of pictures! Give your phone a little rest and try again soon.",
    bad_path: fallback,
  };
  const code = (message ?? "").split(":")[0];
  if (map[code]) return map[code];
  console.error("Phone gallery", message);
  return fallback;
}

async function withLinks(rows: Row[]): Promise<PhonePhoto[]> {
  if (rows.length === 0) return [];
  const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrls(rows.map((r) => r.path), LINK_SECONDS);
  const links = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return rows
    .map((r) => ({
      id: Number(r.id),
      kind: r.kind === "selfie" ? ("selfie" as const) : ("photo" as const),
      place: r.place,
      city: r.city,
      width: Number(r.width) || 0,
      height: Number(r.height) || 0,
      createdAt: r.created_at,
      url: links.get(r.path) ?? "",
    }))
    .filter((p) => p.url);
}

/** Save a picture to your gallery. FormData: image (a JPEG), kind, place, city, width, height. */
export async function savePhoto(form: FormData): Promise<{ ok: true; photo: PhonePhoto } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to keep your pictures in your gallery." };
  const file = form.get("image");
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: "The picture came out empty. Try again." };
  if (file.type !== "image/jpeg") return { ok: false, error: "That isn't a picture." };
  if (file.size > MAX_BYTES) return { ok: false, error: "That picture is too big to save." };
  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v.slice(0, 80) : null;
  };
  const db = createAdminClient();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const upload = await db.storage.from(BUCKET).upload(path, file, { contentType: "image/jpeg" });
  if (upload.error) {
    console.error("Photo upload failed", upload.error.message);
    return { ok: false, error: "Couldn't save the picture. Try again." };
  }
  const { data, error } = await db.rpc("phone_photo_add", {
    p_user: userId,
    p_path: path,
    p_kind: text("kind") === "selfie" ? "selfie" : "photo",
    p_place: text("place"),
    p_city: text("city"),
    p_width: Math.round(Number(form.get("width")) || 0),
    p_height: Math.round(Number(form.get("height")) || 0),
  });
  if (error || !data) {
    await db.storage.from(BUCKET).remove([path]);
    return { ok: false, error: say(error?.message, "Couldn't save the picture. Try again.") };
  }
  const d = data as { photo: Row; removed: string[] };
  // A full gallery let its oldest pictures go.
  if (d.removed?.length) await db.storage.from(BUCKET).remove(d.removed);
  const [photo] = await withLinks([d.photo]);
  if (!photo) return { ok: false, error: "Saved, but couldn't show it. Open your gallery." };
  return { ok: true, photo };
}

/** Your gallery, newest first. */
export async function listPhotos(): Promise<{ ok: true; photos: PhonePhoto[] } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to see your gallery." };
  const { data, error } = await createAdminClient().rpc("phone_photos_list", { p_user: userId, p_limit: 300 });
  if (error) return { ok: false, error: say(error.message, "Couldn't open your gallery. Try again.") };
  return { ok: true, photos: await withLinks((data ?? []) as Row[]) };
}

/** Delete one of your pictures. */
export async function deletePhoto(id: number): Promise<{ ok: true } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const db = createAdminClient();
  const { data, error } = await db.rpc("phone_photo_delete", { p_user: userId, p_id: id });
  if (error) return { ok: false, error: say(error.message, "Couldn't delete it. Try again.") };
  if (typeof data === "string" && data) await db.storage.from(BUCKET).remove([data]);
  return { ok: true };
}
