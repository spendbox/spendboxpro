"use client";

import { cn } from "@/lib/cn";
import type { TurnRules, TurnViewProps } from "../types";
import { Act, Die, SEAT_COLOURS, die, rnd } from "./common";

// Town Tycoon: race round a town of 20 squares. Roll two dice and move. Land on a street nobody
// owns and you can buy it; land on someone else's and pay them rent (double if they own both
// streets of that colour). Chance squares surprise you, tax costs 100, passing GO pays 150.
// After 12 rounds the richest (cash plus streets) wins. Run out of money and you're out.

const ROUNDS = 12;
const GROUP_COLOURS = ["#8d5524", "#74c0fc", "#e64980", "#f08c00", "#e03131", "#fab005", "#2f9e44"];
const NAMES = ["Adeola Close", "Allen Avenue", "Harvey Road", "Maple Street", "Ring Road", "Oak Avenue", "Ikoyi Crescent", "Kenyatta Avenue", "Kings Road", "Market Street", "Marina", "Broad Street", "Victoria Island", "Banana Island"];
type Sq = { kind: "go" | "street" | "chance" | "tax" | "rest"; name: string; group?: number; price?: number };
const BOARD: Sq[] = (() => {
  const layout = ["go", "s", "chance", "s", "tax", "s", "s", "chance", "s", "s", "rest", "s", "s", "chance", "s", "s", "s", "s", "s", "s"];
  let k = 0;
  return layout.map((t): Sq => {
    if (t === "go") return { kind: "go", name: "GO" };
    if (t === "chance") return { kind: "chance", name: "Chance" };
    if (t === "tax") return { kind: "tax", name: "Tax" };
    if (t === "rest") return { kind: "rest", name: "Market day" };
    const group = Math.floor(k / 2);
    return { kind: "street", name: NAMES[k++], group, price: 60 + group * 40 };
  });
})();
const CHANCE: [string, number][] = [
  ["You won a dance-off: +100", 100],
  ["Danfo fare: −40", -40],
  ["Your shop had a great day: +80", 80],
  ["Generator fuel: −80", -80],
  ["A friend paid you back: +50", 50],
  ["Phone screen cracked: −60", -60],
];

type S = { pos: number[]; cash: number[]; owner: (number | null)[]; out: boolean[]; turn: number; turns: number; phase: "roll" | "buy"; rolled: [number, number] | null; n: number; seed: number; log: string; seats: number };
type M = { roll: true } | { buy: true } | { skip: true };

const worth = (s: S, seat: number) => s.cash[seat] + s.owner.reduce((t: number, o, i) => t + (o === seat ? (BOARD[i].price ?? 0) : 0), 0);
const over = (s: S) => s.turns >= ROUNDS * s.seats || s.out.filter((o) => !o).length <= 1;
function rent(s: S, i: number) {
  const sq = BOARD[i];
  const base = Math.round((sq.price ?? 0) / 6);
  const pair = BOARD.map((b, j) => (b.group === sq.group ? j : -1)).filter((j) => j >= 0);
  return pair.every((j) => s.owner[j] === s.owner[i]) ? base * 2 : base;
}
function nextTurn(s: S): S {
  let t = s.turn;
  for (let k = 0; k < s.seats; k++) {
    t = (t + 1) % s.seats;
    if (!s.out[t]) break;
  }
  return { ...s, turn: t, phase: "roll", turns: s.turns + 1 };
}

