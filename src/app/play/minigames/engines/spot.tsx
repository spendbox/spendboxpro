"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { playSfx } from "../../sound";
import { makeRng, pick, type Rng } from "../rng";
import { useFinish } from "../stage";
import type { EngineProps } from "../types";

// CCTV Spot the Difference: two camera stills of the same street; the bottom one has four
// changes (something gone, something new, a different colour, something moved or bigger).
// Tap them on the bottom picture. 25 seconds a still; a wrong tap costs 2 seconds.

type Obj = { id: number; kind: "building" | "car" | "person" | "tree" | "lamp" | "sign" | "bin"; x: number; y: number; s: number; colour: string };
type Diff = { x: number; y: number; found: boolean };

const COLOURS = ["#e03131", "#1c7ed6", "#2f9e44", "#fab005", "#7048e8", "#e64980", "#f08c00", "#868e96"];
const SECS = 25;

function scene(r: Rng): Obj[] {
  const objs: Obj[] = [];
  let id = 1;
  let x = 5;
  while (x < 280) {
    const w = 30 + r() * 30;
    objs.push({ id: id++, kind: "building", x, y: 60 + r() * 40, s: w, colour: pick(r, ["#adb5bd", "#ced4da", "#e9ecef", "#ffe8cc", "#d0bfff", "#c3fae8"]) });
    x += w + 4;
  }
  for (let k = 0; k < 9; k++) {
    const kind = pick(r, ["car", "person", "tree", "lamp", "sign", "bin", "person", "car"] as const);
    objs.push({ id: id++, kind, x: 15 + r() * 270, y: kind === "car" ? 170 + r() * 15 : 150 + r() * 30, s: 1, colour: pick(r, COLOURS) });
  }
  return objs;
}

function Draw({ o }: { o: Obj }) {
  const { x, y, s, colour } = o;
  switch (o.kind) {
    case "building":
      return (
        <g>
          <rect x={x} y={y} width={s} height={150 - y} fill={colour} stroke="#495057" strokeWidth={0.6} />
          {Array.from({ length: Math.floor((150 - y) / 16) }, (_, j) =>
            Array.from({ length: Math.floor(s / 12) }, (_, i) => <rect key={`${i}-${j}`} x={x + 4 + i * 12} y={y + 5 + j * 16} width={6} height={8} fill="#74c0fc" opacity={0.8} />),
          )}
        </g>
      );
    case "car":
      return (
        <g transform={`translate(${x},${y}) scale(${s})`}>
          <rect x={-16} y={-8} width={32} height={10} rx={3} fill={colour} />
          <rect x={-9} y={-14} width={18} height={7} rx={2} fill={colour} />
          <circle cx={-9} cy={3} r={3.5} fill="#212529" />
          <circle cx={9} cy={3} r={3.5} fill="#212529" />
        </g>
      );
    case "person":
      return (
        <g transform={`translate(${x},${y}) scale(${s})`}>
          <circle cx={0} cy={-18} r={4} fill="#f1c27d" />
          <rect x={-4} y={-14} width={8} height={11} rx={2} fill={colour} />
          <rect x={-4} y={-3} width={3} height={8} fill="#343a40" />
          <rect x={1} y={-3} width={3} height={8} fill="#343a40" />
        </g>
      );
    case "tree":
      return (
        <g transform={`translate(${x},${y}) scale(${s})`}>
          <rect x={-2} y={-8} width={4} height={10} fill="#8d5524" />
          <circle cx={0} cy={-15} r={9} fill="#2f9e44" />
        </g>
      );
    case "lamp":
      return (
        <g transform={`translate(${x},${y}) scale(${s})`}>
          <rect x={-1} y={-30} width={2} height={32} fill="#495057" />
          <circle cx={0} cy={-31} r={3} fill={colour} />
        </g>
      );
    case "sign":
      return (
        <g transform={`translate(${x},${y}) scale(${s})`}>
          <rect x={-1} y={-16} width={2} height={18} fill="#495057" />
          <rect x={-7} y={-24} width={14} height={9} rx={1} fill={colour} />
        </g>
      );
    case "bin":
      return (
        <g transform={`translate(${x},${y}) scale(${s})`}>
          <rect x={-4} y={-9} width={8} height={10} rx={1} fill={colour} />
        </g>
      );
  }
}

