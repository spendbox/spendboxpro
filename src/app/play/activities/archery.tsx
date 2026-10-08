"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Target, Wind } from "lucide-react";
import { playSfx } from "../sound";
import { BigButton, Confetti, GameHeader, Leaderboard, RewardHint, RewardNote, localPoint, useAnimationFrame, useGameReward, useScoreBoard, type GameProps, rand, perfNow } from "./ui";

// Archery: pull back anywhere on the range (like a slingshot) and let go. Pulling further gives
// more power (the arrow drops less) but also lifts your aim; the wind pushes the arrow
// sideways, more on weak shots. 6 arrows, 10 points for the gold.

const W = 320;
const H = 420;
const CX = 160;
const CY = 150;
const R = 100;
const ARROWS = 6;
const MAX_PULL = 170;
const RINGS = ["#f1f3f5", "#f1f3f5", "#212529", "#212529", "#3b82f6", "#3b82f6", "#e5484d", "#e5484d", "#ffc53d", "#ffc53d"];

type Shot = { x: number; y: number; score: number };
type Flight = { fromX: number; fromY: number; x: number; y: number; t: number; score: number };

const ringScore = (x: number, y: number) => {
  const d = Math.hypot(x - CX, y - CY);
  return d > R ? 0 : Math.min(10, 10 - Math.floor(d / (R / 10)));
};
const newWind = () => Math.round((rand() * 2 - 1) * 10) / 10;

