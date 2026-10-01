import { ExternalLink, LogOut, Wallet } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { BusinessSwitcher } from "@/components/shell/business-switcher";
import type { NavItem } from "@/components/shell/nav";
import { signOut } from "@/lib/actions/auth";
import { requireOwnedBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function BusinessLayout({ children, params }: LayoutProps<"/dashboard/[bizId]">) {
  const { bizId } = await params;
  const { user, business, businesses } = await requireOwnedBusiness(bizId);

  const supabase = await createClient();
  const [{ count: pending }, { count: memberships }] = await Promise.all([
    supabase.from("purchases").select("id", { count: "exact", head: true }).eq("business_id", bizId).eq("status", "pending"),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("customer_id", user.id),
  ]);

  const base = `/dashboard/${bizId}`;
  const nav: NavItem[] = [
    { href: base, label: "Home", icon: "overview", exact: true },
    { href: `${base}/payments`, label: "Payments", icon: "payments", badge: pending ?? 0 },
    { href: `${base}/customers`, label: "Customers", icon: "customers" },
    { href: `${base}/perks`, label: "Perks", icon: "perks", also: [`${base}/rewards`] },
    { href: `${base}/settings`, label: "Settings", icon: "settings" },
  ];

  return (
    <AppShell
      nav={nav}
      homeHref={base}
      sidebarTop={<BusinessSwitcher current={business} businesses={businesses} />}
      mobileActions={<BusinessSwitcher current={business} businesses={businesses} compact />}
      sidebarBottom={
        <>
          <Link
            href={`/j/${business.slug}`}
            className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-black/5"
          >
            <ExternalLink className="size-5" aria-hidden />
            View your join page
          </Link>
          {(memberships ?? 0) > 0 && (
            <Link href="/me" className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-black/5">
              <Wallet className="size-5" aria-hidden />
              My Spendbox
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
    >
      {children}
    </AppShell>
  );
}
