"use client";

import { useEffect, useState } from "react";
import { Crown, Ghost, Swords, Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import type { DuelBoard } from "@/lib/ghost-duels";
import { Dots } from "./parts";

// The game in one strip at the bottom: joining as a ghost (first few minutes), and once the
// hunt is on, how you're doing (ghosts: wins, losses, stake; hunters: wins towards the pool and
// the breather between duels), with a button to list the ghosts.

export function DuelStatus({
  board,
  countdown,
  busy,
  onBeGhost,
  onGhosts,
}: {
  board: DuelBoard;
  /** Time left in this part of the game (join window, or the hunt). */
  countdown: string;
  busy: boolean;
  onBeGhost: () => void;
  onGhosts: () => void;
}) {
  const { me, rules, phase } = board;
  const [coolLeft, setCoolLeft] = useState(0);
  const coolUntil = me.cooldownUntil;
  useEffect(() => {
    if (!coolUntil) return;
    const tick = () => setCoolLeft(Math.max(0, Math.ceil((Date.parse(coolUntil) - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [coolUntil]);
  const ghostsButton = (
    <button onClick={onGhosts} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-ink px-2.5 py-1.5 text-xs font-semibold text-white sm:px-3 sm:py-2 sm:text-sm">
      <Ghost className="size-3.5 sm:size-4" />
      Ghosts · {board.ghosts.length}
    </button>
  );

  if (phase === "join") {
    return me.role === "ghost" ? (
      <p className="flex items-center gap-2 text-xs sm:text-sm">
        <Ghost className="size-4 shrink-0 sm:size-5" />
        <span>
          <b>You&apos;re a ghost.</b> <span className="text-muted">The hunt starts in {countdown}. Then your light shows on the map and hunters can challenge you.</span>
        </span>
      </p>
    ) : (
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs sm:text-sm">
          <b>Be a ghost this game?</b>{" "}
          <span className="text-muted">
            Joining closes in <b className="tabular-nums text-ink">{countdown}</b>.<span className="hidden sm:inline"> Everyone else is a hunter.</span>
          </span>
        </p>
        <button onClick={onBeGhost} disabled={busy} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-ink px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50 sm:px-3 sm:py-2 sm:text-sm">
          <Ghost className="size-3.5 sm:size-4" />
          Ghost · {short(rules.stake)}
        </button>
      </div>
    );
  }
  if (phase !== "seek") return <p className="text-xs text-muted sm:text-sm">Building the next town…</p>;

  if (me.role === "ghost") {
    return (
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs sm:text-sm">
          {me.out ? (
            <>
              <b>You&apos;re out of this game.</b> <span className="text-muted">The next one starts on the hour.<span className="hidden sm:inline"> Explore and chat till then.</span></span>
            </>
          ) : me.golden ? (
            <span className="flex items-center gap-1.5">
              <Crown className="size-4 shrink-0 text-[#e8a800] sm:size-5" />
              <span>
                <b>You&apos;re golden!</b> <span className="text-muted">Safe, and in the prize pool.</span>
              </span>
            </span>
          ) : (
            <>
              <b>You&apos;re a ghost.</b> <span className="text-muted">₥{short(me.stake)} staked.</span>{" "}
              <span className="hidden text-muted sm:inline">Everyone can see your light.</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <Dots n={me.wins} max={rules.goldenWins} tone="win" />
                <span className="text-[11px] text-muted sm:text-xs">wins</span>
                <Dots n={me.losses} max={rules.outLosses} tone="loss" />
                <span className="text-[11px] text-muted sm:text-xs">losses</span>
              </span>
            </>
          )}
        </p>
        {ghostsButton}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <p className="min-w-0 flex-1 text-xs sm:text-sm">
        <span className="flex items-center gap-1.5">
          <Swords className="size-3.5 shrink-0 sm:size-4" />
          <b className="sm:hidden">Tap a ghost to duel them</b>
          <b className="hidden sm:inline">Tap a ghost&apos;s light to challenge them</b>
        </span>
        <span className="text-[11px] text-muted sm:text-xs">
          ₥{short(rules.fee)} a duel ·{" "}
          {me.inPool ? (
            <b className="text-[#2b8a3e]">You&apos;re in the prize pool!</b>
          ) : (
            <>
              wins <b className="text-ink">{me.wins}</b>/{rules.poolWins} to enter the pool
            </>
          )}
        </span>
        {coolLeft > 0 && (
          <span className={cn("mt-0.5 flex items-center gap-1 text-xs font-semibold text-gold-dark")}>
            <Timer className="size-3.5" />
            Next challenge in {coolLeft}s
          </span>
        )}
      </p>
      {ghostsButton}
    </div>
  );
}
