"use server";

import { currentUserId } from "@/lib/game";
import { npcsFor } from "@/lib/npcs";
import { NPC_QUEST_KEYS, QUEST_BY_KEY, isBigFish, type QuestActionResult, type QuestState } from "@/lib/quests";
import { createAdminClient } from "@/lib/supabase/admin";

// Side quests ("Today you are a thief…"). The database (game-db/019_activities.sql) decides
// who gets one, counts the steps it can check itself, slows down everything the app reports,
// pays rewards once and guards the special moves (steal, hint, spy, free search, extra move).

type Fail = { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FRIENDLY: Record<string, string> = {
  frozen: "Your account is paused right now.",
  unknown_player: "Please sign in again.",
  bad_source: "That can't hand out quests.",
  no_quest: "That quest is over.",
  bad_step: "That isn't part of your quest.",
  bad_amount: "That doesn't count.",
  steal_self: "You can't rob yourself!",
  unknown_target: "That player isn't around.",
  target_bot: "The bot has pockets full of nothing. Pick a real player.",
  target_frozen: "That player's account is paused. Pick someone else.",
  target_safe: "That player was robbed recently and is safe from thieves for now. Pick someone else.",
  target_broke: "That player has hardly any coins. Pick someone richer!",
  no_steal: "You need to finish a thief quest first (or your chance has run out).",
  no_perk: "That special move isn't waiting for you any more.",
  bad_action: "That isn't a special move.",
  no_hunt: "Wait for the hunt to start, then try again. Your move will keep.",
  nothing_yet: "Nothing to see yet. Try again in a minute, your move will keep.",
  already_free: "You already have a free search waiting today. Use it first, then come back.",
  not_ghost: "Only a ghost who's still hiding can use an extra move.",
  no_moves_used: "Make a move first, then come back for your extra one.",
};

function friendly(message: string | undefined, fallback: string) {
  const code = Object.keys(FRIENDLY).find((k) => message?.startsWith(k));
  return code ? FRIENDLY[code] : fallback;
}

async function rpc<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<{ ok: true; data: T } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to play side quests." };
  const { data, error } = await createAdminClient().rpc(fn, { p_user: userId, ...args });
  if (error) {
    const known = Object.keys(FRIENDLY).some((k) => error.message?.startsWith(k));
    if (!known) console.error(`${fn} failed`, error.message);
    return { ok: false, error: friendly(error.message, fallback) };
  }
  return { ok: true, data: data as T };
}

/** Tidy up what the database sends (numbers may arrive as strings). */
function cleanQuest(raw: unknown): QuestState | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Record<string, unknown>;
  if (typeof q.key !== "string" || !QUEST_BY_KEY[q.key]) return null;
  const nums = (v: unknown) => (Array.isArray(v) ? v.map((n) => Number(n) || 0) : []);
  return {
    id: Number(q.id),
    key: q.key,
    title: String(q.title ?? QUEST_BY_KEY[q.key].title),
    role: String(q.role ?? QUEST_BY_KEY[q.key].role),
    brief: String(q.brief ?? QUEST_BY_KEY[q.key].brief),
    status: (["active", "done", "expired", "dropped"].includes(String(q.status)) ? q.status : "expired") as QuestState["status"],
    progress: nums(q.progress),
    targets: nums(q.targets),
    startedAt: String(q.startedAt),
    expiresAt: String(q.expiresAt),
    completedAt: q.completedAt ? String(q.completedAt) : null,
    reward: Number(q.reward ?? 0),
    paid: Number(q.paid ?? 0),
    action: (q.action as QuestState["action"]) ?? null,
    actionUntil: q.actionUntil ? String(q.actionUntil) : null,
    actionUsed: Boolean(q.actionUsed),
    actionResult: (q.actionResult as QuestActionResult | null) ?? null,
    roundId: q.roundId == null ? null : Number(q.roundId),
  };
}

/** Which quests a regular likes to hand out, from their id ("npc:<room>:<n>"). Null = any. */
async function keysForNpc(npcId: string | undefined): Promise<string[] | null> {
  const m = typeof npcId === "string" ? /^npc:(.+):(\d+)$/.exec(npcId) : null;
  if (!m) return null;
  const { data: round } = await createAdminClient().from("rounds").select("id").order("id", { ascending: false }).limit(1).maybeSingle();
  if (!round) return null;
  const npc = npcsFor(m[1], round.id as number, 1000).find((n) => n.id === npcId);
  const keys = npc ? NPC_QUEST_KEYS[npc.role] : undefined;
  return keys?.length ? keys : null;
}

/**
 * Maybe hand the signed-in player a side quest. "seat": they sat down (35% chance), "npc": a
 * regular offers one (60%; pass the regular's id and they pick a quest that suits their job),
 * "random": a surprise (3%). Each source rolls at most once a minute or so, and nobody gets
 * more than 3 quests a day or two at once. quest is null when there's nothing this time.
 */
