// A pretend wallet for the world lab (no sign-in, nothing saved to the server): the same rules as
// the real thing (game-db/038_property.sql to 040_living.sql), kept in this browser, so buying,
// letting, working, bills, health, school and budgeting can all be tried out on the real map.
// Nobody else plays here, so the state always pays essential workers and neighbours are pretend.

import { makePlan, spiralIndex, tileAt, type CityPlan } from "@/lib/city/layout";
import { regionMap } from "@/lib/world";
import type { Building } from "@/lib/world/buildings";
import { cleanPropertyName, ownedSpot } from "@/lib/world/owned";
import {
  AUTO_CARE,
  AUTO_CARE_BELOW,
  billsFor,
  careById,
  cleanBudget,
  courseById,
  CUT_OFF_DAYS,
  DEFAULT_BUDGET,
  HEALTH_DECAY,
  HEALTH_START,
    POTS,
  priceOf,
  procedureById,
  splitIncome,
  type Budget,
  type Pot,
} from "@/lib/world/living";
import {
  BUY_TAX,
  rentPerDay,
  type AssetUnit,
  type LifeStatus,
  type MoneyFlow,
  type Neighbour,
  type PropertyApi,
  type PropertyResult,
  type WorkStatus,
} from "@/lib/world/property-api";
import { toMint, valueOf } from "@/lib/world/value";
import { fareMint, fareOrBus, GAME_DAY_HOURS, HOLD_DAYS, INCOME_TAX, payDay, SKILL_BONUS, skillLevel, tripKmBetween, type Commute } from "@/lib/world/work";
import { workplaceById } from "@/lib/world/workplace";
import { FIRST_NAMES, SURNAMES } from "@/lib/npc/names";
import { hash } from "@/lib/city/noise";
import { packById } from "@/lib/world/packs";
import { dayOf, dayPlan, EXERCISE, hoursOf, STRESSED_BELOW, workFactor, type Exercise } from "@/lib/world/day";
import { hustleById, hustleDay, hustleStart } from "@/lib/world/hustles";
import { interviewStart, interviewSubmit, labDrawEvent, labMarkEvent } from "@/app/play/interview-actions";
import { needsInterview } from "@/lib/world/work";

