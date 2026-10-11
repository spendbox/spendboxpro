// Living on the real map (docs/LIVING.md): your money in pots, bills for your home, your health,
// courses, and things you can buy for yourself (from a check-up to a BBL). Shared by the server
// (which works out every price, never trusting the phone), the screens and the world lab. The
// database side is game-db/040_living.sql, which follows the same rules.
//
// Prices are real Lagos ones for now, in naira, turned into mint with the region's rate.

import type { Prices } from "./region.ts";
import type { Cert, WorkSkill } from "./work.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;
const mint = (naira: number, prices: Prices) => r2(naira / prices.perMint);

// ---------------------------------------------------------------- pots and the budget

/** Where money you earn goes. What isn't set aside stays in your wallet, to spend on anything. */
export type Pot = "essentials" | "travel" | "savings" | "fun";
export const POTS: Pot[] = ["essentials", "travel", "savings", "fun"];

export const POT_INFO: Record<Pot | "wallet", { label: string; what: string; colour: string }> = {
  essentials: { label: "Essentials", what: "Electricity, waste and check-ups, paid by themselves", colour: "#2f9e44" },
  travel: { label: "Travel", what: "Fares to work and back", colour: "#f08c00" },
  savings: { label: "Savings", what: "For your next property and for school", colour: "#1971c2" },
  fun: { label: "Treats", what: "Looks and other treats", colour: "#d6336c" },
  wallet: { label: "Wallet", what: "Free to spend on anything", colour: "#495057" },
};

/** Percent of each income set aside in each pot; the rest goes to your wallet. */
export type Budget = Record<Pot, number>;

export const BUDGET_PRESETS: { id: string; label: string; budget: Budget }[] = [
  { id: "balanced", label: "Balanced", budget: { essentials: 25, travel: 15, savings: 20, fun: 10 } },
  { id: "saver", label: "Big saver", budget: { essentials: 25, travel: 15, savings: 45, fun: 0 } },
  { id: "treat", label: "Treat myself", budget: { essentials: 25, travel: 15, savings: 5, fun: 30 } },
  { id: "none", label: "Spend it all", budget: { essentials: 0, travel: 0, savings: 0, fun: 0 } },
];
export const DEFAULT_BUDGET = BUDGET_PRESETS[0].budget;

/** A budget made sensible: whole percents from 0 to 100, together no more than 100. */
export function cleanBudget(b: Partial<Budget>): Budget {
  const out = { essentials: 0, travel: 0, savings: 0, fun: 0 } as Budget;
  let left = 100;
  for (const p of POTS) {
    const v = Math.max(0, Math.min(left, Math.round(Number(b[p]) || 0)));
    out[p] = v;
    left -= v;
  }
  return out;
}

/** How an income is shared out: so much into each pot, the rest into your wallet. */
export function splitIncome(amount: number, budget: Budget): Record<Pot | "wallet", number> {
  const out = { wallet: 0 } as Record<Pot | "wallet", number>;
  let left = r2(amount);
  for (const p of POTS) {
    out[p] = r2((amount * budget[p]) / 100);
    left = r2(left - out[p]);
  }
  out.wallet = left;
  return out;
}

// ---------------------------------------------------------------- bills

/** Electricity costs about ₦200 a kWh; a home uses about 2 kWh a m² a month. Never less than ₦4,000. */
const POWER_PER_M2 = 400;
const POWER_MIN = 4_000;
/** Waste collection (paid to the state): ₦1,500 a month for a room, more for bigger homes. */
const WASTE_PER_M2 = 30;
const WASTE_MIN = 1_500;

/** A home's bills a game day (mint), from its floor area. */
export function billsFor(area: number, prices: Prices) {
  const power = Math.max(POWER_MIN, area * POWER_PER_M2);
  const waste = Math.max(WASTE_MIN, area * WASTE_PER_M2);
  return { power: mint(power / 30, prices), waste: mint(waste / 30, prices), powerMonth: power, wasteMonth: waste };
}

/** Owing more than this many game days of electricity: the power is cut until you pay. */
export const CUT_OFF_DAYS = 7;

// ---------------------------------------------------------------- health

