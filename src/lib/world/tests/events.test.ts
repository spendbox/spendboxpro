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
  cleanAbout,
  cleanStage,
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
