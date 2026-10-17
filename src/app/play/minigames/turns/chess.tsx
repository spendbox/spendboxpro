"use client";

import { useState } from "react";
import type { TurnRules, TurnViewProps } from "../types";
import { rnd } from "./common";
import { FullBoard } from "./full-board";

// Chess with the full rules: castling, en passant, pawns that reach the end become queens,
// check, checkmate and stalemate (and a draw after 100 moves with no capture or pawn move).
// Seat 0 plays white (at the bottom). The bot looks three moves ahead. Played full screen on a
// 3D board (./full-board).

type Side = "w" | "b";
type Piece = `${Side}${"P" | "N" | "B" | "R" | "Q" | "K"}`;
type S = { b: (Piece | null)[]; turn: number; castle: string; ep: number; quiet: number; n: number; seed: number; last: number[] };
type M = { f: number; t: number };

const side = (s: S): Side => (s.turn === 0 ? "w" : "b");
const rc = (i: number) => [i >> 3, i & 7];
const on = (r: number, c: number) => r >= 0 && c >= 0 && r < 8 && c < 8;
const VAL: Record<string, number> = { P: 100, N: 300, B: 320, R: 500, Q: 900, K: 0 };

function attacked(b: (Piece | null)[], i: number, by: Side) {
  const [r, c] = rc(i);
  const at = (rr: number, cc: number) => (on(rr, cc) ? b[rr * 8 + cc] : null);
  const pr = by === "w" ? 1 : -1; // a white pawn attacks from the row below
  if (at(r + pr, c - 1) === `${by}P` || at(r + pr, c + 1) === `${by}P`) return true;
  for (const [dr, dc] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) if (at(r + dr, c + dc) === `${by}N`) return true;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && at(r + dr, c + dc) === `${by}K`) return true;
  for (const [dr, dc, kinds] of [[1, 0, "RQ"], [-1, 0, "RQ"], [0, 1, "RQ"], [0, -1, "RQ"], [1, 1, "BQ"], [1, -1, "BQ"], [-1, 1, "BQ"], [-1, -1, "BQ"]] as const) {
    let rr = r + dr;
    let cc = c + dc;
    while (on(rr, cc)) {
      const p = b[rr * 8 + cc];
      if (p) {
        if (p[0] === by && kinds.includes(p[1])) return true;
        break;
      }
      rr += dr;
      cc += dc;
    }
  }
  return false;
}

function pseudo(s: S): M[] {
  const me = side(s);
  const out: M[] = [];
  const add = (f: number, t: number) => out.push({ f, t });
  s.b.forEach((p, i) => {
    if (!p || p[0] !== me) return;
    const [r, c] = rc(i);
    const kind = p[1];
    if (kind === "P") {
      const dir = me === "w" ? -1 : 1;
      const start = me === "w" ? 6 : 1;
      if (on(r + dir, c) && !s.b[(r + dir) * 8 + c]) {
        add(i, (r + dir) * 8 + c);
        if (r === start && !s.b[(r + dir * 2) * 8 + c]) add(i, (r + dir * 2) * 8 + c);
      }
      for (const dc of [-1, 1]) {
        if (!on(r + dir, c + dc)) continue;
        const t = (r + dir) * 8 + c + dc;
        const q = s.b[t];
        if ((q && q[0] !== me) || t === s.ep) add(i, t);
      }
    } else if (kind === "N" || kind === "K") {
      const deltas = kind === "N" ? [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]] : [[1, 1], [1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, 0], [-1, -1]];
      for (const [dr, dc] of deltas) {
        if (!on(r + dr, c + dc)) continue;
        const t = (r + dr) * 8 + c + dc;
        if (!s.b[t] || s.b[t]![0] !== me) add(i, t);
      }
      if (kind === "K") {
        const row = me === "w" ? 7 : 0;
        const them: Side = me === "w" ? "b" : "w";
        if (i === row * 8 + 4 && !attacked(s.b, i, them)) {
          if (s.castle.includes(me === "w" ? "K" : "k") && !s.b[row * 8 + 5] && !s.b[row * 8 + 6] && !attacked(s.b, row * 8 + 5, them)) add(i, row * 8 + 6);
          if (s.castle.includes(me === "w" ? "Q" : "q") && !s.b[row * 8 + 3] && !s.b[row * 8 + 2] && !s.b[row * 8 + 1] && !attacked(s.b, row * 8 + 3, them)) add(i, row * 8 + 2);
        }
      }
    } else {
      const lines = kind === "R" ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : kind === "B" ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dr, dc] of lines) {
        let rr = r + dr;
        let cc = c + dc;
        while (on(rr, cc)) {
          const t = rr * 8 + cc;
          if (s.b[t]) {
            if (s.b[t]![0] !== me) add(i, t);
            break;
          }
          add(i, t);
          rr += dr;
          cc += dc;
        }
      }
    }
  });
  return out;
}

