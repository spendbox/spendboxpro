"use client";

import { Check, House, Search, Star } from "@/components/icons";
import { PACKS, PAID_PACKS } from "@/lib/world/packs";
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
  // Everyone starts with ₦2,000,000 and a free home (docs/STARTER_ROOMS.md, docs/MONEY.md), or richer
  // with a starter pack (docs/PACKS.md), paid in the Wallet; top-ups are there too, any time.
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
            <b>A free home</b> to live in, straight away (you can move once, free)
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
      {!pretend && (
        <>
          <p className="mt-4 text-xs font-semibold">Or start richer (once):</p>
          <div className="mt-1.5 space-y-1.5">
            {PAID_PACKS.map((p) => (
              <button
                key={p.id}
                disabled={busy}
                onClick={() => onPack(p.id)}
                className="flex w-full items-center gap-3 rounded-xl bg-[#fff9db] px-3 py-2 text-left ring-1 ring-[#f59f00]/30 disabled:opacity-40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold text-[#5c4400]">{p.label}</span>
                  <b className="block text-sm tabular-nums">Start with {cash(p.mint)}</b>
                </span>
                <span className="shrink-0 rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">₦{p.naira.toLocaleString("en-GB")}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">Pay by bank transfer or card. Your free home comes either way.</p>
        </>
      )}
    </Sheet>
  );
}
