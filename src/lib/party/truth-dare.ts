// Truth or Dare at a game table (docs/PARTY_GAMES.md), for 2 to 6 players and a stake.
//
// A turn: whoever is holding the bottle spins it; it stops on someone. They pick Truth or Dare and
// get a card. They answer (type it, or do the dare on the voice call and say it's done), swap the
// card once a game, or chicken out (minus a point). Then everyone else judges, one after another:
// accept, or veto (two vetoes each for the whole game; most of the judges have to veto). An answer
// that stands scores the card's heat, a dare double. The bottle stops on everyone the same number
// of times, and the cards get hotter each round. Most points at the end takes the pool; level at
// the top is a draw (stakes back).

import { OVER, cleanText, shuffled, topSeats, type PartyRules } from "./engine.ts";
import { DARES, TRUTHS, type Heat } from "./truth-dare-cards.ts";

export type TDKind = "truth" | "dare";
export type TDPhase = "spin" | "choose" | "do" | "judge" | "over";
export type TDResult = "accepted" | "vetoed" | "chicken";
/** One finished turn. */
export type TDTurn = { hot: number; kind: TDKind; heat: Heat; card: string; answer: string | null; result: TDResult; points: number; vetoedBy: number[] };

export type TDState = {
  n: number;
  seed: number;
  /** Turns played so far, and how many there are in all. */
  turnNo: number;
  total: number;
  phase: TDPhase;
  /** Who spins the bottle, and who it stopped on. */
  spinner: number;
  hot: number;
  kind: TDKind | null;
  card: string | null;
  answer: string | null;
  /** The seats judging this answer, in order, and the votes so far (true: accept). */
  judges: number[];
  votes: boolean[];
  vetoes: number[];
  swaps: number[];
  scores: number[];
  /** Cards drawn so far from each deck (by kind and heat). */
  drawn: Record<string, number>;
  past: TDTurn[];
};

export type TDMove = { spin: true } | { pick: TDKind } | { answer: string } | { chicken: true } | { swap: true } | { vote: boolean };

export const TD_VETOES = 2;
export const TD_SWAPS = 1;
export const TD_CHICKEN = -1;
/** Seconds for each step. */
export const TD_SECS: Record<TDPhase, number> = { spin: 12, choose: 15, do: 75, judge: 20, over: 0 };
export const TD_ANSWER_MAX = 160;

/** Rounds: three with up to three players (chill, spicy, extra), two with more (chill, extra). */
export const tdRounds = (n: number) => (n <= 3 ? 3 : 2);
/** The heat of a round. */
export function tdHeat(round: number, rounds: number): Heat {
  if (rounds <= 1) return 1;
  return Math.min(3, Math.max(1, 1 + Math.round((round * 2) / (rounds - 1)))) as Heat;
}
/** Points for an answer that stands. */
export const tdPoints = (kind: TDKind, heat: Heat) => (kind === "dare" ? heat * 2 : heat);

/** Who the bottle stops on at a turn: every round, everyone once, in a shuffled order. */
export function tdHotSeat(seed: number, n: number, turnNo: number) {
  const lap = Math.floor(turnNo / n);
  const order = shuffled(seed + 7919 * (lap + 1), Array.from({ length: n }, (_, i) => i));
  return order[turnNo % n];
}

const round = (s: TDState) => Math.floor(s.turnNo / s.n);
export const tdHeatNow = (s: TDState) => tdHeat(Math.min(round(s), tdRounds(s.n) - 1), tdRounds(s.n));

function draw(s: TDState, kind: TDKind): { card: string; drawn: Record<string, number> } {
  const heat = tdHeatNow(s);
  const key = `${kind}${heat}`;
  const k = s.drawn[key] ?? 0;
  const deck = shuffled(s.seed + (kind === "truth" ? 31 : 97) * heat, (kind === "truth" ? TRUTHS : DARES)[heat]);
  return { card: deck[k % deck.length], drawn: { ...s.drawn, [key]: k + 1 } };
}

/** The others, in order round the table from the one answering. */
const judgesOf = (n: number, hot: number) => Array.from({ length: n - 1 }, (_, i) => (hot + 1 + i) % n);

