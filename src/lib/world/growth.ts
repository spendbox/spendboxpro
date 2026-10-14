// The city grows with its players (docs/GROWTH.md). Each city has a growth level, from how many
// people live there; it only ever goes up (game-db/091_city_growth.sql keeps it). As it rises,
// buildings nobody owns yet are rebuilt taller, plots and bungalows give way to blocks of flats,
// and gated estates spread (more of them, and bigger: one estate across several blocks). Anything
// already owned stands as it was bought. Sold-out blocks also grow on their own (grownBuilding in
// ./buildings.ts). Server and screens read the same level, so a price shown is the price paid.

import type { BuildingKind } from "./buildings.ts";

/** Players living in a city for each growth level (level 0 below the first). Mirrored in game-db/091. */
export const GROWTH_STEPS = [1_000, 3_000, 7_500, 15_000, 30_000, 60_000, 120_000, 250_000, 500_000];
export const GROWTH_MAX = GROWTH_STEPS.length;

/** A city's growth level from how many people live there. */
export function growthLevelFor(lives: number): number {
  let level = 0;
  for (const step of GROWTH_STEPS) if (lives >= step) level++;
  return level;
}

/** Players needed for the next level (null at the top). */
export const nextGrowthAt = (level: number) => GROWTH_STEPS[level] ?? null;

const levels = new Map<string, number>();

/** Set a city's level (from the server). Never goes down. */
export function setGrowth(region: string, level: number) {
  const l = Math.max(0, Math.min(GROWTH_MAX, Math.floor(level || 0)));
  if (l > (levels.get(region) ?? 0)) levels.set(region, l);
}

/** A city's growth level now (0 until it's known). */
export const growthOf = (region: string) => levels.get(region) ?? 0;

/** How tall each stacking kind may grow (storeys). */
export const STOREY_CAP: Partial<Record<BuildingKind, number>> = { flats: 20, mixed: 16, plaza: 10, offices: 50, apartments: 80, glass: 100 };

/** Storeys for a kind once the city has grown: half as tall again each level, up to its cap. */
export function grownStoreys(kind: BuildingKind, storeys: number, level: number): number {
  const cap = STOREY_CAP[kind];
  if (!cap || level <= 0) return storeys;
  return Math.min(Math.max(cap, storeys), Math.round(storeys * (1 + 0.5 * level)));
}

/** Low kinds that are rebuilt into blocks as a city grows (rooming houses stay: they're the free homes). */
const REBUILT: Partial<Record<BuildingKind, true>> = { bungalow: true, shops: true, land: true, duplex: true, terrace: true };

/**
 * What a low building becomes as the city grows (or itself): blocks of flats and apartment towers
 * on quiet streets, apartments where it's busy, and from level 2 the edges of town fill in with
 * flats too. roll is the building's own (0..1); more of them go each level.
 */
export function rebuiltKind(kind: BuildingKind, zone: "central" | "busy" | "quiet" | "edge", roll: number, level: number): BuildingKind {
  if (level <= 0 || !REBUILT[kind]) return kind;
  if (zone === "edge") return roll < Math.min(0.6, 0.07 * (level - 1)) ? "flats" : kind;
  const chance = Math.min(0.85, 0.1 * level);
  if (roll >= chance) return kind;
  return zone === "quiet" && roll < chance * 0.6 ? "flats" : "apartments";
}

/** Estates: how often a well-off block is one, the wealth it needs, and how many blocks one spans across. */
export function estateRule(level: number) {
  return {
    chance: Math.min(0.45, 0.16 + 0.04 * level),
    wealth: Math.max(0.15, 0.35 - 0.025 * level),
    blocks: level >= 6 ? 3 : level >= 3 ? 2 : 1,
  };
}
