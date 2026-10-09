// Bits the four match simulations share.

import type { Rng } from "../rng";

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** "Chidi Okafor" -> "Okafor", "Daan de Jong" -> "de Jong". */
export function surname(full: string): string {
  const i = full.indexOf(" ");
  return i < 0 ? full : full.slice(i + 1);
}

/**
 * Fills a commentary template: {a}, {b}... are replaced from `vars`. Picks one of the
 * templates, avoiding the last few lines used so the ticker doesn't repeat itself.
 */
export function makeSay(rng: Rng) {
  const recent: string[] = [];
  return (templates: readonly string[], vars: Record<string, string | number>): string => {
    let tpl = rng.pick(templates);
    for (let i = 0; i < 4 && recent.includes(tpl) && templates.length > 1; i++) tpl = rng.pick(templates);
    recent.push(tpl);
    if (recent.length > 12) recent.shift();
    const out = tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
    return out.charAt(0).toUpperCase() + out.slice(1);
  };
}

/** Sigmoid. */
export const sig = (x: number) => 1 / (1 + Math.exp(-x));
