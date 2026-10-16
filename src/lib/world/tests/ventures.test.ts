// Tests for careers (docs/LIFE_WHEEL.md, phase 5). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOMENTS, pickMoment, ventureFits } from "../moments.ts";
import { lifeFacts, LIFE_BADGES } from "../standing.ts";
import { VENTURE_KINDS, VENTURE_STAGES, applyChange, capacity, goneUnder, inCrisis, newVenture, readyToGrow, ventureDay, ventureDays, type Venture } from "../ventures.ts";

// A steady little random, so runs are the same every time.
function rng(seed = 7) {
  let a = seed;
  return () => ((a = (a * 16807) % 2147483647) / 2147483647);
}

test("every kind starts as an Idea with a little cash, and has a price and a cost", () => {
  assert.equal(VENTURE_KINDS.length, 10);
  for (const k of VENTURE_KINDS) {
    const v = newVenture(k.id, "Test");
    assert.equal(v.stage, 0);
    assert.ok(v.cash > 0 && k.price > 0 && k.start > 0, k.id);
  }
});

test("a well-run business grows, is ready for the next stage within a couple of months, and pays within its cap", () => {
  for (const k of VENTURE_KINDS) {
    let v: Venture = { ...newVenture(k.id, "Good"), quality: 70, mood: 70 };
    const rand = rng(11);
    let ready = -1;
    for (let day = 0; day < 90 && ready < 0; day++) {
      // Hire when the queue is out of the door.
      if (v.customers > capacity(v)) v = { ...v, staff: v.staff + 1 };
      const d = ventureDay(v, rand);
      assert.ok(d.pay <= VENTURE_STAGES[v.stage].cap, `${k.id}: paid over the cap`);
      assert.ok(d.pay >= 0);
      v = d.venture;
      if (readyToGrow(v)) ready = day;
    }
    assert.ok(ready >= 0, `${k.id} never got ready to grow (customers ${Math.round(v.customers)}, cash ${v.cash})`);
  }
});

test("a badly run business loses customers, runs out of cash and goes under", () => {
  let v: Venture = { ...newVenture("buka", "Bad"), quality: 10, mood: 10, staff: 4, customers: 15 };
  const rand = rng(3);
  let crisisDay = -1;
  for (let day = 0; day < 200 && !goneUnder(v); day++) {
    v = ventureDay(v, rand).venture;
    if (inCrisis(v) && crisisDay < 0) crisisDay = day;
  }
  assert.ok(crisisDay >= 0, "never in crisis");
  assert.ok(goneUnder(v), "never went under");
  assert.ok(v.customers < 15);
});

test("catching up counts at most a week of days", () => {
  const v = newVenture("suya", "Away");
  const { venture } = ventureDays(v, 40, rng());
  assert.equal(venture.days.length, 7);
});

test("what a moment does to a business: cash by the amount, growing costs its expansion, selling a share, closing", () => {
  const v: Venture = { ...newVenture("salon", "Mine"), cash: 100_000 };
  assert.equal(applyChange(v, { cash: -1 }, 20_000).venture.cash, 80_000);
  const grown = applyChange(v, { grow: true }, 0).venture;
  assert.equal(grown.stage, 1);
  assert.equal(grown.best, 1);
  assert.equal(grown.cash, 100_000 - VENTURE_STAGES[0].expand);
  assert.equal(applyChange(v, { sell: 0.33 }, 0).venture.share, 0.67);
  assert.ok(applyChange(v, { close: true }, 0).closed);
  assert.equal(applyChange(v, { staff: -5 }, 0).venture.staff, 0);
});

test("business moments come only when they fit: none while you don't run one, the invitation only then, crises in a crisis", () => {
  const biz = MOMENTS.filter((m) => m.venture);
  assert.ok(biz.length >= 15, `only ${biz.length}`);
  const invite = biz.find((m) => m.venture?.none)!;
  const crisis = biz.find((m) => m.venture?.crisis)!;
  const grow = biz.find((m) => m.venture?.grow)!;
  const none = { open: false, stage: 0, crisis: false, grow: false, due: false };
  const running = { open: true, stage: 1, crisis: false, grow: false, due: true };
  assert.ok(ventureFits(invite, none) && !ventureFits(invite, running));
  assert.ok(!ventureFits(crisis, running) && ventureFits(crisis, { ...running, crisis: true }));
  assert.ok(!ventureFits(grow, running) && ventureFits(grow, { ...running, grow: true }));
  assert.ok(!ventureFits(biz.find((m) => m.id === "biz_supplier")!, { ...running, due: false }));
  // Without the business's books, none of them come.
  for (let i = 0; i < 300; i++) assert.ok(!pickMoment({ spot: "street", day: true, level: 1, recent: [], bigOk: true, rand: Math.random })?.venture);
  // Every answer to a business moment does something, or is a deliberate "nothing".
  for (const m of biz.filter((x) => !x.venture?.none)) assert.ok(m.choices.some((c) => c.outcomes.some((o) => o.biz)), m.id);
});

test("career badges and Legacy", () => {
  const now = Date.now();
  const facts = lifeFacts([], [], now, [
    { best: 2, staff: 3, paid: 50_000, startedAt: now - 100 * 86_400_000, closed: true },
    { best: 4, staff: 12, paid: 0, startedAt: now - 10 * 86_400_000, closed: false },
  ]);
  const got = new Set(LIFE_BADGES.filter((b) => b.earned(facts)).map((b) => b.id));
  for (const id of ["founder", "first_profit", "the_boss", "brand_name", "mogul", "comeback_kid"]) assert.ok(got.has(id), id);
  assert.ok(facts.legacy >= 40 + 60);
  assert.ok(!LIFE_BADGES.filter((b) => b.earned(lifeFacts([], [], now))).some((b) => b.kind === "career"));
});
