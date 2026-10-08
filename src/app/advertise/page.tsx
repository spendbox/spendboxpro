import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, Plus } from "@/components/icons";
import { adPricing } from "@/lib/ads";
import { paystackEnabled } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdForm } from "./advertise-forms";

export const metadata: Metadata = {
  title: "Advertise",
  description: "Put your brand on every billboard in the Hide & Seek city. From ₦5,000 a week, live in minutes.",
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

const fmt = (n: number) => Math.round(n).toLocaleString("en-NG");

export default async function AdvertisePage() {
  await connection(); // live numbers on every visit
  const [pricing, s] = await Promise.all([adPricing(), stats()]);
  const enabled = paystackEnabled();
  const ngnPerCoin = Math.round(1 / pricing.coinsPerNgn);

  const faq: [string, React.ReactNode][] = [
    [
      "What exactly am I paying for?",
      <>
        Real people looking at your ad. Your budget becomes a pool of coins (₦{fmt(ngnPerCoin)} = 1 coin). Each signed-in player who
        taps your billboard to look at it gets {fmt(pricing.viewReward)} coins from your pool. That tap is a <b>paid view</b>.
      </>,
    ],
    [
      "Do I pay when my billboard is just on screen?",
      "No. Billboards passing by on someone's screen are never charged. You only pay when a player chooses to tap and look.",
    ],
    [
      "What are free views?",
      `People watching without an account can tap your ad too, and so can players who've already earned coins from ${fmt(
        pricing.rewardsPerDay,
      )} ads today. They get no coins, and those views are free for you. Link clicks are free too.`,
    ],
    [
      "Can one person drain my budget?",
      `No. Each player can earn from your ad once a day, and from ${fmt(pricing.rewardsPerDay)} ads a day at most.`,
    ],
    [
      "What happens when my coins run out, or my weeks end?",
      "Your ad stops showing. You can top up any time to keep it going. Unused coins at the end of your run expire, so we spread your coins evenly over your weeks.",
    ],
    ["Can I change my ad?", "Yes. Change the picture, headline or link, pause or resume, and top up from your ad page. Changes go live in minutes."],
    ["Who will see it?", "Adults (18+) playing and watching Hide & Seek, mostly in Nigeria, in every city on the map."],
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-10 px-4 py-8">
      <div>
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1 text-sm font-medium text-muted">
            <ArrowLeft className="size-4" />
            Back to the city
          </Link>
          <Link href="/advertiser" className="text-sm font-medium text-muted underline">
            Manage your ads
          </Link>
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-gold-dark">Advertise on Hide &amp; Seek</p>
        <h1 className="mt-1 font-display text-4xl font-bold leading-tight sm:text-5xl">Put your brand on every billboard in the city</h1>
        <p className="mt-3 text-lg text-muted">
          Players get coins for tapping your ad, so they actually look. You only pay for real taps. From ₦{fmt(pricing.minWeeklyNgn)} a
          week, live in minutes.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a href="#book" className="rounded-xl bg-gold px-5 py-3 font-semibold text-ink shadow-sm">
            Create my ad
          </a>
          {s.players > 0 && (
            <span className="text-sm text-muted">
              {fmt(s.players)} players{s.visits > 0 ? ` · ${fmt(s.visits)} visits so far` : ""}
            </span>
          )}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Step n={1} title="Pay" text="Pick a weekly budget and how many weeks. Pay with Paystack." />
        <Step n={2} title="Upload" text="Add your picture, headline and (optional) link." />
        <Step n={3} title="Live" text="Your ad is on billboards straight away. Track it from your ad page." />
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5">
        <h2 className="font-display text-xl font-bold">How it works</h2>
        <p className="mt-2 text-ink">
          Your budget fills your ad with coins (₦{fmt(ngnPerCoin)} = 1 coin). Every player who taps your billboard gets{" "}
          {fmt(pricing.viewReward)} coins from it, so <b>₦{fmt(pricing.viewReward * ngnPerCoin)} buys one person really looking</b> at
          your ad.
        </p>
        <p className="mt-2 text-sm text-muted">
          People watching without an account can tap your ad too: free for you. Players are adults (18+).
        </p>
      </section>

      <div id="book" className="scroll-mt-4">
        {enabled ? (
          <AdForm pricing={pricing} />
        ) : (
          <section className="rounded-2xl border border-line bg-panel-2 p-5 text-center">
            <h2 className="font-display text-xl font-bold">Payments aren&apos;t switched on yet</h2>
            <p className="mt-2 text-muted">We&apos;re getting ready to take bookings. Please check back soon.</p>
          </section>
        )}
      </div>

      <section>
        <h2 className="font-display text-xl font-bold">Questions</h2>
        <div className="mt-3 flex flex-col gap-2">
          {faq.map(([q, a]) => (
            <details key={q} className="group rounded-xl border border-line bg-panel px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                {q}
                <Plus className="size-5 shrink-0 text-muted transition group-open:rotate-45" />
              </summary>
              <p className="mt-2 text-sm text-ink">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="text-center text-sm text-muted">
        Please read our{" "}
        <Link href="/advertise/policy" className="font-medium text-ink underline">
          advertising policy
        </Link>{" "}
        before you book.
      </p>
    </main>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold font-display font-bold text-ink">{n}</div>
      <h3 className="mt-2 font-display text-lg font-bold">{title}</h3>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
