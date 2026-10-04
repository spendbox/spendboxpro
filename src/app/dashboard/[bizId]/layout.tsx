import { Suspense } from "react";
import { ExternalLink, LogOut, PauseCircle, Wallet } from "lucide-react";
import Link from "next/link";
import { ConfirmEmailBanner } from "@/components/auth/confirm-email-banner";
import { AppShell } from "@/components/shell/app-shell";
import { PlanPicker } from "@/components/business/plan-picker";
import { Card } from "@/components/ui/card";
import { GRACE_DAYS } from "@/lib/billing";
import { getSettings } from "@/lib/settings";
import { TrialBanner } from "@/components/business/trial-banner";
import { BusinessSwitcher } from "@/components/shell/business-switcher";
import type { NavItem } from "@/components/shell/nav";
import { signOut } from "@/lib/actions/auth";
import { requireOwnedBusiness, requireUser } from "@/lib/auth";
import { getStats } from "@/lib/business";
import { getMyProfile } from "@/lib/customer";
import { SUPPORT_EMAIL } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { SubmitRow } from "@/components/ui/submit-button";

export default async function BusinessLayout({ children, params }: LayoutProps<"/dashboard/[bizId]">) {
  const { bizId } = await params;
  const user = await requireUser(`/dashboard/${bizId}`);
  void getMyProfile(user.id); // starts the email banner's lookup now, alongside the rest
  const supabase = await createClient();
  // Everything at once: the ownership check, and data the database only shows to the owner anyway.
  const [{ business, businesses }, stats, { count: memberships }, { data: partnerRequests }, settings] = await Promise.all([
    requireOwnedBusiness(bizId),
    getStats(bizId),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("customer_id", user.id),
    supabase.rpc("partner_requests_waiting", { p_business_id: bizId }),
    getSettings(),
  ]);
  const requests = Number(partnerRequests ?? 0);

  const base = `/dashboard/${bizId}`;
  const nav: NavItem[] = [
    { href: base, label: "Home", icon: "overview", exact: true, also: [`${base}/requests`, `${base}/stats`, `${base}/products`] },
    { href: `${base}/customers`, label: "Customers", icon: "customers", badge: stats.rewards_ready },
    { href: `${base}/partners`, label: "Partners", icon: "partners", badge: requests },
    // Perks and plan & billing live under Settings.
    { href: `${base}/settings`, label: "Settings", icon: "settings", also: [`${base}/perks`] },
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
            <SubmitRow className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-black/5">
              <LogOut className="size-5" aria-hidden />
              Log out
            </SubmitRow>
          </form>
        </>
      }
    >
      <Suspense fallback={null}>
        <ConfirmEmailBanner userId={user.id} />
      </Suspense>
      <TrialBanner business={business} />
      {business.suspended_at && business.suspended_reason === "billing" ? (
        <div className="mx-auto flex max-w-2xl flex-col gap-5 py-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <PauseCircle className="size-12 text-muted" aria-hidden />
            <h1 className="font-display text-2xl font-bold">{business.name} is paused</h1>
            <p className="text-muted">
              Your plan wasn&apos;t paid within {GRACE_DAYS} days of ending, so we paused your business (fair use).
              You won&apos;t see requests and new customers can&apos;t join. Pay below to switch everything back on.
            </p>
          </div>
          <Card className="p-5">
            <PlanPicker bizId={bizId} prices={{ starter: settings.priceStarter, plus: settings.pricePlus }} current={business.plan ?? "starter"} />
          </Card>
        </div>
      ) : business.suspended_at ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
          <PauseCircle className="size-12 text-muted" aria-hidden />
          <h1 className="font-display text-2xl font-bold">{business.name} is paused</h1>
          <p className="text-muted">
            Spendbox has paused this business for now, so new customers can&apos;t join. Your customers can still see their perks.
            Please email <a className="font-semibold text-brand-700 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and
            we&apos;ll sort it out.
          </p>
        </div>
      ) : (
        children
      )}
    </AppShell>
  );
}
