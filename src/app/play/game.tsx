"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addressOf, makePlan, tileAt } from "@/lib/city/layout";
import { cleanAvatar } from "@/lib/avatar";
import type { GameEvent, GameState } from "@/lib/game";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { buyShield, joinRound, moveTo, requestAd, searchTile, sweepAround, type ActionResult } from "./actions";
import { AvatarEditor } from "./avatar-editor";
import { Chat } from "./chat";
import type { CityEvent, CityMarkers } from "./city-view";
import { HowItWorks } from "./how-it-works";
import { Menu } from "./menu";
import { FeedRow, NotificationsPanel, type FeedItem } from "./notifications";
import { claimBalloon, recordVisit } from "./profile-actions";
import { Results } from "./results";
import { Sheet } from "./sheet";
import { playSfx, setSfxEnabled, useCitySound } from "./sound";
import { StatsCard } from "./stats-card";

// The 3D city only runs in the browser.
const CityView = dynamic(() => import("./city-view").then((m) => m.CityView), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-muted">Building the city…</div>,
});

type Mode = "search" | "sweep";
type Notice = { id: number; text: string; tone: "alarm" | "move" | "info" | "mine"; avatar?: ReturnType<typeof cleanAvatar> | null };

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
function useOnline(userId: string, guest: boolean) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const supabase = createClient();
    // Everyone watching without an account gets their own random key, so each one counts.
    const key = guest ? `guest-${Math.random().toString(36).slice(2)}` : userId;
    const channel = supabase.channel("city-online", { config: { presence: { key } } });
    channel
      .on("presence", { event: "sync" }, () => setCount(Object.keys(channel.presenceState()).length))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ at: Date.now() });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, guest]);
  return count;
}

function describe(e: GameEvent, botName: string, myTile: number | null, where: (tile: number) => string): Notice | null {
  if (e.kind === "caught") {
    const who = e.detail?.finder ?? "Someone";
    if (e.detail?.how === "walked_in") return { id: e.id, tone: "alarm", text: `A hider wandered onto a searched spot and got caught! ${who} gets the credit.` };
    const hiders = (e.detail?.hiders ?? []).filter((h) => !h.bot);
    const first = hiders[0];
    if (e.detail?.bot && !hiders.length) return { id: e.id, tone: "alarm", text: `${who} found ${botName}, the bot!` };
    const names = hiders.map((h) => h.name ?? "a hider");
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? (e.detail?.count && e.detail.count > 1 ? `${e.detail.count} hiders` : "a hider"));
    return {
      id: e.id,
      tone: "alarm",
      text: `${who} caught ${list} at ${where(e.tile)}!`,
      avatar: first ? cleanAvatar(first.avatar, first.name ?? "hider") : null,
    };
  }
  if (e.kind === "shielded") {
    const saved = e.detail?.hiders ?? [];
    const names = saved.map((h) => h.name ?? "a hider").join(" and ") || "A hider";
    return {
      id: e.id,
      tone: "alarm",
      text: `🛡️ ${names}'s shield blocked ${e.detail?.finder ?? "a seeker"} at ${where(e.tile)}! They teleported somewhere nearby.`,
      avatar: saved[0] ? cleanAvatar(saved[0].avatar, saved[0].name ?? "hider") : null,
    };
  }
  if (e.kind === "moved") {
    if (myTile !== null && e.tile === myTile) return null;
    const name = e.detail?.name;
    return { id: e.id, tone: "move", text: `${name ? (e.detail?.bot ? `${name} (the bot)` : name) : "Someone"} just slipped away from ${where(e.tile)}.` };
  }
  return null;
}

