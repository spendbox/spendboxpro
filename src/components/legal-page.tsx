import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";

/** Simple, readable layout for the privacy policy and terms. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <Logo />
          <nav className="flex gap-4 text-sm font-semibold text-ink-2">
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="font-display text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted">Last updated {updated}</p>
        <div className="legal mt-8 flex flex-col gap-4 text-[16px] leading-relaxed text-ink-2 [&_a]:font-semibold [&_a]:text-brand-700 [&_a]:underline [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
          {children}
        </div>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-3xl px-5 py-6 text-sm text-muted sm:px-8">© {new Date().getFullYear()} Spendbox</div>
      </footer>
    </div>
  );
}
