// The game's name, home and contact address, in one place.

import { PRICES } from "@/lib/world/regions/lagos/prices";
import { cashText, cashTextIn, tidy } from "@/lib/world/value";

export const SITE_NAME = "Newtown";
export const SITE_DOMAIN = "newtown.world";
export const SITE_URL = `https://${SITE_DOMAIN}`;
export const CONTACT_EMAIL = "hello@newtown.world";
/** Newtown on X (formerly Twitter): where players reach us for support. */
export const SUPPORT_X = "newtown_play";
export const SUPPORT_X_URL = `https://x.com/${SUPPORT_X}`;
/**
 * Text the database wrote, with amounts in game money ("50 coins", "₥50", "50 mint"), said the
 * way players see money, and "coins" on its own said as "money" ("Not enough coins" -> "Not enough
 * money"). In the browser amounts come out in the player's own currency; on the server they're left
 * as "₥50" for the phone to show in its player's currency (game.tsx runs notices through cashText),
 * unless `inNaira` (an error message that may be shown as it is): then "₦75,000".
 */
export function mintify(text: string, inNaira?: boolean): string;
export function mintify(text: string | null | undefined, inNaira?: boolean): string | null | undefined;
export function mintify(text: string | null | undefined, inNaira = false) {
  if (!text) return text;
  const words = text
    .replace(/\b(\d[\d,]*(?:\.\d+)?) (?:coins?|mint)\b/g, "₥$1")
    .replace(/\b([Cc])oins (are|were|have|go|went)\b/g, (_, c: string, v: string) => `${c === "C" ? "M" : "m"}oney ${({ are: "is", were: "was", have: "has", go: "goes", went: "went" } as Record<string, string>)[v]}`)
    .replace(/\bCOINS?\b/g, "MONEY")
    .replace(/\bCoins?\b/g, "Money")
    .replace(/\bcoins?\b/g, "money")
    .replace(/\b([Mm])any money\b/g, (_, c: string) => `${c === "M" ? "M" : "m"}uch money`)
    .replace(/\b([Ff])ewer money\b/g, (_, c: string) => `${c === "F" ? "L" : "l"}ess money`);
  if (typeof window !== "undefined") return cashText(words);
  return inNaira ? cashTextIn(words, PRICES) : words;
}

/**
 * An amount of game money in naira, for text the server writes (an error, a notice): 50 -> "₦75,000".
 * Takes what a database error carries too ("1,250").
 */
export function naira(amount: number | string | null | undefined) {
  const n = Number(String(amount ?? 0).replace(/,/g, "")) || 0;
  return `${PRICES.symbol}${tidy(n * PRICES.perMint).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}
