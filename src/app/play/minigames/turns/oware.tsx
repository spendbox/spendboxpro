"use client";

import { cn } from "@/lib/cn";
import type { TurnRules, TurnViewProps } from "../types";
import { rnd } from "./common";

// Ayo / Oware (abapa rules): twelve pits, four seeds each. Pick up all the seeds in one of your
// pits and sow them one by one anticlockwise (skipping the pit you started from). If your last
// seed makes 2 or 3 in one of their pits, you capture it, and the pits just before it in their
// row that have 2 or 3. You may not take all their seeds at once (then nothing is captured).
// If they have no seeds you must give them some if you can. More than 24 captured wins.

type S = { pits: number[]; store: [number, number]; turn: number; n: number; seed: number; last: number; over: boolean };
type M = number;

const own = (seat: number, i: number) => (seat === 0 ? i < 6 : i >= 6);

function sow(s: S, pit: number): S {
  const pits = [...s.pits];
  let seeds = pits[pit];
  pits[pit] = 0;
  let i = pit;
  while (seeds > 0) {
    i = (i + 1) % 12;
    if (i === pit) continue;
    pits[i]++;
    seeds--;
  }
  const store: [number, number] = [...s.store];
  // Captures.
  const taken: number[] = [];
  let k = i;
  while (!own(s.turn, k) && (pits[k] === 2 || pits[k] === 3)) {
    taken.push(k);
    k = (k + 11) % 12;
  }
  const theirs = pits.reduce((t, v, j) => t + (own(s.turn, j) ? 0 : v), 0);
  const haul = taken.reduce((t, j) => t + pits[j], 0);
  if (taken.length && haul < theirs) {
    for (const j of taken) pits[j] = 0;
    store[s.turn] += haul;
  }
  return { ...s, pits, store, turn: 1 - s.turn, n: s.n + 1, last: pit };
}

function legal(s: S): M[] {
  const mine = s.pits.map((v, i) => (own(s.turn, i) && v > 0 ? i : -1)).filter((i) => i >= 0);
  const theirSeeds = s.pits.reduce((t, v, i) => t + (own(s.turn, i) ? 0 : v), 0);
  if (theirSeeds > 0) return mine;
  // They have nothing: you must give them seeds if you can.
  return mine.filter((i) => {
    const after = sow(s, i);
    return after.pits.some((v, j) => !own(s.turn, j) && v > 0);
  });
}

function finished(s: S) {
  return s.over || s.store[0] > 24 || s.store[1] > 24 || s.n >= 300 || !legal(s).length;
}

function close(s: S): S {
  if (s.store[0] > 24 || s.store[1] > 24) return { ...s, over: true };
  if (s.n >= 300 || !legal(s).length) {
    // Nobody can go on: each side keeps the seeds on their own side.
    const store: [number, number] = [...s.store];
    s.pits.forEach((v, i) => (store[i < 6 ? 0 : 1] += v));
    return { ...s, store, pits: Array(12).fill(0), over: true };
  }
  return s;
}

function search(s: S, me: number, depth: number, a: number, b: number): number {
  if (finished(s) || depth === 0) {
    const c = finished(s) ? close(s) : s;
    return c.store[me] - c.store[1 - me];
  }
  const ms = legal(s);
  if (s.turn === me) {
    let v = -Infinity;
    for (const m of ms) {
      v = Math.max(v, search(sow(s, m), me, depth - 1, a, b));
      a = Math.max(a, v);
      if (a >= b) break;
    }
    return v;
  }
  let v = Infinity;
  for (const m of ms) {
    v = Math.min(v, search(sow(s, m), me, depth - 1, a, b));
    b = Math.min(b, v);
    if (a >= b) break;
  }
  return v;
}

export const rules: TurnRules<S, M> = {
  init: (seed) => ({ pits: Array(12).fill(4), store: [0, 0], turn: 0, n: 0, seed, last: -1, over: false }),
  turn: (s) => (finished(s) ? -1 : s.turn),
  moves: legal,
  play: (s, m) => close(sow(s, m)),
  winners: (s) => {
    if (!finished(s)) return null;
    const c = close(s);
    return c.store[0] === c.store[1] ? [0, 1] : [c.store[0] > c.store[1] ? 0 : 1];
  },
  scores: (s) => [...close(s).store],
  bot: (s) => {
    const ms = legal(s);
    let best = ms[0];
    let bestV = -Infinity;
    ms.forEach((m, i) => {
      const v = search(sow(s, m), s.turn, 5, -Infinity, Infinity) + rnd(s, i) * 0.5;
      if (v > bestV) {
        bestV = v;
        best = m;
      }
    });
    return best;
  },
};

function Pit({ n, onClick, can, last }: { n: number; onClick?: () => void; can: boolean; last: boolean }) {
  return (
    <button onClick={onClick} disabled={!can} className={cn("relative grid aspect-square place-items-center rounded-full bg-[#6b4423] shadow-inner", can && "ring-2 ring-gold", last && "bg-[#7d5230]")}>
      <span className="absolute inset-1 flex flex-wrap content-center items-center justify-center gap-0.5 p-1">
        {Array.from({ length: Math.min(n, 12) }, (_, k) => (
          <span key={k} className="size-1.5 rounded-full bg-[#e9ecef] shadow sm:size-2" />
        ))}
      </span>
      <span className="absolute -bottom-1 right-0 rounded-full bg-ink px-1 text-[10px] font-bold text-white">{n}</span>
    </button>
  );
}

export function View({ s, seat, canMove, onMove, names }: TurnViewProps<S, M>) {
  const ms = canMove ? legal(s) : [];
  // Your row at the bottom, left to right in sowing order; theirs along the top, right to left.
  const bottom = seat === 0 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];
  const top = seat === 0 ? [11, 10, 9, 8, 7, 6] : [5, 4, 3, 2, 1, 0];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>
          {names[1 - seat]}: <b>{s.store[1 - seat]}</b> captured
        </span>
        <span>
          {names[seat]}: <b>{s.store[seat]}</b> captured
        </span>
      </div>
      <div className="space-y-2 rounded-3xl bg-[#8d5524] p-3">
        <div className="grid grid-cols-6 gap-2">
          {top.map((i) => (
            <Pit key={i} n={s.pits[i]} can={false} last={s.last === i} />
          ))}
        </div>
        <div className="grid grid-cols-6 gap-2">
          {bottom.map((i) => (
            <Pit key={i} n={s.pits[i]} can={ms.includes(i)} onClick={() => onMove(i)} last={s.last === i} />
          ))}
        </div>
      </div>
      <p className="text-center text-xs text-muted">Seeds travel left to right along your row, then right to left along theirs.</p>
    </div>
  );
}
