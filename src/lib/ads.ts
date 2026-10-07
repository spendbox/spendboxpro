import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { reviewAd, type ReviewMediaType } from "@/lib/ad-review";
import {
  adHeldEmail,
  adLiveEmail,
  adRejectedEmail,
  adminAdEmail,
  emailAdmin,
  esc,
  naira,
  sponsorPaidEmail,
  type AdForEmail,
} from "@/lib/ad-emails";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { checkPayment, paystackEnabled, startPayment } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";

// Billboard ads and sponsored prize pools: prices, checkout, payment confirmation and the
// review that puts an ad live. The rules (pacing, view caps, coin rewards) live in the
// database (game-db/010_ads_sponsors.sql).

export const AD_BUCKET = "ads";
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type AdPricing = {
  viewsPerSlot: number;
  slotPriceNgn: number;
  days: number;
  maxSlots: number;
  sponsorCoinsPerNgn: number;
  sponsorMinNgn: number;
  openCoins: number;
};

const DEFAULTS: AdPricing = {
  viewsPerSlot: 1000,
  slotPriceNgn: 5000,
  days: 7,
  maxSlots: 50,
  sponsorCoinsPerNgn: 0.2,
  sponsorMinNgn: 5000,
  openCoins: 2,
};

const KEYS: Record<keyof AdPricing, string> = {
  viewsPerSlot: "ad_views_per_slot",
  slotPriceNgn: "ad_slot_price_ngn",
  days: "ad_days",
  maxSlots: "ad_max_slots",
  sponsorCoinsPerNgn: "sponsor_coins_per_ngn",
  sponsorMinNgn: "sponsor_min_ngn",
  openCoins: "ad_open_coins",
};

/** Prices and limits, from the game_settings table (so the owner can change them). */
export async function adPricing(): Promise<AdPricing> {
  const out = { ...DEFAULTS };
  try {
    const { data } = await createAdminClient().from("game_settings").select("key, value").in("key", Object.values(KEYS));
    for (const [name, key] of Object.entries(KEYS) as [keyof AdPricing, string][]) {
      const row = data?.find((r) => r.key === key);
      const v = Number(row?.value);
      if (row && Number.isFinite(v) && v > 0) out[name] = v;
    }
  } catch {}
  out.maxSlots = Math.min(Math.floor(out.maxSlots), 50);
  return out;
}

