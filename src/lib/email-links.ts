import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { emailBody, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// One-time links sent by email: confirming an email address and resetting a
// password. Only a hash of each token is stored, and each works once.

type Kind = "verify_email" | "reset_password";

const LIFETIME_HOURS: Record<Kind, number> = { verify_email: 72, reset_password: 1 };
/** At most this many links of one kind per person per hour. */
const PER_HOUR = 5;

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function createToken(userId: string, kind: Kind, email: string) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from("auth_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", since);
  if ((count ?? 0) >= PER_HOUR) return null;
  const token = randomBytes(32).toString("base64url");
  const { error } = await admin.from("auth_tokens").insert({
    user_id: userId,
    kind,
    email,
    token_hash: hash(token),
    expires_at: new Date(Date.now() + LIFETIME_HOURS[kind] * 3_600_000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return token;
}

/** Uses up a link. Returns who it was for, or null if it's wrong, used or expired. */
export async function consumeToken(token: string, kind: Kind) {
  if (!token || token.length > 100) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("auth_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hash(token))
    .eq("kind", kind)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id, email")
    .maybeSingle();
  return data ? { userId: data.user_id as string, email: (data.email as string | null) ?? null } : null;
}

/** Emails a "confirm your email" link. Returns false if too many were sent recently. */
export async function sendVerifyEmail(userId: string, email: string) {
  const token = await createToken(userId, "verify_email", email);
  if (!token) return false;
  const { html, text } = emailBody({
    heading: "Confirm your email",
    lines: ["Welcome to Spendbox! Tap the button to confirm this is your email address.", "The link works for 3 days."],
    button: { label: "Confirm my email", url: `${siteUrl()}/auth/verify?token=${token}` },
    footer: "You got this because someone signed up to Spendbox with this email. If it wasn't you, ignore it.",
  });
  await sendEmail({ to: email, subject: "Confirm your email for Spendbox", html, text, essential: true });
  return true;
}

/** Emails a password reset link. Returns false if too many were sent recently. */
export async function sendResetEmail(userId: string, email: string) {
  const token = await createToken(userId, "reset_password", email);
  if (!token) return false;
  const { html, text } = emailBody({
    heading: "Choose a new password",
    lines: ["Someone (hopefully you) asked to reset your Spendbox password.", "The link works for 1 hour. If you didn't ask, you can ignore this email."],
    button: { label: "Choose a new password", url: `${siteUrl()}/auth/reset?token=${token}` },
    footer: "Spendbox never asks for your password by email or phone.",
  });
  await sendEmail({ to: email, subject: "Reset your Spendbox password", html, text, essential: true });
  return true;
}
