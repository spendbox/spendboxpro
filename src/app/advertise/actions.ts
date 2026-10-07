"use server";

import { startAdCheckout, startSponsorCheckout, type CheckoutResult } from "@/lib/ads";

// The two advertising forms. Each saves the details (and picture), then opens a Paystack
// payment page; the browser is sent there.

export async function checkoutAd(form: FormData): Promise<CheckoutResult> {
  try {
    return await startAdCheckout(form);
  } catch (error) {
    console.error("Ad checkout failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function checkoutSponsor(form: FormData): Promise<CheckoutResult> {
  try {
    return await startSponsorCheckout(form);
  } catch (error) {
    console.error("Sponsor checkout failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
