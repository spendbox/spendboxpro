"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface SubTab {
  href: string;
  label: string;
  /** Small number shown next to the label. */
  count?: number;
  /** Also active on these paths (prefix match). */
  also?: string[];
  /** Set when the tabs are chosen by a query (?tab=…) rather than the path. */
  active?: boolean;
}

/** Tabs inside a page (e.g. Explore · My box · Ask), as links so each has its own address. */
export function SubTabs({ tabs, label }: { tabs: SubTab[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex w-max gap-1 rounded-2xl bg-black/[0.04] p-1 sm:w-full">
        {tabs.map((tab) => {
          const active = tab.active ?? (pathname === tab.href || (tab.also ?? []).some((p) => pathname.startsWith(p)));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold whitespace-nowrap transition",
                active ? "bg-white text-ink shadow-card" : "text-ink-2 hover:text-ink",
              )}
            >
              {tab.label}
              {tab.count ? (
                <span className={cn("rounded-full px-1.5 text-xs leading-5", active ? "bg-brand-600 text-white" : "bg-black/10 text-ink-2")}>{tab.count}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
