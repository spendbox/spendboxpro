"use client";

import { useRef } from "react";
import { playSfx } from "../../sound";
import { ball, circle, line, popText, rrect, runner, sky, text } from "../draw";
import { makeRng } from "../rng";
import { Stage, useFinish, useKeys } from "../stage";
import type { EngineProps } from "../types";

// Timing games: stop something at the right moment.
//   dial  - Safe Cracker: stop the spinning dial in the glowing notch (4 numbers).
//   pins  - Lock Pick: tap as each bouncing pin reaches the gold line.
//   spin  - High Dive: straighten out when the diver points straight down.
//   jump  - Long Jump: tap fast for speed, then stop the angle needle near 45°.
//   throw - Javelin: stop the power bar high, then the angle near 40°.
//   bat   - Cricket / Home Run Derby: swing as the ball reaches the zone.
//   kick  - Field Goal / Rugby: stop the aim (mind the wind), then the power.
//   pour  - Bartender: hold to pour each layer, let go at the line.

const W = 360;
const H = 480;

type Pop = { text: string; x: number; y: number; at: number; colour?: string };

export default function Meter({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const style = String(cfg.style ?? "dial");
  const theme = String(cfg.theme ?? "");
  const rounds = Number(cfg.rounds ?? 5);
  const limit = Number(cfg.seconds ?? 0);
  const g = useRef<{
    r: ReturnType<typeof makeRng>;
    round: number;
    score: number;
    best: number;
    strikes: number;
    t: number;
    /** Each style's moving parts. */
    phase: string;
    a: number;
    speed: number;
    target: number;
    v: number;
    taps: number;
    power: number;
    aim: number;
    wind: number;
    fill: number[];
    layers: number[];
    pouring: boolean;
    anim: number;
    result: string;
    pops: Pop[];
    over: boolean;
    endAt: number;
  } | null>(null);

  /** The game's state, made the first time it's needed (never while drawing the page). */
  function get() {
    if (!g.current) {
      const r = makeRng(seed);
      g.current = { r, round: 0, score: 0, best: 0, strikes: 0, t: 0, phase: "go", a: 0, speed: 1, target: 0, v: 0, taps: 0, power: 0, aim: 0, wind: 0, fill: [], layers: [], pouring: false, anim: 0, result: "", pops: [], over: false, endAt: 0 };
      setup(g.current, 0);
    }
    return g.current!;
  }

  function setup(s: NonNullable<typeof g.current>, round: number) {
    s.round = round;
    s.phase = "go";
    s.anim = 0;
    s.result = "";
    s.a = s.r() * Math.PI * 2;
    if (style === "dial") {
      s.target = s.r() * Math.PI * 2;
      s.speed = 1.6 + round * 0.55;
    } else if (style === "pins") {
      s.speed = 2.2 + round * 0.6;
      s.a = s.r() * 6;
    } else if (style === "spin") {
      s.speed = 4 + round * 1.6;
      s.a = 0;
      s.v = 0;
    } else if (style === "jump" || style === "throw") {
      s.phase = style === "jump" ? "run" : "power";
      s.taps = 0;
      s.power = 0;
      s.aim = 0;
      s.v = 0;
    } else if (style === "bat") {
      s.phase = "bowl";
      s.v = 0;
      s.speed = (theme === "baseball" ? 330 : 290) + s.r() * 140 + round * 8;
      s.aim = (s.r() - 0.5) * 40;
    } else if (style === "kick") {
      s.phase = "aim";
      s.wind = (s.r() - 0.5) * (0.3 + round * 0.08);
      s.power = 0;
      s.aim = 0;
      s.target = 0.45 + round * 0.08;
    } else if (style === "pour") {
      const n = 1 + Math.min(2, Math.floor(round / 2) + (s.r() < 0.3 ? 1 : 0));
      let at = 0;
      s.layers = [];
      for (let k = 0; k < n; k++) {
        at += (0.75 / n) * (0.7 + s.r() * 0.6);
        s.layers.push(Math.min(0.9, at));
      }
      s.fill = [];
      s.v = 0;
      s.phase = "pour";
    }
  }

  const pop = (s: NonNullable<typeof g.current>, t: string, x = W / 2, y = H / 2, colour?: string) => s.pops.push({ text: t, x, y, at: s.t, colour });

  function end(s: NonNullable<typeof g.current>) {
    if (s.over) return;
    s.over = true;
    const final = style === "jump" || style === "throw" ? Math.round(s.best * 100) / 100 : Math.round(s.score);
    window.setTimeout(() => finish(final), 900);
  }

  function next(s: NonNullable<typeof g.current>) {
    if (s.round + 1 >= rounds || s.strikes >= 3) {
      if ((style === "dial" || style === "pins") && limit) {
        const left = Math.max(0, limit - s.t);
        if (s.strikes < 3) {
          s.score += Math.round(left * 2);
          pop(s, `Time bonus +${Math.round(left * 2)}`, W / 2, H * 0.3);
        }
      }
      return end(s);
    }
    setup(s, s.round + 1);
  }

  /** The player tapped (or pressed the key). */
  function tap(down = true) {
    const s = get();
    if (s.over) return;
    if (style === "pour") {
      if (down && s.phase === "pour") s.pouring = true;
      if (!down && s.pouring) {
        s.pouring = false;
        settlePour(s);
      }
      return;
    }
    if (!down) return;
    if (style === "dial") {
      let d = Math.abs(((s.a - s.target + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      d = (d * 180) / Math.PI;
      if (d < 12) {
        const pts = Math.round(100 - d * 6);
        s.score += pts;
        pop(s, d < 3 ? `Click! +${pts}` : `+${pts}`, W / 2, 110, "#69db7c");
        playSfx("chime");
        next(s);
      } else {
        s.strikes++;
        pop(s, "Clunk", W / 2, 110, "#ff8787");
        playSfx("denied");
        if (s.strikes >= 3) end(s);
      }
    } else if (style === "pins") {
      const y = 200 + Math.sin(s.a) * 70;
      const d = Math.abs(y - 200);
      if (d < 12) {
        const pts = Math.round(100 - d * 5);
        s.score += pts;
        pop(s, `+${pts}`, W / 2, 140, "#69db7c");
        playSfx("tick");
        next(s);
      } else {
        s.strikes++;
        pop(s, "Jammed!", W / 2, 140, "#ff8787");
        playSfx("denied");
        if (s.strikes >= 3) end(s);
      }
    } else if (style === "spin") {
      if (s.phase !== "go") return;
      // Head straight down is angle π/2 (pointing to +y).
      const d = Math.abs(((s.a - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const deg = (d * 180) / Math.PI;
      const pts = Math.max(0, Math.round(100 - deg * 1.6));
      s.score += pts;
      s.phase = "fall";
      s.anim = 0;
      s.result = pts > 85 ? "Rip entry!" : pts > 60 ? "Clean" : pts > 30 ? "Splashy" : "Belly flop!";
      pop(s, `${s.result} +${pts}`, W / 2, 120, pts > 60 ? "#69db7c" : "#ffd43b");
      playSfx("splash");
    } else if (style === "jump") {
      if (s.phase === "run") {
        s.taps++;
      } else if (s.phase === "angle") {
        const ang = s.aim;
        const dist = Math.max(0, 9.3 * s.power * Math.sin(2 * ang) * (0.92 + 0.08 * s.power));
        s.v = dist;
        s.best = Math.max(s.best, dist);
        s.phase = "fly";
        s.anim = 0;
        pop(s, `${dist.toFixed(2)} m`, W / 2, 120, "#ffd43b");
        playSfx("whoosh");
      }
    } else if (style === "throw") {
      if (s.phase === "power") {
        s.power = s.v;
        s.phase = "angle";
      } else if (s.phase === "angle") {
        const ang = s.aim;
        const dist = Math.max(0, 98 * Math.pow(s.power, 1.3) * Math.sin(2 * ang));
        s.v = dist;
        s.best = Math.max(s.best, dist);
        s.phase = "fly";
        s.anim = 0;
        pop(s, `${dist.toFixed(1)} m`, W / 2, 120, "#ffd43b");
        playSfx("whoosh");
      }
    } else if (style === "bat") {
      if (s.phase !== "bowl") return;
      const zone = H - 120;
      const d = Math.abs(s.v - zone);
      const base = theme === "baseball";
      let runs = 0;
      let label = "Miss";
      if (d < 10) [runs, label] = base ? [1, "HOME RUN!"] : [6, "SIX!"];
      else if (d < 20) [runs, label] = base ? [0, "Deep fly, caught"] : [4, "FOUR!"];
      else if (d < 34) [runs, label] = base ? [0, "Base hit"] : [s.r() < 0.5 ? 1 : 2, "Runs"];
      s.score += runs;
      s.phase = "hit";
      s.anim = 0;
      s.result = label;
      s.target = d < 34 ? (s.r() - 0.5) * 2 : 0;
      pop(s, runs ? `${label} +${runs}` : label, W / 2, 150, runs ? "#69db7c" : "#ffd43b");
      playSfx(d < 34 ? "pop" : "miss");
    } else if (style === "kick") {
      if (s.phase === "aim") {
        s.aim = Math.sin(s.a);
        s.phase = "power";
        s.a = 0;
      } else if (s.phase === "power") {
        s.power = (1 - Math.cos(s.a)) / 2;
        const off = s.aim + s.wind;
        const straight = Math.abs(off) < 0.22;
        const far = s.power >= s.target && s.power <= 0.98;
        const good = straight && far;
        if (good) s.score += 3;
        s.phase = "flight";
        s.anim = 0;
        s.result = good ? "It's good!" : !far ? (s.power > 0.98 ? "Way too hard" : "Short!") : off < 0 ? "Wide left" : "Wide right";
        pop(s, good ? "It's good! +3" : s.result, W / 2, 120, good ? "#69db7c" : "#ff8787");
        playSfx(good ? "found" : "miss");
      }
    }
  }

  function settlePour(s: NonNullable<typeof g.current>) {
    const k = s.fill.length;
    const want = s.layers[k];
    const err = Math.abs(s.v - want);
    s.fill.push(s.v);
    if (s.v > 1) {
      pop(s, "Overflow!", W / 2, 120, "#ff8787");
      playSfx("splash");
      s.phase = "done";
      s.anim = 0;
      return;
    }
    const pts = Math.max(0, Math.round((100 / s.layers.length) * (1 - err * 9)));
    s.score += pts;
    pop(s, err < 0.02 ? `Perfect +${pts}` : `+${pts}`, W / 2, 120, err < 0.04 ? "#69db7c" : "#ffd43b");
    playSfx("tick");
    if (s.fill.length >= s.layers.length) {
      s.phase = "done";
      s.anim = 0;
    }
  }

  useKeys(
    (k) => (k === " " || k === "Enter" || k === "ArrowUp") && tap(true),
    (k) => (k === " " || k === "Enter" || k === "ArrowUp") && tap(false),
  );

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    s.t += dt;
    if (limit && !s.over && s.t >= limit) {
      pop(s, "Time!", W / 2, H / 2, "#ff8787");
      end(s);
    }
    const pal = { bg: "#1b2433", ink: "#e9ecef", gold: "#ffd43b" };
    c.fillStyle = pal.bg;
    c.fillRect(0, 0, W, H);

    if (style === "dial") {
      s.a += s.speed * dt * (s.round % 2 ? -1 : 1);
      // The safe door and dial.
      rrect(c, 30, 60, 300, 330, 18, "#495057", "#343a40", 4);
      circle(c, W / 2, 225, 118, "#212529");
      circle(c, W / 2, 225, 110, "#adb5bd", "#868e96", 3);
      for (let k = 0; k < 40; k++) {
        const an = (k / 40) * Math.PI * 2 + s.a;
        const r1 = k % 5 ? 98 : 90;
        line(c, W / 2 + Math.cos(an) * r1, 225 + Math.sin(an) * r1, W / 2 + Math.cos(an) * 106, 225 + Math.sin(an) * 106, "#343a40", k % 5 ? 1.5 : 3);
      }
      // The notch to stop in: glowing, narrower each number.
      const width = 0.22 - s.round * 0.03;
      c.beginPath();
      c.arc(W / 2, 225, 112, s.target - width, s.target + width);
      c.strokeStyle = `rgba(105,219,124,${0.5 + 0.3 * Math.sin(s.t * 8)})`;
      c.lineWidth = 8;
      c.stroke();
      circle(c, W / 2, 225, 40, "#868e96", "#495057", 3);
      // The needle on the dial.
      line(c, W / 2, 225, W / 2 + Math.cos(s.a) * 104, 225 + Math.sin(s.a) * 104, "#e03131", 5);
      circle(c, W / 2, 225, 8, "#e03131");
      text(c, `Number ${Math.min(s.round + 1, rounds)} of ${rounds}`, W / 2, 30, 18, pal.ink);
      for (let k = 0; k < 3; k++) circle(c, 140 + k * 40, 420, 10, k < s.strikes ? "#e03131" : "#343a40");
      text(c, "Tap when the red needle is in the green notch", W / 2, 455, 13, "#adb5bd", "center", 600);
    } else if (style === "pins") {
      s.a += s.speed * dt;
      rrect(c, 40, 80, 280, 240, 20, "#ced4da", "#868e96", 4);
      text(c, `Pin ${Math.min(s.round + 1, rounds)} of ${rounds}`, W / 2, 40, 18, pal.ink);
      // Set pins on the left, the live one, the rest waiting.
      for (let k = 0; k < rounds; k++) {
        const x = 70 + k * (220 / Math.max(1, rounds - 1));
        const y = k < s.round ? 200 : k === s.round ? 200 + Math.sin(s.a) * 70 : 250;
        rrect(c, x - 9, y - 40, 18, 80, 6, k < s.round ? "#69db7c" : k === s.round ? "#ffd43b" : "#868e96");
      }
      line(c, 50, 200, 310, 200, "#e8590c", 3);
      for (let k = 0; k < 3; k++) circle(c, 140 + k * 40, 380, 10, k < s.strikes ? "#e03131" : "#343a40");
      text(c, "Tap as the yellow pin crosses the orange line", W / 2, 440, 13, "#adb5bd", "center", 600);
    } else if (style === "spin") {
      sky(c, W, H, "#4dabf7", "#d0ebff");
      rrect(c, 0, 380, W, 100, 0, "#1c7ed6");
      rrect(c, 250, 60, 110, 14, 4, "#868e96");
      text(c, `Dive ${Math.min(s.round + 1, rounds)} of ${rounds}`, 70, 30, 16, "#fff");
      let dy = 80;
      if (s.phase === "go") s.a += s.speed * dt;
      else {
        s.anim += dt;
        dy = 80 + Math.min(1, s.anim / 0.9) ** 2 * 300;
        if (s.anim > 1.6) next(s);
      }
      c.save();
      c.translate(220, dy);
      c.rotate(s.a);
      // The diver, head along +x when a = 0.
      line(c, -26, 0, 22, 0, "#e64980", 10);
      circle(c, 30, 0, 9, "#f1c27d");
      line(c, 0, 0, 20, 8, "#f1c27d", 4);
      c.restore();
      if (s.phase === "fall" && s.anim > 0.9) circle(c, 220, 380, 20 + (s.anim - 0.9) * 60, "rgba(255,255,255,.5)");
      text(c, "Tap when the head points straight down", W / 2, 455, 13, "#fff", "center", 700);
    } else if (style === "jump") {
      sky(c, W, H);
      rrect(c, 0, 330, W, 150, 0, "#c0793d");
      rrect(c, 230, 330, 130, 20, 0, "#ffe8a3");
      text(c, `Jump ${Math.min(s.round + 1, rounds)} of 3 · best ${s.best.toFixed(2)} m`, W / 2, 30, 15, "#fff");
      if (s.phase === "run") {
        s.v += dt;
        s.power = Math.min(1, s.taps / 22);
        runner(c, 40 + s.v * 70, 325, 46, "#e03131", s.t * (0.5 + s.power));
        rrect(c, 40, 380, 280, 22, 8, "#343a40");
        rrect(c, 40, 380, 280 * s.power, 22, 8, s.power > 0.85 ? "#69db7c" : "#ffd43b");
        text(c, "TAP TAP TAP for speed!", W / 2, 430, 18, "#fff");
        if (s.v > 2.4) {
          s.phase = "angle";
          s.a = 0;
        }
      } else if (s.phase === "angle") {
        s.a += dt * 2.4;
        s.aim = (Math.PI / 2) * Math.abs(Math.sin(s.a));
        runner(c, 210, 325, 46, "#e03131", 0, "stand");
        line(c, 210, 325, 210 + Math.cos(s.aim) * 90, 325 - Math.sin(s.aim) * 90, "#ffd43b", 4);
        c.beginPath();
        c.arc(210, 325, 60, -Math.PI / 4 - 0.12, -Math.PI / 4 + 0.12);
        c.strokeStyle = "#69db7c";
        c.lineWidth = 6;
        c.stroke();
        text(c, "Tap to take off (aim for the green)", W / 2, 430, 15, "#fff");
      } else {
        s.anim += dt;
        const f = Math.min(1, s.anim / 1.1);
        const x = 210 + f * s.v * 14;
        runner(c, x, 325 - Math.sin(f * Math.PI) * 60, 46, "#e03131", 0, "stand");
        if (s.anim > 1.8) next(s);
      }
    } else if (style === "throw") {
      sky(c, W, H, "#74c0fc", "#e7f5ff");
      rrect(c, 0, 360, W, 120, 0, "#51cf66");
      text(c, `Throw ${Math.min(s.round + 1, rounds)} of 3 · best ${s.best.toFixed(1)} m`, W / 2, 30, 15, "#fff");
      if (s.phase === "power") {
        s.a += dt * 3.2;
        s.v = Math.abs(Math.sin(s.a));
        runner(c, 70, 355, 46, "#1c7ed6", s.t);
        rrect(c, 300, 120, 26, 220, 8, "#343a40");
        rrect(c, 300, 120 + 220 * (1 - s.v), 26, 220 * s.v, 8, s.v > 0.9 ? "#69db7c" : "#ffd43b");
        text(c, "Tap at the top for power", W / 2, 430, 15, "#fff");
      } else if (s.phase === "angle") {
        s.a += dt * 2.2;
        s.aim = (Math.PI / 2) * Math.abs(Math.sin(s.a * 1.3));
        runner(c, 70, 355, 46, "#1c7ed6", 0, "stand");
        line(c, 70, 310, 70 + Math.cos(s.aim) * 100, 310 - Math.sin(s.aim) * 100, "#ffd43b", 4);
        c.beginPath();
        c.arc(70, 310, 70, -0.7 - 0.12, -0.7 + 0.12);
        c.strokeStyle = "#69db7c";
        c.lineWidth = 6;
        c.stroke();
        text(c, "Tap to throw (aim for the green)", W / 2, 430, 15, "#fff");
      } else {
        s.anim += dt;
        const f = Math.min(1, s.anim / 1.3);
        const x = 70 + f * Math.min(280, s.v * 3);
        const y = 310 - Math.sin(f * Math.PI) * (40 + s.v);
        line(c, x - 18, y + 4, x + 18, y - 4, "#495057", 3);
        if (s.anim > 2) next(s);
      }
    } else if (style === "bat") {
      const base = theme === "baseball";
      c.fillStyle = base ? "#2f9e44" : "#40c057";
      c.fillRect(0, 0, W, H);
      rrect(c, 130, 40, 100, 400, 6, base ? "#c0793d" : "#e9d8a6");
      const zone = H - 120;
      rrect(c, 120, zone - 34, 120, 68, 10, "rgba(255,255,255,.15)");
      rrect(c, 120, zone - 10, 120, 20, 6, "rgba(105,219,124,.5)");
      text(c, `${base ? "Pitch" : "Ball"} ${Math.min(s.round + 1, rounds)} of ${rounds} · ${base ? `${s.score} home runs` : `${s.score} runs`}`, W / 2, 20, 15, "#fff");
      runner(c, 180, 70, 40, base ? "#1971c2" : "#e03131", s.t, "stand");
      // The batter at the bottom.
      runner(c, 215, H - 80, 54, "#fff", 0, "stand");
      if (s.phase === "bowl") {
        s.v += s.speed * dt;
        const x = 180 + s.aim * (s.v / H);
        ball(c, x, s.v, 9, base ? "baseball" : "cricket", s.v / 20);
        if (s.v > H - 40) {
          s.phase = "hit";
          s.anim = 0;
          pop(s, base ? "Strike!" : s.r() < 0.35 ? "Bowled!" : "Dot ball", W / 2, 150, "#ff8787");
          if (!base && s.pops[s.pops.length - 1].text === "Bowled!") s.strikes++;
          playSfx("miss");
        }
      } else {
        s.anim += dt;
        if (s.target) ball(c, 180 + s.target * s.anim * 300, H - 120 - s.anim * 520, 9, base ? "baseball" : "cricket");
        if (s.anim > 1.1) next(s);
      }
      if (!base) for (let k = 0; k < 3; k++) circle(c, 300 + k * 18, 50, 6, k < s.strikes ? "#e03131" : "rgba(0,0,0,.3)");
      text(c, "Tap to swing as the ball hits the green line", W / 2, H - 20, 13, "#fff", "center", 700);
    } else if (style === "kick") {
      sky(c, W, H, "#74c0fc", "#d3f9d8");
      rrect(c, 0, 300, W, 180, 0, "#2f9e44");
      const dist = Math.round(20 + s.round * 7);
      text(c, `Kick ${Math.min(s.round + 1, rounds)} of ${rounds} · ${dist} m · ${s.score} pts`, W / 2, 24, 15, "#fff");
      // The posts.
      line(c, 140, 160, 140, 60, "#fff", 5);
      line(c, 220, 160, 220, 60, "#fff", 5);
      line(c, 140, 140, 220, 140, "#fff", 5);
      line(c, 180, 140, 180, 220, "#fff", 5);
      // Wind.
      text(c, `Wind ${s.wind < 0 ? "←" : "→"} ${Math.abs(s.wind * 20).toFixed(0)}`, 300, 70, 14, "#fff");
      ball(c, 180, 400, 12, theme === "rugby" ? "rugby" : "rugby");
      if (s.phase === "aim") {
        s.a += dt * (2 + s.round * 0.3);
        const x = 180 + Math.sin(s.a) * 120;
        rrect(c, 60, 440, 240, 14, 6, "#343a40");
        rrect(c, 180 - 26 - s.wind * 120, 440, 52, 14, 6, "#69db7c");
        line(c, x, 432, x, 462, "#ffd43b", 4);
        text(c, "Tap to set the aim (allow for the wind)", W / 2, 470, 12, "#fff", "center", 700);
      } else if (s.phase === "power") {
        s.a += dt * 2.6;
        const p = (1 - Math.cos(s.a)) / 2;
        rrect(c, 320, 200, 22, 220, 8, "#343a40");
        rrect(c, 320, 200 + 220 * (1 - 0.98), 22, 220 * (0.98 - s.target), 4, "rgba(105,219,124,.6)");
        rrect(c, 320, 200 + 220 * (1 - p), 22, 220 * p, 8, "#ffd43b");
        text(c, "Tap for power: stop in the green", W / 2, 470, 12, "#fff", "center", 700);
      } else {
        s.anim += dt;
        const f = Math.min(1, s.anim / 1.0);
        const off = s.aim + s.wind;
        const reach = Math.min(1, s.power / Math.max(0.01, s.target));
        ball(c, 180 + off * 160 * f, 400 - f * 300 * reach + Math.sin(f * Math.PI) * -40, 12 * (1 - f * 0.6), "rugby", f * 9);
        if (s.anim > 1.5) next(s);
      }
    } else if (style === "pour") {
      c.fillStyle = "#2b1d35";
      c.fillRect(0, 0, W, H);
      rrect(c, 0, 360, W, 120, 0, "#5c3d22");
      text(c, `Drink ${Math.min(s.round + 1, rounds)} of ${rounds} · ${s.score} pts`, W / 2, 24, 15, "#fff");
      const gx = 120;
      const gw = 120;
      const gTop = 120;
      const gh = 230;
      const colours = ["#ff6b6b", "#ffd43b", "#69db7c", "#4dabf7"];
      // Poured layers.
      let prev = 0;
      s.fill.forEach((f, k) => {
        rrect(c, gx + 4, gTop + gh * (1 - Math.min(1, f)), gw - 8, gh * (Math.min(1, f) - prev), 4, colours[k % 4]);
        prev = Math.min(1, f);
      });
      if (s.pouring) {
        s.v += dt * 0.33;
        const k = s.fill.length;
        rrect(c, gx + 4, gTop + gh * (1 - Math.min(1, s.v)), gw - 8, gh * (Math.min(1, s.v) - prev), 4, colours[k % 4]);
        line(c, gx + gw / 2, 60, gx + gw / 2, gTop + gh * (1 - s.v), colours[k % 4], 6);
        if (s.v > 1.04) {
          s.pouring = false;
          settlePour(s);
        }
      }
      // The glass and the lines to pour to.
      c.strokeStyle = "rgba(255,255,255,.8)";
      c.lineWidth = 3;
      c.strokeRect(gx, gTop, gw, gh);
      s.layers.forEach((l, k) => {
        const y = gTop + gh * (1 - l);
        line(c, gx - 14, y, gx + gw + 14, y, k === s.fill.length ? "#ffd43b" : "rgba(255,255,255,.4)", k === s.fill.length ? 3 : 1.5);
      });
      rrect(c, gx + 30, 40, 60, 24, 6, "#adb5bd");
      if (s.phase === "done") {
        s.anim += dt;
        if (s.anim > 1.1) next(s);
      } else text(c, "Hold to pour, let go at the yellow line", W / 2, 440, 14, "#fff", "center", 700);
    }

    // Floating scores.
    s.pops = s.pops.filter((p) => s.t - p.at < 1.2);
    for (const p of s.pops) popText(c, p.text, p.x, p.y, (s.t - p.at) / 1.2, p.colour);
    if (limit && !s.over) text(c, `${Math.max(0, Math.ceil(limit - s.t))}s`, W - 30, 24, 15, "#fff");
    if (style !== "jump" && style !== "throw" && style !== "bat" && style !== "kick" && style !== "pour") text(c, `${Math.round(s.score)}`, 30, 24, 18, "#ffd43b");
  }

  return <Stage w={W} h={H} handlers={{ frame, down: () => tap(true), up: () => tap(false) }} />;
}
