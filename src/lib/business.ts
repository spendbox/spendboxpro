import "server-only";

import { randomBytes } from "node:crypto";
import { addressOf, makePlan, spiralIndex, tileAt, type CityPlan } from "@/lib/city/layout";
import { AD_BUCKET, cleanLink, readContact, readImage, uploadImage } from "@/lib/ads";
import { siteUrl } from "@/lib/env";
import { checkPayment, paystackEnabled, startPayment } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import { BUILDING_LABEL, type Building } from "@/lib/world/buildings";
import { BUSINESS_KINDS, CATEGORIES, leasePrice, STOREY_AFTER_DAYS, upgradePrice, UPGRADES, type MapBusiness } from "@/lib/world/business";
import { ownedSpot } from "@/lib/world/owned";
import { toTile } from "@/lib/world/geo";

// Real businesses on the map (docs/BUSINESS.md; the database part is game-db/043_business.sql). A
// business picks a building, fills in its details and pays a year's lease through Paystack; prices
// are worked out here from the map. Businesses sign in like advertisers (by email).

const plans = new Map<string, CityPlan>();
function planFor(region: string) {
  const map = regionMap(region);
  if (!map) return null;
  let p = plans.get(region);
  if (!p) {
    p = makePlan(map.region.seed, map);
    plans.set(region, p);
  }
  return p;
}

export type LeaseOffer = { building: string; region: string; what: string; area: string; address: string; priceNaira: number };

/** What a building would cost to lease, or why it can't be (a landmark, a player's, already leased). */
export async function leaseOffer(buildingId: string): Promise<{ ok: true; offer: LeaseOffer } | { ok: false; error: string }> {
  const spot = ownedSpot(buildingId ?? "");
  const plan = spot ? planFor(spot.region) : null;
  const map = spot ? regionMap(spot.region) : null;
  if (!spot || !plan || !map) return { ok: false, error: "That building isn't on the map." };
  const t = tileAt(plan, spiralIndex(spot.x, spot.z));
  const b = t.building as Building | undefined;
  if (!b || b.id !== buildingId) return { ok: false, error: "Only buildings can be leased, not landmarks." };
  const db = createAdminClient();
  const [{ count: owned }, { count: leased }] = await Promise.all([
    db.from("property_units").select("unit_id", { count: "exact", head: true }).eq("building_id", buildingId),
    db.from("business_leases").select("id", { count: "exact", head: true }).eq("building_id", buildingId).eq("status", "live"),
  ]);
  if (owned) return { ok: false, error: "Players own part of that building, so it can't be leased." };
  if (leased) return { ok: false, error: "Another business has that building." };
  return {
    ok: true,
    offer: {
      building: buildingId,
      region: spot.region,
      what: BUILDING_LABEL[b.kind],
      area: map.areaAt(spot.x, spot.z),
      address: addressOf(plan, t),
      priceNaira: leasePrice(b.kind, map.landPriceAt(spot.x, spot.z)),
    },
  };
}

const clean = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const phoneOk = (p: string) => !p || /^[+\d][\d\s()-]{6,}$/.test(p);

export type Checkout = { ok: true; url: string } | { ok: false; error: string };

/** The lease form: checks it, saves the logo, starts the Paystack payment. */
export async function startLeaseCheckout(form: FormData): Promise<Checkout> {
  if (!paystackEnabled()) return { ok: false, error: "Payments aren't switched on yet." };
  const offer = await leaseOffer(clean(form.get("building"), 40));
  if (!offer.ok) return offer;
  const name = clean(form.get("name"), 61);
  const category = clean(form.get("category"), 41);
  const about = clean(form.get("about"), 301);
  const address = clean(form.get("address"), 201);
  const phone = clean(form.get("phone"), 30);
  const whatsapp = clean(form.get("whatsapp"), 30);
  if (name.length < 2 || name.length > 60) return { ok: false, error: "Please add your business name (up to 60 characters)." };
  if (!(CATEGORIES as readonly string[]).includes(category)) return { ok: false, error: "Please pick what kind of business it is." };
  if (about.length < 10 || about.length > 300) return { ok: false, error: "Please say what you do (10 to 300 characters)." };
  if (address.length < 5 || address.length > 200) return { ok: false, error: "Please add your real address." };
  if (!phoneOk(phone) || !phoneOk(whatsapp)) return { ok: false, error: "That phone number doesn't look right." };
  const site = cleanLink(clean(form.get("website"), 300));
  if (!site.ok) return site;
  if (form.get("policy") !== "yes") return { ok: false, error: "Please confirm your details are true and you agree to the policy." };
  const c = readContact(form);
  if (!c.ok) return c;
  const img = await readImage(form.get("logo"));
  if (img && !img.ok) return img;
  const db = createAdminClient();
  const adv = await db.rpc("advertiser_for_email", { p_email: c.contact.email, p_name: c.contact.name, p_phone: c.contact.phone });
  if (adv.error || !adv.data) return { ok: false, error: "Something went wrong. Please try again." };
  const logo = img ? await uploadImage(img, "logos") : null;
  if (img && !logo) return { ok: false, error: "We couldn't save your logo. Please try again." };
  const reference = `bz-${randomBytes(12).toString("hex")}`;
  const kobo = offer.offer.priceNaira * 100;
  const { error } = await db.rpc("business_lease_start", {
    p_advertiser: adv.data as string,
    p_building: offer.offer.building,
    p_region: offer.offer.region,
    p_name: name,
    p_category: category,
    p_about: about,
    p_address: address,
    p_phone: phone,
    p_whatsapp: whatsapp,
    p_website: site.url,
    p_logo: logo,
    p_kobo: kobo,
    p_reference: reference,
  });
  if (error) {
    if (logo) await db.storage.from(AD_BUCKET).remove([logo]);
    const code = error.message.split(":")[0];
    const words: Record<string, string> = {
      taken: "Another business has just taken that building.",
      owned: "Players own part of that building now.",
      one_only: "Each account can lease one building for now.",
      one_a_week: "You can lease one new building a week.",
    };
    return { ok: false, error: words[code] ?? "Something went wrong. Please try again." };
  }
  return startPayment({
    email: c.contact.email,
    amountKobo: kobo,
    reference,
    callbackUrl: `${siteUrl()}/business/done?ref=${reference}`,
    metadata: { kind: "business_lease", building: offer.offer.building },
  });
}

