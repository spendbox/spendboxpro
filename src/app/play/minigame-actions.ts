"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { MINIGAME_BY_ID } from "./minigames/registry";

// Mint for a good minigame score (game-db/036_minigames.sql keeps it small: ₥2 / ₥4 / ₥6 for
// bronze / silver / gold, 10 rewarded games a day).

export type MinigameReward = { ok: true; coins: number; leftToday: number; reason: "daily_limit" | "too_soon" | null } | { ok: false; error: string };

export async function claimMinigameReward(game: string, grade: number): Promise<MinigameReward> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to win mint." };
  const def = MINIGAME_BY_ID.get(game);
  if (!def || def.legacy) return { ok: false, error: "That game doesn't pay mint." };
  if (!Number.isInteger(grade) || grade < 1 || grade > 3) return { ok: false, error: "That score doesn't count." };
  const { data, error } = await createAdminClient().rpc("claim_minigame_reward", { p_user: userId, p_game: game, p_grade: grade });
  if (error || !data) {
    if (error?.message?.startsWith("frozen")) return { ok: false, error: "Your account is paused right now." };
    console.error("claim_minigame_reward failed", error?.message);
    return { ok: false, error: "Couldn't collect your mint. Try again later." };
  }
  const d = data as { coins: number; left_today: number; reason: string | null };
  return { ok: true, coins: Number(d.coins ?? 0), leftToday: Number(d.left_today ?? 0), reason: d.reason === "daily_limit" || d.reason === "too_soon" ? d.reason : null };
}
