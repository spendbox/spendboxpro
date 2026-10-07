"use server";

import { createHash, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { advertiserCodeEmail } from "@/lib/ad-emails";
import { editAdFor, EMAIL_RE, setPausedFor, startTopUpCheckout, type CheckoutResult, type EditResult } from "@/lib/ads";
import { sendEmail } from "@/lib/email";
import { supabaseSecretKey } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearAdvertiserSession, currentAdvertiserId, setAdvertiserSession } from "./session";

// The advertiser's portal: sign in with a 4-digit email code (the same rules as the players'
// codes, but in its own table), then edit, pause and top up their own ads.

type Result = { ok: true } | { ok: false; error: string };

const CODE_MINUTES = 10;
const MAX_SENDS_PER_HOUR = 5;
const RESEND_SECONDS = 30;
const DAILY_WRONG = 15; // same number as in check_advertiser_code (game-db/013)
const LOCKED = "Too many wrong codes today. Please try again tomorrow.";
const OOPS = "Something went wrong. Please try again.";

const clean = (email: string) => String(email ?? "").trim().toLowerCase();
const hash = (email: string, code: string) =>
  createHash("sha256").update(`advertiser:${email}:${code}:${supabaseSecretKey()}`).digest("hex");

export async function sendAdvertiserCode(rawEmail: string): Promise<Result> {
  const email = clean(rawEmail);
  if (!EMAIL_RE.test(email) || email.length > 200) return { ok: false, error: "Please check your email address." };
  const db = createAdminClient();
  const { data: who } = await db.from("advertisers").select("id").eq("email", email).maybeSingle();
  if (!who) return { ok: false, error: "We couldn't find any ads for that email. Please use the email you paid with." };

  const { data: row } = await db.from("advertiser_codes").select("*").eq("email", email).maybeSingle();
  const now = Date.now();
  let sentCount = 1;
  let windowStart = new Date(now).toISOString();
  if (row) {
    const wait = RESEND_SECONDS - Math.floor((now - Date.parse(row.last_sent_at)) / 1000);
    if (wait > 0) return { ok: false, error: `We just sent a code. You can ask for another in ${wait} seconds.` };
    if (now - Date.parse(row.window_started_at) < 3600_000) {
      if (row.sent_count >= MAX_SENDS_PER_HOUR) return { ok: false, error: "Too many codes sent. Please wait an hour and try again." };
      sentCount = row.sent_count + 1;
      windowStart = row.window_started_at;
    }
    if (row.wrong_total >= DAILY_WRONG && now - Date.parse(row.wrong_window_started_at) < 86400_000) {
      return { ok: false, error: LOCKED };
    }
  }

  const code = randomInt(0, 10_000).toString().padStart(4, "0");
  const { error } = await db.from("advertiser_codes").upsert({
    email,
    code_hash: hash(email, code),
    expires_at: new Date(now + CODE_MINUTES * 60_000).toISOString(),
    attempts: 0,
    sent_count: sentCount,
    window_started_at: windowStart,
    last_sent_at: new Date(now).toISOString(),
  });
  if (error) {
    console.error("Saving advertiser code failed", error.message);
    return { ok: false, error: OOPS };
  }
  const sent = await sendEmail({ to: email, ...advertiserCodeEmail(code) });
  if (!sent.ok) {
    await db.from("advertiser_codes").update({ last_sent_at: new Date(0).toISOString() }).eq("email", email);
    return { ok: false, error: `We couldn't send the email: ${sent.error}` };
  }
  return { ok: true };
}

export async function verifyAdvertiserCode(rawEmail: string, rawCode: string): Promise<Result> {
  const email = clean(rawEmail);
  const code = String(rawCode ?? "").replace(/\D/g, "");
  if (!EMAIL_RE.test(email) || !/^\d{4}$/.test(code)) return { ok: false, error: "Enter the 4-digit code." };
  const db = createAdminClient();
  const { data: verdict, error } = await db.rpc("check_advertiser_code", { p_email: email, p_hash: hash(email, code) });
  if (error) {
    console.error("Checking advertiser code failed", error.message);
    return { ok: false, error: OOPS };
  }
  if (verdict !== "ok") {
    const errors: Record<string, string> = {
      expired: "This code has expired. Ask for a new one.",
      too_many: "Too many wrong tries. Ask for a new code.",
      locked: LOCKED,
    };
    return { ok: false, error: errors[verdict as string] ?? "That code isn't right. Check it and try again." };
  }
  const { data: who } = await db.from("advertisers").select("id").eq("email", email).maybeSingle();
  if (!who) return { ok: false, error: OOPS };
  await setAdvertiserSession(who.id as string);
  return { ok: true };
}

export async function signOutAdvertiser(): Promise<void> {
  await clearAdvertiserSession();
  revalidatePath("/advertiser");
}

const SIGNED_OUT = "You've been signed out. Please sign in again.";

export async function editAd(form: FormData): Promise<EditResult> {
  const me = await currentAdvertiserId();
  if (!me) return { ok: false, error: SIGNED_OUT };
  try {
    const res = await editAdFor(me, form);
    if (res.ok) revalidatePath("/advertiser");
    return res;
  } catch (error) {
    console.error("Editing ad failed", error);
    return { ok: false, error: OOPS };
  }
}

export async function setAdPaused(adId: string, paused: boolean): Promise<EditResult> {
  const me = await currentAdvertiserId();
  if (!me) return { ok: false, error: SIGNED_OUT };
  const res = await setPausedFor(me, String(adId ?? ""), Boolean(paused));
  if (res.ok) revalidatePath("/advertiser");
  return res;
}

export async function topUpAd(form: FormData): Promise<CheckoutResult> {
  const me = await currentAdvertiserId();
  if (!me) return { ok: false, error: SIGNED_OUT };
  try {
    return await startTopUpCheckout(me, form);
  } catch (error) {
    console.error("Top-up checkout failed", error);
    return { ok: false, error: OOPS };
  }
}
