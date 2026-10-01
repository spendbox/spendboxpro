"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Join a business from its link. Returns an error message, or redirects to the business. */
export async function joinBusiness(slug: string, refCode: string | null, share: boolean): Promise<string | void> {
  if (!(await getUser())) return "Please verify your phone number first.";
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_business", {
    p_slug: slug,
    p_ref: refCode,
    p_share_details: share,
  });
  if (error) return error.message;
  redirect(`/me/b/${slug}?welcome=1`);
}
