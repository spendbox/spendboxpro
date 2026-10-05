import { ArrowRight, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ShopIllustration } from "@/components/landing/shop-illustration";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: { absolute: "Spendbox — shop comfortably, shop different" } };

/** The front door: one screen, two ways in. */
export default function Home() {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-white">
      <div aria-hidden className="animate-glow absolute top-[14%] left-1/2 -z-10 size-[34rem] -translate-x-1/2 rounded-full bg-brand-100 blur-3xl" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-brand-50 to-transparent" />

      <header className="flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7">
        <Logo />
        <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-black/5">
          Log in
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-7 px-5 pb-8 text-center sm:gap-8">
        {/* Walking into a shop in 3D, on a phone */}
        <ShopIllustration className="w-full max-w-[22rem] shrink-0 sm:max-w-md" />

        <div className="flex flex-col gap-3">
          <h1 className="font-display text-[2.5rem] leading-[1.02] font-extrabold tracking-tight sm:text-6xl">
            Shop comfortably. <span className="text-shimmer">Shop different.</span>
          </h1>
          <p className="text-lg text-muted">Walk into the shops you love in 3D, right from your phone. Look around, see what&apos;s new, and tell them what you need. They&apos;ll reach out.</p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Link href="/login" className={buttonClass({ size: "lg", block: true }, "h-14 text-base shadow-lift")}>
            My Spendbox <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link href="/plug" className={buttonClass({ variant: "secondary", size: "lg", block: true }, "h-14 text-base")}>
            <Store className="size-4" aria-hidden /> Open your 3D shop
          </Link>
          <p className="text-sm text-muted">
            New here?{" "}
            <Link href="/signup" className="font-semibold text-brand-700 underline underline-offset-2">
              Create your free Spendbox
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
