"use client";

import { useRef, useState } from "react";
import { X } from "@/components/icons";
import { FIRST_STEP_NAIRA } from "@/lib/world/first-steps";
import { PACKS } from "@/lib/world/packs";
import { cash } from "@/lib/world/value";

// The welcome tour (docs/FIRST_STEPS.md): a few fun slides, once for everyone (new players and
// old ones, since so much changed), before the first steps. Swipe or tap Next; Skip any time.

/** Kept in this browser; bump the version to show a new tour to everyone again. */
export const TOUR_KEY = "newtown.tour.v2";

type Slide = { bg: string; art: React.ReactNode; title: string; text: React.ReactNode };

/** One big bouncing picture. */
function Art({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <span className="inline-block animate-bounce text-6xl drop-shadow-lg" style={{ animationDelay: `${delay}ms`, animationDuration: "1.6s" }}>
      {children}
    </span>
  );
}

/** Something you don't have to do here: crossed out. */
function Nope({ emoji, label }: { emoji: string; label: string }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="relative grid size-16 place-items-center rounded-2xl bg-white/80 text-4xl shadow">
        {emoji}
        <span className="absolute inset-x-1 top-1/2 h-1 -translate-y-1/2 -rotate-45 rounded-full bg-hit" />
      </span>
      <span className="text-[11px] font-bold text-ink/70">{label}</span>
    </span>
  );
}

/** What the cash is for. */
function Fun({ emoji, label }: { emoji: string; label: string }) {
  return (
    <span className="flex items-center gap-2 rounded-2xl bg-white/85 px-3 py-2.5 text-left text-sm font-bold shadow">
      <span className="text-2xl">{emoji}</span>
      {label}
    </span>
  );
}

export function WelcomeTour({ place, perMint, onDone }: { place: string; perMint: number; onDone: () => void }) {
  const [i, setI] = useState(0);
  const touch = useRef<number | null>(null);
  const start = PACKS.find((p) => p.naira === 0)?.mint ?? 0;
  const naira = (n: number) => cash(n / perMint);
  const slides: Slide[] = [
    {
      bg: "from-[#ffe066] to-[#ffa94d]",
      art: (
        <>
          <Art>🌍</Art>
          <Art delay={200}>🏙️</Art>
        </>
      ),
      title: `Welcome to Newtown ${place}!`,
      text: "Real streets, real places, real people. A whole city in your pocket, and it's all yours to enjoy.",
    },
    {
      bg: "from-[#a5d8ff] to-[#d0bfff]",
      art: (
        <div className="flex justify-center gap-3">
          <Nope emoji="💼" label="Work" />
          <Nope emoji="⏰" label="Alarms" />
          <Nope emoji="🪥" label="Brushing" />
        </div>
      ),
      title: "No work. No bills. No brushing your teeth.",
      text: "In this world you don't have to do any of that. Life here is just the fun part.",
    },
    {
      bg: "from-[#b2f2bb] to-[#63e6be]",
      art: (
        <div className="mx-auto grid max-w-xs grid-cols-2 gap-2">
          <Fun emoji="🎲" label="Play games" />
          <Fun emoji="🤝" label="Meet people" />
          <Fun emoji="📍" label="Visit real places" />
          <Fun emoji="🎁" label="Send gifts" />
        </div>
      ),
      title: "Your virtual cash is for fun",
      text: "Win Whot! and Ludo, make new friends, go to real clubs, restaurants and landmarks, and spoil people with gifts.",
    },
    {
      bg: "from-[#fcc2d7] to-[#ffd8a8]",
      art: (
        <>
          <Art>🎁</Art>
          <Art delay={150}>🏠</Art>
          <Art delay={300}>💸</Art>
        </>
      ),
      title: "Free money, every day",
      text: (
        <>
          You start with <b>{cash(start)}</b> and a free room. Open your <b>daily gift</b> every day: the more you play, the bigger it
          gets. Want more? Top up right here, any time.
        </>
      ),
    },
    {
      bg: "from-[#ffec99] to-[#ffc078]",
      art: (
        <>
          <Art>🏆</Art>
          <Art delay={200}>🎉</Art>
        </>
      ),
      title: "Ready? Three quick steps",
      text: (
        <>
          Say hi to someone, play a challenge, then go out somewhere. New here? Each one pays <b>{naira(FIRST_STEP_NAIRA)}</b>. Watch for
          the gold glow!
        </>
      ),
    },
  ];
  const last = i === slides.length - 1;
  const s = slides[i];
  const go = (d: number) => setI((n) => Math.min(slides.length - 1, Math.max(0, n + d)));
  return (
    <div
      className={`fixed inset-0 z-[80] flex flex-col bg-gradient-to-br ${s.bg} transition-colors duration-500`}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
      role="dialog"
      aria-label="Welcome to Newtown"
    >
      <div className="flex justify-end p-4">
        {!last && (
          <button onClick={onDone} className="flex items-center gap-1 rounded-full bg-white/50 px-3 py-1.5 text-sm font-semibold text-ink">
            Skip <X className="size-4" />
          </button>
        )}
      </div>
      <div key={i} className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 text-center text-ink motion-safe:animate-[tourIn_.35s_ease-out]">
        <div className="flex min-h-28 items-center justify-center gap-3">{s.art}</div>
        <h2 className="font-display text-3xl font-extrabold leading-tight">{s.title}</h2>
        <p className="text-base leading-relaxed text-ink/80">{s.text}</p>
      </div>
      <div className="mx-auto w-full max-w-md px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex justify-center gap-1.5">
          {slides.map((_, n) => (
            <button key={n} onClick={() => setI(n)} aria-label={`Slide ${n + 1}`} className={`h-2 rounded-full transition-all ${n === i ? "w-6 bg-ink" : "w-2 bg-ink/30"}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {i > 0 && (
            <button onClick={() => go(-1)} className="h-12 rounded-full bg-white/60 px-5 font-semibold text-ink">
              Back
            </button>
          )}
          <button onClick={() => (last ? onDone() : go(1))} className="h-12 flex-1 rounded-full bg-ink text-base font-bold text-white shadow-lg">
            {last ? "Let's go!" : "Next"}
          </button>
        </div>
      </div>
      <style>{`@keyframes tourIn { from { opacity: 0; transform: translateX(24px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  );
}
