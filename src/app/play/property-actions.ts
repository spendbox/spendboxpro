"use server";

import { naira } from "@/lib/brand";
import { makePlan, spiralIndex, tileAt, type CityPlan } from "@/lib/city/layout";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS, regionMap } from "@/lib/world";
import { grownBuilding, type Building } from "@/lib/world/buildings";
import { cleanPropertyName, ownedSpot } from "@/lib/world/owned";
import { BUY_TAX, rentPerDay, type AssetsData, type BuildingOwner, type OwnedBuildingRow, type PassportStampNews, type PropertyResult } from "@/lib/world/property-api";
import { PASSPORT_ON } from "@/lib/features";
import { AREA_REWARD, passportOf, STAMP_REWARD } from "@/lib/world/passport";
import { landNow, toMint, valueOf } from "@/lib/world/value";
import { discounted } from "@/lib/world/rep-levels";
import { myThings } from "./item-actions";
import { cheapestCommute, cheapestRide, tripFareMint, tripKmBetween, type Commute } from "@/lib/world/work";
import { ferryKmBetween } from "@/lib/world/trips";
import { FIND_CHANCE, FINDS, mintOf, shopKind } from "@/lib/world/items";
import { collectPay } from "./work-actions";
import { syncGrowth } from "@/lib/world/growth-server";

// Owning property on the real map (docs/PROPERTY.md; the database part is
// game-db/038_property.sql). The price of a unit is always worked out here, from the map, never
// taken from the phone; the database checks ownership and balances and records everything.

/** Each region's plan, worked out once per server. */
const plans = new Map<string, CityPlan>();
function planFor(region: string): CityPlan | null {
  const map = regionMap(region);
  if (!map) return null;
  let plan = plans.get(region);
  if (!plan) {
    plan = makePlan(map.region.seed, map);
    plans.set(region, plan);
  }
  return plan;
}

const n = (v: unknown) => Number(v ?? 0) || 0;

function say(message: string | undefined): PropertyResult {
  const [code, arg] = (message ?? "").split(":");
  const words: Record<string, string> = {
    not_enough: `You need ${naira(arg)} for that.`,
    taken: "Someone has just bought that one.",
    home_first: "Buy a home first: somewhere to live comes before anything else.",
    no_life: "Start your life first.",
    not_yours: "That isn't yours.",
    not_all_yours: "You can name a building once you own all of it.",
    leased: "A business has its name on this building for now, so it can't be renamed until that ends.",
    is_home: "That's your home. Move somewhere else first to let it out.",
    bad_name: "Names are 2 to 40 letters and numbers.",
    frozen: "Your account is paused right now.",
    unknown_player: "Please sign in again.",
  };
  if (words[code]) return { ok: false, error: words[code] };
  console.error("Property action failed", message);
  return { ok: false, error: "That didn't work just now. Try again." };
}

/** The building at a building id as it stands now: as bought if someone owns any of it, else as the map has it. */
async function buildingAt(buildingId: string): Promise<{ building: Building; x: number; z: number; region: string } | null> {
  const spot = ownedSpot(buildingId);
  if (!spot || !REGIONS[spot.region]) return null;
  // The city as big as it has grown (docs/GROWTH.md), the same as players see it.
  await syncGrowth(spot.region);
  const { data } = await createAdminClient().from("property_buildings").select("snapshot").eq("building_id", buildingId).maybeSingle();
  if (data?.snapshot) return { building: data.snapshot as Building, ...spot };
  const plan = planFor(spot.region);
  if (!plan) return null;
  const t = tileAt(plan, spiralIndex(spot.x, spot.z));
  if (!t.building || t.building.id !== buildingId) return null;
  return { building: t.building, ...spot };
}

