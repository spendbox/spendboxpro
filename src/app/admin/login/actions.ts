"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminLoginConfigured, checkAdminPassword, endAdminSession, getAdmin, logAdmin, startAdminSession } from "@/lib/admin/session";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_TRIES = 8;
const WINDOW_MINUTES = 15;

export interface LoginState {
  error?: string;
  /** Kept so the form doesn't clear it after a wrong password. */
  email?: string;
}

export async function adminLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!adminLoginConfigured()) return { error: "Set ADMIN_EMAIL and ADMIN_PASSWORD in Vercel first, then redeploy." };
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

  // Slow down guessing: a few tries per address, then a 15-minute wait.
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await createAdminClient()
    .from("admin_log")
    .select("id", { count: "exact", head: true })
    .eq("action", "login_failed")
    .eq("target_id", ip)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_TRIES) return { error: `Too many tries. Please wait ${WINDOW_MINUTES} minutes and try again.`, email };

  if (!checkAdminPassword(email, password)) {
    await logAdmin(email.slice(0, 120) || "unknown", "login_failed", { type: "ip", id: ip }, "Failed login: wrong email or password");
    await new Promise((r) => setTimeout(r, 600));
    return { error: "That email and password don't match.", email };
  }
  await startAdminSession();
  await logAdmin(email.trim().toLowerCase(), "login", { type: "ip", id: ip });
  redirect("/admin");
}

export async function adminLogout() {
  const admin = await getAdmin();
  if (admin?.role === "owner") await endAdminSession();
  redirect(admin?.role === "owner" ? "/admin/login" : "/");
}
