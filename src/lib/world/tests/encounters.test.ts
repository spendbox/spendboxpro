// Tests for street encounters (docs/ENCOUNTERS.md): every card makes sense, the right ones come up
// on foot or on each kind of ride, and the money stays small. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { ENCOUNTERS, pickEncounter, rollChoice } from "../encounters.ts";

test("every encounter has a unique id, two or three choices, and small money", () => {
  const ids = new Set<string>();
  for (const e of ENCOUNTERS) {
    assert.match(e.id, /^[a-z_]{2,30}$/);
    assert.ok(!ids.has(e.id), e.id);
    ids.add(e.id);
    assert.ok(e.choices.length >= 2 && e.choices.length <= 3, e.id);
    for (const c of e.choices) {
      for (const o of [c.good, c.bad].filter(Boolean)) assert.ok(Math.abs(o!.naira) <= 5_000, `${e.id}: ${c.label}`);
      if (c.bad) assert.ok(c.odds! > 0 && c.odds! < 1, `${e.id}: ${c.label}`);
    }
  }
});

test("on foot you get street ones; on a ride, ones for that ride", () => {
  for (let i = 0; i < 200; i++) {
    const r = () => (i * 0.6180339887) % 1;
    const foot = pickEncounter("foot", null, [], r)!;
    assert.ok(foot.where !== "ride");
    for (const ride of ["keke", "okada", "danfo"] as const) {
      const e = pickEncounter("ride", ride, [], r)!;
      assert.ok(e.where !== "foot");
      assert.ok(!e.rides || e.rides.includes(ride), `${e.id} on ${ride}`);
    }
  }
});

test("not the same one twice running when there's another", () => {
  const first = pickEncounter("foot", null, [], () => 0)!;
  const next = pickEncounter("foot", null, [first.id], () => 0)!;
  assert.notEqual(next.id, first.id);
});

test("a chancy choice can go either way", () => {
  const c = ENCOUNTERS.find((e) => e.id === "bet_shop")!.choices[0];
  assert.equal(rollChoice(c, () => 0).naira, c.good.naira);
  assert.equal(rollChoice(c, () => 0.99).naira, c.bad!.naira);
});
