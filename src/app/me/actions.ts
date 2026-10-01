"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
}

function intOrNull(value: FormDataEntryValue | null, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Saves name, gender and birthday. Every business the customer shares with sees the change straight away. */
export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/me/profile");
  const fullName = String(formData.get("full_name") ?? "").trim().replace(/\s+/g, " ");
  const gender = String(formData.get("gender") ?? "");
  const birthDay = intOrNull(formData.get("birth_day"), 1, 31);
  const birthMonth = intOrNull(formData.get("birth_month"), 1, 12);
  const birthYear = intOrNull(formData.get("birth_year"), 1900, new Date().getFullYear());

  if (fullName.length > 80) return { error: "Please use a shorter name." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200)) {
    return { error: "Please check your email address." };
  }
  if ((birthDay === null) !== (birthMonth === null)) return { error: "Please pick both the day and the month of your birthday." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName || null,
      gender: ["female", "male", "other"].includes(gender) ? gender : null,
      birth_day: birthDay,
      birth_month: birthMonth,
      birth_year: birthMonth ? birthYear : null,
      email: email || null,
      email_notifications: formData.get("email_notifications") === "on",
    })
    .eq("id", user.id);
  if (error) return { error: "Could not save. Please try again." };

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. Your details are up to date everywhere." };
}

/** Turn sharing of personal details with one business on or off. */
export async function setSharing(membershipId: string, share: boolean) {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("memberships").update({ share_details: share }).eq("id", membershipId).eq("customer_id", user.id);
  revalidatePath("/", "layout");
}

export async function leaveBusiness(membershipId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("memberships").delete().eq("id", membershipId).eq("customer_id", user.id);
  revalidatePath("/", "layout");
  redirect("/me");
}

/** Permanently deletes the account, receipts and every membership. */
export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/me/profile");
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }

  const admin = createAdminClient();
  // Remove stored receipt images first (they live in a folder named after the user).
  const { data: files } = await admin.storage.from("receipts").list(user.id, { limit: 1000 });
  if (files?.length) {
    await admin.storage.from("receipts").remove(files.map((f) => `${user.id}/${f.name}`));
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: "Could not delete your account. Please try again." };

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/?deleted=1");
}
