// Tests for shared tiles: the property at the front, little houses round it (docs/PLOTS.md). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import type { Building } from "../buildings.ts";
import { MAX_FILLERS, plotLayout, sharesTile } from "../../city/plots.ts";

const home = (kind: Building["kind"], extra: Partial<Building> = {}) =>
  ({ id: "lagos:1,2", kind, state: "built", storeys: 1, plot: 600, units: [], look: [0.1, 0.2, 0.3, 0.4, 0.5], face: 0, ...extra }) as unknown as Building;

test("low-rise homes and shops share their tile; towers, offices and estates don't", () => {
  for (const k of ["bungalow", "duplex", "rooming", "terrace", "shops", "mixed", "land"] as const) assert.ok(sharesTile(home(k)), k);
  assert.ok(sharesTile(home("flats", { storeys: 4 })));
  assert.ok(!sharesTile(home("flats", { storeys: 6 })), "a block grown taller fills its tile");
  for (const k of ["apartments", "glass", "offices", "plaza", "warehouse", "farm"] as const) assert.equal(plotLayout(home(k), 3, 4), null, k);
  const estate = { estate: { id: "e", name: "E", walls: [false, false, false, false], gate: false } } as unknown as Partial<Building>;
  assert.equal(plotLayout(home("bungalow", estate), 3, 4), null);
});

test("the same tile always splits the same way", () => {
  assert.deepEqual(plotLayout(home("bungalow"), 12, -40, 0.4), plotLayout(home("bungalow"), 12, -40, 0.4));
});

test("the property is at the front, and the little houses stay inside the tile, off its plot", () => {
  let total = 0;
  for (let x = -60; x < 60; x += 3) {
    for (let z = -60; z < 60; z += 7) {
      for (const wealth of [0, 0.5, 1]) {
        const p = plotLayout(home(x % 2 ? "duplex" : "rooming"), x, z, wealth)!;
        const half = 0.45 * p.main.s;
        assert.ok(p.main.z + half <= 0.5 && p.main.z > 0, "on the street side");
        assert.ok(Math.abs(p.main.x) + half <= 0.5);
        assert.ok(p.fillers.length <= MAX_FILLERS);
        total += p.fillers.length;
        for (const f of p.fillers) {
          const m = Math.min(f.w, f.d) / 2;
          assert.ok(Math.abs(f.x) + m <= 0.5 && Math.abs(f.z) + m <= 0.5, "inside the tile");
          assert.ok(f.w > 0 && f.d > 0);
          // Not on the property's plot.
          assert.ok(Math.abs(f.x - p.main.x) >= half + m || Math.abs(f.z - p.main.z) >= half + m, "clear of the property");
        }
      }
    }
  }
  assert.ok(total > 1000, "plenty of neighbours");
});
