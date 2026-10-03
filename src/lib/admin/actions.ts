"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminFor, logAdmin, type AdminRole } from "@/lib/admin/session";
import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { normalizePhone } from "@/lib/phone";
import { saveSetting, type AppSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

// Everything the admin area changes. Each action checks the admin's role
// first and writes a line to the admin log.

export interface AdminResult {
  ok?: boolean;
  error?: string;
}

const DAY = 86_400_000;

function refresh() {
  revalidatePath("/", "layout");
}

// ------------------------------------------------------------------ Settings

const SWITCH_LABELS: Record<Exclude<keyof AppSettings, "trialDays">, string> = {
  trialEnabled: "Free trial",
  signupsOpen: "New business sign-ups",
  joinsOpen: "Customers joining",
  emailsEnabled: "Emails",
  testPayments: "Test payments",
};

export async function setSwitch(name: Exclude<keyof AppSettings, "trialDays">, on: boolean): Promise<AdminResult> {
  const admin = await adminFor("manager");
  if (typeof admin === "string") return { error: admin };
  if (!(name in SWITCH_LABELS)) return { error: "Unknown setting." };
  await saveSetting(name, Boolean(on), admin.name);
  await logAdmin(admin.name, "setting", { type: "setting", id: name }, `${SWITCH_LABELS[name]} turned ${on ? "on" : "off"}`);
  refresh();
  return { ok: true };
}

export async function setTrialDays(days: number): Promise<AdminResult> {
  const admin = await adminFor("manager");
  if (typeof admin === "string") return { error: admin };
  const n = Math.round(Number(days));
  if (!Number.isFinite(n) || n < 1 || n > 3650) return { error: "Choose between 1 and 3650 days." };
  await saveSetting("trialDays", n, admin.name);
  await logAdmin(admin.name, "setting", { type: "setting", id: "trialDays" }, `Free trial length set to ${n} days`);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- Businesses

async function businessName(id: string) {
  const { data } = await createAdminClient().from("businesses").select("name").eq("id", id).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

export async function setBusinessPaused(id: string, paused: boolean): Promise<AdminResult> {
  const admin = await adminFor("support");
  if (typeof admin === "string") return { error: admin };
  const name = await businessName(id);
  if (!name) return { error: "That business no longer exists." };
  const { error: dbError } = await createAdminClient()
    .from("businesses")
    .update({ suspended_at: paused ? new Date().toISOString() : null })
    .eq("id", id);
  if (dbError) return { error: dbError.message };
  await logAdmin(admin.name, paused ? "business_paused" : "business_unpaused", { type: "business", id }, `${paused ? "Paused" : "Unpaused"} ${name}`);
  refresh();
  return { ok: true };
}

/**
 * Changes one business's free trial: "extend" adds days to the current end,
 * "date" sets an end date (YYYY-MM-DD), "end" ends it now, "default" goes back
 * to the usual length.
 */
export async function setBusinessTrial(
  id: string,
  change: { kind: "extend"; days: number; currentEnd: string } | { kind: "date"; date: string } | { kind: "end" } | { kind: "default" },
): Promise<AdminResult> {
  const admin = await adminFor("support");
  if (typeof admin === "string") return { error: admin };
  const name = await businessName(id);
  if (!name) return { error: "That business no longer exists." };

  let endsAt: string | null;
  let summary: string;
  if (change.kind === "extend") {
    const days = Math.round(Number(change.days));
    if (!Number.isFinite(days) || days < 1 || days > 3650) return { error: "Choose between 1 and 3650 days." };
    const from = Math.max(new Date(change.currentEnd).getTime() || 0, Date.now());
    endsAt = new Date(from + days * DAY).toISOString();
    summary = `Extended ${name}'s trial by ${days} days`;
  } else if (change.kind === "date") {
    const date = new Date(`${change.date}T23:59:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(change.date) || Number.isNaN(date.getTime())) return { error: "Pick a date." };
    endsAt = date.toISOString();
    summary = `Set ${name}'s trial to end on ${change.date}`;
  } else if (change.kind === "end") {
    endsAt = new Date().toISOString();
    summary = `Ended ${name}'s trial`;
  } else {
    endsAt = null;
    summary = `Put ${name}'s trial back to the usual length`;
  }
  const { error: dbError } = await createAdminClient().from("businesses").update({ trial_ends_at: endsAt }).eq("id", id);
  if (dbError) return { error: dbError.message };
  await logAdmin(admin.name, "business_trial", { type: "business", id }, summary);
  refresh();
  return { ok: true };
}

export async function deleteBusinessAsAdmin(id: string, confirm: string): Promise<AdminResult> {
  const admin = await adminFor("manager");
  if (typeof admin === "string") return { error: admin };
  const name = await businessName(id);
  if (!name) return { error: "That business no longer exists." };
  if (confirm.trim().toLowerCase() !== name.trim().toLowerCase()) return { error: `Type “${name}” to confirm.` };
  const { error: dbError } = await createAdminClient().from("businesses").delete().eq("id", id);
  if (dbError) return { error: dbError.message };
  await logAdmin(admin.name, "business_deleted", { type: "business", id }, `Deleted ${name}`);
  refresh();
  redirect("/admin/businesses");
}

// ----------------------------------------------------------------- Customers

async function personLabel(id: string) {
  const { data } = await createAdminClient().from("profiles").select("full_name, phone").eq("id", id).maybeSingle();
  if (!data) return null;
  return (data.full_name as string | null) ?? (data.phone ? `+${data.phone}` : "this person");
}

export async function setCustomerPaused(id: string, paused: boolean): Promise<AdminResult> {
  const admin = await adminFor("support");
  if (typeof admin === "string") return { error: admin };
  if (admin.userId === id) return { error: "You can't pause yourself." };
  const label = await personLabel(id);
  if (!label) return { error: "That account no longer exists." };
  const supabase = createAdminClient();
  // A ban stops them logging in (sessions already open end within the hour).
  const { error: authError } = await supabase.auth.admin.updateUserById(id, { ban_duration: paused ? "876000h" : "none" });
  if (authError) return { error: authError.message };
  await supabase.from("profiles").update({ suspended_at: paused ? new Date().toISOString() : null }).eq("id", id);
  await logAdmin(admin.name, paused ? "customer_paused" : "customer_unpaused", { type: "customer", id }, `${paused ? "Paused" : "Unpaused"} ${label}`);
  refresh();
  return { ok: true };
}

export async function deleteCustomerAsAdmin(id: string, confirm: string): Promise<AdminResult> {
  const admin = await adminFor("manager");
  if (typeof admin === "string") return { error: admin };
  if (admin.userId === id) return { error: "You can't delete yourself here." };
  if (confirm.trim().toUpperCase() !== "DELETE") return { error: "Type DELETE to confirm." };
  const label = await personLabel(id);
  if (!label) return { error: "That account no longer exists." };
  const supabase = createAdminClient();
  const { data: files } = await supabase.storage.from("receipts").list(id, { limit: 1000 });
  if (files?.length) await supabase.storage.from("receipts").remove(files.map((f) => `${id}/${f.name}`));
  const { error: authError } = await supabase.auth.admin.deleteUser(id);
  if (authError) return { error: authError.message };
  await logAdmin(admin.name, "customer_deleted", { type: "customer", id }, `Deleted ${label}`);
  refresh();
  redirect("/admin/customers");
}

// ---------------------------------------------------------------------- Team

export async function addTeamMember(country: string, phone: string, role: Exclude<AdminRole, "owner">): Promise<AdminResult> {
  const admin = await adminFor("owner");
  if (typeof admin === "string") return { error: admin };
  if (!["viewer", "support", "manager"].includes(role)) return { error: "Pick a role." };
  const digits = normalizePhone(country || DEFAULT_COUNTRY_CODE, phone);
  if (!digits) return { error: "That phone number doesn't look right." };
  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("id, full_name").eq("phone", digits).maybeSingle();
  if (!profile) return { error: "No Spendbox account uses that number yet. Ask them to sign up first, then add them." };
  const { error: dbError } = await supabase.from("admin_members").upsert({ user_id: profile.id, role, added_by: admin.name });
  if (dbError) return { error: dbError.message };
  await logAdmin(admin.name, "team_added", { type: "customer", id: profile.id }, `Gave +${digits} ${role} access`);
  revalidatePath("/admin/team");
  return { ok: true };
}

export async function setTeamRole(userId: string, role: Exclude<AdminRole, "owner">): Promise<AdminResult> {
  const admin = await adminFor("owner");
  if (typeof admin === "string") return { error: admin };
  if (!["viewer", "support", "manager"].includes(role)) return { error: "Pick a role." };
  const { error: dbError } = await createAdminClient().from("admin_members").update({ role }).eq("user_id", userId);
  if (dbError) return { error: dbError.message };
  await logAdmin(admin.name, "team_role", { type: "customer", id: userId }, `Changed a team member to ${role}`);
  revalidatePath("/admin/team");
  return { ok: true };
}

export async function removeTeamMember(userId: string): Promise<AdminResult> {
  const admin = await adminFor("owner");
  if (typeof admin === "string") return { error: admin };
  const { error: dbError } = await createAdminClient().from("admin_members").delete().eq("user_id", userId);
  if (dbError) return { error: dbError.message };
  await logAdmin(admin.name, "team_removed", { type: "customer", id: userId }, "Removed a team member");
  revalidatePath("/admin/team");
  return { ok: true };
}
