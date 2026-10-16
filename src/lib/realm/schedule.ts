// When the Spirit Realm fights (docs/REALM.md). A battle at the top of every hour (UTC, so 9:00,
// 10:00...): armies are bought and placed any time before it, then everyone enters the realm at
// once, the battle plays for up to BATTLE_SECS, and the winners are paid.

export const HOUR_MS = 3_600_000;
/** The longest a battle lasts (seconds). */
export const BATTLE_SECS = 150;
/** After the battle, a little time before it's settled (phones finishing the last frames). */
export const SETTLE_GRACE_MS = 10_000;
/** Armies in one arena. More players than this: more arenas, all fighting at the same time. */
export const ARENA_SIZE = 30;
/** The winner of each arena takes this much of its pool; the rest goes to the city (the World Bank). */
export const WINNER_SHARE = 0.85;
/** Gates round the arena's edge to start from, like the hours on a clock (12 at the top). */
export const GATES = 12;

export type Phase = "fighting" | "results";

/** The battle you can still join: the next hour mark. */
export const nextBattleAt = (now: number) => Math.floor(now / HOUR_MS) * HOUR_MS + HOUR_MS;

/** The last battle (this hour's): whether it's being fought or over. */
export function lastBattle(now: number): { at: number; phase: Phase } {
  const at = Math.floor(now / HOUR_MS) * HOUR_MS;
  return { at, phase: now < at + BATTLE_SECS * 1000 ? "fighting" : "results" };
}

/** Can a battle at `at` be settled yet? */
export const canSettle = (at: number, now: number) => now >= at + BATTLE_SECS * 1000 + SETTLE_GRACE_MS;

/** "9:00", in the viewer's own clock. */
export const hourLabel = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
