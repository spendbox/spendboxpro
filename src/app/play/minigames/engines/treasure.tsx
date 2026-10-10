"use client";

import { useState } from "react";
import { Gem, Package, Shovel } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { makeRng, type Rng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Find what's hidden: tap a square to search (dig) it. Each search tells you how many steps
// away the nearest thing still hidden is (red is hot, blue is cold). Find everything with as few
// searches as you can. Points: 80 for each find plus 10 for each search left over.
//   theme room - Find the Loot: furniture in a room, one bag of loot.
//   theme map  - Treasure Hunt: a treasure map, three chests.

type Round = { chests: number[]; dug: Map<number, number>; found: Set<number>; digs: number };

function newRound(r: Rng, size: number, chests: number, digs: number): Round {
  const spots = new Set<number>();
  while (spots.size < chests) spots.add(Math.floor(r() * size * size));
  return { chests: [...spots], dug: new Map(), found: new Set(), digs };
}

const HEAT = ["#c92a2a", "#e8590c", "#f59f00", "#94d82d", "#22b8cf", "#1c7ed6", "#364fc7"];
const ROOM = ["Sofa", "Rug", "Shelf", "Vase", "Desk", "Bed", "Plant", "Lamp", "Box", "Safe", "Chair", "TV", "Bin", "Mat", "Clock", "Fridge"];

export default function Treasure({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const size = Number(cfg.size ?? 6);
  const chests = Number(cfg.chests ?? 2);
  const digs = Number(cfg.digs ?? 12);
  const rounds = Number(cfg.rounds ?? 3);
  const room = cfg.theme === "room";
  const [r] = useState(() => makeRng(seed));
  const [n, setN] = useState(0);
  const [round, setRound] = useState(() => newRound(r, size, chests, digs));
  const [score, setScore] = useState(0);
  const [msg, setMsg] = useState("");

  const dist = (a: number, b: number) => Math.max(Math.abs((a % size) - (b % size)), Math.abs(Math.floor(a / size) - Math.floor(b / size)));

  function dig(i: number) {
    if (round.dug.has(i) || round.digs <= 0) return;
    const left = round.chests.filter((c) => !round.found.has(c));
    const hit = left.includes(i);
    const next: Round = { ...round, dug: new Map(round.dug), found: new Set(round.found), digs: round.digs - 1 };
    let pts = 0;
    if (hit) {
      next.found.add(i);
      next.dug.set(i, -1);
      pts = 80;
      playSfx("found");
      setMsg(room ? "Found the loot!" : "A chest!");
    } else {
      const d = Math.min(...left.map((c) => dist(c, i)));
      next.dug.set(i, d);
      playSfx("rustle");
      setMsg(d === 1 ? "Red hot! Right next to it." : d === 2 ? "Warm" : d <= 3 ? "Getting colder" : "Cold");
    }
    const allFound = next.found.size === chests;
    if (allFound) pts += next.digs * 10;
    const total = score + pts;
    setScore(total);
    setRound(next);
    if (allFound || next.digs <= 0) {
      window.setTimeout(() => {
        if (n + 1 >= rounds) return finish(total);
        setN(n + 1);
        setRound(newRound(r, size, chests, digs));
        setMsg("");
      }, 1200);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span>
          {room ? "Room" : "Map"} {n + 1} of {rounds}
        </span>
        <span>
          {round.found.size}/{chests} found · {round.digs} {room ? "searches" : "digs"} left
        </span>
        <span>{score} pts</span>
      </div>
      <p className="h-5 text-center text-sm font-semibold">{msg}</p>
      <div className={cn("mx-auto grid max-w-sm gap-1 rounded-3xl p-2", room ? "bg-[#e9d8a6]" : "bg-[#f4e1b0]")} style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {Array.from({ length: size * size }, (_, i) => {
          const d = round.dug.get(i);
          const over = round.digs <= 0 || round.found.size === chests;
          const missed = over && round.chests.includes(i) && !round.found.has(i);
          return (
            <button
              key={i}
              onClick={() => dig(i)}
              className={cn("grid aspect-square place-items-center rounded-lg text-[10px] font-bold", d === undefined ? (room ? "bg-[#cfa66b] text-[#5c3d22]" : "bg-[#e3c88b] text-[#8d6e3a]") : "text-white")}
              style={d !== undefined && d >= 0 ? { background: HEAT[Math.min(HEAT.length - 1, d - 1)] } : d === -1 ? { background: "#2f9e44" } : undefined}
            >
              {d === -1 ? room ? <Package className="size-5" /> : <Gem className="size-5" /> : d !== undefined ? d : missed ? <Package className="size-4 opacity-60" /> : room ? ROOM[(i * 7 + seed) % ROOM.length] : <Shovel className="size-3.5 opacity-40" />}
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted">Numbers show how many steps away the nearest hidden {room ? "loot" : "chest"} is (diagonals count as one step).</p>
    </div>
  );
}
