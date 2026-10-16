// Tests for moments (docs/MOMENTS.md). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMUTES } from "../work.ts";
import { ROAD_STAGES } from "../road-moments.ts";
import { EFFECTS, LIFE_AREAS, MOMENTS, MOMENT_BY_ID, MOMENT_RULES, TRAIT_KEYS, areaOf, outcomeWeight, characterOf, characterWords, choiceCost, choiceOrder, choiceTraits, fillMoment, momentVars, pickMoment, rollOutcome, spotOfTheme, type MomentSpot } from "../moments.ts";

test("every moment is complete: unique ids, text, choices, outcomes, and follow-ups that exist", () => {
  assert.equal(MOMENT_BY_ID.size, MOMENTS.length);
  for (const m of MOMENTS) {
    assert.ok(m.id.length <= 40 && m.title && m.text.length && m.emoji, m.id);
    assert.ok(m.choices.length >= 1 && m.choices.length <= 8, `${m.id}: choices`);
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

test("on the road: every ride has moments by day and night, each with a scene, and nothing from elsewhere", () => {
  const road = MOMENTS.filter((m) => m.spots !== "any" && m.spots.includes("road"));
  assert.ok(road.length >= 50, `${road.length}`);
  for (const m of road) {
    assert.ok(m.stage && ROAD_STAGES.includes(m.stage), `${m.id}: stage`);
    assert.ok(m.rides?.length, `${m.id}: rides`);
  }
  for (const ride of COMMUTES)
    for (const day of [true, false]) {
      const seen = new Set<string>();
      for (let i = 0; i < 300; i++) {
        const m = pickMoment({ spot: "road", day, level: 1, recent: [], rand: Math.random, ride });
        assert.ok(m, `${ride} ${day}`);
        assert.ok(m.stage && m.rides?.includes(ride), `${ride}: ${m.id}`);
        seen.add(m.id);
      }
      assert.ok(seen.size >= 6, `${ride}: only ${seen.size}`);
    }
  // Road moments stay off the street, and without a ride none comes up on the road.
  for (let i = 0; i < 100; i++) assert.ok(!pickMoment({ spot: "street", day: true, level: 1, recent: [], rand: Math.random })!.stage);
  assert.equal(pickMoment({ spot: "road", day: true, level: 1, recent: [], rand: Math.random }), null);
});

test("answers come in a shuffled order, the same for the same seed, at most a few at once", () => {
  const firsts = new Set<number>();
  for (const m of MOMENTS) {
    for (let seed = 1; seed < 40; seed++) {
      const order = choiceOrder(m, seed);
      assert.deepEqual(order, choiceOrder(m, seed), m.id);
      // Answers that need a thing you own don't show without it.
      assert.equal(order.length, Math.min(m.choices.filter((c) => !c.has).length, MOMENT_RULES.shown), m.id);
      for (const i of order) assert.ok(!m.choices[i].has, `${m.id}: a thing's answer shown to someone without it`);
      assert.equal(new Set(order).size, order.length, m.id);
      for (const i of order) assert.ok(i >= 0 && i < m.choices.length, m.id);
      if (m.choices.length === 3) firsts.add(order[0]);
    }
  }
  // Any answer can come first: position gives nothing away.
  assert.deepEqual([...firsts].sort(), [0, 1, 2]);
});

test("every answer nudges who you are, a few points at most on any slider", () => {
  for (const m of MOMENTS)
    for (const c of m.choices) {
      const t = choiceTraits(c);
      const keys = Object.keys(t);
      assert.ok(keys.length > 0, `${m.id}: ${c.label}`);
      for (const k of keys) {
        assert.ok((TRAIT_KEYS as string[]).includes(k), `${m.id}: ${k}`);
        assert.ok(Math.abs(t[k as keyof typeof t] ?? 0) <= 4, `${m.id}: ${c.label} ${k}`);
      }
    }
});

test("who you are: one answer never decides it, many do, and old answers fade", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");
  const day = 86_400_000;
  const one = characterOf([{ traits: { giving: 3 }, at: now }], now);
  assert.ok(one.giving > 0 && one.giving < 20, `one answer: ${one.giving}`);
  assert.deepEqual(characterWords(one), []);
  const many = characterOf(Array.from({ length: 15 }, (_, i) => ({ traits: { giving: 3, daring: -1 }, at: now - i * day })), now);
  assert.ok(many.giving > 60, `many: ${many.giving}`);
  assert.equal(characterWords(many)[0], "generous");
  const old = characterOf(Array.from({ length: 15 }, (_, i) => ({ traits: { giving: 3 }, at: now - (120 + i) * day })), now);
  assert.ok(old.giving < 15, `old: ${old.giving}`);
  // Both ends are words too.
  const firm = characterOf(Array.from({ length: 15 }, () => ({ traits: { wrongs: -3 }, at: now })), now);
  assert.equal(characterWords(firm)[0], "firm");
  for (const k of TRAIT_KEYS) assert.ok(Math.abs(many[k]) <= 100);
});

test("rare ones are rare, big ones wait, and ones never had come first", () => {
  const rare = MOMENTS.find((m) => m.spots !== "any" && m.spots.includes("street") && !m.followOnly && !m.time && !m.minLevel)!;
  const was = { rarity: rare.rarity, size: rare.size };
  try {
    rare.rarity = "legendary";
    let hits = 0;
    for (let i = 0; i < 4000; i++) if (pickMoment({ spot: "street", day: true, level: 1, recent: [], rand: Math.random })?.id === rare.id) hits++;
    assert.ok(hits < 10, `legendary came ${hits} times in 4000`);
    rare.rarity = undefined;
    rare.size = "big";
    for (let i = 0; i < 500; i++) assert.notEqual(pickMoment({ spot: "street", day: true, level: 1, recent: [], bigOk: false, rand: Math.random })?.id, rare.id);
  } finally {
    rare.rarity = was.rarity;
    rare.size = was.size;
  }
  const street = MOMENTS.filter((m) => !m.followOnly && m.spots !== "any" && m.spots.includes("street"));
  const fresh = street[0].id;
  const seen = new Set(street.slice(1).map((m) => m.id));
  let freshHits = 0;
  let plainHits = 0;
  for (let i = 0; i < 6000; i++) {
    if (pickMoment({ spot: "street", day: true, level: 1, recent: [], seen, rand: Math.random })?.id === fresh) freshHits++;
    if (pickMoment({ spot: "street", day: true, level: 1, recent: [], rand: Math.random })?.id === fresh) plainHits++;
  }
  assert.ok(freshHits > plainHits * 1.8, `never had: ${freshHits} against ${plainHits}`);
});

test("effects, areas and likelier outcomes all point at real things", () => {
  for (const m of MOMENTS) {
    assert.ok(LIFE_AREAS[areaOf(m)], m.id);
    for (const c of m.choices)
      for (const o of c.outcomes) {
        if (o.effect) assert.ok(EFFECTS[o.effect], `${m.id}: ${o.effect}`);
        for (const l of o.likelier ?? []) {
          if ("effect" in l) assert.ok(EFFECTS[l.effect], `${m.id}: ${l.effect}`);
          else if ("venture" in l) assert.ok(m.venture, `${m.id}: a business likelier outside business`);
          else if ("tag" in l) assert.ok(Object.values(m.parts ?? {}).some((opts) => opts.some((p) => p.tag === l.tag)), `${m.id}: no part has tag ${l.tag}`);
          else assert.ok((TRAIT_KEYS as string[]).includes(l.trait), `${m.id}: ${l.trait}`);
        }
      }
  }
});

test("the same answer turns out differently with who you are and what's on you", () => {
  const good = { text: "", get: 1, likelier: [{ trait: "truth" as const, side: -1 as const }] };
  const plain = { text: "", pay: 1 };
  assert.equal(outcomeWeight(good), 1);
  assert.ok(outcomeWeight(good, { character: { truth: -50 } }) > 2);
  assert.equal(outcomeWeight(good, { character: { truth: 50 } }), 1);
  assert.ok(outcomeWeight(good, { effects: ["blessed"] }) > 1);
  assert.ok(outcomeWeight(plain, { effects: ["bad_day"] }) > 1);
  assert.equal(outcomeWeight(plain, { effects: ["blessed"] }), 1);
});

test("big and life-changing moments: several answers, each with a tail somewhere, and nothing hurt can't do", () => {
  const big = MOMENTS.filter((m) => m.size === "big" || m.size === "life");
  assert.ok(big.length >= 6, `only ${big.length}`);
  for (const m of big) {
    assert.ok(m.choices.length >= 3, `${m.id}: answers`);
    // No single answer is free and best: every one costs or risks something, or brings nothing.
    assert.ok(m.choices.some((c) => c.outcomes.some((o) => o.follow || o.effect || o.biz || o.opens)) || m.size === "life", `${m.id}: no tail`);
  }
  // Hurt means no sport.
  for (let i = 0; i < 300; i++) {
    const m = pickMoment({ spot: "sport", day: true, level: 1, recent: [], effects: ["hurt"], rand: Math.random });
    assert.ok(!m || m.spots === "any", m?.id);
  }
});

test("more answers: pools of up to eight, and plenty with more than are shown at once", () => {
  for (const m of MOMENTS) assert.ok(m.choices.length <= 8, m.id);
  const pooled = MOMENTS.filter((m) => m.choices.length > MOMENT_RULES.shown);
  assert.ok(pooled.length >= 8, `only ${pooled.length} moments with more answers than are shown`);
});

test("the cast: every story step belongs to a real character, steps start at 0, and every next step exists", async () => {
  const { CAST, CAST_BY_ID } = await import("../cast.ts");
  assert.equal(CAST_BY_ID.size, CAST.length);
  assert.ok(CAST.length >= 40, `only ${CAST.length} in the cast`);
  const steps = new Map<string, Set<number>>();
  for (const m of MOMENTS.filter((x) => x.cast)) {
    const who = CAST_BY_ID.get(m.cast!);
    assert.ok(who?.story, `${m.id}: ${m.cast}`);
    assert.ok(!m.followOnly && !m.size, `${m.id}: a story step is its own kind`);
    if (!steps.has(m.cast!)) steps.set(m.cast!, new Set());
    steps.get(m.cast!)!.add(m.step ?? 0);
    for (const c of m.choices) for (const o of c.outcomes) assert.ok(Math.abs(o.bond ?? 0) <= 3, `${m.id}: bond`);
  }
  for (const c of CAST.filter((x) => x.story)) assert.ok(steps.get(c.id)?.has(0), `${c.id}: no first step`);
  for (const m of MOMENTS.filter((x) => x.cast))
    for (const c of m.choices)
      for (const o of c.outcomes) {
        const next = o.next ?? (m.step ?? 0) + 1;
        if (next >= 0 && next !== (m.step ?? 0) + 1) assert.ok(steps.get(m.cast!)!.has(next), `${m.id}: next ${next}`);
      }
});

test("the cast: a story waits its turn, branches on feeling, and changes with the city", async () => {
  const { castFits } = await import("../moments.ts");
  const now = Date.parse("2026-12-20T12:00:00Z");
  const day = 86_400_000;
  const nk0 = MOMENT_BY_ID.get("nkechi_0")!;
  const nk1 = MOMENT_BY_ID.get("nkechi_1")!;
  const nk1cold = MOMENT_BY_ID.get("nkechi_1_cold")!;
  assert.ok(castFits(nk0, {}, {}, now));
  assert.ok(!castFits(nk1, {}, {}, now));
  const warm = { mama_nkechi: { step: 1, feeling: 2, last: now - 2 * day } };
  assert.ok(castFits(nk1, warm, {}, now) && !castFits(nk1cold, warm, {}, now));
  const cold = { mama_nkechi: { step: 1, feeling: -1, last: now - 2 * day } };
  assert.ok(!castFits(nk1, cold, {}, now) && castFits(nk1cold, cold, {}, now));
  // Too soon after the last time.
  assert.ok(!castFits(nk1, { mama_nkechi: { step: 1, feeling: 2, last: now - 3_600_000 } }, {}, now));
  // The city decides whether her shop is open yet.
  const at3 = { mama_nkechi: { step: 3, feeling: 2, last: now - 2 * day } };
  assert.ok(castFits(MOMENT_BY_ID.get("nkechi_3_wait")!, at3, { mama_nkechi: { good: 10, bad: 0 } }, now));
  assert.ok(!castFits(MOMENT_BY_ID.get("nkechi_3")!, at3, { mama_nkechi: { good: 10, bad: 0 } }, now));
  assert.ok(castFits(MOMENT_BY_ID.get("nkechi_3")!, at3, { mama_nkechi: { good: 40, bad: 0 } }, now));
  // A story that's over doesn't come back; without the cast's books, no character comes at all.
  assert.ok(!castFits(nk0, { mama_nkechi: { step: -1, feeling: 3, last: 0 } }, {}, now));
  for (let i = 0; i < 300; i++) assert.ok(!pickMoment({ spot: "street", day: true, level: 1, recent: [], rand: Math.random })?.cast);
  // People arrive over time.
  const fola = (await import("../cast.ts")).CAST_BY_ID.get("fola_intern")!;
  const { castHere } = await import("../cast.ts");
  assert.ok(!castHere(fola, Date.parse("2026-11-01T00:00:00Z")) && castHere(fola, Date.parse("2026-11-16T00:00:00Z")));
});

test("what you own: every thing in the shop has its own moment, and gives you answers elsewhere", async () => {
  const { SHOP } = await import("../items.ts");
  const { ownedTokens, relevantOwned } = await import("../moments.ts");
  for (const k of SHOP) {
    assert.ok(MOMENTS.some((m) => m.item?.includes(k.id) || m.item?.includes(`cat:${k.category}`)), `${k.id} has no moment of its own`);
  }
  // Every thing a moment or answer names is in the shop (or a category).
  const kinds = new Set(SHOP.map((k) => k.id));
  for (const m of MOMENTS) {
    for (const x of [...(m.item ?? []), ...m.choices.flatMap((c) => c.has ?? [])]) assert.ok(kinds.has(x) || x.startsWith("cat:"), `${m.id}: ${x}`);
  }
  // A thing's moment comes only to owners; with the thing, its answer always shows.
  const owned = ownedTokens([{ kind: "generator", category: "gadget" }]);
  for (let i = 0; i < 300; i++) assert.ok(!pickMoment({ spot: "home", day: true, level: 1, recent: [], rand: Math.random })?.item);
  let mine = 0;
  for (let i = 0; i < 2000; i++) if (pickMoment({ spot: "home", day: true, level: 1, recent: [], owned, rand: Math.random })?.id === "th_light") mine++;
  assert.ok(mine > 0);
  const nepa = MOMENT_BY_ID.get("nepa")!;
  const has = relevantOwned(nepa, owned);
  assert.deepEqual(has, ["generator"]);
  for (let seed = 1; seed < 50; seed++) assert.ok(choiceOrder(nepa, seed, has).some((i) => nepa.choices[i].has), "the generator's answer is missing");
});
