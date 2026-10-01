"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnedBusiness } from "@/lib/auth";
import { BRAND_COLORS, CATEGORIES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { PerkKind, PurchaseStatus } from "@/lib/types";

// Every action re-checks ownership; the database rules check it again.

export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
}

function refresh(bizId: string) {
  revalidatePath(`/dashboard/${bizId}`, "layout");
}

// Payments -------------------------------------------------------------------

export async function setPurchaseStatus(bizId: string, purchaseId: string, status: PurchaseStatus) {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_purchase_status", { p_purchase_id: purchaseId, p_status: status });
  if (error) return { error: error.message };
  refresh(bizId);
  return { ok: true };
}

export async function recordPurchase(bizId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwnedBusiness(bizId);
  const membershipId = String(formData.get("membership_id") ?? "");
  const amount = Number(String(formData.get("amount") ?? "").replace(/[^\d.]/g, ""));
  const description = String(formData.get("description") ?? "").trim().slice(0, 200);
  const date = String(formData.get("paid_on") ?? "");
  if (!membershipId) return { error: "Please choose a customer." };
  if (!amount || amount <= 0) return { error: "Please enter the amount paid." };

  const paidAt = /^\d{4}-\d{2}-\d{2}$/.test(date) && date !== new Date().toISOString().slice(0, 10) ? `${date}T12:00:00Z` : new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_purchase", {
    p_membership_id: membershipId,
    p_amount: amount,
    p_description: description || null,
    p_paid_at: paidAt,
  });
  if (error) return { error: error.message };
  refresh(bizId);
  return { ok: true, message: "Purchase added." };
}

// Rewards --------------------------------------------------------------------

export async function redeemReward(bizId: string, rewardId: string, redeemed: boolean) {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("redeem_reward", { p_reward_id: rewardId, p_redeemed: redeemed });
  if (error) return { error: error.message };
  refresh(bizId);
  return { ok: true };
}

// Perks ----------------------------------------------------------------------

export interface PerkInput {
  id?: string;
  kind: PerkKind;
  title: string;
  details?: string | null;
  threshold?: number | null;
}

export async function savePerk(bizId: string, input: PerkInput): Promise<FormState> {
  await requireOwnedBusiness(bizId);
  const title = input.title?.trim() ?? "";
  if (title.length < 2) return { error: "Please describe the reward." };
  if (title.length > 80) return { error: "Please keep the reward under 80 characters." };
  const needsThreshold = input.kind === "visits" || input.kind === "spend";
  const threshold = needsThreshold ? Number(input.threshold) : null;
  if (needsThreshold && (!threshold || threshold <= 0)) {
    return { error: input.kind === "visits" ? "How many purchases earn this perk?" : "How much should they spend?" };
  }
  if (input.kind === "visits" && threshold && (!Number.isInteger(threshold) || threshold > 100)) {
    return { error: "Use a whole number of purchases, up to 100." };
  }

  const values = { title, details: input.details?.trim().slice(0, 200) || null, threshold };
  const supabase = await createClient();
  const { error } = input.id
    ? await supabase.from("perks").update(values).eq("id", input.id).eq("business_id", bizId)
    : await supabase.from("perks").insert({ ...values, kind: input.kind, business_id: bizId });
  if (error) return { error: "Could not save the perk. Please try again." };
  refresh(bizId);
  return { ok: true };
}

export async function setPerkActive(bizId: string, perkId: string, active: boolean) {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  await supabase.from("perks").update({ is_active: active }).eq("id", perkId).eq("business_id", bizId);
  refresh(bizId);
}

export async function deletePerk(bizId: string, perkId: string) {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  await supabase.from("perks").delete().eq("id", perkId).eq("business_id", bizId);
  refresh(bizId);
}

// Business settings ------------------------------------------------------------

export async function updateBusiness(bizId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwnedBusiness(bizId);
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80) return { error: "Please enter your business name." };
  const category = String(formData.get("category") ?? "");
  const color = String(formData.get("brand_color") ?? "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      name,
      category: CATEGORIES.includes(category) ? category : null,
      location: String(formData.get("location") ?? "").trim().slice(0, 80) || null,
      about: String(formData.get("about") ?? "").trim().slice(0, 280) || null,
      whatsapp: String(formData.get("whatsapp") ?? "").replace(/[^\d+]/g, "").slice(0, 20) || null,
      brand_color: BRAND_COLORS.includes(color) ? color : BRAND_COLORS[0],
    })
    .eq("id", bizId);
  if (error) return { error: "Could not save. Please try again." };
  refresh(bizId);
  revalidatePath("/me", "layout");
  return { ok: true, message: "Saved." };
}

export async function addBankAccount(bizId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwnedBusiness(bizId);
  const bankName = String(formData.get("bank_name") ?? "").trim();
  const accountNumber = String(formData.get("account_number") ?? "").replace(/\D/g, "");
  const accountName = String(formData.get("account_name") ?? "").trim();
  if (bankName.length < 2) return { error: "Which bank is it?" };
  if (accountNumber.length < 6 || accountNumber.length > 20) return { error: "Please enter the full account number." };
  if (accountName.length < 2) return { error: "Please enter the account name, as it shows on receipts." };

  const supabase = await createClient();
  const { error } = await supabase.from("bank_accounts").insert({
    business_id: bizId,
    bank_name: bankName.slice(0, 60),
    account_number: accountNumber,
    account_name: accountName.slice(0, 100),
  });
  if (error) {
    return { error: error.code === "23505" ? "You've already added this account." : "Could not add the account. Please try again." };
  }
  refresh(bizId);
  return { ok: true, message: "Account added. Receipts paid into it will be matched automatically." };
}

export async function removeBankAccount(bizId: string, accountId: string) {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  await supabase.from("bank_accounts").delete().eq("id", accountId).eq("business_id", bizId);
  refresh(bizId);
}

export async function deleteBusiness(bizId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireOwnedBusiness(bizId);
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== business.name.trim().toLowerCase()) {
    return { error: `Type “${business.name}” to confirm.` };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("businesses").delete().eq("id", bizId);
  if (error) return { error: "Could not delete the business. Please try again." };
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
