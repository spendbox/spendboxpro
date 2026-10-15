"use server";

import { createHash, createHmac, randomInt } from "node:crypto";
import { headers } from "next/headers";
import { saveBirthDate, toIsoDate } from "@/lib/age";
import { codeEmail, sendEmail } from "@/lib/email";
import { supabaseSecretKey } from "@/lib/env";
import { currentUserId } from "@/lib/game";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { passwordProblem } from "@/lib/password";
import { timesLeaked } from "@/lib/pwned";
import { passedTurnstile } from "@/lib/turnstile";

// Signing in starts with an email address:
// - Players with an account type their password. Players from before passwords type their old
//   6-digit PIN there, and are then asked to make a password (profiles.password_set, game-db/100).
// - New players type their email again (to catch typos: it's how they get back in), pass a robot
//   check (Cloudflare Turnstile, src/lib/turnstile.ts) and are signed in, then, one question at a
//   time: a name, man or woman, date of birth (18+), a password, the password again, and a
//   reminder to keep both somewhere safe. No email is sent, so sign-ups never wait on email.
// - "Forgot password" gets a 4-digit code that we email ourselves (Resend or Amazon SES; Supabase
//   sends nothing). It's the only email signing in sends, and it marks the address as the
//   player's (profiles.email_verified_at, game-db/099).
// Guessing a 4-digit code is kept very unlikely: 5 wrong tries per code, codes last 10 minutes,
// at most 5 codes an hour, and at most 15 wrong tries a day per email (checked in the database,
// in one locked step, so a flood of guesses at once can't get round it). 5 wrong passwords lock
// the account for 15 minutes.
// After a check passes, the server signs the player in with Supabase, which sets the cookies.

export type LoginResult = { ok: true; needsSetup?: boolean } | { ok: false; error: string; underage?: boolean };
/** Day, month (1-12) and year from the date-of-birth boxes. */
export type BirthInput = { day: number; month: number; year: number };
export type StartResult = { ok: true; next: "password" | "new" } | { ok: false; error: string; robot?: boolean };

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
const PASSWORD_TRIES = 5;
const PASSWORD_LOCK_MINUTES = 15;

const clean = (email: string) => email.trim().toLowerCase();
const hash = (email: string, code: string) =>
  createHash("sha256").update(`${email}:${code}:${supabaseSecretKey()}`).digest("hex");
/** Before passwords, the account password was made from the PIN plus a server secret. */
const pinPassword = (userId: string, pin: string) =>
  createHmac("sha256", supabaseSecretKey()).update(`pin:${userId}:${pin}`).digest("base64url");

/** Step 1: "Continue" with an email. Players with an account go to their password; others sign up. */
export async function startSignIn(rawEmail: string): Promise<StartResult> {
  const email = clean(rawEmail);
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, error: "Please check your email address." };
  const { data } = await createAdminClient().from("profiles").select("pin_set").eq("email", email).maybeSingle();
  return { ok: true, next: data?.pin_set ? "password" : "new" };
}

/**
 * Sign-up, after the email typed twice and the robot check: the account is made and they're signed
 * in, to answer the rest one question at a time.
 */
export async function createAccount(rawEmail: string, rawAgain: string, robotToken?: string | null): Promise<LoginResult> {
  const email = clean(rawEmail);
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, error: "Please check your email address." };
  if (clean(rawAgain) !== email) return { ok: false, error: "The two emails don't match. Check for a typo." };
  const db = createAdminClient();
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
  if (!(await passedTurnstile(robotToken, ip))) return { ok: false, error: "Please tick the box to show you're not a robot, then try again." };
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && !/already|registered|exists/i.test(created.error.message)) {
    console.error("Creating account failed", created.error.message);
    return { ok: false, error: "We couldn't create your account. Please try again." };
  }
  // An account already there for this email (one whose profile lost track of its email, or an
  // older one) is only handed over if it was never finished: anything else asks for the password.
  if (created.error) {
    const link = await db.auth.admin.generateLink({ type: "magiclink", email });
    const id = link.data?.user?.id;
    const { data: had } = id ? await db.from("profiles").select("pin_set").eq("id", id).maybeSingle() : { data: null };
    if (!id || had?.pin_set) return { ok: false, error: "There's already an account with this email. Go back and sign in with your password." };
  }
  if (!(await signInAs(created.data.user?.id ?? "", email))) return { ok: false, error: "We couldn't sign you in. Please try again." };
  const userId = await currentUserId();
  if (userId) await db.from("profiles").update({ email }).eq("id", userId).is("email", null);
  return { ok: true, needsSetup: true };
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
  if (userId) {
    await db.from("profiles").update({ email }).eq("id", userId).is("email", null);
    // The code reached them: the address is theirs (game-db/099; nothing happens before it's run).
    await db.from("profiles").update({ email_verified_at: new Date().toISOString() }).eq("id", userId).is("email_verified_at", null);
  }
  // After an email code they always make a new password ("forgot password").
  return { ok: true, needsSetup: true };
}

