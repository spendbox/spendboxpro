"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { TurnRules, TurnViewProps } from "../types";
import { Act, Die, die, rnd } from "./common";

// Backgammon. Roll two dice and move a checker by each number (doubles move four times). You
// can't land where they have two or more; landing on a lone checker hits it onto the bar, and
// it must come back in before anything else moves. Bring all fifteen into your home board, then
// bear them off. First to bear off all fifteen wins.
// Points 0-23: seat 0 (white) moves from 23 down to 0 and bears off below 0; seat 1 (red) moves
// up and bears off past 23. Positive counts are white, negative red.

type S = { pts: number[]; bar: [number, number]; off: [number, number]; dice: number[]; rolled: [number, number] | null; turn: number; n: number; seed: number; log: string };
type M = { roll: true } | { from: number; to: number; d: number } | { pass: true };

const OFF0 = -1;
const OFF1 = 24;
const sign = (seat: number) => (seat === 0 ? 1 : -1);
const mine = (s: S, seat: number, i: number) => s.pts[i] * sign(seat) > 0;
const open = (s: S, seat: number, i: number) => s.pts[i] * sign(seat) >= -1;

function allHome(s: S, seat: number) {
  if (s.bar[seat]) return false;
  for (let i = 0; i < 24; i++) if (mine(s, seat, i) && (seat === 0 ? i > 5 : i < 18)) return false;
  return true;
}

function singleMoves(s: S): { from: number; to: number; d: number }[] {
  const me = s.turn;
  const out: { from: number; to: number; d: number }[] = [];
  const dice = [...new Set(s.dice)];
  if (s.bar[me]) {
    for (const d of dice) {
      const to = me === 0 ? 24 - d : d - 1;
      if (open(s, me, to)) out.push({ from: me === 0 ? 24 : -1, to, d });
    }
    return out;
  }
  const home = allHome(s, me);
  for (let i = 0; i < 24; i++) {
    if (!mine(s, me, i)) continue;
    for (const d of dice) {
      const to = me === 0 ? i - d : i + d;
      if (to >= 0 && to <= 23) {
        if (open(s, me, to)) out.push({ from: i, to, d });
      } else if (home) {
        const exact = me === 0 ? i + 1 === d : 24 - i === d;
        let furthest = true;
        if (!exact) for (let j = 0; j < 24; j++) if (mine(s, me, j) && (me === 0 ? j > i : j < i)) furthest = false;
        if (exact || furthest) out.push({ from: i, to: me === 0 ? OFF0 : OFF1, d });
      }
    }
  }
  return out;
}

function step(s: S, m: { from: number; to: number; d: number }): S {
  const me = s.turn;
  const pts = [...s.pts];
  const bar: [number, number] = [...s.bar];
  const off: [number, number] = [...s.off];
  if (m.from === 24 || m.from === -1) bar[me]--;
  else pts[m.from] -= sign(me);
  let log = "";
  if (m.to === OFF0 || m.to === OFF1) {
    off[me]++;
    log = "Bore off a checker";
  } else {
    if (pts[m.to] * sign(me) === -1) {
      pts[m.to] = 0;
      bar[1 - me]++;
      log = "Hit! Onto the bar";
    }
    pts[m.to] += sign(me);
  }
  const dice = [...s.dice];
  dice.splice(dice.indexOf(m.d), 1);
  const t: S = { ...s, pts, bar, off, dice, n: s.n + 1, log };
  if (!dice.length || off[me] === 15) return { ...t, turn: off[me] === 15 ? me : 1 - me, dice: [] };
  return t;
}

function pipCount(s: S, seat: number) {
  let p = s.bar[seat] * 25;
  for (let i = 0; i < 24; i++) if (mine(s, seat, i)) p += Math.abs(s.pts[i]) * (seat === 0 ? i + 1 : 24 - i);
  return p;
}

function evaluate(s: S, me: number) {
  let v = (pipCount(s, 1 - me) - pipCount(s, me)) + s.off[me] * 8 + s.bar[1 - me] * 12 - s.bar[me] * 12;
  for (let i = 0; i < 24; i++) {
    const c = s.pts[i] * sign(me);
    if (c >= 2) v += (me === 0 ? i <= 6 : i >= 17) ? 6 : 3;
    if (c === 1) v -= 5;
  }
  return v;
}

