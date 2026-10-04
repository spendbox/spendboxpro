"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { startPayment } from "@/app/dashboard/[bizId]/billing-actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { MONTH_CHOICES, PLANS, type PlanKey } from "@/lib/billing";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

/** Choose Starter or Plus and how many months, then pay on Paystack. */
export function PlanPicker({ bizId, prices, current }: { bizId: string; prices: Record<PlanKey, number>; current: PlanKey }) {
  const [plan, setPlan] = useState<PlanKey>(current);
  const [months, setMonths] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = prices[plan] * months;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Plan">
        {(Object.keys(PLANS) as PlanKey[]).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={plan === key}
            onClick={() => setPlan(key)}
            className={cn(
              "flex flex-col gap-1 rounded-3xl p-4 text-left ring-2 transition",
              plan === key ? "bg-brand-50 ring-brand-600" : "bg-white ring-line hover:ring-line-strong",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-display text-lg font-bold">{PLANS[key].name}</span>
              {plan === key && <Check className="size-5 text-brand-700" aria-hidden />}
            </span>
            <span className="font-display text-2xl font-bold tabular">
              {formatMoney(prices[key])}
              <span className="text-sm font-semibold text-muted"> / month</span>
            </span>
            <span className="text-sm font-semibold text-ink">{PLANS[key].blurb}</span>
            <ul className="mt-1 flex flex-col gap-1.5">
              {PLANS[key].features.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-ink-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Pay for</p>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Months">
          {MONTH_CHOICES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={months === m}
              onClick={() => setMonths(m)}
              className="h-11 rounded-xl text-sm font-semibold ring-1 ring-line-strong aria-checked:bg-ink aria-checked:text-white aria-checked:ring-ink"
            >
              {m === 1 ? "1 month" : m === 12 ? "1 year" : `${m} months`}
            </button>
          ))}
        </div>
      </div>

      <FormMessage>{error}</FormMessage>
      <Button
        size="lg"
        block
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await startPayment(bizId, plan, months);
            if (r.url) window.location.href = r.url;
            else setError(r.error ?? "Something went wrong. Please try again.");
          })
        }
      >
        {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        Pay {formatMoney(total)} with Paystack
      </Button>
      <p className="text-center text-xs text-muted">Card, bank transfer or USSD. Your time is added on top of any days you have left.</p>
    </div>
  );
}
