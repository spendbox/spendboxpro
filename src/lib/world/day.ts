// Your day (docs/DAY.md): every game day has 24 hours, and everything you do takes some of them:
// sleep, your main job and the trip there and back, a side hustle, study, exercise. What's left is
// free time, which your mind needs. Nobody can do everything at once: anything that won't fit in
// the day can't be taken on. Body and Mind move with how you spend your days.
//
// Shared by the server (which checks a plan fits before saving a change), the screens and the
// world lab. The database applies the daily changes the game works out here (game-db/041_your_day.sql).

import { courseById, type CourseKind } from "./living.ts";
import { tripKmBetween, type Commute } from "./work.ts";

export const DAY_HOURS = 24;
export const SLEEP_HOURS = 8;
export const JOB_HOURS = 8;
/** Everyone keeps at least this much time for themselves. */
export const MIN_FREE_HOURS = 1;

/** How fast each way of getting about goes in Lagos traffic (km/h). */
const SPEED: Record<Commute, number> = { walk: 5, keke: 15, okada: 22, danfo: 12, taxi: 18 };

/** Hours a game day getting to work and back. */
export function commuteHours(mode: Commute, km: number) {
  return Math.round(((2 * km) / SPEED[mode]) * 4) / 4;
}

/** Hours a game day a course takes while you're on it (you study part-time, alongside work). */
export const STUDY_HOURS: Record<CourseKind, number> = { short: 2, diploma: 3, degree: 4, licence: 4 };

// ---------------------------------------------------------------- exercise

export type Exercise = "none" | "walk" | "football" | "gym";

export const EXERCISE: Record<Exercise, { label: string; what: string; hours: number; body: number; mind: number; fee: number }> = {
  none: { label: "None", what: "No exercise", hours: 0, body: 0, mind: 0, fee: 0 },
  walk: { label: "Walk or jog", what: "Half an hour a day, free", hours: 0.5, body: 0.75, mind: 0.3, fee: 0 },
  football: { label: "Football", what: "An hour a day with the boys and girls on the street, free", hours: 1, body: 1.25, mind: 0.6, fee: 0 },
  gym: { label: "Gym", what: "An hour a day; membership ₦15,000 a month", hours: 1, body: 2, mind: 0.5, fee: 15_000 },
};
export const EXERCISES = Object.keys(EXERCISE) as Exercise[];

// ---------------------------------------------------------------- body and mind

/** Body (health) lost a game day before exercise. */
export const BODY_DECAY = 1.5;
export const MIND_START = 70;
/** Below this your mind is strained: interviews need one more right answer. Below BURNOUT: no work. */
export const STRESSED_BELOW = 25;
export const BURNOUT_BELOW = 10;

/** Long days (work, hustle, study and travel together) wear you down past this many hours. */
const LONG_DAY = 13;

export type DayPlan = {
  blocks: { id: "sleep" | "job" | "commute" | "hustle" | "study" | "exercise"; label: string; hours: number }[];
  busy: number;
  free: number;
  /** It fits in the day with at least MIN_FREE_HOURS to spare. */
  fits: boolean;
  /** Body and Mind a game day, living like this. */
  body: number;
  mind: number;
};

export type DayInput = {
  job: boolean;
  commute: { mode: Commute; km: number } | null;
  hustleHours: number;
  studyHours: number;
  exercise: Exercise;
  /** Owing bills (or the power cut) weighs on your mind. */
  owing?: boolean;
};

