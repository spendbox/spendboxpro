// Things people own (docs/ITEMS.md): jewellery, clothes, books, gadgets, home goods, art, fitness
// gear and cars. Each kind has a price in the city's shops, an effect on its owner (a happier
// mind, a healthier body, or reputation), and a way its worth moves with time (art and gold gain
// value, gadgets and cars lose it). Market sales pull a kind's worth towards what people really
// pay. Players also craft new kinds (inventions) that join the game for good.
//
// Shared by the server (which works out every price and effect here, never trusting the phone),
// the screens, and the world lab. The database part is game-db/050_economy_items.sql.

import { OWNED_PRICES } from "./price-level.ts";
import type { Prices } from "./region.ts";

export type ItemCategory = "jewellery" | "clothing" | "book" | "gadget" | "home" | "art" | "fitness" | "car";

/** What owning one does: Mind and Body every 2 hours (a day in your life), reputation for as long as you have it. */
export type ItemEffect = { mind?: number; body?: number; rep?: number };

export type ItemKind = {
  id: string;
  name: string;
  category: ItemCategory;
  /** What a new one costs in the shops (naira). */
  price: number;
  effect: ItemEffect;
  /** For cars: how fast it gets you about (km/h in Lagos traffic) and fuel a km (naira). */
  car?: { speed: number; fuelKm: number };
  /** Made by a player (an invention): who, and how many were made. */
  creator?: string | null;
};

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  jewellery: "Jewellery",
  clothing: "Clothing",
  book: "Books",
  gadget: "Gadgets",
  home: "Home",
  art: "Art",
  fitness: "Fitness",
  car: "Cars",
};

/** How a category's worth moves a month (a month is 2½ real days): art and jewellery gain, gadgets and cars lose. */
export const DRIFT: Record<ItemCategory, number> = {
  jewellery: 0.01,
  clothing: -0.02,
  book: 0,
  gadget: -0.03,
  home: -0.015,
  art: 0.025,
  fitness: -0.01,
  car: -0.012,
};

// Prices are real Lagos prices, times Newtown's level for things you own (src/lib/world/price-level.ts).
const K = (id: string, name: string, category: ItemCategory, price: number, effect: ItemEffect, car?: ItemKind["car"]): ItemKind => ({ id, name, category, price: price * OWNED_PRICES, effect, ...(car ? { car } : {}) });

/** What the city's shops and car dealers sell (naira). */
export const SHOP: ItemKind[] = [
  K("beads", "Coral bead necklace", "jewellery", 15_000, { mind: 0.15, rep: 0.5 }),
  K("gold_chain", "Gold chain", "jewellery", 450_000, { mind: 0.2, rep: 3 }),
  K("wristwatch", "Wristwatch", "jewellery", 120_000, { rep: 1 }),
  K("luxury_watch", "Luxury watch", "jewellery", 2_500_000, { mind: 0.2, rep: 8 }),
  K("ankara", "Ankara outfit", "clothing", 35_000, { mind: 0.2, rep: 0.5 }),
  K("agbada", "Agbada", "clothing", 120_000, { mind: 0.1, rep: 2 }),
  K("sneakers", "Designer sneakers", "clothing", 250_000, { mind: 0.2, rep: 2 }),
  K("novel", "Novel", "book", 6_000, { mind: 0.3 }),
  K("business_book", "Business book", "book", 12_000, { mind: 0.2 }),
  K("textbook", "Textbook", "book", 20_000, { mind: 0.1 }),
  K("smartphone", "Smartphone", "gadget", 350_000, { mind: 0.3, rep: 1 }),
  K("laptop", "Laptop", "gadget", 900_000, { mind: 0.2, rep: 1 }),
  K("generator", "Generator", "gadget", 400_000, { mind: 0.5 }),
  K("tv", "Flat-screen TV", "gadget", 600_000, { mind: 0.4 }),
  K("console", "Games console", "gadget", 750_000, { mind: 0.6 }),
  K("fan", "Standing fan", "home", 45_000, { mind: 0.15, body: 0.1 }),
  K("bed", "Orthopaedic bed", "home", 250_000, { body: 0.3, mind: 0.1 }),
  K("fridge", "Fridge", "home", 500_000, { body: 0.2 }),
  K("solar", "Solar panel kit", "home", 1_200_000, { mind: 0.4, rep: 1 }),
  K("painting", "Painting by a Lagos artist", "art", 300_000, { mind: 0.2, rep: 2 }),
  K("sculpture", "Bronze sculpture", "art", 800_000, { mind: 0.2, rep: 3 }),
  K("bicycle", "Bicycle", "fitness", 120_000, { body: 0.4 }),
  K("dumbbells", "Dumbbells", "fitness", 40_000, { body: 0.3 }),
  K("car_keke", "Keke (tricycle)", "car", 2_500_000, { rep: 1 }, { speed: 15, fuelKm: 25 }),
  K("car_bike", "Motorbike", "car", 900_000, { rep: 0.5 }, { speed: 22, fuelKm: 15 }),
  K("car_corolla", "Toyota Corolla (used)", "car", 9_000_000, { mind: 0.2, rep: 3 }, { speed: 20, fuelKm: 40 }),
  K("car_accord", "Honda Accord", "car", 14_000_000, { mind: 0.3, rep: 4 }, { speed: 20, fuelKm: 45 }),
  K("car_camry", "Toyota Camry", "car", 22_000_000, { mind: 0.3, rep: 6 }, { speed: 21, fuelKm: 45 }),
  K("car_lexus", "Lexus RX", "car", 60_000_000, { mind: 0.4, rep: 12 }, { speed: 21, fuelKm: 60 }),
  K("car_gwagon", "Mercedes G-Wagon", "car", 250_000_000, { mind: 0.5, rep: 30 }, { speed: 21, fuelKm: 90 }),
];

