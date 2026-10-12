// Tests for the city's news. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { regionMap } from "../index.ts";
import { cityNews, weatherNow } from "../news.ts";

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