export const HEALTH_START = 80;
/** Health lost each game day (2 real hours). */
export const HEALTH_DECAY = 1.5;
/** Below this you're unwell: half pay. Below BEDRIDDEN, no work at all. */
export const SICK_BELOW = 30;
export const BEDRIDDEN_BELOW = 10;
/** Check-ups happen by themselves (from Essentials) when health drops below this. */
export const AUTO_CARE_BELOW = 50;

/** VAT on private health care and treats (into the treasuries). */
export const VAT = 0.075;

/**
 * Care for body or mind: what it gives to each (100 = back to full), and game days away from work
 * (a holiday). Public care is cheap and its fee goes to the state; private care costs more, plus VAT.
 */
export type Care = { id: string; meter: "body" | "mind"; title: string; what: string; fee: number; health: number; mind?: number; away?: number; public: boolean };

export const CARE: Care[] = [
  { id: "clinic", meter: "body", title: "Check-up at a public clinic", what: "A quick check and medicine. The fee goes to the state.", fee: 5_000, health: 25, public: true },
  { id: "hospital", meter: "body", title: "Private hospital visit", what: "A doctor, tests and treatment.", fee: 35_000, health: 45, public: false },
  { id: "full", meter: "body", title: "Full medical (private)", what: "Everything checked and treated: back to full health.", fee: 150_000, health: 100, public: false },
  { id: "counselling", meter: "mind", title: "Counselling at a public centre", what: "Someone to talk things through with. The fee goes to the state.", fee: 10_000, health: 0, mind: 20, public: true },
  { id: "therapist", meter: "mind", title: "A private therapist", what: "An hour with a therapist who listens.", fee: 40_000, health: 0, mind: 40, public: false },
  { id: "holiday", meter: "mind", title: "A weekend away", what: "Three game days at the beach in Badagry: no work, all rest.", fee: 250_000, health: 10, mind: 60, away: 3, public: false },
];
export const AUTO_CARE = CARE[0];

/** How much of a day's pay you get at this health: all, half when unwell, none when bedridden. */
export function payFactor(health: number) {
  return health < BEDRIDDEN_BELOW ? 0 : health < SICK_BELOW ? 0.5 : 1;
}

export function healthWord(health: number) {
  if (health >= 80) return "Feeling great";
  if (health >= AUTO_CARE_BELOW) return "Doing fine";
  if (health >= SICK_BELOW) return "Run down";
  if (health >= BEDRIDDEN_BELOW) return "Unwell: half pay";
  return "Bedridden: no work";
}

// ---------------------------------------------------------------- looks

export type Procedure = { id: string; title: string; fee: number; recovery: number };

/** Cosmetic procedures at a private clinic (plus VAT). Recovery is game days off work. */
export const PROCEDURES: Procedure[] = [
  { id: "teeth_whitening", title: "Teeth whitening", fee: 150_000, recovery: 0 },
  { id: "veneers", title: "Veneers", fee: 1_200_000, recovery: 2 },
  { id: "hair_transplant", title: "Hair transplant", fee: 2_000_000, recovery: 7 },
  { id: "liposuction", title: "Liposuction", fee: 2_000_000, recovery: 10 },
  { id: "rhinoplasty", title: "Nose job", fee: 2_500_000, recovery: 10 },
  { id: "bbl", title: "BBL", fee: 3_500_000, recovery: 14 },
];

// ---------------------------------------------------------------- learning

/** What kind of course: a short course, a diploma or certificate, a degree, a licence. */
export type CourseKind = "short" | "diploma" | "degree" | "licence";

export const COURSE_KINDS: { kind: CourseKind; label: string; what: string }[] = [
  { kind: "short", label: "Short courses", what: "A few game days: a quick step up in a skill" },
  { kind: "diploma", label: "Diplomas and certificates", what: "Professional qualifications that open skilled jobs" },
  { kind: "degree", label: "Degrees", what: "Long, and the way into the top jobs" },
  { kind: "licence", label: "Licences", what: "Training for a licensed job" },
];

export type Course = {
  id: string;
  kind: CourseKind;
  title: string;
  /** Who runs it: public (cheap, the fee goes to the state) or private. */
  public: boolean;
  fee: number;
  /** Game days it takes (you can work while you study). */
  days: number;
  skill: WorkSkill;
  /** Game days of experience it counts as, in its skill. */
  grants: number;
  cert?: Cert;
};

