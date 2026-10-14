// What "Your money" shows (docs/MONEY.md): the daily gift and where today's money came from.
import type { GiftParts } from "./daily-gift.ts";

export type MoneyView = {
  /** Today's gift: taken already (and how much, naira), or what it would be, part by part. */
  gift: { claimed: boolean; amountNaira: number | null; streak: number; parts: GiftParts | null; activeToday: number } | null;
  /** Money in today (Lagos time), by where it came from, naira. */
  inToday: { label: string; naira: number }[];
  /** Money spent today, naira. */
  outToday: number;
};

/** A ledger kind, in words (money in). */
export function sourceOf(kind: string) {
  if (kind === "daily_gift") return "Daily gift";
  if (kind.startsWith("challenge")) return "Challenges";
  if (kind.startsWith("event")) return "Events";
  if (kind === "first_step") return "First steps";
  if (["work_pay", "public_pay", "hustle_pay", "bonus"].includes(kind)) return "Work";
  if (kind === "rent") return "Rent from your places";
  if (kind.includes("gift") || kind.includes("spray") || kind === "transfer_in") return "Gifts from people";
  return "Other";
}
