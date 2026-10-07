import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { adPricing, advertiserAds } from "@/lib/ads";
import { paystackEnabled } from "@/lib/paystack";
import { AdCard, SignOutButton } from "./portal";
import { currentAdvertiserId } from "./session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Manage your ads",
  description: "See how your Hide & Seek billboard ads are doing, change them, pause them or add budget.",
  robots: { index: false },
};

/** The advertiser's own page: their ads with live numbers, and the controls. */
export default async function AdvertiserPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  // Links in our emails land here; the sign-in itself happens in /advertiser/enter (pages
  // can't set cookies).
  if (token) redirect(`/advertiser/enter?token=${encodeURIComponent(token)}`);

  const me = await currentAdvertiserId();
  const data = me ? await advertiserAds(me) : null;

  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-8">
        <div>
          <Link href="/advertise" className="text-sm font-medium text-muted">
            ← Advertising
          </Link>
          <h1 className="mt-3 font-display text-3xl font-bold">Manage your ads</h1>
          <p className="mt-2 text-muted">Sign in with the email you paid with. We&apos;ll send you a 4-digit code.</p>
        </div>
        {sp.link === "expired" && (
          <p className="rounded-xl bg-hit/10 px-4 py-3 text-sm text-hit">
            That link has expired or isn&apos;t valid any more. Sign in with your email instead.
          </p>
        )}
        <section className="rounded-2xl border border-line bg-panel p-5">
          <SignInForm />
        </section>
        <p className="text-center text-sm text-muted">
          No ad yet?{" "}
          <Link href="/advertise" className="font-medium text-ink underline">
            Put your brand on every billboard
          </Link>
        </p>
      </main>
    );
  }

  const pricing = await adPricing();
  const payments = paystackEnabled();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm font-medium text-muted">
            ← Go to the city
          </Link>
          <h1 className="mt-3 font-display text-3xl font-bold">Your ads</h1>
          <p className="mt-1 text-sm text-muted">Signed in as {data.email}</p>
        </div>
        <SignOutButton />
      </div>

      {data.ads.length === 0 ? (
        <section className="rounded-2xl border border-line bg-panel p-6 text-center">
          <p className="text-muted">You don&apos;t have any paid ads yet.</p>
          <Link href="/advertise" className="mt-4 inline-block rounded-xl bg-gold px-5 py-3 font-semibold text-ink">
            Create an ad
          </Link>
        </section>
      ) : (
        data.ads.map((ad) => <AdCard key={ad.id} ad={ad} pricing={pricing} payments={payments} />)
      )}

      <p className="text-center text-sm text-muted">
        <Link href="/advertise" className="font-medium text-ink underline">
          Create another ad
        </Link>{" "}
        ·{" "}
        <Link href="/advertise/policy" className="underline">
          Advertising policy
        </Link>
      </p>
    </main>
  );
}
