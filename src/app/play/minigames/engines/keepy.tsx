"use client";

import { useRef } from "react";
import { playSfx } from "../../sound";
import { ball, popText, rrect, sky, text } from "../draw";
import { Stage, useFinish } from "../stage";
import type { EngineProps } from "../types";

// Keepy-Uppy: tap the ball to kick it up; where you tap sends it sideways (tap its left side
// to send it right). Each touch is a point. It gets livelier as you go. Don't let it land.

const W = 360;
const H = 480;
const R = 22;

type S = { x: number; y: number; vx: number; vy: number; spin: number; touches: number; t: number; started: boolean; over: boolean; pops: { at: number; x: number; y: number }[] };

export default function Keepy({ cfg, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const kind = String(cfg.ball ?? "football");
  const g = useRef<S | null>(null);
  function get() {
    if (!g.current) g.current = { x: W / 2, y: H - 120, vx: 0, vy: 0, spin: 0, touches: 0, t: 0, started: false, over: false, pops: [] };
    return g.current;
  }

  function kick(px: number, py: number) {
    const s = get();
    if (s.over) return;
    const dx = s.x - px;
    const dy = s.y - py;
    if (Math.hypot(dx, dy) > R * 1.9) return;
    s.started = true;
    const lively = 1 + Math.min(0.8, s.touches * 0.02);
    s.vy = -(520 + Math.min(160, s.touches * 4)) * (dy < -R * 0.5 ? 0.7 : 1);
    s.vx = Math.max(-260, Math.min(260, (dx / R) * 190 * lively));
    s.spin = s.vx / 60;
    s.touches++;
    s.pops.push({ at: s.t, x: s.x, y: s.y - 30 });
    playSfx("pop");
  }

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    s.t += dt;
    if (s.started && !s.over) {
      s.vy += 900 * dt * (1 + Math.min(0.6, s.touches * 0.01));
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < R || s.x > W - R) {
        s.vx = -s.vx * 0.8;
        s.x = Math.max(R, Math.min(W - R, s.x));
      }
      if (s.y > H - 40 - R) {
        s.y = H - 40 - R;
        s.over = true;
        playSfx("miss");
        window.setTimeout(() => finish(s.touches), 800);
      }
    }
    sky(c, W, H, "#74c0fc", "#d3f9d8");
    rrect(c, 0, H - 40, W, 40, 0, "#2f9e44");
    ball(c, s.x, s.y, R, kind, (s.spin * s.t) % (Math.PI * 2));
    s.pops = s.pops.filter((p) => s.t - p.at < 0.6);
    for (const p of s.pops) popText(c, "+1", p.x, p.y, (s.t - p.at) / 0.6, "#fff");
    text(c, `${s.touches}`, W / 2, 60, 44, "#fff");
    if (!s.started) text(c, "Tap the ball to start", W / 2, H / 2, 16, "#212529");
    if (s.over) text(c, "It touched the ground!", W / 2, H / 2, 20, "#212529");
  }

  return <Stage w={W} h={H} handlers={{ frame, down: (p) => kick(p.x, p.y) }} />;
}
