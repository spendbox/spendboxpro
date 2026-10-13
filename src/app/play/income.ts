"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// What your property earns, live (docs/MONEY.md, game-db/079): the server pays it now and then
// (POST /api/income); in between, your cash on screen goes up every few seconds by what's been
// earned since, so you watch it grow.

export type Income = { perDay: number; at: number; total: number };

let income: Income = { perDay: 0, at: 0, total: 0 };
/** Counted-up-to time from a payment whose coins haven't reached the screen yet. */
let pendingAt: number | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Ask the server to pay what's been earned. Returns how much was paid (mint). */
export async function settleIncome(): Promise<number> {
  const r = await fetch("/api/income", { method: "POST", cache: "no-store" }).catch(() => null);
  const d = r?.ok ? ((await r.json().catch(() => null)) as { paid: number; perDay: number; at: string | null; total: number } | null) : null;
  if (!d) return 0;
  const at = d.at ? Date.parse(d.at) : Date.now();
  if (d.paid > 0) {
    // Keep counting from the old time until the new coins arrive (no dip on screen).
    pendingAt = at;
    income = { ...income, perDay: d.perDay, total: d.total };
  } else income = { perDay: d.perDay, at, total: d.total };
  emit();
  return d.paid;
}

export function useIncome(): Income {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => income,
    () => income,
  );
}

/** What's been earned and not yet paid (mint), right now. */
const accrued = (now: number) => (income.perDay > 0 && income.at > 0 ? Math.min(2, (now - income.at) / 86_400_000) * income.perDay : 0);

/** Your cash, with what your property's earned since it was last paid, going up every few seconds. */
export function useLiveCoins(coins: number, everyMs = 5_000): number {
  const inc = useIncome();
  const [now, setNow] = useState(() => Date.now());
  // New coins from the server: the payment they include is now counted.
  useEffect(() => {
    if (pendingAt !== null) {
      income = { ...income, at: pendingAt };
      pendingAt = null;
      emit();
    }
  }, [coins]);
  useEffect(() => {
    if (inc.perDay <= 0) return;
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [inc.perDay, everyMs]);
  return Math.floor((coins + accrued(now)) * 100) / 100;
}
