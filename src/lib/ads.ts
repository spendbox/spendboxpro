import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { adLiveEmail, adminNewAdEmail, emailAdmin, esc, naira, sponsorPaidEmail, topUpEmail, type AdForEmail } from "@/lib/ad-emails";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { checkPayment, paystackEnabled, startPayment } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";

// Billboard ads: prices, checkout, payment confirmation, and what advertisers can change.
// The rules (coin pools, rewards, daily limits, pacing) live in the database
// (game-db/013_ads_v2.sql, on top of 010_ads_sponsors.sql).
//
// How an ad works: the advertiser pays a weekly budget for 1–8 weeks. That loads the ad with a
// pool of coins (1 coin per ₦5). Opening an ad from a billboard is free. Each signed-in player
// who then taps the ad's button gets 5 coins from the pool (up to 5 ads a day, once per ad;
// game-db/022_pool_and_ads.sql). Taps by anyone else are free.
// The ad stops when the pool runs out or its weeks are over. It goes live as soon as it's paid.

export const AD_BUCKET = "ads";
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** The advertising policy, in plain words. Shown on /advertise/policy. */
export const AD_POLICY = {
  notAllowed: [
    "Adult or sexual content, nudity, or sexually suggestive pictures",
    "Gambling, betting, sports betting, lotteries or casinos",
    "Weapons, guns, ammunition or explosives",
    "Drugs, including recreational drugs and unlicensed medicines",
    "Tobacco, cigarettes, vaping or e-cigarettes",
    "Hate, harassment, or attacks on anyone for their tribe, religion, race, gender, disability or who they love",
    "Violence, gore, or anything shocking or frightening",
    "Scams, get-rich-quick schemes, fake giveaways, or claims that aren't true (including miracle cures and guaranteed returns)",
    "Other people's brands, logos or trademarks you don't have permission to use",
    "Political ads: parties, candidates, elections or campaigns",
    "Anything illegal in Nigeria",
  ],
  rules: [
    "The picture must be yours, or one you have the right to use.",
    "The headline and picture must clearly show who is advertising (your brand).",
    "Links must go to a safe, working website that matches the ad.",
    "Newtown is for adults (18+), but ads must still be suitable for a general audience.",
  ],
};

export type AdPricing = {
  /** Coins loaded into the pool per naira (0.2 = 1 coin per ₦5). */
  coinsPerNgn: number;
  /** Coins a player gets for tapping an ad (taken from the pool). */
  viewReward: number;
  /** Paid taps per player per day. */
  rewardsPerDay: number;
  minWeeklyNgn: number;
  maxWeeks: number;
  maxNgn: number;
};

const DEFAULTS: AdPricing = {
  coinsPerNgn: 0.2,
  viewReward: 5,
  rewardsPerDay: 5,
  minWeeklyNgn: 5000,
  maxWeeks: 8,
  maxNgn: 10_000_000,
};

const KEYS: Record<keyof AdPricing, string> = {
  coinsPerNgn: "ad_coins_per_ngn",
  viewReward: "ad_view_reward",
  rewardsPerDay: "ad_rewards_per_day",
  minWeeklyNgn: "ad_min_weekly_ngn",
  maxWeeks: "ad_max_weeks",
  maxNgn: "ad_max_ngn",
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
  out.maxWeeks = Math.max(1, Math.min(Math.floor(out.maxWeeks), 52));
  return out;
}

