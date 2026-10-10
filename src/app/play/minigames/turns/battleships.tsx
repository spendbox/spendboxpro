"use client";

import { cn } from "@/lib/cn";
import type { TurnRules, TurnViewProps } from "../types";
import { hashRand } from "../rng";
import { rnd } from "./common";

// Battleships on 8 × 8 seas. Each side's fleet (4, 3, 3, 2 and 2 squares long) is placed at
// random from the seed. Fire at their sea; a hit goes again. Sink all five to win.

const N = 8;
const FLEET = [4, 3, 3, 2, 2];
type S = { ships: number[][][]; shots: number[][]; turn: number; n: number; seed: number; last: number };
type M = number;

function place(seed: number, side: number): number[][] {
  const taken = new Set<number>();
  const ships: number[][] = [];
  let k = 0;
  for (const len of FLEET) {
    for (;;) {
      k++;
      const across = hashRand(seed, side, k, 1) < 0.5;
      const r = Math.floor(hashRand(seed, side, k, 2) * (across ? N : N - len + 1));
      const c = Math.floor(hashRand(seed, side, k, 3) * (across ? N - len + 1 : N));
      const cells = Array.from({ length: len }, (_, i) => (across ? r * N + c + i : (r + i) * N + c));
      if (cells.some((x) => taken.has(x))) continue;
      cells.forEach((x) => taken.add(x));
      ships.push(cells);
      break;
    }
  }
  return ships;
}

const hit = (s: S, side: number, cell: number) => s.ships[side].some((sh) => sh.includes(cell));
const sunk = (s: S, side: number) => s.ships[side].filter((sh) => sh.every((c) => s.shots[1 - side].includes(c)));
const allSunk = (s: S, side: number) => sunk(s, side).length === FLEET.length;

export const rules: TurnRules<S, M> = {
  init: (seed) => ({ ships: [place(seed, 0), place(seed, 1)], shots: [[], []], turn: 0, n: 0, seed, last: -1 }),
  turn: (s) => (allSunk(s, 0) || allSunk(s, 1) ? -1 : s.turn),
  moves: (s) => Array.from({ length: N * N }, (_, i) => i).filter((i) => !s.shots[s.turn].includes(i)),
  play: (s, cell) => {
    const shots = s.shots.map((x) => [...x]);
    shots[s.turn].push(cell);
    const them = 1 - s.turn;
    const t = { ...s, shots, n: s.n + 1, last: cell };
    return { ...t, turn: hit(s, them, cell) ? s.turn : them };
  },
  winners: (s) => (allSunk(s, 1) ? [0] : allSunk(s, 0) ? [1] : null),
  scores: (s) => [sunk(s, 1).length, sunk(s, 0).length],
  bot: (s) => {
    const me = s.turn;
    const them = 1 - me;
    const mine = s.shots[me];
    const free = (i: number) => i >= 0 && i < N * N && !mine.includes(i);
    // Target mode: next to a hit that isn't part of a sunk ship.
    const sunkCells = new Set(sunk(s, them).flat());
    const hits = mine.filter((c) => hit(s, them, c) && !sunkCells.has(c));
    const near: number[] = [];
    for (const h of hits) {
      const r = Math.floor(h / N);
      const c = h % N;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < N && cc < N && free(rr * N + cc)) near.push(rr * N + cc);
      }
    }
    if (near.length) return near[Math.floor(rnd(s) * near.length)];
    // Hunt mode: a chequerboard pattern.
    const opts = rules.moves(s).filter((i) => (Math.floor(i / N) + (i % N)) % 2 === 0);
    const list = opts.length ? opts : rules.moves(s);
    return list[Math.floor(rnd(s, 1) * list.length)];
  },
};

function Sea({ s, side, shooter, showShips, onFire, canFire }: { s: S; side: number; shooter: number; showShips: boolean; onFire?: (i: number) => void; canFire: boolean }) {
  const sunkCells = new Set(sunk(s, side).flat());
  return (
    <div className="grid grid-cols-8 gap-0.5 rounded-xl bg-[#1864ab] p-1">
      {Array.from({ length: N * N }, (_, i) => {
        const shot = s.shots[shooter].includes(i);
        const ship = hit(s, side, i);
        return (
          <button
            key={i}
            onClick={() => onFire?.(i)}
            disabled={!canFire || shot}
            className={cn(
              "grid aspect-square place-items-center rounded-sm",
              sunkCells.has(i) ? "bg-[#495057]" : showShips && ship ? "bg-[#868e96]" : "bg-[#339af0]",
              canFire && !shot && "hover:bg-[#74c0fc]",
              s.last === i && shooter !== side && "ring-2 ring-gold",
            )}
            aria-label={shot ? (ship ? "Hit" : "Miss") : "Sea"}
          >
            {shot && <span className={cn("rounded-full", ship ? "size-3 bg-[#e03131]" : "size-1.5 bg-white/80")} />}
          </button>
        );
      })}
    </div>
  );
}

export function View({ s, seat, canMove, onMove, names }: TurnViewProps<S, M>) {
  const them = 1 - seat;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">
        {names[them]}&apos;s sea · {sunk(s, them).length}/5 sunk
      </p>
      <Sea s={s} side={them} shooter={seat} showShips={rules.turn(s) < 0} canFire={canMove} onFire={(i) => onMove(i)} />
      <p className="text-sm font-semibold">
        Your fleet · {sunk(s, seat).length}/5 sunk
      </p>
      <div className="mx-auto w-2/3">
        <Sea s={s} side={seat} shooter={them} showShips canFire={false} />
      </div>
    </div>
  );
}
