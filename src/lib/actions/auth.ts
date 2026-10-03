"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TRIAL_HIDDEN_COOKIE } from "@/lib/trial";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(TRIAL_HIDDEN_COOKIE);
  redirect("/");
}
