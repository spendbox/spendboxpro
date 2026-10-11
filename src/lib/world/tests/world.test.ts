// Tests for the real-world map: coordinates, baked grids, corrections, landmarks. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { compileRegion, fillArea, line4 } from "../compile.ts";
import { toLatLon, toTile, tileBounds, worldOffset } from "../geo.ts";
import type { Region } from "../region.ts";
import { LAGOS } from "../regions/lagos/index.ts";

const frame = { origin: { lat: 6.5, lon: 3.4 } };

test("a tile is 100 m: 1 km east is 10 tiles, 1 km north is -10", () => {
  const east = toTile(frame, { lat: 6.5, lon: 3.4 + 1000 / (111_320 * Math.cos((6.5 * Math.PI) / 180)) });
  assert.ok(Math.abs(east.x - 10) < 1e-9 && Math.abs(east.z) < 1e-9);
  const north = toTile(frame, { lat: 6.5 + 1000 / 111_320, lon: 3.4 });
  assert.ok(Math.abs(north.z + 10) < 1e-9);
});

test("tiles and latitude/longitude convert both ways", () => {
  const p = toLatLon(frame, 123.4, -56.7);
  const t = toTile(frame, p);
  assert.ok(Math.abs(t.x - 123.4) < 1e-6 && Math.abs(t.z + 56.7) < 1e-6);
});

test("Lagos covers about 45 × 25 km and sits at its place on the world map", () => {
  const map = compileRegion(LAGOS);
  const w = map.bounds.x1 - map.bounds.x0 + 1;
  const h = map.bounds.z1 - map.bounds.z0 + 1;
  assert.ok(w >= 440 && w <= 460, `width ${w}`);
  assert.ok(h >= 245 && h <= 255, `height ${h}`);
  const o = worldOffset(map.frame);
  // About 3.4° east and 6.5° north of where the equator meets Greenwich (north is -z).
  assert.ok(o.x > 3700 && o.x < 3850 && o.z < -7150 && o.z > -7300, JSON.stringify(o));
});

test("every Lagos landmark is placed (none outside, none overlapping)", () => {
  const map = compileRegion(LAGOS);
  assert.deepEqual(map.skipped, []);
  const ids = new Set(LAGOS.landmarks.map((l) => l.id));
  assert.equal(ids.size, LAGOS.landmarks.length, "landmark ids are unique");
});

test("a road drawn between two points is always joined up side by side", () => {
  const seen: [number, number][] = [];
  line4(0.2, 0.1, 17.6, -9.3, (x, z) => seen.push([x, z]));
  assert.deepEqual(seen[0], [0, 0]);
  assert.deepEqual(seen.at(-1), [18, -9]);
  for (let k = 1; k < seen.length; k++) {
    const d = Math.abs(seen[k][0] - seen[k - 1][0]) + Math.abs(seen[k][1] - seen[k - 1][1]);
    assert.equal(d, 1, `step ${k} jumps`);
  }
});

test("an area fills the tiles whose middles are inside it", () => {
  const got = new Set<string>();
  fillArea([{ x: -0.5, z: -0.5 }, { x: 2.5, z: -0.5 }, { x: 2.5, z: 1.5 }, { x: -0.5, z: 1.5 }], (x, z) => got.add(`${x},${z}`));
  assert.equal(got.size, 6);
  assert.ok(got.has("0,0") && got.has("2,1") && !got.has("3,0"));
});

/** A small made-up region round (0°, 0°) for the tests below. */
function tiny(extra: Partial<Region> = {}): Region {
  const d = 0.0045; // about 500 m: the region is about 11 × 11 tiles
  return {
    id: "tiny",
    name: "Tiny",
    flavor: "ng",
    seed: 1,
    box: { south: -d, west: -d, north: d, east: d },
    start: { lat: 0, lon: 0 },
    landmarks: [],
    districts: [],
    water: null,
    roadGrid: null,
    roads: [],
    found: {},
    corrections: [],
    ...extra,
  };
}

test("baked water and roads are read from their rows", () => {
  const map = compileRegion(
    tiny({
      water: { x0: -5, z0: -5, rows: ["L3W2S1", "", "S11"] },
      roadGrid: { x0: -5, z0: -5, rows: ["N1A2", "N4c1"] },
    }),
  );
  assert.equal(map.waterAt(-5, -5), 0);
  assert.equal(map.waterAt(-2, -5), 1);
  assert.equal(map.waterAt(0, -5), 2);
  assert.equal(map.waterAt(0, -4), 0);
  assert.equal(map.waterAt(5, -3), 2);
  assert.equal(map.roadAt(-4, -5)?.kind, "motorway");
  assert.deepEqual(map.roadAt(-1, -4), { kind: "primary", bridge: true });
  assert.equal(map.roadAt(-5, -5), undefined);
});

test("corrections change only the tiles they cover, in order", () => {
  const box = (s: number, w: number, n: number, e: number): [number, number][] => [[n, w], [n, e], [s, e], [s, w]];
  const t = 0.0009; // one tile in degrees, near enough
  const map = compileRegion(
    tiny({
      water: { x0: -5, z0: -5, rows: Array.from({ length: 11 }, () => "W11") },
      corrections: [
        { kind: "land", area: box(-t * 1.4, -t * 1.4, t * 1.4, t * 1.4) },
        { kind: "sea", area: box(-t * 0.4, -t * 0.4, t * 0.4, t * 0.4) },
        { kind: "road", road: { id: "r", name: "Test Road", kind: "trunk", path: [[0, -t * 4], [0, t * 4]] } },
        { kind: "no-road", area: box(-t * 0.4, t * 2.6, t * 0.4, t * 3.4) },
      ],
    }),
  );
  assert.equal(map.waterAt(0, 0), 2, "sea painted last wins");
  assert.equal(map.waterAt(1, 1), 0, "land round it");
  assert.equal(map.waterAt(3, 3), 1, "untouched water stays");
  assert.equal(map.roadAt(-2, 0)?.name, "Test Road");
  assert.equal(map.roadAt(3, 0), undefined, "road taken out there");
  assert.equal(map.roadAt(4, 0)?.kind, "trunk");
});

test("landmarks: found ones move, overlapping ones are left out and reported", () => {
  const map = compileRegion(
    tiny({
      landmarks: [
        { id: "a", name: "A", type: "museum", at: { lat: 0, lon: 0 }, approx: true },
        { id: "b", name: "B", type: "hotel", at: { lat: 0, lon: 0 } },
        { id: "c", name: "C", type: "club", at: { lat: 0.0027, lon: 0.0027 } },
      ],
      found: { a: { lat: -0.0027, lon: -0.0027 } },
    }),
  );
  const a = map.landmarks.find((l) => l.id === "a")!;
  assert.deepEqual([a.ax, a.az], [-4, 3]);
  assert.ok(map.landmarks.some((l) => l.id === "b"), "B fits once A has moved");
  assert.equal(map.spotAt(3, -3)?.name, "C");
  const clash = compileRegion(tiny({ landmarks: [{ id: "x", name: "X", type: "hotel", at: { lat: 0, lon: 0 } }, { id: "y", name: "Y", type: "hotel", at: { lat: 0, lon: 0 } }] }));
  assert.deepEqual(clash.skipped, [{ id: "y", reason: "overlaps another landmark" }]);
});

test("tile bounds round outwards to whole tiles", () => {
  const b = tileBounds(frame, { south: 6.49, west: 3.39, north: 6.51, east: 3.41 });
  assert.ok(b.x0 < 0 && b.x1 > 0 && b.z0 < 0 && b.z1 > 0);
  assert.equal(b.x0, -b.x1);
});
