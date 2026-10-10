// A player's 3D avatar as a recipe: one small number per part, pointing into the catalogue lists.
// Only the recipe is ever stored or sent; meshes are rebuilt from it on each device.
//
// Rules (see AGENTS notes in avatar-reference):
// - RECIPE_KEYS is append-only. A new key goes at the END and its option 0 must be a safe default,
//   so every recipe saved before the key existed still means the same avatar.
// - Bump RECIPE_VERSION only if the meaning of existing values changes; parseRecipe must keep
//   loading every older version.

import {
  BACKGROUNDS, BOTTOM_COLORS, BROWS, BUILDS, BUSTS, BUTTS, CHAINS, CHINS, CLOTH_COLORS, EARRINGS, EYES, FACES,
  FACIAL_HAIR, FRAMES, FULLNESS, GLASSES, HAIRS, HAIR_COLORS, HEADWEAR, HEIGHTS, IRIS, LIPS, LIP_TINTS, NOSES,
  OUTFITS, PATTERNS, PIERCINGS, SKINS, WATCHES, type Option, TOPS, BOTTOMS, LAYERS, SHOES, SHOE_COLORS,
} from "./catalog.ts";
import { isLegacyAvatar, legacyParts } from "./legacy.ts";

export const RECIPE_VERSION = 1;

/** Each recipe key and the catalogue it indexes. Order matters for the compact text form. */
export const CATALOGS = {
  face: FACES,
  chin: CHINS,
  fat: FULLNESS,
  skin: SKINS,
  eye: EYES,
  eyeC: IRIS,
  brow: BROWS,
  nose: NOSES,
  lips: LIPS,
  lipT: LIP_TINTS,
  hair: HAIRS,
  hairC: HAIR_COLORS,
  facial: FACIAL_HAIR,
  frame: FRAMES,
  build: BUILDS,
  bust: BUSTS,
  butt: BUTTS,
  outfit: OUTFITS,
  top: CLOTH_COLORS,
  pattern: PATTERNS,
  bottom: BOTTOM_COLORS,
  glasses: GLASSES,
  ear: EARRINGS,
  pierce: PIERCINGS,
  hw: HEADWEAR,
  hwC: CLOTH_COLORS,
  watch: WATCHES,
  chain: CHAINS,
  // added after the prototype
  bg: BACKGROUNDS,
  height: HEIGHTS,
  // the wardrobe: separate top and bottom styles, an outer layer, shoes
  topStyle: TOPS,
  bottomStyle: BOTTOMS,
  layer: LAYERS,
  layerC: CLOTH_COLORS,
  shoes: SHOES,
  shoeC: SHOE_COLORS,
} satisfies Record<string, readonly Option[]>;

export type RecipeKey = keyof typeof CATALOGS;
export const RECIPE_KEYS = Object.keys(CATALOGS) as RecipeKey[];

/** One option index per part. */
export type Recipe = Record<RecipeKey, number>;
/** The stored form: the recipe plus the version it was written with. */
export type StoredRecipe = { v: number } & Recipe;

/** Average everything; what a key falls back to when a stored value is missing or broken. */
export const DEFAULT_RECIPE: Readonly<Recipe> = Object.freeze({
  ...(Object.fromEntries(RECIPE_KEYS.map((k) => [k, 0])) as Recipe),
  fat: 1, // Average
  build: 3, // Average
  butt: 1, // Average
});

