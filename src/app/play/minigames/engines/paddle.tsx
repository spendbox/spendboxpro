"use client";

import { useRef } from "react";
import { playSfx } from "../../sound";
import { ball, circle, line, rrect, runner, sky, text } from "../draw";
import { makeRng } from "../rng";
import { Stage, useFinish, useKeys } from "../stage";
import type { EngineProps } from "../types";

// Bat-and-ball games against a bot. You're at the bottom (or on the left for volleyball); drag
// to move. First to `points` wins; your score is the points you won.
//   pingpong - table tennis, seen from above
//   tennis   - a tennis court, a slower bigger ball
//   hockey   - air hockey: your mallet moves anywhere in your half; goals in the middle of each end
//   foosball - table football: drag to slide both your rods of players
//   volley   - beach volleyball from the side: bump it over the net (gravity!)

const W = 360;
const H = 480;

type S = {
  r: ReturnType<typeof makeRng>;
  t: number;
  bx: number;
  by: number;
  vx: number;
  vy: number;
  px: number;
  py: number;
  ox: number;
  oy: number;
  aim: number;
  me: number;
  bot: number;
  serve: number;
  over: boolean;
  msg: string;
  msgAt: number;
  lastPx: number;
  lastPy: number;
  keys: number;
};

export default function Paddle({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const mode = String(cfg.mode ?? "pingpong");
  const target = Number(cfg.points ?? 7);
  const hockey = mode === "hockey";
  const volley = mode === "volley";
  const foos = mode === "foosball";
  const PW = mode === "tennis" ? 70 : foos ? 0 : 64;
  const BR = mode === "tennis" ? 8 : hockey ? 13 : foos ? 9 : 7;
  const MR = 24; // mallet radius (hockey) / player head (volley)
  const GOAL = hockey ? 120 : foos ? 130 : 0;
  const g = useRef<S | null>(null);

  function get() {
    if (!g.current) {
      const r = makeRng(seed);
      g.current = { r, t: 0, bx: W / 2, by: H / 2, vx: 0, vy: 0, px: W / 2, py: volley ? H - 40 : hockey ? H - 80 : H - 40, ox: W / 2, oy: volley ? H - 40 : 40, aim: 0, me: 0, bot: 0, serve: 1.2, over: false, msg: "", msgAt: 0, lastPx: W / 2, lastPy: H - 80, keys: 0 };
      reset(g.current, 1);
    }
    return g.current;
  }

  /** Put the ball in play towards whoever lost the last point (dir 1: towards you). */
  function reset(s: S, dir: number) {
    s.serve = 0.9;
    if (volley) {
      s.bx = dir > 0 ? W * 0.25 : W * 0.75;
      s.by = 120;
      s.vx = 0;
      s.vy = 0;
      return;
    }
    s.bx = W / 2;
    s.by = H / 2;
    const sp = mode === "tennis" ? 230 : hockey ? 0 : foos ? 200 : 260;
    const a = (s.r() - 0.5) * 0.9;
    s.vx = Math.sin(a) * sp;
    s.vy = Math.cos(a) * sp * dir;
    if (hockey) {
      s.by = dir > 0 ? H * 0.62 : H * 0.38;
      s.vx = 0;
      s.vy = 0;
    }
  }

  function point(s: S, mine: boolean) {
    if (mine) s.me++;
    else s.bot++;
    s.msg = mine ? "Your point!" : "Bot's point";
    s.msgAt = s.t;
    playSfx(mine ? "found" : "miss");
    if (s.me >= target || s.bot >= target) {
      s.over = true;
      s.msg = s.me >= target ? "You win!" : "The bot wins";
      window.setTimeout(() => finish(s.me), 1200);
      return;
    }
    reset(s, mine ? -1 : 1);
  }

  function steer(x: number, y: number) {
    const s = get();
    if (volley) s.px = Math.max(MR, Math.min(W / 2 - MR - 4, x));
    else if (hockey) {
      s.px = Math.max(MR, Math.min(W - MR, x));
      s.py = Math.max(H / 2 + MR, Math.min(H - MR, y));
    } else s.px = Math.max(PW / 2, Math.min(W - PW / 2, x));
  }
  useKeys(
    (k) => {
      const s = get();
      if (k === "ArrowLeft" || k === "a") s.keys = -1;
      if (k === "ArrowRight" || k === "d") s.keys = 1;
    },
    (k) => {
      const s = get();
      if ((k === "ArrowLeft" || k === "a") && s.keys < 0) s.keys = 0;
      if ((k === "ArrowRight" || k === "d") && s.keys > 0) s.keys = 0;
    },
  );

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    s.t += dt;
    if (s.keys) steer((volley || hockey ? s.px : s.px) + s.keys * 380 * dt, s.py);
    const steps = 4;
    for (let k = 0; k < steps && !s.over; k++) step(s, dt / steps);
    draw(c, s);
  }

  function step(s: S, dt: number) {
    if (s.serve > 0) {
      s.serve -= dt;
      return;
    }
    const level = 1 + (s.me + s.bot) * 0.04;
    // The bot.
    const botSpeed = (mode === "tennis" ? 210 : hockey ? 260 : foos ? 230 : 250) * level;
    let want = s.bx + s.aim;
    if (volley) want = s.bx > W / 2 ? s.bx + 10 : W * 0.75;
    if (hockey) want = s.by < H / 2 ? s.bx : W / 2;
    if (!volley && !hockey && s.vy > 0) want = W / 2 + (s.bx - W / 2) * 0.3;
    s.ox += Math.max(-botSpeed * dt, Math.min(botSpeed * dt, want - s.ox));
    if (hockey) {
      const wy = s.by < H / 2 ? Math.max(MR, s.by - 30) : 50;
      s.oy += Math.max(-botSpeed * dt, Math.min(botSpeed * dt, wy - s.oy));
      s.oy = Math.max(MR, Math.min(H / 2 - MR, s.oy));
      s.ox = Math.max(MR, Math.min(W - MR, s.ox));
    } else if (volley) s.ox = Math.max(W / 2 + MR + 4, Math.min(W - MR, s.ox));
    else s.ox = Math.max(PW / 2, Math.min(W - PW / 2, s.ox));

    // The ball.
    if (volley) s.vy += 520 * dt;
    s.bx += s.vx * dt;
    s.by += s.vy * dt;
    if (hockey || foos) {
      s.vx *= Math.exp(-dt * 0.25);
      s.vy *= Math.exp(-dt * 0.25);
    }
    // Side walls.
    if (s.bx < BR) {
      s.bx = BR;
      s.vx = Math.abs(s.vx);
    }
    if (s.bx > W - BR) {
      s.bx = W - BR;
      s.vx = -Math.abs(s.vx);
    }

    if (volley) {
      // The net.
      if (Math.abs(s.bx - W / 2) < BR + 3 && s.by > H - 170) {
        s.vx = -s.vx * 0.6;
        s.bx = s.bx < W / 2 ? W / 2 - BR - 3 : W / 2 + BR + 3;
      }
      if (s.by < BR) {
        s.by = BR;
        s.vy = Math.abs(s.vy);
      }
      for (const [x, y, mine] of [[s.px, H - 40, true], [s.ox, H - 40, false]] as const) {
        const dx = s.bx - x;
        const dy = s.by - (y - MR);
        const d = Math.hypot(dx, dy);
        if (d < MR + BR && s.vy > -50) {
          const nx = dx / d;
          s.vx = nx * 260 + (mine ? 90 : -90);
          s.vy = -420 - Math.abs(nx) * 60;
          s.by = y - MR - (MR + BR) * Math.abs(dy / d);
          playSfx("pop");
        }
      }
      if (s.by > H - 20) point(s, s.bx > W / 2);
      return;
    }

    if (hockey) {
      // Ends of the table, with goals in the middle.
      const inGoal = Math.abs(s.bx - W / 2) < GOAL / 2;
      if (s.by < BR && !inGoal) {
        s.by = BR;
        s.vy = Math.abs(s.vy);
      }
      if (s.by > H - BR && !inGoal) {
        s.by = H - BR;
        s.vy = -Math.abs(s.vy);
      }
      if (s.by < -BR) return point(s, true);
      if (s.by > H + BR) return point(s, false);
      // Mallets push the puck.
      const mvx = (s.px - s.lastPx) / dt;
      const mvy = (s.py - s.lastPy) / dt;
      s.lastPx = s.px;
      s.lastPy = s.py;
      for (const [x, y, vx, vy] of [[s.px, s.py, mvx, mvy], [s.ox, s.oy, 0, 140]] as const) {
        const dx = s.bx - x;
        const dy = s.by - y;
        const d = Math.hypot(dx, dy);
        if (d < MR + BR && d > 0) {
          const nx = dx / d;
          const ny = dy / d;
          s.bx = x + nx * (MR + BR);
          s.by = y + ny * (MR + BR);
          const rel = (s.vx - vx) * nx + (s.vy - vy) * ny;
          if (rel < 0) {
            s.vx -= 1.9 * rel * nx;
            s.vy -= 1.9 * rel * ny;
          }
          const sp = Math.hypot(s.vx, s.vy);
          const cap = 720;
          if (sp > cap) {
            s.vx *= cap / sp;
            s.vy *= cap / sp;
          }
          playSfx("tick");
        }
      }
      return;
    }

    if (foos) {
      const inGoal = Math.abs(s.bx - W / 2) < GOAL / 2;
      if (s.by < BR && !inGoal) {
        s.by = BR;
        s.vy = Math.abs(s.vy);
      }
      if (s.by > H - BR && !inGoal) {
        s.by = H - BR;
        s.vy = -Math.abs(s.vy);
      }
      if (s.by < -BR) return point(s, true);
      if (s.by > H + BR) return point(s, false);
      // Rods: yours at rows 0.85 and 0.45 of the height (kicking up), theirs at 0.15 and 0.55.
      const rods: [number, number, number][] = [
        [H * 0.85, s.px, -1],
        [H * 0.45, s.px, -1],
        [H * 0.15, s.ox, 1],
        [H * 0.55, s.ox, 1],
      ];
      for (const [ry, rx, dir] of rods) {
        for (const off of [-110, 0, 110]) {
          const fx = rx + off;
          if (Math.abs(s.by - ry) < 10 + BR && Math.abs(s.bx - fx) < 12 + BR && Math.sign(s.vy || dir) !== dir) {
            const a = ((s.bx - fx) / 22) * 0.9;
            const sp = Math.max(260, Math.hypot(s.vx, s.vy) * 1.05);
            s.vx = Math.sin(a) * sp;
            s.vy = Math.cos(a) * sp * dir;
            s.by = ry + dir * (10 + BR);
            playSfx("tick");
          }
        }
      }
      if (Math.hypot(s.vx, s.vy) < 60) s.vy += (s.r() - 0.5) * 40;
      return;
    }

    // Table tennis / tennis: bats at the top and bottom.
    const myY = H - 40;
    const botY = 40;
    if (s.vy > 0 && s.by + BR >= myY - 6 && s.by < myY + 6 && Math.abs(s.bx - s.px) < PW / 2 + BR) {
      const off = (s.bx - s.px) / (PW / 2);
      const sp = Math.min(560, Math.hypot(s.vx, s.vy) * 1.06);
      s.vx = off * sp * 0.75;
      s.vy = -Math.sqrt(Math.max(1, sp * sp - s.vx * s.vx));
      s.by = myY - 6 - BR;
      s.aim = (s.r() - 0.5) * PW * (0.9 + (s.me + s.bot) * 0.02);
      playSfx("pop");
    }
    if (s.vy < 0 && s.by - BR <= botY + 6 && s.by > botY - 6 && Math.abs(s.bx - s.ox) < PW / 2 + BR) {
      const off = (s.bx - s.ox) / (PW / 2);
      const sp = Math.min(560, Math.hypot(s.vx, s.vy) * 1.04);
      s.vx = off * sp * 0.7 + (s.r() - 0.5) * 60;
      s.vy = Math.sqrt(Math.max(1, sp * sp - s.vx * s.vx));
      s.by = botY + 6 + BR;
      playSfx("pop");
    }
    if (s.by > H + 20) point(s, false);
    if (s.by < -20) point(s, true);
  }

  function draw(c: CanvasRenderingContext2D, s: S) {
    if (volley) {
      sky(c, W, H, "#74c0fc", "#fff3bf");
      rrect(c, 0, H - 20, W, 20, 0, "#f2d49b");
      line(c, W / 2, H - 20, W / 2, H - 170, "#fff", 4);
      runner(c, s.px, H - 20, 60, "#e64980", s.t);
      circle(c, s.px, H - 40 - MR + 4, 6, "rgba(0,0,0,0)");
      runner(c, s.ox, H - 20, 60, "#1c7ed6", s.t);
      ball(c, s.bx, s.by, BR + 3, "volley", s.t * 4);
    } else if (hockey) {
      c.fillStyle = "#e7f5ff";
      c.fillRect(0, 0, W, H);
      line(c, 0, H / 2, W, H / 2, "#e03131", 3);
      circle(c, W / 2, H / 2, 40, "rgba(0,0,0,0)", "#e03131", 3);
      rrect(c, W / 2 - GOAL / 2, -4, GOAL, 10, 4, "#343a40");
      rrect(c, W / 2 - GOAL / 2, H - 6, GOAL, 10, 4, "#343a40");
      circle(c, s.ox, s.oy, MR, "#1c7ed6", "#1864ab", 4);
      circle(c, s.px, s.py, MR, "#e03131", "#a51111", 4);
      ball(c, s.bx, s.by, BR, "puck");
    } else if (foos) {
      c.fillStyle = "#2f9e44";
      c.fillRect(0, 0, W, H);
      line(c, 0, H / 2, W, H / 2, "rgba(255,255,255,.5)", 2);
      rrect(c, W / 2 - GOAL / 2, -4, GOAL, 8, 3, "#f8f9fa");
      rrect(c, W / 2 - GOAL / 2, H - 4, GOAL, 8, 3, "#f8f9fa");
      for (const [ry, rx, col] of [[H * 0.85, s.px, "#e03131"], [H * 0.45, s.px, "#e03131"], [H * 0.15, s.ox, "#1c7ed6"], [H * 0.55, s.ox, "#1c7ed6"]] as const) {
        line(c, 0, ry, W, ry, "#adb5bd", 4);
        for (const off of [-110, 0, 110]) rrect(c, rx + off - 11, ry - 10, 22, 20, 6, col);
      }
      ball(c, s.bx, s.by, BR, "football", s.t * 6);
    } else {
      const tennis = mode === "tennis";
      c.fillStyle = tennis ? "#2b8a3e" : "#1864ab";
      c.fillRect(0, 0, W, H);
      c.strokeStyle = "#fff";
      c.lineWidth = 3;
      c.strokeRect(14, 14, W - 28, H - 28);
      line(c, W / 2, 14, W / 2, H - 14, "rgba(255,255,255,.5)", 2);
      line(c, 0, H / 2, W, H / 2, tennis ? "#f8f9fa" : "#343a40", tennis ? 3 : 6);
      rrect(c, s.ox - PW / 2, 34, PW, 12, 6, "#1c7ed6");
      rrect(c, s.px - PW / 2, H - 46, PW, 12, 6, "#e03131");
      ball(c, s.bx, s.by, BR, tennis ? "tennis" : "pingpong");
    }
    text(c, `${s.bot}`, W - 24, H / 2 - 24, 26, "rgba(0,0,0,.35)");
    text(c, `${s.me}`, W - 24, H / 2 + 24, 26, "rgba(0,0,0,.35)");
    if (s.t - s.msgAt < 1.2 && s.msg) text(c, s.msg, W / 2, H / 2 + (volley ? -120 : 0), 24, volley ? "#212529" : "#fff");
    if (s.serve > 0 && !s.over) text(c, `First to ${target}`, W / 2, volley ? 60 : H / 2 + 40, 14, volley ? "#495057" : "rgba(255,255,255,.8)");
  }

  return (
    <Stage
      w={W}
      h={H}
      handlers={{
        frame,
        down: (p) => steer(p.x, p.y),
        move: (p) => steer(p.x, p.y),
      }}
    />
  );
}
