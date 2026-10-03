export type PerkKind = "welcome" | "referral" | "visits" | "spend" | "birthday";
export type PurchaseStatus = "verified" | "pending" | "rejected";
export type RewardStatus = "available" | "redeemed" | "void";
export type Gender = "female" | "male" | "other";
/** receipt: uploaded by the customer · business: typed in by the business · bank: seen in the business's bank. */
export type PurchaseSource = "receipt" | "business" | "bank";
/** account/name: receipt matching · payer: a sender we recognised · recorded: linked to a typed-in purchase. */
export type MatchMethod = "account" | "name" | "manual" | "payer" | "recorded";

export interface Profile {
  id: string;
  phone: string | null;
  full_name: string | null;
  gender: Gender | null;
  birth_day: number | null;
  birth_month: number | null;
  birth_year: number | null;
  email: string | null;
  email_notifications: boolean;
}

export interface Business {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  category: string | null;
  categories: string[];
  logo_url: string | null;
  email: string | null;
  location: string | null;
  about: string | null;
  whatsapp: string | null;
  brand_color: string;
  currency: string;
  created_at: string;
  /** Cross-promotion switched on (shows in other businesses' partner search). */
  partners_enabled: boolean;
  /** Partner requests become partnerships without asking. */
  partners_auto_approve: boolean;
  /** Paused from the admin area. */
  suspended_at?: string | null;
  /** Free-trial end set from the admin area (null = the usual length). */
  trial_ends_at?: string | null;
}

export interface BankAccount {
  id: string;
  business_id: string;
  bank_name: string;
  bank_code: string | null;
  account_number: string;
  account_name: string;
  created_at: string;
}

export interface Perk {
  id: string;
  business_id: string;
  kind: PerkKind;
  title: string;
  details: string | null;
  threshold: number | null;
  valid_days: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Membership {
  id: string;
  business_id: string;
  customer_id: string;
  member_no: number;
  ref_code: string;
  referred_by: string | null;
  share_details: boolean;
  joined_at: string;
}

export interface Purchase {
  id: string;
  business_id: string;
  membership_id: string;
  amount: number;
  currency: string;
  paid_at: string;
  description: string | null;
  reference: string | null;
  source: PurchaseSource;
  match_method: MatchMethod | null;
  status: PurchaseStatus;
  receipt_path: string | null;
  created_at: string;
}

export interface Reward {
  id: string;
  business_id: string;
  membership_id: string;
  perk_id: string | null;
  kind: PerkKind;
  title: string;
  status: RewardStatus;
  expires_at: string | null;
  issued_at: string;
  redeemed_at: string | null;
}

/** A customer's membership with the business and its public perks. */
export interface MembershipWithBusiness extends Membership {
  business: Business & { perks: Perk[] };
}

// Rows returned by database functions ------------------------------------------

export interface BusinessStats {
  members: number;
  members_new: number;
  sales_week: number;
  purchases_week: number;
  pending: number;
  rewards_ready: number;
  referred_members: number;
  /** Bank payments waiting for "who paid this?". */
  unmatched: number;
}

export interface BusinessMemberRow {
  membership_id: string;
  member_no: number;
  joined_at: string;
  shares_details: boolean;
  full_name: string | null;
  phone: string | null;
  gender: Gender | null;
  birth_day: number | null;
  birth_month: number | null;
  visits: number;
  total_spent: number;
  last_visit_at: string | null;
  rewards_ready: number;
  referred: boolean;
}

export interface BusinessPurchaseRow {
  id: string;
  membership_id: string;
  member_no: number;
  member_name: string | null;
  amount: number;
  currency: string;
  paid_at: string;
  description: string | null;
  reference: string | null;
  source: PurchaseSource;
  match_method: MatchMethod | null;
  status: PurchaseStatus;
  has_receipt: boolean;
  bank_label: string | null;
  created_at: string;
  /** Who the bank says sent the money (payments from the bank feed). */
  sender_name: string | null;
  from_bank: boolean;
}

export interface BusinessRewardRow {
  id: string;
  membership_id: string;
  member_no: number;
  member_name: string | null;
  kind: PerkKind;
  title: string;
  status: RewardStatus;
  expires_at: string | null;
  issued_at: string;
  redeemed_at: string | null;
}

export interface ReferralRow {
  joined_at: string;
  phone_hint: string;
  has_purchase: boolean;
  reward_status: RewardStatus | null;
}

/** A business in the cross-promotion directory, as another business sees it. */
export interface PartnerListing {
  id: string;
  name: string;
  slug: string;
  categories: string[];
  location: string | null;
  logo_url: string | null;
  brand_color: string;
  members: number;
  auto_approve: boolean;
  /** Already has the maximum number of partners. */
  is_full: boolean;
  /** none · sent (you asked) · received (they asked you) · active */
  relation: "none" | "sent" | "received" | "active";
  partnership_id: string | null;
}

/** A perk from a partner of a business the customer belongs to. */
export interface PartnerPerkRow {
  via_business_id: string;
  partner_id: string;
  partner_name: string;
  partner_slug: string;
  partner_categories: string[];
  partner_location: string | null;
  partner_logo_url: string | null;
  partner_color: string;
  perk_id: string;
  kind: PerkKind;
  title: string;
  details: string | null;
  threshold: number | null;
  valid_days: number | null;
}
