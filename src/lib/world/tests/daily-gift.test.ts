// Tests for the daily gift's sum (src/lib/world/daily-gift.ts). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { dailyGift } from "../daily-gift.ts";

test("a brand-new player gets the base and a day's streak", () => {
  const g = dailyGift({ activeYesterday: 0, streak: 1, daysPlaying: 0, reputation: 0 });
  assert.equal(g.total, 6_000);
});

test("active time counts in full 10 minutes, up to 2 hours", () => {
  assert.equal(dailyGift({ activeYesterday: 25, streak: 1, daysPlaying: 0, reputation: 0 }).active, 2_000);
  assert.equal(dailyGift({ activeYesterday: 600, streak: 1, daysPlaying: 0, reputation: 0 }).active, 12_000);
});

test("streak up to a week, weeks playing up to 20", () => {
  const g = dailyGift({ activeYesterday: 0, streak: 30, daysPlaying: 1000, reputation: 0 });
  assert.equal(g.streak, 7_000);
  assert.equal(g.playing, 5_000);
});

test("a keen player gets about ₦20,000; never more than ₦50,000", () => {
  const keen = dailyGift({ activeYesterday: 60, streak: 7, daysPlaying: 30, reputation: 40 });
  assert.ok(keen.total >= 18_000 && keen.total <= 25_000, String(keen.total));
  const top = dailyGift({ activeYesterday: 120, streak: 7, daysPlaying: 140, reputation: 5000 });
  assert.equal(top.repTimes, 2);
  assert.equal(top.total, 50_000);
  assert.equal(dailyGift({ activeYesterday: NaN, streak: -3, daysPlaying: -1, reputation: -50 }).total, 6_000);
});
