"use server";

import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { regionMap } from "@/lib/world";
import {
  CATEGORY_LABEL,
  CAUGHT_CHANCE,
  CAUGHT_FINE,
  CAUGHT_REP,
  cleanItemName,
  CRAFT_STAGES,
  CRAFT_TIERS,
  craftHours,
  craftResult,
  craftSkill,
  effectsOf,
  itemWorth,
  KNOW_HOW,
  LIST_FEE,
  MATERIALS,
  mintOf,
  QUICK_SALE,
  reputationOf,
  SALE_TAX,
  shopKind,
  STEAL_MAX,
  type CraftBenefit,
  type CraftTier,
  type ItemCategory,
  type ItemEffect,
} from "@/lib/world/items";
import type { PropertyResult } from "@/lib/world/property-api";

// Things people own, the market, crafting and reputation (docs/ITEMS.md; the database part is
// game-db/050_economy_items.sql). Every price, worth and effect is worked out here from the rules
// in src/lib/world/items.ts, never taken from the phone.

const n = (v: unknown) => Number(v ?? 0) || 0;

function say(message: string | undefined): PropertyResult {
  const [code, arg] = (message ?? "").split(":");
  const words: Record<string, string> = {
    no_life: "Start your life first.",
    not_enough: `You don't have enough for that (${arg} mint).`,
    not_yours: "That isn't yours.",
    no_player: "There's no player with that name.",
    self: "That's you!",
    blocked: "That player isn't taking gifts from you.",
    their_items_full: "Their things are full up.",
    too_many_items: "You have as many things as you can keep. Sell some first.",
    too_many_listings: "You have 20 things up for sale already.",
    bad_price: "Pick a price above nothing.",
    gone: "Someone has just bought that, or it's no longer for sale.",
    yours: "That's yours already.",
    price_changed: `The price changed to ${arg} mint. Look again.`,
    busy_crafting: "You have two things being made already. Wait for one to finish.",
    not_done: "It isn't finished yet.",
    already: "That's done already.",
    frozen: "Your account is paused right now.",
    bad_item: "That isn't on offer.",
  };
  if (words[code]) return { ok: false, error: words[code] };
  console.error("Item action failed", message);
  return { ok: false, error: "That didn't work just now. Try again." };
}

async function lifeOf(userId: string) {
  const { data } = await createAdminClient().from("lives").select("region").eq("user_id", userId).maybeSingle();
  const map = data ? regionMap(data.region as string) : null;
  return map ? { region: data!.region as string, prices: map.region.prices } : null;
}

export type MyItem = {
  id: number;
  kind: string;
  name: string;
  category: ItemCategory;
  effect: ItemEffect;
  worth: number;
  how: string;
  listPrice: number | null;
  quality: number;
};
export type CraftUnderWay = { id: number; name: string; category: ItemCategory; tier: CraftTier; benefit: CraftBenefit; startedAt: string; endsAt: string; stage: string; done: boolean };
export type MyThings = {
  items: MyItem[];
  crafts: CraftUnderWay[];
  crafted: number;
  /** What your things do for you together, every 2 hours. */
  effects: { mind: number; body: number; rep: number };
  reputation: { score: number; parts: { property: number; things: number; inventions: number; penalty: number } };
  /** How good you are at making each kind of thing (0..1). */
  craftSkill: Record<string, number>;
  hasCar: boolean;
};

