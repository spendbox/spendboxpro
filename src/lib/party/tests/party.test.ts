// Tests for the party games (docs/PARTY_GAMES.md): Truth or Dare and Impostor.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { OVER, SYSTEM } from "../engine.ts";
import { DARES, TRUTHS } from "../truth-dare-cards.ts";
import { TD_CHICKEN, TD_VETOES, tdHeat, tdHotSeat, tdPoints, tdRounds, truthDare as td, type TDMove, type TDState } from "../truth-dare.ts";
import { BOARDS, BOARD_SIZE } from "../impostor-words.ts";
import { IMP_PASS, IMP_POINTS, accusedOf, boardsFor, impostor as imp, impostorSecrets, roundPoints, type IMove, type IState } from "../impostor.ts";

const playTD = (s: TDState, ...ms: TDMove[]) =>
  ms.reduce((st, m) => {
    assert.ok(td.valid(st, m), `${JSON.stringify(m)} should be allowed in ${st.phase}`);
    return td.play(st, m);
  }, s);
const playI = (s: IState, ...ms: IMove[]) =>
  ms.reduce((st, m) => {
    assert.ok(imp.valid(st, m), `${JSON.stringify(m)} should be allowed in ${st.phase}`);
    return imp.play(st, m);
  }, s);

test("Truth or Dare: every deck has cards, and the heat rises each round", () => {
  for (const h of [1, 2, 3] as const) {
    assert.ok(TRUTHS[h].length >= 12 && DARES[h].length >= 12);
    for (const c of [...TRUTHS[h], ...DARES[h]]) assert.ok(c.length <= 110, c);
  }
  assert.deepEqual([0, 1, 2].map((r) => tdHeat(r, 3)), [1, 2, 3]);
  assert.deepEqual([0, 1].map((r) => tdHeat(r, 2)), [1, 3]);
  assert.equal(tdRounds(2), 3);
  assert.equal(tdRounds(5), 2);
  assert.equal(tdPoints("dare", 3), 6);
  assert.equal(tdPoints("truth", 2), 2);
});

test("Truth or Dare: the bottle stops on everyone once a round", () => {
  for (const n of [2, 3, 4, 6]) {
    for (let lap = 0; lap < 3; lap++) {
      const seats = Array.from({ length: n }, (_, i) => tdHotSeat(4242, n, lap * n + i)).sort();
      assert.deepEqual(seats, Array.from({ length: n }, (_, i) => i));
    }
  }
});

test("Truth or Dare: a turn, accepted, scores; vetoes need most judges and run out", () => {
  let s = td.init(99, 3);
  assert.equal(td.turn(s), 0);
  s = playTD(s, { spin: true });
  const hot = s.hot;
  assert.equal(td.turn(s), hot);
  assert.ok(!td.valid(s, { answer: "x" }), "pick first");
  s = playTD(s, { pick: "dare" });
  assert.ok(s.card && DARES[1].includes(s.card));
  // A dare can be answered with nothing ("done").
  s = playTD(s, { answer: "" });
  assert.equal(s.phase, "judge");
  assert.equal(s.judges.length, 2);
  assert.ok(!s.judges.includes(hot));
  // One veto out of two judges isn't enough.
  s = playTD(s, { vote: false }, { vote: true });
  assert.equal(s.past[0].result, "accepted");
  assert.equal(s.scores[hot], 2);
  assert.equal(s.vetoes.reduce((a, b) => a + b), TD_VETOES * 3 - 1);
  // The one who answered spins next.
  assert.equal(s.phase, "spin");
  assert.equal(td.turn(s), hot);
});

test("Truth or Dare: two players, chicken and veto", () => {
  let s = td.init(7, 2);
  s = playTD(s, { spin: true }, { pick: "truth" });
  assert.ok(!td.valid(s, { answer: "   " }), "a truth needs an answer");
  const first = s.card;
  s = playTD(s, { swap: true });
  assert.notEqual(s.card, first);
  assert.ok(!td.valid(s, { swap: true }), "one swap a game");
  const hot = s.hot;
  s = playTD(s, { chicken: true });
  assert.equal(s.scores[hot], TD_CHICKEN);
  assert.equal(s.past[0].result, "chicken");
  // Next turn: veto twice, then no more vetoes.
  for (let i = 0; i < 2; i++) {
    s = playTD(s, { spin: true }, { pick: "truth" }, { answer: "Honestly, yes" });
    const judge = td.turn(s);
    if (s.vetoes[judge] > 0) s = playTD(s, { vote: false });
    else s = playTD(s, { vote: true });
  }
  assert.ok(s.vetoes.some((v) => v < TD_VETOES));
});

