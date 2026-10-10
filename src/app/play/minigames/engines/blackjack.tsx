"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { deck, PlayingCard, rank, type Card } from "../cards";
import { makeRng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Blackjack against the dealer: 100 chips, 8 hands. Bet, then hit or stand (or double down on
// your first two cards). Get closer to 21 than the dealer without going over. The dealer draws
// to 17. Blackjack pays 3 to 2. Score: your chips at the end.

const BETS = [10, 20, 50];

function value(cards: Card[]) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = rank(c);
    if (r === 14) {
      aces++;
      total += 11;
    } else total += Math.min(10, r);
  }
  while (total > 21 && aces) {
    total -= 10;
    aces--;
  }
  return total;
}

type Hand = { player: Card[]; dealer: Card[]; bet: number; done: boolean; result: string };

export default function Blackjack({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const hands = Number(cfg.hands ?? 8);
  const [shoe] = useState(() => deck(makeRng(seed), 6));
  const [pos, setPos] = useState(0);
  const [chips, setChips] = useState(100);
  const [n, setN] = useState(0);
  const [hand, setHand] = useState<Hand | null>(null);

  function deal(bet: number) {
    let p = pos;
    const take = () => shoe[p++ % shoe.length];
    const h: Hand = { player: [take(), take()], dealer: [take(), take()], bet, done: false, result: "" };
    setPos(p);
    playSfx("tick");
    if (value(h.player) === 21) return settle({ ...h }, p);
    setHand(h);
  }

  function settle(h: Hand, p: number) {
    // The dealer plays.
    const d = [...h.dealer];
    const pv = value(h.player);
    if (pv <= 21 && !(pv === 21 && h.player.length === 2)) while (value(d) < 17) d.push(shoe[p++ % shoe.length]);
    setPos(p);
    const dv = value(d);
    let win = 0;
    let result = "";
    if (pv > 21) {
      win = -h.bet;
      result = "Bust!";
    } else if (pv === 21 && h.player.length === 2 && !(dv === 21 && d.length === 2)) {
      win = Math.floor(h.bet * 1.5);
      result = "Blackjack! Pays 3 to 2";
    } else if (dv > 21 || pv > dv) {
      win = h.bet;
      result = dv > 21 ? "Dealer busts. You win!" : "You win!";
    } else if (pv === dv) {
      result = "Push (a tie): bet back";
    } else {
      win = -h.bet;
      result = "Dealer wins";
    }
    playSfx(win > 0 ? "found" : win < 0 ? "miss" : "tick");
    const total = chips + win;
    setChips(total);
    setHand({ ...h, dealer: d, done: true, result: `${result} ${win > 0 ? `+${win}` : win < 0 ? win : ""}` });
    const nextN = n + 1;
    setN(nextN);
    if (nextN >= hands || total < BETS[0]) window.setTimeout(() => finish(total), 1600);
  }

  function hit() {
    if (!hand || hand.done) return;
    const h = { ...hand, player: [...hand.player, shoe[pos % shoe.length]] };
    setPos(pos + 1);
    playSfx("tick");
    if (value(h.player) >= 21) return settle(h, pos + 1);
    setHand(h);
  }
  function stand() {
    if (!hand || hand.done) return;
    settle(hand, pos);
  }
  function double() {
    if (!hand || hand.done || hand.player.length !== 2 || chips < hand.bet * 2) return;
    const h = { ...hand, bet: hand.bet * 2, player: [...hand.player, shoe[pos % shoe.length]] };
    settle(h, pos + 1);
  }

  const over = n >= hands || chips < BETS[0];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span className="text-[#ffd43b]">{chips} chips</span>
        <span>
          Hand {Math.min(n + (hand && !hand.done ? 1 : 0) || 1, hands)} of {hands}
        </span>
      </div>
      <div className="space-y-3 rounded-3xl bg-[#1b5e3b] p-4 text-white">
        <div>
          <p className="mb-1 text-xs font-semibold text-white/70">Dealer {hand?.done ? `· ${value(hand.dealer)}` : ""}</p>
          <div className="flex min-h-20 gap-1.5">
            {hand?.dealer.map((c, i) => (
              <PlayingCard key={i} c={c} back={!hand.done && i === 1} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-white/70">You {hand ? `· ${value(hand.player)}` : ""}</p>
          <div className="flex min-h-20 flex-wrap gap-1.5">
            {hand?.player.map((c, i) => (
              <PlayingCard key={i} c={c} />
            ))}
          </div>
        </div>
        {hand?.done && <p className="act-pop text-center font-display text-lg font-bold">{hand.result}</p>}
      </div>
      {hand && !hand.done ? (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={hit} className="rounded-2xl bg-me py-3 font-bold text-white">
            Hit
          </button>
          <button onClick={stand} className="rounded-2xl bg-ink py-3 font-bold text-white">
            Stand
          </button>
          <button onClick={double} disabled={hand.player.length !== 2 || chips < hand.bet * 2} className="rounded-2xl bg-gold py-3 font-bold disabled:opacity-40">
            Double
          </button>
        </div>
      ) : !over ? (
        <div className="space-y-1">
          <p className="text-center text-sm font-semibold">Place your bet</p>
          <div className="grid grid-cols-3 gap-2">
            {BETS.map((b) => (
              <button key={b} disabled={chips < b} onClick={() => deal(b)} className={cn("rounded-2xl py-3 font-bold", chips < b ? "bg-panel-2 opacity-40" : "bg-[#c2255c] text-white")}>
                {b}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-center font-semibold">Table closed: {chips} chips.</p>
      )}
    </div>
  );
}
