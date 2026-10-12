import type { Metadata } from "next";
import { adPlaces, leaseOffer } from "@/lib/business";
import { paystackEnabled } from "@/lib/paystack";
import { AdWizard } from "./wizard";

export const metadata: Metadata = {
  title: "Advertise, step by step",
  description: "Own a building on Newtown's Lagos map for a year: find one, add your business, pay once. From ₦20,000 a year.",
};

/** The advertising wizard: how it works (with pictures), find a building, your business, pay. */
export default async function AdStartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const building = (Array.isArray(sp.building) ? sp.building[0] : sp.building) ?? "";
  const offer = building ? await leaseOffer(building) : null;
  return <AdWizard places={adPlaces("lagos")} start={offer && offer.ok ? offer.offer : null} startError={offer && !offer.ok ? offer.error : null} canPay={paystackEnabled()} />;
}
