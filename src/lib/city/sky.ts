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

/**
 * When it rains this round (as parts of the hunt, 0..1). Rain is rare: about one round in
 * five has any, as one or two short showers of 1½ to 3 minutes each (the hunt is an hour).
 */
export function rainSpells(roundId: number): { from: number; to: number }[] {
  if (hash(roundId, 1, 4243) >= 0.21) return [];
  const spell = (k: number, lo: number, hi: number) => {
    const len = 0.025 + hash(roundId, 10 + k, 4243) * 0.025;
    const from = lo + hash(roundId, 20 + k, 4243) * (hi - lo - len);
    return { from, to: from + len };
  };
  return hash(roundId, 2, 4243) < 0.35 ? [spell(0, 0.04, 0.48), spell(1, 0.52, 0.96)] : [spell(0, 0.05, 0.95)];
}

/** How long the rain takes to set in and to stop, and how long clouds gather before it. */
const RAMP = 0.008;
const GATHER = 0.03;

/** The weather at this point of the round (changes at a few moments per round). */
export function weatherAt(roundId: number, progress: number): { kind: Weather; strength: number } {
  for (const s of rainSpells(roundId)) {
    if (progress >= s.from && progress <= s.to) {
      const k = Math.min(progress - s.from, s.to - progress) / RAMP;
      return { kind: "rain", strength: Math.min(1, 0.15 + k * 0.85) };
    }
    // Clouds roll in before a shower and clear away after it.
    const away = progress < s.from ? s.from - progress : progress - s.to;
    if (away < GATHER) return { kind: "cloudy", strength: 0.35 + 0.65 * (1 - away / GATHER) };
  }
  const slot = Math.min(3, Math.floor(progress * 4));
  const r = hash(roundId, slot, 4242);
  const kind: Weather = r < 0.5 ? "clear" : r < 0.8 ? "cloudy" : "fog";
  // Ease in and out within the slot so changes aren't sudden.
  const inSlot = progress * 4 - slot;
  const strength = Math.min(1, Math.min(inSlot, 1 - inSlot) * 5 + 0.25);
  return { kind, strength };
}