/** Start your life on the real map (the starting budget, once). */
export async function startLife(region: string): Promise<PropertyResult> {
  if (!REGIONS[region]) return { ok: false, error: "Unknown place." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to start your life here." };
  const { data, error } = await createAdminClient().rpc("life_start", { p_user: userId, p_region: region });
  if (error) return say(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, coins: n(d.coins) };
}

/** Buy a unit nobody owns yet, at its value now. */
export async function buyUnit(unitId: string): Promise<PropertyResult> {
  const m = /^([a-z0-9-]+:-?\d+,-?\d+)\/(\d+)$/.exec(unitId ?? "");
  if (!m) return { ok: false, error: "Unknown property." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to buy property." };
  const found = await buildingAt(m[1]);
  const unit = found?.building.units[Number(m[2])];
  if (!found || !unit) return { ok: false, error: "That property isn't there." };
  const map = regionMap(found.region)!;
  const prices = map.region.prices;
  const value = valueOf(found.building, landNow(map, found.x, found.z), prices);
  const worth = Math.max(1, toMint(value.units[Number(m[2])], prices));
  const db = createAdminClient();
  // Your reputation level takes something off (src/lib/world/rep-levels.ts).
  const things = await myThings().catch(() => null);
  const price = Math.max(1, discounted(worth, things?.reputation.score ?? 0));
  // What your property has earned so far is paid first, by the database (game-db/079).
  // A building a real business leases isn't for sale while the lease runs.
  // A building people live in stays open for homes while a business leases it (game-db/094); others don't.
  let { data: lease, error: leaseError } = await db.from("business_leases").select("residential").eq("building_id", m[1]).eq("status", "live").maybeSingle();
  if (leaseError) ({ data: lease } = await db.from("business_leases").select("id").eq("building_id", m[1]).eq("status", "live").maybeSingle());
  if (lease && !(lease as { residential?: boolean }).residential) return { ok: false, error: "A business leases that building, so it isn't for sale." };
  // Short in your wallet? What's in Savings tops it up (that's what Savings is for).
  const cost = Math.round(price * (1 + BUY_TAX) * 100) / 100;
  const [{ data: prof }, { data: pot }] = await Promise.all([
    db.from("profiles").select("coins").eq("id", userId).maybeSingle(),
    db.from("life_pots").select("balance").eq("user_id", userId).eq("pot", "savings").maybeSingle(),
  ]);
  const short = Math.round((cost - n(prof?.coins)) * 100) / 100;
  if (short > 0 && n(pot?.balance) > 0) {
    await db.rpc("life_pot_move", { p_user: userId, p_from: "savings", p_to: "wallet", p_amount: Math.min(short, n(pot?.balance)) });
  }
  const { data, error } = await db.rpc("property_buy", {
    p_user: userId,
    p_region: found.region,
    p_unit: unitId,
    p_snapshot: found.building,
    p_price: price,
    p_use: unit.use,
    p_area: unit.area,
    p_label: unit.label,
    p_rent_day: rentPerDay(price, unit.use),
  });
  if (error) return say(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  // That may have sold the block out: if so, it grows (more storeys, new units for sale).
  await growIfSoldOut(m[1], found.region).catch((e) => console.error("Growing a building failed", m[1], e));
  return { ok: true, coins: n(d.coins), home: d.home === true };
}

/**
 * A block whose units are all owned (by two players or more) grows a few storeys, and the new units go
 * on sale (docs/GROWTH.md; game-db/091 checks it's sold out and nobody grew it meanwhile).
 */
async function growIfSoldOut(buildingId: string, region: string) {
  const db = createAdminClient();
  const [{ data: row }, { count }] = await Promise.all([
    db.from("property_buildings").select("snapshot").eq("building_id", buildingId).maybeSingle(),
    db.from("property_units").select("unit_id", { count: "exact", head: true }).eq("building_id", buildingId).not("owner_id", "is", null),
  ]);
  const b = row?.snapshot as Building | undefined;
  if (!b || (count ?? 0) < b.units.length) return;
  const map = regionMap(region);
  const grown = map ? grownBuilding(b, map.region.seed) : null;
  if (!grown) return;
  const { data: grew } = await db.rpc("building_grow", { p_building: buildingId, p_snapshot: grown, p_before: b.units.length });
  if (grew !== true) return;
  // Everyone who owns part of it hears about it.
  const { data: owners } = await db.from("property_units").select("owner_id").eq("building_id", buildingId);
  const fresh = grown.units.length - b.units.length;
  for (const id of new Set((owners ?? []).map((o) => String(o.owner_id)))) {
    await db.rpc("notify", { p_user: id, p_round: null, p_kind: "gift", p_body: `Your building sold out, so it's growing: ${grown.storeys - b.storeys} more storeys, ${fresh} new units for sale.` });
  }
}

/** Make one of your homes your home. */
export async function setHome(unitId: string): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  // Pay up to now is settled with the fares from where you lived.
  await collectPay();
  const { error } = await createAdminClient().rpc("property_set_home", { p_user: userId, p_unit: unitId });
  return error ? say(error.message) : { ok: true };
}

/** Let one of your units out, or stop. */
export async function letUnit(unitId: string, on: boolean): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { data, error } = await createAdminClient().rpc("property_let", { p_user: userId, p_unit: unitId, p_on: !!on });
  if (error) return say(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, coins: n(d.coins), rent: n(d.rent) };
}

/** Collect the rent your let units have earned. */
export async function collectRent(): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { data, error } = await createAdminClient().rpc("property_collect", { p_user: userId });
  if (error) return say(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, coins: n(d.coins), rent: n(d.rent) };
}

