// Seeded random numbers for the minigames: the same seed always gives the same game, so two
// people in a challenge (or a turn-based game played on two phones) see exactly the same
// targets, cards and dice.

/** A random number maker from a seed: call it for the next number, 0 (inclusive) to 1. */
export type Rng = () => number;

/** mulberry32: small, fast and good enough for games. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One random number from a seed and a few more numbers (no state to carry around). */
export function hashRand(...parts: number[]) {
  let h = 2166136261;
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 16777619);
    h = Math.imul(h ^ ((p * 1000) | 0), 2246822507);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A whole number from lo to hi (both included). */
export const randInt = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
/** One thing from a list. */
export const pick = <T>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length)];
/** A shuffled copy. */
export function shuffle<T>(r: Rng, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
/** A new random seed (for a fresh game). */
export const newSeed = () => (Math.random() * 2 ** 31) >>> 0 || 7;
