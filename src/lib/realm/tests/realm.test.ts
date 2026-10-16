// Tests for the Spirit Realm: prices, armies, the hourly clock and the battle. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { Battle, STEPS, arenaSeed, fightOut, inArena, type BattleArmy, type Wave } from "../battle.ts";
import { MAX_SPEND, armyCost, cleanArmy, type Army } from "../fighters.ts";
import { BATTLE_SECS, CLOSE_SECS, HOUR_MS, battleAt, battleEnd, canSend, canSettle } from "../schedule.ts";

const troops = (fighters: Army["fighters"], weapons = 0, armour = 0): Army => ({ fighters, weapons, armour });
const players = (n: number): BattleArmy[] => Array.from({ length: n }, (_, i) => ({ id: String(i), name: `p${i}` }));
const wave = (by: number, step: number, x: number, y: number, t: Army, n = 0): Wave => ({ by, n, step, x, y, troops: t });
const secs = (s: number) => Math.round(s / 0.25);

test("an army costs its fighters and its upgrades", () => {
  assert.equal(armyCost(troops({ soldier: 10 })), 20);
  assert.equal(armyCost(troops({ soldier: 10, angel: 2 }, 1, 2)), 20 + 24 + 25 + 75);
});

test("troops typed in are checked", () => {
  assert.equal(cleanArmy({ fighters: {} }), null, "empty");
  assert.equal(cleanArmy({ fighters: { soldier: -1 } }), null, "negative");
  assert.equal(cleanArmy({ fighters: { soldier: 101 } }), null, "too many of one kind");
  assert.equal(cleanArmy({ fighters: { dragon: 100 } }), null, `over ${MAX_SPEND}`);
  assert.equal(cleanArmy("nope"), null);
  const a = cleanArmy({ fighters: { soldier: 3.7, unicorn: 5 }, weapons: 9, armour: -2 });
  assert.deepEqual(a, { fighters: { soldier: 3 }, weapons: 3, armour: 0 }, "rounded down, unknown fighters dropped, levels kept in bounds");
});

test("a battle every hour, lasting the hour", () => {
  const nine = Date.UTC(2026, 9, 16, 9, 0, 0);
  assert.equal(BATTLE_SECS, 3600);
  assert.equal(battleAt(nine + 25 * 60_000), nine);
  assert.equal(battleEnd(nine), nine + HOUR_MS);
  assert.equal(canSend(nine, nine + 1000), true);
  assert.equal(canSend(nine, nine + HOUR_MS - CLOSE_SECS * 1000 + 1), false, "closed near the end");
  assert.equal(canSend(nine, nine - 1), false, "not before it begins");
  assert.equal(canSettle(nine, nine + HOUR_MS - 1), false);
  assert.equal(canSettle(nine, nine + HOUR_MS + 60_000), true);
});

test("the arena is a circle", () => {
  assert.equal(inArena(0, 0), true);
  assert.equal(inArena(70, 70), true);
  assert.equal(inArena(80, 80), false);
});

const sample = () => ({
  seed: 12345,
  armies: players(4),
  waves: [
    wave(0, secs(30), 0, -90, troops({ soldier: 40, archer: 20 }, 1)),
    wave(1, secs(40), 80, 30, troops({ ghost: 15, wolf: 10 })),
    wave(2, secs(60), -70, 40, troops({ angel: 6, devil: 4 }, 0, 2)),
    wave(3, secs(90), 10, 85, troops({ giant: 3 })),
    wave(0, secs(400), 50, -60, troops({ dragon: 2 }), 1),
  ],
});

test("the same armies, waves and seed always give the same battle", () => {
  const one = fightOut(sample());
  const two = fightOut(structuredClone(sample()));
  assert.deepEqual(one, two);
  assert.equal(one.steps, STEPS, "it lasts the whole hour");
  assert.equal(one.ranks.length, 4, "the wild spirits aren't ranked");
  // Played bit by bit (a phone, frame by frame) it ends the same.
  const b = new Battle(sample());
  while (!b.done) b.runTo(b.step + 37);
  assert.deepEqual(b.ranking().map((i) => b.armies[i].id), one.ranks);
});

