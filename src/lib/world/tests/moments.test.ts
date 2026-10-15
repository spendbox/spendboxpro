// Tests for moments (docs/MOMENTS.md). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOMENTS, MOMENT_BY_ID, choiceCost, fillMoment, momentVars, pickMoment, rollOutcome, spotOfTheme, type MomentSpot } from "../moments.ts";

test("every moment is complete: unique ids, text, choices, outcomes, and follow-ups that exist", () => {
  assert.equal(MOMENT_BY_ID.size, MOMENTS.length);
  for (const m of MOMENTS) {
    assert.ok(m.id.length <= 40 && m.title && m.text.length && m.emoji, m.id);
    assert.ok(m.choices.length >= 1 && m.choices.length <= 3, `${m.id}: choices`);
    for (const c of m.choices) {
      assert.ok(c.outcomes.length > 0, `${m.id}: ${c.label}`);
      for (const o of c.outcomes) {
        if (o.follow) assert.ok(MOMENT_BY_ID.get(o.follow)?.followOnly, `${m.id} follows ${o.follow}`);
        // An amount in the story means the moment has one.
        if (o.pay || o.get || /\{ask\}/.test(o.text + c.label)) assert.ok(m.ask, `${m.id}: no amount`);
        assert.ok(Math.abs(o.rep ?? 0) <= 6, `${m.id}: too much reputation`);
      }
    }
    for (const t of m.text) if (/\{ask\}/.test(t)) assert.ok(m.ask, `${m.id}: no amount`);
  }
});

test("there's something for every kind of place, by day and by night", () => {
  const spots: MomentSpot[] = ["street", "home", "food", "night", "sport", "shop", "worship", "outdoors", "work"];
  for (const spot of spots)
    for (const day of [true, false]) {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const m = pickMoment({ spot, day, level: 1, recent: [], rand: Math.random });
        assert.ok(m, `${spot} ${day}`);
        assert.ok(!m.followOnly && (m.spots === "any" || m.spots.includes(spot)));
        assert.ok(!m.time || (m.time === "day") === day);
        assert.ok(!m.minLevel || m.minLevel <= 1);
        seen.add(m.id);
      }
      assert.ok(seen.size >= 3, `${spot}: only ${seen.size}`);
    }
  // Not the ones you've just had.
  const recent = MOMENTS.filter((m) => m.spots !== "any" && m.spots.includes("food")).map((m) => m.id);
  for (let i = 0; i < 50; i++) assert.ok(!recent.includes(pickMoment({ spot: "food", day: true, level: 1, recent, rand: Math.random })!.id));
});

test("filled in: names and amounts, rounded like prices, the same for the same seed", () => {
  const m = MOMENT_BY_ID.get("dropped_wallet")!;
  const v = momentVars(m, 1234, 1, "Yaba");
  assert.deepEqual(v, momentVars(m, 1234, 1, "Yaba"));
  assert.ok(v.ask >= m.ask![0] && v.ask <= m.ask![1] * 1.01);
  assert.equal(v.ask % 100, 0);
  const text = fillMoment(m.text[0], v, (x) => `N${x}`);
  assert.ok(!/\{/.test(text) && text.includes(v.name) && text.includes(`N${v.ask}`));
  // Richer players are asked for more.
  assert.ok(momentVars(m, 1234, 15, "").ask > v.ask);
  assert.equal(choiceCost(m.choices[0], 1000), 0);
  assert.equal(choiceCost(MOMENT_BY_ID.get("mama_roadside")!.choices[1], 1000), 2000);
});

test("outcomes come up about as often as their chances say", () => {
  const c = MOMENT_BY_ID.get("baba_ijebu")!.choices[0];
  let wins = 0;
  for (let i = 0; i < 4000; i++) if (rollOutcome(c, Math.random).get) wins++;
  assert.ok(wins > 4000 * 0.13 && wins < 4000 * 0.23, `${wins}`);
});

test("places map to the right kind of moment", () => {
  assert.equal(spotOfTheme("restaurant", false), "food");
  assert.equal(spotOfTheme("club", false), "night");
  assert.equal(spotOfTheme("mosque", false), "worship");
  assert.equal(spotOfTheme("gym", false), "sport");
  assert.equal(spotOfTheme("market", false), "shop");
  assert.equal(spotOfTheme("office", false), "work");
  assert.equal(spotOfTheme("living", false), "home");
  assert.equal(spotOfTheme("club", true), "home");
  assert.equal(spotOfTheme(null, false), "street");
});
