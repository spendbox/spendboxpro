// Tests for searching the map by kind of place (docs/MAP_SEARCH.md). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import type { Tile } from "../../city/layout.ts";
import { regionMap } from "../index.ts";
import { toTile } from "../geo.ts";
import { PLACE_KINDS, QUICK_KINDS, distanceWords, findPlaces, kindsFor, wordMatches } from "../place-kinds.ts";

const map = regionMap("lagos")!;
const ids = (q: string) => kindsFor(q).map((k) => k.id);

test("what people type finds the kind of place", () => {
  assert.deepEqual(ids("club"), ["club"]);
  assert.deepEqual(ids("Clubs near me"), ["club"]);
  assert.deepEqual(ids("nightclub"), ["club"]);
  assert.deepEqual(ids("church"), ["church"]);
  assert.deepEqual(ids("churches"), ["church"]);
  assert.deepEqual(ids("mosque"), ["mosque"]);
  assert.deepEqual(ids("court"), ["court"]);
  assert.deepEqual(ids("airport"), ["airport"]);
  assert.deepEqual(ids("petrol station"), ["fuel"]);
  assert.deepEqual(ids("police station"), ["police"]);
  assert.deepEqual(ids("hospital"), ["hospital"]);
  assert.ok(ids("football").includes("stadium") && ids("football").includes("pitch"));
  assert.ok(ids("worship").includes("church") && ids("worship").includes("mosque"));
});

test("half a word and small slips still find it; names of places don't", () => {
  assert.deepEqual(ids("chur"), ["church"]);
  assert.deepEqual(ids("hospitl"), ["hospital"]);
  assert.deepEqual(ids("restaurnt"), ["restaurant"]);
  assert.deepEqual(ids("airprot"), ["airport"]);
  assert.deepEqual(ids("Ikeja"), []);
  assert.deepEqual(ids("Lekki"), []);
  assert.deepEqual(ids(""), []);
  assert.deepEqual(ids("near me"), []);
  assert.ok(wordMatches("clu", "club"));
  assert.ok(!wordMatches("cl", "club"));
});

test("every kind has a name, words and something on the map; the quick buttons are kinds", () => {
  for (const k of PLACE_KINDS) {
    assert.ok(k.label && k.plural && k.icon && k.words.length, k.id);
    assert.ok(k.tiles?.length || k.structures?.length || k.stations, k.id);
  }
  assert.equal(new Set(PLACE_KINDS.map((k) => k.id)).size, PLACE_KINDS.length);
  assert.ok(QUICK_KINDS.length >= 10 && QUICK_KINDS.every(Boolean));
});

test("the nearest places of a kind come first, from the streets round you and the whole city", () => {
  const ikeja = toTile(map.frame, { lat: 6.6018, lon: 3.3515 });
  // The city plan needs the app around it: a club every 9 tiles along x, everything else road.
  const tileOf = (x: number, z: number) => ({ kind: x % 9 === 0 && z % 9 === 0 ? "club" : "road", x, z }) as unknown as Tile;
  const clubs = findPlaces(map, tileOf, kindsFor("club"), ikeja.x, ikeja.z, 8);
  assert.equal(clubs.length, 8);
  for (let k = 1; k < clubs.length; k++) assert.ok(clubs[k - 1].dist <= clubs[k].dist);
  assert.ok(clubs[0].dist < 10, "one close by");
  assert.ok(clubs.every((c) => c.what === "Club" && c.name.length > 3));
  const airports = findPlaces(map, tileOf, kindsFor("airport"), ikeja.x, ikeja.z);
  assert.ok(airports.some((p) => /Murtala Muhammed/.test(p.name)), "the airport, from anywhere");
  const trains = findPlaces(map, tileOf, kindsFor("train"), ikeja.x, ikeja.z);
  assert.ok(trains.length > 0 && trains.every((p) => p.what === "Railway station"));
});

test("distances in words", () => {
  assert.equal(distanceWords(3), "300 m");
  assert.equal(distanceWords(12), "1.2 km");
  assert.equal(distanceWords(140), "14 km");
});
