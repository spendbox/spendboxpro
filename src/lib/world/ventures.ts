// Careers: your business story (docs/LIFE_WHEEL.md, phase 5). You choose what to start (a suya spot,
// a buka, a POS kiosk, a tech startup...) and it grows in stages, Idea → Stall → Shop → Brand →
// Empire, or fails. Each business has numbers you don't see directly (customers, quality, staff
// mood, risk, its own cash), shown to you in words. Every day it makes or loses money; when it makes
// some you're paid your share, up to a cap for its stage (so businesses can't print money). Business
// moments, two or three a week, test you (./venture-moments.ts), and what you choose moves the
// numbers. If its cash runs out there's a crisis; get it wrong and it closes. Failing isn't the end:
// you keep your home, and you can start again.
//
// Pure rules, shared by the phone (to show it) and the server (which runs the days and pays you,
// game-db/115). Amounts are in naira; the server turns them into mint.

export type VentureKindId = "suya" | "buka" | "fashion" | "pos" | "salon" | "dispatch" | "events" | "poultry" | "tech" | "import";

export type VentureKind = {
  id: VentureKindId;
  name: string;
  emoji: string;
  /** What it is, in a line. */
  about: string;
  /** What starting it costs you (naira). */
  start: number;
  /** What a customer spends a day, on average (naira). */
  price: number;
  /** How fast word spreads (1: average). */
  growth: number;
  /** How risky the trade is (0 to 100, the starting risk). */
  risk: number;
  /** What its customers are called. */
  customers: string;
};

export const VENTURE_KINDS: VentureKind[] = [
  { id: "suya", name: "Suya spot", emoji: "🍢", about: "Grilled beef, onions and pepper, from dusk.", start: 150_000, price: 1_500, growth: 1.1, risk: 15, customers: "customers a night" },
  { id: "buka", name: "Buka", emoji: "🍲", about: "Amala, ewedu and stew for the street.", start: 200_000, price: 2_000, growth: 1, risk: 15, customers: "plates a day" },
  { id: "fashion", name: "Fashion house", emoji: "🧵", about: "Agbada, gowns and aso-ebi, made to measure.", start: 250_000, price: 4_000, growth: 0.8, risk: 20, customers: "clients" },
  { id: "pos", name: "POS kiosk", emoji: "🏧", about: "Cash out, transfers and airtime under an umbrella.", start: 120_000, price: 800, growth: 1.2, risk: 30, customers: "customers a day" },
  { id: "salon", name: "Salon", emoji: "💇🏾", about: "Braids, barbing and gist.", start: 180_000, price: 3_000, growth: 0.9, risk: 10, customers: "heads a day" },
  { id: "dispatch", name: "Dispatch riders", emoji: "🏍️", about: "Parcels across Lagos before the go-slow wakes up.", start: 300_000, price: 2_500, growth: 1, risk: 35, customers: "deliveries a day" },
  { id: "events", name: "Event planning", emoji: "🎉", about: "Owambes, weddings and canopies that don't fall down.", start: 200_000, price: 8_000, growth: 0.7, risk: 25, customers: "bookings" },
  { id: "poultry", name: "Poultry farm", emoji: "🐔", about: "Eggs and chickens for the city's kitchens.", start: 250_000, price: 2_500, growth: 0.9, risk: 30, customers: "buyers" },
  { id: "tech", name: "Tech startup", emoji: "💻", about: "An app that solves one Lagos problem very well.", start: 400_000, price: 1_000, growth: 1.4, risk: 40, customers: "users paying" },
  { id: "import", name: "Import and export", emoji: "🚢", about: "Containers through Apapa, if the papers are right.", start: 500_000, price: 6_000, growth: 0.9, risk: 45, customers: "buyers" },
];
export const VENTURE_KIND_BY_ID = new Map(VENTURE_KINDS.map((k) => [k.id, k]));

/**
 * The stages: what it takes to be ready for the next, what each pays you a day at most (an Empire
 * has no limit), how many customers its premises hold (an Empire's have no end), and how fast word
 * spreads there (`pace`: the bigger it is, the harder it is to grow).
 */
export const VENTURE_STAGES = [
  { name: "Idea", grow: { customers: 25, cash: 40_000 }, upkeep: 2_000, cap: 150_000, room: 40, expand: 30_000, pace: 1 },
  { name: "Stall", grow: { customers: 100, cash: 250_000 }, upkeep: 8_000, cap: 500_000, room: 150, expand: 200_000, pace: 0.9 },
  { name: "Shop", grow: { customers: 400, cash: 1_200_000 }, upkeep: 30_000, cap: 1_500_000, room: 600, expand: 1_000_000, pace: 0.75 },
  { name: "Brand", grow: { customers: 1_600, cash: 6_000_000 }, upkeep: 120_000, cap: 5_000_000, room: 2_500, expand: 5_000_000, pace: 0.6 },
  { name: "Empire", grow: null, upkeep: 400_000, cap: Infinity, room: Infinity, expand: 0, pace: 0.45 },
] as const;

