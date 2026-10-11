// What the game asks about property and how: the same shape whether it's the real game (server
// actions, src/app/play/property-actions.ts) or the world lab's pretend wallet (no sign-in), so
// the screens don't care which.

import type { Building, UnitUse } from "./buildings.ts";

export type PropertyResult = { ok: true; coins?: number; home?: boolean; rent?: number } | { ok: false; error: string };

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
