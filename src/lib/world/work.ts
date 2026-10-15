// Working on the real map (docs/WORK.md): who hires where, what they pay, how skills grow, and what
// it costs to get to work. Shared by the server (which works out pay and fares from the map, never
// trusting the phone), the screens, and the world lab's pretend wallet. The database side is
// game-db/039_work.sql, which follows the same rules.
//
// Pay is real Lagos wages for now: what a job pays a month, in naira, turned into mint per game
// day (a game month is 30 game days; a game day is 2 real hours, see docs/LIFE.md). Other places
// will get their own list when they open.

import { everyday } from "./price-level.ts";
import type { Building } from "./buildings.ts";
import type { Prices } from "./region.ts";

export type WorkSkill = "retail" | "office" | "finance" | "industry" | "building" | "farming" | "hospitality" | "health" | "transport" | "tourism" | "education" | "public" | "entertainment" | "beauty" | "food" | "tech";

export const WORK_SKILLS: Record<WorkSkill, string> = {
  retail: "Selling",
  office: "Office work",
  finance: "Finance",
  industry: "Industry",
  building: "Building",
  farming: "Farming",
  hospitality: "Hospitality",
  health: "Health care",
  transport: "Transport",
  tourism: "Tourism",
  education: "Education",
  public: "Public service",
  entertainment: "Entertainment",
  beauty: "Beauty",
  food: "Cooking",
  tech: "Tech repairs",
};

/** A certificate some jobs need, earned by finishing a course (src/lib/world/living.ts). */
export type Cert = "nursing" | "mbbs" | "pilot" | "teaching" | "masters" | "ican";

/**
 * A job: an id (stable), its title, the skill it builds, pay a month (local money), the skill
 * level it needs, a certificate it needs, and whether it's an essential public service (paid by
 * the state from taxes, not by a business).
 */
export type WorkJob = { job: string; title: string; skill: WorkSkill; month: number; level: number; cert?: Cert; state?: boolean };

const J = (job: string, title: string, skill: WorkSkill, month: number, level = 0, more: { cert?: Cert; state?: boolean } = {}): WorkJob => ({ job, title, skill, month, level, ...more });
/** An essential public service: paid by the state from taxes. */
const S = { state: true };

/** Who works in each kind of building, from the first job anyone can get up to the best. */
const BY_BUILDING: Partial<Record<Building["kind"], WorkJob[]>> = {
  shops: [J("shop_assistant", "Shop assistant", "retail", 80_000), J("shop_supervisor", "Shop supervisor", "retail", 150_000, 2)],
  mixed: [J("shop_assistant", "Shop assistant", "retail", 80_000)],
  plaza: [J("sales_assistant", "Sales assistant", "retail", 90_000), J("store_manager", "Store manager", "retail", 300_000, 3), J("accountant", "Accountant", "finance", 350_000, 3, { cert: "ican" })],
  offices: [J("office_assistant", "Office assistant", "office", 100_000), J("admin_officer", "Admin officer", "office", 200_000, 2), J("accountant", "Accountant", "finance", 350_000, 3, { cert: "ican" }), J("manager", "Manager", "office", 600_000, 5)],
  glass: [J("receptionist", "Receptionist", "office", 150_000), J("analyst", "Analyst", "finance", 500_000, 3), J("manager", "Manager", "office", 1_200_000, 6)],
  warehouse: [J("loader", "Loader", "industry", 80_000), J("forklift", "Forklift operator", "industry", 150_000, 2), J("warehouse_manager", "Warehouse manager", "industry", 350_000, 4)],
  farm: [J("farm_hand", "Farm hand", "farming", 60_000), J("farm_manager", "Farm manager", "farming", 200_000, 3)],
};

