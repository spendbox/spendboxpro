// Tests for events on the map (docs/EVENTS.md): the kinds on offer, the rules and the stage.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EVENT_CATEGORIES,
  EVENT_FORMATS,
  EMPTY_STAGE,
  ICEBREAKERS,
  MEET_PROMPTS,
  REP_MAX,
  PARTY_NAIRA_PER_HOUR,
  areaK,
  cleanAbout,
  cleanQuestion,
  cleanStage,
  partyCost,
  streetClash,
  ticketSplit,
  cleanTitle,
  doorsOpen,
  eventRep,
  eventStatus,
  formatsIn,
  pick,
  startChoices,
  untilText,
  videoPosNow,
  whenText,
  youtubeId,
} from "../events.ts";
import { WORLD_EVENT_BY_KEY } from "../../world-events.ts";

test("every format belongs to a built category, has a database-safe id and a real map scene", () => {
  const ids = new Set<string>();
  for (const f of EVENT_FORMATS) {
    assert.match(f.id, /^[a-z_]{2,20}$/, f.id);
    assert.ok(!ids.has(f.id), `duplicate ${f.id}`);
    ids.add(f.id);
    assert.ok(EVENT_CATEGORIES.some((c) => c.id === f.category && c.ready), f.id);
    if (f.scene) assert.ok(WORLD_EVENT_BY_KEY[f.scene], `${f.id}: no scene ${f.scene}`);
    assert.ok(f.capacity >= 2 && f.capacity <= 1000);
  }
  assert.ok(formatsIn("party").length >= 4);
  assert.ok(formatsIn("stage").length >= 3);
});

test("titles and descriptions are tidied", () => {
  assert.equal(cleanTitle("  Ada's   birthday  "), "Ada's birthday");
  assert.equal(cleanTitle("hi"), null);
  assert.equal(cleanTitle("x".repeat(100))?.length, 60);
  assert.equal(cleanAbout("a\n\n\n\nb"), "a\n\nb");
});

test("status follows the clock", () => {
  const now = 1_000_000;
  assert.equal(eventStatus(now + 1, now + 10, false, now), "upcoming");
  assert.equal(eventStatus(now, now + 10, false, now), "live");
  assert.equal(eventStatus(now - 10, now, false, now), "ended");
  assert.equal(eventStatus(now, now + 10, true, now), "cancelled");
  assert.equal(doorsOpen(now + 4 * 60_000, now + 3600_000, now), true, "doors open 5 minutes early");
  assert.equal(doorsOpen(now + 6 * 60_000, now + 3600_000, now), false);
});

test("start choices are in the future and in order of time", () => {
  const now = new Date(2026, 9, 14, 21, 0).getTime();
  const c = startChoices(now);
  assert.equal(c[0].id, "now");
  assert.ok(!c.some((x) => x.id === "tonight"), "no 'tonight 8pm' after 8pm");
  for (const x of c) assert.ok(x.at >= now);
  assert.ok(c.some((x) => x.id === "tomorrow"));
});

test("when and how long, in words", () => {
  const now = new Date(2026, 9, 14, 12, 0).getTime();
  assert.equal(whenText(now + 25 * 60_000, now + 90 * 60_000, now), "Starts in 25 min");
  assert.match(whenText(now - 1, now + 80 * 60_000, now), /^Live now · 1h 20m left$/);
  assert.match(whenText(now + 8 * 3600_000, now + 9 * 3600_000, now), /^Today 8:00pm$/);
  assert.equal(untilText(45 * 60_000), "45 min");
  assert.equal(untilText(120 * 60_000), "2h");
});

test("YouTube links of every shape give the video's id; other links give nothing", () => {
  const id = "dQw4w9WgXcQ";
  for (const s of [id, `https://www.youtube.com/watch?v=${id}&t=3`, `youtu.be/${id}`, `https://youtube.com/shorts/${id}`, `https://m.youtube.com/live/${id}?si=x`, `https://www.youtube.com/embed/${id}`]) assert.equal(youtubeId(s), id, s);
  for (const s of ["", "https://vimeo.com/123", "https://evil.com/watch?v=dQw4w9WgXcQ", "javascript:alert(1)"]) assert.equal(youtubeId(s), null, s);
});

