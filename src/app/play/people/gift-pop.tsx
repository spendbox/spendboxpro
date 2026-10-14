"use client";

import { cash } from "@/lib/world/value";
import { useEffect, useState } from "react";
import { BookOpen, Car, Coins, Dumbbell, Gem, Gift, Handshake, Heart, Palette, Shirt, Smartphone, Sofa, X } from "lucide-react";
import { SHOP, CATEGORY_LABEL, type ItemCategory } from "@/lib/world/items";
import type { FeedItem } from "../notifications";
import { playSfx } from "../sound";

// A gift arriving (docs/PEOPLE.md): a wrapped present bops onto the screen, one at a time. Tap it
// and it opens full screen: the lid flies off and what's inside is shown big (the thing itself,
// the mint, the hug), with who it's from. Gifts left at your door wait there to be unwrapped.

const CATEGORY_ICON: Record<ItemCategory, typeof Gem> = { jewellery: Gem, clothing: Shirt, book: BookOpen, gadget: Smartphone, home: Sofa, art: Palette, fitness: Dumbbell, car: Car };

type Reading = { from: string; kind: "item" | "mint" | "hug" | "handshake" | "door"; what: string; category?: ItemCategory };

/** What a gift notice says: who from, and what. */
function read(n: FeedItem): Reading {
  const t = n.text;
  if (n.icon === "hug" || /gave you a hug/i.test(t)) return { from: t.split(" gave you")[0], kind: "hug", what: "A big hug" };
  if (n.icon === "handshake" || /shook your hand/i.test(t)) return { from: t.split(" shook")[0], kind: "handshake", what: "A warm handshake" };
  if (/left a gift at your door/i.test(t)) return { from: t.split(" left")[0], kind: "door", what: "A wrapped gift" };
  // Amounts arrive already in your currency (cashText); older text may still say "₥50" or "50 mint".
  const coins = /^(.+?) gave you (₥?[\d,.]+) (?:coins|mint)/i.exec(t) ?? /^(.+?) gave you (₥[\d,.]+)/i.exec(t);
  if (coins) return { from: coins[1], kind: "mint", what: cash(Number(coins[2].replace(/[^\d.]/g, ""))) };
  const shown = /^(.+?) gave you (\D{0,4}\d[\d,.]*(?:k|m|bn)?)!?$/i.exec(t);
  if (shown) return { from: shown[1], kind: "mint", what: shown[2] };
  const item = /^(.+?) gave you (.+?)!?$/i.exec(t);
  if (item) {
    const kind = SHOP.find((k) => k.name.toLowerCase() === item[2].toLowerCase());
    return { from: item[1], kind: "item", what: item[2], category: kind?.category };
  }
  return { from: "Someone", kind: "item", what: t };
}

export function GiftPop({ gift, more, onDone, onDoor, onGifts }: { gift: FeedItem; more: number; onDone: () => void; onDoor: () => void; onGifts: () => void }) {
  const [open, setOpen] = useState(false);
  const r = read(gift);
  useEffect(() => {
    playSfx("pop");
  }, [gift.key]);
  // Not opened: it waits a little, then tucks away (it's in your phone).
  useEffect(() => {
    if (open) return;
    const t = setTimeout(onDone, 12_000);
    return () => clearTimeout(t);
  }, [open, onDone]);

  if (!open)
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-3">
        <style>{CSS}</style>
        <button
          onClick={() => {
            setOpen(true);
            playSfx("chime");
          }}
          className="gift-bop pointer-events-auto flex items-center gap-3 rounded-3xl bg-panel py-2 pl-2 pr-4 shadow-2xl ring-4 ring-gold/40"
          aria-label={`${r.from} sent you a gift: open it`}
        >
          <Present className="gift-wiggle size-14" />
          <span className="text-left">
            <b className="block text-sm leading-tight">{r.from} sent you {r.kind === "hug" ? "a hug" : r.kind === "handshake" ? "a handshake" : "a gift"}!</b>
            <span className="text-xs font-semibold text-gold-dark">Tap to open{more > 0 ? ` · ${more} more` : ""}</span>
          </span>
        </button>
      </div>
    );

  const Icon = r.kind === "hug" ? Heart : r.kind === "handshake" ? Handshake : r.kind === "mint" ? Coins : r.kind === "door" ? Gift : r.category ? CATEGORY_ICON[r.category] : Gift;
  return (
    <div className="fixed inset-0 z-[75] flex flex-col items-center justify-center bg-black/80 px-6 text-center text-white" role="dialog" aria-label="Your gift">
      <style>{CSS}</style>
      <button onClick={onDone} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] grid size-10 place-items-center rounded-full bg-white/15" aria-label="Close">
        <X className="size-5" />
      </button>
      {/* Confetti, the lid flying off, and the gift rising out of the box. */}
      {Array.from({ length: 24 }, (_, i) => (
        <span
          key={i}
          className="gift-confetti absolute left-1/2 top-1/2 h-2.5 w-1.5 rounded-sm"
          style={{ background: ["#ffd43b", "#ff6b6b", "#69db7c", "#4dabf7", "#da77f2"][i % 5], ["--a" as string]: `${(i / 24) * 360}deg`, animationDelay: `${(i % 6) * 0.03}s` }}
        />
      ))}
      <div className="relative">
        <span className="gift-rise grid size-40 place-items-center rounded-full bg-gradient-to-b from-gold to-[#f08c00] shadow-[0_0_80px_20px_rgba(255,212,59,0.35)]">
          <Icon className="size-20 text-white drop-shadow" strokeWidth={1.6} />
        </span>
      </div>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-gold">{r.kind === "door" ? "Waiting at your door" : "You got"}</p>
      <h2 className="mt-1 font-display text-3xl font-extrabold leading-tight">{r.what}</h2>
      {r.category && <p className="mt-1 text-sm text-white/70">{CATEGORY_LABEL[r.category]} · in your Things now</p>}
      <p className="mt-2 text-white/80">From {r.from}</p>
      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        {r.kind === "door" ? (
          <button
            onClick={() => {
              onDone();
              onDoor();
            }}
            className="h-12 rounded-full bg-gold font-semibold text-ink"
          >
            Unwrap it at your door
          </button>
        ) : (
          <button
            onClick={() => {
              onDone();
              onGifts();
            }}
            className="h-12 rounded-full bg-gold font-semibold text-ink"
          >
            Say thank you
          </button>
        )}
        <button onClick={onDone} className="h-11 rounded-full bg-white/15 font-semibold">
          {more > 0 ? `Next gift (${more} more)` : "Lovely"}
        </button>
      </div>
    </div>
  );
}

