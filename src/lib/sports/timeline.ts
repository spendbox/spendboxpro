// When each part of a match happens, in real milliseconds after kick-off (public, the same
// for every match of a sport). The simulation fills these windows; the viewer labels them.

/** Football: two halves of 45' (plus added time) squeezed into 280 s each, a 30 s break. */
export const FOOTBALL = {
  h1: [0, 280_000],
  ht: [280_000, 310_000],
  h2: [310_000, 590_000],
  end: 600_000,
} as const;

/** Basketball: four 12-minute quarters of 100 s each, short breaks, room for one overtime. */
export const BASKETBALL = {
  quarters: [
    [0, 100_000],
    [110_000, 210_000],
    [225_000, 325_000],
    [335_000, 435_000],
    [445_000, 475_000],
  ],
  quarterSec: 720,
  otSec: 300,
  end: 480_000,
} as const;

/** Boxing: 10 s of introductions, six 3-minute rounds of 45 s each with 10 s breaks, then the decision. */
export const BOXING = {
  intro: 10_000,
  round: 45_000,
  rest: 10_000,
  rounds: 6,
  roundSec: 180,
  end: 360_000,
} as const;

export function roundStart(r: number): number {
  return BOXING.intro + (r - 1) * (BOXING.round + BOXING.rest);
}

/** Wrestling: entrances, then one fall to a finish (the match is always over by `latest`). */
export const WRESTLING = {
  bell: 12_000,
  latest: 285_000,
  end: 300_000,
  /** Match-clock seconds per real second. */
  speed: 4.2,
} as const;

/** "63'", "45+2'", "90+4'" from a football frame's clock (seconds) and phase. */
export function footballMinute(c: number, ph: number): string {
  if (ph <= 0) return "0'";
  if (ph === 2) return "HT";
  if (ph >= 4) return "FT";
  const first = ph === 1;
  const cap = first ? 2700 : 5400;
  if (c < cap) return `${Math.floor(c / 60) + 1}'`;
  return `${first ? 45 : 90}+${Math.floor((c - cap) / 60) + 1}'`;
}

/** "Q3 7:12", "OT 0:41", "Half-time", "Final". */
export function basketballClock(q: number, c: number, ph: number): string {
  if (ph === 0) return "Tip-off";
  if (ph === 4) return "Final";
  if (ph === 3) return "Half-time";
  const label = q >= 5 ? "OT" : `Q${q}`;
  if (ph === 2) return `End of ${q >= 5 ? "OT" : `Q${q}`}`;
  const s = Math.max(0, Math.ceil(c));
  return `${label} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "Round 3 · 1:24" or "Round 3 · break". */
export function boxingClock(r: number, c: number, ph: number): string {
  if (ph === 0) return "Introductions";
  if (ph === 4) return "Fight over";
  if (ph === 2) return `End of round ${r}`;
  const s = Math.max(0, Math.floor(c));
  return `Round ${r} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
