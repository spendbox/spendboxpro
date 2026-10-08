import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// Emails for advertisers (sent through Resend, like the sign-in codes), and the daily report
// job (called once a day from /api/cron/daily). Every email to an advertiser carries a
// private "Manage your ad" link that signs them in to /advertiser.

type Email = { subject: string; html: string; text: string };

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const n = (v: number) => Math.round(v).toLocaleString("en-NG");
export const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
export const day = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

/** A clean, simple email layout. `body` is HTML that has already been escaped. */
function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#eef2f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18202b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px" cellpadding="0" cellspacing="0"><tr><td style="padding:28px">
<div style="font-size:13px;font-weight:700;color:#c98a00;letter-spacing:1px;text-transform:uppercase">Hide &amp; Seek</div>
<div style="font-size:22px;font-weight:800;margin:6px 0 14px">${title}</div>
${body}
<p style="font-size:12px;color:#64707d;margin:24px 0 0">Questions? Just reply to this email.</p>
</td></tr></table></td></tr></table></body></html>`;
}

const p = (html: string) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${html}</p>`;

function button(href: string, label: string) {
  return `<p style="margin:18px 0"><a href="${esc(href)}" style="display:inline-block;background:#ffc53d;color:#18202b;font-weight:700;font-size:15px;text-decoration:none;padding:12px 20px;border-radius:12px">${esc(label)}</a></p>`;
}

const linkNote = `<p style="font-size:12px;color:#64707d;margin:0 0 12px">This button signs you in to manage your ads, so please don't forward this email. It works for 30 days; you can always sign in with your email at ${esc(siteUrl())}/advertiser.</p>`;

