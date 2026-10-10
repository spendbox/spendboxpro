"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { bestHand, deck, PlayingCard, rank, suit, type Card } from "../cards";
import { makeRng, type Rng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Texas Hold'em (fixed-limit) against three bots: everyone starts with 200 chips; blinds 5 and
// 10; bets and raises are 10 before the turn and 20 after; three raises at most a round. Eight
// hands. Score: your chips at the end. (A player who runs out sits out the rest.)

type P = { name: string; chips: number; cards: Card[]; folded: boolean; bet: number; inPot: number; acted: boolean; out: boolean };
type G = {
  r: Rng;
  deck: Card[];
  at: number;
  players: P[];
  dealer: number;
  board: Card[];
  street: number;
  toAct: number;
  current: number;
  raises: number;
  pot: number;
  hand: number;
  log: string;
  shown: boolean;
  winners: number[];
};

const NAMES = ["You", "Kemi", "Musa", "Abena"];
const STREETS = ["Pre-flop", "Flop", "Turn", "River"];

function startHand(g: G): G {
  const players = g.players.map((p) => ({ ...p, cards: [] as Card[], folded: p.out || p.chips <= 0, bet: 0, inPot: 0, acted: false, out: p.out || p.chips <= 0 }));
  const live = players.filter((p) => !p.out).length;
  const s: G = { ...g, players, board: [], street: 0, raises: 0, pot: 0, current: 0, shown: false, winners: [], dealer: next(players, g.dealer), log: "" };
  if (live < 2) return { ...s, street: 5 };
  for (let k = 0; k < 2; k++) for (const p of players) if (!p.out) p.cards.push(s.deck[s.at++ % s.deck.length]);
  // Blinds.
  const sb = next(players, s.dealer);
  const bb = next(players, sb);
  post(s, sb, 5);
  post(s, bb, 10);
  s.current = 10;
  s.toAct = next(players, bb);
  s.log = `New hand. ${players[sb].name} and ${players[bb].name} post the blinds.`;
  return s;
}

function next(players: P[], i: number) {
  for (let k = 1; k <= players.length; k++) {
    const j = (i + k) % players.length;
    if (!players[j].out && !players[j].folded) return j;
  }
  return i;
}

function post(s: G, i: number, amount: number) {
  const p = s.players[i];
  const a = Math.min(amount, p.chips);
  p.chips -= a;
  p.bet += a;
  p.inPot += a;
  s.pot += a;
}

function betSize(s: G) {
  return s.street < 2 ? 10 : 20;
}

/** A move: fold, check/call, or raise. Returns the next state. */
function act(g: G, move: "fold" | "call" | "raise"): G {
  const s: G = { ...g, players: g.players.map((p) => ({ ...p })) };
  const i = s.toAct;
  const p = s.players[i];
  const toCall = s.current - p.bet;
  if (move === "fold") {
    p.folded = true;
    s.log = `${p.name} folds.`;
  } else if (move === "raise" && s.raises < 3 && p.chips > toCall) {
    s.current += betSize(s);
    s.raises++;
    post(s, i, s.current - p.bet);
    for (const o of s.players) o.acted = false;
    s.log = `${p.name} ${s.raises === 1 && toCall === 0 ? "bets" : "raises"} to ${s.current}.`;
  } else {
    if (toCall > 0) post(s, i, toCall);
    s.log = toCall > 0 ? `${p.name} calls ${toCall}.` : `${p.name} checks.`;
  }
  p.acted = true;
  const live = s.players.filter((x) => !x.out && !x.folded);
  if (live.length === 1) return award(s, [s.players.indexOf(live[0])]);
  const done = live.every((x) => x.acted && (x.bet === s.current || x.chips === 0));
  if (!done) {
    s.toAct = next(s.players, i);
    return s;
  }
  // Next street.
  for (const x of s.players) {
    x.bet = 0;
    x.acted = false;
  }
  s.current = 0;
  s.raises = 0;
  s.street++;
  if (s.street === 1) s.board = [s.deck[s.at++ % s.deck.length], s.deck[s.at++ % s.deck.length], s.deck[s.at++ % s.deck.length]];
  else if (s.street <= 3) s.board = [...s.board, s.deck[s.at++ % s.deck.length]];
  if (s.street === 4) {
    let best = -1;
    let win: number[] = [];
    s.players.forEach((x, k) => {
      if (x.out || x.folded) return;
      const h = bestHand([...x.cards, ...s.board]).score;
      if (h > best) {
        best = h;
        win = [k];
      } else if (h === best) win.push(k);
    });
    return award(s, win);
  }
  s.toAct = next(s.players, s.dealer);
  return s;
}

function award(s: G, win: number[]): G {
  const share = Math.floor(s.pot / win.length);
  for (const w of win) s.players[w].chips += share;
  s.shown = s.street >= 4;
  s.winners = win;
  const name = win.map((w) => s.players[w].name).join(" and ");
  s.log = s.shown ? `${name} win${win.length === 1 && name !== "You" ? "s" : ""} ${s.pot} with ${bestHand([...s.players[win[0]].cards, ...s.board]).name.toLowerCase()}.` : `${name} win${name !== "You" ? "s" : ""} ${s.pot}.`;
  s.street = 5;
  s.pot = 0;
  s.hand++;
  return s;
}

/** How good a bot thinks its hand is (0-1). */
function strength(s: G, i: number) {
  const p = s.players[i];
  if (!s.board.length) {
    const [a, b] = p.cards.map(rank);
    const pair = a === b ? 0.35 + a / 60 : 0;
    const suited = suit(p.cards[0]) === suit(p.cards[1]) ? 0.05 : 0;
    return Math.min(1, (a + b) / 32 + pair + suited);
  }
  const cat = Math.floor(bestHand([...p.cards, ...s.board]).score / 1e10);
  const boardCat = s.board.length >= 3 ? Math.floor(bestHand(s.board).score / 1e10) : 0;
  return Math.min(1, 0.2 + (cat - boardCat * 0.6) * 0.17 + Math.max(...p.cards.map(rank)) / 100);
}

function botMove(s: G): "fold" | "call" | "raise" {
  const i = s.toAct;
  const st = strength(s, i) + (s.r() - 0.5) * 0.2;
  const toCall = s.current - s.players[i].bet;
  if (st > 0.72 && s.raises < 3) return "raise";
  if (st > 0.42 || toCall === 0) return "call";
  if (toCall <= 10 && s.r() < 0.35) return "call";
  return "fold";
}

export default function Poker({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const hands = Number(cfg.hands ?? 8);
  const [g, setG] = useState<G>(() => {
    const r = makeRng(seed);
    return startHand({ r, deck: deck(r, 4), at: 0, players: NAMES.map((name) => ({ name, chips: 200, cards: [], folded: false, bet: 0, inPot: 0, acted: false, out: false })), dealer: 0, board: [], street: 0, toAct: 0, current: 0, raises: 0, pot: 0, hand: 0, log: "", shown: false, winners: [] });
  });
  const me = g.players[0];
  const over = g.street === 5 && (g.hand >= hands || me.chips <= 0 || g.players.filter((p) => p.chips > 0).length < 2);

  // Bots take their turn.
  useEffect(() => {
    if (g.street >= 4 || g.toAct === 0) return;
    const id = window.setTimeout(() => {
      setG((s) => (s.street < 4 && s.toAct !== 0 ? act(s, botMove(s)) : s));
      playSfx("tick");
    }, 700);
    return () => window.clearTimeout(id);
  }, [g]);
  useEffect(() => {
    if (!over) return;
    const id = window.setTimeout(() => finish(g.players[0].chips), 1500);
    return () => window.clearTimeout(id);
  }, [over, g, finish]);

  const toCall = g.current - me.bet;
  const myTurn = g.street < 4 && g.toAct === 0 && !me.folded;
  const play = (m: "fold" | "call" | "raise") => {
    playSfx(m === "fold" ? "miss" : "pop");
    setG(act(g, m));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span className="text-[#ffd43b]">{me.chips} chips</span>
        <span>
          Hand {Math.min(g.hand + (g.street < 5 ? 1 : 0), hands)} of {hands} · {STREETS[g.street] ?? "Showdown"}
        </span>
      </div>
      <div className="space-y-3 rounded-3xl bg-[#1b5e3b] p-3 text-white">
        <div className="grid grid-cols-3 gap-2">
          {g.players.slice(1).map((p, k) => {
            const i = k + 1;
            return (
              <div key={i} className={cn("rounded-2xl bg-black/20 p-2 text-center text-xs", g.toAct === i && g.street < 4 && "ring-2 ring-gold", (p.folded || p.out) && "opacity-40", g.winners.includes(i) && "bg-gold/30")}>
                <p className="font-bold">{p.name}</p>
                <p className="text-white/70">{p.out ? "out" : `${p.chips} chips`}</p>
                <div className="mt-1 flex justify-center gap-0.5">
                  {p.cards.map((c, j) => (
                    <PlayingCard key={j} c={c} back={!(g.shown && !p.folded)} small />
                  ))}
                </div>
                {p.bet > 0 && <p className="mt-0.5 font-bold text-[#ffd43b]">bet {p.bet}</p>}
              </div>
            );
          })}
        </div>
        <div className="flex min-h-20 items-center justify-center gap-1.5">
          {g.board.map((c, i) => (
            <PlayingCard key={i} c={c} small />
          ))}
          {!g.board.length && <span className="text-sm text-white/60">Pot {g.pot}</span>}
        </div>
        {g.board.length > 0 && <p className="text-center text-xs font-bold text-[#ffd43b]">Pot {g.pot}</p>}
        <div className={cn("flex items-center justify-center gap-1.5 rounded-2xl p-2", g.winners.includes(0) && "bg-gold/30")}>
          {me.cards.map((c, i) => (
            <PlayingCard key={i} c={c} dim={me.folded} />
          ))}
          {me.cards.length > 0 && g.board.length >= 3 && <span className="ml-2 text-xs font-semibold">{bestHand([...me.cards, ...g.board]).name}</span>}
        </div>
      </div>
      <p className="min-h-5 text-center text-sm font-semibold">{g.log}</p>
      {myTurn ? (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => play("fold")} className="rounded-2xl bg-panel-2 py-3 font-bold">
            Fold
          </button>
          <button onClick={() => play("call")} className="rounded-2xl bg-me py-3 font-bold text-white">
            {toCall > 0 ? `Call ${Math.min(toCall, me.chips)}` : "Check"}
          </button>
          <button onClick={() => play("raise")} disabled={g.raises >= 3 || me.chips <= toCall} className="rounded-2xl bg-[#c2255c] py-3 font-bold text-white disabled:opacity-40">
            {toCall > 0 ? "Raise" : "Bet"} {betSize(g)}
          </button>
        </div>
      ) : g.street === 5 && !over ? (
        <button onClick={() => setG(startHand(g))} className="w-full rounded-2xl bg-ink py-3 font-bold text-white">
          Next hand
        </button>
      ) : over ? (
        <p className="text-center font-semibold">The game is over: {me.chips} chips.</p>
      ) : (
        <p className="text-center text-sm text-muted">{me.folded ? "You folded. Watching the hand…" : "Waiting for the others…"}</p>
      )}
    </div>
  );
}
