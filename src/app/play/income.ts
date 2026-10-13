"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// What your property earns, live (docs/MONEY.md, game-db/079): the server pays it now and then
// (POST /api/income); in between, your cash on screen goes up every few seconds by what's been
// earned since, so you watch it grow.
//
// How the numbers stay right: `at` is the moment the server has paid up to. When a payment comes
// in, the coins on screen only include it once the page's data is refreshed, so until then we keep
// counting from the old `at` (pendingAt holds the new one); syncIncome() (called whenever the coins
// on screen change) switches over and asks the server again, which also catches payments made by
// the server on its own (buying, selling).

export type Income = { perDay: number; at: number; total: number };

let income: Income = { perDay: 0, at: 0, total: 0 };
let pendingAt: number | null = null;
/** The server's clock minus this one (ms). */
let offset = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Ask the server to pay what's been earned. Returns how much was paid (mint). */
export async function settleIncome(): Promise<number> {
  const r = await fetch("/api/income", { method: "POST", cache: "no-store" }).catch(() => null);
  const d = r?.ok ? ((await r.json().catch(() => null)) as { paid: number; perDay: number; at: string | null; total: number; now?: number } | null) : null;
  if (!d) return 0;
  if (d.now) offset = d.now - Date.now();
  const at = d.at ? Date.parse(d.at) : Date.now() + offset;
  if (d.paid > 0) {
    // Keep counting from the old time until the new coins reach the screen (no dip).
    pendingAt = at;
    income = { ...income, perDay: d.perDay, total: d.total };
  } else {
    pendingAt = null;
    income = { perDay: d.perDay, at, total: d.total };
  }
  emit();
  return d.paid;
}

/** The coins on screen have changed (new data from the server): count from the latest payment, and check again. */
export async function syncIncome(): Promise<number> {
  if (pendingAt !== null) {
    income = { ...income, at: pendingAt };
    pendingAt = null;
    emit();
  }
  return settleIncome();
}

export function useIncome(): Income {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => income,
    () => income,
  );
}

/** What's been earned and not yet paid (mint) at this moment; never below nothing, at most 2 days. */
function accrued(inc: Income) {
  if (inc.perDay <= 0 || inc.at <= 0) return 0;
  const days = (Date.now() + offset - inc.at) / 86_400_000;
  return Math.max(0, Math.min(2, days)) * inc.perDay;
}

/** Re-render every `everyMs` while something's earning. */
function useTick(on: boolean, everyMs: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setTick((n) => n + 1), everyMs);
    return () => clearInterval(t);
  }, [on, everyMs]);
}

/** Your cash, with what your property's earned since it was last paid, going up every few seconds. */
export function useLiveCoins(coins: number, everyMs = 5_000): number {
  const inc = useIncome();
  useTick(inc.perDay > 0, everyMs);
  return Math.floor((coins + accrued(inc)) * 100) / 100;
}

/** All your property has ever earned you, going up as you watch. */
export function useLiveEarned(everyMs = 2_000): number {
  const inc = useIncome();
  useTick(inc.perDay > 0, everyMs);
  // While a payment waits to reach the screen, `total` already includes it: don't count it twice.
  const extra = pendingAt === null ? accrued(inc) : 0;
  return Math.floor((inc.total + extra) * 100) / 100;
}
