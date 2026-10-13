"use client";

import { useState } from "react";
import { Check, House, Search, Star } from "@/components/icons";
import { PACKS, type Pack } from "@/lib/world/packs";
import type { Prices } from "@/lib/world/region";
import { cash } from "@/lib/world/value";
import { Sheet } from "../sheet";
import { CurrencyChips } from "./currency-pick";

/** The first thing on a real map: your starting budget, and why a home comes first. */
export function StartLife({
  place,
  budget,
  started,
  busy,
  granted,
  pretend,
  onStart,
  onPack,
  onClose,
  onFind,
  currency,
  onCurrency,
}: {
  place: string;
  budget: number;
  prices: Prices;
  started: boolean;
  busy: boolean;
  /** What your life started with so far (a pack only tops up to more). */
  granted: number;
  /** The world lab: packs are pretend, nothing is paid. */
  pretend?: boolean;
  onStart: () => void;
  onPack: (id: string) => void;
  onClose: () => void;
  /** Open the home search. */
  onFind: () => void;
  /** The currency amounts show in beside mint, and choosing it. */
  currency: string;
  onCurrency: (code: string) => void;
}) {
  const [pick, setPick] = useState<Pack["id"] | null>(null);
  const chosen = PACKS.find((p) => p.id === pick);
  if (started)
    return (
      <Sheet onClose={onClose}>
        <div className="grid size-12 place-items-center rounded-2xl bg-gold/15 text-gold-dark">
          <House className="size-6" />
        </div>
        <h2 className="mt-3 font-display text-xl font-extrabold">Find your first home</h2>
        <p className="mt-2 text-sm text-muted">
          You have <b className="text-ink">{cash(budget)}</b>. Buy a room, a flat or a house to live in.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <Search className="mt-0.5 size-4 shrink-0 text-muted" />
            Use Find a home to see what your money buys, or tap any building.
          </li>
          <li className="flex items-start gap-2">
            <House className="mt-0.5 size-4 shrink-0 text-muted" />
            You live free in your home, and it grows in value.
          </li>
        </ul>
        <button onClick={onFind} className="mt-5 h-11 w-full rounded-full bg-ink font-semibold text-white">
          Find a home
        </button>
      </Sheet>
    );
  return (
    <Sheet onClose={onClose}>
      <h2 className="font-display text-xl font-extrabold">Start your life in {place}</h2>
      <p className="mt-1 text-sm text-muted">Pick how your story begins. Then buy your first home.</p>
      <p className="mt-3 text-xs font-semibold">Your currency (change it any time)</p>
      <div className="mt-1.5">
        <CurrencyChips value={currency} onPick={onCurrency} />
      </div>
      <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-gold/15 px-3 py-2 text-xs font-semibold text-gold-dark">
        <Star className="size-4 shrink-0" /> One-time offer: you choose once, and you won&apos;t see this again.
      </p>
      <div className="mt-3 space-y-2" role="radiogroup" aria-label="How your life starts">
        {PACKS.map((p) => {
          const on = pick === p.id;
          const free = p.naira === 0;
          return (
            <button
              key={p.id}
              role="radio"
              aria-checked={on}
              disabled={busy || (!free && p.mint <= granted)}
              onClick={() => setPick(p.id)}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ring-1 transition disabled:opacity-40 ${on ? "bg-gold/15 ring-2 ring-gold-dark" : "bg-ink/[0.03] ring-ink/10 hover:bg-ink/[0.06]"}`}
            >
              <span className={`grid size-5 shrink-0 place-items-center rounded-full ring-2 ${on ? "bg-gold-dark text-white ring-gold-dark" : "ring-ink/20"}`}>
                {on && <Check className="size-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{p.label}</span>
                <span className="block text-xs text-muted">{p.story}</span>
                <span className="block text-[11px] text-muted">{p.what}</span>
                {p.perks.length > 0 && (
                  <span className="mt-1 block space-y-0.5">
                    {p.perks.map((perk) => (
                      <span key={perk} className="flex items-start gap-1 text-[11px] font-medium text-ink">
                        <Check className="mt-px size-3 shrink-0 text-me" />
                        {perk}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-display text-base font-extrabold tabular-nums">{cash(p.mint)}</span>
                <span className={`block text-xs font-semibold ${free ? "text-me" : ""}`}>{free ? "Free" : `Pay ₦${p.naira.toLocaleString("en-GB")}`}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {pretend ? "On this test page nothing is paid." : "Paid once through Paystack. Mint can't be turned back into cash."}
      </p>
      <button
        onClick={() => chosen && (chosen.naira === 0 ? onStart() : onPack(chosen.id))}
        disabled={busy || !chosen}
        className="mt-4 h-11 w-full rounded-full bg-ink font-semibold text-white disabled:opacity-40"
      >
        {busy
          ? "One moment…"
          : !chosen
            ? "Pick one to continue"
            : chosen.naira === 0
              ? `Start free with ${cash(chosen.mint)}`
              : `Pay ₦${chosen.naira.toLocaleString("en-GB")} for ${cash(chosen.mint)}`}
      </button>
    </Sheet>
  );
}
