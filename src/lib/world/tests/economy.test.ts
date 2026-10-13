// Tests for the economy's balance (game-db/065_economy_balance.sql): crafting is a modest,
// skill-led profit, the market can't be gamed to raise what shops pay, and picking pockets
// doesn't pay on average. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { CRAFT_TIERS, craftResult, craftValue, itemWorth, MARKET_PULL_MAX, MARKET_PULL_MIN, MATERIALS, QUICK_SALE } from "../items.ts";
import { PICK_CASH_MAX, PICK_CATCH, PICK_FINE } from "../street.ts";

/** What selling every copy to a shop brings back, per mint spent on materials. */
const cityReturn = (tierValue: number, quality: number) => (craftValue(tierValue, quality) * QUICK_SALE) / (tierValue * MATERIALS);

test("crafting and selling to the city: about break-even at low quality, up to ~1.3 times at the best", () => {
  for (const t of CRAFT_TIERS) {
    const low = cityReturn(t.value, 0.2);
    const mid = cityReturn(t.value, 0.5);
    const best = cityReturn(t.value, 1.2);
    assert.ok(low >= 0.85 && low <= 1.0, `${t.id} lowest quality: ${low}`);
    assert.ok(mid >= 0.95 && mid <= 1.1, `${t.id} half quality: ${mid}`);
    assert.ok(best >= 1.2 && best <= 1.35, `${t.id} best quality: ${best}`);
  }
});

test("a craft's worth comes from craftValue, better with skill", () => {
  const poor = craftResult("medium", "mind", 0.15, 0);
  const great = craftResult("medium", "mind", 1, 1);
  assert.equal(poor.value, craftValue(100_000, poor.quality));
  assert.ok(great.value > poor.value);
});

test("market prices only pull worth between half and one and a half times the base", () => {
  const now = Date.now();
  const base = 100;
  // Books don't drift, so worth is half the base and half the (clamped) market price.
  assert.equal(itemWorth(base, "book", now, 100_000, now), base * 0.5 + base * MARKET_PULL_MAX * 0.5);
  assert.equal(itemWorth(base, "book", now, 0.01, now), base * 0.5 + base * MARKET_PULL_MIN * 0.5);
  assert.equal(itemWorth(base, "book", now, 120, now), 110);
  assert.equal(itemWorth(base, "book", now, null, now), 100);
});

test("picking a pocket loses a little on average, even at the best haul", () => {
  const ev = (1 - PICK_CATCH) * PICK_CASH_MAX - PICK_CATCH * PICK_FINE;
  assert.ok(ev < 0, `expected value ₦${ev}`);
  assert.ok(ev > -PICK_CASH_MAX * 0.5, "only slightly");
});
