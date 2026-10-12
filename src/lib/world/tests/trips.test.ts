// Tests for getting about the real map: by road where land and bridges join up, by ferry where
// they don't. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { toTile } from "../geo.ts";
import { regionMap } from "../index.ts";
import { ferryKmBetween } from "../trips.ts";

const map = regionMap("lagos")!;
const at = (lat: number, lon: number) => {
  const p = toTile(map.frame, { lat, lon });
  return `lagos:${Math.round(p.x)},${Math.round(p.z)}`;
};

test("the mainland, the islands with bridges, and Lekki are all reached by road", () => {
  const yaba = at(6.5095, 3.3711);
  assert.equal(ferryKmBetween(yaba, at(6.451, 3.435)), 0, "Ikoyi, over Third Mainland Bridge");
  assert.equal(ferryKmBetween(yaba, at(6.4281, 3.4219)), 0, "Victoria Island");
  assert.equal(ferryKmBetween(at(6.6018, 3.3515), at(6.44, 3.48)), 0, "Ikeja to Lekki");
});

test("an island with no bridge needs a ferry", () => {
  // Every spot round the region that needs a boat from Yaba is over water from it.
  const yaba = at(6.5095, 3.3711);
  let found = 0;
  for (let x = map.bounds.x0; x <= map.bounds.x1 && !found; x += 4) {
    for (let z = map.bounds.z0; z <= map.bounds.z1; z += 4) {
      if (map.waterAt(x, z)) continue;
      if (ferryKmBetween(yaba, `lagos:${x},${z}`) > 0) {
        found++;
        break;
      }
    }
  }
  assert.ok(found > 0, "Lagos has islands only boats reach (Ilashe, Ibese...)");
});
