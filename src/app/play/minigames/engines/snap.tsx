"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { PlayingCard, rank, type Card } from "../cards";
import { makeRng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Snap! against three bots: cards are turned over onto the pile, faster and faster. When the
// top two have the same number, hit SNAP before the bots do. A wrong snap costs you one. 60
// seconds. Score: snaps won.

const BOTS = ["Gran", "Tobi", "Efua"];

export default function Snap({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const seconds = Number(cfg.seconds ?? 60);
  const [r] = useState(() => makeRng(seed));
  // The cards in order: about one in four matches the card before it.
  const [cards] = useState(() => {
    const out: Card[] = [Math.floor(r() * 52)];
    for (let k = 1; k < 200; k++) {
      const prev = out[k - 1];
      out.push(r() < 0.24 ? ((prev % 13) + 13 * Math.floor(r() * 4)) % 52 : Math.floor(r() * 52));
    }
    return out;
  });
  const [top, setTop] = useState(0);
  const [score, setScore] = useState(0);
  const [bots, setBots] = useState([0, 0, 0]);
  const [left, setLeft] = useState(seconds);
  const [msg, setMsg] = useState<{ text: string; good: boolean } | null>(null);
  const claimed = useRef(-1);

  const isSnap = top > 0 && rank(cards[top]) === rank(cards[top - 1]);

  useEffect(() => {
    const id = window.setInterval(() => setLeft((l) => l - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (left <= 0) finish(score);
  }, [left, score, finish]);
  // Turn the next card.
  useEffect(() => {
    if (left <= 0) return;
    const gap = Math.max(650, 1300 - top * 9);
    const id = window.setTimeout(() => {
      setTop((t) => Math.min(cards.length - 1, t + 1));
      playSfx("tick");
    }, gap);
    return () => window.clearTimeout(id);
  }, [top, left, cards.length]);
  // A bot snaps (they get quicker).
  useEffect(() => {
    if (!isSnap || claimed.current === top) return;
    const who = Math.floor(r() * BOTS.length);
    const id = window.setTimeout(() => {
      if (claimed.current === top) return;
      claimed.current = top;
      setBots((b) => b.map((x, i) => (i === who ? x + 1 : x)));
      setMsg({ text: `${BOTS[who]}: SNAP!`, good: false });
      playSfx("denied");
    }, Math.max(330, 900 - top * 5) + r() * 300);
    return () => window.clearTimeout(id);
  }, [isSnap, top, r]);

  function snap() {
    if (left <= 0) return;
    if (isSnap && claimed.current !== top) {
      claimed.current = top;
      setScore((s) => s + 1);
      setMsg({ text: "SNAP! Yours", good: true });
      playSfx("found");
    } else {
      setScore((s) => Math.max(0, s - 1));
      setMsg({ text: isSnap ? "Too late!" : "No snap! −1", good: false });
      playSfx("miss");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span className="text-[#ffd43b]">You {score}</span>
        <span className="text-xs text-white/70">{BOTS.map((b, i) => `${b} ${bots[i]}`).join(" · ")}</span>
        <span className="tabular-nums">{Math.max(0, left)}s</span>
      </div>
      <div className="relative grid h-52 place-items-center rounded-3xl bg-[#1b5e3b]">
        <div className="relative h-24 w-40">
          {top > 0 && <PlayingCard c={cards[top - 1]} className="absolute left-4 top-1 -rotate-6 scale-110" />}
          <PlayingCard key={top} c={cards[top]} className="act-pop absolute left-16 top-0 rotate-3 scale-125" />
        </div>
      </div>
      <p className={cn("h-6 text-center font-display text-lg font-bold", msg?.good ? "text-me" : "text-hit")}>{msg?.text}</p>
      <button onPointerDown={snap} className="w-full rounded-2xl bg-[#e03131] py-5 font-display text-3xl font-extrabold text-white active:scale-95">
        SNAP!
      </button>
    </div>
  );
}
