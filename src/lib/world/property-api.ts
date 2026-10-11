// What the game asks about property and how: the same shape whether it's the real game (server
// actions, src/app/play/property-actions.ts) or the world lab's pretend wallet (no sign-in), so
// the screens don't care which.

import type { Building, UnitUse } from "./buildings.ts";
import type { BusinessHit, MapBusiness } from "./business.ts";
import type { Exercise } from "./day.ts";
import type { ServiceBoard, ServiceForm } from "./services.ts";
import type { Budget, Pot } from "./living.ts";
import type { Commute } from "./work.ts";

/** What collecting pay came to (mint): game days, pay, income tax, fares, what's left. */
export type PaySettled = { days: number; gross: number; tax: number; fares: number; net: number; hustle?: { gross: number; tax: number; net: number } };

export type PropertyResult = { ok: true; coins?: number; home?: boolean; rent?: number; pay?: PaySettled } | { ok: false; error: string };

export type AssetUnit = {
  unit: string;
  building: string;
  label: string;
  use: UnitUse;
  area: number;
  /** What you paid (mint). */
  price: number;
  rentDay: number;
  let: boolean;
  boughtAt: string;
  /** The building's own name, if its owner gave it one. */
  name: string | null;
  /** Rent earned and not yet collected. */
  waiting: number;
};

export type AssetsData = {
  life: { region: string; home_unit: string | null; granted: number; started_at: string } | null;
  coins: number;
  units: AssetUnit[];
};

export type OwnedBuildingRow = { id: string; building: Building; name: string | null };
export type BuildingOwner = { unit: string; name: string; mine: boolean };

/** Your job on the real map (if any) and your skills (game days worked in each). */
export type WorkStatus = {
  job: { place: string; placeName: string; job: string; title: string; skill: string; payDay: number; mode: Commute; hiredAt: string; paidUntil: string } | null;
  skills: Record<string, number>;
};

/** Someone whose home is near yours. Which unit is only shown when it's in your building. */
export type Neighbour = { name: string; sameBuilding: boolean; unit: string | null; building: string; tiles: number };

/** Your life now (health, bills, budget and pots, school, treats), brought up to now. */
export type LifeStatus = {
  health: number;
  powerOwed: number;
  wasteOwed: number;
  powerCut: boolean;
  budget: Budget;
  recoveringUntil: string | null;
  wallet: number;
  pots: Partial<Record<Pot, number>>;
  courses: { course: string; title: string; cert: string | null; startedAt: string; endsAt: string; done: boolean }[];
  procedures: { procedure: string; title: string; at: string }[];
  /** Pay the state owes you (essential services, when the treasury was short). */
  payOwed: number;
  /** Your home's bills a game day (mint). */
  bills: { power: number; waste: number } | null;
  mind: number;
  exercise: Exercise;
  hustle: { hustle: string; title: string; skill: string; payDay: number; swing: number; hours: number; paidUntil: string; boost: number; boostUntil: string | null; stalledUntil: string | null } | null;
  /** A breakthrough waiting for your answer. */
  event: { id: string; source: "job" | "hustle"; key: string; title: string; expiresAt: string; text: string; choices: string[] } | null;
};

export type InterviewStart = { ok: true; token: string; questions: { id: string; q: string; options: string[] }[]; need: number; title: string } | { ok: false; error: string };
export type InterviewResult = { ok: true; passed: boolean; score: number; need: number; ticket?: string } | { ok: false; error: string };
export type EventResult = { ok: true; won: boolean; said: string; bonus: number; stall?: number } | { ok: false; error: string };

/** Money in (positive) and out (negative) by kind over a time (see groupOf in ./living). */
export type MoneyFlow = Record<string, number>;

export type PropertyApi = {
  startLife: (region: string) => Promise<PropertyResult>;
  buyUnit: (unitId: string) => Promise<PropertyResult>;
  setHome: (unitId: string) => Promise<PropertyResult>;
  letUnit: (unitId: string, on: boolean) => Promise<PropertyResult>;
  collectRent: () => Promise<PropertyResult>;
  renameBuilding: (buildingId: string, name: string) => Promise<PropertyResult>;
  myAssets: () => Promise<AssetsData | null>;
  ownedBuildings: (region: string) => Promise<OwnedBuildingRow[]>;
  buildingOwners: (buildingId: string) => Promise<BuildingOwner[]>;
  workStatus: () => Promise<WorkStatus | null>;
  takeJob: (placeId: string, job: string, mode: Commute, ticket?: string) => Promise<PropertyResult>;
  setCommute: (mode: Commute) => Promise<PropertyResult>;
  collectPay: () => Promise<PropertyResult>;
  quitJob: () => Promise<PropertyResult>;
  neighbours: () => Promise<Neighbour[]>;
  lifeStatus: () => Promise<LifeStatus | null>;
  setBudget: (budget: Budget) => Promise<PropertyResult>;
  movePot: (from: Pot | "wallet", to: Pot | "wallet", amount: number) => Promise<PropertyResult>;
  care: (id: string) => Promise<PropertyResult>;
  procedure: (id: string) => Promise<PropertyResult>;
  enrol: (id: string) => Promise<PropertyResult>;
  money: (hours: number) => Promise<MoneyFlow>;
  lifeTime: (hours: number) => Promise<Record<string, number>>;
  startHustle: (id: string) => Promise<PropertyResult>;
  stopHustle: () => Promise<PropertyResult>;
  setExercise: (ex: Exercise) => Promise<PropertyResult>;
  interviewStart: (placeId: string, job: string) => Promise<InterviewStart>;
  interviewSubmit: (token: string, answers: number[]) => Promise<InterviewResult>;
  answerEvent: (choice: number) => Promise<EventResult>;
  /** Pay for a starter pack: a Paystack page to go to (or, in the lab, the mint at once). */
  startPack: (pack: string, region: string) => Promise<{ ok: true; url?: string; coins?: number } | { ok: false; error: string }>;
  confirmPack: (reference: string) => Promise<{ ok: boolean; mint?: number; error?: string }>;
  mapBusinesses: (region: string) => Promise<MapBusiness[]>;
  hitBusiness: (id: string, kind: BusinessHit) => Promise<void>;
  serviceBoard: () => Promise<ServiceBoard | null>;
  serviceOffer: (f: ServiceForm) => Promise<PropertyResult>;
  serviceRequest: (f: ServiceForm) => Promise<PropertyResult>;
  serviceClose: (id: string) => Promise<PropertyResult>;
  serviceBook: (offerId: string) => Promise<PropertyResult>;
  serviceTake: (requestId: string) => Promise<PropertyResult>;
  serviceJob: (jobId: string, action: "done" | "confirm" | "decline" | "cancel") => Promise<PropertyResult>;
};

/** The purchase tax (the database's property_buy_tax), for showing what a unit really costs. */
export const BUY_TAX = 0.03;

/**
 * What a unit earns a day while let (mint): homes about 6% of their value a game year, business
 * units about 9%, land nothing. A game year is a real month (docs/LIFE.md), so a real day is a
 * thirtieth of that.
 */
export function rentPerDay(value: number, use: UnitUse) {
  const yearly = use === "home" ? 0.06 : use === "land" ? 0 : 0.09;
  return Math.round(((value * yearly) / 30) * 100) / 100;
}
