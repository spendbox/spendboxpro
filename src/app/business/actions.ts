"use server";

import { leasableAcross, leasableNear, leaseOffer, setBillboard, startLeaseCheckout, startUpgradeCheckout, type Checkout, type LeaseOffer } from "@/lib/business";
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

/** The advertising wizard: buildings free to lease near a place, up to a yearly budget. */
export async function findBuildings(region: string, x: number, z: number, maxNaira?: number): Promise<LeaseOffer[]> {
  try {
    return await leasableNear(String(region), Number(x) || 0, Number(z) || 0, maxNaira ? Number(maxNaira) : undefined);
  } catch (error) {
    console.error("Finding buildings failed", error);
    return [];
  }
}

/** The wizard with no area chosen: good picks across the city. */
export async function findBuildingsAnywhere(region: string, maxNaira?: number): Promise<LeaseOffer[]> {
  try {
    return await leasableAcross(String(region), maxNaira ? Number(maxNaira) : undefined);
  } catch (error) {
    console.error("Finding buildings failed", error);
    return [];
  }
}

/** One building's lease offer (the wizard's chosen building). */
export async function offerFor(buildingId: string) {
  return leaseOffer(String(buildingId));
}
