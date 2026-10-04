"use server";

import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { normalizeWhatsapp } from "@/lib/phone";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { cleanCategories } from "@/lib/constants";
import { notifyPartnership } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface NewBusiness {
  name: string;
  categories: string[];
  location: string;
  whatsapp: string;
}

/**
 * A business that signs up from another business's partner invite becomes its
 * partner straight away (the inviter asked, and signing up from the link is the yes),
 * as long as the inviter is still taking partners and has a free place.
 */
async function linkInvitedPartner(newBusinessId: string, inviterSlug: string) {
  const admin = createAdminClient();
  const { data: inviter } = await admin
    .from("businesses")
    .select("id, partners_enabled, suspended_at")
    .eq("slug", inviterSlug.toLowerCase())
    .maybeSingle();
  if (!inviter || !inviter.partners_enabled || inviter.suspended_at || inviter.id === newBusinessId) return;
  const [{ data: used }, { data: limit }] = await Promise.all([
    admin.rpc("partner_slots_used", { p_business_id: inviter.id }),
    admin.rpc("partner_limit"),
  ]);
  if (Number(used ?? 0) >= Number(limit ?? 2)) return;
  await admin.from("businesses").update({ partners_enabled: true }).eq("id", newBusinessId);
  const { error } = await admin
    .from("partnerships")
    .insert({ requester_id: inviter.id, partner_id: newBusinessId, status: "active", responded_at: new Date().toISOString() });
  if (!error) await notifyPartnership(newBusinessId, inviter.id, "invited");
}

/** Returns an error message, or redirects to the new dashboard. */
export async function createBusiness(input: NewBusiness, partnerInvite?: string | null): Promise<string | void> {
  const name = input.name?.trim() ?? "";
  if (name.length < 2 || name.length > 80) return "Please enter your business name.";
  if (!(await getUser())) return "Please sign in first.";

  const categories = cleanCategories(input.categories);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_business", {
    p_name: name,
    p_category: categories[0] ?? null,
    p_location: input.location?.trim().slice(0, 80) || null,
    p_whatsapp: normalizeWhatsapp(input.whatsapp, DEFAULT_COUNTRY_CODE),
  });
  if (error || !data) return error?.message ?? "Could not create your business. Please try again.";
  // The owner's email is the business's contact email until they change it in Settings.
  const { data: owner } = await supabase.from("profiles").select("email").eq("id", (await getUser())!.id).maybeSingle();
  const extra = { ...(categories.length ? { categories } : {}), ...(owner?.email ? { email: owner.email } : {}) };
  if (Object.keys(extra).length) await supabase.from("businesses").update(extra).eq("id", data);
  if (partnerInvite) await linkInvitedPartner(data, partnerInvite).catch((e) => console.error("partner invite failed", e));
  redirect(`/dashboard/${data}?welcome=1`);
}
