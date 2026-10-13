// The daily gift (docs/MONEY.md): once a day, made of four parts, all in naira (paid in mint at the
// city's rate): a base, yesterday's active time (up to 2 hours), your streak of days in a row (up
// to a week) and how long you've been playing (up to 20 weeks), all times your reputation (up to
// double). The database pays it once a day and caps it (game-db/073).
//
// Sized against the city: a flat costs ₦5–15m and a middling job used to pay about ₦2m a real day,
// so a new player gets ₦400k, a keen one about ₦2m, and the most is ₦6.4m.

export const GIFT_BASE = 300_000;
/** Per full 10 minutes active yesterday, up to 12 (2 hours). */
export const GIFT_PER_ACTIVE_10 = 100_000;
export const GIFT_ACTIVE_BLOCKS = 12;
/** Per day in a row, up to 7. */
export const GIFT_PER_STREAK_DAY = 100_000;
export const GIFT_STREAK_DAYS = 7;
/** Per full week since you started, up to 20. */
export const GIFT_PER_WEEK = 50_000;
export const GIFT_WEEKS = 20;
/** Reputation for double the gift. */
export const GIFT_REP_FOR_DOUBLE = 200;

export type GiftParts = { base: number; active: number; streak: number; playing: number; repTimes: number; total: number };

/** The gift (naira), part by part. */
export function dailyGift(p: { activeYesterday: number; streak: number; daysPlaying: number; reputation: number }): GiftParts {
  const n = (v: number) => (Number.isFinite(v) ? Math.max(0, v) : 0);
  const base = GIFT_BASE;
  const active = Math.min(GIFT_ACTIVE_BLOCKS, Math.floor(n(p.activeYesterday) / 10)) * GIFT_PER_ACTIVE_10;
  const streak = Math.min(GIFT_STREAK_DAYS, Math.max(1, Math.floor(n(p.streak)))) * GIFT_PER_STREAK_DAY;
  const playing = Math.min(GIFT_WEEKS, Math.floor(n(p.daysPlaying) / 7)) * GIFT_PER_WEEK;
  const repTimes = Math.round((1 + Math.min(GIFT_REP_FOR_DOUBLE, n(p.reputation)) / GIFT_REP_FOR_DOUBLE) * 100) / 100;
  const total = Math.round(((base + active + streak + playing) * repTimes) / 1000) * 1000;
  return { base, active, streak, playing, repTimes, total };
}
