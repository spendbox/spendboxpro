"use client";

import { PLAYER_CURRENCIES } from "@/lib/world/value";
import { Sheet } from "../sheet";

/** The currencies as chips: tap one to show every amount in it. */
export function CurrencyChips({ value, onPick }: { value: string; onPick: (code: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Currency">
      {PLAYER_CURRENCIES.map((c) => (
        <button
          key={c.code}
          role="radio"
          aria-checked={value === c.code}
          onClick={() => onPick(c.code)}
          className={`h-8 rounded-full px-3 text-xs font-semibold ${value === c.code ? "bg-ink text-white" : "bg-ink/5 hover:bg-ink/10"}`}
          title={c.name}
        >
          {c.symbol} {c.code}
        </button>
      ))}
    </div>
  );
}

/** Choose your currency (from the menu, any time). */
export function CurrencySheet({ value, onPick, onClose }: { value: string; onPick: (code: string) => void; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} title="Your currency">
      <p className="text-sm text-muted">Every amount shows in the currency you pick. Change it any time.</p>
      <div className="mt-3">
        <CurrencyChips value={value} onPick={onPick} />
      </div>
      <p className="mt-3 text-[11px] text-muted">Rates are rough. Payments (packs, leases) are still made in naira.</p>
      <button onClick={onClose} className="mt-4 h-11 w-full rounded-full bg-ink font-semibold text-white">
        Done
      </button>
    </Sheet>
  );
}
