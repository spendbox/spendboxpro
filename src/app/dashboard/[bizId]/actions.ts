"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnedBusiness } from "@/lib/auth";
import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { normalizeWhatsapp } from "@/lib/phone";
import { BRAND_COLORS, cleanCategories } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PerkKind } from "@/lib/types";

// Every action re-checks ownership; the database rules check it again.

export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
}

function refresh(bizId: string) {
  revalidatePath(`/dashboard/${bizId}`, "layout");
}

// Requests ------------------------------------------------------------------------

/** Records that the business is reaching out about a request (so the customer knows who to expect). */
export async function reachOut(bizId: string, requestId: string, method: "whatsapp" | "call" | "email"): Promise<FormState> {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("contact_request", { p_business_id: bizId, p_request_id: requestId, p_method: method });
  if (error) return { error: /ended/i.test(error.message) ? "This request has ended." : "Couldn't record that. Please try again." };
  return { ok: true };
}

// Perks to give ---------------------------------------------------------------

export async function redeemReward(bizId: string, rewardId: string, redeemed: boolean) {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("redeem_reward", { p_reward_id: rewardId, p_redeemed: redeemed });
  if (error) return { error: error.message };
  refresh(bizId);
  return { ok: true };
}

// Perks ----------------------------------------------------------------------

/** Perks a business can see happen: joining, a friend joining, a birthday. */
const SIMPLE_PERKS: PerkKind[] = ["welcome", "referral", "birthday"];

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
  if (!SIMPLE_PERKS.includes(input.kind)) return { error: "Pick a welcome, invite or birthday perk." };
  const threshold = null;

  const validDays = input.validDays == null ? null : Math.round(Number(input.validDays));
  if (validDays !== null && !(validDays >= 1 && validDays <= 365)) return { error: "Pick between 1 and 365 days." };

  const values = { title, details: input.details?.trim().slice(0, 200) || null, threshold, valid_days: validDays };
  const supabase = await createClient();
  // The friend gets the welcome perk, so an invite reward needs one first.
  if (input.kind === "referral") {
    const { count } = await supabase
      .from("perks")
      .select("id", { count: "exact", head: true })
      .eq("business_id", bizId)
      .eq("kind", "welcome")
      .eq("is_active", true);
    if (!count) return { error: "Add a welcome perk first. That's what the friend gets when they join." };
  }
  const { error } = input.id
    ? await supabase.from("perks").update(values).eq("id", input.id).eq("business_id", bizId)
    : await supabase.from("perks").insert({ ...values, kind: input.kind, business_id: bizId });
  if (error) return { error: "Could not save the perk. Please try again." };
  refresh(bizId);
  return { ok: true };
}

/** Without a welcome perk, an invited friend gets nothing, so the invite reward pauses too. */
async function pauseInviteIfNoWelcome(bizId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("perks")
    .select("id", { count: "exact", head: true })
    .eq("business_id", bizId)
    .eq("kind", "welcome")
    .eq("is_active", true);
  if (!count) await supabase.from("perks").update({ is_active: false }).eq("business_id", bizId).eq("kind", "referral");
}

export async function setPerkActive(bizId: string, perkId: string, active: boolean) {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  const { data: perk } = await supabase.from("perks").select("kind").eq("id", perkId).eq("business_id", bizId).maybeSingle();
  if (active && perk?.kind === "referral") {
    const { count } = await supabase.from("perks").select("id", { count: "exact", head: true }).eq("business_id", bizId).eq("kind", "welcome").eq("is_active", true);
    if (!count) return;
  }
  await supabase.from("perks").update({ is_active: active }).eq("id", perkId).eq("business_id", bizId);
  if (perk?.kind === "welcome" && !active) await pauseInviteIfNoWelcome(bizId);
  refresh(bizId);
}

export async function deletePerk(bizId: string, perkId: string) {
  await requireOwnedBusiness(bizId);
  const supabase = await createClient();
  await supabase.from("perks").delete().eq("id", perkId).eq("business_id", bizId);
  await pauseInviteIfNoWelcome(bizId);
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
