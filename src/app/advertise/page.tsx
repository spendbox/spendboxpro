import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, Plus } from "@/components/icons";
import { LEASE_MIN } from "@/lib/world/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { Logo } from "@/components/logo";
import { CONTACT_EMAIL, SITE_DOMAIN } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Advertise",
  description: "Lease a building in Newtown's Lagos for a year, with your design on the city's billboards. From ₦20,000 a year.",
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

/** Taps each ₦ of a lease buys (the database's lease_naira_per_click). */
const NAIRA_PER_TAP = 20;

export default async function AdvertisePage() {
  await connection(); // live numbers on every visit
  const s = await stats();

  const faq: [string, React.ReactNode][] = [
    [
      "What am I paying for?",
      <>
        A building in Newtown&apos;s Lagos for a year: your name and logo on it, lit up for every player, a card with what you do and how to reach you, and your
        own design on the city&apos;s billboards. Prices start at ₦{fmt(LEASE_MIN)} a year, by the building&apos;s size and where it is.
      </>,
    ],
    [
      "How long does it run?",
      <>
        A year, or until people have tapped your building or your billboard (opening your card) as many times as your lease covers, whichever comes first.
        Each ₦{NAIRA_PER_TAP} of your lease covers one tap: a ₦{fmt(LEASE_MIN)} lease covers {fmt(LEASE_MIN / NAIRA_PER_TAP)} taps.
      </>,
    ],
    ["Can I change my billboard?", "Yes, any time and free: upload a new design from your business page and it's on the billboards in minutes."],
    ["Do players get paid to look?", "No. Players don't get mint for tapping ads; they tap because they're interested."],
    ["What do I see?", "Building taps, card views, billboard views, calls, WhatsApp messages, website visits and directions, all time and this week."],
    ["Who will see it?", "Adults (18+) living their lives in Newtown's Lagos, mostly in Nigeria."],
    ["How do I reach you?", `Email ${CONTACT_EMAIL} and a real person will get back to you. Newtown lives at ${SITE_DOMAIN}.`],
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-10 px-4 py-8">
      <div>
        <div className="flex items-center justify-between">
          <Link href="/play" className="flex items-center gap-1 text-sm font-medium text-muted">
            <ArrowLeft className="size-4" />
            Back to the city
          </Link>
          <Link href="/advertiser" className="text-sm font-medium text-muted underline">
            Your business page
          </Link>
        </div>
        <Logo size={34} className="mt-6" />
        <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-gold-dark">Advertise on Newtown</p>
        <h1 className="mt-1 font-display text-4xl font-bold leading-tight sm:text-5xl">Own a building in Lagos, and the billboards with it</h1>
        <p className="mt-3 text-lg text-muted">
          Lease a real-looking building for a year with your name and logo on it, and put your design on the city&apos;s billboards. From ₦{fmt(LEASE_MIN)} a year.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href="/advertise/start" className="rounded-xl bg-gold px-5 py-3 font-semibold text-ink shadow-sm">
            Start: find a building
          </Link>
          {s.players > 0 && (
            <span className="text-sm text-muted">
              {fmt(s.players)} players{s.visits > 0 ? ` · ${fmt(s.visits)} visits so far` : ""}
            </span>
          )}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Step n={1} title="Choose" text="Open the map, tap a building and choose Lease. Landmarks and players' buildings aren't for lease." />
        <Step n={2} title="Pay once" text="One payment through Paystack for the year: your name, logo, details and billboard design." />
        <Step n={3} title="Live" text="Your building glows and your billboards go up. Swap the design any time from your business page." />
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5">
        <h2 className="font-display text-xl font-bold">How long it runs</h2>
        <p className="mt-2 text-ink">
          A year, or until people have tapped your building or billboard as many times as your lease covers (<b>one tap for every ₦{NAIRA_PER_TAP}</b>),
          whichever comes first. Your business page shows how many are left.
        </p>
        <p className="mt-2 text-sm text-muted">Players are adults (18+). Nobody is paid to tap your ad.</p>
      </section>

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
        before you lease.
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
