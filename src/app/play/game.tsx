"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addressOf, makePlan, tileAt } from "@/lib/city/layout";
import { cleanAvatar } from "@/lib/avatar";
import type { GameEvent, GameState } from "@/lib/game";
import { cn } from "@/lib/cn";
import {
  Anchor,
  Building2,
  Check,
  CircleX,
  DoorOpen,
  Layers,
  LogOut,
  Sun,
  Clapperboard,
  Dices,
  Gamepad2,
  Repeat1,
} from "lucide-react";
/** Any of our line icons (Lucide or our own). */
type LucideIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties; "aria-hidden"?: boolean }>;
import {
  Coins,
  CircleHelp,
  Drama,
  Flashlight,
  Footprints,
  Ghost,
  Hammer,
  HotAirBalloon,
  Lightbulb,
  Lock,
  MapPin,
  Megaphone,
  Menu as MenuIcon,
  MessageCircle,
  Radar,
  RotateCcw,
  Shield,
  Sparkles,
  Timer,
  Trophy,
  Users,
  X,
} from "@/components/icons";
import { short } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { bigSearch, buyShield, joinRound, moveTo, placeDecoy, respawnMe, searchTile, sweepAround, type ActionResult } from "./actions";
import { AvatarEditor } from "./avatar-editor";
import { Chat } from "./chat";
import type { CityEvent, CityMarkers } from "./city-view";
import { HowItWorks } from "./how-it-works";
import { Menu } from "./menu";
import { FeedRow, NotificationsPanel, type FeedIcon, type FeedItem } from "./notifications";
import { claimBalloon, recordVisit } from "./profile-actions";
import { Results } from "./results";
import { balloonRoom, useRooms, type RoomInfo } from "./rooms";
import { Sheet } from "./sheet";
import { AdvertiseExplainer } from "@/components/advertise-explainer";
import { playSfx, setSfxEnabled, useCitySound } from "./sound";
import { StatsCard } from "./stats-card";

// The 3D city only runs in the browser.
const CityView = dynamic(() => import("./city-view").then((m) => m.CityView), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-muted">Building the city…</div>,
});

type Mode = "search" | "sweep" | "big";
/** A building or balloon you can go into (from the 3D city), with its levels. */
type PlaceRoom = {
  id: string;
  name: string;
  capacity: number;
  kind: "building" | "balloon";
  levels?: { id: string; label: string; capacity: number }[];
};
// Same order as the balloons in the 3D city.
const BALLOON_NAMES = ["Red", "Yellow", "Blue", "Purple", "Mint"];
const BALLOON_COLOURS = ["#e5484d", "#f5a524", "#2f6fd1", "#7048e8", "#12a37a"];
type Ad = { id: string; image: string; headline: string; brand: string; link: string | null };
type Notice = { id: number; text: string; tone: "alarm" | "move" | "info" | "mine"; avatar?: ReturnType<typeof cleanAvatar> | null; icon?: FeedIcon };

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
    if (e.detail?.how === "walked_in") return { id: e.id, tone: "alarm", text: `A ghost wandered onto a searched spot and got caught! ${who} gets the credit.` };
    const ghosts = (e.detail?.hiders ?? []).filter((h) => !h.bot);
    const first = ghosts[0];
    if (e.detail?.bot && !ghosts.length) return { id: e.id, tone: "alarm", text: `${who} found ${botName}, the bot!` };
    const names = ghosts.map((h) => h.name ?? "a ghost");
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? (e.detail?.count && e.detail.count > 1 ? `${e.detail.count} ghosts` : "a ghost"));
    // Catching a seasoned player is big news.
    const top = ghosts.reduce((m, h) => Math.max(m, h.level ?? 0), 0);
    const fish = top >= 20 ? "Whale of a catch! " : top >= 10 ? "Big fish caught! " : top >= 5 ? "Nice catch! " : "";
    const lvl = top >= 5 ? ` (level ${top})` : "";
    return {
      id: e.id,
      tone: "alarm",
      text: `${fish}${who} caught ${list}${ghosts.length === 1 ? lvl : ""} at ${where(e.tile)}!`,
      icon: top >= 20 ? "whale" : top >= 10 ? "fish" : "catch",
      avatar: first ? cleanAvatar(first.avatar, first.name ?? "ghost") : null,
    };
  }
  if (e.kind === "decoy") return { id: e.id, tone: "info", icon: "decoy", text: "Someone just set down a decoy somewhere in the city. Careful what you search!" };
  if (e.kind === "decoy_found") {
    const who = e.detail?.finder ?? "A hunter";
    return {
      id: e.id,
      tone: "info",
      text: e.detail?.outcome === "explode"
        ? `Boom! ${who} searched ${where(e.tile)} and hit a decoy.`
        : `Squeak! ${who} searched ${where(e.tile)} and found a toy. It was a decoy.`,
      icon: e.detail?.outcome === "explode" ? "boom" : "toy",
    };
  }
  if (e.kind === "respawn") {
    const name = e.detail?.name ?? "A ghost";
    return {
      id: e.id,
      tone: "alarm",
      text: `${name} respawned! They're back in hiding somewhere in the city.`,
      icon: "respawn",
      avatar: e.detail?.avatar ? cleanAvatar(e.detail.avatar, name) : null,
    };
  }
  if (e.kind === "shielded") {
    const saved = e.detail?.hiders ?? [];
    const names = saved.map((h) => h.name ?? "a ghost").join(" and ") || "A ghost";
    return {
      id: e.id,
      tone: "alarm",
      text: `${names}'s shield blocked ${e.detail?.finder ?? "a hunter"} at ${where(e.tile)}! They teleported somewhere nearby.`,
      icon: "shield",
      avatar: saved[0] ? cleanAvatar(saved[0].avatar, saved[0].name ?? "ghost") : null,
    };
  }
  if (e.kind === "moved") {
    if (myTile !== null && e.tile === myTile) return null;
    const name = e.detail?.name;
    return { id: e.id, tone: "move", icon: "move", text: `${name ? (e.detail?.bot ? `${name} (the bot)` : name) : "Someone"} just slipped away from ${where(e.tile)}.` };
  }
  return null;
}

