import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PaymentRow } from "@/components/business/payment-row";
import { RecordPurchase } from "@/components/business/record-purchase";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { getPurchases, getStats } from "@/lib/business";
import { cn } from "@/lib/cn";
import type { PurchaseStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Payments" };

const FILTERS: { key: string; label: string; status: PurchaseStatus | null }[] = [
  { key: "all", label: "All", status: null },
  { key: "pending", label: "Needs review", status: "pending" },
  { key: "verified", label: "Counted", status: "verified" },
  { key: "rejected", label: "Not received", status: "rejected" },
];

export default async function PaymentsPage({ params, searchParams }: PageProps<"/dashboard/[bizId]/payments">) {
  const [{ bizId }, { status }] = await Promise.all([params, searchParams]);
  const { business } = await requireOwnedBusiness(bizId);
  const filter = FILTERS.find((f) => f.key === status) ?? FILTERS[0];
  const [payments, stats] = await Promise.all([getPurchases(bizId, { status: filter.status }), getStats(bizId)]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payments"
        description="Receipts from members count automatically. Only tap “Not received” if the money didn’t reach you."
        actions={
          <RecordPurchase
            bizId={bizId}
            currency={business.currency}
          />
        }
      />

      <nav aria-label="Filter payments" className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? `/dashboard/${bizId}/payments` : `/dashboard/${bizId}/payments?status=${f.key}`}
            aria-current={f.key === filter.key ? "page" : undefined}
            className={cn(
              "flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 transition",
              f.key === filter.key ? "bg-ink text-white ring-ink" : "bg-white text-ink-2 ring-line hover:bg-canvas",
            )}
          >
            {f.label}
            {f.key === "pending" && stats.pending > 0 && (
              <span className="rounded-full bg-accent-600 px-1.5 text-xs leading-5 text-white">{stats.pending}</span>
            )}
          </Link>
        ))}
      </nav>

      {payments.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="size-5" />}
          title={filter.status === "pending" ? "Nothing to review" : "No payments here yet"}
          description={
            filter.status === "pending"
              ? "Receipts that need a quick check from you will show here."
              : "When members upload receipts, or you record a purchase, they show up here."
          }
        />
      ) : (
        <Card className="px-5">
          <ul className="divide-y divide-line">
            {payments.map((p) => (
              <PaymentRow key={p.id} bizId={bizId} payment={p} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
