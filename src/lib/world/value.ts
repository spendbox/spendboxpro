// What a property is worth: land + building, like real property (docs/PROPERTY.md, section 2).
//
//   land     = plot × land price per m² there (location; later also demand)
//   building = floor area × build cost per m² for its kind × condition
//   a unit's value = its share of both (by floor area), a little more for higher floors and for
//   shops at street level. A building's units always add up to the whole.
//
// Amounts here are in the region's own currency (naira for Lagos); toMint() converts.

import type { Building, BuildingState } from "./buildings.ts";
import type { Prices } from "./region.ts";

/** How much of a finished building's worth stands there, by state. */
const CONDITION: Record<BuildingState, number> = { built: 1, uncompleted: 0.35, site: 0.08 };

export type Valuation = {
  land: number;
  building: number;
  total: number;
  /** Each unit's value, in the building's unit order. */
  units: number[];
};

/** A unit's weight in sharing out the value: its floor area, more for height and street shops. */
function weight(u: Building["units"][number]) {
  const height = 1 + Math.min(0.4, u.floor * 0.02);
  const street = u.use === "shop" && u.floor === 0 ? 1.15 : 1;
  return u.area * height * street;
}

export function valueOf(b: Building, landPerM2: number, prices: Prices): Valuation {
  const land = b.plot * landPerM2;
  const open = b.kind === "land" || b.kind === "farm";
  const floorArea = open ? 0 : b.units.reduce((t, u) => t + u.area, 0);
  const building = open ? b.plot * prices.build[b.kind] : floorArea * prices.build[b.kind] * CONDITION[b.state];
  const total = land + building;
  const weights = b.units.map(weight);
  const sum = weights.reduce((t, w) => t + w, 0) || 1;
  return { land, building, total, units: weights.map((w) => (total * w) / sum) };
}

/** Local currency to mint (rounded to whole mint). */
export function toMint(amount: number, prices: Prices) {
  return Math.round(amount / prices.perMint);
}

/** A short price: "₥45,000" / "₥1.2m". */
export function shortMint(mint: number) {
  if (mint >= 1_000_000) return `₥${(mint / 1_000_000).toFixed(mint >= 10_000_000 ? 0 : 1)}m`;
  if (mint >= 100_000) return `₥${Math.round(mint / 1000)}k`;
  return `₥${mint.toLocaleString("en-GB")}`;
}

/**
 * The money amounts are shown in beside mint, chosen by each player (they can change it any
 * time): what one of each is worth in naira, roughly (the region's prices are in naira).
 */
export const CURRENCIES = [
  { code: "NGN", symbol: "₦", name: "Naira", naira: 1 },
  { code: "USD", symbol: "$", name: "US dollar", naira: 1550 },
  { code: "GBP", symbol: "£", name: "British pound", naira: 2050 },
  { code: "EUR", symbol: "€", name: "Euro", naira: 1780 },
  { code: "CAD", symbol: "C$", name: "Canadian dollar", naira: 1120 },
  { code: "GHS", symbol: "GH₵", name: "Ghana cedi", naira: 100 },
  { code: "KES", symbol: "KSh", name: "Kenyan shilling", naira: 12 },
  { code: "ZAR", symbol: "R", name: "South African rand", naira: 88 },
] as const;
export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

let shown: CurrencyCode = "NGN";
/** Show amounts in this currency from now on (the screens show it the next time they draw). */
export function setShownCurrency(code: string) {
  if (CURRENCIES.some((c) => c.code === code)) shown = code as CurrencyCode;
}
export const shownCurrency = () => shown;

/** A short local price, in the player's chosen currency: "₦148m" / "$95k" / "£1.2". */
export function shortLocal(amount: number, prices: Prices) {
  const c = CURRENCIES.find((x) => x.code === shown) ?? CURRENCIES[0];
  // The region's prices are in its own money (naira); other currencies convert from it.
  const own = c.code === "NGN" || prices.symbol !== "₦";
  const s = own ? prices.symbol : c.symbol;
  const v = own ? amount : amount / c.naira;
  const one = (n: number, whole: boolean) => (whole ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ""));
  if (v >= 1e9) return `${s}${one(v / 1e9, v >= 1e10)}bn`;
  if (v >= 1e6) return `${s}${one(v / 1e6, v >= 1e8)}m`;
  if (v >= 1e3) return `${s}${v >= 1e4 ? Math.round(v / 1e3) : one(v / 1e3, false)}k`;
  if (v >= 10) return `${s}${Math.round(v)}`;
  return `${s}${v.toFixed(2).replace(/\.00$/, "")}`;
}

/** Mint in the player's chosen money, short: ₥60,000 in Lagos is "₦90m". */
export function mintLocal(mint: number, prices: Prices) {
  return shortLocal(mint * prices.perMint, prices);
}