export async function offerQuest(
  source: "npc" | "seat" | "random",
  npcId?: string,
): Promise<{ ok: true; quest: { id: number; key: string; title: string; brief: string } | null } | { ok: false; error: string }> {
  if (source !== "npc" && source !== "seat" && source !== "random") return { ok: false, error: FRIENDLY.bad_source };
  const keys = source === "npc" ? await keysForNpc(npcId) : null;
  const res = await rpc<{ id: number; key: string; title: string; brief: string } | null>(
    "offer_quest",
    { p_source: source, p_keys: keys },
    "Couldn't check for quests right now.",
  );
  if (!res.ok) return res;
  const q = res.data;
  return { ok: true, quest: q ? { id: Number(q.id), key: String(q.key), title: String(q.title), brief: String(q.brief) } : null };
}

/** The signed-in player's side quest (active, or finished with a special move still waiting), or null. */
export async function myQuest(): Promise<{ ok: true; quest: QuestState | null } | Fail> {
  const res = await rpc<unknown>("my_quest", {}, "Couldn't load your quest.");
  if (!res.ok) return res;
  return { ok: true, quest: cleanQuest(res.data) };
}

/** Report progress on one step (0-based) of the active quest. The server slows this down. */
export async function reportQuest(
  questId: number,
  step: number,
  amount: number,
): Promise<{ ok: true; quest: QuestState | null; applied: number; completed: boolean; reward: number } | Fail> {
  if (!Number.isInteger(questId) || questId <= 0 || !Number.isInteger(step) || step < 0 || step > 10) {
    return { ok: false, error: FRIENDLY.bad_step };
  }
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n <= 0 || n > 3600) return { ok: false, error: FRIENDLY.bad_amount };
  const res = await rpc<{ quest: unknown; applied: number; completed: boolean; reward: number }>(
    "quest_progress",
    { p_quest: questId, p_step: step, p_amount: n },
    "Couldn't save your quest progress.",
  );
  if (!res.ok) return res;
  return {
    ok: true,
    quest: cleanQuest(res.data?.quest),
    applied: Number(res.data?.applied ?? 0),
    completed: Boolean(res.data?.completed),
    reward: Number(res.data?.reward ?? 0),
  };
}

/** Give up on the active quest (it still counts towards the day's 3). */
export async function dropQuest(): Promise<{ ok: true } | Fail> {
  const res = await rpc<unknown>("quest_drop", {}, "Couldn't drop the quest.");
  return res.ok ? { ok: true } : res;
}

/** A thief's special move: take 1–5% (at most 100) of another player's coins. */
export async function stealFrom(targetId: string): Promise<{ ok: true; amount: number; target: string; balance: number } | Fail> {
  if (typeof targetId !== "string" || !UUID_RE.test(targetId)) return { ok: false, error: FRIENDLY.unknown_target };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to play side quests." };
  const { data, error } = await createAdminClient().rpc("quest_steal", { p_thief: userId, p_target: targetId });
  if (error || !data) return { ok: false, error: friendly(error?.message, "The heist went wrong. Try again.") };
  const d = data as { amount: number; target: string; balance: number };
  return { ok: true, amount: Number(d.amount), target: String(d.target), balance: Number(d.balance) };
}

/** The other special moves: a hint, spying on a hunter, a free search or an extra move. */
export async function runQuestAction(
  action: "hint" | "spy" | "free_search" | "free_move",
): Promise<{ ok: true; result: QuestActionResult } | Fail> {
  if (!["hint", "spy", "free_search", "free_move"].includes(action)) return { ok: false, error: FRIENDLY.bad_action };
  const res = await rpc<QuestActionResult>("quest_action", { p_action: action }, "Couldn't do that right now.");
  if (!res.ok) return res;
  return { ok: true, result: res.data };
}

export type StealTarget = { id: string; name: string; avatar: unknown; bigFish: boolean; safe: boolean };

/** Players a thief could rob: everyone in the current game (not you, not the bot). */
export async function stealTargets(): Promise<{ ok: true; players: StealTarget[] } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to play side quests." };
  const db = createAdminClient();
  const { data: round } = await db.from("rounds").select("id").order("id", { ascending: false }).limit(1).maybeSingle();
  if (!round) return { ok: true, players: [] };
  const { data: entries } = await db.from("entries").select("user_id").eq("round_id", round.id).neq("user_id", userId).limit(300);
  const ids = (entries ?? []).map((e) => e.user_id as string);
  if (!ids.length) return { ok: true, players: [] };
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ data: people }, { data: robbed }] = await Promise.all([
    db.from("profiles").select("id, username, avatar, coins, is_bot, frozen").in("id", ids),
    db.from("steals").select("target_id").in("target_id", ids).gt("created_at", since),
  ]);
  const safe = new Set((robbed ?? []).map((r) => r.target_id as string));
  const players = (people ?? [])
    .filter((p) => p.username && !p.is_bot && !p.frozen)
    .map((p) => ({ id: p.id as string, name: p.username as string, avatar: p.avatar, bigFish: isBigFish(Number(p.coins)), safe: safe.has(p.id as string) }))
    .sort((a, b) => Number(b.bigFish) - Number(a.bigFish) || a.name.localeCompare(b.name));
  return { ok: true, players };
}
