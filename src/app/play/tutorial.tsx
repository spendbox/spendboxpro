"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { X } from "@/components/icons";
import { CircleHelp } from "lucide-react";
import { MISSION_NAIRA, MISSIONS, MISSIONS_TOTAL, nextMission, type Mission, type MissionState, type Phase } from "@/lib/world/tutorial";
import { cash } from "@/lib/world/value";
import { playSfx } from "./sound";

// The walkthrough (docs/FIRST_STEPS.md): a small card over the map (always in front, chat
// included) that takes everyone, old players too, through a few fun tips, three missions with
// rewards (name your home, say hi, go to an event; paid by the server, game-db/080 and 095), and a tour of
// the rest (photos, exploring, getting home, property, your profile). The button it talks about
// glows. Kept in this browser; "Start the guide" in your profile starts it again.

/** Bump to show a new walkthrough to everyone again. */
const KEY = "newtown.tutorial.v1";

/** What the walkthrough points at: that button glows. */
export type TutorialGlow = "home" | "chat" | "events" | "camera" | "profile" | "wallet" | "dock" | "leave" | "townhall" | null;

/** `closed`: shut with the ✕ before the end: a small help icon brings it back where it was. */
type Saved = { phase: Phase; i: number; skipped: Mission[]; closed?: boolean };
const FRESH: Saved = { phase: "intro", i: 0, skipped: [] };

function read(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (s && ["intro", "missions", "tips", "done"].includes(s.phase)) return { phase: s.phase, i: Math.max(0, Number(s.i) || 0), skipped: Array.isArray(s.skipped) ? s.skipped : [], closed: s.closed === true && s.phase !== "done" };
  } catch {
    // Not readable: start from the top.
  }
  return FRESH;
}

let saved: Saved | null = null;
let glow: TutorialGlow = null;
/** The mission on screen now (null: none, or not known yet). */
let missionNow: Mission | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));

function save(next: Saved) {
  saved = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not kept: it carries on from here this visit.
  }
  emit();
}
const current = () => (saved ??= typeof window === "undefined" ? FRESH : read());

/** Where the walkthrough is (for the rest of the game: e.g. no daily-gift pop-up during the intro). */
export function useTutorialPhase(): Phase {
  // Closed halfway counts as done for the rest of the game (no waiting on it).
  return useSyncExternalStore(subscribe, () => (current().closed ? "done" : current().phase), () => "done" as Phase);
}

/** Which button the walkthrough is pointing at right now. */
export function useTutorialGlow(): TutorialGlow {
  return useSyncExternalStore(subscribe, () => glow, () => null);
}
function setGlow(g: TutorialGlow) {
  if (g === glow) return;
  glow = g;
  emit();
}

/**
 * The buttons on the map, each shown only once the walkthrough has introduced it (so a new player
 * isn't faced with all of them at once). Before the walkthrough starts (no home yet) and during
 * its opening cards, none of them; when it's done or closed, all of them.
 */
export type TourButton = "home" | "dock" | "extras" | "camera" | "chat" | "townhall" | "events" | "reputation" | "wallet" | "profile" | "people" | "online" | "sound";
/** The tips (by number, see `tips` below) that introduce each button. */
const TIP_SHOWS: [number, TourButton[]][] = [
  [1, ["townhall"]],
  // The rest of the quick buttons (Coming soon, Locate me, Walk, the notifications bell).
  [2, ["extras", "camera"]],
  [4, ["people", "online"]],
  [6, ["wallet"]],
  [8, ["profile", "sound"]],
];
const MISSION_SHOWS: Record<Mission, TourButton[]> = { name: ["home", "dock"], hi: ["chat"], win: ["events", "reputation"] };
function shownNow(): string {
  const s = current();
  if (s.phase === "done" || s.closed) return "all";
  if (s.phase === "intro") return "";
  const out = new Set<TourButton>();
  // On the missions: every mission up to the one on screen; on the tips, all of them.
  const upTo = s.phase === "missions" ? MISSIONS.indexOf(missionNow ?? "name") : MISSIONS.length - 1;
  MISSIONS.forEach((m, k) => k <= upTo && MISSION_SHOWS[m].forEach((b) => out.add(b)));
  if (s.phase === "tips") for (const [i, list] of TIP_SHOWS) if (s.i >= i) list.forEach((b) => out.add(b));
  return [...out].sort().join(",");
}
/**
 * Whether a button is shown yet: everything for players who've been through the walkthrough (or
 * closed it); for a new one, only what it has introduced so far. `ready`: the walkthrough is on
 * screen (you have a home); before that, nothing is shown.
 */
