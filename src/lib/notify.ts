import "server-only";
import { emailBody, emailConfigured, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { formatDate, formatMoney, formatWhen, memberLabel } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

// Email notifications. Each function is safe to call after any change: it
// looks up what's needed, skips people without an email, and never throws.

const CUSTOMER_FOOTER = "You get these emails because you added your email to Spendbox. Turn them off in Profile & privacy.";
const BUSINESS_FOOTER = "You get these emails because this email is on your Spendbox business. Change it in Settings.";

async function customerContact(customerId: string) {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("email, email_notifications, full_name")
    .eq("id", customerId)
    .maybeSingle();
  return data?.email && data.email_notifications ? { email: data.email as string, name: data.full_name as string | null } : null;
}

function hello(name: string | null) {
  return name ? `Hi ${name.split(/\s+/)[0]},` : "Hi,";
}

/** Tells customers about perks they've just earned (welcome, loyalty, invites, birthdays…). */
export async function notifyRewardsReady() {
  if (!emailConfigured()) return;
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const { data: rewards } = await admin
      .from("rewards")
      .select("id, customer_id, title, expires_at, business:businesses(name, slug)")
      .is("notified_at", null)
      .eq("status", "available")
      .gte("issued_at", since)
      .limit(200);
    if (!rewards?.length) return;

    // Mark first, so two requests running at once don't both send.
    const ids = rewards.map((r) => r.id);
    await admin.from("rewards").update({ notified_at: new Date().toISOString() }).in("id", ids).is("notified_at", null);

    for (const r of rewards) {
      const contact = await customerContact(r.customer_id);
      if (!contact) continue;
      const business = r.business as unknown as { name: string; slug: string };
      const { html, text } = emailBody({
        heading: `Your perk at ${business.name} is ready`,
        lines: [
          hello(contact.name),
          `You've earned: ${r.title}.`,
          r.expires_at
            ? `Show your Spendbox pass at ${business.name} to use it by ${formatDate(r.expires_at, { withYear: true })}.`
            : `Show your Spendbox pass at ${business.name} on your next visit to use it.`,
        ],
        button: { label: "Show my pass", url: `${siteUrl()}/me/b/${business.slug}/pass` },
        footer: CUSTOMER_FOOTER,
      });
      await sendEmail({ to: contact.email, subject: `${r.title} — ready at ${business.name}`, html, text });
    }
  } catch (error) {
    console.error("notifyRewardsReady failed", error);
  }
}

/** Tells a customer a business recorded, confirmed or received (by bank transfer) one of their payments. */
export async function notifyPurchase(purchaseId: string, kind: "recorded" | "confirmed" | "bank") {
  if (!emailConfigured()) return;
  try {
    const { data: p } = await createAdminClient()
      .from("purchases")
      .select("customer_id, amount, currency, paid_at, description, business:businesses(name, slug)")
      .eq("id", purchaseId)
      .maybeSingle();
    if (!p) return;
    const contact = await customerContact(p.customer_id);
    if (!contact) return;
    const business = p.business as unknown as { name: string; slug: string };
    const amount = formatMoney(p.amount, p.currency);
    const { html, text } = emailBody({
      heading:
        kind === "recorded"
          ? `${business.name} recorded your purchase`
          : kind === "bank"
            ? `${business.name} received your payment`
            : `${business.name} confirmed your payment`,
      lines: [
        hello(contact.name),
        `${amount} on ${formatWhen(p.paid_at)}${p.description ? ` (${p.description})` : ""} now counts toward your perks.`,
      ],
      button: { label: "See your progress", url: `${siteUrl()}/me/b/${business.slug}` },
      footer: CUSTOMER_FOOTER,
    });
    await sendEmail({ to: contact.email, subject: `${amount} counted at ${business.name}`, html, text });
  } catch (error) {
    console.error("notifyPurchase failed", error);
  }
}

