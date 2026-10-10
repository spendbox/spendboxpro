// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { AVATAR_PARTS, BG, HAIR_COLOR, SKIN, TOP_COLOR } from "../../avatar.ts";
import { HEIGHTS } from "../catalog.ts";
import { LEGACY_SIZES } from "../legacy.ts";
import {
  CATALOGS, DEFAULT_RECIPE, RECIPE_KEYS, decodeRecipe, encodeRecipe, fromLegacyAvatar, parseRecipe, randomRecipe,
  sameRecipe, seededRecipe, toStored, type Recipe,
} from "../recipe.ts";
import { LOCKED_IDS, LOCKED_KEYS } from "./catalog-lock.ts";
import { RECIPE_FIXTURES } from "./fixtures.ts";

/** Small repeatable random numbers, so failures can be reproduced. */
function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

const isValid = (r: Recipe) => RECIPE_KEYS.every((k) => Number.isInteger(r[k]) && r[k] >= 0 && r[k] < CATALOGS[k].length);

test("recipe keys are append-only", () => {
  assert.deepEqual(RECIPE_KEYS.slice(0, LOCKED_KEYS.length), LOCKED_KEYS, "a recipe key was moved, renamed or removed");
  assert.deepEqual(Object.keys(LOCKED_IDS), LOCKED_KEYS, "catalog-lock.ts is out of step with its own key list");
});

test("catalogues are append-only", () => {
  for (const k of RECIPE_KEYS) {
    const locked = LOCKED_IDS[k];
    assert.ok(locked, `new key "${k}" must be added to tests/catalog-lock.ts`);
    const ids = CATALOGS[k].map((o) => o.id);
    assert.deepEqual(ids.slice(0, locked.length), locked, `catalogue "${k}": an option was moved, renamed or removed`);
  }
});

test("catalogues are well formed and fit the text form", () => {
  for (const k of RECIPE_KEYS) {
    const list = CATALOGS[k];
    assert.ok(list.length > 0 && list.length <= 62, `catalogue "${k}" must have 1 to 62 options`);
    assert.equal(new Set(list.map((o) => o.id)).size, list.length, `catalogue "${k}" has a repeated id`);
    for (const o of list) assert.ok(o.id && o.n, `catalogue "${k}" has an option without an id or name`);
    for (const o of list) {
      if ("c" in o) assert.match(String(o.c), /^#[0-9A-Fa-f]{6}$/, `catalogue "${k}" option "${o.id}" has a bad colour`);
    }
  }
  assert.equal(HEIGHTS[0].id, "average", "height option 0 must stay Average");
});

test("default recipe is valid", () => {
  assert.ok(isValid(DEFAULT_RECIPE));
});

test("saved fixtures still load exactly", () => {
  for (const f of RECIPE_FIXTURES) {
    assert.deepEqual(parseRecipe(f.input), f.expect, f.name);
  }
});

test("text and JSON forms round-trip", () => {
  const rand = rng(1);
  for (let i = 0; i < 2000; i++) {
    const r = randomRecipe(rand);
    assert.ok(isValid(r));
    const text = encodeRecipe(r);
    assert.ok(text.startsWith("NT1") && text.length === 3 + RECIPE_KEYS.length);
    assert.ok(sameRecipe(decodeRecipe(text)!, r), `text round-trip failed for ${text}`);
    assert.ok(sameRecipe(parseRecipe(JSON.parse(JSON.stringify(toStored(r)))), r), "JSON round-trip failed");
  }
});

test("every single option survives a round-trip", () => {
  for (const k of RECIPE_KEYS) {
    for (let i = 0; i < CATALOGS[k].length; i++) {
      const r = { ...DEFAULT_RECIPE, [k]: i };
      assert.equal(parseRecipe(encodeRecipe(r))[k], i, `${k}=${i} (text)`);
      assert.equal(parseRecipe(toStored(r))[k], i, `${k}=${i} (JSON)`);
    }
  }
});

test("a text recipe saved before later keys existed still loads, missing keys as 0", () => {
  const r = randomRecipe(rng(7));
  const full = encodeRecipe(r);
  const v1Length = 3 + LOCKED_KEYS.length;
  const decoded = decodeRecipe(full.slice(0, v1Length))!;
  LOCKED_KEYS.forEach((k) => assert.equal(decoded[k as keyof Recipe], r[k as keyof Recipe]));
});

test("broken or unknown input never throws and gives a valid avatar", () => {
  const junk: unknown[] = [
    null, undefined, 0, 42, "", "hello", "NT", "NT9", "NT1", "NT1???", "NT1" + "z".repeat(200), [], [1, 2], {},
    { v: 1 }, { v: 1, skin: 999, hair: -3, face: 1.5, eye: "2" }, { v: 99, skin: 2 }, { hairColor: 1 }, true,
    Number.NaN, { v: 1, __proto__: { skin: 3 } },
  ];
  for (const j of junk) {
    const r = parseRecipe(j);
    assert.ok(isValid(r), `invalid result for ${String(j)}`);
  }
  assert.equal(parseRecipe({ v: 1, skin: 999, face: 2 }).face, 2, "good values next to bad ones are kept");
});

test("every old 2D avatar option converts to a valid 3D option", () => {
  const live: Record<string, number> = {
    skin: SKIN.length,
    hair: AVATAR_PARTS.hair.length,
    hairColor: HAIR_COLOR.length,
    brows: AVATAR_PARTS.brows.length,
    beard: AVATAR_PARTS.beard.length,
    glasses: AVATAR_PARTS.glasses.length,
    earrings: AVATAR_PARTS.earrings.length,
    top: AVATAR_PARTS.top.length,
    topColor: TOP_COLOR.length,
    bg: BG.length,
  };
  assert.deepEqual(LEGACY_SIZES, live, "an old 2D option list changed: add matching rows to avatar3d/legacy.ts");
  const old = { skin: 0, hair: 0, hairColor: 0, eyes: 0, brows: 0, mouth: 0, beard: 0, glasses: 0, top: 0, topColor: 0, bg: 0, earrings: 0 };
  for (const [field, n] of Object.entries(live)) {
    for (let i = 0; i < n; i++) {
      const { recipe, guessed } = fromLegacyAvatar({ ...old, [field]: i });
      assert.ok(isValid(recipe), `old ${field}=${i}`);
      assert.ok(guessed.includes("frame"));
    }
  }
});

test("starting avatars from a name are stable and valid", () => {
  assert.deepEqual(seededRecipe("Ada"), seededRecipe("Ada"));
  assert.notDeepEqual(seededRecipe("Ada"), seededRecipe("Tunde"));
  for (let i = 0; i < 500; i++) assert.ok(isValid(seededRecipe("player" + i)));
});
