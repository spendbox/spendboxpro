import "server-only";
import { cache } from "react";
import { PERK_KIND_ORDER } from "@/lib/perks";
import { createClient } from "@/lib/supabase/server";
import type { BusinessMemberRow, BusinessRequestRow, BusinessRewardRow, BusinessStats, Perk, RewardStatus } from "@/lib/types";

// Data for the business dashboard. Each function goes through database
// functions that only answer the business's owner.

export interface BusinessReach {
  customers: number;
  /** Partners' customers who haven't joined (they see this business's posts and perks). */
  partner_customers: number;
  total: number;
  partners: number;
}

/** Who the business's posts can reach: its customers plus its partners' customers. */
export const getReach = cache(async (bizId: string): Promise<BusinessReach> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("business_reach", { p_business_id: bizId }).maybeSingle();
  const r = data as Partial<Record<keyof BusinessReach, number | string>> | null;
  const n = (v: number | string | undefined) => Number(v ?? 0);
  return { customers: n(r?.customers), partner_customers: n(r?.partner_customers), total: n(r?.total), partners: n(r?.partners) };
});

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

export { compactNumber } from "@/lib/format";