// A different cheer every time the hunt begins (never the same one twice in a row).
const CHEERS = {
  seeker: [
    ["Start hunting!", "They're out there. Somewhere. Go get them."],
    ["Release the hounds!", "Every rooftop, every alley. Nobody hides forever."],
    ["Ready, set, SEEK!", "The clock is ticking and the pool is waiting."],
    ["The hunt is on", "Trust your gut. Check the weird spots."],
    ["Eyes open, detective", "Somebody just held their breath. Find them."],
    ["Game time!", "First catch gets the bragging rights."],
    ["Go go go!", "Search smart, sweep smarter."],
    ["Hide-and-seek champion?", "Prove it. The city is yours to search."],
  ],
  hider: [
    ["Good luck!", "You've been dropped somewhere secret. Stay calm and stay hidden."],
    ["Shhh… it's started", "Hunters are coming. Don't make a sound."],
    ["Blend in!", "You're a lamppost now. Act natural."],
    ["Deep breath", "Outlast the hour and the pool is yours."],
    ["Into the shadows", "Every minute you survive is a minute closer to the prize."],
    ["They're coming…", "Watch the drones. Move only when you must."],
    ["Stay sneaky", "Nobody knows where you are. Keep it that way."],
  ],
  watcher: [
    ["The hunt has begun!", "Ghosts are in place. Grab a seat and watch the city light up."],
    ["Showtime", "Hunters are on the move. Who'll be found first?"],
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
  return { title, line: `${line} ${hiders > 1 ? `${hiders} ghosts are in the city` : "The bot is hiding somewhere"}.` };
}

export function Game({ state }: { state: GameState }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("search");
  const [radius, setRadius] = useState<1 | 2 | 3>(1);
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" | "info"; icon?: LucideIcon } | null>(null);
  const [busyTile, setBusyTile] = useState<number | null>(null);
  const [hover, setHover] = useState<{ tile: number; label: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showResults, setShowResults] = useState<number | null>(null);
  const [confirmMove, setConfirmMove] = useState<number | null>(null);
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
  const [confirmDecoy, setConfirmDecoy] = useState(false);
  const [confirmHunt, setConfirmHunt] = useState(false);
  // Game mode (search, move…) or Chat mode (go into buildings and balloons to talk).
  const [viewMode, setViewMode] = useState<"game" | "chat">("game");
  const [ride, setRide] = useState<number | null>(null);
  // Inside a building: which one, and which level (ground "g", floor "f<n>", rooftop "r").
  const [place, setPlace] = useState<{ building: string; level: string } | null>(null);
  const [pickPlace, setPickPlace] = useState<PlaceRoom | null>(null);
  const [placeRoom, setPlaceRoom] = useState<PlaceRoom | null>(null);
  const [pickBalloon, setPickBalloon] = useState(false);
  const [npcTap, setNpcTap] = useState<{ id: string; at: number } | null>(null);
  const [balloonCount, setBalloonCount] = useState(0);
  const [dmRequest, setDmRequest] = useState<{ id: string; name: string; at: number } | null>(null);
  const [placingDecoy, setPlacingDecoy] = useState(false);
  const [confirmRespawn, setConfirmRespawn] = useState(false);
  const [searchReadyAt, setSearchReadyAt] = useState<number>(0);
  const [ads, setAds] = useState<Ad[]>([]);
  const [openAd, setOpenAd] = useState<{ ad: Ad; tile: number; reward: string | null } | null>(null);
  const [advertise, setAdvertise] = useState<{ tile: number } | null>(null);
  const [ctrlHint, setCtrlHint] = useState(false);
  const [adExplainer, setAdExplainer] = useState(false);
  const [startCard, setStartCard] = useState<{ title: string; line: string } | null>(null);
  const online = useOnline(state.me.id, state.me.guest);
  const rooms = useRooms(state.round?.id ?? null, state.me.guest ? null : { id: state.me.id, name: state.me.name ?? "Player", avatar: state.me.avatar }, {
    onRideEnd: () => setRide(null),
  });

  const { round, entry, me } = state;
  const now = useNow(state.serverNow);
  const phase = round?.status ?? "done";
  const countdown = clock(Date.parse((phase === "join" ? round?.joinEndsAt : round?.seekEndsAt) ?? "") - now);
  const isHider = entry?.role === "hider";
  const isSeeker = entry?.role === "seeker";
  const moveWait = entry?.lastMoveAt ? Date.parse(entry.lastMoveAt) + state.prices.moveCooldown * 1000 - now : 0;
  const sweepWait = entry?.sweepReadyAt ? Date.parse(entry.sweepReadyAt) - now : 0;
  const frozenWait = entry?.frozenUntil ? Date.parse(entry.frozenUntil) - now : 0;
  const recentlySwept =
    isHider &&
    !!entry?.lastSweptAt &&
    now - Date.parse(entry.lastSweptAt) < 90_000 &&
    (!entry.lastMoveAt || Date.parse(entry.lastSweptAt) > Date.parse(entry.lastMoveAt));
  const canTap = phase === "seek" && !!entry && !(isHider && entry.caught);
  // Searches have a short cooldown that grows if you search too fast (the server decides).
  const serverReady = me.searchReadyAt ? Date.parse(me.searchReadyAt) : 0;
  const searchWait = Math.max(searchReadyAt, serverReady) - now;
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
      () => setMessage({ icon: Coins, text: `Passive income: +${short(passiveGained)} coins. You earn up to ${short(state.prices.passivePerDay)} a day while you have under ${short(state.prices.passiveTarget)}.`, tone: "good" }),
      0,
    );
    return () => clearTimeout(id);
  }, [passiveGained, state.prices.passivePerDay, state.prices.passiveTarget]);

  // Billboard ads: a fresh mix every few minutes. Views are counted by the 3D city and sent
  // in small batches.
  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch("/api/ads/serve?n=24", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { ads: [] }))
        .then((d: { ads?: Ad[] }) => !stop && setAds(Array.isArray(d.ads) ? d.ads : []))
        .catch(() => {});
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);
  const onAdViews = useCallback((views: Record<string, number>) => {
    if (!Object.keys(views).length) return;
    fetch("/api/ads/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ views }), keepalive: true }).catch(() => {});
  }, []);
  async function onBillboardTap(info: { id: string; tile: number; adId: string | null }) {
    const ad = info.adId ? ads.find((a) => a.id === info.adId) : null;
    if (!ad) return setAdvertise({ tile: info.tile });
    setOpenAd({ ad, tile: info.tile, reward: null });
    try {
      const res = await fetch("/api/ads/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adId: ad.id }) });
      const d = (await res.json()) as { coins?: number; leftToday?: number; reason?: string };
      if (d.coins && d.coins > 0) {
        playSfx("pop");
        setOpenAd({ ad, tile: info.tile, reward: `+${d.coins} coins from ${ad.brand} for checking it out!${d.leftToday ? ` (${d.leftToday} more ad rewards today)` : " That's all your ad rewards for today."}` });
        startTransition(() => router.refresh());
      } else if (d.reason) {
        const why: Record<string, string> = {
          signed_out: "Sign in to earn 5 coins every time you check out an ad (up to 5 a day).",
          daily_limit: "You've had all 5 ad rewards for today. More tomorrow!",
          already_today: "You've already been rewarded for this ad today.",
          pool_empty: "This ad's coins have run out.",
        };
        setOpenAd({ ad, tile: info.tile, reward: why[d.reason] ?? null });
      }
    } catch {}
  }

  // On a computer, tell people they can hold Ctrl and drag to turn the city (once).
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    try {
      if (localStorage.getItem("hs-ctrl-hint")) return;
      localStorage.setItem("hs-ctrl-hint", "1");
    } catch {}
    const show = setTimeout(() => setCtrlHint(true), 1500);
    const hide = setTimeout(() => setCtrlHint(false), 12000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

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
      () => setMessage({ icon: Hammer, text: `The city just grew by ${grew} spots: ${grew >= 40 ? "new ghosts are" : "a new ghost is"} joining. Look at the edges!`, tone: "info" }),
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
        return n ? ({ key: `e${e.id}`, at: e.at, text: n.text, tone: n.tone, avatar: n.avatar ?? null, icon: n.icon } as FeedItem) : null;
      })
      .filter((x): x is FeedItem => x !== null);
    const mine = state.notifications.map((n) => ({
      key: `n${n.id}`,
      at: n.at,
      text: n.tile !== null && n.kind === "trap" ? `${n.body} (near ${where(n.tile)})` : n.body,
      tone: n.kind === "caught" ? ("alarm" as const) : ("mine" as const),
      avatar: n.kind === "caught" || n.kind === "shield" ? me.avatar : null,
      icon: (({ trap: "trap", trapped: "trap", swept: "drone", caught: "catch", shield: "shield", shielded: "shield", decoy: "decoy" }) as Record<string, FeedIcon>)[n.kind] ?? "info",
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
      ? { searchedEmpty: [], searchedHit: [], caught: [], left: [], me: isHider && entry && !entry.caught ? entry.tile : null, decoy: entry?.decoyTile ?? null, sweeps: [], pending: busy ? busyTile : null, recent: [], locked: [] }
      : ({
      searchedEmpty: state.mySearches.filter((s) => s.caught === 0).map((s) => s.tile),
      searchedHit: state.mySearches.filter((s) => s.caught > 0).map((s) => s.tile),
      caught: state.caughtTiles,
      left: state.leftTiles,
      me: isHider && entry && !entry.caught ? entry.tile : null,
      decoy: entry?.decoyTile ?? null,
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

  // Chat mode: tapping a building or balloon takes you inside to chat with the people there.
  // Chat mode: tapping a building shows its levels (ground, floors, rooftop) to pick from;
  // nothing opens the chat by itself.
  function onRoom(room: PlaceRoom) {
    if (place || ride !== null) return; // inside somewhere: taps just look around
    if (room.kind === "balloon") return boardBalloon(Number(room.id.split(":")[1]));
    setPickPlace(room);
  }
  function goToLevel(room: PlaceRoom, level: { id: string; label: string; capacity: number }) {
    setPickPlace(null);
    const info: RoomInfo = {
      id: `${room.id}:${level.id}`,
      name: `${room.name} · ${level.label}`,
      capacity: level.capacity,
      kind: "building",
      building: room.id,
      level: level.id,
    } as RoomInfo;
    if (!guest) {
      const res = rooms.enter(info);
      if (!res.ok) return setMessage({ text: res.reason === "full" ? `${info.name} is full right now. Try another floor!` : "Sign in to chat here.", tone: "info" });
    }
    setRide(null);
    setPlaceRoom(room);
    setPlace({ building: room.id, level: level.id });
    setMessage({ icon: Building2, text: guest ? `Welcome to ${info.name}. Sign in to chat with the people here.` : `You're in ${info.name}. Drag to look around; tap Chat to talk to people here.`, tone: "info" });
  }
  function boardBalloon(k: number) {
    setPickBalloon(false);
    setPlace(null);
    if (!guest) {
      const res = rooms.enter({ id: balloonRoom(k), name: `Balloon ${k + 1}`, capacity: 1000, kind: "balloon" });
      if (!res.ok) return setMessage({ text: res.reason === "full" ? "That balloon is full. Try another one!" : "Sign in to ride.", tone: "info" });
    } else {
      // Watchers get the view for a while, but need to sign in to chat on board.
      setTimeout(() => setRide((r) => (r === k ? null : r)), 60_000);
    }
    setRide(k);
    setMessage({ icon: HotAirBalloon, text: guest ? "Enjoy the view! Sign in to chat with the people on board." : "Up we go! Drag to look around; tap Chat to talk to everyone on board.", tone: "info" });
  }
  function leaveRoom() {
    rooms.leave();
    setRide(null);
    setPlace(null);
  }

  function onTile(tile: number) {
    // Tapping where someone was caught: say hi to them.
    const face = state.caughtFaces.find((f) => f.tile === tile && f.user && f.user !== me.id);
    if (face?.user && !guest && !(isHider && placingDecoy)) {
      setDmRequest({ id: face.user, name: face.name ?? "Player", at: Date.now() });
      setChatOpen(true);
      return setMessage({ text: `${face.name ?? "They"} got caught here. Send them a message!`, tone: "info" });
    }
    if (busy || !canTap || !entry) return;
    if (isHider && placingDecoy) {
      if (tile === entry.tile) return setMessage({ text: "Put your decoy somewhere other than your own spot.", tone: "info" });
      setPlacingDecoy(false);
      setBusyTile(tile);
      playSfx("decoy");
      return act(
        () => placeDecoy(tile),
        () => setMessage({ icon: Drama, text: `Decoy set down at ${where(tile)}. Everyone heard a decoy went out, but only you know where.`, tone: "good" }),
      );
    }
    if (isHider) {
      if (shieldUp) return setMessage({ text: "Your shield is up, so you're staying put until it's used.", tone: "info" });
      if (tile === entry.tile) return setMessage({ text: "You're already hiding there.", tone: "info" });
      if (entry.visited.includes(tile)) return setMessage({ text: "You've been there already. No going back.", tone: "bad" });
      if (knownSet.has(tile)) return setMessage({ text: "That spot's been searched (it's orange). Pick somewhere else.", tone: "bad" });
      if (frozenWait > 0) return setMessage({ text: `A drone has you pinned. You can move in ${clock(frozenWait)}.`, tone: "bad" });
      if (entry.moves >= entry.movesAllowed)
        return setMessage({ text: `You've used your ${entry.movesAllowed === 1 ? "move" : `${entry.movesAllowed} moves`} for this game. Level up to get more moves per game.`, tone: "info" });
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
          // Don't spoil it: the answer comes when the drone has finished its scan.
          setMessage({ icon: Radar, text: "Drone on its way… scanning the area.", tone: "info" });
          setTimeout(() => {
            playSfx(found ? "found" : "miss");
            setMessage({
              text: found
                ? `The drone picked something up! Anyone in that area is pinned for ${state.prices.freezeSeconds >= 60 ? `${Math.round(state.prices.freezeSeconds / 60)} minute${state.prices.freezeSeconds >= 120 ? "s" : ""}` : `${state.prices.freezeSeconds} seconds`}. Your drone needs ${d.cooldown ?? 90}s to recharge, and keeps watching the area as a trap.`
                : "The drone saw nothing there, for now. It'll keep watching the area as a trap.",
              tone: found ? "good" : "info",
            });
          }, 5200);
        },
      );
    } else {
      if (searchWait > 0) {
        playSfx("denied");
        return setMessage({ text: `Easy, detective: next search in ${Math.ceil(searchWait / 1000)}s. Searching too fast makes the wait longer.`, tone: "info" });
      }
      const big = mode === "big";
      setBusyTile(tile);
      playSfx("search");
      act(
        () => (big ? bigSearch(tile) : searchTile(tile)),
        (d) => {
          if (d.cooldown) setSearchReadyAt(Date.now() + Number(d.cooldown) * 1000);
          playSfx(d.result === "caught" ? "found" : d.result === "shielded" ? "shield" : d.result === "decoy" ? "explode" : "miss");
          if (d.result === "decoy")
            setMessage({ text: "That was a decoy! Nobody was there, and decoys pay nothing. Someone's playing tricks.", tone: "info" });
          else if (d.result === "shielded")
            setMessage({
              text: `You found ${d.names || "someone"}, but their shield teleported them somewhere nearby! You still get +${short(Number(d.reward))} coins.`,
              tone: "good",
            });
          else if (d.result === "caught")
            setMessage({
              text: d.bot ? `You found ${botName}! +${short(Number(d.reward))} coins.` : `Gotcha! You found ${d.names || d.caught}. +${short(Number(d.reward))} coins.`,
              tone: "good",
            });
          else
            setMessage({
              text: big
                ? `Nobody in the 9 spots around ${where(tile)}.`
                : d.searched_before
                  ? `Nobody at ${where(tile)}. (Heads up: that spot had been searched before.)`
                  : `Nobody at ${where(tile)}.`,
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
          ? { icon: Coins, text: `Pop! +${res.coins} coins.${res.leftToday > 0 ? ` ${res.leftToday} more balloon${res.leftToday === 1 ? "" : "s"} today.` : " That's all for today."}`, tone: "good" }
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
          interactive={canTap || viewMode === "chat"}
          onTile={onTile}
          onBillboard={onBillboardTap}
          ads={ads}
          onAdViews={onAdViews}
          mode={viewMode}
          roomCounts={rooms.buildingCounts}
          onRoom={onRoom}
          ride={ride}
          place={place}
          onNpc={(id: string) => {
            setNpcTap({ id, at: Date.now() });
          }}
          onBalloons={setBalloonCount}
          revealed={phase !== "join"}
          caughtFaces={state.caughtFaces}
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
            sponsor={round.sponsor}
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
            <span className="glass hidden whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-bold sm:inline" title="Your level (level up from the menu)">
              Lv {me.level}
            </span>
            <span className="glass whitespace-nowrap rounded-full px-3 py-1.5 text-sm" title={`${me.coins} coins · level ${me.level}`}>
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
              {menu ? <X className="size-4" /> : <MenuIcon className="size-4" />}
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
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-ink text-white">
              {entry?.role === "hider" ? <Ghost className="size-8" /> : entry?.role === "seeker" ? <Flashlight className="size-8" /> : <Clapperboard className="size-8" />}
            </span>
            <h2 className="mt-2 font-display text-3xl font-extrabold">{startCard.title}</h2>
            <p className="mt-2 text-sm text-ink/80">{startCard.line}</p>
          </div>
        </button>
      )}

      {confirmShield && entry && (
        <Sheet onClose={() => setConfirmShield(false)}>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Shield className="size-5 text-[#7048e8]" />Raise your shield?</h2>
          <p className="mt-1 text-sm text-muted">As a ghost, you can wrap yourself in a shield that saves you once.</p>
          <div className="mt-3 rounded-2xl bg-[#7048e8]/10 p-4 text-center">
            <p className="text-sm text-muted">It costs</p>
            <p className="font-display text-4xl font-extrabold">{short(state.prices.shield)} coins</p>
            <p className="text-xs text-muted">You have {short(me.coins)}. One shield per game.</p>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-ink/80">
            <Li icon={Sparkles}>The next time a hunter finds you, your shield whisks you away to a free spot nearby and you stay in the game.</Li>
            <Li icon={Coins}>You still lose your stake to that hunter, but you keep playing for the pool.</Li>
            <Li icon={Anchor}>While your shield is up you <b>can&apos;t move</b>. Once it has saved you, you can move again.</Li>
            <Li icon={Dices}>Where you land is random: it could be a spot that was already searched.</Li>
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
                  setMessage({ icon: Shield, text: "Shield up! The next find just teleports you. Sit tight until then.", tone: "good" });
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
          <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Ghost className="size-5 text-me" />Be a ghost this round?</h2>
          <div className="mt-3 rounded-2xl bg-panel-2 p-4 text-center">
            <p className="text-sm text-muted">You&apos;re putting down</p>
            <p className="font-display text-4xl font-extrabold">{short(state.prices.stake)} coins</p>
            <p className="text-xs text-muted">You have {short(me.coins)}. After this: {short(Math.max(0, me.coins - state.prices.stake))}.</p>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-ink/80">
            <Li icon={Check}>Stay hidden till the end: you get your {short(state.prices.stake)} back, and the survivors share {Math.round(state.prices.winShare * 100)}% of the pool (it starts at 0 and grows with every search, sweep and move).</Li>
            <Li icon={CircleX}>Get caught: the hunter who finds you keeps most of your stake. If every ghost is found, hunters take {Math.round(state.prices.winShare * 100)}% of the pool and the ghosts share {Math.round(state.prices.otherShare * 100)}%.</Li>
            <Li icon={Shield}>Once the hunt starts you can buy a one-time shield ({short(state.prices.shield)} coins).</Li>
            <Li icon={Footprints}>Moving costs {short(state.prices.moveFee)} coins each time.</Li>
          </ul>
          <div className="mt-4 space-y-2">
            <button
              disabled={busy}
              onClick={() => {
                setConfirmHide(false);
                act(() => joinRound("hider"), () => setMessage({ icon: Ghost, text: "You're in! When the clock hits zero, we'll drop you somewhere in the city.", tone: "info" }));
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-3.5 text-white disabled:opacity-50"
            >
              <Ghost className="size-5 shrink-0" />
              <span className="font-semibold">Become a ghost</span>
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-sm font-semibold tabular-nums">
                <Coins className="mr-1 inline size-3.5 align-[-0.1em]" />
                {short(state.prices.stake)}
              </span>
            </button>
            <button onClick={() => setConfirmHide(false)} className="w-full rounded-2xl py-2.5 text-sm font-semibold text-muted hover:bg-panel-2">
              Not now
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
            <li>After this you&apos;ll need to wait {state.prices.moveCooldown >= 60 ? `${Math.round(state.prices.moveCooldown / 60)} minutes` : `${state.prices.moveCooldown} seconds`} before moving again. Every move by anyone makes the next one dearer.</li>
          </ul>
          {state.activeTraps > 0 && (
            <p className="mt-3 rounded-xl bg-[#4dabf7]/15 px-3 py-2 text-sm text-[#1864ab]">
              <Radar className="mr-1 inline size-4 align-[-0.15em]" />There {state.activeTraps === 1 ? "is 1 drone trap" : `are ${state.activeTraps} drone traps`} watching parts of the city
              right now, and you can&apos;t see where. If you move into one, the hunter who set it will know someone&apos;s there.
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirmMove(null)} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
              Stay put
            </button>
            <button onClick={() => doMove(confirmMove)} className="flex-1 rounded-xl bg-ink py-2.5 font-semibold text-white">
              Move · {short(state.prices.moveFee)}
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

      {pickPlace && (
        <Sheet onClose={() => setPickPlace(null)}>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <Building2 className="size-5 text-[#7048e8]" />
            {pickPlace.name}
          </h2>
          <p className="mt-1 text-sm text-muted">Where would you like to go? Each floor has its own people and its own chat.</p>
          <div className="mt-3 space-y-2">
            {(pickPlace.levels?.length ? pickPlace.levels : [{ id: "g", label: "Ground floor", capacity: pickPlace.capacity }]).map((lvl) => {
              const id = `${pickPlace.id}:${lvl.id}`;
              const here = rooms.counts[id] ?? 0;
              const Icon = lvl.id === "r" ? Sun : lvl.id === "g" ? DoorOpen : Layers;
              return (
                <button
                  key={lvl.id}
                  onClick={() => goToLevel(pickPlace, lvl)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-panel-2 px-4 py-3 text-left hover:bg-gold/20"
                >
                  <Icon className="size-5 shrink-0 text-muted" />
                  <span className="flex-1 font-semibold">{lvl.label}</span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Users className="size-3.5" />
                    {here}/{short(lvl.capacity)}
                  </span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
      {pickBalloon && (
        <Sheet onClose={() => setPickBalloon(false)}>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <HotAirBalloon className="size-5 text-[#e64980]" />
            Hop on a balloon
          </h2>
          <p className="mt-1 text-sm text-muted">
            Rides last 10 minutes and float over the whole city. Up to 1,000 people per balloon chat together on the way.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Array.from({ length: Math.max(balloonCount, 1) }, (_, k) => {
              const n = rooms.counts[balloonRoom(k)] ?? 0;
              return (
                <button
                  key={k}
                  onClick={() => boardBalloon(k)}
                  className="flex items-center gap-3 rounded-2xl bg-panel-2 px-4 py-3 text-left hover:bg-[#e64980]/15"
                >
                  <HotAirBalloon className="size-6 shrink-0" style={{ color: BALLOON_COLOURS[k % BALLOON_COLOURS.length] }} />
                  <span className="flex-1 font-semibold">{BALLOON_NAMES[k % BALLOON_NAMES.length]} balloon</span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Users className="size-3.5" />
                    {n}/1,000
                  </span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
      {adExplainer && (
        <Sheet onClose={() => setAdExplainer(false)}>
          <AdvertiseExplainer onClose={() => setAdExplainer(false)} />
        </Sheet>
      )}
      {advertise && (
        <Sheet onClose={() => setAdvertise(null)}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Billboard · {where(advertise.tile)}</p>
          <h2 className="font-display text-xl font-bold">Your brand could be here</h2>
          <p className="mt-2 text-sm text-muted">
            Billboards in every city show ads to everyone playing and watching. Pay online, upload your design, and it can be live in minutes.
          </p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setAdvertise(null)} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
              Not now
            </button>
            <Link href="/advertise" className="flex-1 rounded-xl bg-gold py-2.5 text-center font-semibold text-ink">
              Advertise here
            </Link>
          </div>
        </Sheet>
      )}
      {openAd && (
        <Sheet onClose={() => setOpenAd(null)}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Sponsored · {openAd.ad.brand}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={openAd.ad.image} alt={openAd.ad.headline} className="mt-2 aspect-[2/1] w-full rounded-2xl bg-panel-2 object-cover" />
          <h2 className="mt-3 font-display text-xl font-bold">{openAd.ad.headline}</h2>
          {openAd.reward && <p className="mt-2 rounded-xl bg-gold/25 px-3 py-2 text-sm font-semibold text-gold-dark"><Coins className="mr-1 inline size-4 align-[-0.15em]" />{openAd.reward}</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={() => setOpenAd(null)} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
              Back to the city
            </button>
            {openAd.ad.link && (
              <a
                href={openAd.ad.link}
                target="_blank"
                rel="noopener noreferrer sponsored"
                onClick={() =>
                  fetch("/api/ads/click", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adId: openAd.ad.id }), keepalive: true }).catch(() => {})
                }
                className="flex-1 rounded-xl bg-gold py-2.5 text-center font-semibold text-ink"
              >
                Visit {openAd.ad.brand}
              </a>
            )}
          </div>
          <p className="mt-3 text-center text-[11px] text-muted">
            Want your own billboard? <Link href="/advertise" className="underline">Advertise here</Link>
          </p>
        </Sheet>
      )}
      {confirmHunt && round && (
        <Sheet onClose={() => setConfirmHunt(false)}>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Flashlight className="size-5 text-gold-dark" />Join the hunt?</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-ink/80">
            <li>🆓 Joining is free. {me.freeSearch ? "Your first search today is on us." : `Searches cost about ${short(round.searchPrice)} coins each right now.`}</li>
            <Li icon={Ghost}>As a hunter, you tap spots to search for ghosts, or send drones to sweep an area.</Li>
            <Li icon={Coins}>Find a ghost and you keep most of their stake. Find {botName}, the bot, for {short(200)} coins.</Li>
            <Li icon={Trophy}>Catch every ghost and hunters share 80% of the pool.</Li>
            <Li icon={Timer}>You stay a hunter for the whole round.</Li>
          </ul>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirmHunt(false)} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
              Not now
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setConfirmHunt(false);
                act(() => joinRound("seeker"), () => setMessage({ text: "You're hunting this round. Happy hunting!", tone: "info" }));
              }}
              className="flex-1 rounded-xl bg-gold py-2.5 font-semibold text-ink disabled:opacity-50"
            >
              Start hunting
            </button>
          </div>
        </Sheet>
      )}

      {confirmDecoy && entry && (
        <Sheet onClose={() => setConfirmDecoy(false)}>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Drama className="size-5 text-[#f08c00]" />Drop a decoy?</h2>
          <p className="mt-1 text-sm text-muted">As a ghost, you can drop a fake you anywhere in the city to fool the hunters.</p>
          <div className="mt-3 rounded-2xl bg-[#f08c00]/10 p-4 text-center">
            <p className="text-sm text-muted">It costs</p>
            <p className="font-display text-4xl font-extrabold">{short(state.prices.decoy)} coins</p>
            <p className="text-xs text-muted">You have {short(me.coins)}. One decoy per game; each one costs a little more than your last.</p>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-ink/80">
            <Li icon={MapPin}>You choose where it goes: after this, tap any spot in the city.</Li>
            <Li icon={Megaphone}>Everyone hears that a decoy went out, but not where (unless one of their drone traps is watching that spot).</Li>
            <Li icon={Radar}>Drones think it&apos;s really you. A hunter who searches it gets nothing: it goes bang, or a squeaky toy pops up.</Li>
            <Li icon={Anchor}>Your decoy stays where you drop it.</Li>
          </ul>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirmDecoy(false)} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
              Not now
            </button>
            <button
              onClick={() => {
                setConfirmDecoy(false);
                setPlacingDecoy(true);
              }}
              className="flex-1 rounded-xl bg-[#f08c00] py-2.5 font-semibold text-white"
            >
              Choose a spot
            </button>
          </div>
        </Sheet>
      )}
      {confirmRespawn && entry && (
        <Sheet onClose={() => setConfirmRespawn(false)}>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold"><RotateCcw className="size-5 text-[#e8590c]" />Come back as a ghost?</h2>
          <p className="mt-1 text-sm text-muted">You were caught early, so you can rise again, once.</p>
          <div className="mt-3 rounded-2xl bg-[#e8590c]/10 p-4 text-center">
            <p className="text-sm text-muted">It costs</p>
            <p className="font-display text-4xl font-extrabold">{short(state.prices.respawn)} coins</p>
            <p className="text-xs text-muted">You have {short(me.coins)}. These coins disappear (they don&apos;t go into the pool).</p>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-ink/80">
            <Li icon={Dices}>You drop back in on a random spot nobody has searched yet.</Li>
            <Li icon={Megaphone}>Everyone is told you respawned (but not where).</Li>
            <Li icon={Coins}>Your stake is still gone, but you can play on for a share of the pool.</Li>
            <Li icon={Repeat1}>Once per game.</Li>
          </ul>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirmRespawn(false)} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
              Not now
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setConfirmRespawn(false);
                act(respawnMe, () => {
                  playSfx("respawn");
                  setMessage({ icon: RotateCcw, text: "You're back! Dropped somewhere new. Stay sharp.", tone: "good" });
                });
              }}
              className="flex-1 rounded-xl bg-[#e8590c] py-2.5 font-semibold text-white disabled:opacity-50"
            >
              Respawn · {short(state.prices.respawn)}
            </button>
          </div>
        </Sheet>
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
            {message.icon && <message.icon className="mr-1.5 inline size-4 align-[-0.15em]" aria-hidden />}
            {message.text}
          </p>
        )}
        {hover && (
          <p className="glass hidden rounded-full px-3 py-1 text-xs text-muted sm:block">
            {hover.label}
          </p>
        )}
        {ctrlHint && (
          <button onClick={() => setCtrlHint(false)} className="glass pointer-events-auto hidden rounded-full px-3 py-1.5 text-xs font-medium sm:block">
            <Lightbulb className="mr-1 inline size-3.5 align-[-0.15em] text-gold-dark" />
            Tip: hold <kbd className="rounded bg-panel-2 px-1 font-sans">Ctrl</kbd> and drag to turn the city. Scroll to zoom.
            <X className="ml-1 inline size-3.5 align-[-0.15em]" />
          </button>
        )}

        <div className="flex w-full max-w-xl items-end justify-between gap-2">
          {round ? (
            <div className="glass pointer-events-auto flex rounded-full p-1 text-sm font-semibold" role="tablist" aria-label="Mode">
              {(["game", "chat"] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={viewMode === m}
                  onClick={() => {
                    setViewMode(m);
                    if (m === "game") leaveRoom();
                  }}
                  className={cn("rounded-full px-3 py-1.5", viewMode === m ? "bg-ink text-white" : "text-muted")}
                >
                  {m === "game" ? <Gamepad2 className="size-4" /> : <MessageCircle className="size-4" />}
                  {m === "game" ? "Game" : "Chat mode"}
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          {round && (
            <Chat
              meId={me.id}
              meRole={entry?.role ?? null}
              roundId={round.id}
              players={state.players}
              open={chatOpen}
              onOpenChange={setChatOpen}
              room={rooms.myRoomInfo}
              roomMembers={rooms.members}
              roomCount={rooms.myRoom ? (rooms.counts[rooms.myRoom] ?? 0) : 0}
              onLeaveRoom={leaveRoom}
              guest={guest}
              rideEndsAt={rooms.rideEndsAt}
              botName={botName}
              botBounty={200}
              dmRequest={dmRequest}
              externalNpc={npcTap}
              enteredAt={rooms.enteredAt}
            />
          )}
        </div>

        <div className="glass pointer-events-auto w-full max-w-xl rounded-2xl p-3">
          {round && viewMode === "chat" ? (
            <div className="space-y-2 text-sm">
              {place || ride !== null ? (
                <>
                  <p className="flex items-center gap-2">
                    {ride !== null ? <HotAirBalloon className="size-5 shrink-0 text-[#e64980]" /> : <Building2 className="size-5 shrink-0 text-[#7048e8]" />}
                    <span className="min-w-0">
                      <b className="block truncate">{rooms.myRoomInfo?.name ?? (ride !== null ? `Balloon ${ride + 1}` : "Inside")}</b>
                      <span className="text-xs text-muted">
                        {guest ? "Watching. Sign in to chat here." : `${Math.max(0, (rooms.myRoom ? rooms.counts[rooms.myRoom] : 1) ?? 1)} here · drag to look around`}
                      </span>
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {!guest && (
                      <button onClick={() => setChatOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2 font-semibold text-white">
                        <MessageCircle className="size-4" />
                        Chat
                      </button>
                    )}
                    {place && placeRoom && placeRoom.id === place.building && (placeRoom.levels?.length ?? 0) > 1 && (
                      <button onClick={() => setPickPlace(placeRoom)} className="flex items-center gap-1.5 rounded-xl bg-panel-2 px-3 py-2 font-semibold">
                        <Layers className="size-4" />
                        Change floor
                      </button>
                    )}
                    <button onClick={leaveRoom} className="flex items-center gap-1.5 rounded-xl bg-panel-2 px-3 py-2 font-semibold">
                      <LogOut className="size-4" />
                      {ride !== null ? "Get off" : "Leave"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>
                    <b className="inline-flex items-center gap-1">
                      <MessageCircle className="size-4" />
                      Chat mode.
                    </b>{" "}
                    <span className="text-muted">Tap a building to go inside: the lobby, upper floors or the rooftop. The numbers over buildings show who&apos;s there.</span>
                  </p>
                  <button onClick={() => setPickBalloon(true)} className="flex items-center gap-1.5 rounded-xl bg-[#e64980] px-3 py-2 font-semibold text-white">
                    <HotAirBalloon className="size-4" />
                    Hop on a balloon
                  </button>
                </>
              )}
            </div>
          ) : !round || phase === "done" ? (
            <p className="text-sm text-muted">Building the next city…</p>
          ) : guest ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-muted">
                <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-hit align-middle" />
                <b className="text-ink">Watching live.</b> <span className="rounded bg-ink px-1 text-[10px] font-bold text-white">18+</span>{" "}
                {phase === "join"
                  ? `Ghosts are getting ready. The hunt starts in ${countdown}.`
                  : `The hunt is on: ${short(round.hidersRemaining)} still hidden, ${short(round.pool)} coins in the pool.`}
              </p>
              <div className="grid grid-cols-3 gap-2 text-sm sm:flex">
                <button onClick={() => setHowOpen(true)} className="whitespace-nowrap rounded-xl bg-panel-2 px-3 py-2.5 font-semibold">
                  <CircleHelp className="mr-1 inline size-4 align-[-0.15em]" />Rules
                </button>
                <button onClick={() => setAdExplainer(true)} className="whitespace-nowrap rounded-xl bg-panel-2 px-3 py-2.5 font-semibold">
                  <Megaphone className="mr-1 inline size-4 align-[-0.15em]" />Advertise
                </button>
                <Link href="/login" className="whitespace-nowrap rounded-xl bg-gold px-3 py-2.5 text-center font-semibold text-ink">
                  Play now
                </Link>
              </div>
            </div>
          ) : !entry ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-muted">
                {phase === "join"
                  ? "Ghosts are getting ready and the city's growing. Want to hide, or hunt?"
                  : "The hunt is on. Jump in as a hunter and start searching."}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => setConfirmHunt(true)}
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
                    <Ghost className="mr-1 inline size-4 align-[-0.15em]" />Ghost · {state.prices.stake}
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
                {me.level >= state.unlocks.bigSearch ? (
                  <ModeButton on={mode === "big"} onClick={() => setMode("big")}>
                    Big search · {short(state.prices.bigSearch)}
                  </ModeButton>
                ) : (
                  <span className="rounded-lg bg-panel-2 px-3 py-1.5 font-semibold text-muted/70" title={`Unlocks at level ${state.unlocks.bigSearch}`}>
                    <Lock className="mr-1 inline size-3.5 align-[-0.1em]" />Big search · Lv {state.unlocks.bigSearch}
                  </span>
                )}
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
              {mode !== "sweep" && searchWait > 0 && (
                <div className="flex items-center gap-2 text-xs font-semibold text-gold-dark">
                  <span className="tabular-nums">Next search in {Math.ceil(searchWait / 1000)}s</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gold/20">
                    <div className="h-full rounded-full bg-gold transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (searchWait / 30_000) * 100)}%` }} />
                  </div>
                </div>
              )}
              <p className="text-xs text-muted">
                {mode === "search"
                  ? "Tap anywhere in the city to search that spot. Search too fast and you'll have to wait longer."
                  : mode === "big"
                    ? `Tap a spot to search it and the 8 spots around it in one go (${state.prices.bigSearch ? short(state.prices.bigSearch) : ""} coins).`
                    : "Tap a spot and a drone will check the area around it. It only tells you yes or no."}
              </p>
            </div>
          ) : entry.caught ? (
            <div className="space-y-2 text-sm">
              <p className="text-hit">You&apos;ve been found. Hang around and watch the rest of the hunt, or try again next round.</p>
              {entry.canRespawn && (
                <button onClick={() => setConfirmRespawn(true)} className="w-full rounded-xl bg-[#e8590c] py-2.5 font-semibold text-white">
                  <RotateCcw className="mr-1 inline size-4 align-[-0.15em]" />Respawn · {short(state.prices.respawn)} coins
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              {frozenWait > 0 && (
                <div className="rounded-xl bg-hit/10 px-3 py-2 font-medium text-hit">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5"><Radar className="size-4" />A drone has you pinned. No moving for now.</span>
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
                  <Radar className="mr-1 inline size-4 align-[-0.15em]" />A drone just swept your area. Hunters know someone&apos;s close. Maybe time to move?
                </p>
              )}
              {placingDecoy && (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-[#f08c00]/15 px-3 py-2 font-medium text-[#a35200]">
                  <span className="flex items-center gap-1.5"><Drama className="size-4" />Tap the spot where you want your decoy.</span>
                  <button onClick={() => setPlacingDecoy(false)} className="text-xs underline">
                    Cancel
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-me/15 px-2.5 py-1 text-xs font-semibold text-me">
                  {shieldUp ? "Shield up: staying put" : frozenWait > 0 ? `Pinned for ${clock(frozenWait)}` : moveWait > 0 ? `Next move in ${clock(moveWait)}` : "You can move now"}
                </span>
                <span className="text-xs text-muted">
                  Moving costs {short(state.prices.moveFee)} right now (it goes up every time anyone moves) · {entry.moves} move{entry.moves === 1 ? "" : "s"} so far
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PowerUp
                  icon={Drama}
                  label="Decoy"
                  price={state.prices.decoy}
                  unlockAt={state.unlocks.decoy}
                  level={me.level}
                  used={entry.decoyUsed}
                  usedLabel="Decoy out"
                  onClick={() => setConfirmDecoy(true)}
                  tone="bg-[#f08c00]"
                />
                <PowerUp
                  icon={Shield}
                  label="Shield"
                  price={state.prices.shield}
                  unlockAt={state.unlocks.shield}
                  level={me.level}
                  used={entry.shieldBought}
                  usedLabel={entry.shieldSaved ? "Shield used" : "Shield up"}
                  onClick={() => setConfirmShield(true)}
                  tone="bg-[#7048e8]"
                />
                <span className="text-[11px] text-muted">One of each per game.</span>
              </div>
              {state.outlook && (
                <p className="rounded-xl bg-me/10 px-3 py-2">
                  Stay hidden and you walk away with about <b>{short(state.outlook.stakeBack + state.outlook.share)}</b> coins:{" "}
                  <span className="text-muted">
                    your {short(state.outlook.stakeBack)} back, plus {short(state.outlook.share)} from the pool so far.
                  </span>
                </p>
              )}
              <p className="text-xs text-muted">
                That&apos;s your face over your hiding spot.{" "}
                {entry.moves < entry.movesAllowed
                  ? `You have ${entry.movesAllowed - entry.moves} move${entry.movesAllowed - entry.moves === 1 ? "" : "s"} left this game: tap another spot to use it.`
                  : "You've used your moves for this game. Stay hidden!"}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/** A power-up button for hiders: locked until a level, then once per game. */
function PowerUp(props: {
  icon: LucideIcon;
  label: string;
  price: number;
  unlockAt: number;
  level: number;
  used: boolean;
  usedLabel: string;
  onClick: () => void;
  tone: string;
}) {
  if (props.level < props.unlockAt)
    return (
      <span className="rounded-full bg-panel-2 px-3 py-1 text-xs font-semibold text-muted/70" title={`Unlocks at level ${props.unlockAt}`}>
        <Lock className="mr-1 inline size-3 align-[-0.1em]" />
        {props.label} · Lv {props.unlockAt}
      </span>
    );
  if (props.used)
    return (
      <span className="rounded-full bg-panel-2 px-3 py-1 text-xs font-semibold text-muted">
        <props.icon className="mr-1 inline size-3.5 align-[-0.15em]" />
        {props.usedLabel}
      </span>
    );
  return (
    <button onClick={props.onClick} className={cn("rounded-full px-3 py-1 text-xs font-semibold text-white shadow-sm", props.tone)}>
      <props.icon className="mr-1 inline size-3.5 align-[-0.15em]" />
      {props.label} · {short(props.price)}
    </button>
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

/** A list line with an icon in front (used in the pop-ups). */
function Li({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <span>{children}</span>
    </li>
  );
}
