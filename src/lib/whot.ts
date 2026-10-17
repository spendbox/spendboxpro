// Whot! as played in Nigeria: five cards each. Play a card with the same shape or the same
// number as the top card (a Whot, 20, goes on anything and asks for a shape). Can't play? Go to
// market (draw one). Specials: 1 hold on (play again), 2 pick two and 5 pick three (the next
// player draws and misses their go), 8 suspension (the next player misses a go), 14 general
// market (everyone else draws one). First to empty their hand wins; if the market runs dry, the
// lowest hand (stars count double) wins.
//
// Pure rules, with nothing for the screen, so the server can run them too: a game played for a
// pool is dealt and refereed on the server (src/app/play/games/whot-actions.ts).

import type { TurnRules } from "../app/play/minigames/types.ts";
import { hashRand } from "../app/play/minigames/rng.ts";

const rnd = (s: { seed: number; n: number }, k = 0) => hashRand(s.seed, s.n, k);
function seededShuffle<T>(seed: number, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(hashRand(seed, i, 77) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const SHAPES = ["Circle", "Triangle", "Cross", "Square", "Star"];
const NUMBERS: number[][] = [
  [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  [1, 2, 3, 5, 7, 10, 11, 13, 14],
  [1, 2, 3, 5, 7, 10, 11, 13, 14],
  [1, 2, 3, 4, 5, 7, 8],
];
export const WHOT = 520; // shape 5, value 20
export const shapeOf = (c: number) => Math.floor(c / 100);
export const valueOf = (c: number) => c % 100;
const SPECIAL = new Set([1, 2, 5, 8, 14, 20]);

export type S = { hands: number[][]; market: number[]; top: number; ask: number | null; turn: number; n: number; seed: number; won: number[] | null; log: string };
export type M = { play: number; ask?: number } | { draw: true };

function nextSeat(s: S, from: number, skip = 0) {
  return (from + 1 + skip) % s.hands.length;
}
export function playable(s: S, c: number) {
  if (c === WHOT) return true;
  if (s.top === WHOT) return s.ask === null || shapeOf(c) === s.ask;
  return shapeOf(c) === shapeOf(s.top) || valueOf(c) === valueOf(s.top);
}
function draw(s: S, seat: number, k: number) {
  for (let i = 0; i < k && s.market.length; i++) s.hands[seat].push(s.market.shift()!);
}
function handValue(h: number[]) {
  return h.reduce((t, c) => t + (shapeOf(c) === 4 ? valueOf(c) * 2 : valueOf(c)), 0);
}
function settleDry(s: S): S {
  if (s.market.length || s.won) return s;
  const vals = s.hands.map(handValue);
  const low = Math.min(...vals);
  return { ...s, won: vals.map((v, i) => (v === low ? i : -1)).filter((i) => i >= 0), log: "The market is empty: lowest hand wins" };
}

export const rules: TurnRules<S, M> = {
  init: (seed, seats) => {
    const deck = seededShuffle(seed, [...NUMBERS.flatMap((ns, sh) => ns.map((v) => sh * 100 + v)), WHOT, WHOT, WHOT, WHOT, WHOT]);
    const hands = Array.from({ length: seats }, () => deck.splice(0, 5));
    // The first top card is a plain one.
    let i = deck.findIndex((c) => !SPECIAL.has(valueOf(c)));
    if (i < 0) i = 0;
    const top = deck.splice(i, 1)[0];
    return { hands, market: deck, top, ask: null, turn: 0, n: 0, seed, won: null, log: "" };
  },
  turn: (s) => (s.won ? -1 : s.turn),
  moves: (s) => {
    const h = s.hands[s.turn];
    const out: M[] = [];
    for (const c of new Set(h)) {
      if (!playable(s, c)) continue;
      if (c === WHOT) for (let a = 0; a < 5; a++) out.push({ play: c, ask: a });
      else out.push({ play: c });
    }
    out.push({ draw: true });
    return out;
  },
  play: (s0, m) => {
    const s: S = { ...s0, hands: s0.hands.map((h) => [...h]), market: [...s0.market], n: s0.n + 1 };
    const me = s.turn;
    if ("draw" in m) {
      draw(s, me, 1);
      s.log = "Went to market";
      s.turn = nextSeat(s, me);
      return settleDry(s);
    }
    const h = s.hands[me];
    h.splice(h.indexOf(m.play), 1);
    s.top = m.play;
    s.ask = m.play === WHOT ? (m.ask ?? 0) : null;
    const v = valueOf(m.play);
    if (!h.length) return { ...s, won: [me], log: "Last card! Check up!" };
    const nxt = nextSeat(s, me);
    s.log = "";
    if (v === 1) {
      s.log = "Hold on!";
      s.turn = me;
    } else if (v === 2 || v === 5) {
      draw(s, nxt, v === 2 ? 2 : 3);
      s.log = v === 2 ? "Pick two!" : "Pick three!";
      s.turn = nextSeat(s, me, 1);
    } else if (v === 8) {
      s.log = "Suspension!";
      s.turn = nextSeat(s, me, 1);
    } else if (v === 14) {
      s.hands.forEach((_, i) => i !== me && draw(s, i, 1));
      s.log = "General market!";
      s.turn = nxt;
    } else if (v === 20) {
      s.log = `Whot! I need ${SHAPES[s.ask ?? 0]}`;
      s.turn = nxt;
    } else s.turn = nxt;
    if (s.hands.length === 2 && (v === 2 || v === 5 || v === 8)) s.turn = me;
    return settleDry(s);
  },
  winners: (s) => s.won,
  bot: (s) => {
    const ms = rules.moves(s).filter((m) => "play" in m) as { play: number; ask?: number }[];
    if (!ms.length) return { draw: true };
    const h = s.hands[s.turn];
    const nextCount = s.hands[nextSeat(s, s.turn)].length;
    const counts = [0, 1, 2, 3, 4].map((sh) => h.filter((c) => shapeOf(c) === sh).length);
    const bestShape = counts.indexOf(Math.max(...counts));
    const score = (m: { play: number; ask?: number }) => {
      const v = valueOf(m.play);
      let sc = rnd(s, m.play) * 2;
      if (m.play === WHOT) sc += m.ask === bestShape ? 2 : -10;
      if (SPECIAL.has(v) && v !== 20) sc += nextCount <= 2 ? 8 : 3;
      if (v === 1 && h.length > 1) sc += 4;
      sc += counts[shapeOf(m.play)] ?? 0;
      return sc;
    };
    return ms.reduce((a, b) => (score(b) > score(a) ? b : a));
  },
};

/** The game as one seat may see it (-1 for a watcher): its own hand; the others' cards and the market as blanks (-1); no seed. */
export function hideFor(s: S, seat: number): S {
  return { ...s, seed: 0, hands: s.hands.map((h, i) => (i === seat ? h : h.map(() => -1))), market: s.market.map(() => -1) };
}
