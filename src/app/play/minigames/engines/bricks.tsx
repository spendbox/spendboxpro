"use client";

import { useRef } from "react";
import { playSfx } from "../../sound";
import { ball, circle, rrect, text } from "../draw";
import { makeRng } from "../rng";
import { Stage, useFinish, useKeys } from "../stage";
import type { EngineProps } from "../types";

// Brick Breaker: drag (or use the arrow keys) to move the paddle and keep the ball bouncing
// into the bricks. Tougher bricks take two hits. Clear a wall and a faster one drops in. Three
// balls. Score: 10 a brick (20 for tough ones), plus 100 for each wall cleared.

const W = 360;
const H = 480;
const PW = 74;
const BR = 7;
const COLS = 8;

type Brick = { x: number; y: number; hp: number; colour: string };
type S = { r: ReturnType<typeof makeRng>; bricks: Brick[]; px: number; bx: number; by: number; vx: number; vy: number; stuck: boolean; lives: number; score: number; wall: number; over: boolean; keys: number; t: number };

function wall(r: ReturnType<typeof makeRng>, n: number): Brick[] {
  const out: Brick[] = [];
  const rows = Math.min(8, 4 + n);
  const bw = (W - 20) / COLS;
  const colours = ["#e03131", "#f08c00", "#fab005", "#2f9e44", "#1c7ed6", "#7048e8", "#e64980", "#0c8599"];
  for (let row = 0; row < rows; row++) for (let col = 0; col < COLS; col++) {
    if (n > 0 && r() < 0.12) continue;
    out.push({ x: 10 + col * bw, y: 50 + row * 20, hp: row < n ? 2 : 1, colour: colours[(row + n) % colours.length] });
  }
  return out;
}

export default function Bricks({ seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const g = useRef<S | null>(null);
  function get() {
    if (!g.current) {
      const r = makeRng(seed);
      g.current = { r, bricks: wall(r, 0), px: W / 2, bx: W / 2, by: H - 60, vx: 0, vy: 0, stuck: true, lives: 3, score: 0, wall: 0, over: false, keys: 0, t: 0 };
    }
    return g.current;
  }
  function launch() {
    const s = get();
    if (!s.stuck || s.over) return;
    s.stuck = false;
    const sp = 300 + s.wall * 30;
    const a = (s.r() - 0.5) * 0.8;
    s.vx = Math.sin(a) * sp;
    s.vy = -Math.cos(a) * sp;
  }
  useKeys(
    (k) => {
      const s = get();
      if (k === "ArrowLeft") s.keys = -1;
      if (k === "ArrowRight") s.keys = 1;
      if (k === " " || k === "ArrowUp") launch();
    },
    (k) => {
      const s = get();
      if ((k === "ArrowLeft" && s.keys < 0) || (k === "ArrowRight" && s.keys > 0)) s.keys = 0;
    },
  );

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    s.t += dt;
    if (s.keys) s.px = Math.max(PW / 2, Math.min(W - PW / 2, s.px + s.keys * 420 * dt));
    for (let k = 0; k < 4 && !s.over; k++) step(s, dt / 4);
    c.fillStyle = "#141a2e";
    c.fillRect(0, 0, W, H);
    for (const b of s.bricks) {
      rrect(c, b.x + 1, b.y + 1, (W - 20) / COLS - 2, 18, 4, b.colour);
      if (b.hp > 1) rrect(c, b.x + 4, b.y + 4, (W - 20) / COLS - 8, 12, 3, "rgba(255,255,255,.35)");
    }
    rrect(c, s.px - PW / 2, H - 40, PW, 12, 6, "#e9ecef");
    ball(c, s.bx, s.by, BR, "golf");
    text(c, `${s.score}`, 36, 20, 16, "#ffd43b");
    for (let k = 0; k < s.lives; k++) circle(c, W - 20 - k * 16, 20, 5, "#ff8787");
    if (s.stuck && !s.over) text(c, "Tap to launch", W / 2, H / 2 + 60, 15, "#fff");
  }

  function step(s: S, dt: number) {
    if (s.stuck) {
      s.bx = s.px;
      s.by = H - 40 - BR - 1;
      return;
    }
    s.bx += s.vx * dt;
    s.by += s.vy * dt;
    if (s.bx < BR || s.bx > W - BR) {
      s.vx = -s.vx;
      s.bx = Math.max(BR, Math.min(W - BR, s.bx));
    }
    if (s.by < BR + 30) {
      s.vy = Math.abs(s.vy);
    }
    // Paddle: where it hits sets the angle.
    if (s.vy > 0 && s.by + BR >= H - 40 && s.by < H - 28 && Math.abs(s.bx - s.px) < PW / 2 + BR) {
      const off = (s.bx - s.px) / (PW / 2);
      const sp = Math.hypot(s.vx, s.vy);
      s.vx = off * sp * 0.8;
      s.vy = -Math.sqrt(Math.max(1, sp * sp - s.vx * s.vx));
      playSfx("pop");
    }
    if (s.by > H + 20) {
      s.lives--;
      playSfx("miss");
      if (s.lives <= 0) {
        s.over = true;
        window.setTimeout(() => finish(s.score), 800);
      } else s.stuck = true;
      return;
    }
    const bw = (W - 20) / COLS;
    for (const b of s.bricks) {
      if (s.bx + BR < b.x || s.bx - BR > b.x + bw || s.by + BR < b.y || s.by - BR > b.y + 20) continue;
      // Bounce off the side it came in from.
      const fromSide = Math.min(Math.abs(s.bx - b.x), Math.abs(s.bx - (b.x + bw))) < Math.min(Math.abs(s.by - b.y), Math.abs(s.by - (b.y + 20)));
      if (fromSide) s.vx = -s.vx;
      else s.vy = -s.vy;
      b.hp--;
      s.score += 10;
      playSfx("tick");
      break;
    }
    s.bricks = s.bricks.filter((b) => b.hp > 0);
    if (!s.bricks.length) {
      s.score += 100;
      s.wall++;
      s.bricks = wall(s.r, s.wall);
      s.stuck = true;
      playSfx("levelup");
    }
  }

  return (
    <Stage
      w={W}
      h={H}
      handlers={{
        frame,
        down: (p) => {
          get().px = Math.max(PW / 2, Math.min(W - PW / 2, p.x));
          launch();
        },
        move: (p) => {
          get().px = Math.max(PW / 2, Math.min(W - PW / 2, p.x));
        },
      }}
    />
  );
}
