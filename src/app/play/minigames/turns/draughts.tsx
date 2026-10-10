"use client";

import { useState } from "react";
import { Crown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TurnRules, TurnViewProps } from "../types";
import { rnd } from "./common";

// Draughts (English checkers) on an 8 × 8 board. Men move one square diagonally forward; you
// must jump when you can, and keep jumping in the same turn while you can. A man that reaches
// the far side is crowned a king (moves and jumps backwards too). Take all their pieces, or leave
// them no move, to win. 40 moves each without a capture is a draw.
// Seat 0 plays from the bottom (red), seat 1 from the top (black).

type Piece = { side: number; king: boolean } | null;
type S = { b: Piece[]; turn: number; n: number; seed: number; quiet: number; last: number[] };
/** A move: the squares visited (start, then each landing square). */
type M = number[];

const sq = (r: number, c: number) => r * 8 + c;
const rc = (i: number) => [Math.floor(i / 8), i % 8];
const on = (r: number, c: number) => r >= 0 && c >= 0 && r < 8 && c < 8;

function dirs(p: NonNullable<Piece>) {
  const fwd = p.side === 0 ? -1 : 1;
  return p.king ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [[fwd, -1], [fwd, 1]];
}

function jumpsFrom(b: Piece[], from: number, p: NonNullable<Piece>, path: number[], taken: Set<number>): M[] {
  const [r, c] = rc(from);
  const out: M[] = [];
  for (const [dr, dc] of dirs(p)) {
    const mr = r + dr;
    const mc = c + dc;
    const lr = r + dr * 2;
    const lc = c + dc * 2;
    if (!on(lr, lc)) continue;
    const mid = b[sq(mr, mc)];
    if (!mid || mid.side === p.side || taken.has(sq(mr, mc)) || b[sq(lr, lc)]) continue;
    const nextPath = [...path, sq(lr, lc)];
    const crowned = !p.king && (lr === 0 || lr === 7);
    const more = crowned ? [] : jumpsFrom(b, sq(lr, lc), p, nextPath, new Set([...taken, sq(mr, mc)]));
    if (more.length) out.push(...more);
    else out.push(nextPath);
  }
  return out;
}

function allMoves(s: S): M[] {
  const jumps: M[] = [];
  const steps: M[] = [];
  s.b.forEach((p, i) => {
    if (!p || p.side !== s.turn) return;
    // Pieces jump over squares, so the board without this piece on its start square.
    const nb = [...s.b];
    nb[i] = null;
    jumps.push(...jumpsFrom(nb, i, p, [i], new Set()));
    const [r, c] = rc(i);
    for (const [dr, dc] of dirs(p)) if (on(r + dr, c + dc) && !s.b[sq(r + dr, c + dc)]) steps.push([i, sq(r + dr, c + dc)]);
  });
  return jumps.length ? jumps : steps;
}

function apply(s: S, m: M): S {
  const b = [...s.b];
  const p = { ...b[m[0]]! };
  b[m[0]] = null;
  let captured = false;
  for (let k = 1; k < m.length; k++) {
    const [r1, c1] = rc(m[k - 1]);
    const [r2, c2] = rc(m[k]);
    if (Math.abs(r2 - r1) === 2) {
      b[sq((r1 + r2) / 2, (c1 + c2) / 2)] = null;
      captured = true;
    }
  }
  const [lr] = rc(m[m.length - 1]);
  if (lr === 0 || lr === 7) p.king = true;
  b[m[m.length - 1]] = p;
  return { ...s, b, turn: 1 - s.turn, n: s.n + 1, quiet: captured ? 0 : s.quiet + 1, last: m };
}

function evaluate(b: Piece[], side: number) {
  let v = 0;
  b.forEach((p, i) => {
    if (!p) return;
    const [r] = rc(i);
    const worth = (p.king ? 1.7 : 1) + (p.king ? 0 : (p.side === 0 ? 7 - r : r) * 0.04);
    v += p.side === side ? worth : -worth;
  });
  return v;
}

function search(s: S, side: number, depth: number, a: number, b: number): number {
  const ms = allMoves(s);
  if (!ms.length) return s.turn === side ? -100 : 100;
  if (depth === 0) return evaluate(s.b, side);
  if (s.turn === side) {
    let v = -Infinity;
    for (const m of ms) {
      v = Math.max(v, search(apply(s, m), side, depth - 1, a, b));
      a = Math.max(a, v);
      if (a >= b) break;
    }
    return v;
  }
  let v = Infinity;
  for (const m of ms) {
    v = Math.min(v, search(apply(s, m), side, depth - 1, a, b));
    b = Math.min(b, v);
    if (a >= b) break;
  }
  return v;
}

export const rules: TurnRules<S, M> = {
  init: (seed) => {
    const b: Piece[] = Array(64).fill(null);
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 0) continue;
        if (r < 3) b[sq(r, c)] = { side: 1, king: false };
        if (r > 4) b[sq(r, c)] = { side: 0, king: false };
      }
    return { b, turn: 0, n: 0, seed, quiet: 0, last: [] };
  },
  turn: (s) => (s.quiet >= 80 || !allMoves(s).length ? -1 : s.turn),
  moves: allMoves,
  play: apply,
  winners: (s) => {
    if (s.quiet >= 80) return [0, 1];
    return allMoves(s).length ? null : [1 - s.turn];
  },
  bot: (s) => {
    const ms = allMoves(s);
    let best = ms[0];
    let bestV = -Infinity;
    ms.forEach((m, i) => {
      const v = search(apply(s, m), s.turn, 3, -Infinity, Infinity) + rnd(s, i) * 0.1;
      if (v > bestV) {
        bestV = v;
        best = m;
      }
    });
    return best;
  },
};

export function View({ s, seat, canMove, onMove }: TurnViewProps<S, M>) {
  const [from, setFrom] = useState<number | null>(null);
  const ms = canMove ? allMoves(s) : [];
  const flip = seat === 1;
  const fromHere = from === null ? [] : ms.filter((m) => m[0] === from);
  const targets = new Map(fromHere.map((m) => [m[m.length - 1], m]));
  const movable = new Set(ms.map((m) => m[0]));
  return (
    <div className="mx-auto grid aspect-square w-full max-w-sm grid-cols-8 overflow-hidden rounded-2xl border-4 border-[#5c3d22]">
      {Array.from({ length: 64 }, (_, k) => {
        const i = flip ? 63 - k : k;
        const [r, c] = rc(i);
        const dark = (r + c) % 2 === 1;
        const p = s.b[i];
        const target = targets.get(i);
        return (
          <button
            key={i}
            onClick={() => {
              if (target) {
                setFrom(null);
                onMove(target);
              } else if (movable.has(i)) setFrom(i);
              else setFrom(null);
            }}
            className={cn("relative grid place-items-center", dark ? "bg-[#8d5524]" : "bg-[#f1d9b5]", s.last.includes(i) && dark && "bg-[#a0663a]", from === i && "bg-[#e8590c]")}
            aria-label={p ? `${p.side === 0 ? "Red" : "Black"} ${p.king ? "king" : "piece"}` : "Square"}
          >
            {p && (
              <span className={cn("grid size-4/5 place-items-center rounded-full border-4 shadow", p.side === 0 ? "border-[#a51111] bg-[#e03131]" : "border-black bg-[#343a40]", movable.has(i) && !from && "ring-2 ring-gold")}>
                {p.king && <Crown className="size-4 text-gold" />}
              </span>
            )}
            {target && <span className="absolute size-3 rounded-full bg-gold" />}
          </button>
        );
      })}
    </div>
  );
}
