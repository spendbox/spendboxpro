"use server";

import { pushTo } from "@/lib/push";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// Chat for the current round, in places: each level of a building (ground "b:<tile>:g",
// floor n "b:<tile>:f<n>", rooftop "b:<tile>:r") and each hot-air balloon ("balloon:<k>") is
// its own room, plus private messages between two players. The old whole-building rooms
// ("b:<tile>") still work. Messages are written by the database function chat_send (it checks
// names, rooms, length and pace); players receive them live. The bot's teases use room "*"
// (shown in every room).

export type ChatMessage = {
  id: number;
  round_id: number;
  sender_id: string;
  sender_name: string;
  sender_role: "hider" | "seeker" | "watcher";
  recipient_id: string | null;
  recipient_name: string | null;
  /** "b:<tile>:g" / "b:<tile>:f<n>" / "b:<tile>:r" (or old "b:<tile>"), "balloon:<k>", "*" (bot, every room) or null (private message). */
  room: string | null;
  body: string | null;
  audio_path: string | null;
  audio_seconds: number | null;
  /** A picture sent in the message (game-db/062): its path in the photos bucket. */
  image_path?: string | null;
  created_at: string;
};

export type ChatTarget = { room: string } | { to: string };

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_VOICE_BYTES = 1_500_000;
const VOICE_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/wav"];
// Same list as chat_room_ok in the database (game-db/016_place_rooms.sql, rides added in
// 017_world_events.sql): a building level (g, f1…f200, r), a whole building (old), balloon 0…50,
// or a ride "v:<train|bus|car|boat|ferris|slide|heli>:<n>".
const ROOM_RE =
  /^(b:[0-9]{1,7}(:(g|o|r|f([1-9]|[1-9][0-9]|1[0-9][0-9]|200)))?|balloon:([0-9]|[1-4][0-9]|50)|v:(train|bus|car|boat|ferris|slide|heli):[0-9]{1,7})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FRIENDLY: Record<string, string> = {
  no_name: "Pick a player name to chat.",
  frozen: "Your account is paused, so you can't chat right now.",
  no_round: "There's no game running yet.",
  bad_target: "Pick a place or a person to message.",
  bad_room: "You can't chat there.",
  bad_recipient: "You can't message that player.",
  empty: "Type a message.",
  too_long: "That message is too long (500 letters max).",
  too_fast: "Slow down a little.",
  blocked: "That player isn't taking messages from you.",
};

/** The signed-in player with a name, and this round's id. */
async function me() {
  const userId = await currentUserId();
  if (!userId) return null;
  const db = createAdminClient();
  const [{ data: profile }, { data: round }] = await Promise.all([
    db.from("profiles").select("username, frozen").eq("id", userId).single(),
    db.from("rounds").select("id").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!profile?.username || !round) return null;
  return { db, userId, roundId: round.id as number, frozen: Boolean(profile.frozen) };
}

/** Checks a { room } / { to } target before it reaches the database. */
function cleanTarget(target: unknown): { room: string | null; to: string | null } | null {
  if (!target || typeof target !== "object") return null;
  const t = target as { room?: unknown; to?: unknown };
  if (typeof t.room === "string" && t.to == null) return ROOM_RE.test(t.room) ? { room: t.room, to: null } : null;
  if (typeof t.to === "string" && t.room == null) return UUID_RE.test(t.to) ? { room: null, to: t.to } : null;
  return null;
}

function friendly(message: string | undefined, fallback: string) {
  const code = Object.keys(FRIENDLY).find((k) => message?.includes(k));
  return code ? FRIENDLY[code] : fallback;
}

/** The last 100 messages in one place this round (including the bot's every-room teases). */
/** On the real map (`keep`), chat isn't per round: the last week's messages, whatever the round (round 0). */
const KEEP_MS = 7 * 86_400_000;

export async function loadRoom(room: string, keep?: boolean): Promise<Result<{ roundId: number; room: string; messages: ChatMessage[] }>> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in to chat." };
  if (typeof room !== "string" || !ROOM_RE.test(room)) return { ok: false, error: FRIENDLY.bad_room };
  const q = s.db.from("chat_messages").select("*");
  const { data, error } = await (keep ? q.gte("created_at", new Date(Date.now() - KEEP_MS).toISOString()) : q.eq("round_id", s.roundId))
    .in("room", keep ? [room] : [room, "*"])
    .order("id", { ascending: false })
    .limit(100);
  if (error) return { ok: false, error: "Couldn't load the chat." };
  return { ok: true, roundId: keep ? 0 : s.roundId, room, messages: (data ?? []).reverse() as ChatMessage[] };
}

