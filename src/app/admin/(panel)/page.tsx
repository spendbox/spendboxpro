import { Store, UserRound } from "lucide-react";
import Link from "next/link";
import { MiniBars } from "@/components/admin/mini-bars";
import { StatTile } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/admin/session";
import { formatDate, formatMoneyShort, plural } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

interface Overview {
  businesses: number;
  businesses_7d: number;
  businesses_paused: number;
  on_trial: number;
  trial_ended: number;
  accounts: number;
  customers: number;
  customers_7d: number;
  customers_paused: number;
  memberships: number;
  purchases_30d: number;
  sales_30d: number;
  banks_connected: number;
  perks_given_30d: number;
  daily: { day: string; businesses: number; members: number }[];
}

const n = (x: number) => Number(x).toLocaleString("en-US");

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const [admin, settings, { denied }] = await Promise.all([requireAdmin(), getSettings(), searchParams]);
  const supabase = createAdminClient();
  const [{ data, error }, { data: newest }] = await Promise.all([
    supabase.rpc("admin_overview", { p_trial_days: settings.trialDays }),
    supabase.rpc("admin_businesses", { p_query: "", p_filter: "all", p_limit: 5, p_offset: 0, p_trial_days: settings.trialDays }),
  ]);
  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Dashboard" />
        <FormMessage>
          Couldn&apos;t load the numbers. If you just added the admin area, run supabase/migrations/20261008000000_admin.sql in Supabase.
        </FormMessage>
      </div>
    );
  }
  const o = data as Overview;
  const switchesOff = [
    !settings.signupsOpen && "new business sign-ups",
    !settings.joinsOpen && "customers joining",
    !settings.emailsEnabled && "emails",
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description={`Hello, ${admin.name}. Here's Spendbox today.`} />
      {denied && <FormMessage>You don&apos;t have access to that page. Ask the main admin if you need it.</FormMessage>}
      {switchesOff.length > 0 && (
        <Link href="/admin/settings" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <b>Switched off:</b> {switchesOff.join(", ")}. Tap to change.
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Businesses" value={n(o.businesses)} note={`+${n(o.businesses_7d)} this week`} href="/admin/businesses" />
        <StatTile label="Customers" value={n(o.customers)} note={`+${n(o.customers_7d)} this week · ${plural(o.memberships, "membership")}`} href="/admin/customers?filter=customers" />
        <StatTile label="Sales counted" value={formatMoneyShort(o.sales_30d)} note={`${n(o.purchases_30d)} purchases · last 30 days`} />
        <StatTile label="Perks used" value={n(o.perks_given_30d)} note="Last 30 days" />
        <StatTile
          label="Free trial"
          value={settings.trialEnabled ? n(o.on_trial) : "Off"}
          note={settings.trialEnabled ? `on trial · ${n(o.trial_ended)} ended` : "Turned off in Settings"}
          href={settings.trialEnabled ? "/admin/businesses?filter=trial" : "/admin/settings"}
        />
        <StatTile label="Banks connected" value={n(o.banks_connected)} note={`of ${plural(o.businesses, "business", "businesses")}`} />
        <StatTile label="Accounts" value={n(o.accounts)} note="Everyone with a login" href="/admin/customers" />
        <StatTile label="Paused" value={n(o.businesses_paused + o.customers_paused)} note={`${n(o.businesses_paused)} businesses · ${n(o.customers_paused)} people`} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-5">
          <MiniBars title="New members" unit={["member", "members"]} days={o.daily.map((d) => ({ day: d.day, value: d.members }))} />
        </Card>
        <Card className="p-5">
          <MiniBars title="New businesses" unit={["business", "businesses"]} days={o.daily.map((d) => ({ day: d.day, value: d.businesses }))} />
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold">Newest businesses</h2>
          <Link href="/admin/businesses" className="text-sm font-semibold text-brand-700">
            See all
          </Link>
        </div>
        <Card className="divide-y divide-line">
          {(newest ?? []).length === 0 && <p className="p-5 text-muted">No businesses yet.</p>}
          {(newest ?? []).map((b: { id: string; name: string; created_at: string; members: number; suspended_at: string | null }) => (
            <Link key={b.id} href={`/admin/businesses/${b.id}`} className="flex items-center gap-3 p-4 hover:bg-black/[0.02]">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <Store className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{b.name}</p>
                <p className="text-sm text-muted">Joined {formatDate(b.created_at, { withYear: true })}</p>
              </div>
              {b.suspended_at && <Badge tone="red">Paused</Badge>}
              <span className="flex items-center gap-1 text-sm text-muted tabular">
                <UserRound className="size-4" aria-hidden /> {n(b.members)}
              </span>
            </Link>
          ))}
        </Card>
      </section>
    </div>
  );
}
