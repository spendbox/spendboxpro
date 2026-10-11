// Tests for owned properties surviving map updates. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import type { Tile } from "../../city/layout.ts";
import { buildingFor } from "../buildings.ts";
import { checkOwned, cleanPropertyName, ownedSpot, type OwnedProperty } from "../owned.ts";

const lot = (x: number, z: number): Tile => ({ i: 0, x, z, kind: "house", top: 1, r: [0, 0, 0, 0] });
const own = (x: number, z: number, name?: string): OwnedProperty => ({ id: `lagos:${x},${z}`, building: buildingFor("lagos", lot(x, z), 0.2, 1)!, name });

test("an owned property's id says where it stands", () => {
  assert.deepEqual(ownedSpot("lagos:12,-40"), { region: "lagos", x: 12, z: -40 });
  assert.equal(ownedSpot("nonsense"), null);
});

test("owners' names are tidied and kept sensible", () => {
  assert.equal(cleanPropertyName("  Ada's   Place "), "Ada's Place");
  assert.equal(cleanPropertyName("Mama Put & Sons (Yaba)"), "Mama Put & Sons (Yaba)");
  assert.equal(cleanPropertyName("x"), null);
  assert.equal(cleanPropertyName("a".repeat(41)), null);
  assert.equal(cleanPropertyName("<script>"), null);
});

test("a safe map update reports nothing", () => {
  const owned = [own(1, 1), own(2, 2)];
  assert.deepEqual(checkOwned(owned, (x, z) => owned.find((o) => o.id === `lagos:${x},${z}`)!.building), []);
});

test("an update that would put a road, water or a bridge on an owned property is caught", () => {
  const owned = [own(1, 1, "Ada's Place"), own(2, 2), own(3, 3)];
  const now = (x: number): "road" | "water" | "deck" => (x === 1 ? "road" : x === 2 ? "water" : "deck");
  const found = checkOwned(owned, now);
  assert.equal(found.length, 3);
  assert.equal(found[0].name, "Ada's Place");
  assert.match(found[0].problem, /road/);
  assert.match(found[2].problem, /bridge or railway/);
});
