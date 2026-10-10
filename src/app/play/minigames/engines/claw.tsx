"use client";

import { useRef } from "react";
import { playSfx } from "../../sound";
import { circle, gem, line, popText, rrect, star, text } from "../draw";
import { makeRng } from "../rng";
import { Stage, useFinish, useKeys } from "../stage";
import type { EngineProps } from "../types";

// The claw: it slides along by itself. Tap to stop it, tap again to drop. It grabs what's under
// it, if it's close enough to the middle; big prizes are worth more but slip unless you're
// spot on. theme toys (score: prize points) or diamond (score: carats). tries: goes.

const W = 360;
const H = 480;
const FLOOR = 400;

type Prize = { x: number; w: number; value: number; colour: string; shape: number; got: boolean };

export default function Claw({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const diamond = cfg.theme === "diamond";
  const tries = Number(cfg.tries ?? 5);
  const g = useRef<{
    r: ReturnType<typeof makeRng>;
    t: number;
    x: number;
    dir: number;
    y: number;
    phase: "slide" | "aim" | "down" | "up" | "back";
    held: Prize | null;
    slip: boolean;
    tries: number;
    score: number;
    prizes: Prize[];
    over: boolean;
    pops: { text: string; at: number; colour: string }[];
  } | null>(null);
  /** The game's state, made the first time it's needed (never while drawing the page). */
  function get() {
    if (!g.current) {
      const r = makeRng(seed);
      const prizes: Prize[] = [];
      let x = 30;
      while (x < W - 40) {
        const value = 1 + Math.floor(r() * (diamond ? 5 : 3));
        const w = 30 + value * (diamond ? 7 : 12);
        if (x + w > W - 20) break;
        prizes.push({ x: x + w / 2, w, value, colour: diamond ? ["#66d9e8", "#f783ac", "#b197fc", "#8ce99a", "#ffe066"][value - 1] : ["#ff8787", "#74c0fc", "#ffd43b", "#b197fc", "#8ce99a"][Math.floor(r() * 5)], shape: Math.floor(r() * 3), got: false });
        x += w + 4 + r() * 10;
      }
      g.current = { r, t: 0, x: 60, dir: 1, y: 60, phase: "slide", held: null, slip: false, tries, score: 0, prizes, over: false, pops: [] };
    }
    return g.current!;
  }

  function tap() {
    const s = get();
    if (s.over) return;
    if (s.phase === "slide") {
      s.phase = "down";
      playSfx("move");
    }
  }
  useKeys((k) => (k === " " || k === "Enter" || k === "ArrowDown") && tap());

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    s.t += dt;
    const speed = 130 + (tries - s.tries) * 18;
    if (s.phase === "slide") {
      s.x += s.dir * speed * dt;
      if (s.x > W - 30 || s.x < 30) s.dir = -s.dir;
    } else if (s.phase === "down") {
      s.y += 260 * dt;
      const under = s.prizes.find((p) => !p.got && Math.abs(p.x - s.x) < p.w / 2);
      const bottom = under ? FLOOR - (diamond ? 30 : 40) : FLOOR - 10;
      if (s.y >= bottom) {
        s.y = bottom;
        if (under) {
          const off = Math.abs(under.x - s.x) / (under.w / 2);
          const sure = off < 0.25 || (off < 0.6 && s.r() > under.value * 0.12);
          s.held = under;
          s.slip = !sure;
          under.got = true;
          playSfx("tick");
        }
        s.phase = "up";
      }
    } else if (s.phase === "up") {
      s.y -= 200 * dt;
      if (s.held && s.slip && s.y < FLOOR - 140) {
        s.held.got = false;
        s.pops.push({ text: "It slipped!", at: s.t, colour: "#ff8787" });
        playSfx("miss");
        s.held = null;
      }
      if (s.y <= 60) {
        s.y = 60;
        s.phase = "back";
      }
    } else if (s.phase === "back") {
      s.x += (30 - s.x) * Math.min(1, dt * 4);
      if (Math.abs(s.x - 30) < 2) {
        if (s.held) {
          s.score += s.held.value;
          s.pops.push({ text: `+${s.held.value}${diamond ? " ct" : ""}`, at: s.t, colour: "#69db7c" });
          playSfx("found");
        } else if (!s.pops.length) {
          s.pops.push({ text: "Nothing!", at: s.t, colour: "#ffd43b" });
        }
        s.held = null;
        s.tries--;
        if (s.tries <= 0 || !s.prizes.some((p) => !p.got)) {
          s.over = true;
          window.setTimeout(() => finish(s.score), 900);
        } else {
          s.phase = "slide";
          s.x = 60;
          s.dir = 1;
        }
      }
    }

    // The cabinet.
    c.fillStyle = diamond ? "#212529" : "#5f3dc4";
    c.fillRect(0, 0, W, H);
    rrect(c, 10, 40, W - 20, FLOOR - 20, 12, diamond ? "rgba(173,216,230,.12)" : "rgba(255,255,255,.12)", diamond ? "#adb5bd" : "#e599f7", 3);
    rrect(c, 10, FLOOR + 20, W - 20, 50, 8, diamond ? "#343a40" : "#7048e8");
    rrect(c, 12, FLOOR + 20, 50, 30, 4, "#212529");
    text(c, "OUT", 37, FLOOR + 35, 10, "#adb5bd");
    for (const p of s.prizes) {
      if (p.got && p !== s.held) continue;
      const py = p === s.held ? s.y + (diamond ? 30 : 34) : FLOOR - (diamond ? 4 : 20);
      drawPrize(c, p, p === s.held ? s.x : p.x, py);
    }
    // The claw.
    line(c, s.x, 40, s.x, s.y, "#ced4da", 3);
    rrect(c, s.x - 14, s.y - 8, 28, 14, 4, "#adb5bd");
    const open = s.phase === "down" || s.phase === "slide" ? 16 : 6;
    line(c, s.x - 6, s.y + 6, s.x - open, s.y + 26, "#ced4da", 4);
    line(c, s.x + 6, s.y + 6, s.x + open, s.y + 26, "#ced4da", 4);
    s.pops = s.pops.filter((p) => s.t - p.at < 1.2);
    for (const p of s.pops) popText(c, p.text, W / 2, 140, (s.t - p.at) / 1.2, p.colour);
    text(c, `${diamond ? "Carats" : "Prizes"}: ${s.score}`, 80, 18, 15, "#ffd43b");
    text(c, `Goes left: ${s.tries}`, W - 80, 18, 14, "#fff");
    if (s.phase === "slide") text(c, "Tap to drop the claw", W / 2, H - 14, 13, "#fff", "center", 700);
  }

  function drawPrize(c: CanvasRenderingContext2D, p: Prize, x: number, y: number) {
    if (diamond) {
      rrect(c, x - p.w / 2, y - 4, p.w, 8, 3, "#495057");
      gem(c, x, y - p.w * 0.35, p.w * 0.8, p.colour);
      return;
    }
    if (p.shape === 0) {
      circle(c, x, y - p.w * 0.3, p.w * 0.38, p.colour);
      circle(c, x - p.w * 0.28, y - p.w * 0.62, p.w * 0.14, p.colour);
      circle(c, x + p.w * 0.28, y - p.w * 0.62, p.w * 0.14, p.colour);
      circle(c, x - p.w * 0.12, y - p.w * 0.36, 3, "#212529");
      circle(c, x + p.w * 0.12, y - p.w * 0.36, 3, "#212529");
    } else if (p.shape === 1) {
      star(c, x, y - p.w * 0.35, p.w * 0.45, p.colour);
    } else {
      rrect(c, x - p.w * 0.4, y - p.w * 0.7, p.w * 0.8, p.w * 0.7, 6, p.colour);
      line(c, x, y - p.w * 0.7, x, y, "#fff", 4);
      line(c, x - p.w * 0.4, y - p.w * 0.35, x + p.w * 0.4, y - p.w * 0.35, "#fff", 4);
    }
  }

  return <Stage w={W} h={H} handlers={{ frame, down: tap }} />;
}
