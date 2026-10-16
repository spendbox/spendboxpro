// Tests for challenges (docs/CHALLENGES.md): the games on offer, the money rules and reputation.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CHALLENGE_CATEGORIES,
  CHALLENGE_COOLDOWN_SECS,
  CHALLENGE_GAMES,
  CHALLENGE_FEE_NAIRA,
  JOIN_SECS,
  STAKES_NAIRA,
  STAKE_MAX_NAIRA,
  STAKE_MIN_NAIRA,
  WINNER_SHARE,
  challengeRep,
  challengeRepGained,
  cleanStake,
  findGames,
  stakeBounds,
} from "../challenges.ts";

test("Whot, Ludo, Truth or Dare and Impostor can be played now; Jenga and Police and Thief are coming soon", () => {
  const ready = CHALLENGE_GAMES.filter((g) => g.engine).map((g) => g.id);
  assert.deepEqual(ready, ["whot", "ludo", "truth_dare", "impostor"]);
  assert.ok(CHALLENGE_GAMES.some((g) => g.id === "jenga" && !g.engine));
  assert.ok(CHALLENGE_GAMES.some((g) => g.id === "police_thief" && !g.engine));
  for (const g of CHALLENGE_GAMES) {
    // The database keeps the id (game-db/070) and the seats (2 to 6).
    assert.match(g.id, /^[a-z_]{2,20}$/);
    assert.ok(g.seats >= 2 && g.seats <= 6);
    assert.ok(CHALLENGE_CATEGORIES.some((c) => c.id === g.category));
  }
  assert.equal(new Set(CHALLENGE_GAMES.map((g) => g.id)).size, CHALLENGE_GAMES.length);
});

test("the game picker: search, shelves, playable first", () => {
  assert.equal(findGames("").length, CHALLENGE_GAMES.length);
  assert.deepEqual(findGames("").slice(0, 2).map((g) => g.id), ["whot", "ludo"]);
  assert.deepEqual(findGames("WHOT").map((g) => g.id), ["whot"]);
  // Accents don't matter, and tags count.
  assert.ok(findGames("ayo").some((g) => g.id === "ayo"));
  assert.ok(findGames("checkers").some((g) => g.id === "draughts"));
  assert.ok(findGames("", "cards").every((g) => g.category === "cards"));
  assert.ok(findGames("", "soon").every((g) => !g.engine));
  assert.ok(findGames("", "soon").length > 0);
  assert.deepEqual(findGames("zzzz nothing"), []);
});

test("the rules the owner asked for", () => {
  assert.equal(CHALLENGE_FEE_NAIRA, 50_000);
  assert.ok(CHALLENGE_COOLDOWN_SECS >= 5 * 60 && CHALLENGE_COOLDOWN_SECS <= 10 * 60);
  assert.equal(JOIN_SECS, 60);
  assert.ok(WINNER_SHARE > 0.5 && WINNER_SHARE <= 1);
  // The database takes stakes up to ₥10,000 (game-db/070).
  assert.equal(STAKES_NAIRA[0], 0, "a stake is optional");
  assert.ok(STAKES_NAIRA.slice(1).every((s) => s >= STAKE_MIN_NAIRA && s <= STAKE_MAX_NAIRA));
  assert.ok(STAKE_MAX_NAIRA / 1_500 <= 10_000);
});

test("any stake between the smallest and the biggest", () => {
  const { min, max } = stakeBounds(1_500);
  assert.equal(min, 0.67);
  assert.equal(max, 666.67);
  // ₦1,000 typed in naira is ₥0.67 (to the cent): allowed.
  assert.equal(cleanStake(1_000 / 1_500, 1_500), 0.67);
  assert.equal(cleanStake(7_500 / 1_500, 1_500), 5);
  assert.equal(cleanStake(1_000_000 / 1_500, 1_500), 666.67);
  assert.equal(cleanStake(0.5, 1_500), null);
  assert.equal(cleanStake(0, 1_500), 0, "no stake: just for fun");
  assert.equal(cleanStake(-3, 1_500), null);
  assert.equal(cleanStake(667, 1_500), null);
  assert.equal(cleanStake(Number.NaN, 1_500), null);
});

test("reputation from challenges: 1 a hosted game, 3 a win, at most 120", () => {
  assert.equal(challengeRep(0, 0), 0);
  assert.equal(challengeRep(2, 1), 5);
  assert.equal(challengeRep(500, 500), 120);
  // What one game added: host and win +4, win +3, host +1, neither 0; less near the cap.
  assert.equal(challengeRepGained(1, 1, true, true), 4);
  assert.equal(challengeRepGained(3, 2, false, true), 3);
  assert.equal(challengeRepGained(3, 2, true, false), 1);
  assert.equal(challengeRepGained(3, 2, false, false), 0);
  assert.equal(challengeRepGained(0, 40, false, true), 3);
  assert.equal(challengeRepGained(1, 40, true, false), 0);
  assert.equal(challengeRepGained(2, 40, false, true), 1);
});