export const rules: TurnRules<S, M> = {
  init: (seed, seats) => ({ pos: Array(seats).fill(0), cash: Array(seats).fill(1000), owner: BOARD.map(() => null), out: Array(seats).fill(false), turn: 0, turns: 0, phase: "roll", rolled: null, n: 0, seed, log: "", seats }),
  turn: (s) => (over(s) ? -1 : s.turn),
  moves: (s) => (s.phase === "roll" ? [{ roll: true }] : [{ buy: true }, { skip: true }]),
  play: (s0, m) => {
    const s: S = { ...s0, pos: [...s0.pos], cash: [...s0.cash], owner: [...s0.owner], out: [...s0.out], n: s0.n + 1 };
    const me = s.turn;
    if ("buy" in m) {
      const i = s.pos[me];
      s.cash[me] -= BOARD[i].price ?? 0;
      s.owner[i] = me;
      s.log = `Bought ${BOARD[i].name}`;
      return nextTurn(s);
    }
    if ("skip" in m) {
      s.log = "Didn't buy";
      return nextTurn(s);
    }
    const a = die(s0, 0);
    const b = die(s0, 1);
    s.rolled = [a, b];
    let to = s.pos[me] + a + b;
    if (to >= BOARD.length) {
      to -= BOARD.length;
      s.cash[me] += 150;
    }
    s.pos[me] = to;
    const sq = BOARD[to];
    s.log = `Rolled ${a + b}: ${sq.name}`;
    if (sq.kind === "street") {
      const o = s.owner[to];
      if (o === null) {
        if (s.cash[me] >= (sq.price ?? 0)) {
          s.phase = "buy";
          return s;
        }
      } else if (o !== me) {
        const r = rent(s, to);
        s.cash[me] -= r;
        s.cash[o] += r;
        s.log += `: paid ${r} rent`;
      }
    } else if (sq.kind === "tax") {
      s.cash[me] -= 100;
      s.log += ": paid 100";
    } else if (sq.kind === "chance") {
      const [text, amount] = CHANCE[Math.floor(rnd(s0, 9) * CHANCE.length)];
      s.cash[me] += amount;
      s.log = `Chance: ${text}`;
    }
    if (s.cash[me] < 0) {
      s.out[me] = true;
      s.owner = s.owner.map((o) => (o === me ? null : o));
      s.log += ". Bankrupt!";
    }
    return nextTurn(s);
  },
  winners: (s) => {
    if (!over(s)) return null;
    const vals = s.cash.map((_, i) => (s.out[i] ? -Infinity : worth(s, i)));
    const best = Math.max(...vals);
    return vals.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
  },
  scores: (s) => s.cash.map((_, i) => worth(s, i)),
  bot: (s) => {
    if (s.phase === "roll") return { roll: true };
    const price = BOARD[s.pos[s.turn]].price ?? 0;
    return s.cash[s.turn] - price > 150 + rnd(s) * 200 ? { buy: true } : { skip: true };
  },
};

/** Where square i sits round a 6 × 6 grid (clockwise from the bottom right). */
function spot(i: number): [number, number] {
  if (i <= 5) return [5 - i, 5];
  if (i <= 10) return [0, 5 - (i - 5)];
  if (i <= 15) return [i - 10, 0];
  return [5, i - 15];
}

export function View({ s, seat, canMove, onMove, names }: TurnViewProps<S, M>) {
  const here = BOARD[s.pos[s.turn]];
  return (
    <div className="space-y-2">
      <div className="relative mx-auto grid aspect-square w-full max-w-sm grid-cols-6 grid-rows-6 gap-0.5 rounded-2xl bg-[#d3f9d8] p-1">
        {BOARD.map((sq, i) => {
          const [x, y] = spot(i);
          const o = s.owner[i];
          return (
            <div key={i} className="relative flex flex-col overflow-hidden rounded-md bg-white text-[8px] leading-tight sm:text-[9px]" style={{ gridColumn: x + 1, gridRow: y + 1 }}>
              {sq.kind === "street" && <span className="h-1.5 shrink-0" style={{ background: GROUP_COLOURS[sq.group!] }} />}
              <span className="px-0.5 font-semibold">{sq.name}</span>
              {sq.price && <span className="px-0.5 text-muted">{sq.price}</span>}
              {o !== null && <span className="absolute bottom-0.5 right-0.5 size-2 rounded-full" style={{ background: SEAT_COLOURS[o] }} />}
              <span className="absolute bottom-0.5 left-0.5 flex gap-0.5">
                {s.pos.map((p, k) => (p === i && !s.out[k] ? <span key={k} className="size-2.5 rounded-full border border-white" style={{ background: SEAT_COLOURS[k] }} /> : null))}
              </span>
            </div>
          );
        })}
        <div className="col-span-4 col-start-2 row-span-4 row-start-2 flex flex-col items-center justify-center gap-1 p-2 text-center">
          <p className="font-display text-lg font-extrabold">Town Tycoon</p>
          <div className="flex gap-1">
            <Die n={s.rolled?.[0] ?? null} className="size-8" />
            <Die n={s.rolled?.[1] ?? null} className="size-8" />
          </div>
          <p className="text-xs">{s.log}</p>
          <p className="text-[10px] text-muted">
            Round {Math.min(ROUNDS, Math.floor(s.turns / s.seats) + 1)} of {ROUNDS}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs">
        {s.cash.map((c, i) => (
          <span key={i} className={cn("flex items-center gap-1 rounded-lg px-2 py-1", s.turn === i ? "bg-ink text-white" : "bg-panel-2", s.out[i] && "line-through opacity-50", i === seat && "font-bold")}>
            <span className="size-2.5 rounded-full" style={{ background: SEAT_COLOURS[i] }} /> {names[i]}: {c} cash · worth {worth(s, i)}
          </span>
        ))}
      </div>
      {canMove && s.phase === "roll" && (
        <Act onClick={() => onMove({ roll: true })} tone="green">
          Roll
        </Act>
      )}
      {canMove && s.phase === "buy" && (
        <div className="flex gap-2">
          <Act onClick={() => onMove({ buy: true })} tone="green">
            Buy {here.name} for {here.price}
          </Act>
          <Act onClick={() => onMove({ skip: true })} tone="soft">
            No thanks
          </Act>
        </div>
      )}
    </div>
  );
}
