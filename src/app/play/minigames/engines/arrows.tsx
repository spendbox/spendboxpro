"use client";

import { useRef } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { playSfx } from "../../sound";
import { line, popText, rrect, runner, text } from "../draw";
import { makeRng } from "../rng";
import { Pad, Pads, Stage, useFinish, useKeys } from "../stage";
import type { EngineProps } from "../types";

// Skate Tricks: a trick appears as an arrow; swipe that way (or tap the arrow button) before its
// timer runs out. Every trick in a row raises the multiplier; a miss or a wrong way resets it.
// The time to answer shrinks as you go. 40 seconds.

const W = 360;
const H = 480;
const DIRS = ["up", "down", "left", "right"] as const;
type Dir = (typeof DIRS)[number];
const TRICKS: Record<Dir, string[]> = {
  up: ["Ollie", "Kickflip", "Heelflip", "360 Flip"],
  down: ["Manual", "Grind", "Boardslide", "Nose grind"],
  left: ["Pop shove-it", "Frontside 180", "Varial", "Tail slide"],
  right: ["Backside 180", "Impossible", "Hardflip", "Nollie"],
};

export default function Arrows({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const seconds = Number(cfg.seconds ?? 40);
  const g = useRef<{
    r: ReturnType<typeof makeRng>;
    t: number;
    dir: Dir;
    name: string;
    shownAt: number;
    window: number;
    chain: number;
    score: number;
    over: boolean;
    pops: { text: string; at: number; colour: string }[];
    swipe: { x: number; y: number } | null;
    spin: number;
  } | null>(null);
  /** The game's state, made the first time it's needed (never while drawing the page). */
  function get() {
    if (!g.current) {
      const r = makeRng(seed);
      const dir = DIRS[Math.floor(r() * 4)];
      g.current = { r, t: 0, dir, name: TRICKS[dir][0], shownAt: 0.3, window: 1.6, chain: 0, score: 0, over: false, pops: [], swipe: null, spin: 0 };
    }
    return g.current!;
  }

  function nextTrick(s: NonNullable<typeof g.current>) {
    s.dir = DIRS[Math.floor(s.r() * 4)];
    s.name = TRICKS[s.dir][Math.floor(s.r() * 4)];
    s.shownAt = s.t + 0.15;
    s.window = Math.max(0.55, 1.6 - s.t / 40);
  }

  function answer(d: Dir) {
    const s = get();
    if (s.over || s.t < s.shownAt) return;
    if (d === s.dir) {
      s.chain++;
      const mult = 1 + Math.floor(s.chain / 5) * 0.5;
      const quick = Math.max(0, 1 - (s.t - s.shownAt) / s.window);
      const pts = Math.round((40 + quick * 30) * mult);
      s.score += pts;
      s.pops.push({ text: `${s.name}! +${pts}`, at: s.t, colour: "#69db7c" });
      s.spin = 1;
      playSfx("whoosh");
    } else {
      s.chain = 0;
      s.pops.push({ text: "Bailed!", at: s.t, colour: "#ff8787" });
      playSfx("miss");
    }
    nextTrick(s);
  }
  useKeys((k) => {
    if (k === "ArrowUp" || k === "w") answer("up");
    if (k === "ArrowDown" || k === "s") answer("down");
    if (k === "ArrowLeft" || k === "a") answer("left");
    if (k === "ArrowRight" || k === "d") answer("right");
  });

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    s.t += dt;
    if (!s.over && s.t >= seconds) {
      s.over = true;
      window.setTimeout(() => finish(s.score), 700);
    }
    if (!s.over && s.t > s.shownAt + s.window) {
      s.chain = 0;
      s.pops.push({ text: "Too slow", at: s.t, colour: "#ff8787" });
      nextTrick(s);
    }
    c.fillStyle = "#adb5bd";
    c.fillRect(0, 0, W, H);
    rrect(c, 0, 330, W, 150, 0, "#868e96");
    // A ramp and the skater.
    c.beginPath();
    c.moveTo(220, 330);
    c.quadraticCurveTo(320, 330, 340, 230);
    c.lineTo(360, 230);
    c.lineTo(360, 330);
    c.closePath();
    c.fillStyle = "#495057";
    c.fill();
    s.spin = Math.max(0, s.spin - dt * 2);
    const hop = Math.sin(s.spin * Math.PI) * 50;
    c.save();
    c.translate(140, 320 - hop);
    c.rotate(s.spin * Math.PI * 2 * (s.dir === "left" ? -1 : 1));
    line(c, -26, 8, 26, 8, "#e03131", 6);
    c.restore();
    runner(c, 140, 314 - hop, 56, "#7048e8", 0, "stand");
    // The trick to do.
    if (!s.over && s.t >= s.shownAt) {
      const left = 1 - (s.t - s.shownAt) / s.window;
      rrect(c, 110, 60, 140, 140, 24, "rgba(255,255,255,.9)");
      const a = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[s.dir];
      c.save();
      c.translate(180, 130);
      c.rotate(a);
      line(c, -36, 0, 30, 0, "#7048e8", 12);
      c.beginPath();
      c.moveTo(42, 0);
      c.lineTo(14, -24);
      c.lineTo(14, 24);
      c.closePath();
      c.fillStyle = "#7048e8";
      c.fill();
      c.restore();
      rrect(c, 110, 210, 140 * Math.max(0, left), 8, 4, left > 0.3 ? "#69db7c" : "#ff6b6b");
      text(c, s.name, 180, 240, 18, "#212529");
    }
    s.pops = s.pops.filter((p) => s.t - p.at < 0.9);
    s.pops.forEach((p, i) => popText(c, p.text, W / 2, 290 - i * 18, (s.t - p.at) / 0.9, p.colour));
    rrect(c, 0, 0, W, 32, 0, "rgba(0,0,0,.5)");
    text(c, `${s.score}`, 36, 16, 17, "#ffd43b");
    text(c, `x${(1 + Math.floor(s.chain / 5) * 0.5).toFixed(1)}`, W / 2, 16, 15, "#69db7c");
    text(c, `${Math.max(0, Math.ceil(seconds - s.t))}s`, W - 26, 16, 15, "#fff");
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
            const st = get().swipe;
            get().swipe = null;
            if (!st) return;
            const dx = p.x - st.x;
            const dy = p.y - st.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
            answer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
          },
        }}
      />
      <Pads>
        <Pad onDown={() => answer("left")}>
          <ArrowLeft className="size-6" />
        </Pad>
        <Pad onDown={() => answer("up")}>
          <ArrowUp className="size-6" />
        </Pad>
        <Pad onDown={() => answer("down")}>
          <ArrowDown className="size-6" />
        </Pad>
        <Pad onDown={() => answer("right")}>
          <ArrowRight className="size-6" />
        </Pad>
      </Pads>
    </div>
  );
}