export function useTourShows(ready: boolean): (b: TourButton) => boolean {
  const list = useSyncExternalStore(subscribe, shownNow, () => "all");
  if (list === "all") return () => true;
  if (!ready) return () => false;
  const set = new Set(list.split(","));
  return (b) => set.has(b);
}

/** "Start the guide": from the very beginning (missions already paid stay paid). */
export function restartTutorial() {
  save({ ...FRESH });
}

type Card = { emoji: string; title: string; text: React.ReactNode; glow?: TutorialGlow; action?: { label: string; run: () => void } };

export type TutorialActions = {
  /** Open your home card, ready to name it. */
  nameHome: () => void;
  /** Open chat on "New chat". */
  chat: () => void;
  /** Open Events (what's on, and hosting). */
  events: () => void;
  camera: () => void;
  profile: () => void;
  wallet: () => void;
  /** A mission's reward was paid (refresh the cash on screen). */
  paid: () => void;
  /** Step out of the building (or off the ride) you're in. */
  leave: () => void;
  /** Open your look (the avatar editor). */
  look: () => void;
  /** Open the Town Hall (the state's chat). */
  townHall: () => void;
};

/** Where the card's been dragged to (kept while the game's open, so it stays out of your way). */
let dragged = { x: 0, y: 0 };

