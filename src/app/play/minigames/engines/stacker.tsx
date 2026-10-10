"use client";

import { useRef } from "react";
import { playSfx } from "../../sound";
import { popText, rrect, sky, text } from "../draw";
import { makeRng } from "../rng";
import { Stage, useFinish, useKeys } from "../stage";

// Stack the Tower: a floor slides to and fro above the tower; tap to drop it. Whatever hangs
// over the edge falls off, so the floors get narrower. A perfect drop keeps the width (and five
// in a row widen it again). Score: floors.

const W = 360;
const H = 480;
const FH = 26;

export default function Stacker({ seed, onEnd }: { seed: number; onEnd: (n: number) => void }) {
  const finish = useFinish(onEnd);
  const g = useRef<{
    floors: { x: number; w: number; colour: string }[];
    x: number;
    w: number;
    dir: number;
    speed: number;
    t: number;
    cam: number;
    falling: { x: number; y: number; w: number; vy: number; colour: string }[];
    perfect: number;
    over: boolean;
    pops: { text: string; at: number }[];
    hue: number;
  } | null>(null);
  /** The game's state, made the first time it's needed (never while drawing the page). */
  function get() {
    if (!g.current) {
      const r = makeRng(seed);
      const hue = Math.floor(r() * 360);
      g.current = { floors: [{ x: 90, w: 180, colour: `hsl(${hue},55%,45%)` }], x: 0, w: 180, dir: 1, speed: 150, t: 0, cam: 0, falling: [], perfect: 0, over: false, pops: [], hue };
    }
    return g.current!;
  }

  function drop() {
    const s = get();
    if (s.over) return;
    const below = s.floors[s.floors.length - 1];
    const lo = Math.max(s.x, below.x);
    const hi = Math.min(s.x + s.w, below.x + below.w);
    const colour = `hsl(${(s.hue + s.floors.length * 12) % 360},55%,${45 + (s.floors.length % 2) * 6}%)`;
    if (hi - lo <= 0) {
      s.falling.push({ x: s.x, y: 0, w: s.w, vy: 0, colour });
      s.over = true;
      playSfx("explode");
      window.setTimeout(() => finish(s.floors.length - 1), 1000);
      return;
    }
    if (Math.abs(s.x - below.x) < 5) {
      // Perfect: snaps onto the floor below.
      s.perfect++;
      s.floors.push({ x: below.x, w: below.w + (s.perfect >= 5 ? 10 : 0), colour });
      if (s.perfect >= 5) s.perfect = 0;
      s.pops.push({ text: "Perfect!", at: s.t });
      playSfx("chime");
    } else {
      s.perfect = 0;
      const cut = s.w - (hi - lo);
      s.falling.push({ x: s.x < below.x ? s.x : hi, y: 0, w: cut, vy: 0, colour });
      s.floors.push({ x: lo, w: hi - lo, colour });
      playSfx("tick");
    }
    const top = s.floors[s.floors.length - 1];
    s.w = top.w;
    s.dir = s.floors.length % 2 ? 1 : -1;
    s.x = s.dir > 0 ? -s.w : W;
    s.speed = Math.min(380, 150 + s.floors.length * 8);
  }
  useKeys((k) => (k === " " || k === "Enter" || k === "ArrowDown") && drop());

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    s.t += dt;
    if (!s.over) {
      s.x += s.dir * s.speed * dt;
      if (s.x > W - s.w * 0.2) s.dir = -1;
      if (s.x < -s.w * 0.8) s.dir = 1;
    }
    const n = s.floors.length;
    const want = Math.max(0, (n - 10) * FH);
    s.cam += (want - s.cam) * Math.min(1, dt * 4);
    sky(c, W, H, `hsl(${210 - Math.min(150, n * 4)},60%,${60 - Math.min(40, n)}%)`, "#e7f5ff");
    const base = H - 40 + s.cam;
    rrect(c, 0, base, W, 60, 0, "#2f9e44");
    s.floors.forEach((f, i) => {
      const y = base - (i + 1) * FH;
      if (y > H || y < -FH) return;
      rrect(c, f.x, y, f.w, FH - 2, 3, f.colour);
      for (let k = 6; k < f.w - 6; k += 14) rrect(c, f.x + k, y + 7, 8, 9, 1, "rgba(255,255,255,.55)");
    });
    if (!s.over) {
      const y = base - (n + 1) * FH;
      rrect(c, s.x, y, s.w, FH - 2, 3, `hsl(${(s.hue + n * 12) % 360},55%,50%)`);
    }
    s.falling = s.falling.filter((f) => {
      if (!f.y) f.y = base - (n + (s.over ? 1 : 0)) * FH;
      f.vy += 900 * dt;
      f.y += f.vy * dt;
      rrect(c, f.x, f.y, f.w, FH - 2, 3, f.colour);
      return f.y < H + 40;
    });
    s.pops = s.pops.filter((p) => s.t - p.at < 0.8);
    for (const p of s.pops) popText(c, p.text, W / 2, 120, (s.t - p.at) / 0.8, "#fff");
    text(c, `${n - 1}`, W / 2, 50, 36, "#fff");
    text(c, "floors", W / 2, 76, 13, "#fff");
  }

  return <Stage w={W} h={H} handlers={{ frame, down: drop }} />;
}
