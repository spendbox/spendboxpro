"use client";

import { useEffect, useState } from "react";
import { Bomb, Scissors } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { makeRng, pick, shuffle, type Rng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Wire Cut: every bomb comes with one rule. Read it, cut the one wire it means. A wrong cut
// (or the clock) ends the game. Bombs get more wires and trickier rules. Score: bombs defused.

const COLOURS = [
  { id: "red", hex: "#e03131" },
  { id: "blue", hex: "#1c7ed6" },
  { id: "yellow", hex: "#fab005" },
  { id: "green", hex: "#2f9e44" },
  { id: "white", hex: "#f1f3f5" },
  { id: "black", hex: "#212529" },
];
const ORD = ["first", "second", "third", "fourth", "fifth", "sixth"];

type Puzzle = { wires: string[]; rule: string; answer: number };

/** A bomb: some wires and a rule that picks exactly one of them. */
function makePuzzle(r: Rng, level: number): Puzzle {
  for (let tries = 0; tries < 200; tries++) {
    const n = Math.min(6, 3 + Math.floor(level / 2) + (r() < 0.4 ? 1 : 0));
    const wires = Array.from({ length: n }, () => pick(r, COLOURS).id);
    const count = (c: string) => wires.filter((w) => w === c).length;
    const kind = Math.floor(r() * Math.min(7, 3 + level));
    const c = pick(r, COLOURS).id;
    let rule = "";
    let answer = -1;
    if (kind === 0) {
      if (count(c) !== 1) continue;
      rule = `Cut the ${c} wire.`;
      answer = wires.indexOf(c);
    } else if (kind === 1) {
      const k = Math.floor(r() * n);
      rule = `Cut the ${ORD[k]} wire from the left.`;
      answer = k;
    } else if (kind === 2) {
      rule = "Cut the last wire.";
      answer = n - 1;
    } else if (kind === 3) {
      if (count(c) < 2) continue;
      const idx = wires.map((w, i) => (w === c ? i : -1)).filter((i) => i >= 0);
      const k = Math.min(idx.length - 1, 1);
      rule = `Cut the ${ORD[k]} ${c} wire.`;
      answer = idx[k];
    } else if (kind === 4) {
      // The only wire that isn't a colour.
      const others = wires.map((w, i) => (w !== c ? i : -1)).filter((i) => i >= 0);
      if (others.length !== 1) continue;
      rule = `Cut the wire that isn't ${c}.`;
      answer = others[0];
    } else if (kind === 5) {
      if (count(c) !== 1) continue;
      const i = wires.indexOf(c);
      if (i === 0) continue;
      rule = `Cut the wire just left of the ${c} one.`;
      answer = i - 1;
    } else {
      const c2 = pick(r, COLOURS).id;
      if (c2 === c) continue;
      const many = count(c) >= 2;
      if (many) {
        rule = `If there are two or more ${c} wires, cut the last ${c} one. Otherwise cut the first ${c2} one.`;
        answer = wires.lastIndexOf(c);
      } else {
        if (count(c2) < 1) continue;
        rule = `If there are two or more ${c} wires, cut the last ${c} one. Otherwise cut the first ${c2} one.`;
        answer = wires.indexOf(c2);
      }
    }
    if (answer >= 0) return { wires, rule, answer };
  }
  const wires = shuffle(r, ["red", "blue", "yellow"]);
  return { wires, rule: "Cut the blue wire.", answer: wires.indexOf("blue") };
}

export default function Wires({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const seconds = Number(cfg.seconds ?? 60);
  const [r] = useState(() => makeRng(seed));
  const [level, setLevel] = useState(0);
  const [p, setP] = useState(() => makePuzzle(r, 0));
  const [cut, setCut] = useState<number | null>(null);
  const [left, setLeft] = useState(seconds);
  const [boom, setBoom] = useState(false);

  useEffect(() => {
    if (boom) return;
    const id = window.setInterval(() => setLeft((l) => l - 1), 1000);
    return () => window.clearInterval(id);
  }, [boom]);
  useEffect(() => {
    if (left > 0 || boom) return;
    playSfx("explode");
    const id = window.setTimeout(() => {
      setBoom(true);
      finish(level);
    }, 0);
    return () => window.clearTimeout(id);
  }, [left, boom, level, finish]);

  function snip(i: number) {
    if (cut !== null || boom) return;
    setCut(i);
    if (i === p.answer) {
      playSfx("chime");
      window.setTimeout(() => {
        setLevel((l) => l + 1);
        setLeft((l) => l + 4);
        setP(makePuzzle(r, level + 1));
        setCut(null);
      }, 600);
    } else {
      playSfx("explode");
      setBoom(true);
      window.setTimeout(() => finish(level), 1000);
    }
  }

  return (
    <div className="space-y-3">
      <div className={cn("flex items-center justify-between rounded-2xl px-4 py-2 font-bold", boom ? "bg-hit text-white" : "bg-ink text-white")}>
        <span>{level} defused</span>
        <span className="flex items-center gap-1.5 font-mono tabular-nums text-[#ff6b6b]">
          <Bomb className="size-4" /> 0:{String(Math.max(0, left)).padStart(2, "0")}
        </span>
      </div>
      <p className="rounded-2xl border-2 border-dashed border-[#f08c00] bg-[#fff9db] p-3 text-center font-semibold">{p.rule}</p>
      <div className={cn("relative flex h-60 items-stretch justify-around rounded-3xl bg-[#343a40] px-3 pb-2 pt-4", boom && "act-shake")}>
        {p.wires.map((w, i) => {
          const hex = COLOURS.find((c) => c.id === w)!.hex;
          const isCut = cut === i;
          return (
            <button key={i} onClick={() => snip(i)} className="group relative flex w-10 flex-col items-center" aria-label={`${ORD[i]} wire, ${w}`}>
              <span className={cn("w-3 rounded-t-full shadow-inner", isCut ? "h-[44%]" : "h-[50%]")} style={{ background: hex }} />
              <span className={cn("w-3 rounded-b-full shadow-inner", isCut ? "mt-[12%] h-[44%]" : "h-[50%]")} style={{ background: hex }} />
              <Scissors className="absolute top-1/2 size-5 -translate-y-1/2 text-white opacity-0 transition group-hover:opacity-80" />
              <span className="mt-1 text-xs font-bold text-white/60">{i + 1}</span>
            </button>
          );
        })}
        {boom && <div className="absolute inset-0 grid place-items-center rounded-3xl bg-[#e03131]/80 font-display text-4xl font-extrabold text-white">BOOM</div>}
      </div>
      <p className="text-center text-xs text-muted">Wires are numbered from the left. Each bomb defused adds 4 seconds.</p>
    </div>
  );
}