export const shopKind = (id: string) => SHOP.find((k) => k.id === id);

/** Things you might find going about the city (once in a while, when you go somewhere). */
export const FINDS = ["novel", "beads", "dumbbells", "ankara", "business_book", "fan"];
/** How often going somewhere turns something up. */
export const FIND_CHANCE = 0.08;
/** Only cheap things can be swiped from a stall, and it often goes wrong. */
export const STEAL_MAX = 50_000;
export const CAUGHT_CHANCE = 0.4;
/** Caught: a fine of this many times the price, and reputation lost. */
export const CAUGHT_FINE = 3;
export const CAUGHT_REP = 10;

/** Listing on the market costs a small fee (of the asking price); a sale is taxed. */
export const LIST_FEE = 0.02;
export const SALE_TAX = 0.05;
/** Selling straight to the city's shops: at once, at this share of its worth. */
export const QUICK_SALE = 0.6;

const MONTH_MS = 60 * 3_600_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Naira to mint. */
export const mintOf = (naira: number, prices: Prices) => r2(naira / prices.perMint);

/**
 * What the market says a kind is worth only counts between half and one and a half times what the
 * thing was worth when it was made: selling it back and forth between friends (or your own second
 * account) at silly prices can't push up what the city's shops pay for it.
 */
export const MARKET_PULL_MIN = 0.5;
export const MARKET_PULL_MAX = 1.5;

/** A market price kept between MARKET_PULL_MIN and MARKET_PULL_MAX times the base worth. */
export function marketPull(base: number, recentPrice: number) {
  return Math.min(base * MARKET_PULL_MAX, Math.max(base * MARKET_PULL_MIN, recentPrice));
}

/**
 * What one is worth now (mint): its base worth moved by its category's drift since it was made,
 * pulled halfway towards what the market has paid lately (when anyone has, and only within half
 * to one and a half times its base worth), never under a tenth.
 */
export function itemWorth(base: number, category: ItemCategory, madeAt: number, recentPrice: number | null = null, now = Date.now()) {
  const months = Math.max(0, (now - madeAt) / MONTH_MS);
  const drifted = base * Math.pow(1 + DRIFT[category], months);
  const v = recentPrice && recentPrice > 0 ? drifted * 0.5 + marketPull(base, recentPrice) * 0.5 : drifted;
  return r2(Math.max(base * 0.1, v));
}

/**
 * What all your things do for you together, every 2 hours: Mind and Body (capped, so a
 * warehouse of TVs doesn't make anyone a saint), and the reputation they bring.
 */
export function effectsOf(owned: { effect: ItemEffect }[]) {
  const mind = Math.min(2, owned.reduce((t, i) => t + (i.effect.mind ?? 0), 0));
  const body = Math.min(1.5, owned.reduce((t, i) => t + (i.effect.body ?? 0), 0));
  const rep = owned.reduce((t, i) => t + (i.effect.rep ?? 0), 0);
  return { mind: r2(mind), body: r2(body), rep: r2(rep) };
}

// ---------------------------------------------------------------- crafting and inventing

/** How big a thing to make: what one is worth, how long it takes (real hours), how many come out, materials. */
export const CRAFT_TIERS = [
  { id: "small", label: "Small", value: 20_000, hours: 1, copies: 5, effect: 0.15 },
  { id: "medium", label: "Medium", value: 100_000, hours: 3, copies: 3, effect: 0.3 },
  { id: "big", label: "Big", value: 500_000, hours: 8, copies: 2, effect: 0.5 },
  { id: "masterpiece", label: "Masterpiece", value: 3_000_000, hours: 24, copies: 1, effect: 0.9 },
] as const;
export type CraftTier = (typeof CRAFT_TIERS)[number]["id"];

