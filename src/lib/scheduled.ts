// Scheduled games: big games that start at set times of day, the same for everyone (Lagos time,
// which is UTC+1 all year). The first is Police & Thieves, every 8 hours: 2am, 10am and 6pm.
// More can be added here (and in game-db/123_scheduled_games.sql, sched_games), each with its own
// hours and length.
//
// Plain data and maths (no React, no database), so the server and the phone agree on the times.

export type ScheduledGame = {
  id: string;
  title: string;
  /** Lagos hours it starts at (0-23). */
  hours: number[];
  /** From the start until the fighting begins: rooms are made, phones load the map, a countdown. */
  warmupSecs: number;
  /** How long the fighting lasts. */
  playSecs: number;
  /** After the end: how long phones have to send in the result before the server settles it anyway. */
  graceSecs: number;
  /** Most people on each side of one match (more sign-ups make more matches). */
  sideSize: number;
};

export const SCHEDULED: Record<string, ScheduledGame> = {
  "cops-robbers": { id: "cops-robbers", title: "Police & Thieves", hours: [2, 10, 18], warmupSecs: 30, playSecs: 600, graceSecs: 180, sideSize: 8 },
};

/** Lagos is UTC+1 (no summer time). */
const LAGOS_OFFSET_MS = 3_600_000;
const HOUR = 3_600_000;

export type Session = {
  game: string;
  /** When it starts (ms): sign-ups and the shop close. */
  starts: number;
  /** When the fighting begins. */
  fight: number;
  /** When the fighting ends. */
  ends: number;
  /** Its id between the phone and the server: the start time, as ISO text. */
  key: string;
};

function session(g: ScheduledGame, starts: number): Session {
  const fight = starts + g.warmupSecs * 1000;
  return { game: g.id, starts, fight, ends: fight + g.playSecs * 1000, key: new Date(starts).toISOString() };
}

/** Every start time of a game from a little before `from` (ms), in order. */
function startsFrom(g: ScheduledGame, from: number, count: number): number[] {
  const out: number[] = [];
  // Midnight in Lagos on the day before, then every listed hour.
  const lagos = from + LAGOS_OFFSET_MS;
  const day0 = Math.floor(lagos / (24 * HOUR)) * 24 * HOUR - LAGOS_OFFSET_MS - 24 * HOUR;
  const hours = [...g.hours].sort((a, b) => a - b);
  for (let d = 0; out.length < count && d < 30; d++) for (const h of hours) {
    const t = day0 + d * 24 * HOUR + h * HOUR;
    if (t + (g.warmupSecs + g.playSecs) * 1000 > from) out.push(t);
    if (out.length >= count) break;
  }
  return out;
}

/**
 * Where a game is at, now: the one being played (if the fighting hasn't ended), and the next one
 * to sign up for (always there: sign-ups open as soon as the one before starts).
 */
export function sessionsNow(id: string, now = Date.now()): { live: Session | null; next: Session } {
  const g = SCHEDULED[id];
  if (!g) throw new Error(`Unknown scheduled game ${id}`);
  const list = startsFrom(g, now, 3).map((t) => session(g, t));
  const live = list.find((s) => s.starts <= now && now < s.ends) ?? null;
  const next = list.find((s) => s.starts > now)!;
  return { live, next };
}

/** The session that starts at this ISO time, if it really is one of the game's start times. */
export function sessionAt(id: string, key: string): Session | null {
  const g = SCHEDULED[id];
  const t = Date.parse(key);
  if (!g || !Number.isFinite(t)) return null;
  const lagosHour = new Date(t + LAGOS_OFFSET_MS).getUTCHours();
  if (t % HOUR !== 0 || !g.hours.includes(lagosHour)) return null;
  return session(g, t);
}

/** "6pm" for a session's start (Lagos time). */
export function startLabel(starts: number) {
  const h = new Date(starts + LAGOS_OFFSET_MS).getUTCHours();
  return h === 0 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h}am` : `${h - 12}pm`;
}

/** The time of day a session is played in (for the sky and the lights): day, sunset or night. */
export function timeOfDay(starts: number): "day" | "dusk" | "night" {
  const h = new Date(starts + LAGOS_OFFSET_MS).getUTCHours();
  return h >= 7 && h < 17 ? "day" : h >= 17 && h < 20 ? "dusk" : "night";
}

/** "2h 05m", "4:59" or "now", until a time. */
export function countdown(ms: number) {
  if (ms <= 0) return "now";
  const s = Math.ceil(ms / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
