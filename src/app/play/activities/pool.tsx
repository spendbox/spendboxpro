"use client";

import { useEffect, useRef, useState } from "react";
import { CircleDot, RotateCcw } from "lucide-react";
import { playSfx } from "../sound";
import { BigButton, Confetti, GameHeader, Leaderboard, RewardHint, RewardNote, localPoint, useAnimationFrame, useGameReward, useScoreBoard, type GameProps } from "./ui";

// Trick-shot pool: pull back from anywhere (like a slingshot) to aim the white ball, let go to
// shoot. Pot as many of the 6 balls as you can in 8 shots. Potting the white costs a shot.

const W = 300;
const H = 460;
const RAIL = 18;
const BR = 9;
const POCKET = 17;
const SHOTS = 8;
const MAX_PULL = 150;
const COLORS = ["#ffc53d", "#2f6fd1", "#e5484d", "#7048e8", "#f76707", "#12a37a"];
const POCKETS = [
  [RAIL, RAIL],
  [W - RAIL, RAIL],
  [RAIL - 3, H / 2],
  [W - RAIL + 3, H / 2],
  [RAIL, H - RAIL],
  [W - RAIL, H - RAIL],
];
const CUE_START = { x: W / 2, y: H * 0.78 };

type Ball = { x: number; y: number; vx: number; vy: number; color: string; cue?: boolean; in?: boolean };

function rack(): Ball[] {
  const balls: Ball[] = [{ ...CUE_START, vx: 0, vy: 0, color: "#ffffff", cue: true }];
  const top = H * 0.24;
  let k = 0;
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i <= row; i++) {
      balls.push({ x: W / 2 + (i - row / 2) * (BR * 2 + 1), y: top + (2 - row) * (BR * 1.75), vx: 0, vy: 0, color: COLORS[k++] });
    }
  }
  return balls;
}

