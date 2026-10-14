// Tests for landmark prices (docs/LANDMARKS.md). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { landmarkPriceMint, landmarkPriceNaira, LANDMARK_MIN_NAIRA } from "../landmark-price.ts";
import { regionMap } from "../index.ts";

const map = regionMap("lagos")!;

test("every Lagos landmark costs crazy money: ₦50bn and up (no top), in round billions", () => {
  const all = [...map.landmarks, ...map.spotList.map((s) => ({ ...s, type: s.kind }))];
  assert.ok(all.length > 20);
  for (const l of all) {
    const p = landmarkPriceNaira(l);
    assert.ok(p >= LANDMARK_MIN_NAIRA, `${l.name}: ${p}`);
    assert.equal(p % 1e9, 0, `${l.name} is a round number`);
  }
});

test("the same landmark always costs the same", () => {
  const l = { type: "hotel", w: 2, d: 2, name: "Eko Hotel & Suites" };
  assert.equal(landmarkPriceNaira(l), landmarkPriceNaira({ ...l }));
});

test("bigger costs more, with no top", () => {
  const small = landmarkPriceNaira({ type: "market", w: 2, d: 2, name: "A Market" });
  const big = landmarkPriceNaira({ type: "market", w: 4, d: 4, name: "A Market" });
  assert.ok(big > small * 1.8);
  const airport = map.landmarks.find((l) => l.id === "airport")!;
  // No top: the biggest landmarks cost more than the old ₦2tn ceiling.
  assert.ok(landmarkPriceNaira(airport) > 2_000e9);
  assert.ok(landmarkPriceNaira({ ...airport, w: airport.w * 2, d: airport.d * 2 }) > landmarkPriceNaira(airport) * 1.8);
  const club = landmarkPriceNaira({ type: "club", name: "Some Club" });
  assert.ok(club >= LANDMARK_MIN_NAIRA && club < 100e9);
});

test("unknown kinds get a sensible price; mint is naira over perMint", () => {
  const p = landmarkPriceNaira({ type: "something-new", name: "X" });
  assert.ok(p >= 90e9 && p <= 110e9);
  assert.equal(landmarkPriceMint({ type: "something-new", name: "X" }, 1500), Math.round((p / 1500) * 100) / 100);
});
