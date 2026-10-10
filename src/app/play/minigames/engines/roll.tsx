"use client";

import { useRef } from "react";
import { playSfx } from "../../sound";
import { ball, circle, line, popText, rrect, text } from "../draw";
import { makeRng } from "../rng";
import { Stage, useFinish } from "../stage";
import type { EngineProps } from "../types";

// Drag back from the ball and let go (like a slingshot): the further you pull, the harder.
//   golf    - Mini Golf: 6 holes with walls; score = strokes (lower is better; 6 max a hole).
//   bowling - 5 frames, two balls each; score = pins knocked down (a strike is worth 15).
//   shuffle - Shuffleboard: slide 6 pucks; the scoring zones at the far end are 1, 2, 3, and
//             the very edge 4; off the end scores nothing.

const W = 360;
const H = 480;
const MAX_PULL = 140;

type Rect = { x: number; y: number; w: number; h: number };
type Hole = { tee: [number, number]; cup: [number, number]; walls: Rect[]; par: number };
type Pin = { x: number; y: number; vx: number; vy: number; down: boolean; x0: number; y0: number };

const HOLES: Hole[] = [
  { tee: [180, 420], cup: [180, 80], walls: [], par: 2 },
  { tee: [80, 420], cup: [280, 90], walls: [{ x: 0, y: 230, w: 240, h: 16 }], par: 3 },
  { tee: [180, 430], cup: [180, 70], walls: [{ x: 120, y: 240, w: 120, h: 16 }, { x: 60, y: 140, w: 16, h: 90 }, { x: 284, y: 140, w: 16, h: 90 }], par: 3 },
  { tee: [300, 430], cup: [60, 70], walls: [{ x: 120, y: 300, w: 240, h: 14 }, { x: 0, y: 180, w: 240, h: 14 }], par: 4 },
  { tee: [180, 440], cup: [180, 200], walls: [{ x: 130, y: 140, w: 100, h: 14 }, { x: 130, y: 140, w: 14, h: 120 }, { x: 216, y: 140, w: 14, h: 120 }], par: 3 },
  { tee: [60, 440], cup: [300, 60], walls: [{ x: 100, y: 120, w: 16, h: 260 }, { x: 240, y: 100, w: 16, h: 260 }, { x: 160, y: 60, w: 16, h: 120 }], par: 4 },
];
const LANE = { x: 110, w: 140 };
const PIN_R = 7;
const SHUFFLE = { x: 120, w: 120, top: 40 };

type S = {
  r: ReturnType<typeof makeRng>;
  t: number;
  bx: number;
  by: number;
  vx: number;
  vy: number;
  moving: boolean;
  drag: { x: number; y: number } | null;
  aim: { x: number; y: number } | null;
  hole: number;
  strokes: number;
  total: number;
  frame: number;
  roll: number;
  pins: Pin[];
  pinsAtStart: number;
  shots: number;
  score: number;
  over: boolean;
  pops: { text: string; at: number; colour: string }[];
  pucks: { x: number; y: number; pts: number }[];
};

function rack(): Pin[] {
  const out: Pin[] = [];
  const top = 70;
  for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) {
    const x = W / 2 + (i - row / 2) * 26;
    const y = top + (3 - row) * 22;
    out.push({ x, y, vx: 0, vy: 0, down: false, x0: x, y0: y });
  }
  return out;
}

