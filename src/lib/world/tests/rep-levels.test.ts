// Tests for reputation levels and their property discounts. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { REP_LEVELS, discounted, repLevel } from "../rep-levels.ts";

test("levels climb with reputation", () => {
  assert.equal(repLevel(0).level.name, "New in town");
  assert.equal(repLevel(39).level.discount, 0);
  assert.equal(repLevel(40).level.discount, 0.02);
  assert.equal(repLevel(599).level.name, "Local legend");
  assert.equal(repLevel(5000).level.name, "City icon");
  assert.equal(repLevel(5000).next, null);
  assert.equal(repLevel(70).progress, 0.5);
});

test("levels are in order and discounts grow", () => {
  for (let i = 1; i < REP_LEVELS.length; i++) {
    assert.ok(REP_LEVELS[i].at > REP_LEVELS[i - 1].at);
    assert.ok(REP_LEVELS[i].discount > REP_LEVELS[i - 1].discount);
  }
});

test("discounted prices", () => {
  assert.equal(discounted(1000, 0), 1000);
  assert.equal(discounted(1000, 200), 930);
  assert.equal(discounted(1000, 600), 850);
});
