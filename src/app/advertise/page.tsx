import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { adPricing } from "@/lib/ads";
import { paystackEnabled } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdvertiseForms } from "./advertise-forms";

export const metadata: Metadata = {
  title: "Advertise",
  description: "Put your brand on the billboards of Hide & Seek, or sponsor a prize pool.",
};

async function stats() {
  try {
    const db = createAdminClient();
    const [visits, players] = await Promise.all([
      db.from("site_counters").select("value").eq("key", "visits").maybeSingle(),
      db.from("profiles").select("id", { count: "exact", head: true }).eq("is_bot", false),
    ]);
    return { visits: Number(visits.data?.value ?? 0), players: players.count ?? 0 };
  } catch {
    return { visits: 0, players: 0 };
  }
}

const fmt = (n: number) => n.toLocaleString("en-NG");

export default async function AdvertisePage() {
  await connection(); // live numbers on every visit
  const [pricing, s] = await Promise.all([adPricing(), stats()]);
  const enabled = paystackEnabled();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-8">
      <div>
        <Link href="/" className="text-sm font-medium text-muted">
          ← Back to the city
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Advertise on Hide &amp; Seek</h1>
        <p className="mt-2 text-lg text-muted">
          Put your brand on the billboards of a live 3D city that players explore all day, or sponsor a prize pool they play
          for. No account needed: fill in a form, pay with Paystack, and you can be live in minutes.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Visits so far" value={fmt(s.visits)} />
        <Stat label="Players" value={fmt(s.players)} />
        <Stat label="Cities" value="Every one" />
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5">
        <h2 className="font-display text-xl font-bold">How pricing works</h2>
        <ul className="mt-3 flex flex-col gap-2 text-ink">
          <li>
            <b>1 slot = {fmt(pricing.viewsPerSlot)} views</b> of your billboard across every city, within {pricing.days} days.
            One slot costs <b>₦{fmt(pricing.slotPriceNgn)}</b>. Buy 1 to {pricing.maxSlots} slots.
          </li>
          <li>
            Every billboard in every city takes turns showing the ads, so you&apos;re buying a guaranteed number of views, not
            a spot. If you&apos;re ever behind schedule we show your ad more often, and it keeps showing until you&apos;ve
            had every view you paid for.
          </li>
          <li>
            Players who tap your billboard to look at it earn {pricing.openCoins} coins, so people actually want to see it.
          </li>
          <li>You get a short report by email every morning: views, taps, link clicks and when you&apos;ll finish.</li>
          <li>
            <b>Prize pool sponsors</b> add coins to a round&apos;s prize pool (₦{fmt(Math.round(1 / pricing.sponsorCoinsPerNgn))} = 1
            coin, from ₦{fmt(pricing.sponsorMinNgn)}). Everyone playing that round sees “Prize pool by your brand”.
          </li>
        </ul>
      </section>

      {enabled ? (
        <AdvertiseForms pricing={pricing} />
      ) : (
        <section className="rounded-2xl border border-line bg-panel-2 p-5 text-center">
          <h2 className="font-display text-xl font-bold">Payments aren&apos;t switched on yet</h2>
          <p className="mt-2 text-muted">We&apos;re getting ready to take bookings. Please check back soon.</p>
        </section>
      )}

      <p className="text-center text-sm text-muted">
        Before you book, please read our{" "}
        <Link href="/advertise/policy" className="font-medium text-ink underline">
          advertising policy
        </Link>
        . Every ad is checked before it goes live.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="font-display text-2xl font-bold">{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}
