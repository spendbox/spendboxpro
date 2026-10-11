// Tests for bridges, flyovers and railways along their real curves. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { auditSpans, chainLines, DECK, findJoins, LEVEL, piecesOf, placeStations, tilesUnder, type SpanLine } from "../spans.ts";

const straight = (len: number, kind: SpanLine["kind"] = "road", raised = true): SpanLine => ({
  kind,
  pts: [{ x: 0, z: 0 }, { x: len, z: 0 }],
  raised,
  overWater: () => false,
  major: false,
});

test("a long flyover rises off the road, runs level, and comes down again, with no steps", () => {
  const pieces = piecesOf(straight(10));
  assert.ok(pieces[0].ay < 0.1, "starts at road level");
  assert.ok(pieces[pieces.length - 1].by < 0.1, "ends at road level");
  assert.ok(Math.max(...pieces.map((p) => p.ay)) > DECK.land - 0.01, "reaches full height");
  for (let k = 1; k < pieces.length; k++) {
    assert.ok(Math.abs(pieces[k].ay - pieces[k - 1].by) < 1e-9, "joined");
    assert.ok(Math.abs(pieces[k].ax - pieces[k - 1].bx) < 1e-9 && Math.abs(pieces[k].az - pieces[k - 1].bz) < 1e-9);
  }
  // Ramps are gentle: no piece climbs more than about 1 in 1.5.
  for (const p of pieces) assert.ok(Math.abs(p.by - p.ay) / Math.hypot(p.bx - p.ax, p.bz - p.az) < 0.7);
});

test("piers stand only under the raised part, about a tile apart", () => {
  const pieces = piecesOf(straight(10));
  const piers = pieces.filter((p) => p.pier);
  assert.ok(piers.length >= 6 && piers.length <= 12, String(piers.length));
  assert.ok(piers.every((p) => p.ay > 0.3));
});

test("a short bridge only humps a little; a railway on the ground stays on the ground", () => {
  assert.ok(Math.max(...piecesOf(straight(1.2)).map((p) => p.ay)) < 0.25);
  const ground = piecesOf(straight(6, "rail", false));
  assert.ok(ground.every((p) => p.ground && p.ay < 0.1 && !p.pier));
});

test("pieces of one bridge split by the map are joined into one, whichever way they run", () => {
  const a = [{ x: 0, z: 0 }, { x: 3, z: 0 }];
  const b = [{ x: 6, z: 0 }, { x: 3, z: 0 }];
  const c = [{ x: 6, z: 0 }, { x: 9, z: 1 }];
  const chains = chainLines([a, b, c]);
  assert.equal(chains.length, 1);
  assert.equal(chains[0].length, 4);
  const ends = [chains[0][0], chains[0][3]].map((p) => p.x).sort((p, q) => p - q);
  assert.deepEqual(ends, [0, 9]);
});

test("the ground under a deck is known, edges included", () => {
  const under = new Set<string>();
  tilesUnder({ ...straight(4), major: true, pts: [{ x: 0, z: 0.4 }, { x: 4, z: 0.4 }] }, (x, z) => under.add(`${x},${z}`));
  assert.ok(under.has("2,0") && under.has("2,1"), [...under].join(" "));
});

test("a station stands on its railway, lined up with it", () => {
  const rail: SpanLine = { kind: "rail", pts: [{ x: 0, z: 0 }, { x: 10, z: 10 }], raised: true, overWater: () => false, major: false };
  const [st] = placeStations([{ name: "Test", x: 5, z: 4 }], [rail]);
  assert.ok(Math.abs(st.x - st.z) < 1e-9, "on the line");
  assert.ok(Math.abs(st.ry + Math.PI / 4) < 1e-9, "along it");
  assert.equal(placeStations([{ name: "Far", x: 50, z: 0 }], [rail]).length, 0);
});

test("where one bridge joins another, its deck stays up and meets it (no dip to the ground)", () => {
  const main: SpanLine = { ...straight(10), pts: [{ x: 0, z: 0 }, { x: 10, z: 0 }] };
  const branch: SpanLine = { ...straight(5), pts: [{ x: 5, z: 0.1 }, { x: 5, z: 5 }] };
  findJoins([main, branch]);
  assert.deepEqual(branch.joins, [true, false]);
  const pieces = piecesOf(branch);
  assert.ok(pieces[0].ay > DECK.land - 0.01, `starts up at ${pieces[0].ay}`);
  assert.ok(pieces[pieces.length - 1].by < 0.1, "comes down at its free end");
});

test("a deck on a higher level stands clear above one below it", () => {
  const low = piecesOf(straight(10));
  const high = piecesOf({ ...straight(10), layer: 2 });
  const top = (ps: typeof low) => Math.max(...ps.map((p) => p.ay));
  assert.ok(top(high) - top(low) >= LEVEL - 1e-9);
});

test("two carriageways that end side by side both come down (they don't hold each other up)", () => {
  const a: SpanLine = { ...straight(6), pts: [{ x: 0, z: 0 }, { x: 6, z: 0 }] };
  const b: SpanLine = { ...straight(6), pts: [{ x: 0, z: 0.25 }, { x: 6, z: 0.25 }] };
  findJoins([a, b]);
  assert.deepEqual(a.joins, [false, false]);
  for (const l of [a, b]) {
    const ps = piecesOf(l);
    assert.ok(ps[0].ay < 0.1 && ps[ps.length - 1].by < 0.1);
  }
  assert.deepEqual(auditSpans([a, b]), []);
});

test("a ramp up to a higher level meets it with no step", () => {
  const high: SpanLine = { ...straight(10), layer: 2 };
  const ramp: SpanLine = { ...straight(6), pts: [{ x: 5, z: 0.1 }, { x: 5, z: 6 }] };
  findJoins([high, ramp]);
  const ps = piecesOf(ramp);
  const top = piecesOf(high)[14].ay;
  assert.ok(Math.abs(ps[0].ay - top) < 0.05, `${ps[0].ay} vs ${top}`);
  assert.deepEqual(auditSpans([high, ramp]), []);
});

test("a short stub off a flyover still reaches the ground", () => {
  const main: SpanLine = { ...straight(10) };
  const stub: SpanLine = { ...straight(0.5), pts: [{ x: 5, z: 0.1 }, { x: 5, z: 0.6 }] };
  findJoins([main, stub]);
  const ps = piecesOf(stub);
  assert.ok(ps[ps.length - 1].by < 0.1, String(ps[ps.length - 1].by));
});

test("the checker catches a deck left hanging in mid-air", () => {
  const l: SpanLine = { ...straight(6), joins: [false, true] };
  const faults = auditSpans([l]);
  assert.equal(faults.length, 1);
  assert.equal(faults[0].what, "hanging");
});
