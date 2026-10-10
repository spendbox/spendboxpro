"use client";

import { useRef } from "react";
import { playSfx } from "../../sound";
import { alien, circle, line, rrect, text } from "../draw";
import { makeRng } from "../rng";
import { Stage, useFinish, useKeys } from "../stage";
import type { EngineProps } from "../types";

// Alien Attack: drag to move your ship along the bottom; it fires by itself. Shoot every alien
// before they reach the town. They march faster as there are fewer of them, and drop bombs.
// Three lives. Clear a wave for a bonus and a faster wave. Score: points (top rows are worth more).

const W = 360;
const H = 480;
const COLS = 8;
const ROWS = 5;

type Alien = { c: number; r: number; alive: boolean };
type S = {
  rng: ReturnType<typeof makeRng>;
  t: number;
  x: number;
  keys: number;
  aliens: Alien[];
  ox: number;
  oy: number;
  dir: number;
  shots: { x: number; y: number }[];
  bombs: { x: number; y: number }[];
  fireAt: number;
  lives: number;
  hurt: number;
  score: number;
  wave: number;
  over: boolean;
  ufo: number | null;
};

const ROW_COLOURS = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#74c0fc"];

export default function Invaders({ seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const g = useRef<S | null>(null);
  function fresh(): Alien[] {
    const out: Alien[] = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) out.push({ c, r, alive: true });
    return out;
  }
  function get() {
    if (!g.current) g.current = { rng: makeRng(seed), t: 0, x: W / 2, keys: 0, aliens: fresh(), ox: 30, oy: 60, dir: 1, shots: [], bombs: [], fireAt: 0, lives: 3, hurt: 0, score: 0, wave: 0, over: false, ufo: null };
    return g.current;
  }
  useKeys(
    (k) => {
      const s = get();
      if (k === "ArrowLeft") s.keys = -1;
      if (k === "ArrowRight") s.keys = 1;
    },
    (k) => {
      const s = get();
      if ((k === "ArrowLeft" && s.keys < 0) || (k === "ArrowRight" && s.keys > 0)) s.keys = 0;
    },
  );

  function end(s: S) {
    if (s.over) return;
    s.over = true;
    playSfx("explode");
    window.setTimeout(() => finish(s.score), 1000);
  }

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    s.t += dt;
    if (!s.over) {
      if (s.keys) s.x = Math.max(20, Math.min(W - 20, s.x + s.keys * 300 * dt));
      if (s.hurt > 0) s.hurt -= dt;
      // Fire.
      if (s.t >= s.fireAt) {
        s.shots.push({ x: s.x, y: H - 54 });
        s.fireAt = s.t + 0.42;
      }
      for (const sh of s.shots) sh.y -= 520 * dt;
      s.shots = s.shots.filter((sh) => sh.y > 0);
      // March.
      const alive = s.aliens.filter((a) => a.alive);
      const speed = (28 + (COLS * ROWS - alive.length) * 2.2) * (1 + s.wave * 0.2);
      s.ox += s.dir * speed * dt;
      const minC = Math.min(...alive.map((a) => a.c));
      const maxC = Math.max(...alive.map((a) => a.c));
      if (s.ox + minC * 36 < 10 || s.ox + maxC * 36 + 28 > W - 10) {
        s.dir = -s.dir;
        s.ox += s.dir * 4;
        s.oy += 14;
      }
      // Bombs.
      if (s.rng() < dt * (0.8 + s.wave * 0.3) && alive.length) {
        const a = alive[Math.floor(s.rng() * alive.length)];
        s.bombs.push({ x: s.ox + a.c * 36 + 14, y: s.oy + a.r * 30 + 24 });
      }
      for (const b of s.bombs) b.y += 220 * dt;
      s.bombs = s.bombs.filter((b) => {
        if (b.y > H) return false;
        if (s.hurt <= 0 && Math.abs(b.x - s.x) < 18 && b.y > H - 50 && b.y < H - 26) {
          s.lives--;
          s.hurt = 1.2;
          playSfx("caught");
          if (s.lives <= 0) end(s);
          return false;
        }
        return true;
      });
      // UFO.
      if (s.ufo === null && s.rng() < dt * 0.06) s.ufo = -30;
      if (s.ufo !== null) {
        s.ufo += 90 * dt;
        if (s.ufo > W + 30) s.ufo = null;
      }
      // Hits.
      for (const sh of s.shots) {
        if (s.ufo !== null && Math.abs(sh.x - s.ufo) < 22 && Math.abs(sh.y - 36) < 10) {
          s.score += 150;
          s.ufo = null;
          sh.y = -10;
          playSfx("found");
          continue;
        }
        for (const a of alive) {
          const ax = s.ox + a.c * 36 + 14;
          const ay = s.oy + a.r * 30 + 12;
          if (a.alive && Math.abs(sh.x - ax) < 14 && Math.abs(sh.y - ay) < 12) {
            a.alive = false;
            sh.y = -10;
            s.score += (ROWS - a.r) * 10;
            playSfx("pop");
            break;
          }
        }
      }
      if (alive.length && s.oy + Math.max(...alive.map((a) => a.r)) * 30 + 24 > H - 60) end(s);
      if (!s.aliens.some((a) => a.alive)) {
        s.wave++;
        s.score += 200;
        s.aliens = fresh();
        s.ox = 30;
        s.oy = 60 + Math.min(80, s.wave * 12);
        playSfx("levelup");
      }
    }
    // Draw.
    c.fillStyle = "#0b0d1a";
    c.fillRect(0, 0, W, H);
    for (let k = 0; k < 40; k++) circle(c, (k * 97) % W, (k * 61) % H, 1, "rgba(255,255,255,.5)");
    for (const a of s.aliens) if (a.alive) alien(c, s.ox + a.c * 36 + 14, s.oy + a.r * 30 + 12, 24, ROW_COLOURS[a.r], Math.floor(s.t * 2));
    if (s.ufo !== null) {
      rrect(c, s.ufo - 20, 30, 40, 12, 6, "#e64980");
      rrect(c, s.ufo - 8, 24, 16, 8, 4, "#ffd8e6");
    }
    for (const sh of s.shots) line(c, sh.x, sh.y, sh.x, sh.y + 10, "#69db7c", 3);
    for (const b of s.bombs) line(c, b.x, b.y, b.x + 3, b.y + 8, "#ff8787", 3);
    if (!(s.hurt > 0 && Math.floor(s.t * 10) % 2)) {
      c.beginPath();
      c.moveTo(s.x, H - 58);
      c.lineTo(s.x + 18, H - 30);
      c.lineTo(s.x - 18, H - 30);
      c.closePath();
      c.fillStyle = "#74c0fc";
      c.fill();
    }
    rrect(c, 0, H - 24, W, 24, 0, "#2b8a3e");
    text(c, `${s.score}`, 40, 14, 16, "#ffd43b");
    text(c, `Wave ${s.wave + 1}`, W / 2, 14, 13, "#fff");
    for (let k = 0; k < s.lives; k++) circle(c, W - 20 - k * 16, 14, 5, "#74c0fc");
  }

  const steer = (x: number) => {
    get().x = Math.max(20, Math.min(W - 20, x));
  };
  return <Stage w={W} h={H} handlers={{ frame, down: (p) => steer(p.x), move: (p) => steer(p.x) }} bg="#0b0d1a" />;
}
