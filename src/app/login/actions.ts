"use server";

import { createHash, createHmac, randomInt } from "node:crypto";
import { saveBirthDate, toIsoDate } from "@/lib/age";
import { codeEmail, sendEmail } from "@/lib/email";
import { supabaseSecretKey } from "@/lib/env";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Signing in starts with an email address:
// - Returning players (who have a PIN) type their PIN.
// - New players (and "forgot PIN") get a 4-digit code that we email through Resend ourselves
//   (Supabase sends nothing, so its email limits don't apply), then pick a name and PIN,
//   and give their date of birth (the game is for adults 18+).
// Guessing a 4-digit code is kept very unlikely: 5 wrong tries per code, codes last 10 minutes,
// at most 5 codes an hour, and at most 15 wrong tries a day per email (checked in the database,
// in one locked step, so a flood of guesses at once can't get round it).
// After either check passes, the server signs the player in with Supabase, which sets the
// login cookies.

export type LoginResult = { ok: true; needsSetup?: boolean } | { ok: false; error: string; underage?: boolean };
/** Day, month (1-12) and year from the date-of-birth boxes. */
export type BirthInput = { day: number; month: number; year: number };
export type StartResult = { ok: true; next: "pin" | "code" } | { ok: false; error: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NAME = /^[A-Za-z0-9_]{3,16}$/;
const PIN = /^\d{6}$/;
const CODE = /^\d{4}$/;
const CODE_MINUTES = 10;
const MAX_SENDS_PER_HOUR = 5;
const RESEND_SECONDS = 30;
const DAILY_WRONG = 15; // same number as in check_email_code (game-db/012)
const LOCKED = "Too many wrong codes today. Please try again tomorrow.";
const UNDERAGE = "Sorry, Newtown is only for adults 18 and over, so you can't play.";
const PIN_TRIES = 5;
const PIN_LOCK_MINUTES = 15;

const clean = (email: string) => email.trim().toLowerCase();
const hash = (email: string, code: string) =>
  createHash("sha256").update(`${email}:${code}:${supabaseSecretKey()}`).digest("hex");
/** The account password is made from the PIN plus a server secret, so it is long and strong. */
const pinPassword = (userId: string, pin: string) =>
  createHmac("sha256", supabaseSecretKey()).update(`pin:${userId}:${pin}`).digest("base64url");

/** Step 1: "Enter world" with an email. Returning players go to their PIN; others get a code. */
export async function startSignIn(rawEmail: string): Promise<StartResult> {
  const email = clean(rawEmail);
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, error: "Please check your email address." };
  const { data } = await createAdminClient().from("profiles").select("pin_set").eq("email", email).maybeSingle();
  if (data?.pin_set) return { ok: true, next: "pin" };
  const sent = await sendCode(email);
  return sent.ok ? { ok: true, next: "code" } : sent;
}

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
    if (row.wrong_total >= DAILY_WRONG && now - Date.parse(row.wrong_window_started_at) < 86400_000) {
      return { ok: false, error: LOCKED };
    }
  }

  const code = randomInt(0, 10_000).toString().padStart(4, "0");
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
  if (!EMAIL.test(email) || !CODE.test(code)) return { ok: false, error: "Enter the 4-digit code." };

  const db = createAdminClient();
  // The database checks the code and counts wrong tries in one locked step (see game-db/012).
  const { data: verdict, error: checkError } = await db.rpc("check_email_code", { p_email: email, p_hash: hash(email, code) });
  if (checkError) {
    console.error("Checking sign-in code failed", checkError.message);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  if (verdict !== "ok") {
    const errors: Record<string, string> = {
      expired: "This code has expired. Ask for a new one.",
      too_many: "Too many wrong tries. Ask for a new code.",
      locked: LOCKED,
    };
    return { ok: false, error: errors[verdict as string] ?? "That code isn't right. Check it and try again." };
  }

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
  if (userId) await db.from("profiles").update({ email }).eq("id", userId).is("email", null);
  // After an email code they always (re)set their PIN: new players, and "forgot PIN".
  return { ok: true, needsSetup: true };
}

