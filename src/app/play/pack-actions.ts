"use server";

import { randomBytes } from "node:crypto";
import { siteUrl } from "@/lib/env";
import { currentUserId } from "@/lib/game";
import { checkPayment, paystackEnabled, startPayment } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";
import { packById } from "@/lib/world/packs";

// Starter packs (docs/PACKS.md; the database part is game-db/042_starter_packs.sql): pay once through
// Paystack to start a life with more mint. The mint only arrives once Paystack itself says the
// payment went through (here when the player comes back, or from the webhook, whichever is first).

export type PackStart = { ok: true; url?: string; coins?: number } | { ok: false; error: string };

/** Start paying for a pack: returns the Paystack page to go to. */
export async function startPack(packId: string, region: string): Promise<PackStart> {
  const pack = packById(packId);
  if (!pack || pack.naira <= 0) return { ok: false, error: "That pack isn't on offer." };
  if (!REGIONS[region]) return { ok: false, error: "Unknown place." };
  if (!paystackEnabled()) return { ok: false, error: "Payments aren't switched on yet." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const db = createAdminClient();
  const { data: user } = await db.auth.admin.getUserById(userId);
  const email = user?.user?.email;
  if (!email) return { ok: false, error: "Your account needs an email address to pay." };
  const reference = `pk-${randomBytes(10).toString("hex")}`;
  const kobo = pack.naira * 100;
  const { error } = await db.rpc("life_pack_start", { p_user: userId, p_reference: reference, p_region: region, p_pack: pack.id, p_mint: pack.mint, p_kobo: kobo });
  if (error) {
    const code = error.message.split(":")[0];
    return { ok: false, error: code === "too_late" ? "Packs are for starting out, before your first home." : code === "already" ? "You've had a pack already." : "That didn't work. Try again." };
  }
  const started = await startPayment({
    email,
    amountKobo: kobo,
    reference,
    callbackUrl: `${siteUrl()}/play?world=${encodeURIComponent(region)}&pack=${reference}`,
    metadata: { kind: "starter_pack", pack: pack.id },
  });
  return started.ok ? { ok: true, url: started.url } : started;
}

/** Check a pack payment with Paystack and, when it went through, give the pack (once). */
export async function confirmPack(reference: string): Promise<{ ok: boolean; mint?: number; error?: string }> {
  if (!/^pk-[a-f0-9]{20}$/.test(reference ?? "")) return { ok: false, error: "Unknown payment." };
  const payment = await checkPayment(reference);
  if (!payment?.paid) return { ok: false, error: "That payment hasn't gone through." };
  const { data, error } = await createAdminClient().rpc("life_pack_paid", { p_reference: reference, p_kobo: payment.amountKobo });
  if (error) return { ok: false, error: "That didn't work. Try again." };
  const d = (data ?? {}) as { found?: boolean; mint?: number };
  return d.found ? { ok: true, mint: Number(d.mint ?? 0) } : { ok: false, error: "Unknown payment." };
}
