import "server-only";
import { cache } from "react";
import { PERK_KIND_ORDER } from "@/lib/perks";
import { createClient } from "@/lib/supabase/server";
import type { CustomerRequest, MembershipWithBusiness, PartnerPerkRow, Profile, RequestContact, Reward } from "@/lib/types";

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

/** Perks from partners of the given businesses (cross-promotion). */
export async function getPartnerPerks(businessIds: string[]): Promise<PartnerPerkRow[]> {
  if (businessIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("partner_perks", { p_business_ids: businessIds });
  return (data ?? []) as PartnerPerkRow[];
}

/** Perks the customer has already been given, newest first. */
export async function getMyUsedRewards(userId: string): Promise<Reward[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rewards")
    .select("*")
    .eq("customer_id", userId)
    .eq("status", "redeemed")
    .order("redeemed_at", { ascending: false })
    .limit(200);
  return (data ?? []) as Reward[];
}

/** The customer's requests, newest first. */
export const getMyRequests = cache(async (userId: string): Promise<CustomerRequest[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("requests")
    .select("id, body, category, area, budget_min, budget_max, currency, images, contact_whatsapp, contact_call, contact_email, status, created_at, expires_at")
    .eq("customer_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []) as CustomerRequest[];
});

/** Businesses that reached out, for each of the customer's recent requests (one call). */
export async function getMyRequestContacts(): Promise<Record<string, RequestContact[]>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_requests_contacts");
  const byRequest: Record<string, RequestContact[]> = {};
  for (const { request_id, ...contact } of (data ?? []) as (RequestContact & { request_id: string })[]) {
    (byRequest[request_id] ??= []).push(contact as RequestContact);
  }
  return byRequest;
}

/** Perks from partners of every business the customer joined (one call). */
export async function getMyPartnerPerks(): Promise<PartnerPerkRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_partner_perks");
  return (data ?? []) as PartnerPerkRow[];
}