/** Signing in: the password (or, for players from before passwords, their old 6-digit PIN). */
export async function loginWithPassword(rawEmail: string, password: string): Promise<LoginResult> {
  const email = clean(rawEmail);
  const wrong = "That password isn't right.";
  if (!EMAIL.test(email) || !password || password.length > 200) return { ok: false, error: wrong };

  const db = createAdminClient();
  const { data: profile } = await db
    .from("profiles")
    .select("id, pin_set, pin_failures, pin_locked_until")
    .eq("email", email)
    .maybeSingle();
  if (!profile?.pin_set) return { ok: false, error: wrong };
  if (profile.pin_locked_until && Date.parse(profile.pin_locked_until) > Date.now()) {
    return { ok: false, error: "Too many wrong tries. Wait a few minutes, or use Forgot password." };
  }

  const { data: user } = await db.auth.admin.getUserById(profile.id);
  const authEmail = user.user?.email;
  const supabase = await createClient();
  const tryWith = async (pw: string) => (authEmail ? (await supabase.auth.signInWithPassword({ email: authEmail, password: pw })).error : new Error("no email"));
  let error = await tryWith(password);
  // Players from before passwords: their old PIN still lets them in (and they're asked to make a password).
  if (error && PIN.test(password)) error = await tryWith(pinPassword(profile.id, password));
  if (error) {
    const failures = profile.pin_failures + 1;
    await db
      .from("profiles")
      .update(
        failures >= PASSWORD_TRIES
          ? { pin_failures: 0, pin_locked_until: new Date(Date.now() + PASSWORD_LOCK_MINUTES * 60_000).toISOString() }
          : { pin_failures: failures },
      )
      .eq("id", profile.id);
    return {
      ok: false,
      error: failures >= PASSWORD_TRIES ? "Too many wrong tries. Wait 15 minutes, or use Forgot password." : wrong,
    };
  }
  // Only when there's something to reset (one less trip to the database on the way in).
  if (profile.pin_failures || profile.pin_locked_until) await db.from("profiles").update({ pin_failures: 0, pin_locked_until: null }).eq("id", profile.id);
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

/** Whether a name will do (the name step, before moving on): null if it's fine. */
async function nameProblem(userId: string, name: string): Promise<string | null> {
  if (!NAME.test(name)) return "Names are 3 to 16 letters, numbers or _.";
  if (/^seed.?bot$/i.test(name)) return "That name is taken. Try another.";
  const { data: taken } = await createAdminClient()
    .from("profiles")
    .select("id")
    .ilike("username", name.replace(/_/g, "\\_"))
    .neq("id", userId)
    .maybeSingle();
  return taken ? "That name is taken. Try another." : null;
}

/** Sign-up, the name step: the name other players see, kept for them straight away. */
export async function saveName(rawName: string): Promise<LoginResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const name = rawName.trim();
  const problem = await nameProblem(userId, name);
  if (problem) return { ok: false, error: problem };
  const { error } = await createAdminClient().from("profiles").update({ username: name }).eq("id", userId);
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? "That name is taken. Try another." : "We couldn't save your name." };
  return { ok: true };
}

/** Who's signed in, for the password checks (their email and name can't be in it). */
async function aboutMe(userId: string) {
  const db = createAdminClient();
  const [{ data: user }, { data: p }] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from("profiles").select("username").eq("id", userId).maybeSingle(),
  ]);
  return { email: user.user?.email ?? "", name: p?.username ?? "" };
}

/** The password step, before typing it again: the same rules as savePassword, the leak check too. */
export async function checkPassword(password: string): Promise<LoginResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  const problem = passwordProblem(password, await aboutMe(userId));
  if (problem) return { ok: false, error: problem };
  if ((await timesLeaked(password)) > 0) {
    return { ok: false, error: "That password has turned up in a data leak somewhere, so hackers try it. Pick another." };
  }
  return { ok: true };
}

/**
 * The last step of signing up, and new passwords (forgot password, change password, players from
 * before passwords): checked again here, then it's the account's password. A new player has to
 * have a name and date of birth by now; their account is finished with it.
 */
export async function savePassword(password: string, again: string): Promise<LoginResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };
  if (password !== again) return { ok: false, error: "The two passwords don't match." };
  const checked = await checkPassword(password);
  if (!checked.ok) return checked;
  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("username, pin_set").eq("id", userId).maybeSingle();
  if (!p?.username) return { ok: false, error: "Please pick your name first." };
  const age = await checkBirthDate(userId, null);
  if (!age.ok) return age;

  const { error: pwError } = await db.auth.admin.updateUserById(userId, { password });
  if (pwError) {
    console.error("Saving password failed", pwError.message);
    return { ok: false, error: /weak|pwned|leak/i.test(pwError.message) ? "That password is too easy to guess. Pick another." : "We couldn't save your password. Please try again." };
  }
  // So the game stops asking for one (before game-db/100 is run there's nowhere to keep it: no harm).
  const { error: markError } = await db.from("profiles").update({ password_set: true }).eq("id", userId);
  if (markError) console.error("Marking password failed", markError.message);
  const { error } = await db.from("profiles").update({ pin_set: true, pin_failures: 0, pin_locked_until: null }).eq("id", userId);
  if (error) return { ok: false, error: "We couldn't finish setting up your account. Please try again." };
  // Changing the password can end the current login on Supabase's side, so sign straight
  // back in with the new one. Otherwise players get thrown out right after setting it.
  const { data: user } = await db.auth.admin.getUserById(userId);
  if (user.user?.email) await (await createClient()).auth.signInWithPassword({ email: user.user.email, password });
  return { ok: true };
}
