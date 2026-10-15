// Tests for jobs, pay and getting to work on the real map. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { PRICES } from "../regions/lagos/prices.ts";
import { cheapestCommute, dayNet, PAY_BOOST, daysForLevel, fareMint, fareOrBus, jobsAtPlace, jobsInBuilding, payDay, settle, skillLevel, tripKm, tripKmBetween } from "../work.ts";

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

test("pay is real Lagos wages times the game's boost, every 2 hours", () => {
  // ₦90,000 a month = ₦3,000 a day = ₥2, times the boost (18).
  assert.equal(payDay({ month: 90_000 }, PRICES), 2 * PAY_BOOST);
  assert.equal(PAY_BOOST, 18);
});

test("even the lowest job beats the free taps: about ₥250 or more a real day", () => {
  const lowest = Math.min(...["market", "bigpark", "farm"].flatMap((t) => (t === "farm" ? jobsInBuilding({ kind: "farm", state: "built" }) : jobsAtPlace(t)).map((j) => j.month)));
  assert.equal(lowest, 60_000);
  // 12 game days a real day, after income tax and a short danfo ride each way.
  const realDay = 12 * dayNet(payDay({ month: lowest }, PRICES), 0, fareMint("danfo", 3, PRICES)!);
  assert.ok(realDay >= 250, `lowest job: ₥${realDay} a real day`);
  // Every job gets the same raise: a pilot still earns 50 times a farm hand.
  const pilot = jobsAtPlace("intlairport").find((j) => j.job === "pilot")!;
  assert.equal(payDay(pilot, PRICES) / payDay({ month: lowest }, PRICES), 50);
  // The database's cap (work_pay_max, part 65: ₥1,500 a game day) still fits the best-paid job.
  assert.ok(payDay(pilot, PRICES) <= 1_500);
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

test("fares aren't capped: the further you go, the more it costs", () => {
  const far = fareMint("danfo", 30, PRICES)!;
  const farther = fareMint("danfo", 45, PRICES)!;
  assert.ok(farther > far, "45 km costs more than 30");
  assert.ok(Math.abs(fareMint("danfo", 180, PRICES)! * PRICES.perMint - (300 + 40 * 180)) < 15, "Badagry to Epe: ₦300 + ₦40 a km");
  // A loader (₦80,000 a month) 30 km away still keeps something every day; much further, they don't.
  const loader = jobsInBuilding({ kind: "warehouse", state: "built" }).find((j) => j.job === "loader")!;
  assert.ok(dayNet(payDay(loader, PRICES), 0, far) > 0);
});

test("a trip over open water adds a ferry crossing, and walking to the jetty is fine", () => {
  const road = fareMint("danfo", 6, PRICES)!;
  const ferry = fareMint("danfo", 6, PRICES, 2)!;
  assert.ok(ferry > road);
  assert.ok(fareMint("walk", 3, PRICES, 1.5)! > 0, "on foot to the jetty, then the ferry");
  assert.equal(cheapestCommute(5, 3), "walk", "only the land part counts for how you get to the jetty");
});
