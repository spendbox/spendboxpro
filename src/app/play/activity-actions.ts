"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";

// Rewards for mini games inside buildings, and ordering food and drinks. Scores come from the
// player's phone, so the database (claim_activity_reward in game-db/019_activities.sql) keeps
// the rewards tiny: 2–10 coins for a good score, 5 rewarded games a day, short waits between.

type Fail = { ok: false; error: string };

const GAMES = ["archery", "darts", "reflex", "pool", "rps", "dice", "cards", "trivia", "dance", "karaoke", "stairs"] as const;
export type RewardGame = (typeof GAMES)[number];

/** Claim coins for a finished mini game. reason is null when paid. */
export async function claimActivityReward(
  game: RewardGame,
  score: number,
): Promise<{ ok: true; coins: number; leftToday: number; reason: "low_score" | "daily_limit" | "too_soon" | null } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to win coins." };
  if (!GAMES.includes(game)) return { ok: false, error: "That game doesn't pay coins." };
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0) return { ok: false, error: "That score doesn't count." };
  const { data, error } = await createAdminClient().rpc("claim_activity_reward", { p_user: userId, p_game: game, p_score: Math.floor(score) });
  if (error || !data) {
    if (error?.message?.startsWith("frozen")) return { ok: false, error: "Your account is paused right now." };
    if (error?.message?.startsWith("bad_score")) return { ok: false, error: "That score doesn't count." };
    console.error("claim_activity_reward failed", error?.message);
    return { ok: false, error: "Couldn't collect your coins. Try again later." };
  }
  const d = data as { coins: number; left_today: number; reason: string | null };
  const reason = d.reason === "low_score" || d.reason === "daily_limit" || d.reason === "too_soon" ? d.reason : null;
  return { ok: true, coins: Number(d.coins ?? 0), leftToday: Number(d.left_today ?? 0), reason };
}

/** Ordered food or a drink: sometimes the waiter has a side quest for you (10%). */
export async function orderSomething(): Promise<{ ok: true; quest: { id: number; key: string; title: string; brief: string } | null } | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: true, quest: null };
  const { data, error } = await createAdminClient().rpc("offer_quest", { p_user: userId, p_source: "order", p_keys: null });
  if (error) return { ok: true, quest: null };
  const q = data as { id: number; key: string; title: string; brief: string } | null;
  return { ok: true, quest: q ? { id: Number(q.id), key: String(q.key), title: String(q.title), brief: String(q.brief) } : null };
}
