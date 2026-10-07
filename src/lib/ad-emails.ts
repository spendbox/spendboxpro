import "server-only";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// Emails for advertisers and sponsors (sent through Resend, like the sign-in codes), and the
// daily report job (called once a day from /api/cron/daily).

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

function statsTable(rows: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #eef1f5;font-size:14px;color:#64707d">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #eef1f5;font-size:15px;font-weight:700;text-align:right">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

const textTable = (rows: [string, string][]) => rows.map(([k, v]) => `${k}: ${v}`).join("\n");

export type AdForEmail = {
  id: string;
  brand: string;
  headline: string;
  contact_name: string;
  contact_email: string;
  slots: number;
  views_bought: number;
  views_delivered: number;
  opens: number;
  clicks: number;
  amount_kobo: number;
  paystack_reference: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
};

export function adLiveEmail(ad: AdForEmail): Email {
  const rows: [string, string][] = [
    ["Brand", ad.brand],
    ["Headline", ad.headline],
    ["Views bought", n(ad.views_bought)],
    ["Delivered by", ad.ends_at ? day(ad.ends_at) : "within 7 days"],
    ["Paid", naira(ad.amount_kobo)],
  ];
  return {
    subject: `Your ad for ${ad.brand} is live on Hide & Seek`,
    text: `Hi ${ad.contact_name},\n\nGood news: your billboard ad is live in every Hide & Seek city.\n\n${textTable(rows)}\n\nWe'll email you a short report every morning while it runs.\n\nPayment reference: ${ad.paystack_reference}`,
    html: layout(
      "Your ad is live! 🎉",
      p(`Hi ${esc(ad.contact_name)}, your billboard ad is now showing in every Hide &amp; Seek city.`) +
        statsTable(rows) +
        p("We'll email you a short report every morning while it runs.") +
        `<p style="font-size:12px;color:#64707d;margin:0">Payment reference: ${esc(ad.paystack_reference)}</p>`,
    ),
  };
}

export function adRejectedEmail(ad: AdForEmail, reason: string): Email {
  return {
    subject: `We couldn't approve your ad for ${ad.brand}`,
    text: `Hi ${ad.contact_name},\n\nThanks for advertising with Hide & Seek. Sadly we couldn't approve your ad:\n\n"${reason}"\n\nWe'll refund your payment of ${naira(ad.amount_kobo)} in full. Refunds usually reach you within 5–10 working days.\n\nYou're welcome to make a new ad that follows our policy: ${siteUrl()}/advertise/policy\n\nPayment reference: ${ad.paystack_reference}`,
    html: layout(
      "We couldn't approve your ad",
      p(`Hi ${esc(ad.contact_name)}, thanks for advertising with Hide &amp; Seek. Sadly we couldn't approve your ad for <b>${esc(ad.brand)}</b>:`) +
        `<div style="background:#f1f4f8;border-radius:12px;padding:14px 16px;font-size:15px;margin:0 0 14px">${esc(reason)}</div>` +
        p(`We'll refund your payment of <b>${naira(ad.amount_kobo)}</b> in full. Refunds usually reach you within 5–10 working days.`) +
        p(`You're welcome to make a new ad that follows our <a href="${siteUrl()}/advertise/policy" style="color:#c98a00">advertising policy</a>.`) +
        `<p style="font-size:12px;color:#64707d;margin:0">Payment reference: ${esc(ad.paystack_reference)}</p>`,
    ),
  };
}

export function adHeldEmail(ad: AdForEmail): Email {
  return {
    subject: `We're checking your ad for ${ad.brand}`,
    text: `Hi ${ad.contact_name},\n\nThanks, your payment went through. A person on our team is taking a quick look at your ad before it goes live (usually within a day). We'll email you as soon as it's showing.\n\nPayment reference: ${ad.paystack_reference}`,
    html: layout(
      "Thanks! We're checking your ad",
      p(`Hi ${esc(ad.contact_name)}, your payment went through. A person on our team is taking a quick look at your ad for <b>${esc(ad.brand)}</b> before it goes live (usually within a day).`) +
        p("Your 7 days only start once it's showing, and we'll send you a report every morning while it runs.") +
        `<p style="font-size:12px;color:#64707d;margin:0">Payment reference: ${esc(ad.paystack_reference)}</p>`,
    ),
  };
}

/** For the owner (ADMIN_EMAIL). */
export function adminAdEmail(ad: AdForEmail, what: "rejected" | "held", reason: string): Email {
  const rows: [string, string][] = [
    ["Brand", ad.brand],
    ["Headline", ad.headline],
    ["Contact", `${ad.contact_name} <${ad.contact_email}>`],
    ["Paid", naira(ad.amount_kobo)],
    ["Paystack reference", ad.paystack_reference],
    ["Ad id", ad.id],
  ];
  const todo =
    what === "held"
      ? "Please check this ad by hand. To approve it: Supabase → Table Editor → ads → find this ad id → change status to live. To turn it down: set status to rejected and refund the payment in Paystack (Transactions → this reference → Refund)."
      : "The advertiser has been told we'll refund them. Please refund the payment in Paystack (Transactions → this reference → Refund). If you think the check got it wrong, you can approve it instead: Supabase → Table Editor → ads → this ad id → change status to live.";
  return {
    subject: what === "held" ? `Ad needs a manual check: ${ad.brand}` : `Ad rejected (refund needed): ${ad.brand}`,
    text: `${what === "held" ? "An ad is waiting for you to check it." : "An ad was rejected by the automatic check."}\n\nWhy: ${reason}\n\n${textTable(rows)}\n\n${todo}`,
    html: layout(
      what === "held" ? "An ad needs a quick check" : "An ad was rejected",
      p(`<b>Why:</b> ${esc(reason)}`) + statsTable(rows) + p(esc(todo)),
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

export function sponsorPaidEmail(s: SponsorForEmail, applied: boolean): Email {
  const when = applied
    ? "Your coins are already in the prize pool of the round that's starting now."
    : "Your coins will go into the prize pool of the next round that's free (rounds start about every 70 minutes, one sponsor per round).";
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

function adminEmail() {
  return process.env.ADMIN_EMAIL?.trim() || null;
}

/** Emails the owner if ADMIN_EMAIL is set. Never throws. */
export async function emailAdmin(email: Email) {
  const to = adminEmail();
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

export function adReportEmail(ad: AdForEmail, yesterday: { views: number; opens: number; clicks: number }): Email {
  const remaining = Math.max(ad.views_bought - ad.views_delivered, 0);
  const finished = ad.status === "finished" || remaining === 0;
  let finish = "Finished";
  if (!finished) {
    const started = ad.starts_at ? new Date(ad.starts_at).getTime() : Date.now();
    const days = Math.max((Date.now() - started) / 86_400_000, 0.25);
    const perDay = ad.views_delivered / days;
    const ends = ad.ends_at ? new Date(ad.ends_at) : null;
    if (perDay > 0) {
      const eta = new Date(Date.now() + (remaining / perDay) * 86_400_000);
      finish = ends && eta <= ends ? `On track, by ${day(ends)}` : `Around ${day(eta)}`;
    } else finish = ends ? `By ${day(ends)}` : "Within 7 days";
  }
  const rows: [string, string][] = [
    ["Views yesterday", n(yesterday.views)],
    ["Opens yesterday (people who tapped your billboard)", n(yesterday.opens)],
    ["Link clicks yesterday", n(yesterday.clicks)],
    ["Views so far", `${n(ad.views_delivered)} of ${n(ad.views_bought)}`],
    ["Opens so far", n(ad.opens)],
    ["Link clicks so far", n(ad.clicks)],
    ["Views still to come", n(remaining)],
    ["Expected to finish", finish],
  ];
  const intro = finished
    ? `Your ad for <b>${esc(ad.brand)}</b> has had all ${n(ad.views_bought)} views you bought. Thank you for advertising with us!`
    : `Here's how your ad for <b>${esc(ad.brand)}</b> (“${esc(ad.headline)}”) did yesterday.`;
  return {
    subject: finished ? `Your ad for ${ad.brand} is complete` : `Your Hide & Seek ad report: ${n(yesterday.views)} views yesterday`,
    text: `Hi ${ad.contact_name},\n\n${intro.replace(/<[^>]+>/g, "")}\n\n${textTable(rows)}\n\n${finished ? `Want more? ${siteUrl()}/advertise` : "We'll send the next report tomorrow morning."}`,
    html: layout(
      finished ? "Your ad is complete ✅" : "Your daily ad report",
      p(`Hi ${esc(ad.contact_name)}, ${intro}`) +
        statsTable(rows) +
        (finished
          ? p(`Want more views? <a href="${siteUrl()}/advertise" style="color:#c98a00">Book another ad</a>.`)
          : p("We'll send the next report tomorrow morning.")),
    ),
  };
}

const AD_FIELDS =
  "id, brand, headline, contact_name, contact_email, slots, views_bought, views_delivered, opens, clicks, amount_kobo, paystack_reference, starts_at, ends_at, status, last_report_day, final_report_at";

/**
 * The daily job: clears old unpaid checkouts, emails every running (or just finished) ad its
 * report for yesterday, and tells sponsors how their round went. Stops early rather than run
 * too long; anything left over is picked up tomorrow.
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

  // 2. Daily ad reports.
  const now = new Date();
  const today = utcDate(now);
  const yesterday = utcDate(new Date(now.getTime() - 86_400_000));
  for (let page = 0; page < 200 && Date.now() - started < 40_000; page++) {
    const { data: ads, error } = await db
      .from("ads")
      .select(AD_FIELDS)
      .in("status", ["live", "finished"])
      .is("final_report_at", null)
      .lt("starts_at", `${today}T00:00:00Z`) // ads that started today get their first report tomorrow
      .or(`last_report_day.is.null,last_report_day.lt.${today}`)
      .order("created_at")
      .limit(100);
    if (error || !ads || ads.length === 0) break;
    const ids = ads.map((a) => a.id as string);
    const { data: daily } = await db.from("ad_daily").select("ad_id, views, opens, clicks").eq("day", yesterday).in("ad_id", ids);
    const byAd = new Map((daily ?? []).map((d) => [d.ad_id as string, d]));
    const emails = ads.map((a) => {
      const d = byAd.get(a.id as string);
      return {
        to: a.contact_email as string,
        ...adReportEmail(a as unknown as AdForEmail, {
          views: Number(d?.views ?? 0),
          opens: Number(d?.opens ?? 0),
          clicks: Number(d?.clicks ?? 0),
        }),
      };
    });
    const sent = await sendBatch(emails);
    if (sent === 0) break; // email isn't working: try again tomorrow
    out.reports += sent;
    const finishedIds = ads.filter((a) => a.status === "finished").map((a) => a.id as string);
    await db.from("ads").update({ last_report_day: today }).in("id", ids);
    if (finishedIds.length) await db.from("ads").update({ final_report_at: now.toISOString() }).in("id", finishedIds);
    if (ads.length < 100) break;
  }

  // 3. Sponsors whose round has finished.
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
        text: `Hi ${s.contact_name},\n\nThe round sponsored by ${s.brand} has finished and the prize pool has been paid out to the players.\n\n${textTable(rows)}\n\nThank you for sponsoring! Book another: ${siteUrl()}/advertise`,
        html: layout(
          "Your sponsored round is done 🏆",
          p(`Hi ${esc(s.contact_name as string)}, the round sponsored by <b>${esc(s.brand as string)}</b> has finished and the prize pool has been paid out to the players.`) +
            statsTable(rows) +
            p(`Thank you for sponsoring! <a href="${siteUrl()}/advertise" style="color:#c98a00">Sponsor another round</a>.`),
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
