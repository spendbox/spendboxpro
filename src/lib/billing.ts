// Plans and what a business's billing state is right now. No database calls,
// so pages and the daily job can share it.

export type PlanKey = "starter" | "plus";

export const PLANS: Record<PlanKey, { name: string; blurb: string; features: string[] }> = {
  starter: {
    name: "Starter",
    blurb: "Keep your customers coming back",
    features: [
      "Your customers tell you what they want to buy, with their budget, and you reply on WhatsApp in one tap",
      "Your own 3D shop and products, shared with one link",
      "Welcome, invite and birthday perks sent for you, so customers return and bring friends",
      "Every customer in one list: birthdays, interests and how to reach them",
      "See who views, saves and asks about each product",
      "Team up with partner businesses that recommend you",
    ],
  },
  plus: {
    name: "Plus",
    blurb: "Get new buyers from your partners",
    features: [
      "Everything in Starter",
      "Requests from your partners' customers too: people ready to buy who don't know you yet",
      "More people asking means more sales, without paying for ads",
    ],
  },
};

/** Ways to pay ahead. */
export const MONTH_CHOICES = [1, 3, 6, 12] as const;

/** Days after a plan ends before an unpaid business is paused (fair use). */
export const GRACE_DAYS = 14;

const DAY = 86_400_000;

export interface BillingFields {
  created_at: string;
  trial_ends_at?: string | null;
  paid_until?: string | null;
  plan?: PlanKey | string | null;
  suspended_at?: string | null;
  suspended_reason?: string | null;
}

export type BillingStatus = "trial" | "active" | "due" | "suspended";

export interface BillingState {
  status: BillingStatus;
  plan: PlanKey;
  /** When the current free time or paid time runs out. */
  accessUntil: Date;
  /** When an unpaid business will be (or was) paused. */
  suspendOn: Date;
  /** Whole days until accessUntil (negative once it's passed). */
  daysLeft: number;
  /** Sees requests from partners' customers too (Plus, or a free trial). */
  partnerRequests: boolean;
  /** Paused by an admin (not for billing). */
  adminPaused: boolean;
}

export function billingState(b: BillingFields, now = Date.now()): BillingState {
  const trialEnd = new Date(b.trial_ends_at ?? b.created_at).getTime();
  const paidEnd = b.paid_until ? new Date(b.paid_until).getTime() : 0;
  const accessUntil = Math.max(trialEnd, paidEnd);
  const plan: PlanKey = b.plan === "plus" ? "plus" : "starter";
  const status: BillingStatus =
    b.suspended_at && b.suspended_reason === "billing" ? "suspended" : paidEnd > now ? "active" : trialEnd > now ? "trial" : "due";
  return {
    status,
    plan,
    accessUntil: new Date(accessUntil),
    suspendOn: new Date(accessUntil + GRACE_DAYS * DAY),
    daysLeft: Math.ceil((accessUntil - now) / DAY),
    partnerRequests: status === "trial" || (status === "active" && plan === "plus"),
    adminPaused: Boolean(b.suspended_at && b.suspended_reason !== "billing"),
  };
}

export function priceFor(plan: PlanKey, prices: { priceStarter: number; pricePlus: number }) {
  return plan === "plus" ? prices.pricePlus : prices.priceStarter;
}
