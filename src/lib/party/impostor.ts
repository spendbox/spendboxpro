// Impostor at a game table (docs/PARTY_GAMES.md), for 3 to 6 players and a stake.
//
// Every round there's a board of twelve words. The server tells everyone but one player which word
// it is; the impostor only sees the board. Round the table, everyone gives a one-word clue (twice
// round with four players or fewer): close enough to show you know the word, vague enough not to
// give it away. Then everyone votes for who they think the impostor is, and the server says who it
// was. Caught (most votes, not a tie), the impostor gets one guess at the word.
//
// Points each round: +1 to everyone who voted for the impostor; +3 to an impostor who gets away;
// +2 to a caught impostor who guesses the word. Three rounds, a different impostor each time. Most
// points takes the pool; level at the top is a draw (stakes back).
//
// Who the impostor is, and the word, aren't in the seed: the server picks them from its own secret
// (impostorSecrets, below) and tells each phone only its own part, until the reveal.

import { OVER, SYSTEM, cleanText, makeRng, shuffled, topSeats, type PartyRules } from "./engine.ts";
import { BOARDS, BOARD_SIZE } from "./impostor-words.ts";

export type IPhase = "clue" | "vote" | "reveal" | "guess" | "recap" | "over";
export type IClue = { seat: number; text: string };
export type IRound = { board: number; imp: number; word: number; accused: number | null; guess: number | null; votes: number[]; gained: number[] };

export type IState = {
  n: number;
  seed: number;
  rounds: number;
  round: number;
  phase: IPhase;
  /** The board this round (an index into BOARDS). */
  board: number;
  clueOrder: number[];
  clues: IClue[];
  voteOrder: number[];
  /** Who each seat voted for (by seat; -1 not yet). */
  votes: number[];
  /** Most votes (null: a tie). */
  accused: number | null;
  /** From the server at the reveal. */
  imp: number | null;
  word: number | null;
  guess: number | null;
  scores: number[];
  past: IRound[];
};

export type IMove = { clue: string } | { vote: number } | { reveal: number; word: number } | { guess: number } | { next: true };

export const IMP_ROUNDS = 3;
export const IMP_MIN_PLAYERS = 3;
export const IMP_CLUE_MAX = 24;
export const IMP_POINTS = { caughtVote: 1, escaped: 3, stole: 2 };
export const IMP_SECS: Record<IPhase, number> = { clue: 35, vote: 30, reveal: 0, guess: 25, recap: 12, over: 0 };
/** A clue from someone who has left (the computer can't know the word). */
export const IMP_PASS = "🤐";

/** The board for each round (from the seed: everyone sees it). */
export const boardsFor = (seed: number, rounds: number) => shuffled(seed ^ 0x5eed, BOARDS.map((_, i) => i)).slice(0, rounds);

/** Who starts the clues each round. */
const starter = (s: { n: number; round: number }) => s.round % s.n;
const ring = (n: number, from: number) => Array.from({ length: n }, (_, i) => (from + i) % n);
/** Clues: twice round the table with four players or fewer, once with more. */
const laps = (n: number) => (n <= 4 ? 2 : 1);

function startRound(s: IState, round: number): IState {
  const st = round % s.n;
  const order = ring(s.n, st);
  return {
    ...s,
    round,
    phase: "clue",
    board: boardsFor(s.seed, s.rounds)[round] ?? 0,
    clueOrder: Array.from({ length: laps(s.n) }, () => order).flat(),
    clues: [],
    voteOrder: order,
    votes: Array(s.n).fill(-1),
    accused: null,
    imp: null,
    word: null,
    guess: null,
  };
}

/** The seat with the most votes, or null when the top is shared. */
export function accusedOf(votes: number[]): number | null {
  const tally = new Map<number, number>();
  for (const v of votes) if (v >= 0) tally.set(v, (tally.get(v) ?? 0) + 1);
  let best = -1;
  let top: number | null = null;
  for (const [seat, c] of tally) {
    if (c > best) [best, top] = [c, seat];
    else if (c === best) top = null;
  }
  return top;
}

/** The points each seat gets for a round. */
export function roundPoints(n: number, votes: number[], imp: number, accused: number | null, guess: number | null, word: number): number[] {
  const out = Array(n).fill(0);
  for (let i = 0; i < n; i++) if (i !== imp && votes[i] === imp) out[i] += IMP_POINTS.caughtVote;
  if (accused !== imp) out[imp] += IMP_POINTS.escaped;
  else if (guess === word) out[imp] += IMP_POINTS.stole;
  return out;
}

