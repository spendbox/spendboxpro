"use client";

import { useEffect, useRef, useState } from "react";
import { Bomb, Gamepad2, Ghost, Play, RotateCcw, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { playSfx } from "../sound";
import { BigButton, Confetti, GameHeader, Leaderboard, RewardHint, RewardNote, useGameReward, useScoreBoard, type GameProps, nowMs, rand } from "./ui";

// Arcade "Reflex": ghosts pop up on the pads; tap them before they vanish. Don't tap the
// bombs! 30 seconds, and it gets faster as you go.

const SECONDS = 30;
const PADS = 16;

type Pad = { kind: "ghost" | "bomb" | "gold"; until: number; id: number } | null;

export function Reflex(props: GameProps) {
  const [pads, setPads] = useState<Pad[]>(() => Array(PADS).fill(null));
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [left, setLeft] = useState(SECONDS);
  const [over, setOver] = useState(false);
  const [pops, setPops] = useState<{ pad: number; text: string; id: number }[]>([]);
  const board = useScoreBoard(props, "reflex");
  const reward = useGameReward("reflex", !!props.me);
  const nextId = useRef(1);
  const scoreRef = useRef(0);

  // Spawn and expire targets while the game runs.
  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => {
      const now = nowMs();
      const elapsed = 1 - (endsAt - now) / (SECONDS * 1000);
      setLeft(Math.max(0, Math.ceil((endsAt - now) / 1000)));
      if (now >= endsAt) {
        window.clearInterval(id);
        setPads(Array(PADS).fill(null));
        setEndsAt(null);
        setOver(true);
        return;
      }
      setPads((ps) => {
        const next = ps.map((p) => (p && p.until > now ? p : null));
        const life = 1100 - elapsed * 550;
        const chance = 0.18 + elapsed * 0.22;
        if (rand() < chance) {
          const free = next.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
          if (free.length) {
            const i = free[Math.floor(rand() * free.length)];
            const r = rand();
            next[i] = { kind: r < 0.16 + elapsed * 0.1 ? "bomb" : r > 0.95 ? "gold" : "ghost", until: now + life, id: nextId.current++ };
          }
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const finished = useRef(false);
  useEffect(() => {
    if (!over || finished.current) return;
    finished.current = true;
    const final = Math.min(90, scoreRef.current);
    board.post(final);
    void reward.finish(final);
  }, [over, board, reward]);

  function start() {
    finished.current = false;
    scoreRef.current = 0;
    setScore(0);
    setCombo(0);
    setOver(false);
    setPops([]);
    reward.reset();
    setLeft(SECONDS);
    setEndsAt(nowMs() + SECONDS * 1000);
  }

  function tap(i: number) {
    const p = pads[i];
    if (!endsAt || !p) return;
    const pop = (text: string) => {
      const id = nextId.current++;
      setPops((ps) => [...ps.slice(-6), { pad: i, text, id }]);
    };
    setPads((ps) => ps.map((x, j) => (j === i ? null : x)));
    if (p.kind === "bomb") {
      scoreRef.current = Math.max(0, scoreRef.current - 3);
      setCombo(0);
      pop("-3");
      playSfx("explode");
    } else {
      const add = p.kind === "gold" ? 3 : 1;
      scoreRef.current += add;
      setCombo((c) => c + 1);
      pop(`+${add}`);
      playSfx(p.kind === "gold" ? "found" : "pop");
    }
    setScore(scoreRef.current);
  }

  return (
    <div className="space-y-3">
      <GameHeader icon={Gamepad2} title="Reflex" sub={props.label} onClose={props.onClose} color="#2f6fd1" />
      <div className="flex items-center justify-between text-sm font-semibold">
        <span className="tabular-nums">{endsAt ? `${left}s left` : over ? "Time!" : `${SECONDS} seconds`}</span>
        <span className="flex items-center gap-1 tabular-nums">
          {combo >= 5 && (
            <span className="act-pop rounded-full bg-gold/40 px-2 py-0.5 text-xs" key={Math.floor(combo / 5)}>
              <Zap className="mr-0.5 inline size-3" />x{combo}
            </span>
          )}
          {score} hits
        </span>
      </div>
      <div className="relative grid grid-cols-4 gap-2 rounded-3xl bg-[#18202b] p-3">
        {pads.map((p, i) => (
          <button
            key={i}
            onPointerDown={() => tap(i)}
            className={cn(
              "relative grid aspect-square touch-none place-items-center rounded-2xl transition-colors",
              p?.kind === "bomb" ? "bg-[#e5484d]/80" : p?.kind === "gold" ? "bg-gold" : p ? "bg-[#7048e8]" : "bg-white/10",
            )}
            aria-label={p ? (p.kind === "bomb" ? "Bomb, don't tap" : "Ghost, tap it") : "Empty pad"}
          >
            {p && (
              <span key={p.id} className="act-pop text-white">
                {p.kind === "bomb" ? <Bomb className="size-7" /> : <Ghost className={cn("size-7", p.kind === "gold" && "text-ink")} />}
              </span>
            )}
            {pops
              .filter((x) => x.pad === i)
              .map((x) => (
                <span
                  key={x.id}
                  className="pointer-events-none absolute font-bold text-white"
                  style={{ animation: "act-float-up .7s ease-out both" }}
                >
                  {x.text}
                </span>
              ))}
          </button>
        ))}
        {over && score >= 30 && <Confetti />}
      </div>
      {!endsAt && (
        <div className="space-y-2 text-center">
          {over && <p className="act-rise font-display text-2xl font-bold">{score} hits!</p>}
          <RewardNote claim={reward.claim} />
          <BigButton tone="green" onClick={start}>
            {over ? <RotateCcw className="size-4" /> : <Play className="size-4" />} {over ? "Play again" : "Start"}
          </BigButton>
          {!over && <p className="text-xs text-muted">Tap the ghosts. Gold ones are worth 3. Bombs take 3 away!</p>}
        </div>
      )}
      <RewardHint game="reflex" />
      <Leaderboard entries={board.entries} meId={props.me?.id} unit="hits" />
    </div>
  );
}