/** Who works at each kind of landmark (a market, the airport, a hospital...). */
const BY_PLACE: Record<string, WorkJob[]> = {
  market: [J("porter", "Market porter", "retail", 60_000), J("trader_assistant", "Trader's assistant", "retail", 80_000), J("market_trader", "Market trader", "retail", 200_000, 2)],
  megamall: [J("sales_assistant", "Sales assistant", "retail", 100_000), J("cashier", "Cashier", "retail", 120_000, 1), J("store_manager", "Store manager", "retail", 400_000, 3)],
  hotel: [J("housekeeper", "Housekeeper", "hospitality", 90_000), J("hotel_receptionist", "Receptionist", "hospitality", 150_000, 1), J("chef", "Chef", "hospitality", 250_000, 3), J("hotel_manager", "Hotel manager", "hospitality", 900_000, 6)],
  hospital: [J("hospital_porter", "Hospital porter", "health", 80_000, 0, S), J("nurse", "Nurse", "health", 300_000, 3, { ...S, cert: "nursing" }), J("doctor", "Doctor", "health", 900_000, 6, { ...S, cert: "mbbs" })],
  intlairport: [J("airport_cleaner", "Airport cleaner", "transport", 80_000), J("check_in", "Check-in agent", "tourism", 250_000, 1), J("cabin_crew", "Cabin crew", "tourism", 600_000, 3), J("pilot", "Pilot", "transport", 3_000_000, 8, { cert: "pilot" })],
  airport: [J("airport_cleaner", "Airport cleaner", "transport", 80_000), J("check_in", "Check-in agent", "tourism", 250_000, 1)],
  port: [J("dock_worker", "Dock worker", "industry", 120_000), J("crane_operator", "Crane operator", "industry", 300_000, 3), J("port_manager", "Port manager", "industry", 1_000_000, 6)],
  campus: [J("campus_cleaner", "Cleaner", "education", 70_000, 0, S), J("lab_assistant", "Lab assistant", "education", 150_000, 1, S), J("lecturer", "Lecturer", "education", 450_000, 5, { ...S, cert: "masters" })],
  school: [J("school_cleaner", "Cleaner", "education", 70_000, 0, S), J("teacher", "Teacher", "education", 150_000, 2, { ...S, cert: "teaching" })],
  capitol: [J("waste_collector", "Waste collector", "public", 80_000, 0, S), J("messenger", "Messenger", "public", 70_000, 0, S), J("civil_servant", "Civil servant", "public", 180_000, 2, S), J("director", "Director", "public", 700_000, 6, S)],
  museum: [J("guide", "Guide", "tourism", 100_000), J("curator", "Curator", "tourism", 300_000, 4)],
  arena: [J("steward", "Steward", "entertainment", 70_000), J("groundskeeper", "Groundskeeper", "entertainment", 90_000, 1)],
  stadium: [J("steward", "Steward", "entertainment", 70_000), J("groundskeeper", "Groundskeeper", "entertainment", 90_000, 1)],
  club: [J("bartender", "Bartender", "entertainment", 100_000), J("dj", "DJ", "entertainment", 300_000, 3)],
  bigpark: [J("gardener", "Gardener", "public", 60_000, 0, S)],
  cathedral: [J("caretaker", "Caretaker", "public", 60_000)],
  grandmosque: [J("caretaker", "Caretaker", "public", 60_000)],
  worship: [J("caretaker", "Caretaker", "public", 60_000)],
  fuel: [J("pump_attendant", "Pump attendant", "retail", 70_000), J("fuel_cashier", "Cashier", "retail", 90_000, 1), J("station_manager", "Station manager", "retail", 250_000, 3)],
  restaurant: [J("waiter", "Waiter", "food", 70_000), J("cook", "Cook", "food", 120_000, 1), J("restaurant_manager", "Restaurant manager", "food", 300_000, 3)],
  police: [J("police_clerk", "Station clerk", "public", 90_000, 0, S), J("police_officer", "Police officer", "public", 180_000, 2, S)],
  fire: [J("fire_cleaner", "Station hand", "public", 70_000, 0, S), J("firefighter", "Firefighter", "public", 170_000, 2, S)],
};

/** A building site takes on labourers; an unfinished building takes on nobody. */
const SITE: WorkJob[] = [J("labourer", "Labourer", "building", 70_000), J("site_foreman", "Site foreman", "building", 250_000, 3)];

/** Skilled and better-paid jobs need an interview: a skill level of 2 or more, a certificate, or ₦200,000 a month and up. */
export function needsInterview(j: Pick<WorkJob, "level" | "cert" | "month">) {
  return j.level >= 2 || !!j.cert || j.month >= 200_000;
}

/** The right answers an interview needs (of 5): more for senior jobs, one more when your mind is stressed. */
export function interviewPass(j: Pick<WorkJob, "level" | "month">, stressed: boolean) {
  return Math.min(5, (j.level >= 5 || j.month >= 600_000 ? 4 : 3) + (stressed ? 1 : 0));
}