/** My private messages this round (sent and received). */
export async function loadDms(keep?: boolean): Promise<Result<{ roundId: number; messages: ChatMessage[] }>> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in to chat." };
  const q = s.db.from("chat_messages").select("*");
  const { data, error } = await (keep ? q.gte("created_at", new Date(Date.now() - KEEP_MS).toISOString()) : q.eq("round_id", s.roundId))
    .not("recipient_id", "is", null)
    .or(`sender_id.eq.${s.userId},recipient_id.eq.${s.userId}`)
    .order("id", { ascending: false })
    .limit(300);
  if (error) return { ok: false, error: "Couldn't load your private messages." };
  return { ok: true, roundId: keep ? 0 : s.roundId, messages: (data ?? []).reverse() as ChatMessage[] };
}

/** Send a text message to a place ({ room }) or privately to a player ({ to }). */
export async function sendMessage(text: string, target: ChatTarget): Promise<Result<{ message: ChatMessage }>> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in to chat." };
  if (s.frozen) return { ok: false, error: FRIENDLY.frozen };
  const t = cleanTarget(target);
  if (!t) return { ok: false, error: FRIENDLY.bad_target };
  const body = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (!body) return { ok: false, error: FRIENDLY.empty };
  if (body.length > 500) return { ok: false, error: FRIENDLY.too_long };
  const { data, error } = await s.db.rpc("chat_send", { p_user: s.userId, p_room: t.room, p_to: t.to, p_body: body });
  if (error || !data) return { ok: false, error: friendly(error?.message, "Couldn't send. Try again.") };
  // A private message: a notification on their phone (if they turned them on).
  if (t.to) await pushTo(t.to).catch(() => {});
  return { ok: true, message: data as ChatMessage };
}

/** Send a voice note. FormData: audio (Blob), seconds, and either room or to. */
export async function sendVoice(form: FormData): Promise<Result<{ message: ChatMessage }>> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in to chat." };
  if (s.frozen) return { ok: false, error: FRIENDLY.frozen };
  const room = form.get("room");
  const to = form.get("to");
  const t = cleanTarget({ room: typeof room === "string" && room ? room : undefined, to: typeof to === "string" && to ? to : undefined });
  if (!t) return { ok: false, error: FRIENDLY.bad_target };
  const file = form.get("audio");
  const seconds = Math.max(1, Math.min(60, Math.round(Number(form.get("seconds")) || 1)));
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: "No recording." };
  const type = file.type.split(";")[0];
  if (file.size > MAX_VOICE_BYTES || !VOICE_TYPES.includes(type)) return { ok: false, error: "That recording is too long." };

  const ext = type.split("/")[1];
  const path = `${s.roundId}/${s.userId}/${Date.now()}.${ext}`;
  const upload = await s.db.storage.from("voice").upload(path, file, { contentType: type });
  if (upload.error) {
    console.error("Voice upload failed", upload.error.message);
    return { ok: false, error: "Couldn't send the voice note." };
  }
  const { data, error } = await s.db.rpc("chat_send", {
    p_user: s.userId,
    p_room: t.room,
    p_to: t.to,
    p_body: null,
    p_audio_path: path,
    p_audio_seconds: seconds,
  });
  if (error || !data) {
    // Not sent (too fast, bad place…): don't keep the recording.
    await s.db.storage.from("voice").remove([path]);
    return { ok: false, error: friendly(error?.message, "Couldn't send the voice note.") };
  }
  // A private voice note: a notification on their phone too.
  if (t.to) await pushTo(t.to).catch(() => {});
  return { ok: true, message: data as ChatMessage };
}

