"use client";

import { useState } from "react";
import { Circle, Plus, Square, Star, Triangle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TurnRules, TurnViewProps } from "../types";
import { Act, rnd, seededShuffle } from "./common";

// Whot! as played in Nigeria: five cards each. Play a card with the same shape or the same
// number as the top card (a Whot, 20, goes on anything and asks for a shape). Can't play? Go to
// market (draw one). Specials: 1 hold on (play again), 2 pick two and 5 pick three (the next
// player draws and misses their go), 8 suspension (the next player misses a go), 14 general
// market (everyone else draws one). First to empty their hand wins; if the market runs dry, the
// lowest hand (stars count double) wins.

const SHAPES = ["Circle", "Triangle", "Cross", "Square", "Star"];
const SHAPE_ICONS = [Circle, Triangle, Plus, Square, Star];
const SHAPE_COLOUR = "#7a1f2b";
const NUMBERS: number[][] = [
  [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  [1, 2, 3, 5, 7, 10, 11, 13, 14],
  [1, 2, 3, 5, 7, 10, 11, 13, 14],
  [1, 2, 3, 4, 5, 7, 8],
];
const WHOT = 520; // shape 5, value 20
const shapeOf = (c: number) => Math.floor(c / 100);
const valueOf = (c: number) => c % 100;
const SPECIAL = new Set([1, 2, 5, 8, 14, 20]);

type S = { hands: number[][]; market: number[]; top: number; ask: number | null; turn: number; n: number; seed: number; won: number[] | null; log: string };
type M = { play: number; ask?: number } | { draw: true };

function nextSeat(s: S, from: number, skip = 0) {
  return (from + 1 + skip) % s.hands.length;
}
function playable(s: S, c: number) {
  if (c === WHOT) return true;
  if (s.top === WHOT) return s.ask === null || shapeOf(c) === s.ask;
  return shapeOf(c) === shapeOf(s.top) || valueOf(c) === valueOf(s.top);
}
function draw(s: S, seat: number, k: number) {
  for (let i = 0; i < k && s.market.length; i++) s.hands[seat].push(s.market.shift()!);
}
function handValue(h: number[]) {
  return h.reduce((t, c) => t + (shapeOf(c) === 4 ? valueOf(c) * 2 : valueOf(c)), 0);
}
function settleDry(s: S): S {
  if (s.market.length || s.won) return s;
  const vals = s.hands.map(handValue);
  const low = Math.min(...vals);
  return { ...s, won: vals.map((v, i) => (v === low ? i : -1)).filter((i) => i >= 0), log: "The market is empty: lowest hand wins" };
}

export const rules: TurnRules<S, M> = {
  init: (seed, seats) => {
    const deck = seededShuffle(seed, [...NUMBERS.flatMap((ns, sh) => ns.map((v) => sh * 100 + v)), WHOT, WHOT, WHOT, WHOT, WHOT]);
    const hands = Array.from({ length: seats }, () => deck.splice(0, 5));
    // The first top card is a plain one.
    let i = deck.findIndex((c) => !SPECIAL.has(valueOf(c)));
    if (i < 0) i = 0;
    const top = deck.splice(i, 1)[0];
    return { hands, market: deck, top, ask: null, turn: 0, n: 0, seed, won: null, log: "" };
  },
  turn: (s) => (s.won ? -1 : s.turn),
  moves: (s) => {
    const h = s.hands[s.turn];
    const out: M[] = [];
    for (const c of new Set(h)) {
      if (!playable(s, c)) continue;
      if (c === WHOT) for (let a = 0; a < 5; a++) out.push({ play: c, ask: a });
      else out.push({ play: c });
    }
    out.push({ draw: true });
    return out;
  },
  play: (s0, m) => {
    const s: S = { ...s0, hands: s0.hands.map((h) => [...h]), market: [...s0.market], n: s0.n + 1 };
    const me = s.turn;
    if ("draw" in m) {
      draw(s, me, 1);
      s.log = "Went to market";
      s.turn = nextSeat(s, me);
      return settleDry(s);
    }
    const h = s.hands[me];
    h.splice(h.indexOf(m.play), 1);
    s.top = m.play;
    s.ask = m.play === WHOT ? (m.ask ?? 0) : null;
    const v = valueOf(m.play);
    if (!h.length) return { ...s, won: [me], log: "Last card! Check up!" };
    const nxt = nextSeat(s, me);
    s.log = "";
    if (v === 1) {
      s.log = "Hold on!";
      s.turn = me;
    } else if (v === 2 || v === 5) {
      draw(s, nxt, v === 2 ? 2 : 3);
      s.log = v === 2 ? "Pick two!" : "Pick three!";
      s.turn = nextSeat(s, me, 1);
    } else if (v === 8) {
      s.log = "Suspension!";
      s.turn = nextSeat(s, me, 1);
    } else if (v === 14) {
      s.hands.forEach((_, i) => i !== me && draw(s, i, 1));
      s.log = "General market!";
      s.turn = nxt;
    } else if (v === 20) {
      s.log = `Whot! I need ${SHAPES[s.ask ?? 0]}`;
      s.turn = nxt;
    } else s.turn = nxt;
    if (s.hands.length === 2 && (v === 2 || v === 5 || v === 8)) s.turn = me;
    return settleDry(s);
  },
  winners: (s) => s.won,
  bot: (s) => {
    const ms = rules.moves(s).filter((m) => "play" in m) as { play: number; ask?: number }[];
    if (!ms.length) return { draw: true };
    const h = s.hands[s.turn];
    const nextCount = s.hands[nextSeat(s, s.turn)].length;
    const counts = [0, 1, 2, 3, 4].map((sh) => h.filter((c) => shapeOf(c) === sh).length);
    const bestShape = counts.indexOf(Math.max(...counts));
    const score = (m: { play: number; ask?: number }) => {
      const v = valueOf(m.play);
      let sc = rnd(s, m.play) * 2;
      if (m.play === WHOT) sc += m.ask === bestShape ? 2 : -10;
      if (SPECIAL.has(v) && v !== 20) sc += nextCount <= 2 ? 8 : 3;
      if (v === 1 && h.length > 1) sc += 4;
      sc += counts[shapeOf(m.play)] ?? 0;
      return sc;
    };
    return ms.reduce((a, b) => (score(b) > score(a) ? b : a));
  },
};

function WhotCard({ c, onClick, can, small }: { c: number; onClick?: () => void; can?: boolean; small?: boolean }) {
  const sh = shapeOf(c);
  const Icon = sh < 5 ? SHAPE_ICONS[sh] : null;
  return (
    <button
      onClick={onClick}
      disabled={!onClick || !can}
      className={cn("relative flex shrink-0 flex-col items-center justify-center rounded-lg border-2 bg-[#fffaf0] font-extrabold shadow transition", small ? "h-16 w-11 text-sm" : "h-20 w-14 text-lg", can ? "-translate-y-1 border-gold" : "border-[#e9d8b4]")}
      style={{ color: SHAPE_COLOUR }}
      aria-label={sh < 5 ? `${SHAPES[sh]} ${valueOf(c)}` : "Whot 20"}
    >
      <span className="absolute left-1 top-0.5 text-[10px]">{valueOf(c)}</span>
      {Icon ? <Icon className={small ? "size-5" : "size-7"} fill={sh === 2 ? "none" : "currentColor"} strokeWidth={sh === 2 ? 4 : 2} /> : <span className="text-[11px] leading-tight">WHOT</span>}
      <span className="text-xs">{valueOf(c)}</span>
    </button>
  );
}

export function View({ s, seat, canMove, onMove, names }: TurnViewProps<S, M>) {
  const [asking, setAsking] = useState(false);
  const hand = s.hands[seat] ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {s.hands.map((h, i) =>
          i === seat ? null : (
            <span key={i} className={cn("rounded-full px-2 py-1", s.turn === i ? "bg-ink text-white" : "bg-panel-2")}>
              {names[i]}: {h.length} card{h.length === 1 ? "" : "s"}
            </span>
          ),
        )}
      </div>
      <div className="flex items-center justify-center gap-6 rounded-3xl bg-[#2b8a3e] p-4">
        <div className="text-center text-xs font-semibold text-white">
          <div className="grid h-20 w-14 place-items-center rounded-lg border-2 border-white bg-[#7a1f2b] font-extrabold">WHOT</div>
          Market {s.market.length}
        </div>
        <div className="text-center text-xs font-semibold text-white">
          <WhotCard c={s.top} />
          {s.top === WHOT && s.ask !== null ? `Needs ${SHAPES[s.ask]}` : "Top card"}
        </div>
      </div>
      <p className="h-5 text-center text-sm font-bold">{s.log}</p>
      {asking ? (
        <div className="space-y-1">
          <p className="text-center text-sm font-semibold">Ask for a shape:</p>
          <div className="grid grid-cols-5 gap-1.5">
            {SHAPES.map((name, a) => {
              const Icon = SHAPE_ICONS[a];
              return (
                <button key={name} onClick={() => (setAsking(false), onMove({ play: WHOT, ask: a }))} className="flex flex-col items-center gap-0.5 rounded-xl bg-panel-2 py-2 text-[10px] font-semibold" style={{ color: SHAPE_COLOUR }}>
                  <Icon className="size-5" fill={a === 2 ? "none" : "currentColor"} />
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto px-1 pb-2 pt-2">
          {hand.map((c, i) => (
            <WhotCard key={`${c}-${i}`} c={c} small={hand.length > 6} can={canMove && playable(s, c)} onClick={() => (c === WHOT ? setAsking(true) : onMove({ play: c }))} />
          ))}
        </div>
      )}
      <Act onClick={() => onMove({ draw: true })} disabled={!canMove} tone="soft">
        Go to market
      </Act>
    </div>
  );
}
