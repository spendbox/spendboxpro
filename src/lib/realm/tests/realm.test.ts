// Tests for the Spirit Realm: prices, armies, the hourly clock and the battle. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { Battle, STEPS, arenaSeed, fightOut, type BattleArmy } from "../battle.ts";
import { MAX_SPEND, armyCost, cleanArmy, type Army } from "../fighters.ts";
import { BATTLE_SECS, HOUR_MS, canSettle, lastBattle, nextBattleAt } from "../schedule.ts";

const army = (fighters: Army["fighters"], weapons = 0, armour = 0): Army => ({ fighters, weapons, armour });
const side = (id: string, gate: number, a: Army): BattleArmy => ({ id, name: id, gate, army: a });

test("an army costs its fighters and its upgrades", () => {
  assert.equal(armyCost(army({ soldier: 10 })), 20);
  assert.equal(armyCost(army({ soldier: 10, angel: 2 }, 1, 2)), 20 + 24 + 25 + 75);
});

test("armies typed in are checked", () => {
  assert.equal(cleanArmy({ fighters: {} }), null, "empty");
  assert.equal(cleanArmy({ fighters: { soldier: -1 } }), null, "negative");
  assert.equal(cleanArmy({ fighters: { soldier: 101 } }), null, "too many of one kind");
  assert.equal(cleanArmy({ fighters: { dragon: 100 } }), null, `over ${MAX_SPEND}`);
  assert.equal(cleanArmy("nope"), null);
  const a = cleanArmy({ fighters: { soldier: 3.7, unicorn: 5 }, weapons: 9, armour: -2 });
  assert.deepEqual(a, { fighters: { soldier: 3 }, weapons: 3, armour: 0 }, "rounded down, unknown fighters dropped, levels kept in bounds");
});

test("a battle every hour on the hour", () => {
  const nine = Date.UTC(2026, 9, 16, 9, 0, 0);
  assert.equal(nextBattleAt(nine - 1), nine);
  assert.equal(nextBattleAt(nine), nine + HOUR_MS, "at 9:00 sharp the next one to join is 10:00");
  assert.deepEqual(lastBattle(nine + 1000), { at: nine, phase: "fighting" });
  assert.deepEqual(lastBattle(nine + BATTLE_SECS * 1000), { at: nine, phase: "results" });
  assert.equal(canSettle(nine, nine + 60_000), false);
  assert.equal(canSettle(nine, nine + BATTLE_SECS * 1000 + 60_000), true);
});

test("the same armies and seed always give the same battle", () => {
  const input = {
    seed: 12345,
    armies: [
      side("a", 0, army({ soldier: 40, archer: 20 }, 1)),
      side("b", 4, army({ ghost: 15, wolf: 10 })),
      side("c", 8, army({ angel: 6, devil: 4 }, 0, 2)),
      side("d", 8, army({ giant: 3 })),
    ],
  };
  const one = fightOut(input);
  const two = fightOut(structuredClone(input));
  assert.deepEqual(one, two);
  assert.equal(one.ranks.length, 4);
  // Played bit by bit (a phone, frame by frame) it ends the same.
  const b = new Battle(structuredClone(input));
  while (!b.done) b.runTo(b.step + 7);
  assert.deepEqual(b.ranking().map((i) => input.armies[i].id), one.ranks);
});

test("the armies meet in the middle and fight it out", () => {
  const b = new Battle({ seed: 7, armies: [side("a", 0, army({ soldier: 30 })), side("b", 6, army({ soldier: 34 }))] });
  const startGap = Math.abs(b.squads[0].y - b.squads[b.squads.length - 1].y);
  assert.ok(startGap > 150, "they start across the arena");
  b.runTo(STEPS);
  assert.ok(b.done);
  assert.ok(b.step < STEPS, "one side is wiped out before the time is up");
  assert.equal(b.armies.filter((a) => a.outAt === null).length, 1);
  assert.equal(b.ranking()[0], 1);
});

test("both wiped out at once: the one that joined first comes first", () => {
  const b = new Battle({ seed: 7, armies: [side("first", 0, army({ soldier: 30 })), side("second", 6, army({ soldier: 30 })), side("third", 3, army({ soldier: 1 }))] });
  b.armies[0].outAt = 9;
  b.armies[1].outAt = 9;
  b.armies[2].outAt = 4;
  assert.deepEqual(b.ranking(), [0, 1, 2]);
});

test("big armies march in several squads", () => {
  const b = new Battle({ seed: 1, armies: [side("a", 0, army({ soldier: 100, angel: 5 }))] });
  assert.equal(b.squads.length, 7, "100 soldiers in 6 squads, 5 angels in 1");
  assert.equal(b.squads.reduce((n, s) => n + Math.round(s.hp / s.unitHp), 0), 105);
});

test("a battle lasts long enough to watch", () => {
  const r = fightOut({ seed: 11, armies: [side("a", 0, army({ soldier: 40, archer: 20 })), side("b", 4, army({ ghost: 12, wolf: 10 })), side("c", 8, army({ angel: 6, devil: 4 }))] });
  assert.ok(r.steps * 0.25 > 40, `over after ${r.steps * 0.25} s`);
});

test("a much bigger army wins", () => {
  const r = fightOut({ seed: 99, armies: [side("small", 3, army({ soldier: 10 })), side("big", 9, army({ soldier: 60 }))] });
  assert.deepEqual(r.ranks, ["big", "small"]);
});

test("angels beat devils of the same price, and upgrades help", () => {
  const r = fightOut({ seed: 5, armies: [side("devils", 0, army({ devil: 10 })), side("angels", 6, army({ angel: 10 }))] });
  assert.equal(r.ranks[0], "angels");
  const u = fightOut({ seed: 5, armies: [side("plain", 0, army({ soldier: 50 })), side("armed", 6, army({ soldier: 50 }, 3, 3))] });
  assert.equal(u.ranks[0], "armed");
});

test("swords pass through ghosts", () => {
  const r = fightOut({ seed: 3, armies: [side("soldiers", 0, army({ soldier: 30 })), side("ghosts", 6, army({ ghost: 10 }))] });
  assert.equal(r.ranks[0], "ghosts", "₥60 of ghosts beats ₥60 of soldiers");
});

test("a full arena of 30 armies plays out quickly", () => {
  const kinds: Army["fighters"][] = [{ soldier: 60, archer: 30 }, { ghost: 20, wolf: 20 }, { angel: 10, devil: 8 }, { giant: 5, dragon: 2 }, { soldier: 20, ghost: 10, angel: 5, devil: 5, giant: 1, dragon: 1, wolf: 10, archer: 10 }];
  const armies = Array.from({ length: 30 }, (_, i) => side(`p${i}`, i % 12, army(kinds[i % kinds.length], i % 4, (i * 7) % 4)));
  const t = performance.now();
  const r = fightOut({ seed: arenaSeed(424242, 3), armies });
  const ms = performance.now() - t;
  assert.equal(new Set(r.ranks).size, 30);
  assert.ok(ms < 2000, `took ${Math.round(ms)} ms`);
});

test("an army on its own wins by default", () => {
  assert.deepEqual(fightOut({ seed: 1, armies: [side("solo", 2, army({ soldier: 1 }))] }).ranks, ["solo"]);
});