function statsTable(rows: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #eef1f5;font-size:14px;color:#64707d">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #eef1f5;font-size:15px;font-weight:700;text-align:right">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

const textTable = (rows: [string, string][]) => rows.map(([k, v]) => `${k}: ${v}`).join("\n");

// ============================================================ "Manage your ad" links

/** The fingerprint we store for a link's secret (the secret itself is only in the email). */
export const hashToken = (token: string) => createHash("sha256").update(`advertiser-link:${token}`).digest("hex");

/** Makes a new private sign-in link for an advertiser. Returns the portal address if it fails. */
export async function manageLink(advertiserId: string | null | undefined) {
  const base = `${siteUrl()}/advertiser`;
  if (!advertiserId) return base;
  const token = randomBytes(24).toString("base64url");
  const { error } = await createAdminClient().rpc("advertiser_link_new", { p_advertiser: advertiserId, p_hash: hashToken(token) });
  if (error) {
    console.error("Making a manage link failed", error);
    return base;
  }
  return `${base}?token=${token}`;
}

// ============================================================ advertiser emails

export type AdForEmail = {
  id: string;
  advertiser_id: string | null;
  brand: string;
  headline: string;
  contact_name: string;
  contact_email: string;
  weeks: number | null;
  coins_total: number;
  coins_left: number;
  rewarded_views: number;
  free_views: number;
  opens: number;
  clicks: number;
  sightings: number;
  amount_kobo: number;
  paystack_reference: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  paused: boolean;
};

/** Receipt + "your ad is live", sent once when the payment is confirmed. */
export async function adLiveEmail(ad: AdForEmail, reward: number): Promise<Email> {
  const link = await manageLink(ad.advertiser_id);
  const rows: [string, string][] = [
    ["Brand", ad.brand],
    ["Headline", ad.headline],
    ["Paid", naira(ad.amount_kobo)],
    ["Coins in your ad's pool", n(ad.coins_total)],
    ["Player taps that covers", `about ${n(ad.coins_total / reward)}`],
    ["Runs until", ad.ends_at ? day(ad.ends_at) : `${ad.weeks ?? 1} week(s) from today`],
    ["Payment reference", ad.paystack_reference],
  ];
  return {
    subject: `Your ad for ${ad.brand} is live on Hide & Seek`,
    text: `Hi ${ad.contact_name},\n\nThanks for your payment. Your billboard ad is live in every Hide & Seek city.\n\n${textTable(rows)}\n\nEach signed-in player who taps your billboard gets ${reward} coins from your pool. Taps from everyone else are free for you. Unused coins at the end of your run expire.\n\nManage your ad (see live numbers, change the picture, headline or link, pause, or add budget):\n${link}\n\nWe'll email you a short report every morning while it runs.`,
    html: layout(
      "Your ad is live!",
      p(`Hi ${esc(ad.contact_name)}, thanks for your payment. Your billboard ad is now showing in every Hide &amp; Seek city.`) +
        statsTable(rows) +
        p(`Each signed-in player who taps your billboard gets ${reward} coins from your pool. Taps from everyone else are free for you. Unused coins at the end of your run expire.`) +
        button(link, "Manage your ad") +
        linkNote +
        p("We'll email you a short report every morning while it runs."),
    ),
  };
}

export async function topUpEmail(ad: AdForEmail, coins: number, reference: string, reward: number): Promise<Email> {
  const link = await manageLink(ad.advertiser_id);
  const rows: [string, string][] = [
    ["Brand", ad.brand],
    ["Coins added", n(coins)],
    ["Coins in the pool now", n(ad.coins_left)],
    ["Player taps that covers", `about ${n(ad.coins_left / reward)}`],
    ["Runs until", ad.ends_at ? day(ad.ends_at) : "—"],
    ["Payment reference", reference],
  ];
  return {
    subject: `Top-up received for your ${ad.brand} ad`,
    text: `Hi ${ad.contact_name},\n\nThanks! Your top-up went through and your ad is showing.\n\n${textTable(rows)}\n\nManage your ad: ${link}`,
    html: layout(
      "Top-up received",
      p(`Hi ${esc(ad.contact_name)}, thanks! Your top-up went through and your ad for <b>${esc(ad.brand)}</b> is showing.`) +
        statsTable(rows) +
        button(link, "Manage your ad") +
        linkNote,
    ),
  };
}

/** The 4-digit code for signing in to /advertiser. */
export function advertiserCodeEmail(code: string): Email {
  return {
    subject: `${code} is your Hide & Seek advertiser code`,
    text: `Your code to manage your Hide & Seek ads is ${code}.\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email.`,
    html: layout(
      "Your sign-in code",
      p("Use this code to manage your ads:") +
        `<div style="font-size:36px;font-weight:800;letter-spacing:12px;text-indent:12px;background:#f1f4f8;border-radius:12px;padding:16px;text-align:center;margin:0 0 12px">${esc(code)}</div>` +
        `<p style="font-size:13px;color:#64707d;margin:0">It works for 10 minutes. If you didn't ask for it, you can ignore this email.</p>`,
    ),
  };
}

/** For the owner (ADMIN_EMAIL): a new ad went live, with how to take it down if needed. */
export function adminNewAdEmail(ad: AdForEmail, imageUrl: string): Email {
  const rows: [string, string][] = [
    ["Brand", ad.brand],
    ["Headline", ad.headline],
    ["Contact", `${ad.contact_name} <${ad.contact_email}>`],
    ["Paid", naira(ad.amount_kobo)],
    ["Coins in pool", n(ad.coins_total)],
    ["Paystack reference", ad.paystack_reference],
    ["Ad id", ad.id],
  ];
  const todo =
    "Ads go live without a check. If this one breaks the policy: Supabase → Table Editor → ads → find this ad id → change status to held (it stops showing at once, and the advertiser can't switch it back on). Then refund in Paystack if you want to (Transactions → this reference → Refund).";
  return {
    subject: `New ad live: ${ad.brand}`,
    text: `A new ad is live.\n\n${textTable(rows)}\n\nPicture: ${imageUrl}\n\n${todo}`,
    html: layout(
      "A new ad is live",
      `<img src="${esc(imageUrl)}" alt="" width="464" style="width:100%;max-width:464px;border-radius:12px;margin:0 0 12px" />` +
        statsTable(rows) +
        p(esc(todo)),
    ),
  };
}

export type SponsorForEmail = {
  brand: string;
  contact_name: string;
  contact_email: string;
  coins: number;
  amount_kobo: number;
  paystack_reference: string;
};

/** Prize pool sponsors are no longer sold, but payments already started still get a receipt. */
export function sponsorPaidEmail(s: SponsorForEmail, applied: boolean): Email {
  const when = applied
    ? "Your coins are already in the prize pool of the round that's starting now."
    : "Your coins will go into the prize pool of the next round that's free (one sponsor per round, in order).";
  return {
    subject: `Thanks for sponsoring a Hide & Seek prize pool`,
    text: `Hi ${s.contact_name},\n\nThanks! ${n(s.coins)} coins from ${s.brand} will be in a Hide & Seek prize pool, shown to players as "Prize pool by ${s.brand}".\n\n${when}\n\nWe'll email you when your round finishes.\n\nPaid: ${naira(s.amount_kobo)}\nPayment reference: ${s.paystack_reference}`,
    html: layout(
      "Thanks for sponsoring!",
      p(`Hi ${esc(s.contact_name)}, <b>${n(s.coins)} coins</b> from <b>${esc(s.brand)}</b> will be in a Hide &amp; Seek prize pool, shown to players as “Prize pool by ${esc(s.brand)}”.`) +
        p(esc(when)) +
        p("We'll email you when your round finishes.") +
        `<p style="font-size:12px;color:#64707d;margin:0">Paid ${naira(s.amount_kobo)} · reference ${esc(s.paystack_reference)}</p>`,
    ),
  };
}

/** Emails the owner if ADMIN_EMAIL is set. Never throws. */
export async function emailAdmin(email: Email) {
  const to = process.env.ADMIN_EMAIL?.trim();
  if (!to) return;
  await sendEmail({ to, ...email }).catch((e) => console.error("Admin email failed", e));
}

// ============================================================ the daily job

/** Sends up to 100 emails in one call (Resend's batch endpoint). Returns how many were accepted. */
async function sendBatch(emails: ({ to: string } & Email)[]) {
  const key = process.env.RESEND_API_KEY;
  if (!key || emails.length === 0) return 0;
  const from = process.env.EMAIL_FROM ?? "Hide & Seek <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(emails.map((e) => ({ from, to: [e.to], subject: e.subject, html: e.html, text: e.text }))),
    });
    if (res.ok) return emails.length;
    console.error("Report emails failed", res.status, await res.text().catch(() => ""));
    return 0;
  } catch (error) {
    console.error("Report emails failed", error);
    return 0;
  }
}

