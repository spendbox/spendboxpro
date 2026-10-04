import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";

/** Split screen for sign-in pages: form on the right, brand panel on large screens. */
export function AuthLayout({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid grid-cols-1 min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <aside className="relative hidden overflow-hidden bg-brand-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo tone="light" />
        {aside ?? (
          <div aria-hidden className="relative mx-auto flex w-full max-w-md flex-col gap-4">
            <div className="-rotate-2 rounded-3xl bg-white p-5 text-ink shadow-lift">
              <p className="text-xs font-semibold text-muted">Tolu needs · 2h ago</p>
              <p className="mt-1 font-display text-lg leading-snug font-bold">Knotless braids, mid-back, this Friday</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">Up to ₦35,000</span>
                <span className="rounded-full bg-canvas px-3 py-1 text-xs ring-1 ring-line">Hair salon</span>
              </div>
            </div>
            <div className="ml-10 flex rotate-1 items-center gap-3 rounded-2xl bg-white/95 px-4 py-3 text-ink shadow-lift">
              <span className="flex size-9 items-center justify-center rounded-xl bg-[#4338A0] font-display text-xs font-bold text-white">GS</span>
              <p className="text-sm font-semibold">Glow Studio is reaching out on WhatsApp</p>
            </div>
          </div>
        )}
        <p className="max-w-sm text-lg text-white/90">
          Customers say what they need. The businesses they trust reach out.
        </p>
      </aside>
      <main className="flex flex-col px-5 py-6 sm:px-10 lg:justify-center lg:py-12">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8 lg:flex-none">{children}</div>
      </main>
    </div>
  );
}