/** Name a building you own all of (an empty name clears it). */
export async function renameBuilding(buildingId: string, name: string): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const clean = name.trim() ? cleanPropertyName(name) : null;
  if (name.trim() && !clean) return say("bad_name");
  const { error } = await createAdminClient().rpc("property_rename", { p_user: userId, p_building: buildingId, p_name: clean });
  return error ? say(error.message) : { ok: true };
}

/** Name your home (an empty name puts back the plain one). Needs game-db/078. */
export async function renameHome(unitId: string, name: string): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const clean = name.trim() ? cleanPropertyName(name) : null;
  if (name.trim() && !clean) return say("bad_name");
  const { error } = await createAdminClient().rpc("home_rename", { p_user: userId, p_unit: String(unitId).slice(0, 80), p_name: clean });
  if (error && /does not exist|home_rename/.test(error.message)) return { ok: false, error: "Naming your home is switched on soon." };
  return error ? say(error.message) : { ok: true };
}

/**
 * Name any property you own (a flat, a shop, an office, a plot...) from Assets. An empty name puts
 * back its plain one. Needs game-db/087 (before that, only your home, through home_rename).
 */
export async function renameUnit(unitId: string, name: string): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const clean = name.trim() ? cleanPropertyName(name) : null;
  if (name.trim() && !clean) return say("bad_name");
  const db = createAdminClient();
  const { error } = await db.rpc("unit_rename", { p_user: userId, p_unit: String(unitId).slice(0, 80), p_name: clean });
  if (error && /does not exist|unit_rename/.test(error.message)) {
    const home = await db.rpc("home_rename", { p_user: userId, p_unit: String(unitId).slice(0, 80), p_name: clean });
    if (!home.error) return { ok: true };
    return { ok: false, error: "Naming your property is switched on soon." };
  }
  return error ? say(error.message) : { ok: true };
}

/** Your life: your home, your mint, everything you own. */
export async function myAssets(): Promise<AssetsData | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  // World Bank payments that have come due are taken first.
  await createAdminClient().rpc("loan_tick", { p_user: userId });
  const { data, error } = await createAdminClient().rpc("my_assets", { p_user: userId });
  if (error) return null;
  return data as AssetsData;
}

/** Every owned building in a region, as bought (for drawing them on the map). */
export async function ownedBuildings(region: string): Promise<OwnedBuildingRow[]> {
  if (!REGIONS[region]) return [];
  const { data, error } = await createAdminClient().rpc("owned_buildings", { p_region: region });
  if (error || !Array.isArray(data)) return [];
  return data as OwnedBuildingRow[];
}

/** Who owns which units of a building (and which are yours). */
export async function buildingOwners(buildingId: string): Promise<BuildingOwner[]> {
  if (!ownedSpot(buildingId)) return [];
  const userId = await currentUserId();
  const db = createAdminClient();
  const [{ data, error }, { data: rented }] = await Promise.all([
    db.rpc("building_owners", { p_building: buildingId }),
    // Homes rented from the city (game-db/077; nothing until it's run).
    db.from("home_rentals").select("unit_id, user_id").like("unit_id", `${buildingId}/%`),
  ]);
  if (error || !Array.isArray(data)) return [];
  const owned = (data as { unit: string; owner: string; name: string; forSale?: number | null; home?: boolean }[]).map((o) => ({
    unit: o.unit,
    name: o.name,
    mine: o.owner === userId,
    forSale: o.forSale == null ? null : Number(o.forSale),
    home: !!o.home,
  }));
  const tenants = (rented ?? []) as { unit_id: string; user_id: string }[];
  if (!tenants.length) return owned;
  const { data: people } = await db.from("profiles").select("id, username").in("id", tenants.map((t) => t.user_id));
  const nameOf = new Map(((people ?? []) as { id: string; username: string | null }[]).map((p) => [p.id, p.username ?? "Someone"]));
  return [...owned, ...tenants.map((t) => ({ unit: t.unit_id, name: nameOf.get(t.user_id) ?? "Someone", mine: t.user_id === userId, forSale: null, home: true, rented: true }))];
}

