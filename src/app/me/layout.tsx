import { Suspense } from "react";
import { LogOut, Store } from "lucide-react";
import Link from "next/link";
import { ConfirmEmailBanner } from "@/components/auth/confirm-email-banner";
import { AppShell } from "@/components/shell/app-shell";
import type { NavItem } from "@/components/shell/nav";
import { getOwnedBusinesses, requireUser } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { getMyProfile } from "@/lib/customer";
import { SubmitRow } from "@/components/ui/submit-button";
const NAV: NavItem[] = [
  { href: "/me", label: "My Spendbox", icon: "home", exact: true, also: ["/me/new", "/me/box", "/me/ask", "/me/p/"] },
  { href: "/me/plugs", label: "Plugs", icon: "businesses", also: ["/me/b", "/me/perks"] },
  { href: "/me/profile", label: "Profile", icon: "profile" },
];

export default async function CustomerLayout({ children }: LayoutProps<"/me">) {
  const user = await requireUser("/me");
  void getMyProfile(user.id); // starts the email banner's lookup now, alongside the page's
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
            <SubmitRow className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-black/5">
              <LogOut className="size-5" aria-hidden />
              Log out
            </SubmitRow>
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
      <Suspense fallback={null}>
        <ConfirmEmailBanner userId={user.id} />
      </Suspense>
      {children}
    </AppShell>
  );
}
