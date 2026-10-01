import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { BottomNav, SideNav, type NavItem } from "@/components/shell/nav";

/**
 * Page frame for signed-in areas: a sidebar on large screens, a top bar and a
 * bottom tab bar on phones.
 */
export function AppShell({
  nav,
  sidebarTop,
  sidebarBottom,
  mobileActions,
  homeHref,
  children,
}: {
  nav: NavItem[];
  sidebarTop?: ReactNode;
  sidebarBottom?: ReactNode;
  mobileActions?: ReactNode;
  homeHref: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:pl-72">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col gap-6 border-r border-line bg-white px-4 py-6 lg:flex">
        <div className="px-2">
          <Logo href={homeHref} />
        </div>
        {sidebarTop}
        <SideNav items={nav} />
        <div className="mt-auto flex flex-col gap-1">{sidebarBottom}</div>
      </aside>

      <header className="sticky top-0 z-20 flex h-15 items-center justify-between gap-3 border-b border-line/70 bg-canvas/90 px-4 backdrop-blur sm:px-6 lg:hidden">
        <Logo href={homeHref} />
        <div className="flex items-center gap-1">{mobileActions}</div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-32 sm:px-6 lg:px-10 lg:pt-10 lg:pb-28">{children}</main>

      <BottomNav items={nav} />
    </div>
  );
}

export function SidebarLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-black/5"
    >
      {children}
    </a>
  );
}
