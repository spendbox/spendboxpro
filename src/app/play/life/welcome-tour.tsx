"use client";

import { useState } from "react";
import { X } from "@/components/icons";
import { FIRST_STEP_NAIRA } from "@/lib/world/first-steps";
import { PACKS } from "@/lib/world/packs";
import { cash } from "@/lib/world/value";

// The welcome walkthrough (docs/FIRST_STEPS.md): a small card over the map, a few tips one after
// another, once for everyone (new players and old ones, since so much changed), before the first
// steps. The game stays in view behind it. Next, or Skip any time.

/** Kept in this browser; bump the version to show a new walkthrough to everyone again. */
export const TOUR_KEY = "newtown.tour.v3";

export function WelcomeTour({ place, perMint, onDone }: { place: string; perMint: number; onDone: () => void }) {
  const [i, setI] = useState(0);
  const start = PACKS.find((p) => p.naira === 0)?.mint ?? 0;
  const tips: { emoji: string; title: string; text: React.ReactNode }[] = [
    { emoji: "👋", title: `Welcome to ${place}!`, text: "Real streets, real places, real people. Have a look around." },
    { emoji: "🏖️", title: "No work. No bills. No brushing your teeth.", text: "None of that here. Life in Newtown is just the fun part." },
    { emoji: "🎲", title: "Your cash is for fun", text: "Play games, meet new people, visit real places and send gifts." },
    {
      emoji: "🎁",
      title: "Free money every day",
      text: (
        <>
          You start with <b>{cash(start)}</b> and a free room. Open your daily gift every day; tap your cash to see it.
        </>
      ),
    },
    {
      emoji: "🏆",
      title: "Three quick steps",
      text: (
        <>
          Follow the gold glow: say hi, play a challenge, go out. New players get <b>{cash(FIRST_STEP_NAIRA / perMint)}</b> for each.
        </>
      ),
    },
  ];
  const last = i === tips.length - 1;
  const t = tips[i];
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex justify-center px-3 sm:bottom-24">
      <div key={i} role="dialog" aria-label="Welcome" className="pointer-events-auto w-full max-w-sm rounded-2xl bg-ink p-3.5 text-white shadow-2xl motion-safe:animate-[tipIn_.25s_ease-out]">
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none">{t.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-extrabold leading-snug text-gold">{t.title}</p>
            <p className="mt-0.5 text-sm leading-snug text-white/85">{t.text}</p>
          </div>
          <button onClick={onDone} aria-label="Skip" className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-full text-white/60 hover:text-white">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1">
            {tips.map((_, n) => (
              <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? "w-4 bg-gold" : "w-1.5 bg-white/30"}`} />
            ))}
          </div>
          <button onClick={() => (last ? onDone() : setI(i + 1))} className="h-8 rounded-full bg-gold px-4 text-sm font-bold text-ink">
            {last ? "Let's go!" : "Next"}
          </button>
        </div>
      </div>
      <style>{`@keyframes tipIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  );
}