const PHOTO_BUCKET = "photos";
const MAX_PHOTO_BYTES = 1_500_000;

/**
 * Send a picture (a selfie, a photo from your gallery or your phone). FormData: either image (a
 * JPEG) or galleryId (one of your gallery's pictures), an optional caption, and either room or to.
 */
export async function sendPhoto(form: FormData): Promise<Result<{ message: ChatMessage }>> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in to chat." };
  if (s.frozen) return { ok: false, error: FRIENDLY.frozen };
  const room = form.get("room");
  const to = form.get("to");
  const t = cleanTarget({ room: typeof room === "string" && room ? room : undefined, to: typeof to === "string" && to ? to : undefined });
  if (!t) return { ok: false, error: FRIENDLY.bad_target };
  const caption = typeof form.get("caption") === "string" ? String(form.get("caption")).replace(/\s+/g, " ").trim().slice(0, 200) : "";
  const path = `chat/${s.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;

  const galleryId = Number(form.get("galleryId"));
  if (galleryId > 0) {
    // One of your own gallery pictures: a copy goes with the message (deleting it from your gallery later doesn't take it back).
    const { data: own } = await s.db.from("phone_photos").select("path").eq("id", galleryId).eq("user_id", s.userId).maybeSingle();
    if (!own?.path) return { ok: false, error: "That picture isn't in your gallery any more." };
    const copy = await s.db.storage.from(PHOTO_BUCKET).copy(own.path as string, path);
    if (copy.error) {
      console.error("Chat photo copy failed", copy.error.message);
      return { ok: false, error: "Couldn't send the picture. Try again." };
    }
  } else {
    const file = form.get("image");
    if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: "The picture came out empty. Try again." };
    if (file.type !== "image/jpeg") return { ok: false, error: "That isn't a picture." };
    if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "That picture is too big to send." };
    const upload = await s.db.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: "image/jpeg" });
    if (upload.error) {
      console.error("Chat photo upload failed", upload.error.message);
      return { ok: false, error: "Couldn't send the picture. Try again." };
    }
  }
  const { data, error } = await s.db.rpc("chat_send_photo", { p_user: s.userId, p_room: t.room, p_to: t.to, p_path: path, p_caption: caption || null });
  if (error || !data) {
    await s.db.storage.from(PHOTO_BUCKET).remove([path]);
    if (error?.message?.includes("chat_send_photo")) return { ok: false, error: "Sending pictures is switched on soon (the game's owner has one update to run)." };
    return { ok: false, error: friendly(error?.message, "Couldn't send the picture.") };
  }
  if (t.to) await pushTo(t.to).catch(() => {});
  return { ok: true, message: data as ChatMessage };
}

/** A short-lived link to see a picture in a message, only for people who can see the message. */
export async function photoUrl(messageId: number): Promise<Result<{ url: string }>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to see it." };
  const db = createAdminClient();
  const { data: m } = await db.from("chat_messages").select("image_path, sender_id, recipient_id").eq("id", messageId).maybeSingle();
  if (!m?.image_path || (m.recipient_id && m.recipient_id !== userId && m.sender_id !== userId)) return { ok: false, error: "Not available." };
  const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(m.image_path as string, 3600);
  if (error || !data) return { ok: false, error: "Not available." };
  return { ok: true, url: data.signedUrl };
}

/** A short-lived link to play a voice note, only for people who can see the message. */
export async function voiceUrl(messageId: number): Promise<Result<{ url: string }>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to listen." };
  const db = createAdminClient();
  const { data: m } = await db.from("chat_messages").select("audio_path, sender_id, recipient_id").eq("id", messageId).maybeSingle();
  if (!m?.audio_path || (m.recipient_id && m.recipient_id !== userId && m.sender_id !== userId)) {
    return { ok: false, error: "Not available." };
  }
  const { data, error } = await db.storage.from("voice").createSignedUrl(m.audio_path, 300);
  if (error || !data) return { ok: false, error: "Not available." };
  return { ok: true, url: data.signedUrl };
}