/** A day lived this way: the hours it takes, what's left, and what it does to body and mind. */
export function dayPlan(d: DayInput): DayPlan {
  const blocks: DayPlan["blocks"] = [{ id: "sleep", label: "Sleep", hours: SLEEP_HOURS }];
  if (d.job) blocks.push({ id: "job", label: "Main job", hours: JOB_HOURS });
  if (d.job && d.commute) {
    const h = commuteHours(d.commute.mode, d.commute.km);
    if (h > 0) blocks.push({ id: "commute", label: "Getting there", hours: h });
  }
  if (d.hustleHours > 0) blocks.push({ id: "hustle", label: "Side hustle", hours: d.hustleHours });
  if (d.studyHours > 0) blocks.push({ id: "study", label: "Study", hours: d.studyHours });
  const ex = EXERCISE[d.exercise];
  if (ex.hours > 0) blocks.push({ id: "exercise", label: ex.label, hours: ex.hours });
  const busy = blocks.reduce((t, b) => t + b.hours, 0);
  const free = Math.max(0, DAY_HOURS - busy);
  const effects = dayEffects(d, busy, free);
  const sum = (k: "body" | "mind") => Math.round(effects.reduce((t, e) => t + e[k], 0) * 100) / 100;
  return { blocks, busy, free, fits: free >= MIN_FREE_HOURS, body: sum("body"), mind: sum("mind") };
}

/** What adds to your body and mind each game day, and what wears them down (they add up to dayPlan's). */
export type DayEffect = { label: string; body: number; mind: number };

function dayEffects(d: DayInput, busy: number, free: number): DayEffect[] {
  const ex = EXERCISE[d.exercise];
  const working = busy - SLEEP_HOURS - ex.hours;
  const out: DayEffect[] = [{ label: "Daily wear and tear", body: -BODY_DECAY, mind: 0 }];
  out.push({ label: `Free time (${Math.round(free * 10) / 10}h a day)`, body: 0, mind: free >= 6 ? 2 : free >= 4 ? 1 : free >= 2 ? 0 : -1.5 });
  if (ex.hours > 0) out.push({ label: ex.label, body: ex.body, mind: ex.mind });
  if (working > LONG_DAY) out.push({ label: "Long working days", body: -0.5, mind: -1 });
  if (d.owing) out.push({ label: "Unpaid bills", body: 0, mind: -1 });
  return out;
}

/** The same, for showing: each thing that adds to or wears down your body or mind. */
export function dayEffectsOf(d: DayInput): DayEffect[] {
  const p = dayPlan(d);
  return dayEffects(d, p.busy, p.free);
}

export function mindWord(mind: number) {
  if (mind >= 75) return "Happy";
  if (mind >= 50) return "Settled";
  if (mind >= STRESSED_BELOW) return "Stretched";
  if (mind >= BURNOUT_BELOW) return "Stressed: interviews are harder";
  return "Burnt out: no work";
}

/** How much of a day's pay you get with this body and mind: none when bedridden or burnt out, half when unwell. */
export function workFactor(body: number, mind: number) {
  if (body < 10 || mind < BURNOUT_BELOW) return 0;
  if (body < 30) return 0.5;
  return 1;
}

// ---------------------------------------------------------------- what happened, hour by hour

/** Kinds of time spent, for "where your time went". */
export const TIME_KIND: Record<string, { label: string; colour: string }> = {
  job: { label: "Main job", colour: "#2f9e44" },
  commute: { label: "Getting there", colour: "#f08c00" },
  hustle: { label: "Side hustle", colour: "#d6336c" },
  study: { label: "Study", colour: "#1971c2" },
  exercise: { label: "Exercise", colour: "#12b886" },
};

/** A day as you live it now: your job and how you get there, your side hustle, a course, exercise. */
export function dayOf(life: {
  homeUnit: string | null;
  job: { place: string; mode: Commute } | null;
  hustleHours: number;
  course: string | null;
  exercise: Exercise;
  owing?: boolean;
}): DayInput {
  const km = life.job && life.homeUnit ? tripKmBetween(life.homeUnit, life.job.place) : null;
  const course = life.course ? courseById(life.course) : null;
  return {
    job: !!life.job,
    commute: life.job && km !== null ? { mode: life.job.mode, km } : null,
    hustleHours: life.hustleHours,
    studyHours: course ? STUDY_HOURS[course.kind] : 0,
    exercise: life.exercise,
    owing: life.owing,
  };
}

/** Hours a game day by kind, for writing down where the time went. */
export function hoursOf(plan: DayPlan): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of plan.blocks) if (b.id !== "sleep") out[b.id] = b.hours;
  return out;
}