export function Tutorial({
  place,
  perMint,
  name,
  inside = null,
  actions,
}: {
  place: string;
  perMint: number;
  /** Your name. */
  name?: string;
  /** Where you are: inside a building ("place", its name), on a ride, or out on the map (null). */
  inside?: { kind: "place" | "ride"; name: string } | null;
  actions: TutorialActions;
}) {
  const first = (name ?? "").trim().split(/\s+/)[0];
  const palace = first ? `${first}'s Palace` : "The Palace";
  const s = useSyncExternalStore(subscribe, current, () => FRESH);
  const naira = (n: number) => cash(n / perMint);
  // The missions: what the server says is done (null: not asked yet; "off": rewards not switched on).
  const [done, setDone] = useState<MissionState | "off" | null>(null);
  const [cheer, setCheer] = useState<string | null>(null);
  const asking = useRef(false);
  const [pos, setPos] = useState(dragged);
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const from = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const move = (ev: PointerEvent) => {
      // Kept on the screen: at least part of the card stays in reach.
      const x = Math.max(-window.innerWidth / 2 + 60, Math.min(window.innerWidth / 2 - 60, ev.clientX - from.x));
      const y = Math.max(-100, Math.min(window.innerHeight - 220, ev.clientY - from.y));
      dragged = { x, y };
      setPos(dragged);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  useEffect(() => {
    if (s.phase !== "missions" || s.closed) return;
    let alive = true;
    const look = () => {
      if (asking.current || document.visibilityState !== "visible") return;
      asking.current = true;
      void fetch("/api/tutorial", { method: "POST", cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<MissionState | { off: true } | null>) : null))
        .then((d) => {
          if (!alive || !d) return;
          if ("off" in d) {
            // Rewards aren't switched on: no point asking again.
            setDone("off");
            clearInterval(t);
            return;
          }
          setDone(d);
          if (d.paid.length) {
            const got = d.paid.reduce((t, m) => t + MISSION_NAIRA[m], 0);
            setCheer(`Mission done! +${naira(got)}`);
            playSfx("chime");
            actions.paid();
          }
        })
        .catch(() => {})
        .finally(() => {
          asking.current = false;
        });
    };
    // Every 15 seconds while a mission's on (and straight away).
    const t = setInterval(look, 15_000);
    look();
    return () => {
      alive = false;
      clearInterval(t);
    };
    // naira only formats the cheer; actions.paid only refreshes the cash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.closed]);
  useEffect(() => {
    if (!cheer) return;
    const t = setTimeout(() => setCheer(null), 3_500);
    return () => clearTimeout(t);
  }, [cheer]);

  const intro: Card[] = [
    { emoji: "👋", title: `Welcome to ${place}!`, text: "A real city, real streets, real people. Grab a seat, this takes a minute." },
    {
      emoji: "✋",
      title: "Psst: you can move me",
      text: "This card is in the way? Hold it anywhere (not on a button) and drag it wherever you like. It stays where you leave it, so you can always see what it's talking about.",
    },
    { emoji: "🏖️", title: "No work. No bills. No brushing your teeth.", text: "Seriously. In Newtown you skip the boring bits and keep the fun ones." },
    { emoji: "🎲", title: "Your cash is for fun", text: "Play games, meet new people, visit real places and send gifts. That's the whole job description." },
    {
      emoji: "🎯",
      title: "Three quick missions",
      text: (
        <>
          Do them and pocket <b className="text-gold">{naira(MISSIONS_TOTAL)}</b>. Ready?
        </>
      ),
    },
  ];
  const missionCards: Record<Mission, Card> = {
    name: {
      emoji: "🏠",
      title: "Mission 1 of 3 · Name your home",
      text: `Every legend needs a base. Tap the glowing house (in the quick buttons, bottom left), then the pencil, and give your place a name. “${palace}”? Bold. We like it.`,
      glow: "home",
      action: { label: "Show me", run: actions.nameHome },
    },
    hi: {
      emoji: "💬",
      title: "Mission 2 of 3 · Say hi to someone",
      text: "Tap the glowing chat bubble (bottom right), then New chat (it glows too). Tap anyone with a green dot, they're online now, and send a hi. Worst case, you make a friend.",
      glow: "chat",
      action: { label: "Show me", run: actions.chat },
    },
    win: {
      emoji: "🎉",
      title: "Mission 3 of 3 · Go to an event",
      text: "Tap the party button (top right, it glows). What's on shows the parties and talks happening now: tap one and Go in. Nothing on? Host your own in Host an event: a party on your street or a free talk. The moment you're in, the reward is yours. Dance like nobody's watching. (Everybody's watching.)",
      glow: "events",
      action: { label: "Show me", run: actions.events },
    },
  };
  const tips: Card[] = [
    { emoji: "🎉", title: "Missions complete!", text: "You're officially a Newtowner. A few quick tips and you're free to roam." },
    {
      emoji: "🏛️",
      title: "The Town Hall",
      text: `One big chat for everyone online in ${place}. Ask for directions, brag about your new crib, find people to play with. Tap the orange button just above your chat bubble (bottom right). Send emojis and photos, tap a message to reply, react or delete it, and tap a name to see who it is. Everything said there is gone after 24 hours.`,
      glow: "townhall",
      action: { label: "Open it", run: actions.townHall },
    },
    {
      emoji: "🧰",
      title: "Your quick buttons",
      text: "The round button at the bottom left opens your quick buttons: Home, Camera, Coming soon, Locate me and Walk. Tap anywhere else and they tuck themselves away. Neat, right?",
      glow: "dock",
    },
    {
      emoji: "📸",
      title: "Snap anything you like",
      text: "Love a place or a thing? Tap the camera in your quick buttons (or the orange one inside places). Your pictures live in your Photos.",
      glow: "camera",
      action: { label: "Try it", run: actions.camera },
    },
    { emoji: "🧭", title: "Go explore", text: "Tap any building to peek inside, hop on a danfo, find the hidden spots. Nobody's watching the clock." },
    { emoji: "🏠", title: "Lost? Tap the house", text: "The house in your quick buttons (bottom left) always takes you home. Like a very fast okada.", glow: "home" },
    {
      emoji: "👛",
      title: "Your Wallet",
      text: "Tap your cash (top right) for your Wallet: today's daily gift, your payments, top-ups (pay by bank transfer right in the game) and the World Bank. 🏦",
      glow: "wallet",
      action: { label: "Open it", run: actions.wallet },
    },
    {
      emoji: "💰",
      title: "Money comes to you",
      text: "Rewards for showing up: you're paid for every minute you're online, plus a daily gift, missions, and ticket sales from events you host. Property earns you money every day too, by itself. Watch your cash tick up! See it all in Things › Assets.",
    },
    {
      emoji: "👤",
      title: "Your profile",
      text: "Tap your face (top left) for Things, Assets, Wallet, Photos, Friends and settings. Missed something? “Start the guide” in there plays all this again.",
      glow: "profile",
      action: { label: "Open it", run: actions.profile },
    },
    {
      emoji: "💅",
      title: "Make it you",
      text: "Everyone on the map sees your face, so make it yours: skin, hair, eyes, outfit, accessories, or use a photo of yourself. Tap your face (top left), then My look or Profile photo. Change it as often as you like, it's free.",
      glow: "profile",
      action: { label: "Change my look", run: actions.look },
    },
    { emoji: "🚀", title: "That's it. Go have fun!", text: "The city's yours. Say hi, win big, buy the block. See you around!" },
  ];

  const server = done && done !== "off" ? done : null;
  const mission = s.phase === "missions" ? nextMission(server ?? {}, s.skipped) : null;
  // Every mission done (or skipped): on to the tips.
  useEffect(() => {
    if (s.phase === "missions" && !mission && !cheer && (done !== null || s.skipped.length > 0)) save({ ...s, phase: "tips", i: 0 });
  }, [s, done, mission, cheer]);

  const planned: Card | null = s.closed
    ? null
    : s.phase === "intro" ? intro[Math.min(s.i, intro.length - 1)] : s.phase === "missions" ? (mission ? missionCards[mission] : null) : s.phase === "tips" ? tips[Math.min(s.i, tips.length - 1)] : null;
  // The house (and the quick buttons) are out on the map: inside a building or on a ride, first
  // step out, with the Leave button glowing (the card comes back to the house once you're out).
  const card: Card | null =
    planned && inside && (planned.glow === "home" || planned.glow === "dock")
      ? {
          emoji: "🚪",
          title: planned.title || "First, step outside",
          text:
            inside.kind === "ride"
              ? `You're on ${inside.name} right now, and this button is out on the map. Tap the dark “Get off” button at the bottom of the screen (it's glowing), and we'll carry on from there.`
              : `You're inside ${inside.name} right now, and this button is out on the map. To step out, tap the dark “Leave” button at the bottom of the screen (it's glowing), or tap “Take me out” here. Then we'll carry on.`,
          glow: "leave",
          action: { label: "Take me out", run: actions.leave },
        }
      : planned;
  // The buttons shown so far follow the mission on screen (see useTourShows).
  useEffect(() => {
    if (missionNow === mission) return;
    missionNow = mission;
    emit();
  }, [mission]);
  useEffect(() => {
    setGlow(card?.glow ?? null);
  }, [card?.glow]);
  useEffect(() => () => setGlow(null), []);
  // Shut halfway with the ✕: just a small help icon, to carry on from where it was.
  if (s.closed) {
    return (
      <button
        onClick={() => save({ ...s, closed: false })}
        className="pointer-events-auto fixed right-3 top-[7.6rem] z-[90] grid size-9 place-items-center rounded-full bg-gold text-ink shadow-lg ring-2 ring-white sm:right-4 sm:top-[7.25rem]"
        aria-label="Continue the guide"
        title="Continue the guide"
      >
        <CircleHelp className="size-5" />
      </button>
    );
  }
  // The last mission's cheer shows even though there's no mission card after it.
  if (!card && !cheer) return null;
  const shown: Card = card ?? { emoji: "🎉", title: "", text: "" };

  const next = () => {
    if (s.phase === "intro") return save(s.i + 1 < intro.length ? { ...s, i: s.i + 1 } : { ...s, phase: "missions", i: 0 });
    if (s.phase === "tips") return save(s.i + 1 < tips.length ? { ...s, i: s.i + 1 } : { ...s, phase: "done", i: 0 });
  };
  const skipMission = () => mission && save({ ...s, skipped: [...s.skipped, mission] });
  // Back: the card before (from the missions, the last opening tip; a skipped mission comes back).
  const back =
    s.phase === "intro" && s.i > 0
      ? () => save({ ...s, i: s.i - 1 })
      : s.phase === "missions"
        ? () => (s.skipped.length ? save({ ...s, skipped: s.skipped.slice(0, -1) }) : save({ ...s, phase: "intro", i: intro.length - 1 }))
        : s.phase === "tips" && s.i > 0
          ? () => save({ ...s, i: s.i - 1 })
          : null;
  const count = s.phase === "intro" ? intro.length : s.phase === "tips" ? tips.length : 0;
  const last = (s.phase === "intro" || s.phase === "tips") && s.i >= count - 1;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-28 z-[90] flex justify-center px-3 sm:top-24" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
      <div
        key={`${s.phase}-${s.i}-${mission ?? ""}`}
        role="dialog"
        aria-label="Walkthrough"
        // Drag it anywhere (by any part that isn't a button) to see what's under it.
        onPointerDown={startDrag}
        className="pointer-events-auto w-full max-w-sm touch-none select-none rounded-2xl bg-ink p-3.5 text-white shadow-2xl ring-2 ring-gold/40 motion-safe:animate-[tipIn_.25s_ease-out]"
      >
        {/* The handle: it can be dragged anywhere. */}
        <span aria-hidden className="mx-auto -mt-1.5 mb-2 flex w-fit items-center gap-1.5 text-[10px] font-semibold text-white/40">
          <span className="block h-1 w-8 rounded-full bg-white/25" />
          drag to move
        </span>
        {cheer ? (
          <p className="py-3 text-center font-display text-lg font-extrabold text-gold">🎉 {cheer}</p>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="text-3xl leading-none">{shown.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] font-extrabold leading-snug text-gold">{shown.title}</p>
                {mission && (
                  <span className="mt-0.5 inline-block rounded-full bg-[#2b8a3e] px-2 py-px text-[11px] font-bold text-white">
                    {done === "off" ? "Rewards switch on soon" : `+${naira(MISSION_NAIRA[mission])}`}
                  </span>
                )}
                <p className="mt-1 text-sm leading-snug text-white/85">{shown.text}</p>
              </div>
              <button
                onClick={() => save({ ...s, closed: true })}
                aria-label="Close the walkthrough"
                title="Close the walkthrough (the ? button brings it back)"
                className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-full text-white/60 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              {count > 0 ? (
                <div className="flex gap-1">
                  {Array.from({ length: count }, (_, n) => (
                    <span key={n} className={`h-1.5 rounded-full transition-all ${n === s.i ? "w-4 bg-gold" : "w-1.5 bg-white/30"}`} />
                  ))}
                </div>
              ) : (
                <button onClick={skipMission} className="text-[11px] font-semibold text-white/60 hover:text-white">
                  Skip this one
                </button>
              )}
              <div className="flex gap-1.5">
                {back && (
                  <button onClick={back} className="h-8 rounded-full px-2 text-sm font-semibold text-white/70 hover:text-white" aria-label="Back">
                    ‹ Back
                  </button>
                )}
                {shown.action && (
                  <button onClick={shown.action.run} className="h-8 rounded-full bg-white/15 px-3 text-sm font-semibold">
                    {shown.action.label}
                  </button>
                )}
                {mission ? (
                  done === "off" && (
                    <button onClick={skipMission} className="h-8 rounded-full bg-gold px-4 text-sm font-bold text-ink">
                      Done it ✓
                    </button>
                  )
                ) : (
                  <button onClick={next} className="h-8 rounded-full bg-gold px-4 text-sm font-bold text-ink">
                    {last ? "Let's go!" : "Next"}
                  </button>
                )}
              </div>
            </div>
            {mission && done !== "off" && <p className="mt-2 text-[11px] text-white/50">Ticks itself off when you&apos;ve done it.</p>}
          </>
        )}
      </div>
      <style>{`@keyframes tipIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  );
}
