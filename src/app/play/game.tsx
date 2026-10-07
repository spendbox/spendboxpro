"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { GameState } from "@/lib/game";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { joinRound, moveTo, searchTile, sweepAround, type ActionResult } from "./actions";

type Mode = "search" | "sweep" | "move";
type SweepResult = { tile: number; radius: number; count: number; at: string };

const coins = (n: number) => (Number.isInteger(n) ? n.toString() : n.toFixed(2));

function useCountdown(target: string | undefined, serverNow: string) {
  // Starts at the server's clock, then ticks using the gap between server and device clocks.
  const [now, setNow] = useState(() => Date.parse(serverNow));
  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [serverNow]);
  if (!target) return "";
  const left = Math.max(0, Math.floor((Date.parse(target) - now) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Game({ state }: { state: GameState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("search");
  const [radius, setRadius] = useState(1);
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" | "info" } | null>(null);
  const [sweeps, setSweeps] = useState<SweepResult[]>([]);
  const [lastTile, setLastTile] = useState<number | null>(null);

  const { round, entry, me } = state;
  const phase = round?.status ?? "done";
  const countdown = useCountdown(phase === "join" ? round?.joinEndsAt : round?.seekEndsAt, state.serverNow);
  const isHider = entry?.role === "hider";
  const isSeeker = entry?.role === "seeker";
  const activeMode: Mode = isHider ? "move" : mode;

  // Keep the board live: fetch fresh state every few seconds.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [router]);

  // A new round clears the sweeps from the last one.
  const roundId = round?.id;
  const [sweepRound, setSweepRound] = useState(roundId);
  if (sweepRound !== roundId) {
    setSweepRound(roundId);
    setSweeps([]);
  }

  const searched = useMemo(() => new Map(state.mySearches.map((s) => [s.tile, s.caught])), [state.mySearches]);
  const left = useMemo(() => new Set(state.leftTiles), [state.leftTiles]);
  const caughtPublic = useMemo(() => new Set(state.caughtTiles), [state.caughtTiles]);

  function act(fn: () => Promise<ActionResult>, onOk: (data: Record<string, unknown>) => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) onOk(res.data);
      else setMessage({ text: res.error, tone: "bad" });
      router.refresh();
    });
  }

  function onTile(tile: number) {
    if (pending || phase !== "seek") return;
    setLastTile(tile);
    if (activeMode === "move") {
      if (!entry || entry.caught || entry.moves >= 2) return;
      const fee = entry.moves === 0 ? 0 : state.prices.moveFee;
      if (fee > 0 && !confirm(`Move to tile ${tile + 1} for ${fee} coins? This is your last move.`)) return;
      act(
        () => moveTo(tile),
        () => setMessage({ text: `You moved to tile ${tile + 1}. Everyone sees the tile you left.`, tone: "info" }),
      );
    } else if (activeMode === "sweep") {
      act(
        () => sweepAround(tile, radius),
        (d) => {
          const count = Number(d.hiders_nearby ?? 0);
          setSweeps((s) => [{ tile, radius, count, at: String(d.checked_at) }, ...s].slice(0, 6));
          setMessage({
            text: count > 0 ? `Sweep: ${count} hiding nearby!` : "Sweep: nobody nearby right now.",
            tone: count > 0 ? "good" : "info",
          });
        },
      );
    } else {
      act(
        () => searchTile(tile),
        (d) => {
          if (d.result === "already_searched")
            setMessage({ text: "Someone already searched that tile. No charge.", tone: "info" });
          else if (d.result === "caught")
            setMessage({ text: `Found ${d.caught}! You won ${coins(Number(d.reward))} coins.`, tone: "good" });
          else setMessage({ text: "Empty.", tone: "info" });
        },
      );
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const sweepCost =
    Math.round(((state.prices.sweepBase * (2 * radius + 1) * (2 * radius + 1)) / 9) * 100) / 100;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 px-4 py-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold">Hide &amp; Seek</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="whitespace-nowrap rounded-full bg-panel-2 px-3 py-1">
            <b className="text-gold">{coins(me.coins)}</b> coins
            {me.bonusCoins > 0 && <span className="text-muted"> +{coins(me.bonusCoins)} bonus</span>}
          </span>
          <button onClick={signOut} className="text-muted underline-offset-2 hover:underline">
            Sign out
          </button>
        </div>
      </header>

      {state.lastResult && phase === "join" && !entry && (
        <p className="rounded-xl bg-panel px-4 py-2 text-sm text-muted">
          Last round you were a {state.lastResult.role}
          {state.lastResult.role === "hider" && (state.lastResult.caught ? " and got caught" : " and survived")}.
          {state.lastResult.payout > 0 && <> You earned <b className="text-gold">{coins(state.lastResult.payout)}</b>.</>}
        </p>
      )}

      {round && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label={phase === "join" ? "Hiders placed in" : phase === "seek" ? "Search ends in" : "Round"}
            value={phase === "done" ? "Finished" : countdown}
            accent
          />
          <Stat label="Still hidden" value={`${round.hidersRemaining} of ${round.hidersTotal}`} />
          <Stat label="Survivor pool" value={coins(round.pool)} />
          <Stat label="Map" value={`${round.tileCount} tiles`} />
        </section>
      )}

      {/* Joining */}
      {round && !entry && phase !== "done" && (
        <section className="flex flex-col gap-3 rounded-2xl bg-panel p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-muted">
            {phase === "join"
              ? "Hiders are joining. Hide now, or join as a seeker and search when the clock runs out."
              : "The search is on. Join as a seeker and start tapping tiles."}
          </p>
          <div className="flex gap-2">
            <button
              disabled={pending}
              onClick={() => act(() => joinRound("seeker"), () => setMessage({ text: "You're a seeker this round.", tone: "info" }))}
              className="rounded-xl bg-gold px-4 py-2 font-semibold text-night disabled:opacity-50"
            >
              Join as seeker
            </button>
            {phase === "join" && (
              <button
                disabled={pending || !me.canHide}
                title={me.canHide ? undefined : "Play one round as a seeker first"}
                onClick={() => act(() => joinRound("hider"), () => setMessage({ text: "You're hiding. You'll be placed at random when the window closes.", tone: "info" }))}
                className="rounded-xl border border-line px-4 py-2 font-semibold disabled:opacity-40"
              >
                Hide ({state.prices.stake} coins)
              </button>
            )}
          </div>
          {phase === "join" && !me.canHide && (
            <p className="text-xs text-muted sm:hidden">Play one round as a seeker before you can hide.</p>
          )}
        </section>
      )}

      {/* Controls */}
      {entry && phase === "join" && (
        <p className="rounded-2xl bg-panel p-4 text-sm text-muted">
          {isHider
            ? "You're hiding. When the clock hits zero you'll be dropped on a random tile."
            : "You're a seeker. Searching opens when the clock hits zero."}{" "}
          Watch the map grow as hiders join.
        </p>
      )}
      {entry && phase === "seek" && isSeeker && (
        <section className="flex flex-wrap items-center gap-2 rounded-2xl bg-panel p-3 text-sm">
          <ModeButton on={mode === "search"} onClick={() => setMode("search")}>
            Search · {me.freeSearch ? "free" : `${coins(round!.searchPrice)}`}
          </ModeButton>
          <ModeButton on={mode === "sweep"} onClick={() => setMode("sweep")}>
            Sweep · {coins(sweepCost)}
          </ModeButton>
          {mode === "sweep" && (
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="rounded-lg border border-line bg-panel-2 px-2 py-1"
            >
              <option value={1}>3×3 area</option>
              <option value={2}>5×5 area</option>
              <option value={3}>7×7 area</option>
            </select>
          )}
          <span className="ml-auto text-muted">Bonus coins are spent first.</span>
        </section>
      )}
      {entry && phase === "seek" && isHider && (
        <section className="rounded-2xl bg-panel p-3 text-sm">
          {entry.caught ? (
            <span className="text-hit">You were found. Better luck next round.</span>
          ) : entry.moves >= 2 ? (
            <span className="text-muted">You are on tile {(entry.tile ?? 0) + 1}. No moves left. Stay hidden!</span>
          ) : (
            <span className="text-muted">
              You are on the <b className="text-me">green</b> tile. Tap another tile to move (
              {entry.moves === 0 ? "first move free" : `last move, ${state.prices.moveFee} coins`}). The tile you leave
              is announced to everyone.
            </span>
          )}
        </section>
      )}

      {message && (
        <p
          className={cn(
            "rounded-xl px-4 py-2 text-sm",
            message.tone === "good" && "bg-gold text-night",
            message.tone === "bad" && "bg-hit/20 text-hit",
            message.tone === "info" && "bg-panel-2",
          )}
        >
          {message.text}
        </p>
      )}

      {/* Map */}
      {round && (
        <section className="overflow-auto rounded-2xl bg-panel p-2">
          <div
            className="mx-auto grid gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${round.width}, minmax(14px, 1fr))`, maxWidth: round.width * 34 }}
          >
            {Array.from({ length: round.tileCount }, (_, tile) => {
              const mine = isHider && !entry?.caught && entry?.tile === tile;
              const myResult = searched.get(tile);
              return (
                <button
                  key={tile}
                  aria-label={`Tile ${tile + 1}`}
                  disabled={phase !== "seek" || pending || !entry}
                  onClick={() => onTile(tile)}
                  className={cn(
                    "aspect-square rounded-[3px] bg-panel-2 transition-colors",
                    phase === "seek" && entry && "hover:bg-gold/60",
                    myResult === 0 && "bg-miss",
                    (myResult ?? 0) > 0 && "bg-hit",
                    caughtPublic.has(tile) && myResult === undefined && "bg-hit/50",
                    left.has(tile) && "ring-1 ring-gold ring-inset",
                    mine && "bg-me",
                    lastTile === tile && pending && "animate-pulse bg-gold",
                  )}
                />
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <Legend className="bg-miss">You searched: empty</Legend>
        <Legend className="bg-hit">Someone found</Legend>
        <Legend className="bg-panel-2 ring-1 ring-gold ring-inset">A hider left this tile</Legend>
        {isHider && <Legend className="bg-me">You</Legend>}
      </section>

      {sweeps.length > 0 && (
        <section className="rounded-2xl bg-panel p-3 text-sm">
          <h2 className="mb-1 font-semibold">Your sweeps (hiders may have moved since)</h2>
          <ul className="space-y-0.5 text-muted">
            {sweeps.map((s, i) => (
              <li key={i}>
                Tile {s.tile + 1}, {2 * s.radius + 1}×{2 * s.radius + 1}: <b className="text-ink">{s.count}</b> nearby ·{" "}
                {new Date(s.at).toLocaleTimeString()}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-panel px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("font-display text-2xl font-bold tabular-nums", accent && "text-gold")}>{value}</div>
    </div>
  );
}

function ModeButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn("rounded-lg px-3 py-1.5 font-semibold", on ? "bg-gold text-night" : "bg-panel-2 text-ink")}
    >
      {children}
    </button>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-block size-3 rounded-[3px]", className)} />
      {children}
    </span>
  );
}
