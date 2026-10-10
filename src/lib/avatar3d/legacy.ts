// Turns an old 2D avatar (lib/avatar.ts) into the nearest 3D recipe, so no player loses their look.
// The tables below map every old option, by its index, to a new option index. They are frozen: the
// old option lists are append-only too, and a new old-style option should get a row added here.

import type { Recipe, RecipeKey } from "./recipe.ts";

/** Old skin tones (light to dark) -> SKINS. */
const SKIN = [11 /* Porcelain */, 10 /* Fair */, 8 /* Sand */, 7 /* Honey */, 5 /* Pecan */, 4 /* Mahogany */, 2 /* Cocoa */, 0 /* Ebony */];

/** Old hair styles -> HAIRS. Styles the 3D set doesn't have go to the closest silhouette. */
const HAIR = [
  1, // Buzz -> Buzz
  2, // Short -> Low fade
  3, // Curly -> Short coils
  4, // Afro -> Afro
  10, // Long -> Long
  6, // Bun -> Bun
  8, // Braids -> Box braids
  2, // Mohawk -> Low fade
  2, // Side part -> Low fade
  0, // Bald -> Bald
  9, // Locs -> Locs
  10, // Bob -> Long
];

/** Old hair colours -> HAIR_COLORS. */
const HAIR_COLOR = [0, 1, 2, 3, 4, 7 /* Platinum */, 5 /* Grey */, 8 /* Red */, 9 /* Purple */, 10 /* Blue */];

/** Old brows (Soft, Bold, Raised, Focused) -> BROWS. */
const BROWS = [0 /* Natural */, 1 /* Straight thick */, 3 /* High arch */, 4 /* Angled */];

/** Old beards (None, Stubble, Full, Goatee, Moustache) -> FACIAL_HAIR. */
const BEARD = [0, 1, 5, 3, 2];

/** Old glasses (None, Round, Square, Shades) -> GLASSES (same order). */
const GLASSES = [0, 1, 2, 3];

/** Old earrings (None, Studs, Hoops) -> EARRINGS (same order). */
const EARRINGS = [0, 1, 2];

/** Old top colours -> CLOTH_COLORS. */
const TOP_COLOR = [
  9, // blue -> Royal blue
  10, // red -> Red
  11, // green -> Green
  3, // amber -> Gold
  6, // violet -> Plum
  5, // near-black -> Black
  4, // white -> White
  12, // pink -> Pink
  7, // teal -> Teal
  8, // sienna -> Orange
];

/** Old tops -> [OUTFITS index, PATTERNS index or -1 to leave the pattern plain]. */
const TOP: [number, number][] = [
  [0, -1], // T-shirt
  [2, -1], // Hoodie -> Hoodie
  [1, -1], // Collar -> Long sleeve
  [1, -1], // Jacket -> Long sleeve
  [4, -1], // Agbada -> Agbada
  [0, -1], // Polo -> T-shirt
  [1, -1], // Turtleneck -> Long sleeve
  [0, -1], // V-neck -> T-shirt
  [0, -1], // Tank top -> T-shirt
  [0, 3], // Striped tee -> T-shirt, pinstripe
  [0, -1], // Football jersey -> T-shirt
  [1, -1], // Denim jacket -> Long sleeve
  [1, -1], // Leather jacket -> Long sleeve
  [1, -1], // Bomber -> Long sleeve
  [10, -1], // Blazer & tie -> Suit
  [10, -1], // Suit & bow tie -> Suit
  [2, -1], // Puffer jacket -> Hoodie
  [1, -1], // Varsity jacket -> Long sleeve
  [1, -1], // Flannel shirt -> Long sleeve
  [0, -1], // Overalls -> T-shirt
  [3, 1], // Dashiki -> Kaftan, Ankara
  [3, -1], // Kimono -> Kaftan
  [0, -1], // Scrubs -> T-shirt
  [1, -1], // Chef's whites -> Long sleeve
  [1, -1], // Camo fatigues -> Long sleeve
];

/** Background colours are the same list in the same order. */
const BG_COUNT = 8;

/** An old 2D avatar (lib/avatar.ts `Avatar`) has no version and uses these field names. */
export function isLegacyAvatar(src: Record<string, unknown>): boolean {
  return !("v" in src) && "hairColor" in src && "topColor" in src;
}

/** Parts the old avatar never recorded; they get average values and the player should check them. */
export const LEGACY_GUESSED: RecipeKey[] = ["frame", "build", "fat", "height", "face", "nose", "lips", "eye"];

/**
 * Old avatar -> recipe values. Unknown or broken old values are skipped (the recipe default is used).
 * The old eyes and mouth choices were expressions (happy, wink...), not face shapes, so they are dropped.
 */
export function legacyParts(src: Record<string, unknown>): { parts: Partial<Recipe>; guessed: RecipeKey[] } {
  const parts: Partial<Recipe> = {};
  const get = (field: string, table: readonly number[] | number) => {
    const v = src[field];
    const n = typeof table === "number" ? table : table.length;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= n) return undefined;
    return typeof table === "number" ? v : table[v];
  };
  const set = (k: RecipeKey, v: number | undefined) => {
    if (v !== undefined) parts[k] = v;
  };

  set("skin", get("skin", SKIN));
  set("hair", get("hair", HAIR));
  set("hairC", get("hairColor", HAIR_COLOR));
  set("brow", get("brows", BROWS));
  set("facial", get("beard", BEARD));
  set("glasses", get("glasses", GLASSES));
  set("ear", get("earrings", EARRINGS));
  set("top", get("topColor", TOP_COLOR));
  set("bg", get("bg", BG_COUNT));
  const top = get("top", TOP.map((_, i) => i));
  if (top !== undefined) {
    const [outfit, pattern] = TOP[top];
    parts.outfit = outfit;
    if (pattern >= 0) parts.pattern = pattern;
  }
  return { parts, guessed: [...LEGACY_GUESSED] };
}

/** For tests: how many options each old field had when these tables were written. */
export const LEGACY_SIZES: Record<string, number> = {
  skin: SKIN.length,
  hair: HAIR.length,
  hairColor: HAIR_COLOR.length,
  brows: BROWS.length,
  beard: BEARD.length,
  glasses: GLASSES.length,
  earrings: EARRINGS.length,
  top: TOP.length,
  topColor: TOP_COLOR.length,
  bg: BG_COUNT,
};
