"use server";

import { revalidatePath } from "next/cache";
import { adminSignIn, adminSignOut, isAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";
import { confirmPack } from "../play/pack-actions";
import { confirmTopUp } from "../play/topup-actions";

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

/** Ask Paystack again about a top-up or starter pack still waiting (gives the money if it was paid). */
export async function hqRecheckTopUp(reference: string): Promise<string> {
  if (!(await isAdmin())) return "Sign in again.";
  const r = await confirmTopUp(reference);
  revalidatePath("/", "layout");
  return r.ok ? `Paid: credited${r.fresh ? " now" : " already"} (${Math.round(r.mint ?? 0).toLocaleString("en-GB")} mint).` : (r.error ?? "Not paid.");
}

export type CreditState = { ok: boolean; text: string } | null;

/**
 * Give a player Newtown money by hand: who (their name in the game, or their email), how much in
 * naira (game money), and why (they're told). Recorded in admin_credits (game-db/090).
 */
export async function hqCredit(_: CreditState, form: FormData): Promise<CreditState> {
  if (!(await isAdmin())) return { ok: false, text: "Sign in again." };
  const who = String(form.get("who") ?? "").trim();
  const naira = Number(String(form.get("naira") ?? "").replace(/[₦,\s]/g, ""));
  const note = String(form.get("note") ?? "").trim();
  if (!who) return { ok: false, text: "Who? Their name in the game, or their email." };
  if (!Number.isFinite(naira) || naira <= 0) return { ok: false, text: "How much? A number of naira, more than 0." };
  if (!note) return { ok: false, text: "Say why (the player sees it)." };
  const perMint = REGIONS.lagos?.prices.perMint ?? 1_500;
  const mint = Math.round((naira / perMint) * 100) / 100;
  const db = createAdminClient();
  const { data: found, error: findError } = await db.rpc("admin_find_player", { p_who: who });
  if (findError) return { ok: false, text: /does not exist/.test(findError.message) ? "Run game-db/090 in Supabase first." : "That didn't work." };
  const player = ((found ?? []) as { id: string; username: string | null }[])[0];
  if (!player) return { ok: false, text: `No player called "${who}".` };
  const { data, error } = await db.rpc("admin_credit", { p_user: player.id, p_mint: mint, p_note: note, p_by: (process.env.ADMIN_EMAIL ?? "").split(",")[0].trim() || null });
  if (error) return { ok: false, text: error.message.includes("bad_amount") ? "That amount is too big." : "That didn't work." };
  revalidatePath("/", "layout");
  const balance = Math.round(Number(data ?? 0) * perMint);
  return { ok: true, text: `Credited ₦${Math.round(naira).toLocaleString("en-GB")} to ${player.username ?? who}. They now have ₦${balance.toLocaleString("en-GB")}.` };
}
