import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "@/components/icons";
import { adPricing, advertiserAds } from "@/lib/ads";
import { paystackEnabled } from "@/lib/paystack";
import { myBusinesses } from "@/lib/business";
import { BusinessCard } from "./business-card";
import { AdCard, SignOutButton } from "./portal";
import { currentAdvertiserId } from "./session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Manage your ads",
  description: "See how your Newtown billboard ads are doing, change them, pause them or add budget.",
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
          <Link href="/advertise" className="inline-flex items-center gap-1 text-sm font-medium text-muted">
            <ArrowLeft className="size-4" />
            Advertising
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
  const businesses = await myBusinesses(me!).catch(() => []);
  const welcome = sp.welcome === "1";
  // Totals across everything the account runs, so the top of the page answers "is it working?".
  const total = (k: string) => businesses.reduce((n, b) => n + (b.hits[k] ?? 0), 0) + (k === "billboard" ? data.ads.reduce((n, a) => n + a.rewardedViews + a.freeViews, 0) : 0);
  const week = (k: string) => businesses.reduce((n, b) => n + (b.week[k] ?? 0), 0);
  const fmt = (n: number) => Math.round(n).toLocaleString("en-NG");
  const tiles: [string, number, number | null][] = [
    ["People who opened your card", total("view") + total("tap"), week("view") + week("tap")],
    ["Billboard views", total("billboard"), week("billboard")],
    ["Calls & WhatsApp", total("call") + total("whatsapp"), week("call") + week("whatsapp")],
    ["Directions & website", total("directions") + total("website"), week("directions") + week("website")],
  ];
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted">
            <ArrowLeft className="size-4" />
            Go to the city
          </Link>
          <h1 className="mt-3 font-display text-3xl font-bold">Your ads</h1>
          <p className="mt-1 truncate text-sm text-muted">Signed in as {data.email}</p>
        </div>
        <SignOutButton />
      </div>

      {welcome && (
        <p className="rounded-2xl bg-me/10 px-4 py-3 text-sm">
          <b>Payment received.</b> Your building lights up with your name within 24 hours. This is your ad page: bookmark it, or sign in any time with {data.email}.
        </p>
      )}

      {(businesses.length > 0 || data.ads.length > 0) && (
        <section className="grid grid-cols-2 gap-2">
          {tiles.map(([label, all, wk]) => (
            <div key={label} className="rounded-2xl bg-panel p-3 ring-1 ring-line">
              <p className="text-xs text-muted">{label}</p>
              <p className="font-display text-2xl font-extrabold tabular-nums">{fmt(all)}</p>
              {wk !== null && <p className="text-[11px] text-muted">{fmt(wk)} this week</p>}
            </div>
          ))}
        </section>
      )}

      {businesses.map((b) => (
        <BusinessCard key={b.id} b={b} />
      ))}

      {data.ads.length > 0 && (
        <>
          {businesses.length > 0 && <h2 className="font-display text-xl font-bold">Billboard ads</h2>}
          {data.ads.map((ad) => (
            <AdCard key={ad.id} ad={ad} pricing={pricing} payments={payments} />
          ))}
        </>
      )}

      {businesses.length === 0 && data.ads.length === 0 && (
        <section className="rounded-2xl border border-line bg-panel p-6 text-center">
          <p className="text-muted">Nothing running yet. Pick a building on the map and put your business on it.</p>
          <a href="/?advertise=1" className="mt-4 inline-block rounded-xl bg-gold px-5 py-3 font-semibold text-ink">
            Choose a building
          </a>
        </section>
      )}

      <p className="text-center text-sm text-muted">
        <a href="/?advertise=1" className="font-medium text-ink underline">
          Advertise on another building
        </a>{" "}
        ·{" "}
        <Link href="/advertise/policy" className="underline">
          Advertising policy
        </Link>
      </p>
    </main>
  );
}
