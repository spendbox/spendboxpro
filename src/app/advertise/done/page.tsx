import type { Metadata } from "next";
import Link from "next/link";
import { confirmPayment, type PaymentOutcome } from "@/lib/ads";
import { Refresher } from "./refresher";

export const metadata: Metadata = { title: "Your booking" };

// The ad review can take a little while.
export const maxDuration = 60;

const fmt = (n: number) => n.toLocaleString("en-NG");
const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" });

/** Where Paystack sends people after paying: confirms the payment and shows what happens next. */
export default async function DonePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = sp.reference ?? sp.trxref;
  const reference = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  let outcome: PaymentOutcome;
  try {
    outcome = await confirmPayment(reference);
  } catch (error) {
    console.error("Confirming payment failed", error);
    outcome = { kind: "unknown" };
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-8">
      <Outcome outcome={outcome} />
      <div className="flex flex-col gap-2 text-center text-sm">
        <Link href="/" className="font-medium underline">
          Go to the city
        </Link>
        <Link href="/advertise" className="text-muted underline">
          Book another
        </Link>
      </div>
    </main>
  );
}

function Card({ title, children, tone = "plain" }: { title: string; children: React.ReactNode; tone?: "good" | "bad" | "plain" }) {
  const ring = tone === "good" ? "border-me" : tone === "bad" ? "border-hit" : "border-line";
  return (
    <section className={`rounded-2xl border-2 ${ring} bg-panel p-6`}>
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <div className="mt-3 flex flex-col gap-3 text-ink">{children}</div>
    </section>
  );
}

function Outcome({ outcome }: { outcome: PaymentOutcome }) {
  if (outcome.kind === "off") {
    return (
      <Card title="Payments aren't switched on yet">
        <p>Please check back soon.</p>
      </Card>
    );
  }
  if (outcome.kind === "unknown") {
    return (
      <Card title="We couldn't find that booking">
        <p>If you paid, don&apos;t worry: your payment is safe and we&apos;ll email you. You can also reply to your receipt email.</p>
      </Card>
    );
  }
  if (outcome.state === "not_paid") {
    return (
      <Card title="Payment not confirmed yet">
        <p>
          We haven&apos;t received confirmation of your payment for <b>{outcome.brand}</b> yet. If you paid, it can take a
          minute. This page checks again by itself.
        </p>
        <p className="text-sm text-muted">If you closed the payment page without paying, you can start again any time.</p>
        <Refresher seconds={10} />
      </Card>
    );
  }

  if (outcome.kind === "sponsor") {
    return (
      <Card title={outcome.state === "applied" ? "Your prize pool is live! 🏆" : "Thanks! You're in the queue 🏆"} tone="good">
        <p>
          <b>{fmt(outcome.coins)} coins</b> from <b>{outcome.brand}</b>{" "}
          {outcome.state === "applied"
            ? `are in the prize pool of round #${outcome.roundId}, the one starting now. Players see “Prize pool by ${outcome.brand}”.`
            : `will go into the next round that's free (one sponsor per round${
                outcome.queuedAhead > 0 ? `; ${outcome.queuedAhead} ahead of you` : ""
              }). Rounds start about every 70 minutes.`}
        </p>
        <p className="text-sm text-muted">A receipt is on its way to {outcome.email}. We&apos;ll email you when your round finishes.</p>
      </Card>
    );
  }

  const preview = (
    // eslint-disable-next-line @next/next/no-img-element -- the advertiser's own picture
    <img src={outcome.image} alt={outcome.headline} className="aspect-[2/1] w-full rounded-xl border border-line object-cover" />
  );
  if (outcome.state === "live" || outcome.state === "finished") {
    return (
      <Card title="Your ad is live! 🎉" tone="good">
        {preview}
        <p>
          <b>{outcome.brand}</b> is now on billboards in every city. You&apos;ll get {fmt(outcome.views)} views
          {outcome.endsAt ? ` by ${date(outcome.endsAt)}` : ""}.
        </p>
        <p className="text-sm text-muted">We&apos;ll email a short report to {outcome.email} every morning while it runs.</p>
      </Card>
    );
  }
  if (outcome.state === "rejected") {
    return (
      <Card title="We couldn't approve your ad" tone="bad">
        {preview}
        <p>{outcome.reason || "It doesn't meet our advertising policy."}</p>
        <p>
          <b>We&apos;ll refund you in full.</b> Refunds usually reach you within 5–10 working days. We&apos;ve emailed{" "}
          {outcome.email} with the details.
        </p>
        <p className="text-sm text-muted">
          You&apos;re welcome to make a new ad that follows our{" "}
          <Link href="/advertise/policy" className="underline">
            advertising policy
          </Link>
          .
        </p>
      </Card>
    );
  }
  if (outcome.state === "held") {
    return (
      <Card title="Thanks! We're checking your ad">
        {preview}
        <p>Your payment went through. A person on our team is taking a quick look before it goes live, usually within a day.</p>
        <p className="text-sm text-muted">Your 7 days only start once it&apos;s showing. We&apos;ll email {outcome.email}.</p>
      </Card>
    );
  }
  return (
    <Card title="Payment received! Checking your ad…">
      {preview}
      <p>We&apos;re checking your ad against our policy. This usually takes under a minute, and this page updates by itself.</p>
      <Refresher seconds={6} />
    </Card>
  );
}
