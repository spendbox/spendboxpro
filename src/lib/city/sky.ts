// Time of day and weather for a round. The hunt runs morning→night in even rounds and
// night→morning in odd ones; weather changes a few times per round, picked from the round
// number so every player sees the same sky.

import { hash } from "./layout";

export type Weather = "clear" | "cloudy" | "rain" | "fog";

/** 1 = full daylight, 0 = deep night. */
export function daylight(progress: number, nightFirst: boolean) {
  const p = nightFirst ? 1 - progress : progress;
  // Morning (bright) for the first half, sunset around 70%, night at the end.
  if (p < 0.55) return 1;
  if (p > 0.9) return 0;
  return 1 - (p - 0.55) / 0.35;
}

/** The weather at this point of the round (changes at a few moments per round). */
export function weatherAt(roundId: number, progress: number): { kind: Weather; strength: number } {
  const slot = Math.min(3, Math.floor(progress * 4));
  const r = hash(roundId, slot, 4242);
  const kind: Weather = r < 0.5 ? "clear" : r < 0.72 ? "cloudy" : r < 0.9 ? "rain" : "fog";
  // Ease in and out within the slot so changes aren't sudden.
  const inSlot = progress * 4 - slot;
  const strength = Math.min(1, Math.min(inSlot, 1 - inSlot) * 5 + 0.25);
  return { kind, strength };
}