export const rules: TurnRules<S, M> = {
  init: (seed) => {
    const pts = Array(24).fill(0);
    pts[23] = 2;
    pts[12] = 5;
    pts[7] = 3;
    pts[5] = 5;
    pts[0] = -2;
    pts[11] = -5;
    pts[16] = -3;
    pts[18] = -5;
    return { pts, bar: [0, 0], off: [0, 0], dice: [], rolled: null, turn: 0, n: 0, seed, log: "" };
  },
  turn: (s) => (s.off[0] === 15 || s.off[1] === 15 ? -1 : s.turn),
  moves: (s) => {
    if (!s.dice.length) return [{ roll: true }];
    const ms = singleMoves(s);
    return ms.length ? ms : [{ pass: true }];
  },
  play: (s, m) => {
    if ("roll" in m) {
      const a = die(s, 0);
      const b = die(s, 1);
      return { ...s, dice: a === b ? [a, a, a, a] : [a, b], rolled: [a, b], n: s.n + 1, log: a === b ? "Doubles!" : "" };
    }
    if ("pass" in m) return { ...s, dice: [], turn: 1 - s.turn, n: s.n + 1, log: "No legal move" };
    return step(s, m);
  },
  winners: (s) => (s.off[0] === 15 ? [0] : s.off[1] === 15 ? [1] : null),
  scores: (s) => [...s.off],
  bot: (s) => {
    const ms = rules.moves(s);
    if (ms.length === 1) return ms[0];
    let best = ms[0];
    let bestV = -Infinity;
    for (const m of ms) {
      if (!("from" in m)) continue;
      const v = evaluate(step(s, m), s.turn) + rnd(s, m.from * 30 + m.d) * 0.5;
      if (v > bestV) {
        bestV = v;
        best = m;
      }
    }
    return best;
  },
};

function Point({ s, i, top, sel, target, onClick }: { s: S; i: number; top: boolean; sel: boolean; target: boolean; onClick: () => void }) {
  const n = Math.abs(s.pts[i]);
  const colour = s.pts[i] > 0 ? "#f8f9fa" : "#e03131";
  return (
    <button onClick={onClick} className={cn("relative flex h-full flex-col items-center", top ? "justify-start" : "justify-end", target && "bg-gold/30", sel && "bg-[#e8590c]/30")}>
      <svg viewBox="0 0 10 50" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <polygon points={top ? "0,0 10,0 5,46" : "0,50 10,50 5,4"} fill={i % 2 ? "#8d5524" : "#e9c46a"} />
      </svg>
      <span className={cn("relative z-10 flex flex-col items-center", top ? "" : "flex-col-reverse")}>
        {Array.from({ length: Math.min(n, 5) }, (_, k) => (
          <span key={k} className="size-[min(6.5vw,1.6rem)] rounded-full border border-black/30 shadow" style={{ background: colour }} />
        ))}
        {n > 5 && <span className="text-[10px] font-bold">{n}</span>}
      </span>
    </button>
  );
}

export function View({ s, seat, canMove, onMove, names }: TurnViewProps<S, M>) {
  const [sel, setSel] = useState<number | null>(null);
  const legal = canMove && s.dice.length ? singleMoves(s) : [];
  const fromHere = legal.filter((m) => m.from === sel);
  const targets = new Map(fromHere.map((m) => [m.to, m]));
  const froms = new Set(legal.map((m) => m.from));
  const tap = (i: number) => {
    const t = targets.get(i);
    if (t) {
      onMove(t);
      setSel(null);
    } else if (froms.has(i)) setSel(i);
    else setSel(null);
  };
  // Seat 0's view: top row 12..23 left to right, bottom row 11..0.
  const topRow = Array.from({ length: 12 }, (_, k) => 12 + k);
  const bottomRow = Array.from({ length: 12 }, (_, k) => 11 - k);
  // Seat 1 sees the board turned round.
  const rows = seat === 0 ? [topRow, bottomRow] : [Array.from({ length: 12 }, (_, k) => k), Array.from({ length: 12 }, (_, k) => 23 - k)];
  const barFrom = seat === 0 ? 24 : -1;
  const offTo = seat === 0 ? OFF0 : OFF1;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span>
          {names[0]} (white): {s.off[0]} off{s.bar[0] ? ` · ${s.bar[0]} on the bar` : ""}
        </span>
        <span>
          {names[1]} (red): {s.off[1]} off{s.bar[1] ? ` · ${s.bar[1]} on the bar` : ""}
        </span>
      </div>
      <div className="grid h-72 grid-rows-2 gap-2 rounded-2xl border-4 border-[#5c3d22] bg-[#2b6b3d] p-1">
        {rows.map((row, r) => (
          <div key={r} className="grid grid-cols-12">
            {row.map((i) => (
              <Point key={i} s={s} i={i} top={r === 0} sel={sel === i} target={targets.has(i)} onClick={() => tap(i)} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Die n={s.rolled?.[0] ?? null} className="size-9" />
        <Die n={s.rolled?.[1] ?? null} className="size-9" />
        <span className="min-w-0 flex-1 text-xs text-muted">{s.dice.length ? `To play: ${s.dice.join(", ")}` : s.log || "Roll to start your turn"}</span>
        {canMove && s.bar[seat] > 0 && (
          <button onClick={() => setSel(barFrom)} className={cn("rounded-xl px-3 py-2 text-xs font-bold", sel === barFrom ? "bg-[#e8590c] text-white" : "bg-panel-2")}>
            Bar ({s.bar[seat]})
          </button>
        )}
        {targets.has(offTo) && (
          <button onClick={() => tap(offTo)} className="rounded-xl bg-gold px-3 py-2 text-xs font-bold">
            Bear off
          </button>
        )}
      </div>
      {canMove && !s.dice.length && (
        <Act onClick={() => onMove({ roll: true })} tone="green">
          Roll
        </Act>
      )}
      {canMove && s.dice.length > 0 && !legal.length && <Act onClick={() => onMove({ pass: true })}>No move: pass</Act>}
    </div>
  );
}