test("Truth or Dare: the computer can always finish a game, and it ends with winners", () => {
  for (const n of [2, 3, 5, 6]) {
    let s = td.init(1234 + n, n);
    let steps = 0;
    while (td.turn(s) !== OVER && steps++ < 1000) {
      const m = td.auto(s);
      assert.ok(td.valid(s, m));
      s = td.play(s, m);
    }
    assert.equal(s.phase, "over");
    assert.equal(s.past.length, n * tdRounds(n));
    // Everyone chickened out: all level, a draw.
    assert.deepEqual(td.winners(s), Array.from({ length: n }, (_, i) => i));
  }
});

test("Impostor: every board has twelve different words, and each game's boards differ", () => {
  for (const b of BOARDS) {
    assert.equal(b.words.length, BOARD_SIZE, b.category);
    assert.equal(new Set(b.words).size, BOARD_SIZE, b.category);
  }
  const bs = boardsFor(55, 3);
  assert.equal(new Set(bs).size, 3);
});

test("Impostor: the secrets are a different impostor each round, and the same every time", () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const a = impostorSecrets(bytes, 4, 3);
  assert.deepEqual(a, impostorSecrets(bytes, 4, 3));
  assert.equal(new Set(a.map((r) => r.imp)).size, 3);
  for (const r of a) assert.ok(r.word >= 0 && r.word < BOARD_SIZE && r.imp >= 0 && r.imp < 4);
});

test("Impostor: votes, a tie lets the impostor go", () => {
  assert.equal(accusedOf([1, 0, 1]), 1);
  assert.equal(accusedOf([1, 0, 2, 2, 1]), null);
  // Caught and the word guessed: the right voters and the impostor score.
  assert.deepEqual(roundPoints(3, [1, 0, 1], 1, 1, 5, 5), [1, IMP_POINTS.stole, 1]);
  // Got away.
  assert.deepEqual(roundPoints(3, [2, 0, 0], 1, 0, null, 5), [0, IMP_POINTS.escaped, 0]);
});

test("Impostor: a round from clues to the next round", () => {
  let s = imp.init(2024, 3);
  // Three players: clues twice round.
  assert.equal(s.clueOrder.length, 6);
  for (let i = 0; i < 6; i++) s = playI(s, { clue: `clue${i}` });
  assert.equal(s.phase, "vote");
  const voter = imp.turn(s);
  assert.ok(!imp.valid(s, { vote: voter }), "no voting for yourself");
  // Everyone votes for seat 2 (seat 2 votes for 0).
  while (s.phase === "vote") s = playI(s, { vote: imp.turn(s) === 2 ? 0 : 2 });
  assert.equal(s.accused, 2);
  assert.equal(imp.turn(s), SYSTEM);
  // The server says seat 2 was the impostor, and the word was 4: they guess wrong.
  s = playI(s, { reveal: 2, word: 4 });
  assert.equal(s.phase, "guess");
  assert.equal(imp.turn(s), 2);
  s = playI(s, { guess: 3 });
  assert.equal(s.phase, "recap");
  assert.deepEqual(s.scores, [1, 1, 0]);
  s = playI(s, { next: true });
  assert.equal(s.round, 1);
  assert.equal(s.phase, "clue");
  assert.equal(imp.turn(s), 1, "the next player starts");
});

test("Impostor: the computer can finish a game (with the server's reveals)", () => {
  for (const n of [3, 4, 6]) {
    let s = imp.init(77 + n, n);
    const secrets = impostorSecrets(new Uint8Array([n, 9, 9, 9]), n, s.rounds);
    let steps = 0;
    while (imp.turn(s) !== OVER && steps++ < 500) {
      const m: IMove = imp.turn(s) === SYSTEM ? { reveal: secrets[s.round].imp, word: secrets[s.round].word } : imp.auto(s);
      assert.ok(imp.valid(s, m), JSON.stringify(m));
      s = imp.play(s, m);
    }
    assert.equal(s.phase, "over");
    assert.equal(s.past.length, 3);
    assert.ok(s.past.every((r) => r.votes.every((v) => v >= 0)));
    assert.ok(imp.winners(s)!.length >= 1);
    assert.deepEqual(imp.auto(imp.init(1, n)), { clue: IMP_PASS });
  }
});