/** Coins a payment loads into the pool, and how many paid taps that is. */
export function poolFor(ngn: number, p: Pick<AdPricing, "coinsPerNgn" | "viewReward">) {
  const coins = Math.max(0, Math.floor(ngn * p.coinsPerNgn));
  return { coins, taps: Math.floor(coins / p.viewReward) };
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

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const money = (v: FormDataEntryValue | null) => Math.floor(Number(String(v ?? "").replace(/[,\s₦]/g, "")));

export function cleanLink(raw: string): { ok: true; url: string | null } | { ok: false; error: string } {
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

type Picture = { bytes: Uint8Array; type: string; ext: string };

/** Checks an uploaded picture by its actual bytes (not just its name). */
export async function readImage(v: FormDataEntryValue | null): Promise<({ ok: true } & Picture) | { ok: false; error: string } | null> {
  if (!v || typeof v === "string" || v.size === 0) return null;
  if (v.size > MAX_IMAGE_BYTES) return { ok: false, error: "That picture is over 2 MB. Please use a smaller one." };
  const b = new Uint8Array(await v.arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ok: true, bytes: b, type: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ok: true, bytes: b, type: "image/png", ext: "png" };
  if (String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP") {
    return { ok: true, bytes: b, type: "image/webp", ext: "webp" };
  }
  return { ok: false, error: "Please upload a JPG, PNG or WebP picture." };
}

export async function uploadImage(img: Picture, folder: string) {
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
async function tooManyCheckouts(email: string) {
  const db = createAdminClient();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const [mine, all] = await Promise.all([
    db.from("ads").select("id", { count: "exact", head: true }).eq("contact_email", email).eq("status", "pending_payment").gt("created_at", since),
    db.from("ads").select("id", { count: "exact", head: true }).eq("status", "pending_payment").gt("created_at", since),
  ]);
  return (mine.count ?? 0) >= 6 || (all.count ?? 0) >= 2000;
}

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

const NOT_ON = "Payments aren't switched on yet. Please check back soon.";
const fmt = (n: number) => n.toLocaleString("en-NG");

// ============================================================ checkout

export async function startAdCheckout(form: FormData): Promise<CheckoutResult> {
  if (!paystackEnabled()) return { ok: false, error: NOT_ON };
  const pricing = await adPricing();
  const brand = clean(form.get("brand"), 61);
  const headline = clean(form.get("headline"), 61);
  const weekly = money(form.get("weekly"));
  const weeks = Math.floor(Number(form.get("weeks")));
  if (brand.length < 2 || brand.length > 60) return { ok: false, error: "Please add your brand name (up to 60 characters)." };
  if (headline.length < 2 || headline.length > 60) return { ok: false, error: "Please add a headline (up to 60 characters)." };
  if (!Number.isFinite(weekly) || weekly < pricing.minWeeklyNgn) {
    return { ok: false, error: `The smallest weekly budget is ₦${fmt(pricing.minWeeklyNgn)}.` };
  }
  if (!Number.isFinite(weeks) || weeks < 1 || weeks > pricing.maxWeeks) {
    return { ok: false, error: `Pick between 1 and ${pricing.maxWeeks} weeks.` };
  }
  const total = weekly * weeks;
  if (total > pricing.maxNgn) return { ok: false, error: `For budgets over ₦${fmt(pricing.maxNgn)}, please contact us.` };
  const link = cleanLink(clean(form.get("link"), 600));
  if (!link.ok) return link;
  if (form.get("policy") !== "yes") return { ok: false, error: "Please confirm you've read the advertising policy." };
  const c = readContact(form);
  if (!c.ok) return c;
  const img = await readImage(form.get("image"));
  if (!img) return { ok: false, error: "Please add a picture for your billboard." };
  if (!img.ok) return img;
  if (await tooManyCheckouts(c.contact.email)) {
    return { ok: false, error: "You've started a lot of checkouts. Please finish one, or try again in an hour." };
  }

  const db = createAdminClient();
  const adv = await db.rpc("advertiser_for_email", { p_email: c.contact.email, p_name: c.contact.name, p_phone: c.contact.phone });
  if (adv.error || !adv.data) {
    console.error("Advertiser account failed", adv.error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  const path = await uploadImage(img, "billboards");
  if (!path) return { ok: false, error: "We couldn't save your picture. Please try again." };

  const id = randomUUID();
  const reference = `ad-${id}`;
  const { coins } = poolFor(total, pricing);
  const { error } = await db.from("ads").insert({
    id,
    brand,
    headline,
    link_url: link.url,
    image_path: path,
    contact_name: c.contact.name,
    contact_email: c.contact.email,
    contact_phone: c.contact.phone,
    advertiser_id: adv.data as string,
    weeks,
    coins_total: coins,
    amount_kobo: total * 100,
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
    amountKobo: total * 100,
    reference,
    callbackUrl: `${siteUrl()}/advertise/done`,
    metadata: { kind: "ad", id, brand, weeks, coins },
  });
}

/** More budget (and optionally more weeks) for one of the advertiser's own ads. */
export async function startTopUpCheckout(advertiserId: string, form: FormData): Promise<CheckoutResult> {
  if (!paystackEnabled()) return { ok: false, error: NOT_ON };
  const pricing = await adPricing();
  const adId = clean(form.get("ad_id"), 40);
  const amount = money(form.get("amount"));
  const weeks = Math.floor(Number(form.get("weeks") ?? 0));
  if (!UUID_RE.test(adId)) return { ok: false, error: "That ad wasn't found." };
  if (!Number.isFinite(amount) || amount < pricing.minWeeklyNgn) {
    return { ok: false, error: `The smallest top-up is ₦${fmt(pricing.minWeeklyNgn)}.` };
  }
  if (amount > pricing.maxNgn) return { ok: false, error: `For top-ups over ₦${fmt(pricing.maxNgn)}, please contact us.` };
  const db = createAdminClient();
  const { data: ad } = await db
    .from("ads")
    .select("id, brand, status, ends_at, contact_email")
    .eq("id", adId)
    .eq("advertiser_id", advertiserId)
    .maybeSingle();
  if (!ad || !["live", "finished"].includes(ad.status as string)) return { ok: false, error: "That ad can't be topped up." };
  const msLeft = ad.ends_at ? Math.max(Date.parse(ad.ends_at as string) - Date.now(), 0) : 0;
  const weeksLeft = Math.ceil(msLeft / (7 * 86_400_000));
  const maxExtra = Math.max(pricing.maxWeeks - weeksLeft, 0);
  if (!Number.isFinite(weeks) || weeks < 0 || weeks > maxExtra) {
    return { ok: false, error: maxExtra > 0 ? `You can add 0 to ${maxExtra} weeks.` : "Your ad already runs for as long as it can." };
  }
  const { count } = await db
    .from("ad_topups")
    .select("id", { count: "exact", head: true })
    .eq("ad_id", adId)
    .eq("status", "pending_payment")
    .gt("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= 6) return { ok: false, error: "You've started a lot of top-ups. Please finish one, or try again in an hour." };

  const { coins } = poolFor(amount, pricing);
  const id = randomUUID();
  const reference = `at-${id}`;
  const { error } = await db.from("ad_topups").insert({ id, ad_id: adId, coins, weeks, amount_kobo: amount * 100, paystack_reference: reference });
  if (error) {
    console.error("Saving top-up failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  return startPayment({
    email: ad.contact_email as string,
    amountKobo: amount * 100,
    reference,
    callbackUrl: `${siteUrl()}/advertise/done`,
    metadata: { kind: "topup", id, ad: adId, brand: ad.brand as string, coins, weeks },
  });
}

// ============================================================ after payment

export type PaymentOutcome =
  | { kind: "off" }
  | { kind: "unknown" }
  | {
      kind: "ad";
      state: "not_paid" | "live" | "finished" | "other";
      brand: string;
      headline: string;
      image: string;
      coins: number;
      taps: number;
      endsAt: string | null;
      email: string;
    }
  | { kind: "topup"; state: "not_paid" | "paid"; brand: string; coins: number; taps: number; email: string }
  | {
      kind: "sponsor";
      state: "not_paid" | "queued" | "applied";
      brand: string;
      coins: number;
      roundId: number | null;
      queuedAhead: number;
      email: string;
    };

export const REF_RE = /^(ad|sp|at)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const AD_EMAIL_FIELDS =
  "id, advertiser_id, brand, headline, contact_name, contact_email, weeks, coins_total, coins_left, rewarded_views, free_views, opens, clicks, sightings, amount_kobo, paystack_reference, starts_at, ends_at, status, paused";

function toAdForEmail(row: Record<string, unknown>): AdForEmail {
  return {
    ...(row as unknown as AdForEmail),
    coins_total: Number(row.coins_total ?? 0),
    coins_left: Number(row.coins_left ?? 0),
    amount_kobo: Number(row.amount_kobo ?? 0),
  };
}

/**
 * Checks a payment with Paystack and acts on it: a new ad goes live, a top-up adds coins, a
 * (previously sold) prize pool sponsorship is queued. Used by both the page people come back
 * to after paying and the Paystack webhook, and safe to run any number of times: emails are
 * sent only by the call that marks the payment as paid.
 */
export async function confirmPayment(reference: string): Promise<PaymentOutcome> {
  if (!paystackEnabled()) return { kind: "off" };
  if (!REF_RE.test(reference)) return { kind: "unknown" };
  const db = createAdminClient();
  const payment = await checkPayment(reference);
  const paid = payment?.paid === true;
  const pricing = await adPricing();

  if (reference.startsWith("ad-")) {
    if (paid) {
      const res = await db.rpc("ad_paid", { p_reference: reference, p_amount_kobo: payment.amountKobo });
      if (res.error) console.error("ad_paid failed", res.error);
      const r = res.data as { found?: boolean; id?: string; newly_paid?: boolean } | null;
      if (r?.found && r.newly_paid && r.id) await adWentLive(r.id);
    }
    const { data: ad } = await db
      .from("ads")
      .select("brand, headline, image_path, status, coins_total, ends_at, contact_email")
      .eq("paystack_reference", reference)
      .maybeSingle();
    if (!ad) return { kind: "unknown" };
    const status = ad.status as string;
    const coins = Number(ad.coins_total ?? 0);
    return {
      kind: "ad",
      state: status === "pending_payment" ? "not_paid" : status === "live" ? "live" : status === "finished" ? "finished" : "other",
      brand: ad.brand as string,
      headline: ad.headline as string,
      image: adImageUrl(ad.image_path as string),
      coins,
      taps: Math.floor(coins / pricing.viewReward),
      endsAt: (ad.ends_at as string | null) ?? null,
      email: ad.contact_email as string,
    };
  }

  if (reference.startsWith("at-")) {
    if (paid) {
      const res = await db.rpc("ad_topup_paid", { p_reference: reference, p_amount_kobo: payment.amountKobo });
      if (res.error) console.error("ad_topup_paid failed", res.error);
      const r = res.data as { found?: boolean; ad_id?: string; newly_paid?: boolean; coins?: number } | null;
      if (r?.found && r.newly_paid && r.ad_id) await toppedUp(r.ad_id, Number(r.coins ?? 0), reference);
    }
    const { data: t } = await db
      .from("ad_topups")
      .select("status, coins, ads(brand, contact_email)")
      .eq("paystack_reference", reference)
      .maybeSingle();
    if (!t) return { kind: "unknown" };
    const ad = (Array.isArray(t.ads) ? t.ads[0] : t.ads) as { brand: string; contact_email: string } | null;
    const coins = Number(t.coins);
    return {
      kind: "topup",
      state: t.status === "paid" ? "paid" : "not_paid",
      brand: ad?.brand ?? "your ad",
      coins,
      taps: Math.floor(coins / pricing.viewReward),
      email: ad?.contact_email ?? "",
    };
  }

  // Prize pool sponsors: no longer sold on the website, but payments already started still count.
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
          {
            ...(s as { brand: string; contact_name: string; contact_email: string; paystack_reference: string }),
            coins: Number(s.coins),
            amount_kobo: Number(s.amount_kobo),
          },
          r.status === "applied",
        );
        await sendEmail({ to: s.contact_email as string, ...email }).catch(() => {});
        const line = `${s.brand} paid ${naira(Number(s.amount_kobo))} for ${Number(s.coins)} mint in a prize pool (${
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

/** A new ad was just paid for (and is live): receipt to the advertiser, a note to the owner. */
async function adWentLive(adId: string) {
  const db = createAdminClient();
  const { data } = await db.from("ads").select(`${AD_EMAIL_FIELDS}, image_path`).eq("id", adId).maybeSingle();
  if (!data) return;
  const ad = toAdForEmail(data);
  const pricing = await adPricing();
  await sendEmail({ to: ad.contact_email, ...(await adLiveEmail(ad, pricing.viewReward)) }).catch(() => {});
  await emailAdmin(adminNewAdEmail(ad, adImageUrl(data.image_path as string)));
}

async function toppedUp(adId: string, coins: number, reference: string) {
  const db = createAdminClient();
  const { data } = await db.from("ads").select(AD_EMAIL_FIELDS).eq("id", adId).maybeSingle();
  if (!data) return;
  const ad = toAdForEmail(data);
  const pricing = await adPricing();
  await sendEmail({ to: ad.contact_email, ...(await topUpEmail(ad, coins, reference, pricing.viewReward)) }).catch(() => {});
}

// ============================================================ the advertiser's portal

export type PortalAd = {
  id: string;
  brand: string;
  headline: string;
  link: string | null;
  image: string;
  status: "live" | "paused" | "finished" | "ended" | "stopped";
  coinsTotal: number;
  coinsLeft: number;
  rewardedViews: number;
  freeViews: number;
  clicks: number;
  sightings: number;
  startsAt: string | null;
  endsAt: string | null;
  daysLeft: number;
  /** Whole weeks still to run (rounded up), and whether a top-up must add at least a week. */
  weeksLeft: number;
  needsWeek: boolean;
  week: { day: string; views: number; freeViews: number; clicks: number }[];
};

/** Everything an advertiser sees about their own ads (newest first). */
export async function advertiserAds(advertiserId: string): Promise<{ email: string; name: string | null; ads: PortalAd[] } | null> {
  const db = createAdminClient();
  const { data: who } = await db.from("advertisers").select("email, name").eq("id", advertiserId).maybeSingle();
  if (!who) return null;
  const { data: rows } = await db
    .from("ads")
    .select("id, brand, headline, link_url, image_path, status, paused, coins_total, coins_left, rewarded_views, free_views, clicks, sightings, starts_at, ends_at")
    .eq("advertiser_id", advertiserId)
    .neq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(50);
  const ids = (rows ?? []).map((r) => r.id as string);
  const since = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const { data: daily } = ids.length
    ? await db.from("ad_daily").select("ad_id, day, views, free_views, clicks").in("ad_id", ids).gte("day", since).order("day")
    : { data: [] };
  const now = Date.now();
  const ads = (rows ?? []).map((r): PortalAd => {
    const ends = r.ends_at ? Date.parse(r.ends_at as string) : null;
    const st = r.status as string;
    const status: PortalAd["status"] =
      st === "live" ? (ends !== null && ends < now ? "ended" : r.paused ? "paused" : "live") : st === "finished" ? (ends !== null && ends < now ? "ended" : "finished") : "stopped";
    return {
      id: r.id as string,
      brand: r.brand as string,
      headline: r.headline as string,
      link: (r.link_url as string | null) ?? null,
      image: adImageUrl(r.image_path as string),
      status,
      coinsTotal: Number(r.coins_total ?? 0),
      coinsLeft: Number(r.coins_left ?? 0),
      rewardedViews: Number(r.rewarded_views ?? 0),
      freeViews: Number(r.free_views ?? 0),
      clicks: Number(r.clicks ?? 0),
      sightings: Number(r.sightings ?? 0),
      startsAt: (r.starts_at as string | null) ?? null,
      endsAt: (r.ends_at as string | null) ?? null,
      daysLeft: ends === null ? 0 : Math.max(0, Math.ceil((ends - now) / 86_400_000)),
      weeksLeft: ends === null ? 0 : Math.ceil(Math.max(ends - now, 0) / (7 * 86_400_000)),
      needsWeek: ends === null || ends <= now + 86_400_000,
      week: (daily ?? [])
        .filter((d) => d.ad_id === r.id)
        .map((d) => ({ day: d.day as string, views: Number(d.views), freeViews: Number(d.free_views), clicks: Number(d.clicks) })),
    };
  });
  return { email: who.email as string, name: (who.name as string | null) ?? null, ads };
}

export type EditResult = { ok: true } | { ok: false; error: string };

/** Changes the headline, link and/or picture of one of the advertiser's own ads. Live at once. */
export async function editAdFor(advertiserId: string, form: FormData): Promise<EditResult> {
  const adId = clean(form.get("ad_id"), 40);
  if (!UUID_RE.test(adId)) return { ok: false, error: "That ad wasn't found." };
  const headline = clean(form.get("headline"), 61);
  if (headline.length < 2 || headline.length > 60) return { ok: false, error: "Please add a headline (up to 60 characters)." };
  const rawLink = clean(form.get("link"), 600);
  const link = cleanLink(rawLink);
  if (!link.ok) return link;
  const img = await readImage(form.get("image"));
  if (img && !img.ok) return img;

  const db = createAdminClient();
  const { data: mine } = await db.from("ads").select("id").eq("id", adId).eq("advertiser_id", advertiserId).maybeSingle();
  if (!mine) return { ok: false, error: "That ad wasn't found." };
  let path: string | null = null;
  if (img) {
    path = await uploadImage(img, "billboards");
    if (!path) return { ok: false, error: "We couldn't save your picture. Please try again." };
  }
  const { data, error } = await db.rpc("ad_edit", {
    p_ad: adId,
    p_advertiser: advertiserId,
    p_headline: headline,
    p_link: link.url,
    p_clear_link: link.url === null,
    p_image_path: path,
  });
  if (error || data !== true) {
    if (error) console.error("Editing ad failed", error);
    if (path) await db.storage.from(AD_BUCKET).remove([path]);
    return { ok: false, error: "We couldn't save your changes. Please try again." };
  }
  return { ok: true };
}

export async function setPausedFor(advertiserId: string, adId: string, paused: boolean): Promise<EditResult> {
  if (!UUID_RE.test(adId)) return { ok: false, error: "That ad wasn't found." };
  const { data, error } = await createAdminClient().rpc("ad_set_paused", { p_ad: adId, p_advertiser: advertiserId, p_paused: paused });
  if (error || data !== true) return { ok: false, error: "That didn't work. Please try again." };
  return { ok: true };
}
