"use client";

import { Check, House, Search, Star } from "@/components/icons";
import { PACKS } from "@/lib/world/packs";
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
  /** The currency amounts show in, and choosing it. */
  currency: string;
  onCurrency: (code: string) => void;
}) {
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
  // The simple life (docs/STARTER_ROOMS.md, docs/MONEY.md): everyone starts the same, with
  // ₦250,000 and a free room; top-ups are in the Wallet, any time.
  const free = PACKS.find((p) => p.naira === 0);
  return (
    <Sheet onClose={onClose}>
      <h2 className="font-display text-xl font-extrabold">Welcome to {place}</h2>
      <p className="mt-1 text-sm text-muted">Everyone starts the same way:</p>
      <ul className="mt-3 space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-me" />
          <span>
            <b>{cash(free?.mint ?? 0)}</b> to start with
          </span>
        </li>
        <li className="flex items-start gap-2">
          <House className="mt-0.5 size-4 shrink-0 text-me" />
          <span>
            <b>A free room</b> to live in, straight away (you can move once, free)
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Star className="mt-0.5 size-4 shrink-0 text-me" />
          <span>A gift every day, bigger the more you play. Top up any time from your Wallet (tap your cash).</span>
        </li>
      </ul>
      <p className="mt-4 text-xs font-semibold">Your currency (change it any time)</p>
      <div className="mt-1.5">
        <CurrencyChips value={currency} onPick={onCurrency} />
      </div>
      <button onClick={onStart} disabled={busy} className="mt-5 h-12 w-full rounded-full bg-gold text-base font-bold text-ink shadow disabled:opacity-40">
        {busy ? "One moment…" : "Start"}
      </button>
    </Sheet>
  );
}