/** Pay for an upgrade to your own live lease. */
export async function startUpgradeCheckout(advertiserId: string, leaseId: string, upgrade: string, kind: string | null): Promise<Checkout> {
  if (!paystackEnabled()) return { ok: false, error: "Payments aren't switched on yet." };
  const u = UPGRADES.find((x) => x.id === upgrade);
  if (!u) return { ok: false, error: "That upgrade isn't on offer." };
  if (u.id === "rebuild" && !BUSINESS_KINDS.some((k) => k.kind === kind)) return { ok: false, error: "Pick what to turn it into." };
  const db = createAdminClient();
  const { data: lease } = await db.from("business_leases").select("price_kobo, status").eq("id", leaseId).eq("advertiser_id", advertiserId).maybeSingle();
  if (!lease || lease.status !== "live") return { ok: false, error: "That isn't one of your live buildings." };
  const { data: adv } = await db.from("advertisers").select("email").eq("id", advertiserId).maybeSingle();
  const reference = `bz-up-${randomBytes(10).toString("hex")}`;
  const kobo = upgradePrice(u.id, Number(lease.price_kobo) / 100) * 100;
  const { error } = await db.rpc("business_upgrade_start", { p_advertiser: advertiserId, p_lease: leaseId, p_upgrade: u.id, p_kind: u.id === "rebuild" ? kind : null, p_kobo: kobo, p_reference: reference });
  if (error) {
    const code = error.message.split(":")[0];
    return { ok: false, error: code === "too_soon" ? `A storey can be added from ${STOREY_AFTER_DAYS} days after your lease starts.` : code === "already" ? "You have that already." : "That didn't work. Try again." };
  }
  return startPayment({
    email: String(adv?.email ?? ""),
    amountKobo: kobo,
    reference,
    callbackUrl: `${siteUrl()}/business/done?ref=${reference}`,
    metadata: { kind: "business_upgrade", upgrade: u.id },
  });
}

/** Check a lease or upgrade payment with Paystack and apply it (once). */
export async function confirmBusinessPayment(reference: string): Promise<{ ok: boolean; state: "live" | "pending" | "clash" | "unknown" }> {
  if (!/^bz-[a-z0-9-]{8,60}$/.test(reference ?? "")) return { ok: false, state: "unknown" };
  const payment = await checkPayment(reference);
  if (!payment?.paid) return { ok: false, state: "pending" };
  const { data, error } = await createAdminClient().rpc("business_paid", { p_reference: reference, p_kobo: payment.amountKobo });
  if (error) return { ok: false, state: "unknown" };
  const d = (data ?? {}) as { found?: boolean; clash?: boolean };
  if (!d.found) return { ok: false, state: "unknown" };
  return d.clash ? { ok: false, state: "clash" } : { ok: true, state: "live" };
}

const logoUrl = (path: unknown) => (typeof path === "string" && path ? createAdminClient().storage.from(AD_BUCKET).getPublicUrl(path).data.publicUrl : null);

/** Live businesses in a region, for the map. */
export async function businessesIn(region: string): Promise<MapBusiness[]> {
  const { data, error } = await createAdminClient().rpc("businesses_in", { p_region: region });
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((b) => ({ ...(b as unknown as MapBusiness), logo: logoUrl(b.logo), billboardImage: logoUrl(b.billboardImage) }));
}

export type MyBusiness = MapBusiness & {
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  priceKobo: number;
  hits: Record<string, number>;
  week: Record<string, number>;
  /** Taps (on the building or a billboard) the lease covers, and used so far. */
  clickCap: number | null;
  clicks: number;
};

