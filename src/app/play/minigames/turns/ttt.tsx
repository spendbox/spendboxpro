"use client";

import { Circle, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TurnRules, TurnViewProps } from "../types";
import { rnd } from "./common";

// Noughts and Crosses. The bot plays well, but not perfectly (now and then it plays a random
// square), so it can be beaten.

type S = { b: (number | null)[]; turn: number; n: number; seed: number };
type M = number;
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function winnerOf(b: (number | null)[]) {
  for (const [a, c, d] of LINES) if (b[a] !== null && b[a] === b[c] && b[a] === b[d]) return b[a];
  return null;
}
function minimax(b: (number | null)[], me: number, turn: number): number {
  const w = winnerOf(b);
  if (w !== null) return w === me ? 10 : -10;
  if (b.every((x) => x !== null)) return 0;
  const scores = b.map((x, i) => {
    if (x !== null) return null;
    const nb = [...b];
    nb[i] = turn;
    return minimax(nb, me, 1 - turn) * 0.9;
  }).filter((x): x is number => x !== null);
  return turn === me ? Math.max(...scores) : Math.min(...scores);
}

export const rules: TurnRules<S, M> = {
  init: (seed) => ({ b: Array(9).fill(null), turn: 0, n: 0, seed }),
  turn: (s) => (winnerOf(s.b) !== null || s.b.every((x) => x !== null) ? -1 : s.turn),
  moves: (s) => s.b.map((x, i) => (x === null ? i : -1)).filter((i) => i >= 0),
  play: (s, m) => {
    const b = [...s.b];
    b[m] = s.turn;
    return { ...s, b, turn: 1 - s.turn, n: s.n + 1 };
  },
  winners: (s) => {
    const w = winnerOf(s.b);
    if (w !== null) return [w];
    return s.b.every((x) => x !== null) ? [0, 1] : null;
  },
  bot: (s) => {
    const moves = rules.moves(s);
    if (rnd(s) < 0.2) return moves[Math.floor(rnd(s, 1) * moves.length)];
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of moves) {
      const b = [...s.b];
      b[m] = s.turn;
      const sc = minimax(b, s.turn, 1 - s.turn) + rnd(s, m + 2) * 0.5;
      if (sc > bestScore) {
        bestScore = sc;
        best = m;
      }
    }
    return best;
  },
};

export function View({ s, canMove, onMove }: TurnViewProps<S, M>) {
  const w = winnerOf(s.b);
  const line = w !== null ? LINES.find(([a, c, d]) => s.b[a] === w && s.b[c] === w && s.b[d] === w) : null;
  return (
    <div className="mx-auto grid aspect-square w-full max-w-xs grid-cols-3 gap-2 rounded-3xl bg-ink p-2">
      {s.b.map((x, i) => (
        <button
          key={i}
          onClick={() => x === null && onMove(i)}
          disabled={!canMove || x !== null}
          className={cn("grid place-items-center rounded-2xl bg-panel", line?.includes(i) && "bg-gold")}
          aria-label={x === null ? "Empty square" : x === 0 ? "Cross" : "Nought"}
        >
          {x === 0 && <X className="act-pop size-14 text-[#e03131]" strokeWidth={3} />}
          {x === 1 && <Circle className="act-pop size-12 text-[#1c7ed6]" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}
