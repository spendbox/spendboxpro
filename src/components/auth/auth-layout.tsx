import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { PerkCard } from "@/components/perks/perk-card";

/** Split screen for sign-in pages: form on the right, brand panel on large screens. */
export function AuthLayout({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid grid-cols-1 min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <aside className="relative hidden overflow-hidden bg-brand-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo tone="light" />
        {aside ?? (
          <div className="relative mx-auto flex w-full max-w-md flex-col gap-4">
            <PerkCard kind="welcome" title="Free extra meat" className="-rotate-3 shadow-lift" />
            <PerkCard kind="visits" title="Free drink" threshold={5} className="ml-10 rotate-2 shadow-lift" />
          </div>
        )}
        <p className="max-w-sm text-lg text-white/90">
          Every visit counts. Turn the people who walk in once into the ones who keep coming back.
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
