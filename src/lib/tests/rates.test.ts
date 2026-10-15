// Exchange rates for showing money in players' currencies. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { nairaRates } from "../rates.ts";
import { cash, fromShown, nairaPer, ratesAt, setRates, setShownCurrency } from "../world/value.ts";

test("a feed's table (what ₦1 buys) becomes naira for one of each", () => {
  const r = nairaRates({ USD: 1 / 1600, gbp: 1 / 2100, NGN: 1, JPY: 0.1, XYZ: 5, EUR: 0 });
  assert.equal(r.USD, 1600);
  assert.equal(r.GBP, 2100);
  assert.equal(r.NGN, undefined, "naira is always 1");
  assert.equal(r.XYZ, undefined, "only our currencies");
  assert.equal(r.EUR, undefined, "nonsense left out");
});

test("today's rates move what players see; broken ones are ignored", () => {
  setShownCurrency("USD", 1500);
  setRates(null);
  assert.equal(ratesAt(), 0);
  assert.equal(cash(1550 / 1500 * 2.5), "$2.50", "the rough built-in rate");
  setRates({ USD: 1500, GBP: 2_000_000 }, 123);
  assert.equal(ratesAt(), 123);
  assert.equal(nairaPer("USD"), 1500);
  assert.equal(cash(2.5), "$2.50", "₦3,750 is $2.50 at today's rate");
  assert.equal(fromShown(2), 2, "and back");
  assert.equal(nairaPer("GBP"), 2050, "a rate 1,000 times off is a broken feed");
  setRates(null);
  setShownCurrency("NGN");
});
