"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { TurnRules, TurnViewProps } from "../types";
import { Act, rnd, seededShuffle } from "./common";

// Dominoes (the draw game, double-six): 7 tiles each with two players, 5 with more. Play a tile
// that matches either open end of the line. Can't play? Draw from the boneyard (or pass when
// it's empty). First to play out wins; if nobody can play, the fewest pips wins.

type Tile = [number, number];
type S = { hands: Tile[][]; bone: Tile[]; line: Tile[]; ends: [number, number] | null; turn: number; n: number; seed: number; passes: number; won: number[] | null; log: string };
type M = { tile: Tile; end: 0 | 1 } | { draw: true } | { pass: true };

const same = (a: Tile, b: Tile) => a[0] === b[0] && a[1] === b[1];
const pips = (h: Tile[]) => h.reduce((t, [a, b]) => t + a + b, 0);

function fits(s: S, t: Tile): (0 | 1)[] {
  if (!s.ends) return [0];
  const out: (0 | 1)[] = [];
  if (t[0] === s.ends[0] || t[1] === s.ends[0]) out.push(0);
  if (t[0] === s.ends[1] || t[1] === s.ends[1]) out.push(1);
  return out;
}

export const rules: TurnRules<S, M> = {
  init: (seed, seats) => {
    const all: Tile[] = [];
    for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) all.push([a, b]);
    const bone = seededShuffle(seed, all);
    const k = seats === 2 ? 7 : 5;
    const hands = Array.from({ length: seats }, () => bone.splice(0, k));
    // Whoever holds the highest double starts.
    let start = 0;
    let high = -1;
    hands.forEach((h, i) => h.forEach(([a, b]) => a === b && a > high && ((high = a), (start = i))));
    return { hands, bone, line: [], ends: null, turn: start, n: 0, seed, passes: 0, won: null, log: "" };
  },
  turn: (s) => (s.won ? -1 : s.turn),
  moves: (s) => {
    const out: M[] = [];
    for (const t of s.hands[s.turn]) for (const end of fits(s, t)) out.push({ tile: t, end });
    if (!out.length) out.push(s.bone.length ? { draw: true } : { pass: true });
    return out;
  },
  play: (s0, m) => {
    const s: S = { ...s0, hands: s0.hands.map((h) => [...h]), bone: [...s0.bone], line: [...s0.line], n: s0.n + 1 };
    const me = s.turn;
    if ("draw" in m) {
      s.hands[me].push(s.bone.shift()!);
      s.log = "Drew from the boneyard";
      return s; // keep going until you can play or the boneyard is empty
    }
    if ("pass" in m) {
      s.passes++;
      s.log = "Passed";
      s.turn = (me + 1) % s.hands.length;
      if (s.passes >= s.hands.length) {
        const low = Math.min(...s.hands.map(pips));
        s.won = s.hands.map((h, i) => (pips(h) === low ? i : -1)).filter((i) => i >= 0);
        s.log = "Blocked! Fewest pips wins";
      }
      return s;
    }
    const h = s.hands[me];
    h.splice(h.findIndex((t) => same(t, m.tile)), 1);
    let [a, b] = m.tile;
    if (!s.ends) {
      s.line = [[a, b]];
      s.ends = [a, b];
    } else if (m.end === 0) {
      if (b !== s.ends[0]) [a, b] = [b, a];
      s.line.unshift([a, b]);
      s.ends = [a, s.ends[1]];
    } else {
      if (a !== s.ends[1]) [a, b] = [b, a];
      s.line.push([a, b]);
      s.ends = [s.ends[0], b];
    }
    s.passes = 0;
    s.log = "";
    if (!h.length) {
      s.won = [me];
      s.log = "Domino!";
    }
    s.turn = (me + 1) % s.hands.length;
    return s;
  },
  winners: (s) => s.won,
  scores: (s) => s.hands.map(pips),
  bot: (s) => {
    const ms = rules.moves(s);
    if (!("tile" in ms[0])) return ms[0];
    // Play the heaviest tile (doubles first) that fits.
    const score = (m: M) => ("tile" in m ? m.tile[0] + m.tile[1] + (m.tile[0] === m.tile[1] ? 3 : 0) + rnd(s, m.tile[0] * 7 + m.tile[1]) : 0);
    return ms.reduce((a, b) => (score(b) > score(a) ? b : a));
  },
};

