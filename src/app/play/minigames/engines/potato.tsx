"use client";

import { useEffect, useRef, useState } from "react";
import { Flame, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { makeRng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Hot Potato against seven bots in a circle. Whoever holds the potato passes it on; when it's
// yours, tap someone to pass it (quickly!). Nobody knows when it'll pop: whoever's holding it
// then is out. Score: rounds survived (7 is a win).

const NAMES = ["Ada", "Kofi", "Zara", "Tunde", "Ama", "Sipho", "Nia"];

export default function Potato({ seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const [r] = useState(() => makeRng(seed));
  const [players, setPlayers] = useState(["You", ...NAMES].map((name) => ({ name, out: false })));
  const [holder, setHolder] = useState(1);
  const [round, setRound] = useState(0);
  /** How long this round's fuse is (ms), drawn when the round starts. */
  const [fuse] = useState(() => Array.from({ length: 8 }, () => 4000 + r() * 7000));
  const [msg, setMsg] = useState("");
  const [boom, setBoom] = useState<number | null>(null);
  const done = useRef(false);
  const live = useRef({ holder, players, round });
  useEffect(() => {
    live.current = { holder, players, round };
  });

  const alive = players.map((p, i) => ({ ...p, i })).filter((p) => !p.out);

  // Bots pass it on after a moment.
  useEffect(() => {
    if (boom !== null || holder === 0 || done.current) return;
    const id = window.setTimeout(() => {
      const { players: ps, holder: h } = live.current;
      const others = ps.map((p, i) => ({ ...p, i })).filter((p) => !p.out && p.i !== h);
      // Bots like to pass it to you a bit more than to each other.
      const to = !ps[0].out && r() < 0.35 ? 0 : others[Math.floor(r() * others.length)].i;
      setHolder(to);
      playSfx("whoosh");
    }, 350 + r() * 1100);
    return () => window.clearTimeout(id);
  }, [holder, boom, r]);

  // The pop, when this round's fuse runs out.
  useEffect(() => {
    if (done.current) return;
    const id = window.setTimeout(() => {
      const { holder: h, players: ps, round: n } = live.current;
      setBoom(h);
      playSfx("explode");
      if (h === 0) {
        done.current = true;
        setMsg("It popped in your hands. You're out!");
        window.setTimeout(() => finish(n), 1300);
        return;
      }
      const left = ps.map((p, i) => ({ ...p, i })).filter((p) => !p.out && p.i !== h);
      setMsg(`${ps[h].name} is out!`);
      setPlayers(ps.map((p, i) => (i === h ? { ...p, out: true } : p)));
      if (left.length <= 1) {
        done.current = true;
        setMsg("You're the last one standing!");
        playSfx("levelup");
        window.setTimeout(() => finish(n + 1), 1300);
        return;
      }
      window.setTimeout(() => {
        setBoom(null);
        setMsg("");
        setHolder(left[Math.floor(r() * left.length)].i);
        setRound(n + 1);
      }, 1400);
    }, fuse[round % fuse.length]);
    return () => window.clearTimeout(id);
  }, [round, fuse, r, finish]);

  function pass(to: number) {
    if (holder !== 0 || boom !== null || to === 0 || players[to].out) return;
    setHolder(to);
    playSfx("whoosh");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span>Round {round + 1}</span>
        <span>{alive.length} left</span>
      </div>
      <div className="relative mx-auto aspect-square w-full max-w-xs rounded-full bg-[#2f9e44]/15">
        {players.map((p, i) => {
          const a = (i / players.length) * Math.PI * 2 + Math.PI / 2;
          const has = holder === i && !p.out;
          return (
            <button
              key={i}
              onClick={() => pass(i)}
              disabled={p.out || i === 0}
              className={cn("absolute grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[11px] font-bold transition", p.out ? "bg-panel-2 text-muted opacity-50" : i === 0 ? "bg-gold" : holder === 0 ? "bg-[#ffe8cc] ring-2 ring-[#e8590c]" : "bg-white", has && "scale-110")}
              style={{ left: `${50 + Math.cos(a) * 40}%`, top: `${50 + Math.sin(a) * 40}%` }}
            >
              <User className="size-5" />
              {p.name}
              {has && <Flame className={cn("absolute -top-3 size-8 text-[#e8590c]", boom === i ? "act-pop scale-150 text-hit" : "act-shake")} />}
            </button>
          );
        })}
        <div className="absolute inset-0 grid place-items-center text-center">
          <p className={cn("max-w-[10rem] font-display text-lg font-bold", holder === 0 && boom === null && "text-hit")}>{msg || (holder === 0 ? "It's yours! Tap someone to pass it!" : "Pass it on…")}</p>
        </div>
      </div>
    </div>
  );
}
