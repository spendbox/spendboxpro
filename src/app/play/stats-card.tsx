"use client";

import { cn } from "@/lib/cn";
import { short } from "@/lib/format";

/** The round clock and numbers. Folds down to a slim pill. */
export function StatsCard({
  city,
  phase,
  countdown,
  hidden,
  hidersTotal,
  pool,
  tiles,
  online,
  visits,
  players,
  minimised,
  onToggle,
  marks,
  onMarks,
  sound,
  onSound,
}: {
  city: string;
  phase: "join" | "seek" | "done";
  countdown: string;
  hidden: number;
  hidersTotal: number;
  pool: number;
  tiles: number;
  online: number | null;
  visits: number;
  players: number;
  minimised: boolean;
  onToggle: () => void;
  marks: boolean;
  onMarks: () => void;
  sound: boolean;
  onSound: () => void;
}) {
  const label = phase === "join" ? "Hiding" : phase === "seek" ? "Hunting" : "Over";
  if (minimised) {
    return (
      <button onClick={onToggle} className="glass pointer-events-auto flex items-center gap-2 rounded-full px-3 py-1.5 text-sm" aria-label="Show round details">
        <span className="font-display font-bold">{city}</span>
        <span className="font-display font-bold tabular-nums text-gold-dark">{phase === "done" ? label : countdown}</span>
        <span className="flex items-center gap-1 text-xs text-muted">
          <span className="size-1.5 animate-pulse rounded-full bg-me" />
          {online === null ? "…" : short(online)}
        </span>
        <span className="text-muted">▾</span>
      </button>
    );
  }
  return (
    <div className="glass pointer-events-auto w-52 overflow-hidden rounded-3xl">
      <div className="px-4 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="truncate font-display text-base font-extrabold">{city}</h1>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              phase === "seek" ? "bg-hit/15 text-hit" : phase === "join" ? "bg-gold/30 text-gold-dark" : "bg-panel-2 text-muted",
            )}
          >
            {label}
          </span>
        </div>
        {phase !== "done" && (
          <>
            <div className="mt-1 font-display text-[2.1rem] font-extrabold leading-none tabular-nums">{countdown}</div>
            <div className="text-[11px] text-muted">{phase === "join" ? "until hiders drop in" : "left in the hunt"}</div>
          </>
        )}
        <dl className="mt-3 grid grid-cols-3 gap-1 text-center">
          {[
            ["Hidden", `${short(hidden)}/${short(hidersTotal)}`],
            ["Pool", short(pool)],
            ["Spots", short(tiles)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/60 px-1 py-1.5">
              <dd className="font-display text-sm font-bold tabular-nums">{v}</dd>
              <dt className="text-[9px] font-semibold uppercase tracking-wide text-muted">{k}</dt>
            </div>
          ))}
        </dl>
      </div>
      <div className="grid grid-cols-3 bg-ink/[0.04] px-2 py-2 text-center">
        <div title="Players in the city right now">
          <div className="flex items-center justify-center gap-1.5 font-display text-sm font-bold tabular-nums">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-me opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-me" />
            </span>
            {online === null ? "…" : short(online)}
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">Online</div>
        </div>
        <div title="Visits since launch">
          <div className="font-display text-sm font-bold tabular-nums">{short(visits)}</div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">Visits</div>
        </div>
        <div title="Players who've signed up">
          <div className="font-display text-sm font-bold tabular-nums">{short(players)}</div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">Players</div>
        </div>
      </div>
      <div className="flex border-t border-line text-xs font-semibold">
        <button onClick={onMarks} className="flex-1 py-2 hover:bg-white/50" aria-pressed={marks} title="Show or hide the marks on the map">
          {marks ? "👁 Marks on" : "🙈 Marks off"}
        </button>
        <button onClick={onSound} className="flex-1 border-l border-line py-2 hover:bg-white/50" aria-pressed={sound}>
          {sound ? "🔊 Sound" : "🔈 Muted"}
        </button>
        <button onClick={onToggle} className="w-10 border-l border-line py-2 hover:bg-white/50" aria-label="Fold away">
          ▴
        </button>
      </div>
    </div>
  );
}
