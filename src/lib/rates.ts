// The day's exchange rates for showing money in players' currencies (src/lib/world/value.ts
// setRates). From free public feeds with no key, tried in turn; the CDN keeps the answer for hours
// (src/app/api/rates/route.ts), so the feeds see a few requests a day, not one per player.

import { CURRENCIES } from "./world/value.ts";

/** Naira for one of each of our currencies, from a table of how much of each one naira buys. */
export function nairaRates(perNaira: Record<string, unknown>) {
  const out: Record<string, number> = {};
  for (const c of CURRENCIES) {
    if (c.code === "MINT" || c.code === "NGN") continue;
    const v = Number(perNaira[c.code] ?? perNaira[c.code.toLowerCase()]);
    if (Number.isFinite(v) && v > 0) out[c.code] = Math.round((1 / v) * 10000) / 10000;
  }
  return out;
}

const FEEDS: { url: string; table: (j: Record<string, unknown>) => unknown }[] = [
  { url: "https://open.er-api.com/v6/latest/NGN", table: (j) => j.rates },
  { url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/ngn.min.json", table: (j) => j.ngn },
  { url: "https://latest.currency-api.pages.dev/v1/currencies/ngn.min.json", table: (j) => j.ngn },
];

/** Today's rates (naira for one of each), or null when no feed answers. */
export async function fetchRates(): Promise<Record<string, number> | null> {
  for (const f of FEEDS) {
    try {
      const res = await fetch(f.url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const table = f.table((await res.json()) as Record<string, unknown>);
      if (!table || typeof table !== "object") continue;
      const rates = nairaRates(table as Record<string, unknown>);
      if (rates.USD) return rates;
    } catch {
      // Try the next feed.
    }
  }
  return null;
}
