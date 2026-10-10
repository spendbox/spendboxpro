"use client";

import { useEffect, useRef, useState } from "react";
import { AvatarFace } from "@/components/avatar";
import { Coins, Crown, Medal, Trophy, X } from "@/components/icons";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { claimActivityReward, type RewardGame } from "../activity-actions";
import type { RoomMember } from "../rooms";
import { REWARDS } from "./games";
import { useActivityRoom, type ActivityMsg, type ActivityPlayer } from "./hub";
import { questEvent } from "./quest-store";

// Bits shared by the mini games: animations, the header, live leaderboards, coin rewards and
// picking a player.

/** Everything a mini game gets from the activity sheet. */
export type GameProps = {
  roundId: number | null;
  roomId: string;
  me: ActivityPlayer | null;
  members: RoomMember[];
  /** Name of the thing tapped ("Darts board", "Club bar"…). */
  label: string;
  onClose: () => void;
};

/** Animations used by the mini games (one copy on the page, however many games are open). */
export function ActivityStyles() {
  return (
    <style href="hs-activities" precedence="default">{`
@keyframes act-pop { 0% { transform: scale(.6); opacity: 0 } 60% { transform: scale(1.08); opacity: 1 } 100% { transform: scale(1) } }
@keyframes act-rise { 0% { transform: translateY(8px); opacity: 0 } 100% { transform: none; opacity: 1 } }
@keyframes act-float-up { 0% { transform: translateY(0) scale(1); opacity: 1 } 100% { transform: translateY(-60px) scale(1.2); opacity: 0 } }
@keyframes act-pulse { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.06) } }
@keyframes act-glow { 0%, 100% { box-shadow: 0 0 0 0 rgb(255 197 61 / .7) } 50% { box-shadow: 0 0 0 8px rgb(255 197 61 / 0) } }
@keyframes act-shake { 0%, 100% { transform: translateX(0) } 25% { transform: translateX(-6px) } 75% { transform: translateX(6px) } }
@keyframes act-spin { to { transform: rotate(360deg) } }
@keyframes act-bounce { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
@keyframes act-note { 0% { transform: translateY(0) rotate(0); opacity: 0 } 15% { opacity: 1 } 100% { transform: translateY(-70px) rotate(20deg); opacity: 0 } }
@keyframes act-cash {
  0% { transform: translate3d(0, -15vh, 0) rotate(var(--r0)); opacity: 0 }
  10% { opacity: 1 }
  100% { transform: translate3d(var(--dx), 110vh, 0) rotate(var(--r1)); opacity: .9 }
}
@keyframes act-reel { from { transform: translateY(0) } to { transform: translateY(-50%) } }
@keyframes act-confetti { 0% { transform: translate3d(0,0,0) rotate(0); opacity: 1 } 100% { transform: translate3d(var(--dx), 260px, 0) rotate(540deg); opacity: 0 } }
.act-pop { animation: act-pop .35s cubic-bezier(.2,.9,.3,1.3) both }
.act-rise { animation: act-rise .3s ease-out both }
.act-pulse { animation: act-pulse 1s ease-in-out infinite }
.act-glow { animation: act-glow 1.6s ease-out infinite }
.act-shake { animation: act-shake .25s ease-in-out 2 }
.act-bounce { animation: act-bounce .6s ease-in-out infinite }
@media (prefers-reduced-motion: reduce) {
  .act-pop, .act-rise, .act-pulse, .act-glow, .act-shake, .act-bounce { animation: none }
}
`}</style>
  );
}

/** A player's face (works with any saved avatar, or makes one up from their id). */
export function Face({ p, size = 32, className }: { p: { id: string; avatar: unknown }; size?: number; className?: string }) {
  return <AvatarFace avatar={cleanAvatar(p.avatar, p.id)} size={size} className={cn("shrink-0 rounded-full", className)} />;
}

export function GameHeader({
  icon: Icon,
  title,
  sub,
  onClose,
  color = "#7048e8",
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  sub?: string;
  onClose: () => void;
  color?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-white shadow-sm" style={{ background: color }}>
        <Icon className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-display text-xl font-bold leading-tight">{title}</h2>
        {sub && <p className="truncate text-sm text-muted">{sub}</p>}
      </div>
      <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close">
        <X className="size-5" />
      </button>
    </div>
  );
}

