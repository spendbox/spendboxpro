import "server-only";
import { cache } from "react";
import { PERK_KIND_ORDER } from "@/lib/perks";
import { createClient } from "@/lib/supabase/server";
import type { BusinessMemberRow, BusinessRequestRow, BusinessRewardRow, BusinessStats, Perk, RewardStatus } from "@/lib/types";

// Data for the business dashboard. Each function goes through database
// functions that only answer the business's owner.

export const getStats = cache(async (bizId: string): Promise<BusinessStats> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("business_stats", { p_business_id: bizId }).maybeSingle();
  return (
    (data as BusinessStats | null) ?? {
      members: 0,
      members_new: 0,
      sales_week: 0,
      purchases_week: 0,
      pending: 0,
      rewards_ready: 0,
      referred_members: 0,
      unmatched: 0,
    }
  );
});

export const getMembers = cache(async (bizId: string): Promise<BusinessMemberRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("business_members", { p_business_id: bizId });
  return (data ?? []) as BusinessMemberRow[];
});

export async function getRewards(
  bizId: string,
  { status, membershipId }: { status?: RewardStatus | null; membershipId?: string } = {},
): Promise<BusinessRewardRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("business_rewards", {
    p_business_id: bizId,
    p_status: status === undefined ? "available" : status,
    p_membership_id: membershipId ?? null,
  });
  return (data ?? []) as BusinessRewardRow[];
}

export const getPerks = cache(async (bizId: string): Promise<Perk[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("perks").select("*").eq("business_id", bizId).order("created_at");
  return ((data ?? []) as Perk[]).sort((a, b) => PERK_KIND_ORDER.indexOf(a.kind) - PERK_KIND_ORDER.indexOf(b.kind));
});

/** Live customer requests this business can see (its customers, and partners' customers on Plus). */
export const getRequests = cache(async (bizId: string): Promise<BusinessRequestRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("business_requests", { p_business_id: bizId });
  return (data ?? []) as BusinessRequestRow[];
});

/** "1,284", "12.9K", "4.2M" */
export function compactNumber(n: number) {
  return new Intl.NumberFormat("en-NG", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}