export default function Roll({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const mode = String(cfg.mode ?? "golf");
  const g = useRef<S | null>(null);
  const BR = mode === "golf" ? 7 : mode === "bowling" ? 11 : 13;

  function get() {
    if (!g.current) {
      const r = makeRng(seed);
      g.current = { r, t: 0, bx: 0, by: 0, vx: 0, vy: 0, moving: false, drag: null, aim: null, hole: 0, strokes: 0, total: 0, frame: 0, roll: 0, pins: rack(), pinsAtStart: 10, shots: 0, score: 0, over: false, pops: [], pucks: [] };
      place(g.current);
    }
    return g.current;
  }
  function place(s: S) {
    if (mode === "golf") [s.bx, s.by] = HOLES[s.hole].tee;
    else if (mode === "bowling") [s.bx, s.by] = [W / 2, H - 50];
    else [s.bx, s.by] = [W / 2, H - 40];
    s.vx = s.vy = 0;
    s.moving = false;
  }
  const pop = (s: S, t: string, colour = "#ffd43b") => s.pops.push({ text: t, at: s.t, colour });
  function end(s: S, score: number) {
    if (s.over) return;
    s.over = true;
    window.setTimeout(() => finish(score), 1200);
  }

  function release() {
    const s = get();
    if (!s.drag || !s.aim || s.moving || s.over) {
      s.drag = s.aim = null;
      return;
    }
    let dx = s.drag.x - s.aim.x;
    let dy = s.drag.y - s.aim.y;
    const len = Math.hypot(dx, dy);
    s.drag = s.aim = null;
    if (len < 8) return;
    const k = Math.min(MAX_PULL, len) / len;
    dx *= k;
    dy *= k;
    const power = mode === "golf" ? 6.2 : mode === "bowling" ? 7.5 : 6.4;
    s.vx = dx * power;
    s.vy = dy * power;
    if (mode !== "golf" && s.vy > -40) s.vy = -40;
    s.moving = true;
    playSfx("whoosh");
    if (mode === "golf") s.strokes++;
  }

  function collideRect(s: S, w: Rect) {
    const cx = Math.max(w.x, Math.min(w.x + w.w, s.bx));
    const cy = Math.max(w.y, Math.min(w.y + w.h, s.by));
    const dx = s.bx - cx;
    const dy = s.by - cy;
    const d = Math.hypot(dx, dy);
    if (d < BR && d > 0) {
      const nx = dx / d;
      const ny = dy / d;
      s.bx = cx + nx * BR;
      s.by = cy + ny * BR;
      const dot = s.vx * nx + s.vy * ny;
      if (dot < 0) {
        s.vx -= 1.8 * dot * nx;
        s.vy -= 1.8 * dot * ny;
        playSfx("tick");
      }
    }
  }

  function stopped(s: S) {
    s.moving = false;
    if (mode === "golf") {
      if (s.strokes >= 6) {
        pop(s, "Six strokes: next hole", "#ff8787");
        nextHole(s);
      }
    } else if (mode === "bowling") {
      afterRoll(s);
    } else afterSlide(s, false);
  }

  function nextHole(s: S) {
    s.total += s.strokes;
    s.strokes = 0;
    s.hole++;
    if (s.hole >= HOLES.length) return end(s, s.total);
    place(s);
  }

  function afterRoll(s: S) {
    const down = s.pins.filter((p) => p.down).length;
    const knocked = down - (10 - s.pinsAtStart);
    if (s.roll === 0 && down === 10) {
      s.score += 15;
      pop(s, "STRIKE! +15", "#69db7c");
      playSfx("levelup");
      nextFrame(s);
    } else if (s.roll === 1) {
      s.score += knocked;
      if (down === 10) {
        s.score += 3;
        pop(s, "Spare! +3", "#69db7c");
      } else pop(s, `${knocked} pins`);
      nextFrame(s);
    } else {
      s.score += knocked;
      pop(s, `${knocked} pins`);
      s.roll = 1;
      s.pinsAtStart = 10 - down;
      // Clear the fallen pins.
      s.pins = s.pins.filter((p) => !p.down);
      for (const p of s.pins) {
        p.vx = p.vy = 0;
      }
      place(s);
    }
  }
  function nextFrame(s: S) {
    s.frame++;
    s.roll = 0;
    s.pins = rack();
    s.pinsAtStart = 10;
    if (s.frame >= Number(cfg.frames ?? 5)) return end(s, s.score);
    place(s);
  }

  function afterSlide(s: S, off: boolean) {
    let pts = 0;
    if (!off) {
      const y = s.by;
      if (y < SHUFFLE.top + 14) pts = 4;
      else if (y < SHUFFLE.top + 60) pts = 3;
      else if (y < SHUFFLE.top + 110) pts = 2;
      else if (y < SHUFFLE.top + 170) pts = 1;
    }
    s.score += pts;
    s.pucks.push({ x: s.bx, y: off ? -100 : s.by, pts });
    pop(s, off ? "Over the edge!" : pts ? `+${pts}` : "Short!", pts ? "#69db7c" : "#ff8787");
    playSfx(pts ? "chime" : "miss");
    s.shots++;
    if (s.shots >= Number(cfg.ends ?? 6)) return end(s, s.score);
    place(s);
  }

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    s.t += dt;
    const steps = 6;
    for (let k = 0; k < steps && s.moving; k++) physics(s, dt / steps);
    draw(c, s);
  }

  function physics(s: S, dt: number) {
    const fr = mode === "golf" ? 1.15 : mode === "bowling" ? 0.12 : 0.9;
    s.bx += s.vx * dt;
    s.by += s.vy * dt;
    const sp = Math.hypot(s.vx, s.vy);
    const ns = Math.max(0, sp - fr * 100 * dt);
    if (sp > 0) {
      s.vx *= ns / sp;
      s.vy *= ns / sp;
    }
    if (mode === "golf") {
      const h = HOLES[s.hole];
      for (const w of [...h.walls, { x: -20, y: -20, w: W + 40, h: 30 }, { x: -20, y: H - 10, w: W + 40, h: 30 }, { x: -20, y: -20, w: 30, h: H + 40 }, { x: W - 10, y: -20, w: 30, h: H + 40 }]) collideRect(s, w);
      const d = Math.hypot(s.bx - h.cup[0], s.by - h.cup[1]);
      if (d < 10 && ns < 260) {
        s.moving = false;
        const diff = s.strokes - h.par;
        pop(s, s.strokes === 1 ? "HOLE IN ONE!" : diff < 0 ? "Birdie!" : diff === 0 ? "Par" : `${s.strokes} strokes`, "#69db7c");
        playSfx("found");
        nextHole(s);
        return;
      }
      if (ns < 4) stopped(s);
    } else if (mode === "bowling") {
      // Gutters.
      if (s.bx < LANE.x + BR || s.bx > LANE.x + LANE.w - BR) {
        s.bx = Math.max(LANE.x - 6, Math.min(LANE.x + LANE.w + 6, s.bx));
        s.vx = 0;
      }
      for (const p of s.pins) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-dt * 2.5);
        p.vy *= Math.exp(-dt * 2.5);
        hit(s, p, BR, 1);
        if (!p.down && Math.hypot(p.x - p.x0, p.y - p.y0) > 5) p.down = true;
      }
      for (let i = 0; i < s.pins.length; i++) for (let j = i + 1; j < s.pins.length; j++) pinPin(s.pins[i], s.pins[j]);
      if (s.by < 20 || ns < 4) {
        const still = s.pins.every((p) => Math.hypot(p.vx, p.vy) < 6);
        if (still || s.by < -40) {
          s.vx = s.vy = 0;
          stopped(s);
        }
      }
    } else {
      if (s.bx < SHUFFLE.x + BR || s.bx > SHUFFLE.x + SHUFFLE.w - BR) s.vx = -s.vx * 0.6;
      s.bx = Math.max(SHUFFLE.x + BR, Math.min(SHUFFLE.x + SHUFFLE.w - BR, s.bx));
      if (s.by < SHUFFLE.top - BR) {
        s.moving = false;
        afterSlide(s, true);
        return;
      }
      if (ns < 3) stopped(s);
    }
  }

  function hit(s: S, p: Pin, r: number, mass: number) {
    const dx = p.x - s.bx;
    const dy = p.y - s.by;
    const d = Math.hypot(dx, dy);
    if (d < r + PIN_R && d > 0) {
      const nx = dx / d;
      const ny = dy / d;
      p.x = s.bx + nx * (r + PIN_R);
      p.y = s.by + ny * (r + PIN_R);
      const rel = s.vx * nx + s.vy * ny;
      if (rel > 0) {
        p.vx += nx * rel * 1.3 * mass;
        p.vy += ny * rel * 1.3 * mass;
        s.vx -= nx * rel * 0.25;
        s.vy -= ny * rel * 0.25;
        p.down = true;
        playSfx("tick");
      }
    }
  }
  function pinPin(a: Pin, b: Pin) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d >= PIN_R * 2 || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    const push = (PIN_R * 2 - d) / 2;
    a.x -= nx * push;
    a.y -= ny * push;
    b.x += nx * push;
    b.y += ny * push;
    const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (rel > 0) {
      a.vx -= rel * nx;
      a.vy -= rel * ny;
      b.vx += rel * nx;
      b.vy += rel * ny;
      a.down = b.down = true;
    }
  }

  function draw(c: CanvasRenderingContext2D, s: S) {
    if (mode === "golf") {
      const h = HOLES[Math.min(s.hole, HOLES.length - 1)];
      c.fillStyle = "#2f9e44";
      c.fillRect(0, 0, W, H);
      c.fillStyle = "#37b24d";
      c.fillRect(10, 10, W - 20, H - 20);
      for (const w of h.walls) rrect(c, w.x, w.y, w.w, w.h, 4, "#8d5524");
      circle(c, h.cup[0], h.cup[1], 10, "#212529");
      line(c, h.cup[0], h.cup[1], h.cup[0], h.cup[1] - 40, "#f8f9fa", 2);
      c.beginPath();
      c.moveTo(h.cup[0], h.cup[1] - 40);
      c.lineTo(h.cup[0] + 18, h.cup[1] - 34);
      c.lineTo(h.cup[0], h.cup[1] - 28);
      c.fillStyle = "#e03131";
      c.fill();
      ball(c, s.bx, s.by, BR, "golf");
      text(c, `Hole ${Math.min(s.hole + 1, HOLES.length)} · par ${h.par} · stroke ${s.strokes}`, W / 2, H - 22, 13, "#fff");
      text(c, `Total ${s.total}`, 50, 24, 14, "#fff");
    } else if (mode === "bowling") {
      c.fillStyle = "#343a40";
      c.fillRect(0, 0, W, H);
      rrect(c, LANE.x - 14, 0, LANE.w + 28, H, 0, "#495057");
      rrect(c, LANE.x, 0, LANE.w, H, 0, "#e9c46a");
      for (let k = 1; k < 7; k++) line(c, LANE.x + (LANE.w / 7) * k, 0, LANE.x + (LANE.w / 7) * k, H, "rgba(0,0,0,.06)", 1);
      for (const p of s.pins) {
        if (p.y < -20) continue;
        circle(c, p.x, p.y, PIN_R, p.down ? "#ced4da" : "#fff", "#e03131", 2);
      }
      ball(c, s.bx, s.by, BR, "bowling", s.by / 20);
      text(c, `Frame ${Math.min(s.frame + 1, Number(cfg.frames ?? 5))} · ball ${s.roll + 1}`, W / 2, H - 16, 13, "#fff");
      text(c, `${s.score}`, 40, 24, 18, "#ffd43b");
    } else {
      c.fillStyle = "#5c3d22";
      c.fillRect(0, 0, W, H);
      rrect(c, SHUFFLE.x, 0, SHUFFLE.w, H, 0, "#d9b77e");
      const zones: [number, number, string, string][] = [
        [SHUFFLE.top, 14, "#e03131", "4"],
        [SHUFFLE.top + 14, 46, "#fab005", "3"],
        [SHUFFLE.top + 60, 50, "#69db7c", "2"],
        [SHUFFLE.top + 110, 60, "#74c0fc", "1"],
      ];
      for (const [y, h, col, label] of zones) {
        rrect(c, SHUFFLE.x, y, SHUFFLE.w, h, 0, col);
        text(c, label, SHUFFLE.x + SHUFFLE.w + 16, y + h / 2, 16, "#fff");
      }
      line(c, SHUFFLE.x, SHUFFLE.top, SHUFFLE.x + SHUFFLE.w, SHUFFLE.top, "#212529", 3);
      for (const p of s.pucks) if (p.y > 0) circle(c, p.x, p.y, BR, "#868e96", "#495057", 2);
      circle(c, s.bx, s.by, BR, "#e03131", "#a51111", 3);
      text(c, `${s.score}`, 40, 24, 18, "#ffd43b");
      text(c, `Puck ${Math.min(s.shots + 1, Number(cfg.ends ?? 6))} of ${cfg.ends ?? 6}`, 60, H - 20, 13, "#fff");
    }
    // The aiming line while you pull back.
    if (s.drag && s.aim) {
      const dx = s.drag.x - s.aim.x;
      const dy = s.drag.y - s.aim.y;
      const len = Math.min(MAX_PULL, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      for (let k = 1; k <= 6; k++) circle(c, s.bx + Math.cos(a) * len * 0.3 * k, s.by + Math.sin(a) * len * 0.3 * k, 3, `rgba(255,255,255,${1 - k / 7})`);
      text(c, `${Math.round((len / MAX_PULL) * 100)}%`, s.bx + 30, s.by + 20, 12, "#fff");
    }
    s.pops = s.pops.filter((p) => s.t - p.at < 1.3);
    for (const p of s.pops) popText(c, p.text, W / 2, H / 2, (s.t - p.at) / 1.3, p.colour);
    if (!s.moving && !s.drag && !s.over) text(c, "Drag back from the ball, let go", W / 2, mode === "golf" ? 24 : 50, 12, "#fff", "center", 700);
  }

  return (
    <Stage
      w={W}
      h={H}
      handlers={{
        frame,
        down: (p) => {
          const s = get();
          if (s.moving || s.over) return;
          s.drag = { x: p.x, y: p.y };
          s.aim = { x: p.x, y: p.y };
        },
        move: (p) => {
          const s = get();
          if (s.drag) s.aim = { x: p.x, y: p.y };
        },
        up: () => release(),
      }}
    />
  );
}
