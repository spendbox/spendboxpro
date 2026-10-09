"use client";

import { useRef, useState } from "react";
import type { RoundResults } from "@/lib/game";
import { BadgeTile } from "@/components/badges";
import { Medal, X } from "@/components/icons";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { PlayStyleCard } from "./style/style-ui";

/** Shown when a round ends: how you played (your play style), what you won, then what happened and who won what. */
export function Results({
  results: r,
  onClose,
  me,
  city,
  signedIn,
}: {
  results: RoundResults;
  onClose: () => void;
  me: string;
  city: string;
  signedIn: boolean;
}) {
  const mine = r.mine;
  const downOnBackdrop = useRef(false);
  // When these badges were won: the round just ended, so "now" is close enough.
  const [endedAt] = useState(() => new Date().toISOString());
  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm"
      onPointerDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
    >
      <section className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-panel p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Round {r.roundId} is over</p>
            <h2 className="font-display text-2xl font-extrabold">
              {r.golden > 0 ? `${short(r.golden)} ghost${r.golden === 1 ? "" : "s"} turned golden` : r.ghosts > 0 ? "No golden ghosts this time" : "Game over"}
            </h2>
          </div>
          <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2" aria-label="Close">
            <X className="size-6" />
          </button>
        </div>

        <PlayStyleCard roundId={r.roundId} signedIn={signedIn} player={me} city={city} />

        {mine && (
          <div className={cn("mt-3 rounded-2xl px-4 py-3", mine.won > 0 ? "bg-gold/30" : "bg-panel-2")}>
            {mine.won > 0 ? (
              <>
                <p className="text-sm text-muted">You won</p>
                <p className="font-display text-3xl font-extrabold">+{short(mine.won)} mint</p>
                <p className="text-sm">
                  {mine.role === "hider" && !mine.caught ? "You made it to the end as a ghost. " : ""}
                  {mine.detail && <span className="text-muted">({mine.detail})</span>}
                </p>
              </>
            ) : (
              <p className="text-sm">
                {mine.role === "hider" && mine.caught
                  ? "You lost three duels this time, so you were out. Shake it off and go again."
                  : "No winnings for you this round. The next city's already going up."}
              </p>
            )}
          </div>
        )}

        {mine && mine.badges.length > 0 && (
          <div className="mt-3 rounded-2xl bg-gradient-to-br from-[#18202b] to-[#3b2f6b] p-3 text-white">
            <p className="flex items-center gap-1.5 px-1 text-sm font-semibold">
              <Medal className="size-4 shrink-0 text-gold" />
              New badge{mine.badges.length > 1 ? "s" : ""}! Tap one to see it and share it.
            </p>
            <div className="mt-1 grid grid-cols-3 gap-1 [&_.text-muted]:text-white/70 [&_button:hover]:bg-white/10">
              {mine.badges.map((b) => (
                <BadgeTile key={b.badge} badge={b.badge} player={me} city={city} detail={b.detail} at={endedAt} hint="Tap to open" />
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Big label="Players" value={short(r.players)} />
          <Big label="Golden ghosts" value={`${short(r.golden)} / ${short(r.ghosts)}`} />
          <Big label="Ghosts out" value={`${short(r.caught)} / ${short(r.ghosts)}`} />
          <Big label="Prize pool" value={short(r.pool)} />
        </div>


        <h3 className="mb-2 mt-4 font-semibold">Top winners</h3>
        {r.winners.length === 0 ? (
          <p className="text-sm text-muted">Nobody won mint this round.</p>
        ) : (
          <ol className="space-y-1.5">
            {r.winners.map((w, i) => (
              <li key={`${w.name}-${i}`} className="flex items-center gap-3 rounded-xl bg-panel-2 px-3 py-2">
                <span className="w-5 text-center font-display font-bold text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <span className="truncate">{w.name}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-px text-[10px] font-semibold",
                        w.role === "hider" ? "bg-me/15 text-me" : "bg-gold/25 text-gold-dark",
                      )}
                    >
                      {w.role === "hider" ? "Ghost" : "Hunter"}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-muted">{w.detail}</span>
                </span>
                <span className="font-display font-bold tabular-nums">+{short(w.won)}</span>
              </li>
            ))}
          </ol>
        )}
        <button onClick={onClose} className="mt-5 w-full rounded-xl bg-gold py-3 font-semibold text-ink">
          On to the next city
        </button>
      </section>
    </div>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-panel-2 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-display text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
