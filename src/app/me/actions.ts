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

/** Leave a business (they no longer see me or my requests). */
export async function leaveBusiness(membershipId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("memberships").delete().eq("id", membershipId).eq("customer_id", user.id);
  revalidatePath("/", "layout");
  redirect("/me");
}

/** Permanently deletes the account, requests and every membership. */
export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/me/profile");
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }

  const admin = createAdminClient();
  // Remove stored images first (they live in folders named after the user).
  for (const bucket of ["request-images", "receipts"]) {
    const { data: files } = await admin.storage.from(bucket).list(user.id, { limit: 1000 });
    if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: "Could not delete your account. Please try again." };

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/?deleted=1");
}
