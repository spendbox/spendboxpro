export type PerkKind = "welcome" | "referral" | "visits" | "spend" | "birthday";
export type PurchaseStatus = "verified" | "pending" | "rejected";
export type RewardStatus = "available" | "redeemed" | "void";
export type Gender = "female" | "male" | "other";

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
  source: "receipt" | "business";
  match_method: "account" | "name" | "manual" | null;
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
  source: "receipt" | "business";
  match_method: "account" | "name" | "manual" | null;
  status: PurchaseStatus;
  has_receipt: boolean;
  bank_label: string | null;
  created_at: string;
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
