"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// Chat for the current round. Messages are written by the server (which checks who is
// talking, their role this round and how fast they post); players receive them live.

export type ChatMessage = {
  id: number;
  round_id: number;
  sender_id: string;
  sender_name: string;
  sender_role: "hider" | "seeker" | "watcher";
  recipient_id: string | null;
  recipient_name: string | null;
  body: string | null;
  audio_path: string | null;
  audio_seconds: number | null;
  created_at: string;
};

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_VOICE_BYTES = 1_500_000;
const VOICE_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/wav"];

async function sender() {
  const userId = await currentUserId();
  if (!userId) return null;
  const db = createAdminClient();
  const [{ data: profile }, { data: round }] = await Promise.all([
    db.from("profiles").select("username, frozen").eq("id", userId).single(),
    db.from("rounds").select("id").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!profile?.username || profile.frozen || !round) return null;
  const { data: entry } = await db.from("entries").select("role").eq("round_id", round.id).eq("user_id", userId).maybeSingle();
  return { db, userId, name: profile.username as string, roundId: round.id as number, role: (entry?.role ?? "watcher") as ChatMessage["sender_role"] };
}

async function tooFast(db: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await db
    .from("chat_messages")
    .select("created_at")
    .eq("sender_id", userId)
    .order("id", { ascending: false })
    .limit(5);
  const now = Date.now();
  if (data?.[0] && now - Date.parse(data[0].created_at) < 1000) return true;
  return (data?.length ?? 0) >= 5 && now - Date.parse(data![4].created_at) < 10_000;
}

/** Who a private message goes to: their name, or false if they can't be messaged. */
async function recipient(db: ReturnType<typeof createAdminClient>, to: string | null, userId: string) {
  if (!to) return null;
  if (to === userId) return false;
  const { data } = await db.from("profiles").select("username, is_bot").eq("id", to).maybeSingle();
  return data && !data.is_bot && data.username ? (data.username as string) : false;
}

export async function loadChat(): Promise<Result<{ roundId: number; messages: ChatMessage[] }>> {
  const s = await sender();
  if (!s) return { ok: false, error: "Sign in to chat." };
  const { data, error } = await s.db
    .from("chat_messages")
    .select("*")
    .eq("round_id", s.roundId)
    .or(`recipient_id.is.null,sender_id.eq.${s.userId},recipient_id.eq.${s.userId}`)
    .order("id", { ascending: false })
    .limit(300);
  if (error) return { ok: false, error: "Couldn't load the chat." };
  return { ok: true, roundId: s.roundId, messages: (data ?? []).reverse() as ChatMessage[] };
}

export async function sendMessage(text: string, to: string | null): Promise<Result<{ message: ChatMessage }>> {
  const s = await sender();
  if (!s) return { ok: false, error: "Sign in to chat." };
  const body = text.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!body) return { ok: false, error: "Type a message." };
  const toName = await recipient(s.db, to, s.userId);
  if (toName === false) return { ok: false, error: "You can't message that player." };
  if (await tooFast(s.db, s.userId)) return { ok: false, error: "Slow down a little." };
  const { data, error } = await s.db
    .from("chat_messages")
    .insert({ round_id: s.roundId, sender_id: s.userId, sender_name: s.name, sender_role: s.role, recipient_id: to, recipient_name: toName, body })
    .select("*")
    .single();
  if (error) return { ok: false, error: "Couldn't send. Try again." };
  return { ok: true, message: data as ChatMessage };
}

export async function sendVoice(form: FormData): Promise<Result<{ message: ChatMessage }>> {
  const s = await sender();
  if (!s) return { ok: false, error: "Sign in to chat." };
  const file = form.get("audio");
  const to = (form.get("to") as string) || null;
  const seconds = Math.max(1, Math.min(60, Math.round(Number(form.get("seconds")) || 1)));
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: "No recording." };
  const type = file.type.split(";")[0];
  if (file.size > MAX_VOICE_BYTES || !VOICE_TYPES.includes(type)) return { ok: false, error: "That recording is too long." };
  const toName = await recipient(s.db, to, s.userId);
  if (toName === false) return { ok: false, error: "You can't message that player." };
  if (await tooFast(s.db, s.userId)) return { ok: false, error: "Slow down a little." };

  const ext = type.split("/")[1];
  const path = `${s.roundId}/${s.userId}/${Date.now()}.${ext}`;
  const upload = await s.db.storage.from("voice").upload(path, file, { contentType: type });
  if (upload.error) {
    console.error("Voice upload failed", upload.error.message);
    return { ok: false, error: "Couldn't send the voice note." };
  }
  const { data, error } = await s.db
    .from("chat_messages")
    .insert({
      round_id: s.roundId,
      sender_id: s.userId,
      sender_name: s.name,
      sender_role: s.role,
      recipient_id: to,
      recipient_name: toName,
      audio_path: path,
      audio_seconds: seconds,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: "Couldn't send the voice note." };
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
