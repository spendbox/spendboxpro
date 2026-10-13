// Side hustles (docs/DAY.md): one alongside your main job, a few hours a game day. Each has a start-up
// cost (gone once spent) and earns more some days than others. Breakthrough moments can boost one
// for a while, or, chosen badly, stop it earning for a few days (src/lib/world/breakthroughs.ts).
// Earnings are real Lagos ones, a month, in naira.

import type { Prices } from "./region.ts";
import { skillLevel, SKILL_BONUS, type WorkSkill } from "./work.ts";

export type Hustle = {
  id: string;
  title: string;
  what: string;
  /** Hours a game day. */
  hours: number;
  /** What it costs to start (local money): equipment, stock. */
  start: number;
  /** About what it earns a month (local money). */
  month: number;
  /** How much a day's earnings swing either way (0.3 = 30% up or down). */
  swing: number;
  skill: WorkSkill;
  /** A skill level it needs, if any. */
  level?: number;
};

export const HUSTLES: Hustle[] = [
  { id: "tutoring", title: "Home tutoring", what: "Lessons after school, in your area", hours: 2, start: 5_000, month: 40_000, swing: 0.2, skill: "education", level: 1 },
  { id: "braiding", title: "Hair braiding", what: "Braids and cornrows at home", hours: 3, start: 20_000, month: 55_000, swing: 0.35, skill: "beauty" },
  { id: "small_chops", title: "Small chops", what: "Puff-puff, samosa and spring rolls for parties", hours: 3, start: 40_000, month: 75_000, swing: 0.5, skill: "food" },
  { id: "reselling", title: "Online reselling", what: "Thrift and gadgets on social media", hours: 3, start: 100_000, month: 80_000, swing: 0.5, skill: "retail" },
  { id: "phone_repair", title: "Phone repairs", what: "Screens, batteries and charging ports", hours: 3, start: 80_000, month: 90_000, swing: 0.35, skill: "tech" },
  { id: "pos", title: "POS agent", what: "Cash withdrawals and transfers for your street", hours: 4, start: 150_000, month: 70_000, swing: 0.25, skill: "finance" },
  { id: "content", title: "Content creation", what: "Skits and reviews; some weeks go viral", hours: 2, start: 50_000, month: 60_000, swing: 0.9, skill: "entertainment" },
  { id: "dispatch", title: "Dispatch rider", what: "Deliveries on a motorbike", hours: 4, start: 600_000, month: 150_000, swing: 0.3, skill: "transport" },
];

export const hustleById = (id: string) => HUSTLES.find((h) => h.id === id);

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * How much more than real earnings a side hustle pays. Jobs got a bigger raise in part 65
 * (src/lib/world/work.ts PAY_BOOST); hustles stay at 4 times, a little extra on the side.
 */
export const HUSTLE_BOOST = 4;

/** About what a hustle earns a game day (mint), at your skill. */
export function hustleDay(h: Pick<Hustle, "month">, prices: Prices, skillDays = 0) {
  return r2(((h.month * HUSTLE_BOOST) / 30 / prices.perMint) * (1 + skillLevel(skillDays) * SKILL_BONUS));
}

export function hustleStart(h: Pick<Hustle, "start">, prices: Prices) {
  return r2(h.start / prices.perMint);
}
