"use client";

import { useRef } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { playSfx } from "../../sound";
import { circle, rrect, text } from "../draw";
import { makeRng } from "../rng";
import { Pad, Pads, Stage, useFinish, useKeys } from "../stage";
import type { EngineProps } from "../types";

// Snake: swipe, tap the arrows or use the keys to turn. Eat to grow (gold food is worth 3 and
// speeds you up). Don't hit the walls or yourself. Score: length.

const W = 360;
const H = 480;
const CELL = 20;
const COLS = W / CELL;
const ROWS = (H - 40) / CELL;

type P = { x: number; y: number };
type S = { r: ReturnType<typeof makeRng>; body: P[]; dir: P; next: P[]; food: P; gold: boolean; grow: number; acc: number; speed: number; over: boolean; swipe: { x: number; y: number } | null; t: number };

export default function Snake({ seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const g = useRef<S | null>(null);
  function get() {
    if (!g.current) {
      const r = makeRng(seed);
      const s: S = { r, body: [{ x: 8, y: 11 }, { x: 7, y: 11 }, { x: 6, y: 11 }], dir: { x: 1, y: 0 }, next: [], food: { x: 0, y: 0 }, gold: false, grow: 0, acc: 0, speed: 7, over: false, swipe: null, t: 0 };
      place(s);
      g.current = s;
    }
    return g.current;
  }
  function place(s: S) {
    for (;;) {
      const f = { x: Math.floor(s.r() * COLS), y: Math.floor(s.r() * ROWS) };
      if (!s.body.some((b) => b.x === f.x && b.y === f.y)) {
        s.food = f;
        s.gold = s.r() < 0.15;
        return;
      }
    }
  }
  function turn(x: number, y: number) {
    const s = get();
    const last = s.next[s.next.length - 1] ?? s.dir;
    if (last.x === -x && last.y === -y) return;
    if (last.x === x && last.y === y) return;
    if (s.next.length < 3) s.next.push({ x, y });
  }
  useKeys((k) => {
    if (k === "ArrowUp" || k === "w") turn(0, -1);
    if (k === "ArrowDown" || k === "s") turn(0, 1);
    if (k === "ArrowLeft" || k === "a") turn(-1, 0);
    if (k === "ArrowRight" || k === "d") turn(1, 0);
  });

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    s.t += dt;
    if (!s.over) {
      s.acc += dt;
      while (s.acc > 1 / s.speed && !s.over) {
        s.acc -= 1 / s.speed;
        const d = s.next.shift();
        if (d) s.dir = d;
        const head = { x: s.body[0].x + s.dir.x, y: s.body[0].y + s.dir.y };
        if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || s.body.some((b) => b.x === head.x && b.y === head.y)) {
          s.over = true;
          playSfx("explode");
          window.setTimeout(() => finish(s.body.length), 900);
          break;
        }
        s.body.unshift(head);
        if (head.x === s.food.x && head.y === s.food.y) {
          s.grow += s.gold ? 3 : 1;
          s.speed = Math.min(16, s.speed + (s.gold ? 0.8 : 0.25));
          playSfx(s.gold ? "found" : "pop");
          place(s);
        }
        if (s.grow > 0) s.grow--;
        else s.body.pop();
      }
    }
    c.fillStyle = "#0b3d2c";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#0e4434";
    for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) if ((x + y) % 2) c.fillRect(x * CELL, 40 + y * CELL, CELL, CELL);
    rrect(c, 0, 0, W, 40, 0, "#062018");
    text(c, `Length ${s.body.length}`, 70, 20, 16, "#69db7c");
    circle(c, s.food.x * CELL + CELL / 2, 40 + s.food.y * CELL + CELL / 2, CELL * 0.38 * (1 + 0.1 * Math.sin(s.t * 8)), s.gold ? "#fcc419" : "#ff6b6b");
    s.body.forEach((b, i) => rrect(c, b.x * CELL + 1, 40 + b.y * CELL + 1, CELL - 2, CELL - 2, 6, i === 0 ? "#b2f2bb" : i % 2 ? "#51cf66" : "#40c057"));
    const h = s.body[0];
    circle(c, h.x * CELL + CELL / 2 + s.dir.x * 4 - s.dir.y * 4, 40 + h.y * CELL + CELL / 2 + s.dir.y * 4 + s.dir.x * 4, 2.5, "#000");
    circle(c, h.x * CELL + CELL / 2 + s.dir.x * 4 + s.dir.y * 4, 40 + h.y * CELL + CELL / 2 + s.dir.y * 4 - s.dir.x * 4, 2.5, "#000");
    if (s.over) text(c, "Game over", W / 2, H / 2, 28, "#fff");
  }

  return (
    <div>
      <Stage
        w={W}
        h={H}
        handlers={{
          frame,
          down: (p) => {
            get().swipe = { x: p.x, y: p.y };
          },
          up: (p) => {
            const s = get();
            const st = s.swipe;
            s.swipe = null;
            if (!st) return;
            const dx = p.x - st.x;
            const dy = p.y - st.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 15) {
              // A tap: turn towards it.
              const h = s.body[0];
              const hx = h.x * CELL + CELL / 2;
              const hy = 40 + h.y * CELL + CELL / 2;
              const tx = p.x - hx;
              const ty = p.y - hy;
              if (s.dir.x !== 0) turn(0, ty > 0 ? 1 : -1);
              else turn(tx > 0 ? 1 : -1, 0);
              return;
            }
            if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0);
            else turn(0, dy > 0 ? 1 : -1);
          },
        }}
      />
      <Pads>
        <Pad onDown={() => turn(-1, 0)}>
          <ArrowLeft className="size-6" />
        </Pad>
        <Pad onDown={() => turn(0, -1)}>
          <ArrowUp className="size-6" />
        </Pad>
        <Pad onDown={() => turn(0, 1)}>
          <ArrowDown className="size-6" />
        </Pad>
        <Pad onDown={() => turn(1, 0)}>
          <ArrowRight className="size-6" />
        </Pad>
      </Pads>
    </div>
  );
}
