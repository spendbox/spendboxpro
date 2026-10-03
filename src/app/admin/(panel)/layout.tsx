import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import type { NavItem } from "@/components/shell/nav";
import { adminLogout } from "@/app/admin/login/actions";
import { requireAdmin, ROLE_LABELS } from "@/lib/admin/session";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "overview", exact: true },
  { href: "/admin/businesses", label: "Businesses", icon: "businesses" },
  { href: "/admin/customers", label: "People", icon: "customers" },
  { href: "/admin/settings", label: "Settings", icon: "settings", also: ["/admin/team", "/admin/activity"] },
  { href: "/admin/team", label: "Team", icon: "team", desktopOnly: true },
  { href: "/admin/activity", label: "Activity", icon: "audits", desktopOnly: true },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  const who = (
    <div className="rounded-2xl bg-canvas px-3 py-2.5 ring-1 ring-line">
      <p className="truncate text-sm font-semibold">{admin.name}</p>
      <p className="text-xs text-muted">{ROLE_LABELS[admin.role].label}</p>
    </div>
  );
  const logout = (
    <form action={adminLogout}>
      <button className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-black/5" aria-label="Log out of admin">
        <LogOut className="size-5" aria-hidden />
        <span className="max-lg:hidden">Log out</span>
      </button>
    </form>
  );
  return (
    <AppShell nav={NAV} homeHref="/admin" sidebarTop={who} sidebarBottom={logout} mobileActions={logout}>
      {children}
    </AppShell>
  );
}
