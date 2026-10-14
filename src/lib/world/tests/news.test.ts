// Tests for the city's news. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { regionMap } from "../index.ts";
import { cityNews, playerStory, weatherNow } from "../news.ts";
import { WORLD_EVENT_BY_KEY } from "../../world-events.ts";

const map = regionMap("lagos")!;

test("the news is the same for everyone at the same moment, newest first", () => {
  const now = Date.UTC(2026, 9, 12, 10, 5);
  const a = cityNews(map, now);
  const b = cityNews(map, now + 60_000);
  assert.deepEqual(a.map((n) => n.id), b.map((n) => n.id));
  assert.ok(a.length >= 15);
  for (let k = 1; k < a.length; k++) assert.ok(a[k - 1].at >= a[k].at);
  assert.ok(a.every((n) => n.title.length > 5 && !n.title.includes("undefined")));
});

test("a new story comes every 20 minutes, and the weather changes by the slot", () => {
  const now = Date.UTC(2026, 9, 12, 10, 5);
  assert.notEqual(cityNews(map, now)[0].id, cityNews(map, now + 20 * 60_000)[0].id);
  const kinds = new Set(Array.from({ length: 40 }, (_, k) => weatherNow(now + k * 3 * 3_600_000).kind));
  assert.ok(kinds.has("rain") && kinds.has("clear"));
});

test("every story you can go and see has a scene that plays out there, fitting the story", () => {
  const stories = cityNews(map, Date.UTC(2026, 9, 12, 10, 5), 600);
  for (const n of stories) {
    if (n.x === undefined) continue;
    assert.ok(n.scene && WORLD_EVENT_BY_KEY[n.scene], `${n.kind}: "${n.title}" has no scene`);
  }
  const fire = stories.find((n) => n.kind === "fire");
  assert.equal(fire?.scene, "building_fire");
  const goat = stories.find((n) => /goat/i.test(n.title));
  if (goat) assert.equal(goat.scene, "runaway_cows");
  for (const kind of ["buy", "business", "rich", "challenge"] as const) {
    const s = playerStory({ id: "x", at: 0, kind, who: "Ada", what: "a flat", price: 20_000 }, "Yaba", "₦30m").scene;
    assert.ok(s && WORLD_EVENT_BY_KEY[s], kind);
  }
});

test("big street events make the news, and each takes over the street when you go and look", () => {
  const stories = cityNews(map, Date.UTC(2026, 9, 12, 10, 5), 600);
  for (const [re, scene] of [[/rave/i, "street_rave"], [/street concert/i, "street_concert"]] as const) {
    const n = stories.find((s) => re.test(s.title));
    assert.ok(n, `no ${scene} story`);
    assert.equal(n.scene, scene);
  }
  const march = stories.find((s) => s.kind === "protest");
  assert.ok(march && march.scene === "protest_march" && march.x !== undefined);
});
