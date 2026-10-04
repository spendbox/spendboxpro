import {
  ArrowRight,
  BadgeCheck,
  Check,
  Eye,
  Handshake,
  History,
  LockKeyhole,
  MessageCircle,
  Phone,
  QrCode,
  ShieldCheck,
  Smartphone,
  Store,
  Users,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { RememberInviter } from "@/components/auth/remember-inviter";
import { Logo } from "@/components/brand/logo";
import { RevealOnScroll } from "@/components/landing/reveal";
import { PerkCard } from "@/components/perks/perk-card";
import { ButtonLink } from "@/components/ui/button";

const MADE_FOR = [
  "Restaurants",
  "Barbers",
  "Hair salons",
  "Cafés",
  "Bakeries",
  "Spas",
  "Boutiques",
  "Pharmacies",
  "Gyms",
  "Laundries",
  "Car washes",
  "Bukkas",
  "Lounges",
  "Supermarkets",
  "Phone shops",
  "Nail studios",
];

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

export const metadata: Metadata = { title: "For businesses" };

/** The page for business owners: why Spendbox, then sign up. */
export default function PlugPage() {
  return (
    <div className="overflow-x-clip bg-white">
      <RevealOnScroll />
      <RememberInviter />

      <header className="sticky top-0 z-30 border-b border-line/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
            <a href="#how" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-black/5 md:block">
              How it works
            </a>
            <a href="#partners" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-black/5 md:block">
              Partners
            </a>
            <a href="#customers" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-black/5 md:block">
              For customers
            </a>
            <Link href="/login?for=business" className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-black/5">
              Log in
            </Link>
            <ButtonLink href="/start" size="sm" className="h-10 px-4">
              Start free
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main>
        {/* ------------------------------------------------------------ Hero */}
        <section className="relative isolate">
          <div aria-hidden className="absolute -top-40 left-1/2 -z-10 size-[720px] -translate-x-1/2 rounded-full bg-brand-50 blur-3xl" />
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-5 pt-12 pb-20 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pt-20 lg:pb-28">
            <div className="flex flex-col gap-6">
              <span data-reveal style={delay(0)} className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-brand-800 shadow-card ring-1 ring-brand-100">
                <Store className="size-4 text-brand-600" aria-hidden /> Free to start
              </span>
              <h1 data-reveal style={delay(80)} className="font-display text-[2.7rem] leading-[1] font-extrabold tracking-tight text-ink sm:text-[4.2rem]">
                Your customers say what they need. <span className="text-shimmer">You reach out.</span>
              </h1>
              <p data-reveal style={delay(160)} className="max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
                Customers post what they want, with their budget and photos. You see it first, because they already know you. Tap WhatsApp and close the sale.
              </p>
              <div data-reveal style={delay(240)} className="flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/start" size="lg" className="shadow-lift">
                  Start free <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
                <ButtonLink href="#how" size="lg" variant="secondary">
                  See how it works
                </ButtonLink>
              </div>
              <ul data-reveal style={delay(320)} className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2">
                {["Set up in minutes", "Real budgets, real buyers", "No commission"].map((t) => (
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

        {/* ------------------------------------------------------------ Made for */}
        <section aria-label="Made for" className="border-y border-line bg-canvas py-5">
          <div className="marquee-mask overflow-hidden">
            <div className="animate-marquee flex w-max gap-3">
              {[...MADE_FOR, ...MADE_FOR].map((c, i) => (
                <span
                  key={i}
                  aria-hidden={i >= MADE_FOR.length}
                  className="flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold whitespace-nowrap text-ink-2 ring-1 ring-line"
                >
                  <Store className="size-4 text-brand-600" aria-hidden /> {c}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ How it works */}
        <section id="how" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
            <div data-reveal className="max-w-2xl">
              <p className="text-sm font-semibold text-brand-700">How it works</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-5xl">Three steps to more sales.</h2>
            </div>
            <div className="relative mt-12">
              {/* The line that draws itself between the steps (desktop) */}
              <svg data-reveal aria-hidden className="absolute top-9 left-[16%] hidden h-4 w-[68%] md:block" viewBox="0 0 600 16" preserveAspectRatio="none">
                <path className="draw" style={{ "--len": 620 } as CSSProperties} d="M0 8 C 150 -6, 450 22, 600 8" fill="none" stroke="var(--color-brand-300)" strokeWidth="2.5" strokeDasharray="620" strokeLinecap="round" />
              </svg>
              <ol className="grid grid-cols-1 gap-5 md:grid-cols-3">
                {[
                  { icon: QrCode, title: "Share your link", body: "On your WhatsApp status, after a sale, or on the counter." },
                  { icon: Smartphone, title: "Customers join in seconds", body: "One tap from your link. Nothing to download." },
                  { icon: MessageCircle, title: "They tell you what they need", body: "Their requests land on your home page. Reach out on WhatsApp, a call or email." },
                ].map((step, i) => (
                  <li key={step.title} data-reveal style={delay(i * 140)} className="relative flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-card ring-1 ring-line transition hover:-translate-y-1 hover:shadow-lift">
                    <div className="flex items-center justify-between">
                      <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lift">
                        <step.icon className="size-6" aria-hidden />
                      </div>
                      <span className="font-display text-5xl font-extrabold text-brand-100">{i + 1}</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">{step.title}</h3>
                      <p className="mt-1.5 leading-relaxed text-muted">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ Requests */}
        <section className="bg-ink text-white">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:py-28">
            <div data-reveal="left" className="flex flex-col gap-5">
              <p className="text-sm font-semibold text-brand-300">Requests</p>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">Buyers come to you.</h2>
              <p className="text-lg leading-relaxed text-white/80">
                &ldquo;Red velvet cake for Saturday, up to ₦30,000.&rdquo; When your customers need something, they post
                it. You see the budget, the photos and how they like to be reached. Each request lasts 24 hours.
              </p>
              <ul className="flex flex-col gap-3 text-white/90">
                {["See the budget before you reply", "Reach out in one tap", "Customers see who's reaching out"].map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <BadgeCheck className="mt-0.5 size-5 shrink-0 text-brand-400" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <RequestFlow />
          </div>
        </section>

        {/* ------------------------------------------------------------ Perks */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
          <div data-reveal className="max-w-2xl">
            <p className="text-sm font-semibold text-brand-700">Perks</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-5xl">Simple perks people love</h2>
            <p className="mt-4 text-lg text-muted">
              A welcome treat, a thank-you for bringing a friend, a birthday surprise. Spendbox reminds you, you tap &ldquo;Mark as given&rdquo;.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { kind: "welcome" as const, title: "Free drink on your first order", rot: "-4deg" },
              { kind: "referral" as const, title: "Free small chops for every friend", rot: "-2deg" },
              { kind: "birthday" as const, title: "Birthday cake slice on us", rot: "-3deg" },
            ].map((p, i) => (
              <div
                key={p.title}
                data-reveal="fan"
                style={{ ...delay(i * 90), "--rot": p.rot } as CSSProperties}
                className="transition duration-300 hover:-translate-y-1.5 hover:rotate-[-1deg]"
              >
                <PerkCard kind={p.kind} title={p.title} className="h-full" />
              </div>
            ))}
            <div data-reveal="fan" style={{ ...delay(270), "--rot": "2deg" } as CSSProperties} className="flex min-h-48 flex-col justify-center gap-2 rounded-3xl border-2 border-dashed border-line-strong p-6">
              <p className="font-display text-xl font-bold">Your own ideas</p>
              <p className="text-muted">Extra meat, a free trim, delivery on us — whatever brings your people back.</p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ Partners */}
        <section id="partners" className="scroll-mt-20 bg-canvas">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:py-28">
            <PartnersVisual />
            <div data-reveal="right" className="flex flex-col gap-5">
              <p className="text-sm font-semibold text-brand-700">Partners</p>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">Grow with the businesses around you.</h2>
              <p className="text-lg leading-relaxed text-muted">
                Partner with a business your customers already love — a barber and a spa, a baker and a decorator. You
                recommend each other, and on Plus you also see your partners&apos; customers&apos; requests.
              </p>
              <ul className="flex flex-col gap-3 text-ink-2">
                {["See requests you'd never reach alone", "Choose partners that fit your brand", "You decide who you work with"].map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <Handshake className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ Trust */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
          <div data-reveal className="max-w-2xl">
            <p className="text-sm font-semibold text-brand-700">Built on trust</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-5xl">Fair for you. Fair for them.</h2>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Users, title: "Your customers, always", body: "They stay with you, even when your phone or staff change." },
              { icon: History, title: "Nothing hidden", body: "Customers can see every reward you give them. Trust grows." },
              { icon: BadgeCheck, title: "Real people, real budgets", body: "Requests come from customers who joined you or your partners." },
              { icon: LockKeyhole, title: "Privacy people trust", body: "Customers choose what they share with you." },
            ].map((f, i) => (
              <div key={f.title} data-reveal style={delay(i * 110)} className="group flex flex-col gap-3 rounded-3xl bg-white p-6 shadow-card ring-1 ring-line transition hover:-translate-y-1 hover:shadow-lift">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 transition group-hover:scale-110 group-hover:bg-brand-600 group-hover:text-white">
                  <f.icon className="size-5" aria-hidden />
                </div>
                <h3 className="text-lg font-bold">{f.title}</h3>
                <p className="leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ Customers */}
        <section id="customers" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-20 sm:px-8 lg:pb-28">
          <div data-reveal="scale" className="relative isolate grid grid-cols-1 gap-10 overflow-hidden rounded-4xl bg-brand-800 p-8 text-white sm:p-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center">
            <div aria-hidden className="animate-blob absolute -top-32 -right-24 -z-10 size-96 rounded-[40%] bg-brand-600/60 blur-2xl" />
            <div>
              <p className="text-sm font-semibold text-brand-200">Shopping, not selling?</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-5xl">All your plugs in one place</h2>
              <p className="mt-4 max-w-xl text-lg text-white/90">
                Post what you need with your budget. The businesses you trust reach out, and your perks wait for you here.
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {[
                { icon: ShieldCheck, text: "Your details stay yours unless you share them." },
                { icon: Zap, text: "Post a request. Plugs reach out within the day." },
                { icon: Eye, text: "See who's reaching out, and pick who you like." },
              ].map((item, i) => (
                <li key={item.text} data-reveal="right" style={delay(150 + i * 120)} className="flex items-start gap-3 rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <item.icon className="mt-0.5 size-5 shrink-0 text-brand-200" aria-hidden />
                  <span className="text-white/95">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------ CTA */}
        <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
          <div data-reveal className="relative isolate overflow-hidden rounded-4xl bg-brand-600 p-8 text-white sm:p-14">
            <div aria-hidden className="animate-blob absolute -bottom-40 -left-24 -z-10 size-[28rem] rounded-[42%] bg-brand-400/40 blur-2xl" />
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div>
                <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Ready for buyers who come to you?</h2>
                <p className="mt-2 text-lg text-white/90">Start free today. Your first customers can join, and post, in minutes.</p>
              </div>
              <ButtonLink href="/start" size="lg" variant="secondary" className="ring-0 shadow-lift">
                Start free <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 px-5 py-8 text-sm text-muted sm:flex-row sm:px-8">
          <p>© {new Date().getFullYear()} Spendbox</p>
          <div className="flex flex-wrap gap-5">
            <Link href="/login" className="hover:text-ink">
              Log in
            </Link>
            <Link href="/start" className="hover:text-ink">
              For businesses
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** A phone showing the business home page, with requests coming in and perks floating around it. */
function HeroVisual() {
  return (
    <div data-reveal="scale" style={delay(200)} className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden>
      <div className="absolute inset-x-6 top-10 bottom-0 -z-10 rounded-[48px] bg-gradient-to-b from-brand-100 to-brand-50" />
      <div className="mx-auto w-[290px] rounded-[44px] bg-ink p-3 shadow-[0_40px_80px_-30px_rgb(20_32_26/0.5)] sm:w-[320px]">
        <div className="flex flex-col gap-3 overflow-hidden rounded-[34px] bg-canvas p-4">
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="font-display text-lg font-extrabold text-ink">Requests</span>
            <span className="rounded-full bg-accent-600 px-2 py-0.5 text-[11px] font-bold text-white">3 live</span>
          </div>
          <div className="animate-toast flex items-center gap-3 rounded-3xl bg-brand-600 p-4 text-white">
            <MessageCircle className="size-5 shrink-0" />
            <div>
              <p className="text-sm font-bold">New request</p>
              <p className="text-xs text-white/90">Ada · Up to ₦30,000</p>
            </div>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-line">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">A</div>
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-muted">Ada · Your customer</p>
              <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-semibold ring-1 ring-line">23h left</span>
            </div>
            <p className="mt-2 text-sm font-bold leading-snug">Red velvet cake for Saturday, 2 tiers</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-[11px] font-bold text-white">Up to ₦30,000</span>
              <span className="text-[11px] text-muted">Bakery · Lekki</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <span className="flex h-8 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] text-[11px] font-bold text-white">
                <MessageCircle className="size-3.5" /> WhatsApp
              </span>
              <span className="flex h-8 items-center justify-center gap-1.5 rounded-xl bg-white text-[11px] font-bold ring-1 ring-line">
                <Phone className="size-3.5" /> Call
              </span>
            </div>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-line">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-[#ece9ff] text-xs font-bold text-[#4338A0]">T</div>
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-muted">Tolu · Glow Spa&apos;s customer</p>
            </div>
            <p className="mt-2 text-sm font-bold leading-snug">Small chops for 40 guests</p>
            <span className="mt-2 inline-block rounded-full bg-brand-600 px-2.5 py-0.5 text-[11px] font-bold text-white">₦60,000 – ₦80,000</span>
          </div>
        </div>
      </div>
      <div className="animate-float absolute top-16 -left-3 hidden w-44 sm:block lg:-left-12" style={{ "--r": "-6deg" } as CSSProperties}>
        <PerkCard kind="welcome" title="Free extra meat" size="sm" className="shadow-lift" />
      </div>
      <div className="animate-float absolute -right-3 bottom-16 hidden w-44 sm:block lg:-right-12" style={{ "--r": "6deg", "--delay": "-3s" } as CSSProperties}>
        <PerkCard kind="birthday" title="Birthday treat" size="sm" className="shadow-lift" />
      </div>
    </div>
  );
}

/** Customer posts → you see it → you reach out → sold, with a signal travelling between them. */
function RequestFlow() {
  const nodes = [
    { icon: Smartphone, label: "Your customer posts a request" },
    { icon: Eye, label: "You see their budget and photos" },
    { icon: MessageCircle, label: "You reach out in one tap" },
    { icon: Handshake, label: "They buy from you" },
  ];
  return (
    <div data-reveal="right" className="rounded-4xl bg-white/5 p-6 ring-1 ring-white/10 sm:p-8" aria-hidden>
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        {/* track */}
        <div className="absolute top-7 right-[12%] left-[12%] hidden h-0.5 rounded-full bg-white/15 sm:block">
          {[0, 1300, 2600].map((d) => (
            <span key={d} className="animate-travel absolute -top-[5px] size-3 -translate-x-1/2 rounded-full bg-brand-400 shadow-[0_0_14px_var(--color-brand-400)]" style={delay(d)} />
          ))}
        </div>
        {nodes.map((n, i) => (
          <div key={n.label} className="relative z-10 flex items-center gap-4 sm:w-1/4 sm:flex-col sm:text-center">
            <span className="animate-node flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white" style={delay(i * 1000)}>
              <n.icon className="size-6" />
            </span>
            <span className="text-sm font-semibold text-white/90">{n.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="animate-toast rounded-2xl bg-white p-4 text-ink" style={delay(500)}>
          <p className="text-xs font-semibold text-muted">Tolu needs · just now</p>
          <p className="font-semibold">Knotless braids, Friday · up to ₦35,000</p>
        </div>
        <div className="animate-toast rounded-2xl bg-brand-500 p-4 text-white" style={delay(1500)}>
          <p className="text-xs font-semibold text-white/80">Spendbox</p>
          <p className="font-semibold">Tolu sees you&apos;re reaching out 👋</p>
        </div>
      </div>
    </div>
  );
}

/** Two partner businesses, joined by a bridge that carries requests and perks back and forth. */
function PartnersVisual() {
  const partners = [
    { initials: "SL", name: "Sleek Lab", sub: "Barber", color: "#1C2B24" },
    { initials: "GS", name: "Glow Spa", sub: "Spa", color: "#A3214E" },
  ];
  return (
    <div data-reveal="left" className="relative mx-auto w-full max-w-lg" aria-hidden>
      <div className="flex items-center gap-3 rounded-4xl bg-white p-5 shadow-card ring-1 ring-line sm:gap-4 sm:p-8">
        {partners.map((b, i) => (
          <div key={b.name} className={i === 0 ? "order-1 flex flex-col items-center gap-2 text-center" : "order-3 flex flex-col items-center gap-2 text-center"}>
            <span className="flex size-16 items-center justify-center rounded-3xl font-display text-lg font-bold text-white shadow-lift sm:size-20" style={{ background: b.color }}>
              {b.initials}
            </span>
            <span className="text-sm font-bold whitespace-nowrap">{b.name}</span>
            <span className="text-xs text-muted">{b.sub}</span>
          </div>
        ))}
        {/* The bridge: a soft track with perks travelling both ways */}
        <div className="relative order-2 -mt-12 h-10 flex-1">
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#1C2B24]/15 via-brand-200 to-[#A3214E]/15" />
          <span className="animate-travel absolute top-1/2 -mt-[9px] size-[18px] -translate-x-1/2 rounded-full bg-[#A3214E] ring-4 ring-white" style={delay(0)} />
          <span className="animate-travel absolute top-1/2 -mt-[9px] size-[18px] -translate-x-1/2 rounded-full bg-[#1C2B24] ring-4 ring-white [animation-direction:reverse]" style={delay(2000)} />
          <span className="absolute top-1/2 left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-600 text-white shadow-lift ring-4 ring-white">
            <Handshake className="size-5" />
          </span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="animate-float rounded-2xl bg-white p-4 shadow-card ring-1 ring-line" style={delay(0)}>
          <p className="text-[11px] font-semibold text-brand-700">Partner&apos;s customer</p>
          <p className="mt-1 text-sm font-bold">Need a facial this weekend</p>
          <p className="text-xs text-muted">Sleek Lab customer → Glow Spa sees it</p>
        </div>
        <div className="animate-float rounded-2xl bg-white p-4 shadow-card ring-1 ring-line" style={delay(-3000)}>
          <p className="text-[11px] font-semibold text-brand-700">From our partners</p>
          <p className="mt-1 text-sm font-bold">Free beard trim</p>
          <p className="text-xs text-muted">Sleek Lab&apos;s welcome perk</p>
        </div>
      </div>
    </div>
  );
}
