// The game's name, home and contact address, in one place.

export const SITE_NAME = "Newtown";
export const SITE_DOMAIN = "newtown.world";
export const SITE_URL = `https://${SITE_DOMAIN}`;
export const CONTACT_EMAIL = "hello@newtown.world";
/** The in-game currency. It's a mass noun: "50 mint", "not enough mint". */
export const CURRENCY = "mint";
/** The mint sign, written before amounts: "₥50" (drawn by our own one-glyph font, see app/layout.tsx). */
export const MINT_SIGN = "₥";

/**
 * Database messages were written when the currency was called "coins". This turns them into
 * mint wording on the way to the screen ("Not enough coins" -> "Not enough mint").
 */
export function mintify(text: string): string;
export function mintify(text: string | null | undefined): string | null | undefined;
export function mintify(text: string | null | undefined) {
  if (!text || !/coin/i.test(text)) return text;
  return text
    .replace(/\b(\d[\d,]*(?:\.\d+)?) coins?\b/g, "₥$1")
    .replace(/\b([Cc])oins (are|were|have|go|went)\b/g, (_, c: string, v: string) => `${c === "C" ? "M" : "m"}int ${({ are: "is", were: "was", have: "has", go: "goes", went: "went" } as Record<string, string>)[v]}`)
    .replace(/\bCOINS?\b/g, "MINT")
    .replace(/\bCoins?\b/g, "Mint")
    .replace(/\bcoins?\b/g, "mint")
    .replace(/\b([Mm])any mint\b/g, (_, c: string) => `${c === "M" ? "M" : "m"}uch mint`)
    .replace(/\b([Ff])ewer mint\b/g, (_, c: string) => `${c === "F" ? "L" : "l"}ess mint`);
}
