"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/env";
import { currentUserId } from "@/lib/game";
import { checkPayment, paystackEnabled, startPayment, startTransfer, type TransferAccount } from "@/lib/paystack";
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
  const made = await newTopUp(userId, t.id, t.naira, t.game, region);
  if (!made.ok) return made;
  const { reference, kobo } = made;
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() || (host.startsWith("localhost") ? "http" : "https");
  const origin = /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `${proto === "http" ? "http" : "https"}://${host}` : siteUrl();
  const started = await startPayment({ email, amountKobo: kobo, reference, callbackUrl: `${origin}/api/paystack/return?ref=${reference}`, metadata: { kind: "topup", option: t.id } });
  return started.ok ? { ok: true, url: started.url, accessCode: started.accessCode, reference } : started;
}

/** A top-up's row, before paying: its reference and amount. */
async function newTopUp(userId: string, option: string, naira: number, game: number, region: string): Promise<{ ok: true; reference: string; kobo: number } | { ok: false; error: string }> {
  const reference = `tu-${randomBytes(10).toString("hex")}`;
  const kobo = naira * 100;
  const mint = Math.round((game / REGIONS[region].prices.perMint) * 100) / 100;
  const { error } = await createAdminClient().rpc("topup_start", { p_user: userId, p_reference: reference, p_region: region, p_option: option, p_mint: mint, p_kobo: kobo });
  if (error) return { ok: false, error: /does not exist|topup_start/.test(error.message) ? "Top-ups are switched on soon." : "That didn't work. Try again." };
  return { ok: true, reference, kobo };
}

/**
 * Pay by bank transfer, right in the game: Paystack makes an account for this one payment and we
 * show it. The money arrives when the transfer comes in (the Wallet checks, and Paystack tells us).
 */
export async function startTransferTopUp(optionId: string, region: string): Promise<{ ok: true; reference: string; account: TransferAccount } | { ok: false; error: string }> {
  const t = topUpById(optionId);
  if (!t) return { ok: false, error: "That top-up isn't on offer." };
  if (!REGIONS[region]) return { ok: false, error: "Unknown place." };
  if (!paystackEnabled()) return { ok: false, error: "Payments aren't switched on yet." };
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { data: user } = await createAdminClient().auth.admin.getUserById(userId);
  const email = user?.user?.email;
  if (!email) return { ok: false, error: "Your account needs an email address to pay." };
  const made = await newTopUp(userId, t.id, t.naira, t.game, region);
  if (!made.ok) return made;
  const r = await startTransfer({ email, amountKobo: made.kobo, reference: made.reference, metadata: { kind: "topup", option: t.id } });
  return r.ok ? { ok: true, reference: made.reference, account: r.account } : r;
}

export type TopUpRow = { reference: string; naira: number; mint: number; status: "paid" | "waiting" | "failed"; doubled: boolean; at: string; paidAt: string | null };

/**
 * Your payments, newest first. Any not yet paid from the last week is checked with Paystack again
 * first, and given if it went through (so a payment is never lost, even if the pop-up was closed
 * or Paystack's message never reached us). `credited`: mint given just now.
 */
export async function myTopUps(): Promise<{ list: TopUpRow[]; credited: number } | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const db = createAdminClient();
  const { data, error } = await db
    .from("topups")
    .select("reference, amount_kobo, mint, status, doubled, created_at, paid_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return null;
  let credited = 0;
  const gone = new Set<string>();
  const weekAgo = Date.now() - 7 * 86_400_000;
  type Row = { reference: string; amount_kobo: number; mint: number; status: string; doubled: boolean; created_at: string; paid_at: string | null };
  const rows = (data ?? []) as Row[];
  await Promise.all(
    rows
      .filter((r) => r.status !== "paid" && Date.parse(r.created_at) > weekAgo)
      .slice(0, 10)
      .map(async (r) => {
        const p = await checkPayment(r.reference);
        if (p?.paid) {
          const c = await confirmTopUp(r.reference);
          if (c.ok) {
            if (c.fresh) credited += c.mint ?? 0;
            r.status = "paid";
            r.doubled = !!c.doubled;
            r.paid_at = new Date().toISOString();
          }
        } else if (p && ["failed", "abandoned", "reversed"].includes(p.status) && Date.parse(r.created_at) < Date.now() - 3_600_000) gone.add(r.reference);
      }),
  );
  return {
    credited: Math.round(credited * 100) / 100,
    list: rows.map((r) => ({
      reference: r.reference,
      naira: Math.round(Number(r.amount_kobo) / 100),
      mint: Number(r.mint) * (r.doubled ? 2 : 1),
      status: r.status === "paid" ? "paid" : gone.has(r.reference) || Date.parse(r.created_at) <= weekAgo ? "failed" : "waiting",
      doubled: !!r.doubled,
      at: r.created_at,
      paidAt: r.paid_at,
    })),
  };
}

/** Check a top-up with Paystack and, when it went through, give the money (once). */
export async function confirmTopUp(reference: string): Promise<{ ok: boolean; mint?: number; doubled?: boolean; region?: string; error?: string; fresh?: boolean }> {
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
  // fresh: given just now (not already given by the webhook or another check).
  return { ok: true, mint: Number(d.mint ?? 0), doubled: !!d.doubled, region: row?.region ? String(row.region) : undefined, fresh: (d as { new?: boolean }).new === true };
}

/** Has this player topped up before (the first is doubled)? */
export async function toppedUpBefore(): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) return false;
  const { count, error } = await createAdminClient().from("topups").select("reference", { count: "exact", head: true }).eq("user_id", userId).eq("status", "paid");
  return !error && (count ?? 0) > 0;
}
