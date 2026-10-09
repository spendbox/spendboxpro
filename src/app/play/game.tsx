"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addressOf, makePlan, tileAt } from "@/lib/city/layout";
import { houseTileOf } from "@/lib/city/houses";
import { homeLabel } from "@/lib/houses";
import type { WelcomeNeeds } from "@/lib/welcome";
import { useDiary } from "./style/diary";
import { cleanAvatar } from "@/lib/avatar";
import type { GameEvent, GameState } from "@/lib/game";
import { cn } from "@/lib/cn";
import {
  Armchair,
  Building2,
  CircleX,
  DoorOpen,
  Layers,
  LogOut,
  Sun,
  Clapperboard,
  Music,
} from "lucide-react";
/** Any of our line icons (Lucide or our own). */
type LucideIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties; "aria-hidden"?: boolean }>;
import {
  ChevronDown,
  ChevronUp,
  Coins,
  CircleHelp,
  Fish,
  Flashlight,
  Ghost,
  Hammer,
  House,
  Lightbulb,
  Lock,
  MapPin,
  Megaphone,
  Menu as MenuIcon,
  MessageCircle,
  Sparkles,
  Timer,
  Users,
  X,
} from "@/components/icons";
import { short } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { WORLD_EVENT_BY_KEY } from "@/lib/world-events";
import { claimWorldEvent, joinRound, type ActionResult } from "./actions";
import { liveLabel, SPORTS } from "@/lib/sports/schedule";
import { DEFAULT_RULES, type BoardGhost, type DuelView } from "@/lib/ghost-duels";
import { Compass, Crown, Swords } from "lucide-react";
import { ChallengePopup } from "./ghost-duel/challenge-popup";
import { DuelStatus } from "./ghost-duel/duel-status";
import { GhostsSheet } from "./ghost-duel/ghosts-sheet";
import { ExploreSheet } from "./explore-sheet";
import type { Sport } from "@/lib/sports/types";
import type { ActivityItem } from "./activities/games";
import { useActivityRoom } from "./activities/hub";
import { playLoop } from "./activities/synth";
import { isDanceMove, syncBeat, type DanceMove } from "./city/dance-moves";
import { npcsFor } from "@/lib/npcs";
import { addFriend } from "./friend-actions";
import { FriendNudge, PeopleHere, type HerePerson } from "./people-here";
import { rodeSomething } from "./streak-actions";
import { GreetButtons } from "./greet-buttons";
import { MyGiftsSheet } from "./my-gifts-sheet";
import { StreakPill, StreakSheet } from "./streak-sheet";
import { useQuestTracker } from "./activities/quest-tracker";
import { QuestBanner, QuestSheet } from "./activities/quest-ui";
import { Chat } from "./chat";
import { setEventSoundsEnabled } from "./city/event-sounds";
import type { CityDancer, CityEvent, CityFriendPin, CityGhost, CityInteract, CityMarkers, CityRide, RideTarget } from "./city-view";
import { FeedRow, NotificationsPanel, type FeedIcon, type FeedItem } from "./notifications";
import { signOutNow } from "../login/actions";
import { claimBalloon, recordVisit } from "./profile-actions";
import { rideRoom, useRooms, type RoomInfo } from "./rooms";
import { RIDE_ICONS, RIDE_INFO, RideIcon, type RideKindName } from "./ride-icon";
import { Safe } from "./safe";
import { Sheet } from "./sheet";
import { Logo, LogoMark } from "@/components/logo";
import { playSfx, setSfxEnabled, useCitySound } from "./sound";
import { StatsCard } from "./stats-card";

// The 3D city only runs in the browser.
const CityView = dynamic(() => import("./city-view").then((m) => m.CityView), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-muted">Building the city…</div>,
});
// Panels people open now and then: their code only loads when first opened, so the town
// itself starts faster.
const Menu = dynamic(() => import("./menu").then((m) => m.Menu));
const HowItWorks = dynamic(() => import("./how-it-works").then((m) => m.HowItWorks));
const Results = dynamic(() => import("./results").then((m) => m.Results));
const AvatarEditor = dynamic(() => import("./avatar-editor").then((m) => m.AvatarEditor));
const SportsSheet = dynamic(() => import("./sports/sportsbook").then((m) => m.SportsSheet));
const ActivitySheet = dynamic(() => import("./activities/activity-sheet").then((m) => m.ActivitySheet));
const GiveCoinsSheet = dynamic(() => import("./activities/gift-sheet").then((m) => m.GiveCoinsSheet));
const RoomActivityLayer = dynamic(() => import("./activities/room-layer").then((m) => m.RoomActivityLayer));
const AdvertiseExplainer = dynamic(() => import("@/components/advertise-explainer").then((m) => m.AdvertiseExplainer));
const HouseSheet = dynamic(() => import("./houses/house-sheet").then((m) => m.HouseSheet));
const SignInOverlay = dynamic(() => import("./sign-in-overlay").then((m) => m.SignInOverlay));
const StyleSheet = dynamic(() => import("./style/style-ui").then((m) => m.StyleSheet));
const DanceBar = dynamic(() => import("./dance-bar").then((m) => m.DanceBar));
const FriendsSheet = dynamic(() => import("./friends-sheet").then((m) => m.FriendsSheet));
const GhostCardSheet = dynamic(() => import("./ghost-duel/ghost-card").then((m) => m.GhostCardSheet));
const DuelScreen = dynamic(() => import("./ghost-duel/duel-screen").then((m) => m.DuelScreen));

