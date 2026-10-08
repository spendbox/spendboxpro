"use client";

import { useEffect, useRef, useState } from "react";
import { Footprints, Layers, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../sound";
import { BigButton, Confetti, GameHeader, Leaderboard, RewardHint, RewardNote, useGameReward, useScoreBoard, type GameProps, nowMs } from "./ui";

// Stair sprint: tap left, right, left, right as fast as you can for 10 seconds. The same foot
// twice is a stumble (it doesn't count).

const SECONDS = 10;

export function Stairs({ onUseStairs, ...props }: GameProps & { onUseStairs?: () => void }) {
  const [steps, setSteps] = useState(0);
  const [phase, setPhase] = useState<"idle" | "ready" | "go" | "done">("idle");
  const [count, setCount] = useState(3);
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(0);
  const [stumble, setStumble] = useState(0);
  const lastFoot = useRef<0 | 1 | null>(null);
  const stepsRef = useRef(0);
  const board = useScoreBoard(props, "stairs");
  const reward = useGameReward("stairs", !!props.me);
  const onDone = useRef(() => {});
  useEffect(() => {
    onDone.current = () => {
      const final = Math.min(160, stepsRef.current);
      board.post(final);
      void reward.finish(final);
    };
  });

  useEffect(() => {
    if (phase === "ready") {
      if (count === 0) {
        const id = window.setTimeout(() => {
          setPhase("go");
          setEndsAt(nowMs() + SECONDS * 1000);
          setNow(nowMs());
        }, 0);
        return () => window.clearTimeout(id);
      }
      const id = window.setTimeout(() => {
        setCount((c) => c - 1);
        playSfx("tick");
      }, 700);
      return () => window.clearTimeout(id);
    }
    if (phase === "go") {
      const id = window.setInterval(() => {
        setNow(nowMs());
        if (nowMs() >= endsAt) {
          window.clearInterval(id);
          setPhase("done");
          onDone.current();
        }
      }, 100);
      return () => window.clearInterval(id);
    }
  }, [phase, count, endsAt]);

  function start() {
    stepsRef.current = 0;
    lastFoot.current = null;
    setSteps(0);
    setStumble(0);
    setCount(3);
    reward.reset();
    setPhase("ready");
  }

  function foot(f: 0 | 1) {
    if (phase !== "go") return;
    if (lastFoot.current === f) {
      setStumble((s) => s + 1);
      return;
    }
    lastFoot.current = f;
    stepsRef.current += 1;
    setSteps(stepsRef.current);
  }

  const left = phase === "go" ? Math.max(0, (endsAt - now) / 1000) : SECONDS;
  const climb = Math.min(100, (steps / 90) * 100);

  return (
    <div className="space-y-3">
      <GameHeader icon={Footprints} title="Stair sprint" sub={props.label} onClose={props.onClose} color="#2b8a3e" />
      <div className="relative h-40 overflow-hidden rounded-3xl bg-gradient-to-b from-[#d3f9d8] to-[#8ce99a]">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="absolute h-3 rounded bg-white/70" style={{ left: `${i * 10}%`, bottom: `${i * 9 + 6}%`, width: "10%" }} />
        ))}
        <span className="absolute transition-all duration-100" style={{ left: `calc(${climb * 0.9}% )`, bottom: `${climb * 0.85 + 10}%` }}>
          <Footprints className={cn("size-8 text-ink", phase === "go" && "act-bounce")} />
        </span>
        <div className="absolute inset-0 grid place-items-center">
          {phase === "ready" && <span key={count} className="act-pop font-display text-6xl font-bold text-ink">{count || "Go!"}</span>}
          {phase === "done" && (
            <span className="act-pop text-center">
              {steps >= 70 && <Confetti />}
              <span className="block font-display text-4xl font-bold">{steps} steps</span>
              {stumble > 0 && <span className="text-sm text-muted">{stumble} stumbles</span>}
            </span>
          )}
        </div>
        <span className="absolute right-3 top-2 font-semibold tabular-nums">{left.toFixed(1)}s</span>
      </div>
      {phase === "go" ? (
        <div className="grid grid-cols-2 gap-3">
          {([0, 1] as const).map((f) => (
            <button
              key={f}
              onPointerDown={(e) => {
                e.preventDefault();
                foot(f);
              }}
              className={cn("grid h-28 touch-none place-items-center rounded-3xl text-white shadow active:scale-95", f === 0 ? "bg-[#2f6fd1]" : "bg-[#e64980]")}
              aria-label={f === 0 ? "Left foot" : "Right foot"}
            >
              <Footprints className={cn("size-10", f === 0 && "-scale-x-100")} />
              <span className="font-semibold">{f === 0 ? "Left" : "Right"}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <RewardNote claim={reward.claim} />
          <BigButton tone="green" onClick={start} disabled={phase === "ready"}>
            {phase === "done" ? <RotateCcw className="size-4" /> : <Play className="size-4" />} {phase === "done" ? "Race again" : "Start the sprint"}
          </BigButton>
          {onUseStairs && (
            <BigButton tone="soft" onClick={onUseStairs}>
              <Layers className="size-4" /> Just take the stairs
            </BigButton>
          )}
        </>
      )}
      <RewardHint game="stairs" />
      <Leaderboard entries={board.entries} meId={props.me?.id} unit="steps" />
    </div>
  );
}
