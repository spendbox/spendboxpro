"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { MOMENT_BY_ID, MOMENT_RULES, registerMoments, spotOfTheme } from "@/lib/world/moments";
import { momentNext, type MomentShown } from "../moment-actions";
import { anySheetOpen } from "../sheet";
import { playSfx } from "../sound";
import { MomentCard } from "./moment-card";

// Moments (docs/MOMENTS.md): now and then in play, if nothing else is open, a little story
// slides up over the map: someone asks for money, a wallet lies on the ground, the waiter spills
// a drink on you. Pick what you do and see what comes of it. Going into a place makes one a bit
// more likely soon after (one that fits there). Closed before answering, it waits in a tab on the
// right edge until it would have passed.

/**
 * The first one a couple of minutes in, then every 12 to 18 minutes while you're playing: 3 or 4
 * an hour (the server keeps them at least 10 minutes apart and to 40 a day). Nothing came (too
 * soon after a trip's, say)? Try again in a few minutes rather than waiting a whole turn.
 */
const FIRST_MS: [number, number] = [90_000, 150_000];
const NEXT_MS: [number, number] = [720_000, 1_080_000];
const RETRY_MS: [number, number] = [150_000, 240_000];
const AFTER_ENTERING_MS: [number, number] = [30_000, 70_000];
const between = ([a, b]: [number, number]) => a + Math.random() * (b - a);
const clock = () => Date.now();

/** Something else is up: the phone's in a pocket, a card or a full-screen tool is open. */
const busy = () => document.hidden || anySheetOpen() || !!document.querySelector('[role="dialog"], [role="alertdialog"]');

/** Only while you're really playing: you touched the screen (or a key) in the last two minutes. */
const ACTIVE_MS = 120_000;
let lastTouch = 0;
if (typeof window !== "undefined") {
  lastTouch = Date.now();
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(ev, () => (lastTouch = Date.now()), { passive: true, capture: true });
}
const playing = () => !document.hidden && Date.now() - lastTouch < ACTIVE_MS;
/** A card nobody answered goes before the server lets it go (so you never tap one that's passed). */
const SHOW_MS = (MOMENT_RULES.answerSeconds - 120) * 1000;

/**
 * inside: the theme of the place you're in (null on the street), home: it's a home. place: its
 * name (or the area's), for the stories.
 */
export function MomentsLayer({ inside, home, place, area, enabled }: { inside: string | null; home: boolean; place: string; area?: string; enabled: boolean }) {
  const spot = inside == null && !home ? "street" : spotOfTheme(inside, home);
  const [shown, setShown] = useState<MomentShown | null>(null);
  // Closed by mistake (the cross, or leaving the game) before answering: tucked into a tab on the
  // right edge to call back and answer, until it would have passed anyway (at: when it first came).
  const [tucked, setTucked] = useState<MomentShown | null>(null);
  const firstAt = useRef(0);
  const answered = useRef(false);
  const live = useRef({ spot, place, area: area ?? "", enabled, open: false });
  useEffect(() => {
    live.current = { ...live.current, spot, place, area: area ?? "", enabled };
  }, [spot, place, area, enabled]);
  useEffect(() => {
    live.current.open = !!shown || !!tucked;
  }, [shown, tucked]);

  // The clock: try now and then; if it's not a good moment, try again a little later.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedule = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void attempt(), ms);
  };
  const attempt = async () => {
    const l = live.current;
    if (!l.enabled || l.open) return schedule(between(NEXT_MS));
    if (busy() || !playing()) return schedule(30_000);
    const m = await momentNext({ spot: l.spot, place: l.place, area: l.area }).catch(() => null);
    // A player-written one comes with its story (docs/LIFE_WHEEL.md, phase 7).
    if (m?.def) registerMoments([m.def]);
    if (!m || !MOMENT_BY_ID.has(m.moment) || busy() || !playing() || live.current.open) return schedule(between(RETRY_MS));
    firstAt.current = clock();
    answered.current = false;
    setTucked(null);
    setShown(m);
    playSfx("pop");
    schedule(between(NEXT_MS));
  };
  useEffect(() => {
    if (!enabled) return;
    schedule(between(FIRST_MS));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Started once when moments are on; the clock reads the rest from `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  // Going into somewhere new: one that fits there, a little sooner.
  const lastSpot = useRef(spot);
  useEffect(() => {
    if (!enabled || spot === lastSpot.current) return;
    lastSpot.current = spot;
    if (spot !== "street") schedule(between(AFTER_ENTERING_MS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot, enabled]);

  // Away from the game (the phone locked, another app): tucked away for when you're back. Left
  // too long (shown or tucked): it goes, and nothing happens for it, just as with Walk away.
  const current = shown ?? tucked;
  useEffect(() => {
    if (!current) return;
    const hide = () => {
      if (document.hidden && shown && !answered.current) {
        setTucked(shown);
        setShown(null);
      }
    };
    document.addEventListener("visibilitychange", hide);
    const id = setTimeout(
      () => {
        setShown(null);
        setTucked(null);
      },
      Math.max(0, firstAt.current + SHOW_MS - clock()),
    );
    return () => {
      document.removeEventListener("visibilitychange", hide);
      clearTimeout(id);
    };
  }, [current, shown]);

  if (tucked && !shown && MOMENT_BY_ID.has(tucked.moment)) {
    return (
      <button
        onClick={() => {
          setShown(tucked);
          setTucked(null);
        }}
        className="fixed right-0 top-1/2 z-[55] flex -translate-y-1/2 items-center gap-1.5 rounded-l-2xl bg-panel py-2.5 pl-3 pr-2 text-xs font-bold text-ink shadow-xl ring-1 ring-ink/10"
        aria-label="A moment is waiting for your answer"
        title="A moment is waiting"
      >
        <Sparkles className="size-4 text-[#f08c00]" />
        <span className="[writing-mode:vertical-rl] rotate-180">Moment</span>
      </button>
    );
  }
  if (!shown || !MOMENT_BY_ID.has(shown.moment)) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))] z-[55] flex justify-center px-3">
      <MomentCard
        key={shown.id}
        shown={shown}
        onAnswered={() => (answered.current = true)}
        onGone={() => setShown(null)}
        onClose={() => {
          // Not answered yet: tucked away on the right, to answer later.
          if (!answered.current) setTucked(shown);
          setShown(null);
        }}
      />
    </div>
  );
}
