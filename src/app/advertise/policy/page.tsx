import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { AD_POLICY } from "@/lib/ads";

export const metadata: Metadata = {
  title: "Advertising policy",
  description: "What you can and can't advertise on Hide & Seek.",
};

export default function PolicyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <div>
        <Link href="/advertise" className="inline-flex items-center gap-1 text-sm font-medium text-muted">
          <ArrowLeft className="size-4" />
          Back to advertising
        </Link>
        <h1 className="mt-3 font-display text-3xl font-bold">Advertising policy</h1>
        <p className="mt-2 text-muted">We want ads players are happy to see. These rules apply to every ad: the picture, the words and the link.</p>
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

      <Section title="If an ad breaks the rules">
        <p>
          Ads go live as soon as they&apos;re paid, and the same rules apply to any changes you make later. We may take down an ad
          that breaks these rules, or after a valid complaint (for example, from a trademark owner). If we do, we&apos;ll tell you why
          and refund the part of your budget that hasn&apos;t been used yet.
        </p>
      </Section>

      <Section title="Who sees your ad">
        <p>
          Hide &amp; Seek is for adults (18 and over), mostly in Nigeria. You pay only when a signed-in player taps your billboard to
          look at your ad. Each player can do that once a day per ad, so your numbers are real people, not one person tapping again
          and again.
        </p>
      </Section>

      <Section title="Your responsibilities">
        <p>
          You confirm that you have the right to use everything in your ad (pictures, logos, names and claims), that it&apos;s honest,
          and that what you&apos;re advertising is legal in Nigeria. You&apos;re responsible for the website your link goes to.
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
