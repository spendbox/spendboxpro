"use client";

import { cn } from "@/lib/cn";
import type { TurnRules, TurnViewProps } from "../types";
import { rnd } from "./common";

// Connect Four: 7 columns, 6 rows. Drop a counter in a column; four in a row (across, down or
// diagonally) wins. The bot looks four moves ahead.

const COLS = 7;
const ROWS = 6;
type S = { g: (number | null)[]; turn: number; n: number; seed: number; last: number };
type M = number;

const at = (c: number, r: number) => r * COLS + c;
function drop(g: (number | null)[], c: number) {
  for (let r = ROWS - 1; r >= 0; r--) if (g[at(c, r)] === null) return r;
  return -1;
}
function fourAt(g: (number | null)[]): { who: number; cells: number[] } | null {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const v = g[at(c, r)];
      if (v === null) continue;
      for (const [dc, dr] of dirs) {
        const cells = [0, 1, 2, 3].map((k) => [c + dc * k, r + dr * k]);
        if (cells.every(([x, y]) => x >= 0 && y >= 0 && x < COLS && y < ROWS && g[at(x, y)] === v)) return { who: v, cells: cells.map(([x, y]) => at(x, y)) };
      }
    }
  return null;
}
function heur(g: (number | null)[], me: number) {
  let score = 0;
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [dc, dr] of dirs) {
        const cells = [0, 1, 2, 3].map((k) => [c + dc * k, r + dr * k]);
        if (!cells.every(([x, y]) => x >= 0 && y >= 0 && x < COLS && y < ROWS)) continue;
        const vs = cells.map(([x, y]) => g[at(x, y)]);
        const mine = vs.filter((v) => v === me).length;
        const theirs = vs.filter((v) => v !== null && v !== me).length;
        if (mine && !theirs) score += mine === 3 ? 5 : mine === 2 ? 2 : 0;
        if (theirs && !mine) score -= theirs === 3 ? 6 : theirs === 2 ? 2 : 0;
      }
  for (let r = 0; r < ROWS; r++) if (g[at(3, r)] === me) score += 3;
  return score;
}
function search(g: (number | null)[], me: number, turn: number, depth: number, a: number, b: number): number {
  const f = fourAt(g);
  if (f) return f.who === me ? 10000 + depth : -10000 - depth;
  if (depth === 0) return heur(g, me);
  const cols = [3, 2, 4, 1, 5, 0, 6].filter((c) => drop(g, c) >= 0);
  if (!cols.length) return 0;
  if (turn === me) {
    let v = -Infinity;
    for (const c of cols) {
      const ng = [...g];
      ng[at(c, drop(g, c))] = turn;
      v = Math.max(v, search(ng, me, 1 - turn, depth - 1, a, b));
      a = Math.max(a, v);
      if (a >= b) break;
    }
    return v;
  }
  let v = Infinity;
  for (const c of cols) {
    const ng = [...g];
    ng[at(c, drop(g, c))] = turn;
    v = Math.min(v, search(ng, me, 1 - turn, depth - 1, a, b));
    b = Math.min(b, v);
    if (a >= b) break;
  }
  return v;
}

export const rules: TurnRules<S, M> = {
  init: (seed) => ({ g: Array(COLS * ROWS).fill(null), turn: 0, n: 0, seed, last: -1 }),
  turn: (s) => (fourAt(s.g) || s.g.every((x) => x !== null) ? -1 : s.turn),
  moves: (s) => Array.from({ length: COLS }, (_, c) => c).filter((c) => drop(s.g, c) >= 0),
  play: (s, c) => {
    const g = [...s.g];
    const r = drop(g, c);
    g[at(c, r)] = s.turn;
    return { ...s, g, turn: 1 - s.turn, n: s.n + 1, last: at(c, r) };
  },
  winners: (s) => {
    const f = fourAt(s.g);
    if (f) return [f.who];
    return s.g.every((x) => x !== null) ? [0, 1] : null;
  },
  bot: (s) => {
    let best = -1;
    let bestV = -Infinity;
    for (const c of rules.moves(s)) {
      const g = [...s.g];
      g[at(c, drop(g, c))] = s.turn;
      const v = search(g, s.turn, 1 - s.turn, 4, -Infinity, Infinity) + rnd(s, c) * 2;
      if (v > bestV) {
        bestV = v;
        best = c;
      }
    }
    return best;
  },
};

export function View({ s, canMove, onMove }: TurnViewProps<S, M>) {
  const four = fourAt(s.g);
  return (
    <div className="mx-auto w-full max-w-sm rounded-3xl bg-[#1971c2] p-2">
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: COLS }, (_, c) => (
          <button key={c} onClick={() => onMove(c)} disabled={!canMove || drop(s.g, c) < 0} className="flex flex-col gap-1.5 rounded-xl p-0.5 hover:bg-white/10 disabled:hover:bg-transparent" aria-label={`Column ${c + 1}`}>
            {Array.from({ length: ROWS }, (_, r) => {
              const v = s.g[at(c, r)];
              return (
                <span
                  key={r}
                  className={cn("aspect-square w-full rounded-full", v === null ? "bg-[#0b3d6e]" : v === 0 ? "bg-[#e03131]" : "bg-[#fab005]", s.last === at(c, r) && "act-pop", four?.cells.includes(at(c, r)) && "ring-4 ring-white")}
                />
              );
            })}
          </button>
        ))}
      </div>
    </div>
  );
}