const inRange = (k: RecipeKey, v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < CATALOGS[k].length;

/** Copies only valid values; anything missing, unknown or out of range becomes the default. */
export function cleanRecipe(input: Partial<Record<string, unknown>>): Recipe {
  const out = { ...DEFAULT_RECIPE };
  for (const k of RECIPE_KEYS) {
    const v = input[k];
    if (inRange(k, v)) out[k] = (CATALOGS[k][v] as Option).retired?.use ?? v;
  }
  return out;
}

// ---- compact text form: "NT" + version + one character per key, e.g. "NT1a03..." ----
// Each value is a single base-62 digit, so every catalogue must stay under 62 options (a test checks
// this). Recipes written before a key was appended are simply shorter; missing keys read as 0.

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PREFIX = "NT";

export function encodeRecipe(r: Recipe): string {
  const body = RECIPE_KEYS.map((k) => DIGITS[inRange(k, r[k]) ? r[k] : DEFAULT_RECIPE[k]]).join("");
  return PREFIX + DIGITS[RECIPE_VERSION] + body;
}

/** How many keys version 1 had. Every v1+ text recipe has at least this many characters after "NT1". */
const V1_KEY_COUNT = 30;
/** The prototype studio's text form ("version 0"): "NT" + one base-36 digit for each of its 28 keys. */
const PROTOTYPE_KEY_COUNT = 28;

/** Reads the text form. Returns null if it isn't one (so callers can fall back). */
export function decodeRecipe(text: string): Recipe | null {
  if (typeof text !== "string" || !text.startsWith(PREFIX)) return null;
  if (text.length === PREFIX.length + PROTOTYPE_KEY_COUNT) {
    const raw: Record<string, number> = {};
    RECIPE_KEYS.slice(0, PROTOTYPE_KEY_COUNT).forEach((k, i) => {
      raw[k] = parseInt(text[PREFIX.length + i], 36);
    });
    return /^[0-9a-z]+$/.test(text.slice(PREFIX.length)) ? cleanRecipe(raw) : null;
  }
  if (text.length < PREFIX.length + 1 + V1_KEY_COUNT) return null;
  const version = DIGITS.indexOf(text[PREFIX.length]);
  if (version < 1 || version > RECIPE_VERSION) return null;
  const body = text.slice(PREFIX.length + 1);
  if (body.length > RECIPE_KEYS.length) return null;
  const raw: Record<string, number> = {};
  RECIPE_KEYS.forEach((k, i) => {
    raw[k] = i < body.length ? DIGITS.indexOf(body[i]) : 0;
  });
  return cleanRecipe(raw);
}

/** The JSON form saved on a player's profile. */
export function toStored(r: Recipe): StoredRecipe {
  return { v: RECIPE_VERSION, ...cleanRecipe(r) };
}

/**
 * Loads any avatar that was ever saved: the current JSON form, the text form, or an old 2D avatar
 * (converted to the nearest 3D look). Never throws; unknown input gives the default recipe.
 */
export function parseRecipe(input: unknown): Recipe {
  if (typeof input === "string") return decodeRecipe(input) ?? { ...DEFAULT_RECIPE };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ...DEFAULT_RECIPE };
  const src = input as Record<string, unknown>;
  if (typeof src.v === "number") {
    // v1 is the only version so far. Future versions: convert older ones here before cleaning.
    return cleanRecipe(src);
  }
  if (isLegacyAvatar(src)) return fromLegacyAvatar(src).recipe;
  return { ...DEFAULT_RECIPE };
}

/**
 * Converts an old 2D avatar. `guessed` lists the parts the old avatar had no information about
 * (such as body frame), so the game can invite the player to check their new look.
 */
export function fromLegacyAvatar(src: Record<string, unknown>): { recipe: Recipe; guessed: RecipeKey[] } {
  const { parts, guessed } = legacyParts(src);
  return { recipe: cleanRecipe(parts), guessed };
}

/** True if two recipes describe the same avatar. */
export function sameRecipe(a: Recipe, b: Recipe): boolean {
  return RECIPE_KEYS.every((k) => a[k] === b[k]);
}

/** A stable starting avatar for a player who hasn't designed one (based on their name). */
export function seededRecipe(seed: string): Recipe {
  let h = 7;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  const next = () => ((h = (Math.imul(h, 1103515245) + 12345) | 0) >>> 8) / 0x1000000;
  return randomRecipe(next);
}

/** A random but sensible avatar. rand returns numbers in [0, 1). */
export function randomRecipe(rand: () => number = Math.random): Recipe {
  const pick = (k: RecipeKey) => {
    const i = Math.floor(rand() * CATALOGS[k].length);
    return (CATALOGS[k][i] as Option).retired?.use ?? i;
  };
  const r = { ...DEFAULT_RECIPE };
  for (const k of RECIPE_KEYS) r[k] = pick(k);
  const fem = r.frame === 1;
  // Keep extras occasional so random people look like everyday people, not costume showcases.
  if (fem) r.facial = 0;
  else if (rand() < 0.4) r.facial = 0;
  if (rand() < 0.6) r.glasses = 0;
  if (rand() < 0.5) r.pattern = 0;
  if (rand() < 0.6) r.hw = 0;
  if (rand() < 0.6) r.chain = 0;
  if (rand() < 0.5) r.watch = 0;
  if (rand() < 0.6) r.layer = 0;
  if (rand() < 0.7) r.pierce = 0;
  if (!fem && rand() < 0.6) r.ear = 0;
  if (rand() < 0.5) r.bust = 0;
  if (rand() < 0.5) r.height = 0;
  return r;
}
