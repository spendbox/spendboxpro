import { LogOut, Store } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import type { NavItem } from "@/components/shell/nav";
import { getOwnedBusinesses, requireUser } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";

const NAV: NavItem[] = [
  { href: "/me", label: "My Spendbox", icon: "home", exact: true, also: ["/me/b"] },
  { href: "/me/receipts", label: "Add receipt", icon: "scan", primary: true },
  { href: "/me/profile", label: "Profile", icon: "profile" },
];

export default async function CustomerLayout({ children }: LayoutProps<"/me">) {
  await requireUser("/me");
  const owned = await getOwnedBusinesses();

  return (
    <AppShell
      nav={NAV}
      homeHref="/me"
      sidebarBottom={
        <>
          {owned.length > 0 && (
            <Link
              href={`/dashboard/${owned[0].id}`}
              className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-black/5"
            >
              <Store className="size-5" aria-hidden />
              Business dashboard
            </Link>
          )}
          <form action={signOut}>
            <button className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-black/5">
              <LogOut className="size-5" aria-hidden />
              Log out
            </button>
          </form>
        </>
      }
      mobileActions={
        owned.length > 0 ? (
          <Link
            href={`/dashboard/${owned[0].id}`}
            className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-black/5"
          >
            <Store className="size-4" aria-hidden />
            Business
          </Link>
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
