// Tests for club entry fees (game-db/067_club_entry.sql): some clubs are free, the rest charge a
// fixed price at the door, never a home's party room. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { clubEntryMint, clubEntryNaira } from "../../fees.ts";

test("a club's entry is the same every time, and some clubs are free", () => {
  const fees = Array.from({ length: 200 }, (_, i) => clubEntryNaira(`b:${i * 37}`));
  assert.deepEqual(fees, Array.from({ length: 200 }, (_, i) => clubEntryNaira(`b:${i * 37}`)));
  assert.ok(fees.some((f) => f === 0));
  assert.ok(fees.some((f) => f > 0));
  assert.ok(fees.every((f) => f >= 0 && f <= 20_000));
});

test("a home's party room never charges", () => {
  for (let i = 0; i < 50; i++) assert.equal(clubEntryNaira(`b:${i}`, "home"), 0);
});

test("in mint at the region's price, under the database's cap of 100", () => {
  for (let i = 0; i < 100; i++) {
    const m = clubEntryMint(`b:${i}`, "club", 1_500);
    assert.ok(m >= 0 && m <= 100);
    assert.equal(m, Math.round((clubEntryNaira(`b:${i}`, "club") / 1_500) * 100) / 100);
  }
});