function utcDate(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "UTC" }); // YYYY-MM-DD: the database counts days in UTC
}

type Yesterday = { views: number; free_views: number; clicks: number; sightings: number };

export function adReportEmail(ad: AdForEmail, y: Yesterday, link: string, reward: number): Email {
  const finished = ad.status !== "live";
  const timeUp = ad.ends_at ? Date.parse(ad.ends_at) <= Date.now() : false;
  const daysLeft = ad.ends_at ? Math.max(0, Math.ceil((Date.parse(ad.ends_at) - Date.now()) / 86_400_000)) : 0;
  const rows: [string, string][] = [
    ["Paid views yesterday (players who tapped and earned coins)", n(y.views)],
    ["Free views yesterday (watchers and players over their daily limit)", n(y.free_views)],
    ["Link clicks yesterday", n(y.clicks)],
    ["Coins used yesterday", n(y.views * reward)],
    ["Paid views so far", n(ad.rewarded_views)],
    ["Free views so far", n(ad.free_views)],
    ["Link clicks so far", n(ad.clicks)],
    ["Coins left", `${n(ad.coins_left)} of ${n(ad.coins_total)}`],
    finished ? ["Status", "Finished"] : ["Days left", ad.paused ? `${n(daysLeft)} (paused)` : n(daysLeft)],
  ];
  if (ad.sightings > 0) rows.push(["Seen on billboards so far (free)", n(ad.sightings)]);
  const why = timeUp ? "its weeks are over" : "its coins have all been earned by players";
  const intro = finished
    ? `Your ad for <b>${esc(ad.brand)}</b> has finished: ${why}. ${n(ad.rewarded_views)} players tapped it and earned coins${
        ad.coins_left > 0 ? `; the ${n(ad.coins_left)} unused coins have expired` : ""
      }. Thank you for advertising with us!`
    : `Here's how your ad for <b>${esc(ad.brand)}</b> (“${esc(ad.headline)}”) did yesterday.`;
  return {
    subject: finished ? `Your ad for ${ad.brand} has finished` : `Your Hide & Seek ad: ${n(y.views)} paid views yesterday`,
    text: `Hi ${ad.contact_name},\n\n${intro.replace(/<[^>]+>/g, "")}\n\n${textTable(rows)}\n\nManage your ad${finished ? " or top it up to run again" : ""}: ${link}`,
    html: layout(
      finished ? "Your ad has finished" : "Your daily ad report",
      p(`Hi ${esc(ad.contact_name)}, ${intro}`) +
        statsTable(rows) +
        button(link, finished ? "Top up to run again" : "Manage your ad") +
        linkNote +
        (finished ? "" : p("We'll send the next report tomorrow morning.")),
    ),
  };
}

