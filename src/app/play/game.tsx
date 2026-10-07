"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CITY_ASSETS } from "@/lib/city/layout";
import type { GameState } from "@/lib/game";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { joinRound, moveTo, searchTile, sweepAround, type ActionResult } from "./actions";
import { Chat } from "./chat";
import type { CityMarkers } from "./city-view";
import { Results } from "./results";

// The 3D city only runs in the browser.
const CityView = dynamic(() => import("./city-view").then((m) => m.CityView), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-muted">Building the city…</div>,
});

type Mode = "search" | "sweep";
type SweepResult = { tile: number; radius: number; count: number; at: string };

const coins = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

/** How many people have the city open right now (live, via Supabase Realtime presence). */
function useOnline(userId: string) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("city-online", { config: { presence: { key: userId } } });
    channel
      .on("presence", { event: "sync" }, () => setCount(Object.keys(channel.presenceState()).length))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ at: Date.now() });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
  return count;
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
  const [menu, setMenu] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showResults, setShowResults] = useState<number | null>(null);
  const online = useOnline(state.me.id);

  const { round, entry, me } = state;
  const phase = round?.status ?? "done";
  const countdown = useCountdown(phase === "join" ? round?.joinEndsAt : round?.seekEndsAt, state.serverNow);
  const isHider = entry?.role === "hider";
  const isSeeker = entry?.role === "seeker";
  const movesLeft = isHider && entry ? Math.max(0, 2 - entry.moves) : 0;
  const canTap = phase === "seek" && !!entry && !(isHider && (entry.caught || movesLeft === 0));

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

  // When a round finishes, show its results once (remembered on this device).
  const resultsId = state.results?.roundId ?? null;
  useEffect(() => {
    if (!resultsId) return;
    let seen = 0;
    try {
      seen = Number(localStorage.getItem("hs-results-seen") ?? 0);
    } catch {}
    const fresh = state.results && Date.now() - Date.parse(state.results.finishedAt) < 30 * 60_000;
    if (!(resultsId > seen && fresh)) return;
    const id = setTimeout(() => {
      setShowResults(resultsId);
      try {
        localStorage.setItem("hs-results-seen", String(resultsId));
      } catch {}
    }, 400);
    return () => clearTimeout(id);
  }, [resultsId, state.results]);

  // Messages fade after a while.
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(id);
  }, [message]);

  const serverNowMs = Date.parse(state.serverNow);
  const markers: CityMarkers = useMemo(
    () => ({
      searchedEmpty: state.mySearches.filter((s) => s.caught === 0).map((s) => s.tile),
      searchedHit: state.mySearches.filter((s) => s.caught > 0).map((s) => s.tile),
      caught: state.caughtTiles,
      left: state.leftTiles,
      me: isHider && entry && !entry.caught ? entry.tile : null,
      sweeps,
      pending: pending ? busyTile : null,
      recent: state.recentSearches.map((r) => ({ tile: r.tile, ageMs: Math.max(0, serverNowMs - Date.parse(r.at)) })),
      locked: state.allSearched,
    }),
    [state.mySearches, state.caughtTiles, state.leftTiles, state.recentSearches, state.allSearched, serverNowMs, isHider, entry, sweeps, pending, busyTile],
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
    if (isHider) {
      const fee = entry.moves === 0 ? 0 : state.prices.moveFee;
      if (fee > 0 && !confirm(`Move to tile ${tile + 1} for ${fee} coins? This is your last move.`)) return;
      setBusyTile(tile);
      act(
        () => moveTo(tile),
        () => setMessage({ text: `You moved to tile ${tile + 1}. Everyone sees the tile you left.`, tone: "info" }),
      );
    } else if (mode === "sweep") {
      setBusyTile(tile);
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
      setBusyTile(tile);
      act(
        () => searchTile(tile),
        (d) => {
          if (d.result === "already_searched")
            setMessage({ text: "That tile was already searched. No charge.", tone: "info" });
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

      {/* Top: round clock and numbers (stacked, so big numbers fit) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="glass pointer-events-auto w-48 rounded-2xl px-3.5 py-2.5 sm:w-52">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="whitespace-nowrap font-display text-sm font-extrabold sm:text-base">Hide &amp; Seek</h1>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {phase === "join" ? "Hiding" : phase === "seek" ? "Searching" : "Over"}
            </span>
          </div>
          {round && phase !== "done" && (
            <div className="mt-0.5">
              <div className="font-display text-3xl font-extrabold leading-none tabular-nums">{countdown}</div>
              <div className="mt-0.5 text-[11px] text-muted">{phase === "join" ? "until hiders drop in" : "left to search"}</div>
            </div>
          )}
          {round && (
            <dl className="mt-2 space-y-1 border-t border-line pt-2 text-xs">
              <Stat label="Still hidden" value={`${round.hidersRemaining.toLocaleString()} / ${round.hidersTotal.toLocaleString()}`} />
              <Stat label="Survivor pool" value={coins(round.pool)} />
              <Stat label="City tiles" value={round.tileCount.toLocaleString()} />
              <Stat
                label={
                  <span className="flex items-center gap-1">
                    <span className="size-1.5 animate-pulse rounded-full bg-me" /> Watching
                  </span>
                }
                value={online === null ? "…" : online.toLocaleString()}
              />
            </dl>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="glass whitespace-nowrap rounded-full px-3 py-1.5 text-sm">
            <b className="text-gold-dark">{coins(me.coins)}</b>
            <span className="hidden sm:inline"> coins</span>
            {me.bonusCoins > 0 && <span className="text-muted"> +{coins(me.bonusCoins)}</span>}
          </span>
          <button
            onClick={() => setMenu((v) => !v)}
            className="glass grid h-9 w-9 shrink-0 place-items-center rounded-full text-base font-semibold"
            aria-label="Menu"
          >
            {menu ? "×" : "☰"}
          </button>
        </div>
      </div>

      {menu && (
        <div className="glass absolute right-3 top-16 z-30 max-h-[calc(100dvh-6rem)] w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-4 text-sm sm:right-4">
          <p className="mb-3 font-semibold">Hi, {me.name}</p>
          <h2 className="mb-1.5 font-semibold">How to play</h2>
          <ul className="space-y-1.5 text-muted">
            <li>Drag to move around. Pinch or scroll to zoom. Two fingers (or right-drag) to turn.</li>
            <li>You search <b className="text-ink">tiles</b>, not buildings: tapping anything on a square searches that whole square.</li>
            <li>Sweep checks a whole area for hiders, but they may move afterwards.</li>
            <li>Hiders get 2 moves: the first is free, the second costs {state.prices.moveFee}.</li>
            <li>The Seed Bot hides every round. Find it for 200 coins.</li>
          </ul>
          <h3 className="mb-1 mt-3 font-semibold">On the map</h3>
          <ul className="space-y-1 text-muted">
            <Key className="bg-[#5c7cfa]">You searched it: empty</Key>
            <Key className="bg-hit">Someone was found here</Key>
            <Key className="bg-[#ff922b]">Searched (hiders see all of these)</Key>
            <Key className="border-2 border-white bg-[#fff3bf]">Just searched by someone</Key>
            <Key className="border-2 border-gold bg-transparent">A hider left this tile</Key>
            <Key className="bg-me">You, if you&apos;re hiding</Key>
          </ul>
          <h3 className="mb-1 mt-3 font-semibold">In the city</h3>
          <p className="text-muted">{CITY_ASSETS.tiles.join(" · ")}</p>
          <p className="mt-1 text-muted">Moving: {CITY_ASSETS.moving.join(" · ")}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {state.results && (
              <button onClick={() => { setShowResults(state.results!.roundId); setMenu(false); }} className="rounded-xl bg-panel-2 px-3 py-2 font-medium">
                Last results
              </button>
            )}
            <button onClick={() => router.push("/welcome")} className="rounded-xl bg-panel-2 px-3 py-2 font-medium">
              Change PIN
            </button>
            <button onClick={signOut} className="col-span-2 rounded-xl bg-panel-2 px-3 py-2 font-medium text-muted">
              Sign out
            </button>
          </div>
        </div>
      )}

      {showResults && state.results?.roundId === showResults && (
        <Results results={state.results} meName={me.name} onClose={() => setShowResults(null)} />
      )}

      {/* Bottom: messages, controls and chat */}
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

        <div className="flex w-full max-w-xl justify-end">
          {round && <Chat meId={me.id} roundId={round.id} open={chatOpen} onOpenChange={setChatOpen} />}
        </div>

        <div className="glass pointer-events-auto w-full max-w-xl rounded-2xl p-3">
          {!round || phase === "done" ? (
            <p className="text-sm text-muted">The next round is starting…</p>
          ) : !entry ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-muted">
                {phase === "join"
                  ? "Hiders are joining and the city is growing. Hide now, or join as a seeker."
                  : "The search is on. Join as a seeker and tap tiles to search them."}
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
            <div className="space-y-2">
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
                    <option value={1}>3×3 tiles</option>
                    <option value={2}>5×5 tiles</option>
                    <option value={3}>7×7 tiles</option>
                  </select>
                )}
              </div>
              <p className="text-xs text-muted">
                {mode === "search"
                  ? "Tap a tile to search it. You're searching the whole square, not just the building on it."
                  : "Tap a tile to sweep the area around it."}{" "}
                Bonus coins are spent first.
              </p>
            </div>
          ) : entry.caught ? (
            <p className="text-sm text-hit">You were found. Better luck next round.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-me/15 px-2.5 py-1 text-xs font-semibold text-me">
                  {movesLeft === 0 ? "No moves left" : `${movesLeft} move${movesLeft === 1 ? "" : "s"} left`}
                </span>
                {movesLeft > 0 && (
                  <span className="text-xs text-muted">
                    Next move: {entry.moves === 0 ? "free" : `${state.prices.moveFee} coins`}
                  </span>
                )}
              </div>
              {state.outlook && (
                <p className="rounded-xl bg-me/10 px-3 py-2">
                  If you&apos;re not found you get <b>{coins(state.outlook.stakeBack + state.outlook.share)}</b> coins:{" "}
                  <span className="text-muted">
                    your {coins(state.outlook.stakeBack)} stake back + {coins(state.outlook.share)} from the pool (so far; it grows as hiders are caught).
                  </span>
                </p>
              )}
              <p className="text-xs text-muted">
                You&apos;re under the green light.{" "}
                {movesLeft > 0
                  ? "Tap another tile to move. Orange tiles were searched and are locked. The tile you leave is announced."
                  : "Stay hidden!"}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Key({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("inline-block size-3 shrink-0 rounded-[3px]", className)} />
      {children}
    </li>
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
