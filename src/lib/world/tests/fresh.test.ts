// Tests for moments that never run out (docs/LIFE_WHEEL.md, phase 7). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { SEASONS, SEASON_BY_ID, seasonsAt } from "../calendar.ts";
import { MOMENTS, MOMENT_BY_ID, fillMoment, momentVars, partVersions, pickMoment, registerMoments } from "../moments.ts";
import { checkDraft, draftToMoment, emptyDraft, type Draft } from "../written.ts";

const money = (v: number) => `₦${v}`;
const at = (d: string) => Date.parse(`${d}T12:00:00+01:00`);

test("moments built from parts: hundreds of ways each, and every way fills in completely", () => {
  const built = MOMENTS.filter((m) => m.parts);
  assert.ok(built.length >= 8, `only ${built.length}`);
  let ways = 0;
  for (const m of built) {
    assert.ok(partVersions(m) >= 100, `${m.id}: only ${partVersions(m)} ways`);
    ways += partVersions(m);
    for (let seed = 1; seed < 300; seed++) {
      const v = momentVars(m, seed, 1, "the junction");
      const texts = [m.title, ...m.text, ...m.choices.flatMap((c) => [c.label, ...c.outcomes.map((o) => o.text)])];
      for (const t of texts) assert.ok(!/\{[a-z]+\}/.test(fillMoment(t, v, money)), `${m.id}: left "${fillMoment(t, v, money)}"`);
      assert.ok(v.ask > 0 || !m.ask, `${m.id}: no amount`);
      // A part that starts a sentence ("A boy...") never lands mid-sentence with its capital.
      for (const t of m.text) assert.ok(!/(, |and )(A|An|The|Your|Two|Someone) [a-z]/.test(fillMoment(t, v, money)), `${m.id}: "${fillMoment(t, v, money)}"`);
    }
  }
  assert.ok(ways >= 1_500, `only ${ways} ways in all`);
});

test("the Lagos calendar knows its days", () => {
  assert.ok(seasonsAt(at("2026-12-25")).includes("christmas"));
  assert.ok(seasonsAt(at("2026-12-25")).includes("detty_december"));
  assert.ok(seasonsAt(at("2027-01-02")).includes("detty_december"), "Detty December runs into January");
  assert.ok(seasonsAt(at("2027-01-02")).includes("harmattan"));
  assert.ok(seasonsAt(at("2026-03-01")).includes("ramadan"));
  assert.ok(seasonsAt(at("2026-06-20")).includes("rainy_season"));
  assert.ok(!seasonsAt(at("2026-08-15")).includes("rainy_season"), "the August break");
  assert.ok(seasonsAt(at("2026-08-15")).includes("august_break"));
  assert.ok(seasonsAt(at("2026-10-27")).includes("pay_week"));
  assert.ok(seasonsAt(at("2026-10-03")).includes("month_start"));
  assert.ok(seasonsAt(at("2026-10-01")).includes("independence"));
  for (const s of SEASONS) assert.ok(s.name && s.emoji, s.id);
});

test("seasonal moments come only in their season; every season they name exists", () => {
  const seasonal = MOMENTS.filter((m) => m.season);
  assert.ok(seasonal.length >= 20);
  for (const m of seasonal) for (const s of m.season!) assert.ok(SEASON_BY_ID.has(s), `${m.id}: ${s}`);
  const christmas = MOMENT_BY_ID.get("s_christmas")!;
  let inSeason = 0;
  for (let i = 0; i < 3000; i++) {
    assert.notEqual(pickMoment({ spot: "home", day: true, level: 1, recent: [], seasons: [], rand: Math.random })?.id, christmas.id);
    if (pickMoment({ spot: "home", day: true, level: 1, recent: [], seasons: ["christmas"], rand: Math.random })?.id === christmas.id) inSeason++;
  }
  assert.ok(inSeason > 0);
});

test("your area and who you are", () => {
  for (let i = 0; i < 2000; i++) {
    const m = pickMoment({ spot: "street", day: true, level: 1, recent: [], area: "Surulere", rand: Math.random });
    assert.ok(!m?.areas || m.areas.some((a) => "surulere".includes(a.toLowerCase())), m?.id);
    assert.ok(!pickMoment({ spot: "street", day: true, level: 1, recent: [], rand: Math.random })?.fits);
  }
  let lekki = 0;
  for (let i = 0; i < 3000; i++) if (pickMoment({ spot: "street", day: true, level: 1, recent: [], area: "Lekki & Ajah", rand: Math.random })?.id === "a_lekki_toll") lekki++;
  assert.ok(lekki > 0, "Lekki's moment never came in Lekki");
});

const good = (): Draft => ({
  title: "The landlord's son",
  emoji: "🚗",
  spot: "street",
  ask: "medium",
  text: "{name}, your landlord's son, scratches your car and begs you not to tell his father.",
  choices: [
    { label: "Tell his father", outcomes: [{ text: "His father pays for it, and he won't look at you again.", money: 1, rep: -1, chance: 2 }] },
    { label: "Let him pay you quietly", outcomes: [{ text: "He pays half and thanks you for ever.", money: 0.5, rep: 1, chance: 1 }] },
    { label: "Forget it", outcomes: [{ text: "You let it go. The scratch reminds you every day.", money: 0, rep: 2, chance: 1 }] },
  ],
});

test("a player's draft is checked: fine ones pass, and each problem is named", () => {
  assert.deepEqual(checkDraft(good()), []);
  assert.ok(checkDraft(emptyDraft()).length > 0);
  const bad = good();
  bad.text = "Call me on 08031234567 for the real story about your car.";
  assert.ok(checkDraft(bad).some((e) => /phone/.test(e)));
  const greedy = good();
  greedy.choices[0].outcomes[0].money = 10;
  assert.ok(checkDraft(greedy).some((e) => /money/.test(e)));
  const trap = good();
  trap.choices = trap.choices.map((c) => ({ ...c, outcomes: c.outcomes.map((o) => ({ ...o, money: -1 })) }));
  assert.ok(checkDraft(trap).some((e) => /cost nothing/.test(e)));
  const slot = good();
  slot.text = "{boss} wants to see you about {name}'s car, right now, today.";
  assert.ok(checkDraft(slot).some((e) => /filled in/.test(e)));
});

test("an approved draft becomes a moment, by its author; only written ones can be added", () => {
  const m = draftToMoment(42, good(), "Ade");
  assert.equal(m.id, "w_42");
  assert.equal(m.by, "Ade");
  assert.equal(m.choices[0].outcomes[0].get, 1);
  assert.equal(m.choices[1].outcomes[0].get, 0.5);
  assert.ok(m.choices.every((c) => c.tone === "calm"));
  registerMoments([m, { ...m, id: "mama_roadside", title: "Hijacked" }]);
  assert.equal(MOMENT_BY_ID.get("w_42")?.title, "The landlord's son");
  assert.notEqual(MOMENT_BY_ID.get("mama_roadside")?.title, "Hijacked");
  // It can be picked like any other.
  let seen = 0;
  for (let i = 0; i < 3000; i++) if (pickMoment({ spot: "street", day: true, level: 1, recent: [], extra: [m], rand: Math.random })?.id === "w_42") seen++;
  assert.ok(seen > 0);
});