const DOTS: Record<number, [number, number][]> = {
  0: [],
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 20], [75, 20], [25, 50], [75, 50], [25, 80], [75, 80]],
};
function Half({ n }: { n: number }) {
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      {DOTS[n].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={10} fill="#212529" />
      ))}
    </svg>
  );
}
function Domino({ t, vertical, onClick, selected, small }: { t: Tile; vertical?: boolean; onClick?: () => void; selected?: boolean; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn("flex shrink-0 rounded-md border-2 border-[#adb5bd] bg-[#fffdf5] shadow", vertical ? "flex-col" : "flex-row", small ? (vertical ? "h-12 w-6" : "h-6 w-12") : vertical ? "h-16 w-8" : "h-8 w-16", selected && "-translate-y-1 border-gold ring-2 ring-gold")}
    >
      <span className={cn("flex-1", vertical ? "border-b" : "border-r", "border-[#adb5bd]")}>
        <Half n={t[0]} />
      </span>
      <span className="flex-1">
        <Half n={t[1]} />
      </span>
    </button>
  );
}

export function View({ s, seat, canMove, onMove, names }: TurnViewProps<S, M>) {
  const [sel, setSel] = useState<Tile | null>(null);
  const hand = s.hands[seat] ?? [];
  const legal = canMove ? rules.moves(s) : [];
  const playable = (t: Tile) => legal.some((m) => "tile" in m && same(m.tile, t));
  const endsFor = sel ? fits(s, sel) : [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {s.hands.map((h, i) =>
          i === seat ? null : (
            <span key={i} className={cn("rounded-full px-2 py-1", s.turn === i ? "bg-ink text-white" : "bg-panel-2")}>
              {names[i]}: {h.length} tiles
            </span>
          ),
        )}
        <span className="rounded-full bg-panel-2 px-2 py-1">Boneyard {s.bone.length}</span>
      </div>
      <div className="flex min-h-20 items-center gap-0.5 overflow-x-auto rounded-3xl bg-[#2b8a3e] p-3">
        {canMove && sel && endsFor.includes(0) && s.ends && (
          <button onClick={() => (onMove({ tile: sel, end: 0 }), setSel(null))} className="h-10 shrink-0 rounded-lg bg-gold px-2 text-xs font-bold">
            Here
          </button>
        )}
        {s.line.map((t, i) => (
          <Domino key={i} t={t} small vertical={t[0] === t[1]} />
        ))}
        {!s.line.length && <span className="mx-auto text-sm text-white/70">Play the first tile</span>}
        {canMove && sel && (endsFor.includes(1) || !s.ends) && (
          <button onClick={() => (onMove({ tile: sel, end: s.ends ? 1 : 0 }), setSel(null))} className="h-10 shrink-0 rounded-lg bg-gold px-2 text-xs font-bold">
            Here
          </button>
        )}
      </div>
      <p className="h-5 text-center text-sm font-bold">{s.log}</p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {hand.map((t, i) => (
          <Domino key={i} t={t} vertical selected={sel !== null && same(sel, t)} onClick={canMove && playable(t) ? () => setSel(t) : undefined} />
        ))}
      </div>
      {canMove && !legal.some((m) => "tile" in m) && (
        <Act onClick={() => onMove(s.bone.length ? { draw: true } : { pass: true })} tone="soft">
          {s.bone.length ? "Draw from the boneyard" : "Pass"}
        </Act>
      )}
      {canMove && legal.some((m) => "tile" in m) && <p className="text-center text-xs text-muted">Tap a tile, then where it goes.</p>}
    </div>
  );
}