function apply(s: S, m: M): S {
  const b = [...s.b];
  const p = b[m.f]!;
  const me = p[0] as Side;
  const captured = b[m.t] || (p[1] === "P" && m.t === s.ep);
  b[m.t] = p;
  b[m.f] = null;
  let ep = -1;
  if (p[1] === "P") {
    if (m.t === s.ep) b[m.t + (me === "w" ? 8 : -8)] = null;
    if (Math.abs(m.t - m.f) === 16) ep = (m.t + m.f) / 2;
    if (m.t >> 3 === 0 || m.t >> 3 === 7) b[m.t] = `${me}Q`;
  }
  if (p[1] === "K" && Math.abs(m.t - m.f) === 2) {
    // Castling: the rook jumps over.
    if (m.t % 8 === 6) {
      b[m.t - 1] = b[m.t + 1];
      b[m.t + 1] = null;
    } else {
      b[m.t + 1] = b[m.t - 2];
      b[m.t - 2] = null;
    }
  }
  let castle = s.castle;
  const drop = (ch: string) => (castle = castle.replace(ch, ""));
  if (p === "wK") {
    drop("K");
    drop("Q");
  }
  if (p === "bK") {
    drop("k");
    drop("q");
  }
  if (m.f === 63 || m.t === 63) drop("K");
  if (m.f === 56 || m.t === 56) drop("Q");
  if (m.f === 7 || m.t === 7) drop("k");
  if (m.f === 0 || m.t === 0) drop("q");
  return { ...s, b, turn: 1 - s.turn, castle, ep, quiet: captured || p[1] === "P" ? 0 : s.quiet + 1, n: s.n + 1, last: [m.f, m.t] };
}

function inCheck(b: (Piece | null)[], me: Side) {
  const k = b.indexOf(`${me}K`);
  return k >= 0 && attacked(b, k, me === "w" ? "b" : "w");
}

function legal(s: S): M[] {
  const me = side(s);
  return pseudo(s).filter((m) => !inCheck(apply(s, m).b, me));
}

const CENTRE = [0, 1, 2, 3, 3, 2, 1, 0];
function evaluate(s: S, me: Side) {
  let v = 0;
  s.b.forEach((p, i) => {
    if (!p) return;
    const [r, c] = rc(i);
    let w = VAL[p[1]];
    if (p[1] === "N" || p[1] === "B") w += (CENTRE[r] + CENTRE[c]) * 4;
    if (p[1] === "P") w += (p[0] === "w" ? 6 - r : r - 1) * 6 + CENTRE[c] * 2;
    v += p[0] === me ? w : -w;
  });
  return v;
}

function search(s: S, me: Side, depth: number, a: number, b: number): number {
  const ms = legal(s);
  if (!ms.length) return inCheck(s.b, side(s)) ? (side(s) === me ? -100000 - depth : 100000 + depth) : 0;
  if (depth === 0) return evaluate(s, me);
  // Captures first (better pruning).
  ms.sort((x, y) => (s.b[y.t] ? VAL[s.b[y.t]![1]] : 0) - (s.b[x.t] ? VAL[s.b[x.t]![1]] : 0));
  if (side(s) === me) {
    let v = -Infinity;
    for (const m of ms) {
      v = Math.max(v, search(apply(s, m), me, depth - 1, a, b));
      a = Math.max(a, v);
      if (a >= b) break;
    }
    return v;
  }
  let v = Infinity;
  for (const m of ms) {
    v = Math.min(v, search(apply(s, m), me, depth - 1, a, b));
    b = Math.min(b, v);
    if (a >= b) break;
  }
  return v;
}