export async function loginWithPin(rawEmail: string, rawPin: string): Promise<LoginResult> {
  const email = clean(rawEmail);
  const pin = rawPin.replace(/\D/g, "");
  if (!EMAIL.test(email) || !PIN.test(pin)) return { ok: false, error: "That PIN isn't right." };

  const db = createAdminClient();
  const { data: profile } = await db
    .from("profiles")
    .select("id, pin_set, pin_failures, pin_locked_until")
    .eq("email", email)
    .maybeSingle();
  if (!profile?.pin_set) return { ok: false, error: "That PIN isn't right." };
  if (profile.pin_locked_until && Date.parse(profile.pin_locked_until) > Date.now()) {
    return { ok: false, error: "Too many wrong PINs. Wait a few minutes, or use Forgot PIN." };
  }

  const { data: user } = await db.auth.admin.getUserById(profile.id);
  const authEmail = user.user?.email;
  const supabase = await createClient();
  const { error } = authEmail
    ? await supabase.auth.signInWithPassword({ email: authEmail, password: pinPassword(profile.id, pin) })
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
      error: failures >= PIN_TRIES ? "Too many wrong PINs. Wait 15 minutes, or use Forgot PIN." : "That PIN isn't right.",
    };
  }
  await db.from("profiles").update({ pin_failures: 0, pin_locked_until: null }).eq("id", profile.id);
  return { ok: true };
}

/** Checks and saves the date of birth (only if it isn't saved yet). Under-18s are stopped for good. */
async function checkBirthDate(userId: string, birth: BirthInput | null | undefined): Promise<LoginResult> {
  if (!birth) {
    // Nothing sent (e.g. "Change PIN"): fine only if we already have it. Unlike the page
    // redirect, this check never lets anyone through when the lookup fails.
    const { data, error } = await createAdminClient()
      .from("profiles")
      .select("birth_date, age_blocked_at")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return { ok: false, error: "Something went wrong. Please try again." };
    if (data.age_blocked_at) return { ok: false, error: UNDERAGE, underage: true };
    return data.birth_date ? { ok: true } : { ok: false, error: "Please choose your date of birth." };
  }
  const iso = toIsoDate(Number(birth.day), Number(birth.month), Number(birth.year));
  if (!iso) return { ok: false, error: "Please choose your full date of birth." };
  const result = await saveBirthDate(userId, iso);
  if (result === "ok" || result === "already_set") return { ok: true };
  if (result === "under_18" || result === "blocked") return { ok: false, error: UNDERAGE, underage: true };
  if (result === "invalid") return { ok: false, error: "That date of birth doesn't look right. Please check it." };
  return { ok: false, error: "We couldn't save your date of birth. Please try again." };
}

/** Players who signed up before the 18+ rule: just add the date of birth. */
export async function saveBirthDateOnly(birth: BirthInput): Promise<LoginResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  return checkBirthDate(userId, birth);
}

/** Leaves the account (used on the "adults only" screen). */
export async function signOutNow(): Promise<void> {
  await (await createClient()).auth.signOut();
}

/**
 * First sign-in (or "forgot PIN"): choose a name and a 6-digit PIN, plus the date of birth
 * if we don't have it yet. Under-18s are stopped before the name and PIN are saved, so their
 * account never becomes playable.
 */
export async function saveNameAndPin(rawName: string, rawPin: string, birth?: BirthInput | null): Promise<LoginResult> {
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

  const age = await checkBirthDate(userId, birth);
  if (!age.ok) return age;

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
  // Changing the password can end the current login on Supabase's side, so sign straight
  // back in with the new PIN. Otherwise players get thrown out right after setting it.
  const { data: user } = await db.auth.admin.getUserById(userId);
  if (user.user?.email) {
    await (await createClient()).auth.signInWithPassword({ email: user.user.email, password: pinPassword(userId, pin) });
  }
  return { ok: true };
}