/** An Empire keeps growing, ever more slowly: word spreads less the bigger it already is. */
export const EMPIRE_SCALE = 5_000;
export const EMPIRE = VENTURE_STAGES.length - 1;

/** What a member of staff costs a day (naira), and how many customers each (and you) can serve. */
export const WAGE = 3_000;
export const SERVES = { owner: 20, staff: 25 };
/** The days a business can catch up at once (it waits while you're away longer). */
export const MAX_CATCH_UP_DAYS = 7;
/** Your share of a good day's profit (the rest stays in the business, to grow it). */
export const DRAW = 0.6;

/** A business's numbers. */
export type Venture = {
  kind: VentureKindId;
  name: string;
  stage: number;
  /** Its own money (naira; below 0: in trouble). */
  cash: number;
  customers: number;
  /** 0 to 100. */
  quality: number;
  mood: number;
  risk: number;
  staff: number;
  /** Your share of it (1: all yours; an investor may own part). */
  share: number;
  /** The best stage it reached. */
  best: number;
  /** All it has paid you (naira). */
  paid: number;
  /** The last 30 days' profit (naira), oldest first. */
  days: number[];
};

export function newVenture(kind: VentureKindId, name: string): Venture {
  const k = VENTURE_KIND_BY_ID.get(kind)!;
  return { kind, name, stage: 0, cash: Math.round(k.start * 0.3), customers: 5, quality: 55, mood: 65, risk: k.risk, staff: 0, share: 1, best: 0, paid: 0, days: [] };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** How many customers it can serve: you and your staff, within what its premises hold. */
export const capacity = (v: Venture) => Math.min(VENTURE_STAGES[v.stage].room, SERVES.owner + v.staff * SERVES.staff);

/**
 * One day of business: customers spend, costs are paid, word spreads (or doesn't), and sometimes
 * something goes wrong (more often the riskier it is). Returns the business after the day and what
 * it pays you (naira, within the stage's cap).
 */
export function ventureDay(v: Venture, rand: () => number): { venture: Venture; pay: number; profit: number } {
  const k = VENTURE_KIND_BY_ID.get(v.kind)!;
  const st = VENTURE_STAGES[v.stage];
  const served = Math.min(v.customers, capacity(v));
  const margin = 0.25 + v.quality / 400;
  const revenue = served * k.price * (0.9 + rand() * 0.2);
  let profit = revenue * margin - st.upkeep - v.staff * WAGE;
  // Something goes wrong: a theft, a fine, spoiled stock.
  if (rand() < v.risk / 1000) profit -= revenue * 0.5 + st.upkeep * 3;
  // Word of mouth: quality and happy staff bring people; a full house turns some away.
  const tougher = st.pace * (v.stage === EMPIRE ? 1 / (1 + v.customers / EMPIRE_SCALE) : 1);
  const raw = (((v.quality - 50) / 50) * 0.022 + ((v.mood - 50) / 50) * 0.007) * k.growth;
  // Bigger is harder to grow; bad news travels at full speed.
  const spread = raw > 0 ? raw * tougher : raw;
  const full = v.customers > capacity(v) ? -0.01 : 0;
  // A new business finds its first customers one by one.
  const customers = clamp(v.customers * (1 + spread + full) + (spread > 0 && v.stage === 0 ? 0.5 : 0), 0, st.room * 1.2);
  const pay = profit > 0 ? Math.min(st.cap, profit * DRAW * v.share) : 0;
  const kept = profit > 0 ? profit - profit * DRAW * v.share : profit;
  const next: Venture = {
    ...v,
    cash: Math.round(v.cash + kept),
    customers: Math.round(customers * 10) / 10,
    // Moods settle back towards content.
    mood: clamp(Math.round(v.mood + (60 - v.mood) * 0.05), 0, 100),
    paid: Math.round(v.paid + pay),
    days: [...v.days, Math.round(profit)].slice(-30),
  };
  return { venture: next, pay: Math.round(pay), profit: Math.round(profit) };
}

/** Days of business since it was last counted (at most MAX_CATCH_UP_DAYS). */
export function ventureDays(v: Venture, days: number, rand: () => number) {
  let cur = v;
  let pay = 0;
  for (let i = 0; i < Math.min(MAX_CATCH_UP_DAYS, Math.max(0, Math.floor(days))); i++) {
    const d = ventureDay(cur, rand);
    cur = d.venture;
    pay += d.pay;
  }
  return { venture: cur, pay };
}

/** Hours between business moments (two or three a week), in a crisis, and before the first one after starting. */
export const BUSINESS_EVERY_H = 56;
export const CRISIS_EVERY_H = 12;
export const FIRST_MOMENT_H = 6;

/** What it still needs for the next stage: customers and cash, now and needed (null at Empire). */
export function nextStage(v: Venture) {
  const g = VENTURE_STAGES[v.stage].grow;
  if (!g) return null;
  return { name: VENTURE_STAGES[v.stage + 1].name, customers: { now: Math.round(v.customers), need: g.customers }, cash: { now: Math.round(v.cash), need: growCash(v) } };
}

/** What a decision did to the business, in words ("+10% customers", "quality down"). */
export function changeWords(c: VentureChange): string[] {
  const out: string[] = [];
  const pts = (v: number | undefined, up: string, down: string) => {
    if (!v) return;
    out.push(v > 0 ? up : down);
  };
  if (c.customers) out.push(`${c.customers > 0 ? "+" : "−"}${Math.round(Math.abs(c.customers) * 100)}% customers`);
  pts(c.quality, "better work", "worse work");
  pts(c.mood, "happier staff", "unhappier staff");
  pts(c.risk, "more risk", "less risk");
  if (c.staff) out.push(`${c.staff > 0 ? "+" : "−"}${Math.abs(c.staff)} staff`);
  if (c.cash) out.push(c.cash > 0 ? "cash in" : "cash out");
  if (c.sell) out.push(`sold ${Math.round(c.sell * 100)}%`);
  if (c.grow) out.push("grew a stage");
  if (c.close) out.push("closed");
  return out;
}

/** Its cash has run out: a crisis. */
export const inCrisis = (v: Venture) => v.cash < 0;
/** So far gone it closes by itself (a month of upkeep in the red). */
export const goneUnder = (v: Venture) => v.cash < -VENTURE_STAGES[v.stage].upkeep * 30 - 50_000;
/** The cash it needs to grow, scaled to its trade (a POS kiosk's takings are small, an importer's large). */
export function growCash(v: Venture) {
  const g = VENTURE_STAGES[v.stage].grow;
  const k = VENTURE_KIND_BY_ID.get(v.kind)!;
  return g ? Math.round(g.cash * clamp(k.price / 2_000, 0.5, 2)) : Infinity;
}

/** Ready for the next stage: enough customers and cash. */
export function readyToGrow(v: Venture) {
  const g = VENTURE_STAGES[v.stage].grow;
  return !!g && v.customers >= g.customers && v.cash >= growCash(v);
}

/** What a business moment's outcome does to it (./venture-moments.ts). */
export type VentureChange = {
  /** Its cash: this many times the moment's amount (below 0: it pays). */
  cash?: number;
  /** Customers: by this share (0.2: a fifth more). */
  customers?: number;
  quality?: number;
  mood?: number;
  risk?: number;
  staff?: number;
  /** Up a stage (paying the stage's cost to expand from its cash). */
  grow?: boolean;
  /** An investor takes this share of it. */
  sell?: number;
  /** It closes. */
  close?: boolean;
};

export function applyChange(v: Venture, c: VentureChange, ask: number): { venture: Venture; closed: boolean } {
  let next: Venture = {
    ...v,
    cash: Math.round(v.cash + (c.cash ?? 0) * ask),
    customers: Math.max(0, Math.round(v.customers * (1 + (c.customers ?? 0)) * 10) / 10),
    quality: clamp(v.quality + (c.quality ?? 0), 0, 100),
    mood: clamp(v.mood + (c.mood ?? 0), 0, 100),
    risk: clamp(v.risk + (c.risk ?? 0), 0, 100),
    staff: Math.max(0, v.staff + (c.staff ?? 0)),
    share: c.sell ? Math.max(0.1, Math.round(v.share * (1 - c.sell) * 100) / 100) : v.share,
  };
  if (c.grow && v.stage < EMPIRE) {
    const stage = v.stage + 1;
    next = { ...next, stage, best: Math.max(v.best, stage), cash: next.cash - VENTURE_STAGES[v.stage].expand };
  }
  return { venture: next, closed: !!c.close };
}

/** How it's doing, in words (the numbers stay hidden). */
export function ventureWords(v: Venture) {
  const q = v.quality >= 75 ? "People rave about it" : v.quality >= 55 ? "Good, solid work" : v.quality >= 35 ? "People have had better" : "Complaints every day";
  const m = v.mood >= 70 ? "Your staff are happy" : v.mood >= 45 ? "Your staff are fine" : v.mood >= 25 ? "Your staff grumble" : "Your staff are close to leaving";
  const r = v.risk >= 60 ? "Living dangerously" : v.risk >= 35 ? "Some risk" : "Safe and steady";
  return { quality: q, mood: v.staff > 0 ? m : "Just you so far", risk: r };
}