export const COURSES: Course[] = [
  { id: "sales", kind: "short", title: "Sales and customer service", public: false, fee: 30_000, days: 5, skill: "retail", grants: 20 },
  { id: "computer", kind: "short", title: "Computer skills", public: false, fee: 50_000, days: 10, skill: "office", grants: 20 },
  { id: "catering", kind: "diploma", title: "Catering and hotel management", public: true, fee: 120_000, days: 30, skill: "hospitality", grants: 45 },
  { id: "teaching", kind: "diploma", title: "Teacher training (NCE)", public: true, fee: 150_000, days: 60, skill: "education", grants: 20, cert: "teaching" },
  { id: "ican", kind: "diploma", title: "Chartered accountancy (ICAN)", public: false, fee: 400_000, days: 60, skill: "finance", grants: 45, cert: "ican" },
  { id: "nursing", kind: "diploma", title: "Nursing diploma", public: true, fee: 300_000, days: 90, skill: "health", grants: 45, cert: "nursing" },
  { id: "masters", kind: "degree", title: "Master's degree", public: true, fee: 600_000, days: 120, skill: "education", grants: 125, cert: "masters" },
  { id: "mbbs", kind: "degree", title: "Medicine (MBBS)", public: true, fee: 1_500_000, days: 360, skill: "health", grants: 180, cert: "mbbs" },
  { id: "pilot", kind: "licence", title: "Pilot licence", public: false, fee: 30_000_000, days: 180, skill: "transport", grants: 320, cert: "pilot" },
];

export const CERT_LABEL: Record<Cert, string> = {
  nursing: "Nursing diploma",
  mbbs: "Medical degree",
  pilot: "Pilot licence",
  teaching: "Teaching certificate",
  masters: "Master's degree",
  ican: "ICAN",
};

export const courseById = (id: string) => COURSES.find((c) => c.id === id);
export const careById = (id: string) => CARE.find((c) => c.id === id);
export const procedureById = (id: string) => PROCEDURES.find((p) => p.id === id);

/** What something costs in mint, with VAT when it's private and not schooling. */
export function priceOf(fee: number, prices: Prices, vat: boolean) {
  const base = mint(fee, prices);
  const tax = vat ? r2(base * VAT) : 0;
  return { base, tax, total: r2(base + tax) };
}

// ---------------------------------------------------------------- where money went

/** Money in and out, by kind (the ledger's kinds), in groups people understand. */
export type MoneyGroup = "pay" | "rent" | "tax" | "bills" | "travel" | "health" | "school" | "looks" | "loan" | "property" | "borrowed" | "other";

export const MONEY_GROUP: Record<MoneyGroup, { label: string; colour: string }> = {
  pay: { label: "Pay", colour: "#2f9e44" },
  rent: { label: "Rent", colour: "#37b24d" },
  tax: { label: "Tax", colour: "#7048e8" },
  bills: { label: "Bills", colour: "#f59f00" },
  travel: { label: "Travel", colour: "#f08c00" },
  health: { label: "Health", colour: "#e03131" },
  school: { label: "School", colour: "#1971c2" },
  looks: { label: "Looks", colour: "#d6336c" },
  loan: { label: "Loan", colour: "#0c8599" },
  property: { label: "Property", colour: "#495057" },
  borrowed: { label: "Borrowed", colour: "#0c8599" },
  other: { label: "Other", colour: "#868e96" },
};

const KIND_GROUP: Record<string, MoneyGroup> = {
  work_pay: "pay",
  public_pay: "pay",
  hustle_pay: "pay",
  bonus: "pay",
  gym: "health",
  hustle_start: "other",
  rent: "rent",
  income_tax: "tax",
  rent_tax: "tax",
  property_tax: "tax",
  vat: "tax",
  power_bill: "bills",
  waste_bill: "bills",
  commute: "travel",
  health_care: "health",
  school_fees: "school",
  procedure: "looks",
  property_buy: "property",
  property_sale: "property",
  sale_tax: "property",
  loan: "borrowed",
  loan_repay: "loan",
};

export const groupOf = (kind: string): MoneyGroup => KIND_GROUP[kind] ?? "other";
