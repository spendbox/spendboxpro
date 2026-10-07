"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// Chat for the current round, in places: each building ("b:<tile>") and hot-air balloon
// ("balloon:<k>") is its own room, plus private messages between two players. Messages are
// written by the database function chat_send (it checks names, rooms, length and pace);
// players receive them live. The bot's teases use room "*" (shown in every room).

export type ChatMessage = {
  id: number;
  round_id: number;
  sender_id: string;
  sender_name: string;
  sender_role: "hider" | "seeker" | "watcher";
  recipient_id: string | null;
  recipient_name: string | null;
  /** "b:<tile>", "balloon:<k>", "*" (bot, every room) or null (private message). */
  room: string | null;
  body: string | null;
  audio_path: string | null;
  audio_seconds: number | null;
  created_at: string;
};

export type ChatTarget = { room: string } | { to: string };

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_VOICE_BYTES = 1_500_000;
const VOICE_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/wav"];
const ROOM_RE = /^(b:\d{1,7}|balloon:([0-9]|[1-4][0-9]|50))$/;
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
export async function loadRoom(room: string): Promise<Result<{ roundId: number; room: string; messages: ChatMessage[] }>> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in to chat." };
  if (typeof room !== "string" || !ROOM_RE.test(room)) return { ok: false, error: FRIENDLY.bad_room };
  const { data, error } = await s.db
    .from("chat_messages")
    .select("*")
    .eq("round_id", s.roundId)
    .in("room", [room, "*"])
    .order("id", { ascending: false })
    .limit(100);
  if (error) return { ok: false, error: "Couldn't load the chat." };
  return { ok: true, roundId: s.roundId, room, messages: (data ?? []).reverse() as ChatMessage[] };
}

/** My private messages this round (sent and received). */
export async function loadDms(): Promise<Result<{ roundId: number; messages: ChatMessage[] }>> {
  const s = await me();
  if (!s) return { ok: false, error: "Sign in to chat." };
  const { data, error } = await s.db
    .from("chat_messages")
    .select("*")
    .eq("round_id", s.roundId)
    .not("recipient_id", "is", null)
    .or(`sender_id.eq.${s.userId},recipient_id.eq.${s.userId}`)
    .order("id", { ascending: false })
    .limit(300);
  if (error) return { ok: false, error: "Couldn't load your private messages." };
  return { ok: true, roundId: s.roundId, messages: (data ?? []).reverse() as ChatMessage[] };
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
  return { ok: true, message: data as ChatMessage };
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