export function Pool(props: GameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const balls = useRef<Ball[]>(rack());
  const drag = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);
  const moving = useRef(false);
  const [shots, setShots] = useState(0);
  const [potted, setPotted] = useState(0);
  const [over, setOver] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const board = useScoreBoard(props, "pool");
  const reward = useGameReward("pool", !!props.me);
  const state = useRef({ shots: 0, potted: 0 });

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr;
    cv.height = H * dpr;
  }, []);

  function draw() {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = cv.width / W;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#6b3f1d";
    ctx.fillRect(0, 0, W, H);
    const felt = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, H * 0.7);
    felt.addColorStop(0, "#1f9d6b");
    felt.addColorStop(1, "#0f6b47");
    ctx.fillStyle = felt;
    ctx.fillRect(RAIL, RAIL, W - RAIL * 2, H - RAIL * 2);
    ctx.fillStyle = "#0b0f14";
    for (const [px, py] of POCKETS) {
      ctx.beginPath();
      ctx.arc(px, py, POCKET - 2, 0, Math.PI * 2);
      ctx.fill();
    }
    const cue = balls.current[0];
    const d = drag.current;
    if (d && !moving.current && !cue.in) {
      const dx = d.sx - d.x;
      const dy = d.sy - d.y;
      const pull = Math.min(MAX_PULL, Math.hypot(dx, dy));
      if (pull > 6) {
        const ux = dx / Math.hypot(dx, dy);
        const uy = dy / Math.hypot(dx, dy);
        ctx.setLineDash([5, 6]);
        ctx.strokeStyle = "rgba(255,255,255,.7)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cue.x, cue.y);
        ctx.lineTo(cue.x + ux * 160, cue.y + uy * 160);
        ctx.stroke();
        ctx.setLineDash([]);
        // The cue stick, pulled back.
        ctx.strokeStyle = "#d9a441";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(cue.x - ux * (BR + 6 + pull / 3), cue.y - uy * (BR + 6 + pull / 3));
        ctx.lineTo(cue.x - ux * (BR + 150 + pull / 3), cue.y - uy * (BR + 150 + pull / 3));
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.75)";
        ctx.fillRect(W - RAIL - 8, H / 2 - 60, 6, 120);
        ctx.fillStyle = pull > 120 ? "#e5484d" : "#ffc53d";
        ctx.fillRect(W - RAIL - 8, H / 2 + 60 - (pull / MAX_PULL) * 120, 6, (pull / MAX_PULL) * 120);
      }
    }
    for (const b of balls.current) {
      if (b.in) continue;
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.beginPath();
      ctx.arc(b.x + 2, b.y + 2, BR, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, BR);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.35, b.color);
      g.addColorStop(1, b.cue ? "#cfd4da" : b.color);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  useAnimationFrame((dt) => {
    // Physics in small steps so fast balls don't skip through each other.
    const bs = balls.current;
    const steps = 6;
    let anyMoving = false;
    for (let s = 0; s < steps; s++) {
      const h = dt / steps;
      for (const b of bs) {
        if (b.in) continue;
        b.x += b.vx * h;
        b.y += b.vy * h;
        const damp = Math.exp(-1.15 * h);
        b.vx *= damp;
        b.vy *= damp;
        if (Math.hypot(b.vx, b.vy) < 6) {
          b.vx = 0;
          b.vy = 0;
        }
        // Pockets.
        for (const [px, py] of POCKETS) {
          if (Math.hypot(b.x - px, b.y - py) < POCKET) {
            b.in = true;
            b.vx = b.vy = 0;
            if (b.cue) {
              setNote("Scratch! The white went in.");
              playSfx("miss");
            } else {
              state.current.potted += 1;
              setPotted(state.current.potted);
              setNote("In!");
              playSfx("found");
            }
          }
        }
        if (b.in) continue;
        // Cushions.
        if (b.x < RAIL + BR) {
          b.x = RAIL + BR;
          b.vx = Math.abs(b.vx) * 0.8;
        } else if (b.x > W - RAIL - BR) {
          b.x = W - RAIL - BR;
          b.vx = -Math.abs(b.vx) * 0.8;
        }
        if (b.y < RAIL + BR) {
          b.y = RAIL + BR;
          b.vy = Math.abs(b.vy) * 0.8;
        } else if (b.y > H - RAIL - BR) {
          b.y = H - RAIL - BR;
          b.vy = -Math.abs(b.vy) * 0.8;
        }
      }
      // Ball against ball (same weight: swap the speed along the line between them).
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i];
          const b = bs[j];
          if (a.in || b.in) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d === 0 || d >= BR * 2) continue;
          const nx = dx / d;
          const ny = dy / d;
          const overlap = BR * 2 - d;
          a.x -= (nx * overlap) / 2;
          a.y -= (ny * overlap) / 2;
          b.x += (nx * overlap) / 2;
          b.y += (ny * overlap) / 2;
          const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (rel > 0) {
            a.vx -= rel * nx * 0.97;
            a.vy -= rel * ny * 0.97;
            b.vx += rel * nx * 0.97;
            b.vy += rel * ny * 0.97;
          }
        }
      }
    }
    for (const b of bs) if (!b.in && (b.vx || b.vy)) anyMoving = true;
    if (moving.current && !anyMoving) {
      moving.current = false;
      // Everything stopped: put the white back if it went in, and see if the game is over.
      const cue = bs[0];
      if (cue.in) {
        cue.in = false;
        cue.x = CUE_START.x;
        cue.y = CUE_START.y;
        state.current.shots += 1;
        setShots(state.current.shots);
      }
      const left = bs.filter((b) => !b.cue && !b.in).length;
      if (left === 0 || state.current.shots >= SHOTS) setOver(true);
    }
    draw();
  });

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (moving.current || over) return;
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
    if (!d || moving.current || over) return;
    const dx = d.sx - d.x;
    const dy = d.sy - d.y;
    const len = Math.hypot(dx, dy);
    if (len < 12) return;
    const pull = Math.min(MAX_PULL, len);
    const speed = 120 + (pull / MAX_PULL) * 900;
    const cue = balls.current[0];
    cue.vx = (dx / len) * speed;
    cue.vy = (dy / len) * speed;
    moving.current = true;
    state.current.shots += 1;
    setShots(state.current.shots);
    setNote(null);
    playSfx("toy");
  }

  const finished = useRef(false);
  useEffect(() => {
    if (!over || finished.current) return;
    finished.current = true;
    board.post(state.current.potted);
    void reward.finish(state.current.potted);
  }, [over, board, reward]);

  function again() {
    finished.current = false;
    balls.current = rack();
    state.current = { shots: 0, potted: 0 };
    setShots(0);
    setPotted(0);
    setOver(false);
    setNote(null);
    reward.reset();
  }

  return (
    <div className="space-y-3">
      <GameHeader icon={CircleDot} title="Trick-shot pool" sub={props.label} onClose={props.onClose} color="#0f6b47" />
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>Shots {Math.min(shots, SHOTS)}/{SHOTS}</span>
        <span>{potted}/6 potted</span>
      </div>
      <div className="relative mx-auto max-w-[300px] overflow-hidden rounded-2xl">
        <canvas
          ref={canvas}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => (drag.current = null)}
          className="block w-full touch-none select-none"
          style={{ aspectRatio: `${W} / ${H}` }}
          aria-label="Pool table: pull back and let go to shoot the white ball"
        />
        {note && (
          <span key={`${note}${shots}${potted}`} className="act-pop pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-ink/80 px-3 py-1 text-sm font-bold text-white">
            {note}
          </span>
        )}
        {over && potted >= 4 && <Confetti />}
      </div>
      {over ? (
        <div className="act-rise space-y-2 text-center">
          <p className="font-display text-2xl font-bold">{potted === 6 ? "Cleared the table!" : `${potted} potted`}</p>
          <RewardNote claim={reward.claim} />
          <BigButton onClick={again}>
            <RotateCcw className="size-4" /> Rack them up again
          </BigButton>
        </div>
      ) : (
        <p className="text-center text-xs text-muted">Drag back from anywhere on the table to aim, and let go to shoot. Further back = harder.</p>
      )}
      <RewardHint game="pool" />
      <Leaderboard entries={board.entries} meId={props.me?.id} unit="balls" />
    </div>
  );
}
