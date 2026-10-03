"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
}


/** Turn sharing of personal details with one business on or off. */
export async function setSharing(membershipId: string, share: boolean) {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("memberships").update({ share_details: share }).eq("id", membershipId).eq("customer_id", user.id);
  revalidatePath("/", "layout");
}

/** Stop recognising a bank sender as me. */
export async function forgetPayer(payerId: string) {
  const user = await requireUser("/me/profile");
  const supabase = await createClient();
  const { data: removed, error } = await supabase
    .from("payers")
    .delete()
    .eq("id", payerId)
    .select("sender_key, sender_account")
    .maybeSingle();
  if (error) return { error: error.message };
  // Don't match this sender to me again, at any business I've joined.
  const senders = [removed?.sender_key, removed?.sender_account].filter((x): x is string => Boolean(x));
  if (senders.length) {
    const { data: memberships } = await supabase.from("memberships").select("id").eq("customer_id", user.id);
    const rows = (memberships ?? []).flatMap((m) => senders.map((sender) => ({ membership_id: m.id, sender })));
    if (rows.length) {
      await createAdminClient().from("bank_sender_rejections").upsert(rows, { onConflict: "membership_id,sender", ignoreDuplicates: true });
    }
  }
  revalidatePath("/me/profile");
  return { ok: true };
}

export async function leaveBusiness(membershipId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("memberships").delete().eq("id", membershipId).eq("customer_id", user.id);
  revalidatePath("/", "layout");
  redirect("/me");
}

/** Permanently deletes the account, receipts and every membership. */
export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/me/profile");
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }

  const admin = createAdminClient();
  // Remove stored receipt images first (they live in a folder named after the user).
  const { data: files } = await admin.storage.from("receipts").list(user.id, { limit: 1000 });
  if (files?.length) {
    await admin.storage.from("receipts").remove(files.map((f) => `${user.id}/${f.name}`));
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: "Could not delete your account. Please try again." };

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/?deleted=1");
}