/** The map shows no searched spots, sweeps or hiding spots any more: only the ghosts' lights. */
const NO_MARKERS: CityMarkers = { searchedEmpty: [], searchedHit: [], caught: [], left: [], me: null, decoy: null, sweeps: [], pending: null, recent: [], locked: [] };
/** A building or balloon you can go into (from the 3D city), with its levels. */
type PlaceRoom = {
  id: string;
  name: string;
  capacity: number;
  kind: "building" | "balloon";
  levels?: { id: string; label: string; capacity: number; kind?: string }[];
};
// Same order as the balloons in the 3D city (used until the city lists its rides).
const BALLOON_NAMES = ["Red", "Yellow", "Blue", "Purple", "Mint"];
const RIDE_HELLO: Record<RideKindName, string> = {
  balloon: "Up we go! Drag to look around; tap Chat to talk to everyone on board.",
  train: "All aboard! Grab a window and drag to look around; tap Chat to talk to the carriage.",
  bus: "Top deck, front seat. Drag to look around; tap Chat to talk to the passengers.",
  car: "Sit back: the car drives itself round the city. Drag to look around; tap Chat to talk to your passengers.",
  boat: "Cast off! Enjoy the cruise; drag to look around and tap Chat to talk to the deck.",
  ferris: "Your cabin is climbing. Drag to look around; tap Chat to talk to your cabin.",
  slide: "Hold on tight…",
};
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
    // Big fish = anyone holding 10,000+ coins.
    const rich = ghosts.some((h) => (h as { bigfish?: boolean }).bigfish);
    const fish = rich && top >= 20 ? "Whale of a catch! " : rich ? "Big fish caught! " : top >= 10 ? "Seasoned ghost caught! " : top >= 5 ? "Nice catch! " : "";
    const lvl = top >= 5 ? ` (level ${top})` : "";
    return {
      id: e.id,
      tone: "alarm",
      text: `${fish}${who} caught ${list}${ghosts.length === 1 ? lvl : ""} at ${where(e.tile)}!`,
      icon: rich && top >= 20 ? "whale" : rich ? "fish" : "catch",
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
  if (e.kind === "duel") {
    const d = e.detail ?? {};
    const ghost = d.ghost ?? "A ghost";
    const hunter = d.hunter ?? "a hunter";
    const avatar = d.avatar ? cleanAvatar(d.avatar, d.winner === "ghost" ? ghost : hunter) : null;
    if (d.winner === "hunter")
      return { id: e.id, tone: "alarm", icon: "catch", avatar, text: d.out ? `${hunter} beat ${ghost}. That's three losses: ${ghost} is out!` : `${hunter} beat ${ghost} in a duel.` };
    return { id: e.id, tone: "info", icon: d.golden ? "coin" : "shield", avatar, text: d.golden ? `${ghost} beat ${hunter} and turned golden!` : `${ghost} beat ${hunter} in a duel.` };
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
    ["The hunt is on!", "Ghosts are lit up on the map. Tap a light and challenge them."],
    ["Game time!", "Beat a ghost and win a slice of their stake."],
    ["Ready, set, duel!", "Rock, paper or scissors? Choose wisely."],
    ["Go get them", "Every ghost you beat takes you closer to the prize pool."],
  ],
  hider: [
    ["You're lit up!", "Everyone can see your light. Hunters will come to you: be ready to answer."],
    ["Show time", "Win three duels and you turn golden."],
    ["Stay sharp", "When a challenge pops up, you have 30 seconds to answer."],
    ["Here they come", "Rock, paper or scissors? Keep them guessing."],
  ],
  watcher: [
    ["The hunt has begun!", "Ghosts are lit up on the map. Tap one to see who they are."],
    ["Showtime", "Hunters are challenging ghosts. Who'll turn golden?"],
    ["Let the games begin!", "Sign in to challenge a ghost yourself."],
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
  return { title, line: `${line} ${hiders > 1 ? `${hiders - 1} ghost${hiders - 1 === 1 ? " is" : "s are"} in this game.` : ""}`.trim() };
}

export function Game({
  state,
  welcome = null,
  openSignIn = false,
}: {
  state: GameState;
  /** Signed in, but still to finish signing up (name and PIN, date of birth): the pop-up asks. */
  welcome?: WelcomeNeeds | null;
  /** Open the sign-in pop-up straight away (a link to sign in). */
  openSignIn?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" | "info"; icon?: LucideIcon } | null>(null);
  const [hover, setHover] = useState<{ tile: number; label: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showResults, setShowResults] = useState<number | null>(null);
  const [toasts, setToasts] = useState<FeedItem[]>([]);
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedSeenAt, setFeedSeenAt] = useState<string>(state.serverNow);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // The sign-in pop-up over the town (and why we're asking, when they tried something that
  // needs an account). Signing up halfway (signed in, no name and PIN yet) always shows it.
  const [signIn, setSignIn] = useState<{ why: string | null } | null>(() => (openSignIn && state.me.guest ? { why: null } : null));
  const [welcomeDone, setWelcomeDone] = useState(false);
  const setSignInWhy = (why: string) => setSignIn({ why });
  const signInShown = signIn !== null || (welcome !== null && !welcomeDone);
  const closeSignIn = useCallback(() => {
    setSignIn(null);
    setWelcomeDone(true);
  }, []);
  const [houseOpen, setHouseOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  // Sports: the matches sheet (which sport to open on), or null.
  const [sportsOpen, setSportsOpen] = useState<Sport | null>(null);
  const [confirmHide, setConfirmHide] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [editAvatar, setEditAvatar] = useState(false);
  // The round card (top left) and the bottom bar (Explore, Chat, Ghosts, My house) start folded
  // away on every visit, so the town gets the screen; tap either to open it.
  const [statsMin, setStatsMin] = useState(true);
  const [dockOpen, setDockOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [sound, setSound] = useState(true);
  const [busy, setBusy] = useState(false);
  // Ghost duels: a ghost's card (tapped on the map), the list of ghosts, the duel on screen,
  // and flying the camera over to a ghost's light.
  const [ghostFor, setGhostFor] = useState<BoardGhost | null>(null);
  const [ghostsOpen, setGhostsOpen] = useState(false);
  const [duelOn, setDuelOn] = useState<DuelView | null>(null);
  const [flyTo, setFlyTo] = useState<{ tile: number; at: number } | null>(null);
  const [ride, setRide] = useState<RideTarget | null>(null);
  // Everything there is to ride this round (from the 3D city).
  const [rides, setRides] = useState<CityRide[]>([]);
  // Inside places: a mini game / seat / menu that was tapped, and giving coins to someone.
  const [activity, setActivity] = useState<ActivityItem | null>(null);
  const [giveTo, setGiveTo] = useState<{ id: string; name: string; avatar: unknown } | null>(null);
  const [questOpen, setQuestOpen] = useState(false);
  // Inside a building: which one, and which level (ground "g", floor "f<n>", rooftop "r").
  const [place, setPlace] = useState<{ building: string; level: string } | null>(null);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  // When you last opened My gifts (remembered on this device): newer hugs and gifts get a number.
  const [giftsSeenAt, setGiftsSeenAt] = useState(() => Date.parse(state.serverNow));
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const seen = Number(localStorage.getItem("hs-gifts-seen") ?? 0);
        if (seen > 0) setGiftsSeenAt(seen);
      } catch {}
    }, 0);
    return () => clearTimeout(id);
  }, []);
  // Riding something counts towards your daily streak (asked once a day, at most).
  const rodeToday = useRef(false);
  const [friendBusy, setFriendBusy] = useState<string | null>(null);
  /** Going to a friend: open their building (openRoom), then straight onto their floor (goTo). */
  const [openReq, setOpenReq] = useState<{ id: string; at: number } | null>(null);
  const [goTo, setGoTo] = useState<{ building: string; level: string } | null>(null);
  /** A friend just went somewhere in town. */
  const [nudge, setNudge] = useState<(HerePerson & { room: string; place: string }) | null>(null);
  /** On a club's dance floor: your move and who you're dancing with (a player's or a regular's id). */
  const [dancing, setDancing] = useState<{ move: DanceMove; with: string | null } | null>(null);
  const [pickPlace, setPickPlace] = useState<PlaceRoom | null>(null);
  const [placeRoom, setPlaceRoom] = useState<PlaceRoom | null>(null);
  const [pickRide, setPickRide] = useState(false);
  const [exploreTab, setExploreTab] = useState<"rides" | "sports">("rides");
  const [npcTap, setNpcTap] = useState<{ id: string; at: number } | null>(null);
  const [balloonCount, setBalloonCount] = useState(0);
  const [dmRequest, setDmRequest] = useState<{ id: string; name: string; at: number } | null>(null);
  const [ads, setAds] = useState<Ad[]>([]);
  // An ad someone opened: what its button would pay them (0 = nothing), a note, and whether they've tapped it.
  const [openAd, setOpenAd] = useState<{ ad: Ad; tile: number; reward: number; note: string | null; tapped: boolean } | null>(null);
  const [advertise, setAdvertise] = useState<{ tile: number } | null>(null);
  const [ctrlHint, setCtrlHint] = useState(false);
  const [adExplainer, setAdExplainer] = useState(false);
  const [startCard, setStartCard] = useState<{ title: string; line: string } | null>(null);
  const online = useOnline(state.me.id, state.me.guest);
  const rooms = useRooms(state.round?.id ?? null, state.me.guest ? null : { id: state.me.id, name: state.me.name ?? "Player", avatar: state.me.avatar }, {
    onRideEnd: () => {
      setRide(null);
    },
  });
  const meP = useMemo(() => (state.me.guest ? null : { id: state.me.id, name: state.me.name ?? "Player", avatar: state.me.avatar as unknown }), [state.me.guest, state.me.id, state.me.name, state.me.avatar]);

  const { round, entry, me } = state;
  const now = useNow(state.serverNow);
  const phase = round?.status ?? "done";
  const countdown = clock(Date.parse((phase === "join" ? round?.joinEndsAt : round?.seekEndsAt) ?? "") - now);
  const isHider = entry?.role === "hider";
  // Ghost duels: the ghosts lit up on the map, your part in the game, your live duel.
  const board = state.duels;
  const ghostLights: CityGhost[] = useMemo(
    () => (board?.phase === "seek" ? board.ghosts.map((g) => ({ id: g.id, name: g.name, avatar: g.avatar, tile: g.tile, status: g.status, mine: g.id === state.me.id })) : []),
    [board, state.me.id],
  );
  // Side quests: sitting down makes one more likely; visits and rides count by themselves.
  const quests = useQuestTracker({ room: rooms.myRoom, seated: !!rooms.mySeat, hiding: false, signedIn: !me.guest });
  // This game's play diary (for the play style at the end): where you go and what you do.
  useDiary({
    round: round && phase !== "done" ? round.id : null,
    room: rooms.myRoom,
    levelKind: place && placeRoom?.id === place.building ? (placeRoom.levels?.find((l) => l.id === place.level)?.kind ?? null) : null,
    seated: !!rooms.mySeat,
    signedIn: !me.guest,
  });
  const botName = round?.botName ?? "the bot";
  // This round's city: its name and street addresses (same maths as the 3D view).
  const roundSeed = round?.id ?? 0;
  const plan = useMemo(() => makePlan(roundSeed), [roundSeed]);
  const where = useCallback((tile: number) => addressOf(plan, tileAt(plan, tile)), [plan]);
  // Where my house stands in this game's town (null: it isn't in this game).
  const myHouseTile = useMemo(
    () => (round && !me.guest ? houseTileOf(plan, round.tileCount, state.houses, me.id) : null),
    [plan, round, me.guest, me.id, state.houses],
  );
  // Where we are in the hunt (0 at the start, 1 at the end): drives day/night and weather.
  const huntProgress = round && phase === "seek"
    ? Math.min(1, Math.max(0, (now - Date.parse(round.joinEndsAt)) / (Date.parse(round.seekEndsAt) - Date.parse(round.joinEndsAt))))
    : phase === "done" ? 1 : 0;
  useCitySound(sound, roundSeed, huntProgress);

  // ---- the dance floor: in a club you can dance, and everyone there sees your move and who
  // you're dancing with (shared through the place's activity channel).
  const placeLevel = place && placeRoom?.id === place.building ? (placeRoom.levels?.find((l) => l.id === place.level) ?? null) : null;
  const inClub = placeLevel?.kind === "club" && !!rooms.myRoom && !me.guest;
  const danceDoing = dancing && inClub ? ["dance", `move:${dancing.move}`, ...(dancing.with ? [`with:${dancing.with}`] : [])] : null;
  const club = useActivityRoom(round?.id ?? null, inClub ? rooms.myRoom : null, meP, { doing: danceDoing });
  const dancers: CityDancer[] = useMemo(
    () =>
      club.present
        .filter((p) => p.id !== me.id && p.doing.includes("dance"))
        .map((p) => {
          const mv = p.doing.find((d) => d.startsWith("move:"))?.slice(5);
          const w = p.doing.find((d) => d.startsWith("with:"))?.slice(5) ?? null;
          return { id: p.id, name: p.name, avatar: cleanAvatar(p.avatar, p.name), move: isDanceMove(mv) ? mv : "groove", with: w && w.length < 100 ? w : null };
        }),
    [club.present, me.id],
  );
  // The regulars on the dance floor (the same people the 3D view draws there).
  const clubRoom = inClub ? rooms.myRoom : null;
  const clubCapacity = placeLevel?.capacity ?? 0;
  const danceNpcs = useMemo(() => (clubRoom ? npcsFor(clubRoom, roundSeed, clubCapacity, "club") : []), [clubRoom, roundSeed, clubCapacity]);
  const isDancing = !!dancing && inClub;
  // Leaving the club stops the dancing.
  useEffect(() => {
    if (inClub || !dancing) return;
    const id = setTimeout(() => setDancing(null), 0);
    return () => clearTimeout(id);
  }, [inClub, dancing]);
  // The club's music while you dance (when sounds are on); everyone moves in time with it.
  useEffect(() => {
    if (!isDancing || !sound) return;
    return playLoop("disco", { seconds: 900, volume: 0.8, onBeat: syncBeat });
  }, [isDancing, sound]);
  function startDancing() {
    if (me.guest) return setSignInWhy("Sign in to dance here.");
    if (rooms.mySeat) rooms.stand();
    setDancing((d) => d ?? { move: "groove", with: null });
    playSfx("pop");
  }

  // ---- friends: they stay friends in every new town; see where they are and go to them.
  const friendStatus = useMemo(() => {
    const m = new Map<string, "friend" | "incoming" | "outgoing">();
    for (const f of state.friends.friends) m.set(f.id, "friend");
    for (const f of state.friends.incoming) m.set(f.id, "incoming");
    for (const f of state.friends.outgoing) m.set(f.id, "outgoing");
    return m;
  }, [state.friends]);
  const friendStatusOf = useCallback((id: string) => friendStatus.get(id) ?? null, [friendStatus]);
  const friendsAt: CityFriendPin[] = useMemo(
    () =>
      state.friends.friends.flatMap((f) => {
        const at = rooms.placeOf[f.id];
        return at ? [{ id: f.id, name: f.name, avatar: f.avatar, room: at.room }] : [];
      }),
    [state.friends.friends, rooms.placeOf],
  );
  // The real players in the place you're in (not you, not NPCs).
  const hereNow: HerePerson[] = useMemo(
    () => rooms.members.filter((m) => m.id !== me.id).map((m) => ({ id: m.id, name: m.name, avatar: cleanAvatar(m.avatar, m.name) })),
    [rooms.members, me.id],
  );
  async function befriend(p: { id: string; name: string }) {
    if (me.guest) return setSignInWhy("Sign in to add friends.");
    if (friendBusy) return;
    setFriendBusy(p.id);
    try {
      const res = await addFriend(p.id);
      if (!res.ok) return setMessage({ text: res.error, tone: "bad" });
      playSfx("pop");
      setMessage({
        icon: Users,
        text: res.status === "friends" ? `You and ${p.name} are friends now. You'll see where they are in every town.` : `Friend request sent to ${p.name}. You'll be friends when they say yes.`,
        tone: "good",
      });
      startTransition(() => router.refresh());
    } catch {
      setMessage({ text: "Couldn't add them just now. Try again.", tone: "bad" });
    } finally {
      setFriendBusy(null);
    }
  }
  function chatWith(p: { id: string; name: string }) {
    if (me.guest) return setSignInWhy("Sign in to chat.");
    setDmRequest({ id: p.id, name: p.name, at: Date.now() });
    setChatOpen(true);
  }
  // A friend goes somewhere new in town: offer to join them.
  const friendRooms = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const now = new Map(friendsAt.map((f) => [f.id, f.room]));
    const before = friendRooms.current;
    friendRooms.current = now;
    if (!before || me.guest) return;
    const moved = friendsAt.find((f) => before.get(f.id) !== f.room && f.room !== rooms.myRoom);
    if (!moved) return;
    const placeName = rooms.placeOf[moved.id]?.name ?? "";
    const id = setTimeout(() => setNudge({ id: moved.id, name: moved.name, avatar: cleanAvatar(moved.avatar, moved.name), room: moved.room, place: placeName }), 0);
    return () => clearTimeout(id);
  }, [friendsAt, rooms.myRoom, rooms.placeOf, me.guest]);
  const closeNudge = useCallback(() => setNudge(null), []);
  // Each new town: say which friends are in it too.
  const greetedRound = useRef<number | null>(null);
  useEffect(() => {
    if (!round || me.guest || greetedRound.current === round.id) return;
    const playing = new Set(state.players.map((p) => p.id));
    const here = state.friends.friends.filter((f) => playing.has(f.id) || rooms.placeOf[f.id]);
    if (!here.length) return;
    const names = here.slice(0, 3).map((f) => f.name).join(", ");
    const roundId = round.id;
    const id = setTimeout(() => {
      greetedRound.current = roundId;
      setMessage({
        icon: Users,
        text:
          here.length === 1
            ? `Your friend ${names} is in this town too. Open Friends in the menu to find them.`
            : `Your friends are in this town too: ${names}${here.length > 3 ? ` and ${here.length - 3} more` : ""}. Open Friends in the menu to find them.`,
        tone: "info",
      });
    }, 1500);
    return () => clearTimeout(id);
  }, [round, me.guest, state.players, state.friends.friends, rooms.placeOf]);
  const serverNowMs = Date.parse(state.serverNow);
  // Server clock minus this device's clock, so world events start at the same moment for everyone.
  const [clockOffset, setClockOffset] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setClockOffset(Date.parse(state.serverNow) - Date.now()), 0);
    return () => clearTimeout(id);
  }, [state.serverNow]);

  // World events happening right now.
  const liveEvents = state.worldEvents.filter((w) => Date.parse(w.startsAt) <= now && now < Date.parse(w.endsAt));
  const eventOn = (key: string) => liveEvents.some((w) => w.key === key);
  const quietNow = eventOn("quiet_hour");
  const [focusEvent, setFocusEvent] = useState<{ id: number; at: number } | null>(null);
  // Fly the camera to an event (stepping out of any building or ride first).
  function flyToEvent(id: number) {
    setToasts([]);
    if (place || ride !== null) leaveRoom();
    setFocusEvent((f) => ({ id, at: (f?.at ?? 0) + 1 }));
  }
  // What's happening, where, for how long, and any coins to grab.
  const [eventInfo, setEventInfo] = useState<number | null>(null);
  function openEvent(id: number) {
    flyToEvent(id);
    setEventInfo(id);
  }
  async function onEventTap(id: number) {
    if (guest) return setSignInWhy("Sign in to grab event rewards before anyone else does.");
    const res = await claimWorldEvent(id).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    if (res.ok) {
      playSfx("pop");
      quests.track({ type: "event" });
      setMessage({ icon: Coins, text: `You grabbed ${short(Number(res.data.coins))} mint!`, tone: "good" });
      startTransition(() => router.refresh());
    } else setMessage({ text: res.error, tone: "info" });
  }

  // The world's last 30 seconds: the clock turns red and beeps every second.
  const worldLeft = round && phase === "seek" ? Date.parse(round.seekEndsAt) - now : Infinity;
  const urgent = worldLeft <= 30_000 && worldLeft > 0;
  const urgentSec = urgent ? Math.ceil(worldLeft / 1000) : null;
  useEffect(() => {
    if (urgentSec !== null) playSfx("tick");
  }, [urgentSec]);
  // Only a few ghosts still to beat (not golden yet), late enough in the hunt to say so.
  const toBeat = board?.phase === "seek" ? board.ghosts.filter((g) => g.status !== "golden").length : 0;
  const fewLeft = round && phase === "seek" && toBeat > 0 && toBeat <= 2 ? toBeat : null;
  useEffect(() => {
    if (fewLeft === null) return;
    const id = setTimeout(
      () => setMessage({ icon: Timer, text: `Only ${fewLeft} ${fewLeft === 1 ? "ghost is" : "ghosts are"} still to beat in this game. Challenge them before the hour is up!`, tone: "info" }),
      0,
    );
    return () => clearTimeout(id);
  }, [fewLeft]);
  useEffect(() => {
    setSfxEnabled(sound);
    setEventSoundsEnabled(sound);
  }, [sound]);
  // Seats: your 3 minutes are up, or someone sat down just before you.
  const seatNotice = rooms.seatNotice;
  const clearSeatNotice = rooms.clearSeatNotice;
  useEffect(() => {
    if (!seatNotice) return;
    const id = setTimeout(() => {
      setMessage({ icon: Armchair, text: seatNotice.text, tone: "info" });
      clearSeatNotice();
    }, 0);
    return () => clearTimeout(id);
  }, [seatNotice, clearSeatNotice]);
  const guest = me.guest;

  // The last 30 seconds before the hunt: a soft beep every second.
  const joinLeft = round && phase === "join" ? Math.ceil((Date.parse(round.joinEndsAt) - now) / 1000) : null;
  useEffect(() => {
    if (joinLeft === null || joinLeft <= 0 || joinLeft > 30) return;
    playSfx("tick");
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
      () => setMessage({ icon: Coins, text: `Passive income: +${short(passiveGained)} mint. You earn up to ${short(state.prices.passivePerDay)} a day while you have under ${short(state.prices.passiveTarget)}.`, tone: "good" }),
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
  const AD_WHY: Record<string, string> = {
    signed_out: "Sign in to earn 5 mint when you tap an ad's button (up to 5 ads a day).",
    daily_limit: "You've had all 5 ad rewards for today. More tomorrow!",
    already_today: "You've already been rewarded for this ad today.",
    pool_empty: "This ad's mint has run out.",
  };
  async function onBillboardTap(info: { id: string; tile: number; adId: string | null }) {
    const ad = info.adId ? ads.find((a) => a.id === info.adId) : null;
    if (!ad) return setAdvertise({ tile: info.tile });
    setOpenAd({ ad, tile: info.tile, reward: 0, note: null, tapped: false });
    try {
      // Looking is free: this only says what the button would pay.
      const res = await fetch("/api/ads/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adId: ad.id }) });
      const d = (await res.json()) as { reward?: number; reason?: string };
      const reward = Number(d.reward ?? 0);
      setOpenAd((o) => (o && o.ad.id === ad.id && !o.tapped ? { ...o, reward, note: reward > 0 ? null : (d.reason && AD_WHY[d.reason]) || null } : o));
    } catch {}
  }
  // The ad's button ("Visit <brand>" or "Thanks, <brand>!") is what earns the mint.
  async function onAdButton() {
    const o = openAd;
    if (!o || o.tapped) return;
    setOpenAd({ ...o, tapped: true });
    try {
      const res = await fetch("/api/ads/cta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adId: o.ad.id }), keepalive: true });
      const d = (await res.json()) as { coins?: number; leftToday?: number; reason?: string };
      const note =
        d.coins && d.coins > 0
          ? `+${d.coins} mint from ${o.ad.brand}!${d.leftToday ? ` (${d.leftToday} more ad rewards today)` : " That's all your ad rewards for today."}`
          : (d.reason && AD_WHY[d.reason]) || null;
      if (d.coins && d.coins > 0) {
        playSfx("pop");
        startTransition(() => router.refresh());
      }
      setOpenAd((cur) => (cur && cur.ad.id === o.ad.id ? { ...cur, reward: 0, note } : cur));
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
        if (typeof saved.sound === "boolean") setSound(saved.sound);
      }, 0);
      return () => clearTimeout(id);
    } catch {}
  }, []);
  const saveView = (patch: Record<string, boolean>) => {
    try {
      localStorage.setItem("hs-view", JSON.stringify({ sound, ...patch }));
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

  // Keep the board live: fetch fresh state every few seconds (never two at once: on a slow
  // connection they'd pile up and time out).
  const [refreshing, startRefresh] = useTransition();
  // When the refresh in flight started (0 = none); one stuck for 20 s no longer blocks the next.
  const refreshingSince = useRef(0);
  useEffect(() => {
    if (!refreshing) refreshingSince.current = 0;
  }, [refreshing]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (refreshingSince.current && Date.now() - refreshingSince.current < 20_000) return;
      refreshingSince.current = Date.now();
      startRefresh(() => router.refresh());
    };
    const id = setInterval(refresh, 4000);
    const onVisible = () => refresh();
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
      icon: (({ trap: "trap", trapped: "trap", swept: "drone", caught: "catch", shield: "shield", shielded: "shield", decoy: "decoy", streak: "flame", gift: "gift", spray: "gift", hug: "hug", handshake: "handshake", thanks: "hug", duel: "duel", duel_won: "duel", duel_lost: "duel" }) as Record<string, FeedIcon>)[n.kind] ?? "info",
    }));
    // World events that have started: news you can tap to fly there.
    const news = state.worldEvents
      .filter((w) => Date.parse(w.startsAt) <= serverNowMs)
      .map((w) => {
        const kind = WORLD_EVENT_BY_KEY[w.key];
        if (!kind) return null;
        const text = kind.news.replace("{place}", where(w.tile)).replace("{name}", w.name ?? "a ghost");
        const icon: FeedIcon = kind.category === "twist" ? "build" : kind.reward ? "coin" : kind.category === "emergency" ? "drone" : "info";
        return { key: `w${w.id}`, at: w.startsAt, text: `${kind.title}: ${text}`, tone: "info" as const, avatar: null, icon, eventId: w.id } as FeedItem;
      })
      .filter((x): x is FeedItem => x !== null);
    return [...pub, ...mine, ...news].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 60);
  }, [state.events, state.notifications, state.worldEvents, serverNowMs, botName, myLastSpot, where, me.avatar]);
  const unread = feed.filter((f) => Date.parse(f.at) > Date.parse(feedSeenAt)).length;

  // Hugs, handshakes and mint that arrived since you last opened My gifts.
  const newGifts = state.notifications.filter((n) => ["hug", "handshake", "gift", "spray"].includes(n.kind) && Date.parse(n.at) > giftsSeenAt).length;
  function openGifts() {
    setGiftsOpen(true);
    const t = Date.parse(state.serverNow);
    setGiftsSeenAt(t);
    try {
      localStorage.setItem("hs-gifts-seen", String(t));
    } catch {}
  }
  // Hug and Shake hands buttons for someone (they say how it went on the message line).
  const greet = (p: { id: string; name: string }, compact = true) => (
    <GreetButtons person={p} compact={compact} onDone={(text, ok) => setMessage({ text, tone: ok ? "good" : "bad" })} />
  );

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
    if (!fresh.length || feedOpen || quietNow) return;
    const id = setTimeout(() => setToasts((list) => [...fresh.slice(0, 2).reverse(), ...list].slice(0, 2)), 0);
    return () => clearTimeout(id);
  }, [feed, feedOpen, quietNow]);
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

  // Nothing is searched or swept any more: the map only shows the ghosts' lights.
  const markers: CityMarkers = NO_MARKERS;
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

  // Tapping a building or balloon takes you inside to meet the people there. A building with
  // several levels (ground, floors, rooftop) asks which one; nothing opens the chat by itself.
  function onRoom(room: PlaceRoom) {
    // Going to a friend: straight onto their floor.
    if (goTo && room.id === goTo.building) {
      const level = room.levels?.find((l) => l.id === goTo.level);
      setGoTo(null);
      if (level) return goToLevel(room, level);
    }
    // Inside somewhere, or on a ride: taps just look around. From a hot-air balloon you can
    // still tap a building (or its bubble) to go and visit it.
    if (place) return;
    if (ride !== null && (ride.kind !== "balloon" || room.kind === "balloon")) return;
    if (room.kind === "balloon") return boardRide({ kind: "balloon", index: Number(room.id.split(":")[1]), name: room.name, capacity: room.capacity });
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
    setMessage({
      icon: Building2,
      text: guest
        ? `Welcome to ${info.name}. Sign in to chat with the people here.`
        : `You're in ${info.name}. Tap the floor to walk, tap anything glowing to use it, and tap Chat to talk.`,
      tone: "info",
    });
  }
  // Hop on a ride: a balloon, train, bus, car, boat, Ferris wheel cabin or water slide.
  function boardRide(r: { kind: RideKindName; index: number; name: string; capacity: number }) {
    setPickRide(false);
    setPlace(null);
    setActivity(null);
    const info = RIDE_INFO[r.kind];
    if (!guest) {
      const res = rooms.enter({
        id: rideRoom(r.kind, r.index),
        name: r.name,
        capacity: r.capacity,
        kind: r.kind === "balloon" ? "balloon" : "ride",
        ride: r.kind === "balloon" ? undefined : r.kind,
        rideMs: r.kind !== "balloon" && info.minutes ? info.minutes * 60_000 : undefined,
      });
      if (!res.ok) return setMessage({ text: res.reason === "full" ? `${r.name} is full. Try another one!` : "Sign in to ride.", tone: "info" });
      if (state.streak && !state.streak.today && !rodeToday.current) {
        rodeToday.current = true;
        void rodeSomething().then((s) => {
          if (s.ok && s.newDay) startTransition(() => router.refresh());
        });
      }
    } else if (r.kind !== "slide") {
      // Watchers get the view for a while, but need to sign in to chat on board.
      setTimeout(() => setRide((cur) => (cur?.kind === r.kind && cur.index === r.index ? null : cur)), 60_000);
    }
    setRide({ kind: r.kind, index: r.index });
    setMessage({ icon: RIDE_ICONS[r.kind], text: guest && r.kind !== "slide" ? "Enjoy the ride! Sign in to chat with the people on board." : RIDE_HELLO[r.kind], tone: "info" });
  }
  function leaveRoom() {
    rooms.leave();
    setRide(null);
    setPlace(null);
    setActivity(null);
  }
  // The house button: fly over to your house (or build one, if it isn't in this town).
  function showMyHouse() {
    if (myHouseTile === null) return setHouseOpen(true);
    if (phase === "join") return setMessage({ icon: House, text: `Your house goes up with the rest of the town, in ${countdown}.`, tone: "info" });
    const tile = myHouseTile;
    const fly = () => setFlyTo((f) => ({ tile, at: (f?.at ?? 0) + 1 }));
    // Inside somewhere or on a ride: step out first, then fly over once the camera's back.
    if (place || ride !== null) {
      leaveRoom();
      setTimeout(fly, 1700);
    } else fly();
    const home = tileAt(plan, tile).home;
    setMessage({ icon: House, text: `There's your house${home?.name ? `, ${home.name}` : ""}. Tap it to go inside. Change it from My house in the menu.`, tone: "info" });
  }
  // "Visit my house": straight into its ground floor.
  async function visitMyHouse() {
    setHouseOpen(false);
    if (myHouseTile === null) return setMessage({ text: "Your house isn't in this game. Switch it on and it'll be in the next one.", tone: "info" });
    const home = tileAt(plan, myHouseTile).home;
    if (!home) return;
    const { levelsOf } = await import("./city/levels");
    const levels = levelsOf(tileAt(plan, myHouseTile), plan).map((l) => ({ id: l.id, label: l.label, capacity: l.capacity }));
    if (!levels.length) return;
    rooms.leave();
    setActivity(null);
    goToLevel({ id: `b:${myHouseTile}`, name: homeLabel(home), capacity: levels.reduce((n, l) => n + l.capacity, 0), kind: "building", levels }, levels[0]);
  }
  // A ride that ends by itself (the water slide's splash).
  function onRideEnd() {
    const was = ride?.kind;
    leaveRoom();
    if (was === "slide") {
      playSfx("pop");
      setMessage({ icon: RIDE_ICONS.slide, text: "SPLASH! What a ride. Go again?", tone: "good" });
    }
  }
  // Inside a place: something glowing was tapped (a seat, the bar, darts, the DJ deck...).
  function onInteract(item: CityInteract) {
    // At a stadium or arena: the matches (anyone can look; tickets and bets need an account).
    if (item.kind === "match") return setSportsOpen(item.sport ?? "football");
    if (guest) return setSignInWhy(item.kind === "seat" ? "Sign in to sit down here." : `Sign in to use the ${item.label.toLowerCase() || "games"} here: play games, order food, sit down and chat with people.`);
    if (item.kind === "dance") return startDancing();
    if (item.kind === "seat") {
      if (rooms.mySeat === item.id) return setActivity(item as ActivityItem);
      const res = rooms.sit(item.id);
      if (res.ok) {
        playSfx("pop");
        return setMessage({
          icon: Armchair,
          text: "You sat down. Seats are for 3 minutes, and people sitting down are the ones most likely to be handed a side quest.",
          tone: "info",
        });
      }
      if (res.reason === "taken") return setMessage({ icon: Armchair, text: `${rooms.seats[item.id]?.name ?? "Someone"} is sitting there. Seats free up after 3 minutes at most.`, tone: "info" });
      return setMessage({ text: "You need to be in this room to sit there.", tone: "info" });
    }
    setActivity(item as ActivityItem);
  }

  // Sports on now (for the bubbles over stadiums and arenas): worked out once a minute.
  const sportsMinute = Math.floor(now / 60_000);
  const liveVenues = useMemo(() => {
    const at = sportsMinute * 60_000 + 30_000;
    return Object.fromEntries(SPORTS.map((sp) => [sp, liveLabel(sp, at).title])) as Record<Sport, string | null>;
  }, [sportsMinute]);

  // What you can ride: the city's list, or just the balloons until it arrives.
  const rideList: CityRide[] = rides.length
    ? rides
    : Array.from({ length: Math.max(balloonCount, 1) }, (_, k) => ({ kind: "balloon" as const, index: k, name: `${BALLOON_NAMES[k % BALLOON_NAMES.length]} balloon`, capacity: 1000 }));

  /** Go to where a friend is: their floor of a building, their balloon or their ride. */
  function goToFriend(room: string, name: string) {
    setFriendsOpen(false);
    setNudge(null);
    if (me.guest || rooms.myRoom === room) return;
    const b = /^(b:\d+):(g|r|f\d+)$/.exec(room);
    if (b) {
      if (place || ride !== null) leaveRoom();
      setGoTo({ building: b[1], level: b[2] });
      setOpenReq((r) => ({ id: b[1], at: (r?.at ?? 0) + 1 }));
      return;
    }
    const bal = /^balloon:(\d+)$/.exec(room);
    const v = /^v:([a-z]+):(\d+)$/.exec(room);
    const r = bal
      ? (rideList.find((x) => x.kind === "balloon" && x.index === Number(bal[1])) ?? { kind: "balloon" as const, index: Number(bal[1]), name: "Hot-air balloon", capacity: 1000 })
      : v
        ? rideList.find((x) => x.kind === v[1] && x.index === Number(v[2]))
        : undefined;
    if (r) return boardRide(r);
    setMessage({ text: `Couldn't get to ${name} right now. Try again in a moment.`, tone: "info" });
  }

  function popBalloon(slot: number) {
    startTransition(async () => {
      const res = await claimBalloon(slot).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
      if (res.ok) playSfx("pop");
      setMessage(
        res.ok
          ? { icon: Coins, text: `Pop! +${res.coins} mint.${res.leftToday > 0 ? ` ${res.leftToday} more balloon${res.leftToday === 1 ? "" : "s"} today.` : " That's all for today."}`, tone: "good" }
          : { text: res.error, tone: "info" },
      );
      router.refresh();
    });
  }

  // ---- ghost duels
  const ghostList = board?.ghosts;
  const openGhost = useCallback(
    (id: string) => {
      const g = ghostList?.find((x) => x.id === id);
      if (g) setGhostFor(g);
    },
    [ghostList],
  );
  const rules = board?.rules ?? DEFAULT_RULES;
  // Your live duel: a ghost who's been challenged gets the pop-up (wherever they are); anyone
  // whose duel is under way (or a hunter waiting for an answer) gets the duel screen back.
  const liveDuel = board?.duel && (board.duel.status === "asked" || board.duel.status === "playing") ? board.duel : null;
  const askedGhost = liveDuel && liveDuel.role === "ghost" && liveDuel.status === "asked" && duelOn?.id !== liveDuel.id ? liveDuel : null;
  const reopenDuel = liveDuel && !askedGhost && duelOn?.id !== liveDuel.id ? liveDuel : null;
  useEffect(() => {
    if (!reopenDuel) return;
    const id = setTimeout(() => setDuelOn(reopenDuel), 0);
    return () => clearTimeout(id);
  }, [reopenDuel]);
  // What the folded bottom bar says: where you are, or how the game's going for you.
  const dockHint = ((): { icon: LucideIcon; text: string; colour?: string; hot?: boolean } => {
    if (!round || phase === "done") return { icon: Hammer, text: "Building the next town…" };
    if (isDancing) return { icon: Music, text: "Dancing", colour: "#e64980" };
    if (ride !== null) {
      const name = rooms.myRoomInfo?.name ?? rideList.find((r) => r.kind === ride.kind && r.index === ride.index)?.name ?? RIDE_INFO[ride.kind].label;
      return { icon: RIDE_ICONS[ride.kind], text: name, colour: RIDE_INFO[ride.kind].colour };
    }
    if (place) return { icon: Building2, text: rooms.myRoomInfo?.name ?? placeRoom?.name ?? "Inside", colour: "#7048e8" };
    if (guest) return { icon: Users, text: "Watching live" };
    if (board?.phase === "join") {
      return board.me.role === "ghost"
        ? { icon: Ghost, text: `You're a ghost · the hunt starts in ${countdown}` }
        : { icon: Ghost, text: `Be a ghost? Joining closes in ${countdown}`, hot: true };
    }
    if (board?.phase === "seek" && board.me.role === "ghost") {
      const m = board.me;
      if (m.out) return { icon: Ghost, text: "You're out of this game" };
      if (m.golden) return { icon: Crown, text: "You're golden!", colour: "#e8a800" };
      return { icon: Ghost, text: `You're a ghost · ${m.wins} won · ${m.losses} lost` };
    }
    if (board?.phase === "seek") return { icon: Swords, text: `Explore · Chat · Ghosts ${board.ghosts.length}` };
    return { icon: Compass, text: "Explore · Chat", colour: "#e64980" };
  })();
  const duelStrip = board ? (
    <DuelStatus board={board} countdown={countdown} busy={busy} onBeGhost={() => setConfirmHide(true)} onGhosts={() => setGhostsOpen(true)} />
  ) : null;

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    // Sign out on the server (clears the login cookies) and in this browser at the same time,
    // but never wait more than a few seconds; then load the city fresh.
    const wait = new Promise((r) => setTimeout(r, 4000));
    await Promise.race([Promise.allSettled([signOutNow(), createClient().auth.signOut({ scope: "local" })]), wait]);
    // A full page load (not a quick in-app hop) so nothing from the old account lingers.
    window.location.replace(new URL("/", window.location.origin).href);
  }


  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      {round && (
        <Safe name="City view" fallback={<div className="absolute inset-0 grid place-items-center text-muted">Rebuilding the city…</div>}>
          <CityView
            seed={round.id}
            tileCount={round.tileCount}
            markers={markers}
            events={cityEvents}
            onBillboard={onBillboardTap}
            ads={ads}
            onAdViews={onAdViews}
            ghosts={ghostLights}
            paused={signInShown}
            onGhost={openGhost}
            flyTo={flyTo}
            roomCounts={rooms.buildingCounts}
            onRoom={onRoom}
            ride={ride}
            onRides={setRides}
            houses={state.houses}
            dance={isDancing && dancing ? { id: me.id, move: dancing.move, with: dancing.with } : null}
            friendsAt={friendsAt}
            openRoom={openReq}
            roomPeople={place ? hereNow : undefined}
            dancers={inClub ? dancers : undefined}
            onRideEnd={onRideEnd}
            onInteract={onInteract}
            seats={rooms.seats}
            mySeat={rooms.mySeat}
            place={place}
            onNpc={(id: string) => {
              if (guest) return setSignInWhy("Sign in to chat with the people here.");
              setNpcTap({ id, at: Date.now() });
            }}
            onBalloons={setBalloonCount}
            revealed={phase !== "join"}
            caughtFaces={state.caughtFaces}
            worldEvents={state.worldEvents}
            focusEvent={focusEvent}
            onEventTap={onEventTap}
          onEventInfo={setEventInfo}
          liveVenues={liveVenues}
            clockOffsetMs={clockOffset}
            onHover={setHover}
            meAvatar={me.avatar}
            coinBalloon={state.balloon?.slot ?? null}
            onBalloon={popBalloon}
            progress={huntProgress}
            nightFirst={round.id % 2 === 1}
          />
        </Safe>
      )}

      {/* Inside a place: mint spraying, the jukebox, duel invites and room news. */}
      {meP && rooms.myRoom && (
        <Safe name="Room activity">
          <RoomActivityLayer roundId={round?.id ?? null} roomId={rooms.myRoom} me={meP} />
        </Safe>
      )}

      {/* The world's last minutes: a red glow around the edges. */}
      {(urgent || eventOn("final_countdown")) && (
        <div
          aria-hidden
          className={cn("pointer-events-none absolute inset-0 z-[5]", urgent ? "animate-pulse" : "")}
          style={{ boxShadow: `inset 0 0 ${urgent ? 120 : 70}px rgba(229, 72, 77, ${urgent ? 0.55 : 0.3})` }}
        />
      )}

      {/* Top: round clock and numbers (stacked, so big numbers fit) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 sm:p-4">
        {round ? (
          <StatsCard
            city={plan.city.name}
            phase={phase}
            countdown={countdown}
            hidden={board ? board.ghosts.length : round.hidersRemaining}
            hidersTotal={board ? Math.max(board.ghosts.length, round.hidersTotal) : round.hidersTotal}
            golden={board ? board.ghosts.filter((g) => g.status === "golden").length : 0}
            pool={round.pool}
            online={online}
            visits={state.site.visits}
            players={state.site.players}
            minimised={statsMin}
            onToggle={() => setStatsMin(!statsMin)}
            sound={sound}
            onSound={() => { setSound(!sound); saveView({ sound: !sound }); }}
            sponsor={round.sponsor}
            urgent={urgent}
          />
        ) : (
          <span />
        )}
        <div className="flex flex-col items-end gap-2">
          {guest ? (
            <div className="pointer-events-auto flex items-center gap-2">
              <button onClick={() => setHowOpen(true)} className="glass grid size-8 shrink-0 place-items-center rounded-full font-display font-bold sm:size-9" aria-label="How it works">
                ?
              </button>
              <button onClick={() => setSignIn({ why: null })} className="flex h-8 items-center whitespace-nowrap rounded-full bg-gold px-3.5 text-sm font-semibold text-ink shadow sm:h-9 sm:px-4">
                Sign in to play
              </button>
            </div>
          ) : (
          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <span className="glass hidden h-9 whitespace-nowrap rounded-full px-2.5 text-xs font-bold leading-9 sm:inline-block" title="Your level (level up from the menu)">
              Lv {me.level}
            </span>
            {me.bigFish && (
              <span className="glass flex h-8 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-bold text-[#1c7ed6] sm:h-9 sm:px-2.5" title="You hold 10,000+ mint: everyone sees you as a big fish">
                <Fish className="size-3.5" />
                <span className="hidden sm:inline">Big fish</span>
              </span>
            )}
            {state.streak && <StreakPill streak={state.streak} onOpen={() => { setStreakOpen(true); setMenu(false); setFeedOpen(false); }} />}
            <span className="glass inline-block h-8 whitespace-nowrap rounded-full px-2.5 text-xs leading-8 sm:h-9 sm:px-3 sm:text-sm sm:leading-9" title={`${me.coins} mint · level ${me.level}`}>
              <b className="text-gold-dark">{short(me.coins)}</b>
              <span className="hidden sm:inline"> mint</span>
              {me.bonusCoins > 0 && <span className="text-muted"> +{short(me.bonusCoins)}</span>}
            </span>
            <button
              onClick={() => {
                setFeedOpen((v) => !v);
                setMenu(false);
                setToasts([]);
                setFeedSeenAt(new Date(now).toISOString());
              }}
              className="glass relative grid size-8 shrink-0 place-items-center rounded-full sm:size-9"
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
              className="glass grid size-8 shrink-0 place-items-center rounded-full text-base font-semibold sm:size-9"
              aria-label="Menu"
            >
              {menu ? <X className="size-4" /> : <MenuIcon className="size-4" />}
            </button>
          </div>
          )}
        </div>
      </div>

      {/* Watchers on a computer: the Newtown logo, top centre. */}
      {guest && (
        <div className="pointer-events-none absolute inset-x-0 top-0 hidden justify-center p-4 sm:flex" title="Newtown">
          <span className="glass flex h-9 items-center rounded-full pl-1 pr-3.5 shadow">
            <Logo size={28} />
          </span>
        </div>
      )}

      {/* Latest notices pop up under the bell; the bell opens the full list. */}
      <div className={cn("pointer-events-none absolute right-3 z-10 flex w-[min(19rem,calc(100vw-1.5rem))] flex-col items-end gap-1.5 sm:right-4 sm:top-16", statsMin ? "top-14" : "top-[14.5rem]")}>
        {!feedOpen &&
          !menu &&
          toasts.map((n) => (
            <button
              key={n.key}
              onClick={() => {
                if (n.eventId) return openEvent(n.eventId);
                if (!guest && (n.icon === "hug" || n.icon === "handshake" || n.icon === "gift")) {
                  setToasts([]);
                  return openGifts();
                }
                setFeedOpen(true);
                setFeedSeenAt(new Date(now).toISOString());
                setToasts([]);
              }}
              className="glass pointer-events-auto w-full rounded-2xl px-3 py-2 text-left shadow-lg"
            >
              <FeedRow item={n} now={now} compact />
            </button>
          ))}
      </div>
      {feedOpen && (
        <NotificationsPanel
          feed={feed}
          now={now}
          onClose={() => setFeedOpen(false)}
          onPick={(f) => {
            setFeedOpen(false);
            if (f.eventId) openEvent(f.eventId);
            else if (!guest && (f.icon === "hug" || f.icon === "handshake" || f.icon === "gift")) openGifts();
          }}
        />
      )}

      {menu && (
        <Menu
          me={me}
          city={plan.city.name}
          hasResults={Boolean(state.results)}
          onClose={() => setMenu(false)}
          onHowItWorks={() => { setMenu(false); setHowOpen(true); }}
          onEditAvatar={() => { setMenu(false); setEditAvatar(true); }}
          onResults={() => { setMenu(false); if (state.results) setShowResults(state.results.roundId); }}
          onMyStyle={guest ? undefined : () => { setMenu(false); setStyleOpen(true); }}
          onMyHouse={guest ? undefined : () => { setMenu(false); setHouseOpen(true); }}
          onFriends={guest ? undefined : () => { setMenu(false); setFriendsOpen(true); }}
          friendRequests={state.friends.incoming.length}
          onMyGifts={guest ? undefined : () => { setMenu(false); openGifts(); }}
          newGifts={newGifts}
          coins={guest ? undefined : me.coins}
          level={guest ? undefined : me.level}
          onChangePin={() => router.push("/welcome")}
          onSignOut={() => { setMenu(false); setConfirmSignOut(true); }}
        />
      )}
      {howOpen && <HowItWorks onClose={() => setHowOpen(false)} />}
      {ghostsOpen && board && (
        <GhostsSheet
          ghosts={board.ghosts}
          rules={rules}
          meId={me.id}
          onPick={(g) => {
            setGhostsOpen(false);
            setFlyTo((f) => ({ tile: g.tile, at: (f?.at ?? 0) + 1 }));
            setGhostFor(g);
          }}
          onClose={() => setGhostsOpen(false)}
        />
      )}
      {ghostFor && (
        <GhostCardSheet
          key={ghostFor.id}
          ghost={ghostFor}
          rules={rules}
          guest={guest}
          onChat={(g) => {
            setGhostFor(null);
            chatWith(g);
          }}
          onChallenged={(d) => {
            setGhostFor(null);
            setDuelOn(d);
            startTransition(() => router.refresh());
          }}
          onSignIn={() => {
            setGhostFor(null);
            setSignInWhy("Sign in to challenge ghosts: 10 mint a duel, and you win a slice of their stake if you beat them.");
          }}
          onClose={() => setGhostFor(null)}
        />
      )}
      {duelOn && (
        <DuelScreen
          key={duelOn.id}
          initial={duelOn}
          me={{ name: me.name ?? "You", avatar: me.avatar }}
          onClose={() => {
            setDuelOn(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
      {askedGhost && !guest && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3">
          <ChallengePopup
            key={askedGhost.id}
            duel={askedGhost}
            onPlay={(d) => setDuelOn(d)}
            onDone={(text) => {
              setMessage({ text, tone: "info" });
              startTransition(() => router.refresh());
            }}
          />
        </div>
      )}
      {streakOpen && state.streak && <StreakSheet streak={state.streak} now={now} onClose={() => setStreakOpen(false)} />}
      {giftsOpen && !guest && <MyGiftsSheet now={now} onClose={() => setGiftsOpen(false)} onChanged={() => startTransition(() => router.refresh())} />}
      {styleOpen && <StyleSheet onClose={() => setStyleOpen(false)} />}
      {friendsOpen && !guest && (
        <FriendsSheet
          initial={state.friends}
          placeOf={rooms.placeOf}
          playing={Object.fromEntries(state.players.map((p) => [p.id, p.role]))}
          suggestions={[...hereNow, ...state.players.filter((p) => p.id !== me.id && !hereNow.some((h) => h.id === p.id))]}
          myRoom={rooms.myRoom}
          onGo={(f, room) => goToFriend(room, f.name)}
          onMessage={(f) => {
            setFriendsOpen(false);
            chatWith(f);
          }}
          onChanged={() => startTransition(() => router.refresh())}
          onClose={() => setFriendsOpen(false)}
          greet={(f) => greet(f, false)}
        />
      )}
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


      {confirmHide && round && (
        <Sheet onClose={() => setConfirmHide(false)}>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Ghost className="size-5 text-me" />Be a ghost this round?</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
            <Timer className="size-4 text-gold-dark" />
            The hunt starts in <span className="tabular-nums">{countdown}</span>
          </p>
          <div className="mt-3 rounded-2xl bg-panel-2 p-4 text-center">
            <p className="text-sm text-muted">You&apos;re putting down</p>
            <p className="font-display text-4xl font-extrabold">{short(state.prices.stake)} mint</p>
            <p className="text-xs text-muted">You have {short(me.coins)}. After this: {short(Math.max(0, me.coins - state.prices.stake))}.</p>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-ink/80">
            <Li icon={Sparkles}>When the hunt starts, your light shows on the map for everyone. You don&apos;t hide or move: hunters come to you.</Li>
            <Li icon={Swords}>Hunters challenge you to a quick game (Rock-Paper-Scissors for now, first to {rules.firstTo}). A challenge pops up wherever you are: answer within {rules.answerSeconds} seconds or you lose that duel.</Li>
            <Li icon={Crown}>Win {rules.goldenWins} duels and you turn golden: safe for the rest of the game, your stake back, and a share of the prize pool.</Li>
            <Li icon={CircleX}>Lose {rules.outLosses} and you&apos;re out. Each loss costs you a {rules.outLosses === 3 ? "third" : "slice"} of your stake: {Math.round(state.prices.winShare * 100)}% of it to the hunter, the rest to the pool.</Li>
          </ul>
          <div className="mt-4 space-y-2">
            <button
              disabled={busy}
              onClick={() => {
                setConfirmHide(false);
                act(() => joinRound("hider"), () => setMessage({ icon: Ghost, text: `You're a ghost! When the hunt starts in ${countdown}, your light goes on and hunters can challenge you.`, tone: "info" }));
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
        <Results results={state.results} onClose={() => setShowResults(null)} me={me.name ?? "Me"} city={plan.city.name} signedIn={!guest} />
      )}


      {confirmSignOut && (
        <Sheet onClose={() => !signingOut && setConfirmSignOut(false)}>
          <h2 className="font-display text-xl font-bold">Sign out?</h2>
          <p className="mt-1 text-sm text-muted">
            {isHider && entry && !entry.caught
              ? "Your light stays on the map while you're away, and challenges you don't answer count as losses. Sign back in any time with your email and PIN."
              : "You can sign back in any time with your email and PIN."}
          </p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirmSignOut(false)} disabled={signingOut} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold disabled:opacity-50">
              Stay
            </button>
            <button
              onClick={signOut}
              disabled={signingOut}
              aria-busy={signingOut}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink py-2.5 font-semibold text-white disabled:opacity-80"
            >
              {signingOut && <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />}
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </Sheet>
      )}

      {sportsOpen && (
        <Safe name="Sports">
          <SportsSheet
            sport={sportsOpen}
            signedIn={!guest}
            onClose={() => {
              setSportsOpen(null);
              startTransition(() => router.refresh());
            }}
            onSignIn={() => {
              setSportsOpen(null);
              setSignInWhy("Sign in to watch matches and bet mint on who wins.");
            }}
          />
        </Safe>
      )}
      {eventInfo !== null && (
        <EventInfoSheet
          event={state.worldEvents.find((w) => w.id === eventInfo) ?? null}
          now={now}
          where={where}
          onClose={() => setEventInfo(null)}
          onShow={() => {
            flyToEvent(eventInfo);
            setEventInfo(null);
          }}
          onGrab={() => {
            const id = eventInfo;
            setEventInfo(null);
            void onEventTap(id);
          }}
        />
      )}
      {signInShown && (
        <SignInOverlay
          why={signIn?.why ?? null}
          signedIn={!guest}
          welcome={welcomeDone ? null : welcome}
          meName={me.name}
          onClose={closeSignIn}
          onSignOut={() => void signOut()}
        />
      )}
      {houseOpen && (
        <HouseSheet onClose={() => setHouseOpen(false)} onVisit={() => void visitMyHouse()} standingNow={myHouseTile !== null} />
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
              const hereNow = place?.building === pickPlace.id && place.level === lvl.id;
              return (
                <button
                  key={lvl.id}
                  onClick={() => (hereNow ? setPickPlace(null) : goToLevel(pickPlace, lvl))}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left",
                    hereNow ? "bg-[#7048e8]/12 ring-2 ring-[#7048e8]" : "bg-panel-2 hover:bg-gold/20",
                  )}
                  aria-current={hereNow ? "location" : undefined}
                >
                  <Icon className={cn("size-5 shrink-0", hereNow ? "text-[#7048e8]" : "text-muted")} />
                  <span className="flex-1 font-semibold">
                    {lvl.label}
                    {hereNow && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#7048e8] px-2 py-0.5 align-middle text-[10px] font-bold text-white">
                        <MapPin className="size-3" />
                        You&apos;re here
                      </span>
                    )}
                  </span>
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
      {pickRide && (
        <ExploreSheet
          tab={exploreTab}
          onTab={setExploreTab}
          rides={rideList}
          counts={rooms.counts}
          liveVenues={liveVenues}
          onRide={boardRide}
          onSport={(sp) => {
            setPickRide(false);
            setSportsOpen(sp);
          }}
          onClose={() => setPickRide(false)}
        />
      )}
      {activity && rooms.myRoom && (
        <Safe name="Activity">
          <ActivitySheet
            item={activity}
            roomId={activity.place}
            me={meP}
            members={rooms.members}
            roundId={round?.id ?? null}
            onClose={() => setActivity(null)}
            seating={rooms}
            onUseStairs={
              placeRoom && (placeRoom.levels?.length ?? 0) > 1
                ? () => {
                    setActivity(null);
                    setPickPlace(placeRoom);
                  }
                : undefined
            }
          />
        </Safe>
      )}
      {giveTo && (
        <Safe name="Give coins">
          <GiveCoinsSheet
            to={giveTo}
            onClose={() => {
              setGiveTo(null);
              startTransition(() => router.refresh());
            }}
          />
        </Safe>
      )}
      {questOpen && (
        <Safe name="Quest card">
          <QuestSheet quest={quests.quest} onClose={() => setQuestOpen(false)} players={rooms.members.filter((m) => m.id !== me.id)} />
        </Safe>
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
          {openAd.note ? (
            <p className="mt-2 rounded-xl bg-gold/25 px-3 py-2 text-sm font-semibold text-gold-dark"><Coins className="mr-1 inline size-4 align-[-0.15em]" />{openAd.note}</p>
          ) : openAd.reward > 0 && !openAd.tapped ? (
            <p className="mt-2 rounded-xl bg-gold/15 px-3 py-2 text-sm font-semibold text-gold-dark">
              <Coins className="mr-1 inline size-4 align-[-0.15em]" />
              Tap {openAd.ad.link ? `Visit ${openAd.ad.brand}` : "the button"} below to earn {openAd.reward} mint.
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button onClick={() => setOpenAd(null)} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
              Back to the city
            </button>
            {openAd.ad.link ? (
              <a
                href={openAd.ad.link}
                target="_blank"
                rel="noopener noreferrer sponsored"
                onClick={() => void onAdButton()}
                className="flex-1 rounded-xl bg-gold py-2.5 text-center font-semibold text-ink"
              >
                Visit {openAd.ad.brand}
              </a>
            ) : (
              <button
                onClick={() => void onAdButton()}
                disabled={openAd.tapped}
                className="flex-1 rounded-xl bg-gold py-2.5 text-center font-semibold text-ink disabled:opacity-60"
              >
                Thanks, {openAd.ad.brand}!
              </button>
            )}
          </div>
          <p className="mt-3 text-center text-[11px] text-muted">
            Want your own billboard? <Link href="/advertise" className="underline">Advertise here</Link>
          </p>
        </Sheet>
      )}


      {/* Bottom: messages, controls and chat */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:gap-2 sm:p-4">
        {!guest && (
          <Safe name="Quest banner">
            <QuestBanner quest={quests.quest} onOpen={() => setQuestOpen(true)} />
          </Safe>
        )}
        {!guest && nudge && <FriendNudge friend={nudge} place={nudge.place} onJoin={() => goToFriend(nudge.room, nudge.name)} onClose={closeNudge} />}
        {!guest && rooms.myRoom && !isDancing && (
          <PeopleHere room={rooms.myRoom} people={hereNow} statusOf={friendStatusOf} busy={friendBusy} onChat={chatWith} onAddFriend={befriend} greet={greet} />
        )}
        {busy && !message && (
          <p className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" role="status">
            <span className="size-3.5 animate-spin rounded-full border-2 border-line border-t-gold" aria-hidden />
            Working on it…
          </p>
        )}
        {message && (
          <p
            className={cn(
              "pointer-events-auto max-w-xl rounded-xl px-3 py-1.5 text-xs font-medium shadow-lg sm:px-4 sm:py-2 sm:text-sm",
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

        <div className={cn("flex w-full max-w-xl items-end gap-2", dockOpen ? "justify-between" : "justify-center")}>
          {dockOpen ? (
            round ? (
              <button
                onClick={() => {
                  // While the town is still a building site, there's nothing to explore yet.
                  if (phase === "join")
                    return setMessage({ icon: Hammer, text: `The town is still being built. Explore opens when the hunt starts, in ${countdown}.`, tone: "info" });
                  setExploreTab("rides");
                  setPickRide(true);
                }}
                aria-disabled={phase === "join"}
                className={cn(
                  "glass pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:px-4 sm:py-2 sm:text-sm",
                  phase === "join" && "opacity-60",
                )}
              >
                {phase === "join" ? <Lock className="size-4 text-muted" /> : <Compass className="size-4 text-[#e64980]" />}
                Explore
              </button>
            ) : (
              <span />
            )
          ) : null}
          <div className="flex min-w-0 items-center gap-2">
            {!dockOpen && (
              <button
                onClick={() => setDockOpen(true)}
                className={cn(
                  "pointer-events-auto relative flex min-w-0 max-w-full items-center gap-1.5 rounded-full py-1.5 pl-3 pr-2.5 text-xs font-semibold shadow sm:text-sm",
                  dockHint.hot ? "bg-gold text-ink" : "glass",
                )}
                aria-expanded={false}
                aria-label={`${dockHint.text}. Show the bottom bar`}
              >
                <dockHint.icon className="size-4 shrink-0" style={dockHint.colour ? { color: dockHint.colour } : undefined} aria-hidden />
                <span className="min-w-0 truncate">{dockHint.text}</span>
                <ChevronUp className="size-4 shrink-0 opacity-60" aria-hidden />
                {chatUnread > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-hit px-1 text-[11px] text-white" title="Unread chat messages">
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
              </button>
            )}
            {!dockOpen && !isDancing && (place || ride !== null) && (
              <button onClick={leaveRoom} className="glass pointer-events-auto flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow sm:text-sm">
                <LogOut className="size-4" />
                {ride !== null ? "Get off" : "Leave"}
              </button>
            )}
            {!dockOpen && guest && round && !place && ride === null && (
              <button onClick={() => setAdExplainer(true)} className="glass pointer-events-auto flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow sm:text-sm">
                <Megaphone className="size-4 text-gold-dark" />
                Advertise
              </button>
            )}
            {dockOpen && (
              <button
                onClick={() => setDockOpen(false)}
                className="glass pointer-events-auto grid size-8 shrink-0 place-items-center rounded-full sm:size-9"
                aria-expanded
                aria-label="Fold the bottom bar away"
              >
                <ChevronDown className="size-4" />
              </button>
            )}
            {!guest && round && (
              <button
                onClick={showMyHouse}
                className="glass pointer-events-auto grid size-8 shrink-0 place-items-center rounded-full shadow sm:size-9"
                aria-label={myHouseTile !== null ? "Show my house" : "Build my house"}
                title={myHouseTile !== null ? "Show my house" : "Build my house"}
              >
                <House className="size-4 text-[#7048e8]" />
              </button>
            )}
          </div>
          {round && (
            <Safe name="Chat">
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
                dmRequest={dmRequest}
                externalNpc={npcTap}
                enteredAt={rooms.enteredAt}
                onGiveCoins={guest ? undefined : setGiveTo}
                greet={guest ? undefined : greet}
                friendStatusOf={friendStatusOf}
                onAddFriend={guest ? undefined : befriend}
                hideButton={!dockOpen}
                onUnread={setChatUnread}
                onSignIn={() => setSignIn({ why: null })}
              />
            </Safe>
          )}
        </div>

        {dockOpen && (
        <div className="glass pointer-events-auto w-full max-w-xl rounded-2xl p-2.5 sm:p-3">
          {!round || phase === "done" ? (
            <p className="text-sm text-muted">Building the next town…</p>
          ) : guest && !place && ride === null ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-muted">
                <LogoMark size={20} className="mr-1.5 inline align-[-0.3em] sm:hidden" />
                <b className="text-ink sm:hidden">Newtown · </b>
                <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-hit align-middle" />
                <b className="text-ink">Watching live.</b> <span className="rounded bg-ink px-1 text-[10px] font-bold text-white">18+</span>{" "}
                {phase === "join"
                  ? `Ghosts are getting ready. The hunt starts in ${countdown}.`
                  : `The hunt is on: ${short(board?.ghosts.length ?? round.hidersRemaining)} ghosts lit up, ${short(round.pool)} mint in the pool. Tap a light to see a ghost.`}
              </p>
              <div className="grid grid-cols-3 gap-2 text-sm sm:flex">
                <button onClick={() => setHowOpen(true)} className="whitespace-nowrap rounded-xl bg-panel-2 px-3 py-2.5 font-semibold">
                  <CircleHelp className="mr-1 inline size-4 align-[-0.15em]" />Rules
                </button>
                <button onClick={() => setAdExplainer(true)} className="whitespace-nowrap rounded-xl bg-panel-2 px-3 py-2.5 font-semibold">
                  <Megaphone className="mr-1 inline size-4 align-[-0.15em]" />Advertise
                </button>
                <button onClick={() => setSignIn({ why: null })} className="whitespace-nowrap rounded-xl bg-gold px-3 py-2.5 text-center font-semibold text-ink">
                  Play now
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-xs sm:text-sm">
              {isDancing && dancing ? (
                <DanceBar
                  move={dancing.move}
                  partner={dancing.with}
                  partners={[
                    ...dancers.map((d) => ({ id: d.id, name: d.name, avatar: d.avatar, npc: false })),
                    ...danceNpcs.map((n) => ({ id: n.id, name: n.name, avatar: n.avatar, npc: true })),
                  ]}
                  onMove={(m) => setDancing((d) => (d ? { ...d, move: m } : d))}
                  onPartner={(id) => setDancing((d) => (d ? { ...d, with: id } : d))}
                  onDanceOff={() => rooms.myRoom && setActivity({ id: `${rooms.myRoom}:dance:0`, kind: "dance", label: "Dance floor", place: rooms.myRoom })}
                  onStop={() => setDancing(null)}
                />
              ) : place || ride !== null ? (
                <>
                  <p className="flex items-center gap-2">
                    {ride !== null ? (
                      <RideIcon kind={ride.kind} className="size-5 shrink-0" style={{ color: RIDE_INFO[ride.kind].colour }} />
                    ) : (
                      <Building2 className="size-5 shrink-0 text-[#7048e8]" />
                    )}
                    <span className="min-w-0">
                      <b className="block truncate">
                        {rooms.myRoomInfo?.name ?? (ride !== null ? (rideList.find((r) => r.kind === ride.kind && r.index === ride.index)?.name ?? RIDE_INFO[ride.kind].label) : (placeRoom?.name ?? "Inside"))}
                      </b>
                      <span className="text-xs text-muted">
                        {guest
                          ? "Watching. Sign in to chat, sit down and play here."
                          : `${Math.max(0, (rooms.myRoom ? rooms.counts[rooms.myRoom] : 1) ?? 1)} here · ${place ? (rooms.mySeat ? "you're sitting down" : "tap the floor to walk, glowing things to use them") : "drag to look around"}`}
                      </span>
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => (guest ? setSignInWhy("Sign in to chat with the people here, sit down, play games and order food.") : setChatOpen(true))}
                      className="flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2 font-semibold text-white"
                    >
                      <MessageCircle className="size-4" />
                      Chat
                    </button>
                    {placeLevel?.kind === "club" && (
                      <button onClick={startDancing} className="flex items-center gap-1.5 rounded-xl bg-[#e64980] px-3 py-2 font-semibold text-white">
                        <Music className="size-4" />
                        Dance
                      </button>
                    )}
                    {rooms.mySeat && (
                      <button onClick={() => rooms.stand()} className="flex items-center gap-1.5 rounded-xl bg-panel-2 px-3 py-2 font-semibold">
                        <Armchair className="size-4" />
                        Stand up
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
                  {duelStrip}
                  {/* On phones the tip makes way for the town. */}
                  <p className="hidden border-t border-line pt-2 text-xs text-muted sm:block">
                    Tap any building to go inside (the numbers show who&apos;s there), or Explore rides and sports. The house button flies you to your house.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
        )}
      </div>
    </main>
  );
}

/** A list line with an icon in front (used in the pop-ups). */
const EVENT_STYLE: Record<string, { label: string; colour: string }> = {
  emergency: { label: "Emergency", colour: "#e5484d" },
  weather: { label: "Weather", colour: "#1c7ed6" },
  party: { label: "Party", colour: "#e64980" },
  transport: { label: "Transport", colour: "#f08c00" },
  city: { label: "City life", colour: "#12a37a" },
  mystery: { label: "Mystery", colour: "#7048e8" },
  twist: { label: "Rule twist", colour: "#c98a00" },
};

/** A world event's card: what's going on, where, time left, and its coins if it has any. */
function EventInfoSheet({
  event,
  now,
  where,
  onClose,
  onShow,
  onGrab,
}: {
  event: GameState["worldEvents"][number] | null;
  now: number;
  where: (tile: number) => string;
  onClose: () => void;
  onShow: () => void;
  onGrab: () => void;
}) {
  const kind = event ? WORLD_EVENT_BY_KEY[event.key] : null;
  if (!event || !kind) return null;
  const style = EVENT_STYLE[kind.category] ?? EVENT_STYLE.city;
  const starts = Date.parse(event.startsAt);
  const ends = Date.parse(event.endsAt);
  const live = now >= starts && now < ends;
  const news = kind.news.replace("{place}", where(event.tile)).replace("{name}", event.name ?? "a ghost");
  const slots = event.slotsLeft ?? kind.reward?.slots ?? 0;
  const canGrab = !!kind.reward && live && !event.claimed && slots > 0;
  return (
    <Sheet onClose={onClose}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: style.colour }}>
        <span className="rounded-full px-2 py-0.5 text-white" style={{ background: style.colour }}>
          {style.label}
        </span>
        {live ? (
          <span className="flex items-center gap-1">
            <span className="size-2 animate-pulse rounded-full" style={{ background: style.colour }} />
            On now · ends in {clock(ends - now)}
          </span>
        ) : now < starts ? (
          `Starts in ${clock(starts - now)}`
        ) : (
          "Over"
        )}
      </p>
      <h2 className="mt-2 font-display text-xl font-bold">{kind.title}</h2>
      <p className="mt-1 text-sm text-ink/80">{news}</p>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
        <MapPin className="size-4 shrink-0" />
        {kind.twist && !kind.radius ? "Everywhere in the city" : where(event.tile)}
      </p>
      {kind.reward && (
        <p className="mt-2 rounded-xl bg-gold/25 px-3 py-2 text-sm font-semibold text-gold-dark">
          <Coins className="mr-1 inline size-4 align-[-0.15em]" />
          {event.claimed
            ? "You grabbed this one."
            : slots > 0
              ? `${kind.reward.coins} mint for the first ${kind.reward.slots === 1 ? "person" : `${kind.reward.slots} people`} to tap it. ${slots} left.`
              : "All grabbed. Be quicker next time!"}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button onClick={onShow} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-panel-2 py-2.5 font-semibold">
          <MapPin className="size-4" />
          Show me
        </button>
        {canGrab && (
          <button onClick={onGrab} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gold py-2.5 font-semibold text-ink">
            <Coins className="size-4" />
            Grab {kind.reward!.coins} mint
          </button>
        )}
      </div>
    </Sheet>
  );
}

function Li({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <span>{children}</span>
    </li>
  );
}
