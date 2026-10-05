"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { endAdminSession } from "@/lib/admin/session";
import { TRIAL_HIDDEN_COOKIE } from "@/lib/trial";
import { createClient } from "@/lib/supabase/server";

/**
 * Logs out on this device, for sure: ends the session with Supabase, and
 * whatever that call says (it keeps the session when it can't reach Supabase,
 * on a weak connection), removes the login cookies, the admin session and the
 * saved pages, so nothing private shows after.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  const jar = await cookies();
  for (const c of jar.getAll()) if (c.name.startsWith("sb-") && c.name.includes("-auth-token")) jar.delete(c.name);
  jar.delete(TRIAL_HIDDEN_COOKIE);
  await endAdminSession().catch(() => undefined);
  revalidatePath("/", "layout");
  redirect("/");
}
