import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { perkProgress } from "@/lib/perks";
import type { ExtractedReceipt } from "@/lib/receipts/extract";
import type { CandidateAccount } from "@/lib/receipts/match";
import type { Perk, PerkKind } from "@/lib/types";

export interface SavedReceipt {
  kind: "saved";
  status: "verified" | "pending";
  /** Why the business needs to confirm it (when pending). */
  reason: string | null;
  business: { name: string; slug: string; color: string };
  amount: number;
  currency: string;
  paidAt: string;
  reference: string | null;
  description: string | null;
  bankLabel: string | null;
  newRewards: { kind: PerkKind; title: string }[];
  progress: string | null;
}

export interface UnmatchedReceipt {
  kind: "unmatched";
  token: string;
  summary: { amount: number; currency: string; paidAt: string | null; recipient: string | null };
  options: { membershipId: string; name: string }[];
}

export interface ReceiptError {
  kind: "error";
  message: string;
}

export type ReceiptResult = SavedReceipt | UnmatchedReceipt | ReceiptError;

/** What we know about an uploaded receipt, carried between steps. */
export interface ScannedReceipt {
  uid: string;
  path: string;
  hash: string;
  paidAt: string | null;
  extracted: ExtractedReceipt;
}

export async function saveReceiptPurchase(
  admin: SupabaseClient,
  {
    scan,
    membershipId,
    method,
    account,
    status,
    reason,
  }: {
    scan: ScannedReceipt;
    membershipId: string;
    method: "account" | "name" | "manual";
    account: CandidateAccount | null;
    status: "verified" | "pending";
    reason: string | null;
  },
): Promise<SavedReceipt | ReceiptError> {
  const startedAt = new Date(Date.now() - 2000).toISOString();
  const { data: membership } = await admin
    .from("memberships")
    .select("id, business_id, customer_id, business:businesses(id, name, slug, brand_color, currency, perks(*))")
    .eq("id", membershipId)
    .maybeSingle();
  if (!membership || membership.customer_id !== scan.uid) {
    return { kind: "error", message: "We couldn't find that business in your Spendbox." };
  }
  const business = membership.business as unknown as {
    id: string;
    name: string;
    slug: string;
    brand_color: string;
    currency: string;
    perks: Perk[];
  };

  const x = scan.extracted;
  const reference = x.reference?.trim().slice(0, 80) || null;
  const amount = Math.round(Number(x.amount) * 100) / 100;
  const currency = x.currency && /^[A-Z]{3}$/.test(x.currency) ? x.currency : business.currency;
  const paidAt = scan.paidAt ?? new Date().toISOString();

  const { error } = await admin.from("purchases").insert({
    business_id: business.id,
    membership_id: membership.id,
    customer_id: scan.uid,
    amount,
    currency,
    paid_at: paidAt,
    description: x.description?.trim().slice(0, 200) || null,
    reference,
    source: "receipt",
    match_method: method,
    bank_account_id: account?.id ?? null,
    status,
    receipt_path: scan.path,
    receipt_hash: scan.hash,
    extracted: x,
  });

  if (error) {
    if (error.code === "23505") {
      await admin.storage.from("receipts").remove([scan.path]);
      return { kind: "error", message: `This receipt has already been used at ${business.name}.` };
    }
    console.error("Saving receipt failed", error);
    return { kind: "error", message: "We couldn't save this receipt. Please try again." };
  }

  const [{ data: rewards }, { data: verified }] = await Promise.all([
    admin
      .from("rewards")
      .select("kind, title")
      .eq("membership_id", membership.id)
      .eq("status", "available")
      .in("kind", ["visits", "spend"]) // the perks a purchase itself can unlock
      .gte("issued_at", startedAt),
    admin.from("purchases").select("amount, created_at").eq("membership_id", membership.id).eq("status", "verified"),
  ]);
  const progress = perkProgress(business.perks ?? [], verified ?? [], business.currency)[0];

  return {
    kind: "saved",
    status,
    reason,
    business: { name: business.name, slug: business.slug, color: business.brand_color },
    amount,
    currency,
    paidAt,
    reference,
    description: x.description ?? null,
    bankLabel: account ? `${account.bank_name} •••${account.account_number.slice(-4)}` : null,
    newRewards: (rewards ?? []) as { kind: PerkKind; title: string }[],
    progress: progress ? `${progress.label} · ${progress.perk.title}` : null,
  };
}