test("troops heard of later come through the same as if known from the start", () => {
  const all = sample();
  const late = { ...sample(), waves: sample().waves.slice(0, 3) };
  const b = new Battle(late);
  b.runTo(secs(80));
  assert.equal(b.addWave(all.waves[3]), true);
  assert.equal(b.addWave(all.waves[4]), true);
  b.runTo(STEPS);
  assert.deepEqual(b.ranking().map((i) => b.armies[i].id), fightOut(all).ranks);
  const past = new Battle(sample());
  past.runTo(secs(100));
  assert.equal(past.addWave(wave(1, secs(50), 0, 0, troops({ soldier: 1 }), 5)), false, "one that should already be here: start again");
});

test("troops come through their portal and march on the middle", () => {
  const b = new Battle({ seed: 7, armies: players(1), waves: [wave(0, 40, 0, -90, troops({ soldier: 30 }))] });
  b.runTo(40);
  assert.equal(b.squads.filter((s) => s.army === 1).length, 0, "not yet");
  b.runTo(41);
  const mine = b.squads.filter((s) => s.army === 1);
  assert.ok(mine.length > 0 && mine.every((s) => s.y < -80), "at the portal");
  b.runTo(secs(25));
  assert.ok(b.squads.filter((s) => s.army === 1 && s.hp > 0).some((s) => s.y > -60), "on their way in");
});

test("wild spirits roam in and can be fought for points", () => {
  const b = new Battle({ seed: 3, armies: players(1), waves: [wave(0, 1, 0, 0, troops({ soldier: 100, archer: 60 }, 2, 2))] });
  b.runTo(secs(300));
  assert.ok(b.armies[0].sent > 0, "the wild spirits came");
  assert.ok(b.armies[1].points > 0, "and scored points for whoever beat them");
});

test("bringing down more enemies wins", () => {
  const r = fightOut({ seed: 99, armies: players(2), waves: [wave(0, 4, -40, 0, troops({ soldier: 10 })), wave(1, 4, 40, 0, troops({ soldier: 80, archer: 30 }, 2, 1))] });
  assert.equal(r.ranks[0], "1");
  assert.ok(r.points["1"] > r.points["0"]);
});

test("angels beat devils, and swords pass through ghosts", () => {
  const a = new Battle({ seed: 5, armies: players(2), waves: [wave(0, 1, 0, -30, troops({ devil: 10 })), wave(1, 1, 0, 30, troops({ angel: 10 }))] });
  a.runTo(116); // before the first wild spirits come in
  assert.ok(a.armies[2].now > a.armies[1].now, "angels left standing");
  const g = new Battle({ seed: 5, armies: players(2), waves: [wave(0, 1, 0, -30, troops({ soldier: 30 })), wave(1, 1, 0, 30, troops({ ghost: 10 }))] });
  g.runTo(116);
  assert.ok(g.armies[2].now > g.armies[1].now, "₥60 of ghosts beats ₥60 of soldiers");
});

test("a full arena for a whole hour works out quickly", () => {
  const kinds: Army["fighters"][] = [{ soldier: 60, archer: 30 }, { ghost: 20, wolf: 20 }, { angel: 10, devil: 8 }, { giant: 5, dragon: 2 }, { soldier: 20, ghost: 10, angel: 5, devil: 5, giant: 1, dragon: 1, wolf: 10, archer: 10 }];
  const spots = [[0, -90], [90, 0], [0, 90], [-90, 0], [60, 60], [-60, -60]];
  const waves: Wave[] = [];
  for (let p = 0; p < 20; p++) {
    for (let k = 0; k < 8; k++) {
      const [x, y] = spots[(p + k) % spots.length];
      waves.push(wave(p, secs(30 + k * 420 + p * 7), x, y, troops(kinds[(p + k) % kinds.length], k % 4, p % 4), k));
    }
  }
  const t = performance.now();
  const r = fightOut({ seed: arenaSeed(424242, 3), armies: players(20), waves });
  const ms = performance.now() - t;
  assert.equal(new Set(r.ranks).size, 20);
  assert.ok(ms < 15_000, `took ${Math.round(ms)} ms`);
  console.log(`a full arena, 160 waves, one hour: ${Math.round(ms)} ms`);
});
