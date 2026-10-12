// Tests for Explore's places. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import type { Tile } from "../../city/layout.ts";
import { regionMap } from "../index.ts";
import { explorePlaces, GROUPS } from "../explore.ts";
import { toTile } from "../geo.ts";

const map = regionMap("lagos")!;
// The city plan needs the app around it: the everyday places are left out here (all tiles are roads).
const road = (x: number, z: number) => ({ kind: "road", x, z }) as unknown as Tile;

test("Explore finds places in Lagos in every kind of group, nearest first, with real names", () => {
  const ikeja = toTile(map.frame, { lat: 6.6018, lon: 3.3515 });
  const list = explorePlaces(map, road, ikeja.x, ikeja.z);
  const groups = new Set(list.map((p) => p.group));
  for (const g of ["parks", "shopping", "culture", "sport", "travel"]) assert.ok(groups.has(g as never), `no ${g}`);
  assert.ok(list.every((p) => GROUPS.some((g) => g.id === p.group)));
  assert.ok(list.every((p) => p.name.length > 2 && !p.name.includes("undefined")));
  for (let k = 1; k < list.length; k++) assert.ok(list[k - 1].dist <= list[k].dist);
  assert.ok(list.some((p) => /Murtala Muhammed/.test(p.name)), "the airport");
  assert.equal(new Set(list.map((p) => p.id)).size, list.length);
});
