// Tiny repeatable dice for the NPCs: the same seed always rolls the same numbers, so every
// player sees the same people saying the same things without anything being stored.

export type Rand = () => number;

/** A 32-bit fingerprint of some text (FNV-1a). */
export function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Repeatable random numbers in [0, 1) from a seed. */
export function seeded(seed: string): Rand {
  let h = hashText(seed) || 1;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    // A little extra stirring so neighbouring seeds drift apart quickly.
    h = (h + 0x6d2b79f5) | 0;
    return (h >>> 0) / 4294967296;
  };
}

export const pick = <T,>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length) % list.length];

export const chance = (rand: Rand, p: number) => rand() < p;

export const between = (rand: Rand, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

/** Pick by weight: [[item, weight], …]. */
export function weighted<T>(rand: Rand, list: readonly (readonly [T, number])[]): T {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [item, w] of list) {
    r -= w;
    if (r < 0) return item;
  }
  return list[list.length - 1][0];
}

/** A few different items from a list, in random order. */
export function sample<T>(rand: Rand, list: readonly T[], n: number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, n));
}
