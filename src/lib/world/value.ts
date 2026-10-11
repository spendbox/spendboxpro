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

/** A short local price: "₦148m" / "₦4.5m" / "₦1.2bn". */
export function shortLocal(amount: number, prices: Prices) {
  const s = prices.symbol;
  if (amount >= 1e9) return `${s}${(amount / 1e9).toFixed(amount >= 1e10 ? 0 : 1)}bn`;
  if (amount >= 1e6) return `${s}${(amount / 1e6).toFixed(amount >= 1e8 ? 0 : 1)}m`;
  if (amount >= 1e3) return `${s}${Math.round(amount / 1e3)}k`;
  return `${s}${Math.round(amount)}`;
}
