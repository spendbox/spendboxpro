// Tests for living on the real map: pots and budgets, bills, health, prices. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { billsFor, cleanBudget, COURSES, DEFAULT_BUDGET, groupOf, payFactor, priceOf, splitIncome } from "../living.ts";
import { PRICES } from "../regions/lagos/prices.ts";
import { daysForLevel, jobsAtPlace, skillLevel } from "../work.ts";

test("income is shared by the budget, the rest to the wallet", () => {
  assert.deepEqual(splitIncome(100, DEFAULT_BUDGET), { essentials: 25, travel: 15, savings: 20, fun: 10, wallet: 30 });
  const odd = splitIncome(3.33, DEFAULT_BUDGET);
  assert.equal(Math.round((odd.essentials + odd.travel + odd.savings + odd.fun + odd.wallet) * 100), 333);
});

test("budgets are made sensible", () => {
  assert.deepEqual(cleanBudget({ essentials: 70, travel: 50, savings: -5, fun: 2.6 }), { essentials: 70, travel: 30, savings: 0, fun: 0 });
});

test("bills follow the size of your home", () => {
  const room = billsFor(14, PRICES);
  const flat = billsFor(90, PRICES);
  // A room: ₦5,600 of electricity and ₦1,500 of waste collection a month.
  assert.equal(room.powerMonth, 5_600);
  assert.equal(room.wasteMonth, 1_500);
  assert.equal(flat.powerMonth, 36_000);
  assert.ok(flat.power > room.power && flat.waste > room.waste);
});

test("health: unwell is half pay, bedridden none", () => {
  assert.equal(payFactor(80), 1);
  assert.equal(payFactor(20), 0.5);
  assert.equal(payFactor(5), 0);
});

test("prices: VAT only where it applies", () => {
  assert.deepEqual(priceOf(15_000, PRICES, false), { base: 10, tax: 0, total: 10 });
  assert.deepEqual(priceOf(15_000, PRICES, true), { base: 10, tax: 0.75, total: 10.75 });
});

test("a course with a certificate qualifies you for the job it opens", () => {
  const nurse = jobsAtPlace("hospital").find((j) => j.job === "nurse")!;
  const course = COURSES.find((c) => c.cert === nurse.cert)!;
  assert.ok(skillLevel(course.grants) >= nurse.level);
  for (const c of COURSES) assert.ok(c.grants >= daysForLevel(1), c.id);
  assert.ok(jobsAtPlace("hospital").every((j) => j.state), "hospitals are an essential service");
});

test("money groups", () => {
  assert.equal(groupOf("vat"), "tax");
  assert.equal(groupOf("power_bill"), "bills");
  assert.equal(groupOf("public_pay"), "pay");
  assert.equal(groupOf("something_new"), "other");
});
