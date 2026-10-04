import { UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterChips, listHref, Pager, SearchBox } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/admin/session";
import { billingState, PLANS } from "@/lib/billing";
import { formatDate, formatPhone } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Businesses" };

const PER_PAGE = 20;
const FILTERS = [
  { key: "all", label: "All" },
  { key: "trial", label: "Free time" },
  { key: "paying", label: "Paying" },
  { key: "due", label: "Payment due" },
  { key: "paused", label: "Paused" },
];

export interface AdminBusinessRow {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  location: string | null;
  created_at: string;
  suspended_at: string | null;
  suspended_reason: "admin" | "billing" | null;
  trial_ends: string;
  paid_until: string | null;
  plan: "starter" | "plus";
  owner_id: string;
  owner_phone: string | null;
  owner_email: string | null;
  members: number;
  total: number;
}

export default async function AdminBusinesses({ searchParams }: PageProps<"/admin/businesses">) {
  const [, settings, sp] = await Promise.all([requireAdmin(), getSettings(), searchParams]);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const filter = FILTERS.some((f) => f.key === sp.filter) ? String(sp.filter) : "all";
  const page = Math.max(1, Number(sp.page) || 1);

  const { data } = await createAdminClient().rpc("admin_businesses", {
    p_query: q,
    p_filter: filter,
    p_limit: PER_PAGE,
    p_offset: (page - 1) * PER_PAGE,
    p_trial_days: settings.trialDays,
  });
  const rows = (data ?? []) as AdminBusinessRow[];
  const total = Number(rows[0]?.total ?? 0);
  const href = (p: Record<string, string | number | undefined>) => listHref("/admin/businesses", { q, filter, ...p });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Businesses" description="Find a business to give it free time, record a payment, pause it or delete it." />
      <SearchBox action="/admin/businesses" q={q} placeholder="Search by name, link, owner's email or phone" hidden={filter !== "all" ? { filter } : undefined} />
      <FilterChips current={filter} items={FILTERS.map((f) => ({ ...f, href: href({ filter: f.key, page: 1 }) }))} />
      <Card className="divide-y divide-line">
        {rows.length === 0 && <p className="p-5 text-muted">{q ? `No business matches “${q}”.` : "Nothing here yet."}</p>}
        {rows.map((b) => {
          const s = billingState({ created_at: b.created_at, trial_ends_at: b.trial_ends, paid_until: b.paid_until, plan: b.plan, suspended_at: b.suspended_at, suspended_reason: b.suspended_reason });
          return (
            <Link key={b.id} href={`/admin/businesses/${b.id}`} className="flex flex-col gap-1.5 p-4 hover:bg-black/[0.02] sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="truncate">{b.name}</span>
                  {b.suspended_at && <Badge tone="red">{b.suspended_reason === "billing" ? "Paused · unpaid" : "Paused"}</Badge>}
                  {!b.suspended_at && s.status === "trial" && <Badge tone="amber">Free to {formatDate(s.accessUntil)}</Badge>}
                  {!b.suspended_at && s.status === "active" && <Badge tone="green">{PLANS[s.plan].name} to {formatDate(s.accessUntil)}</Badge>}
                  {!b.suspended_at && s.status === "due" && <Badge tone="red">Due · pauses {formatDate(s.suspendOn)}</Badge>}
                </p>
                <p className="truncate text-sm text-muted">
                  /{b.slug} · {b.owner_email ?? formatPhone(b.owner_phone)} · since {formatDate(b.created_at, { withYear: true })}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted tabular">
                <span className="flex items-center gap-1" title="Members">
                  <UserRound className="size-4" aria-hidden /> {b.members}
                </span>
              </div>
            </Link>
          );
        })}
      </Card>
      <Pager page={page} pages={Math.ceil(total / PER_PAGE)} total={total} hrefFor={(p) => href({ page: p })} />
    </div>
  );
}
