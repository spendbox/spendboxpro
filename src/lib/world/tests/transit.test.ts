// Tests for the real map's trains and ferries. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { regionMap } from "../index.ts";
import { toTile } from "../geo.ts";
import { FERRY_ROUTES, JETTIES, pathOf, railRoutes, timetable, waterWay } from "../transit.ts";

const map = regionMap("lagos")!;

test("the Lagos railways join into a long route through the real stations", () => {
  const routes = railRoutes(map);
  assert.ok(routes.length >= 1);
  const longest = pathOf(routes[0]);
  assert.ok(longest.len > 300, `longest route only ${longest.len} tiles`);
  const stops = map.stations.filter((st) => routes[0].some((p) => Math.hypot(p.x - st.x, p.z - st.z) < 2));
  assert.ok(stops.length >= 4, `only ${stops.length} stations on it`);
});

test("ferries cross the lagoon over water only, and the timetable runs out and back", () => {
  const named = new Map(JETTIES.map((j) => [j.name, toTile(map.frame, { lat: j.lat, lon: j.lon })]));
  let found = 0;
  for (const [a, b] of FERRY_ROUTES) {
    const way = waterWay(map, named.get(a)!, named.get(b)!);
    if (!way) continue;
    found++;
    // Every point (smoothed) is on or right beside open water.
    for (const p of way) {
      const wet = [0, 1, -1].some((dx) => [0, 1, -1].some((dz) => map.waterAt(Math.round(p.x) + dx, Math.round(p.z) + dz) > 0));
      assert.ok(wet, `${a}–${b} crosses land at ${p.x},${p.z}`);
    }
    const path = pathOf(way);
    const { legs, period } = timetable(path, [], 1, 10, 10);
    assert.equal(legs[0].s0, 0);
    assert.equal(legs[legs.length - 1].s1, 0);
    assert.ok(Math.abs(Math.max(...legs.map((l) => l.s1)) - path.len) < 1e-6);
    assert.ok(period > 0);
  }
  assert.ok(found >= 3, `only ${found} ferry routes`);
});
