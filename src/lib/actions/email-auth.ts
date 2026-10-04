"use server";

import { getUser } from "@/lib/auth";
import { sendResetEmail, sendVerifyEmail, consumeToken } from "@/lib/email-links";
import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { MIN_PASSWORD } from "@/lib/password";
import { normalizePhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Signing up and logging in with an email and password. The browser does the
// actual sign-in (so Supabase's per-device limits apply); these actions check
// details and create accounts.

/** `reason` lets step-by-step forms go back to the right question. */
export type AuthResult = { ok: true; message?: string } | { ok: false; error: string; reason?: "wrong-password" | "need-name" };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function cleanEmail(email: string) {
  return email.trim().toLowerCase();
}

async function profileByEmail(email: string) {
  const { data } = await createAdminClient().from("profiles").select("id").eq("email", email).maybeSingle();
  return data;
}

/**
 * Called after an email sign-in fails. Tells apart "wrong password" from "new
 * email", and creates the account for new emails where signing up is allowed
 * (the sign-up page, join links and business sign-up), then emails a confirmation link.
 */
export async function registerEmail(input: {
  email: string;
  password: string;
  phone?: string;
  country?: string;
  allowSignup: boolean;
  fullName?: string;
}): Promise<AuthResult> {
  const email = cleanEmail(input.email);
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, error: "Please check your email address." };
  if (await profileByEmail(email)) {
    return { ok: false, reason: "wrong-password", error: "That password isn't right for this email. Try again, or tap “Forgot password?”." };
  }
  if (!input.allowSignup) {
    return {
      ok: false,
      error: "There's no Spendbox with this email yet. Tap “Create your Spendbox” below to make one.",
    };
  }
  if (input.password.length < MIN_PASSWORD) return { ok: false, error: `Choose a password with at least ${MIN_PASSWORD} characters.` };
  const fullName = (input.fullName ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (fullName.length < 2) return { ok: false, reason: "need-name", error: "Please add your name, so businesses know who they're talking to." };

  let phone: string | null = null;
  if (input.phone?.trim()) {
    phone = normalizePhone(input.country || DEFAULT_COUNTRY_CODE, input.phone);
    if (!phone) return { ok: false, error: "That phone number doesn't look right. Check it, or leave it empty." };
    const { data: taken } = await createAdminClient().from("profiles").select("id").eq("phone", phone).maybeSingle();
    if (taken) return { ok: false, error: "That phone number is already on another Spendbox account. Leave it empty, or use another number." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    ...(phone ? { phone, phone_confirm: true } : {}),
  });
  if (error || !data.user) {
    console.error("Creating account failed", error?.message);
    if (/already|registered|exists/i.test(error?.message ?? "")) {
      return { ok: false, error: "That email already has an account. Try logging in, or tap “Forgot password?”." };
    }
    if (/password/i.test(error?.message ?? "")) return { ok: false, error: "Please choose a stronger password." };
    return { ok: false, error: "We couldn't create your account. Please try again." };
  }
  await admin.from("profiles").update({ full_name: fullName }).eq("id", data.user.id);
  await sendVerifyEmail(data.user.id, email).catch((e) => console.error("Verify email failed", e));
  return { ok: true };
}

/** Accounts made before email sign-up log in with their phone number and PIN. */
export async function loginWithPhone(country: string, local: string, password: string): Promise<AuthResult> {
  const phone = normalizePhone(country || DEFAULT_COUNTRY_CODE, local);
  if (!phone) return { ok: false, error: "Please check your email address." };
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
  if (!profile) return { ok: false, error: "There's no Spendbox for this number. If you signed up with your email, type that instead." };
  const { data: user } = await admin.auth.admin.getUserById(profile.id);
  if (!user.user?.email) return { ok: false, error: "We couldn't log you in. Please try again." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: user.user.email, password });
  if (error) return { ok: false, error: /invalid/i.test(error.message) ? "That password isn't right for this number." : "We couldn't log you in. Please try again." };
  return { ok: true };
}

/** "Send it again" on the confirm-your-email note. */
export async function resendVerification(): Promise<AuthResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  const { data } = await createAdminClient().from("profiles").select("email, email_verified_at").eq("id", user.id).maybeSingle();
  if (!data?.email) return { ok: false, error: "Add your email in Profile first." };
  if (data.email_verified_at) return { ok: true, message: "Your email is already confirmed." };
  const sent = await sendVerifyEmail(user.id, data.email);
  return sent ? { ok: true, message: `Sent. Check ${data.email} (and your spam folder).` } : { ok: false, error: "We've sent a few already. Please wait an hour and try again." };
}

/** Always answers the same way, so nobody can find out which emails have accounts. */
export async function requestPasswordReset(rawEmail: string): Promise<AuthResult> {
  const email = cleanEmail(rawEmail);
  if (!EMAIL.test(email)) return { ok: false, error: "Please check your email address." };
  const profile = await profileByEmail(email);
  if (profile) await sendResetEmail(profile.id, email).catch((e) => console.error("Reset email failed", e));
  return { ok: true, message: `If ${email} has a Spendbox account, we've sent it a link. It works for 1 hour.` };
}

export async function resetPassword(token: string, password: string): Promise<AuthResult> {
  if (password.length < MIN_PASSWORD) return { ok: false, error: `Choose a password with at least ${MIN_PASSWORD} characters.` };
  const used = await consumeToken(token, "reset_password");
  if (!used) return { ok: false, error: "This link has expired or was already used. Ask for a new one." };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(used.userId, { password });
  if (error) return { ok: false, error: "We couldn't save your new password. Please try again." };
  // Opening the link proves they own the email.
  await admin.from("profiles").update({ email_verified_at: new Date().toISOString() }).eq("id", used.userId).eq("email", used.email ?? "").is("email_verified_at", null);
  return { ok: true };
}
