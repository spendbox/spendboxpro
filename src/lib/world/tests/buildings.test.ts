// Tests for buildings and their values on the real map. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import type { Tile } from "../../city/layout.ts";
import { buildingFor, buildingTop, wealthOf, type Building } from "../buildings.ts";
import { compileRegion } from "../compile.ts";
import { toTile } from "../geo.ts";
import { LAGOS } from "../regions/lagos/index.ts";
import { toMint, valueOf } from "../value.ts";

const lot = (x: number, z: number, kind: Tile["kind"]): Tile => ({ i: 0, x, z, kind, top: 1, r: [0, 0, 0, 0] });

/** Many buildings of one kind of lot, for checking the mix. */
function sample(kind: Tile["kind"], density: number, n = 3000) {
  const out: Building[] = [];
  for (let k = 0; k < n; k++) {
    const b = buildingFor("lagos", lot(k % 97, Math.floor(k / 97), kind), density, LAGOS.seed);
    if (b) out.push(b);
  }
  return out;
}

test("the same tile is always the same building, with a permanent id", () => {
  const a = buildingFor("lagos", lot(12, -40, "house"), 0.2, LAGOS.seed)!;
  const b = buildingFor("lagos", lot(12, -40, "house"), 0.2, LAGOS.seed)!;
  assert.deepEqual(a, b);
  assert.equal(a.id, "lagos:12,-40");
  assert.ok(a.units.every((u, k) => u.id === `lagos:12,-40/${k}`));
});

test("streets, parks and landmarks aren't properties", () => {
  for (const kind of ["road", "park", "plaza", "school", "worship", "structure"] as const) assert.equal(buildingFor("lagos", lot(1, 1, kind), 0.3, 1), null);
});

test("quiet streets, busy streets and the centre each get many kinds, and some unfinished", () => {
  for (const [kind, density, min] of [["house", 0.15, 7], ["office", 0.4, 7], ["tower", 1, 3]] as const) {
    const list = sample(kind, density);
    const kinds = new Set(list.map((b) => b.kind));
    assert.ok(kinds.size >= min, `${kind}: ${[...kinds].join(", ")}`);
    const unfinished = list.filter((b) => b.state === "uncompleted").length / list.length;
    assert.ok(unfinished > 0.02 && unfinished < 0.2, `${kind}: ${unfinished} unfinished`);
  }
  assert.ok(sample("house", 0.02).some((b) => b.kind === "farm"), "farmland at the edges");
});

test("every building has units, and taller ones stand taller", () => {
  for (const b of [...sample("house", 0.15, 500), ...sample("office", 0.4, 500), ...sample("tower", 1, 500)]) {
    assert.ok(b.units.length >= 1, b.kind);
    assert.ok(b.units.every((u) => u.area > 0));
    assert.ok(buildingTop(b) > 0);
  }
  const towers = sample("tower", 1, 300).filter((b) => b.state === "built");
  const homes = sample("house", 0.15, 300).filter((b) => b.state === "built" && b.kind === "bungalow");
  assert.ok(Math.min(...towers.map(buildingTop)) > Math.max(...homes.map(buildingTop)));
});

test("a building's units add up to the whole, and land plus building make the total", () => {
  for (const b of sample("office", 0.4, 300)) {
    const v = valueOf(b, 150_000, LAGOS.prices);
    assert.ok(Math.abs(v.units.reduce((t, u) => t + u, 0) - v.total) < 1);
    assert.ok(Math.abs(v.land + v.building - v.total) < 1e-6);
  }
});

test("Lagos land: Ikoyi costs far more than Ajegunle, and prices are realistic", () => {
  const map = compileRegion(LAGOS);
  const at = (lat: number, lon: number) => {
    const t = toTile(map.frame, { lat, lon });
    return map.landPriceAt(Math.round(t.x), Math.round(t.z));
  };
  const ikoyi = at(6.452, 3.435);
  const ajegunle = at(6.46, 3.333);
  assert.ok(ikoyi > ajegunle * 8, `${ikoyi} vs ${ajegunle}`);
  // A standard plot in Ikoyi: hundreds of millions of naira; in Ajegunle: tens of millions.
  assert.ok(ikoyi * 648 > 300e6 && ikoyi * 648 < 1.5e9, String(ikoyi * 648));
  assert.ok(ajegunle * 648 > 10e6 && ajegunle * 648 < 60e6, String(ajegunle * 648));
});

test("an unfinished building is worth less than a finished one on the same land", () => {
  const b = sample("office", 0.4, 400).find((x) => x.kind === "flats")!;
  const done = valueOf({ ...b, state: "built" }, 150_000, LAGOS.prices).total;
  const left = valueOf({ ...b, state: "uncompleted" }, 150_000, LAGOS.prices).total;
  assert.ok(left < done && left > b.plot * 150_000);
  assert.ok(toMint(done, LAGOS.prices) > 0);
});

test("rich areas have no rooming houses; poor areas have plenty", () => {
  const count = (wealth: number) => {
    let rooming = 0;
    for (let k = 0; k < 3000; k++) if (buildingFor("lagos", lot(k % 97, Math.floor(k / 97), "house"), 0.15, LAGOS.seed, wealth)?.kind === "rooming") rooming++;
    return rooming;
  };
  assert.equal(count(1), 0);
  assert.ok(count(0) > 300, String(count(0)));
  assert.ok(wealthOf(1_100_000) > 0.9 && wealthOf(35_000) < 0.1);
});

test("a tapped property shows its units, each with a value, adding up to the whole", async () => {
  const { propertyInfo } = await import("../property.ts");
  const map = compileRegion(LAGOS);
  const b = sample("office", 0.4, 200).find((x) => x.units.length > 3 && x.state === "built")!;
  const info = propertyInfo(b, 0, 0, "1 Test Street", map);
  assert.equal(info.units.length, b.units.length);
  const sum = info.units.reduce((t, u) => t + u.mint, 0);
  assert.ok(Math.abs(sum - info.mint) <= info.units.length, `${sum} vs ${info.mint}`);
  assert.ok(info.units.every((u) => u.earns.length > 0 && u.local.startsWith("₦")));
});
