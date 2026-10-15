// Amounts and wording the server writes in mint, shown to players in naira. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { PRICES } from "../regions/lagos/prices.ts";
import { cashText, cashTextIn, setShownCurrency } from "../value.ts";

test("server text in mint reads in naira on screen, and 'mint' on its own says money", () => {
  setShownCurrency("NGN", 1500);
  assert.equal(cashText("Your daily gift: ₥10.5. Come back tomorrow."), "Your daily gift: ₦15,800. Come back tomorrow.");
  assert.equal(cashText("You need 20 mint for that."), "You need ₦30,000 for that.");
  assert.equal(cashText("You don't have enough mint."), "You don't have enough money.");
  // Players who chose to count in mint keep it.
  setShownCurrency("MINT");
  assert.equal(cashText("You don't have enough mint."), "You don't have enough mint.");
  setShownCurrency("NGN");
});

test("push notifications (no player's choice on the server) are in the region's money", () => {
  assert.equal(cashTextIn("Your daily gift: ₥13.33 (3 days in a row).", PRICES), "Your daily gift: ₦20,000 (3 days in a row).");
  assert.equal(cashTextIn("Ada gave you 50 mint", PRICES), "Ada gave you ₦75,000");
  assert.equal(cashTextIn("Mint is back in your wallet.", PRICES), "Money is back in your wallet.");
});
