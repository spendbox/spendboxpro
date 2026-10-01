"use client";

import {
  Gift,
  House,
  LayoutGrid,
  LoaderCircle,
  ReceiptText,
  ScanLine,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ICONS = {
  home: House,
  scan: ScanLine,
  profile: UserRound,
  overview: LayoutGrid,
  payments: ReceiptText,
  customers: Users,
  perks: Gift,
  settings: Settings,
} satisfies Record<string, LucideIcon>;

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Other path prefixes that should also highlight this item. */
  also?: string[];
  exact?: boolean;
  badge?: number;
  /** Shown as a raised round button in the phone tab bar. */
  primary?: boolean;
}

/** Spinner on the menu item that was just tapped, until its page shows. */
function Pending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? <LoaderCircle className={cn("size-4 animate-spin text-brand-600", className)} aria-hidden /> : null;
}

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href || (item.also ?? []).some((p) => pathname.startsWith(p));
  return [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors",
              active ? "bg-brand-50 text-brand-800" : "text-ink-2 hover:bg-black/5",
            )}
          >
            <Icon className="size-5" aria-hidden />
            <span className="flex-1">{item.label}</span>
            <Pending />
            {item.badge ? (
              <span className="rounded-full bg-accent-600 px-2 py-0.5 text-xs font-bold text-white">{item.badge}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item);
          return (
            <li key={item.href} className="flex flex-1 justify-center">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                  active ? "text-brand-700" : "text-muted",
                )}
              >
                {item.primary ? (
                  <span className="-mt-5 flex size-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lift">
                    <Icon className="size-6" aria-hidden />
                  </span>
                ) : (
                  <Icon className="size-6" aria-hidden strokeWidth={active ? 2.25 : 1.75} />
                )}
                <span>{item.label}</span>
                <Pending className="absolute top-1.5 right-3 size-3.5" />
                {item.badge ? (
                  <span className="absolute top-2 left-1/2 ml-2 min-w-5 rounded-full bg-accent-600 px-1.5 text-center text-[10px] leading-5 font-bold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
