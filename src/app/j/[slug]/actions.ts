"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { matchOpenPayments } from "@/lib/bank/sync";
import { notifyNewMember, notifyRewardsReady } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Join a business from its link. Returns an error message, or redirects to the business. */
export async function joinBusiness(slug: string, refCode: string | null, share: boolean): Promise<string | void> {
  if (!(await getUser())) return "Please sign in first.";
  const supabase = await createClient();
  const { data: membershipId, error } = await supabase.rpc("join_business", {
    p_slug: slug,
    p_ref: refCode,
    p_share_details: share,
  });
  if (error) return error.message;
  after(async () => {
    await notifyNewMember(membershipId as string);
    await notifyRewardsReady();
    // Customers often pay at the counter and then join: count that payment now.
    const { data } = await createAdminClient().from("memberships").select("business_id").eq("id", membershipId).maybeSingle();
    if (data) await matchOpenPayments(data.business_id).catch((e) => console.error("matchOpenPayments failed", e));
  });
  redirect(`/me/b/${slug}?welcome=1`);
}
