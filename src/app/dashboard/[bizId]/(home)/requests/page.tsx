import { ArrowRight, Inbox, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BusinessRequestCard } from "@/components/requests/business-request-card";
import { EmptyState } from "@/components/ui/card";
import { requireOwnedBusiness } from "@/lib/auth";
import { billingState } from "@/lib/billing";
import { getRequests, getStats } from "@/lib/business";
import { cn } from "@/lib/cn";
import { budgetLabel, timeAgo, timeLeftLabel } from "@/lib/requests";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Requests" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "mine", label: "Your customers" },
  { key: "partners", label: "Partners' customers" },
];

export default async function RequestsTab({ params, searchParams }: PageProps<"/dashboard/[bizId]/requests">) {
  const [{ bizId }, { show }] = await Promise.all([params, searchParams]);
  const [{ business }, stats, requests, { data: partnerSlots }] = await Promise.all([
    requireOwnedBusiness(bizId),
    getStats(bizId),
    getRequests(bizId),
    // Ownership is checked alongside; partnerships are only readable server-side.
    createAdminClient().rpc("partner_slots_used", { p_business_id: bizId }),
  ]);
  const filter = FILTERS.some((f) => f.key === show) ? String(show) : "all";
  const shown = requests.filter((r) => (filter === "mine" ? r.is_member : filter === "partners" ? !r.is_member : true));
  const billing = billingState(business);
  const hasPartners = Number(partnerSlots ?? 0) > 0;
  const base = `/dashboard/${bizId}`;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="requests-title">
      <div>
        <h2 id="requests-title" className="font-display text-2xl font-bold">
          Requests
        </h2>
        <p className="text-sm text-muted">
          {requests.length === 0
            ? "What your customers need, as they post it."
            : `${requests.length} live ${requests.length === 1 ? "request" : "requests"} you can help with. Each one is up for 24 hours.`}
        </p>
      </div>

      {requests.length > 0 && (
        <nav aria-label="Filter requests" className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? `${base}/requests` : `${base}/requests?show=${f.key}`}
              aria-current={f.key === filter ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition",
                f.key === filter ? "bg-ink text-white ring-ink" : "bg-white text-ink-2 ring-line hover:bg-black/5",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      )}

      {!billing.partnerRequests && hasPartners && (
        <Link href={`${base}/settings/billing`} className="flex items-center gap-3 rounded-2xl bg-violet-50 p-4 text-sm text-violet-950 ring-1 ring-violet-100">
          <Sparkles className="size-5 shrink-0 text-violet-700" aria-hidden />
          <span className="flex-1">
            <span className="font-semibold">See your partners&apos; customers&apos; requests too.</span> That comes with the Plus plan.
          </span>
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-6" aria-hidden />}
          title={requests.length ? "Nothing here right now" : "No requests yet"}
          description={
            stats.members === 0
              ? "Share your link so customers join. Their requests show up here."
              : "When your customers (or your partners' customers) need something, it shows up here for 24 hours."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {shown.map((r) => (
            <BusinessRequestCard
              key={r.id}
              bizId={bizId}
              businessName={business.name}
              request={r}
              budget={budgetLabel(r.budget_min, r.budget_max, r.currency)}
              timeLeft={timeLeftLabel(r.expires_at)}
              ago={timeAgo(r.created_at)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
