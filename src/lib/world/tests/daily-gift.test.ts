// Tests for the daily gift's sum (src/lib/world/daily-gift.ts). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { dailyGift } from "../daily-gift.ts";

test("a brand-new player gets the base and a day's streak", () => {
  const g = dailyGift({ activeYesterday: 0, streak: 1, daysPlaying: 0, reputation: 0 });
  assert.equal(g.total, 2_300);
});

test("active time counts in full 10 minutes, up to 2 hours", () => {
  assert.equal(dailyGift({ activeYesterday: 25, streak: 1, daysPlaying: 0, reputation: 0 }).active, 1_000);
  assert.equal(dailyGift({ activeYesterday: 600, streak: 1, daysPlaying: 0, reputation: 0 }).active, 6_000);
});

test("streak up to a week, weeks playing up to 20", () => {
  const g = dailyGift({ activeYesterday: 0, streak: 30, daysPlaying: 1000, reputation: 0 });
  assert.equal(g.streak, 2_100);
  assert.equal(g.playing, 2_000);
});

test("reputation doubles it at most, and bad numbers don't break it", () => {
  const top = dailyGift({ activeYesterday: 120, streak: 7, daysPlaying: 140, reputation: 5000 });
  assert.equal(top.repTimes, 2);
  assert.equal(top.total, 24_200);
  assert.equal(dailyGift({ activeYesterday: NaN, streak: -3, daysPlaying: -1, reputation: -50 }).total, 2_300);
});
