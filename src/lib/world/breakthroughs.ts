// Breakthrough moments (docs/DAY.md): now and then at work or in a side hustle, a moment with three
// choices. Choose well: a bonus at work (three game days' pay and experience) or a boost to a side
// hustle (double earnings for three game days). Choose badly: nothing, or a stalled side hustle.
// Server only (src/lib/world/breakthrough-bank.ts holds the best answers).

import { HUSTLE_BREAKTHROUGHS, JOB_BREAKTHROUGHS, type Breakthrough } from "./breakthrough-bank.ts";

/** Chance of a moment each game day worked: about one in ten at work, one in six in a side hustle. */
export const EVENT_RATE = { job: 1 / 10, hustle: 1 / 6 } as const;
/** Real hours to answer before it's gone. */
export const EVENT_HOURS = 2;
export const WIN = { bonusDays: 3, skillDays: 3, boost: 2, boostDays: 3 } as const;

const ALL = new Map<string, Breakthrough>([...Object.values(JOB_BREAKTHROUGHS).flat(), ...Object.values(HUSTLE_BREAKTHROUGHS).flat()].map((b) => [b.id, b]));

/** Whether a moment comes, after `days` game days of work since last looked. */
export function eventComes(source: "job" | "hustle", days: number, rand: () => number = Math.random) {
  return days > 0 && rand() < 1 - Math.exp(-EVENT_RATE[source] * Math.min(days, 7));
}

/** A moment for a job's skill or a side hustle. */
export function drawEvent(source: "job" | "hustle", of: string, rand: () => number = Math.random): Breakthrough | null {
  const list = (source === "job" ? JOB_BREAKTHROUGHS : HUSTLE_BREAKTHROUGHS)[of] ?? [];
  return list.length ? list[Math.floor(rand() * list.length)] : null;
}

/** A moment as a player sees it (no best answer). */
export function showEvent(id: string) {
  const b = ALL.get(id);
  return b ? { id: b.id, title: b.title, text: b.text, choices: b.choices } : null;
}

/** How a choice went. */
export function markEvent(id: string, choice: number) {
  const b = ALL.get(id);
  if (!b) return null;
  const won = b.best === choice;
  return { won, said: won ? b.win : b.lose, stall: won ? 0 : (b.stall ?? 0) };
}
