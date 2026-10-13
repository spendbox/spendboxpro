"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { addressOf, makePlan, spiralIndex, spiralXY, tileAt } from "@/lib/city/layout";
import { ownedSpot } from "@/lib/world/owned";
import { houseTileOf } from "@/lib/city/houses";
import { homeLabel } from "@/lib/houses";
import type { WelcomeNeeds } from "@/lib/welcome";
import { useDiary } from "./style/diary";
import { cleanAvatar } from "@/lib/avatar";
import { AvatarFace } from "@/components/avatar";
import type { GameEvent, GameState } from "@/lib/game";
import { cn } from "@/lib/cn";
import {
  Armchair,
  Briefcase,
  Gamepad2,
  Building2,
  CircleX,
  DoorOpen,
  DoorClosed,
  Heart,
  Layers,
  LogOut,
  Sun,
  Clapperboard,
  Music,
  Camera,
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
  Footprints,
  Ghost,
  Hammer,
  House,
  Lightbulb,
  Lock,
  MapPin,
  Megaphone,
  Menu as MenuIcon,
  MessageCircle,
  Star,
  Timer,
  Users,
  Volume2,
  VolumeX,
  X,
} from "@/components/icons";
import { short } from "@/lib/format";
import { cash } from "@/lib/world/value";
import { tripWords, type Commute } from "@/lib/world/work";
import { createClient } from "@/lib/supabase/client";
import { WORLD_EVENT_BY_KEY } from "@/lib/world-events";
import { claimWorldEvent, joinRound, type ActionResult } from "./actions";
import { liveLabel, SPORTS } from "@/lib/sports/schedule";
import { DEFAULT_RULES, type BoardGhost, type DuelView } from "@/lib/ghost-duels";
import { BookOpen, Church, FerrisWheel, Landmark as LandmarkIcon, Plane, Ship, TrainFront, Trophy, UtensilsCrossed } from "lucide-react";
import { BellOff, BellRing, LocateFixed, Rocket, Wallet, CarFront, PenLine, Compass, Crown, Eye, EyeOff, Flag, Gem, Gift, ImageIcon, Palette, ShoppingBag, Store, Swords, User } from "lucide-react";
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
import { useNoPageZoom } from "./no-page-zoom";
import type { PersonOnMap } from "./people-actions";
import { peopleAround } from "./life/things-cache";
import { PersonCard } from "./people/person-card";
import { AwaySheet, DoorstepSheet, notificationsOn, turnOffNotifications, turnOnNotifications, useAwayDigest } from "./people/doorstep";
import { DatingSheet, RivalsSheet } from "./people/street-dating";
import { weatherNow } from "@/lib/world/news";
import { MyGiftsSheet } from "./my-gifts-sheet";
import { StreakPill, StreakSheet } from "./streak-sheet";
import { useQuestTracker } from "./activities/quest-tracker";
import { QuestBanner, QuestCelebration, QuestSheet } from "./activities/quest-ui";
import { Chat, type NewtownLine } from "./chat";
import { sendPhoto, type ChatTarget } from "./chat-actions";
import { announceChatSent } from "./chat-photo";
import { homePlanFor } from "./life/home-plan-actions";
import type { HomePlan } from "@/lib/home-plan";
import { setEventSoundsEnabled } from "./city/event-sounds";
import type { CityDancer, CityEvent, CityFriendPin, CityGhost, CityInteract, CityMarkers, CityRide, RideTarget } from "./city-view";
import { FeedIconView, FeedRow, NotificationsPanel, SwipeRow, type FeedIcon, type FeedItem } from "./notifications";
import { dismissNotices, readNotices } from "./notice-actions";
import { closePhoneNotices, setPhoneBadge } from "./phone/phone-notices";
import { signOutNow } from "../login/actions";
import { claimBalloon, recordVisit } from "./profile-actions";
import { myVisits, payClubEntry, payFare, payRide, payVisit } from "./fee-actions";
import { CLUB_ENTRY_MS, clubEntryMint, rideFare, TRAIN_FARE, visitFee } from "@/lib/fees";
import { jobAt } from "@/lib/jobs";
import type { Invite, PlayCtx } from "./minigames/shell";
import { rideRoom, useRooms, type RoomInfo } from "./rooms";
import { RIDE_ICONS, RIDE_INFO, RideIcon, type RideKindName } from "./ride-icon";
import { Safe } from "./safe";
import { Sheet } from "./sheet";
import { Logo, LogoMark } from "@/components/logo";
import { playSfx, setSfxEnabled, useCitySound } from "./sound";
import { StatsCard } from "./stats-card";
import { avatar3dEnabled } from "./avatar3d-flag";
import { worldPreview } from "./world-flag";
import { PlacePill } from "./place-pill";
import { CityCard } from "./city-card";
import { Ripple, useWorldLife } from "./life/world-life";
import type { ExplorePlace } from "@/lib/world/explore";
import { Joystick } from "./joystick";
import { PeopleList, prefetchPeople } from "./people/people-list";
import { StatsSheet } from "./stats-sheet";
import { GiftPop, GiftSent } from "./people/gift-pop";
import { MeSheet } from "./me-sheet";
import { DailyGiftPop, MoneyHome } from "./money-home";
import { RecentRail, rememberPerson } from "./people/recent-rail";
import { PrankReveal, usePrankReveal } from "./people/prank-reveal";
import { openAdvertise } from "./life/advertise-panel";
import { Fight, type ChallengeLight } from "./fight/fight";
import { WelcomeFeatures } from "./welcome-features";
import { CallBar } from "./call/call-bar";
import * as propertyActions from "./property-actions";
import * as workActions from "./work-actions";
import * as livingActions from "./living-actions";
import * as dayActions from "./day-actions";
import * as interviewActions from "./interview-actions";
import * as packActions from "./pack-actions";
import * as businessActions from "./business-actions";
import * as serviceActions from "./service-actions";
import * as reportActions from "./report-actions";
import * as marketActions from "./market-actions";
import { REGIONS } from "@/lib/world";

// The 3D city only runs in the browser.
const CityView = dynamic(() => import("./city-view").then((m) => m.CityView), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-muted">Building the city…</div>,
});
// Panels people open now and then: their code only loads when first opened, so the town
// itself starts faster.
const Menu = dynamic(() => import("./menu").then((m) => m.Menu));
const JobsSheet = dynamic(() => import("./jobs-sheet").then((m) => m.JobsSheet));
const GamesSheet = dynamic(() => import("./minigames/games-sheet").then((m) => m.GamesSheet));
const MinigameInvites = dynamic(() => import("./minigames/invites").then((m) => m.MinigameInvites));
const CameraMode = dynamic(() => import("./phone/camera").then((m) => m.CameraMode));
const PhoneSheet = dynamic(() => import("./phone/phone-sheet").then((m) => m.PhoneSheet));
const HowItWorks = dynamic(() => import("./how-it-works").then((m) => m.HowItWorks));
const Results = dynamic(() => import("./results").then((m) => m.Results));
const AvatarEditor = dynamic(() => import("./avatar-editor").then((m) => m.AvatarEditor));
const AvatarStudio = dynamic(() => import("./avatar-studio").then((m) => m.AvatarStudio), { ssr: false });
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

/**
 * The pop-ups people open most, fetched one after another once the city is up and nothing else is
 * going on, so the first tap opens them at once instead of waiting for their code to download.
 * (The 3D studio, games and sport stay on demand: they're big and rarely opened first.)
 */
const PRELOAD: (() => Promise<unknown>)[] = [
  () => import("./menu"),
  () => import("./phone/phone-sheet"),
  () => import("./friends-sheet"),
  () => import("./how-it-works"),
  () => import("./activities/activity-sheet"),
  () => import("./activities/gift-sheet"),
  () => import("./houses/house-sheet"),
  () => import("./sign-in-overlay"),
  () => import("./phone/camera"),
  () => import("./style/style-ui"),
  () => import("@/components/advertise-explainer"),
];
function usePreloadSheets() {
  useEffect(() => {
    let alive = true;
    // Older Safari has no idle callback: a short timer then.
    const idle = (f: () => void) => ("requestIdleCallback" in window ? window.requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 300));
    const next = (k: number) => {
      if (!alive || k >= PRELOAD.length) return;
      idle(() => void PRELOAD[k]().catch(() => {}).finally(() => next(k + 1)));
    };
    const start = setTimeout(() => next(0), 2500);
    return () => {
      alive = false;
      clearTimeout(start);
    };
  }, []);
}

const NO_GHOSTS: CityGhost[] = [];
const NO_EVENTS: CityEvent[] = [];
/** Property on the real map, through the server (game-db/038_property.sql). */
const PROPERTY_API = { ...propertyActions, ...workActions, ...livingActions, ...dayActions, ...interviewActions, ...packActions, ...businessActions, ...serviceActions, ...reportActions, ...marketActions };
const noSubscribe = () => () => {};
const noWorld = worldPreview;
const NO_HOUSES: GameState["houses"] = [];
/** Notices from the old hunt (traps, drones, catches, duels), left out on the real map. */
const HUNT_NOTICES = new Set<string>(["trap", "drone", "catch", "shield", "decoy", "duel"]);
const NO_WORLD_EVENTS: GameState["worldEvents"] = [];

