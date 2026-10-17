// Police & Thieves (src/app/play/cops): what you can buy before a game, its price (real Lagos
// naira, like every other price) and how each gun behaves. Plain data, so the server takes the
// price from here (never from the phone) and the match uses the same numbers.
//
// Signing up is free. Everything you spend on gear goes into your match's pool, less a tenth for
// the house. The winning side shares the pool by how much each of them did (docs/POLICE_THIEVES.md).

import { everyday } from "./world/price-level.ts";

/** Signing up is free: the pool is what players spend on weapons and gear. */
export const COPS_TICKET_NAIRA = 0;

export type GunId = "pistol" | "smg" | "shotgun" | "rifle" | "sniper" | "rocket";
export type GearId = Exclude<GunId, "pistol"> | "grenade" | "medkit" | "armour" | "tank";

export type Gun = {
  name: string;
  /** Damage a hit (each pellet, for the shotgun). */
  dmg: number;
  /** Shots a second. */
  rate: number;
  /** Hold FIRE to keep shooting. */
  auto: boolean;
  mag: number;
  reload: number;
  /** How far off a shot can go (radians), moving and aiming change it. */
  spread: number;
  /** How fast its bullets fly (m/s). */
  speed: number;
  /** How far before a bullet drops out. */
  range: number;
  pellets?: number;
  /** Explodes where it lands: this radius (m). */
  splash?: number;
  /** Rockets you carry in all (others reload for ever). */
  ammo?: number;
  /** Aiming looks through a scope. */
  scope?: boolean;
  colour: number;
};

export const GUNS: Record<GunId, Gun> = {
  pistol: { name: "Pistol", dmg: 20, rate: 4, auto: false, mag: 12, reload: 1.2, spread: 0.014, speed: 320, range: 70, colour: 0x2b2f35 },
  smg: { name: "SMG", dmg: 13, rate: 11, auto: true, mag: 32, reload: 1.8, spread: 0.032, speed: 300, range: 55, colour: 0x343a40 },
  shotgun: { name: "Shotgun", dmg: 12, rate: 1.2, auto: false, mag: 6, reload: 2.4, spread: 0.085, speed: 260, range: 26, pellets: 8, colour: 0x5c3d2e },
  rifle: { name: "Assault rifle", dmg: 22, rate: 8, auto: true, mag: 30, reload: 2, spread: 0.018, speed: 380, range: 110, colour: 0x3d4a3a },
  sniper: { name: "Sniper", dmg: 95, rate: 0.8, auto: false, mag: 5, reload: 2.6, spread: 0.05, speed: 650, range: 240, scope: true, colour: 0x2f3b2f },
  rocket: { name: "Rocket launcher", dmg: 160, rate: 0.6, auto: false, mag: 1, reload: 2.2, spread: 0.01, speed: 55, range: 160, splash: 8, ammo: 6, colour: 0x4b5a3c },
};

export type Gear = { id: GearId; name: string; naira: number; max: number; kind: "gun" | "throw" | "heal" | "armour" | "vehicle"; blurb: string };

export const GEAR: Gear[] = [
  { id: "smg", name: "SMG", naira: 20_000, max: 1, kind: "gun", blurb: "Fast and close: sprays 11 a second." },
  { id: "shotgun", name: "Shotgun", naira: 30_000, max: 1, kind: "gun", blurb: "Eight pellets. Deadly round a corner." },
  { id: "rifle", name: "Assault rifle", naira: 50_000, max: 1, kind: "gun", blurb: "The all-rounder: hits hard, reaches far." },
  { id: "sniper", name: "Sniper", naira: 80_000, max: 1, kind: "gun", blurb: "One shot nearly takes anyone down. Aim to scope in." },
  { id: "rocket", name: "Rocket launcher", naira: 120_000, max: 1, kind: "gun", blurb: "Six rockets. Blows up anyone near, and tanks." },
  { id: "grenade", name: "Grenade", naira: 5_000, max: 6, kind: "throw", blurb: "Throw over cover; it goes off after 2 seconds and hits everyone 9 m round." },
  { id: "medkit", name: "Medkit", naira: 5_000, max: 3, kind: "heal", blurb: "Back to full health in a moment." },
  { id: "armour", name: "Body armour", naira: 30_000, max: 1, kind: "armour", blurb: "60 more health, back every time you respawn. Police get it free." },
  { id: "tank", name: "Tank", naira: 300_000, max: 1, kind: "vehicle", blurb: "Call it in once: 700 health and a cannon that blasts 10 m round." },
];
export const GEAR_BY_ID = new Map(GEAR.map((g) => [g.id, g]));

/** What you've bought for a game: how many of each. */
export type Loadout = Partial<Record<GearId, number>>;

/** A price in naira at Newtown's level, in mint (the game's money in the database). */
export function copsMint(naira: number, nairaPerMint = 1_500) {
  return Math.round((everyday(naira) / nairaPerMint) * 100) / 100;
}

/** The guns a loadout carries, in the order the switch button goes through them. */
export function gunsOf(l: Loadout): GunId[] {
  const out: GunId[] = [];
  for (const g of ["rifle", "smg", "shotgun", "sniper", "rocket"] as const) if (l[g]) out.push(g);
  out.push("pistol");
  return out;
}

/** What a loadout cost (naira), without the ticket. */
export function loadoutNaira(l: Loadout) {
  let n = 0;
  for (const g of GEAR) n += (l[g.id] ?? 0) * g.naira;
  return n;
}

/** Practice against bots: what you play with (nothing to buy, no pool). */
export const PRACTICE_LOADOUT: Loadout = { rifle: 1, shotgun: 1, rocket: 1, grenade: 3, medkit: 2, armour: 1, tank: 1 };

/** Police always wear body armour (free); thieves can buy it. */
export const hasArmour = (team: number, l: Loadout) => team === 0 || !!l.armour;

export const SIDES = [
  { name: "Police", short: "POLICE", colour: 0x1c4fd6, css: "#5c8dff", dark: 0x0f2a6b },
  { name: "Thieves", short: "THIEVES", colour: 0xf08c00, css: "#ffa94d", dark: 0x7a4300 },
] as const;