export const rules: TurnRules<S, M> = {
  init: (seed) => {
    const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
    const b: (Piece | null)[] = Array(64).fill(null);
    back.forEach((k, c) => {
      b[c] = `b${k}` as Piece;
      b[8 + c] = "bP";
      b[48 + c] = "wP";
      b[56 + c] = `w${k}` as Piece;
    });
    return { b, turn: 0, castle: "KQkq", ep: -1, quiet: 0, n: 0, seed, last: [] };
  },
  turn: (s) => (s.quiet >= 100 || !legal(s).length ? -1 : s.turn),
  moves: legal,
  play: apply,
  winners: (s) => {
    if (s.quiet >= 100) return [0, 1];
    if (legal(s).length) return null;
    return inCheck(s.b, side(s)) ? [1 - s.turn] : [0, 1];
  },
  bot: (s) => {
    const me = side(s);
    const ms = legal(s);
    let best = ms[0];
    let bestV = -Infinity;
    ms.forEach((m, i) => {
      const v = search(apply(s, m), me, 2, -Infinity, Infinity) + rnd(s, i) * 12;
      if (v > bestV) {
        bestV = v;
        best = m;
      }
    });
    return best;
  },
};

export function View({ s, seat, canMove, onMove, names, kinds, onQuit }: TurnViewProps<S, M>) {
  const [from, setFrom] = useState<number | null>(null);
  const ms = canMove ? legal(s) : [];
  const targets = new Set(ms.filter((m) => m.f === from).map((m) => m.t));
  const movable = new Set(ms.map((m) => m.f));
  const check = inCheck(s.b, side(s));
  const over = rules.turn(s) < 0;
  const won = over ? (rules.winners(s) ?? []) : [];
  const them = 1 - seat;
  const lost = (sd: Side) => 16 - s.b.filter((p) => p && p[0] === sd).length;
  const sideOf = (i: number) => ({
    name: names[i] ?? (i ? "Black" : "White"),
    colour: i ? "#1b1716" : "#f2e8d5",
    ring: i ? "#adb5bd" : "#ffe8a3",
    label: i ? "Black" : "White",
    taken: lost(i ? "w" : "b"),
  });
  const waiting = kinds?.[s.turn] === "remote" ? `Waiting for ${names[s.turn]}…` : `${names[s.turn]} is thinking…`;
  const status = canMove ? (check ? "Check!" : from === null ? "Your move" : "Now tap where it goes") : check ? "Check!" : waiting;
  const result = (() => {
    if (!over) return null;
    if (won.length !== 1) return { title: "A draw", sub: s.quiet >= 100 ? "Fifty moves each with no capture or pawn move." : "Stalemate: no legal move, but no check.", won: false };
    const mine = won[0] === seat || kinds?.[won[0]] === "local";
    return { title: mine && kinds?.[won[0]] !== "local" ? "You won!" : `${names[won[0]]} wins`, sub: "Checkmate.", won: mine };
  })();
  return (
    <FullBoard
      style="chess"
      board={s.b}
      last={s.last}
      flip={seat === 1}
      pickable={movable}
      selected={from}
      targets={targets}
      danger={check ? s.b.indexOf(`${side(s)}K`) : null}
      onSquare={(i) => {
        if (from !== null && targets.has(i)) {
          onMove({ f: from, t: i });
          setFrom(null);
        } else if (movable.has(i)) setFrom(i === from ? null : i);
        else setFrom(null);
      }}
      me={sideOf(seat)}
      them={sideOf(them)}
      myTurn={canMove}
      theirTurn={!canMove && !over}
      status={status}
      over={result}
      onQuit={onQuit}
    />
  );
}
