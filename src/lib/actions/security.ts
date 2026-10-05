"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { supabasePublicKey, supabaseUrl } from "@/lib/env";
import { MIN_PASSWORD } from "@/lib/password";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TRIAL_HIDDEN_COOKIE } from "@/lib/trial";

// Login & security, for customers and business owners alike: a new password
// (after checking the current one) and logging out on every device.

export interface SecurityResult {
  ok?: boolean;
  error?: string;
}

/** Changes the password once the current one checks out. Other devices are logged out; this one stays in. */
export async function changePassword(current: string, next: string): Promise<SecurityResult> {
  const user = await requireUser();
  if (next.length < MIN_PASSWORD) return { error: `Choose a new password with at least ${MIN_PASSWORD} characters.` };
  if (next === current) return { error: "That's the same as your current password. Choose a different one." };
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(user.id);
  const loginEmail = data.user?.email;
  if (!loginEmail) return { error: "Add an email to your account first, then set a password." };

  // Check the current password on a throwaway client, so this device's session isn't touched.
  const check = createPlainClient(supabaseUrl(), supabasePublicKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrong } = await check.auth.signInWithPassword({ email: loginEmail, password: current });
  if (wrong) return { error: /invalid/i.test(wrong.message) ? "Your current password isn't right. Try again, or log out and tap “Forgot password?”." : "We couldn't check your password. Please try again." };
  await check.auth.signOut({ scope: "local" });

  const { error } = await admin.auth.admin.updateUserById(user.id, { password: next });
  if (error) return { error: /weak|password/i.test(error.message) ? "Please choose a stronger password." : "We couldn't save your new password. Please try again." };
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "others" });
  return { ok: true };
}

/** Logs out on every phone and computer, this one included. */
export async function signOutEverywhere() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  // If that call failed, still forget the session on this device.
  if (error) await supabase.auth.signOut({ scope: "local" });
  (await cookies()).delete(TRIAL_HIDDEN_COOKIE);
  redirect("/login");
}