/** A wrapped present with a bow. */
function Present({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect x="8" y="26" width="48" height="32" rx="4" fill="#e03131" />
      <rect x="5" y="18" width="54" height="12" rx="3" fill="#f03e3e" />
      <rect x="28" y="18" width="8" height="40" fill="#ffd43b" />
      <path d="M32 18c-6-10-18-10-16-2 1 4 10 3 16 2Zm0 0c6-10 18-10 16-2-1 4-10 3-16 2Z" fill="#ffd43b" />
    </svg>
  );
}

const CSS = `
@keyframes gift-bop { 0% { transform: translateY(80px) scale(.6); opacity: 0 } 55% { transform: translateY(-14px) scale(1.06); opacity: 1 } 75% { transform: translateY(4px) scale(.98) } 100% { transform: none } }
.gift-bop { animation: gift-bop .7s cubic-bezier(.2,1.2,.4,1) both }
@keyframes gift-wiggle { 0%,100% { transform: rotate(0) } 10% { transform: rotate(-12deg) } 20% { transform: rotate(10deg) } 30% { transform: rotate(-6deg) } 40% { transform: rotate(0) } }
.gift-wiggle { animation: gift-wiggle 1.6s ease-in-out 0.7s infinite }
@keyframes gift-rise { 0% { transform: translateY(60px) scale(.3); opacity: 0 } 60% { transform: translateY(-10px) scale(1.08); opacity: 1 } 100% { transform: none } }
.gift-rise { display: grid; animation: gift-rise .8s cubic-bezier(.2,1.3,.4,1) both }
@keyframes gift-confetti { 0% { transform: translate(-50%,-50%) rotate(var(--a)) translateY(0); opacity: 1 } 100% { transform: translate(-50%,-50%) rotate(var(--a)) translateY(-46vmin) rotate(540deg); opacity: 0 } }
.gift-confetti { animation: gift-confetti 1.2s ease-out both }
@media (prefers-reduced-motion: reduce) { .gift-bop, .gift-wiggle, .gift-rise, .gift-confetti { animation: none } }
`;

/** You gave something: say so on the screen (a present flying off to them). */
export function announceGiftSent(to: string, what: string) {
  window.dispatchEvent(new CustomEvent("nt-gift-sent", { detail: { to, what } }));
}

/** The giver's side: "Sent!" with the present flying away, for a couple of seconds. */
export function GiftSent() {
  const [sent, setSent] = useState<{ to: string; what: string; at: number } | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ to: string; what: string }>).detail;
      setSent({ ...d, at: Date.now() });
      playSfx("whoosh");
    };
    window.addEventListener("nt-gift-sent", on);
    return () => window.removeEventListener("nt-gift-sent", on);
  }, []);
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(null), 2600);
    return () => clearTimeout(t);
  }, [sent]);
  if (!sent) return null;
  return (
    <div key={sent.at} className="pointer-events-none fixed inset-x-0 top-1/3 z-[60] flex flex-col items-center">
      <style>{CSS + `@keyframes gift-away { 0% { transform: scale(.4); opacity: 0 } 25% { transform: scale(1.15); opacity: 1 } 60% { transform: scale(1) translateY(0) } 100% { transform: translate(40vw,-30vh) scale(.3) rotate(25deg); opacity: 0 } } .gift-away { animation: gift-away 2.2s ease-in-out both }`}</style>
      <Present className="gift-away size-24 drop-shadow-xl" />
      <p className="toast-in mt-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-lg">
        {sent.what} sent to {sent.to}!
      </p>
    </div>
  );
}