// A different cheer every time the hunt begins (never the same one twice in a row).
const CHEERS = {
  seeker: [
    ["Start hunting!", "They're out there. Somewhere. Go get them."],
    ["Release the hounds!", "Every rooftop, every alley. Nobody hides forever."],
    ["Ready, set, SEEK!", "The clock is ticking and the pool is waiting."],
    ["The hunt is on 🔍", "Trust your gut. Check the weird spots."],
    ["Eyes open, detective", "Somebody just held their breath. Find them."],
    ["Game time!", "First catch gets the bragging rights."],
    ["Go go go!", "Search smart, sweep smarter."],
    ["Hide-and-seek champion?", "Prove it. The city is yours to search."],
  ],
  hider: [
    ["Good luck! 🤫", "You've been dropped somewhere secret. Stay calm and stay hidden."],
    ["Shhh… it's started", "Seekers are coming. Don't make a sound."],
    ["Blend in!", "You're a lamppost now. Act natural."],
    ["Deep breath", "Outlast the hour and the pool is yours."],
    ["Into the shadows", "Every minute you survive is a minute closer to the prize."],
    ["They're coming…", "Watch the drones. Move only when you must."],
    ["Stay sneaky 🐾", "Nobody knows where you are. Keep it that way."],
  ],
  watcher: [
    ["The hunt has begun!", "Hiders are in place. Grab a seat and watch the city light up."],
    ["Showtime 🍿", "Seekers are on the move. Who'll be found first?"],
    ["Let the games begin!", "Join in any time as a hunter."],
    ["Here we go!", "Watch the searches land in real time."],
  ],
};

function startCheer(role: "hider" | "seeker" | null, hiders: number) {
  const list = CHEERS[role ?? "watcher"];
  let last = -1;
  try {
    last = Number(localStorage.getItem("hs-cheer") ?? -1);
  } catch {}
  let k = Math.floor(Math.random() * list.length);
  if (k === last) k = (k + 1) % list.length;
  try {
    localStorage.setItem("hs-cheer", String(k));
  } catch {}
  const [title, line] = list[k];
  return { title, line: `${line} ${hiders > 1 ? `${hiders} hiders are in the city` : "The bot is hiding somewhere"}.` };
}

