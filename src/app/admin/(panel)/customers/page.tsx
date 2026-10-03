import { Store, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterChips, listHref, Pager, SearchBox } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/admin/session";
import { formatDate, formatPhone } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "People" };

const PER_PAGE = 20;
const FILTERS = [
  { key: "all", label: "Everyone" },
  { key: "customers", label: "Customers" },
  { key: "owners", label: "Business owners" },
  { key: "paused", label: "Paused" },
];

interface Row {
  id: string;
  phone: string | null;
  full_name: string | null;
  email: string | null;
  created_at: string;
  suspended_at: string | null;
  memberships: number;
  businesses_owned: number;
  total: number;
}

export default async function AdminCustomers({ searchParams }: PageProps<"/admin/customers">) {
  const [, sp] = await Promise.all([requireAdmin(), searchParams]);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const filter = FILTERS.some((f) => f.key === sp.filter) ? String(sp.filter) : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const { data } = await createAdminClient().rpc("admin_customers", {
    p_query: q,
    p_filter: filter,
    p_limit: PER_PAGE,
    p_offset: (page - 1) * PER_PAGE,
  });
  const rows = (data ?? []) as Row[];
  const total = Number(rows[0]?.total ?? 0);
  const href = (p: Record<string, string | number | undefined>) => listHref("/admin/customers", { q, filter, ...p });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="People" description="Everyone with a Spendbox login: customers and business owners." />
      <SearchBox action="/admin/customers" q={q} placeholder="Search by phone, name or email" hidden={filter !== "all" ? { filter } : undefined} />
      <FilterChips current={filter} items={FILTERS.map((f) => ({ ...f, href: href({ filter: f.key, page: 1 }) }))} />
      <Card className="divide-y divide-line">
        {rows.length === 0 && <p className="p-5 text-muted">{q ? `Nobody matches “${q}”.` : "Nobody here yet."}</p>}
        {rows.map((c) => (
          <Link key={c.id} href={`/admin/customers/${c.id}`} className="flex items-center gap-3 p-4 hover:bg-black/[0.02]">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-canvas text-ink-2 ring-1 ring-line">
              {c.businesses_owned > 0 ? <Store className="size-5" aria-hidden /> : <UserRound className="size-5" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                <span className="truncate">{c.full_name ?? formatPhone(c.phone)}</span>
                {c.suspended_at && <Badge tone="red">Paused</Badge>}
              </p>
              <p className="truncate text-sm text-muted">
                {c.full_name ? `${formatPhone(c.phone)} · ` : ""}since {formatDate(c.created_at, { withYear: true })}
              </p>
            </div>
            <p className="shrink-0 text-right text-sm text-muted tabular">
              {c.memberships > 0 && <span className="block">{c.memberships} joined</span>}
              {c.businesses_owned > 0 && <span className="block">owns {c.businesses_owned}</span>}
            </p>
          </Link>
        ))}
      </Card>
      <Pager page={page} pages={Math.ceil(total / PER_PAGE)} total={total} hrefFor={(p) => href({ page: p })} />
    </div>
  );
}
