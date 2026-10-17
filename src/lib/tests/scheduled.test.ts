// Tests for scheduled games (src/lib/scheduled.ts) and Police & Thieves' shop (src/lib/cops.ts).
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { countdown, sessionAt, sessionsNow, startLabel, timeOfDay } from "../scheduled.ts";
import { COPS_TICKET_NAIRA, GEAR, PRACTICE_LOADOUT, copsMint, gunsOf, loadoutNaira } from "../cops.ts";

const at = (iso: string) => Date.parse(iso);

test("games start at 2am, 10am and 6pm Lagos time (01:00, 09:00, 17:00 UTC)", () => {
  // 08:30 UTC is 9:30am in Lagos: the next game is 10am.
  const a = sessionsNow("cops-robbers", at("2026-10-17T08:30:00Z"));
  assert.equal(a.live, null);
  assert.equal(a.next.key, "2026-10-17T09:00:00.000Z");
  assert.equal(startLabel(a.next.starts), "10am");
  // 17:05 UTC: the 6pm game is on (30 s to get ready, 10 minutes of fighting); the next is 2am.
  const b = sessionsNow("cops-robbers", at("2026-10-17T17:05:00Z"));
  assert.equal(b.live?.key, "2026-10-17T17:00:00.000Z");
  assert.equal(b.live!.ends - b.live!.starts, 630_000);
  assert.equal(b.next.key, "2026-10-18T01:00:00.000Z");
  assert.equal(startLabel(b.next.starts), "2am");
  // Just after the fighting ends: nothing live.
  assert.equal(sessionsNow("cops-robbers", at("2026-10-17T17:10:31Z")).live, null);
  // Late at night (23:30 UTC = 00:30 Lagos): the next is 2am the same Lagos night.
  assert.equal(sessionsNow("cops-robbers", at("2026-10-17T23:30:00Z")).next.key, "2026-10-18T01:00:00.000Z");
});

test("only real start times are accepted", () => {
  assert.ok(sessionAt("cops-robbers", "2026-10-17T09:00:00.000Z"));
  assert.equal(sessionAt("cops-robbers", "2026-10-17T10:00:00.000Z"), null);
  assert.equal(sessionAt("cops-robbers", "2026-10-17T09:30:00.000Z"), null);
  assert.equal(sessionAt("cops-robbers", "nonsense"), null);
  assert.equal(sessionAt("nope", "2026-10-17T09:00:00.000Z"), null);
});

test("the time of day each game is played in", () => {
  assert.equal(timeOfDay(at("2026-10-17T09:00:00Z")), "day");
  assert.equal(timeOfDay(at("2026-10-17T17:00:00Z")), "dusk");
  assert.equal(timeOfDay(at("2026-10-17T01:00:00Z")), "night");
  assert.equal(countdown(0), "now");
  assert.equal(countdown(65_000), "1:05");
  assert.equal(countdown(2 * 3_600_000 + 5 * 60_000), "2h 05m");
});

test("the shop: prices in mint, what a loadout carries", () => {
  assert.equal(copsMint(COPS_TICKET_NAIRA), 0);
  assert.equal(copsMint(300_000), 200);
  // The database's caps: no item over 250 mint, and everything at most once fits under 500.
  for (const g of GEAR) assert.ok(copsMint(g.naira) <= 250, g.id);
  const all = GEAR.reduce((n, g) => n + copsMint(g.naira) * g.max, copsMint(COPS_TICKET_NAIRA));
  assert.ok(all <= 500, `everything costs ${all}`);
  assert.deepEqual(gunsOf({}), ["pistol"]);
  assert.deepEqual(gunsOf(PRACTICE_LOADOUT), ["rifle", "shotgun", "rocket", "pistol"]);
  assert.equal(loadoutNaira({ rifle: 1, grenade: 2 }), 60_000);
});
