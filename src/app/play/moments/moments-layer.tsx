"use client";

import { useEffect, useRef, useState } from "react";
import { MOMENT_BY_ID, registerMoments, spotOfTheme } from "@/lib/world/moments";
import { momentNext, type MomentShown } from "../moment-actions";
import { anySheetOpen } from "../sheet";
import { playSfx } from "../sound";
import { MomentCard } from "./moment-card";

// Moments (docs/MOMENTS.md): now and then in play, if nothing else is open, a little story
// slides up over the map: someone asks for money, a wallet lies on the ground, the waiter spills
// a drink on you. Pick what you do and see what comes of it. Going into a place makes one a bit
// more likely soon after (one that fits there).

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

/** Something else is up: the phone's in a pocket, a card or a full-screen tool is open. */
const busy = () => document.hidden || anySheetOpen() || !!document.querySelector('[role="dialog"], [role="alertdialog"]');

/**
 * inside: the theme of the place you're in (null on the street), home: it's a home. place: its
 * name (or the area's), for the stories.
 */
export function MomentsLayer({ inside, home, place, area, enabled }: { inside: string | null; home: boolean; place: string; area?: string; enabled: boolean }) {
  const spot = inside == null && !home ? "street" : spotOfTheme(inside, home);
  const [shown, setShown] = useState<MomentShown | null>(null);
  const live = useRef({ spot, place, area: area ?? "", enabled, open: false });
  useEffect(() => {
    live.current = { ...live.current, spot, place, area: area ?? "", enabled };
  }, [spot, place, area, enabled]);
  useEffect(() => {
    live.current.open = !!shown;
  }, [shown]);

  // The clock: try now and then; if it's not a good moment, try again a little later.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedule = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void attempt(), ms);
  };
  const attempt = async () => {
    const l = live.current;
    if (!l.enabled || l.open) return schedule(between(NEXT_MS));
    if (busy()) return schedule(30_000);
    const m = await momentNext({ spot: l.spot, place: l.place, area: l.area }).catch(() => null);
    // A player-written one comes with its story (docs/LIFE_WHEEL.md, phase 7).
    if (m?.def) registerMoments([m.def]);
    if (!m || !MOMENT_BY_ID.has(m.moment) || busy() || live.current.open) return schedule(between(RETRY_MS));
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

  if (!shown || !MOMENT_BY_ID.has(shown.moment)) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))] z-[55] flex justify-center px-3">
      <MomentCard key={shown.id} shown={shown} onClose={() => setShown(null)} />
    </div>
  );
}