export function Game({ state }: { state: GameState }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
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
  const [confirmHide, setConfirmHide] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [editAvatar, setEditAvatar] = useState(false);
  const [statsMin, setStatsMin] = useState(false);
  const [marks, setMarks] = useState(true);
  const [sound, setSound] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmShield, setConfirmShield] = useState(false);
  const [startCard, setStartCard] = useState<{ title: string; line: string } | null>(null);
  const online = useOnline(state.me.id, state.me.guest);

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
  // Where we are in the hunt (0 at the start, 1 at the end): drives day/night and weather.
  const huntProgress = round && phase === "seek"
    ? Math.min(1, Math.max(0, (now - Date.parse(round.joinEndsAt)) / (Date.parse(round.seekEndsAt) - Date.parse(round.joinEndsAt))))
    : phase === "done" ? 1 : 0;
  useCitySound(sound, roundSeed, huntProgress);
  useEffect(() => setSfxEnabled(sound), [sound]);
  const guest = me.guest;
  const shieldUp = Boolean(entry?.shieldBought && !entry.shieldSaved);

  // The last minute before the hunt: soft beeps (every other second, then every second for
  // the final ten).
  const joinLeft = round && phase === "join" ? Math.ceil((Date.parse(round.joinEndsAt) - now) / 1000) : null;
  useEffect(() => {
    if (joinLeft === null || joinLeft <= 0 || joinLeft > 60) return;
    if (joinLeft <= 10 || joinLeft % 2 === 0) playSfx("tick");
  }, [joinLeft]);

  // The hunt starts: a pop-up with a different cheer each time, and a fanfare.
  const lastPhase = useRef<{ round: number; phase: string } | null>(null);
  useEffect(() => {
    if (!round) return;
    const before = lastPhase.current;
    lastPhase.current = { round: round.id, phase };
    const startedNow = before && before.round === round.id && before.phase === "join" && phase === "seek";
    // Also when you open the game in the first few seconds of a hunt.
    const justStarted = phase === "seek" && now - Date.parse(round.joinEndsAt) < 15000;
    if (!startedNow && !justStarted) return;
    let shown = 0;
    try {
      shown = Number(localStorage.getItem("hs-start-shown") ?? 0);
    } catch {}
    if (shown === round.id) return;
    const card = startCheer(entry?.role ?? null, round.hidersTotal);
    const roundId = round.id;
    const id = setTimeout(() => {
      try {
        localStorage.setItem("hs-start-shown", String(roundId));
      } catch {}
      setStartCard(card);
      playSfx("start");
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id, phase]);
  useEffect(() => {
    if (!startCard) return;
    const id = setTimeout(() => setStartCard(null), 4200);
    return () => clearTimeout(id);
  }, [startCard]);

  // Passive income trickled in while you were away.
  const passiveGained = me.passiveGained;
  useEffect(() => {
    if (passiveGained <= 0) return;
    const id = setTimeout(
      () => setMessage({ text: `💤 Passive income: +${short(passiveGained)} coins. You earn up to ${short(state.prices.passivePerDay)} a day while you have under ${short(state.prices.passiveTarget)}.`, tone: "good" }),
      0,
    );
    return () => clearTimeout(id);
  }, [passiveGained, state.prices.passivePerDay, state.prices.passiveTarget]);

  // Remember your view settings on this device.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("hs-view") ?? "{}");
      const id = setTimeout(() => {
        if (typeof saved.statsMin === "boolean") setStatsMin(saved.statsMin);
        if (typeof saved.marks === "boolean") setMarks(saved.marks);
        if (typeof saved.sound === "boolean") setSound(saved.sound);
      }, 0);
      return () => clearTimeout(id);
    } catch {}
  }, []);
  const saveView = (patch: Record<string, boolean>) => {
    try {
      localStorage.setItem("hs-view", JSON.stringify({ statsMin, marks, sound, ...patch }));
    } catch {}
  };

  // Let people know when the city grows (each new hider adds spots at the edge).
  const lastTiles = useRef<number | null>(null);
  const tilesNow = round?.tileCount ?? 0;
  const roundNow = round?.id ?? 0;
  const lastRound = useRef(roundNow);
  useEffect(() => {
    if (lastRound.current !== roundNow) {
      lastRound.current = roundNow;
      lastTiles.current = tilesNow;
      return;
    }
    const before = lastTiles.current;
    lastTiles.current = tilesNow;
    if (before === null || tilesNow <= before) return;
    const grew = tilesNow - before;
    const id = setTimeout(
      () => setMessage({ text: `🏗️ The city just grew by ${grew} spots: ${grew >= 40 ? "new hiders are" : "a new hider is"} joining. Look at the edges!`, tone: "info" }),
      0,
    );
    return () => clearTimeout(id);
  }, [tilesNow, roundNow]);

  // Count this visit (once per browser session).
  useEffect(() => {
    try {
      if (sessionStorage.getItem("hs-visit")) return;
      sessionStorage.setItem("hs-visit", "1");
    } catch {}
    recordVisit();
  }, []);

  // Keep the board live: fetch fresh state every few seconds.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 4000);
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  // Everything worth knowing, newest first: public happenings (moves, catches) and private
  // notices for you (your trap went off, a drone swept you, you were found).
  const myLastSpot = isHider ? (entry?.visited.at(-1) ?? null) : null;
  const feed: FeedItem[] = useMemo(() => {
    const pub = state.events
      .map((e) => {
        const n = describe(e, botName, myLastSpot, where);
        return n ? ({ key: `e${e.id}`, at: e.at, text: n.text, tone: n.tone, avatar: n.avatar ?? null } as FeedItem) : null;
      })
      .filter((x): x is FeedItem => x !== null);
    const mine = state.notifications.map((n) => ({
      key: `n${n.id}`,
      at: n.at,
      text: n.tile !== null && n.kind === "trap" ? `${n.body} (near ${where(n.tile)})` : n.body,
      tone: n.kind === "caught" ? ("alarm" as const) : ("mine" as const),
      avatar: n.kind === "caught" || n.kind === "shield" ? me.avatar : null,
    }));
    return [...pub, ...mine].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 60);
  }, [state.events, state.notifications, botName, myLastSpot, where, me.avatar]);
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
    if (fresh.some((f) => f.key.startsWith("n") && f.tone === "alarm")) playSfx("caught");
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
    () => !marks
      ? { searchedEmpty: [], searchedHit: [], caught: [], left: [], me: isHider && entry && !entry.caught ? entry.tile : null, sweeps: [], pending: busy ? busyTile : null, recent: [], locked: [] }
      : ({
      searchedEmpty: state.mySearches.filter((s) => s.caught === 0).map((s) => s.tile),
      searchedHit: state.mySearches.filter((s) => s.caught > 0).map((s) => s.tile),
      caught: state.caughtTiles,
      left: state.leftTiles,
      me: isHider && entry && !entry.caught ? entry.tile : null,
      sweeps: state.mySweeps.map((sw) => ({ tile: sw.tile, radius: sw.radius, count: sw.found ? 1 : 0 })),
      pending: busy ? busyTile : null,
      recent: state.recentSearches.map((r) => ({ tile: r.tile, ageMs: Math.max(0, serverNowMs - Date.parse(r.at)) })),
      locked: state.knownSearched,
    }),
    [marks, state.mySearches, state.caughtTiles, state.leftTiles, state.recentSearches, state.knownSearched, state.mySweeps, serverNowMs, isHider, entry, busy, busyTile],
  );
  const cityEvents: CityEvent[] = useMemo(
    () => state.events.map((e) => ({ id: e.id, kind: e.kind, tile: e.tile, detail: e.detail, ageMs: Math.max(0, serverNowMs - Date.parse(e.at)) })),
    [state.events, serverNowMs],
  );

  // Runs a game action. You're free to tap again as soon as the server answers (well under a
  // second); the board catches up in the background.
  async function act(fn: () => Promise<ActionResult>, onOk: (data: Record<string, unknown>) => void) {
    setBusy(true);
    // A dropped connection must never take the whole page down: say so and carry on.
    let res: ActionResult;
    try {
      res = await fn();
    } catch {
      res = { ok: false, error: "The connection blinked. Give it another tap." };
    }
    setBusy(false);
    if (res.ok) onOk(res.data);
    else setMessage({ text: res.error, tone: "bad" });
    startTransition(() => router.refresh());
  }

  function onTile(tile: number) {
    if (busy || !canTap || !entry) return;
    if (isHider) {
      if (shieldUp) return setMessage({ text: "Your shield is up, so you're staying put until it's used.", tone: "info" });
      if (tile === entry.tile) return setMessage({ text: "You're already hiding there.", tone: "info" });
      if (entry.visited.includes(tile)) return setMessage({ text: "You've been there already. No going back.", tone: "bad" });
      if (knownSet.has(tile)) return setMessage({ text: "That spot's been searched (it's orange). Pick somewhere else.", tone: "bad" });
      if (frozenWait > 0) return setMessage({ text: `A drone has you pinned. You can move in ${clock(frozenWait)}.`, tone: "bad" });
      if (moveWait > 0) return setMessage({ text: `Catch your breath: you can move again in ${clock(moveWait)}.`, tone: "info" });
      return setConfirmMove(tile);
    }
    if (mode === "sweep") {
      if (sweepWait > 0) return setMessage({ text: `Your drone is recharging (${Math.ceil(sweepWait / 1000)}s).`, tone: "info" });
      setBusyTile(tile);
      playSfx("sweep");
      act(
        () => sweepAround(tile, radius),
        (d) => {
          const found = Boolean(d.found);
          setMessage({
            text: found
              ? `The drone picked something up! Anyone in that area is pinned for ${state.prices.freezeSeconds >= 60 ? `${Math.round(state.prices.freezeSeconds / 60)} minute${state.prices.freezeSeconds >= 120 ? "s" : ""}` : `${state.prices.freezeSeconds} seconds`}. Your drone keeps watching it as a trap.`
              : "The drone saw nothing there, for now. It'll keep watching the area as a trap.",
            tone: found ? "good" : "info",
          });
        },
      );
    } else {
      setBusyTile(tile);
      playSfx("search");
      act(
        () => searchTile(tile),
        (d) => {
          playSfx(d.result === "caught" ? "found" : d.result === "shielded" ? "shield" : "miss");
          if (d.result === "shielded")
            setMessage({
              text: `You found ${d.names || "someone"}, but their shield teleported them somewhere nearby! You still get +${short(Number(d.reward))} coins.`,
              tone: "good",
            });
          else if (d.result === "caught")
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

  function popBalloon(slot: number) {
    startTransition(async () => {
      const res = await claimBalloon(slot).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
      if (res.ok) playSfx("pop");
      setMessage(
        res.ok
          ? { text: `🎈 Pop! +${res.coins} coins.${res.leftToday > 0 ? ` ${res.leftToday} more balloon${res.leftToday === 1 ? "" : "s"} today.` : " That's all for today."}`, tone: "good" }
          : { text: res.error, tone: "info" },
      );
      router.refresh();
    });
  }

  function doMove(tile: number) {
    setConfirmMove(null);
    setBusyTile(tile);
    playSfx("move");
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
          meAvatar={me.avatar}
          coinBalloon={state.balloon?.slot ?? null}
          onBalloon={popBalloon}
          progress={huntProgress}
          nightFirst={round.id % 2 === 1}
        />
      )}

      {/* Top: round clock and numbers (stacked, so big numbers fit) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
        {round ? (
          <StatsCard
            city={plan.city.name}
            phase={phase}
            countdown={countdown}
            hidden={round.hidersRemaining}
            hidersTotal={round.hidersTotal}
            pool={round.pool}
            tiles={round.tileCount}
            online={online}
            visits={state.site.visits}
            players={state.site.players}
            minimised={statsMin}
            onToggle={() => { setStatsMin(!statsMin); saveView({ statsMin: !statsMin }); }}
            marks={marks}
            onMarks={() => { setMarks(!marks); saveView({ marks: !marks }); }}
            sound={sound}
            onSound={() => { setSound(!sound); saveView({ sound: !sound }); }}
          />
        ) : (
          <span />
        )}
        <div className="flex flex-col items-end gap-2">
          {guest ? (
            <div className="pointer-events-auto flex items-center gap-2">
              <button onClick={() => setHowOpen(true)} className="glass grid h-9 w-9 shrink-0 place-items-center rounded-full font-display font-bold" aria-label="How it works">
                ?
              </button>
              <Link href="/login" className="whitespace-nowrap rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink shadow">
                Sign in to play
              </Link>
            </div>
          ) : (
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
          )}
        </div>
      </div>

      {/* Latest notices pop up under the bell; the bell opens the full list. */}
      <div className={cn("pointer-events-none absolute right-3 z-10 flex w-[min(19rem,calc(100vw-1.5rem))] flex-col items-end gap-1.5 sm:right-4 sm:top-16", statsMin ? "top-16" : "top-[16.5rem]")}>
        {!feedOpen &&
          !menu &&
          toasts.map((n) => (
            <button
              key={n.key}
              onClick={() => { setFeedOpen(true); setFeedSeenAt(new Date(now).toISOString()); setToasts([]); }}
              className="glass pointer-events-auto w-full rounded-2xl px-3 py-2 text-left shadow-lg"
            >
              <FeedRow item={n} now={now} compact />
            </button>
          ))}
      </div>
      {feedOpen && <NotificationsPanel feed={feed} now={now} onClose={() => setFeedOpen(false)} />}

      {menu && (
        <Menu
          me={me}
          city={plan.city.name}
          hasResults={Boolean(state.results)}
          onClose={() => setMenu(false)}
          onHowItWorks={() => { setMenu(false); setHowOpen(true); }}
          onEditAvatar={() => { setMenu(false); setEditAvatar(true); }}
          onResults={() => { setMenu(false); if (state.results) setShowResults(state.results.roundId); }}
          onChangePin={() => router.push("/welcome")}
          onSignOut={() => { setMenu(false); setConfirmSignOut(true); }}
        />
      )}
      {howOpen && <HowItWorks onClose={() => setHowOpen(false)} />}
      {editAvatar && (
        <AvatarEditor
          initial={me.avatar}
          onClose={() => setEditAvatar(false)}
          onSaved={() => { setEditAvatar(false); setMessage({ text: "Looking good! Your new look is saved.", tone: "good" }); router.refresh(); }}
        />
      )}
      {startCard && (
        <button
          onClick={() => setStartCard(null)}
          className="absolute inset-0 z-40 grid place-items-center bg-ink/25 px-6 backdrop-blur-[2px]"
          aria-label="Close"
        >
          <div className="start-pop glass w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl">
            <p className="text-5xl">{entry?.role === "hider" ? "🤫" : entry?.role === "seeker" ? "🔦" : "🎬"}</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold">{startCard.title}</h2>
            <p className="mt-2 text-sm text-ink/80">{startCard.line}</p>
          </div>
        </button>
      )}

      {confirmShield && entry && (
        <Sheet onClose={() => setConfirmShield(false)}>
          <h2 className="font-display text-xl font-bold">🛡️ Raise a shield?</h2>
          <div className="mt-3 rounded-2xl bg-[#7048e8]/10 p-4 text-center">
            <p className="text-sm text-muted">It costs</p>
            <p className="font-display text-4xl font-extrabold">{short(state.prices.shield)} coins</p>
            <p className="text-xs text-muted">You have {short(me.coins)}. One shield per game.</p>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-ink/80">
            <li>✨ The next time a seeker finds you, the shield teleports you to a free spot nearby and you stay in the game.</li>
            <li>💸 You still lose your stake to that seeker, but you can keep playing for the pool.</li>
            <li>🧱 While the shield is up you <b>can&apos;t move</b>. Once it has saved you, you can move again.</li>
            <li>🎲 The teleport is random: it could land you on a spot that was already searched.</li>
          </ul>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirmShield(false)} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
              Not now
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setConfirmShield(false);
                act(buyShield, () => {
                  playSfx("shield");
                  setMessage({ text: "🛡️ Shield up! The next find just teleports you. Sit tight until then.", tone: "good" });
                });
              }}
              className="flex-1 rounded-xl bg-[#7048e8] py-2.5 font-semibold text-white disabled:opacity-50"
            >
              Raise shield · {short(state.prices.shield)}
            </button>
          </div>
        </Sheet>
      )}

      {confirmHide && round && (
        <Sheet onClose={() => setConfirmHide(false)}>
          <h2 className="font-display text-xl font-bold">Hide this round?</h2>
          <div className="mt-3 rounded-2xl bg-panel-2 p-4 text-center">
            <p className="text-sm text-muted">You&apos;re putting down</p>
            <p className="font-display text-4xl font-extrabold">{short(state.prices.stake)} coins</p>
            <p className="text-xs text-muted">You have {short(me.coins)}. After this: {short(Math.max(0, me.coins - state.prices.stake))}.</p>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-ink/80">
            <li>✅ Stay hidden till the end: you get your {short(state.prices.stake)} back, and the survivors share {Math.round(state.prices.winShare * 100)}% of the pool (it starts at 0 and grows with every search, sweep and move).</li>
            <li>❌ Get caught: the seeker who finds you keeps most of your stake. If every hider is found, seekers take {Math.round(state.prices.winShare * 100)}% of the pool and the hiders share {Math.round(state.prices.otherShare * 100)}%.</li>
            <li>🛡️ Once the hunt starts you can buy a one-time shield ({short(state.prices.shield)} coins).</li>
            <li>🚶 Moving costs {short(state.prices.moveFee)} coins each time.</li>
          </ul>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirmHide(false)} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
              Not now
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setConfirmHide(false);
                act(() => joinRound("hider"), () => setMessage({ text: "You're in! When the clock hits zero, we'll drop you somewhere in the city.", tone: "info" }));
              }}
              className="flex-1 rounded-xl bg-ink py-2.5 font-semibold text-white disabled:opacity-50"
            >
              Stake {short(state.prices.stake)} & hide
            </button>
          </div>
        </Sheet>
      )}

      {showResults && state.results?.roundId === showResults && (
        <Results results={state.results} onClose={() => setShowResults(null)} me={me.name ?? "Me"} city={plan.city.name} />
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
          {round && !guest && (
            <Chat
              meId={me.id}
              meRole={entry?.role ?? null}
              roundId={round.id}
              players={state.players}
              open={chatOpen}
              onOpenChange={setChatOpen}
            />
          )}
        </div>

        <div className="glass pointer-events-auto w-full max-w-xl rounded-2xl p-3">
          {!round || phase === "done" ? (
            <p className="text-sm text-muted">Building the next city…</p>
          ) : guest ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-muted">
                <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-hit align-middle" />
                <b className="text-ink">Watching live.</b>{" "}
                {phase === "join"
                  ? `Hiders are getting ready. The hunt starts in ${countdown}.`
                  : `The hunt is on: ${short(round.hidersRemaining)} still hidden, ${short(round.pool)} coins in the pool.`}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setHowOpen(true)} className="flex-1 rounded-xl bg-panel-2 px-4 py-2.5 font-semibold sm:flex-none">
                  How it works
                </button>
                <Link href="/login" className="flex-1 rounded-xl bg-gold px-4 py-2.5 text-center font-semibold text-ink sm:flex-none">
                  Play now
                </Link>
              </div>
            </div>
          ) : !entry ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-muted">
                {phase === "join"
                  ? "Hiders are getting ready and the city's growing. Want to hide, or hunt?"
                  : "The hunt is on. Jump in as a seeker and start searching."}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => act(() => joinRound("seeker"), () => setMessage({ text: "You're hunting this round. Good luck!", tone: "info" }))}
                  className="flex-1 rounded-xl bg-gold px-4 py-2.5 font-semibold text-ink disabled:opacity-50 sm:flex-none"
                >
                  Hunt
                </button>
                {phase === "join" && (
                  <button
                    disabled={busy || !me.canHide}
                    onClick={() => setConfirmHide(true)}
                    className="flex-1 rounded-xl bg-ink px-4 py-2.5 font-semibold text-white disabled:opacity-40 sm:flex-none"
                  >
                    Hide · {state.prices.stake}
                  </button>
                )}
              </div>
              {phase === "join" && !me.canHide && (
                <p className="text-xs text-muted">Play one round as a hunter first, then you can hide.</p>
              )}
            </div>
          ) : phase === "join" ? (
            <p className="text-sm text-muted">
              {isHider
                ? "You're in. When the clock hits zero you'll be dropped somewhere random."
                : "You're hunting. It starts when the clock hits zero."}{" "}
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
                <div className="rounded-xl bg-hit/10 px-3 py-2 font-medium text-hit">
                  <div className="flex items-center justify-between gap-2">
                    <span>📡 A drone has you pinned. No moving for now.</span>
                    <span className="font-display text-lg font-bold tabular-nums">{clock(frozenWait)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hit/15">
                    <div
                      className="h-full rounded-full bg-hit transition-[width] duration-1000 ease-linear"
                      style={{ width: `${Math.min(100, (frozenWait / (state.prices.freezeSeconds * 1000)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {frozenWait <= 0 && recentlySwept && (
                <p className="rounded-xl bg-[#4dabf7]/15 px-3 py-2 font-medium text-[#1864ab]">
                  📡 A drone just swept your area. Seekers know someone&apos;s close. Maybe time to move?
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-me/15 px-2.5 py-1 text-xs font-semibold text-me">
                  {shieldUp ? "Shield up: staying put" : frozenWait > 0 ? `Pinned for ${clock(frozenWait)}` : moveWait > 0 ? `Next move in ${clock(moveWait)}` : "You can move now"}
                </span>
                <span className="text-xs text-muted">
                  {state.prices.moveFee} coins a move · {entry.moves} move{entry.moves === 1 ? "" : "s"} so far
                </span>
                {!entry.shieldBought ? (
                  <button
                    onClick={() => setConfirmShield(true)}
                    className="ml-auto rounded-full bg-[#7048e8] px-3 py-1 text-xs font-semibold text-white shadow-sm"
                  >
                    🛡️ Shield · {short(state.prices.shield)}
                  </button>
                ) : (
                  <span className="ml-auto rounded-full bg-[#7048e8]/12 px-2.5 py-1 text-xs font-semibold text-[#5f3dc4]">
                    {entry.shieldSaved ? "🛡️ Shield used" : "🛡️ Shield up"}
                  </span>
                )}
              </div>
              {state.outlook && (
                <p className="rounded-xl bg-me/10 px-3 py-2">
                  Stay hidden and you walk away with about <b>{short(state.outlook.stakeBack + state.outlook.share)}</b> coins:{" "}
                  <span className="text-muted">
                    your {short(state.outlook.stakeBack)} back, plus {short(state.outlook.share)} from the pool so far.
                  </span>
                </p>
              )}
              <p className="text-xs text-muted">That&apos;s your face over your hiding spot. Tap another spot if you want to move.</p>
            </div>
          )}
        </div>
      </div>
    </main>
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
