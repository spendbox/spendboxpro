// What a landmark costs to buy (docs/LANDMARKS.md): crazy money. Every landmark on the map (a
// stadium, the airport, a cathedral, a market...) can be bought outright by one player, for a
// price in the tens of billions to trillions of naira. The price comes from what kind of place it
// is and how much ground it covers, and never changes for that landmark.

/** For each kind of landmark: its price in naira at its usual size (tiles, east–west × north–south). */
const BASE: Record<string, { naira: number; w: number; d: number }> = {
  intlairport: { naira: 1_500e9, w: 16, d: 10 },
  airport: { naira: 600e9, w: 2, d: 2 },
  spaceport: { naira: 1_200e9, w: 5, d: 5 },
  port: { naira: 900e9, w: 2, d: 2 },
  oilrig: { naira: 1_500e9, w: 2, d: 2 },
  dam: { naira: 1_000e9, w: 2, d: 2 },
  power: { naira: 800e9, w: 2, d: 2 },
  military: { naira: 1_000e9, w: 2, d: 2 },
  capitol: { naira: 700e9, w: 3, d: 3 },
  twin: { naira: 500e9, w: 2, d: 2 },
  campus: { naira: 500e9, w: 2, d: 2 },
  medcentre: { naira: 400e9, w: 4, d: 4 },
  megamall: { naira: 450e9, w: 3, d: 3 },
  arena: { naira: 400e9, w: 4, d: 4 },
  stadium: { naira: 400e9, w: 1, d: 1 },
  bank: { naira: 400e9, w: 3, d: 3 },
  grandmosque: { naira: 350e9, w: 4, d: 4 },
  cathedral: { naira: 300e9, w: 4, d: 4 },
  hotel: { naira: 300e9, w: 2, d: 2 },
  solar: { naira: 300e9, w: 2, d: 2 },
  bigpark: { naira: 250e9, w: 5, d: 5 },
  mall: { naira: 250e9, w: 2, d: 2 },
  market: { naira: 200e9, w: 2, d: 2 },
  beach: { naira: 200e9, w: 2, d: 2 },
  waterpark: { naira: 180e9, w: 2, d: 2 },
  funfair: { naira: 150e9, w: 2, d: 2 },
  hospital: { naira: 150e9, w: 1, d: 1 },
  museum: { naira: 120e9, w: 2, d: 2 },
  court: { naira: 100e9, w: 2, d: 2 },
  boxing: { naira: 100e9, w: 2, d: 2 },
  wrestling: { naira: 100e9, w: 2, d: 2 },
  gym: { naira: 80e9, w: 3, d: 3 },
  spa: { naira: 80e9, w: 3, d: 3 },
  worship: { naira: 80e9, w: 1, d: 1 },
  monument: { naira: 70e9, w: 1, d: 1 },
  club: { naira: 60e9, w: 1, d: 1 },
};
const OTHER = { naira: 100e9, w: 2, d: 2 };

/** The cheapest a landmark can be (naira). There's no top: the biggest cost the most. */
export const LANDMARK_MIN_NAIRA = 50e9;

/** A small, steady difference between landmarks of the same kind (−8%..+8%), from the name. */
function wobble(name: string) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
  return 1 + ((h % 1601) / 1600 - 0.5) * 0.16;
}

/** A price the way people say it: to the nearest ₦1bn, or the nearest ₦10bn from ₦100bn. */
function nice(naira: number) {
  const step = naira >= 100e9 ? 10e9 : 1e9;
  return Math.round(naira / step) * step;
}

/**
 * A landmark's price in naira: its kind's price, bigger or smaller with the ground it covers
 * (twice the ground costs about 1.4 times as much), never under ₦50bn and with no top, rounded.
 */
export function landmarkPriceNaira(l: { type: string; w?: number; d?: number; name: string }): number {
  const b = BASE[l.type] ?? OTHER;
  const w = Math.max(1, l.w ?? b.w);
  const d = Math.max(1, l.d ?? b.d);
  const size = Math.sqrt((w * d) / (b.w * b.d));
  const raw = b.naira * size * wobble(l.name);
  return nice(Math.max(LANDMARK_MIN_NAIRA, raw));
}

/** The same in mint (a region's perMint naira to the mint), to the cent. */
export function landmarkPriceMint(l: { type: string; w?: number; d?: number; name: string }, perMint: number): number {
  return Math.round((landmarkPriceNaira(l) / perMint) * 100) / 100;
}
