"use server";

import { setBillboard, startLeaseCheckout, startUpgradeCheckout, type Checkout } from "@/lib/business";
import { currentAdvertiserId } from "../advertiser/session";

// The business lease form and upgrades (src/lib/business.ts): the browser is sent to Paystack.

export async function checkoutLease(form: FormData): Promise<Checkout> {
  try {
    return await startLeaseCheckout(form);
  } catch (error) {
    console.error("Lease checkout failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function checkoutUpgrade(leaseId: string, upgrade: string, kind: string | null): Promise<Checkout> {
  const me = await currentAdvertiserId();
  if (!me) return { ok: false, error: "Please sign in again." };
  try {
    return await startUpgradeCheckout(me, leaseId, upgrade, kind);
  } catch (error) {
    console.error("Upgrade checkout failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** A new billboard design for a lease (free, any time). */
export async function changeBillboard(leaseId: string, form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await currentAdvertiserId();
  if (!me) return { ok: false, error: "Please sign in again." };
  try {
    return await setBillboard(me, leaseId, form);
  } catch (error) {
    console.error("Billboard change failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