/** Your things, crafts under way, your reputation and how good you are at crafting. */
export async function myThings(): Promise<MyThings | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const db = createAdminClient();
  const [{ data }, { data: skills }, { data: assets }] = await Promise.all([
    db.rpc("my_items", { p_user: userId }),
    db.from("life_skills").select("skill, days").eq("user_id", userId),
    db.rpc("my_assets", { p_user: userId }),
  ]);
  if (!data) return null;
  const d = data as Record<string, unknown>;
  const now = Date.now();
  const items: MyItem[] = ((d.items as Record<string, unknown>[]) ?? []).map((i) => ({
    id: n(i.id),
    kind: String(i.kind),
    name: String(i.name),
    category: i.category as ItemCategory,
    effect: (i.effect ?? {}) as ItemEffect,
    worth: itemWorth(n(i.base), i.category as ItemCategory, Date.parse(String(i.madeAt)), i.recent == null ? null : n(i.recent), now),
    how: String(i.how),
    listPrice: i.listPrice == null ? null : n(i.listPrice),
    quality: n(i.quality),
  }));
  const crafts: CraftUnderWay[] = ((d.crafts as Record<string, unknown>[]) ?? []).map((c) => {
    const spec = (c.spec ?? {}) as Record<string, unknown>;
    const start = Date.parse(String(c.startedAt));
    const end = Date.parse(String(c.endsAt));
    const f = Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start)));
    let acc = 0;
    const stage = CRAFT_STAGES.find((s) => (acc += s.share) >= f)?.label ?? "Testing";
    return { id: n(c.id), name: String(spec.name), category: spec.category as ItemCategory, tier: spec.tier as CraftTier, benefit: spec.benefit as CraftBenefit, startedAt: String(c.startedAt), endsAt: String(c.endsAt), stage, done: now >= end };
  });
  const crafted = n(d.crafted);
  const days = Object.fromEntries((skills ?? []).map((s) => [s.skill as string, n(s.days)]));
  const courses = n(d.courses);
  const skill: Record<string, number> = {};
  for (const [cat, know] of Object.entries(KNOW_HOW)) skill[cat] = craftSkill({ courses, skillDays: Math.max(0, ...know.map((k) => days[k] ?? 0)), crafts: crafted });
  const units = ((assets as { units?: { price: number; unit: string }[]; homeUnit?: string } | null)?.units ?? []) as { price: number }[];
  const effects = effectsOf(items);
  const reputation = reputationOf({
    propertyMint: units.reduce((t, u) => t + n(u.price), 0),
    homes: units.length > 0 ? 1 : 0,
    itemRep: effects.rep,
    inventionsSold: n(d.inventionsSold),
    penalty: n(d.penalty),
  });
  return { items, crafts, crafted, effects, reputation, craftSkill: skill, hasCar: items.some((i) => i.category === "car") };
}

/** Buy a new one from the city's shops or a car dealer. */
export async function buyFromShop(kindId: string): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to buy things." };
  const k = shopKind(kindId);
  const life = await lifeOf(userId);
  if (!k) return say("bad_item");
  if (!life) return say("no_life");
  const cost = mintOf(k.price, life.prices);
  const { error } = await createAdminClient().rpc("item_get", { p_user: userId, p_kind: k.id, p_name: k.name, p_category: k.category, p_value: cost, p_effect: k.effect, p_how: "bought", p_cost: cost });
  return error ? say(error.message) : { ok: true };
}

/** Try to swipe something cheap from a stall: it might work, or you're caught (a fine, reputation and peace of mind lost). */
export async function swipe(kindId: string): Promise<PropertyResult & { caught?: boolean }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const k = shopKind(kindId);
  const life = await lifeOf(userId);
  if (!k || k.price > STEAL_MAX || k.category === "car") return { ok: false, error: "That's too big to slip into a pocket." };
  if (!life) return say("no_life");
  const db = createAdminClient();
  if (Math.random() < CAUGHT_CHANCE) {
    const { data, error } = await db.rpc("item_caught", { p_user: userId, p_fine: mintOf(k.price * CAUGHT_FINE, life.prices), p_rep: CAUGHT_REP });
    if (error) return say(error.message);
    return { ok: true, caught: true, fare: n(data) };
  }
  const { error } = await db.rpc("item_get", { p_user: userId, p_kind: k.id, p_name: k.name, p_category: k.category, p_value: mintOf(k.price, life.prices), p_effect: k.effect, p_how: "stolen", p_cost: 0 });
  return error ? say(error.message) : { ok: true, caught: false };
}

/** Give one of your things to another player (by their name). */
export async function giftItem(itemId: number, to: string): Promise<PropertyResult & { to?: string }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { data, error } = await createAdminClient().rpc("item_gift", { p_user: userId, p_item: Math.round(n(itemId)), p_to: String(to ?? "").slice(0, 40) });
  return error ? say(error.message) : { ok: true, to: String(data) };
}

/** Put one of your things up for sale at your price (a 2% listing fee), or change its price. */
export async function listItem(itemId: number, price: number): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const p = Math.round(n(price) * 100) / 100;
  if (p <= 0) return say("bad_price");
  const fee = Math.max(0.1, Math.round(p * LIST_FEE * 100) / 100);
  const { error } = await createAdminClient().rpc("item_list", { p_user: userId, p_item: Math.round(n(itemId)), p_price: p, p_fee: fee });
  return error ? say(error.message) : { ok: true };
}

export async function unlistItem(itemId: number): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { error } = await createAdminClient().rpc("item_unlist", { p_user: userId, p_item: Math.round(n(itemId)) });
  return error ? say(error.message) : { ok: true };
}

export type MarketItem = { id: number; kind: string; name: string; category: ItemCategory; effect: ItemEffect; price: number; worth: number; seller: string; maker: string | null; mine: boolean };

