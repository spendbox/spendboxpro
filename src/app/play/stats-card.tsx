"use client";

import { ChevronDown, ChevronUp, Trophy, Volume2, VolumeX } from "@/components/icons";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";

/** Long numbers get a smaller font so they always fit their box. */
const fit = (v: string) => (v.length <= 5 ? "text-sm" : v.length <= 7 ? "text-xs" : "text-[10px]");

/** The round clock and numbers. Folds down to a slim pill (the default on phones). */
export function StatsCard({
  city,
  phase,
  countdown,
  hidden,
  hidersTotal,
  golden,
  pool,
  online,
  visits,
  players,
  minimised,
  onToggle,
  sound,
  onSound,
  sponsor,
  urgent = false,
}: {
  city: string;
  phase: "join" | "seek" | "done";
  countdown: string;
  hidden: number;
  hidersTotal: number;
  /** Ghosts who won their way to golden (safe, and in the prize pool). */
  golden: number;
  pool: number;
  online: number | null;
  visits: number;
  players: number;
  minimised: boolean;
  onToggle: () => void;
  sound: boolean;
  onSound: () => void;
  sponsor?: { name: string; logo: string | null; coins: number } | null;
  /** The last minute before the world changes: the clock turns red and pulses. */
  urgent?: boolean;
}) {
  const label = phase === "join" ? "Joining" : phase === "seek" ? "Hunting" : "Over";
  if (minimised) {
    return (
      <button onClick={onToggle} className="glass pointer-events-auto flex h-8 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-xs sm:h-9 sm:gap-2 sm:px-3 sm:text-sm" aria-label="Show round details">
        <span className="min-w-0 max-w-[5.5rem] truncate font-display font-bold sm:max-w-[8rem]" title={city}>{city}</span>
        <span className={cn("font-display font-bold tabular-nums", urgent ? "animate-pulse text-hit" : "text-gold-dark")}>{phase === "done" ? label : countdown}</span>
        <span className="flex items-center gap-1 text-xs text-muted max-[359px]:hidden">
          <span className="size-1.5 animate-pulse rounded-full bg-me" />
          {online === null ? "…" : short(online)}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted sm:size-4" />
      </button>
    );
  }
  return (
    <div className="glass pointer-events-auto w-40 shrink-0 overflow-hidden rounded-2xl sm:w-52 sm:rounded-3xl">
      <div className="px-3 pb-2 pt-2.5 sm:px-4 sm:pt-3">
        <div className="flex items-start justify-between gap-2">
          <h1
            className={cn("min-w-0 break-words font-display font-extrabold leading-tight", city.length > 14 ? "text-xs sm:text-sm" : "text-sm sm:text-base")}
            title={city}
          >
            {city}
          </h1>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide sm:px-2 sm:text-[10px]",
              phase === "seek" ? "bg-hit/15 text-hit" : phase === "join" ? "bg-gold/30 text-gold-dark" : "bg-panel-2 text-muted",
            )}
          >
            {label}
          </span>
        </div>
        {phase !== "done" && (
          <>
            <div
              className={cn(
                "mt-1 font-display text-[1.6rem] font-extrabold leading-none tabular-nums sm:text-[2.1rem]",
                urgent && "animate-pulse text-hit",
              )}
            >
              {countdown}
            </div>
            <div className={cn("text-[10px] sm:text-[11px]", urgent ? "font-semibold text-hit" : "text-muted")}>
              {phase === "join" ? "until ghosts light up" : urgent ? "left in this town!" : "left in this town"}
            </div>
          </>
        )}
        <dl className="mt-2 grid grid-cols-3 gap-1 text-center sm:mt-3">
          {[
            ["Ghosts", short(hidden), `${hidden.toLocaleString("en")} of ${hidersTotal.toLocaleString("en")} ghosts still lit up`, `of ${short(hidersTotal)}`],
            ["Pool", short(pool), `${pool.toLocaleString("en")} mint in the pool`, "mint"],
            ["Golden", short(golden), `${golden.toLocaleString("en")} ghosts turned golden`, "safe"],
          ].map(([k, v, full, sub]) => (
            <div key={k} className="min-w-0 rounded-lg bg-white/60 px-0.5 py-1 sm:rounded-xl sm:px-1 sm:py-1.5" title={full}>
              <dd className={cn("truncate font-display font-bold leading-tight tabular-nums", fit(v))}>{v}</dd>
              <dt className="truncate text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted">{k}</dt>
              <div className="hidden truncate text-[9px] leading-tight text-muted/80 sm:block">{sub}</div>
            </div>
          ))}
        </dl>
        {sponsor && (
          <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-gold/20 px-2 py-1 text-[11px] font-semibold text-gold-dark" title={`${sponsor.name} added ${sponsor.coins.toLocaleString("en")} mint to this pool`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {sponsor.logo && <img src={sponsor.logo} alt="" className="size-4 rounded object-contain" />}
            <Trophy className="size-3.5 shrink-0" />
            <span className="truncate">Prize pool by {sponsor.name}</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 bg-ink/[0.04] px-1.5 py-1.5 text-center sm:px-2 sm:py-2">
        <div className="min-w-0" title="Players in the city right now">
          <div className="flex items-center justify-center gap-1.5 font-display text-sm font-bold tabular-nums">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-me opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-me" />
            </span>
            {online === null ? "…" : short(online)}
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">Online</div>
        </div>
        <div className="min-w-0" title={`${visits.toLocaleString("en")} visits since launch`}>
          <div className={cn("truncate font-display font-bold tabular-nums", fit(short(visits)))}>{short(visits)}</div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">Visits</div>
        </div>
        <div className="min-w-0" title={`${players.toLocaleString("en")} players have signed up`}>
          <div className={cn("truncate font-display font-bold tabular-nums", fit(short(players)))}>{short(players)}</div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">Players</div>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_2.5rem] border-t border-line text-xs font-semibold">
        <button onClick={onSound} className="flex items-center justify-center gap-1 py-1.5 hover:bg-white/50 sm:py-2" aria-pressed={sound}>
          {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          {sound ? "Sound" : "Muted"}
        </button>
        <button onClick={onToggle} className="grid place-items-center border-l border-line py-1.5 hover:bg-white/50 sm:py-2" aria-label="Fold away">
          <ChevronUp className="size-4" />
        </button>
      </div>
    </div>
  );
}
