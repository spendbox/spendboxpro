import { formatMoney } from "@/lib/format";
import type { PerkKind } from "@/lib/types";

export interface PerkKindInfo {
  label: string;
  /** Card colour. White text on it passes contrast. */
  color: string;
  /** Soft background for small badges. */
  tint: string;
  /** One line describing what the business is setting up. */
  pickerHint: string;
  /** Example reward shown as a placeholder, written to the customer ("you", "your"). */
  example: string;
  /** More ideas shown under the field. */
  ideas: string[];
  needsThreshold: boolean;
}

export const PERK_KINDS: Record<PerkKind, PerkKindInfo> = {
  welcome: {
    label: "Welcome perk",
    color: "#2A772C",
    tint: "#E3F0EA",
    pickerHint: "For every new customer who joins",
    example: "Free drink on your first order",
    ideas: ["10% off your first order", "Free delivery on your first order", "Extra meat on your first order"],
    needsThreshold: false,
  },
  visits: {
    label: "Loyalty",
    color: "#1C2B24",
    tint: "#E7EBE8",
    pickerHint: "After a number of purchases",
    example: "Your next meal is on us",
    ideas: ["Free haircut on your next visit", "A free drink with your next order", "Your next wash is free"],
    needsThreshold: true,
  },
  referral: {
    label: "Invite reward",
    color: "#4338A0",
    tint: "#ECEAFB",
    pickerHint: "When a friend they invite joins",
    example: "Free small chops for every friend you bring",
    ideas: ["₦1,000 off your next order for every friend", "A free drink for each friend you bring"],
    needsThreshold: false,
  },
  spend: {
    label: "Big spender",
    color: "#A33A0B",
    tint: "#FFEADF",
    pickerHint: "After spending a set amount",
    example: "10% off your next order",
    ideas: ["Free delivery on your next order", "A free side with your next meal"],
    needsThreshold: true,
  },
  birthday: {
    label: "Birthday treat",
    color: "#A3214E",
    tint: "#FBE7EE",
    pickerHint: "In the customer's birthday month",
    example: "Free cake slice for your birthday",
    ideas: ["Your birthday meal is on us", "20% off anything in your birthday month"],
    needsThreshold: false,
  },
};

export const PERK_KIND_ORDER: PerkKind[] = ["welcome", "referral", "birthday", "visits", "spend"];

/** The perks businesses can set up now: ones they can see happen (no payment tracking). */
export const SIMPLE_PERK_KINDS: PerkKind[] = ["welcome", "referral", "birthday"];

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
      return audience === "business" ? "For every friend they bring who joins" : "For every friend you bring who joins";
    case "birthday":
      return audience === "business" ? "In their birthday month" : "In your birthday month";
  }
}

/** Ready-made perks a new business can add in one tap. */
export const SUGGESTED_PERKS: { kind: PerkKind; title: string; threshold: number | null; validDays: number | null }[] = [
  { kind: "welcome", title: "Free drink on your first order", threshold: null, validDays: 30 },
  { kind: "referral", title: "Free small chops for every friend you bring", threshold: null, validDays: 30 },
  { kind: "birthday", title: "A birthday treat on us", threshold: null, validDays: 30 },
];

/** How long customers get to use a perk once earned. null = no limit. */
export const DURATION_CHOICES: (number | null)[] = [7, 14, 30, 60, 90, null];
export const DEFAULT_VALID_DAYS = 30;

export function durationLabel(days: number | null) {
  if (!days) return "No time limit";
  if (days % 30 === 0 && days >= 60) return `${days / 30} months`;
  if (days === 7) return "1 week";
  if (days === 14) return "2 weeks";
  return days === 1 ? "1 day" : `${days} days`;
}

/** "Use within 30 days of earning it" */
export function durationSentence(days: number | null, audience: "business" | "customer" = "business") {
  if (!days) return audience === "business" ? "No time limit to use it" : "No time limit";
  return `Use within ${durationLabel(days)} of earning it`;
}

/**
 * Perk names are read by the customer, so they should speak to them:
 * "Free drink on your first order", not "...on their first order".
 */
export function wordingTip(title: string) {
  const t = title.toLowerCase();
  if (/\b(their|they|them|theirs)\b/.test(t)) return "Tip: customers read this, so say “your” instead of “their”.";
  if (/\b(customer|customers|client|clients|member|members)\b/.test(t)) {
    return "Tip: speak to the customer directly, e.g. “Free drink on your first order”.";
  }
  if (/\bmy\b/.test(t)) return "Tip: say “your” so it reads from the customer's side.";
  return null;
}

/** Time left on an earned perk, for progress bars. */
export function timeLeft(issuedAt: string, expiresAt: string | null) {
  if (!expiresAt) return null;
  const start = new Date(issuedAt).getTime();
  const end = new Date(expiresAt).getTime();
  const now = Date.now();
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86_400_000));
  const fraction = Math.max(0, Math.min(1, (end - now) / Math.max(1, end - start)));
  return { daysLeft, fraction, urgent: daysLeft <= 3 };
}

/** Perks that run out soonest first; ones with no time limit last. */
export function sortBySoonest<T extends { expires_at: string | null; issued_at: string }>(rewards: T[]) {
  return [...rewards].sort((a, b) => {
    const ea = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
    const eb = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
    return ea - eb || new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime();
  });
}
