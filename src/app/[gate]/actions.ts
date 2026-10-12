"use server";

import { revalidatePath } from "next/cache";
import { adminSignIn, adminSignOut, isAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPack } from "../play/pack-actions";

// The owner's dashboard (src/lib/admin.ts): signing in and out, and the few things it can do.

export async function hqSignIn(_: unknown, form: FormData): Promise<{ error: string | null }> {
  const ok = await adminSignIn(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!ok) return { error: "That email and password don't match." };
  revalidatePath("/", "layout");
  return { error: null };
}

export async function hqSignOut() {
  await adminSignOut();
  revalidatePath("/", "layout");
}

/** Ask Paystack again about a starter pack that hasn't arrived (gives the mint if it was paid). */
export async function hqRecheckPack(reference: string): Promise<string> {
  if (!(await isAdmin())) return "Sign in again.";
  const r = await confirmPack(reference);
  revalidatePath("/", "layout");
  return r.ok ? `Paid: the player now has the pack (${Math.round(r.mint ?? 0).toLocaleString("en-GB")} mint).` : (r.error ?? "Not paid.");
}

/** Take a business off the map (it breaks the policy). */
export async function hqTakeDown(leaseId: string): Promise<string> {
  if (!(await isAdmin())) return "Sign in again.";
  const { error } = await createAdminClient().from("business_leases").update({ status: "removed" }).eq("id", leaseId).eq("status", "live");
  revalidatePath("/", "layout");
  return error ? "That didn't work." : "Taken down.";
}