/** What's for sale on the market (a category or everything), cheapest first. */
export async function marketItems(category: string): Promise<MarketItem[]> {
  const userId = await currentUserId();
  const { data } = await createAdminClient().rpc("market_items", { p_user: userId ?? "00000000-0000-0000-0000-000000000000", p_category: category in CATEGORY_LABEL ? category : "all" });
  const now = Date.now();
  return ((data ?? []) as Record<string, unknown>[]).map((i) => ({
    id: n(i.id),
    kind: String(i.kind),
    name: String(i.name),
    category: i.category as ItemCategory,
    effect: (i.effect ?? {}) as ItemEffect,
    price: n(i.price),
    worth: itemWorth(n(i.base), i.category as ItemCategory, Date.parse(String(i.madeAt)), i.recent == null ? null : n(i.recent), now),
    seller: String(i.seller),
    maker: i.maker == null ? null : String(i.maker),
    mine: !!i.mine,
  }));
}

/** Buy something on the market at its price (the seller pays 5% tax on the sale). */
export async function buyItem(itemId: number, price: number): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to buy." };
  const { error } = await createAdminClient().rpc("item_buy", { p_user: userId, p_item: Math.round(n(itemId)), p_price: n(price), p_tax: SALE_TAX });
  return error ? say(error.message) : { ok: true };
}

/** Sell to the city's shops straight away, at 60% of what it's worth. */
export async function sellToCity(itemId: number): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const db = createAdminClient();
  const { data: i } = await db.from("items").select("owner, kind, base_value, category, made_at").eq("id", Math.round(n(itemId))).maybeSingle();
  if (!i || i.owner !== userId) return say("not_yours");
  const { data: recent } = await db.rpc("item_recent_price", { p_kind: i.kind });
  const amount = Math.round(itemWorth(n(i.base_value), i.category as ItemCategory, Date.parse(String(i.made_at)), recent == null ? null : n(recent)) * QUICK_SALE * 100) / 100;
  const { data, error } = await db.rpc("item_sell_city", { p_user: userId, p_item: Math.round(n(itemId)), p_amount: amount });
  return error ? say(error.message) : { ok: true, coins: n(data) };
}

/**
 * Start making something new: its name, what kind of thing, how big, and what it does. Materials
 * are paid now; it goes through market research, design, making and testing, faster the more you
 * make. Its quality comes from your education, your know-how and your practice.
 */
export async function startCraft(f: { name: string; category: string; tier: string; benefit: string }): Promise<PropertyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in to make things." };
  const name = cleanItemName(f.name);
  if (!name) return { ok: false, error: "Give it a name: 3 to 40 letters and numbers." };
  if (!(f.category in KNOW_HOW)) return { ok: false, error: "Pick what kind of thing it is." };
  const tier = CRAFT_TIERS.find((t) => t.id === f.tier);
  if (!tier) return { ok: false, error: "Pick how big it is." };
  if (!["mind", "body", "rep"].includes(f.benefit)) return { ok: false, error: "Pick what it does." };
  const life = await lifeOf(userId);
  if (!life) return say("no_life");
  const me = await myThings();
  if (!me) return say("no_life");
  const skill = me.craftSkill[f.category] ?? 0.15;
  const result = craftResult(tier.id, f.benefit as CraftBenefit, skill, Math.random());
  const hours = craftHours(tier.id, me.crafted);
  const cost = mintOf(tier.value * tier.copies * MATERIALS, life.prices);
  const spec = { name, category: f.category, tier: tier.id, benefit: f.benefit, quality: result.quality, value: mintOf(result.value, life.prices), effect: result.effect, copies: result.copies };
  const { error } = await createAdminClient().rpc("craft_start", { p_user: userId, p_spec: spec, p_cost: cost, p_hours: hours });
  return error ? say(error.message) : { ok: true };
}

/** A finished craft: it becomes a new kind of thing, and its copies are yours to keep or sell. */
export async function finishCraft(craftId: number): Promise<PropertyResult & { name?: string }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const db = createAdminClient();
  const { data: c } = await db.from("crafts").select("spec, user_id").eq("id", Math.round(n(craftId))).maybeSingle();
  if (!c || c.user_id !== userId) return say("not_yours");
  const spec = c.spec as Record<string, unknown>;
  const { error } = await db.rpc("craft_finish", { p_user: userId, p_craft: Math.round(n(craftId)), p_value: n(spec.value), p_effect: spec.effect ?? {}, p_copies: Math.round(n(spec.copies)) });
  return error ? say(error.message) : { ok: true, name: String(spec.name) };
}

/** Newest inventions (for the News and the market). */
export async function inventions(): Promise<{ id: string; name: string; category: ItemCategory; maker: string; sold: number; at: string }[]> {
  const { data } = await createAdminClient().rpc("inventions_top", { p_limit: 12 });
  return ((data ?? []) as Record<string, unknown>[]).map((k) => ({ id: String(k.id), name: String(k.name), category: k.category as ItemCategory, maker: String(k.maker), sold: n(k.sold), at: String(k.at) }));
}
