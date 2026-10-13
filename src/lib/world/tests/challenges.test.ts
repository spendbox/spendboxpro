// Tests for challenges (docs/CHALLENGES.md): the games on offer, the money rules and reputation.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { CHALLENGE_COOLDOWN_SECS, CHALLENGE_GAMES, CHALLENGE_FEE_NAIRA, JOIN_SECS, STAKES_NAIRA, WINNER_SHARE, challengeRep } from "../challenges.ts";

test("Whot and Ludo can be played now; Jenga and Police and Thief are coming soon", () => {
  const ready = CHALLENGE_GAMES.filter((g) => g.engine).map((g) => g.id);
  assert.deepEqual(ready, ["whot", "ludo"]);
  assert.ok(CHALLENGE_GAMES.some((g) => g.id === "jenga" && !g.engine));
  assert.ok(CHALLENGE_GAMES.some((g) => g.id === "police_thief" && !g.engine));
  for (const g of CHALLENGE_GAMES) assert.match(g.id, /^[a-z_]{2,20}$/);
});

test("the rules the owner asked for", () => {
  assert.equal(CHALLENGE_FEE_NAIRA, 50_000);
  assert.ok(CHALLENGE_COOLDOWN_SECS >= 5 * 60 && CHALLENGE_COOLDOWN_SECS <= 10 * 60);
  assert.equal(JOIN_SECS, 60);
  assert.ok(WINNER_SHARE > 0.5 && WINNER_SHARE <= 1);
  // The database takes stakes up to ₥10,000 (game-db/070).
  assert.ok(STAKES_NAIRA.every((s) => s > 0 && s / 1_500 <= 10_000));
});

test("reputation from challenges: 1 a hosted game, 3 a win, at most 120", () => {
  assert.equal(challengeRep(0, 0), 0);
  assert.equal(challengeRep(2, 1), 5);
  assert.equal(challengeRep(500, 500), 120);
});
