"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { PlayingCard, RANK_LABEL, rank } from "../cards";
import type { TurnRules, TurnViewProps } from "../types";
import { rnd, seededShuffle } from "./common";

// Go Fish: 7 cards each (5 with four players). On your go, ask someone for a rank you hold. If
// they have any, they hand them all over and you go again; if not, "go fish": draw one (and if
// it's what you asked for, go again). Four of a kind is a set, laid down straight away. Run out
// of cards and you draw one. When all 13 sets are down, most sets wins.

type S = { hands: number[][]; pond: number[]; sets: number[][]; turn: number; n: number; seed: number; log: string; asked: { by: number; rank: number }[] };
type M = { ask: number; rank: number } | { pass: true };

function layDown(s: S, seat: number) {
  const h = s.hands[seat];
  for (let r = 2; r <= 14; r++) {
    if (h.filter((c) => rank(c) === r).length === 4) {
      s.hands[seat] = h.filter((c) => rank(c) !== r);
      s.sets[seat].push(r);
      return layDown(s, seat);
    }
  }
}
const done = (s: S) => s.sets.reduce((t, x) => t + x.length, 0) === 13;
function refill(s: S, seat: number) {
  if (!s.hands[seat].length && s.pond.length) s.hands[seat].push(s.pond.shift()!);
}

export const rules: TurnRules<S, M> = {
  init: (seed, seats) => {
    const deck = seededShuffle(seed, Array.from({ length: 52 }, (_, i) => i));
    const k = seats >= 4 ? 5 : 7;
    const s: S = { hands: Array.from({ length: seats }, () => deck.splice(0, k)), pond: deck, sets: Array.from({ length: seats }, () => []), turn: 0, n: 0, seed, log: "", asked: [] };
    for (let i = 0; i < seats; i++) layDown(s, i);
    return s;
  },
  turn: (s) => (done(s) ? -1 : s.turn),
  moves: (s) => {
    const h = s.hands[s.turn];
    const ranks = [...new Set(h.map(rank))];
    const out: M[] = [];
    for (let t = 0; t < s.hands.length; t++) if (t !== s.turn && s.hands[t].length) for (const r of ranks) out.push({ ask: t, rank: r });
    return out.length ? out : [{ pass: true }];
  },
  play: (s0, m) => {
    const s: S = { ...s0, hands: s0.hands.map((h) => [...h]), pond: [...s0.pond], sets: s0.sets.map((x) => [...x]), n: s0.n + 1, asked: [...s0.asked].slice(-12) };
    const me = s.turn;
    const next = () => {
      let t = (me + 1) % s.hands.length;
      // Skip anyone with no cards and nothing to draw.
      for (let k = 0; k < s.hands.length && !s.hands[t].length && !s.pond.length; k++) t = (t + 1) % s.hands.length;
      s.turn = t;
      refill(s, t);
    };
    if ("pass" in m) {
      s.log = "Nothing to ask for";
      next();
      return s;
    }
    s.asked.push({ by: me, rank: m.rank });
    const got = s.hands[m.ask].filter((c) => rank(c) === m.rank);
    if (got.length) {
      s.hands[m.ask] = s.hands[m.ask].filter((c) => rank(c) !== m.rank);
      s.hands[me].push(...got);
      s.log = `Got ${got.length} ${RANK_LABEL[m.rank]}${got.length > 1 ? "s" : ""}! Go again`;
      layDown(s, me);
      refill(s, me);
      refill(s, m.ask);
      if (!s.hands[me].length) next();
      return s;
    }
    const fish = s.pond.shift();
    if (fish !== undefined) {
      s.hands[me].push(fish);
      layDown(s, me);
      if (rank(fish) === m.rank) {
        s.log = "Go fish… and caught it! Go again";
        refill(s, me);
        if (!s.hands[me].length) next();
        return s;
      }
    }
    s.log = "Go fish!";
    refill(s, me);
    next();
    return s;
  },
  winners: (s) => {
    if (!done(s)) return null;
    const best = Math.max(...s.sets.map((x) => x.length));
    return s.sets.map((x, i) => (x.length === best ? i : -1)).filter((i) => i >= 0);
  },
  scores: (s) => s.sets.map((x) => x.length),
  bot: (s) => {
    const ms = rules.moves(s);
    if ("pass" in ms[0]) return ms[0];
    const h = s.hands[s.turn];
    // Ask for what you hold most of; prefer someone who asked for it lately (they have it).
    const score = (m: { ask: number; rank: number }) => h.filter((c) => rank(c) === m.rank).length * 2 + (s.asked.some((a) => a.by === m.ask && a.rank === m.rank) ? 5 : 0) + rnd(s, m.ask * 20 + m.rank);
    return (ms as { ask: number; rank: number }[]).reduce((a, b) => (score(b) > score(a) ? b : a));
  },
};

export function View({ s, seat, canMove, onMove, names }: TurnViewProps<S, M>) {
  const [pickRank, setPickRank] = useState<number | null>(null);
  const hand = [...(s.hands[seat] ?? [])].sort((a, b) => rank(a) - rank(b));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {s.hands.map((h, i) => (
          <div key={i} className={cn("rounded-xl p-2", s.turn === i ? "bg-ink text-white" : "bg-panel-2")}>
            <b>{i === seat ? "You" : names[i]}</b>
            <p>{h.length} cards · {s.sets[i].length} sets</p>
            <p className="truncate">{s.sets[i].map((r) => RANK_LABEL[r]).join(" ")}</p>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-muted">Pond: {s.pond.length} cards</p>
      <p className="h-5 text-center text-sm font-bold">{s.log}</p>
      <div className="flex gap-1 overflow-x-auto px-1 pb-2 pt-2">
        {hand.map((c) => (
          <PlayingCard key={c} c={c} small={hand.length > 8} selected={pickRank === rank(c)} onClick={canMove ? () => setPickRank(rank(c)) : undefined} />
        ))}
      </div>
      {canMove && pickRank !== null && (
        <div className="space-y-1">
          <p className="text-center text-sm font-semibold">Ask who for {RANK_LABEL[pickRank]}s?</p>
          <div className="flex flex-wrap justify-center gap-2">
            {s.hands.map((h, i) =>
              i === seat || !h.length ? null : (
                <button
                  key={i}
                  onClick={() => {
                    onMove({ ask: i, rank: pickRank });
                    setPickRank(null);
                  }}
                  className="rounded-full bg-me px-4 py-2 text-sm font-bold text-white"
                >
                  {names[i]}
                </button>
              ),
            )}
          </div>
        </div>
      )}
      {canMove && !hand.length && (
        <button onClick={() => onMove({ pass: true })} className="w-full rounded-2xl bg-panel-2 py-2.5 font-semibold">
          Pass
        </button>
      )}
      {canMove && pickRank === null && hand.length > 0 && <p className="text-center text-xs text-muted">Tap a card to ask for its rank.</p>}
    </div>
  );
}
