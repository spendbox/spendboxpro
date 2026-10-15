// Tests for the passport's places and pages. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { regionMap } from "../index.ts";
import { passportOf, STAMP_LOOKS } from "../passport.ts";

const map = regionMap("lagos")!;

test("The Lagos passport has real places, each on one area page, with unique ids", () => {
  const p = passportOf(map);
  assert.ok(p.places.length >= 40, `only ${p.places.length} places`);
  assert.equal(new Set(p.places.map((x) => x.id)).size, p.places.length);
  assert.ok(p.places.every((x) => x.name.length > 2 && x.look in STAMP_LOOKS));
  const onPages = p.areas.flatMap((a) => a.ids);
  assert.equal(onPages.length, p.places.length);
  assert.equal(p.areas[0].name, "Lagos Island");
  assert.ok(p.areas.length <= 8, `${p.areas.length} pages`);
});

test("Every landmark's ground stamps that landmark, and it's worked out once", () => {
  const p = passportOf(map);
  assert.equal(passportOf(map), p);
  for (const l of map.landmarks) {
    assert.equal(p.at(l.ax, l.az)?.id, `lm:${l.id}`);
    assert.equal(p.at(l.ax + l.w - 1, l.az + l.d - 1)?.id, `lm:${l.id}`);
  }
});
