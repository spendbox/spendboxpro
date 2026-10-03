import type { Metadata } from "next";
import Link from "next/link";
import { listHref, Pager } from "@/components/admin/ui";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/admin/session";
import { formatWhen } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Activity" };

const PER_PAGE = 40;
const ACTIONS: Record<string, string> = {
  login: "Logged in",
  login_failed: "Failed login",
};

export default async function AdminActivity({ searchParams }: PageProps<"/admin/activity">) {
  const [, sp] = await Promise.all([requireAdmin(), searchParams]);
  const page = Math.max(1, Number(sp.page) || 1);
  const { data, count } = await createAdminClient()
    .from("admin_log")
    .select("id, created_at, actor, action, target_type, target_id, summary", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const total = count ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader back={{ href: "/admin/settings", label: "Settings" }} title="Activity" description="Everything done in the admin area, newest first." />
      <Card className="divide-y divide-line">
        {(data ?? []).length === 0 && <p className="p-5 text-muted">Nothing yet.</p>}
        {(data ?? []).map((row) => {
          const link =
            row.target_type === "business" ? `/admin/businesses/${row.target_id}` : row.target_type === "customer" ? `/admin/customers/${row.target_id}` : null;
          const text = row.summary ?? ACTIONS[row.action] ?? row.action;
          return (
            <div key={row.id} className="flex flex-col gap-0.5 p-4 sm:flex-row sm:items-baseline sm:gap-4">
              <p className="min-w-0 flex-1">
                {link ? (
                  <Link href={link} className="font-semibold underline-offset-2 hover:underline">
                    {text}
                  </Link>
                ) : (
                  <span className={row.action === "login_failed" ? "font-semibold text-red-700" : "font-semibold"}>{text}</span>
                )}
              </p>
              <p className="text-sm text-muted">
                {row.actor} · {formatWhen(row.created_at)}
              </p>
            </div>
          );
        })}
      </Card>
      <Pager page={page} pages={Math.ceil(total / PER_PAGE)} total={total} hrefFor={(p) => listHref("/admin/activity", { page: p })} />
    </div>
  );
}
