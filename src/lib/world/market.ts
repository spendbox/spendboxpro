// The player market (docs/MARKET.md; the database part is game-db/046_market.sql): selling to
// other players, offers, tenants and World Bank loans. These numbers match the database's settings.

/** Tax on selling to another player (the seller pays). The buyer pays the 3% purchase tax too. */
export const SALE_TAX = 0.02;
/** Real hours before an unanswered offer lapses. */
export const OFFER_HOURS = 24;
export const OFFERS_OPEN_MAX = 5;
/** Real hours a unit let at fair rent waits for a tenant, on average. */
export const TENANT_WAIT_HOURS = 4;
export const LOAN_RATE = 0.24;
/** The most the World Bank lends: this share of what your property cost. */
export const LOAN_LTV = 0.5;
/** Real hours between loan payments (a game month). */
export const LOAN_MONTH_HOURS = 60;
export const LOAN_MISSES = 3;
export const LOAN_MONTHS = [6, 12, 24] as const;

export type RentLevel = "low" | "fair" | "high";

export const RENT_LEVEL: Record<RentLevel, { label: string; factor: number; wait: number; note: string }> = {
  low: { label: "Cheap", factor: 0.85, wait: 0.4, note: "A tenant soon" },
  fair: { label: "Fair", factor: 1, wait: 1, note: "A tenant in a few hours" },
  high: { label: "High", factor: 1.2, wait: 3, note: "A tenant takes longer" },
};

/** Each game month's payment on a loan of this much over this many game months. */
export function instalment(amount: number, months: number, rate = LOAN_RATE) {
  const r = rate / 12;
  return Math.round(((amount * r) / (1 - Math.pow(1 + r, -months))) * 100) / 100;
}

/** What a buyer pays for a price (with the purchase tax), and what the seller gets (less the sale tax). */
export const buyerPays = (price: number, buyTax: number) => Math.round(price * (1 + buyTax) * 100) / 100;
export const sellerGets = (price: number) => Math.round(price * (1 - SALE_TAX) * 100) / 100;

/** An offer, made or received. */
export type Offer = {
  id: string;
  unit: string;
  label: string | null;
  price: number;
  counter: number | null;
  status: "open" | "countered" | "accepted" | "refused" | "withdrawn" | "lapsed" | "void";
  expiresAt: string;
  /** The other side: the owner (offers you made) or the bidder (offers you got). */
  who: string;
};

export type Loan = { id: string; principal: number; balance: number; rate: number; instalment: number; months: number; nextDue: string; missed: number };

export type MarketBoard = { made: Offer[]; received: Offer[]; loan: Loan | null; canBorrow: number; rate: number; misses: number };

/** A unit for sale by a player. */
export type Listing = { unit: string; building: string; label: string; use: string; price: number; who: string; mine?: boolean };
