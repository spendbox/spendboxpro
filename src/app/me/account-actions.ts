"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { sendVerifyEmail } from "@/lib/email-links";
import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { normalizePhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// The customer's own details: name, phone, birthday, gender and email. Used by Profile.

export interface AccountResult {
  ok?: boolean;
  error?: string;
}

export async function saveName(name: string): Promise<AccountResult> {
  const user = await requireUser();
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean.length < 2 || clean.length > 80) return { error: "Please type your name." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: clean }).eq("id", user.id);
  if (error) return { error: "Could not save. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Phone is optional; businesses use it to WhatsApp or call about requests. */
export async function savePhone(country: string, local: string): Promise<AccountResult> {
  const user = await requireUser();
  const admin = createAdminClient();
  if (!local.trim()) {
    const { error } = await admin.auth.admin.updateUserById(user.id, { phone: "" });
    if (error) return { error: "Could not remove it. Please try again." };
    await admin.from("profiles").update({ phone: null }).eq("id", user.id);
    revalidatePath("/", "layout");
    return { ok: true };
  }
  const digits = normalizePhone(country || DEFAULT_COUNTRY_CODE, local);
  if (!digits) return { error: "That phone number doesn't look right." };
  const { data: taken } = await admin.from("profiles").select("id").eq("phone", digits).neq("id", user.id).maybeSingle();
  if (taken) return { error: "That number is already on another Spendbox account." };
  const { error } = await admin.auth.admin.updateUserById(user.id, { phone: digits, phone_confirm: true });
  if (error) return { error: /already/i.test(error.message) ? "That number is already on another Spendbox account." : "Could not save. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}

function intOrNull(value: unknown, min: number, max: number) {
  const n = Number(value);
  return value !== "" && value !== null && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export async function saveBirthday(day: string, month: string, year: string): Promise<AccountResult> {
  const user = await requireUser();
  const d = intOrNull(day, 1, 31);
  const m = intOrNull(month, 1, 12);
  const y = intOrNull(year, 1900, new Date().getFullYear());
  if ((d === null) !== (m === null)) return { error: "Please pick both the day and the month." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ birth_day: d, birth_month: m, birth_year: m ? y : null })
    .eq("id", user.id);
  if (error) return { error: "Could not save. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveEmail(email: string, notifications: boolean): Promise<AccountResult> {
  const user = await requireUser();
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean) || clean.length > 200) return { error: "Please check your email address." };
  const admin = createAdminClient();
  const { data: current } = await admin.from("profiles").select("email").eq("id", user.id).maybeSingle();

  if (current?.email !== clean) {
    const { data: taken } = await admin.from("profiles").select("id").eq("email", clean).neq("id", user.id).maybeSingle();
    if (taken) return { error: "That email is already on another Spendbox account." };
    // It's also the login email, so change it there too, then ask them to confirm it.
    const { error } = await admin.auth.admin.updateUserById(user.id, { email: clean, email_confirm: true });
    if (error) return { error: /already/i.test(error.message) ? "That email is already on another Spendbox account." : "Could not save. Please try again." };
    await admin.from("profiles").update({ email: clean, email_verified_at: null }).eq("id", user.id);
    after(() => sendVerifyEmail(user.id, clean).then(() => undefined).catch((e) => console.error("Verify email failed", e)));
  }
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ email_notifications: notifications }).eq("id", user.id);
  if (error) return { error: "Could not save. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveGender(gender: string): Promise<AccountResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ gender: ["female", "male", "other"].includes(gender) ? gender : null })
    .eq("id", user.id);
  if (error) return { error: "Could not save. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}
