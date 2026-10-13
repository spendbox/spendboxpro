"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/env";
import { currentUserId } from "@/lib/game";
import { checkPayment, paystackEnabled, startPayment } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";
import { topUpById } from "@/lib/world/topups";

// Top-ups (docs/MONEY.md; the database part is game-db/076_topups.sql): pay through Paystack for
// game money, any time. The money only arrives once Paystack itself says the payment went through.

/** Start paying for a top-up: the Paystack pop-up's access code (in the page), or its page as a fallback. */
export async function startTopUp(optionId: string, region: string): Promise<{ ok: true; url: string; accessCode?: string; reference: string } | { ok: false; error: string }> {
  const t = topUpById(optionId);
  if (!t) return { ok: false, error: "That top-up isn't on offer." };
  if (!REGIONS[region]) return { ok: false, error: "Unknown place." };
  if (!paystackEnabled()) return { ok: false, error: "Payments aren't switched on yet." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const db = createAdminClient();
  const { data: user } = await db.auth.admin.getUserById(userId);
  const email = user?.user?.email;
  if (!email) return { ok: false, error: "Your account needs an email address to pay." };
  const reference = `tu-${randomBytes(10).toString("hex")}`;
  const kobo = t.naira * 100;
  const mint = Math.round((t.game / REGIONS[region].prices.perMint) * 100) / 100;
  const { error } = await db.rpc("topup_start", { p_user: userId, p_reference: reference, p_region: region, p_option: t.id, p_mint: mint, p_kobo: kobo });
  if (error) return { ok: false, error: /does not exist|topup_start/.test(error.message) ? "Top-ups are switched on soon." : "That didn't work. Try again." };
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() || (host.startsWith("localhost") ? "http" : "https");
  const origin = /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `${proto === "http" ? "http" : "https"}://${host}` : siteUrl();
  const started = await startPayment({ email, amountKobo: kobo, reference, callbackUrl: `${origin}/api/paystack/return?ref=${reference}`, metadata: { kind: "topup", option: t.id } });
  return started.ok ? { ok: true, url: started.url, accessCode: started.accessCode, reference } : started;
}

/** Check a top-up with Paystack and, when it went through, give the money (once). */
export async function confirmTopUp(reference: string): Promise<{ ok: boolean; mint?: number; doubled?: boolean; region?: string; error?: string }> {
  if (!/^tu-[a-f0-9]{20}$/.test(reference ?? "")) return { ok: false, error: "Unknown payment." };
  const payment = await checkPayment(reference);
  if (!payment?.paid) return { ok: false, error: "That payment hasn't gone through." };
  const db = createAdminClient();
  const { data, error } = await db.rpc("topup_paid", { p_reference: reference, p_kobo: payment.amountKobo });
  if (error) {
    console.error("topup_paid failed", reference, error.message);
    return { ok: false, error: "That didn't work. Try again." };
  }
  const d = (data ?? {}) as { found?: boolean; mint?: number; doubled?: boolean; short?: boolean };
  if (!d.found) return { ok: false, error: "Unknown payment." };
  if (d.short) return { ok: false, error: "That payment was less than the top-up." };
  const { data: row } = await db.from("topups").select("region").eq("reference", reference).maybeSingle();
  return { ok: true, mint: Number(d.mint ?? 0), doubled: !!d.doubled, region: row?.region ? String(row.region) : undefined };
}

/** Has this player topped up before (the first is doubled)? */
export async function toppedUpBefore(): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) return false;
  const { count, error } = await createAdminClient().from("topups").select("reference", { count: "exact", head: true }).eq("user_id", userId).eq("status", "paid");
  return !error && (count ?? 0) > 0;
}