type Saved = {
  coins: number;
  region: string | null;
  home: string | null;
  units: (AssetUnit & { collectedAt: number })[];
  buildings: Record<string, { building: Building; name: string | null }>;
  job?: (NonNullable<WorkStatus["job"]> & { paid: number; state?: boolean }) | null;
  skills?: Record<string, number>;
  /** The starting budget so far, and the pack bought (the lab pretends to pay). */
  granted?: number;
  pack?: string;
  life?: {
    budget: Budget;
    pots: Record<Pot, number>;
    health: number;
    healthAt: number;
    billsAt: number;
    powerOwed: number;
    wasteOwed: number;
    powerDay: number;
    recoveringUntil: number | null;
    courses: { course: string; title: string; cert: string | null; skill: string; grants: number; startedAt: number; endsAt: number; done: boolean }[];
    procedures: { procedure: string; title: string; at: number }[];
    log: { kind: string; amount: number; at: number }[];
    mind?: number;
    exercise?: Exercise;
    hustle?: { hustle: string; title: string; skill: string; payDay: number; swing: number; hours: number; paid: number; boost: number; boostUntil: number | null; stalledUntil: number | null } | null;
    hours?: { kind: string; hours: number; at: number }[];
    event?: { token: string; id: string; source: "job" | "hustle"; title: string; text: string; choices: string[]; expiresAt: number } | null;
    eventAt?: number;
    fails?: Record<string, number>;
  };
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = GAME_DAY_HOURS * 3_600_000;

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
  const L = () =>
    (s.life ??= {
      budget: { ...DEFAULT_BUDGET },
      pots: { essentials: 0, travel: 0, savings: 0, fun: 0 },
      health: HEALTH_START,
      healthAt: Date.now(),
      billsAt: Date.now(),
      powerOwed: 0,
      wasteOwed: 0,
      powerDay: 0,
      recoveringUntil: null,
      courses: [],
      procedures: [],
      log: [],
    });
  const prices = () => regionMap(s.region ?? "lagos")!.region.prices;
  const log = (kind: string, amount: number) => {
    if (!amount) return;
    const l = L();
    l.log.push({ kind, amount: r2(amount), at: Date.now() });
    const old = Date.now() - 8 * 86_400_000;
    l.log = l.log.filter((x) => x.at > old);
  };
  /** Pay from these pots in order, then the wallet; returns what was paid. */
  const spend = (pots: Pot[], amount: number) => {
    let left = r2(amount);
    const l = L();
    for (const p of pots) {
      const take = Math.min(l.pots[p], left);
      l.pots[p] = r2(l.pots[p] - take);
      left = r2(left - take);
    }
    const take = Math.min(Math.max(0, s.coins), left);
    s.coins = r2(s.coins - take);
    left = r2(left - take);
    return r2(amount - left);
  };
  const canSpend = (pots: Pot[]) => pots.reduce((t, p) => t + L().pots[p], 0) + Math.max(0, s.coins);
  const income = (amount: number) => {
    if (amount <= 0) return;
    const parts = splitIncome(amount, L().budget);
    for (const p of POTS) L().pots[p] = r2(L().pots[p] + parts[p]);
    s.coins = r2(s.coins + parts.wallet);
  };
  const bills = () => {
    const home = s.units.find((u) => u.unit === s.home);
    if (!home) return null;
    const b = billsFor(home.area, prices());
    return { power: b.power, waste: b.waste };
  };
  /** Bring life up to now, as the database's life_tick does. */
  /** The day as you live it now. */
  const plan = (change: Partial<ReturnType<typeof dayOf>> = {}) => {
    const l = L();
    const course = l.courses.find((c) => !c.done)?.course ?? null;
    const input = dayOf({
      homeUnit: s.home,
      job: s.job ? { place: s.job.place, mode: s.job.mode as Commute } : null,
      hustleHours: l.hustle?.hours ?? 0,
      course,
      exercise: l.exercise ?? "none",
      owing: l.powerOwed + l.wasteOwed > 0,
    });
    return dayPlan({ ...input, ...change });
  };
  const tick = () => {
    const l = L();
    const now = Date.now();
    const p = plan();
    const days = Math.min(30, Math.max(0, (now - l.healthAt) / DAY_MS));
    let health = Math.min(100, Math.max(0, l.health + p.body * days));
    l.mind = r2(Math.min(100, Math.max(0, (l.mind ?? 70) + p.mind * days)));
    const gym = EXERCISE[l.exercise ?? "none"].fee;
    if (gym) {
      const due = r2((gym / 30 / prices().perMint) * days);
      const paid = spend(["essentials"], due);
      log("gym", -paid);
      if (paid < due) l.exercise = "walk";
    }
    if (days > 0.01) for (const [kind, h] of Object.entries(hoursOf(p))) (l.hours ??= []).push({ kind, hours: r2(h * days), at: now });
    l.hours = (l.hours ?? []).filter((x) => x.at > now - 8 * 86_400_000);
    if (l.event && l.event.expiresAt <= now) l.event = null;
    void HEALTH_DECAY;
    const b = bills();
    if (b) {
      const days = Math.min(30, Math.max(0, (now - l.billsAt) / DAY_MS));
      const power = r2(l.powerOwed + b.power * days);
      const waste = r2(l.wasteOwed + b.waste * days);
      const pp = spend(["essentials"], power);
      log("power_bill", -pp);
      const pw = spend(["essentials"], waste);
      log("waste_bill", -pw);
      l.powerOwed = r2(power - pp);
      l.wasteOwed = r2(waste - pw);
      l.powerDay = b.power;
      l.billsAt = now;
    }
    const fee = priceOf(AUTO_CARE.fee, prices(), false).total;
    if (health < AUTO_CARE_BELOW && canSpend(["essentials"]) >= fee) {
      spend(["essentials"], fee);
      log("health_care", -fee);
      health = Math.min(100, health + AUTO_CARE.health);
    }
    l.health = r2(health);
    l.healthAt = now;
    for (const c of l.courses) {
      if (c.done || c.endsAt > now) continue;
      c.done = true;
      s.skills = { ...s.skills, [c.skill]: (s.skills?.[c.skill] ?? 0) + c.grants };
    }
  };
  /** Pay the job up to now, as the database's life_work_collect does. */
  const settleNow = () => {
    tick();
    const j = s.job;
    const none = { days: 0, gross: 0, tax: 0, fares: 0, net: 0 };
    if (!j || !s.home) return none;
    const l = L();
    const now = Date.now();
    const days = Math.max(0, Math.min(HOLD_DAYS, (now - j.paid) / DAY_MS));
    const start = now - days * DAY_MS;
    const rec = l.recoveringUntil && l.recoveringUntil > start ? Math.min(days, (Math.min(now, l.recoveringUntil) - start) / DAY_MS) : 0;
    const factor = workFactor(l.health, l.mind ?? 70);
    const work = factor === 0 ? 0 : Math.max(0, days - rec);
    const gross = r2(j.payDay * (1 + skillLevel(s.skills?.[j.skill] ?? 0) * SKILL_BONUS) * work * factor);
    const tax = r2(gross * INCOME_TAX);
    log(j.state ? "public_pay" : "work_pay", gross);
    log("income_tax", -tax);
    income(gross - tax);
    const fare = fareOrBus(j.mode as Commute, tripKmBetween(s.home, j.place) ?? 0, prices());
    const fares = spend(["travel"], r2(2 * fare * work));
    log("commute", -fares);
    s.skills = { ...s.skills, [j.skill]: (s.skills?.[j.skill] ?? 0) + work };
    j.paid = now;
    return { days: r2(days), gross, tax, fares, net: r2(gross - tax - fares) };
  };
  /** What the side hustle made up to now, as the database's life_hustle_collect does. */
  const settleHustle = () => {
    const l = L();
    const h = l.hustle;
    if (!h) return { gross: 0, tax: 0, net: 0 };
    const now = Date.now();
    const days = Math.max(0, Math.min(HOLD_DAYS, (now - h.paid) / DAY_MS));
    const start = now - days * DAY_MS;
    const over = (until: number | null) => (until && until > start ? Math.min(days, (Math.min(now, until) - start) / DAY_MS) : 0);
    const factor = workFactor(l.health, l.mind ?? 70);
    const work = factor === 0 ? 0 : Math.max(0, days - Math.max(over(h.stalledUntil), over(l.recoveringUntil)));
    const boosted = Math.min(work, over(h.boostUntil));
    const gross = Math.max(0, r2(h.payDay * (1 + skillLevel(s.skills?.[h.skill] ?? 0) * SKILL_BONUS) * (work + boosted * (h.boost - 1)) * factor * (1 + h.swing * (Math.random() * 2 - 1))));
    const tax = r2(gross * INCOME_TAX);
    log("hustle_pay", gross);
    log("income_tax", -tax);
    income(gross - tax);
    s.skills = { ...s.skills, [h.skill]: (s.skills?.[h.skill] ?? 0) + work };
    h.paid = now;
    return { gross, tax, net: r2(gross - tax) };
  };
  /** Now and then a breakthrough (drawn on the server, which keeps the best answer). */
  const maybeEvent = async (days: number) => {
    const l = L();
    if (l.event || (l.eventAt && l.eventAt > Date.now() - 4 * 3_600_000)) return;
    const sources: ["job" | "hustle", string][] = [];
    if (s.job) sources.push(["job", s.job.skill]);
    if (l.hustle) sources.push(["hustle", l.hustle.hustle]);
    for (const [source, of] of sources) {
      const rate = source === "job" ? 1 / 10 : 1 / 6;
      if (Math.random() >= 1 - Math.exp(-rate * Math.min(days, 7))) continue;
      const e = await labDrawEvent(source, of).catch(() => null);
      if (!e) return;
      l.event = { token: e.token, id: e.id, source, title: e.title, text: e.text, choices: [...e.choices], expiresAt: Date.now() + 2 * 3_600_000 };
      l.eventAt = Date.now();
      return;
    }
  };
  /** Rent let units have earned (in full, its 10% tax apart), shared into pots. */
  const accrue = () => {
    tick();
    const now = Date.now();
    let rent = 0;
    for (const u of s.units) {
      if (!u.let) continue;
      rent += (u.rentDay * (now - u.collectedAt)) / 86_400_000;
      u.collectedAt = now;
    }
    rent = r2(rent);
    const tax = r2(rent * 0.1);
    log("rent", rent);
    log("rent_tax", -tax);
    income(rent - tax);
    return r2(rent - tax);
  };
  return {
    async startLife(region) {
      if (!s.region && !s.granted) {
        s.region = region;
        s.coins += budget;
        s.granted = budget;
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
      tick();
      if (s.coins < cost && L().pots.savings > 0) {
        const move = Math.min(L().pots.savings, r2(cost - s.coins));
        L().pots.savings = r2(L().pots.savings - move);
        s.coins = r2(s.coins + move);
      }
      if (s.coins < cost) return fail(`You need ₥${cost.toLocaleString("en-GB")} for that (with the 3% tax).`);
      s.coins = Math.round((s.coins - cost) * 100) / 100;
      log("property_buy", -price);
      log("property_tax", -(cost - price));
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
      u.let = on;
      save();
      return { ok: true, coins: s.coins, rent };
    },
    async collectRent() {
      const rent = accrue();
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
        life: s.region ? { region: s.region, home_unit: s.home, granted: s.granted ?? budget, started_at: "" } : null,
        coins: s.coins,
        units: s.units.map((u) => ({ ...u, name: s.buildings[u.building]?.name ?? null, waiting: u.let ? Math.round(((u.rentDay * (now - u.collectedAt)) / 86_400_000) * 0.9 * 100) / 100 : 0 })),
      };
    },
    async ownedBuildings() {
      return Object.entries(s.buildings).map(([id, b]) => ({ id, building: b.building, name: b.name }));
    },
    async workStatus() {
      if (!s.job) return { job: null, skills: s.skills ?? {} };
      const { paid, state, ...job } = s.job;
      void state;
      return { job: { ...job, paidUntil: new Date(paid).toISOString() }, skills: s.skills ?? {} };
    },
    async takeJob(placeId, jobId, mode, ticket) {
      if (!s.region) return fail("Start your life first.");
      if (!s.home) return fail("Buy a home first: you need somewhere to live before you can work.");
      const region = placeId.split(":")[0];
      const map = regionMap(region);
      const place = map ? workplaceById(planFor(region), placeId) : null;
      const job = place?.jobs.find((j) => j.job === jobId);
      if (!map || !place || !job) return fail("That job isn't there any more.");
      if (s.job?.place === placeId && s.job.job === jobId) return fail("That's already your job.");
      if (skillLevel(s.skills?.[job.skill] ?? 0) < job.level) return fail(`This job needs level ${job.level} in its skill. Start lower and work up.`);
      if (job.cert && !L().courses.some((c) => c.done && c.cert === job.cert)) return fail("This job needs a certificate. Take the course under Life → School.");
      const km = tripKmBetween(s.home, placeId) ?? 0;
      if (fareMint(mode, km, map.region.prices) === null) return fail("It's too far to get there that way.");
      if (needsInterview(job) && !ticket) return fail("This job needs an interview first.");
      if (!plan({ job: true, commute: { mode, km } }).fits) return fail("That won't fit in your day. Drop your side hustle, a course or some exercise first.");
      const pay = settleNow();
      s.job = { place: placeId, placeName: place.name, job: job.job, title: job.title, skill: job.skill, payDay: payDay(job, map.region.prices), mode, hiredAt: new Date().toISOString(), paidUntil: "", paid: Date.now(), state: !!job.state };
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
      const hustle = settleHustle();
      save();
      return { ok: true, coins: s.coins, pay: { ...pay, hustle } };
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
    async lifeStatus(): Promise<LifeStatus | null> {
      if (!s.region) return null;
      const before = L().healthAt;
      tick();
      await maybeEvent((Date.now() - before) / DAY_MS);
      save();
      const l = L();
      const h = l.hustle;
      return {
        mind: l.mind ?? 70,
        exercise: l.exercise ?? "none",
        hustle: h
          ? { hustle: h.hustle, title: h.title, skill: h.skill, payDay: h.payDay, swing: h.swing, hours: h.hours, paidUntil: new Date(h.paid).toISOString(), boost: h.boost, boostUntil: h.boostUntil ? new Date(h.boostUntil).toISOString() : null, stalledUntil: h.stalledUntil ? new Date(h.stalledUntil).toISOString() : null }
          : null,
        event: l.event ? { id: l.event.id, source: l.event.source, key: l.event.id, title: l.event.title, expiresAt: new Date(l.event.expiresAt).toISOString(), text: l.event.text, choices: l.event.choices } : null,
        health: l.health,
        powerOwed: l.powerOwed,
        wasteOwed: l.wasteOwed,
        powerCut: l.powerDay > 0 && l.powerOwed > l.powerDay * CUT_OFF_DAYS,
        budget: l.budget,
        recoveringUntil: l.recoveringUntil ? new Date(l.recoveringUntil).toISOString() : null,
        wallet: s.coins,
        pots: { ...l.pots },
        courses: l.courses.map((c) => ({ course: c.course, title: c.title, cert: c.cert, startedAt: new Date(c.startedAt).toISOString(), endsAt: new Date(c.endsAt).toISOString(), done: c.done })),
        procedures: l.procedures.map((p) => ({ procedure: p.procedure, title: p.title, at: new Date(p.at).toISOString() })),
        payOwed: 0,
        bills: bills(),
      };
    },
    async setBudget(b) {
      if (!s.region) return fail("Start your life first.");
      L().budget = cleanBudget(b);
      save();
      return { ok: true };
    },
    async movePot(from, to, amount) {
      const v = r2(amount);
      if (from === to || v <= 0) return fail("You can't move money like that.");
      const have = from === "wallet" ? s.coins : L().pots[from];
      if (have < v) return fail(`You need ₥${v} for that.`);
      if (from === "wallet") s.coins = r2(s.coins - v);
      else L().pots[from] = r2(L().pots[from] - v);
      if (to === "wallet") s.coins = r2(s.coins + v);
      else L().pots[to] = r2(L().pots[to] + v);
      save();
      return { ok: true };
    },
    async care(id) {
      const c = careById(id);
      if (!c || !s.region) return fail("That isn't on offer.");
      tick();
      const price = priceOf(c.fee, prices(), !c.public);
      const pots: Pot[] = c.away ? ["fun", "savings"] : ["essentials"];
      const l = L();
      if (c.away && l.recoveringUntil && l.recoveringUntil > Date.now()) return fail("You're away already.");
      if (canSpend(pots) < price.total) return fail(`You need ₥${price.total.toLocaleString("en-GB")} for that.`);
      spend(pots, price.total);
      log("health_care", -price.base);
      log("vat", -price.tax);
      l.health = c.health >= 100 ? 100 : Math.min(100, l.health + c.health);
      l.mind = Math.min(100, (l.mind ?? 70) + (c.mind ?? 0));
      if (c.away) l.recoveringUntil = Date.now() + c.away * DAY_MS;
      save();
      return { ok: true, coins: s.coins };
    },
    async procedure(id) {
      const p = procedureById(id);
      if (!p || !s.region) return fail("That isn't on offer.");
      if (!s.home) return fail("Buy a home first.");
      tick();
      const l = L();
      if (l.recoveringUntil && l.recoveringUntil > Date.now()) return fail("You're still recovering from the last one.");
      const price = priceOf(p.fee, prices(), true);
      if (canSpend(["fun", "savings"]) < price.total) return fail(`You need ₥${price.total.toLocaleString("en-GB")} for that.`);
      spend(["fun", "savings"], price.total);
      log("procedure", -price.base);
      log("vat", -price.tax);
      l.procedures.unshift({ procedure: p.id, title: p.title, at: Date.now() });
      if (p.recovery > 0) l.recoveringUntil = Date.now() + p.recovery * DAY_MS;
      save();
      return { ok: true, coins: s.coins };
    },
    async enrol(id) {
      const c = courseById(id);
      if (!c || !s.region) return fail("That isn't on offer.");
      tick();
      const l = L();
      if (l.courses.some((x) => !x.done)) return fail("Finish the course you're on first.");
      if (l.courses.some((x) => x.course === c.id)) return fail("You've done that course already.");
      if (!plan({ studyHours: { short: 2, diploma: 3, degree: 4, licence: 4 }[c.kind] }).fits) return fail("That won't fit in your day. Drop your side hustle or some exercise first.");
      const fee = priceOf(c.fee, prices(), false).total;
      if (canSpend(["savings"]) < fee) return fail(`You need ₥${fee.toLocaleString("en-GB")} for that.`);
      spend(["savings"], fee);
      log("school_fees", -fee);
      l.courses.push({ course: c.id, title: c.title, cert: c.cert ?? null, skill: c.skill, grants: c.grants, startedAt: Date.now(), endsAt: Date.now() + c.days * DAY_MS, done: false });
      save();
      return { ok: true, coins: s.coins };
    },
    async money(hours): Promise<MoneyFlow> {
      const since = Date.now() - hours * 3_600_000;
      const out: MoneyFlow = {};
      for (const x of L().log) if (x.at >= since) out[x.kind] = r2((out[x.kind] ?? 0) + x.amount);
      return out;
    },
    async lifeTime(hours) {
      const since = Date.now() - hours * 3_600_000;
      const out: Record<string, number> = {};
      for (const x of L().hours ?? []) if (x.at >= since) out[x.kind] = r2((out[x.kind] ?? 0) + x.hours);
      return out;
    },
    async startHustle(id) {
      const h = hustleById(id);
      if (!h || !s.region) return fail("That isn't on offer.");
      if (!s.home) return fail("Buy a home first.");
      tick();
      const l = L();
      if (l.hustle?.hustle === id) return fail("That's already your side hustle.");
      if (h.level && skillLevel(s.skills?.[h.skill] ?? 0) < h.level) return fail(`You need ${h.skill} level ${h.level} for that.`);
      if (!plan({ hustleHours: h.hours }).fits) return fail("That won't fit in your day. Cut back somewhere first.");
      const cost = hustleStart(h, prices());
      if (canSpend(["savings"]) < cost) return fail(`You need ₥${cost.toLocaleString("en-GB")} to start that.`);
      settleHustle();
      spend(["savings"], cost);
      log("hustle_start", -cost);
      l.hustle = { hustle: h.id, title: h.title, skill: h.skill, payDay: hustleDay(h, prices()), swing: h.swing, hours: h.hours, paid: Date.now(), boost: 1, boostUntil: null, stalledUntil: null };
      save();
      return { ok: true, coins: s.coins };
    },
    async stopHustle() {
      const hustle = settleHustle();
      L().hustle = null;
      save();
      return { ok: true, pay: { days: 0, gross: 0, tax: 0, fares: 0, net: 0, hustle } };
    },
    async setExercise(ex) {
      if (!(ex in EXERCISE)) return fail("That isn't on offer.");
      tick();
      if (!plan({ exercise: ex }).fits) return fail("That won't fit in your day.");
      L().exercise = ex;
      save();
      return { ok: true };
    },
    async interviewStart(placeId, jobId) {
      const until = L().fails?.[`${placeId}/${jobId}`];
      if (until && until > Date.now()) return { ok: false, error: `You can try this interview again at ${new Date(until).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.` };
      const r = await interviewStart(placeId, jobId);
      // The lab's pretend mind: one more right answer when stressed.
      if (r.ok && (L().mind ?? 70) < STRESSED_BELOW) return { ...r, need: Math.min(5, r.need + 1) };
      return r;
    },
    async interviewSubmit(token, answers) {
      const r = await interviewSubmit(token, answers);
      if (r.ok && !r.passed) {
        const t = JSON.parse(atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))) as { place: string; job: string };
        L().fails = { ...L().fails, [`${t.place}/${t.job}`]: Date.now() + 14 * 3_600_000 };
        save();
      }
      return r;
    },
    async answerEvent(choice) {
      const l = L();
      const e = l.event;
      if (!e || e.expiresAt <= Date.now()) return { ok: false, error: "That moment has passed." };
      const mark = await labMarkEvent(e.token, choice);
      l.event = null;
      if (!mark) return { ok: false, error: "That moment has passed." };
      let bonus = 0;
      if (mark.won && e.source === "job" && s.job) {
        bonus = r2(s.job.payDay * 3);
        log("bonus", bonus);
        income(bonus);
        s.skills = { ...s.skills, [s.job.skill]: (s.skills?.[s.job.skill] ?? 0) + 3 };
      }
      if (e.source === "hustle" && l.hustle) {
        settleHustle();
        if (mark.won) {
          l.hustle.boost = 2;
          l.hustle.boostUntil = Date.now() + 3 * DAY_MS;
        } else if (mark.stall) l.hustle.stalledUntil = Date.now() + mark.stall * DAY_MS;
      }
      save();
      return { ok: true, won: mark.won, said: mark.said, bonus, stall: e.source === "hustle" ? mark.stall : 0 };
    },
    async startPack(packId, region) {
      // The lab's pretend shop: no real payment, the pack's mint at once.
      const pack = packById(packId);
      if (!pack || pack.naira <= 0) return { ok: false, error: "That pack isn't on offer." };
      if (s.home) return { ok: false, error: "Packs are for starting out, before your first home." };
      if (s.pack) return { ok: false, error: "You've had a pack already." };
      if (!s.region) s.region = region;
      s.coins = r2(s.coins + Math.max(0, pack.mint - (s.granted ?? 0)));
      s.granted = pack.mint;
      s.pack = pack.id;
      save();
      return { ok: true, coins: s.coins };
    },
    async confirmPack() {
      return { ok: false };
    },
    async mapBusinesses(region) {
      // The lab has no real businesses: one sample shows what a leased building looks like.
      const plan = planFor(region);
      for (let r = 0; r < 12; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (const dz of [-r, r]) {
            const t = tileAt(plan, spiralIndex(-27 + dx, -5 + dz));
            if (t.building?.kind !== "plaza" && t.building?.kind !== "shops") continue;
            return [
              {
                id: "00000000-0000-4000-8000-000000000000",
                building: t.building.id,
                name: "Your Business Here",
                category: "Sample",
                about: "A sample: this is how a real business that leases a building shows on the map, with its logo, what it does and how to reach it.",
                address: "Your real address, Lagos",
                phone: null,
                whatsapp: null,
                website: null,
                logo: null,
                glow: 2,
                kind: null,
                storeys: null,
                billboard: false,
              },
            ];
          }
        }
      }
      return [];
    },
    async hitBusiness() {},
    async buildingOwners(buildingId) {
      return s.units.filter((u) => u.building === buildingId).map((u) => ({ unit: u.unit, name: "You", mine: true }));
    },
  };
}