/** Tells a business a receipt is waiting for them to check. */
export async function notifyReceiptToReview(purchaseId: string) {
  if (!emailConfigured()) return;
  try {
    const admin = createAdminClient();
    const { data: p } = await admin
      .from("purchases")
      .select("amount, currency, paid_at, business:businesses(id, name, email), membership:memberships(member_no, share_details, customer_id)")
      .eq("id", purchaseId)
      .maybeSingle();
    const business = p?.business as unknown as { id: string; name: string; email: string | null } | undefined;
    if (!p || !business?.email) return;
    const member = p.membership as unknown as { member_no: number; share_details: boolean; customer_id: string };
    let name: string | null = null;
    if (member.share_details) {
      const { data } = await admin.from("profiles").select("full_name").eq("id", member.customer_id).maybeSingle();
      name = data?.full_name ?? null;
    }
    const amount = formatMoney(p.amount, p.currency);
    const { html, text } = emailBody({
      heading: "A receipt needs a quick check",
      lines: [
        `${memberLabel(member.member_no, name)} uploaded a receipt for ${amount} (${formatWhen(p.paid_at)}).`,
        "We couldn't match it to one of your bank accounts automatically. Tap Received if the money reached you.",
      ],
      button: { label: "Review payments", url: `${siteUrl()}/dashboard/${business.id}/payments?status=pending` },
      footer: BUSINESS_FOOTER,
    });
    await sendEmail({ to: business.email, subject: `Receipt to check: ${amount}`, html, text });
  } catch (error) {
    console.error("notifyReceiptToReview failed", error);
  }
}

/** Tells a business someone new joined. */
export async function notifyNewMember(membershipId: string) {
  if (!emailConfigured()) return;
  try {
    const admin = createAdminClient();
    const { data: m } = await admin
      .from("memberships")
      .select("member_no, referred_by, joined_at, business:businesses(id, name, email)")
      .eq("id", membershipId)
      .maybeSingle();
    const business = m?.business as unknown as { id: string; name: string; email: string | null } | undefined;
    if (!m || !business?.email) return;
    // Joining twice returns the old membership; only announce brand-new ones.
    if (Date.now() - new Date(m.joined_at).getTime() > 120_000) return;
    const { html, text } = emailBody({
      heading: `New member at ${business.name}`,
      lines: [
        `Member #${String(m.member_no).padStart(4, "0")} just joined${m.referred_by ? " through a friend's invite" : ""}.`,
        m.member_no === 1 ? "That's your very first member. Congratulations!" : "Say hello when they come in.",
      ],
      button: { label: "See your customers", url: `${siteUrl()}/dashboard/${business.id}/customers` },
      footer: BUSINESS_FOOTER,
    });
    await sendEmail({ to: business.email, subject: `New member at ${business.name}`, html, text });
  } catch (error) {
    console.error("notifyNewMember failed", error);
  }
}

/** Tells a business about cross-promotion: a request to approve, a new partner, or an accepted request. */
export async function notifyPartnership(fromBusinessId: string, toBusinessId: string, kind: "request" | "joined" | "accepted") {
  if (!emailConfigured()) return;
  try {
    const { data } = await createAdminClient().from("businesses").select("id, name, email").in("id", [fromBusinessId, toBusinessId]);
    const from = data?.find((b) => b.id === fromBusinessId);
    const to = data?.find((b) => b.id === toBusinessId);
    if (!from || !to?.email) return;
    const copy = {
      request: {
        subject: `${from.name} wants to partner with you`,
        lines: [
          `${from.name} would like to cross-promote with ${to.name} on Spendbox.`,
          "If you accept, your perks show to their customers as “from our partners”, and theirs to yours.",
        ],
        button: "Review the request",
      },
      joined: {
        subject: `${from.name} is now your partner`,
        lines: [
          `${from.name} partnered with ${to.name}. You approve requests automatically, so it's already live.`,
          "Your perks now show to their customers, and theirs to yours. You can end it any time.",
        ],
        button: "See your partners",
      },
      accepted: {
        subject: `${from.name} accepted your partnership`,
        lines: [`${from.name} said yes. Your perks now show to their customers as “from our partners”, and theirs to yours.`],
        button: "See your partners",
      },
    }[kind];
    const { html, text } = emailBody({
      heading: copy.subject,
      lines: copy.lines,
      button: { label: copy.button, url: `${siteUrl()}/dashboard/${to.id}/partners` },
      footer: BUSINESS_FOOTER,
    });
    await sendEmail({ to: to.email, subject: copy.subject, html, text });
  } catch (error) {
    console.error("notifyPartnership failed", error);
  }
}
