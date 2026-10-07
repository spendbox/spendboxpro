"use server";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { codeEmail, sendEmail } from "@/lib/email";
import { supabaseSecretKey } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Sign-in with a 6-digit code that we email through Resend ourselves (Supabase sends nothing).
// After the code checks out, we ask Supabase for a one-time sign-in token and use it
// straight away on the server, which sets the login cookies.

export type LoginResult = { ok: true } | { ok: false; error: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;
const RESEND_SECONDS = 30;

const clean = (email: string) => email.trim().toLowerCase();
const hash = (email: string, code: string) =>
  createHash("sha256").update(`${email}:${code}:${supabaseSecretKey()}`).digest("hex");

export async function sendCode(rawEmail: string): Promise<LoginResult> {
  const email = clean(rawEmail);
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, error: "Please check your email address." };

  const db = createAdminClient();
  const { data: row } = await db.from("email_codes").select("*").eq("email", email).maybeSingle();
  const now = Date.now();
  let sentCount = 1;
  let windowStart = new Date(now).toISOString();
  if (row) {
    if (now - Date.parse(row.last_sent_at) < RESEND_SECONDS * 1000) {
      return { ok: false, error: "We just sent a code. Please wait a few seconds and try again." };
    }
    if (now - Date.parse(row.window_started_at) < 3600_000) {
      if (row.sent_count >= MAX_SENDS_PER_HOUR) {
        return { ok: false, error: "Too many codes sent. Please wait an hour and try again." };
      }
      sentCount = row.sent_count + 1;
      windowStart = row.window_started_at;
    }
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const { error } = await db.from("email_codes").upsert({
    email,
    code_hash: hash(email, code),
    expires_at: new Date(now + CODE_MINUTES * 60_000).toISOString(),
    attempts: 0,
    sent_count: sentCount,
    window_started_at: windowStart,
    last_sent_at: new Date(now).toISOString(),
  });
  if (error) {
    console.error("Saving sign-in code failed", error.message);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  const sent = await sendEmail({ to: email, ...codeEmail(code) });
  return sent ? { ok: true } : { ok: false, error: "We couldn't send the email. Please try again." };
}

export async function verifyCode(rawEmail: string, rawCode: string): Promise<LoginResult> {
  const email = clean(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "Enter the 6-digit code." };

  const db = createAdminClient();
  const { data: row } = await db.from("email_codes").select("*").eq("email", email).maybeSingle();
  if (!row || Date.parse(row.expires_at) < Date.now()) {
    return { ok: false, error: "This code has expired. Ask for a new one." };
  }
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "Too many wrong tries. Ask for a new code." };

  const a = Buffer.from(hash(email, code));
  const b = Buffer.from(row.code_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await db.from("email_codes").update({ attempts: row.attempts + 1 }).eq("email", email);
    return { ok: false, error: "That code isn't right. Check it and try again." };
  }
  await db.from("email_codes").delete().eq("email", email);

  // New players get an account (and their signup coins) here.
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && !/already|registered|exists/i.test(created.error.message)) {
    console.error("Creating account failed", created.error.message);
    return { ok: false, error: "We couldn't create your account. Please try again." };
  }

  const link = await db.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    console.error("Sign-in token failed", link.error?.message);
    return { ok: false, error: "We couldn't sign you in. Please try again." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (error) {
    console.error("Sign-in failed", error.message);
    return { ok: false, error: "We couldn't sign you in. Please try again." };
  }
  return { ok: true };
}
