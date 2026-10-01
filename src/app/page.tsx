import {
  ArrowRight,
  Check,
  Landmark,
  LockKeyhole,
  QrCode,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { PerkCard } from "@/components/perks/perk-card";
import { ButtonLink } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
            <a href="#how" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-black/5 md:block">
              How it works
            </a>
            <a href="#customers" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-black/5 md:block">
              For customers
            </a>
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-black/5">
              Log in
            </Link>
            <ButtonLink href="/start" size="sm" className="h-10 px-4">
              Get started
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-12 px-5 pt-12 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pt-20 lg:pb-24">
            <div className="flex flex-col gap-6">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800">
                <Sparkles className="size-4" aria-hidden /> Free trial for small businesses
              </span>
              <h1 className="font-display text-[2.6rem] leading-[1.02] font-extrabold tracking-tight text-ink sm:text-6xl">
                Turn your customers into regulars.
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-muted">
                Share one link. Customers join with their phone number, upload their payment receipts, and earn the
                perks you choose. You keep your customer list — Spendbox keeps count.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/start" size="lg">
                  Start your free trial <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
                <ButtonLink href="#how" size="lg" variant="secondary">
                  See how it works
                </ButtonLink>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2">
                {["Ready in a minute", "We never touch your money", "Customers control their data"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="size-4 text-brand-600" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <HeroVisual />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 bg-canvas">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-brand-700">How it works</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Three steps. No new habits.
              </h2>
            </div>
            <ol className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                {
                  icon: QrCode,
                  title: "Share your link",
                  body: "Post it on your WhatsApp status, send it after a sale, or print the QR code for your counter.",
                },
                {
                  icon: Users,
                  title: "Customers join with their phone",
                  body: "No app to download. They get your welcome perk and keep you in their Spendbox.",
                },
                {
                  icon: ScanLine,
                  title: "Receipts count themselves",
                  body: "Customers upload their transfer receipt. Spendbox reads it, checks it against your bank accounts and counts the visit.",
                },
              ].map((step, i) => (
                <li key={step.title} className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-card ring-1 ring-line">
                  <div className="flex items-center justify-between">
                    <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                      <step.icon className="size-5" aria-hidden />
                    </div>
                    <span className="font-display text-4xl font-extrabold text-brand-100">{i + 1}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{step.title}</h3>
                    <p className="mt-1.5 leading-relaxed text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Perks */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-brand-700">Perks</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Rewards that run themselves
              </h2>
              <p className="mt-3 text-lg text-muted">
                Pick a card, name the reward, done. Spendbox tracks who earned what and tells you when to hand it over.
              </p>
            </div>
          </div>
          <div className="-mx-5 mt-10 flex snap-x gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 [&>*]:w-[82%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto">
            <PerkCard kind="welcome" title="Free drink on your first order" />
            <PerkCard kind="visits" title="Your 5th meal is on us" threshold={5} />
            <PerkCard kind="referral" title="Free small chops for every friend" />
            <PerkCard kind="spend" title="10% off your next order" threshold={50000} />
            <PerkCard kind="birthday" title="Birthday cake slice" />
            <div className="flex min-h-48 flex-col justify-center gap-2 rounded-3xl border-2 border-dashed border-line-strong p-6">
              <p className="font-display text-xl font-bold">Your own ideas</p>
              <p className="text-muted">Extra meat, a free trim, delivery on us — whatever brings your people back.</p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="bg-canvas">
          <div className="mx-auto grid grid-cols-1 max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-24">
            <div>
              <p className="text-sm font-semibold text-brand-700">For businesses</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Everything in one place, nothing extra to do
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {[
                {
                  icon: Users,
                  title: "A customer list that stays yours",
                  body: "Lose your phone or a staff member, and your customers stay with you.",
                },
                {
                  icon: ReceiptText,
                  title: "Every receipt in one list",
                  body: "No more scrolling WhatsApp for “I’ve paid” screenshots. Tap “Not received” if one didn’t land.",
                },
                {
                  icon: Landmark,
                  title: "Checked against your accounts",
                  body: "Add every bank account you get paid into. Receipts are matched to the right one automatically.",
                },
                {
                  icon: ShieldCheck,
                  title: "Hard to cheat",
                  body: "Each receipt counts once, and perks are taken back if a payment never arrives.",
                },
              ].map((f) => (
                <div key={f.title} className="flex flex-col gap-3">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-white text-brand-700 shadow-card ring-1 ring-line">
                    <f.icon className="size-5" aria-hidden />
                  </div>
                  <h3 className="text-lg font-bold">{f.title}</h3>
                  <p className="leading-relaxed text-muted">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Customers */}
        <section id="customers" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 sm:px-8 lg:py-24">
          <div className="grid grid-cols-1 gap-8 overflow-hidden rounded-4xl bg-ink p-8 text-white sm:p-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-brand-200">Shopping, not selling?</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                One Spendbox for every business you love
              </h2>
              <p className="mt-4 max-w-xl text-lg text-white/90">
                Spendbox is invite-only for customers. Ask a business you buy from for their link, join with your phone
                number, and share them with friends.
              </p>
            </div>
            <ul className="flex flex-col gap-4">
              {[
                { icon: LockKeyhole, text: "Your details stay private unless you choose to share them, business by business." },
                { icon: Check, text: "Update your name or birthday once — it updates everywhere." },
                { icon: ShieldCheck, text: "Delete your account and everything in it, any time." },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-3 rounded-2xl bg-white/10 p-4">
                  <item.icon className="mt-0.5 size-5 shrink-0 text-brand-200" aria-hidden />
                  <span className="text-white/95">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-6 rounded-4xl bg-brand-600 p-8 text-white sm:p-12 md:flex-row md:items-center">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight">Get your Spendbox link today</h2>
              <p className="mt-2 text-lg text-white/90">Start with a free trial. Your first customers can join in minutes.</p>
            </div>
            <ButtonLink href="/start" size="lg" variant="secondary" className="ring-0">
              Get started <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 px-5 py-8 text-sm text-muted sm:flex-row sm:px-8">
          <p>© {new Date().getFullYear()} Spendbox</p>
          <div className="flex gap-5">
            <Link href="/login" className="hover:text-ink">
              Log in
            </Link>
            <Link href="/start" className="hover:text-ink">
              For businesses
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** A phone showing the customer app, with perk cards floating beside it. */
function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden>
      <div className="absolute inset-x-6 top-10 bottom-0 -z-10 rounded-[48px] bg-brand-50" />
      <div className="mx-auto w-[300px] rounded-[44px] bg-ink p-3 shadow-lift sm:w-[320px]">
        <div className="flex flex-col gap-3 overflow-hidden rounded-[34px] bg-canvas p-4">
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-xs text-muted">Good evening</p>
              <p className="font-display text-xl font-bold">Hi Tunde</p>
            </div>
            <span className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-semibold text-accent-700">2 perks ready</span>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-line">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-brand-600 font-display text-sm font-bold text-white">
                MT
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">Mama Tee&apos;s Kitchen</p>
                <p className="text-xs text-muted">Member #0412</p>
              </div>
            </div>
            <div className="mt-3 flex gap-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={`h-2 flex-1 rounded-full ${i <= 4 ? "bg-brand-600" : "bg-line"}`} />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">4 of 5 · free drink</p>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-line">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-[#4338A0] font-display text-sm font-bold text-white">
                KB
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">Kingz Barbers</p>
                <p className="text-xs text-muted">1 of 6 · free beard trim</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-3xl bg-brand-600 p-4 text-white">
            <ScanLine className="size-5" />
            <div>
              <p className="text-sm font-bold">Receipt matched</p>
              <p className="text-xs text-white/90">₦5,000 · Moniepoint •••4821</p>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute top-24 -left-2 hidden w-44 -rotate-6 sm:block lg:-left-10">
        <PerkCard kind="welcome" title="Free extra meat" size="sm" className="shadow-lift" />
      </div>
      <div className="absolute -right-2 bottom-14 hidden w-44 rotate-6 sm:block lg:-right-10">
        <PerkCard kind="birthday" title="Birthday treat" size="sm" className="shadow-lift" />
      </div>
    </div>
  );
}
