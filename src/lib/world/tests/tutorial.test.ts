// Tests for the walkthrough's missions. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { MISSION_NAIRA, MISSIONS_TOTAL, nextMission } from "../tutorial.ts";

test("missions go in order: name, hi, win", () => {
  assert.equal(nextMission({}, []), "name");
  assert.equal(nextMission({ name: true }, []), "hi");
  assert.equal(nextMission({ name: true, hi: true }, []), "win");
  assert.equal(nextMission({ name: true, hi: true, win: true }, []), null);
});

test("a skipped mission is passed over, a done one too", () => {
  assert.equal(nextMission({}, ["name"]), "hi");
  assert.equal(nextMission({ hi: true }, ["name"]), "win");
  assert.equal(nextMission({}, ["name", "hi", "win"]), null);
});

test("rewards: ₦20,000 to name your home, ₦50,000 each to say hi and win", () => {
  assert.deepEqual(MISSION_NAIRA, { name: 20_000, hi: 50_000, win: 50_000 });
  assert.equal(MISSIONS_TOTAL, 120_000);
});
