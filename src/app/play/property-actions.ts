"use server";

import { makePlan, spiralIndex, tileAt, type CityPlan } from "@/lib/city/layout";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS, regionMap } from "@/lib/world";
import type { Building } from "@/lib/world/buildings";
import { cleanPropertyName, ownedSpot } from "@/lib/world/owned";
import { BUY_TAX, rentPerDay, type AssetsData, type BuildingOwner, type OwnedBuildingRow, type PropertyResult } from "@/lib/world/property-api";
import { landNow, toMint, valueOf } from "@/lib/world/value";
import { cheapestCommute, fareMint, tripKmBetween, type Commute } from "@/lib/world/work";
import { ferryKmBetween } from "@/lib/world/trips";
import { FIND_CHANCE, FINDS, mintOf, shopKind } from "@/lib/world/items";
import { collectPay } from "./work-actions";

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
    not_enough: `You need ₥${arg} for that (with the 3% tax).`,
    taken: "Someone has just bought that one.",
    home_first: "Buy a home first: somewhere to live comes before anything else.",
    no_life: "Start your life first.",
    not_yours: "That isn't yours.",
    not_all_yours: "You can name a building once you own all of it.",
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
  const price = Math.max(1, toMint(value.units[Number(m[2])], prices));
  const db = createAdminClient();
  // A building a real business leases isn't for sale while the lease runs.
  const { count: leased } = await db.from("business_leases").select("id", { count: "exact", head: true }).eq("building_id", m[1]).eq("status", "live");
  if (leased) return { ok: false, error: "A business leases that building, so it isn't for sale." };
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
  return { ok: true, coins: n(d.coins), home: d.home === true };
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
  const { data, error } = await createAdminClient().rpc("building_owners", { p_building: buildingId });
  if (error || !Array.isArray(data)) return [];
  return (data as { unit: string; owner: string; name: string; forSale?: number | null; home?: boolean }[]).map((o) => ({
    unit: o.unit,
    name: o.name,
    mine: o.owner === userId,
    forSale: o.forSale == null ? null : Number(o.forSale),
    home: !!o.home,
  }));
}

/** Go to a building: the fare from where you last were (or home), the cheapest way, and you're there. */
export async function travelTo(buildingId: string, drive?: boolean): Promise<PropertyResult> {
  const spot = ownedSpot(buildingId);
  if (!spot || !REGIONS[spot.region]) return { ok: false, error: "That place isn't on the map." };
  const userId = await currentUserId();
  if (!userId) return { ok: true, fare: 0 };
  const db = createAdminClient();
  const { data: life } = await db.from("lives").select("home_unit, at_place").eq("user_id", userId).maybeSingle();
  if (!life) return { ok: false, error: "Start your life first." };
  const from = (life.at_place as string | null) ?? (life.home_unit as string | null);
  const km = from ? tripKmBetween(from, buildingId) : null;
  // Over the water to an island with no bridge: a ferry, and the ride either side.
  const ferry = from ? ferryKmBetween(from, buildingId) : 0;
  // Driving your own car (if you have one): just the fuel, anywhere.
  let mode: Commute = km === null ? "walk" : cheapestCommute(km, ferry);
  if (drive && km !== null && mode !== "walk") {
    const { count } = await db.from("items").select("id", { count: "exact", head: true }).eq("owner", userId).eq("category", "car");
    if (!count) return { ok: false, error: "You need a car to drive. Get one from Things, Cars." };
    mode = "car";
  }
  const fare = km === null ? 0 : (fareMint(mode, km, regionMap(spot.region)!.region.prices, ferry) ?? 0);
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
  return { ok: true, fare: n(data), ...(found ? { found } : {}) };
}
