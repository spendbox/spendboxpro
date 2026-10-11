// Tests for jobs, pay and getting to work on the real map. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { PRICES } from "../regions/lagos/prices.ts";
import { cheapestCommute, dayNet, daysForLevel, fareMint, fareOrBus, jobsAtPlace, jobsInBuilding, payDay, settle, skillLevel, tripKm, tripKmBetween } from "../work.ts";

test("businesses hire, homes and unfinished buildings don't", () => {
  assert.ok(jobsInBuilding({ kind: "offices", state: "built" }).length >= 3);
  assert.equal(jobsInBuilding({ kind: "flats", state: "built" }).length, 0);
  assert.equal(jobsInBuilding({ kind: "offices", state: "uncompleted" }).length, 0);
  assert.equal(jobsInBuilding({ kind: "flats", state: "site" })[0].title, "Labourer");
  assert.ok(jobsAtPlace("intlairport").some((j) => j.title === "Pilot"));
  assert.equal(jobsAtPlace("nothing").length, 0);
});

test("every workplace has a job anyone can start with", () => {
  for (const kind of ["shops", "mixed", "plaza", "offices", "glass", "warehouse", "farm"] as const) {
    assert.ok(jobsInBuilding({ kind, state: "built" }).some((j) => j.level === 0), kind);
  }
  for (const type of ["market", "megamall", "hotel", "hospital", "intlairport", "port", "campus", "capitol", "museum", "arena", "club", "bigpark"]) {
    assert.ok(jobsAtPlace(type).some((j) => j.level === 0), type);
  }
});

test("pay is real Lagos wages, by the game day", () => {
  // ₦90,000 a month = ₦3,000 a game day = ₥2.
  assert.equal(payDay({ month: 90_000 }, PRICES), 2);
});

test("skills grow with no top", () => {
  assert.equal(skillLevel(0), 0);
  assert.equal(skillLevel(4.9), 0);
  assert.equal(skillLevel(5), 1);
  assert.equal(skillLevel(20), 2);
  assert.equal(skillLevel(daysForLevel(12)), 12);
});

test("trips: walking is free but only so far; taxis cost most", () => {
  assert.equal(tripKm({ x: 0, z: 0 }, { x: 10, z: 0 }), 1.3);
  assert.equal(tripKmBetween("lagos:0,0/2", "lagos:30,40"), 6.5);
  assert.equal(fareMint("walk", 2, PRICES), 0);
  assert.equal(fareMint("walk", 4, PRICES), null);
  assert.equal(fareMint("keke", 9, PRICES), null);
  const danfo = fareMint("danfo", 10, PRICES)!;
  const taxi = fareMint("taxi", 10, PRICES)!;
  assert.ok(danfo > 0 && taxi > danfo * 4, `${danfo} ${taxi}`);
  assert.equal(cheapestCommute(2), "walk");
  assert.equal(cheapestCommute(6), "keke");
  assert.equal(cheapestCommute(20), "danfo");
  // Moved too far to walk: it's the bus.
  assert.equal(fareOrBus("walk", 10, PRICES), danfo);
});

test("settling pay: game days, tax, fares, and only a game week waits", () => {
  const h = 3_600_000;
  const five = settle({ payDay: 2, paidUntil: 0 }, 10 * h, 0, 0.5);
  assert.deepEqual(five, { days: 5, gross: 10, tax: 0.7, fares: 5, net: 4.3 });
  const long = settle({ payDay: 2, paidUntil: 0 }, 100 * h, 5, 0);
  assert.equal(long.days, 7);
  assert.equal(long.gross, 14.42);
});

test("a job can run at a loss when the fares cost more than the pay", () => {
  // ₥2 a day, less 7% tax = ₥1.86; two taxi trips at ₥2 each = ₥4: a ₥2.14 loss.
  assert.equal(dayNet(2, 0, 2), -2.14);
  assert.ok(dayNet(2, 0, 0) > 0);
});