/**
 * Go to a building: the fare from where you last were (or home), the cheapest way, and you're
 * there. from: where you're standing (on foot on the map), and then always a ride (keke, danfo,
 * a ferry): skipping straight there is never free.
 */
export async function travelTo(buildingId: string, drive?: boolean, from?: { x: number; z: number }): Promise<PropertyResult> {
  const spot = ownedSpot(buildingId);
  if (!spot || !REGIONS[spot.region]) return { ok: false, error: "That place isn't on the map." };
  const userId = await currentUserId();
  if (!userId) return { ok: true, fare: 0 };
  const db = createAdminClient();
  // Both at once (each is a trip to the database).
  const [{ data: life }, { data: jail }] = await Promise.all([
    db.from("lives").select("home_unit, at_place").eq("user_id", userId).maybeSingle(),
    // In jail (game-db/055): nowhere to go until you're out.
    db.rpc("jail_until", { p_user: userId }),
  ]);
  if (!life) return { ok: false, error: "Start your life first." };
  if (jail) return { ok: false, error: `You're in jail until ${new Date(String(jail)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}. Wait it out, or try a bribe.` };
  const onFoot = !!from && Number.isFinite(from.x) && Number.isFinite(from.z);
  const start = onFoot ? `${spot.region}:${Math.round(from!.x)},${Math.round(from!.z)}` : ((life.at_place as string | null) ?? (life.home_unit as string | null));
  const km = start ? tripKmBetween(start, buildingId) : null;
  // Over the water to an island with no bridge: a ferry, and the ride either side.
  const ferry = start ? ferryKmBetween(start, buildingId) : 0;
  // Driving your own car (if you have one): the fuel, anywhere (short trips too: a car never
  // goes for free).
  let mode: Commute = km === null ? "walk" : onFoot ? cheapestRide(km, ferry) : cheapestCommute(km, ferry);
  if (drive && km !== null && km >= 0.2) {
    const { count } = await db.from("items").select("id", { count: "exact", head: true }).eq("owner", userId).eq("category", "car");
    if (!count) return { ok: false, error: "You need a car to drive. Get one from Things, Cars." };
    mode = "car";
  }
  const fare = km === null ? 0 : (tripFareMint(mode, km, regionMap(spot.region)!.region.prices, ferry) ?? 0);
  const { data, error } = await db.rpc("life_go", { p_user: userId, p_place: buildingId, p_fare: fare });
  if (error) {
    const [code] = error.message.split(":");
    if (code === "not_enough") return { ok: false, error: "You don't have enough for the fare there." };
    return say(error.message);
  }
  // Now and then you find something on the way (src/lib/world/items.ts).
  let found: string | undefined;
  if (Math.random() < FIND_CHANCE) {
    const k = shopKind(FINDS[Math.floor(Math.random() * FINDS.length)]);
    const prices = regionMap(spot.region)!.region.prices;
    if (k) {
      const { error: findError } = await db.rpc("item_get", { p_user: userId, p_kind: k.id, p_name: k.name, p_category: k.category, p_value: mintOf(k.price, prices), p_effect: k.effect, p_how: "found", p_cost: 0 });
      if (!findError) found = k.name;
    }
  }
  // A passport stamp, if it's one of the city's real places (game-db/106; nothing before it's run).
  const stamp = !PASSPORT_ON ? null : await stampPassport(db, userId, spot.region, spot.x, spot.z).catch(() => null);
  return { ok: true, fare: n(data), mode, ...(found ? { found } : {}), ...(stamp ? { stamp } : {}) };
}