function finish(s: TDState, result: TDResult): TDState {
  const heat = tdHeatNow(s);
  const kind = s.kind ?? "truth";
  const points = result === "accepted" ? tdPoints(kind, heat) : result === "chicken" ? TD_CHICKEN : 0;
  const scores = s.scores.map((v, i) => (i === s.hot ? v + points : v));
  const vetoedBy = s.votes.map((v, i) => (v ? -1 : s.judges[i])).filter((x) => x >= 0);
  const past = [...s.past, { hot: s.hot, kind, heat, card: s.card ?? "", answer: s.answer, result, points, vetoedBy }];
  const turnNo = s.turnNo + 1;
  const over = turnNo >= s.total;
  return { ...s, scores, past, turnNo, phase: over ? "over" : "spin", spinner: s.hot, kind: null, card: null, answer: null, judges: [], votes: [] };
}

export const truthDare: PartyRules<TDState, TDMove> = {
  init: (seed, seats) => {
    const n = Math.max(2, Math.min(6, seats));
    return {
      n,
      seed,
      turnNo: 0,
      total: n * tdRounds(n),
      phase: "spin",
      spinner: 0,
      hot: -1,
      kind: null,
      card: null,
      answer: null,
      judges: [],
      votes: [],
      vetoes: Array(n).fill(TD_VETOES),
      swaps: Array(n).fill(TD_SWAPS),
      scores: Array(n).fill(0),
      drawn: {},
      past: [],
    };
  },
  turn: (s) => (s.phase === "over" ? OVER : s.phase === "spin" ? s.spinner : s.phase === "judge" ? (s.judges[s.votes.length] ?? OVER) : s.hot),
  valid: (s, m) => {
    if (!m || typeof m !== "object") return false;
    if (s.phase === "spin") return "spin" in m && m.spin === true;
    if (s.phase === "choose") return "pick" in m && (m.pick === "truth" || m.pick === "dare");
    if (s.phase === "do") {
      if ("chicken" in m) return m.chicken === true;
      if ("swap" in m) return m.swap === true && s.swaps[s.hot] > 0;
      if ("answer" in m) return typeof m.answer === "string" && (s.kind === "dare" || cleanText(m.answer, TD_ANSWER_MAX).length > 0);
      return false;
    }
    if (s.phase === "judge") {
      if (!("vote" in m) || typeof m.vote !== "boolean") return false;
      const judge = s.judges[s.votes.length];
      return m.vote || (judge !== undefined && s.vetoes[judge] > 0);
    }
    return false;
  },
  play: (s, m) => {
    if ("spin" in m) return { ...s, phase: "choose", hot: tdHotSeat(s.seed, s.n, s.turnNo) };
    if ("pick" in m) {
      const d = draw(s, m.pick);
      return { ...s, phase: "do", kind: m.pick, card: d.card, drawn: d.drawn };
    }
    if ("swap" in m) {
      const d = draw(s, s.kind ?? "truth");
      return { ...s, card: d.card, drawn: d.drawn, swaps: s.swaps.map((v, i) => (i === s.hot ? v - 1 : v)) };
    }
    if ("chicken" in m) return finish(s, "chicken");
    if ("answer" in m) return { ...s, phase: "judge", answer: cleanText(m.answer, TD_ANSWER_MAX) || null, judges: judgesOf(s.n, s.hot), votes: [] };
    // A vote.
    const judge = s.judges[s.votes.length];
    const votes = [...s.votes, m.vote];
    const vetoes = m.vote ? s.vetoes : s.vetoes.map((v, i) => (i === judge ? v - 1 : v));
    const next = { ...s, votes, vetoes };
    if (votes.length < s.judges.length) return next;
    const against = votes.filter((v) => !v).length;
    return finish(next, against * 2 > s.judges.length ? "vetoed" : "accepted");
  },
  auto: (s) => (s.phase === "spin" ? { spin: true } : s.phase === "choose" ? { pick: "truth" } : s.phase === "do" ? { chicken: true } : { vote: true }),
  secs: (s) => TD_SECS[s.phase],
  winners: (s) => (s.phase === "over" ? topSeats(s.scores) : null),
};
