import type { Metadata } from "next";
import Link from "next/link";
import { AD_POLICY } from "@/lib/ad-review";

export const metadata: Metadata = {
  title: "Advertising policy",
  description: "What you can and can't advertise on Hide & Seek.",
};

export default function PolicyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/advertise" className="text-sm font-medium text-muted">
          ← Back to advertising
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold">Advertising policy</h1>
        <p className="mt-2 text-muted">
          We want ads that players are happy to see, and advertisers who are happy they booked. These rules apply to billboard
          ads and prize pool sponsors (names and logos). Every ad is checked before it goes live.
        </p>
      </div>

      <Section title="Not allowed">
        <ul className="list-disc space-y-1.5 pl-5">
          {AD_POLICY.notAllowed.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Section>

      <Section title="The basics">
        <ul className="list-disc space-y-1.5 pl-5">
          {AD_POLICY.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Section>

      <Section title="How checking works">
        <p>
          After you pay, your picture, headline and link are checked against this policy, usually in under a minute. Sometimes
          a person on our team takes a look too, which can take up to a day. Your 7 days of
          showing only start once your ad is live.
        </p>
      </Section>

      <Section title="If we can't approve your ad">
        <p>
          We&apos;ll tell you why by email and refund your payment in full (refunds usually arrive within 5–10 working days).
          You&apos;re welcome to make a new ad that follows the rules.
        </p>
        <p>
          We may also take down an ad that is already live if we find it breaks these rules or we receive a valid complaint
          (for example, from a trademark owner). If that happens, we&apos;ll refund the views you haven&apos;t had yet.
        </p>
      </Section>

      <Section title="Who sees your ad">
        <p>
          Hide &amp; Seek is a game for adults (18 and over), played mostly in Nigeria. Views are counted when your billboard is
          on a player&apos;s screen. We limit how many views one person can add in an hour, so your numbers are real people,
          not one person refreshing.
        </p>
      </Section>

      <Section title="Your responsibilities">
        <p>
          You confirm that you have the right to use everything in your ad (pictures, logos, names and claims), that your ad is
          honest, and that what you&apos;re advertising is legal in Nigeria. You&apos;re responsible for the website your
          link goes to.
        </p>
      </Section>

      <p className="text-sm text-muted">Questions about this policy? Reply to any email we&apos;ve sent you.</p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-5">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-ink">{children}</div>
    </section>
  );
}
