"use server";

import { startAdCheckout, type CheckoutResult } from "@/lib/ads";

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
