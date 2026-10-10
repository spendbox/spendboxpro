"use client";

import { useRef } from "react";
import { playSfx } from "../../sound";
import { ball, circle, line, popText, rrect, runner, sky, text } from "../draw";
import { makeRng } from "../rng";
import { Stage, useFinish } from "../stage";
import type { EngineProps } from "../types";

// Penalty Shootout: five kicks each, taking turns. Your kick: tap where in the goal to aim,
// then stop the power bar in the green (too little and the keeper gets there, too much and it
// flies over). Their kick: tap the side of the goal to dive to before the ball arrives. Score:
// your goals plus your saves.

const W = 360;
const H = 480;
const GOAL = { x: 50, y: 90, w: 260, h: 120 };

type S = {
  r: ReturnType<typeof makeRng>;
  t: number;
  kick: number;
  turn: "shoot" | "save";
  phase: "aim" | "power" | "fly" | "wait" | "dive" | "done";
  aim: { x: number; y: number };
  power: number;
  meter: number;
  keeper: number;
  keeperY: number;
  dive: number;
  ballT: number;
  shotTo: { x: number; y: number };
  result: string;
  goals: number;
  saves: number;
  over: boolean;
  pops: { text: string; at: number; colour: string }[];
  waitAt: number;
};

export default function Penalty({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const kicks = Number(cfg.kicks ?? 5);
  const g = useRef<S | null>(null);
  function get() {
    if (!g.current) g.current = { r: makeRng(seed), t: 0, kick: 0, turn: "shoot", phase: "aim", aim: { x: W / 2, y: GOAL.y + 60 }, power: 0, meter: 0, keeper: W / 2, keeperY: GOAL.y + 80, dive: 0, ballT: 0, shotTo: { x: W / 2, y: GOAL.y + 60 }, result: "", goals: 0, saves: 0, over: false, pops: [], waitAt: 0 };
    return g.current;
  }

  function tap(x: number, y: number) {
    const s = get();
    if (s.over) return;
    if (s.turn === "shoot") {
      if (s.phase === "aim") {
        s.aim = { x: Math.max(GOAL.x - 20, Math.min(GOAL.x + GOAL.w + 20, x)), y: Math.max(GOAL.y - 20, Math.min(GOAL.y + GOAL.h, y)) };
        s.phase = "power";
        s.meter = 0;
      } else if (s.phase === "power") {
        s.power = (1 - Math.cos(s.meter)) / 2;
        // The keeper guesses a side (and is quicker to low, central balls).
        const guess = s.r() < 0.55 ? (s.aim.x < W / 2 ? -1 : 1) : s.r() < 0.5 ? -1 : 1;
        s.dive = guess;
        s.shotTo = { ...s.aim };
        s.phase = "fly";
        s.ballT = 0;
        playSfx("whoosh");
      }
    } else if (s.phase === "wait" || s.phase === "dive") {
      if (s.phase === "dive" && s.dive !== 0) return;
      s.dive = x < W / 2 ? -1 : 1;
      if (Math.abs(x - W / 2) < 40) s.dive = 0.001;
    }
  }

  function settle(s: S, text: string, good: boolean) {
    s.result = text;
    s.pops.push({ text, at: s.t, colour: good ? "#69db7c" : "#ff8787" });
    playSfx(good ? "found" : "miss");
    s.phase = "done";
    window.setTimeout(() => {
      if (s.turn === "shoot") {
        s.turn = "save";
        s.phase = "wait";
        s.dive = 0;
        s.waitAt = s.t + 1.2 + s.r() * 1.2;
        s.shotTo = { x: GOAL.x + 20 + s.r() * (GOAL.w - 40), y: GOAL.y + 20 + s.r() * (GOAL.h - 30) };
      } else {
        s.kick++;
        if (s.kick >= kicks) {
          s.over = true;
          window.setTimeout(() => finish(s.goals + s.saves), 600);
          return;
        }
        s.turn = "shoot";
        s.phase = "aim";
        s.dive = 0;
      }
      s.keeper = W / 2;
    }, 1300);
  }

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    s.t += dt;
    let bx = W / 2;
    let by = H - 90;
    let br = 14;
    if (s.turn === "shoot") {
      if (s.phase === "power") s.meter += dt * 3.4;
      if (s.phase === "fly") {
        s.ballT = Math.min(1, s.ballT + dt * 2.6);
        const over = s.power > 0.93;
        const tx = s.shotTo.x;
        const ty = over ? GOAL.y - 60 : s.shotTo.y;
        bx = W / 2 + (tx - W / 2) * s.ballT;
        by = H - 90 + (ty - (H - 90)) * s.ballT - Math.sin(s.ballT * Math.PI) * 30;
        br = 14 - s.ballT * 6;
        s.keeper = W / 2 + s.dive * Math.min(1, s.ballT * 1.6) * 95;
        if (s.ballT >= 1) {
          const wide = s.shotTo.x < GOAL.x + 4 || s.shotTo.x > GOAL.x + GOAL.w - 4 || s.shotTo.y < GOAL.y + 4;
          const reach = 46 + (1 - s.power) * 70;
          const saved = Math.abs(s.keeper - s.shotTo.x) < reach && s.power < 0.93;
          if (over) settle(s, "Over the bar!", false);
          else if (wide) settle(s, "Wide!", false);
          else if (saved) settle(s, "Saved!", false);
          else {
            s.goals++;
            settle(s, "GOAL!", true);
          }
        }
      }
      if (s.phase === "done" && s.result === "GOAL!") {
        bx = s.shotTo.x;
        by = s.shotTo.y;
        br = 8;
      }
    } else {
      // Their kick.
      if (s.phase === "wait" && s.t >= s.waitAt) {
        s.phase = "dive";
        s.ballT = 0;
        playSfx("whoosh");
      }
      if (s.phase === "dive") {
        s.ballT = Math.min(1, s.ballT + dt * 1.6);
        bx = W / 2 + (s.shotTo.x - W / 2) * s.ballT;
        by = H - 90 + (s.shotTo.y - (H - 90)) * s.ballT - Math.sin(s.ballT * Math.PI) * 30;
        br = 14 - s.ballT * 6;
        if (s.dive) s.keeper += (W / 2 + Math.sign(s.dive) * (Math.abs(s.dive) < 0.01 ? 0 : 95) - s.keeper) * Math.min(1, dt * 7);
        if (s.ballT >= 1) {
          const saved = s.dive !== 0 && Math.abs(s.keeper - s.shotTo.x) < 55;
          if (saved) {
            s.saves++;
            settle(s, "You saved it!", true);
          } else settle(s, "They scored", false);
        }
      }
    }
    // Pitch and goal.
    sky(c, W, H, "#74c0fc", "#d3f9d8");
    rrect(c, 0, 220, W, H - 220, 0, "#2f9e44");
    for (let k = 0; k < 6; k++) rrect(c, 0, 220 + k * 44, W, 22, 0, "rgba(255,255,255,.05)");
    rrect(c, GOAL.x, GOAL.y, GOAL.w, GOAL.h, 0, "rgba(255,255,255,.25)");
    for (let x = GOAL.x; x <= GOAL.x + GOAL.w; x += 16) line(c, x, GOAL.y, x, GOAL.y + GOAL.h, "rgba(255,255,255,.4)", 1);
    for (let y = GOAL.y; y <= GOAL.y + GOAL.h; y += 16) line(c, GOAL.x, y, GOAL.x + GOAL.w, y, "rgba(255,255,255,.4)", 1);
    line(c, GOAL.x, GOAL.y + GOAL.h, GOAL.x, GOAL.y, "#fff", 6);
    line(c, GOAL.x, GOAL.y, GOAL.x + GOAL.w, GOAL.y, "#fff", 6);
    line(c, GOAL.x + GOAL.w, GOAL.y, GOAL.x + GOAL.w, GOAL.y + GOAL.h, "#fff", 6);
    // Keeper.
    const kx = s.keeper;
    const tilt = Math.max(-1, Math.min(1, (kx - W / 2) / 95));
    c.save();
    c.translate(kx, GOAL.y + GOAL.h);
    c.rotate(tilt * 1.1);
    runner(c, 0, 0, 90, s.turn === "shoot" ? "#fab005" : "#e64980", 0, "stand");
    line(c, 0, -60, -30, -80, "#f1c27d", 6);
    line(c, 0, -60, 30, -80, "#f1c27d", 6);
    c.restore();
    if (s.turn === "shoot" && s.phase === "aim") circle(c, s.aim.x, s.aim.y, 10, "rgba(0,0,0,0)", "#fff", 2);
    if (s.turn === "shoot" && s.phase !== "aim") {
      line(c, s.aim.x - 8, s.aim.y, s.aim.x + 8, s.aim.y, "#ffd43b", 2);
      line(c, s.aim.x, s.aim.y - 8, s.aim.x, s.aim.y + 8, "#ffd43b", 2);
    }
    ball(c, bx, by, br, "football", s.t * 6);
    if (s.turn === "shoot" && s.phase === "power") {
      const p = (1 - Math.cos(s.meter)) / 2;
      rrect(c, 40, H - 40, 280, 18, 9, "rgba(0,0,0,.4)");
      rrect(c, 40 + 280 * 0.55, H - 40, 280 * 0.38, 18, 6, "rgba(105,219,124,.7)");
      rrect(c, 40, H - 40, 280 * p, 18, 9, "#ffd43b");
    }
    s.pops = s.pops.filter((p) => s.t - p.at < 1.3);
    for (const p of s.pops) popText(c, p.text, W / 2, 260, (s.t - p.at) / 1.3, p.colour);
    rrect(c, 0, 0, W, 34, 0, "rgba(0,0,0,.45)");
    text(c, `Goals ${s.goals} · Saves ${s.saves}`, 90, 17, 14, "#fff");
    text(c, `Round ${Math.min(s.kick + 1, kicks)} of ${kicks}`, W - 70, 17, 13, "#fff");
    const hint = s.turn === "shoot" ? (s.phase === "aim" ? "Tap where to aim in the goal" : s.phase === "power" ? "Tap to stop the power in the green" : "") : s.phase === "wait" || s.phase === "dive" ? "Tap left, middle or right to dive!" : "";
    if (hint) text(c, hint, W / 2, H - 60, 14, "#fff");
  }

  return <Stage w={W} h={H} handlers={{ frame, down: (p) => tap(p.x, p.y) }} />;
}
