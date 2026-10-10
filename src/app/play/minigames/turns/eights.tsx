"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { PlayingCard, rank, SUIT_NAMES, SUITS, suit } from "../cards";
import type { TurnRules, TurnViewProps } from "../types";
import { Act, rnd, seededShuffle } from "./common";

// Crazy Eights: 7 cards each (5 with more than two players). Play a card of the same suit or
// rank as the top card. Eights are wild: play one on anything and name the suit. Can't (or won't)
// play? Draw one. When the deck runs out, players who can't play pass; if nobody can, the
// fewest cards wins. First to empty their hand wins.

type S = { hands: number[][]; stock: number[]; top: number; suitNow: number; turn: number; n: number; seed: number; passes: number; won: number[] | null; log: string };
type M = { play: number; suit?: number } | { draw: true } | { pass: true };

const ok = (s: S, c: number) => rank(c) === 8 || suit(c) === s.suitNow || rank(c) === rank(s.top);

export const rules: TurnRules<S, M> = {
  init: (seed, seats) => {
    const deck = seededShuffle(seed, Array.from({ length: 52 }, (_, i) => i));
    const k = seats === 2 ? 7 : 5;
    const hands = Array.from({ length: seats }, () => deck.splice(0, k));
    let i = deck.findIndex((c) => rank(c) !== 8);
    if (i < 0) i = 0;
    const top = deck.splice(i, 1)[0];
    return { hands, stock: deck, top, suitNow: suit(top), turn: 0, n: 0, seed, passes: 0, won: null, log: "" };
  },
  turn: (s) => (s.won ? -1 : s.turn),
  moves: (s) => {
    const out: M[] = [];
    for (const c of s.hands[s.turn]) {
      if (!ok(s, c)) continue;
      if (rank(c) === 8) for (let st = 0; st < 4; st++) out.push({ play: c, suit: st });
      else out.push({ play: c });
    }
    out.push(s.stock.length ? { draw: true } : { pass: true });
    return out;
  },
  play: (s0, m) => {
    const s: S = { ...s0, hands: s0.hands.map((h) => [...h]), stock: [...s0.stock], n: s0.n + 1 };
    const me = s.turn;
    const next = (me + 1) % s.hands.length;
    if ("draw" in m) {
      s.hands[me].push(s.stock.shift()!);
      s.log = "Drew a card";
      s.passes = 0;
      s.turn = next;
      return s;
    }
    if ("pass" in m) {
      s.passes++;
      s.log = "Passed";
      s.turn = next;
      if (s.passes >= s.hands.length) {
        const low = Math.min(...s.hands.map((h) => h.length));
        s.won = s.hands.map((h, i) => (h.length === low ? i : -1)).filter((i) => i >= 0);
        s.log = "Nobody can play: fewest cards wins";
      }
      return s;
    }
    const h = s.hands[me];
    h.splice(h.indexOf(m.play), 1);
    s.top = m.play;
    s.suitNow = rank(m.play) === 8 ? (m.suit ?? suit(m.play)) : suit(m.play);
    s.passes = 0;
    s.log = rank(m.play) === 8 ? `Eight! Suit is now ${SUIT_NAMES[s.suitNow]}` : "";
    if (!h.length) s.won = [me];
    s.turn = next;
    return s;
  },
  winners: (s) => s.won,
  bot: (s) => {
    const h = s.hands[s.turn];
    const plays = rules.moves(s).filter((m) => "play" in m) as { play: number; suit?: number }[];
    if (!plays.length) return s.stock.length ? { draw: true } : { pass: true };
    const counts = [0, 1, 2, 3].map((st) => h.filter((c) => suit(c) === st && rank(c) !== 8).length);
    const best = counts.indexOf(Math.max(...counts));
    const score = (m: { play: number; suit?: number }) => (rank(m.play) === 8 ? (m.suit === best ? (h.length <= 2 ? 10 : -2) : -20) : counts[suit(m.play)] + rank(m.play) * 0.05) + rnd(s, m.play) * 0.5;
    return plays.reduce((a, b) => (score(b) > score(a) ? b : a));
  },
};

export function View({ s, seat, canMove, onMove, names }: TurnViewProps<S, M>) {
  const [eight, setEight] = useState<number | null>(null);
  const hand = s.hands[seat] ?? [];
  const S2 = SUITS[s.suitNow];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {s.hands.map((h, i) =>
          i === seat ? null : (
            <span key={i} className={cn("rounded-full px-2 py-1", s.turn === i ? "bg-ink text-white" : "bg-panel-2")}>
              {names[i]}: {h.length} cards
            </span>
          ),
        )}
      </div>
      <div className="flex items-center justify-center gap-6 rounded-3xl bg-[#1b5e3b] p-4 text-xs font-semibold text-white">
        <div className="text-center">
          <PlayingCard back />
          <p>Deck {s.stock.length}</p>
        </div>
        <div className="text-center">
          <PlayingCard c={s.top} />
          <p className="flex items-center justify-center gap-1">
            Suit: <S2 className="size-3.5" fill="currentColor" />
          </p>
        </div>
      </div>
      <p className="h-5 text-center text-sm font-bold">{s.log}</p>
      {eight !== null ? (
        <div className="grid grid-cols-4 gap-2">
          {SUITS.map((Icon, st) => (
            <button
              key={st}
              onClick={() => {
                onMove({ play: eight, suit: st });
                setEight(null);
              }}
              className={cn("flex flex-col items-center rounded-xl bg-panel-2 py-2 text-xs font-semibold", st === 1 || st === 2 ? "text-[#e03131]" : "")}
            >
              <Icon className="size-6" fill="currentColor" />
              {SUIT_NAMES[st]}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-1 overflow-x-auto px-1 pb-2 pt-2">
          {hand.map((c) => {
            const can = canMove && ok(s, c);
            return <PlayingCard key={c} c={c} small={hand.length > 7} selected={can} dim={!can} onClick={can ? () => (rank(c) === 8 ? setEight(c) : onMove({ play: c })) : undefined} />;
          })}
        </div>
      )}
      <Act onClick={() => onMove(s.stock.length ? { draw: true } : { pass: true })} disabled={!canMove} tone="soft">
        {s.stock.length ? "Draw a card" : "Pass"}
      </Act>
    </div>
  );
}