/** A big friendly button. */
export function BigButton({
  children,
  onClick,
  disabled,
  tone = "ink",
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "ink" | "gold" | "green" | "soft";
  className?: string;
}) {
  const tones = {
    ink: "bg-ink text-white",
    gold: "bg-gold text-ink",
    green: "bg-me text-white",
    soft: "bg-panel-2 text-ink",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold transition active:scale-[.98] disabled:opacity-50",
        tones[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- live leaderboards

type Board = Map<string, { p: ActivityPlayer; score: number }>;
/** Best scores heard per place and game (kept while the page is open). */
const boards = new Map<string, Board>();

/**
 * A live leaderboard for one game in this place: everyone's best score since they opened it.
 * post(score) shares yours. Lower is better when `lowerWins`.
 */
export function useScoreBoard(props: GameProps, game: string, lowerWins = false) {
  const key = `${props.roundId}:${props.roomId}:${game}`;
  const [, setTick] = useState(0);
  const better = (a: number, b: number) => (lowerWins ? a < b : a > b);
  const betterRef = useRef(better);
  useEffect(() => {
    betterRef.current = better;
  });
  const board = () => {
    let b = boards.get(key);
    if (!b) boards.set(key, (b = new Map()));
    return b;
  };
  const room = useActivityRoom(props.roundId, props.roomId, props.me, {
    onMessage: (m: ActivityMsg) => {
      if (m.t === "score" && m.game === game && typeof m.score === "number" && Number.isFinite(m.score)) {
        const b = board();
        const old = b.get(m.p?.id);
        if (m.p?.id && (!old || betterRef.current(m.score, old.score))) {
          b.set(m.p.id, { p: { id: m.p.id, name: String(m.p.name).slice(0, 40), avatar: m.p.avatar }, score: m.score });
          setTick((t) => t + 1);
        }
      }
      if (m.t === "hello" && m.game === game && props.me && m.from !== props.me.id) {
        const mine = board().get(props.me.id);
        if (mine) window.setTimeout(() => sendRef.current({ t: "score", game, p: mine.p, score: mine.score }), 200 + Math.random() * 900);
      }
    },
  });
  const sendRef = useRef(room.send);
  useEffect(() => {
    sendRef.current = room.send;
  });
  const meId = props.me?.id;
  useEffect(() => {
    if (meId) sendRef.current({ t: "hello", game, from: meId });
  }, [game, meId, key]);

  const entries = [...board().values()].sort((a, b) => (lowerWins ? a.score - b.score : b.score - a.score));
  return {
    entries,
    post: (score: number) => {
      if (props.me) room.send({ t: "score", game, p: props.me, score });
    },
    send: room.send,
  };
}

export function Leaderboard({
  entries,
  meId,
  unit,
  empty = "No scores yet. Be the first!",
}: {
  entries: { p: ActivityPlayer; score: number }[];
  meId?: string | null;
  unit?: string;
  empty?: string;
}) {
  return (
    <div className="rounded-2xl bg-panel-2 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Trophy className="size-3.5" /> Best in this room
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ol className="space-y-1.5">
          {entries.slice(0, 6).map((e, i) => (
            <li key={e.p.id} className={cn("flex items-center gap-2 rounded-xl px-2 py-1 text-sm", e.p.id === meId && "bg-gold/25")}>
              <span className="w-5 text-center font-bold text-muted">
                {i === 0 ? <Crown className="mx-auto size-4 text-gold-dark" /> : i === 1 ? <Medal className="mx-auto size-4 text-[#8b95a1]" /> : i + 1}
              </span>
              <Face p={e.p} size={24} />
              <span className="min-w-0 flex-1 truncate font-medium">{e.p.id === meId ? "You" : e.p.name}</span>
              <span className="font-bold tabular-nums">
                {e.score.toLocaleString("en")}
                {unit ? <span className="ml-1 text-xs font-normal text-muted">{unit}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- coin rewards

type Claim = { state: "idle" | "claiming" | "done"; coins: number; text: string };

/**
 * After a game: tells the quest tracker, and claims coins for a good score (the server decides
 * how many, with a daily limit). Call finish(score, won?) once per game.
 */
export function useGameReward(game: RewardGame | "piano" | "jukebox" | "slots" | "photo", signedIn: boolean) {
  const [claim, setClaim] = useState<Claim>({ state: "idle", coins: 0, text: "" });
  const reward = game in REWARDS ? REWARDS[game as RewardGame] : null;
  async function finish(score: number, won?: boolean) {
    questEvent({ type: "play", game, score, won });
    if (!reward) return;
    if (!signedIn) return setClaim({ state: "done", coins: 0, text: "Sign in to win mint." });
    if (score < reward.min) {
      return setClaim({ state: "done", coins: 0, text: reward.unit === "win" ? "" : `Get ${reward.min}+ ${reward.unit} to win mint.` });
    }
    setClaim({ state: "claiming", coins: 0, text: "Collecting your mint…" });
    const res = await claimActivityReward(game as RewardGame, score);
    if (!res.ok) return setClaim({ state: "done", coins: 0, text: res.error });
    if (res.coins > 0) {
      return setClaim({
        state: "done",
        coins: res.coins,
        text: `+₥${res.coins}!${res.leftToday === 0 ? " That's all the game mint for today." : ""}`,
      });
    }
    setClaim({
      state: "done",
      coins: 0,
      text:
        res.reason === "daily_limit"
          ? "You've won all the game mint for today. Playing is still fun!"
          : res.reason === "too_soon"
            ? "Nice! Mint pays out once a minute per game, so this one's just for glory."
            : `Get ${reward.min}+ ${reward.unit} to win mint.`,
    });
  }
  return { claim, finish, reset: () => setClaim({ state: "idle", coins: 0, text: "" }), reward };
}

export function RewardNote({ claim }: { claim: Claim }) {
  if (claim.state === "idle" || !claim.text) return null;
  return (
    <p
      className={cn(
        "act-pop flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-center text-sm font-semibold",
        claim.coins > 0 ? "bg-gold/30 text-ink" : "bg-panel-2 text-muted",
      )}
    >
      {claim.coins > 0 && <Coins className="size-4 text-gold-dark" />}
      {claim.text}
    </p>
  );
}

/** "Score 30+ points to win 2–8 coins". */
export function RewardHint({ game }: { game: RewardGame }) {
  const r = REWARDS[game];
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted">
      <Coins className="size-3.5 text-gold-dark" />
      {r.unit === "win"
        ? `Win to earn ₥${r.coinsMax} (5 rewarded games a day).`
        : `Score ${r.min}+ ${r.unit} to win ₥${r.coinsMin}–${r.coinsMax} (5 rewarded games a day).`}
    </p>
  );
}

// ---------------------------------------------------------------- picking people

export function PlayerList({
  players,
  onPick,
  action,
  empty,
  disabled,
}: {
  players: ActivityPlayer[];
  onPick: (p: ActivityPlayer) => void;
  action: string;
  empty: string;
  disabled?: (p: ActivityPlayer) => string | null;
}) {
  if (!players.length) return <p className="rounded-2xl bg-panel-2 p-3 text-sm text-muted">{empty}</p>;
  return (
    <ul className="max-h-60 space-y-1.5 overflow-y-auto">
      {players.map((p) => {
        const why = disabled?.(p) ?? null;
        return (
          <li key={p.id}>
            <button
              onClick={() => onPick(p)}
              disabled={!!why}
              className="flex w-full items-center gap-3 rounded-2xl bg-panel-2 px-3 py-2 text-left hover:bg-gold/20 disabled:opacity-50"
            >
              <Face p={p} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}</span>
                {why && <span className="block truncate text-xs text-muted">{why}</span>}
              </span>
              {!why && <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">{action}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Seconds left until `endsAt` (ms), ticking 4 times a second while it runs. */
export function useSecondsLeft(endsAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);
  return endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
}

/** Pointer position inside an element, in its own drawing units (for canvases scaled by CSS). */
export function localPoint(e: { clientX: number; clientY: number }, el: HTMLElement, w: number, h: number) {
  const r = el.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
}

/** A canvas drawing loop that stops when the component goes away. */
export function useAnimationFrame(cb: (dt: number, t: number) => void, running = true) {
  const cbRef = useRef(cb);
  useEffect(() => {
    cbRef.current = cb;
  });
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      cbRef.current(dt, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}

/** A little burst of confetti (DOM, no canvas), for wins. */
export function Confetti({ count = 26 }: { count?: number }) {
  const [bits] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      left: 10 + Math.random() * 80,
      dx: `${(Math.random() - 0.5) * 220}px`,
      delay: Math.random() * 0.25,
      color: ["#ffc53d", "#e5484d", "#12a37a", "#2f6fd1", "#7048e8", "#e64980"][i % 6],
      w: 6 + Math.random() * 6,
    })),
  );
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-0 overflow-visible" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          className="absolute top-0 block rounded-sm"
          style={
            {
              left: `${b.left}%`,
              width: b.w,
              height: b.w * 0.5,
              background: b.color,
              animation: `act-confetti 1.4s ease-out ${b.delay}s both`,
              "--dx": b.dx,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** The time now (ms). For event handlers and timers, never during render. */
export const nowMs = () => Date.now();
/** A random number 0–1. For event handlers and timers, never during render. */
export const rand = () => Math.random();
/** A precise clock (ms) for animations. */
export const perfNow = () => performance.now();
