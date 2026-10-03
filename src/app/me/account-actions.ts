"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { senderKey } from "@/lib/bank/match";
import { matchOpenPayments } from "@/lib/bank/sync";
import { FALLBACK_BANKS } from "@/lib/constants";
import { listBanks, paystackConfigured, resolveAccount } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// The customer's own details: the bank accounts they pay from (their name
// comes from the first one), birthday and email. Used by sign-up and Profile.

export interface AccountResult {
  ok?: boolean;
  error?: string;
  name?: string;
}

function titleCase(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Banks to choose from: Paystack's list (with codes, so names can be confirmed) or a short built-in list. */
export async function bankOptions() {
  await requireUser();
  const banks = await listBanks();
  return banks.length
    ? { verified: true, banks }
    : { verified: false, banks: FALLBACK_BANKS.map((name) => ({ name, code: "" })) };
}

/** "Is this you?" — the name the bank has on an account. */
export async function lookupMyAccount(bankCode: string, accountNumber: string): Promise<AccountResult> {
  await requireUser();
  const result = await resolveAccount(accountNumber.replace(/\D/g, ""), bankCode);
  return result.ok ? { ok: true, name: result.accountName } : { error: result.error };
}

/**
 * Adds an account the customer usually pays from. With Paystack the name is
 * always the bank's; without it, the customer types the name on the account.
 */
export async function addMyBankAccount(input: {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  typedName?: string;
}): Promise<AccountResult> {
  const user = await requireUser();
  const accountNumber = input.accountNumber.replace(/\D/g, "");
  if (!/^\d{10}$/.test(accountNumber)) return { error: "Account numbers have 10 digits." };
  if (!input.bankName.trim()) return { error: "Which bank is it?" };

  let name: string;
  let verified = false;
  if (paystackConfigured() && input.bankCode) {
    const resolved = await resolveAccount(accountNumber, input.bankCode);
    if (!resolved.ok) return { error: resolved.error };
    name = resolved.accountName;
    verified = true;
  } else {
    name = (input.typedName ?? "").trim().replace(/\s+/g, " ");
    if (name.split(" ").length < 2) return { error: "Type the name on the account (first and last name)." };
  }
  const key = senderKey(name);

  const admin = createAdminClient();
  // A verified account belongs to one person.
  if (verified) {
    const { data: taken } = await admin
      .from("payers")
      .select("customer_id")
      .eq("sender_account", accountNumber)
      .eq("verified", true)
      .neq("customer_id", user.id)
      .maybeSingle();
    if (taken) return { error: "This account is already linked to another Spendbox account." };
  }

  const fields = {
    customer_id: user.id,
    sender_name: name.toUpperCase().slice(0, 120),
    sender_key: key,
    sender_account: accountNumber,
    institution: input.bankName.trim().slice(0, 80),
    bank_code: input.bankCode || null,
    verified,
    learned_at_business: null,
    last_seen_at: new Date().toISOString(),
  };
  // The same name may already be known from a payment; complete that entry.
  const { data: existing } = key
    ? await admin.from("payers").select("id").eq("customer_id", user.id).eq("sender_key", key).maybeSingle()
    : await admin.from("payers").select("id").eq("customer_id", user.id).eq("sender_account", accountNumber).maybeSingle();
  const { error } = existing
    ? await admin.from("payers").update(fields).eq("id", existing.id)
    : await admin.from("payers").insert(fields);
  if (error) return { error: error.code === "23505" ? "You've already added this account." : error.message };

  // Your Spendbox name comes from your first bank account.
  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  if (!profile?.full_name) await admin.from("profiles").update({ full_name: titleCase(name).slice(0, 80) }).eq("id", user.id);

  after(async () => {
    const { data } = await admin.from("memberships").select("business_id").eq("customer_id", user.id);
    for (const m of data ?? []) await matchOpenPayments(m.business_id).catch((e) => console.error("matchOpenPayments failed", e));
  });
  revalidatePath("/me", "layout");
  return { ok: true, name: titleCase(name) };
}

/** Removes one of the customer's own accounts. */
export async function removeMyBankAccount(id: string): Promise<AccountResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("payers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/me", "layout");
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
  if (clean && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean) || clean.length > 200)) return { error: "Please check your email address." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ email: clean || null, email_notifications: notifications })
    .eq("id", user.id);
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
