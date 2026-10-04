import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { emailBody, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { paystackConfigured, verifyTransaction } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import { billingState, PLANS, type PlanKey } from "@/lib/billing";

// Paying for Spendbox: confirming Paystack payments, and the daily fair-use
// check (reminders, then pausing businesses that haven't paid).

const BUSINESS_FOOTER = "You get these emails because you own a business on Spendbox.";

async function ownerEmail(businessId: string) {
  const admin = createAdminClient();
  const { data: b } = await admin.from("businesses").select("name, email, owner_id").eq("id", businessId).maybeSingle();
  if (!b) return null;
  const { data: owner } = await admin.from("profiles").select("email").eq("id", b.owner_id).maybeSingle();
  return { name: b.name as string, email: ((owner?.email as string | null) ?? (b.email as string | null)) || null };
}

/** True if Paystack's webhook signature matches the body. */
export function paystackSignatureOk(rawBody: string, signature: string | null) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !signature) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest("hex");
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * Checks a payment with Paystack and, if it went through, adds its months to
 * the business. Safe to call more than once (the callback and the webhook both
 * do). Returns the business it was for, or null.
 */
export async function confirmPaystackPayment(reference: string) {
  if (!paystackConfigured() || !reference || reference.length > 100) return null;
  const admin = createAdminClient();
  const { data: payment } = await admin.from("business_payments").select("business_id, plan, months, status").eq("reference", reference).maybeSingle();
  if (!payment) return null;
  if (payment.status === "paid") return { businessId: payment.business_id as string, paid: true };
  const result = await verifyTransaction(reference);
  if (!result?.paid || result.currency !== "NGN") return { businessId: payment.business_id as string, paid: false };
  const { data: applied } = await admin.rpc("apply_business_payment", { p_reference: reference, p_amount: result.amount });
  if (applied) await sendPaymentReceipt(payment.business_id as string, payment.plan as PlanKey, payment.months as number, result.amount);
  const { data: after } = await admin.from("business_payments").select("status").eq("reference", reference).maybeSingle();
  return { businessId: payment.business_id as string, paid: after?.status === "paid" };
}

async function sendPaymentReceipt(businessId: string, plan: PlanKey, months: number, amount: number) {
  const contact = await ownerEmail(businessId);
  const { data: b } = await createAdminClient().from("businesses").select("paid_until").eq("id", businessId).maybeSingle();
  if (!contact?.email || !b?.paid_until) return;
  const { html, text } = emailBody({
    heading: "Thanks, your payment went through",
    lines: [
      `${contact.name}: ${PLANS[plan].name} plan, ${months === 1 ? "1 month" : `${months} months`}, ${formatMoney(amount)}.`,
      `You're all set until ${formatDate(b.paid_until, { withYear: true })}.`,
    ],
    button: { label: "See your plan", url: `${siteUrl()}/dashboard/${businessId}/settings/billing` },
    footer: BUSINESS_FOOTER,
  });
  await sendEmail({ to: contact.email, subject: "Your Spendbox payment receipt", html, text, essential: true });
}

/**
 * The daily fair-use check. Sends each reminder once (tracked in
 * billing_notice), and pauses businesses still unpaid GRACE_DAYS after their
 * trial or plan ended.
 */
export async function runBillingCheck() {
  const admin = createAdminClient();
  const { data: businesses } = await admin
    .from("businesses")
    .select("id, name, created_at, trial_ends_at, paid_until, plan, suspended_at, suspended_reason, billing_notice")
    .or("suspended_reason.is.null,suspended_reason.neq.billing");
  let reminded = 0;
  let paused = 0;
  for (const b of businesses ?? []) {
    if (b.suspended_at) continue; // paused by an admin: leave it alone
    const s = billingState(b);
    const end = s.accessUntil.toISOString().slice(0, 10);
    const billingUrl = `${siteUrl()}/dashboard/${b.id}/settings/billing`;
    let notice: string | null = null;
    let mail: { subject: string; heading: string; lines: string[] } | null = null;

    if (s.status === "due" && Date.now() >= s.suspendOn.getTime()) {
      await admin.from("businesses").update({ suspended_at: new Date().toISOString(), suspended_reason: "billing", billing_notice: `paused:${end}` }).eq("id", b.id);
      paused += 1;
      const contact = await ownerEmail(b.id);
      if (contact?.email) {
        const { html, text } = emailBody({
          heading: `${b.name} is paused`,
          lines: [
            `Your Spendbox plan ended on ${formatDate(s.accessUntil, { withYear: true })} and wasn't renewed, so we've paused ${b.name}.`,
            "While it's paused, you won't see customer requests and new customers can't join. Your customers keep their perks.",
            "Pay any time to switch everything back on.",
          ],
          button: { label: "Pay and switch back on", url: billingUrl },
          footer: BUSINESS_FOOTER,
        });
        await sendEmail({ to: contact.email, subject: `${b.name} is paused on Spendbox`, html, text, essential: true });
      }
      continue;
    }

    if (s.status === "trial" && s.daysLeft <= 3) {
      notice = `trial-ending:${end}`;
      mail = {
        subject: "Your Spendbox free trial ends soon",
        heading: `${s.daysLeft <= 1 ? "1 day" : `${s.daysLeft} days`} left on your free trial`,
        lines: [`${b.name}'s free trial ends on ${formatDate(s.accessUntil, { withYear: true })}.`, "Choose a plan to keep your perks and payments running."],
      };
    } else if (s.status === "active" && s.daysLeft <= 3) {
      notice = `renew:${end}`;
      mail = {
        subject: "Your Spendbox plan ends soon",
        heading: "Time to renew",
        lines: [`${b.name}'s plan ends on ${formatDate(s.accessUntil, { withYear: true })}. Renew to keep everything running.`],
      };
    } else if (s.status === "due") {
      const daysToPause = Math.ceil((s.suspendOn.getTime() - Date.now()) / 86_400_000);
      notice = daysToPause <= 3 ? `final:${end}` : `due:${end}`;
      mail = {
        subject: daysToPause <= 3 ? `Last reminder: ${b.name} will be paused` : "Your Spendbox payment is due",
        heading: daysToPause <= 3 ? `${b.name} will be paused in ${daysToPause <= 1 ? "1 day" : `${daysToPause} days`}` : "Your payment is due",
        lines: [
          `Your free time or plan ended on ${formatDate(s.accessUntil, { withYear: true })}.`,
          `Pay by ${formatDate(s.suspendOn, { withYear: true })} to keep ${b.name} running. After that it's paused until you pay.`,
        ],
      };
    }
    if (!notice || !mail || b.billing_notice === notice) continue;
    const contact = await ownerEmail(b.id);
    if (contact?.email) {
      const { html, text } = emailBody({ heading: mail.heading, lines: mail.lines, button: { label: "Choose a plan", url: billingUrl }, footer: BUSINESS_FOOTER });
      await sendEmail({ to: contact.email, subject: mail.subject, html, text, essential: true });
    }
    await admin.from("businesses").update({ billing_notice: notice }).eq("id", b.id);
    reminded += 1;
  }
  return { reminded, paused };
}
