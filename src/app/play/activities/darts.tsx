"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, RotateCcw } from "lucide-react";
import { playSfx } from "../sound";
import { BigButton, Confetti, GameHeader, Leaderboard, RewardHint, RewardNote, useAnimationFrame, useGameReward, useScoreBoard, type GameProps, rand } from "./ui";

// Darts: the aim drifts around the board; tap to throw when it's over something good.
// A real board: doubles and trebles, 25 for the outer bull, 50 for the bullseye. 6 darts, and
// the aim speeds up with every throw.

const W = 320;
const H = 340;
const CX = 160;
const CY = 170;
const R = 140;
const DARTS = 6;
const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

type Hit = { x: number; y: number; score: number; label: string };

function scoreAt(x: number, y: number): { score: number; label: string } {
  const dx = x - CX;
  const dy = y - CY;
  const d = Math.hypot(dx, dy) / R;
  if (d <= 0.037) return { score: 50, label: "BULLSEYE" };
  if (d <= 0.094) return { score: 25, label: "Outer bull" };
  if (d > 1) return { score: 0, label: "Off the board" };
  const angle = (Math.atan2(dx, -dy) + Math.PI * 2 + Math.PI / 20) % (Math.PI * 2);
  const n = ORDER[Math.floor(angle / (Math.PI / 10))];
  if (d >= 0.953) return { score: n * 2, label: `Double ${n}` };
  if (d >= 0.582 && d <= 0.629) return { score: n * 3, label: `Treble ${n}` };
  return { score: n, label: String(n) };
}

function drawBoard(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#1b1b1b";
  ctx.beginPath();
  ctx.arc(CX, CY, R * 1.16, 0, Math.PI * 2);
  ctx.fill();
  const ring = (r0: number, r1: number, colors: [string, string]) => {
    for (let i = 0; i < 20; i++) {
      const a0 = -Math.PI / 2 - Math.PI / 20 + (i * Math.PI) / 10;
      ctx.beginPath();
      ctx.arc(CX, CY, R * r1, a0, a0 + Math.PI / 10);
      ctx.arc(CX, CY, R * r0, a0 + Math.PI / 10, a0, true);
      ctx.closePath();
      ctx.fillStyle = colors[i % 2];
      ctx.fill();
    }
  };
  ring(0.094, 0.582, ["#1d1d1d", "#f3e5c0"]);
  ring(0.582, 0.629, ["#e5484d", "#12a37a"]);
  ring(0.629, 0.953, ["#1d1d1d", "#f3e5c0"]);
  ring(0.953, 1, ["#e5484d", "#12a37a"]);
  ctx.beginPath();
  ctx.arc(CX, CY, R * 0.094, 0, Math.PI * 2);
  ctx.fillStyle = "#12a37a";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(CX, CY, R * 0.037, 0, Math.PI * 2);
  ctx.fillStyle = "#e5484d";
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ORDER.forEach((n, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 10;
    ctx.fillText(String(n), CX + Math.cos(a) * R * 1.08, CY + Math.sin(a) * R * 1.08);
  });
}

export function Darts(props: GameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const aim = useRef({ x: CX, y: CY, phase: rand() * 10 });
  const hitsRef = useRef(hits);
  const board = useScoreBoard(props, "darts");
  const reward = useGameReward("darts", !!props.me);
  const done = hits.length >= DARTS;
  const total = hits.reduce((s, h) => s + h.score, 0);
  useEffect(() => {
    hitsRef.current = hits;
  });

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr;
    cv.height = H * dpr;
  }, []);

  useAnimationFrame((dt) => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = cv.width / W;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#2b2f36";
    ctx.fillRect(0, 0, W, H);
    drawBoard(ctx);
    for (const h of hitsRef.current) {
      ctx.fillStyle = "#ffc53d";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // The aim drifts in loops, faster with every dart.
    const a = aim.current;
    const speed = 1 + hitsRef.current.length * 0.22;
    a.phase += dt * speed;
    const amp = 70 + hitsRef.current.length * 6;
    a.x = CX + Math.sin(a.phase * 1.7) * amp * 0.9 + Math.sin(a.phase * 4.1) * 8;
    a.y = CY + Math.sin(a.phase * 1.13 + 1) * amp + Math.cos(a.phase * 3.3) * 8;
    if (hitsRef.current.length < DARTS) {
      ctx.strokeStyle = "rgba(255,255,255,.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 8, 0, Math.PI * 2);
      ctx.moveTo(a.x - 15, a.y);
      ctx.lineTo(a.x - 5, a.y);
      ctx.moveTo(a.x + 5, a.y);
      ctx.lineTo(a.x + 15, a.y);
      ctx.moveTo(a.x, a.y - 15);
      ctx.lineTo(a.x, a.y - 5);
      ctx.moveTo(a.x, a.y + 5);
      ctx.lineTo(a.x, a.y + 15);
      ctx.stroke();
    }
  });

  function toss() {
    if (done) return;
    const a = aim.current;
    const x = a.x + (rand() - 0.5) * 6;
    const y = a.y + (rand() - 0.5) * 6;
    const s = scoreAt(x, y);
    setHits((h) => [...h, { x, y, ...s }]);
    setFlash(`${s.label}${s.score > 0 && !/^\d+$/.test(s.label) ? ` · ${s.score}` : ""}`);
    playSfx(s.score >= 40 ? "found" : s.score > 0 ? "pop" : "miss");
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
    setHits([]);
    setFlash(null);
    reward.reset();
  }

  return (
    <div className="space-y-3">
      <GameHeader icon={Crosshair} title="Darts" sub={props.label} onClose={props.onClose} color="#12a37a" />
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>
          Dart {Math.min(hits.length + 1, DARTS)}/{DARTS}
        </span>
        <span className="tabular-nums">{total} pts</span>
      </div>
      <div className="relative overflow-hidden rounded-2xl">
        <canvas
          ref={canvas}
          onPointerDown={toss}
          className="block w-full touch-none select-none"
          style={{ aspectRatio: `${W} / ${H}` }}
          aria-label="Dartboard: tap to throw"
        />
        {flash && (
          <span key={hits.length} className="act-pop pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-sm font-bold text-ink">
            {flash}
          </span>
        )}
        {done && total >= 200 && <Confetti />}
      </div>
      {!done ? (
        <BigButton tone="green" onClick={toss}>
          <Crosshair className="size-5" /> Throw!
        </BigButton>
      ) : (
        <div className="act-rise space-y-2 text-center">
          <p className="font-display text-2xl font-bold">{total} points</p>
          <p className="text-sm text-muted">{hits.map((h) => h.score).join(" + ")}</p>
          <RewardNote claim={reward.claim} />
          <BigButton onClick={again}>
            <RotateCcw className="size-4" /> Play again
          </BigButton>
        </div>
      )}
      <RewardHint game="darts" />
      <Leaderboard entries={board.entries} meId={props.me?.id} unit="pts" />
    </div>
  );
}