export function Archery(props: GameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [wind, setWind] = useState(newWind);
  const [last, setLast] = useState<number | null>(null);
  const drag = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);
  const flight = useRef<Flight | null>(null);
  const board = useScoreBoard(props, "archery");
  const reward = useGameReward("archery", !!props.me);
  const done = shots.length >= ARROWS;
  const total = shots.reduce((s, x) => s + x.score, 0);
  const shotsRef = useRef(shots);
  const windRef = useRef(wind);
  useEffect(() => {
    shotsRef.current = shots;
    windRef.current = wind;
  });

  useAnimationFrame((dt, t) => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = cv.width / W;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Sky, hills, grass.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#bfe3ff");
    sky.addColorStop(0.55, "#e9f6ff");
    sky.addColorStop(0.56, "#9bd37a");
    sky.addColorStop(1, "#5aa64a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // Wind flag.
    const w = windRef.current;
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(26, 20);
    ctx.lineTo(26, 70);
    ctx.stroke();
    ctx.fillStyle = "#e5484d";
    ctx.beginPath();
    const flap = Math.sin(t / 120) * 3;
    ctx.moveTo(26, 22);
    ctx.lineTo(26 + 28 * w + (w >= 0 ? 4 : -4), 28 + flap);
    ctx.lineTo(26, 36);
    ctx.fill();
    // Target stand and face.
    ctx.fillStyle = "#8d5a2b";
    ctx.fillRect(CX - 6, CY + R - 10, 12, 80);
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.arc(CX, CY, R - i * (R / 10), 0, Math.PI * 2);
      ctx.fillStyle = RINGS[i];
      ctx.fill();
      ctx.strokeStyle = i === 2 || i === 3 ? "#495057" : "rgba(0,0,0,.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath();
    ctx.arc(CX, CY, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Arrows already in the target.
    for (const s of shotsRef.current) drawStuck(ctx, s.x, s.y);
    // Arrow in the air.
    const f = flight.current;
    if (f) {
      f.t = Math.min(1, f.t + dt / 0.45);
      const e = 1 - Math.pow(1 - f.t, 2);
      const x = f.fromX + (f.x - f.fromX) * e;
      const y = f.fromY + (f.y - f.fromY) * e - Math.sin(Math.PI * f.t) * 40;
      const size = 34 * (1 - e) + 8;
      ctx.strokeStyle = "#5c3d1e";
      ctx.lineWidth = 3 * (1 - e) + 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + size);
      ctx.stroke();
      if (f.t >= 1) {
        flight.current = null;
        const shot = { x: f.x, y: f.y, score: f.score };
        setShots((s) => [...s, shot]);
        setLast(f.score);
        setWind(newWind());
        playSfx(f.score >= 9 ? "found" : f.score > 0 ? "pop" : "miss");
      }
    }
    // Bow and aim while pulling.
    const d = drag.current;
    const bowX = CX;
    const bowY = H - 50;
    let pull = 0;
    if (d) {
      const dx = d.sx - d.x;
      const dy = d.sy - d.y;
      pull = Math.min(MAX_PULL, Math.hypot(dx, dy));
      const sway = 3 + pull / 60;
      const ax = CX + dx * 0.9 + Math.sin(t / 230) * sway;
      const ay = CY + 80 + dy * 0.9 + Math.cos(t / 310) * sway;
      ctx.strokeStyle = "rgba(24,32,43,.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ax, ay, 9, 0, Math.PI * 2);
      ctx.moveTo(ax - 14, ay);
      ctx.lineTo(ax + 14, ay);
      ctx.moveTo(ax, ay - 14);
      ctx.lineTo(ax, ay + 14);
      ctx.stroke();
      // Power bar.
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.fillRect(W - 26, 230, 12, 120);
      ctx.fillStyle = pull > 140 ? "#e5484d" : pull > 80 ? "#ffc53d" : "#12a37a";
      ctx.fillRect(W - 26, 350 - (pull / MAX_PULL) * 120, 12, (pull / MAX_PULL) * 120);
    }
    ctx.strokeStyle = "#7a4a2c";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(bowX, bowY + 30, 46, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1.5;
    const sx = bowX + Math.cos(Math.PI * 1.15) * 46;
    const sy = bowY + 30 + Math.sin(Math.PI * 1.15) * 46;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(bowX, sy + pull / 4);
    ctx.lineTo(bowX + (bowX - sx), sy);
    ctx.stroke();
  });

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr;
    cv.height = H * dpr;
  }, []);

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (done || flight.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = localPoint(e, e.currentTarget, W, H);
    drag.current = { sx: p.x, sy: p.y, x: p.x, y: p.y };
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drag.current) return;
    const p = localPoint(e, e.currentTarget, W, H);
    drag.current.x = p.x;
    drag.current.y = p.y;
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    if (!d || done) return;
    const dx = d.sx - d.x;
    const dy = d.sy - d.y;
    const pull = Math.min(MAX_PULL, Math.hypot(dx, dy));
    if (pull < 25) return; // just a tap
    const power = pull / MAX_PULL;
    const t = perfNow();
    const sway = 3 + pull / 60;
    const ax = CX + dx * 0.9 + Math.sin(t / 230) * sway;
    const ay = CY + 80 + dy * 0.9 + Math.cos(t / 310) * sway;
    // Wind drift (stronger on weak shots) and drop (weak shots fall short).
    const x = ax + windRef.current * 60 * (1.15 - power) + (rand() - 0.5) * 4;
    const y = ay + (1 - power) * 50 + (rand() - 0.5) * 4;
    flight.current = { fromX: CX, fromY: H - 40, x, y, t: 0, score: ringScore(x, y) };
    playSfx("rustle");
  }

  const finished = useRef(false);
  useEffect(() => {
    if (!done || finished.current) return;
    finished.current = true;
    board.post(total);
    void reward.finish(total);
  }, [done, total, board, reward]);

  function again() {
    finished.current = false;
    setShots([]);
    setLast(null);
    setWind(newWind());
    reward.reset();
  }

  return (
    <div className="space-y-3">
      <GameHeader icon={Target} title="Archery" sub={props.label} onClose={props.onClose} color="#e5484d" />
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <Wind className="size-4 text-muted" style={{ transform: wind < 0 ? "scaleX(-1)" : undefined }} />
          Wind {Math.abs(wind * 10).toFixed(0)} km/h {wind === 0 ? "" : wind > 0 ? "right" : "left"}
        </span>
        <span className="font-semibold tabular-nums">
          Arrow {Math.min(shots.length + 1, ARROWS)}/{ARROWS} · {total} pts
        </span>
      </div>
      <div className="relative overflow-hidden rounded-2xl">
        <canvas
          ref={canvas}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => (drag.current = null)}
          className="block w-full touch-none select-none"
          style={{ aspectRatio: `${W} / ${H}` }}
          aria-label="Archery range: pull back and let go to shoot"
        />
        {last !== null && !done && (
          <span key={shots.length} className="act-pop pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-ink/80 px-3 py-1 text-sm font-bold text-white">
            {last === 10 ? "Bullseye! 10" : last === 0 ? "Missed!" : `${last} points`}
          </span>
        )}
        {done && total >= 45 && <Confetti />}
      </div>
      {!done ? (
        <p className="text-center text-xs text-muted">Pull back anywhere on the range and let go. Pull further for power, then nudge sideways for the wind.</p>
      ) : (
        <div className="act-rise space-y-2 text-center">
          <p className="font-display text-2xl font-bold">{total} points</p>
          <RewardNote claim={reward.claim} />
          <BigButton onClick={again}>
            <RotateCcw className="size-4" /> Shoot again
          </BigButton>
        </div>
      )}
      <RewardHint game="archery" />
      <Leaderboard entries={board.entries} meId={props.me?.id} unit="pts" />
    </div>
  );
}

function drawStuck(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.beginPath();
  ctx.arc(x + 1, y + 1, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5c3d1e";
  ctx.beginPath();
  ctx.arc(x, y, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#e64980";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 4, y - 4);
  ctx.lineTo(x + 4, y + 4);
  ctx.moveTo(x + 4, y - 4);
  ctx.lineTo(x - 4, y + 4);
  ctx.stroke();
}
