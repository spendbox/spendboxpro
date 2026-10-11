// Real businesses on the map (docs/BUSINESS.md): a business leases one building for a year, gives it
// its name, logo and real details, and it lights up for everyone. Upgrades make it stand out more,
// and any upgrade puts it on the city's billboards. Landmarks can't be leased, nor buildings players
// own. Shared by the server (prices are worked out here, never taken from the browser) and screens.

import type { BuildingKind } from "./buildings.ts";

/** A yearly lease by the size of the building, in naira, before the area's own price. */
const BASE: Record<BuildingKind, number> = {
  shops: 20_000,
  mixed: 25_000,
  rooming: 20_000,
  bungalow: 20_000,
  land: 20_000,
  farm: 20_000,
  duplex: 60_000,
  terrace: 60_000,
  flats: 80_000,
  warehouse: 80_000,
  offices: 120_000,
  plaza: 250_000,
  apartments: 250_000,
  glass: 600_000,
};

/** Every lease is between these (naira a year): ₦20,000 for a shopfront in a quiet area, up to ₦1m for a glass tower in Ikoyi. */
export const LEASE_MIN = 20_000;
export const LEASE_MAX = 1_000_000;

/**
 * What a building costs to lease for a year (naira): its size, and how dear its area is (land in
 * Ikoyi costs about 30 times land in Ajegunle; a lease about 3 times). Rounded to ₦5,000.
 */
export function leasePrice(kind: BuildingKind, landPerM2: number) {
  const area = Math.min(2, Math.max(0.6, Math.pow(Math.max(1, landPerM2) / 150_000, 0.3)));
  const naira = Math.min(LEASE_MAX, Math.max(LEASE_MIN, BASE[kind] * area));
  return Math.round(naira / 5_000) * 5_000;
}

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

export type Upgrade = { id: "bright" | "rebuild" | "storey"; label: string; what: string };

export const UPGRADES: Upgrade[] = [
  { id: "bright", label: "Bright sign", what: "Your building glows brighter and your logo shows bigger, day and night." },
  { id: "rebuild", label: "Refit", what: "Turn the building into another kind: shopfronts, a plaza, offices, a glass tower..." },
  { id: "storey", label: "Add a storey", what: "One more floor. From a month after your lease starts." },
];

/** What an upgrade costs (naira): a bright sign is flat; a refit a tenth of the lease, a storey a quarter. */
export function upgradePrice(id: Upgrade["id"], leaseNaira: number) {
  if (id === "bright") return 15_000;
  if (id === "rebuild") return Math.max(10_000, Math.round(leaseNaira / 10 / 5_000) * 5_000);
  return Math.max(15_000, Math.round(leaseNaira / 4 / 5_000) * 5_000);
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
