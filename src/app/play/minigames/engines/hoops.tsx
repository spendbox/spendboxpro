"use client";

import { useRef } from "react";
import { playSfx } from "../../sound";
import { ball, circle, line, popText, rrect, runner, text } from "../draw";
import { makeRng } from "../rng";
import { Stage, useFinish } from "../stage";
import type { EngineProps } from "../types";

// Free Throws, seen from the side: drag from the ball and let go to shoot (the drag is the
// throw: its angle and length). A clean swish is 3 points, off the rim or the board 2. Ten
// shots from different spots.

const W = 360;
const H = 480;
const BR = 12;
const RIM = { x1: 268, x2: 318, y: 190 };
const BOARD = { x: 326, top: 120, bottom: 215 };

type S = { r: ReturnType<typeof makeRng>; shot: number; bx: number; by: number; vx: number; vy: number; flying: boolean; touched: boolean; scored: boolean; from: number; drag: { x: number; y: number } | null; aim: { x: number; y: number } | null; score: number; t: number; over: boolean; pops: { text: string; at: number; colour: string }[]; settle: number };

export default function Hoops({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const shots = Number(cfg.shots ?? 10);
  const g = useRef<S | null>(null);
  function spot(s: S) {
    s.from = 50 + Math.floor(s.r() * 110);
    s.bx = s.from;
    s.by = H - 130;
    s.vx = s.vy = 0;
    s.flying = s.touched = s.scored = false;
    s.settle = 0;
  }
  function get() {
    if (!g.current) {
      const s: S = { r: makeRng(seed), shot: 0, bx: 0, by: 0, vx: 0, vy: 0, flying: false, touched: false, scored: false, from: 80, drag: null, aim: null, score: 0, t: 0, over: false, pops: [], settle: 0 };
      spot(s);
      g.current = s;
    }
    return g.current;
  }
  function release() {
    const s = get();
    if (!s.drag || !s.aim || s.flying || s.over) return;
    const dx = s.aim.x - s.drag.x;
    const dy = s.aim.y - s.drag.y;
    s.drag = s.aim = null;
    if (Math.hypot(dx, dy) < 15 || dy > 0) return;
    s.vx = Math.max(0, dx) * 2.4 + 40;
    s.vy = dy * 3.4;
    s.flying = true;
    playSfx("whoosh");
  }

  function next(s: S) {
    s.shot++;
    if (s.shot >= shots) {
      s.over = true;
      window.setTimeout(() => finish(s.score), 900);
      return;
    }
    spot(s);
  }

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    s.t += dt;
    for (let k = 0; k < 4 && s.flying; k++) step(s, dt / 4);
    if (s.flying && (s.by > H || s.bx > W + 40 || s.bx < -40 || s.settle > 2.2)) {
      if (!s.scored) s.pops.push({ text: "Miss", at: s.t, colour: "#ff8787" });
      s.flying = false;
      window.setTimeout(() => next(s), 300);
    }
    if (s.flying) s.settle += dt;
    // Court.
    c.fillStyle = "#1c2541";
    c.fillRect(0, 0, W, H);
    rrect(c, 0, H - 80, W, 80, 0, "#c0793d");
    line(c, 0, H - 80, W, H - 80, "#fff", 2);
    rrect(c, BOARD.x, BOARD.top, 8, BOARD.bottom - BOARD.top, 2, "#f8f9fa");
    rrect(c, BOARD.x + 8, BOARD.top + 40, 20, 8, 2, "#868e96");
    line(c, BOARD.x + 26, BOARD.top + 40, BOARD.x + 26, H - 80, "#868e96", 6);
    // Net.
    for (let k = 0; k <= 4; k++) line(c, RIM.x1 + k * 12.5, RIM.y, RIM.x1 + 8 + k * 9, RIM.y + 34, "rgba(255,255,255,.7)", 1.5);
    runner(c, s.from - 20, H - 80, 70, "#e03131", 0, "stand");
    ball(c, s.bx, s.by, BR, "basketball", s.flying ? s.t * 8 : 0);
    line(c, RIM.x1, RIM.y, RIM.x2, RIM.y, "#e8590c", 4);
    if (s.drag && s.aim) {
      const dx = s.aim.x - s.drag.x;
      const dy = s.aim.y - s.drag.y;
      // Preview of the first part of the arc.
      let x = s.bx;
      let y = s.by;
      const vx = Math.max(0, dx) * 2.4 + 40;
      let vy = dy * 3.4;
      for (let k = 0; k < 14; k++) {
        for (let j = 0; j < 3; j++) {
          vy += 900 * 0.016;
          x += vx * 0.016;
          y += vy * 0.016;
        }
        circle(c, x, y, 2.5, `rgba(255,255,255,${0.8 - k * 0.05})`);
      }
    }
    s.pops = s.pops.filter((p) => s.t - p.at < 1.1);
    for (const p of s.pops) popText(c, p.text, W / 2, 100, (s.t - p.at) / 1.1, p.colour);
    text(c, `${s.score} pts`, 50, 24, 17, "#ffd43b");
    text(c, `Shot ${Math.min(s.shot + 1, shots)} of ${shots}`, W - 70, 24, 14, "#fff");
    if (!s.flying && !s.over && !s.drag) text(c, "Drag up and towards the hoop, let go", W / 2, H - 30, 13, "#fff", "center", 700);
  }

  function step(s: S, dt: number) {
    s.vy += 900 * dt;
    s.bx += s.vx * dt;
    s.by += s.vy * dt;
    // Backboard.
    if (s.bx + BR > BOARD.x && s.by > BOARD.top && s.by < BOARD.bottom && s.vx > 0) {
      s.bx = BOARD.x - BR;
      s.vx = -s.vx * 0.55;
      s.touched = true;
      playSfx("tick");
    }
    // The two ends of the rim are little posts to bounce off.
    for (const rx of [RIM.x1, RIM.x2]) {
      const dx = s.bx - rx;
      const dy = s.by - RIM.y;
      const d = Math.hypot(dx, dy);
      if (d < BR + 2 && d > 0) {
        const nx = dx / d;
        const ny = dy / d;
        s.bx = rx + nx * (BR + 2);
        s.by = RIM.y + ny * (BR + 2);
        const dot = s.vx * nx + s.vy * ny;
        if (dot < 0) {
          s.vx -= 1.6 * dot * nx;
          s.vy -= 1.6 * dot * ny;
        }
        s.touched = true;
        playSfx("tick");
      }
    }
    // Through the hoop, going down.
    if (!s.scored && s.vy > 0 && s.by > RIM.y && s.by - s.vy * dt <= RIM.y && s.bx > RIM.x1 + 4 && s.bx < RIM.x2 - 4) {
      s.scored = true;
      const pts = s.touched ? 2 : 3;
      s.score += pts;
      s.pops.push({ text: s.touched ? "+2" : "SWISH! +3", at: s.t, colour: "#69db7c" });
      playSfx("found");
    }
    if (s.by > H - 80 - BR) {
      s.by = H - 80 - BR;
      s.vy = -s.vy * 0.5;
      s.vx *= 0.7;
    }
  }

  return (
    <Stage
      w={W}
      h={H}
      handlers={{
        frame,
        down: (p) => {
          const s = get();
          if (s.flying || s.over) return;
          s.drag = { x: p.x, y: p.y };
          s.aim = { x: p.x, y: p.y };
        },
        move: (p) => {
          const s = get();
          if (s.drag) s.aim = { x: p.x, y: p.y };
        },
        up: release,
      }}
    />
  );
}
