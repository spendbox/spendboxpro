"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// What you earn without doing anything, live (docs/MONEY.md): your property (game-db/079) and
// being online (game-db/083). The server pays it now and then; in between, your cash on screen goes
// up every few seconds by what's been earned since, so you watch it grow.
//
// How the numbers stay right without reloading the game: `base` is the latest cash we know of,
// from whichever came last: the page's own data (the coins it was given), or the server's answer
// when it pays your property (which says what your cash is now). On top of that we add what's been
// earned since the server last counted (`at`), and what being online has paid since.

export type Income = { perDay: number; at: number; total: number };

let income: Income = { perDay: 0, at: 0, total: 0 };
let base: number | null = null;
/** The server's clock minus this one (ms). */
let offset = 0;
let online = { rate: 0, at: 0, on: false };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));

/** Ask the server to pay what's been earned (at most once a minute, it says). Returns how much was paid (mint). */
export async function settleIncome(): Promise<number> {
  const r = await fetch("/api/income", { method: "POST", cache: "no-store" }).catch(() => null);
  const d = r?.ok
    ? ((await r.json().catch(() => null)) as { paid: number; perDay: number; at: string | null; total: number; coins?: number; now?: number } | null)
    : null;
  if (!d) return 0;
  if (d.now) offset = d.now - Date.now();
  income = { perDay: d.perDay, at: d.at ? Date.parse(d.at) : Date.now() + offset, total: d.total };
  if (typeof d.coins === "number") base = d.coins;
  emit();
  return d.paid;
}

/** The coins on screen changed (new page data): count from them, and check with the server. */
export async function syncIncome(coins: number): Promise<number> {
  base = coins;
  emit();
  return settleIncome();
}

/** You've wandered off (the game hidden, or untouched for 2 minutes): online pay stops counting. */
export function onlineIdle() {
  if (!online.on) return;
  online = { ...online, on: false };
  emit();
}

/**
 * The game's once-a-minute "I'm here" ping came back (paid, rate in mint; left: paid minutes left
 * today; idle: not paid, as the server hasn't seen you do anything lately, game-db/124).
 */
export function onlinePinged(paid: number, rate: number, left: number, idle = false) {
  if (paid > 0 && base !== null) base += paid;
  online = { rate, at: Date.now(), on: rate > 0 && left > 0 && !idle };
  emit();
}

export function useIncome(): Income {
  return useSyncExternalStore(subscribe, () => income, () => income);
}
const useBase = () => useSyncExternalStore(subscribe, () => base, () => null);

/** What your property's earned and not yet paid (mint) at this moment; never below nothing, at most 2 days. */
function accrued(inc: Income) {
  if (inc.perDay <= 0 || inc.at <= 0) return 0;
  const days = (Date.now() + offset - inc.at) / 86_400_000;
  return Math.max(0, Math.min(2, days)) * inc.perDay;
}

/** Online pay earned since the last ping (up to a minute's worth, while you're still about). */
function onlineAccrued() {
  if (!online.on || online.rate <= 0) return 0;
  return (Math.min(60_000, Date.now() - online.at) / 60_000) * online.rate;
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

/** Your cash, with what's been earned since it was last paid, going up every few seconds. */
export function useLiveCoins(coins: number, everyMs = 5_000): number {
  const inc = useIncome();
  const b = useBase();
  useTick(inc.perDay > 0 || online.on, everyMs);
  return Math.floor(((b ?? coins) + accrued(inc) + onlineAccrued()) * 100) / 100;
}

/** All your property has ever earned you, going up as you watch. */
export function useLiveEarned(everyMs = 2_000): number {
  const inc = useIncome();
  useTick(inc.perDay > 0, everyMs);
  return Math.floor((inc.total + accrued(inc)) * 100) / 100;
}
