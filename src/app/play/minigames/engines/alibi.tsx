"use client";

import { useEffect, useState } from "react";
import { Camera, CreditCard, Smartphone, UserSearch } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { makeRng, pick, shuffle, type Rng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Interrogation: a suspect gives three statements about their evening. One piece of evidence
// (a camera, a card receipt, their phone, a witness) puts them somewhere else at one of those
// times. Tap the statement that's a lie. 15 seconds each. Score: lies found.

const NAMES = ["Tunde", "Chioma", "Kwame", "Aisha", "Dami", "Ngozi", "Femi", "Zainab", "Kofi", "Wanjiru", "Sipho", "Lerato", "Jordan", "Priya", "Liam", "Ama"];
const PLACES = ["the gym", "the market", "the club", "the cinema", "the bank", "the train station", "the mall", "church", "the mosque", "the stadium", "home", "the hospital", "the restaurant", "the barber's", "the beach", "the airport", "the office"];
const DOING: Record<string, string> = {
  "the gym": "working out",
  "the market": "buying tomatoes",
  "the club": "dancing",
  "the cinema": "watching a film",
  "the bank": "paying in money",
  "the train station": "waiting for a train",
  "the mall": "shopping",
  church: "at choir practice",
  "the mosque": "at prayers",
  "the stadium": "watching the match",
  home: "asleep",
  "the hospital": "visiting my aunt",
  "the restaurant": "having jollof",
  "the barber's": "getting a trim",
  "the beach": "walking by the sea",
  "the airport": "picking up my cousin",
  "the office": "working late",
};
const EVIDENCE = [
  { icon: Camera, text: (n: string, p: string, t: string) => `CCTV: ${n} caught on camera at ${p} at ${t}.` },
  { icon: CreditCard, text: (n: string, p: string, t: string) => `Bank records: ${n}'s card was used at ${p} at ${t}.` },
  { icon: Smartphone, text: (n: string, p: string, t: string) => `Phone records: ${n}'s phone was at ${p} at ${t}.` },
  { icon: UserSearch, text: (n: string, p: string, t: string) => `A witness saw ${n} at ${p} at ${t}.` },
];
const SECS = 15;

function makeCase(r: Rng) {
  const name = pick(r, NAMES);
  const start = 6 + Math.floor(r() * 4);
  const places = shuffle(r, PLACES).slice(0, 4);
  const times = [start, start + 1 + Math.floor(r() * 2), start + 3 + Math.floor(r() * 2)];
  const fmt = (h: number) => (h <= 11 ? `${h}pm` : h === 12 ? "midnight" : `${h - 12}am`);
  const statements = times.map((h, i) => `At ${fmt(h)} I was at ${places[i]}, ${DOING[places[i]]}.`);
  const lie = Math.floor(r() * 3);
  const ev = pick(r, EVIDENCE);
  return { name, statements, lie, evidence: ev.text(name, places[3], fmt(times[lie])), Icon: ev.icon };
}

export default function Alibi({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const rounds = Number(cfg.rounds ?? 8);
  const [r] = useState(() => makeRng(seed));
  const [n, setN] = useState(0);
  const [c, setC] = useState(() => makeCase(r));
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [left, setLeft] = useState(SECS);

  useEffect(() => {
    if (picked !== null) return;
    const id = window.setInterval(() => setLeft((l) => l - 1), 1000);
    return () => window.clearInterval(id);
  }, [picked]);
  useEffect(() => {
    if (left > 0 || picked !== null) return;
    const id = window.setTimeout(() => choose(-1), 0);
    return () => window.clearTimeout(id);
  });

  function choose(i: number) {
    if (picked !== null) return;
    setPicked(i);
    const ok = i === c.lie;
    const total = score + (ok ? 1 : 0);
    setScore(total);
    playSfx(ok ? "chime" : "denied");
    window.setTimeout(() => {
      if (n + 1 >= rounds) return finish(total);
      setN(n + 1);
      setC(makeCase(r));
      setPicked(null);
      setLeft(SECS);
    }, 1300);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span>
          Suspect {n + 1} of {rounds}
        </span>
        <span>{score} lies caught</span>
        <span className="tabular-nums">{Math.max(0, left)}s</span>
      </div>
      <div className="rounded-2xl bg-[#fff3bf] p-3 text-sm font-semibold">
        <c.Icon className="mr-1.5 inline size-4" />
        {c.evidence}
      </div>
      <p className="text-sm font-bold">{c.name} says:</p>
      <div className="space-y-2">
        {c.statements.map((s, i) => (
          <button
            key={i}
            onClick={() => choose(i)}
            className={cn("w-full rounded-2xl bg-panel-2 px-4 py-3 text-left text-sm", picked !== null && i === c.lie && "bg-[#ffe3e3] ring-2 ring-hit", picked === i && i !== c.lie && "ring-2 ring-line")}
          >
            &ldquo;{s}&rdquo;
            {picked !== null && i === c.lie && <b className="ml-1 text-hit">LIE</b>}
          </button>
        ))}
      </div>
    </div>
  );
}