/** An account's buildings with their numbers. */
export async function myBusinesses(advertiserId: string): Promise<MyBusiness[]> {
  const { data, error } = await createAdminClient().rpc("business_mine", { p_advertiser: advertiserId });
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((b) => ({
    ...(b as unknown as MyBusiness),
    logo: logoUrl(b.logo),
    billboardImage: logoUrl(b.billboardImage),
    priceKobo: Number(b.priceKobo),
    clickCap: b.clickCap == null ? null : Number(b.clickCap),
    clicks: Number(b.clicks ?? 0),
  }));
}

/** Swap a live lease's billboard design for a new picture (free, any time). */
export async function setBillboard(advertiserId: string, leaseId: string, form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const img = await readImage(form.get("image"));
  if (!img) return { ok: false, error: "Choose a picture first." };
  if (!img.ok) return img;
  const path = await uploadImage(img, "billboards");
  if (!path) return { ok: false, error: "We couldn't save that picture. Please try again." };
  const db = createAdminClient();
  const { data, error } = await db.rpc("business_billboard_set", { p_advertiser: advertiserId, p_lease: leaseId, p_path: path });
  if (error) {
    await db.storage.from(AD_BUCKET).remove([path]);
    return { ok: false, error: "That lease isn't live any more." };
  }
  // The old design goes (never the logo, which the building still shows).
  if (typeof data === "string" && data.startsWith("billboards/")) await db.storage.from(AD_BUCKET).remove([data]);
  return { ok: true };
}

// ---------------------------------------------------------------- finding a building

export type AdPlace = { label: string; note: string; x: number; z: number };

/** Places to search near (districts, neighbourhoods, landmarks) for the advertising wizard. */
export function adPlaces(region: string): AdPlace[] {
  const map = regionMap(region);
  if (!map) return [];
  const at = (lat: number, lon: number) => {
    const t = toTile(map.frame, { lat, lon });
    return { x: Math.round(t.x), z: Math.round(t.z) };
  };
  const out: AdPlace[] = [];
  for (const d of map.region.districts) out.push({ label: d.name, note: "District", ...at(d.at.lat, d.at.lon) });
  for (const a of map.region.areas) out.push({ label: a.name, note: a.kind === "town" ? "Town" : "Neighbourhood", ...at(a.at[0], a.at[1]) });
  for (const l of map.landmarks) out.push({ label: l.name, note: "Near a landmark", x: Math.round(l.ax + (l.w - 1) / 2), z: Math.round(l.az + (l.d - 1) / 2) });
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p.label) ? false : (seen.add(p.label), true)));
}

/**
 * Buildings free to lease round a spot (nearest first): not a landmark, no player owns any of it,
 * no business has it. At most `limit`, and only those up to `maxNaira` a year when given.
 */
export async function leasableNear(region: string, x: number, z: number, maxNaira?: number, limit = 30): Promise<LeaseOffer[]> {
  const map = regionMap(region);
  const plan = planFor(region);
  if (!map || !plan) return [];
  const R = 10;
  const found: (LeaseOffer & { d: number })[] = [];
  for (let dx = -R; dx <= R; dx++)
    for (let dz = -R; dz <= R; dz++) {
      const tx = Math.round(x) + dx;
      const tz = Math.round(z) + dz;
      if (!map.inside(tx, tz) || map.waterAt(tx, tz)) continue;
      const t = tileAt(plan, spiralIndex(tx, tz));
      const b = t.building as Building | undefined;
      if (!b || b.id !== `${region}:${tx},${tz}`) continue;
      const price = leasePrice(b.kind, map.landPriceAt(tx, tz));
      if (maxNaira && price > maxNaira) continue;
      found.push({ building: b.id, region, what: BUILDING_LABEL[b.kind], area: map.areaAt(tx, tz), address: addressOf(plan, t), priceNaira: price, d: Math.hypot(dx, dz) });
    }
  found.sort((a, b) => a.d - b.d);
  const near = found.slice(0, limit * 3);
  if (!near.length) return [];
  const ids = near.map((o) => o.building);
  const db = createAdminClient();
  const [{ data: owned }, { data: leased }] = await Promise.all([
    db.from("property_units").select("building_id").in("building_id", ids),
    db.from("business_leases").select("building_id").in("building_id", ids).eq("status", "live"),
  ]);
  const taken = new Set([...((owned ?? []) as { building_id: string }[]), ...((leased ?? []) as { building_id: string }[])].map((r) => r.building_id));
  return near
    .filter((o) => !taken.has(o.building))
    .slice(0, limit)
    .map(({ d: _d, ...o }) => {
      void _d;
      return o;
    });
}

/** Good picks across the whole city (no area chosen): a few free buildings from each district, cheapest first. */
export async function leasableAcross(region: string, maxNaira?: number): Promise<LeaseOffer[]> {
  const map = regionMap(region);
  if (!map) return [];
  const places = map.region.districts.slice(0, 12).map((d) => toTile(map.frame, { lat: d.at.lat, lon: d.at.lon }));
  const lists = await Promise.all(places.map((p) => leasableNear(region, p.x, p.z, maxNaira, 3)));
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((o) => (seen.has(o.building) ? false : (seen.add(o.building), true)))
    .sort((a, b) => a.priceNaira - b.priceNaira)
    .slice(0, 24);
}
