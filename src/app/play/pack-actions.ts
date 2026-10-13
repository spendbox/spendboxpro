"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/env";
import { currentUserId } from "@/lib/game";
import { checkPayment, paystackEnabled, startPayment } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS } from "@/lib/world";
import { shopKind } from "@/lib/world/items";
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
    // Back to the very address the player paid from (so their sign-in is still there), through a
    // page that checks the payment with Paystack before anything else, signed in or not.
    callbackUrl: `${await returnOrigin()}/api/paystack/return?ref=${reference}`,
    metadata: { kind: "starter_pack", pack: pack.id },
  });
  return started.ok ? { ok: true, url: started.url } : started;
}

/** The address this request came in on ("https://newtown.world"), or the site's own address. */
async function returnOrigin() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return siteUrl();
  const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() || (host.startsWith("localhost") ? "http" : "https");
  return `${proto === "http" ? "http" : "https"}://${host}`;
}

/**
 * Packs this player paid for that never arrived (they closed Paystack before it sent them back,
 * and the webhook didn't reach us): checked again with Paystack, and given when they went through.
 * Called each time the game opens.
 */
export async function checkMyPacks(): Promise<{ ok: boolean; mint?: number }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false };
  // A pack already in whose gifts haven't been given yet (bought before there were any): now.
  await givePackPerks(userId).catch((e) => console.error("Pack perks failed", e));
  if (!paystackEnabled()) return { ok: false };
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

/**
 * A paid pack's gifts (docs/PACKS.md): the things it comes with (a phone, a car...) put in your
 * Items, and the Rich Family badge. Once only (starter_payments.perks_at, game-db/069). The
 * furnished home needs nothing here: the home planner gives it when there's no plan yet.
 */
async function givePackPerks(userId: string) {
  const db = createAdminClient();
  const { data, error } = await db.from("starter_payments").select("reference, pack, region").eq("user_id", userId).eq("status", "paid").is("perks_at", null).limit(1);
  // Before part 69 is run (no perks_at): nothing yet.
  if (error || !data?.length) return;
  const row = data[0] as { reference: string; pack: string; region: string };
  const pack = packById(row.pack);
  if (!pack) return;
  // Claim it first, so two tabs opening at once can't both give the gifts.
  const { data: claimed } = await db.from("starter_payments").update({ perks_at: new Date().toISOString() }).eq("reference", row.reference).is("perks_at", null).select("reference");
  if (!claimed?.length) return;
  const perMint = REGIONS[row.region]?.prices.perMint ?? 1_500;
  const items = pack.gifts
    .map((id) => shopKind(id))
    .filter((k): k is NonNullable<ReturnType<typeof shopKind>> => !!k)
    .map((k) => ({ owner: userId, kind: k.id, name: k.name, category: k.category, base_value: Math.round((k.price / perMint) * 100) / 100, effect: k.effect, how: "gift" }));
  if (items.length) {
    const { error: e } = await db.from("items").insert(items);
    if (e) console.error("Pack gifts failed", row.reference, e.message);
  }
  if (pack.id === "odogwu") await db.from("badges").insert({ user_id: userId, badge: "rich_family", detail: "Rich Family pack" });
  const names = items.map((i) => i.name);
  if (names.length)
    await db.rpc("notify", {
      p_user: userId,
      p_round: null,
      p_kind: "gift",
      p_body: `Your ${pack.label} pack came with: ${names.join(", ")}. They're in your Items.${pack.furnished ? " Your first home comes furnished too." : ""}`,
    });
}
