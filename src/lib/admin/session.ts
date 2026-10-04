import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getUser } from "@/lib/auth";
import { supabaseSecretKey } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// Who can use /admin:
// - the main admin, who signs in with ADMIN_EMAIL and ADMIN_PASSWORD (set in
//   Vercel). Changing either there signs everyone out of the admin area;
// - team members, added in /admin/team, who use their usual Spendbox login.

export type AdminRole = "viewer" | "support" | "manager" | "owner";

const RANK: Record<AdminRole, number> = { viewer: 1, support: 2, manager: 3, owner: 4 };

export const ROLE_LABELS: Record<AdminRole, { label: string; can: string }> = {
  viewer: { label: "Viewer", can: "Sees the dashboard, businesses and customers. Can't change anything." },
  support: { label: "Support", can: "Can also pause and unpause, and change a business's free trial." },
  manager: { label: "Manager", can: "Can also delete businesses and customers, and change app settings." },
  owner: { label: "Main admin", can: "Everything, including who's on the admin team." },
};

export interface Admin {
  role: AdminRole;
  /** Shown in the admin log, e.g. the email or "+234 803…". */
  name: string;
  userId: string | null;
}

const COOKIE = "sb_admin";
const HOURS = 12;

/** Shortest main-admin password accepted. */
export const MIN_ADMIN_PASSWORD = 10;

export function adminLoginConfigured() {
  return Boolean(process.env.ADMIN_EMAIL?.trim() && (process.env.ADMIN_PASSWORD?.length ?? 0) >= MIN_ADMIN_PASSWORD);
}

function secret() {
  return createHash("sha256")
    .update(`spendbox-admin|${process.env.ADMIN_EMAIL?.trim().toLowerCase()}|${process.env.ADMIN_PASSWORD}|${supabaseSecretKey()}`)
    .digest();
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function same(a: string, b: string) {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** Checks the main admin's email and password. */
export function checkAdminPassword(email: string, password: string) {
  if (!adminLoginConfigured()) return false;
  const emailOk = same(email.trim().toLowerCase(), process.env.ADMIN_EMAIL!.trim().toLowerCase());
  const passwordOk = same(password, process.env.ADMIN_PASSWORD!);
  return emailOk && passwordOk;
}

export async function startAdminSession() {
  const payload = Buffer.from(JSON.stringify({ e: process.env.ADMIN_EMAIL!.trim().toLowerCase(), x: Date.now() + HOURS * 3_600_000 })).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: HOURS * 3600,
  });
}

export async function endAdminSession() {
  (await cookies()).delete({ name: COOKIE, path: "/admin" });
}

async function mainAdminFromCookie(): Promise<Admin | null> {
  if (!adminLoginConfigured()) return null;
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !same(signature, sign(payload))) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { e: string; x: number };
    if (typeof x !== "number" || x < Date.now()) return null;
    return { role: "owner", name: e, userId: null };
  } catch {
    return null;
  }
}

/** The person using the admin area, or null. Cached for one request. */
export const getAdmin = cache(async (): Promise<Admin | null> => {
  const main = await mainAdminFromCookie();
  if (main) return main;
  const user = await getUser();
  if (!user) return null;
  const { data } = await createAdminClient().from("admin_members").select("role").eq("user_id", user.id).maybeSingle();
  if (!data) return null;
  return { role: data.role as AdminRole, name: user.email ?? (user.phone ? `+${user.phone}` : user.id.slice(0, 8)), userId: user.id };
});

export function allowed(admin: Admin | null, min: AdminRole) {
  return Boolean(admin && RANK[admin.role] >= RANK[min]);
}

/** For pages: sends visitors who aren't admins to the admin login. */
export async function requireAdmin(min: AdminRole = "viewer") {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  if (!allowed(admin, min)) redirect("/admin?denied=1");
  return admin;
}

/** For actions: returns the admin, or an error message to show. */
export async function adminFor(min: AdminRole): Promise<Admin | string> {
  const admin = await getAdmin();
  if (!admin) return "Please log in to the admin area again.";
  if (!allowed(admin, min)) return `You need ${ROLE_LABELS[min].label} access or higher to do this.`;
  return admin;
}

/** Writes a line to the admin log. Never throws. */
export async function logAdmin(actor: string, action: string, target?: { type: string; id: string }, summary?: string) {
  try {
    await createAdminClient()
      .from("admin_log")
      .insert({ actor, action, target_type: target?.type ?? null, target_id: target?.id ?? null, summary: summary?.slice(0, 300) ?? null });
  } catch (error) {
    console.error("Admin log failed", error);
  }
}