const REPORT_FIELDS =
  "id, advertiser_id, brand, headline, contact_name, contact_email, weeks, coins_total, coins_left, rewarded_views, free_views, opens, clicks, sightings, amount_kobo, paystack_reference, starts_at, ends_at, status, paused, last_report_day, final_report_at";

/**
 * The daily job: finishes ads whose weeks are over, clears old unpaid checkouts and replaced
 * pictures, emails every running (or just finished) ad its report for yesterday, and tells
 * sponsors how their round went. Stops early rather than run too long; anything left over is
 * picked up tomorrow.
 */
export async function sendAdReports() {
  const started = Date.now();
  const db = createAdminClient();
  const out = { reports: 0, sponsorReports: 0, cleared: 0 };

  // 1. Housekeeping.
  const hk = await db.rpc("ad_housekeeping");
  if (!hk.error) {
    const paths = ((hk.data as { paths?: string[] } | null)?.paths ?? []).filter(Boolean);
    for (let i = 0; i < paths.length; i += 500) await db.storage.from("ads").remove(paths.slice(i, i + 500));
    out.cleared = paths.length;
  }
  const { data: rewardRow } = await db.from("game_settings").select("value").eq("key", "ad_view_reward").maybeSingle();
  const reward = Number(rewardRow?.value) > 0 ? Number(rewardRow?.value) : 5;

  // 2. Daily ad reports (one manage link per advertiser per run).
  const now = new Date();
  const today = utcDate(now);
  const yesterday = utcDate(new Date(now.getTime() - 86_400_000));
  const links = new Map<string, string>();
  for (let page = 0; page < 200 && Date.now() - started < 40_000; page++) {
    const { data: ads, error } = await db
      .from("ads")
      .select(REPORT_FIELDS)
      .in("status", ["live", "finished"])
      .is("final_report_at", null)
      .lt("starts_at", `${today}T00:00:00Z`) // ads that started today get their first report tomorrow
      .or(`last_report_day.is.null,last_report_day.lt.${today}`)
      .order("created_at")
      .limit(100);
    if (error || !ads || ads.length === 0) break;
    const ids = ads.map((a) => a.id as string);
    const { data: daily } = await db
      .from("ad_daily")
      .select("ad_id, views, free_views, clicks, sightings")
      .eq("day", yesterday)
      .in("ad_id", ids);
    const byAd = new Map((daily ?? []).map((d) => [d.ad_id as string, d]));
    const emails: ({ to: string } & Email)[] = [];
    for (const row of ads) {
      const a = {
        ...(row as unknown as AdForEmail),
        coins_total: Number(row.coins_total ?? 0),
        coins_left: Number(row.coins_left ?? 0),
        sightings: Number(row.sightings ?? 0),
      };
      const key = a.advertiser_id ?? "";
      if (!links.has(key)) links.set(key, await manageLink(a.advertiser_id));
      const d = byAd.get(a.id);
      emails.push({
        to: a.contact_email,
        ...adReportEmail(
          a,
          { views: Number(d?.views ?? 0), free_views: Number(d?.free_views ?? 0), clicks: Number(d?.clicks ?? 0), sightings: Number(d?.sightings ?? 0) },
          links.get(key)!,
          reward,
        ),
      });
    }
    const sent = await sendBatch(emails);
    if (sent === 0) break; // email isn't working: try again tomorrow
    out.reports += sent;
    const finishedIds = ads.filter((a) => a.status === "finished").map((a) => a.id as string);
    await db.from("ads").update({ last_report_day: today }).in("id", ids);
    if (finishedIds.length) await db.from("ads").update({ final_report_at: now.toISOString() }).in("id", finishedIds);
    if (ads.length < 100) break;
  }

  // 3. Prize pool sponsors (sold before part 13) whose round has finished.
  const { data: sponsors } = await db
    .from("pool_sponsors")
    .select("id, brand, contact_name, contact_email, coins, round_id")
    .eq("status", "applied")
    .is("report_sent_at", null)
    .limit(100);
  const roundIds = [...new Set((sponsors ?? []).map((s) => s.round_id as number).filter(Boolean))];
  if (roundIds.length) {
    const { data: rounds } = await db.from("rounds").select("id, status, pool, hiders_total, finished_at").in("id", roundIds).eq("status", "done");
    const done = new Map((rounds ?? []).map((r) => [r.id as number, r]));
    const { data: entries } = await db.from("entries").select("round_id").in("round_id", [...done.keys()]);
    const players = new Map<number, number>();
    for (const e of entries ?? []) players.set(e.round_id as number, (players.get(e.round_id as number) ?? 0) + 1);
    const ready = (sponsors ?? []).filter((s) => done.has(s.round_id as number));
    const emails = ready.map((s) => {
      const r = done.get(s.round_id as number)!;
      const rows: [string, string][] = [
        ["Round", `#${r.id}`],
        ["Finished", r.finished_at ? day(r.finished_at as string) : "Yes"],
        ["Players in the round", n(Math.max((players.get(r.id as number) ?? 1) - 1, 0))],
        ["Your coins in the pool", n(Number(s.coins))],
        ["Final prize pool", `${n(Number(r.pool))} coins`],
      ];
      return {
        to: s.contact_email as string,
        subject: `Your Hide & Seek prize pool round has finished`,
        text: `Hi ${s.contact_name},\n\nThe round sponsored by ${s.brand} has finished and the prize pool has been paid out to the players.\n\n${textTable(rows)}\n\nThank you for sponsoring! Want your brand on every billboard next? ${siteUrl()}/advertise`,
        html: layout(
          "Your sponsored round is done",
          p(`Hi ${esc(s.contact_name as string)}, the round sponsored by <b>${esc(s.brand as string)}</b> has finished and the prize pool has been paid out to the players.`) +
            statsTable(rows) +
            p(`Thank you for sponsoring! Want your brand on every billboard next? <a href="${siteUrl()}/advertise" style="color:#c98a00">Advertise here</a>.`),
        ),
      };
    });
    const sent = await sendBatch(emails);
    if (sent > 0) {
      out.sponsorReports = sent;
      await db
        .from("pool_sponsors")
        .update({ report_sent_at: now.toISOString() })
        .in("id", ready.map((s) => s.id as string));
    }
  }
  return out;
}
