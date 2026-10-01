import { formatMoney } from "@/lib/format";
import type { Perk, PerkKind, Purchase } from "@/lib/types";

export interface PerkKindInfo {
  label: string;
  /** Card colour. White text on it passes contrast. */
  color: string;
  /** Soft background for small badges. */
  tint: string;
  /** One line describing what the business is setting up. */
  pickerHint: string;
  /** Example reward shown as a placeholder. */
  example: string;
  needsThreshold: boolean;
}

export const PERK_KINDS: Record<PerkKind, PerkKindInfo> = {
  welcome: {
    label: "Welcome perk",
    color: "#0B6E4F",
    tint: "#E3F0EA",
    pickerHint: "For every new customer who joins",
    example: "Free drink on your first order",
    needsThreshold: false,
  },
  visits: {
    label: "Loyalty",
    color: "#1C2B24",
    tint: "#E7EBE8",
    pickerHint: "After a number of purchases",
    example: "Free meal",
    needsThreshold: true,
  },
  referral: {
    label: "Invite reward",
    color: "#4338A0",
    tint: "#ECEAFB",
    pickerHint: "When a customer brings a friend",
    example: "Free small chops",
    needsThreshold: false,
  },
  spend: {
    label: "Big spender",
    color: "#A33A0B",
    tint: "#FFEADF",
    pickerHint: "After spending a set amount",
    example: "10% off your next order",
    needsThreshold: true,
  },
  birthday: {
    label: "Birthday treat",
    color: "#A3214E",
    tint: "#FBE7EE",
    pickerHint: "In the customer's birthday month",
    example: "Free cake slice",
    needsThreshold: false,
  },
};

export const PERK_KIND_ORDER: PerkKind[] = ["welcome", "visits", "referral", "spend", "birthday"];

/** "Every 5 purchases", "When a friend they invite makes a first purchase"… */
export function perkTrigger(kind: PerkKind, threshold: number | null, currency = "NGN", audience: "business" | "customer" = "business") {
  const t = Number(threshold ?? 0);
  switch (kind) {
    case "welcome":
      return audience === "business" ? "When someone joins" : "When you join";
    case "visits":
      return t === 1 ? "Every purchase" : `Every ${t} purchases`;
    case "spend":
      return `Every ${formatMoney(t, currency)} spent`;
    case "referral":
      return audience === "business"
        ? "When a friend they invite makes a first purchase"
        : "When a friend you invite makes a first purchase";
    case "birthday":
      return audience === "business" ? "In their birthday month" : "In your birthday month";
  }
}

export interface PerkProgress {
  perk: Perk;
  current: number;
  target: number;
  /** Text like "3 of 5 purchases" or "₦32,000 of ₦50,000". */
  label: string;
  remainingLabel: string;
}

/** How far a member is toward each repeating perk (mirrors the database rules). */
export function perkProgress(perks: Perk[], verifiedPurchases: Pick<Purchase, "amount" | "created_at">[], currency = "NGN") {
  const result: PerkProgress[] = [];
  for (const perk of perks) {
    if (!perk.is_active || !perk.threshold) continue;
    const since = new Date(perk.created_at).getTime();
    const counted = verifiedPurchases.filter((p) => new Date(p.created_at).getTime() >= since);
    const target = Number(perk.threshold);
    if (perk.kind === "visits") {
      const current = counted.length % target;
      const left = target - current;
      result.push({
        perk,
        current,
        target,
        label: `${current} of ${target} purchases`,
        remainingLabel: left === 1 ? "1 more purchase" : `${left} more purchases`,
      });
    } else if (perk.kind === "spend") {
      const total = counted.reduce((sum, p) => sum + Number(p.amount), 0);
      const current = total % target;
      result.push({
        perk,
        current,
        target,
        label: `${formatMoney(current, currency)} of ${formatMoney(target, currency)}`,
        remainingLabel: `${formatMoney(target - current, currency)} more`,
      });
    }
  }
  return result;
}

/** Ready-made perks a new business can add in one tap. */
export const SUGGESTED_PERKS: { kind: PerkKind; title: string; threshold: number | null }[] = [
  { kind: "welcome", title: "Free drink on your first order", threshold: null },
  { kind: "visits", title: "Your 5th order is on us", threshold: 5 },
  { kind: "referral", title: "Free small chops for every friend", threshold: null },
  { kind: "birthday", title: "Birthday treat on us", threshold: null },
];
