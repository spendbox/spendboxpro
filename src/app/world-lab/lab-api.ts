// A pretend wallet for the world lab (no sign-in, nothing saved to the server): the same rules as
// the real thing (game-db/038_property.sql), kept in this browser, so buying, letting and naming
// can be tried out on the real map.

import { makePlan, spiralIndex, tileAt, type CityPlan } from "@/lib/city/layout";
import { regionMap } from "@/lib/world";
import type { Building } from "@/lib/world/buildings";
import { cleanPropertyName, ownedSpot } from "@/lib/world/owned";
import { BUY_TAX, rentPerDay, type AssetUnit, type Neighbour, type PropertyApi, type PropertyResult, type WorkStatus } from "@/lib/world/property-api";
import { toMint, valueOf } from "@/lib/world/value";
import { fareMint, fareOrBus, payDay, settle, skillLevel, tripKmBetween, type Commute } from "@/lib/world/work";
import { workplaceById } from "@/lib/world/workplace";
import { FIRST_NAMES, SURNAMES } from "@/lib/npc/names";
import { hash } from "@/lib/city/noise";

type Saved = {
  coins: number;
  region: string | null;
  home: string | null;
  units: (AssetUnit & { collectedAt: number })[];
  buildings: Record<string, { building: Building; name: string | null }>;
  job?: (NonNullable<WorkStatus["job"]> & { paid: number }) | null;
  skills?: Record<string, number>;
};

/** Pretend neighbours for the lab (nobody else plays here): the same few for the same home. */
function pretendNeighbours(home: string, building: Building | undefined): Neighbour[] {
  const bid = home.split("/")[0];
  const m = /:(-?\d+),(-?\d+)/.exec(bid);
  if (!m) return [];
  const seed = Math.floor(hash(Number(m[1]), Number(m[2]), 77) * 1e6);
  const pick = (k: number) => `${FIRST_NAMES[(seed + k * 7919) % FIRST_NAMES.length]} ${SURNAMES[(seed + k * 104729) % SURNAMES.length][0]}.`;
  const out: Neighbour[] = [];
  const others = (building?.units ?? []).filter((u) => u.id !== home && u.use === "home");
  const inside = Math.min(others.length, seed % 3);
  for (let k = 0; k < inside; k++) out.push({ name: pick(k), sameBuilding: true, unit: others[(seed + k) % others.length].label, building: bid, tiles: 0 });
  const around = 1 + (seed % 4);
  for (let k = 0; k < around; k++) {
    const dx = ((seed >> k) % 9) - 4 || 1;
    const dz = ((seed >> (k + 3)) % 9) - 4;
    out.push({ name: pick(k + 5), sameBuilding: false, unit: null, building: `${bid.split(":")[0]}:${Number(m[1]) + dx},${Number(m[2]) + dz}`, tiles: Math.round(Math.hypot(dx, dz) * 10) / 10 });
  }
  return out.sort((a, b) => a.tiles - b.tiles);
}

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
  /** Pay the job up to now, as the database would. */
  const settleNow = () => {
    const j = s.job;
    if (!j || !s.home) return { days: 0, gross: 0, tax: 0, fares: 0, net: 0 };
    const map = regionMap(j.place.split(":")[0])!;
    const fare = fareOrBus(j.mode as Commute, tripKmBetween(s.home, j.place) ?? 0, map.region.prices);
    const now = Date.now();
    const pay = settle({ payDay: j.payDay, paidUntil: j.paid }, now, s.skills?.[j.skill] ?? 0, fare);
    pay.fares = Math.min(pay.fares, Math.round((s.coins + pay.gross - pay.tax) * 100) / 100);
    pay.net = Math.round((pay.gross - pay.tax - pay.fares) * 100) / 100;
    s.coins = Math.round((s.coins + pay.net) * 100) / 100;
    s.skills = { ...s.skills, [j.skill]: (s.skills?.[j.skill] ?? 0) + pay.days };
    j.paid = now;
    return pay;
  };
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
      settleNow();
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
    async workStatus() {
      if (!s.job) return { job: null, skills: s.skills ?? {} };
      const { paid, ...job } = s.job;
      return { job: { ...job, paidUntil: new Date(paid).toISOString() }, skills: s.skills ?? {} };
    },
    async takeJob(placeId, jobId, mode) {
      if (!s.region) return fail("Start your life first.");
      if (!s.home) return fail("Buy a home first: you need somewhere to live before you can work.");
      const region = placeId.split(":")[0];
      const map = regionMap(region);
      const place = map ? workplaceById(planFor(region), placeId) : null;
      const job = place?.jobs.find((j) => j.job === jobId);
      if (!map || !place || !job) return fail("That job isn't there any more.");
      if (s.job?.place === placeId && s.job.job === jobId) return fail("That's already your job.");
      if (skillLevel(s.skills?.[job.skill] ?? 0) < job.level) return fail(`This job needs level ${job.level} in its skill. Start lower and work up.`);
      const km = tripKmBetween(s.home, placeId) ?? 0;
      if (fareMint(mode, km, map.region.prices) === null) return fail("It's too far to get there that way.");
      const pay = settleNow();
      s.job = { place: placeId, placeName: place.name, job: job.job, title: job.title, skill: job.skill, payDay: payDay(job, map.region.prices), mode, hiredAt: new Date().toISOString(), paidUntil: "", paid: Date.now() };
      save();
      return { ok: true, coins: s.coins, pay };
    },
    async setCommute(mode) {
      if (!s.job || !s.home) return fail("You don't have a job right now.");
      const map = regionMap(s.job.place.split(":")[0])!;
      if (fareMint(mode, tripKmBetween(s.home, s.job.place) ?? 0, map.region.prices) === null) return fail("It's too far to go that way.");
      const pay = settleNow();
      s.job.mode = mode;
      save();
      return { ok: true, coins: s.coins, pay };
    },
    async collectPay() {
      const pay = settleNow();
      save();
      return { ok: true, coins: s.coins, pay };
    },
    async quitJob() {
      const pay = settleNow();
      s.job = null;
      save();
      return { ok: true, coins: s.coins, pay };
    },
    async neighbours() {
      if (!s.home) return [];
      return pretendNeighbours(s.home, s.buildings[s.home.split("/")[0]]?.building);
    },
    async buildingOwners(buildingId) {
      return s.units.filter((u) => u.building === buildingId).map((u) => ({ unit: u.unit, name: "You", mine: true }));
    },
  };
}
