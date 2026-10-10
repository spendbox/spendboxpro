"use client";

import { useRef } from "react";
import { playSfx } from "../../sound";
import { circle, fish, line, popText, rrect, runner, sky, text } from "../draw";
import { makeRng } from "../rng";
import { Stage, useFinish, useKeys } from "../stage";
import type { EngineProps } from "../types";

// Keep a marker inside a moving zone: press and hold to push it up, let go and it drops.
//   lift - Weightlifting: fill the bar to lift; each lift is heavier (score: heaviest lift).
//   surf - Surfing: points while you're in the curl; three wipeouts and you're done.
//   fish - Fishing: wait for a bite, tap to strike, then reel (score: kilos landed).

const W = 360;
const H = 480;

export default function Balance({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const theme = String(cfg.theme ?? "lift");
  const seconds = Number(cfg.seconds ?? 30);
  const g = useRef<{
    r: ReturnType<typeof makeRng>;
    t: number;
    m: number;
    mv: number;
    zone: number;
    zv: number;
    size: number;
    hold: boolean;
    progress: number;
    phase: "wait" | "bite" | "reel" | "lift" | "surf" | "rest";
    phaseAt: number;
    biteAt: number;
    weight: number;
    best: number;
    total: number;
    lives: number;
    out: number;
    score: number;
    over: boolean;
    pops: { text: string; at: number; colour: string }[];
  } | null>(null);
  /** The game's state, made the first time it's needed (never while drawing the page). */
  function get() {
    if (!g.current) {
      const r = makeRng(seed);
      g.current = { r, t: 0, m: 0.3, mv: 0, zone: 0.4, zv: 0, size: 0.28, hold: false, progress: 0.3, phase: theme === "fish" ? "wait" : theme === "surf" ? "surf" : "lift", phaseAt: 0, biteAt: 1.5 + r() * 2.5, weight: 60, best: 0, total: 0, lives: 3, out: 0, score: 0, over: false, pops: [] };
    }
    return g.current!;
  }

  function end() {
    const s = get();
    if (s.over) return;
    s.over = true;
    const final = theme === "lift" ? s.best : theme === "fish" ? Math.round(s.total * 10) / 10 : Math.round(s.score);
    window.setTimeout(() => finish(final), 900);
  }
  const pop = (t: string, colour = "#ffd43b") => get().pops.push({ text: t, at: get().t, colour });

  function newRound(s: NonNullable<typeof g.current>) {
    s.m = 0.3;
    s.mv = 0;
    s.zone = 0.35;
    s.progress = 0.3;
  }

  function press(down: boolean) {
    const s = get();
    if (s.over) return;
    if (down && theme === "fish" && (s.phase === "wait" || s.phase === "bite")) {
      if (s.phase === "bite") {
        s.phase = "reel";
        s.phaseAt = s.t;
        s.weight = Math.round((1 + s.r() * 7) * 10) / 10;
        s.size = 0.3 - s.weight * 0.015;
        newRound(s);
        pop("Fish on!", "#69db7c");
        playSfx("found");
      } else {
        pop("Too soon, it swam off", "#ff8787");
        s.biteAt = s.t + 1.5 + s.r() * 2.5;
        playSfx("splash");
      }
      return;
    }
    s.hold = down;
  }
  useKeys(
    (k) => (k === " " || k === "ArrowUp") && press(true),
    (k) => (k === " " || k === "ArrowUp") && press(false),
  );

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    if (!s.over) s.t += dt;
    if (!s.over && s.t >= seconds) end();
    const active = s.phase === "lift" || s.phase === "surf" || s.phase === "reel";
    if (active && !s.over) {
      // The marker: up while held, down when not.
      s.mv += (s.hold ? 1.9 : -1.6) * dt;
      s.mv *= Math.exp(-dt * 1.2);
      s.m += s.mv * dt;
      if (s.m < 0) {
        s.m = 0;
        s.mv = 0;
      }
      if (s.m > 1) {
        s.m = 1;
        s.mv = 0;
      }
      // The zone wanders (harder for heavier weights and bigger fish).
      const hard = theme === "lift" ? (s.weight - 60) / 100 : theme === "fish" ? s.weight / 10 : s.t / seconds;
      s.zv += (s.r() - 0.5) * dt * (3 + hard * 6);
      s.zv *= Math.exp(-dt * 0.6);
      s.zone += s.zv * dt;
      if (s.zone < 0 || s.zone > 1 - s.size) {
        s.zv = -s.zv;
        s.zone = Math.max(0, Math.min(1 - s.size, s.zone));
      }
      const inside = s.m >= s.zone && s.m <= s.zone + s.size;
      if (theme === "surf") {
        if (inside) s.score += dt * 10;
        else {
          s.out += dt;
          if (s.out > 1.2) {
            s.out = 0;
            s.lives--;
            pop("Wipeout!", "#ff8787");
            playSfx("splash");
            newRound(s);
            if (s.lives <= 0) end();
          }
        }
        s.size = 0.32 - (s.t / seconds) * 0.12;
      } else {
        s.progress += (inside ? 0.28 : -0.22) * dt * (theme === "lift" ? 1 - (s.weight - 60) / 400 : 1);
        if (s.progress >= 1) {
          if (theme === "lift") {
            s.best = s.weight;
            pop(`${s.weight} kg lifted!`, "#69db7c");
            playSfx("levelup");
            s.weight += 20;
            s.size = Math.max(0.12, 0.28 - (s.weight - 60) / 600);
          } else {
            s.total += s.weight;
            pop(`Landed ${s.weight} kg!`, "#69db7c");
            playSfx("found");
            s.phase = "wait";
            s.biteAt = s.t + 1.5 + s.r() * 2.5;
          }
          newRound(s);
        }
        if (s.progress <= 0) {
          if (theme === "lift") {
            pop("Dropped it!", "#ff8787");
            playSfx("explode");
            end();
          } else {
            pop("It got away", "#ff8787");
            playSfx("splash");
            s.phase = "wait";
            s.biteAt = s.t + 1.5 + s.r() * 2.5;
          }
        }
      }
    }
    if (theme === "fish" && !s.over) {
      if (s.phase === "wait" && s.t >= s.biteAt) {
        s.phase = "bite";
        s.phaseAt = s.t;
        playSfx("splash");
      }
      if (s.phase === "bite" && s.t - s.phaseAt > 0.9) {
        s.phase = "wait";
        s.biteAt = s.t + 1.5 + s.r() * 2.5;
        pop("Missed the bite", "#ff8787");
      }
    }

    // Scene.
    if (theme === "lift") {
      c.fillStyle = "#212529";
      c.fillRect(0, 0, W, H);
      rrect(c, 0, 400, W, 80, 0, "#5c3d22");
      const up = s.progress;
      const barY = 370 - up * 170;
      runner(c, 150, 400, 110, "#c92a2a", 0, "stand");
      line(c, 60, barY, 240, barY, "#adb5bd", 6);
      const plates = Math.min(6, 1 + (s.weight - 60) / 20);
      for (let k = 0; k < plates; k++) {
        rrect(c, 52 - k * 8, barY - 26, 8, 52, 2, k % 2 ? "#1c7ed6" : "#e03131");
        rrect(c, 240 + k * 8, barY - 26, 8, 52, 2, k % 2 ? "#1c7ed6" : "#e03131");
      }
      text(c, `${s.weight} kg`, 150, 60, 26, "#fff");
      text(c, `Best ${s.best} kg`, 150, 92, 14, "#adb5bd");
    } else if (theme === "surf") {
      sky(c, W, H, "#4dabf7", "#a5d8ff");
      c.beginPath();
      c.moveTo(0, 300);
      for (let x = 0; x <= W; x += 10) c.lineTo(x, 300 - Math.sin(x / 50 + s.t * 2) * 30 - (x < 200 ? (200 - x) * 0.6 : 0));
      c.lineTo(W, H);
      c.lineTo(0, H);
      c.closePath();
      c.fillStyle = "#1c7ed6";
      c.fill();
      const sy = 360 - s.m * 220;
      line(c, 120, sy + 8, 170, sy + 2, "#fab005", 6);
      runner(c, 145, sy, 44, "#e64980", 0, "stand");
      for (let k = 0; k < 3; k++) circle(c, W / 2 - 18 + k * 18, 52, 6, k < s.lives ? "#ff8787" : "rgba(255,255,255,.4)");
    } else {
      sky(c, W, 200, "#ffd8a8", "#ffe8cc");
      c.fillStyle = "#1864ab";
      c.fillRect(0, 200, W, H - 200);
      rrect(c, 0, 170, 120, 30, 0, "#8d5524");
      runner(c, 60, 170, 50, "#2f9e44", 0, "stand");
      const fx = 240;
      const bob = s.phase === "bite" ? 14 : Math.sin(s.t * 3) * 3;
      line(c, 80, 120, fx, 200 + bob, "#e9ecef", 1);
      line(c, 60, 140, 85, 115, "#5c3d22", 4);
      circle(c, fx, 200 + bob, 6, "#e03131");
      if (s.phase === "bite") text(c, "TAP!", fx, 170, 22, "#ffd43b");
      if (s.phase === "reel") fish(c, 260 + Math.sin(s.t * 4) * 30, 300 + (1 - s.progress) * 100, 30 + s.weight * 4, "#4dabf7", Math.cos(s.t * 4) > 0 ? -1 : 1);
      text(c, `${Math.round(s.total * 10) / 10} kg landed`, W / 2, 60, 16, "#212529");
      if (s.phase === "wait") text(c, "Wait for a bite…", W / 2, 240, 14, "#fff");
    }

    // The meter.
    if (active) {
      const mx = theme === "lift" ? 300 : 320;
      const top = 100;
      const h = 300;
      rrect(c, mx, top, 26, h, 10, "rgba(0,0,0,.45)");
      rrect(c, mx + 2, top + h * (1 - s.zone - s.size), 22, h * s.size, 8, "rgba(105,219,124,.75)");
      rrect(c, mx - 4, top + h * (1 - s.m) - 4, 34, 8, 4, "#ffd43b");
      if (theme !== "surf") {
        rrect(c, mx - 14, top, 6, h, 3, "rgba(0,0,0,.45)");
        rrect(c, mx - 14, top + h * (1 - s.progress), 6, h * s.progress, 3, "#4dabf7");
      }
      text(c, "Hold to push up, let go to drop", W / 2, H - 20, 13, "#fff", "center", 700);
    }
    s.pops = s.pops.filter((p) => s.t - p.at < 1.2);
    s.pops.forEach((p, i) => popText(c, p.text, W / 2 - 40, 140 + i * 18, (s.t - p.at) / 1.2, p.colour));
    rrect(c, 0, 0, W, 30, 0, "rgba(0,0,0,.45)");
    text(c, theme === "surf" ? `${Math.round(s.score)}` : "", 30, 15, 16, "#ffd43b");
    text(c, `${Math.max(0, Math.ceil(seconds - s.t))}s`, W - 26, 15, 15, "#fff");
  }

  return <Stage w={W} h={H} handlers={{ frame, down: () => press(true), up: () => press(false) }} />;
}
