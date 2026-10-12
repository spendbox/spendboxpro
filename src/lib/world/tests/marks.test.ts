// Tests for marks on the map. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanMarkText, dayCost, markKind, personalInfo } from "../marks.ts";

test("contact details are kept off the map, everything else is up to the players", () => {
  assert.equal(personalInfo("call me 0803 123 4567"), "a phone number");
  assert.equal(personalInfo("+234-803-123-4567"), "a phone number");
  assert.equal(personalInfo("mail me at ade@example.com"), "an email address");
  assert.equal(personalInfo("Yaba boys run this street 2026"), null);
  assert.equal(personalInfo("Number 12 Allen Avenue"), null);
  assert.equal(cleanMarkText("  hello\n   world  "), "hello world");
});

test("paid marks stand for days, and a day of chipping in costs a thirtieth of the price", () => {
  assert.equal(markKind("tree")!.days, 30);
  assert.equal(markKind("writing")!.price, 0);
  assert.equal(dayCost("statue"), Math.round(500_000 / 30));
  assert.equal(dayCost("writing"), 500);
});
