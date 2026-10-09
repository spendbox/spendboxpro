// Small deterministic random numbers, the same on every server and browser. The public
// schedule seeds them from the match slot; the secret simulation seeds them from an HMAC.

export type Rng = {
  /** 0 <= x < 1 */
  next: () => number;
  /** a <= x < b */
  range: (a: number, b: number) => number;
  /** Whole number a..b (both included). */
  int: (a: number, b: number) => number;
  chance: (p: number) => boolean;
  pick: <T>(list: readonly T[]) => T;
  /** Picks by weight (weights don't need to add up to 1). Returns the index. */
  weighted: (weights: readonly number[]) => number;
  /** Roughly normal, mean 0, spread 1. */
  normal: () => number;
};

/** A 32-bit hash of a string (cyrb-style mixing). */
export function hashStr(s: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** sfc32: fast, good quality, 128 bits of state. */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function makeRng(a: number, b = 0x9e3779b9, c = 0x243f6a88, d = 0xb7e15162): Rng {
  const next = sfc32(a, b, c, d);
  for (let i = 0; i < 12; i++) next();
  const rng: Rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    weighted: (weights) => {
      let sum = 0;
      for (const w of weights) sum += Math.max(0, w);
      let r = next() * sum;
      for (let i = 0; i < weights.length; i++) {
        r -= Math.max(0, weights[i]);
        if (r < 0) return i;
      }
      return weights.length - 1;
    },
    normal: () => (next() + next() + next() + next() - 2) * 1.732,
  };
  return rng;
}

/** A random stream from a string key (public: anyone can compute it). */
export function rngFrom(key: string): Rng {
  return makeRng(hashStr(key, 1), hashStr(key, 2), hashStr(key, 3), hashStr(key, 4));
}
