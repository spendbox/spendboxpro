"use client";

import { useState } from "react";
import { instalment, LOAN_MONTH_HOURS, LOAN_MONTHS } from "@/lib/world/market";
import { Sheet } from "../sheet";

const fmt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });

/** Ask for one amount of mint: a price to sell at, an offer, a counter-offer, a payment. */
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
  const [raw, setRaw] = useState(String(Math.round(initial * 100) / 100));
  const amount = Math.round(Number(raw.replace(/,/g, "")) * 100) / 100;
  const ok = Number.isFinite(amount) && amount > 0 && (max === undefined || amount <= max);
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
          <span className="font-display text-2xl font-extrabold text-muted">₥</span>
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
          <button type="button" onClick={() => setRaw(String(max))} className="mt-1.5 text-xs font-semibold text-gold-dark">
            Most: ₥{fmt(max)}
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
  const [raw, setRaw] = useState(String(Math.floor(max)));
  const [months, setMonths] = useState<number>(12);
  const amount = Math.round(Number(raw.replace(/,/g, "")) * 100) / 100;
  const ok = Number.isFinite(amount) && amount >= 10 && amount <= max;
  const each = ok ? instalment(amount, months, rate) : 0;
  const days = Math.round(LOAN_MONTH_HOURS / 24 * 10) / 10;
  return (
    <Sheet onClose={onClose} title="Borrow from the World Bank">
      <p className="text-sm text-muted">Up to half of what your property cost. Your property stands behind the loan.</p>
      <label className="mt-4 flex h-14 items-center gap-2 rounded-2xl bg-ink/5 px-4">
        <span className="font-display text-2xl font-extrabold text-muted">₥</span>
        <input value={raw} onChange={(e) => setRaw(e.target.value)} inputMode="decimal" className="min-w-0 flex-1 bg-transparent font-display text-2xl font-extrabold tabular-nums outline-none" aria-label="Amount" />
      </label>
      <button type="button" onClick={() => setRaw(String(max))} className="mt-1.5 text-xs font-semibold text-gold-dark">
        Most: ₥{fmt(max)}
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
            <p className="font-display text-lg font-extrabold tabular-nums">₥{fmt(each)}</p>
          </div>
          <div className="rounded-2xl bg-ink/[0.04] p-3">
            <p className="text-[11px] text-muted">In all</p>
            <p className="font-display text-lg font-extrabold tabular-nums">₥{fmt(Math.round(each * months))}</p>
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        {Math.round(rate * 100)}% a game year. A game month is {days} real days; each payment comes from Savings, then your wallet. Miss {misses} in a row and the bank takes
        the property.
      </p>
      <button disabled={busy || !ok} onClick={() => onSubmit(amount, months)} className="mt-4 h-11 w-full rounded-full bg-ink font-semibold text-white disabled:opacity-40">
        {busy ? "One moment…" : ok ? `Borrow ₥${fmt(amount)}` : max >= 10 ? "Enter an amount" : "Nothing to borrow against yet"}
      </button>
    </Sheet>
  );
}
