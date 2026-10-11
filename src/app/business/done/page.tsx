import type { Metadata } from "next";
import Link from "next/link";
import { confirmBusinessPayment } from "@/lib/business";

export const metadata: Metadata = { title: "Your business", robots: { index: false } };

/** Back from Paystack: check the payment ourselves and say how it went. */
export default async function BusinessDone({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ref = (Array.isArray(sp.ref) ? sp.ref[0] : sp.ref) ?? "";
  const r = await confirmBusinessPayment(ref);
  const upgrade = ref.startsWith("bz-up-");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 py-8 text-center">
      {r.state === "live" ? (
        <>
          <h1 className="font-display text-3xl font-bold">{upgrade ? "Upgrade done!" : "You're on the map!"}</h1>
          <p className="text-muted">
            {upgrade ? "Your building has been upgraded and your business is on the billboards." : "Your building is lit up for every player in Lagos, for a year."} We&apos;ve
            emailed your receipt.
          </p>
        </>
      ) : r.state === "clash" ? (
        <>
          <h1 className="font-display text-3xl font-bold">That building was just taken</h1>
          <p className="text-muted">Someone got it moments before you. We&apos;ll refund you in full; reply to your receipt email, or choose another building.</p>
        </>
      ) : (
        <>
          <h1 className="font-display text-3xl font-bold">Waiting for your payment</h1>
          <p className="text-muted">If you paid, it can take a minute. Refresh this page, or sign in below to check.</p>
        </>
      )}
      <div className="flex justify-center gap-3">
        <Link href="/advertiser" className="rounded-xl bg-gold px-5 py-3 font-semibold text-ink">
          Your numbers
        </Link>
        <Link href="/play" className="rounded-xl border border-line px-5 py-3 font-semibold">
          See the map
        </Link>
      </div>
    </main>
  );
}
