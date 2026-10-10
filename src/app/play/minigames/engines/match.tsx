"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { makeRng, shuffle, type Rng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// Fingerprint Match: the print from the crime scene, and four suspects' prints. Only one is the
// same: same pattern (loop, whorl or arch), the same tilt and the same little breaks in the
// ridges. 10 prints; each has 12 seconds. Score: matches.

type Print = { type: 0 | 1 | 2; tilt: number; cx: number; breaks: [number, number][] };
const SECS = 12;

function makePrint(r: Rng): Print {
  return {
    type: Math.floor(r() * 3) as 0 | 1 | 2,
    tilt: Math.round((r() - 0.5) * 30),
    cx: Math.round(45 + r() * 10),
    breaks: Array.from({ length: 4 }, () => [2 + Math.floor(r() * 7), Math.round(r() * 300)] as [number, number]),
  };
}

function variant(r: Rng, p: Print, hard: number): Print {
  const v: Print = { ...p, breaks: p.breaks.map((b) => [...b] as [number, number]) };
  const what = Math.floor(r() * (hard > 4 ? 3 : 4));
  if (what === 0) v.breaks[Math.floor(r() * 4)] = [2 + Math.floor(r() * 7), Math.round(r() * 300)];
  else if (what === 1) v.breaks[Math.floor(r() * 4)][1] = (v.breaks[0][1] + 60 + Math.floor(r() * 180)) % 300;
  else if (what === 2) v.tilt = p.tilt + (r() < 0.5 ? -14 : 14);
  else v.type = ((p.type + 1 + Math.floor(r() * 2)) % 3) as 0 | 1 | 2;
  return v;
}

/** A point on ridge k at position u (0-300 along it). */
function along(p: Print, k: number, u: number): [number, number] {
  const t = u / 300;
  if (p.type === 0) {
    // Whorl: rings.
    const a = t * Math.PI * 2;
    return [p.cx + Math.cos(a) * (6 + k * 4.2), 55 + Math.sin(a) * (8 + k * 5)];
  }
  if (p.type === 1) {
    // Loop: U shapes opening downwards.
    const a = Math.PI + t * Math.PI;
    return [p.cx + Math.cos(a) * (5 + k * 4.3), 50 + Math.sin(a) * (9 + k * 5.2) + (t < 0.2 || t > 0.8 ? 0 : 0)];
  }
  // Arch: gentle humps.
  const x = 10 + t * 80;
  return [x, 30 + k * 7 - Math.sin(t * Math.PI) * (14 - k)];
}

function PrintSvg({ p, size }: { p: Print; size: number }) {
  const ridges = 10;
  const path = (k: number) => {
    let d = "";
    for (let u = 0; u <= 300; u += 10) {
      const [x, y] = along(p, k, u);
      d += `${u ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return d;
  };
  return (
    <svg viewBox="0 0 100 110" width={size} height={size * 1.1} aria-hidden>
      <defs>
        <clipPath id="finger">
          <ellipse cx="50" cy="55" rx="40" ry="50" />
        </clipPath>
      </defs>
      <ellipse cx="50" cy="55" rx="40" ry="50" fill="#f8f0e3" />
      <g clipPath="url(#finger)" transform={`rotate(${p.tilt} 50 55)`}>
        {Array.from({ length: ridges }, (_, k) => (
          <path key={k} d={path(k)} fill="none" stroke="#343a40" strokeWidth={1.6} strokeLinecap="round" />
        ))}
        {p.type === 1 && Array.from({ length: 6 }, (_, k) => <line key={k} x1={10 + k * 16} y1={70} x2={14 + k * 16} y2={105} stroke="#343a40" strokeWidth={1.6} />)}
        {p.breaks.map(([k, u], i) => {
          const [x, y] = along(p, k, u);
          return <circle key={i} cx={x} cy={y} r={2.6} fill="#f8f0e3" />;
        })}
      </g>
    </svg>
  );
}

export default function Match({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const rounds = Number(cfg.rounds ?? 10);
  const [r] = useState(() => makeRng(seed));
  const make = (n: number) => {
    const p = makePrint(r);
    const opts = [p];
    while (opts.length < 4) opts.push(variant(r, p, n));
    const sh = shuffle(r, opts);
    return { p, opts: sh, right: sh.indexOf(p) };
  };
  const [n, setN] = useState(0);
  const [q, setQ] = useState(() => make(0));
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
    const ok = i === q.right;
    const total = score + (ok ? 1 : 0);
    setScore(total);
    playSfx(ok ? "chime" : "denied");
    window.setTimeout(() => {
      if (n + 1 >= rounds) return finish(total);
      setN(n + 1);
      setQ(make(n + 1));
      setPicked(null);
      setLeft(SECS);
    }, 900);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span>
          Print {n + 1} of {rounds}
        </span>
        <span>{score} matched</span>
        <span className="tabular-nums">{Math.max(0, left)}s</span>
      </div>
      <div className="flex items-center justify-center gap-3 rounded-3xl bg-[#e7f5ff] p-3">
        <PrintSvg p={q.p} size={110} />
        <p className="text-sm font-semibold text-muted">From the scene. Which suspect matches?</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {q.opts.map((o, i) => (
          <button
            key={i}
            onClick={() => choose(i)}
            className={cn("grid place-items-center rounded-2xl bg-panel-2 p-1", picked !== null && i === q.right && "ring-4 ring-me", picked === i && i !== q.right && "ring-4 ring-hit")}
            aria-label={`Suspect ${i + 1}`}
          >
            <PrintSvg p={o} size={70} />
          </button>
        ))}
      </div>
    </div>
  );
}
