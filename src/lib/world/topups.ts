// Top-ups (docs/MONEY.md): game money for real money, any time, through Paystack. ₦1,000 is
// ₦5,000,000 in the game; bigger top-ups carry a bonus; your first top-up is doubled (the database
// doubles it, game-db/076_topups.sql). Game money never turns back into real money.

export type TopUp = { id: string; naira: number; game: number; bonus: number };

/** Real naira → game naira, before bonuses. */
export const GAME_PER_NAIRA = 5_000;

export const TOPUPS: TopUp[] = [
  { id: "t1", naira: 1_000, game: 5_000_000, bonus: 0 },
  { id: "t2", naira: 2_500, game: 13_750_000, bonus: 10 },
  { id: "t5", naira: 5_000, game: 30_000_000, bonus: 20 },
  { id: "t10", naira: 10_000, game: 65_000_000, bonus: 30 },
  { id: "t25", naira: 25_000, game: 175_000_000, bonus: 40 },
];

export const topUpById = (id: string) => TOPUPS.find((t) => t.id === id) ?? null;
