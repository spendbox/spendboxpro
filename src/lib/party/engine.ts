// Party games at a game table (docs/PARTY_GAMES.md): Truth or Dare and Impostor. Like Whot!, every
// phone plays the same game from the same seed and only the moves travel, one at a time, in order.
// A party game's rules are plain functions, so they're the same on every phone and easy to test.

/** turn() is a seat, OVER when the game has ended, or SYSTEM when the server has to say something (Impostor's reveal). */
export const OVER = -1;
export const SYSTEM = -2;

export type PartyRules<S, M> = {
  init: (seed: number, seats: number) => S;
  /** Whose move it is: a seat, OVER or SYSTEM. */
  turn: (s: S) => number;
  /** Whether this move is allowed now (from whoever's turn it is). */
  valid: (s: S, m: M) => boolean;
  play: (s: S, m: M) => S;
  /** What happens when the time runs out, or what the computer plays for someone who has left. */
  auto: (s: S) => M;
  /** Seconds for the move now. */
  secs: (s: S) => number;
  /** The seats with the most points once it's over (more than one: a draw), or null while it's going. */
  winners: (s: S) => number[] | null;
};

/** Cleans what someone typed: one line, no more than `max` characters. */
export const cleanText = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Seeded random numbers (mulberry32, as the minigames use): the same seed, the same game everywhere. */
export function makeRng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shuffled copy, from a seed. */
export function shuffled<T>(seed: number, list: readonly T[]): T[] {
  const r = makeRng(seed);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The seats with the top score. */
export function topSeats(scores: number[]) {
  const best = Math.max(...scores);
  return scores.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
}
