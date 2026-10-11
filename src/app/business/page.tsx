import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MapPin } from "@/components/icons";
import { leaseOffer } from "@/lib/business";
import { paystackEnabled } from "@/lib/paystack";
import { LeaseForm } from "./lease-form";

export const metadata: Metadata = {
  title: "Put your business on the map",
  description: "Lease a building in Newtown's Lagos for a year: your name, logo and real address, lit up for every player.",
};

/** A business leases a building: what it is and costs, then the form. */
export default async function BusinessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const building = (Array.isArray(sp.building) ? sp.building[0] : sp.building) ?? "";
  const offer = building ? await leaseOffer(building) : null;
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/play" className="inline-flex items-center gap-1 text-sm font-medium text-muted">
          <ArrowLeft className="size-4" />
          Back to the map
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold">Put your business on the map</h1>
        <p className="mt-2 text-muted">
          Lease a building in Lagos for a year. It shows your name and logo, glows for every player, opens a card with what you do, your real address and how to
          reach you, and puts your design on the city&apos;s billboards (swap it any time, free). It runs a year, or until your building and billboards have been
          tapped as many times as your lease covers: one tap for every ₦20. You&apos;ll see how many people tapped, called and asked for directions.
        </p>
      </div>
      {!offer ? (
        <section className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">
          Open the map, tap the building you want, and choose <b className="text-ink">Lease for your business</b>. Landmarks and buildings players own can&apos;t be leased.
        </section>
      ) : !offer.ok ? (
        <section className="rounded-2xl bg-hit/10 p-5 text-sm text-hit">{offer.error}</section>
      ) : (
        <>
          <section className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-panel p-5">
            <div>
              <p className="font-semibold">{offer.offer.what}</p>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                <MapPin className="size-3.5" /> {offer.offer.address} · {offer.offer.area}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-extrabold">₦{offer.offer.priceNaira.toLocaleString("en-NG")}</p>
              <p className="text-xs text-muted">a year</p>
            </div>
          </section>
          {paystackEnabled() ? <LeaseForm offer={offer.offer} /> : <p className="text-sm text-muted">Payments aren&apos;t switched on yet. Please check back soon.</p>}
        </>
      )}
      <p className="text-center text-sm text-muted">
        Already have a building?{" "}
        <Link href="/advertiser" className="font-medium text-ink underline">
          See your numbers and upgrade
        </Link>
      </p>
    </main>
  );
}
