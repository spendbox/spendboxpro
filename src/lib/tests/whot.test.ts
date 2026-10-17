// Tests for Whot!'s rules as the server runs them (src/app/play/games/whot-actions.ts). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { hideFor, rules, type M } from "../whot.ts";

test("Whot!: each seat sees only its own hand; the others' cards, the market and the seed are hidden", () => {
  const s = rules.init(12345, 3, {});
  const mine = hideFor(s, 1);
  assert.deepEqual(mine.hands[1], s.hands[1]);
  assert.ok(mine.hands[0].every((c) => c === -1) && mine.hands[0].length === s.hands[0].length);
  assert.ok(mine.hands[2].every((c) => c === -1));
  assert.ok(mine.market.every((c) => c === -1) && mine.market.length === s.market.length);
  assert.equal(mine.seed, 0);
  assert.equal(mine.top, s.top);
  const watcher = hideFor(s, -1);
  assert.ok(watcher.hands.flat().every((c) => c === -1));
});

test("Whot!: a seat can play only what the rules allow, and a whole game ends with a winner", () => {
  for (const seed of [1, 7, 99, 2024, 31337]) {
    let s = rules.init(seed, 4, {});
    // A card nobody has is never a move.
    assert.ok(!rules.moves(s).some((m) => "play" in m && m.play === 999));
    for (let k = 0; k < 2000 && rules.turn(s) >= 0; k++) {
      const m: M = rules.bot(s);
      assert.ok(rules.moves(s).some((x) => JSON.stringify(x) === JSON.stringify(m)));
      s = rules.play(s, m);
    }
    assert.ok(rules.turn(s) < 0 && (rules.winners(s)?.length ?? 0) >= 1, `seed ${seed} finished`);
  }
});