function endRound(s: IState): IState {
  const imp = s.imp ?? 0;
  const word = s.word ?? 0;
  const gained = roundPoints(s.n, s.votes, imp, s.accused, s.guess, word);
  return {
    ...s,
    phase: "recap",
    scores: s.scores.map((v, i) => v + gained[i]),
    past: [...s.past, { board: s.board, imp, word, accused: s.accused, guess: s.guess, votes: s.votes, gained }],
  };
}

const isSeat = (s: IState, v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < s.n;
const isWord = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < BOARD_SIZE;

export const impostor: PartyRules<IState, IMove> = {
  init: (seed, seats) => {
    const n = Math.max(2, Math.min(6, seats));
    const base: IState = { n, seed, rounds: IMP_ROUNDS, round: 0, phase: "clue", board: 0, clueOrder: [], clues: [], voteOrder: [], votes: [], accused: null, imp: null, word: null, guess: null, scores: Array(n).fill(0), past: [] };
    return startRound(base, 0);
  },
  turn: (s) => {
    if (s.phase === "over") return OVER;
    if (s.phase === "reveal") return SYSTEM;
    if (s.phase === "clue") return s.clueOrder[s.clues.length] ?? OVER;
    if (s.phase === "vote") return s.voteOrder.find((seat) => s.votes[seat] < 0) ?? OVER;
    if (s.phase === "guess") return s.imp ?? OVER;
    return starter(s);
  },
  valid: (s, m) => {
    if (!m || typeof m !== "object") return false;
    if (s.phase === "clue") return "clue" in m && typeof m.clue === "string" && cleanText(m.clue, IMP_CLUE_MAX).length > 0;
    if (s.phase === "vote") {
      const voter = impostor.turn(s);
      return "vote" in m && isSeat(s, m.vote) && m.vote !== voter;
    }
    if (s.phase === "reveal") return "reveal" in m && isSeat(s, m.reveal) && isWord(m.word);
    if (s.phase === "guess") return "guess" in m && isWord(m.guess);
    if (s.phase === "recap") return "next" in m && m.next === true;
    return false;
  },
  play: (s, m) => {
    if ("clue" in m) {
      const clues = [...s.clues, { seat: impostor.turn(s), text: cleanText(m.clue, IMP_CLUE_MAX) }];
      return { ...s, clues, phase: clues.length >= s.clueOrder.length ? "vote" : "clue" };
    }
    if ("vote" in m) {
      const voter = impostor.turn(s);
      const votes = s.votes.map((v, i) => (i === voter ? m.vote : v));
      if (votes.some((v) => v < 0)) return { ...s, votes };
      return { ...s, votes, accused: accusedOf(votes), phase: "reveal" };
    }
    if ("reveal" in m) {
      const next = { ...s, imp: m.reveal, word: m.word };
      return s.accused === m.reveal ? { ...next, phase: "guess" } : endRound(next);
    }
    if ("guess" in m) return endRound({ ...s, guess: m.guess });
    // Next round (or the end).
    return s.round + 1 >= s.rounds ? { ...s, phase: "over" } : startRound(s, s.round + 1);
  },
  auto: (s) => {
    if (s.phase === "clue") return { clue: IMP_PASS };
    if (s.phase === "vote") {
      // Someone who has left (or ran out of time) votes for the next player round the table.
      const voter = impostor.turn(s);
      return { vote: (voter + 1) % s.n };
    }
    if (s.phase === "guess") return { guess: Math.floor(makeRng(s.seed + 977 * (s.round + 1))() * BOARD_SIZE) };
    return { next: true };
  },
  secs: (s) => IMP_SECS[s.phase],
  winners: (s) => (s.phase === "over" ? topSeats(s.scores) : null),
};

/**
 * The secrets of a game, from the server's secret bytes for it: who the impostor is each round (a
 * different player each round while there are enough of them) and the word on each board.
 */
export function impostorSecrets(bytes: Uint8Array, n: number, rounds: number) {
  const seed = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const order = shuffled(seed, Array.from({ length: n }, (_, i) => i));
  const r = makeRng(seed ^ 0x9e3779b9);
  return Array.from({ length: rounds }, (_, i) => ({ imp: order[i % n], word: Math.floor(r() * BOARD_SIZE) }));
}
