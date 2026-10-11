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

// ---- the land market: what land is worth moves with time, area by area
//
// Every neighbourhood (about 3 km across) has its own slow cycle, up and down a few percent over a
// few game months, on top of gentle growth for the whole city (3% a game year). Worked out from
// the clock and the spot, the same on every phone and on the server, so the price you see is the
// price you pay. Buildings don't move with it (they cost what they cost to build).

/** When the market started: every index is 1 here. */
const MARKET_START = Date.UTC(2026, 9, 1);
/** A game month in real milliseconds (60 real hours; docs/MARKET.md). */
export const GAME_MONTH_MS = 60 * 3600_000;
/** How much land in the whole city grows in a game year. */
const GROWTH = 0.03;
/** How wide each area of the market is (tiles). */
const MARKET_CELL = 30;

function cellRand(cx: number, cz: number, k: number) {
  const v = Math.sin(cx * 127.1 + cz * 311.7 + k * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

/** The cycle of one market area at a time (game months since the start). */
function cellCycle(cx: number, cz: number, months: number) {
  const amp = 0.02 + cellRand(cx, cz, 1) * 0.05;
  const period = 3 + cellRand(cx, cz, 2) * 6;
  const phase = cellRand(cx, cz, 3) * Math.PI * 2;
  return amp * (Math.sin((2 * Math.PI * months) / period + phase) - Math.sin(phase));
}

/** How land at a spot is priced now against when the market started (1 = the same). */
export function landIndex(x: number, z: number, at = Date.now()) {
  const months = (at - MARKET_START) / GAME_MONTH_MS;
  const fx = x / MARKET_CELL;
  const fz = z / MARKET_CELL;
  const cx = Math.floor(fx);
  const cz = Math.floor(fz);
  const tx = fx - cx;
  const tz = fz - cz;
  // Blended between the four nearest areas, so prices never jump at an area's edge.
  const c = (dx: number, dz: number) => cellCycle(cx + dx, cz + dz, months);
  const cycle = (c(0, 0) * (1 - tx) + c(1, 0) * tx) * (1 - tz) + (c(0, 1) * (1 - tx) + c(1, 1) * tx) * tz;
  return Math.max(0.5, (1 + (GROWTH * months) / 12) * (1 + cycle));
}

/** What land costs at a spot right now (per m²): the map's price moved by the market. */
export function landNow(region: { landPriceAt: (x: number, z: number) => number }, x: number, z: number, at = Date.now()) {
  return region.landPriceAt(x, z) * landIndex(x, z, at);
}

/**
 * How a property's worth has moved: over the last game month (a fraction, +0.024 = up 2.4%), and
 * its worth at the end of each of the last `points` game months up to now (oldest first), for a
 * little chart.
 */
export function worthTrend(b: Building, region: { landPriceAt: (x: number, z: number) => number }, x: number, z: number, prices: Prices, points = 6, at = Date.now()) {
  const worth = (t: number) => valueOf(b, landNow(region, x, z, t), prices).total;
  const history = Array.from({ length: points }, (_, k) => worth(at - (points - 1 - k) * GAME_MONTH_MS));
  const before = worth(at - GAME_MONTH_MS);
  return { month: before > 0 ? history[points - 1] / before - 1 : 0, history };
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
  /** The game's own money, for those who'd rather count in it. */
  { code: "MINT", symbol: "₥", name: "Mint", naira: 0 },
] as const;
export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

// Every amount in the game is kept in mint; players see it in their chosen currency (naira by
// default in Lagos), never both. A mint is worth the region's perMint in naira.
let shown: CurrencyCode = "NGN";
let perMint = 1500;
/** Show amounts in this currency from now on (the screens show it the next time they draw). */
export function setShownCurrency(code: string, nairaPerMint?: number) {
  if (CURRENCIES.some((c) => c.code === code)) shown = code as CurrencyCode;
  if (nairaPerMint && nairaPerMint > 0) perMint = nairaPerMint;
}
export const shownCurrency = () => shown;
const current = () => CURRENCIES.find((x) => x.code === shown) ?? CURRENCIES[0];

/** Mint in the chosen currency, as a number. */
export function toShown(mint: number) {
  const c = current();
  return c.code === "MINT" ? mint : (mint * perMint) / c.naira;
}
/** An amount typed in the chosen currency, back in mint. */
export function fromShown(amount: number) {
  const c = current();
  return c.code === "MINT" ? amount : (amount * c.naira) / perMint;
}
/** The chosen currency's sign: "₦", "$", "₥"... */
export const cashSymbol = () => current().symbol;

/**
 * An amount of mint in the player's currency: "₦4,500", "₦1.2m", "$3.10", "₥1,240". Big amounts
 * are shortened unless `full` (net worth) asks for every digit.
 */
export function cash(mint: number, opts: { full?: boolean } = {}) {
  const s = cashSymbol();
  const v = toShown(mint);
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  const one = (n: number) => n.toFixed(n >= 100 ? 0 : 1).replace(/\.0$/, "");
  if (!opts.full && a >= 1e9) return `${sign}${s}${one(a / 1e9)}bn`;
  if (!opts.full && a >= 1e6) return `${sign}${s}${one(a / 1e6)}m`;
  const digits = a >= 100 || Number.isInteger(a) ? 0 : 2;
  return `${sign}${s}${a.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** A short local price, in the player's chosen currency: "₦148m" / "$95k" / "£1.2". */
export function shortLocal(amount: number, prices: Prices) {
  const c = current();
  if (c.code === "MINT") return shortMint(Math.round(amount / prices.perMint));
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