/** The map shows no searched spots, sweeps or hiding spots any more: only the ghosts' lights. */
const NO_MARKERS: CityMarkers = { searchedEmpty: [], searchedHit: [], caught: [], left: [], me: null, decoy: null, sweeps: [], pending: null, recent: [], locked: [] };
/** A building or balloon you can go into (from the 3D city), with its levels. */
type PlaceRoom = {
  id: string;
  name: string;
  capacity: number;
  kind: "building" | "balloon";
  /** What the place is ("office", "bank", "home"...; see CityRoom). */
  type?: string;
  levels?: { id: string; label: string; capacity: number; kind?: string; theme?: string }[];
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
  heli: "Lift-off! You're in the co-pilot's seat: drag to look around (and look down through the floor); tap Chat to talk to the cabin.",
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
  if (e.kind === "heist") {
    const d = e.detail ?? {};
    const who = d.name ?? "Someone";
    const avatar = d.avatar ? cleanAvatar(d.avatar, who) : null;
    if (d.success) return { id: e.id, tone: "alarm", icon: "coin", avatar, text: `${who} robbed the bank and got away with ${cash(d.loot ?? 0)} from the prize pool!` };
    return { id: e.id, tone: "alarm", icon: "catch", avatar, text: `${who} tried to rob the bank and got caught! ${cash(d.lost ?? 0)} went into the prize pool.` };
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
  /** Your notices on the real map that arrived since the page loaded (asked for every 15 s, and at once when a push comes). */
  const [liveNotes, setLiveNotes] = useState<GameState["notifications"]>([]);
  /** Read and swiped away here, before the server has caught up (game-db/062 keeps them for good). */
  const [readIds, setReadIds] = useState<Set<number>>(() => new Set());
  const [goneIds, setGoneIds] = useState<Set<number>>(() => new Set());
  /** Gifts that just arrived: one at a time, a present bouncing on the screen (tap to open it). */
  const [giftPops, setGiftPops] = useState<FeedItem[]>([]);
  const nextGift = useCallback(() => setGiftPops((l) => l.slice(1)), []);
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
  /** The real map: the city card (tap the place's name) and the phone's own menu (bottom right). */
  const [cityOpen, setCityOpen] = useState(false);
  /** Your money (tap your cash), and the daily gift popping up once a day. */
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [giftPop, setGiftPop] = useState(false);
  const closeGiftPop = useCallback(() => setGiftPop(false), []);
  /** You (your face, top left): everything that isn't chat. */
  const [meOpen, setMeOpen] = useState(false);
  /** Open Newtown's own chat (a notice tapped...): changes to ask. */
  const [newtownAsk, setNewtownAsk] = useState(0);
  /** What counts as new on the phone's screen (when it was last opened), and a little ring when something arrives. */
  const [phoneRing, setPhoneRing] = useState(0);
  /** Someone's card (a face tapped on the map, or from your doorstep), and your doorstep. */
  const [personId, setPersonId] = useState<string | null>(null);
  /** The camera was opened from a chat: the selfie goes to them. */
  const [selfieTo, setSelfieTo] = useState<{ target: ChatTarget; to: string } | null>(null);
  const [doorstepOpen, setDoorstepOpen] = useState(false);
  /** Dating or your rivals, open from your phone. */
  const [socialOpen, setSocialOpen] = useState<"dating" | "rivals" | null>(null);
  /** Notifications (the bell, top right), and whether they're switched on for this phone. */
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [pushOn, setPushOn] = useState(true);
  /** iPhones only get notifications once the game is added to the home screen. */
  const [pushNeedsHome, setPushNeedsHome] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const can = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
        setPushNeedsHome(!can && /iP(hone|ad|od)/.test(navigator.userAgent));
        setPushOn(false);
        if (can) void notificationsOn().then(setPushOn);
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const [editAvatar, setEditAvatar] = useState(false);
  // The new 3D studio, while it is being tried out (see avatar3d-flag.ts).
  // (Read in the browser only; it matters only once the studio is opened, so the server's false is harmless.)
  const [studio3d] = useState(() => typeof window !== "undefined" && avatar3dEnabled());
  // The real place everyone lives in (Lagos): the hourly towns and their countdown are off.
  const worldId = useSyncExternalStore(noSubscribe, worldPreview, noWorld);
  const worldRegion = worldId ? REGIONS[worldId] : null;
  /** On a real place: the area pointed at, or in the middle of the view. */
  const [worldArea, setWorldArea] = useState<string | null>(null);
  // A life on the real map: search, assets, buying a home first (see ./life/world-life).
  usePreloadSheets();
  useNoPageZoom();
  /** When a building was last gone into from its card (Go there), so it opens on the ground floor. */
  const entering = useRef(0);
  /**
   * Visits inside buildings on the real map, counted in this browser: for the first few, the
   * Floor button glows so people find the other floors.
   */
  const [visits, setVisits] = useState(() => {
    try {
      return Number(localStorage.getItem("nt:floor-visits") ?? 0) || 0;
    } catch {
      return 0;
    }
  });
  const countVisit = () =>
    setVisits((v) => {
      try {
        localStorage.setItem("nt:floor-visits", String(v + 1));
      } catch {
        // Not kept: the glow just shows a little longer.
      }
      return v + 1;
    });
  const floorGlow = visits <= 5;
  const worldLife = useWorldLife({
    api: PROPERTY_API,
    regionId: worldId,
    signedIn: !state.me.guest,
    budget: 5000,
    onChanged: () => startTransition(() => router.refresh()),
    // Home from inside a building: out of it first.
    beforeHome: (go: () => void) => leaveThen.current("go home", go),
    // On foot, jumping anywhere on the map pays the fare there (looking round the map is free).
    beforeFly: (x: number, z: number) => (walkStick.current.on ? payTrip.current(x, z) : Promise.resolve(true)),
    meId: state.me.guest ? null : state.me.id,
    rowOutside: true,
    meName: state.me.name ?? undefined,
    onPerson: (id: string) => setPersonId(id),
    // Gone in straight away, but the fare couldn't be paid: back out.
    onTripFailed: () => {
      entering.current = 0;
      leaveInside.current();
    },
    // A building's card: Go inside, as if its bubble had been tapped.
    onEnter: (id: string) => {
      const sp = ownedSpot(id);
      if (!sp) return;
      // Paid the trip from the card: straight in on the ground floor (no floor picker).
      entering.current = Date.now();
      setOpenReq((r) => ({ id: `b:${spiralIndex(sp.x, sp.z)}`, at: (r?.at ?? 0) + 1 }));
    },
  });
  // The phone: the camera (a picture of the town, or a selfie) and the phone itself (gallery).
  const [camera, setCamera] = useState<"photo" | "selfie" | null>(null);
  const [phone, setPhone] = useState<"home" | "photos" | null>(null);
  // The round card (top left) and the bottom bar (Explore, Chat, Ghosts, My house) start folded
  // away on every visit, so the town gets the screen; tap either to open it.
  const [statsMin, setStatsMin] = useState(true);
  const [dockOpen, setDockOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [sound, setSound] = useState(true);
  /** Leave the building you're in, if any (set once leaveRoom exists, below). */
  const leaveInside = useRef<() => void>(() => {});
  /** Go somewhere that means leaving the building or ride you're in: ask first (set below, once leaveRoom exists). */
  const leaveThen = useRef<(what: string, go: () => void) => void>((_what, go) => go());
  const [leaveAsk, setLeaveAsk] = useState<{ what: string; go: () => void } | null>(null);
  /** Pay the fare to a spot on the map (set below, once the life API is there). True when paid and going. */
  const payTrip = useRef<(x: number, z: number) => Promise<boolean>>(() => Promise.resolve(true));
  const [busy, setBusy] = useState(false);
  // Ghost duels: a ghost's card (tapped on the map), the list of ghosts, the duel on screen,
  // and flying the camera over to a ghost's light.
  const [ghostFor, setGhostFor] = useState<BoardGhost | null>(null);
  const [ghostsOpen, setGhostsOpen] = useState(false);
  const [duelOn, setDuelOn] = useState<DuelView | null>(null);
  // Duels you've closed (finished): never shown again, even if the map's copy is a beat behind.
  const [closedDuels, setClosedDuels] = useState<number[]>([]);
  // The ghosts' lights on the map: shown, or hidden with the eye button.
  const [ghostsShown, setGhostsShown] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("hs-ghosts-hidden") === "1") {
        const id = setTimeout(() => setGhostsShown(false), 0);
        return () => clearTimeout(id);
      }
    } catch {}
  }, []);
  function toggleGhosts() {
    const next = !ghostsShown;
    setGhostsShown(next);
    setMessage({ icon: next ? Eye : EyeOff, text: next ? "Ghosts are showing on the map." : "Ghosts are hidden. Tap the eye to show them again.", tone: "info" });
    try {
      localStorage.setItem("hs-ghosts-hidden", next ? "0" : "1");
    } catch {}
  }
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
  /** The minigames: open (maybe straight into a game, or a challenge you accepted), or closed. */
  const [gamesOpen, setGamesOpen] = useState<{ game?: string; invite?: Invite | null } | null>(null);
  /** Jobs: at this place (apply), null (My job), or closed (undefined). */
  const [jobsAt, setJobsAt] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [placeRoom, setPlaceRoom] = useState<PlaceRoom | null>(null);
  const [pickRide, setPickRide] = useState(false);
  const [exploreTab, setExploreTab] = useState<"places" | "rides" | "sports">("rides");
  /** The real map's Explore: the places worth going to (worked out when it opens). */
  // Explore is hidden on the real map for now (its places list comes back with it: worldLife.explore()).
  const [explorePlacesNow] = useState<ExplorePlace[] | null>(null);
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
  const rooms = useRooms(worldId ? 0 : (state.round?.id ?? null), state.me.guest ? null : { id: state.me.id, name: state.me.name ?? "Player", avatar: state.me.avatar }, {
    onRideEnd: () => {
      setRide(null);
    },
  });
  const meP = useMemo(() => (state.me.guest ? null : { id: state.me.id, name: state.me.name ?? "Player", avatar: state.me.avatar as unknown }), [state.me.guest, state.me.id, state.me.name, state.me.avatar]);

  const { round, entry, me } = state;
  // On the real map, the billboards also carry the businesses leasing buildings (kept the same
  // list between renders, so the billboards aren't set up again every second).
  const lifeAds = worldLife.billboardAds;
  const allAds = useMemo(() => (worldId && lifeAds.length ? [...ads, ...lifeAds] : ads), [worldId, lifeAds, ads]);
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
  // The real map's weather comes from its news (src/lib/world/news.ts), changing every 3 hours.
  const weatherSlot = Math.floor(now / (3 * 3_600_000));
  const cityWeather = useMemo(() => {
    const w = weatherNow(weatherSlot * 3 * 3_600_000);
    return { kind: w.kind, strength: w.strength };
  }, [weatherSlot]);

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
  // Everyone about on the real map near where you're looking (docs/PEOPLE.md): online, asleep,
  // at work or away. Looked up every 45 seconds; friends' live places (above) win.
  const [peopleOut, setPeopleOut] = useState<PersonOnMap[]>([]);
  /** Everyone online in the city now (you included), shown top left. */
  const [cityOnline, setCityOnline] = useState<number | null>(null);
  useEffect(() => {
    if (!worldId || me.guest) return;
    let alive = true;
    const look = () => {
      const c = worldLife.centerRef.current?.() ?? { x: 0, z: 0 };
      void peopleAround<PersonOnMap>(worldId, c.x, c.z)
        .then((r) => {
          if (!alive || !r) return;
          setPeopleOut(r.people);
          setCityOnline(r.online);
        })
        .catch(() => {});
    };
    const first = setTimeout(look, 800);
    const every = setInterval(look, 45_000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(every);
    };
    // A new area: look again (the people round here show under the menu).
  }, [worldId, me.guest, worldLife.centerRef, worldArea]);
  // You, on the map where you are (your home, or the place you're at), as everyone else sees you.
  const mySpotX = worldLife.mySpot?.x ?? null;
  const mySpotZ = worldLife.mySpot?.z ?? null;
  const homeX = worldLife.homeSpot?.x ?? null;
  const homeZ = worldLife.homeSpot?.z ?? null;
  const facesOnMap: CityFriendPin[] = useMemo(() => {
    const live = new Set(friendsAt.map((f) => f.id));
    const myRoom = mySpotX !== null && mySpotZ !== null ? `b:${spiralIndex(Math.round(mySpotX), Math.round(mySpotZ))}` : null;
    const homeRoom = homeX !== null && homeZ !== null ? `b:${spiralIndex(Math.round(homeX), Math.round(homeZ))}` : null;
    const mine: CityFriendPin[] = me.guest
      ? []
      : [
          // Your home: a house bubble (tap it for your home's card).
          ...(homeRoom ? [{ id: `home:${me.id}`, name: "Home", avatar: me.avatar, room: homeRoom, home: true }] : []),
          // You, where you are: your own name in gold.
          ...(myRoom ? [{ id: me.id, name: "You", avatar: me.avatar, room: myRoom, status: "online" as const, mine: true }] : []),
        ];
    return [
      ...mine,
      ...friendsAt.filter((f) => f.id !== me.id).map((f) => ({ ...f, friend: true, status: "online" as const })),
      ...peopleOut.filter((p) => !live.has(p.id) && p.id !== me.id).map((p) => ({ id: p.id, name: p.name, avatar: cleanAvatar(p.avatar, p.name), room: `b:${spiralIndex(p.x, p.z)}`, status: p.status, friend: p.friend })),
    ];
  }, [friendsAt, peopleOut, mySpotX, mySpotZ, homeX, homeZ, me.id, me.avatar, me.guest]);
  const onlineNear = useMemo(() => facesOnMap.filter((f) => f.status === "online" && !f.mine && !f.home).length, [facesOnMap]);
  const onlineNow = Math.max(1, cityOnline ?? 0, online ?? 0, onlineNear);
  const [statsOpen, setStatsOpen] = useState(false);
  /** On foot on the streets: the joystick's state (the 3D city reads it every frame), and whether you're walking. */
  const walkStick = useRef<{ on: boolean; x: number; y: number; from?: { x: number; z: number } | null }>({ on: false, x: 0, y: 0 });
  /** Inside a planned home: the joystick for walking round it as your avatar. */
  const homeStick = useRef({ on: true, x: 0, y: 0 });
  const [walking, setWalkingNow] = useState(false);
  const setWalking = (on: boolean) => {
    // You start walking from where you are on the map (your home, or the place you're at).
    if (on) walkStick.current.from = worldLife.mySpot ?? null;
    walkStick.current.on = on;
    walkStick.current.x = walkStick.current.y = 0;
    setWalkingNow(on);
  };
  // Going into a place or onto a ride stops walking (you're back on the street when you come out).
  useEffect(() => {
    if (!place && ride === null) return;
    walkStick.current.on = false;
    const t = setTimeout(() => setWalkingNow(false), 0);
    return () => clearTimeout(t);
  }, [place, ride]);
  /** Everyone on the map to talk to: search by name, the nearest first (the online button, Messages → People). */
  const peopleFinder = (where: "stats" | "chat") =>
    worldId && !me.guest ? (
      <PeopleList
        region={worldId}
        compact={where === "chat"}
        onlineOnly={where === "stats"}
        centre={() => worldLife.centerRef.current?.() ?? { x: 0, z: 0 }}
        onMessage={(p) => {
          setStatsOpen(false);
          chatWith(p);
        }}
        onPerson={(id) => {
          setStatsOpen(false);
          setPersonId(id);
        }}
        onFly={(x, z) => {
          setStatsOpen(false);
          setChatOpen(false);
          leaveThen.current("meet them", () => worldLife.fly(x, z));
        }}
      />
    ) : undefined;
  // Time in the city (docs/MONEY.md): a ping a minute while the game is in front of you and you've
  // touched it in the last 2 minutes. It makes tomorrow's daily gift bigger.
  useEffect(() => {
    if (!worldId || me.guest) return;
    let touched = Date.now();
    const touch = () => {
      touched = Date.now();
    };
    const opts = { passive: true, capture: true } as const;
    window.addEventListener("pointerdown", touch, opts);
    window.addEventListener("keydown", touch, opts);
    window.addEventListener("wheel", touch, opts);
    const t = setInterval(() => {
      if (document.visibilityState !== "visible" || Date.now() - touched > 120_000) return;
      void fetch("/api/active", { method: "POST", cache: "no-store" }).catch(() => {});
    }, 60_000);
    return () => {
      clearInterval(t);
      window.removeEventListener("pointerdown", touch, opts);
      window.removeEventListener("keydown", touch, opts);
      window.removeEventListener("wheel", touch, opts);
    };
  }, [worldId, me.guest]);
  // The daily gift pops up once a day, a few seconds after the game opens (if it's not opened yet).
  useEffect(() => {
    if (!worldId || me.guest) return;
    const day = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
    let shown = "";
    try {
      shown = localStorage.getItem("nt-gift-pop") ?? "";
    } catch {}
    if (shown === day) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem("nt-gift-pop", day);
      } catch {}
      setGiftPop(true);
    }, 6000);
    return () => clearTimeout(t);
  }, [worldId, me.guest]);
  // The people list, looked up shortly after the game opens, so "online" opens at once.
  useEffect(() => {
    if (!worldId || me.guest) return;
    const t = setTimeout(() => {
      const c = worldLife.centerRef.current?.() ?? { x: 0, z: 0 };
      prefetchPeople(worldId, c.x, c.z);
    }, 4000);
    return () => clearTimeout(t);
  }, [worldId, me.guest, worldLife.centerRef]);
  const away = useAwayDigest(!!worldId && !me.guest);
  // Coming home to a prank: it plays out on the screen first.
  const prankShow = usePrankReveal(!!worldId && !me.guest);
  // The real players in the place you're in (not you, not NPCs).
  const hereNow: HerePerson[] = useMemo(
    () => rooms.members.filter((m) => m.id !== me.id).map((m) => ({ id: m.id, name: m.name, avatar: cleanAvatar(m.avatar, m.name) })),
    [rooms.members, me.id],
  );
  // Where you are, for the minigames (the room's channel for challenges, who's here).
  const playCtx: PlayCtx = useMemo(
    () => ({ roundId: round?.id ?? null, roomId: place || ride !== null ? (rooms.myRoomInfo?.id ?? null) : null, me: meP, members: rooms.members }),
    [round?.id, place, ride, rooms.myRoomInfo?.id, meP, rooms.members],
  );
  // Who you can add to a selfie: the people here, then your friends.
  const selfiePeople = useMemo(() => {
    const seen = new Set(hereNow.map((p) => p.id));
    return [...hereNow, ...state.friends.friends.filter((f) => !seen.has(f.id)).map((f) => ({ id: f.id, name: f.name, avatar: cleanAvatar(f.avatar, f.name) }))];
  }, [hereNow, state.friends.friends]);
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
    rememberPerson(p, "Messaged");
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
    leaveThen.current("go and see it", () => setFocusEvent((f) => ({ id, at: (f?.at ?? 0) + 1 })));
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
      setMessage({ icon: Coins, text: `You grabbed ${cash(Number(res.data.coins))}!`, tone: "good" });
      startTransition(() => router.refresh());
    } else setMessage({ text: res.error, tone: "info" });
  }

  // The hourly game's last 30 seconds: the clock turns red and beeps every second. (Not on the
  // real map: the hourly game is off there, so no countdown, beeps or red glow.)
  const worldLeft = round && phase === "seek" && !worldId ? Date.parse(round.seekEndsAt) - now : Infinity;
  const urgent = worldLeft <= 30_000 && worldLeft > 0;
  const urgentSec = urgent ? Math.ceil(worldLeft / 1000) : null;
  useEffect(() => {
    if (urgentSec !== null) playSfx("tick");
  }, [urgentSec]);
  // Only a few ghosts still to beat (not golden yet), late enough in the hunt to say so.
  const toBeat = board?.phase === "seek" ? board.ghosts.filter((g) => g.status !== "golden").length : 0;
  const fewLeft = round && !worldId && phase === "seek" && toBeat > 0 && toBeat <= 2 ? toBeat : null;
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

  // First visits and train fares (game-db/035): the places already paid for in this town.
  const [visitedNow, setVisited] = useState<{ round: number; places: ReadonlySet<string> }>({ round: -1, places: new Set() });
  const visited = visitedNow.round === roundSeed ? visitedNow.places : null;
  useEffect(() => {
    if (guest || !roundSeed) return;
    let live = true;
    void myVisits().then((list) => {
      if (live) setVisited({ round: roundSeed, places: new Set(list) });
    });
    return () => {
      live = false;
    };
  }, [guest, roundSeed]);
  /** What going into this place costs you now: its first-visit fee, or 0 (been before, your own house, a guest). */
  function visitCost(room: { id: string; kind?: string; type?: string }) {
    if (guest || room.kind === "balloon") return 0;
    if (visited?.has(room.id) || (myHouseTile !== null && room.id === `b:${myHouseTile}`)) return 0;
    return visitFee(room.type);
  }
  function markVisited(place: string, been: boolean) {
    setVisited((v) => {
      const places = new Set(v.round === roundSeed ? v.places : []);
      if (been) places.add(place);
      else places.delete(place);
      return { round: roundSeed, places };
    });
  }
  /**
   * Pay for going somewhere: a first visit to a place (once a town) or a train fare (every time).
   * Says no straight away if you can't afford it; otherwise lets you in at once and pays in the
   * background (and puts you back out if that fails). The cost is on the button you tapped, so
   * nothing more is said about it. Returns false if you can't go.
   */
  function payToGo(what: { kind: "visit"; place: string; type?: string; name: string } | { kind: "fare"; index: number; fare: number; name: string; ride?: RideKindName }): boolean {
    if (guest) return true;
    const fee = what.kind === "visit" ? visitCost({ id: what.place, type: what.type }) : what.fare;
    if (fee <= 0) return true;
    if (me.coins < fee) {
      const money = (m: number) => (worldId ? cash(m) : `${cash(m)}`);
      setMessage({ icon: Coins, text: `${what.kind === "visit" ? `Your first visit to ${what.name}` : `A ticket for the ${what.name}`} costs ${money(fee)}, and you have ${money(me.coins)}.`, tone: "bad" });
      return false;
    }
    if (what.kind === "visit") markVisited(what.place, true);
    const pay =
      what.kind === "visit"
        ? payVisit(what.place, what.type)
        : // The real map: every ride has its fare (src/lib/fees.ts), from your Travel money.
          worldId && what.ride
          ? payRide(what.ride, what.index)
          : payFare(what.index, what.fare > TRAIN_FARE);
    void pay.then((res) => {
      // Only put you back out if you really can't go (not if the payment just didn't go through).
      if (!res.ok && res.kick) {
        if (what.kind === "visit") markVisited(what.place, false);
        leaveRoom();
        setMessage({ icon: Coins, text: res.error, tone: "bad" });
      }
      startTransition(() => router.refresh());
    });
    return true;
  }

  // The last 30 seconds before the hunt: a soft beep every second.
  const joinLeft = round && phase === "join" && !worldId ? Math.ceil((Date.parse(round.joinEndsAt) - now) / 1000) : null;
  useEffect(() => {
    if (joinLeft === null || joinLeft <= 0 || joinLeft > 30) return;
    playSfx("tick");
  }, [joinLeft]);

  // The hunt starts: a pop-up with a different cheer each time, and a fanfare.
  const lastPhase = useRef<{ round: number; phase: string } | null>(null);
  useEffect(() => {
    if (!round || worldId) return;
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
      () => setMessage({ icon: Coins, text: `Passive income: +${cash(passiveGained)}. You earn up to ${short(state.prices.passivePerDay)} a day while you have under ${short(state.prices.passiveTarget)}.`, tone: "good" }),
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
  // Ads no longer pay players anything (game-db/047), so there's nothing to say about rewards.
  const AD_WHY: Record<string, string> = {};
  async function onBillboardTap(info: { id: string; tile: number; adId: string | null }) {
    // A business's billboard: its card.
    if (info.adId?.startsWith("bz:")) return worldLife.onBusiness(info.adId.slice(3));
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
          ? `+${cash(d.coins)} from ${o.ad.brand}!${d.leftToday ? ` (${d.leftToday} more ad rewards today)` : " That's all your ad rewards for today."}`
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
    // The real map's life keeps itself up to date; the old hourly game needed this every 4 s.
    const id = setInterval(refresh, worldId ? 60_000 : 4000);
    const onVisible = () => refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, worldId]);

  // Everything worth knowing, newest first: public happenings (moves, catches) and private
  // notices for you (your trap went off, a drone swept you, you were found).
  const myLastSpot = isHider ? (entry?.visited.at(-1) ?? null) : null;
  const feed: FeedItem[] = useMemo(() => {
    const myName = state.me.name;
    const pub = state.events
      .map((e) => {
        const n = describe(e, botName, myLastSpot, where);
        // Your own duel's result is on the duel screen already: list it, but don't pop it up too.
        const mineDuel =
          !!myName && ((e.kind === "duel" && (e.detail?.ghost === myName || e.detail?.hunter === myName)) || (e.kind === "heist" && e.detail?.name === myName));
        return n ? ({ key: `e${e.id}`, at: e.at, text: n.text, tone: n.tone, avatar: n.avatar ?? null, icon: n.icon, quiet: mineDuel } as FeedItem) : null;
      })
      .filter((x): x is FeedItem => x !== null);
    // The latest list from the server wins (it knows what you read on other devices too).
    const byId = new Map(state.notifications.map((n) => [n.id, n]));
    for (const n of liveNotes) byId.set(n.id, n);
    const allNotes = [...byId.values()].filter((n) => !goneIds.has(n.id)).sort((a, b) => b.id - a.id);
    const mine = allNotes.map((n) => ({
      key: `n${n.id}`,
      at: n.at,
      text: n.tile !== null && n.kind === "trap" ? `${n.body} (near ${where(n.tile)})` : n.body,
      tone: n.kind === "caught" ? ("alarm" as const) : ("mine" as const),
      avatar: n.kind === "caught" || n.kind === "shield" ? me.avatar : null,
      quiet: n.kind === "duel_won" || n.kind === "duel_lost" || n.kind === "heist",
      icon: ((
        { trap: "trap", trapped: "trap", swept: "drone", caught: "catch", shield: "shield", shielded: "shield", decoy: "decoy", streak: "flame", gift: "gift", spray: "gift", hug: "hug", handshake: "handshake", thanks: "hug", duel: "duel", duel_won: "duel", duel_lost: "duel", heist: "coin", market: "coin", dating: "hug" }) as Record<string, FeedIcon>
      )[n.kind] ?? (n.kind === "doorstep" && /gift/i.test(n.body) ? "gift" : "info"),
      kind: n.kind,
      // The real map's notices can be read and cleared; the old game's are counted by time.
      ...(worldId ? { noteId: n.id, read: !!n.read || readIds.has(n.id) } : {}),
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
    // The real map: only notices for you (offers, sales, gifts...), none of the old hunt's.
    if (worldId) return mine.filter((n) => !HUNT_NOTICES.has(n.icon)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 60);
    return [...pub, ...mine, ...news].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 60);
  }, [state.events, state.notifications, liveNotes, readIds, goneIds, state.worldEvents, state.me.name, serverNowMs, botName, myLastSpot, where, me.avatar, worldId]);
  // Unread: on the real map, notices you haven't read (exact, on every device); in the old game, the ones since you last looked.
  const unread = feed.filter((f) => (f.noteId ? !f.read : Date.parse(f.at) > Date.parse(feedSeenAt))).length;
  // The number on the app's icon (on phones that show one): what's still unread here.
  useEffect(() => {
    if (!worldId || me.guest) return;
    setPhoneBadge(unread + chatUnread);
  }, [worldId, me.guest, unread, chatUnread]);
  /** The bell for turning notifications on (shown while they're off on this phone). */
  const turnOnBell = () => {
    if (pushNeedsHome) return setAlertsOpen(true);
    void turnOnNotifications().then((r) => {
      setMessage({ text: r.text, tone: r.ok ? "good" : "info" });
      if (r.ok) setPushOn(true);
    });
  };
  /** You've seen these notices: they stop counting at once (and on the server). */
  const markRead = useCallback((ids: number[]) => {
    const fresh = ids.filter((id) => id > 0);
    if (!fresh.length) return;
    setReadIds((s) => new Set([...s, ...fresh]));
    void readNotices(fresh).catch(() => {});
  }, []);
  /** Newtown's own chat opened: everything in it is read (here, on the server and on the phone). */
  const readAllNotices = useCallback(() => {
    const ids = feed.flatMap((f) => (f.noteId && !f.read ? [f.noteId] : []));
    if (ids.length) markRead(ids);
    setFeedSeenAt(new Date().toISOString());
    closePhoneNotices("notice");
  }, [feed, markRead]);
  /** Open Newtown's own chat (your notices), in the chat. */
  const openNewtown = () => {
    setChatOpen(true);
    setNewtownAsk(Date.now());
  };
  /** Swiped away (or Clear all). */
  const dismissNote = useCallback((ids: number[]) => {
    if (!ids.length) return;
    setGoneIds((s) => new Set([...s, ...ids]));
    void dismissNotices(ids).catch(() => {});
  }, []);

  // Opening the notifications list reads what's in it (the counter drops at once), and they go
  // from the phone's own notifications too.
  useEffect(() => {
    if (!alertsOpen) return;
    closePhoneNotices("notice");
    const ids = feed.flatMap((f) => (f.noteId && !f.read ? [f.noteId] : []));
    if (!ids.length) return;
    const t = setTimeout(() => markRead(ids), 600);
    return () => clearTimeout(t);
  }, [alertsOpen, feed, markRead]);

  // Hugs, handshakes and mint that arrived since you last opened My gifts.
  const newGifts = [...state.notifications, ...liveNotes.filter((l) => !state.notifications.some((n) => n.id === l.id))].filter(
    (n) => ["hug", "handshake", "gift", "spray"].includes(n.kind) && Date.parse(n.at) > giftsSeenAt,
  ).length;
  function openGifts() {
    setGiftsOpen(true);
    const t = Date.parse(state.serverNow);
    setGiftsSeenAt(t);
    try {
      localStorage.setItem("hs-gifts-seen", String(t));
    } catch {}
  }
  // Newtown's own chat: your notices as messages (tap one to go where it's about).
  const newtownLines: NewtownLine[] = feed.slice(0, 60).map((f) => {
    const go =
      f.eventId ? () => openEvent(f.eventId!)
      : f.icon === "gift" || f.icon === "hug" || f.icon === "handshake" ? () => openGifts()
      : f.kind === "doorstep" ? () => setDoorstepOpen(true)
      : null;
    return {
      key: f.key,
      text: f.text,
      at: f.at,
      unread: f.noteId ? !f.read : Date.parse(f.at) > Date.parse(feedSeenAt),
      icon: <FeedIconView icon={f.icon} tone={f.tone} className="size-7" />,
      onTap: go
        ? () => {
            if (f.noteId) markRead([f.noteId]);
            setChatOpen(false);
            go();
          }
        : undefined,
    };
  });
  // The people online round where you're looking: faces along the top of your chats.
  const onlineFaces = peopleOut.filter((p) => p.status === "online" && p.id !== me.id).map((p) => ({ id: p.id, name: p.name, avatar: cleanAvatar(p.avatar, p.name) }));
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
    const pop = fresh.filter((f) => !f.quiet && !f.read);
    if (!pop.length || feedOpen || quietNow) return;
    // Oldest first, one at a time (never a pile of them at once). Gifts get their own pop-up.
    const ordered = [...pop].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const gifts = ordered.filter((f) => f.icon === "gift" || f.icon === "hug" || f.icon === "handshake");
    const rest = ordered.filter((f) => !gifts.includes(f));
    const id = setTimeout(() => {
      setPhoneRing((n) => n + 1);
      if (rest.length) setToasts((list) => [...list, ...rest].slice(-8));
      if (gifts.length) setGiftPops((list) => [...list, ...gifts].slice(-6));
      playSfx("chime");
    }, 0);
    return () => clearTimeout(id);
  }, [feed, feedOpen, quietNow]);
  useEffect(() => {
    if (!toasts.length) return;
    // The one showing goes after a few seconds, then the next comes in.
    const id = setTimeout(() => setToasts((list) => list.slice(1)), 4800);
    return () => clearTimeout(id);
  }, [toasts]);
  // The real map: new notices every 15 seconds (and at once when a push arrives).
  useEffect(() => {
    if (!worldId || me.guest) return;
    let alive = true;
    const look = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/notices", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { notices?: GameState["notifications"] } | null) => {
          if (!alive || !d?.notices) return;
          setLiveNotes(d.notices);
        })
        .catch(() => {});
    };
    const every = setInterval(look, 8_000);
    const onVisible = () => document.visibilityState === "visible" && look();
    document.addEventListener("visibilitychange", onVisible);
    // A push arrived (the phone's service worker says so): look now. A tapped notification: go there.
    const onMessage = (e: MessageEvent) => {
      const t = (e.data as { type?: string; url?: string } | null)?.type;
      if (t === "newtown-push") look();
      if (t === "newtown-open") {
        const u = new URL(String((e.data as { url?: string }).url ?? "/play"), location.origin);
        const dm = u.searchParams.get("dm");
        if (dm) chatWith({ id: dm, name: u.searchParams.get("name") || "Message" });
        else if (u.searchParams.get("alerts")) openNewtown();
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      alive = false;
      clearInterval(every);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // chatWith is a plain function (new each render); the listener only needs the latest at the time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, me.guest]);
  // Opened from a message notification (?dm=<who>): straight into that conversation.
  useEffect(() => {
    if (me.guest) return;
    const sp = new URLSearchParams(window.location.search);
    const dm = sp.get("dm");
    // Opened from a notice's notification: the notifications list.
    if (!dm && sp.get("alerts")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("alerts");
      window.history.replaceState(null, "", url);
      const t = setTimeout(() => openNewtown(), 900);
      return () => clearTimeout(t);
    }
    if (!dm) return;
    const name = sp.get("name") || "Message";
    const url = new URL(window.location.href);
    url.searchParams.delete("dm");
    url.searchParams.delete("name");
    window.history.replaceState(null, "", url);
    const t = setTimeout(() => chatWith({ id: dm, name }), 900);
    return () => clearTimeout(t);
    // Once, when the game opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a round finishes, show its results once (remembered on this device).
  const resultsId = state.results?.roundId ?? null;
  useEffect(() => {
    // The real map has no rounds: no results to show.
    if (!resultsId || worldId) return;
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
  }, [resultsId, state.results, worldId]);

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

  // Club entry (game-db/067): paid once, good for 24 hours. Remembered on this phone too, so
  // going back in (or up to the club floor again) doesn't ask twice.
  const [clubDoor, setClubDoor] = useState<{ room: PlaceRoom; level: { id: string; label: string; capacity: number; kind?: string }; fee: number } | null>(null);
  const [clubBusy, setClubBusy] = useState(false);
  function clubPaid(place: string) {
    try {
      const all = JSON.parse(localStorage.getItem("nt-club-entry") ?? "{}") as Record<string, string>;
      return Date.parse(all[place] ?? "") > Date.now();
    } catch {
      return false;
    }
  }
  function rememberClub(place: string, until: string) {
    try {
      const all = JSON.parse(localStorage.getItem("nt-club-entry") ?? "{}") as Record<string, string>;
      for (const k of Object.keys(all)) if (!(Date.parse(all[k]) > Date.now())) delete all[k];
      all[place] = until;
      localStorage.setItem("nt-club-entry", JSON.stringify(all));
    } catch {}
  }
  async function payClubDoor() {
    const d = clubDoor;
    if (!d) return;
    setClubBusy(true);
    const r = await payClubEntry(d.room.id, d.room.type).catch(() => ({ ok: false as const, error: "Couldn't pay just now. Try again." }));
    setClubBusy(false);
    if (!r.ok) return setMessage({ icon: Coins, text: r.error, tone: "bad" });
    setClubDoor(null);
    rememberClub(d.room.id, r.until ?? new Date(Date.now() + CLUB_ENTRY_MS).toISOString());
    if (r.paid > 0) setMessage({ icon: Music, text: `In! ${cash(r.paid)} at the door, and you can come and go for 24 hours.`, tone: "good" });
    startTransition(() => router.refresh());
    goToLevel(d.room, d.level, true);
  }

  // Tapping a building or balloon takes you inside to meet the people there. A building with
  // several levels (ground, floors, rooftop) asks which one; nothing opens the chat by itself.
  function onRoom(room: PlaceRoom) {
    // Signed out on the real map: buildings aren't tappable.
    if (worldId && guest) return;
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
    if (worldId) {
      // The real map: going in is from the place's card (Go there, with the fare), and always
      // starts on the ground floor; the Floor button inside goes up from there.
      if (Date.now() - entering.current < 5000) {
        entering.current = 0;
        const ground = room.levels?.find((l) => l.id === "g") ?? room.levels?.[0] ?? { id: "g", label: "Ground floor", capacity: room.capacity };
        countVisit();
        return goToLevel(room, ground);
      }
      const m = /^b:(\d+)/.exec(room.id);
      if (m) {
        const [x, z] = spiralXY(Number(m[1]));
        return worldLife.openPlace({ id: `${worldId}:${x},${z}`, name: room.name, x, z, jobs: [] });
      }
    }
    setPickPlace(room);
  }
  function goToLevel(room: PlaceRoom, level: { id: string; label: string; capacity: number; kind?: string }, paidDoor = false) {
    setPickPlace(null);
    // Some clubs charge at the door (once every 24 hours): ask first.
    if (worldId && !guest && !paidDoor && level.kind === "club") {
      const fee = clubEntryMint(room.id, room.type, worldRegion?.prices.perMint);
      if (fee > 0 && !clubPaid(room.id)) return setClubDoor({ room, level, fee });
    }
    // The real map charges the fare there instead of a first-visit fee (see useWorldLife's goInside).
    if (room.kind === "building" && !worldId && !payToGo({ kind: "visit", place: room.id, type: room.type, name: room.name })) return;
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
  function boardRide(r: { kind: RideKindName; index: number; name: string; capacity: number; fare?: number }) {
    const fare = worldId ? rideFare(r.kind) : r.fare;
    if (fare && !payToGo({ kind: "fare", index: r.index, fare, name: r.name, ride: r.kind })) return;
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
  // Planned homes (docs/HOME_PLANNER.md): yours as soon as the game opens, and any other home as
  // you walk into it, so the inside is drawn from its plan for you and for visitors.
  const [homePlans, setHomePlans] = useState<Record<number, HomePlan>>({});
  const fetchHomePlan = useCallback(
    (building: string) => {
      const at = ownedSpot(building);
      if (!at) return;
      const tile = spiralIndex(at.x, at.z);
      void homePlanFor(building)
        .then((plan) =>
          setHomePlans((all) => {
            if (!plan) {
              if (!(tile in all)) return all;
              const { [tile]: _gone, ...rest } = all;
              void _gone;
              return rest;
            }
            return JSON.stringify(all[tile]) === JSON.stringify(plan) ? all : { ...all, [tile]: plan };
          }),
        )
        .catch(() => {});
    },
    [],
  );
  const myHomeBuilding = worldLife.homeBuilding;
  useEffect(() => {
    if (!worldId || !myHomeBuilding) return;
    const t = setTimeout(() => fetchHomePlan(myHomeBuilding), 0);
    const again = () => fetchHomePlan(myHomeBuilding);
    window.addEventListener("nt-home-plan-saved", again);
    return () => {
      clearTimeout(t);
      window.removeEventListener("nt-home-plan-saved", again);
    };
  }, [worldId, myHomeBuilding, fetchHomePlan]);
  const enteredRoom = place ? (rooms.myRoomInfo?.id ?? null) : null;
  const enteredTile = enteredRoom ? Number(/^b:(\d+)/.exec(enteredRoom)?.[1] ?? NaN) : NaN;
  const inPlannedHome = !!worldId && Number.isFinite(enteredTile) && enteredTile in homePlans;
  // Inside a place when the page reloads (the game updated, or the phone dropped the tab): back
  // inside it. Remembered while you're in; forgotten once you leave.
  const lastRoom = useRef<{ pending: boolean } | null>(null);
  useEffect(() => {
    if (!worldId || guest) return;
    const KEY = "nt-last-room";
    if (!lastRoom.current) {
      lastRoom.current = { pending: false };
      let saved: string | null = null;
      try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
        if (s && s.w === worldId && Date.now() - Number(s.at ?? 0) < 6 * 3_600_000) saved = /^b:\d+/.exec(String(s.id ?? ""))?.[0] ?? null;
      } catch {}
      if (saved && !enteredRoom) {
        const id = saved;
        lastRoom.current.pending = true;
        setTimeout(() => {
          if (lastRoom.current) lastRoom.current.pending = false;
          entering.current = Date.now();
          setOpenReq((r) => ({ id, at: (r?.at ?? 0) + 1 }));
        }, 1800);
        return;
      }
    }
    if (lastRoom.current.pending) return;
    try {
      if (enteredRoom) localStorage.setItem(KEY, JSON.stringify({ w: worldId, id: enteredRoom, at: Date.now() }));
      else localStorage.removeItem(KEY);
    } catch {}
  }, [worldId, guest, enteredRoom]);
  useEffect(() => {
    const m = enteredRoom ? /^b:(\d+)/.exec(enteredRoom) : null;
    if (!worldId || !m) return;
    const [x, z] = spiralXY(Number(m[1]));
    const t = setTimeout(() => fetchHomePlan(`${worldId}:${x},${z}`), 0);
    return () => clearTimeout(t);
  }, [worldId, enteredRoom, fetchHomePlan]);

  // What each kind of place is for: one main thing to do there, a tap away (the doctor at a
  // hospital, a course at a campus, food at a restaurant, a boat ride at the port...).
  const [flightsOpen, setFlightsOpen] = useState(false);
  // Challenge (docs/CHALLENGES.md): the picker, and the challenges lit up on the map.
  const [fightOpen, setFightOpen] = useState(false);
  const [challengeLights, setChallengeLights] = useState<ChallengeLight[]>([]);
  const [prayer, setPrayer] = useState(0);
  function getMainAction(): { label: string; icon: React.ComponentType<{ className?: string }>; run: () => void } | null {
    if (!worldId || !place || guest) return null;
    const theme = placeLevel?.theme ?? "";
    const type = placeRoom?.type ?? "";
    const room = rooms.myRoom;
    const act = (kind: ActivityItem["kind"], label: string) => () => room && setActivity({ id: `${room}:${kind}:0`, kind, label, place: room });
    const board = (kind: RideKindName, label: string) => {
      const r = rideList.find((x) => x.kind === kind);
      return r ? { label, run: () => boardRide(r) } : null;
    };
    const sport = THEME_SPORT_GAME[theme];
    if (sport) return { label: "Watch the match", icon: Trophy, run: () => setSportsOpen(sport) };
    if (inPlannedHome) {
      const [hx, hz] = spiralXY(enteredTile);
      return { label: "Sign the guest book", icon: BookOpen, run: () => worldLife.openGuestBook(`${worldId}:${hx},${hz}`) };
    }
    switch (theme) {
      case "restaurant":
      case "foodcourt":
      case "lounge":
      case "suite":
        return { label: theme === "lounge" ? "Order a drink" : theme === "suite" ? "Room service" : "Order food", icon: UtensilsCrossed, run: act("menu", "Order") };
      case "club":
        return { label: "Dance", icon: Music, run: startDancing };
      case "shop":
      case "mall":
        return { label: "Shop", icon: ShoppingBag, run: () => worldLife.openThings("shops") };
      case "bank":
        return { label: "Banking", icon: LandmarkIcon, run: worldLife.openFinance };
      case "vault":
        return { label: "Crack the vault", icon: LandmarkIcon, run: act("vault", "The vault") };
      case "church":
      case "mosque":
        return { label: "Pray", icon: Church, run: () => setPrayer(Date.now()) };
      case "terminal":
      case "tower":
        return { label: "Fly out of Lagos", icon: Plane, run: () => setFlightsOpen(true) };
      case "helipad": {
        const h = board("heli", "Helicopter tour");
        return h && { ...h, icon: Plane };
      }
      case "quay":
      case "concourse": {
        const b = type === "port" || theme === "quay" ? board("boat", "Take a boat ride") : board("train", "Board a train");
        if (b) return { ...b, icon: type === "port" || theme === "quay" ? Ship : TrainFront };
        break;
      }
      case "funfair": {
        const f = board("ferris", "Ride the Ferris wheel");
        return f && { ...f, icon: FerrisWheel };
      }
      case "waterpark": {
        const w = board("slide", "Down the water slide");
        return w && { ...w, icon: FerrisWheel };
      }
      case "gallery":
      case "rotunda":
      case "skybridge":
      case "clockroom":
      case "park":
      case "plaza":
      case "roofTerrace":
      case "poolDeck":
        return { label: "Take a photo", icon: Camera, run: () => setCamera("photo") };
      case "market":
        return { label: "Shop at the market", icon: ShoppingBag, run: () => worldLife.openThings("shops") };
    }
    return null;
  }

  function leaveRoom() {
    rooms.leave();
    setRide(null);
    setPlace(null);
    setActivity(null);
  }
  useEffect(() => {
    leaveInside.current = () => {
      if (place) leaveRoom();
    };
    leaveThen.current = (what, go) => {
      if (!place && ride === null) return go();
      setLeaveAsk({ what, go });
    };
  });
  // The house button: fly over to your house (or build one, if it isn't in this town).
  function showMyHouse() {
    if (myHouseTile === null) return setHouseOpen(true);
    if (phase === "join") return setMessage({ icon: House, text: `Your house goes up with the rest of the town, in ${countdown}.`, tone: "info" });
    const tile = myHouseTile;
    const fly = () => setFlyTo((f) => ({ tile, at: (f?.at ?? 0) + 1 }));
    // Inside somewhere or on a ride: ask, step out, then fly over once the camera's back.
    leaveThen.current("go to your house", fly);
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
    ? worldId
      ? rides.map((r) => ({ ...r, fare: rideFare(r.kind) }))
      : rides
    : Array.from({ length: Math.max(balloonCount, 1) }, (_, k) => ({ kind: "balloon" as const, index: k, name: `${BALLOON_NAMES[k % BALLOON_NAMES.length]} balloon`, capacity: 1000 }));

  // Paying the fare to a spot on the map: from where you're standing on foot, or where you last were.
  useEffect(() => {
    payTrip.current = async (x: number, z: number) => {
      if (me.guest || !worldId) return true;
      const from = walkStick.current.on ? (worldLife.centerRef.current?.() ?? undefined) : undefined;
      const r = await PROPERTY_API.travelTo(`${worldId}:${Math.round(x)},${Math.round(z)}`, false, from).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
      if (!r.ok) {
        setMessage({ text: r.error, tone: "bad" });
        return false;
      }
      if (r.fare) setMessage({ text: `${cash(r.fare)} ${r.mode ? tripWords(r.mode as Commute) : ""} to get there.`, tone: "good" });
      return true;
    };
  });

  /** Meet a friend where they are: their floor of a building (the fare there on the real map), their balloon or their ride. */
  async function goToFriend(room: string, name: string) {
    setFriendsOpen(false);
    setNudge(null);
    if (me.guest || rooms.myRoom === room) return;
    const b = /^(b:\d+):(g|o|r|f\d+)$/.exec(room);
    if (b) {
      if (worldId) {
        const [x, z] = spiralXY(Number(b[1].slice(2)));
        if (!(await payTrip.current(x, z))) return;
      }
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
          ? { icon: Coins, text: `Pop! +${cash(res.coins)}.${res.leftToday > 0 ? ` ${res.leftToday} more balloon${res.leftToday === 1 ? "" : "s"} today.` : " That's all for today."}`, tone: "good" }
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
    [ghostList, setGhostFor],
  );
  const rules = board?.rules ?? DEFAULT_RULES;
  // Your live duel: a ghost who's been challenged gets the pop-up (wherever they are); anyone
  // whose duel is under way (or a hunter waiting for an answer) gets the duel screen back.
  const liveDuel =
    board?.duel && (board.duel.status === "asked" || board.duel.status === "playing") && !closedDuels.includes(board.duel.id) ? board.duel : null;
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
    if (board?.phase === "seek" && !worldId) return { icon: Swords, text: `Explore · Chat · Ghosts ${board.ghosts.length}` };
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
      {(round || worldId) && (
        <Safe name="City view" fallback={<div className="absolute inset-0 grid place-items-center text-muted">Rebuilding the city…</div>}>
          <CityView
            seed={round?.id ?? 0}
            tileCount={round?.tileCount ?? 0}
            region={worldId}
            onArea={setWorldArea}
            // Signed out, buildings can't be tapped (sign in to go anywhere).
            onProperty={worldId && !guest ? worldLife.onProperty : undefined}
            onWorkplace={worldId && !guest ? worldLife.onWorkplace : undefined}
            centerRef={worldId ? worldLife.centerRef : undefined}
            walkStick={walkStick}
            homeStick={homeStick}
            onWalkBlocked={(what) => setMessage({ text: what === "water" ? "That's water: you can't walk on it. Try a ferry (Explore → Rides)." : "That's a building. Tap it to go in.", tone: "info" })}
            businesses={worldId ? worldLife.businesses : undefined}
            onBusiness={worldId && !guest ? worldLife.onBusiness : undefined}
            owned={worldId ? worldLife.owned : undefined}
            markers={worldId ? NO_MARKERS : markers}
            events={worldId ? NO_EVENTS : cityEvents}
            onBillboard={onBillboardTap}
            ads={allAds}
            onAdViews={worldId ? (views) => {
              worldLife.businessViews(views);
              onAdViews(Object.fromEntries(Object.entries(views).filter(([id]) => !id.startsWith("bz:"))));
            } : onAdViews}
            ghosts={ghostsShown && !worldId ? ghostLights : NO_GHOSTS}
            paused={signInShown}
            onGhost={openGhost}
            flyTo={worldId ? (worldLife.flyTo ?? flyTo) : flyTo}
            homePlans={worldId ? homePlans : undefined}
            roomCounts={rooms.buildingCounts}
            onRoom={onRoom}
            ride={ride}
            onRides={setRides}
            houses={worldId ? NO_HOUSES : state.houses}
            dance={isDancing && dancing ? { id: me.id, move: dancing.move, with: dancing.with } : null}
            friendsAt={worldId ? (walking ? facesOnMap.filter((f) => !f.mine) : facesOnMap) : friendsAt}
            challengeLights={worldId ? challengeLights : undefined}
            onPerson={worldId ? (id) => (id.startsWith("home:") ? worldLife.goHome() : setPersonId(id)) : undefined}
            marks={worldId ? worldLife.marks : undefined}
            onMark={worldId ? worldLife.onMark : undefined}
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
            revealed={phase !== "join" || !!worldId}
            caughtFaces={worldId ? undefined : state.caughtFaces}
            worldEvents={worldId ? NO_WORLD_EVENTS : state.worldEvents}
            focusEvent={focusEvent}
            onEventTap={onEventTap}
          onEventInfo={setEventInfo}
          liveVenues={liveVenues}
            clockOffsetMs={clockOffset}
            onHover={setHover}
            meAvatar={me.avatar}
            // The coin balloon is gone: nothing in the city hands out mint for a tap.
            coinBalloon={null}
            onBalloon={popBalloon}
            progress={huntProgress}
            weather={worldId ? cityWeather : null}
            nightFirst={(round?.id ?? 0) % 2 === 1}
          />
        </Safe>
      )}
      {worldId && worldLife.overlay}
      {/* The real map's second row: who's online, your life (Home, Income, Life, Soon), and the
          notifications bell on the far right. */}
      {worldId && !camera && (
        <div className="pointer-events-none absolute inset-x-2.5 top-14 z-10 flex flex-col items-start gap-2 sm:inset-x-4 sm:top-16">
          <div className="flex w-full flex-wrap items-center gap-1.5">
            {/* Signed out: the numbers straight away (online, registered, visits); tap for more. */}
            {guest && (
              <button onClick={() => setStatsOpen(true)} className="glass pointer-events-auto flex shrink-0 items-stretch divide-x divide-ink/10 rounded-2xl text-center" aria-label="Newtown in numbers">
                <span className="px-3 py-1.5">
                  <b className="flex items-center justify-center gap-1 text-sm tabular-nums">
                    <span className="size-2 animate-pulse rounded-full bg-[#2f9e44]" aria-hidden />
                    {onlineNow.toLocaleString("en-GB")}
                  </b>
                  <span className="block text-[10px] font-semibold text-muted">Online</span>
                </span>
                <span className="px-3 py-1.5">
                  <b className="block text-sm tabular-nums">{state.site.players.toLocaleString("en-GB")}</b>
                  <span className="block text-[10px] font-semibold text-muted">Registered</span>
                </span>
                <span className="px-3 py-1.5">
                  <b className="block text-sm tabular-nums">{state.site.visits.toLocaleString("en-GB")}</b>
                  <span className="block text-[10px] font-semibold text-muted">Visits</span>
                </span>
              </button>
            )}
            {/* You: your face opens everything that isn't chat (your look, money, friends, settings). */}
            {worldId && !guest && (
              <button onClick={() => setMeOpen(true)} className="pointer-events-auto relative shrink-0 rounded-full ring-[3px] ring-[#f59f00] shadow" aria-label="You: your look, money, friends and settings">
                <AvatarFace avatar={me.avatar} size={36} className="rounded-full bg-white" />
              </button>
            )}
            {/* Who's online; tap for the numbers: registered players and visits, and how they're growing. */}
            {!guest && (
            <button
              onClick={() => setStatsOpen(true)}
              className={cn("glass pointer-events-auto relative flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold", worldLife.guideStep === "hi" && "outline outline-2 outline-offset-2 outline-gold")}
              title={`${onlineNow} online in the city, ${onlineNear} near where you're looking. Tap for the numbers.`}
            >
              {worldLife.guideStep === "hi" && <Ripple />}
              <span className="size-2 animate-pulse rounded-full bg-[#2f9e44]" aria-hidden />
              {onlineNow}
              <span className="max-[440px]:hidden">online</span>
            </button>
            )}
            {worldLife.rowButtons}
          </div>
          {worldLife.rowBelow}
          {/* People around where you're looking: online first. Tap one for their card (message, knock, gift). */}
          {!me.guest && !place && ride === null && peopleOut.length > 0 && (
            <div className="pointer-events-auto -mx-1 flex max-w-full items-start gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="People around here">
              <button onClick={() => setStatsOpen(true)} className="glass flex h-12 shrink-0 flex-col items-center justify-center rounded-2xl px-2 text-[10px] font-semibold leading-tight">
                <Users className="size-4" />
                Around
              </button>
              {[...peopleOut]
                .sort((a, b) => Number(b.status === "online") - Number(a.status === "online"))
                .slice(0, 12)
                .map((p) => (
                  <button key={p.id} onClick={() => setPersonId(p.id)} className="flex w-12 shrink-0 flex-col items-center" title={`${p.name} · ${p.status === "online" ? "online" : p.status === "work" ? "at work" : p.status === "asleep" ? "asleep" : "away"}`}>
                    <span className="relative">
                      <AvatarFace avatar={cleanAvatar(p.avatar, p.name)} size={36} className="rounded-full shadow ring-2 ring-white" />
                      <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-white", p.status === "online" ? "bg-[#2f9e44]" : p.status === "work" ? "bg-[#f08c00]" : "bg-[#adb5bd]")} />
                    </span>
                    <span className="mt-0.5 w-full truncate rounded-full bg-black/35 px-1 text-center text-[10px] font-semibold text-white">{p.name.split(" ")[0]}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
      {worldRegion && (worldRegion.water || worldRegion.roads.length > 0) && (
        // The map data's credit (its licence asks for it): small and out of the way.
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto absolute bottom-1 left-1.5 z-10 text-[9px] leading-none text-black/40 hover:text-black/70"
        >
          © OpenStreetMap
        </a>
      )}

      {/* Inside a place: mint spraying, the jukebox, duel invites and room news. */}
      {meP && rooms.myRoom && (
        <Safe name="Room activity">
          <RoomActivityLayer roundId={round?.id ?? null} roomId={rooms.myRoom} me={meP} />
        </Safe>
      )}

      {/* The world's last minutes: a red glow around the edges. */}
      {(urgent || (!worldId && eventOn("final_countdown"))) && (
        <div
          aria-hidden
          className={cn("pointer-events-none absolute inset-0 z-[5]", urgent ? "animate-pulse" : "")}
          style={{ boxShadow: `inset 0 0 ${urgent ? 120 : 70}px rgba(229, 72, 77, ${urgent ? 0.55 : 0.3})` }}
        />
      )}

      {/* Top: round clock and numbers (stacked, so big numbers fit) */}
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 sm:p-4", camera && "hidden")}>
        {worldRegion ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <PlacePill area={worldArea} state={worldRegion.state} onClick={() => setCityOpen(true)} />
          </div>
        ) : round ? (
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
              {worldId && (
                // The city's sounds, on or off (signed out, up here: the bottom is the Advertise button's).
                <button
                  onClick={() => { setSound(!sound); saveView({ sound: !sound }); }}
                  className="glass grid size-8 shrink-0 place-items-center rounded-full sm:size-9"
                  aria-label={sound ? "Turn the city's sound off" : "Turn the city's sound on"}
                >
                  {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4 text-muted" />}
                </button>
              )}
              <button onClick={() => setHowOpen(true)} className="glass grid size-8 shrink-0 place-items-center rounded-full font-display font-bold sm:size-9" aria-label="How it works">
                ?
              </button>
              {/* On the real map it's under the description instead. */}
              {!worldId && (
                <button onClick={() => setSignIn({ why: null })} className="flex h-8 items-center whitespace-nowrap rounded-full bg-gold px-3.5 text-sm font-semibold text-ink shadow sm:h-9 sm:px-4">
                  Sign in to play
                </button>
              )}
            </div>
          ) : (
          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {!worldId && (
            <span className="glass hidden h-9 whitespace-nowrap rounded-full px-2.5 text-xs font-bold leading-9 sm:inline-block" title="Your level (level up from the menu)">
              Lv {me.level}
            </span>
            )}
            {me.bigFish && !worldId && (
              <span className="glass flex h-8 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-bold text-[#1c7ed6] sm:h-9 sm:px-2.5" title="You hold 10,000+ mint: everyone sees you as a big fish">
                <Fish className="size-3.5" />
                <span className="hidden sm:inline">Big fish</span>
              </span>
            )}
            {state.streak && !worldId && <StreakPill streak={state.streak} onOpen={() => { setStreakOpen(true); setMenu(false); setFeedOpen(false); }} />}
            {worldId && worldLife.reputation !== null && (
              // Your reputation: what adds to it and what takes it away.
              <button onClick={() => worldLife.openReputation()} className="glass flex h-8 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-bold sm:h-9 sm:px-3 sm:text-sm" aria-label={`Reputation ${worldLife.reputation}`}>
                <Star className="size-4 text-gold-dark" />
                {worldLife.reputation.toLocaleString("en-GB")}
              </button>
            )}
            {worldId && (
              // Your cash at hand: opens Finance.
              <button
                onClick={() => setMoneyOpen(true)}
                className={cn("glass relative flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-bold sm:h-9 sm:px-3 sm:text-sm", worldLife.financeGlow && "outline outline-2 outline-offset-2 outline-gold")}
                aria-label="Finance"
              >
                <Wallet className="size-4 text-gold-dark" />
                {cash(me.coins)}
                {worldLife.financeDot && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-hit" />}
              </button>
            )}
            {worldId && (
              // The city's sounds, on or off (top right).
              <button
                onClick={() => { setSound(!sound); saveView({ sound: !sound }); }}
                className="glass grid size-8 shrink-0 place-items-center rounded-full sm:size-9"
                aria-label={sound ? "Turn the city's sound off" : "Turn the city's sound on"}
              >
                {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4 text-muted" />}
              </button>
            )}
            {!worldId && (
            <span className="glass inline-block h-8 whitespace-nowrap rounded-full px-2.5 text-xs leading-8 sm:h-9 sm:px-3 sm:text-sm sm:leading-9" title={`${cash(me.coins)} · level ${me.level}`}>
              <b className="text-gold-dark">{cash(me.coins)}</b>
              {me.bonusCoins > 0 && <span className="text-muted"> +{short(me.bonusCoins)}</span>}
            </span>
            )}
            {!worldId && (
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
            )}
            {/* The old menu belongs to the hourly game: on the real map everything is on your phone. */}
            {!worldId && (
            <button
              onClick={() => { setMenu((v) => !v); setFeedOpen(false); }}
              className="glass grid size-8 shrink-0 place-items-center rounded-full text-base font-semibold sm:size-9"
              aria-label="Menu"
            >
              {menu ? <X className="size-4" /> : <MenuIcon className="size-4" />}
            </button>
            )}
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
      <div
        className={cn(
          "pointer-events-none absolute z-30 flex w-[min(20rem,calc(100vw-1.5rem))] flex-col items-end gap-1.5",
          worldId ? "left-1/2 top-[7.5rem] -translate-x-1/2 sm:top-28" : cn("right-3 sm:right-4 sm:top-16", statsMin ? "top-14" : "top-[14.5rem]"),
        )}
      >
        {!feedOpen &&
          !menu &&
          toasts.slice(0, 1).map((n) => (
            <button
              key={n.key}
              onClick={() => {
                if (n.noteId) markRead([n.noteId]);
                if (n.eventId) return openEvent(n.eventId);
                if (!guest && (n.icon === "hug" || n.icon === "handshake" || n.icon === "gift")) {
                  setToasts([]);
                  return openGifts();
                }
                if (worldId) openNewtown();
                else setFeedOpen(true);
                setFeedSeenAt(new Date(now).toISOString());
                setToasts([]);
              }}
              className="glass toast-in pointer-events-auto w-full rounded-2xl px-3 py-2 text-left shadow-lg"
            >
              <FeedRow item={n} now={now} compact />
              {toasts.length > 1 && <span className="mt-0.5 block text-right text-[10px] text-muted">+{toasts.length - 1} more in your chat</span>}
            </button>
          ))}
      </div>
      {worldId && !guest && (
        <Fight
          region={worldId}
          me={{ id: me.id, name: me.name ?? "Player", avatar: me.avatar }}
          open={fightOpen}
          onClose={() => setFightOpen(false)}
          where={() => worldLife.centerRef.current?.() ?? null}
          onLights={setChallengeLights}
          onMessage={(text, good) => setMessage({ text, tone: good ? "good" : "bad" })}
          onFly={(x, z) => worldLife.lookAt(x, z)}
        />
      )}
      {clubDoor && (
        <Sheet onClose={() => setClubDoor(null)} title={`${clubDoor.room.name}: at the door`}>
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <div className="grid size-16 place-items-center rounded-3xl bg-[#7048e8] text-white">
              <Music className="size-8" />
            </div>
            <p className="text-2xl font-bold">{cash(clubDoor.fee)}</p>
            <p className="text-sm text-muted">Entry to {clubDoor.level.label}. Pay once and come and go as you like for 24 hours.</p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={() => setClubDoor(null)} className="h-11 rounded-full bg-ink/5 text-sm font-semibold">
              Not now
            </button>
            <button onClick={() => void payClubDoor()} disabled={clubBusy} className="h-11 rounded-full bg-ink text-sm font-semibold text-white disabled:opacity-50">
              {clubBusy ? "Paying…" : "Pay and go in"}
            </button>
          </div>
        </Sheet>
      )}
      {flightsOpen && (
        <Sheet onClose={() => setFlightsOpen(false)} title="Fly out of Lagos">
          <p className="text-sm text-muted">Flights to other cities are coming soon: each one a whole new map to live in, with your money and things going with you.</p>
          <ul className="mt-3 space-y-2">
            {[
              ["Abuja", "Nigeria's capital"],
              ["Port Harcourt", "The Garden City"],
              ["Kano", "The ancient city of the north"],
              ["Accra", "Ghana"],
              ["Nairobi", "Kenya"],
              ["London", "United Kingdom"],
            ].map(([city, what]) => (
              <li key={city} className="flex items-center gap-3 rounded-2xl bg-panel-2 px-3 py-2.5">
                <Plane className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <b className="block text-sm">{city}</b>
                  <span className="text-xs text-muted">{what}</span>
                </span>
                <span className="rounded-full bg-gold/25 px-2 py-0.5 text-[11px] font-semibold text-gold-dark">Coming soon</span>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
      {prayer > 0 && <PrayerMoment key={prayer} onDone={() => setPrayer(0)} />}
      {leaveAsk && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" onPointerDown={(e) => e.target === e.currentTarget && setLeaveAsk(null)} role="dialog" aria-label="Leave here?">
          <div className="w-full max-w-xs rounded-3xl bg-panel p-5 text-center shadow-2xl">
            <DoorOpen className="mx-auto size-8 text-gold-dark" aria-hidden />
            <h2 className="mt-2 font-display text-lg font-bold">Leave {ride !== null ? "this ride" : (rooms.myRoomInfo?.name ?? "this place")}?</h2>
            <p className="mt-1 text-sm text-muted">To {leaveAsk.what} you&apos;ll step out of {ride !== null ? "the ride" : "here"} first.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setLeaveAsk(null)} className="h-11 flex-1 rounded-full bg-panel-2 font-semibold">
                Stay
              </button>
              <button
                onClick={() => {
                  const go = leaveAsk.go;
                  setLeaveAsk(null);
                  leaveRoom();
                  // Once the camera is back out over the town.
                  setTimeout(go, 1700);
                }}
                className="h-11 flex-1 rounded-full bg-ink font-semibold text-white"
              >
                Leave and go
              </button>
            </div>
          </div>
        </div>
      )}
      {alertsOpen && (
        <Sheet onClose={() => setAlertsOpen(false)} title="Notifications">
          {pushOn && (
            <button
              onClick={() =>
                void turnOffNotifications().then((r) => {
                  setMessage({ text: r.text, tone: r.ok ? "good" : "info" });
                  if (r.ok) setPushOn(false);
                })
              }
              className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted underline"
            >
              <BellOff className="size-3.5" /> Turn notifications off on this phone
            </button>
          )}
          {!pushOn && (
            <div className="mb-3 rounded-2xl bg-gold/15 p-3">
              <p className="text-sm font-semibold">Get told even when the game is closed</p>
              <p className="mt-0.5 text-xs text-muted">Someone at your door, a gift, a sale, a message, a date, a prank, someone picking your pocket.</p>
              {pushNeedsHome ? (
                <p className="mt-2 rounded-xl bg-panel px-3 py-2 text-xs">
                  On iPhone: tap <b>Share</b> (the square with an arrow) in Safari, then <b>Add to Home Screen</b>. Open Newtown from your home screen and tap the bell again.
                </p>
              ) : (
              <button
                onClick={() =>
                  void turnOnNotifications().then((r) => {
                    setMessage({ text: r.text, tone: r.ok ? "good" : "info" });
                    if (r.ok) setPushOn(true);
                  })
                }
                className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-ink text-sm font-semibold text-white"
              >
                <BellRing className="size-4" /> Turn on notifications
              </button>
              )}
            </div>
          )}
          {feed.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Nothing yet.</p>
          ) : (
            <>
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
                <span>Swipe one sideways to clear it.</span>
                {feed.some((f) => f.noteId) && (
                  <button onClick={() => dismissNote(feed.flatMap((f) => (f.noteId ? [f.noteId] : [])))} className="font-semibold text-hit">
                    Clear all
                  </button>
                )}
              </div>
              <ul className="space-y-1.5">
                {feed.slice(0, 40).map((f) => (
                  <li key={f.key}>
                    {f.noteId ? (
                      <SwipeRow onDismiss={() => dismissNote([f.noteId!])}>
                        <div className={cn("rounded-2xl", !f.read && "bg-gold/10")}>
                          <FeedRow item={f} now={now} compact />
                        </div>
                      </SwipeRow>
                    ) : (
                      <FeedRow item={f} now={now} compact />
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Sheet>
      )}
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
          onHowItWorks={() => { setMenu(false); if (worldId) worldLife.restartGuide(); else setHowOpen(true); }}
          life={!!worldId}
          onReport={worldId ? () => { setMenu(false); worldLife.openReport(); } : undefined}
          onEditAvatar={() => { setMenu(false); setEditAvatar(true); }}
          onResults={() => { setMenu(false); if (state.results) setShowResults(state.results.roundId); }}
          onMyStyle={guest || worldId ? undefined : () => { setMenu(false); setStyleOpen(true); }}
          onMyHouse={guest || worldId ? undefined : () => { setMenu(false); setHouseOpen(true); }}
          onFriends={guest ? undefined : () => { setMenu(false); setFriendsOpen(true); }}
          friendRequests={state.friends.incoming.length}
          onMyGifts={guest ? undefined : () => { setMenu(false); openGifts(); }}
          newGifts={newGifts}
          coins={guest ? undefined : me.coins}
          level={guest ? undefined : me.level}
          onPhone={() => { setMenu(false); setPhone("home"); }}
          onMyJob={guest || worldId ? undefined : () => { setMenu(false); setJobsAt(null); }}
          onGames={worldId ? undefined : () => { setMenu(false); setGamesOpen({}); }}
          onChangePin={() => router.push("/welcome")}
          onSignOut={() => { setMenu(false); setConfirmSignOut(true); }}
        />
      )}
      {howOpen && <HowItWorks onClose={() => setHowOpen(false)} legacy={!worldId} />}
      {jobsAt !== undefined && <JobsSheet place={jobsAt} ctx={playCtx} onClose={() => setJobsAt(undefined)} onChanged={() => startTransition(() => router.refresh())} />}
      {gamesOpen && (
        <GamesSheet
          ctx={playCtx}
          placeType={ride !== null ? ride.kind : (placeRoom?.type ?? null)}
          placeName={ride !== null || place ? (rooms.myRoomInfo?.name ?? placeRoom?.name ?? null) : null}
          open={gamesOpen.game ? { game: gamesOpen.game, invite: gamesOpen.invite } : null}
          onClose={() => setGamesOpen(null)}
        />
      )}
      {!guest && playCtx.roomId && !gamesOpen && <MinigameInvites ctx={playCtx} onAccept={(def, invite) => setGamesOpen({ game: def.id, invite })} />}
      {camera && (round || worldId) && (
        <CameraMode
          key={camera}
          avatar={me.avatar}
          initialKind={camera}
          city={worldRegion?.name ?? plan.city.name}
          place={ride !== null ? (rooms.myRoomInfo?.name ?? RIDE_INFO[ride.kind].label) : place ? (rooms.myRoomInfo?.name ?? placeRoom?.name ?? null) : null}
          guest={guest}
          onClose={() => { setCamera(null); if (selfieTo) { setSelfieTo(null); setChatOpen(true); } }}
          onOpenGallery={() => { setCamera(null); setSelfieTo(null); setPhone("photos"); }}
          sendTo={
            selfieTo
              ? {
                  name: selfieTo.to,
                  send: async (shot) => {
                    const form = new FormData();
                    form.set("image", new File([shot.blob], "photo.jpg", { type: "image/jpeg" }));
                    if ("to" in selfieTo.target) form.set("to", selfieTo.target.to);
                    else form.set("room", selfieTo.target.room);
                    const res = await sendPhoto(form).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
                    if (!res.ok) return res.error;
                    announceChatSent(res.message);
                    setCamera(null);
                    setSelfieTo(null);
                    setChatOpen(true);
                    setMessage({ text: `Selfie sent to ${selfieTo.to}`, tone: "good" });
                    return null;
                  },
                }
              : undefined
          }
          onSignIn={() => { setCamera(null); setSignIn({ why: "Sign in to keep your pictures. Your gallery goes with you to every town." }); }}
          people={selfiePeople}
        />
      )}
      {phone && (
        <PhoneSheet
          guest={guest}
          initialScreen={phone}
          onClose={() => setPhone(null)}
          onCamera={(kind) => { setPhone(null); if (round || worldId) setCamera(kind); }}
          onSignIn={() => { setPhone(null); setSignIn({ why: "Sign in to keep your pictures. Your gallery goes with you to every town." }); }}
        />
      )}
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
            setSignInWhy(`Sign in to challenge ghosts: ${cash(10)} a duel, and you win a slice of their stake if you beat them.`);
          }}
          onClose={() => setGhostFor(null)}
        />
      )}
      {duelOn && !worldId && (
        <DuelScreen
          key={duelOn.id}
          initial={duelOn}
          me={{ name: me.name ?? "You", avatar: me.avatar }}
          onClose={() => {
            const closed = duelOn.id;
            setClosedDuels((list) => [...list.slice(-20), closed]);
            setDuelOn(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
      {askedGhost && !guest && !worldId && (
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
          onGo={(f, room) => void goToFriend(room, f.name)}
          onMessage={(f) => {
            setFriendsOpen(false);
            chatWith(f);
          }}
          onChanged={() => startTransition(() => router.refresh())}
          onClose={() => setFriendsOpen(false)}
          greet={(f) => greet(f, false)}
        />
      )}
      {editAvatar && studio3d && (
        <AvatarStudio
          initial={me.avatar}
          onClose={() => setEditAvatar(false)}
          onSaved={() => { setEditAvatar(false); setMessage({ text: "Looking good! Your new look is saved.", tone: "good" }); router.refresh(); }}
        />
      )}
      {editAvatar && !studio3d && (
        <AvatarEditor
          initial={me.avatar}
          onClose={() => setEditAvatar(false)}
          onSaved={() => { setEditAvatar(false); setMessage({ text: "Looking good! Your new look is saved.", tone: "good" }); router.refresh(); }}
        />
      )}
      {startCard && !worldId && (
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
            <p className="font-display text-4xl font-extrabold">{cash(state.prices.stake)}</p>
            <p className="text-xs text-muted">You have {short(me.coins)}. After this: {short(Math.max(0, me.coins - state.prices.stake))}.</p>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-ink/80">
            <Li icon={Star}>When the hunt starts, your light shows on the map for everyone. You don&apos;t hide or move: hunters come to you.</Li>
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
        <Sheet onClose={() => setPickPlace(null)} clear={!!worldId}>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <Building2 className="size-5 text-[#7048e8]" />
            {pickPlace.name}
          </h2>
          <p className="mt-1 text-sm text-muted">{worldId ? "Which floor? Each one has its own people and its own chat." : "Where would you like to go? Each floor has its own people and its own chat."}</p>
          <div className="mt-3 space-y-2">
            {(pickPlace.levels?.length ? pickPlace.levels : [{ id: "g", label: "Ground floor", capacity: pickPlace.capacity }]).map((lvl) => {
              // The real map charges the fare there (on the place's card), not a first-visit fee.
              const cost = pickPlace.kind === "building" && !worldId ? visitCost(pickPlace) : 0;
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
                  {cost > 0 && !hereNow && <span className="shrink-0 rounded-full bg-gold/25 px-2 py-0.5 text-[11px] font-bold text-gold-dark">{cash(cost)}</span>}
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
          places={worldId ? (explorePlacesNow ?? []) : undefined}
          onPlace={(p) => {
            setPickRide(false);
            worldLife.openExplorePlace(p);
          }}
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
            local={!!worldId}
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
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Billboard{worldId ? "" : ` · ${where(advertise.tile)}`}</p>
          <h2 className="font-display text-xl font-bold">Your brand could be here</h2>
          <p className="mt-2 text-sm text-muted">
            Lease a building in Lagos for a year and your design goes on the city&apos;s billboards too. Swap it any time.
          </p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setAdvertise(null)} className="flex-1 rounded-xl bg-panel-2 py-2.5 font-semibold">
              Not now
            </button>
            <button
              onClick={() => {
                setAdvertise(null);
                openAdvertise();
              }}
              className="flex-1 rounded-xl bg-gold py-2.5 text-center font-semibold text-ink"
            >
              Advertise here
            </button>
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
              Tap {openAd.ad.link ? `Visit ${openAd.ad.brand}` : "the button"} below to earn {cash(openAd.reward)}.
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
            Want your own billboard?{" "}
            <button
              onClick={() => {
                setOpenAd(null);
                openAdvertise();
              }}
              className="underline"
            >
              Advertise here
            </button>
          </p>
        </Sheet>
      )}


      {/* Bottom: messages, controls and chat */}
      <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:gap-2 sm:p-4", worldId && !place && !guest && "pr-16 sm:pr-20", camera && "hidden")}>
        {!guest && !worldId && (
          <Safe name="Quest banner">
            <QuestBanner quest={quests.quest} onOpen={() => setQuestOpen(true)} />
            <QuestCelebration />
          </Safe>
        )}
        {!guest && !worldId && nudge && <FriendNudge friend={nudge} place={nudge.place} onJoin={() => void goToFriend(nudge.room, nudge.name)} onClose={closeNudge} />}
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

        {/* The real map, out on the streets: the buttons are in a column down the left (below). Inside a
            place or on a ride the place's own bar takes over; walking, only Stop walking. Explore is
            hidden for now. */}
        {/* Signed out: one white button to advertise on the map, and the game's name floating over the city. */}
        {worldId && guest && !place && ride === null && (
          <button onClick={() => openAdvertise()} className="pointer-events-auto flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-ink shadow-lg ring-1 ring-black/5">
            <Megaphone className="size-4 text-[#e8590c]" />
            Advertise on the map
          </button>
        )}
        {/* On foot: just Stop walking, in the middle (the joystick is bottom left). */}
        {worldId && !guest && !place && ride === null && walking && (
          <div className="pointer-events-auto flex items-stretch">
            <DockButton icon={Footprints} label="Stop walking" dark onClick={() => setWalking(false)} />
          </div>
        )}
        {/* Down the left, out of the way of the city: the notifications bell (while they're off), Soon,
            Locate me and Walk, see-through and small. (Challenge is top right.) */}
        {worldId && !guest && !place && ride === null && !walking && (
          <div className="pointer-events-auto absolute bottom-[max(0.625rem,env(safe-area-inset-bottom))] left-2.5 flex flex-col items-center gap-2 sm:bottom-4 sm:left-4">
            {!pushOn && (
              <button onClick={turnOnBell} className="relative grid size-10 place-items-center rounded-full bg-gold/80 text-ink shadow transition-opacity hover:bg-gold" aria-label="Notifications are off: tap to turn them on" title="Turn notifications on">
                <BellOff className="size-4" />
                <span aria-hidden className="pointer-events-none absolute -inset-1 animate-ping rounded-full ring-2 ring-gold/60" />
              </button>
            )}
            {worldLife.hasHome && (
              <button onClick={worldLife.openSoon} className="grid size-10 place-items-center rounded-full bg-white/55 shadow-sm backdrop-blur-sm transition hover:bg-white/90" aria-label="Coming soon" title="Coming soon">
                <Rocket className="size-[18px] text-[#7048e8]" />
              </button>
            )}
            <button
              onClick={() => {
                if (!worldLife.locateMe()) setMessage({ text: "You're not anywhere on the map yet. Find a home first.", tone: "info" });
              }}
              className="grid size-10 place-items-center rounded-full bg-white/55 shadow-sm backdrop-blur-sm transition hover:bg-white/90"
              aria-label="Locate me"
              title="Locate me"
            >
              <LocateFixed className="size-[18px] text-[#1c7ed6]" />
            </button>
            <button onClick={() => setWalking(true)} className="flex h-11 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl bg-white/55 text-[10px] font-semibold shadow-sm backdrop-blur-sm transition hover:bg-white/90" aria-label="Walk">
              <Footprints className="size-4" />
              Walk
            </button>
          </div>
        )}

        {/* Inside a place on the real map: a voice call with the few people on this floor (docs/VOICE_CALLS.md). */}
        {worldId && place && !guest && rooms.myRoom && (
          <CallBar room={`place-${rooms.myRoom}`} me={{ id: me.id, name: me.name ?? "Player", avatar: me.avatar }} title="Voice chat here" max={6} className="pointer-events-auto w-full max-w-md" />
        )}
        {/* The real map, inside a building or on a ride (a balloon...): where you are, chat, change floor, camera, leave. */}
        {worldId && (place || ride !== null) && (
          <div className="glass pointer-events-auto flex w-full max-w-md flex-wrap items-center gap-2 rounded-2xl p-2 pl-3 text-sm">
            <Building2 className="size-4 shrink-0 text-[#7048e8]" />
            <b className="line-clamp-2 min-w-0 flex-1 basis-[calc(100%-2rem)] leading-tight sm:basis-auto">
              {rooms.myRoomInfo?.name ||
                (ride !== null ? (rideList.find((r) => r.kind === ride.kind && r.index === ride.index)?.name ?? RIDE_INFO[ride.kind].label) : placeRoom?.name) ||
                "Inside a building"}
            </b>
            <span className="flex-1 sm:hidden" />
            {(() => {
              const mainAction = getMainAction();
              return mainAction && place && (
              <button onClick={mainAction.run} className="flex shrink-0 items-center gap-1 rounded-xl bg-gold px-3 py-2 text-xs font-bold text-ink shadow" aria-label={mainAction.label}>
                <mainAction.icon className="size-4" /> {mainAction.label}
              </button>
              );
            })()}
            {!guest && (
              <button onClick={() => { setChatOpen(true); setChatUnread(0); }} className="relative flex shrink-0 items-center gap-1 rounded-xl bg-panel-2 px-3 py-2 text-xs font-semibold" aria-label="Chat with everyone here">
                <MessageCircle className="size-4" /> Chat
                {chatUnread > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-hit px-1 text-[11px] text-white">{chatUnread > 99 ? "99+" : chatUnread}</span>}
              </button>
            )}
            {place && placeRoom && placeRoom.id === place.building && (placeRoom.levels?.length ?? 0) > 1 && (
              <button
                onClick={() => setPickPlace(placeRoom)}
                className={cn("relative flex shrink-0 items-center gap-1 rounded-xl bg-panel-2 px-3 py-2 text-xs font-semibold", floorGlow && "outline outline-2 outline-offset-2 outline-gold")}
              >
                {floorGlow && <span aria-hidden className="pointer-events-none absolute -inset-1 animate-ping rounded-xl ring-4 ring-gold/60" />}
                <Layers className="size-4" /> Floor
              </button>
            )}
            {/* Inside, the phone is just the camera: pictures, and selfies (flip it round). */}
            <button onClick={() => setCamera("photo")} className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f08c00] text-white" aria-label="Camera: pictures and selfies">
              <Camera className="size-4" />
            </button>
            <button onClick={leaveRoom} className="flex shrink-0 items-center gap-1 rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white">
              <LogOut className="size-4" /> {ride !== null ? "Get off" : "Leave"}
            </button>
          </div>
        )}
        {/* The old hourly game's bar (Explore, Chat, Ghosts...): off on the real map for now. */}
        {!worldId && (
          <>
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
            {!dockOpen && !isDancing && !worldId && (place || ride !== null) && (
              <button onClick={() => setGamesOpen({})} className="glass pointer-events-auto flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow sm:text-sm">
                <Gamepad2 className="size-4 text-[#7048e8]" />
                Games
              </button>
            )}
            {!dockOpen && !isDancing && place && placeRoom && jobAt(placeRoom.type) && (
              <button
                onClick={() => (guest ? setSignInWhy("Sign in to apply for jobs and earn mint by the hour.") : setJobsAt({ id: placeRoom.id, name: placeRoom.name }))}
                className="glass pointer-events-auto flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow sm:text-sm"
              >
                <Briefcase className="size-4 text-[#1971c2]" />
                Jobs
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
            {ghostLights.length > 0 && !place && ride === null && (
              <button
                onClick={toggleGhosts}
                className={cn("pointer-events-auto grid size-8 shrink-0 place-items-center rounded-full shadow sm:size-9", ghostsShown ? "glass" : "bg-ink text-white")}
                aria-pressed={!ghostsShown}
                aria-label={ghostsShown ? "Hide the ghosts" : "Show the ghosts"}
                title={ghostsShown ? "Hide the ghosts" : "Show the ghosts"}
              >
                {ghostsShown ? <Eye className="size-4 text-[#1c7ed6]" /> : <EyeOff className="size-4" />}
              </button>
            )}
            {round && (
              <button
                onClick={() => { setCamera("photo"); setMenu(false); setFeedOpen(false); }}
                className="pointer-events-auto grid size-8 shrink-0 place-items-center rounded-full bg-ink text-white shadow sm:size-9"
                aria-label="Camera: take a picture or a selfie"
                title="Take a picture or a selfie"
              >
                <Camera className="size-4" />
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
                finder={peopleFinder("chat")}
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
                  : `The hunt is on: ${short(board?.ghosts.length ?? round.hidersRemaining)} ghosts lit up, ${cash(round.pool)} in the pool. Tap a light to see a ghost.`}
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
                      <button
                        onClick={() => setPickPlace(placeRoom)}
                        className={cn("relative flex items-center gap-1.5 rounded-xl bg-panel-2 px-3 py-2 font-semibold", worldId && floorGlow && "outline outline-2 outline-offset-2 outline-gold")}
                      >
                        {worldId && floorGlow && <span aria-hidden className="pointer-events-none absolute -inset-1 animate-ping rounded-xl ring-4 ring-gold/60" />}
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
                  {!worldId && duelStrip}
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
          </>
        )}
      </div>

      {/* Signed out: the game's name, big and floating over the city. */}
      {worldId && guest && !place && ride === null && !camera && (
        <div className="pointer-events-none absolute inset-x-0 top-[11%] z-[5] flex justify-center sm:top-[14%]">
          <div className="title-float flex flex-col items-center">
            <LogoMark size={60} className="mb-2 rounded-[16px] shadow-[0_12px_30px_rgba(0,0,0,0.35)]" />
            <h1 className="title-3d font-display text-[clamp(3rem,15vw,8rem)] font-black italic leading-none tracking-tight text-white">Newtown</h1>
            <p className="mt-3 rounded-full bg-black/35 px-4 py-1.5 text-sm font-semibold tracking-wide text-white backdrop-blur-sm sm:text-base">Your world. Your story.</p>
            {/* What Newtown is, for someone seeing it for the first time. */}
            <p className="mt-3 max-w-[22rem] rounded-2xl bg-black/40 px-4 py-2.5 text-center text-[13px] leading-snug text-white backdrop-blur-sm sm:max-w-md sm:text-sm">
              A living world where social media meets play. Explore real cities, meet new people, team up, and discover cultures from around the globe, alongside real people and real brands, in a space that&apos;s fun and safe.
            </p>
            <WelcomeFeatures />
            <button onClick={() => setSignIn({ why: null })} className="pointer-events-auto mt-3 h-12 rounded-full bg-gold px-8 text-base font-bold text-ink shadow-lg">
              Sign in to play
            </button>
          </div>
        </div>
      )}
      {/* Challenge: a white trophy button in the top right corner, under your cash (gently bouncing). */}
      {worldId && !guest && !camera && !place && ride === null && !walking && (
        <button
          onClick={() => setFightOpen(true)}
          className="challenge-pop pointer-events-auto fixed right-3 top-14 z-20 grid size-12 place-items-center rounded-full bg-white text-[#f08c00] ring-1 ring-black/5 sm:right-4 sm:top-16"
          aria-label="Challenge people nearby"
          title="Challenge people nearby"
        >
          <Trophy className="size-6" />
          {worldLife.guideStep === "challenge" && <span aria-hidden className="pointer-events-none absolute -inset-1 animate-ping rounded-full ring-4 ring-gold/70" />}
        </button>
      )}
      {/* Notifications off on this phone: a bell on the right, halfway down, to switch them on (gone
          once they're on). On the real map it's in the column down the left instead. */}
      {!me.guest && !pushOn && !camera && !worldId && (
        <button
          onClick={turnOnBell}
          className="pointer-events-auto fixed right-3 top-1/2 z-20 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-gold text-ink shadow-lg"
          aria-label="Notifications are off: tap to turn them on"
        >
          <BellOff className="size-4" />
          <span aria-hidden className="pointer-events-none absolute -inset-1 animate-ping rounded-full ring-2 ring-gold/70" />
        </button>
      )}
      {/* The real map: one chat bubble, bottom right (your chats, Newtown's own messages, the news,
          the camera). It shakes when something new arrives. */}
      {worldId && !camera && !guest && !place && (
        <button
          onClick={() => {
            setChatOpen(true);
            setMenu(false);
          }}
          className="pointer-events-auto absolute bottom-4 right-3 z-20 grid size-14 place-items-center rounded-full bg-[#0eadff] text-white shadow-[0_8px_20px_-6px_rgba(14,173,255,0.8)] sm:bottom-6 sm:right-4"
          aria-label={unread + chatUnread > 0 ? `Chat: ${unread + chatUnread} new` : "Chat"}
        >
          <span key={phoneRing} className={phoneRing ? "phone-ring grid place-items-center" : "grid place-items-center"}>
            <MessageCircle className="size-7 fill-white" />
          </span>
          {unread + chatUnread > 0 && (
            <span className="absolute -right-1 -top-1 grid min-w-6 place-items-center rounded-full bg-hit px-1.5 text-xs font-bold text-white ring-2 ring-white">{unread + chatUnread > 99 ? "99+" : unread + chatUnread}</span>
          )}
        </button>
      )}
      {moneyOpen && worldId && !guest && (
        <MoneyHome
          coins={me.coins}
          perMint={worldRegion?.prices.perMint ?? 1_500}
          region={worldId}
          onClose={() => setMoneyOpen(false)}
          onTaken={() => {
            playSfx("chime");
            startTransition(() => router.refresh());
          }}
          onProperty={() => worldLife.openFinance()}
          onShops={() => worldLife.openThings("shops")}
        />
      )}
      {giftPop && worldId && !guest && !moneyOpen && (
        <DailyGiftPop
          perMint={worldRegion?.prices.perMint ?? 1_500}
          onClose={closeGiftPop}
          onTaken={() => {
            playSfx("chime");
            startTransition(() => router.refresh());
          }}
        />
      )}
      {meOpen && worldId && !guest && (
        <MeSheet
          name={me.name ?? "You"}
          avatar={me.avatar}
          reputation={worldLife.reputation}
          onClose={() => setMeOpen(false)}
          groups={[
            {
              title: "You",
              items: [
                { label: "My look", icon: Palette, colour: "#e64980", go: () => setEditAvatar(true) },
                { label: "My card", icon: User, colour: "#7048e8", go: () => setPersonId(me.id) },
                ...(worldLife.hasHome ? [{ label: "Home", icon: House, colour: "#7048e8", go: () => worldLife.goHome() }] : []),
                { label: "Money", icon: Wallet, colour: "#2b8a3e", go: () => setMoneyOpen(true) },
                { label: "Photos", icon: ImageIcon, colour: "#f59f00", go: () => setPhone("photos") },
                { label: "My things", icon: Gem, colour: "#0c8599", go: () => worldLife.openThings("mine") },
                { label: "Gifts", icon: Gift, colour: "#d6336c", badge: newGifts, go: () => openGifts() },
                { label: "Doorstep", icon: DoorClosed, colour: "#8d5524", go: () => setDoorstepOpen(true) },
              ],
            },
            {
              title: "People",
              items: [
                { label: "Friends", icon: Users, colour: "#1c7ed6", go: () => setFriendsOpen(true) },
                { label: "Dating", icon: Heart, colour: "#c2255c", go: () => setSocialOpen("dating") },
                { label: "Rivals", icon: Swords, colour: "#e8590c", go: () => setSocialOpen("rivals") },
                { label: "Who's online", icon: Users, colour: "#2f9e44", go: () => setStatsOpen(true) },
              ],
            },
            {
              title: "The city",
              items: [
                { label: "Shops", icon: ShoppingBag, colour: "#5f3dc4", go: () => worldLife.openThings("shops") },
                { label: "Cars", icon: CarFront, colour: "#343a40", go: () => worldLife.openThings("cars") },
                { label: "Market", icon: Store, colour: "#2b8a3e", go: () => worldLife.openThings("market") },
                { label: "Craft", icon: Hammer, colour: "#a61e4d", go: () => worldLife.openThings("craft") },
                { label: "Leave a mark", icon: PenLine, colour: "#1098ad", go: () => worldLife.openLeaveMark() },
                ...(worldLife.hasHome ? [{ label: "Coming soon", icon: Rocket, colour: "#7048e8", go: worldLife.openSoon }] : []),
              ],
            },
            {
              title: "Help and settings",
              items: [
                { label: "How it works", icon: Lightbulb, colour: "#fab005", go: () => setHowOpen(true) },
                { label: "Start the guide", icon: Lightbulb, colour: "#f08c00", go: () => worldLife.restartGuide() },
                { label: "Notifications", icon: BellRing, colour: "#f08c00", go: () => setAlertsOpen(true) },
                { label: sound ? "Sound off" : "Sound on", icon: sound ? VolumeX : Volume2, colour: "#495057", go: () => { setSound(!sound); saveView({ sound: !sound }); } },
                { label: "Report", icon: Flag, colour: "#868e96", go: () => worldLife.openReport() },
                { label: "Sign out", icon: LogOut, colour: "#495057", go: () => setConfirmSignOut(true) },
              ],
            },
          ]}
        />
      )}
      {/* Chat on the real map: everyone in the place you're in, and private messages (not per round). */}
      {worldId && !guest && (
        <Safe name="Chat">
          <Chat
            meId={me.id}
            meRole={null}
            roundId={0}
            keep
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
            finder={peopleFinder("chat")}
            externalNpc={npcTap}
            enteredAt={rooms.enteredAt}
            greet={greet}
            friendStatusOf={friendStatusOf}
            onAddFriend={befriend}
            hideButton
            onUnread={setChatUnread}
            onSignIn={() => setSignIn({ why: null })}
            onPerson={setPersonId}
            newtown={{
              lines: newtownLines,
              unread,
              request: newtownAsk,
              onSeen: readAllNotices,
              onSettings: () => setAlertsOpen(true),
            }}
            news={{ latest: null, onOpen: () => worldLife.openNews() }}
            onlineNow={onlineFaces}
            onCamera={() => {
              setChatOpen(false);
              setCamera("photo");
            }}
            onSelfie={(target, to) => {
              setSelfieTo({ target, to });
              setChatOpen(false);
              setCamera("selfie");
            }}
          />
        </Safe>
      )}
      {personId && (
        <PersonCard
          key={personId}
          id={personId}
          onClose={() => setPersonId(null)}
          onFly={(x, z) => {
            setPersonId(null);
            leaveThen.current("go to them", () => worldLife.fly(x, z));
          }}
          onAddFriend={me.guest ? undefined : (p) => void befriend(p)}
          greet={(p) => greet(p, false)}
          onDone={(text, ok) => setMessage({ text, tone: ok ? "good" : "bad" })}
          self={personId === me.id}
          onMessage={me.guest ? undefined : (p) => {
            setPersonId(null);
            chatWith(p);
          }}
          prices={worldRegion?.prices ?? null}
          onGive={me.guest ? undefined : (p) => {
            setPersonId(null);
            setGiveTo(p);
          }}
          onOpenDating={() => {
            setPersonId(null);
            setSocialOpen("dating");
          }}
        />
      )}
      {socialOpen === "dating" && (
        <DatingSheet
          onClose={() => setSocialOpen(null)}
          onPerson={(id) => {
            setSocialOpen(null);
            setPersonId(id);
          }}
          onDone={(text, ok) => setMessage({ text, tone: ok ? "good" : "bad" })}
        />
      )}
      {socialOpen === "rivals" && (
        <RivalsSheet
          onClose={() => setSocialOpen(null)}
          onPerson={(id) => {
            setSocialOpen(null);
            setPersonId(id);
          }}
        />
      )}
      {doorstepOpen && (
        <DoorstepSheet
          onClose={() => setDoorstepOpen(false)}
          onPerson={(id) => {
            setDoorstepOpen(false);
            setPersonId(id);
          }}
          onDone={(text, ok) => setMessage({ text, tone: ok ? "good" : "bad" })}
        />
      )}
      <GiftSent />
      {giftPops[0] && !prankShow.prank && (
        <GiftPop key={giftPops[0].key} gift={giftPops[0]} more={giftPops.length - 1} onDone={nextGift} onDoor={() => setDoorstepOpen(true)} onGifts={() => openGifts()} />
      )}
      {prankShow.prank && (
        <PrankReveal
          key={prankShow.prank.id}
          prank={prankShow.prank}
          onDone={() => prankShow.prank && prankShow.done(prankShow.prank.id)}
          onPerson={setPersonId}
          onMessage={(text, ok) => setMessage({ text, tone: ok ? "good" : "bad" })}
        />
      )}
      {away.digest && !doorstepOpen && !prankShow.prank && (
        <AwaySheet
          digest={away.digest}
          onDoorstep={() => {
            away.close();
            setDoorstepOpen(true);
          }}
          onClose={away.close}
        />
      )}
      {/* The people you dealt with lately, down the left side (folds away). */}
      {worldId && !guest && !camera && (
        <div className="pointer-events-none fixed left-0 top-1/2 z-10 -translate-y-1/2">
          <RecentRail onPerson={setPersonId} onMessage={chatWith} />
        </div>
      )}
      {/* In a planned home: the joystick walks you round it (or tap the floor). */}
      {inPlannedHome && !camera && (
        <div className="pointer-events-none fixed bottom-24 left-4 z-30 sm:bottom-8 sm:left-8">
          <Joystick stick={homeStick} />
        </div>
      )}
      {/* On foot: the joystick, bottom left (drag anywhere else to look round). */}
      {walking && !place && ride === null && (
        <div className="pointer-events-none fixed bottom-6 left-4 z-30 sm:bottom-8 sm:left-8">
          <Joystick stick={walkStick} />
        </div>
      )}
      {statsOpen && <StatsSheet online={onlineNow} onClose={() => setStatsOpen(false)} people={peopleFinder("stats")} />}
      {cityOpen && worldRegion && (
        <CityCard city={worldRegion.name} area={worldArea} onClose={() => setCityOpen(false)} search={worldLife.search} />
      )}
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
              ? `${cash(kind.reward.coins)} for the first ${kind.reward.slots === 1 ? "person" : `${kind.reward.slots} people`} to tap it. ${slots} left.`
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
            Grab {cash(kind.reward!.coins)}
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

/** Which sport a venue's floor shows (its match to watch). */
const THEME_SPORT_GAME: Record<string, Sport> = { stands: "football", court: "basketball", boxing: "boxing", wrestling: "wrestling" };

/** A quiet moment of prayer: the screen dims and settles for a few seconds. */
function PrayerMoment({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="pointer-events-none fixed inset-0 z-[65] grid place-items-center bg-black/55 text-center text-white" style={{ animation: "toast-in .6s ease-out" }}>
      <div>
        <p className="font-display text-2xl font-bold">A quiet moment</p>
        <p className="mt-1 text-sm text-white/80">You bow your head and pray. You feel calmer.</p>
      </div>
    </div>
  );
}

/** A button in the bar along the bottom of the map: an icon over a short label. */
function DockButton({ icon: Icon, label, onClick, tint, dark }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; tint?: string; dark?: boolean }) {
  return (
    <button onClick={onClick} className={cn("flex h-12 min-w-11 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-2xl px-2 text-[10px] font-semibold leading-none shadow sm:min-w-14 sm:text-[11px]", dark ? "bg-ink text-white" : "glass")} aria-pressed={dark}>
      <Icon className={cn("size-4", !dark && tint)} />
      {label}
    </button>
  );
}