/** Stamp the passport for the place at (x, z), if it's on it and new: the reward, and an area page's bonus once it's complete. */
async function stampPassport(db: ReturnType<typeof createAdminClient>, userId: string, region: string, x: number, z: number): Promise<PassportStampNews | null> {
  const map = regionMap(region);
  if (!map) return null;
  const passport = passportOf(map);
  const place = passport.at(x, z);
  if (!place) return null;
  const reward = place.id.startsWith("lm:") ? STAMP_REWARD.landmark : STAMP_REWARD.other;
  const { data, error } = await db.rpc("passport_stamp", { p_user: userId, p_region: region, p_place: place.id, p_reward: reward });
  if (error || !(data as { new?: boolean } | null)?.new) return null;
  // How far through the passport, and whether this page is now complete.
  const { data: rows } = await db.from("passport_stamps").select("place").eq("user_id", userId).eq("region", region);
  const mine = new Set(((rows ?? []) as { place: string }[]).map((r) => r.place));
  const page = passport.areas.find((a) => a.name === place.area);
  let areaDone: PassportStampNews["areaDone"] = null;
  if (page && page.ids.every((id) => mine.has(id))) {
    const { data: fresh } = await db.rpc("passport_area_done", { p_user: userId, p_region: region, p_area: page.name, p_reward: AREA_REWARD });
    if (fresh) areaDone = { name: page.name, paid: AREA_REWARD };
  }
  return { id: place.id, name: place.name, what: place.what, look: place.look, area: place.area, paid: n((data as { paid?: number }).paid), count: [...mine].filter((id) => passport.byId.has(id)).length, total: passport.places.length, areaDone };
}

/** Your passport in a region: the places you've stamped (and when), and the pages you've completed. */
export async function myPassport(region: string): Promise<{ stamps: { place: string; at: string }[]; areas: string[] } | null> {
  if (!REGIONS[region]) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  const db = createAdminClient();
  const [{ data: stamps, error }, { data: areas }] = await Promise.all([
    db.from("passport_stamps").select("place, stamped_at").eq("user_id", userId).eq("region", region),
    db.from("passport_areas").select("area").eq("user_id", userId).eq("region", region),
  ]);
  if (error) return null;
  return {
    stamps: ((stamps ?? []) as { place: string; stamped_at: string }[]).map((r) => ({ place: r.place, at: r.stamped_at })),
    areas: ((areas ?? []) as { area: string }[]).map((r) => r.area),
  };
}

/** A month's rent for a home from the city: 6% of what it's worth, as landlords earn (docs/MONEY.md). */
const RENT_MONTH = 0.06;

/** Rent a home nobody owns, a month at a time (game-db/077). */
export async function rentUnit(unitId: string): Promise<PropertyResult> {
  const m = /^([a-z0-9-]+:-?\d+,-?\d+)\/(\d+)$/.exec(unitId ?? "");
  if (!m) return { ok: false, error: "Unknown property." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to rent a home." };
  const found = await buildingAt(m[1]);
  const unit = found?.building.units[Number(m[2])];
  if (!found || !unit) return { ok: false, error: "That home isn't there." };
  if (unit.use !== "home") return { ok: false, error: "Only homes can be rented." };
  const map = regionMap(found.region)!;
  const value = valueOf(found.building, landNow(map, found.x, found.z), map.region.prices);
  const rent = Math.max(0.01, Math.round(toMint(value.units[Number(m[2])], map.region.prices) * RENT_MONTH * 100) / 100);
  const { error } = await createAdminClient().rpc("rent_home", { p_user: userId, p_unit: unitId, p_label: unit.label, p_rent: rent });
  if (error) {
    if (/does not exist|rent_home/.test(error.message)) return { ok: false, error: "Renting is switched on soon." };
    return say(error.message);
  }
  return { ok: true };
}

export type Rental = { unit: string; label: string; rent: number; paidUntil: string } | null;

/** Your rented home (each month that's come due is paid, or you move out when you can't). */
export async function myRental(): Promise<{ rental: Rental; ended: boolean }> {
  const userId = await currentUserId();
  if (!userId) return { rental: null, ended: false };
  const { data, error } = await createAdminClient().rpc("rent_settle", { p_user: userId });
  if (error || !data) return { rental: null, ended: false };
  const d = data as { renting?: boolean; ended?: boolean; unit?: string; label?: string; rent?: number; paid_until?: string };
  return { rental: d.renting && d.unit ? { unit: d.unit, label: String(d.label ?? "Home"), rent: n(d.rent), paidUntil: String(d.paid_until) } : null, ended: !!d.ended };
}

/** Move out of your rented home (back to a free room). */
export async function moveOut(): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { error } = await createAdminClient().rpc("rent_end", { p_user: userId });
  return error ? say(error.message) : { ok: true };
}
