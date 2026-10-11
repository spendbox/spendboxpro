// A pretend wallet for the world lab (no sign-in, nothing saved to the server): the same rules as
// the real thing (game-db/038_property.sql), kept in this browser, so buying, letting and naming
// can be tried out on the real map.

import { makePlan, spiralIndex, tileAt, type CityPlan } from "@/lib/city/layout";
import { regionMap } from "@/lib/world";
import type { Building } from "@/lib/world/buildings";
import { cleanPropertyName, ownedSpot } from "@/lib/world/owned";
import { BUY_TAX, rentPerDay, type AssetUnit, type PropertyApi, type PropertyResult } from "@/lib/world/property-api";
import { toMint, valueOf } from "@/lib/world/value";

type Saved = {
  coins: number;
  region: string | null;
  home: string | null;
  units: (AssetUnit & { collectedAt: number })[];
  buildings: Record<string, { building: Building; name: string | null }>;
};

const KEY = "newtown.world-lab.wallet";

export function makeLabApi(budget: number): PropertyApi {
  let s: Saved = { coins: 0, region: null, home: null, units: [], buildings: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = JSON.parse(raw) as Saved;
  } catch {
    // A private window: start fresh each time.
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // Not saved; fine for a lab.
    }
  };
  const plans = new Map<string, CityPlan>();
  const planFor = (region: string) => {
    let p = plans.get(region);
    if (!p) {
      const map = regionMap(region)!;
      p = makePlan(map.region.seed, map);
      plans.set(region, p);
    }
    return p;
  };
  const fail = (error: string): PropertyResult => ({ ok: false, error });
  const accrue = () => {
    const now = Date.now();
    let rent = 0;
    for (const u of s.units) {
      if (!u.let) continue;
      rent += (u.rentDay * (now - u.collectedAt)) / 86_400_000;
      u.collectedAt = now;
    }
    return Math.round(rent * 0.9 * 100) / 100;
  };
  return {
    async startLife(region) {
      if (!s.region) {
        s.region = region;
        s.coins += budget;
        save();
      }
      return { ok: true, coins: s.coins };
    },
    async buyUnit(unitId) {
      const [bid, k] = unitId.split("/");
      const spot = ownedSpot(bid);
      if (!spot || !s.region) return fail("Start your life first.");
      if (s.units.some((u) => u.unit === unitId)) return fail("Someone has just bought that one.");
      const map = regionMap(spot.region)!;
      const building = s.buildings[bid]?.building ?? tileAt(planFor(spot.region), spiralIndex(spot.x, spot.z)).building;
      const unit = building?.units[Number(k)];
      if (!building || !unit) return fail("That property isn't there.");
      if (!s.home && unit.use !== "home") return fail("Buy a home first: somewhere to live comes before anything else.");
      const price = Math.max(1, toMint(valueOf(building, map.landPriceAt(spot.x, spot.z), map.region.prices).units[Number(k)], map.region.prices));
      const cost = Math.round(price * (1 + BUY_TAX) * 100) / 100;
      if (s.coins < cost) return fail(`You need ₥${cost.toLocaleString("en-GB")} for that (with the 3% tax).`);
      s.coins = Math.round((s.coins - cost) * 100) / 100;
      s.buildings[bid] ??= { building, name: null };
      s.units.push({ unit: unitId, building: bid, label: unit.label, use: unit.use, area: unit.area, price, rentDay: rentPerDay(price, unit.use), let: false, boughtAt: new Date().toISOString(), name: null, waiting: 0, collectedAt: Date.now() });
      const home = !s.home;
      if (home) s.home = unitId;
      save();
      return { ok: true, coins: s.coins, home };
    },
    async setHome(unitId) {
      const u = s.units.find((x) => x.unit === unitId && x.use === "home");
      if (!u) return fail("That isn't yours.");
      u.let = false;
      s.home = unitId;
      save();
      return { ok: true };
    },
    async letUnit(unitId, on) {
      const u = s.units.find((x) => x.unit === unitId);
      if (!u) return fail("That isn't yours.");
      if (on && s.home === unitId) return fail("That's your home. Move somewhere else first to let it out.");
      const rent = accrue();
      s.coins += rent;
      u.let = on;
      save();
      return { ok: true, coins: s.coins, rent };
    },
    async collectRent() {
      const rent = accrue();
      s.coins = Math.round((s.coins + rent) * 100) / 100;
      save();
      return { ok: true, coins: s.coins, rent };
    },
    async renameBuilding(buildingId, name) {
      const b = s.buildings[buildingId];
      const mine = s.units.filter((u) => u.building === buildingId).length;
      if (!b || mine < b.building.units.length) return fail("You can name a building once you own all of it.");
      const clean = name.trim() ? cleanPropertyName(name) : null;
      if (name.trim() && !clean) return fail("Names are 2 to 40 letters and numbers.");
      b.name = clean;
      save();
      return { ok: true };
    },
    async myAssets() {
      const now = Date.now();
      return {
        life: s.region ? { region: s.region, home_unit: s.home, granted: budget, started_at: "" } : null,
        coins: s.coins,
        units: s.units.map((u) => ({ ...u, name: s.buildings[u.building]?.name ?? null, waiting: u.let ? Math.round(((u.rentDay * (now - u.collectedAt)) / 86_400_000) * 0.9 * 100) / 100 : 0 })),
      };
    },
    async ownedBuildings() {
      return Object.entries(s.buildings).map(([id, b]) => ({ id, building: b.building, name: b.name }));
    },
    async buildingOwners(buildingId) {
      return s.units.filter((u) => u.building === buildingId).map((u) => ({ unit: u.unit, name: "You", mine: true }));
    },
  };
}
