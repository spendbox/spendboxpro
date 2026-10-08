"use server";

import { currentUserId } from "@/lib/game";
import { NPC_ID_RE, npcById } from "@/lib/npcs";
import { createAdminClient } from "@/lib/supabase/admin";
import { offerQuest } from "./quest-actions";

// Asking one of the city's people (NPCs) for something real. Who they are comes from their id
// and the round (src/lib/npcs.ts), so the server checks here that they really are a gossip, a
// generous type or a quest-giver before asking the database (game-db/018_npcs.sql), which
// decides, keeps the limits and never gives away a ghost's exact spot.

type Fail = { ok: false; error: string };

export type NpcHint = { tile: number; count: number; radius: number; repeat: boolean };
/** hint is null when they know nothing (why: no_hunt, nothing, not_a_gossip). */
export type NpcHintResult = { ok: true; hint: NpcHint | null; why?: "no_hunt" | "nothing" | "not_a_gossip" } | Fail;
/** coins is 0 when nothing was given (why: already, daily_cap, tired, no_luck, no_round, not_generous). */
export type NpcGiftResult = { ok: true; coins: number; why?: string; leftToday?: number } | Fail;
export type NpcQuest = { id: number; key: string; title: string; brief: string };
export type NpcQuestResult = { ok: true; quest: NpcQuest | null; why?: "none" | "not_a_quest_giver" } | Fail;

const FRIENDLY: Record<string, string> = {
  bad_npc: "That isn't one of the city's people.",
  no_player: "Please sign in again.",
  frozen: "Your account is paused right now.",
};

function friendly(message: string | undefined, fallback: string) {
  const code = Object.keys(FRIENDLY).find((k) => message?.includes(k));
  return code ? FRIENDLY[code] : fallback;
}

/** The signed-in player, the current round, and the NPC they're talking to. */
async function context(npcId: unknown) {
  if (typeof npcId !== "string" || !NPC_ID_RE.test(npcId)) return { error: FRIENDLY.bad_npc };
  const userId = await currentUserId();
  if (!userId) return { error: "Sign in to chat with the city's people." };
  const db = createAdminClient();
  const { data: round } = await db.from("rounds").select("id, status, seek_ends_at").order("id", { ascending: false }).limit(1).maybeSingle();
  if (!round) return { error: "There's no game running yet." };
  const npc = npcById(npcId, Number(round.id));
  if (!npc) return { error: FRIENDLY.bad_npc };
  const huntOn = round.status === "seek" && Date.parse(String(round.seek_ends_at)) > Date.now();
  return { userId, db, npc, huntOn };
}

/** A gossip's clue: rare, rough (a 9×9 area and "about how many"), at most one real one per round. */
export async function askNpcHint(npcId: string): Promise<NpcHintResult> {
  const c = await context(npcId);
  if ("error" in c) return { ok: false, error: c.error ?? "Try again." };
  if (c.npc.clue !== "real") return { ok: true, hint: null, why: "not_a_gossip" };
  if (!c.huntOn) return { ok: true, hint: null, why: "no_hunt" };
  const { data, error } = await c.db.rpc("npc_hint", { p_user: c.userId, p_npc: c.npc.id });
  if (error) {
    if (!Object.keys(FRIENDLY).some((k) => error.message?.includes(k))) console.error("npc_hint failed", error.message);
    return { ok: false, error: friendly(error.message, "They got distracted. Try again in a moment.") };
  }
  const h = data as { tile?: unknown; count?: unknown; radius?: unknown; repeat?: unknown } | null;
  if (!h || h.tile == null) return { ok: true, hint: null, why: "nothing" };
  return { ok: true, hint: { tile: Number(h.tile), count: Math.max(1, Number(h.count) || 1), radius: Number(h.radius) || 4, repeat: Boolean(h.repeat) } };
}

/** A generous NPC's gift: 5–20 coins now and then (once per NPC per round, 3 a day at most). */
export async function askNpcGift(npcId: string): Promise<NpcGiftResult> {
  const c = await context(npcId);
  if ("error" in c) return { ok: false, error: c.error ?? "Try again." };
  if (!c.npc.gives) return { ok: true, coins: 0, why: "not_generous" };
  const { data, error } = await c.db.rpc("npc_gift", { p_user: c.userId, p_npc: c.npc.id });
  if (error) {
    if (!Object.keys(FRIENDLY).some((k) => error.message?.includes(k))) console.error("npc_gift failed", error.message);
    return { ok: false, error: friendly(error.message, "Their wallet got stuck. Try again in a moment.") };
  }
  const g = (data ?? {}) as { coins?: unknown; why?: unknown; left_today?: unknown };
  return {
    ok: true,
    coins: Math.max(0, Number(g.coins) || 0),
    why: typeof g.why === "string" ? g.why : undefined,
    leftToday: g.left_today == null ? undefined : Number(g.left_today),
  };
}

/** A quest-giver's side quest (the activities' offerQuest decides if there's one for you now). */
export async function askNpcQuest(npcId: string): Promise<NpcQuestResult> {
  const c = await context(npcId);
  if ("error" in c) return { ok: false, error: c.error ?? "Try again." };
  if (!c.npc.quests) return { ok: true, quest: null, why: "not_a_quest_giver" };
  try {
    const res = await offerQuest("npc", c.npc.id);
    if (!res.ok) return { ok: false, error: res.error };
    return res.quest ? { ok: true, quest: res.quest } : { ok: true, quest: null, why: "none" };
  } catch (e) {
    console.error("offerQuest failed", e);
    return { ok: false, error: "They forgot what they wanted. Try again in a moment." };
  }
}