/** The jobs in a building on the map (none in homes, land or unfinished buildings). */
export function jobsInBuilding(b: Pick<Building, "kind" | "state">): WorkJob[] {
  if (b.state === "site") return SITE;
  if (b.state === "uncompleted") return [];
  return BY_BUILDING[b.kind] ?? [];
}

/** The jobs at a landmark of this type ("market", "hospital"...). */
export function jobsAtPlace(type: string | undefined): WorkJob[] {
  return (type && BY_PLACE[type]) || [];
}

// ---------------------------------------------------------------- pay and skills

/** Real hours in a game day (docs/LIFE.md). */
export const GAME_DAY_HOURS = 2;
/** The most game days of pay waiting for you: collect at least once a game week (14 real hours). */
export const HOLD_DAYS = 7;
/** Income tax on pay (the database's work_income_tax), into the treasuries. */
export const INCOME_TAX = 0.07;
/** Extra pay for each level of the job's skill. */
export const SKILL_BONUS = 0.03;

/**
 * How much more than the real wage the game pays, in every city (real wages left players working
 * at a loss for months: the game should be fun, not harder than real life). At 18 times, the
 * lowest jobs (₦60,000 a month) pay ₥24 a game day, about ₥288 a real day before tax and fares:
 * clearly more than the free taps around the city, so a job is worth having. Every job gets the
 * same raise, so a pilot still earns 50 times a farm hand. Was 4 (part 50); part 65 raised it.
 */
export const PAY_BOOST = 18;

/** Mint every 2 hours (a day in your life) for a job paying `month` local money a month, boosted. */
export function payDay(job: Pick<WorkJob, "month">, prices: Prices) {
  return Math.round(((job.month * PAY_BOOST) / 30 / prices.perMint) * 100) / 100;
}

/** What a job leaves you a game day, after income tax and two trips at `fareTrip` (negative: a loss). */
export function dayNet(payDay: number, skillDays: number, fareTrip: number) {
  return Math.round((payDay * (1 + skillLevel(skillDays) * SKILL_BONUS) * (1 - INCOME_TAX) - 2 * fareTrip) * 100) / 100;
}

/** A skill's level from the game days worked in it: 5 days for level 1, 20 for 2, 45 for 3... with no top. */
export function skillLevel(days: number) {
  return Math.floor(Math.sqrt(Math.max(0, days) / 5));
}

/** Game days worked to reach a level. */
export function daysForLevel(level: number) {
  return 5 * level * level;
}

// ---------------------------------------------------------------- getting to work

/** How you get about; "car" needs a car of your own (src/lib/world/items.ts). */
export type Commute = "walk" | "keke" | "okada" | "danfo" | "taxi" | "car";

export const COMMUTES: Commute[] = ["walk", "keke", "okada", "danfo", "taxi", "car"];

export const COMMUTE_LABEL: Record<Commute, string> = { walk: "Walk", keke: "Keke", okada: "Okada", danfo: "Danfo bus", taxi: "Taxi", car: "My car" };

/** One trip's fare in local money: a start price, so much a km, and how far it'll go (km). */
type Fare = { base: number; perKm: number; maxKm: number };

/**
 * Lagos fares (naira) a trip, at real 2026 prices (after the fuel subsidy went): a keke from ₦200
 * plus about ₦80 a km, a danfo from ₦300 plus ₦40 a km, an okada dearer, a taxi (Bolt / Uber) from
 * ₦1,000 plus ₦300 a km. Your own car is the petrol (about ₦1,050 a litre, 10 km to the litre) and a
 * little for parking. Walking is free but only so far. No fare is capped: Badagry to Epe costs what
 * 180 km costs (only how far a keke or okada will go is limited).
 */
const FARES: Record<Commute, Fare> = {
  walk: { base: 0, perKm: 0, maxKm: 3 },
  keke: { base: 200, perKm: 80, maxKm: 8 },
  okada: { base: 300, perKm: 120, maxKm: 15 },
  danfo: { base: 300, perKm: 40, maxKm: Infinity },
  taxi: { base: 1_000, perKm: 300, maxKm: Infinity },
  car: { base: 200, perKm: 110, maxKm: Infinity },
};

/** A ferry across the lagoon to where no road goes (LAGFERRY): ₦1,000 to cross plus ₦150 a km on the water. */
export const FERRY = { base: 1_000, perKm: 150 };

