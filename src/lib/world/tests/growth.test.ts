// Tests for the city growing with its players (docs/GROWTH.md). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { Tile } from "../../city/layout.ts";
import { buildingFor, grownBuilding, type Building } from "../buildings.ts";
import { estateRule, GROWTH_STEPS, growthLevelFor, grownStoreys, rebuiltKind } from "../growth.ts";
import { LAGOS } from "../regions/lagos/index.ts";

const lot = (x: number, z: number, kind: Tile["kind"]): Tile => ({ i: 0, x, z, kind, top: 1, r: [0, 0, 0, 0] });

/** Every home and unit across a stretch of quiet and busy lots, at a growth level. */
function census(level: number) {
  let units = 0;
  let homes = 0;
  for (let k = 0; k < 4000; k++) {
    const b = buildingFor("lagos", lot(k % 80, Math.floor(k / 80), k % 3 ? "house" : "office"), 0.3, LAGOS.seed, 0.5, { growth: level });
    if (!b) continue;
    units += b.units.length;
    homes += b.units.filter((u) => u.use === "home").length;
  }
  return { units, homes };
}

test("growth levels follow the number of players, and the database uses the same steps", () => {
  assert.equal(growthLevelFor(0), 0);
  assert.equal(growthLevelFor(999), 0);
  assert.equal(growthLevelFor(1_000), 1);
  assert.equal(growthLevelFor(500_000), GROWTH_STEPS.length);
  const sql = readSteps();
  assert.deepEqual(sql, GROWTH_STEPS);
});

function readSteps(): number[] {
  const text = readFileSync(new URL("../../../../game-db/091_city_growth.sql", import.meta.url), "utf8");
  const m = /foreach v_step in array array\[([\d,\s]+)\]/.exec(text);
  return m ? m[1].split(",").map((n) => Number(n.trim())) : [];
}

test("level 0 is the city exactly as before", () => {
  for (let k = 0; k < 300; k++) {
    const t = lot(k, -k, k % 2 ? "house" : "tower");
    assert.deepEqual(buildingFor("lagos", t, 0.3, LAGOS.seed, 0.5, {}), buildingFor("lagos", t, 0.3, LAGOS.seed, 0.5, { growth: 0 }));
  }
});

test("as the city grows there are many more homes to own", () => {
  const before = census(0);
  const mid = census(4);
  const big = census(9);
  assert.ok(mid.homes > before.homes * 1.5, `level 4: ${mid.homes} vs ${before.homes}`);
  assert.ok(big.homes > mid.homes, `level 9: ${big.homes} vs ${mid.homes}`);
  assert.ok(big.units > before.units * 3, `units ${big.units} vs ${before.units}`);
});

test("rooming houses (the free homes) stay; the edges of town fill in later", () => {
  assert.equal(rebuiltKind("rooming", "quiet", 0, 9), "rooming");
  assert.equal(rebuiltKind("bungalow", "edge", 0, 1), "bungalow");
  assert.equal(rebuiltKind("bungalow", "edge", 0, 9), "flats");
  assert.equal(rebuiltKind("bungalow", "quiet", 0, 9), "flats");
  assert.equal(rebuiltKind("shops", "busy", 0, 9), "apartments");
  assert.ok(grownStoreys("glass", 20, 9) <= 100 && grownStoreys("glass", 20, 9) > 20);
  assert.equal(grownStoreys("bungalow", 1, 9), 1);
});

test("estates spread and get bigger as the city grows", () => {
  const a = estateRule(0);
  const b = estateRule(6);
  assert.ok(b.chance > a.chance && b.wealth < a.wealth && b.blocks > a.blocks);
});

test("a sold-out block grows: more storeys, new units at the end, every owned unit unchanged", () => {
  let found: Building | null = null;
  for (let k = 0; k < 2000 && !found; k++) {
    const b = buildingFor("lagos", lot(k, 7, "office"), 0.3, LAGOS.seed);
    if (b && b.state === "built" && (b.kind === "flats" || b.kind === "offices" || b.kind === "mixed")) found = b;
  }
  assert.ok(found, "no block found");
  const g = grownBuilding(found!, LAGOS.seed)!;
  assert.ok(g && g.storeys > found!.storeys);
  assert.ok(g.units.length > found!.units.length);
  found!.units.forEach((u, k) => assert.deepEqual(g.units[k], u));
  assert.ok(g.units.every((u, k) => u.id === `${found!.id}/${k}`));
  assert.equal(new Set(g.units.map((u) => u.label)).size, g.units.length, "no unit twice");
  // Houses and shop rows don't grow.
  for (let k = 0; k < 400; k++) {
    const b = buildingFor("lagos", lot(k, 9, "house"), 0.3, LAGOS.seed);
    if (b && ["bungalow", "duplex", "rooming", "terrace", "shops", "land"].includes(b.kind)) assert.equal(grownBuilding(b, LAGOS.seed), null);
  }
});
