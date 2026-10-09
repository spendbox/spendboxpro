// Daily streaks: doing one thing a day keeps your streak going (playing a game, finishing a
// side quest, giving or spraying mint, a hug or a handshake, riding something). One missed day
// is saved by the week's free freeze. Rules live in game-db/027_streaks_levels.sql.

/** One of the last 7 days: counted, saved by the freeze, missed, or today (not counted yet). */
export type StreakDay = "done" | "freeze" | "missed" | "today";

export type Streak = {
  /** Days in a row (0 once it's broken). */
  current: number;
  best: number;
  /** Today already counts. */
  today: boolean;
  alive: boolean;
  /** This week's free freeze is still there. */
  freezeReady: boolean;
  /** You missed yesterday: the freeze saves your streak if you do something today. */
  freezeNeeded: boolean;
  /** The last 7 days, oldest first. */
  week: StreakDay[];
  /** The next milestone and what it pays. */
  next: number;
  nextReward: number;
  /** Mint for each milestone. */
  rewards: Record<number, number>;
};

/** Streak lengths that pay (and their badges). */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100] as const;
const DEFAULT_REWARDS: Record<number, number> = { 3: 10, 7: 25, 14: 50, 30: 100, 60: 200, 100: 500 };

/** streak_of() from the database, checked and tidied (null when there's nothing usable). */
export function cleanStreak(data: unknown): Streak | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (o.current == null) return null;
  const days = ["done", "freeze", "missed", "today"];
  const week = Array.isArray(o.week) ? o.week.map((d) => (days.includes(String(d)) ? (String(d) as StreakDay) : "missed")) : [];
  const rewards: Record<number, number> = { ...DEFAULT_REWARDS };
  if (o.rewards && typeof o.rewards === "object") {
    for (const [k, v] of Object.entries(o.rewards as Record<string, unknown>)) rewards[Number(k)] = Number(v) || 0;
  }
  return {
    current: Number(o.current) || 0,
    best: Number(o.best) || 0,
    today: Boolean(o.today),
    alive: Boolean(o.alive),
    freezeReady: Boolean(o.freeze_ready),
    freezeNeeded: Boolean(o.freeze_needed),
    week: week.slice(-7),
    next: Number(o.next) || 3,
    nextReward: Number(o.next_reward) || 0,
    rewards,
  };
}
