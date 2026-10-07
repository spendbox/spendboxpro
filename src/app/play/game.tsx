"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addressOf, CITY_ASSETS, makePlan, tileAt } from "@/lib/city/layout";
import type { GameEvent, GameState } from "@/lib/game";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { joinRound, moveTo, requestAd, searchTile, sweepAround, type ActionResult } from "./actions";
import { Chat } from "./chat";
import type { CityEvent, CityMarkers } from "./city-view";
import { Results } from "./results";

// The 3D city only runs in the browser.
const CityView = dynamic(() => import("./city-view").then((m) => m.CityView), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-muted">Building the city…</div>,
});

type Mode = "search" | "sweep";
type Notice = { id: number; text: string; tone: "alarm" | "move" | "info" | "mine" };
type FeedItem = { key: string; at: string; text: string; tone: Notice["tone"] };

/** The server's clock, ticking every second on this device. */
function useNow(serverNow: string) {
  const [now, setNow] = useState(() => Date.parse(serverNow));
  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [serverNow]);
  return now;
}

const clock = (ms: number) => {
  const left = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(left / 60)}:${(left % 60).toString().padStart(2, "0")}`;
};

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

function describe(e: GameEvent, botName: string, myTile: number | null, where: (tile: number) => string): Notice | null {
  if (e.kind === "caught") {
    const who = e.detail?.finder ?? "Someone";
    if (e.detail?.how === "walked_in") return { id: e.id, tone: "alarm", text: `A hider wandered onto a searched spot and got caught! ${who} gets the credit.` };
    if (e.detail?.bot) return { id: e.id, tone: "alarm", text: `${who} found ${botName}!` };
    return { id: e.id, tone: "alarm", text: `${who} caught ${e.detail?.count && e.detail.count > 1 ? `${e.detail.count} hiders` : "a hider"} at ${where(e.tile)}!` };
  }
  if (e.kind === "moved") {
    if (myTile !== null && e.tile === myTile) return null;
    return { id: e.id, tone: "move", text: `Someone just slipped away from ${where(e.tile)}.` };
  }
  return null;
}

export function Game({ state }: { state: GameState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("search");
  const [radius, setRadius] = useState<1 | 2 | 3>(1);
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" | "info" } | null>(null);
  const [busyTile, setBusyTile] = useState<number | null>(null);
  const [hover, setHover] = useState<{ tile: number; label: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showResults, setShowResults] = useState<number | null>(null);
  const [confirmMove, setConfirmMove] = useState<number | null>(null);
  const [billboard, setBillboard] = useState<{ id: string; tile: number } | null>(null);
  const [toasts, setToasts] = useState<FeedItem[]>([]);
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedSeenAt, setFeedSeenAt] = useState<string>(state.serverNow);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const online = useOnline(state.me.id);

  const { round, entry, me } = state;
  const now = useNow(state.serverNow);
  const phase = round?.status ?? "done";
  const countdown = clock(Date.parse((phase === "join" ? round?.joinEndsAt : round?.seekEndsAt) ?? "") - now);
  const isHider = entry?.role === "hider";
  const isSeeker = entry?.role === "seeker";
  const moveWait = entry?.lastMoveAt ? Date.parse(entry.lastMoveAt) + state.prices.moveCooldown * 1000 - now : 0;
  const sweepWait = entry?.lastSweepAt ? Date.parse(entry.lastSweepAt) + state.prices.sweepCooldown * 1000 - now : 0;
  const frozenWait = entry?.frozenUntil ? Date.parse(entry.frozenUntil) - now : 0;
  const recentlySwept =
    isHider &&
    !!entry?.lastSweptAt &&
    now - Date.parse(entry.lastSweptAt) < 90_000 &&
    (!entry.lastMoveAt || Date.parse(entry.lastSweptAt) > Date.parse(entry.lastMoveAt));
  const canTap = phase === "seek" && !!entry && !(isHider && entry.caught);
  const botName = round?.botName ?? "the bot";
  // This round's city: its name and street addresses (same maths as the 3D view).
  const roundSeed = round?.id ?? 0;
  const plan = useMemo(() => makePlan(roundSeed), [roundSeed]);
  const where = useCallback((tile: number) => addressOf(plan, tileAt(plan, tile)), [plan]);
  const knownSet = useMemo(() => new Set(state.knownSearched), [state.knownSearched]);

  // Keep the board live: fetch fresh state every few seconds.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [router]);

  // Everything worth knowing, newest first: public happenings (moves, catches) and private
  // notices for you (your trap went off, a drone swept you, you were found).
  const myLastSpot = isHider ? (entry?.visited.at(-1) ?? null) : null;
  const feed: FeedItem[] = useMemo(() => {
    const pub = state.events
      .map((e) => {
        const n = describe(e, botName, myLastSpot, where);
        return n ? { key: `e${e.id}`, at: e.at, text: n.text, tone: n.tone } : null;
      })
      .filter((x): x is FeedItem => x !== null);
    const mine = state.notifications.map((n) => ({
      key: `n${n.id}`,
      at: n.at,
      text: n.tile !== null && n.kind === "trap" ? `${n.body} (near ${where(n.tile)})` : n.body,
      tone: "mine" as const,
    }));
    return [...pub, ...mine].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 60);
  }, [state.events, state.notifications, botName, myLastSpot, where]);
  const unread = feed.filter((f) => Date.parse(f.at) > Date.parse(feedSeenAt)).length;

  // New items pop up briefly under the bell (only what arrives while you're here).
  const seenKeys = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seenKeys.current === null) {
      seenKeys.current = new Set(feed.map((f) => f.key));
      return;
    }
    const fresh = feed.filter((f) => !seenKeys.current!.has(f.key));
    fresh.forEach((f) => seenKeys.current!.add(f.key));
    if (!fresh.length || feedOpen) return;
    const id = setTimeout(() => setToasts((list) => [...fresh.slice(0, 2).reverse(), ...list].slice(0, 2)), 0);
    return () => clearTimeout(id);
  }, [feed, feedOpen]);
  useEffect(() => {
    if (!toasts.length) return;
    const id = setTimeout(() => setToasts((list) => list.slice(0, -1)), 5500);
    return () => clearTimeout(id);
  }, [toasts]);

  // When a round finishes, show its results once (remembered on this device).
  const resultsId = state.results?.roundId ?? null;
  useEffect(() => {
    if (!resultsId) return;
    let seenResults = 0;
    try {
      seenResults = Number(localStorage.getItem("hs-results-seen") ?? 0);
    } catch {}
    const fresh = state.results && Date.now() - Date.parse(state.results.finishedAt) < 30 * 60_000;
    if (!(resultsId > seenResults && fresh)) return;
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
      sweeps: state.mySweeps.map((sw) => ({ tile: sw.tile, radius: sw.radius, count: sw.found ? 1 : 0 })),
      pending: pending ? busyTile : null,
      recent: state.recentSearches.map((r) => ({ tile: r.tile, ageMs: Math.max(0, serverNowMs - Date.parse(r.at)) })),
      locked: state.knownSearched,
    }),
    [state.mySearches, state.caughtTiles, state.leftTiles, state.recentSearches, state.knownSearched, state.mySweeps, serverNowMs, isHider, entry, pending, busyTile],
  );
  const cityEvents: CityEvent[] = useMemo(
    () => state.events.map((e) => ({ id: e.id, kind: e.kind, tile: e.tile, detail: e.detail, ageMs: Math.max(0, serverNowMs - Date.parse(e.at)) })),
    [state.events, serverNowMs],
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
      if (tile === entry.tile) return setMessage({ text: "You're already hiding there.", tone: "info" });
      if (entry.visited.includes(tile)) return setMessage({ text: "You've been there already. No going back.", tone: "bad" });
      if (knownSet.has(tile)) return setMessage({ text: "That spot's been searched (it's orange). Pick somewhere else.", tone: "bad" });
      if (frozenWait > 0) return setMessage({ text: `A drone has you pinned. You can move in ${Math.ceil(frozenWait / 1000)}s.`, tone: "bad" });
      if (moveWait > 0) return setMessage({ text: `Catch your breath: you can move again in ${clock(moveWait)}.`, tone: "info" });
      return setConfirmMove(tile);
    }
    setBusyTile(tile);
    if (mode === "sweep") {
      if (sweepWait > 0) return setMessage({ text: `Your drone is recharging (${Math.ceil(sweepWait / 1000)}s).`, tone: "info" });
      act(
        () => sweepAround(tile, radius),
        (d) => {
          const found = Boolean(d.found);
          setMessage({
            text: found
              ? "The drone picked something up! Anyone in that area is pinned for 15 seconds. Your drone keeps watching it as a trap."
              : "The drone saw nothing there, for now. It'll keep watching the area as a trap.",
            tone: found ? "good" : "info",
          });
        },
      );
    } else {
      act(
        () => searchTile(tile),
        (d) => {
          if (d.result === "caught")
            setMessage({
              text: d.bot ? `You found ${botName}! +${short(Number(d.reward))} coins.` : `Gotcha! You found ${d.caught}. +${short(Number(d.reward))} coins.`,
              tone: "good",
            });
          else
            setMessage({
              text: d.searched_before ? `Nobody at ${where(tile)}. (Heads up: that spot had been searched before.)` : `Nobody at ${where(tile)}.`,
              tone: "info",
            });
        },
      );
    }
  }

  function doMove(tile: number) {
    setConfirmMove(null);
    setBusyTile(tile);
    act(
      () => moveTo(tile),
      (d) =>
        setMessage(
          d.caught
            ? { text: "Oh no. Someone had already searched that spot and was waiting. You've been caught.", tone: "bad" }
            : { text: `You slipped over to ${where(tile)}. Everyone saw someone leave your old spot.`, tone: "info" },
        ),
    );
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }


  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      {round && (
        <CityView
          seed={round.id}
          tileCount={round.tileCount}
          markers={markers}
          events={cityEvents}
          interactive={canTap}
          onTile={onTile}
          onBillboard={setBillboard}
          onHover={setHover}
        />
      )}

      {/* Top: round clock and numbers (stacked, so big numbers fit) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="glass pointer-events-auto w-44 rounded-2xl px-3.5 py-2.5 sm:w-52">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="truncate font-display text-sm font-extrabold sm:text-base" title={`Hide & Seek in ${plan.city.name}`}>
              {round ? plan.city.name : "Hide & Seek"}
            </h1>
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
              <Stat label="Still hidden" value={`${short(round.hidersRemaining)} / ${short(round.hidersTotal)}`} />
              <Stat label="Survivor pool" value={short(round.pool)} />
              <Stat label="City tiles" value={short(round.tileCount)} />
              <Stat
                label={
                  <span className="flex items-center gap-1">
                    <span className="size-1.5 animate-pulse rounded-full bg-me" /> Watching
                  </span>
                }
                value={online === null ? "…" : short(online)}
              />
            </dl>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex items-center gap-2">
            <span className="glass whitespace-nowrap rounded-full px-3 py-1.5 text-sm" title={`${me.coins} coins`}>
              <b className="text-gold-dark">{short(me.coins)}</b>
              <span className="hidden sm:inline"> coins</span>
              {me.bonusCoins > 0 && <span className="text-muted"> +{short(me.bonusCoins)}</span>}
            </span>
            <button
              onClick={() => {
                setFeedOpen((v) => !v);
                setMenu(false);
                setToasts([]);
                setFeedSeenAt(new Date(now).toISOString());
              }}
              className="glass relative grid h-9 w-9 shrink-0 place-items-center rounded-full"
              aria-label="Notifications"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-hit px-1 text-[10px] font-semibold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
            <button
              onClick={() => { setMenu((v) => !v); setFeedOpen(false); }}
              className="glass grid h-9 w-9 shrink-0 place-items-center rounded-full text-base font-semibold"
              aria-label="Menu"
            >
              {menu ? "×" : "☰"}
            </button>
          </div>
        </div>
      </div>

      {/* Latest notices pop up under the bell; the bell opens the full list. */}
      <div className="pointer-events-none absolute right-3 top-[13.5rem] z-10 flex w-[min(18rem,calc(100vw-1.5rem))] flex-col items-end gap-1.5 sm:right-4 sm:top-16">
        {!feedOpen &&
          toasts.map((n) => (
            <button
              key={n.key}
              onClick={() => { setFeedOpen(true); setFeedSeenAt(new Date(now).toISOString()); setToasts([]); }}
              className="glass pointer-events-auto flex items-start gap-2 rounded-xl px-3 py-2 text-left text-xs shadow-lg"
            >
              <FeedIcon tone={n.tone} />
              <span>{n.text}</span>
            </button>
          ))}
      </div>
      {feedOpen && (
        <div className="glass absolute right-3 top-16 z-30 flex max-h-[min(28rem,calc(100dvh-14rem))] w-[min(20rem,calc(100vw-1.5rem))] flex-col rounded-2xl text-sm sm:right-4">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="font-semibold">Notifications</h2>
            <button onClick={() => setFeedOpen(false)} className="rounded-full px-2 text-lg text-muted" aria-label="Close notifications">
              ×
            </button>
          </div>
          <ul className="flex-1 space-y-1 overflow-y-auto p-2">
            {feed.length === 0 ? (
              <li className="p-4 text-center text-muted">Nothing yet this round.</li>
            ) : (
              feed.map((f) => (
                <li key={f.key} className={cn("flex gap-2 rounded-xl px-2.5 py-2", f.tone === "mine" && "bg-gold/15")}>
                  <FeedIcon tone={f.tone} />
                  <span className="flex-1">
                    {f.text}
                    <span className="block text-[11px] text-muted">{new Date(f.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {menu && (
        <div className="glass absolute right-3 top-16 z-30 max-h-[calc(100dvh-6rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-4 text-sm sm:right-4">
          <p className="mb-3 font-semibold">Hey {me.name} 👋</p>
          <h2 className="mb-1.5 font-semibold">How it works</h2>
          <ul className="space-y-1.5 text-muted">
            <li>Drag to look around, pinch or scroll to zoom, and use two fingers (or right-drag) to turn the city.</li>
            <li>Seekers tap a spot to search it. Your first search each day is free. Every coin you spend goes into the survivor pool.</li>
            <li>Sweeps send a drone over an area and tell you if anyone&apos;s hiding there. They get pricier the more people use them, and hiders find out they were swept.</li>
            <li>Hiders can move as much as they like: {state.prices.moveFee} coins a move, one move a minute, never back to an old spot. Everyone sees when someone moves. And stepping onto a spot that&apos;s already been searched gets you caught.</li>
            <li>You only see the most recent searches; older ones fade from the map. So look carefully before you move.</li>
            <li>{botName} (our bot) hides every round, and runs when it&apos;s swept. Find it for 200 coins.</li>
            <li>See a billboard? Tap it to put your brand on it.</li>
          </ul>
          <h3 className="mb-1 mt-3 font-semibold">On the map</h3>
          <ul className="space-y-1 text-muted">
            <Key className="bg-[#5c7cfa]">You searched it: nobody there</Key>
            <Key className="bg-hit">Someone was caught here</Key>
            <Key className="bg-[#ff922b]">Searched recently</Key>
            <Key className="border-2 border-white bg-[#fff3bf]">Being searched right now</Key>
            <Key className="border-2 border-gold bg-transparent">Someone just left this spot</Key>
            <Key className="bg-me">You, if you&apos;re hiding</Key>
          </ul>
          <h3 className="mb-1 mt-3 font-semibold">Around the city</h3>
          <p className="text-muted">
            Every round is a new city, named after a real place, with its own street names. Big landmarks: {CITY_ASSETS.big.join(" · ")}.
          </p>
          <p className="mt-1 text-muted">{CITY_ASSETS.tiles.join(" · ")}</p>
          <p className="mt-1 text-muted">On the move: {CITY_ASSETS.moving.join(" · ")}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {state.results && (
              <button onClick={() => { setShowResults(state.results!.roundId); setMenu(false); }} className="rounded-xl bg-panel-2 px-3 py-2 font-medium">
                Last results
              </button>
            )}
            <button onClick={() => router.push("/welcome")} className="rounded-xl bg-panel-2 px-3 py-2 font-medium">
              Change PIN
            </button>
            <button onClick={() => { setMenu(false); setConfirmSignOut(true); }} className="col-span-2 rounded-xl bg-panel-2 px-3 py-2 font-medium text-muted">
              Sign out
            </button>
          </div>
        </div>
      )}

      {showResults && state.results?.roundId === showResults && (
        <Results results={state.results} onClose={() => setShowResults(null)} />
      )}

      {confirmMove !== null && entry && (
        <Sheet onClose={() => setConfirmMove(null)}>
          <h2 className="font-display text-xl font-bold">Move to {where(confirmMove)}?</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            <li>It costs {state.prices.moveFee} coins (you have {short(me.coins)}). The coins go into the survivor pool.</li>
            <li>Everyone will see that someone left {where(entry.tile ?? 0)}, and you can&apos;t come back to it.</li>
            <li>Your next move will be possible in {state.prices.moveCooldown} seconds.</li>
          </ul>
          {state.activeTraps > 0 && (
            <p className="mt-3 rounded-xl bg-[#4dabf7]/15 px-3 py-2 text-sm text-[#1864ab]">
              📡 There {state.activeTraps === 1 ? "is 1 drone trap" : `are ${state.activeTraps} drone traps`} watching parts of the city
              right now, and you can&apos;t see where. If you move into one, the seeker who set it will know someone&apos;s there.
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirmMove(null)} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
              Stay put
            </button>
            <button onClick={() => doMove(confirmMove)} className="flex-1 rounded-xl bg-ink py-2.5 font-semibold text-white">
              Move · {state.prices.moveFee}
            </button>
          </div>
        </Sheet>
      )}

      {confirmSignOut && (
        <Sheet onClose={() => setConfirmSignOut(false)}>
          <h2 className="font-display text-xl font-bold">Sign out?</h2>
          <p className="mt-1 text-sm text-muted">
            {isHider && entry && !entry.caught
              ? "You'll stay hidden in the city while you're away, and you can sign back in with your email and PIN."
              : "You can sign back in any time with your email and PIN."}
          </p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirmSignOut(false)} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
              Stay
            </button>
            <button onClick={signOut} className="flex-1 rounded-xl bg-ink py-2.5 font-semibold text-white">
              Sign out
            </button>
          </div>
        </Sheet>
      )}

      {billboard && <BillboardSheet board={billboard} address={where(billboard.tile)} onClose={() => setBillboard(null)} />}

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
        {hover && (
          <p className="glass hidden rounded-full px-3 py-1 text-xs text-muted sm:block">
            {hover.label}
          </p>
        )}

        <div className="flex w-full max-w-xl justify-end">
          {round && <Chat meId={me.id} roundId={round.id} open={chatOpen} onOpenChange={setChatOpen} />}
        </div>

        <div className="glass pointer-events-auto w-full max-w-xl rounded-2xl p-3">
          {!round || phase === "done" ? (
            <p className="text-sm text-muted">Building the next city…</p>
          ) : !entry ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-muted">
                {phase === "join"
                  ? "Hiders are getting ready and the city's growing. Want to hide, or hunt?"
                  : "The hunt is on. Jump in as a seeker and start searching."}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={pending}
                  onClick={() => act(() => joinRound("seeker"), () => setMessage({ text: "You're seeking this round. Good luck!", tone: "info" }))}
                  className="flex-1 rounded-xl bg-gold px-4 py-2.5 font-semibold text-ink disabled:opacity-50 sm:flex-none"
                >
                  Seek
                </button>
                {phase === "join" && (
                  <button
                    disabled={pending || !me.canHide}
                    onClick={() =>
                      act(() => joinRound("hider"), () => setMessage({ text: "You're in! When the clock hits zero, we'll drop you somewhere in the city.", tone: "info" }))
                    }
                    className="flex-1 rounded-xl bg-ink px-4 py-2.5 font-semibold text-white disabled:opacity-40 sm:flex-none"
                  >
                    Hide · {state.prices.stake}
                  </button>
                )}
              </div>
              {phase === "join" && !me.canHide && (
                <p className="text-xs text-muted">Play one round as a seeker first, then you can hide.</p>
              )}
            </div>
          ) : phase === "join" ? (
            <p className="text-sm text-muted">
              {isHider
                ? "You're in. When the clock hits zero you'll be dropped somewhere random."
                : "You're seeking. The hunt starts when the clock hits zero."}{" "}
              Watch the city grow as people join.
            </p>
          ) : isSeeker ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <ModeButton on={mode === "search"} onClick={() => setMode("search")}>
                  Search · {me.freeSearch ? "free" : short(round.searchPrice)}
                </ModeButton>
                <ModeButton on={mode === "sweep"} onClick={() => setMode("sweep")}>
                  Sweep · {sweepWait > 0 ? `${Math.ceil(sweepWait / 1000)}s` : short(round.sweepPrices[radius])}
                </ModeButton>
                {mode === "sweep" && (
                  <select
                    value={radius}
                    onChange={(e) => setRadius(Number(e.target.value) as 1 | 2 | 3)}
                    className="rounded-lg border border-line bg-panel px-2 py-1.5"
                  >
                    <option value={1}>Small area · {short(round.sweepPrices[1])}</option>
                    <option value={2}>Medium area · {short(round.sweepPrices[2])}</option>
                    <option value={3}>Large area · {short(round.sweepPrices[3])}</option>
                  </select>
                )}
              </div>
              <p className="text-xs text-muted">
                {mode === "search"
                  ? "Tap anywhere in the city to search that spot."
                  : "Tap a spot and a drone will check the area around it. It only tells you yes or no."}
              </p>
            </div>
          ) : entry.caught ? (
            <p className="text-sm text-hit">You&apos;ve been found. Hang around and watch the rest of the hunt, or try again next round.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {frozenWait > 0 && (
                <p className="rounded-xl bg-hit/10 px-3 py-2 font-medium text-hit">
                  📡 A drone has you pinned. You can&apos;t move for {Math.ceil(frozenWait / 1000)}s.
                </p>
              )}
              {frozenWait <= 0 && recentlySwept && (
                <p className="rounded-xl bg-[#4dabf7]/15 px-3 py-2 font-medium text-[#1864ab]">
                  📡 A drone just swept your area. Seekers know someone&apos;s close. Maybe time to move?
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-me/15 px-2.5 py-1 text-xs font-semibold text-me">
                  {frozenWait > 0 ? `Pinned for ${Math.ceil(frozenWait / 1000)}s` : moveWait > 0 ? `Next move in ${clock(moveWait)}` : "You can move now"}
                </span>
                <span className="text-xs text-muted">
                  {state.prices.moveFee} coins a move · {entry.moves} move{entry.moves === 1 ? "" : "s"} so far
                </span>
              </div>
              {state.outlook && (
                <p className="rounded-xl bg-me/10 px-3 py-2">
                  Stay hidden and you walk away with about <b>{short(state.outlook.stakeBack + state.outlook.share)}</b> coins:{" "}
                  <span className="text-muted">
                    your {short(state.outlook.stakeBack)} back, plus {short(state.outlook.share)} from the pool so far.
                  </span>
                </p>
              )}
              <p className="text-xs text-muted">You&apos;re under the green light. Tap another spot if you want to move.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function FeedIcon({ tone }: { tone: Notice["tone"] }) {
  if (tone === "alarm") return <Siren />;
  if (tone === "mine") return <span className="mt-0.5 shrink-0 text-sm leading-none">📡</span>;
  return <span className="mt-1 size-2.5 shrink-0 rounded-full bg-gold" />;
}

function Siren() {
  return (
    <span className="relative mt-0.5 grid size-4 shrink-0 place-items-center" aria-hidden>
      <span className="absolute inset-0 animate-ping rounded-full bg-hit/60" />
      <span className="relative size-3 rounded-full bg-hit [animation:siren_0.5s_steps(1)_infinite]" />
    </span>
  );
}

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  // The sheet opens as a finger lifts off the city; the browser then sends a "click" to
  // whatever is now under it (this backdrop). Only close for taps that START on the backdrop.
  const downOnBackdrop = useRef(false);
  return (
    <div
      className="fixed inset-0 z-40 grid place-items-end bg-ink/25 p-3 backdrop-blur-[2px] sm:place-items-center"
      onPointerDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
    >
      <section className="w-full max-w-sm rounded-3xl bg-panel p-5 shadow-2xl">
        {children}
      </section>
    </div>
  );
}

function BillboardSheet({ board, address, onClose }: { board: { id: string; tile: number }; address: string; onClose: () => void }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const input = "w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-gold";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const res = await requestAd({ billboard: `${board.id} (${address})`, name, contact, message: note });
    if (res.ok) setState("sent");
    else {
      setState("idle");
      setError(res.error);
    }
  }

  return (
    <Sheet onClose={onClose}>
      {state === "sent" ? (
        <div className="text-center">
          <h2 className="font-display text-xl font-bold">Thanks!</h2>
          <p className="mt-2 text-sm text-muted">We&apos;ll be in touch about putting your brand on the billboard at {address}.</p>
          <button onClick={onClose} className="mt-4 w-full rounded-xl bg-gold py-2.5 font-semibold">
            Back to the city
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Billboard · {address}</p>
            <h2 className="font-display text-xl font-bold">Put your brand here</h2>
            <p className="mt-1 text-sm text-muted">
              Everyone playing in this part of the city sees this board. Leave your details and we&apos;ll get back to you with prices and dates.
            </p>
          </div>
          <input className={input} placeholder="Your name or business" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className={input} placeholder="Email or phone number" value={contact} onChange={(e) => setContact(e.target.value)} required />
          <textarea className={`${input} h-20 resize-none`} placeholder="What would you like to advertise? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <p className="text-sm text-hit">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
              Not now
            </button>
            <button disabled={state === "sending"} className="flex-1 rounded-xl bg-gold py-2.5 font-semibold disabled:opacity-50">
              {state === "sending" ? "Sending…" : "Get in touch"}
            </button>
          </div>
        </form>
      )}
    </Sheet>
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