/** Public web address of a picture in the `ads` storage bucket. */
export function adImageUrl(path: string) {
  return createAdminClient().storage.from(AD_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * A private, anonymous key for one viewer today: a fingerprint of their IP address and
 * browser, mixed with a secret that changes every day. Used only to stop one person
 * inflating an ad's numbers.
 */
export function viewerKey(request: Request) {
  const h = request.headers;
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || "unknown";
  const ua = (h.get("user-agent") ?? "").slice(0, 300);
  const secret = process.env.CRON_SECRET ?? process.env.SUPABASE_SECRET_KEY ?? "hide-and-seek";
  const today = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${ua}|${today}|${secret}`).digest("hex");
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================ checking what people typed

function clean(v: FormDataEntryValue | null, max: number) {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanLink(raw: string): { ok: true; url: string | null } | { ok: false; error: string } {
  if (!raw) return { ok: true, url: null };
  let text = raw.trim();
  if (!/^[a-z]+:\/\//i.test(text)) text = `https://${text}`;
  try {
    const u = new URL(text);
    if (u.protocol !== "https:") return { ok: false, error: "Your link must start with https:// (a secure website)." };
    if (!u.hostname.includes(".") || u.username || u.password) return { ok: false, error: "That link doesn't look right." };
    const url = u.toString();
    if (url.length > 500) return { ok: false, error: "That link is too long." };
    return { ok: true, url };
  } catch {
    return { ok: false, error: "That link doesn't look right." };
  }
}

/** Checks an uploaded picture by its actual bytes (not just its name). */
async function readImage(
  v: FormDataEntryValue | null,
): Promise<{ ok: true; bytes: Uint8Array; type: ReviewMediaType; ext: string } | { ok: false; error: string } | null> {
  if (!v || typeof v === "string" || v.size === 0) return null;
  if (v.size > MAX_IMAGE_BYTES) return { ok: false, error: "That picture is over 2 MB. Please use a smaller one." };
  const bytes = new Uint8Array(await v.arrayBuffer());
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ok: true, bytes, type: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ok: true, bytes, type: "image/png", ext: "png" };
  if (
    String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" &&
    String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP"
  ) {
    return { ok: true, bytes, type: "image/webp", ext: "webp" };
  }
  return { ok: false, error: "Please upload a JPG, PNG or WebP picture." };
}

async function upload(img: { bytes: Uint8Array; type: string; ext: string }, folder: string) {
  const path = `${folder}/${randomUUID()}.${img.ext}`;
  const { error } = await createAdminClient().storage.from(AD_BUCKET).upload(path, img.bytes, {
    contentType: img.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) {
    console.error("Ad image upload failed", error);
    return null;
  }
  return path;
}

type Contact = { name: string; email: string; phone: string | null };

function readContact(form: FormData): { ok: true; contact: Contact } | { ok: false; error: string } {
  const name = clean(form.get("contact_name"), 80);
  const email = clean(form.get("contact_email"), 120).toLowerCase();
  const phone = clean(form.get("contact_phone"), 30);
  if (name.length < 2) return { ok: false, error: "Please add your name." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please add a working email address (your receipt and reports go there)." };
  if (phone && !/^[+\d][\d\s()-]{6,}$/.test(phone)) return { ok: false, error: "That phone number doesn't look right." };
  return { ok: true, contact: { name, email, phone: phone || null } };
}

/** Stops one person filling the database with unpaid checkouts. */
async function tooManyCheckouts(table: "ads" | "pool_sponsors", email: string) {
  const db = createAdminClient();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const [mine, all] = await Promise.all([
    db.from(table).select("id", { count: "exact", head: true }).eq("contact_email", email).eq("status", "pending_payment").gt("created_at", since),
    db.from(table).select("id", { count: "exact", head: true }).eq("status", "pending_payment").gt("created_at", since),
  ]);
  return (mine.count ?? 0) >= 6 || (all.count ?? 0) >= 2000;
}

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

const NOT_ON = "Payments aren't switched on yet. Please check back soon.";

// ============================================================ checkout

export async function startAdCheckout(form: FormData): Promise<CheckoutResult> {
  if (!paystackEnabled()) return { ok: false, error: NOT_ON };
  const pricing = await adPricing();
  const brand = clean(form.get("brand"), 61);
  const headline = clean(form.get("headline"), 61);
  const slots = Math.floor(Number(form.get("slots")));
  if (brand.length < 2 || brand.length > 60) return { ok: false, error: "Please add your brand name (up to 60 characters)." };
  if (headline.length < 2 || headline.length > 60) return { ok: false, error: "Please add a headline (up to 60 characters)." };
  if (!Number.isFinite(slots) || slots < 1 || slots > pricing.maxSlots) {
    return { ok: false, error: `Pick between 1 and ${pricing.maxSlots} slots.` };
  }
  const link = cleanLink(clean(form.get("link"), 600));
  if (!link.ok) return link;
  if (form.get("policy") !== "yes") return { ok: false, error: "Please confirm you've read the advertising policy." };
  const c = readContact(form);
  if (!c.ok) return c;
  const img = await readImage(form.get("image"));
  if (!img) return { ok: false, error: "Please add a picture for your billboard." };
  if (!img.ok) return img;
  if (await tooManyCheckouts("ads", c.contact.email)) {
    return { ok: false, error: "You've started a lot of checkouts. Please finish one, or try again in an hour." };
  }

  const path = await upload(img, "billboards");
  if (!path) return { ok: false, error: "We couldn't save your picture. Please try again." };

  const id = randomUUID();
  const reference = `ad-${id}`;
  const amountKobo = Math.round(slots * pricing.slotPriceNgn * 100);
  const db = createAdminClient();
  const { error } = await db.from("ads").insert({
    id,
    brand,
    headline,
    link_url: link.url,
    image_path: path,
    contact_name: c.contact.name,
    contact_email: c.contact.email,
    contact_phone: c.contact.phone,
    slots,
    views_bought: Math.round(slots * pricing.viewsPerSlot),
    amount_kobo: amountKobo,
    paystack_reference: reference,
    policy_accepted_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Saving ad failed", error);
    await db.storage.from(AD_BUCKET).remove([path]);
    return { ok: false, error: "Something went wrong saving your ad. Please try again." };
  }
  return startPayment({
    email: c.contact.email,
    amountKobo,
    reference,
    callbackUrl: `${siteUrl()}/advertise/done`,
    metadata: { kind: "ad", id, brand, slots },
  });
}

export async function startSponsorCheckout(form: FormData): Promise<CheckoutResult> {
  if (!paystackEnabled()) return { ok: false, error: NOT_ON };
  const pricing = await adPricing();
  const brand = clean(form.get("brand"), 61);
  const amountNgn = Math.floor(Number(String(form.get("amount") ?? "").replace(/[,\s₦]/g, "")));
  if (brand.length < 2 || brand.length > 60) return { ok: false, error: "Please add your brand name (up to 60 characters)." };
  if (!Number.isFinite(amountNgn) || amountNgn < pricing.sponsorMinNgn) {
    return { ok: false, error: `The smallest sponsorship is ₦${pricing.sponsorMinNgn.toLocaleString("en-NG")}.` };
  }
  if (amountNgn > 10_000_000) return { ok: false, error: "For sponsorships over ₦10,000,000, please contact us." };
  if (form.get("policy") !== "yes") return { ok: false, error: "Please confirm you've read the advertising policy." };
  const c = readContact(form);
  if (!c.ok) return c;
  const img = await readImage(form.get("logo"));
  if (img && !img.ok) return img;
  if (await tooManyCheckouts("pool_sponsors", c.contact.email)) {
    return { ok: false, error: "You've started a lot of checkouts. Please finish one, or try again in an hour." };
  }

  let logoPath: string | null = null;
  if (img) {
    logoPath = await upload(img, "logos");
    if (!logoPath) return { ok: false, error: "We couldn't save your logo. Please try again." };
  }

  const id = randomUUID();
  const reference = `sp-${id}`;
  const amountKobo = amountNgn * 100;
  const coins = Math.floor(amountNgn * pricing.sponsorCoinsPerNgn);
  if (coins < 1) return { ok: false, error: "That amount is too small." };
  const db = createAdminClient();
  const { error } = await db.from("pool_sponsors").insert({
    id,
    brand,
    logo_path: logoPath,
    logo_url: logoPath ? adImageUrl(logoPath) : null,
    coins,
    amount_kobo: amountKobo,
    paystack_reference: reference,
    contact_name: c.contact.name,
    contact_email: c.contact.email,
    contact_phone: c.contact.phone,
  });
  if (error) {
    console.error("Saving sponsor failed", error);
    if (logoPath) await db.storage.from(AD_BUCKET).remove([logoPath]);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  return startPayment({
    email: c.contact.email,
    amountKobo,
    reference,
    callbackUrl: `${siteUrl()}/advertise/done`,
    metadata: { kind: "sponsor", id, brand, coins },
  });
}

// ============================================================ after payment

export type PaymentOutcome =
  | { kind: "off" }
  | { kind: "unknown" }
  | {
      kind: "ad";
      state: "not_paid" | "reviewing" | "live" | "rejected" | "held" | "finished";
      brand: string;
      headline: string;
      image: string;
      reason: string | null;
      views: number;
      endsAt: string | null;
      email: string;
    }
  | {
      kind: "sponsor";
      state: "not_paid" | "queued" | "applied";
      brand: string;
      coins: number;
      roundId: number | null;
      queuedAhead: number;
      email: string;
    };

const REF_RE = /^(ad|sp)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Checks a payment with Paystack and acts on it: an ad is reviewed and goes live (or not); a
 * sponsor's coins go into a pool (or wait for the next round). Used by both the page people
 * come back to after paying and the Paystack webhook, and safe to run any number of times.
 */
export async function confirmPayment(reference: string): Promise<PaymentOutcome> {
  if (!paystackEnabled()) return { kind: "off" };
  if (!REF_RE.test(reference)) return { kind: "unknown" };
  const db = createAdminClient();
  const payment = await checkPayment(reference);
  const paid = payment?.paid === true;

  if (reference.startsWith("ad-")) {
    if (paid) {
      const res = await db.rpc("ad_paid", { p_reference: reference, p_amount_kobo: payment.amountKobo });
      const r = res.data as { found?: boolean; id?: string; claimed?: boolean } | null;
      if (res.error) console.error("ad_paid failed", res.error);
      if (r?.found && r.claimed && r.id) await runReview(r.id);
    }
    const { data: ad } = await db
      .from("ads")
      .select("brand, headline, image_path, status, review_notes, views_bought, ends_at, contact_email")
      .eq("paystack_reference", reference)
      .maybeSingle();
    if (!ad) return { kind: "unknown" };
    const status = ad.status as string;
    const state =
      status === "pending_payment" ? "not_paid" : status === "paid" ? "reviewing" : (status as "reviewing" | "live" | "rejected" | "held" | "finished");
    return {
      kind: "ad",
      state,
      brand: ad.brand as string,
      headline: ad.headline as string,
      image: adImageUrl(ad.image_path as string),
      reason: status === "rejected" ? ((ad.review_notes as string | null) ?? null) : null,
      views: Number(ad.views_bought),
      endsAt: (ad.ends_at as string | null) ?? null,
      email: ad.contact_email as string,
    };
  }

  let queuedAhead = 0;
  if (paid) {
    const res = await db.rpc("sponsor_paid", { p_reference: reference, p_amount_kobo: payment.amountKobo });
    if (res.error) console.error("sponsor_paid failed", res.error);
    const r = res.data as { found?: boolean; status?: string; newly_paid?: boolean; queued_ahead?: number } | null;
    queuedAhead = Number(r?.queued_ahead ?? 0);
    if (r?.found && r.newly_paid) {
      const { data: s } = await db
        .from("pool_sponsors")
        .select("brand, contact_name, contact_email, coins, amount_kobo, paystack_reference")
        .eq("paystack_reference", reference)
        .maybeSingle();
      if (s) {
        const email = sponsorPaidEmail(
          { ...(s as { brand: string; contact_name: string; contact_email: string; paystack_reference: string }), coins: Number(s.coins), amount_kobo: Number(s.amount_kobo) },
          r.status === "applied",
        );
        await sendEmail({ to: s.contact_email as string, ...email }).catch(() => {});
        const line = `${s.brand} paid ${naira(Number(s.amount_kobo))} for ${Number(s.coins)} coins in a prize pool (${
          r.status === "applied" ? "added to the current round" : "waiting for the next round"
        }). Contact: ${s.contact_name} <${s.contact_email}>.`;
        await emailAdmin({ subject: `New prize pool sponsor: ${s.brand}`, text: line, html: `<p>${esc(line)}</p>` });
      }
    }
  }
  const { data: s } = await db
    .from("pool_sponsors")
    .select("brand, status, coins, round_id, contact_email")
    .eq("paystack_reference", reference)
    .maybeSingle();
  if (!s) return { kind: "unknown" };
  const st = s.status as string;
  return {
    kind: "sponsor",
    state: st === "applied" ? "applied" : st === "queued" ? "queued" : "not_paid",
    brand: s.brand as string,
    coins: Number(s.coins),
    roundId: (s.round_id as number | null) ?? null,
    queuedAhead,
    email: s.contact_email as string,
  };
}

const AD_EMAIL_FIELDS =
  "id, brand, headline, link_url, image_path, contact_name, contact_email, slots, views_bought, views_delivered, opens, clicks, amount_kobo, paystack_reference, starts_at, ends_at, status";

/** Runs the review for a paid ad (the caller has claimed it), saves the verdict and sends the emails. */
async function runReview(adId: string) {
  const db = createAdminClient();
  const { data: ad } = await db.from("ads").select(AD_EMAIL_FIELDS).eq("id", adId).maybeSingle();
  if (!ad) return;

  let result: Awaited<ReturnType<typeof reviewAd>>;
  const file = await db.storage.from(AD_BUCKET).download(ad.image_path as string);
  if (file.error || !file.data) {
    result = { verdict: "unavailable", reason: "We couldn't open the picture to check it." };
  } else {
    const path = ad.image_path as string;
    const mediaType: ReviewMediaType = path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg";
    const base64 = Buffer.from(await file.data.arrayBuffer()).toString("base64");
    result = await reviewAd({
      brand: ad.brand as string,
      headline: ad.headline as string,
      link: (ad.link_url as string | null) ?? null,
      imageBase64: base64,
      mediaType,
    });
  }

  const status = result.verdict === "approved" ? "live" : result.verdict === "rejected" ? "rejected" : "held";
  const notes = result.verdict === "unavailable" ? `Held for a manual check: ${result.reason}` : result.reason;
  const { error } = await db.rpc("ad_set_review", { p_ad: adId, p_status: status, p_notes: notes });
  if (error) {
    console.error("Saving the ad review failed", error);
    return;
  }
  const { data: fresh } = await db.from("ads").select(AD_EMAIL_FIELDS).eq("id", adId).maybeSingle();
  const a = { ...(fresh ?? ad) } as unknown as AdForEmail;
  a.amount_kobo = Number(a.amount_kobo);
  const to = a.contact_email;
  if (status === "live") {
    await sendEmail({ to, ...adLiveEmail(a) }).catch(() => {});
  } else if (status === "rejected") {
    await sendEmail({ to, ...adRejectedEmail(a, result.reason) }).catch(() => {});
    await emailAdmin(adminAdEmail(a, "rejected", result.reason));
  } else {
    await sendEmail({ to, ...adHeldEmail(a) }).catch(() => {});
    await emailAdmin(adminAdEmail(a, "held", result.reason));
  }
}
