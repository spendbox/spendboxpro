"use client";

import { useEffect, useState } from "react";
import { cash } from "@/lib/world/value";
import { LUXURY_FROM, type ItemKind } from "@/lib/world/items";
import { Confetti } from "../activities/ui";
import { playSfx } from "../sound";
import { ItemArt } from "./item-art";

// "It's yours!": what you just bought pops onto the screen, shining, with light rays behind it,
// sparkles, confetti and a line of hype. Bigger hype for dearer things. Tap anywhere to carry on.

const HYPE = [
  "Looking good on you.",
  "The whole street just noticed.",
  "Drip level: rising.",
  "Your Instagram isn't ready.",
  "Na you get am!",
  "Fresh. Very fresh.",
];
const BIG_HYPE = [
  "Lagos big boy alert! 🚨",
  "Billionaire behaviour.",
  "The whole of Ikoyi is talking.",
  "Wealth that whispers. Loudly.",
  "Even the area boys are saluting.",
];

export function PurchasePop({
  kind,
  paid,
  onClose,
}: {
  kind: ItemKind;
  paid: number;
  onClose: () => void;
}) {
  const big = kind.price >= LUXURY_FROM;
  const [line] = useState(() => {
    const list = big ? BIG_HYPE : HYPE;
    return list[Math.floor(Math.random() * list.length)];
  });
  useEffect(() => {
    playSfx("levelup");
    const t = setTimeout(onClose, big ? 7000 : 5000);
    return () => clearTimeout(t);
  }, [big, onClose]);
  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-ink/70 p-6 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label={`You bought ${kind.name}`}
    >
      <Confetti count={big ? 60 : 32} />
      <div className="buy-pop relative flex flex-col items-center text-center text-white">
        {/* light rays turning behind it, and a warm glow */}
        <span
          aria-hidden
          className="buy-rays pointer-events-none absolute left-1/2 top-[110px] size-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[110px] size-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,214,92,0.65),rgba(255,214,92,0)_70%)]"
        />
        <div className="relative">
          <ItemArt
            kind={kind.id}
            category={kind.category}
            size={210}
            className="buy-art rounded-[2.2rem] shadow-[0_20px_60px_rgba(0,0,0,0.45)] ring-4 ring-white/80"
          />
          {/* the shine sweeping across */}
          <span
            aria-hidden
            className="buy-shine pointer-events-none absolute inset-0 overflow-hidden rounded-[2.2rem]"
          />
          {[
            [8, 10, 0],
            [88, 18, 0.4],
            [14, 82, 0.8],
            [90, 78, 0.2],
            [50, -4, 0.6],
          ].map(([x, y, d], i) => (
            <span
              key={i}
              aria-hidden
              className="buy-sparkle pointer-events-none absolute text-2xl"
              style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }}
            >
              ✨
            </span>
          ))}
        </div>
        <p className="relative mt-6 font-display text-4xl font-black italic tracking-tight text-gold drop-shadow-[0_2px_10px_rgba(255,197,61,0.6)]">
          It&apos;s yours!
        </p>
        <p className="relative mt-1 font-display text-xl font-extrabold">
          {kind.name}
        </p>
        <p className="relative mt-1 text-sm text-white/80">{line}</p>
        <div className="relative mt-3 flex flex-wrap justify-center gap-1.5 text-sm font-bold">
          <span className="rounded-full bg-white/15 px-3 py-1">
            {cash(paid)}
          </span>
          {kind.effect.rep ? (
            <span className="rounded-full bg-[#2b8a3e] px-3 py-1">
              +{kind.effect.rep} reputation
            </span>
          ) : null}
          {kind.effect.mind ? (
            <span className="rounded-full bg-[#7048e8] px-3 py-1">
              Happier mind
            </span>
          ) : null}
        </div>
        <button
          onClick={onClose}
          className="relative mt-5 h-11 rounded-full bg-gold px-8 font-bold text-ink shadow-lg"
        >
          Nice!
        </button>
      </div>
    </div>
  );
}