/** Roads wind: a trip is about this much longer than a straight line. */
const ROAD_FACTOR = 1.3;

/** How far a trip is by road (km) between two tiles (100 m each). */
export function tripKm(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.round(Math.hypot(a.x - b.x, a.z - b.z) * 0.1 * ROAD_FACTOR * 10) / 10;
}

/** How far a trip is from a home ("lagos:12,-40/3") to a workplace ("lagos:20,-31"), in km. */
export function tripKmBetween(homeUnit: string, placeId: string): number | null {
  const a = /:(-?\d+),(-?\d+)/.exec(homeUnit);
  const b = /:(-?\d+),(-?\d+)/.exec(placeId);
  return a && b ? tripKm({ x: Number(a[1]), z: Number(a[2]) }, { x: Number(b[1]), z: Number(b[2]) }) : null;
}

/** What a trip costs the way you go, or by danfo if that way doesn't go so far any more (you moved). */
export function fareOrBus(mode: Commute, km: number, prices: Prices, ferryKm = 0) {
  return fareMint(mode, km, prices, ferryKm) ?? fareMint("danfo", km, prices, ferryKm) ?? 0;
}

/**
 * One trip's fare in mint, or null when that way doesn't go so far. `ferryKm` is the part of the
 * trip over water with no road (src/lib/world/trips.ts): a ferry crossing, the rest on land.
 */
export function fareMint(mode: Commute, km: number, prices: Prices, ferryKm = 0): number | null {
  const f = FARES[mode];
  const land = Math.max(0, km - ferryKm * ROAD_FACTOR);
  if (land > f.maxKm) return null;
  const ferry = ferryKm > 0 ? FERRY.base + FERRY.perKm * ferryKm : 0;
  if (land < 0.2 && !ferry) return 0;
  const road = land < 0.2 ? 0 : f.base + f.perKm * land;
  return Math.round(((road + ferry) / prices.perMint) * 100) / 100;
}

/**
 * A trip across the map to a place (not the commute to work, which stays at real prices while
 * jobs last): the fare at Newtown's everyday price level (src/lib/world/price-level.ts).
 */
export function tripFareMint(mode: Commute, km: number, prices: Prices, ferryKm = 0): number | null {
  const f = fareMint(mode, km, prices, ferryKm);
  return f === null ? null : Math.round(everyday(f) * 100) / 100;
}

/** "by danfo bus", "by ferry and keke", "on foot and by ferry": how a trip goes, for buttons. */
export function tripWords(mode: Commute, ferryKm = 0) {
  if (!ferryKm) return mode === "walk" ? "on foot" : `by ${COMMUTE_LABEL[mode].toLowerCase()}`;
  return mode === "walk" ? "by ferry" : `by ferry and ${COMMUTE_LABEL[mode].toLowerCase()}`;
}

/** The cheapest ride that goes that far (never on foot: for skipping straight there). */
export function cheapestRide(km: number, ferryKm = 0): Commute {
  km = Math.max(0, km - ferryKm * ROAD_FACTOR);
  return km <= FARES.keke.maxKm ? "keke" : "danfo";
}

/** The cheapest way to work that goes that far (walking when it's close enough). */
export function cheapestCommute(km: number, ferryKm = 0): Commute {
  km = Math.max(0, km - ferryKm * ROAD_FACTOR);
  if (km <= FARES.walk.maxKm) return "walk";
  if (km <= FARES.keke.maxKm) return "keke";
  return "danfo";
}

/**
 * Settle a job's pay up to now: the game days since it was last paid (at most HOLD_DAYS), pay with
 * the skill bonus, income tax, and two trips a day to work and back. What the database's
 * life_work_collect does, for the world lab and for showing what's waiting.
 */
export function settle(job: { payDay: number; paidUntil: number }, now: number, skillDays: number, fareTrip: number) {
  const days = Math.max(0, Math.min(HOLD_DAYS, (now - job.paidUntil) / (GAME_DAY_HOURS * 3_600_000)));
  const gross = Math.round(job.payDay * (1 + skillLevel(skillDays) * SKILL_BONUS) * days * 100) / 100;
  const tax = Math.round(gross * INCOME_TAX * 100) / 100;
  const fares = Math.round(2 * fareTrip * days * 100) / 100;
  return { days: Math.round(days * 1000) / 1000, gross, tax, fares, net: Math.round((gross - tax - fares) * 100) / 100 };
}
