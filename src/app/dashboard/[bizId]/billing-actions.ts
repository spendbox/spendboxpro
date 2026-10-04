"use server";

import { randomUUID } from "node:crypto";
import { requireOwnedBusiness } from "@/lib/auth";
import { MONTH_CHOICES, PLANS, priceFor, type PlanKey } from "@/lib/billing";
import { siteUrl } from "@/lib/env";
import { initTransaction, paystackConfigured } from "@/lib/paystack";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

export type PayResult = { url: string; error?: undefined } | { url?: undefined; error: string };

/** Starts paying for a plan: saves the order, then sends the owner to Paystack. */
export async function startPayment(bizId: string, plan: PlanKey, months: number): Promise<PayResult> {
  const { user, business } = await requireOwnedBusiness(bizId);
  if (!(plan in PLANS)) return { error: "Pick a plan." };
  if (!MONTH_CHOICES.includes(months as (typeof MONTH_CHOICES)[number])) return { error: "Pick how many months." };
  if (!paystackConfigured()) return { error: "Payments aren't set up yet. Please contact Spendbox support." };

  const admin = createAdminClient();
  const { data: owner } = await admin.from("profiles").select("email").eq("id", user.id).maybeSingle();
  const email = (owner?.email as string | null) ?? business.email;
  if (!email) return { error: "Add an email in Profile or Settings first. Paystack sends your receipt there." };

  const amount = priceFor(plan, await getSettings()) * months;
  if (amount <= 0) return { error: "This plan is free right now, so there's nothing to pay." };
  const reference = `sbx_${randomUUID().replace(/-/g, "")}`;
  const { error } = await admin.from("business_payments").insert({ business_id: bizId, reference, plan, months, amount, method: "paystack" });
  if (error) return { error: "Couldn't start the payment. Please try again." };
  try {
    const url = await initTransaction({
      email,
      amountKobo: Math.round(amount * 100),
      reference,
      callbackUrl: `${siteUrl()}/api/paystack/callback`,
      metadata: { business_id: bizId, plan, months },
    });
    return { url };
  } catch (e) {
    console.error("Paystack initialize failed", e);
    await admin.from("business_payments").update({ status: "failed", note: "Couldn't reach Paystack" }).eq("reference", reference);
    return { error: "Couldn't reach Paystack. Please try again in a minute." };
  }
}
