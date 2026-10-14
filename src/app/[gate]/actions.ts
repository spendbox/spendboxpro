"use server";

import { revalidatePath } from "next/cache";
import { adminSignIn, adminSignOut, isAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPack } from "../play/pack-actions";

// The owner's dashboard (src/lib/admin.ts): signing in and out, and the few things it can do.

export async function hqSignIn(_: unknown, form: FormData): Promise<{ error: string | null }> {
  const ok = await adminSignIn(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!ok) return { error: "That email and password don't match." };
  revalidatePath("/", "layout");
  return { error: null };
}

export async function hqSignOut() {
  await adminSignOut();
  revalidatePath("/", "layout");
}

/** Ask Paystack again about a starter pack that hasn't arrived (gives the mint if it was paid). */
export async function hqRecheckPack(reference: string): Promise<string> {
  if (!(await isAdmin())) return "Sign in again.";
  const r = await confirmPack(reference);
  revalidatePath("/", "layout");
  return r.ok ? `Paid: the player now has the pack (${Math.round(r.mint ?? 0).toLocaleString("en-GB")} mint).` : (r.error ?? "Not paid.");
}

/** Take a business off the map (it breaks the policy). */
export async function hqTakeDown(leaseId: string): Promise<string> {
  if (!(await isAdmin())) return "Sign in again.";
  const { error } = await createAdminClient().from("business_leases").update({ status: "removed" }).eq("id", leaseId).eq("status", "live");
  revalidatePath("/", "layout");
  return error ? "That didn't work." : "Taken down.";
}

/** Clear a name a player gave a building (rude or misleading): it goes back to having none. */
export async function hqClearBuildingName(buildingId: string): Promise<string> {
  if (!(await isAdmin())) return "Sign in again.";
  const { error } = await createAdminClient().from("property_buildings").update({ name: null }).eq("building_id", buildingId);
  revalidatePath("/", "layout");
  return error ? "That didn't work." : "Cleared.";
}

/** Clear a name a player gave their home: back to "Home" (or "Room" for a free starter room). */
export async function hqClearHomeName(unitId: string): Promise<string> {
  if (!(await isAdmin())) return "Sign in again.";
  const db = createAdminClient();
  const { data } = await db.from("property_units").select("starter").eq("unit_id", unitId).maybeSingle();
  const { error } = await db.from("property_units").update({ label: data?.starter ? "Room" : "Home" }).eq("unit_id", unitId).eq("use", "home");
  revalidatePath("/", "layout");
  return error ? "That didn't work." : "Cleared.";
}

/** Stop a paid billboard ad (it breaks the policy). */
export async function hqStopAd(adId: string): Promise<string> {
  if (!(await isAdmin())) return "Sign in again.";
  const { error } = await createAdminClient().from("ads").update({ status: "held" }).eq("id", adId).eq("status", "live");
  revalidatePath("/", "layout");
  return error ? "That didn't work." : "Stopped.";
}

/** Delete a Town Hall message (rude, spam). */
export async function hqDeleteMessage(id: string): Promise<string> {
  if (!(await isAdmin())) return "Sign in again.";
  const { error } = await createAdminClient().from("chat_messages").delete().eq("id", Number(id)).like("room", "town:%");
  revalidatePath("/", "layout");
  return error ? "That didn't work." : "Deleted.";
}

/** Remove someone's profile photo (they're back to their drawn face). */
export async function hqClearPhoto(userId: string): Promise<string> {
  if (!(await isAdmin())) return "Sign in again.";
  const db = createAdminClient();
  const { data } = await db.from("profiles").select("avatar").eq("id", userId).maybeSingle();
  const avatar = { ...((data?.avatar as Record<string, unknown> | null) ?? {}) };
  const photo = typeof avatar.photo === "string" ? avatar.photo : "";
  delete avatar.photo;
  const { error } = await db.from("profiles").update({ avatar }).eq("id", userId);
  const path = /\/faces\/([0-9a-f-]{36}\/[A-Za-z0-9_-]+\.jpg)$/.exec(photo)?.[1];
  if (!error && path) await db.storage.from("faces").remove([path]).catch(() => {});
  revalidatePath("/", "layout");
  return error ? "That didn't work." : "Removed.";
}
