// Tests for marks on the map. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanMarkText, dayCost, graffiti, MARK_MAX, markKind, marksAllowed, markSpot, personalInfo, website, type SpotLook } from "../marks.ts";

test("contact details are kept off the map, everything else is up to the players", () => {
  assert.equal(personalInfo("call me 0803 123 4567"), "a phone number");
  assert.equal(personalInfo("+234-803-123-4567"), "a phone number");
  assert.equal(personalInfo("mail me at ade@example.com"), "an email address");
  assert.equal(personalInfo("Yaba boys run this street 2026"), null);
  assert.equal(personalInfo("Number 12 Allen Avenue"), null);
  assert.equal(cleanMarkText("  hello\n   world  "), "hello world");
});

test("paid marks stand for days, and a day of chipping in costs a thirtieth of the price", () => {
  assert.equal(markKind("bench")!.days, 30);
  assert.equal(markKind("tree")!.days, 0);
  assert.equal(markKind("writing")!.price, 0);
  assert.equal(dayCost("statue"), Math.round(500_000 / 30));
  assert.equal(dayCost("writing"), 500);
});

test("writing is a short sentence with no websites", () => {
  assert.equal(cleanMarkText("a".repeat(300)).length, MARK_MAX);
  assert.equal(website("visit www.mysite.ng"), "a website");
  assert.equal(website("go to https://x.y"), "a website");
  assert.equal(website("best jollof at mama.com"), "a website");
  assert.equal(website("mama dot com"), "a website");
  assert.equal(website("follow @yababoy"), "a social media handle");
  assert.equal(website("I went home. Me and you forever"), null);
  assert.equal(website("Yaba boys run this street"), null);
  assert.equal(graffiti("bubble"), "bubble");
  assert.equal(graffiti("nonsense"), "spray");
});

test("marks you can have up: none under 20 reputation, then one more for every 50", () => {
  assert.equal(marksAllowed(0), 0);
  assert.equal(marksAllowed(19), 0);
  assert.equal(marksAllowed(20), 1);
  assert.equal(marksAllowed(49), 1);
  assert.equal(marksAllowed(50), 2);
  assert.equal(marksAllowed(120), 3);
});

test("trees, statues and fountains stay off roads and water; writing goes on any wall", () => {
  const land = (tile: SpotLook["tile"]): SpotLook => ({ water: false, road: tile === "road", kept: false, landmark: false, tile });
  // A road with a park two tiles east.
  const look = (x: number, z: number): SpotLook | null => (x === 2 && z === 0 ? land("park") : x === 0 && z === 5 ? { ...land("house"), water: true } : land("road"));
  assert.deepEqual(markSpot("tree", 0, 0, look), { x: 2, z: 0, adopt: true });
  assert.deepEqual(markSpot("writing", 0, 0, look), { x: 0, z: 0, adopt: false });
  assert.equal(markSpot("fountain", 10, 10, look), null);
  assert.equal(markSpot("writing", 0, 5, (x, z) => (x === 0 && z === 5 ? { ...land("house"), water: true } : null)), null);
});
