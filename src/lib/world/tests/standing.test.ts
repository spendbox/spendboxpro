// Tests for standing and quiet badges (docs/LIFE_WHEEL.md, phase 4). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { BADGE_INFO } from "../life-badges.ts";
import { MOMENT_BY_ID } from "../moments.ts";
import { LIFE_BADGES, fameWord, lifeFacts, type LivedMoment } from "../standing.ts";

const now = Date.parse("2026-12-20T12:00:00Z");
const day = 86_400_000;
const lived = (o: Partial<LivedMoment>): LivedMoment => ({ moment: "mama_roadside", choice: 0, at: now, traits: null, cash: 0, rep: 0, marks: null, followed: false, ...o });
const earned = (moments: LivedMoment[], bonds = [] as { who: string; step: number; feeling: number }[]) => {
  const f = lifeFacts(moments, bonds, now);
  return new Set(LIFE_BADGES.filter((b) => b.earned(f)).map((b) => b.id));
};

test("every badge has a rule, a name and a story it's about; ids are unique", () => {
  assert.equal(new Set(BADGE_INFO.map((b) => b.id)).size, BADGE_INFO.length);
  for (const b of LIFE_BADGES) assert.ok(b.name && b.emoji && b.about && typeof b.earned === "function", b.id);
  // Every badge a moment needs exists.
  for (const m of MOMENT_BY_ID.values()) if (m.badge) assert.ok(LIFE_BADGES.some((b) => b.id === m.badge), `${m.id}: ${m.badge}`);
});

test("one answer never earns a badge; many over weeks do; a burst in one day doesn't", () => {
  assert.equal(earned([lived({ traits: { daring: 3 } })]).size, 0);
  const weeks = Array.from({ length: 14 }, (_, i) => lived({ traits: { daring: 3 }, at: now - i * 1.5 * day }));
  assert.ok(earned(weeks).has("lion_heart"));
  const burst = Array.from({ length: 30 }, (_, i) => lived({ traits: { daring: 3 }, at: now - i * 60_000 }));
  assert.ok(!earned(burst).has("lion_heart"), "all in one day");
});

test("generous and honest badges need it to have cost you", () => {
  const free = Array.from({ length: 14 }, (_, i) => lived({ traits: { giving: 3 }, at: now - i * 1.5 * day }));
  assert.ok(!earned(free).has("open_hand"));
  const costly = free.map((m, i) => ({ ...m, cash: i < 6 ? -2 : 0 }));
  assert.ok(earned(costly).has("open_hand"));
});

test("both ends of a slider are badges, and old habits fade", () => {
  const careful = Array.from({ length: 14 }, (_, i) => lived({ traits: { daring: -3 }, at: now - i * 1.5 * day }));
  assert.ok(earned(careful).has("wise_owl"));
  const longAgo = careful.map((m) => ({ ...m, at: m.at - 200 * day }));
  assert.ok(!earned(longAgo).has("wise_owl"));
});

test("trust, fame and legacy", () => {
  assert.equal(lifeFacts([], [], now).trust, 50);
  const honest = Array.from({ length: 10 }, () => lived({ traits: { truth: 2 } }));
  const shady = Array.from({ length: 10 }, () => lived({ traits: { truth: -2 } }));
  assert.ok(lifeFacts(honest, [], now).trust > 55 && lifeFacts(shady, [], now).trust < 45);
  assert.ok(lifeFacts([], [{ who: "mama_nkechi", step: 2, feeling: 5 }], now).trust > 60);
  // Nobody saw it: no fame for it.
  assert.equal(lifeFacts([lived({ rep: 3, marks: { unseen: true } })], [], now).fame, 0);
  assert.equal(lifeFacts([lived({ rep: 3 })], [], now).fame, 1);
  assert.ok(lifeFacts([lived({ moment: "big_win" })], [], now).fame >= 12);
  assert.equal(fameWord(0), "Not known yet");
  assert.equal(fameWord(200), "Famous");
  // Legacy: big moments, stories, people.
  const small = lifeFacts([lived({})], [], now).legacy;
  const big = lifeFacts([lived({ moment: "grandpa_land" })], [], now).legacy;
  const story = lifeFacts([lived({})], [{ who: "mama_nkechi", step: -1, feeling: 3 }], now).legacy;
  assert.ok(big > small && story > small);
});

test("story badges come from what you lived and chose", () => {
  assert.ok(earned([lived({ moment: "kunle_3" })]).has("kunles_partner"));
  assert.ok(earned([lived({ moment: "japa_letter", choice: 2 })]).has("prodigal"));
  assert.ok(!earned([lived({ moment: "japa_letter", choice: 0 })]).has("prodigal"));
  assert.ok(earned([lived({ moment: "bello_0", choice: 3 }), lived({ moment: "bello_1_cold", choice: 1 })]).has("bellos_nightmare"));
  assert.ok(earned([], [{ who: "baba_sule", step: 1, feeling: 4 }]).has("street_whisperer"));
  assert.ok(earned([lived({ moment: "big_win" })]).has("touched_by_fate"));
});
