"use server";

import { currentUserId } from "@/lib/game";
import { cleanStreak, type Streak } from "@/lib/streaks";
import { createAdminClient } from "@/lib/supabase/admin";

// Daily streaks. Games, side quests and gifts count by themselves (the database sees them);
// riding something is only seen by the app, so it reports it here. A day counts once, so
// calling this again the same day changes nothing.

/** You rode something today: count it towards your streak. */
export async function rodeSomething(): Promise<{ ok: true; streak: Streak | null; newDay: boolean; reward: number } | { ok: false }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false };
  const { data, error } = await createAdminClient().rpc("streak_touch", { p_user: userId, p_action: "ride" });
  if (error) return { ok: false };
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, streak: cleanStreak(data), newDay: Boolean(d.new_day), reward: Number(d.reward ?? 0) };
}
