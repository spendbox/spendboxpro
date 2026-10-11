"use client";

import { cash, cashSymbol, fromShown, toShown } from "@/lib/world/value";
import { useState } from "react";
import { instalment, LOAN_MONTH_HOURS, LOAN_MONTHS } from "@/lib/world/market";
import { Sheet } from "../sheet";

/** Mint shown in the player's currency, as the number to type (whole for big amounts). */
const typed = (mint: number) => {
  const v = toShown(mint);
  return String(v >= 100 ? Math.round(v) : Math.round(v * 100) / 100);
};
/** What was typed, back in mint (null when it isn't a number). */
const asMint = (raw: string) => {
  const v = Number(raw.replace(/[,\s]/g, ""));
  return Number.isFinite(v) ? Math.round(fromShown(v) * 100) / 100 : null;
};

/** Ask for one amount: a price to sell at, an offer, a counter-offer, a payment (typed in the player's currency, kept in mint). */
export function AmountSheet({
  title,
  text,
  initial,
  max,
  busy,
  note,
  cta,
  onSubmit,
  onClose,
}: {
  title: string;
  text: string;
  initial: number;
  max?: number;
  busy: boolean;
  /** A line under the box about this amount ("You get ₥980 after the 2% tax"). */
  note?: (amount: number) => string;
  cta: (amount: number) => string;
  onSubmit: (amount: number) => void;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState(typed(initial));
  const amount = asMint(raw) ?? 0;
  const ok = amount > 0 && (max === undefined || amount <= max + 0.01);
  return (
    <Sheet onClose={onClose} title={title}>
      <p className="text-sm text-muted">{text}</p>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSubmit(amount);
        }}
      >
        <label className="flex h-14 items-center gap-2 rounded-2xl bg-ink/5 px-4">
          <span className="font-display text-2xl font-extrabold text-muted">{cashSymbol()}</span>
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            inputMode="decimal"
            autoFocus
            className="min-w-0 flex-1 bg-transparent font-display text-2xl font-extrabold tabular-nums outline-none"
            aria-label="Amount"
          />
        </label>
        {max !== undefined && (
          <button type="button" onClick={() => setRaw(typed(max))} className="mt-1.5 text-xs font-semibold text-gold-dark">
            Most: {cash(max)}
          </button>
        )}
        {ok && note && <p className="mt-2 text-sm text-muted">{note(amount)}</p>}
        <button disabled={busy || !ok} className="mt-4 h-11 w-full rounded-full bg-ink font-semibold text-white disabled:opacity-40">
          {busy ? "One moment…" : ok ? cta(amount) : "Enter an amount"}
        </button>
      </form>
    </Sheet>
  );
}

/** Borrow from the World Bank: how much, and over how long. */
export function LoanSheet({ max, rate, misses, busy, onSubmit, onClose }: { max: number; rate: number; misses: number; busy: boolean; onSubmit: (amount: number, months: number) => void; onClose: () => void }) {
  const [raw, setRaw] = useState(typed(Math.floor(max)));
  const [months, setMonths] = useState<number>(12);
  const amount = Math.min(asMint(raw) ?? 0, max);
  const ok = amount >= 10 && (asMint(raw) ?? 0) <= max + 0.01;
  const each = ok ? instalment(amount, months, rate) : 0;
  const days = Math.round(LOAN_MONTH_HOURS / 24 * 10) / 10;
  return (
    <Sheet onClose={onClose} title="Borrow from the World Bank">
      <p className="text-sm text-muted">Up to half of what your property cost. Your property stands behind the loan.</p>
      <label className="mt-4 flex h-14 items-center gap-2 rounded-2xl bg-ink/5 px-4">
        <span className="font-display text-2xl font-extrabold text-muted">{cashSymbol()}</span>
        <input value={raw} onChange={(e) => setRaw(e.target.value)} inputMode="decimal" className="min-w-0 flex-1 bg-transparent font-display text-2xl font-extrabold tabular-nums outline-none" aria-label="Amount" />
      </label>
      <button type="button" onClick={() => setRaw(typed(max))} className="mt-1.5 text-xs font-semibold text-gold-dark">
        Most: {cash(max)}
      </button>
      <p className="mt-4 text-sm font-semibold">Pay it back over</p>
      <div className="mt-2 flex gap-1.5">
        {LOAN_MONTHS.map((m) => (
          <button key={m} onClick={() => setMonths(m)} className={`h-9 flex-1 rounded-full text-sm font-semibold ${months === m ? "bg-ink text-white" : "bg-ink/5"}`}>
            {m} months
          </button>
        ))}
      </div>
      {ok && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-ink/[0.04] p-3">
            <p className="text-[11px] text-muted">Each game month</p>
            <p className="font-display text-lg font-extrabold tabular-nums">{cash(each)}</p>
          </div>
          <div className="rounded-2xl bg-ink/[0.04] p-3">
            <p className="text-[11px] text-muted">In all</p>
            <p className="font-display text-lg font-extrabold tabular-nums">{cash(Math.round(each * months))}</p>
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        {Math.round(rate * 100)}% a game year. A game month is {days} real days; each payment comes from Savings, then your wallet. Miss {misses} in a row and the bank takes
        the property.
      </p>
      <button disabled={busy || !ok} onClick={() => onSubmit(amount, months)} className="mt-4 h-11 w-full rounded-full bg-ink font-semibold text-white disabled:opacity-40">
        {busy ? "One moment…" : ok ? `Borrow ${cash(amount)}` : max >= 10 ? "Enter an amount" : "Nothing to borrow against yet"}
      </button>
    </Sheet>
  );
}
