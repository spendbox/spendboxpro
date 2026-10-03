"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminFor, logAdmin, type AdminRole } from "@/lib/admin/session";
import { billingState, PLANS, priceFor, type PlanKey } from "@/lib/billing";
import { DEFAULT_COUNTRY_CODE } from "@/lib/env";
import { normalizePhone } from "@/lib/phone";
import { getSettings, saveSetting, type NumberName, type SwitchName } from "@/lib/settings";
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

const SWITCH_LABELS: Record<SwitchName, string> = {
  trialEnabled: "Free trial",
  signupsOpen: "New business sign-ups",
  joinsOpen: "Customers joining",
  emailsEnabled: "Emails",
  testPayments: "Test payments",
};

export async function setSwitch(name: SwitchName, on: boolean): Promise<AdminResult> {
  const admin = await adminFor("manager");
  if (typeof admin === "string") return { error: admin };
  if (!(name in SWITCH_LABELS)) return { error: "Unknown setting." };
  await saveSetting(name, Boolean(on), admin.name);
  await logAdmin(admin.name, "setting", { type: "setting", id: name }, `${SWITCH_LABELS[name]} turned ${on ? "on" : "off"}`);
  refresh();
  return { ok: true };
}

const NUMBER_RULES: Record<NumberName, { min: number; max: number; label: (n: number) => string; error: string }> = {
  trialDays: { min: 1, max: 3650, label: (n) => `Free trial length set to ${n} days`, error: "Choose between 1 and 3650 days." },
  priceStarter: { min: 0, max: 10_000_000, label: (n) => `Starter price set to ₦${n.toLocaleString("en-NG")} a month`, error: "Type a price in naira." },
  pricePlus: { min: 0, max: 10_000_000, label: (n) => `Plus price set to ₦${n.toLocaleString("en-NG")} a month`, error: "Type a price in naira." },
};

export async function setNumberSetting(name: NumberName, value: number): Promise<AdminResult> {
  const admin = await adminFor("manager");
  if (typeof admin === "string") return { error: admin };
  const rule = NUMBER_RULES[name];
  if (!rule) return { error: "Unknown setting." };
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < rule.min || n > rule.max) return { error: rule.error };
  await saveSetting(name, n, admin.name);
  await logAdmin(admin.name, "setting", { type: "setting", id: name }, rule.label(n));
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
    .update({ suspended_at: paused ? new Date().toISOString() : null, suspended_reason: paused ? "admin" : null })
    .eq("id", id);
  if (dbError) return { error: dbError.message };
  await logAdmin(admin.name, paused ? "business_paused" : "business_unpaused", { type: "business", id }, `${paused ? "Paused" : "Unpaused"} ${name}`);
  refresh();
  return { ok: true };
}

/**
 * Free time for one business: "give" adds days on top of whatever time it has
 * left (and switches it back on if it was paused for not paying), "date" sets
 * when its free time ends, and "end" ends it now.
 */
export async function setBusinessTrial(
  id: string,
  change: { kind: "give"; days: number; label: string } | { kind: "date"; date: string } | { kind: "end" },
): Promise<AdminResult> {
  const admin = await adminFor("support");
  if (typeof admin === "string") return { error: admin };
  const supabase = createAdminClient();
  const { data: b } = await supabase.from("businesses").select("*").eq("id", id).maybeSingle();
  if (!b) return { error: "That business no longer exists." };

  let endsAt: string;
  let summary: string;
  if (change.kind === "give") {
    const days = Math.round(Number(change.days));
    if (!Number.isFinite(days) || days < 1 || days > 3650) return { error: "Choose between 1 and 3650 days." };
    const from = Math.max(billingState(b).accessUntil.getTime(), Date.now());
    endsAt = new Date(from + days * DAY).toISOString();
    summary = `Gave ${b.name} ${change.label.slice(0, 30)} free`;
  } else if (change.kind === "date") {
    const date = new Date(`${change.date}T23:59:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(change.date) || Number.isNaN(date.getTime())) return { error: "Pick a date." };
    endsAt = date.toISOString();
    summary = `Set ${b.name}'s free time to end on ${change.date}`;
  } else {
    endsAt = new Date().toISOString();
    summary = `Ended ${b.name}'s free time`;
  }
  const unpause = b.suspended_reason === "billing" && new Date(endsAt).getTime() > Date.now();
  const { error: dbError } = await supabase
    .from("businesses")
    .update({ trial_ends_at: endsAt, billing_notice: null, ...(unpause ? { suspended_at: null, suspended_reason: null } : {}) })
    .eq("id", id);
  if (dbError) return { error: dbError.message };
  await logAdmin(admin.name, "business_trial", { type: "business", id }, summary);
  refresh();
  return { ok: true };
}

/** A payment made outside Paystack (e.g. a bank transfer to Spendbox). */
export async function recordManualPayment(id: string, plan: PlanKey, months: number, note: string): Promise<AdminResult> {
  const admin = await adminFor("manager");
  if (typeof admin === "string") return { error: admin };
  if (!(plan in PLANS)) return { error: "Pick a plan." };
  const n = Math.round(Number(months));
  if (!Number.isFinite(n) || n < 1 || n > 24) return { error: "Choose between 1 and 24 months." };
  const supabase = createAdminClient();
  const name = await businessName(id);
  if (!name) return { error: "That business no longer exists." };
  const amount = priceFor(plan, await getSettings()) * n;
  const reference = `manual_${randomUUID().replace(/-/g, "")}`;
  const { error: insertError } = await supabase.from("business_payments").insert({
    business_id: id,
    reference,
    plan,
    months: n,
    amount,
    method: "manual",
    note: note.trim().slice(0, 200) || null,
    recorded_by: admin.name,
  });
  if (insertError) return { error: insertError.message };
  const { error: applyError } = await supabase.rpc("apply_business_payment", { p_reference: reference, p_amount: amount });
  if (applyError) return { error: applyError.message };
  await logAdmin(admin.name, "business_payment", { type: "business", id }, `Recorded ${n} month${n === 1 ? "" : "s"} of ${PLANS[plan].name} for ${name}`);
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

export async function addTeamMember(contact: string, role: Exclude<AdminRole, "owner">): Promise<AdminResult> {
  const admin = await adminFor("owner");
  if (typeof admin === "string") return { error: admin };
  if (!["viewer", "support", "manager"].includes(role)) return { error: "Pick a role." };
  const value = contact.trim().toLowerCase();
  const supabase = createAdminClient();
  let query = supabase.from("profiles").select("id");
  if (value.includes("@")) query = query.eq("email", value);
  else {
    const digits = normalizePhone(DEFAULT_COUNTRY_CODE, value);
    if (!digits) return { error: "Type their email, or a phone number." };
    query = query.eq("phone", digits);
  }
  const { data: profile } = await query.maybeSingle();
  if (!profile) return { error: "No Spendbox account uses that yet. Ask them to sign up first, then add them." };
  const { error: dbError } = await supabase.from("admin_members").upsert({ user_id: profile.id, role, added_by: admin.name });
  if (dbError) return { error: dbError.message };
  await logAdmin(admin.name, "team_added", { type: "customer", id: profile.id }, `Gave ${value} ${role} access`);
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
