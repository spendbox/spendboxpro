"use client";

import type { RoundResults } from "@/lib/game";
import { cn } from "@/lib/cn";

const coins = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The scoreboard shown when a round ends: what happened and who won what. */
export function Results({ results: r, meName, onClose }: { results: RoundResults; meName: string | null; onClose: () => void }) {
  const survived = r.hidersTotal - r.caught;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <section
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Round {r.roundId} results</p>
            <h2 className="font-display text-2xl font-extrabold">
              {survived === 0 ? "Everyone was found!" : `${survived} hider${survived === 1 ? "" : "s"} survived`}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-full px-2 text-2xl text-muted" aria-label="Close">
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Big label="Players" value={r.players.toLocaleString()} />
          <Big label="Hiders found" value={`${r.caught.toLocaleString()} / ${r.hidersTotal.toLocaleString()}`} />
          <Big label="Tiles searched" value={`${r.searches.toLocaleString()} / ${r.tileCount.toLocaleString()}`} />
          <Big label="Survivor pool" value={coins(r.pool)} />
        </div>

        <p className="mt-3 rounded-xl bg-panel-2 px-3 py-2 text-sm">
          🤖 Seed Bot:{" "}
          {r.botFoundBy ? (
            <>
              found by <b>{r.botFoundBy}</b> (+200)
            </>
          ) : (
            "nobody found it"
          )}
        </p>

        <h3 className="mb-2 mt-4 font-semibold">Winners</h3>
        {r.winners.length === 0 ? (
          <p className="text-sm text-muted">Nobody won coins this round.</p>
        ) : (
          <ol className="space-y-1.5">
            {r.winners.map((w, i) => (
              <li
                key={`${w.name}-${i}`}
                className={cn("flex items-center gap-3 rounded-xl px-3 py-2", w.name === meName ? "bg-gold/25" : "bg-panel-2")}
              >
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
                      {w.role === "hider" ? "Hider" : "Seeker"}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-muted">{w.detail}</span>
                </span>
                <span className="font-display font-bold tabular-nums">+{coins(w.won)}</span>
              </li>
            ))}
          </ol>
        )}
        <button onClick={onClose} className="mt-5 w-full rounded-xl bg-gold py-3 font-semibold text-ink">
          Into the next city
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
