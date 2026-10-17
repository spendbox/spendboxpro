// Tests for club entry fees (game-db/067_club_entry.sql, 118_club_fees.sql): every club charges a
// fixed price at the door, never a home's party room. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { clubEntryMint, clubEntryNaira, clubTier } from "../../fees.ts";

test("a club's entry is the same every time: ₦250k, ₦500k, ₦1m or ₦10m", () => {
  const fees = Array.from({ length: 400 }, (_, i) => clubEntryNaira(`b:${i * 37}`));
  assert.deepEqual(fees, Array.from({ length: 400 }, (_, i) => clubEntryNaira(`b:${i * 37}`)));
  assert.ok(fees.every((f) => [250_000, 500_000, 1_000_000, 10_000_000].includes(f)));
  for (const tier of [250_000, 500_000, 1_000_000, 10_000_000]) assert.ok(fees.includes(tier), `some clubs cost ${tier}`);
  assert.equal(clubTier(10_000_000), "Billionaire's row");
  assert.equal(clubTier(250_000), "Club");
});

test("a home's party room never charges", () => {
  for (let i = 0; i < 50; i++) assert.equal(clubEntryNaira(`b:${i}`, "home"), 0);
});

test("in mint at the region's price, under the database's cap of 10,000 (game-db/118)", () => {
  for (let i = 0; i < 100; i++) {
    const m = clubEntryMint(`b:${i}`, "club", 1_500);
    assert.ok(m > 0 && m <= 10_000);
    assert.equal(m, Math.round((clubEntryNaira(`b:${i}`, "club") / 1_500) * 100) / 100);
  }
});

test("A famous club charges its own price at the door, whatever its spot", () => {
  for (let i = 0; i < 50; i++) {
    assert.equal(clubTier(clubEntryNaira(`b:${i}`, "club", 10_000_000)), "Billionaire's row");
    assert.equal(clubEntryNaira(`b:${i}`, "home", 10_000_000), 0);
  }
});