function round(r: Rng) {
  const a = scene(r);
  const b = a.map((o) => ({ ...o }));
  const diffs: Diff[] = [];
  const small = b.filter((o) => o.kind !== "building");
  const used = new Set<number>();
  const take = () => {
    const free = small.filter((o) => !used.has(o.id));
    if (!free.length) return null;
    const o = pick(r, free);
    used.add(o.id);
    return o;
  };
  let guard = 0;
  const centre = (o: Obj) => ({ x: o.x, y: o.kind === "car" ? o.y - 4 : o.y - 10 });
  for (let k = 0; k < 4 && guard++ < 60; k++) {
    const t = k === 0 ? "gone" : k === 1 ? "colour" : k === 2 ? "new" : pick(r, ["bigger", "moved"]);
    if (t === "new") {
      const o: Obj = { id: 999 + k, kind: pick(r, ["person", "tree", "sign", "bin"] as const), x: 20 + r() * 260, y: 150 + r() * 25, s: 1, colour: pick(r, COLOURS) };
      if (diffs.some((d) => Math.hypot(d.x - o.x, d.y - o.y) < 25)) {
        k--;
        continue;
      }
      b.push(o);
      diffs.push({ ...centre(o), found: false });
      continue;
    }
    const o = take();
    if (!o) {
      k--;
      continue;
    }
    if (diffs.some((d) => Math.hypot(d.x - o.x, d.y - o.y) < 25)) {
      k--;
      continue;
    }
    if (t === "gone") {
      diffs.push({ ...centre(o), found: false });
      b.splice(b.indexOf(o), 1);
    } else if (t === "colour") {
      o.colour = pick(r, COLOURS.filter((c) => c !== o.colour));
      diffs.push({ ...centre(o), found: false });
    } else if (t === "bigger") {
      o.s = 1.6;
      diffs.push({ ...centre(o), found: false });
    } else {
      const before = centre(o);
      o.x = Math.max(15, Math.min(285, o.x + (r() < 0.5 ? -30 : 30)));
      diffs.push({ x: (before.x + o.x) / 2, y: before.y, found: false });
    }
  }
  return { a, b, diffs };
}

export default function Spot({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const rounds = Number(cfg.rounds ?? 6);
  const [r] = useState(() => makeRng(seed));
  const [n, setN] = useState(0);
  const [pic, setPic] = useState(() => round(r));
  const [found, setFound] = useState(0);
  const [left, setLeft] = useState(SECS);
  const [miss, setMiss] = useState<{ x: number; y: number } | null>(null);

  const next = (total: number) => {
    if (n + 1 >= rounds) return finish(total);
    setN(n + 1);
    setPic(round(r));
    setLeft(SECS);
  };
  useEffect(() => {
    const id = window.setInterval(() => setLeft((l) => l - 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (left > 0) return;
    const id = window.setTimeout(() => next(found), 0);
    return () => window.clearTimeout(id);
  });

  function tap(e: React.MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 300;
    const y = ((e.clientY - box.top) / box.height) * 200;
    const d = pic.diffs.find((dd) => !dd.found && Math.hypot(dd.x - x, dd.y - y) < 20);
    if (d) {
      d.found = true;
      const total = found + 1;
      setFound(total);
      playSfx("chime");
      if (pic.diffs.every((dd) => dd.found)) window.setTimeout(() => next(total), 500);
      else setPic({ ...pic });
    } else {
      playSfx("denied");
      setLeft((l) => l - 2);
      setMiss({ x, y });
      window.setTimeout(() => setMiss(null), 400);
    }
  }

  const drawPic = (objs: Obj[], onTap?: (e: React.MouseEvent<SVGSVGElement>) => void) => (
    <svg viewBox="0 0 300 200" className={cn("w-full rounded-2xl bg-[#d0ebff]", onTap && "cursor-crosshair")} onClick={onTap}>
      <rect x={0} y={150} width={300} height={50} fill="#868e96" />
      <rect x={0} y={150} width={300} height={4} fill="#adb5bd" />
      {objs.map((o) => (
        <Draw key={o.id} o={o} />
      ))}
      {onTap && pic.diffs.filter((d) => d.found).map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={14} fill="none" stroke="#2f9e44" strokeWidth={3} />)}
      {onTap && miss && <circle cx={miss.x} cy={miss.y} r={10} fill="none" stroke="#e03131" strokeWidth={3} />}
      <text x={8} y={14} fontSize={9} fill="#e03131" fontFamily="monospace">● REC CAM {onTap ? "2" : "1"}</text>
    </svg>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
        <span>
          Still {n + 1} of {rounds}
        </span>
        <span>{pic.diffs.filter((d) => d.found).length} / {pic.diffs.length} here · {found} total</span>
        <span className={cn("tabular-nums", left <= 5 && "text-[#ff6b6b]")}>{Math.max(0, left)}s</span>
      </div>
      {drawPic(pic.a)}
      {drawPic(pic.b, tap)}
      <p className="text-center text-xs text-muted">Tap the differences on the bottom picture.</p>
    </div>
  );
}
