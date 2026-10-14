"use server";

import { adPricing, startAdCheckout, type AdPricing, type CheckoutResult } from "@/lib/ads";

// The ad form: saves the details (and picture), then opens a Paystack payment page; the
// browser is sent there. (Prize pool sponsorships are no longer sold here.)

export async function checkoutAd(form: FormData): Promise<CheckoutResult> {
  try {
    return await startAdCheckout(form);
  } catch (error) {
    console.error("Ad checkout failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** What billboard ads cost now (smallest weekly budget, most weeks...), for the wizard on the map. */
export async function billboardPricing(): Promise<AdPricing> {
  return adPricing();
}