/**
 * Materials cost this share of the tier's worth, for every copy. With the city's shops paying 60%
 * (QUICK_SALE) and a copy worth 0.82 to 1.17 times the tier's worth (craftValue), making things and
 * selling them straight to a shop loses about a tenth at the lowest quality, breaks even at about
 * half quality and makes up to about 1.28 times the materials at the best. The real money is in
 * selling to people on the market, and in the reputation and the effects.
 */
export const MATERIALS = 0.55;

/** What each copy is worth (naira) at this quality (0.2 to 1.2): the tier's worth, more for better work. */
export function craftValue(tierValue: number, quality: number) {
  return Math.round(tierValue * (0.75 + 0.35 * quality));
}

/** The stages every craft goes through, and each one's share of the time. */
export const CRAFT_STAGES = [
  { id: "research", label: "Market research", share: 0.2 },
  { id: "design", label: "Design", share: 0.25 },
  { id: "make", label: "Making", share: 0.4 },
  { id: "test", label: "Testing", share: 0.15 },
] as const;

/** What a craft can do for its owners. */
export type CraftBenefit = "mind" | "body" | "rep";
export const BENEFIT_LABEL: Record<CraftBenefit, string> = { mind: "Happier mind", body: "Healthier body", rep: "Reputation" };

/** Which job skills count as know-how for each kind of thing (a book: teaching; a gadget: tech repairs...). */
export const KNOW_HOW: Record<Exclude<ItemCategory, "car">, string[]> = {
  jewellery: ["beauty", "retail"],
  clothing: ["beauty", "retail"],
  book: ["education", "office"],
  gadget: ["tech", "industry"],
  home: ["building", "industry"],
  art: ["entertainment", "tourism"],
  fitness: ["health", "entertainment"],
};

/**
 * How good you are at making this (0 to 1): your education (finished courses), your know-how in
 * the matching job skills, and how many things you've made before.
 */
export function craftSkill(o: { courses: number; skillDays: number; crafts: number }) {
  const school = Math.min(1, o.courses / 4);
  const know = Math.min(1, Math.sqrt(Math.max(0, o.skillDays) / 5) / 6);
  const practice = Math.min(1, o.crafts / 20);
  return r2(0.15 + 0.35 * school + 0.3 * know + 0.2 * practice);
}

/** Real hours a craft takes: the tier's time, faster the more you've made (down to a third). */
export function craftHours(tier: CraftTier, crafts: number) {
  const t = CRAFT_TIERS.find((x) => x.id === tier)!;
  return r2(t.hours * Math.max(0.34, 1 / (1 + 0.1 * crafts)));
}

/** What comes out: each copy's worth (naira), its effect, and how many. `luck` is 0..1 (the server rolls it). */
export function craftResult(tier: CraftTier, benefit: CraftBenefit, skill: number, luck: number) {
  const t = CRAFT_TIERS.find((x) => x.id === tier)!;
  const quality = r2(Math.max(0.2, Math.min(1.2, skill * (0.85 + 0.3 * luck))));
  const strength = r2(t.effect * quality * (benefit === "rep" ? 8 : 1));
  const effect: ItemEffect = { [benefit]: strength };
  return { quality, value: craftValue(t.value, quality), copies: t.copies, effect };
}

/** A name players can give an invention: 3 to 40 letters and numbers. */
export function cleanItemName(raw: string): string | null {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 3 || name.length > 40) return null;
  if (!/^[\p{L}\p{N} '&.,()-]+$/u.test(name)) return null;
  return name;
}

/** "Mind +0.3 · Rep +2": what an item does, in a few words. */
export function effectWords(e: ItemEffect) {
  const out: string[] = [];
  if (e.mind) out.push(`Mind +${e.mind}`);
  if (e.body) out.push(`Body +${e.body}`);
  if (e.rep) out.push(`Reputation +${e.rep}`);
  return out.join(" · ") || "Just nice to have";
}

// ---------------------------------------------------------------- reputation

/**
 * Your reputation: homes and property (by what they're worth), cars and fine things, inventions
 * people have bought, what people liked of what you left on the map, minus what being caught
 * stealing or voted down cost you. Never below zero.
 */
export function reputationOf(o: { propertyMint: number; homes: number; itemRep: number; inventionsSold: number; penalty: number; marksLiked?: number; challenges?: number }) {
  const property = o.propertyMint > 0 ? Math.round(20 * Math.log10(1 + o.propertyMint / 100)) : 0;
  const parts = {
    property: property + o.homes * 5,
    things: Math.round(o.itemRep),
    inventions: Math.round(o.inventionsSold * 2),
    // Reactions people gave to what you left on the map (up to 50).
    marks: Math.min(50, Math.round((o.marksLiked ?? 0) / 2)),
    // Challenges hosted and won on the map (./challenges challengeRep).
    challenges: Math.max(0, Math.round(o.challenges ?? 0)),
    penalty: -Math.round(o.penalty),
  };
  return { score: Math.max(0, parts.property + parts.things + parts.inventions + parts.marks + parts.challenges + parts.penalty), parts };
}
