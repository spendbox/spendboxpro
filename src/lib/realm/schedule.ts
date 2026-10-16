// When the Spirit Realm fights (docs/REALM.md). One battle every hour (UTC, so it runs 9:00 to
// 10:00, 10:00 to 11:00...): it starts on the hour and lasts the whole hour. Players send troops
// in whenever they like while it's on (they come through a portal a little later), and when the
// hour ends the top armies of each arena are paid.

export const HOUR_MS = 3_600_000;
/** A battle lasts the whole hour (seconds). */
export const BATTLE_SECS = 3600;
/** No new troops in the last minutes (they'd barely arrive). */
export const CLOSE_SECS = 120;
/** Troops sent come through their portal this long after (seconds), so every phone hears of them in time. */
export const ARRIVE_SECS = 20;
/** At least this long between two sends by the same player (seconds). */
export const SEND_GAP_SECS = 10;
/** After the battle, a little time before it's settled (phones finishing the last frames). */
export const SETTLE_GRACE_MS = 10_000;
/** Players in one arena. More players than this: more arenas, all fighting at the same time. */
export const ARENA_SIZE = 20;
/** What the first, second and third of each arena take of its pool (the rest goes to the city). */
export const PRIZE_SHARES = [0.5, 0.23, 0.12] as const;
/** Most one player can spend on troops in one battle (mint), and most sends. */
export const MAX_SPEND_PER_BATTLE = 3000;
export const MAX_SENDS = 30;

/** The battle being fought now (it began at the last hour mark). */
export const battleAt = (now: number) => Math.floor(now / HOUR_MS) * HOUR_MS;
/** When it ends. */
export const battleEnd = (at: number) => at + BATTLE_SECS * 1000;
/** Can troops still be sent into the battle that began at `at`? */
export const canSend = (at: number, now: number) => now >= at && now < battleEnd(at) - CLOSE_SECS * 1000;
/** Can a battle at `at` be settled yet? */
export const canSettle = (at: number, now: number) => now >= battleEnd(at) + SETTLE_GRACE_MS;

/** "9:00", in the viewer's own clock. */
export const hourLabel = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
