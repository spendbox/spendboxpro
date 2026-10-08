import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, PartyPopper, Trophy, type LucideIcon } from "@/components/icons";
import { confirmPayment, type PaymentOutcome } from "@/lib/ads";
import { ManageButton } from "./manage-button";
import { Refresher } from "./refresher";

export const metadata: Metadata = { title: "Your booking", robots: { index: false } };

const fmt = (n: number) => Math.round(n).toLocaleString("en-NG");
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
      <Outcome outcome={outcome} reference={reference} />
      <div className="flex flex-col gap-2 text-center text-sm">
        <Link href="/" className="font-medium underline">
          Go to the city
        </Link>
      </div>
    </main>
  );
}

function Card({
  title,
  icon: Icon,
  children,
  tone = "plain",
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  tone?: "good" | "plain";
}) {
  return (
    <section className={`rounded-2xl border-2 ${tone === "good" ? "border-me" : "border-line"} bg-panel p-6`}>
      <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
        {Icon && <Icon className="size-7 shrink-0 text-me" strokeWidth={2.25} />}
        {title}
      </h1>
      <div className="mt-3 flex flex-col gap-3 text-ink">{children}</div>
    </section>
  );
}

function Outcome({ outcome, reference }: { outcome: PaymentOutcome; reference: string }) {
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
          We haven&apos;t received confirmation of your payment for <b>{outcome.brand}</b> yet. If you paid, it can take a minute. This
          page checks again by itself.
        </p>
        <p className="text-sm text-muted">If you closed the payment page without paying, you can start again any time.</p>
        <Refresher seconds={10} />
      </Card>
    );
  }

  if (outcome.kind === "sponsor") {
    return (
      <Card title={outcome.state === "applied" ? "Your prize pool is live!" : "Thanks! You're in the queue"} icon={Trophy} tone="good">
        <p>
          <b>{fmt(outcome.coins)} coins</b> from <b>{outcome.brand}</b>{" "}
          {outcome.state === "applied"
            ? `are in the prize pool of round #${outcome.roundId}, the one starting now.`
            : `will go into the next free round (one sponsor per round, in order${
                outcome.queuedAhead > 0 ? `; ${outcome.queuedAhead} ahead of you` : ""
              }).`}
        </p>
        <p className="text-sm text-muted">A receipt is on its way to {outcome.email}.</p>
      </Card>
    );
  }

  if (outcome.kind === "topup") {
    return (
      <Card title="Top-up received!" icon={CircleCheck} tone="good">
        <p>
          <b>{fmt(outcome.coins)} coins</b> were added to your ad for <b>{outcome.brand}</b>: about {fmt(outcome.taps)} more players tapping
          it. It&apos;s showing now.
        </p>
        <ManageButton reference={reference} />
        <p className="text-sm text-muted">A receipt is on its way to {outcome.email}.</p>
      </Card>
    );
  }

  return (
    <Card title={outcome.state === "other" ? "Payment received" : "Your ad is live!"} icon={outcome.state === "other" ? CircleCheck : PartyPopper} tone="good">
      {/* eslint-disable-next-line @next/next/no-img-element -- the advertiser's own picture */}
      <img src={outcome.image} alt={outcome.headline} className="aspect-[2/1] w-full rounded-xl border border-line object-cover" />
      {outcome.state === "other" ? (
        <p>Thanks, your payment went through. We&apos;ll email {outcome.email} about your ad.</p>
      ) : (
        <p>
          <b>{outcome.brand}</b> is on billboards in every city now, with <b>{fmt(outcome.coins)} coins</b> for players: about{" "}
          {fmt(outcome.taps)} people tapping your ad{outcome.endsAt ? `, until ${date(outcome.endsAt)}` : ""}.
        </p>
      )}
      <ManageButton reference={reference} />
      <p className="text-sm text-muted">
        A receipt is on its way to {outcome.email}, with your &ldquo;Manage your ad&rdquo; link. We&apos;ll send a short report every
        morning while it runs.
      </p>
    </Card>
  );
}
