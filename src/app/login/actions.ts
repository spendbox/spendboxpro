"use server";

import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { codeEmail, sendEmail } from "@/lib/email";
import { supabaseSecretKey } from "@/lib/env";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Two ways in:
// 1. Email code: a 6-digit code we make and email through Resend ourselves (Supabase sends
//    nothing, so its email limits don't apply). First-timers then pick a name and a PIN.
// 2. Name + PIN, for coming back later.
// After either check passes, the server signs the player in with Supabase, which sets the
// login cookies.

export type LoginResult = { ok: true; needsSetup?: boolean } | { ok: false; error: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NAME = /^[A-Za-z0-9_]{3,16}$/;
const PIN = /^\d{6}$/;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;
const RESEND_SECONDS = 30;
const PIN_TRIES = 5;
const PIN_LOCK_MINUTES = 15;

const clean = (email: string) => email.trim().toLowerCase();
const hash = (email: string, code: string) =>
  createHash("sha256").update(`${email}:${code}:${supabaseSecretKey()}`).digest("hex");
/** The account password is made from the PIN plus a server secret, so it is long and strong. */
const pinPassword = (userId: string, pin: string) =>
  createHmac("sha256", supabaseSecretKey()).update(`pin:${userId}:${pin}`).digest("base64url");

export async function sendCode(rawEmail: string): Promise<LoginResult> {
  const email = clean(rawEmail);
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, error: "Please check your email address." };

  const db = createAdminClient();
  const { data: row } = await db.from("email_codes").select("*").eq("email", email).maybeSingle();
  const now = Date.now();
  let sentCount = 1;
  let windowStart = new Date(now).toISOString();
  if (row) {
    const wait = RESEND_SECONDS - Math.floor((now - Date.parse(row.last_sent_at)) / 1000);
    if (wait > 0) return { ok: false, error: `We just sent a code. You can ask for another in ${wait} seconds.` };
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
  if (!sent.ok) {
    // Let them try again straight away: nothing was delivered.
    await db.from("email_codes").update({ last_sent_at: new Date(0).toISOString() }).eq("email", email);
    return { ok: false, error: `We couldn't send the email: ${sent.error}` };
  }
  return { ok: true };
}

async function signInAs(userId: string, email: string) {
  const db = createAdminClient();
  const link = await db.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    console.error("Sign-in token failed", link.error?.message);
    return false;
  }
  const { error } = await (await createClient()).auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (error) console.error("Sign-in failed", userId, error.message);
  return !error;
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
  if (!(await signInAs(created.data.user?.id ?? "", email))) {
    return { ok: false, error: "We couldn't sign you in. Please try again." };
  }
  const userId = await currentUserId();
  const { data: profile } = await db.from("profiles").select("pin_set").eq("id", userId ?? "").maybeSingle();
  return { ok: true, needsSetup: !profile?.pin_set };
}

export async function loginWithPin(rawName: string, rawPin: string): Promise<LoginResult> {
  const name = rawName.trim();
  const pin = rawPin.replace(/\D/g, "");
  if (!NAME.test(name) || !PIN.test(pin)) return { ok: false, error: "That name and PIN don't match." };

  const db = createAdminClient();
  const { data: profile } = await db
    .from("profiles")
    .select("id, pin_set, pin_failures, pin_locked_until")
    .ilike("username", name.replace(/_/g, "\\_"))
    .maybeSingle();
  if (!profile?.pin_set) return { ok: false, error: "That name and PIN don't match." };
  if (profile.pin_locked_until && Date.parse(profile.pin_locked_until) > Date.now()) {
    return { ok: false, error: "Too many wrong PINs. Wait a few minutes, or sign in with an email code." };
  }

  const { data: user } = await db.auth.admin.getUserById(profile.id);
  const email = user.user?.email;
  const supabase = await createClient();
  const { error } = email
    ? await supabase.auth.signInWithPassword({ email, password: pinPassword(profile.id, pin) })
    : { error: new Error("no email") };
  if (error) {
    const failures = profile.pin_failures + 1;
    await db
      .from("profiles")
      .update(
        failures >= PIN_TRIES
          ? { pin_failures: 0, pin_locked_until: new Date(Date.now() + PIN_LOCK_MINUTES * 60_000).toISOString() }
          : { pin_failures: failures },
      )
      .eq("id", profile.id);
    return {
      ok: false,
      error: failures >= PIN_TRIES ? "Too many wrong PINs. Wait 15 minutes, or sign in with an email code." : "That name and PIN don't match.",
    };
  }
  await db.from("profiles").update({ pin_failures: 0, pin_locked_until: null }).eq("id", profile.id);
  return { ok: true };
}

/** First sign-in (or "forgot PIN"): choose a name and a 6-digit PIN. */
export async function saveNameAndPin(rawName: string, rawPin: string): Promise<LoginResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const name = rawName.trim();
  const pin = rawPin.replace(/\D/g, "");
  if (!NAME.test(name)) return { ok: false, error: "Names are 3 to 16 letters, numbers or _." };
  if (!PIN.test(pin)) return { ok: false, error: "Your PIN must be 6 digits." };
  if (/^(\d)\1{5}$/.test(pin) || ["123456", "654321", "012345"].includes(pin)) {
    return { ok: false, error: "That PIN is too easy to guess. Pick another." };
  }

  const db = createAdminClient();
  const { data: taken } = await db
    .from("profiles")
    .select("id")
    .ilike("username", name.replace(/_/g, "\\_"))
    .neq("id", userId)
    .maybeSingle();
  if (taken || /^seed.?bot$/i.test(name)) return { ok: false, error: "That name is taken. Try another." };

  const { error: pwError } = await db.auth.admin.updateUserById(userId, { password: pinPassword(userId, pin) });
  if (pwError) {
    console.error("Saving PIN failed", pwError.message);
    return { ok: false, error: "We couldn't save your PIN. Please try again." };
  }
  const { error } = await db
    .from("profiles")
    .update({ username: name, pin_set: true, pin_failures: 0, pin_locked_until: null })
    .eq("id", userId);
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? "That name is taken. Try another." : "We couldn't save your name." };
  return { ok: true };
}
