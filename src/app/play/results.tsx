"use client";

import { useRef, useState } from "react";
import type { RoundResults } from "@/lib/game";
import { BadgeTile } from "@/components/badges";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";

/** Shown when a round ends: how you did, then what happened and who won what. */
export function Results({ results: r, onClose, me, city }: { results: RoundResults; onClose: () => void; me: string; city: string }) {
  const survived = r.hidersTotal - r.caught;
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
              {survived <= 0 ? "Everyone got found!" : `${short(survived)} ghost${survived === 1 ? "" : "s"} made it`}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-full px-2 text-2xl text-muted" aria-label="Close">
            ×
          </button>
        </div>

        {mine && (
          <div className={cn("mt-4 rounded-2xl px-4 py-3", mine.won > 0 ? "bg-gold/30" : "bg-panel-2")}>
            {mine.won > 0 ? (
              <>
                <p className="text-sm text-muted">You won</p>
                <p className="font-display text-3xl font-extrabold">+{short(mine.won)} coins</p>
                <p className="text-sm">
                  {mine.role === "hider" && !mine.caught ? "You stayed hidden the whole way. " : ""}
                  {mine.detail && <span className="text-muted">({mine.detail})</span>}
                </p>
              </>
            ) : (
              <p className="text-sm">
                {mine.role === "hider" && mine.caught
                  ? "You got caught this time, so no winnings. Shake it off and go again."
                  : "No winnings for you this round. The next city's already going up."}
              </p>
            )}
          </div>
        )}

        {mine && mine.badges.length > 0 && (
          <div className="mt-3 rounded-2xl bg-gradient-to-br from-[#18202b] to-[#3b2f6b] p-3 text-white">
            <p className="px-1 text-sm font-semibold">🏅 New badge{mine.badges.length > 1 ? "s" : ""}! Tap one to see it and share it.</p>
            <div className="mt-1 grid grid-cols-3 gap-1 [&_.text-muted]:text-white/70 [&_button:hover]:bg-white/10">
              {mine.badges.map((b) => (
                <BadgeTile key={b.badge} badge={b.badge} player={me} city={city} detail={b.detail} at={endedAt} hint="Tap to open" />
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Big label="Players" value={short(r.players)} />
          <Big label="Hiders caught" value={`${short(r.caught)} / ${short(r.hidersTotal)}`} />
          <Big label="Spots searched" value={`${short(r.searches)} / ${short(r.tileCount)}`} />
          <Big label="Survivor pool" value={short(r.pool)} />
        </div>

        <p className="mt-3 rounded-xl bg-panel-2 px-3 py-2 text-sm">
          🤖 {r.botName}:{" "}
          {r.botFoundBy ? (
            <>
              found by <b>{r.botFoundBy}</b> (+200)
            </>
          ) : (
            "got away with it this time"
          )}
        </p>

        <h3 className="mb-2 mt-4 font-semibold">Top winners</h3>
        {r.winners.length === 0 ? (
          <p className="text-sm text-muted">Nobody won coins this round.</p>
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
                      {w.role === "hider" ? "Hider" : "Hunter"}
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
