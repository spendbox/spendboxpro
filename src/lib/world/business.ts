// Real businesses on the map (docs/BUSINESS.md): a business leases one building by the month, gives it
// its name, logo and real details, and it lights up for everyone. Upgrades make it stand out more,
// and any upgrade puts it on the city's billboards. Landmarks can't be leased, nor buildings players
// own. Shared by the server (prices are worked out here, never taken from the browser) and screens.

import type { BuildingKind } from "./buildings.ts";

/**
 * A month's lease by the size of the building, in naira, before the area's own price. A building
 * costs at least 3 times what billboard ads alone do (₦5,000 a week, so ₦20,000 for 4 weeks): it
 * comes with the billboards, and a building with your name on it besides.
 */
const BASE: Record<BuildingKind, number> = {
  shops: 60_000,
  mixed: 72_000,
  rooming: 60_000,
  bungalow: 60_000,
  land: 60_000,
  farm: 60_000,
  duplex: 180_000,
  terrace: 180_000,
  flats: 240_000,
  warehouse: 240_000,
  offices: 360_000,
  plaza: 720_000,
  apartments: 720_000,
  glass: 1_500_000,
};

/** Billboard ads alone: the smallest a month (4 weeks at the smallest weekly budget). */
export const BILLBOARD_MONTH_MIN = 20_000;
/** Every lease is between these (naira a month): 3 times billboards alone at the least, up to ₦3m for a glass tower in Ikoyi. */
export const LEASE_MIN = BILLBOARD_MONTH_MIN * 3;
export const LEASE_MAX = 3_000_000;

/** How many months a building can be taken for at once (more any time after, a month at a time). */
export const LEASE_MONTHS = [1, 3, 6, 12] as const;

/**
 * What a building costs to lease for a month (naira): its size, and how dear its area is (land in
 * Ikoyi costs about 30 times land in Ajegunle; a lease about 3 times). Rounded to ₦5,000.
 */
export function leasePrice(kind: BuildingKind, landPerM2: number) {
  const area = Math.min(2, Math.max(0.6, Math.pow(Math.max(1, landPerM2) / 150_000, 0.3)));
  const naira = Math.min(LEASE_MAX, Math.max(LEASE_MIN, BASE[kind] * area));
  return Math.round(naira / 5_000) * 5_000;
}

/** A lease's price a month (naira) from what was paid: leases from before monthly ones were a year at four times a month's price. */
export const monthlyOf = (priceNaira: number, months: number | null) => (months && months > 0 ? priceNaira / months : priceNaira / 4);

export const CATEGORIES = [
  "Food and drink",
  "Shop",
  "Fashion and beauty",
  "Health",
  "Education",
  "Tech",
  "Finance",
  "Property",
  "Transport and logistics",
  "Events and entertainment",
  "Services",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Kinds a leased building can be turned into. */
export const BUSINESS_KINDS: { kind: BuildingKind; label: string }[] = [
  { kind: "shops", label: "Shopfronts" },
  { kind: "mixed", label: "Shop with flats above" },
  { kind: "plaza", label: "Shopping plaza" },
  { kind: "offices", label: "Office block" },
  { kind: "glass", label: "Glass tower" },
  { kind: "warehouse", label: "Warehouse" },
];

export type Upgrade = { id: "bright" | "rebuild" | "storey" | "month"; label: string; what: string };

export const UPGRADES: Upgrade[] = [
  { id: "month", label: "Another month", what: "Keep your building and billboards 30 more days." },
  { id: "bright", label: "Bright sign", what: "Your building glows brighter and your logo shows bigger, day and night." },
  { id: "rebuild", label: "Refit", what: "Turn the building into another kind: shopfronts, a plaza, offices, a glass tower..." },
  { id: "storey", label: "Add a storey", what: "One more floor. From a month after your lease starts." },
];

/** What an upgrade costs (naira), from the lease's monthly price: another month is a month; a bright sign flat; a refit 40% of a month, a storey a month. */
export function upgradePrice(id: Upgrade["id"], monthlyNaira: number) {
  if (id === "month") return Math.round(monthlyNaira / 1_000) * 1_000;
  if (id === "bright") return 15_000;
  if (id === "rebuild") return Math.max(10_000, Math.round((monthlyNaira * 0.4) / 5_000) * 5_000);
  return Math.max(15_000, Math.round(monthlyNaira / 5_000) * 5_000);
}

/** Days after a lease starts before a storey can be added. */
export const STOREY_AFTER_DAYS = 30;

/** A business as the map shows it. */
export type MapBusiness = {
  id: string;
  /** The building it leases ("lagos:12,-40"). */
  building: string;
  name: string;
  category: string;
  about: string;
  address: string;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  logo: string | null;
  /** Its design on the billboards (the logo until one is uploaded). */
  billboardImage?: string | null;
  /** 1 a soft glow; 2 a bright sign. */
  glow: number;
  kind: BuildingKind | null;
  storeys: number | null;
  /** On the billboards (any upgrade puts it there). */
  billboard: boolean;
};

/** What people do with a business on the map, counted for its owner. */
export type BusinessHit = "tap" | "view" | "call" | "whatsapp" | "website" | "directions" | "billboard";
export const BUSINESS_HITS: BusinessHit[] = ["tap", "view", "call", "whatsapp", "website", "directions", "billboard"];
