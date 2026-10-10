"use client";

import { useRef } from "react";
import { circle, line, popText, rrect, text } from "../draw";
import { makeRng } from "../rng";
import { drum } from "../sfx";
import { Stage, useFinish, useKeys } from "../stage";
import type { EngineProps } from "../types";

// Talking Drums: notes fall down three lanes (low, middle, high drum) in a groove made from the
// seed. Tap a lane as its note crosses the line: perfect 40, good 20, plus a bonus for every
// 10 in a row. 45 seconds.

const W = 360;
const H = 480;
const LINE = 400;
const SPEED = 260;
const SECONDS = 45;
const BPM = 112;

type Note = { at: number; lane: number; hit: number };

export default function Rhythm({ seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const g = useRef<{ t: number; notes: Note[]; score: number; streak: number; best: number; pops: { text: string; lane: number; at: number; colour: string }[]; flash: number[]; over: boolean } | null>(null);
  /** The game's state, made the first time it's needed (never while drawing the page). */
  function get() {
    if (!g.current) {
      const r = makeRng(seed);
      const beat = 60 / BPM;
      const notes: Note[] = [];
      // A groove: bars of 8 half-beats; each bar picks a pattern, busier as the song goes on.
      const patterns = [
        [0, -1, 1, -1, 0, -1, 2, -1],
        [0, -1, 0, 1, -1, 2, 1, -1],
        [0, 2, -1, 1, 0, -1, 2, 2],
        [0, -1, 1, 2, 0, 1, 2, 1],
        [2, -1, 2, 1, 0, 0, 1, -1],
      ];
      for (let bar = 0; bar * 4 * beat < SECONDS - 3; bar++) {
        const p = patterns[Math.min(patterns.length - 1, Math.floor(r() * (2 + bar / 3)))];
        p.forEach((lane, i) => {
          if (lane >= 0) notes.push({ at: 2 + bar * 4 * beat + (i * beat) / 2, lane, hit: 0 });
        });
      }
      g.current = { t: 0, notes, score: 0, streak: 0, best: 0, pops: [], flash: [0, 0, 0], over: false };
    }
    return g.current!;
  }

  function hit(lane: number) {
    const s = get();
    if (s.over) return;
    s.flash[lane] = 0.15;
    drum(lane);
    let best: Note | null = null;
    for (const n of s.notes) if (!n.hit && n.lane === lane && Math.abs(n.at - s.t) < 0.16 && (!best || Math.abs(n.at - s.t) < Math.abs(best.at - s.t))) best = n;
    if (!best) {
      s.streak = 0;
      return;
    }
    const err = Math.abs(best.at - s.t);
    best.hit = s.t;
    s.streak++;
    s.best = Math.max(s.best, s.streak);
    const pts = (err < 0.06 ? 40 : 20) + Math.floor(s.streak / 10) * 5;
    s.score += pts;
    s.pops.push({ text: err < 0.06 ? "Perfect" : "Good", lane, at: s.t, colour: err < 0.06 ? "#69db7c" : "#ffd43b" });
  }
  useKeys((k) => {
    if (k === "ArrowLeft" || k === "a" || k === "1") hit(0);
    if (k === "ArrowDown" || k === "ArrowUp" || k === "s" || k === "2") hit(1);
    if (k === "ArrowRight" || k === "d" || k === "3") hit(2);
  });

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    s.t += dt;
    if (!s.over && s.t > SECONDS) {
      s.over = true;
      window.setTimeout(() => finish(s.score), 600);
    }
    c.fillStyle = "#2b1d0e";
    c.fillRect(0, 0, W, H);
    const lx = [70, 180, 290];
    const colours = ["#e8590c", "#fab005", "#2f9e44"];
    lx.forEach((x, i) => {
      rrect(c, x - 45, 0, 90, H, 0, i % 2 ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.08)");
      s.flash[i] = Math.max(0, s.flash[i] - dt);
      circle(c, x, LINE, 34, s.flash[i] > 0 ? colours[i] : "rgba(255,255,255,.12)", colours[i], 4);
    });
    line(c, 20, LINE, W - 20, LINE, "rgba(255,255,255,.3)", 2);
    for (const n of s.notes) {
      if (n.hit) continue;
      const y = LINE - (n.at - s.t) * SPEED;
      if (y < -30 || y > H + 30) {
        if (y > H + 30 && !n.hit) {
          n.hit = -1;
          s.streak = 0;
        }
        continue;
      }
      circle(c, lx[n.lane], y, 24, colours[n.lane], "#fff", 3);
      circle(c, lx[n.lane], y, 10, "rgba(0,0,0,.25)");
    }
    s.pops = s.pops.filter((p) => s.t - p.at < 0.6);
    for (const p of s.pops) popText(c, p.text, lx[p.lane], LINE - 50, (s.t - p.at) / 0.6, p.colour);
    rrect(c, 0, 0, W, 32, 0, "rgba(0,0,0,.5)");
    text(c, `${s.score}`, 36, 16, 17, "#ffd43b");
    if (s.streak >= 5) text(c, `${s.streak} streak`, W / 2, 16, 14, "#69db7c");
    text(c, `${Math.max(0, Math.ceil(SECONDS - s.t))}s`, W - 26, 16, 15, "#fff");
    text(c, "Low", 70, H - 20, 12, "#adb5bd");
    text(c, "Middle", 180, H - 20, 12, "#adb5bd");
    text(c, "High", 290, H - 20, 12, "#adb5bd");
  }

  return <Stage w={W} h={H} handlers={{ frame, down: (p) => hit(p.x < 125 ? 0 : p.x < 235 ? 1 : 2) }} />;
}
