"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { X } from "@/components/icons";
import { MISSION_NAIRA, MISSIONS_TOTAL, nextMission, type Mission, type MissionState, type Phase } from "@/lib/world/tutorial";
import { cash } from "@/lib/world/value";
import { playSfx } from "./sound";

// The walkthrough (docs/FIRST_STEPS.md): a small card over the map (always in front, chat
// included) that takes everyone, old players too, through a few fun tips, three missions with
// rewards (name your home, say hi, win a challenge; paid by the server, game-db/080), and a tour of
// the rest (photos, exploring, getting home, property, your profile). The button it talks about
// glows. Kept in this browser; "Start the guide" in your profile starts it again.

/** Bump to show a new walkthrough to everyone again. */
const KEY = "newtown.tutorial.v1";

/** What the walkthrough points at: that button glows. */
export type TutorialGlow = "home" | "chat" | "challenge" | "camera" | "profile" | null;

type Saved = { phase: Phase; i: number; skipped: Mission[] };
const FRESH: Saved = { phase: "intro", i: 0, skipped: [] };

function read(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (s && ["intro", "missions", "tips", "done"].includes(s.phase)) return { phase: s.phase, i: Math.max(0, Number(s.i) || 0), skipped: Array.isArray(s.skipped) ? s.skipped : [] };
  } catch {
    // Not readable: start from the top.
  }
  return FRESH;
}

let saved: Saved | null = null;
let glow: TutorialGlow = null;
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
  return useSyncExternalStore(subscribe, () => current().phase, () => "done" as Phase);
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
  /** Open the challenge card. */
  challenge: () => void;
  camera: () => void;
  profile: () => void;
  /** A mission's reward was paid (refresh the cash on screen). */
  paid: () => void;
};

