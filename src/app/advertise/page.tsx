import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, Plus } from "@/components/icons";
import { LEASE_MIN } from "@/lib/world/business";
import { createAdminClient } from "@/lib/supabase/admin";
import { PicBillboard, PicBuilding, PicCard, PicChart, PicMap, PicStreet } from "./pictures";
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
    <main className="min-h-screen bg-bg">
      {/* The top: what it is, a picture, and the one button. */}
      <section className="bg-gradient-to-b from-[#1c2a5a] to-[#3b2a1a] text-white">
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-6">
          <div className="flex items-center justify-between">
            <Link href="/play" className="flex items-center gap-1 text-sm font-medium text-white/70">
              <ArrowLeft className="size-4" />
              Back to the city
            </Link>
            <Link href="/advertiser" className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium">
              Your business page
            </Link>
          </div>
          <div className="mt-6 grid items-center gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-gold">Advertise on Newtown</p>
              <h1 className="mt-1 font-display text-4xl font-extrabold leading-tight">Own a building in Lagos. Light it up with your name.</h1>
              <p className="mt-3 text-white/75">
                A real spot on the Lagos map for a year, your design on the city&apos;s billboards, and players tapping through to call you. From ₦{fmt(LEASE_MIN)}, paid once.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link href="/advertise/start" className="rounded-full bg-gold px-6 py-3 font-semibold text-ink shadow-lg">
                  Get started
                </Link>
                {s.players > 0 && (
                  <span className="text-sm text-white/70">
                    {fmt(s.players)} players{s.visits > 0 ? ` · ${fmt(s.visits)} visits` : ""}
                  </span>
                )}
              </div>
            </div>
            <PicStreet />
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10">
        <section>
          <h2 className="font-display text-2xl font-bold">How it works</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Step n={1} pic={<PicMap />} title="Pick a building" text="Any building nobody owns. Search an area, or choose from good picks across Lagos." />
            <Step n={2} pic={<PicBillboard />} title="Pay once" text="One payment for the year through Paystack. See your ad on a billboard before you pay." />
            <Step n={3} pic={<PicBuilding />} title="Go live" text="Your building lights up with your name within 24 hours. Upload your billboard design any time." />
          </div>
        </section>

        <section className="grid gap-4 rounded-3xl bg-panel p-5 shadow-sm ring-1 ring-line sm:grid-cols-[8rem_1fr] sm:items-center">
          <div className="mx-auto w-28 sm:w-full">
            <PicCard />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">What players see</h2>
            <p className="mt-1 text-muted">
              Tapping your building or billboard opens your card: what you do, your real address, and buttons to call, WhatsApp, visit your website or get
              directions. You see every tap, call and direction asked for.
            </p>
          </div>
        </section>

        <section className="grid gap-4 rounded-3xl bg-panel p-5 shadow-sm ring-1 ring-line sm:grid-cols-[8rem_1fr] sm:items-center">
          <div className="mx-auto w-28 sm:w-full">
            <PicChart />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">How long it runs</h2>
            <p className="mt-1 text-muted">
              A year, or until people have tapped your building or billboard as many times as your lease covers (<b className="text-ink">one tap for every ₦{NAIRA_PER_TAP}</b>), whichever
              comes first. Players are adults (18+) and nobody is paid to tap.
            </p>
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold">Questions</h2>
          <div className="mt-3 flex flex-col gap-2">
            {faq.map(([q, a]) => (
              <details key={q} className="group rounded-2xl bg-panel px-4 py-3 shadow-sm ring-1 ring-line">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                  {q}
                  <Plus className="size-5 shrink-0 text-muted transition group-open:rotate-45" />
                </summary>
                <p className="mt-2 text-sm text-ink">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-gradient-to-br from-gold/30 to-gold/5 p-6 text-center">
          <p className="font-display text-2xl font-bold">Ready to light up Lagos?</p>
          <Link href="/advertise/start" className="mt-4 inline-block rounded-full bg-ink px-6 py-3 font-semibold text-white">
            Get started
          </Link>
          <p className="mt-3 text-sm text-muted">
            Please read our{" "}
            <Link href="/advertise/policy" className="font-medium text-ink underline">
              advertising policy
            </Link>{" "}
            first.
          </p>
        </section>
      </div>
    </main>
  );
}

function Step({ n, pic, title, text }: { n: number; pic: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-3xl bg-panel p-4 shadow-sm ring-1 ring-line">
      <div className="mx-auto mb-2 w-28">{pic}</div>
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-gold font-display text-sm font-bold text-ink">{n}</span>
        <h3 className="font-display text-lg font-bold">{title}</h3>
      </div>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
  );
}
