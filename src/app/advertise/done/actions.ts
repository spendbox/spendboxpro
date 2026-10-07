"use server";

import { REF_RE } from "@/lib/ads";
import { createAdminClient } from "@/lib/supabase/admin";
import { setAdvertiserSession } from "../../advertiser/session";

const FRESH_MS = 6 * 3600_000;

/**
 * Right after paying, signs the advertiser in on this device so "Manage your ad" just works.
 * Only for a payment made in the last few hours (the reference is in the address Paystack
 * sends them back to).
 */
export async function claimSessionFromPayment(reference: string): Promise<boolean> {
  const ref = String(reference ?? "");
  if (!REF_RE.test(ref) || ref.startsWith("sp-")) return false;
  const db = createAdminClient();
  let advertiserId: string | null = null;
  let paidAt: string | null = null;
  if (ref.startsWith("ad-")) {
    const { data } = await db.from("ads").select("advertiser_id, paid_at").eq("paystack_reference", ref).maybeSingle();
    advertiserId = (data?.advertiser_id as string | null) ?? null;
    paidAt = (data?.paid_at as string | null) ?? null;
  } else {
    const { data } = await db.from("ad_topups").select("paid_at, ads(advertiser_id)").eq("paystack_reference", ref).maybeSingle();
    const ad = (Array.isArray(data?.ads) ? data?.ads[0] : data?.ads) as { advertiser_id: string | null } | null | undefined;
    advertiserId = ad?.advertiser_id ?? null;
    paidAt = (data?.paid_at as string | null) ?? null;
  }
  if (!advertiserId || !paidAt || Date.now() - Date.parse(paidAt) > FRESH_MS) return false;
  await setAdvertiserSession(advertiserId);
  return true;
}
