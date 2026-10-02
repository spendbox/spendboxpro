"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireOwnedBusiness } from "@/lib/auth";
import { notifyPartnership } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import type { PartnerListing } from "@/lib/types";

// Cross-promotion between businesses. The database checks ownership, the
// two-partner limit and who may approve; these just pass requests along.

export interface PartnerResult {
  ok?: boolean;
  error?: string;
  status?: "active" | "pending";
}

function refresh(bizId: string) {
  revalidatePath(`/dashboard/${bizId}`, "layout");
}

export async function setPartnersEnabled(bizId: string, on: boolean): Promise<PartnerResult> {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { error } = await supabase.from("businesses").update({ partners_enabled: on }).eq("id", bizId);
  if (error) return { error: error.message };
  refresh(bizId);
  return { ok: true };
}

export async function setPartnersAutoApprove(bizId: string, on: boolean): Promise<PartnerResult> {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { error } = await supabase.from("businesses").update({ partners_auto_approve: on }).eq("id", bizId);
  if (error) return { error: error.message };
  refresh(bizId);
  return { ok: true };
}

/** Businesses taking partners, by name, category or area. */
export async function searchPartners(bizId: string, query: string, category: string | null): Promise<PartnerListing[]> {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { data } = await supabase.rpc("partner_directory", {
    p_business_id: bizId,
    p_query: query.trim().slice(0, 60) || null,
    p_category: category,
  });
  return (data ?? []) as PartnerListing[];
}

export async function requestPartner(bizId: string, partnerId: string): Promise<PartnerResult> {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_partnership", { p_business_id: bizId, p_partner_id: partnerId });
  if (error) return { error: error.message };
  const status = data as "active" | "pending";
  after(() => notifyPartnership(bizId, partnerId, status === "active" ? "joined" : "request"));
  refresh(bizId);
  return { ok: true, status };
}

export async function respondPartner(bizId: string, partnershipId: string, partnerId: string, accept: boolean): Promise<PartnerResult> {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_partnership", {
    p_business_id: bizId,
    p_partnership_id: partnershipId,
    p_accept: accept,
  });
  if (error) return { error: error.message };
  if (accept) after(() => notifyPartnership(bizId, partnerId, "accepted"));
  refresh(bizId);
  return { ok: true };
}

/** Cancel a request you sent, or end a partnership. */
export async function endPartner(bizId: string, partnershipId: string): Promise<PartnerResult> {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_partnership", { p_business_id: bizId, p_partnership_id: partnershipId });
  if (error) return { error: error.message };
  refresh(bizId);
  return { ok: true };
}
