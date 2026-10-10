"use client";

import { useRef } from "react";
import { ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { playSfx } from "../../sound";
import { circle, gem, line, popText, rrect, runner, text } from "../draw";
import { makeRng } from "../rng";
import { Pad, Pads, Stage, useFinish, useKeys } from "../stage";
import type { EngineProps } from "../types";

// Get across a room to the jewel, one square at a time, without being caught.
//   lasers - each row has a laser: one that blinks on and off, or one that sweeps along.
//   guards - each row has a guard walking up and down with a torch shining ahead of them.
// Reach the jewel: +100 (and a bonus for speed), then the next room is harder. Three lives,
// 75 seconds.

const W = 360;
const H = 480;
const COLS = 5;
const SECONDS = 75;

type Row = { kind: "blink" | "sweep" | "guard" | "safe"; period: number; phase: number; speed: number; pos: number; dir: number; width: number };

export default function Crossing({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const theme = String(cfg.theme ?? "lasers");
  const ROWS = Number(cfg.rows ?? 9);
  const cw = W / COLS;
  const ch = (H - 40) / ROWS;
  const g = useRef<{
    r: ReturnType<typeof makeRng>;
    t: number;
    level: number;
    rows: Row[];
    px: number;
    py: number;
    lives: number;
    score: number;
    roomAt: number;
    hurt: number;
    over: boolean;
    pops: { text: string; at: number; colour: string }[];
  } | null>(null);

  function room(s: { r: ReturnType<typeof makeRng> }, level: number): Row[] {
    const r = s.r;
    const rows: Row[] = [];
    for (let i = 0; i < ROWS; i++) {
      if (i === 0 || i === ROWS - 1 || (i % 3 === 0 && r() < 0.5)) {
        rows.push({ kind: "safe", period: 1, phase: 0, speed: 0, pos: 0, dir: 1, width: 0 });
        continue;
      }
      const hard = 1 + level * 0.18;
      if (theme === "guards") rows.push({ kind: "guard", period: 0, phase: 0, speed: (0.9 + r() * 1.1) * hard, pos: r() * (COLS - 1), dir: r() < 0.5 ? 1 : -1, width: 2 });
      else if (r() < 0.5) rows.push({ kind: "blink", period: (1.4 + r() * 1.4) / hard, phase: r() * 3, speed: 0, pos: 0, dir: 1, width: 0 });
      else rows.push({ kind: "sweep", period: 0, phase: 0, speed: (1.2 + r() * 1.6) * hard, pos: r() * COLS, dir: r() < 0.5 ? 1 : -1, width: 1 + (r() < 0.3 ? 1 : 0) });
    }
    return rows;
  }

  /** The game's state, made the first time it's needed (never while drawing the page). */
  function get() {
    if (!g.current) {
      const r = makeRng(seed);
      const s = { r, t: 0, level: 0, rows: [] as Row[], px: 2, py: ROWS - 1, lives: 3, score: 0, roomAt: 0, hurt: 0, over: false, pops: [] };
      s.rows = room(s, 0);
      g.current = s;
    }
    return g.current!;
  }

  function end() {
    const s = get();
    if (s.over) return;
    s.over = true;
    window.setTimeout(() => finish(Math.round(s.score)), 900);
  }

  /** Is square (col, row) dangerous right now? */
  function danger(row: Row, col: number, t: number) {
    if (row.kind === "safe") return false;
    if (row.kind === "blink") return (t + row.phase) % row.period < row.period * 0.55;
    if (row.kind === "sweep") return Math.abs(col + 0.5 - row.pos) < 0.5 + row.width * 0.5 - 0.15;
    // Guards: the guard's own square and the two ahead in their torch beam.
    const gc = Math.round(row.pos);
    if (col === gc) return true;
    return row.dir > 0 ? col > gc && col <= gc + row.width : col < gc && col >= gc - row.width;
  }

  function move(dx: number, dy: number) {
    const s = get();
    if (s.over || s.hurt > 0) return;
    s.px = Math.max(0, Math.min(COLS - 1, s.px + dx));
    s.py = Math.max(0, Math.min(ROWS - 1, s.py + dy));
    playSfx("move");
    if (s.py === 0) {
      const quick = Math.max(0, Math.round(40 - (s.t - s.roomAt) * 2));
      s.score += 100 + quick;
      s.pops.push({ text: `Got the jewel! +${100 + quick}`, at: s.t, colour: "#69db7c" });
      playSfx("found");
      s.level++;
      s.rows = room(s, s.level);
      s.px = 2;
      s.py = ROWS - 1;
      s.roomAt = s.t;
    }
  }
  useKeys((k) => {
    if (k === "ArrowUp" || k === "w") move(0, -1);
    if (k === "ArrowDown" || k === "s") move(0, 1);
    if (k === "ArrowLeft" || k === "a") move(-1, 0);
    if (k === "ArrowRight" || k === "d") move(1, 0);
  });

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    if (!s.over) {
      s.t += dt;
      if (s.t >= SECONDS) end();
      if (s.hurt > 0) {
        s.hurt -= dt;
        if (s.hurt <= 0) {
          s.px = 2;
          s.py = ROWS - 1;
        }
      }
    }
    for (const row of s.rows) {
      if (row.kind === "sweep" || row.kind === "guard") {
        row.pos += row.dir * row.speed * dt;
        const lo = row.kind === "guard" ? 0 : -row.width;
        const hi = row.kind === "guard" ? COLS - 1 : COLS + row.width;
        if (row.pos < lo || row.pos > hi) {
          row.dir = -row.dir;
          row.pos = Math.max(lo, Math.min(hi, row.pos));
        }
      }
    }
    const guards = theme === "guards";
    c.fillStyle = guards ? "#1a1b2e" : "#141414";
    c.fillRect(0, 0, W, H);
    const top = 40;
    for (let i = 0; i < ROWS; i++) {
      const row = s.rows[i];
      for (let col = 0; col < COLS; col++) {
        const x = col * cw;
        const y = top + i * ch;
        rrect(c, x + 2, y + 2, cw - 4, ch - 4, 6, i === 0 ? "#2b8a3e" : i === ROWS - 1 ? "#364fc7" : (i + col) % 2 ? "#25262b" : "#2c2e33");
        if (danger(row, col, s.t)) {
          if (guards) {
            const gc = Math.round(row.pos);
            if (col !== gc) rrect(c, x + 2, y + 2, cw - 4, ch - 4, 6, "rgba(255,236,153,.35)");
          } else rrect(c, x + 2, y + ch / 2 - 3, cw - 4, 6, 3, "#ff1f1f");
        }
      }
      if (row.kind === "guard") {
        const gx = row.pos * cw + cw / 2;
        runner(c, gx, top + i * ch + ch - 6, ch * 0.9, "#1c7ed6", s.t * row.speed);
        line(c, gx, top + i * ch + ch / 2, gx + row.dir * 18, top + i * ch + ch / 2, "#ffd43b", 4);
      }
      if (row.kind === "sweep") {
        const x = row.pos * cw;
        line(c, x - (row.width * cw) / 2, top + i * ch + ch / 2, x + (row.width * cw) / 2, top + i * ch + ch / 2, "#ff1f1f", 6);
        circle(c, x, top + i * ch + ch / 2, 8, "#ff6b6b");
      }
      if (row.kind === "blink") {
        circle(c, 6, top + i * ch + ch / 2, 5, "#ff6b6b");
        circle(c, W - 6, top + i * ch + ch / 2, 5, "#ff6b6b");
      }
    }
    gem(c, W / 2, top + ch / 2, 30, "#66d9e8");
    // You.
    const caught = !s.over && s.hurt <= 0 && danger(s.rows[s.py], s.px, s.t);
    if (caught) {
      s.lives--;
      s.hurt = 0.9;
      s.pops.push({ text: guards ? "Spotted!" : "Zapped!", at: s.t, colour: "#ff8787" });
      playSfx(guards ? "denied" : "explode");
      if (s.lives <= 0) end();
    }
    const blink = s.hurt > 0 && Math.floor(s.t * 10) % 2 === 0;
    if (!blink) runner(c, s.px * cw + cw / 2, top + s.py * ch + ch - 6, ch * 0.9, "#fab005", 0, "stand");
    s.pops = s.pops.filter((p) => s.t - p.at < 1.2);
    s.pops.forEach((p, i) => popText(c, p.text, W / 2, H / 2 + i * 18, (s.t - p.at) / 1.2, p.colour));
    rrect(c, 0, 0, W, 36, 0, "rgba(0,0,0,.6)");
    text(c, `${s.score}`, 30, 18, 17, "#ffd43b");
    text(c, `Room ${s.level + 1}`, W / 2, 18, 14, "#fff");
    text(c, `${Math.max(0, Math.ceil(SECONDS - s.t))}s`, W - 26, 18, 15, "#fff");
    for (let k = 0; k < 3; k++) circle(c, W / 2 + 50 + k * 14, 18, 5, k < s.lives ? "#ff8787" : "rgba(255,255,255,.25)");
  }

  return (
    <div>
      <Stage
        w={W}
        h={H}
        handlers={{
          frame,
          down: (p) => {
            const s = get();
            const px = s.px * cw + cw / 2;
            const py = 40 + s.py * ch + ch / 2;
            const dx = p.x - px;
            const dy = p.y - py;
            if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0);
            else move(0, dy > 0 ? 1 : -1);
          },
        }}
      />
      <Pads>
        <Pad onDown={() => move(-1, 0)}>
          <ArrowLeft className="size-6" />
        </Pad>
        <Pad onDown={() => move(0, -1)} className="bg-[#2b8a3e]">
          <ArrowUp className="size-6" />
        </Pad>
        <Pad onDown={() => move(1, 0)}>
          <ArrowRight className="size-6" />
        </Pad>
      </Pads>
    </div>
  );
}
