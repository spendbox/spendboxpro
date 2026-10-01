import "server-only";
import { cache } from "react";
import { PERK_KIND_ORDER } from "@/lib/perks";
import { createClient } from "@/lib/supabase/server";
import type { MembershipWithBusiness, Profile, Purchase, Reward } from "@/lib/types";

export const getMyProfile = cache(async (userId: string): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return (data as Profile | null) ?? null;
});

export const getMyMemberships = cache(async (userId: string): Promise<MembershipWithBusiness[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("*, business:businesses(*, perks(*))")
    .eq("customer_id", userId)
    .order("joined_at", { ascending: false });
  const rows = (data ?? []) as MembershipWithBusiness[];
  for (const m of rows) {
    m.business.perks = (m.business.perks ?? [])
      .filter((p) => p.is_active)
      .sort((a, b) => PERK_KIND_ORDER.indexOf(a.kind) - PERK_KIND_ORDER.indexOf(b.kind));
  }
  return rows;
});

/** Rewards ready to use (not used, not expired). */
export const getMyRewards = cache(async (userId: string): Promise<Reward[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rewards")
    .select("*")
    .eq("customer_id", userId)
    .eq("status", "available")
    .order("issued_at", { ascending: false });
  const now = Date.now();
  return ((data ?? []) as Reward[]).filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now);
});

export const getMyPurchases = cache(async (userId: string): Promise<Purchase[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchases")
    .select("id, business_id, membership_id, amount, currency, paid_at, description, reference, source, match_method, status, receipt_path, created_at")
    .eq("customer_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []) as Purchase[];
});

/** Issues any birthday treats that are due. Cheap and safe to call on page load. */
export async function syncMyRewards() {
  const supabase = await createClient();
  await supabase.rpc("sync_my_rewards");
}
