import { ArrowRight, Cake, Gift, Heart, Repeat2, Store, UserPlus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Logo } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: { absolute: "Spendbox — every visit counts" } };

// Perks circling the member card: icon, colour, angle on the circle.
const ORBIT = [
  { icon: Gift, color: "#2A772C", angle: 0 },
  { icon: Repeat2, color: "#1C2B24", angle: 60 },
  { icon: UserPlus, color: "#4338A0", angle: 120 },
  { icon: Wallet, color: "#A33A0B", angle: 180 },
  { icon: Cake, color: "#A3214E", angle: 240 },
  { icon: Heart, color: "#0F5E8C", angle: 300 },
];

/** The front door: one screen, two ways in. */
export default function Home() {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-white">
      <div aria-hidden className="animate-glow absolute top-[18%] left-1/2 -z-10 size-[34rem] -translate-x-1/2 rounded-full bg-brand-100 blur-3xl" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-brand-50 to-transparent" />

      <header className="flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7">
        <Logo />
        <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-black/5">
          Log in
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-7 px-5 pb-8 text-center sm:gap-9">
        {/* Perks orbiting a member card */}
        <div aria-hidden className="relative size-[15.5rem] shrink-0 sm:size-[19rem]">
          <div className="orbit absolute inset-0">
            {ORBIT.map(({ icon: Icon, color, angle }) => (
              <div
                key={angle}
                className="absolute top-1/2 left-1/2 size-0"
                style={{ transform: `rotate(${angle}deg) translateX(calc(var(--r) * 1))`, "--r": "min(7.5rem, 38vw)" } as CSSProperties}
              >
                <div style={{ transform: `rotate(${-angle}deg)` }}>
                  <span
                    className="orbit-upright -mt-6 -ml-6 flex size-12 items-center justify-center rounded-2xl text-white shadow-lift ring-4 ring-white sm:-mt-7 sm:-ml-7 sm:size-14"
                    style={{ background: color }}
                  >
                    <Icon className="size-5 sm:size-6" />
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="absolute top-1/2 left-1/2 flex w-40 -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 rounded-3xl bg-brand-700 p-4 text-left text-white shadow-[0_30px_60px_-24px_rgb(20_57_22/0.6)] sm:w-48 sm:p-5">
            <span className="text-[11px] font-semibold text-white/80">My Spendbox</span>
            <span className="font-display text-lg leading-tight font-bold sm:text-xl">3 perks ready</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-white/20">
              <span className="animate-fill block h-full rounded-full bg-brand-400" />
            </span>
          </div>
          <span className="animate-pop absolute -right-2 bottom-3 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-ink shadow-lift ring-1 ring-line sm:-right-6">
            Free drink unlocked 🎉
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="font-display text-[2.6rem] leading-[1.02] font-extrabold tracking-tight sm:text-6xl">
            Every visit <span className="text-shimmer">counts.</span>
          </h1>
          <p className="text-lg text-muted">The places you love, and everything they have for you, in one place.</p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Link href="/login" className={buttonClass({ size: "lg", block: true }, "h-14 text-base shadow-lift")}>
            My Spendbox <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link href="/plug" className={buttonClass({ variant: "secondary", size: "lg", block: true }, "h-14 text-base")}>
            <Store className="size-4" aria-hidden /> For businesses
          </Link>
          <p className="text-sm text-muted">Customers join by invite from a business they buy from.</p>
        </div>
      </main>
    </div>
  );
}
