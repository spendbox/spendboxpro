"use server";

import type { Avatar } from "@/lib/avatar";
import { currentUserId } from "@/lib/game";
import { pushTo } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateAct, type DateAct } from "@/lib/world/street";
import { personalInfo, website } from "@/lib/world/marks";

// Dating (docs/DATING.md; the database part is game-db/056_dating.sql): opt-in, and nothing
// happens without a yes.

type Result = { ok: true; text: string } | { ok: false; error: string };

function say(message: string | undefined): { ok: false; error: string } {
  const code = (message ?? "").split(":")[0];
  const words: Record<string, string> = {
    self: "That's you!",
    you_closed: "Switch on Open to dating first (Dating, on your phone).",
    they_closed: "They're not open to dating.",
    you_taken: "You're already with someone.",
    they_taken: "They're with someone.",
    taken: "One of you is with someone now.",
    not_together: "You're not together.",
    waiting: "You've asked already. Give them time to answer.",
    said_no: "They said not now. Leave it for today.",
    too_many: "That's a lot of asking for one day.",
    blocked: "You can't ask them.",
    gone: "That ask isn't waiting any more.",
    frozen: "That account is paused right now.",
    bad_kind: "That isn't something you can ask.",
    unknown_player: "We couldn't find them.",
  };
  if (words[code]) return { ok: false, error: words[code] };
  console.error("Dating action failed", message);
  return { ok: false, error: "That didn't work just now. Try again." };
}

export type DateAsk = { id: number; act: DateAct; note: string | null; at: string; from: string; fromName: string; fromAvatar: Avatar | null };
export type DatingMine = {
  open: boolean;
  about: string | null;
  public: boolean;
  partner: { id: string; name: string; avatar: Avatar | null; since: string } | null;
  asked: DateAsk[];
  sent: { id: number; act: DateAct; status: string; at: string; to: string; toName: string }[];
};

export async function datingMine(): Promise<DatingMine | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await createAdminClient().rpc("dating_mine", { p_user: userId });
  if (error || !data) return null;
  return data as DatingMine;
}

export type DatingWith = {
  open: boolean;
  about: string | null;
  meOpen: boolean;
  together: boolean;
  taken: boolean;
  meTaken: boolean;
  waiting: DateAct | null;
  theyAsked: { id: number; act: DateAct } | null;
};
export async function datingWith(other: string): Promise<DatingWith | null> {
  const userId = await currentUserId();
  if (!userId || userId === other) return null;
  const { data, error } = await createAdminClient().rpc("dating_with", { p_viewer: userId, p_other: String(other) });
  if (error || !data) return null;
  return data as DatingWith;
}

export async function setDating(open: boolean, about: string, pub: boolean): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const line = String(about ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
  const found = personalInfo(line) ?? website(line);
  if (found) return { ok: false, error: `Take out ${found}: keep it in the game.` };
  const { error } = await createAdminClient().rpc("dating_set", { p_user: userId, p_open: !!open, p_about: line, p_public: !!pub });
  return error ? say(error.message) : { ok: true, text: open ? "You're open to dating." : "Dating is off. Nobody can ask you." };
}

export async function askDate(to: string, act: string, note?: string): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const a = dateAct(act);
  if (!a) return say("bad_kind");
  const line = String(note ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
  if (personalInfo(line) ?? website(line)) return { ok: false, error: "Keep contact details and links out of it." };
  const { error } = await createAdminClient().rpc("date_ask", { p_from: userId, p_to: String(to), p_act: a.act, p_note: line });
  if (error) return say(error.message);
  await pushTo(String(to));
  return { ok: true, text: "Asked. Now it's up to them." };
}

export async function answerDate(id: number, yes: boolean): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const db = createAdminClient();
  const { data: ask } = await db.from("date_asks").select("from_user").eq("id", Math.round(Number(id) || 0)).maybeSingle();
  const { data, error } = await db.rpc("date_answer", { p_user: userId, p_ask: Math.round(Number(id) || 0), p_yes: !!yes });
  if (error) return say(error.message);
  if (ask?.from_user) await pushTo(ask.from_user as string);
  return { ok: true, text: yes ? (dateAct(String(data))?.yes ?? "You said yes.") : "You said not now. They've been told, gently." };
}

export async function withdrawDate(id: number): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { error } = await createAdminClient().rpc("date_withdraw", { p_user: userId, p_ask: Math.round(Number(id) || 0) });
  return error ? say(error.message) : { ok: true, text: "Taken back." };
}

export async function endDating(): Promise<Result> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { error } = await createAdminClient().rpc("date_end", { p_user: userId });
  return error ? say(error.message) : { ok: true, text: "It's over. Be gentle with yourself." };
}
