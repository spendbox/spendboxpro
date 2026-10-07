"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { GameState } from "@/lib/game";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { joinRound, moveTo, searchTile, sweepAround, type ActionResult } from "./actions";
import type { CityMarkers } from "./city-view";

// The 3D city only runs in the browser.
const CityView = dynamic(() => import("./city-view").then((m) => m.CityView), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-muted">Building the city…</div>,
});

type Mode = "search" | "sweep";
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
  const [busyTile, setBusyTile] = useState<number | null>(null);
  const [hover, setHover] = useState<{ tile: number; label: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const { round, entry, me } = state;
  const phase = round?.status ?? "done";
  const countdown = useCountdown(phase === "join" ? round?.joinEndsAt : round?.seekEndsAt, state.serverNow);
  const isHider = entry?.role === "hider";
  const isSeeker = entry?.role === "seeker";
  const canTap = phase === "seek" && !!entry && !(isHider && (entry.caught || entry.moves >= 2));

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

  // Messages fade after a while.
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(id);
  }, [message]);

  const markers: CityMarkers = useMemo(
    () => ({
      searchedEmpty: state.mySearches.filter((s) => s.caught === 0).map((s) => s.tile),
      searchedHit: state.mySearches.filter((s) => s.caught > 0).map((s) => s.tile),
      caught: state.caughtTiles,
      left: state.leftTiles,
      me: isHider && entry && !entry.caught ? entry.tile : null,
      sweeps,
      pending: pending ? busyTile : null,
    }),
    [state.mySearches, state.caughtTiles, state.leftTiles, isHider, entry, sweeps, pending, busyTile],
  );

  function act(fn: () => Promise<ActionResult>, onOk: (data: Record<string, unknown>) => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) onOk(res.data);
      else setMessage({ text: res.error, tone: "bad" });
      router.refresh();
    });
  }

  function onTile(tile: number) {
    if (pending || !canTap || !entry) return;
    setBusyTile(tile);
    if (isHider) {
      const fee = entry.moves === 0 ? 0 : state.prices.moveFee;
      if (fee > 0 && !confirm(`Move to tile ${tile + 1} for ${fee} coins? This is your last move.`)) return;
      act(
        () => moveTo(tile),
        () => setMessage({ text: `You moved to tile ${tile + 1}. Everyone sees the tile you left.`, tone: "info" }),
      );
    } else if (mode === "sweep") {
      act(
        () => sweepAround(tile, radius),
        (d) => {
          const count = Number(d.hiders_nearby ?? 0);
          setSweeps((s) => [{ tile, radius, count, at: String(d.checked_at) }, ...s].slice(0, 6));
          setMessage({
            text: count > 0 ? `Sweep: ${count} hiding in that area!` : "Sweep: nobody in that area right now.",
            tone: count > 0 ? "good" : "info",
          });
        },
      );
    } else {
      act(
        () => searchTile(tile),
        (d) => {
          if (d.result === "already_searched")
            setMessage({ text: "Someone already searched there. No charge.", tone: "info" });
          else if (d.result === "caught")
            setMessage({ text: `Found ${d.caught}! You won ${coins(Number(d.reward))} coins.`, tone: "good" });
          else setMessage({ text: `Tile ${tile + 1} is empty.`, tone: "info" });
        },
      );
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const sweepCost = Math.round(((state.prices.sweepBase * (2 * radius + 1) * (2 * radius + 1)) / 9) * 100) / 100;

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      {round && (
        <CityView
          seed={round.id}
          tileCount={round.tileCount}
          markers={markers}
          interactive={canTap}
          onTile={onTile}
          onHover={setHover}
        />
      )}

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="glass pointer-events-auto rounded-2xl px-4 py-2.5">
          <div className="flex items-baseline gap-2">
            <h1 className="font-display text-base font-extrabold sm:text-lg">Hide &amp; Seek</h1>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {phase === "join" ? "Hiding" : phase === "seek" ? "Searching" : "Round over"}
            </span>
          </div>
          {round && phase !== "done" && (
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl font-extrabold tabular-nums">{countdown}</span>
              <span className="text-xs text-muted">{phase === "join" ? "until hiders drop" : "left"}</span>
            </div>
          )}
          {round && (
            <div className="mt-0.5 text-xs text-muted">
              <b className="text-ink">{round.hidersRemaining}</b>/{round.hidersTotal} hidden · pool{" "}
              <b className="text-ink">{coins(round.pool)}</b> · {round.tileCount} tiles
            </div>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="glass whitespace-nowrap rounded-full px-3 py-1.5 text-sm">
            <b className="text-gold-dark">{coins(me.coins)}</b>
            <span className="hidden sm:inline"> coins</span>
            {me.bonusCoins > 0 && <span className="text-muted"> +{coins(me.bonusCoins)}</span>}
          </span>
          <button
            onClick={() => setShowHelp((v) => !v)}
            className="glass grid h-9 w-9 shrink-0 place-items-center rounded-full text-base font-semibold"
            aria-label="Menu"
          >
            {showHelp ? "×" : "☰"}
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="glass absolute right-3 top-16 z-10 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl p-4 text-sm sm:right-4">
          <h2 className="mb-2 font-semibold">How to play</h2>
          <ul className="space-y-1.5 text-muted">
            <li>Drag to move around. Pinch or scroll to zoom. Two fingers (or right-drag) to turn.</li>
            <li>Seekers tap a tile to search it, or use Sweep to check an area.</li>
            <li>Hiders tap a tile to move: the first move is free, the second costs {state.prices.moveFee}.</li>
            <li>The Seed Bot hides in every round. Find it for 200 coins.</li>
            <li>Coins: <b className="text-ink">{coins(me.coins)}</b>, bonus <b className="text-ink">{coins(me.bonusCoins)}</b> (bonus pays for searches first).</li>
          </ul>
          <h3 className="mb-1 mt-3 font-semibold">On the map</h3>
          <ul className="space-y-1 text-muted">
            <li><span className="mr-1.5 inline-block size-2.5 rounded-full bg-hit" />Someone was found here</li>
            <li><span className="mr-1.5 inline-block size-2.5 rounded-full bg-miss" />You searched: empty (grey ×)</li>
            <li><span className="mr-1.5 inline-block size-2.5 rounded-full border-2 border-gold" />A hider just left this tile</li>
            <li><span className="mr-1.5 inline-block size-2.5 rounded-full bg-me" />You (hiders only)</li>
          </ul>
          <button onClick={signOut} className="mt-4 w-full rounded-xl bg-panel-2 px-3 py-2 font-medium">
            Sign out
          </button>
        </div>
      )}

      {/* Bottom panel */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
        {message && (
          <p
            className={cn(
              "pointer-events-auto max-w-xl rounded-xl px-4 py-2 text-sm font-medium shadow-lg",
              message.tone === "good" && "bg-gold text-ink",
              message.tone === "bad" && "bg-hit text-white",
              message.tone === "info" && "glass",
            )}
          >
            {message.text}
          </p>
        )}
        {hover && canTap && (
          <p className="glass hidden rounded-full px-3 py-1 text-xs text-muted sm:block">
            Tile {hover.tile + 1} · {hover.label}
          </p>
        )}

        <div className="glass pointer-events-auto w-full max-w-xl rounded-2xl p-3">
          {state.lastResult && phase === "join" && !entry && (
            <p className="mb-2 text-sm text-muted">
              Last round you were a {state.lastResult.role}
              {state.lastResult.role === "hider" && (state.lastResult.caught ? " and got caught" : " and survived")}.
              {state.lastResult.payout > 0 && <> You earned <b className="text-ink">{coins(state.lastResult.payout)}</b>.</>}
            </p>
          )}

          {!round || phase === "done" ? (
            <p className="text-sm text-muted">The next round is starting…</p>
          ) : !entry ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-muted">
                {phase === "join"
                  ? "Hiders are joining and the city is growing. Hide now, or join as a seeker."
                  : "The search is on. Join as a seeker and tap buildings to search."}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={pending}
                  onClick={() => act(() => joinRound("seeker"), () => setMessage({ text: "You're a seeker this round.", tone: "info" }))}
                  className="flex-1 rounded-xl bg-gold px-4 py-2.5 font-semibold text-ink disabled:opacity-50 sm:flex-none"
                >
                  Seek
                </button>
                {phase === "join" && (
                  <button
                    disabled={pending || !me.canHide}
                    onClick={() =>
                      act(() => joinRound("hider"), () => setMessage({ text: "You're hiding. You'll be dropped somewhere in the city when the clock hits zero.", tone: "info" }))
                    }
                    className="flex-1 rounded-xl bg-ink px-4 py-2.5 font-semibold text-white disabled:opacity-40 sm:flex-none"
                  >
                    Hide · {state.prices.stake}
                  </button>
                )}
              </div>
              {phase === "join" && !me.canHide && (
                <p className="text-xs text-muted">Play one round as a seeker to unlock hiding.</p>
              )}
            </div>
          ) : phase === "join" ? (
            <p className="text-sm text-muted">
              {isHider
                ? "You're hiding. When the clock hits zero you'll be dropped on a random tile."
                : "You're a seeker. Searching opens when the clock hits zero."}{" "}
              Watch the city grow as hiders join.
            </p>
          ) : isSeeker ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <ModeButton on={mode === "search"} onClick={() => setMode("search")}>
                Search · {me.freeSearch ? "free" : coins(round.searchPrice)}
              </ModeButton>
              <ModeButton on={mode === "sweep"} onClick={() => setMode("sweep")}>
                Sweep · {coins(sweepCost)}
              </ModeButton>
              {mode === "sweep" && (
                <select
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="rounded-lg border border-line bg-panel px-2 py-1.5"
                >
                  <option value={1}>3×3 area</option>
                  <option value={2}>5×5 area</option>
                  <option value={3}>7×7 area</option>
                </select>
              )}
              <span className="ml-auto text-xs text-muted">Tap a tile · bonus coins go first</span>
            </div>
          ) : (
            <p className="text-sm">
              {entry.caught ? (
                <span className="text-hit">You were found. Better luck next round.</span>
              ) : entry.moves >= 2 ? (
                <span className="text-muted">No moves left. Stay hidden!</span>
              ) : (
                <span className="text-muted">
                  You&apos;re under the <b className="text-me">green light</b>. Tap another tile to move (
                  {entry.moves === 0 ? "free" : `last move, ${state.prices.moveFee} coins`}). The tile you leave is announced.
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function ModeButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn("rounded-lg px-3 py-1.5 font-semibold", on ? "bg-gold text-ink" : "bg-panel-2 text-ink")}
    >
      {children}
    </button>
  );
}
