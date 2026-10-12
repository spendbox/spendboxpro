"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";
import type { Listing, MarketBoard, RentLevel } from "@/lib/world/market";
import { BUY_TAX, type PropertyResult } from "@/lib/world/property-api";

// The player market (docs/MARKET.md; the database part is game-db/046_market.sql): selling to
// other players, offers, tenants and World Bank loans. The database checks every rule.

const n = (v: unknown) => Number(v ?? 0) || 0;
const UNIT = /^[a-z0-9-]+:-?\d+,-?\d+\/\d+$/;

function say(message: string | undefined): PropertyResult {
  const [code, arg] = (message ?? "").split(":");
  const words: Record<string, string> = {
    not_enough: `You need ₥${arg} for that.`,
    not_yours: "That isn't yours.",
    is_home: "That's a home someone lives in, so it isn't for sale. (Your own home: move somewhere else first.)",
    yours: "That's already yours.",
    home_first: "Buy a home first: somewhere to live comes before anything else.",
    no_life: "Start your life first.",
    not_for_sale: "That's not for sale any more.",
    price_changed: `The price has changed to ₥${arg}. Look again before you buy.`,
    not_owned: "Nobody owns that yet: buy it from the city instead.",
    already_offered: "You've already made an offer on that one.",
    too_many_offers: "You have 5 offers waiting. Wait for answers, or withdraw one.",
    offer_gone: "That offer isn't open any more.",
    gone: "That property isn't there any more.",
    bad_price: "That price doesn't work. A counter-offer must be higher than the offer.",
    bad_level: "Pick cheap, fair or high.",
    over_limit: `The World Bank lends you up to ₥${arg} right now.`,
    bank_short: "The World Bank can't lend that much today.",
    bad_amount: "That amount doesn't work.",
    bad_months: "Pick 6, 12 or 24 months (a month is 2½ days).",
    no_loan: "You don't have a loan.",
    frozen: "Your account is paused right now.",
    unknown_player: "Please sign in again.",
  };
  if (words[code]) return { ok: false, error: words[code] };
  console.error("Market action failed", message);
  return { ok: false, error: "That didn't work just now. Try again." };
}

async function run(fn: string, args: Record<string, unknown>): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const { data, error } = await createAdminClient().rpc(fn, { p_user: userId, ...args });
  if (error) return say(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, coins: d.coins === undefined ? undefined : n(d.coins), home: d.home === true, rent: d.rent === undefined ? undefined : n(d.rent) };
}

const price = (v: number) => Math.round(Number(v) * 100) / 100;

export async function setRentLevel(unitId: string, level: RentLevel): Promise<PropertyResult> {
  if (!UNIT.test(unitId ?? "")) return { ok: false, error: "Unknown property." };
  return run("property_rent_level", { p_unit: unitId, p_level: level });
}

export async function listUnit(unitId: string, asking: number): Promise<PropertyResult> {
  if (!UNIT.test(unitId ?? "")) return { ok: false, error: "Unknown property." };
  return run("market_list", { p_unit: unitId, p_price: price(asking) });
}

export async function unlistUnit(unitId: string): Promise<PropertyResult> {
  return run("market_unlist", { p_unit: unitId });
}

/** Buy a unit at its asking price (Savings tops up your wallet if you're short, as when buying from the city). */
export async function buyListed(unitId: string, asking: number): Promise<PropertyResult> {
  if (!UNIT.test(unitId ?? "")) return { ok: false, error: "Unknown property." };
  await topUp(price(asking) * (1 + BUY_TAX));
  return run("market_buy", { p_unit: unitId, p_price: price(asking) });
}

export async function makeOffer(unitId: string, offer: number): Promise<PropertyResult> {
  if (!UNIT.test(unitId ?? "")) return { ok: false, error: "Unknown property." };
  await topUp(price(offer) * (1 + BUY_TAX));
  return run("market_offer", { p_unit: unitId, p_price: price(offer) });
}

export async function answerOffer(offerId: string, action: "accept" | "refuse" | "counter", counter?: number): Promise<PropertyResult> {
  return run("market_answer", { p_offer: Number(offerId), p_action: action, p_counter: counter === undefined ? null : price(counter) });
}

export async function replyOffer(offerId: string, action: "accept" | "withdraw"): Promise<PropertyResult> {
  return run("market_reply", { p_offer: Number(offerId), p_action: action });
}

export async function marketBoard(): Promise<MarketBoard | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await createAdminClient().rpc("market_board", { p_user: userId });
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  const offers = (v: unknown) =>
    ((v as Record<string, unknown>[]) ?? []).map((o) => ({
      id: String(o.id),
      unit: String(o.unit),
      label: (o.label as string) ?? null,
      price: n(o.price),
      counter: o.counter == null ? null : n(o.counter),
      status: o.status as MarketBoard["made"][number]["status"],
      expiresAt: String(o.expiresAt),
      who: String(o.who ?? "A player"),
    }));
  const l = d.loan as Record<string, unknown> | null;
  return {
    made: offers(d.made),
    received: offers(d.received),
    loan: l
      ? { id: String(l.id), principal: n(l.principal), balance: n(l.balance), rate: n(l.rate), instalment: n(l.instalment), months: n(l.months), nextDue: String(l.nextDue), missed: n(l.missed) }
      : null,
    canBorrow: n(d.canBorrow),
    rate: n(d.rate),
    misses: n(d.misses),
  };
}

export async function marketListings(region: string): Promise<Listing[]> {
  if (!REGIONS[region]) return [];
  const userId = await currentUserId().catch(() => null);
  const { data, error } = await createAdminClient().rpc("market_listings", { p_region: region });
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((l) => ({
    unit: String(l.unit),
    building: String(l.building),
    label: String(l.label),
    use: String(l.use),
    price: n(l.price),
    who: String(l.who ?? "A player"),
    mine: !!userId && l.seller === userId,
  }));
}

export async function takeLoan(amount: number, months: number): Promise<PropertyResult> {
  return run("loan_take", { p_amount: price(amount), p_months: Math.round(months) });
}

export async function repayLoan(amount: number): Promise<PropertyResult> {
  return run("loan_repay", { p_amount: price(amount) });
}

/** Short in your wallet? Savings tops it up (that's what Savings is for). */
async function topUp(cost: number) {
  const userId = await currentUserId();
  if (!userId) return;
  const db = createAdminClient();
  const [{ data: prof }, { data: pot }] = await Promise.all([
    db.from("profiles").select("coins").eq("id", userId).maybeSingle(),
    db.from("life_pots").select("balance").eq("user_id", userId).eq("pot", "savings").maybeSingle(),
  ]);
  const short = Math.round((cost - n(prof?.coins)) * 100) / 100;
  if (short > 0 && n(pot?.balance) > 0) {
    await db.rpc("life_pot_move", { p_user: userId, p_from: "savings", p_to: "wallet", p_amount: Math.min(short, n(pot?.balance)) });
  }
}