export function Tutorial({ place, perMint, actions }: { place: string; perMint: number; actions: TutorialActions }) {
  const s = useSyncExternalStore(subscribe, current, () => FRESH);
  const naira = (n: number) => cash(n / perMint);
  // The missions: what the server says is done (null: not asked yet; "off": rewards not switched on).
  const [done, setDone] = useState<MissionState | "off" | null>(null);
  const [cheer, setCheer] = useState<string | null>(null);
  const asking = useRef(false);

  useEffect(() => {
    if (s.phase !== "missions") return;
    let alive = true;
    const look = () => {
      if (asking.current || document.visibilityState !== "visible") return;
      asking.current = true;
      void fetch("/api/tutorial", { method: "POST", cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<MissionState | { off: true } | null>) : null))
        .then((d) => {
          if (!alive || !d) return;
          if ("off" in d) return setDone("off");
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
    look();
    const t = setInterval(look, 5_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // naira only formats the cheer; actions.paid only refreshes the cash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase]);
  useEffect(() => {
    if (!cheer) return;
    const t = setTimeout(() => setCheer(null), 3_500);
    return () => clearTimeout(t);
  }, [cheer]);

  const intro: Card[] = [
    { emoji: "👋", title: `Welcome to ${place}!`, text: "A real city, real streets, real people. Grab a seat, this takes a minute." },
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
      text: "Every legend needs a base. Tap the glowing house (bottom left), then the pencil, and give your place a name. “Tolu's Palace”? Bold. We like it.",
      glow: "home",
      action: { label: "Show me", run: actions.nameHome },
    },
    hi: {
      emoji: "💬",
      title: "Mission 2 of 3 · Say hi to someone",
      text: "Tap the purple chat bubble (bottom right), then New chat. Pick anyone online and send a hi. Worst case, you make a friend.",
      glow: "chat",
      action: { label: "Show me", run: actions.chat },
    },
    win: {
      emoji: "🏆",
      title: "Mission 3 of 3 · Create and win a challenge",
      text: "Tap the trophy (top right), pick Whot! or Ludo, set your stake and challenge everyone nearby. Win it and the prize is yours, plus +3 reputation. No pressure. (Some pressure.)",
      glow: "challenge",
      action: { label: "Show me", run: actions.challenge },
    },
  };
  const tips: Card[] = [
    { emoji: "🎉", title: "Missions complete!", text: "You're officially a Newtowner. A few quick tips and you're free to roam." },
    {
      emoji: "📸",
      title: "Snap anything you like",
      text: "Love a place or a thing? Tap the camera (bottom left, or the orange one inside places). Your pictures live in your Photos.",
      glow: "camera",
      action: { label: "Try it", run: actions.camera },
    },
    { emoji: "🧭", title: "Go explore", text: "Tap any building to peek inside, hop on a danfo, find the hidden spots. Nobody's watching the clock." },
    { emoji: "🏠", title: "Lost? Tap the house", text: "The house button at the bottom left always takes you home. Like a very fast okada.", glow: "home" },
    {
      emoji: "💰",
      title: "Property pays you",
      text: "Buy a home, shop or office and it earns you money every day, by itself. Watch your cash tick up! The higher your reputation, the more you get off property.",
    },
    {
      emoji: "👤",
      title: "Your profile",
      text: "Tap your face (top left) for Things, Assets, Money, Photos, Friends and settings. Missed something? “Start the guide” in there plays all this again.",
      glow: "profile",
      action: { label: "Open it", run: actions.profile },
    },
    { emoji: "🚀", title: "That's it. Go have fun!", text: "The city's yours. Say hi, win big, buy the block. See you around!" },
  ];

  const server = done && done !== "off" ? done : null;
  const mission = s.phase === "missions" ? nextMission(server ?? {}, s.skipped) : null;
  // Every mission done (or skipped): on to the tips.
  useEffect(() => {
    if (s.phase === "missions" && !mission && !cheer && (done !== null || s.skipped.length > 0)) save({ ...s, phase: "tips", i: 0 });
  }, [s, done, mission, cheer]);

  const card: Card | null =
    s.phase === "intro" ? intro[Math.min(s.i, intro.length - 1)] : s.phase === "missions" ? (mission ? missionCards[mission] : null) : s.phase === "tips" ? tips[Math.min(s.i, tips.length - 1)] : null;
  useEffect(() => {
    setGlow(card?.glow ?? null);
  }, [card?.glow]);
  useEffect(() => () => setGlow(null), []);
  if (!card) return null;

  const next = () => {
    if (s.phase === "intro") return save(s.i + 1 < intro.length ? { ...s, i: s.i + 1 } : { ...s, phase: "missions", i: 0 });
    if (s.phase === "tips") return save(s.i + 1 < tips.length ? { ...s, i: s.i + 1 } : { ...s, phase: "done", i: 0 });
  };
  const skipMission = () => mission && save({ ...s, skipped: [...s.skipped, mission] });
  const count = s.phase === "intro" ? intro.length : s.phase === "tips" ? tips.length : 0;
  const last = (s.phase === "intro" || s.phase === "tips") && s.i >= count - 1;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-28 z-[90] flex justify-center px-3 sm:top-24">
      <div
        key={`${s.phase}-${s.i}-${mission ?? ""}`}
        role="dialog"
        aria-label="Walkthrough"
        className="pointer-events-auto w-full max-w-sm rounded-2xl bg-ink p-3.5 text-white shadow-2xl ring-2 ring-gold/40 motion-safe:animate-[tipIn_.25s_ease-out]"
      >
        {cheer ? (
          <p className="py-3 text-center font-display text-lg font-extrabold text-gold">🎉 {cheer}</p>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="text-3xl leading-none">{card.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] font-extrabold leading-snug text-gold">{card.title}</p>
                {mission && (
                  <span className="mt-0.5 inline-block rounded-full bg-[#2b8a3e] px-2 py-px text-[11px] font-bold text-white">
                    {done === "off" ? "Rewards switch on soon" : `+${naira(MISSION_NAIRA[mission])}`}
                  </span>
                )}
                <p className="mt-1 text-sm leading-snug text-white/85">{card.text}</p>
              </div>
              <button
                onClick={() => save({ ...s, phase: "done", i: 0 })}
                aria-label="Close the walkthrough"
                title="Close the walkthrough (Start the guide in your profile brings it back)"
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
                {card.action && (
                  <button onClick={card.action.run} className="h-8 rounded-full bg-white/15 px-3 text-sm font-semibold">
                    {card.action.label}
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
