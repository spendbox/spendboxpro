"use server";

import { currentUserId } from "@/lib/game";
import { checkPayment, paystackEnabled } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import { packById } from "@/lib/world/packs";
import { myTopUps, startTopUp } from "./topup-actions";
import { givePackPerks } from "@/lib/world/pack-perks";

// Starter packs (docs/PACKS.md; the database part is game-db/042_starter_packs.sql): pay once through
// Paystack to start a life with more mint. The mint only arrives once Paystack itself says the
// payment went through (here when the player comes back, or from the webhook, whichever is first).

export type PackStart = { ok: true; url?: string; coins?: number } | { ok: false; error: string };

/**
 * Start paying for a pack: returns the Paystack page to go to. Packs are paid like top-ups now
 * (src/app/play/topup-actions.ts, game-db/090); the Wallet offers them with bank transfer too.
 */
export async function startPack(packId: string, region: string): Promise<PackStart> {
  const pack = packById(packId);
  if (!pack || pack.naira <= 0) return { ok: false, error: "That pack isn't on offer." };
  const r = await startTopUp(`pack_${pack.id}`, region);
  return r.ok ? { ok: true, url: r.url } : r;
}

/**
 * Packs this player paid for that never arrived (they closed Paystack before it sent them back,
 * and the webhook didn't reach us): checked again with Paystack, and given when they went through.
 * Called each time the game opens.
 */
export async function checkMyPacks(): Promise<{ ok: boolean; mint?: number; topup?: boolean }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false };
  // A pack already in whose gifts haven't been given yet (bought before there were any): now.
  await givePackPerks(userId).catch((e) => console.error("Pack perks failed", e));
  if (!paystackEnabled()) return { ok: false };
  // Top-ups and packs (paid like top-ups) still waiting from the last week: asked again, and given if paid.
  const t = await myTopUps().catch(() => null);
  if (t && t.credited > 0) return { ok: true, mint: t.credited, topup: true };
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await createAdminClient()
    .from("starter_payments")
    .select("reference")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5);
  for (const row of data ?? []) {
    const r = await confirmPack(String(row.reference));
    if (r.ok) return r;
  }
  return { ok: false };
}

/** Where a pack was bought for (the map to go back to). */
export async function packRegion(reference: string): Promise<string | null> {
  if (!/^pk-[a-f0-9]{20}$/.test(reference ?? "")) return null;
  const { data } = await createAdminClient().from("starter_payments").select("region").eq("reference", reference).maybeSingle();
  return data?.region ? String(data.region) : null;
}

/** Check a pack payment with Paystack and, when it went through, give the pack (once). */
export async function confirmPack(reference: string): Promise<{ ok: boolean; mint?: number; error?: string }> {
  if (!/^pk-[a-f0-9]{20}$/.test(reference ?? "")) return { ok: false, error: "Unknown payment." };
  const payment = await checkPayment(reference);
  if (!payment?.paid) return { ok: false, error: "That payment hasn't gone through." };
  const { data, error } = await createAdminClient().rpc("life_pack_paid", { p_reference: reference, p_kobo: payment.amountKobo });
  if (error) {
    console.error("life_pack_paid failed", reference, error.message);
    return { ok: false, error: "That didn't work. Try again." };
  }
  const d = (data ?? {}) as { found?: boolean; mint?: number; user?: string };
  if (d.found) {
    const userId = await currentUserId().catch(() => null);
    if (userId) await givePackPerks(userId).catch((e) => console.error("Pack perks failed", e));
  }
  return d.found ? { ok: true, mint: Number(d.mint ?? 0) } : { ok: false, error: "Unknown payment." };
}
