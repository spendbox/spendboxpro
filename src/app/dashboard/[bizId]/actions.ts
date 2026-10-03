"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyPurchase, notifyRewardsReady } from "@/lib/notify";
import { redirect } from "next/navigation";
import { requireOwnedBusiness } from "@/lib/auth";
import { appTimeZone, DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { normalizeWhatsapp } from "@/lib/phone";
import { BRAND_COLORS, cleanCategories } from "@/lib/constants";
import { paystackConfigured, resolveAccount } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
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
  if (status === "verified") {
    after(async () => {
      await notifyPurchase(purchaseId, "confirmed");
      await notifyRewardsReady();
    });
  }
  refresh(bizId);
  return { ok: true };
}

/** Undo a purchase typed in by mistake (only within an hour). */
export async function deleteRecordedPurchase(bizId: string, purchaseId: string) {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_recorded_purchase", { p_purchase_id: purchaseId });
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

  // "Today" is now; another day is recorded at midday that day.
  const todayHere = new Intl.DateTimeFormat("en-CA", { timeZone: appTimeZone() }).format(new Date());
  const paidAt = /^\d{4}-\d{2}-\d{2}$/.test(date) && date < todayHere ? `${date}T12:00:00Z` : new Date().toISOString();
  const supabase = await createClient();
  const { data: purchaseId, error } = await supabase.rpc("record_purchase", {
    p_membership_id: membershipId,
    p_amount: amount,
    p_description: description || null,
    p_paid_at: paidAt,
  });
  if (error) return { error: error.message };
  after(async () => {
    await notifyPurchase(purchaseId as string, "recorded");
    await notifyRewardsReady();
  });
  refresh(bizId);
  return { ok: true, message: "Purchase added." };
}

/** Customers to pick from when recording a purchase. */
export async function memberOptions(bizId: string) {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { data } = await supabase.rpc("business_members", { p_business_id: bizId });
  return ((data ?? []) as { membership_id: string; member_no: number; full_name: string | null; phone: string | null }[]).map(
    (m) => ({
      value: m.membership_id,
      label: m.full_name?.trim() || `Member #${String(m.member_no).padStart(4, "0")}`,
      hint: [m.full_name ? `#${String(m.member_no).padStart(4, "0")}` : "Details private", m.phone ? `+${m.phone}` : null]
        .filter(Boolean)
        .join(" · "),
      keywords: `${m.member_no} ${m.phone ?? ""}`,
    }),
  );
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
  /** Days to use it once earned; null = no limit. */
  validDays?: number | null;
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

  const validDays = input.validDays == null ? null : Math.round(Number(input.validDays));
  if (validDays !== null && !(validDays >= 1 && validDays <= 365)) return { error: "Pick between 1 and 365 days." };

  const values = { title, details: input.details?.trim().slice(0, 200) || null, threshold, valid_days: validDays };
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

export type BusinessField = "name" | "categories" | "location" | "whatsapp" | "email" | "about" | "brand_color";

/** Saves one business detail (from a settings card). */
export async function updateBusinessField(bizId: string, field: BusinessField, value: string | string[]): Promise<FormState> {
  await requireOwnedBusiness(bizId);
  const text = typeof value === "string" ? value.trim() : "";
  let update: Record<string, unknown>;
  switch (field) {
    case "name":
      if (text.length < 2 || text.length > 80) return { error: "Please enter your business name." };
      update = { name: text };
      break;
    case "categories": {
      const categories = cleanCategories(Array.isArray(value) ? value : [value]);
      if (categories.length === 0) return { error: "Pick at least one." };
      update = { categories, category: categories[0] };
      break;
    }
    case "location":
      update = { location: text.slice(0, 80) || null };
      break;
    case "whatsapp": {
      const number = normalizeWhatsapp(text, DEFAULT_COUNTRY_CODE);
      if (text && !number) return { error: "That doesn't look like a phone number." };
      update = { whatsapp: number };
      break;
    }
    case "email":
      if (text && !EMAIL.test(text.toLowerCase())) return { error: "Please check the email address." };
      update = { email: text.toLowerCase() || null };
      break;
    case "about":
      update = { about: text.slice(0, 280) || null };
      break;
    case "brand_color":
      if (!BRAND_COLORS.includes(text)) return { error: "Pick one of the colours." };
      update = { brand_color: text };
      break;
    default:
      return { error: "Unknown setting." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("businesses").update(update).eq("id", bizId);
  if (error) return { error: "Could not save. Please try again." };
  refresh(bizId);
  revalidatePath("/me", "layout");
  return { ok: true };
}


const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Saves a business logo (already resized in the browser) to the public logos bucket. */
export async function uploadLogo(bizId: string, formData: FormData): Promise<FormState> {
  await requireOwnedBusiness(bizId);
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Please choose an image." };
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return { error: "Please use a PNG or JPG image." };
  if (file.size > 900_000) return { error: "That image is too big. Please try a smaller one." };

  const admin = createAdminClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${bizId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from("logos")
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: "31536000" });
  if (uploadError) return { error: "Could not upload the logo. Please try again." };

  const { data: previous } = await admin.from("businesses").select("logo_url").eq("id", bizId).single();
  const url = admin.storage.from("logos").getPublicUrl(path).data.publicUrl;
  const supabase = await createClient();
  const { error } = await supabase.from("businesses").update({ logo_url: url }).eq("id", bizId);
  if (error) return { error: "Could not save the logo. Please try again." };

  const oldPath = previous?.logo_url?.split("/logos/")[1];
  if (oldPath) await admin.storage.from("logos").remove([oldPath]);
  refresh(bizId);
  revalidatePath("/me", "layout");
  return { ok: true, message: "Logo updated." };
}

export async function removeLogo(bizId: string): Promise<FormState> {
  const { business } = await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  await supabase.from("businesses").update({ logo_url: null }).eq("id", bizId);
  const oldPath = business.logo_url?.split("/logos/")[1];
  if (oldPath) await createAdminClient().storage.from("logos").remove([oldPath]);
  refresh(bizId);
  revalidatePath("/me", "layout");
  return { ok: true };
}

/** Looks up the name on a bank account through Paystack. */
export async function lookupAccountName(bizId: string, bankCode: string, accountNumber: string) {
  await requireOwnedBusiness(bizId);
  return resolveAccount(accountNumber.replace(/\D/g, ""), bankCode);
}

export async function addBankAccount(bizId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireOwnedBusiness(bizId);
  const bankName = String(formData.get("bank_name") ?? "").trim();
  const bankCode = String(formData.get("bank_code") ?? "").trim() || null;
  const accountNumber = String(formData.get("account_number") ?? "").replace(/\D/g, "");
  let accountName = String(formData.get("account_name") ?? "").trim();
  if (bankName.length < 2) return { error: "Which bank is it?" };
  if (accountNumber.length < 6 || accountNumber.length > 20) return { error: "Please enter the full account number." };

  // With Paystack, the name always comes from the bank, never from what was typed.
  if (paystackConfigured() && bankCode) {
    const resolved = await resolveAccount(accountNumber, bankCode);
    if (!resolved.ok) return { error: resolved.error };
    accountName = resolved.accountName;
  }
  if (accountName.length < 2) return { error: "Please enter the account name, as it shows on receipts." };

  const supabase = await createClient();
  const { error } = await supabase.from("bank_accounts").insert({
    business_id: bizId,
    bank_name: bankName.slice(0, 60),
    bank_code: bankCode,
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
