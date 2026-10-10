"use client";

import { useRef, useState } from "react";
import { ArrowBigUp, Hand } from "lucide-react";
import { playSfx } from "../../sound";
import { circle, horse, line, popText, rrect, runner, sky, text } from "../draw";
import { makeRng } from "../rng";
import { Pad, Pads, Stage, useFinish, useKeys } from "../stage";
import type { EngineProps } from "../types";

// Races against the clock and three rivals, and tug-of-wars against one. The score is your
// time (lower is better).
//   input alternate - tap Left, Right, Left... (Sprint, Hurdles: plus Jump)
//   input rhythm    - tap as the ring closes on the beat (Swim, Rowing, Horse Race, Tug of War)
//   input mash      - tap as fast as you can (Arm Wrestling)
//   input pick      - tap the glowing hold of three (Climbing Wall)
// theme: track, hurdles, swim, row, horse, arm, rope, climb. length: metres (or holds).

const W = 360;
const H = 480;
const LOSE = 99;

type Rival = { x: number; v: number; top: number; name: string; colour: string; done: number };

export default function Race({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const input = String(cfg.input ?? "alternate");
  const theme = String(cfg.theme ?? "track");
  const length = Number(cfg.length ?? 100);
  const tug = theme === "arm" || theme === "rope";
  const BEAT = theme === "horse" ? 0.42 : theme === "row" ? 0.75 : theme === "rope" ? 0.7 : 0.6;
  const SPEED = { track: 1, hurdles: 0.8, swim: 0.95, row: 1.5, horse: 3, climb: 1, arm: 1, rope: 1 }[theme] ?? 1;
  const [, force] = useState(0);
  const g = useRef<{
    t: number;
    x: number;
    v: number;
    last: string;
    air: number;
    beatAt: number;
    tapped: boolean;
    rivals: Rival[];
    p: number;
    bot: number;
    hold: number;
    climb: number;
    started: boolean;
    done: number;
    over: boolean;
    pops: { text: string; at: number; colour: string }[];
    clipped: Set<number>;
  } | null>(null);
  /** The game's state, made the first time it's needed (never while drawing the page). */
  function get() {
    if (!g.current) {
      const r = makeRng(seed);
      const colours = ["#1c7ed6", "#2f9e44", "#ae3ec9"];
      const names = ["Ade", "Kofi", "Ama", "Jo", "Wanjiru", "Sam", "Tolu", "Zara"];
      g.current = {
        t: 0,
        x: 0,
        v: 0,
        last: "",
        air: 0,
        beatAt: 0.5,
        tapped: false,
        rivals: colours.map((colour) => ({ x: 0, v: 0, top: length / ((theme === "hurdles" ? 15.5 : theme === "track" ? 11.8 : theme === "swim" ? 27 : theme === "row" ? 32 : theme === "horse" ? 31 : 22) * (0.92 + r() * 0.22)), name: names[Math.floor(r() * names.length)], colour, done: 0 })),
        p: 0,
        bot: 0.3 + r() * 0.08,
        hold: Math.floor(r() * 3),
        climb: 0,
        started: false,
        done: 0,
        over: false,
        pops: [],
        clipped: new Set(),
      };
    }
    return g.current!;
  }

  function end(score: number) {
    const s = get();
    if (s.over) return;
    s.over = true;
    s.done = score;
    playSfx(score < LOSE ? "found" : "miss");
    force((n) => n + 1);
    window.setTimeout(() => finish(Math.round(score * 100) / 100), 1000);
  }
  const pop = (t: string, colour = "#ffd43b") => get().pops.push({ text: t, at: get().t, colour });

  function press(btn: string) {
    const s = get();
    if (s.over) return;
    s.started = true;
    if (input === "alternate") {
      if (btn === "jump") {
        if (theme === "hurdles" && s.air <= 0) {
          s.air = 0.55;
          playSfx("whoosh");
        }
        return;
      }
      if (btn === s.last) {
        s.v *= 0.55;
        pop("Stumble!", "#ff8787");
      } else s.v = Math.min(12 * SPEED, s.v + 1.15 * SPEED);
      s.last = btn;
    } else if (input === "mash") {
      s.p += 0.05;
    } else if (input === "rhythm") {
      if (s.tapped) return;
      s.tapped = true;
      // How close to the beat (0 = right on it).
      const phase = Math.abs(s.t - s.beatAt) / BEAT;
      const q = Math.max(0, 1 - phase * 2.2);
      if (tug) {
        s.p += 0.11 * q;
      } else s.v = Math.min(20, s.v + q * 1.7 * SPEED * (BEAT / 0.6));
      if (q > 0.8) pop("Perfect", "#69db7c");
      else if (q < 0.3) {
        if (!tug) s.v *= 0.75;
        pop("Off beat", "#ff8787");
      }
      playSfx(q > 0.5 ? "tick" : "miss");
    } else if (input === "pick") {
      const col = Number(btn);
      if (col === s.hold) {
        s.climb += 1;
        playSfx("tick");
        if (s.climb >= length) return end(s.t);
      } else {
        s.climb = Math.max(0, s.climb - 1);
        pop("Slip!", "#ff8787");
        playSfx("miss");
      }
      // The next hold: always a different one of the three.
      s.hold = (s.hold + 1 + ((s.climb * 7919 + seed) % 2)) % 3;
    }
  }

  useKeys((k) => {
    if (input === "alternate") {
      if (k === "ArrowLeft" || k === "a") press("L");
      if (k === "ArrowRight" || k === "d") press("R");
      if (k === "ArrowUp" || k === " ") press("jump");
    } else if (input === "pick") {
      if (k === "ArrowLeft" || k === "1") press("0");
      if (k === "ArrowDown" || k === "ArrowUp" || k === "2") press("1");
      if (k === "ArrowRight" || k === "3") press("2");
    } else if (k === " " || k === "Enter") press("tap");
  });

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    if (!s.over) s.t += dt;
    // Beats for rhythm games.
    if (input === "rhythm" && s.t > s.beatAt + BEAT / 2) {
      if (!s.tapped && s.started && !tug) s.v *= 0.9;
      s.beatAt += BEAT;
      s.tapped = false;
    }

    if (tug) {
      // The bot pulls harder as time goes on.
      if (!s.over) {
        s.p -= (s.bot + s.t * 0.012) * dt * (input === "mash" ? 1 : 0.8);
        if (s.p >= 1) end(s.t);
        if (s.p <= -1) end(LOSE);
      }
      drawTug(c, s);
    } else if (input === "pick") {
      drawClimb(c, s);
    } else {
      if (!s.over) {
        s.v *= Math.exp(-dt * (input === "rhythm" ? 0.55 : 0.9));
        s.x += s.v * dt;
        if (s.air > 0) s.air -= dt;
        if (theme === "hurdles") {
          const h = Math.floor((s.x - 13) / 10.5);
          const at = 13 + h * 10.5;
          if (h >= 0 && h < 10 && Math.abs(s.x - at) < 0.6 && s.air <= 0 && !s.clipped.has(h)) {
            s.clipped.add(h);
            s.v *= 0.35;
            pop("Clipped it!", "#ff8787");
            playSfx("denied");
          }
        }
        for (const rv of s.rivals) {
          if (rv.done) continue;
          rv.v += (rv.top - rv.v) * dt * 1.4;
          rv.x += rv.v * dt;
          if (rv.x >= length) rv.done = s.t;
        }
        if (s.x >= length) end(s.t);
        if (s.t > 120) end(LOSE);
      }
      drawLanes(c, s);
    }

    // Rhythm ring.
    if (input === "rhythm" && !s.over) {
      const f = Math.max(0, Math.min(1, (s.beatAt - s.t) / BEAT));
      circle(c, W / 2, H - 60, 26, "rgba(255,255,255,.15)", "#fff", 3);
      c.beginPath();
      c.arc(W / 2, H - 60, 26 + f * 60, 0, Math.PI * 2);
      c.strokeStyle = "#ffd43b";
      c.lineWidth = 4;
      c.stroke();
    }
    s.pops = s.pops.filter((p) => s.t - p.at < 0.8);
    s.pops.forEach((p, i) => popText(c, p.text, W / 2, 120 + i * 16, (s.t - p.at) / 0.8, p.colour));
    rrect(c, 0, 0, W, 32, 0, "rgba(0,0,0,.45)");
    text(c, `${s.t.toFixed(1)}s`, 36, 16, 16, "#fff");
    if (!tug && input !== "pick") text(c, `${Math.min(length, s.x).toFixed(0)} / ${length} m`, W - 70, 16, 14, "#fff");
    if (input === "pick") text(c, `${s.climb} / ${length} holds`, W - 70, 16, 14, "#fff");
    if (s.over) {
      rrect(c, 40, H / 2 - 40, W - 80, 80, 16, "rgba(0,0,0,.7)");
      text(c, s.done >= LOSE ? "Beaten!" : `${s.done.toFixed(2)}s`, W / 2, H / 2, 28, s.done >= LOSE ? "#ff8787" : "#ffd43b");
    }
  }

  function drawLanes(c: CanvasRenderingContext2D, s: NonNullable<typeof g.current>) {
    const water = theme === "swim" || theme === "row";
    if (water) {
      c.fillStyle = "#1c7ed6";
      c.fillRect(0, 0, W, H);
    } else {
      sky(c, W, 120, "#74c0fc", "#d0ebff");
      c.fillStyle = theme === "horse" ? "#5c940d" : "#c92a2a";
      c.fillRect(0, 120, W, H - 120);
    }
    // 1 metre on screen, camera follows you.
    const px = theme === "horse" ? 9 : theme === "row" ? 12 : 20;
    const cam = s.x * px - 100;
    const lanes = 4;
    const top = 150;
    const lh = 64;
    for (let i = 0; i <= lanes; i++) line(c, 0, top + i * lh, W, top + i * lh, water ? "#ff6b6b" : "rgba(255,255,255,.6)", water ? 3 : 2);
    // Distance marks and the finish line.
    for (let m = Math.floor(cam / px / 10) * 10; m < (cam + W) / px; m += 10) {
      const x = m * px - cam;
      line(c, x, top, x, top + lanes * lh, "rgba(255,255,255,.2)", 1);
      if (m > 0 && m <= length) text(c, `${m}`, x, top - 10, 11, "#fff");
    }
    const fx = length * px - cam;
    for (let k = 0; k < 16; k++) rrect(c, fx - 4 + (k % 2) * 4, top + k * (lh * lanes) / 16, 4, (lh * lanes) / 16, 0, k % 2 ? "#000" : "#fff");
    if (theme === "hurdles") {
      for (let h = 0; h < 10; h++) {
        const x = (13 + h * 10.5) * px - cam;
        for (let i = 0; i < lanes; i++) {
          line(c, x, top + i * lh + 18, x, top + i * lh + 52, s.clipped.has(h) && i === 0 ? "#ff8787" : "#fff", 3);
          line(c, x - 6, top + i * lh + 22, x + 6, top + i * lh + 22, "#fff", 3);
        }
      }
    }
    const who = [{ x: s.x, colour: "#fab005", name: "You" }, ...s.rivals];
    who.forEach((p, i) => {
      const x = p.x * px - cam;
      const y = top + i * lh + lh / 2 + 14;
      const up = i === 0 && s.air > 0 ? Math.sin((1 - s.air / 0.55) * Math.PI) * 26 : 0;
      if (theme === "swim") runner(c, x, y - 10, 46, p.colour, s.t * (i === 0 ? 1 + s.v / 3 : 1.4), "swim");
      else if (theme === "row") runner(c, x, y - 18, 34, p.colour, s.t * 1.2, "row");
      else if (theme === "horse") horse(c, x, y - 12, 50, p.colour, s.t * (i === 0 ? 0.6 + s.v / 15 : 1));
      else runner(c, x, y - up, 40, p.colour, s.t * (i === 0 ? 0.4 + s.v / 9 : 1));
      text(c, p.name, x, top + i * lh + 10, 10, "#fff");
    });
    // Speed bar.
    rrect(c, 20, 420, 200, 10, 5, "rgba(0,0,0,.35)");
    rrect(c, 20, 420, Math.min(200, (s.v / (12 * SPEED + 1)) * 200 * (input === "rhythm" ? 0.6 : 1)), 10, 5, "#69db7c");
  }

  function drawTug(c: CanvasRenderingContext2D, s: NonNullable<typeof g.current>) {
    if (theme === "arm") {
      c.fillStyle = "#5c3d22";
      c.fillRect(0, 0, W, H);
      rrect(c, 30, 220, 300, 120, 14, "#8d5524");
      // The arms, tilted by p.
      const a = (-s.p * Math.PI) / 2.6;
      const cx = W / 2;
      const cy = 260;
      line(c, cx - 110, 330, cx, cy, "#f1c27d", 22);
      line(c, cx + 110, 330, cx, cy, "#c68642", 22);
      line(c, cx, cy, cx + Math.sin(a) * 90, cy - Math.cos(a) * 90, "#e0ac69", 26);
      circle(c, cx + Math.sin(a) * 90, cy - Math.cos(a) * 90, 18, "#e0ac69");
      text(c, "YOU", 60, 380, 16, "#ffd43b");
      text(c, "BOT", W - 60, 380, 16, "#ff8787");
    } else {
      sky(c, W, H, "#74c0fc", "#d3f9d8");
      rrect(c, 0, 300, W, 180, 0, "#51cf66");
      line(c, W / 2, 280, W / 2, 330, "#fff", 4);
      const off = s.p * 120;
      line(c, 0, 290, W, 290, "#a5673f", 6);
      rrect(c, W / 2 - off - 6, 270, 12, 30, 2, "#e03131");
      for (let k = 0; k < 3; k++) runner(c, 40 + k * 30 - off, 300, 40, "#fab005", s.t * 0.4);
      for (let k = 0; k < 3; k++) runner(c, W - 40 - k * 30 - off, 300, 40, "#1c7ed6", s.t * 0.4);
    }
    rrect(c, 30, 140, 300, 18, 9, "#343a40");
    rrect(c, 180, 140, s.p * 150, 18, 9, s.p > 0 ? "#69db7c" : "#ff8787");
    text(c, input === "mash" ? "TAP AS FAST AS YOU CAN!" : "Tap on the beat to heave!", W / 2, 110, 16, "#fff");
  }

  function drawClimb(c: CanvasRenderingContext2D, s: NonNullable<typeof g.current>) {
    c.fillStyle = "#495057";
    c.fillRect(0, 0, W, H);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 3; col++) {
        const y = 400 - row * 50;
        const lit = row === 1 && col === s.hold;
        circle(c, 80 + col * 100, y, lit ? 18 : 12, lit ? "#ffd43b" : ["#e64980", "#1c7ed6", "#2f9e44"][(row + col + s.climb) % 3]);
        if (lit) circle(c, 80 + col * 100, y, 26 + 3 * Math.sin(s.t * 10), "rgba(255,212,59,.3)");
      }
    }
    runner(c, 180, 430, 50, "#fab005", s.t);
    rrect(c, 340, 60, 10, 380, 5, "#343a40");
    rrect(c, 340, 60 + 380 * (1 - s.climb / length), 10, (380 * s.climb) / length, 5, "#69db7c");
    text(c, "Tap the glowing hold", W / 2, 50, 15, "#fff");
  }

  return (
    <div>
      <Stage
        w={W}
        h={H}
        handlers={{
          frame,
          down: (p) => {
            if (input === "pick") press(String(Math.max(0, Math.min(2, Math.floor((p.x - 30) / 100)))));
            else if (input !== "alternate") press("tap");
          },
        }}
      />
      {input === "alternate" && (
        <Pads>
          <Pad onDown={() => press("L")}>Left</Pad>
          {theme === "hurdles" && (
            <Pad onDown={() => press("jump")} className="bg-[#e8590c]">
              <ArrowBigUp className="size-5" /> Jump
            </Pad>
          )}
          <Pad onDown={() => press("R")}>Right</Pad>
        </Pads>
      )}
      {(input === "mash" || input === "rhythm") && (
        <Pads>
          <Pad onDown={() => press("tap")} className="bg-[#e8590c]">
            <Hand className="size-5" /> {input === "mash" ? "PUSH!" : "Stroke"}
          </Pad>
        </Pads>
      )}
    </div>
  );
}