test("the stage only keeps what's allowed", () => {
  const base = "https://x.supabase.co/storage/v1/object/public/events/";
  assert.deepEqual(cleanStage(null), EMPTY_STAGE);
  const s = cleanStage({ mode: "slides", slides: [`${base}a/1.jpg`, "https://evil.com/x.jpg", 5, `${base}a/2.jpg`], slide: 9 }, base);
  assert.deepEqual(s.slides, [`${base}a/1.jpg`, `${base}a/2.jpg`]);
  assert.equal(s.slide, 1, "slide kept in range");
  assert.equal(cleanStage({ mode: "slides", slides: [] }).mode, "none", "no slides, nothing to show");
  assert.equal(cleanStage({ mode: "video", video: "<script>" }).mode, "none");
  const v = cleanStage({ mode: "video", video: "dQw4w9WgXcQ", playing: true, pos: 10, at: 1000 });
  assert.equal(videoPosNow(v, 6000), 15);
  assert.equal(videoPosNow({ ...v, playing: false }, 6000), 10);
});

test("reputation: hosting counts most, going counts too, capped", () => {
  assert.equal(eventRep(0, 0), 0);
  assert.equal(eventRep(2, 5), 8);
  assert.equal(eventRep(1000, 1000), REP_MAX);
});

test("party cards: plenty of them, and every phone picks the same", () => {
  assert.ok(ICEBREAKERS.length >= 20 && MEET_PROMPTS.length >= 8);
  assert.equal(pick(ICEBREAKERS, 12345), pick(ICEBREAKERS, 12345));
  assert.equal(pick([1, 2, 3], -1), 3);
});

test("a party costs ₦100,000 an hour at the smallest, more for more people, a fancier place and a dearer area", () => {
  const base = partyCost({ minutes: 60, capacity: 20, venue: "street", area: 1 });
  assert.equal(base.naira, PARTY_NAIRA_PER_HOUR);
  assert.equal(partyCost({ minutes: 120, capacity: 20, venue: "street", area: 1 }).naira, 200_000, "by the hour");
  assert.ok(partyCost({ minutes: 60, capacity: 300, venue: "street", area: 1 }).naira > partyCost({ minutes: 60, capacity: 50, venue: "street", area: 1 }).naira, "more people, more money");
  assert.ok(partyCost({ minutes: 60, capacity: 20, venue: "landmark", area: 1 }).naira > partyCost({ minutes: 60, capacity: 20, venue: "food", area: 1 }).naira);
  assert.ok(partyCost({ minutes: 60, capacity: 20, venue: "street", area: 1.5 }).naira > base.naira, "a dear area costs more");
  assert.equal(partyCost({ minutes: 90, capacity: 100, venue: "food", area: 1.2 }).naira % 1000, 0, "rounded to ₦1,000");
});

test("the area's price follows the district's land price, and is 1 away from any district", () => {
  const centres = [{ x: 0, z: 0, radius: 10, landPrice: 1_200_000 }, { x: 100, z: 0, radius: 10, landPrice: 100_000 }];
  assert.ok(areaK(centres, 0, 0) > 1.5, "the dear district's middle");
  assert.ok(areaK(centres, 100, 0) < 1, "the cheap district's middle");
  assert.equal(areaK(centres, 50, 50), 1, "nowhere near");
});

test("street parties can't overlap: too close at the same time clashes, apart or at another time is fine", () => {
  const a = { x: 0, z: 0, start: 0, end: 100 };
  assert.ok(streetClash(a, { x: 5, z: 5, start: 50, end: 150 }));
  assert.ok(!streetClash(a, { x: 30, z: 0, start: 50, end: 150 }), "far enough apart");
  assert.ok(!streetClash(a, { x: 0, z: 0, start: 100, end: 200 }), "one after the other");
});

test("your own hot seat question is tidied and ends with a question mark", () => {
  assert.equal(cleanQuestion("  best   party song  "), "best party song?");
  assert.equal(cleanQuestion("Who's here?"), "Who's here?");
  assert.equal(cleanQuestion("hi"), null);
});

test("Game challenge is coming soon, not hostable from Events", () => {
  assert.equal(EVENT_CATEGORIES.find((c) => c.id === "games")?.ready, false);
});

test("a party's song queue keeps only YouTube ids", () => {
  assert.deepEqual(cleanStage({ queue: ["dQw4w9WgXcQ", "bad", 4] }).queue, ["dQw4w9WgXcQ"]);
});

test("tickets are taxed like pay: VAT inside the price, then income tax (the same numbers as the database)", () => {
  assert.deepEqual(ticketSplit(300), { vat: 20.93, tax: 19.53, host: 259.54 });
  const t = ticketSplit(1000);
  assert.ok(Math.abs(t.vat + t.tax + t.host - 1000) < 0.011, "it all adds up");
});
