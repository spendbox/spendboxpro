import "server-only";
import { matchAt, matchById, slotAt, SPORTS } from "@/lib/sports/schedule";
import { resultOf } from "@/lib/sports/sim.server";
import { createAdminClient } from "@/lib/supabase/admin";

// Paying out a finished match's bets. The database (settle_match in game-db/020_sports.sql)
// only pays the first time, so this is safe to call as often as you like: the match feed calls
// it when a match ends, and "My bets" calls it for any bet whose match is over.

/** Matches this server has already seen settled (so repeat calls skip the database). */
const settled = new Set<string>();

/**
 * Settle a match if it has finished. Returns true once it's settled (now or before), false if
 * it isn't over yet or the database couldn't be reached (the next call tries again).
 */
export async function settleIfDue(matchId: string, nowMs = Date.now()): Promise<boolean> {
  if (settled.has(matchId)) return true;
  const match = matchById(matchId);
  if (!match || nowMs < match.endsAt) return false;
  const result = resultOf(matchId, nowMs);
  if (!result) return false;
  try {
    const { error } = await createAdminClient().rpc("settle_match", {
      p_match: match.id,
      p_winner: result.winner,
      p_score: result.score ?? null,
      p_summary: result.summary ?? null,
      p_options: match.options.map((o) => o.key),
    });
    if (error) {
      console.error("Settling a match failed", matchId, error.message);
      return false;
    }
  } catch (error) {
    console.error("Settling a match failed", matchId, error);
    return false;
  }
  if (settled.size > 2000) settled.clear();
  settled.add(matchId);
  return true;
}

/**
 * Pay out the last few finished matches of every sport (bettors don't have to open anything).
 * The game page calls this in the background now and then; matches already settled cost nothing.
 */
export async function settleRecent(nowMs = Date.now()) {
  const due: string[] = [];
  for (const sport of SPORTS) {
    const s = slotAt(sport, nowMs);
    for (let k = 0; k < 4 && s - k >= 0; k++) {
      const m = matchAt(sport, s - k);
      if (m.endsAt <= nowMs) due.push(m.id);
    }
  }
  await Promise.allSettled(due.map((id) => settleIfDue(id, nowMs)));
}
