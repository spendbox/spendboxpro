"use client";

import { cn } from "@/lib/cn";
import type { TurnRules, TurnViewProps } from "../types";
import { Act, Die, SEAT_COLOURS, die } from "./common";

// Snakes and Ladders: roll and move. Land at the foot of a ladder to climb it, on a snake's head
// to slide down. You need the exact number to land on 100 (too many and you bounce back). A six
// rolls again.

const JUMPS: Record<number, number> = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92, 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 95: 77, 99: 41 };
type S = { pos: number[]; turn: number; n: number; seed: number; last: { seat: number; roll: number; from: number; to: number; jump: number | null } | null; won: number };
type M = "roll";

export const rules: TurnRules<S, M> = {
  init: (seed, seats) => ({ pos: Array(seats).fill(0), turn: 0, n: 0, seed, last: null, won: -1 }),
  turn: (s) => (s.won >= 0 ? -1 : s.turn),
  moves: () => ["roll"],
  play: (s) => {
    const roll = die(s);
    const from = s.pos[s.turn];
    let to = from + roll;
    if (to > 100) to = 200 - to;
    const jump = JUMPS[to] ?? null;
    if (jump !== null) to = jump;
    const pos = [...s.pos];
    pos[s.turn] = to;
    const won = to === 100 ? s.turn : -1;
    return { ...s, pos, n: s.n + 1, last: { seat: s.turn, roll, from, to, jump }, won, turn: won >= 0 || roll === 6 ? s.turn : (s.turn + 1) % s.pos.length };
  },
  winners: (s) => (s.won >= 0 ? [s.won] : null),
  bot: () => "roll",
};

/** Where square n (1-100) is on the board: rows go back and forth, 1 at the bottom left. */
function cell(n: number) {
  const i = n - 1;
  const row = Math.floor(i / 10);
  const col = row % 2 ? 9 - (i % 10) : i % 10;
  return { x: col * 10 + 5, y: (9 - row) * 10 + 5 };
}

export function View({ s, canMove, onMove, names }: TurnViewProps<S, M>) {
  return (
    <div className="space-y-2">
      <svg viewBox="0 0 100 100" className="mx-auto w-full max-w-sm rounded-2xl">
        {Array.from({ length: 100 }, (_, i) => {
          const { x, y } = cell(i + 1);
          return (
            <g key={i}>
              <rect x={x - 5} y={y - 5} width={10} height={10} fill={(Math.floor(i / 10) + i) % 2 ? "#fff3bf" : "#d3f9d8"} />
              <text x={x - 4} y={y - 1.5} fontSize={2.6} fill="#868e96">
                {i + 1}
              </text>
            </g>
          );
        })}
        {Object.entries(JUMPS).map(([a, b]) => {
          const p = cell(Number(a));
          const q = cell(b);
          const up = b > Number(a);
          return up ? (
            <g key={a} stroke="#8d5524" strokeWidth={0.9}>
              <line x1={p.x - 1.5} y1={p.y} x2={q.x - 1.5} y2={q.y} />
              <line x1={p.x + 1.5} y1={p.y} x2={q.x + 1.5} y2={q.y} />
            </g>
          ) : (
            <g key={a}>
              <path d={`M${p.x},${p.y} Q${(p.x + q.x) / 2 + 8},${(p.y + q.y) / 2} ${q.x},${q.y}`} stroke="#2f9e44" strokeWidth={2} fill="none" strokeLinecap="round" />
              <circle cx={p.x} cy={p.y} r={2} fill="#2b8a3e" />
            </g>
          );
        })}
        {s.pos.map((p, i) => {
          if (!p) return null;
          const { x, y } = cell(p);
          return <circle key={i} cx={x + (i % 2 ? 2 : -2)} cy={y + (i > 1 ? 2 : -1)} r={2.6} fill={SEAT_COLOURS[i]} stroke="#fff" strokeWidth={0.6} />;
        })}
      </svg>
      <div className="flex items-center gap-3">
        <Die n={s.last?.roll ?? null} className="size-11" />
        <p className={cn("min-w-0 flex-1 text-sm")}>
          {s.last
            ? `${names[s.last.seat]} rolled ${s.last.roll}${s.last.jump !== null ? (s.last.to > s.last.from ? ": up a ladder!" : ": down a snake!") : ""}${s.last.roll === 6 && s.won < 0 ? " Roll again." : ""}`
            : "Everyone starts off the board."}
        </p>
        <div className="w-28">
          <Act onClick={() => onMove("roll")} disabled={!canMove} tone="green">
            Roll
          </Act>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {s.pos.map((p, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="size-3 rounded-full" style={{ background: SEAT_COLOURS[i] }} /> {names[i]}: {p || "start"}
          </span>
        ))}
      </div>
    </div>
  );
}
