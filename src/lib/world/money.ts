// What counts as earning, living costs and buying things to keep, for "am I up or down?"
// (Finance and Income). The database's life_money_days (game-db/050_economy_items.sql) uses the
// same lists; keep them together.

import type { MoneyDay } from "./property-api.ts";

/** Money that came in: pay, side hustles, rent, sales. */
export const EARNED_KINDS = ["work_pay", "public_pay", "hustle_pay", "bonus", "rent", "property_sale", "item_sale", "car_sale", "service_pay"];
/** What living cost: tax, bills, getting about, health, school, fees, loan payments. */
export const COST_KINDS = [
  "income_tax", "rent_tax", "vat", "sale_tax", "power_bill", "waste_bill", "commute", "health_care", "gym", "school_fees",
  "procedure", "loan_repay", "market_fee", "item_tax", "car_running", "fine",
];
/** Spent on things you keep (they count in what you're worth). */
export const BOUGHT_KINDS = ["property_buy", "property_tax", "hustle_start", "item_buy", "car_buy", "craft_cost"];

/** Day by day from a list of money moves (the world lab's pretend ledger): the last `days` Lagos days, oldest first. */
export function moneyDaysOf(log: { at: number; kind: string; amount: number }[], days: number, now = Date.now()): MoneyDay[] {
  const LAGOS = 3_600_000; // UTC+1
  const dayOf = (t: number) => new Date(t + LAGOS).toISOString().slice(0, 10);
  const out: MoneyDay[] = [];
  for (let k = days - 1; k >= 0; k--) out.push({ day: dayOf(now - k * 86_400_000), earned: 0, costs: 0, bought: 0 });
  const at = new Map(out.map((d) => [d.day, d]));
  for (const x of log) {
    const d = at.get(dayOf(x.at));
    if (!d) continue;
    if (x.amount > 0 && EARNED_KINDS.includes(x.kind)) d.earned += x.amount;
    else if (x.amount < 0 && COST_KINDS.includes(x.kind)) d.costs -= x.amount;
    else if (x.amount < 0 && BOUGHT_KINDS.includes(x.kind)) d.bought -= x.amount;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return out.map((d) => ({ ...d, earned: r2(d.earned), costs: r2(d.costs), bought: r2(d.bought) }));
}
