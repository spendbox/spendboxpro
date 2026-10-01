"use server";

import { isValidPin, phoneLoginEmail } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";

export type RegisterResult = { ok: true } | { ok: false; error: string };

/**
 * Called after a PIN sign-in fails. Tells apart "wrong PIN" from "new number",
 * and creates the account for new numbers when signing up is allowed (join
 * links and business sign-up). The browser then signs in itself, so Supabase's
 * per-device limits on login attempts still apply.
 */
export async function registerPhone(phoneDigits: string, pin: string, allowSignup: boolean): Promise<RegisterResult> {
  if (!/^\d{8,15}$/.test(phoneDigits)) return { ok: false, error: "Please enter a valid phone number." };
  if (!isValidPin(pin)) return { ok: false, error: "Your PIN must be 6 digits." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("phone", phoneDigits).maybeSingle();
  if (existing) return { ok: false, error: "That PIN is not right for this number. Please try again." };
  if (!allowSignup) {
    return {
      ok: false,
      error:
        "We couldn't find a Spendbox account for this number. Customers join from a business's link, and businesses can sign up from the home page.",
    };
  }

  const { error } = await admin.auth.admin.createUser({
    email: phoneLoginEmail(phoneDigits),
    phone: phoneDigits,
    password: pin,
    email_confirm: true,
    phone_confirm: true,
  });
  if (error) {
    console.error("Creating account failed", error.message);
    return { ok: false, error: "We couldn't create your account. Please try again." };
  }
  return { ok: true };
}
