import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PaymentRow } from "@/components/business/payment-row";
import { RecordPurchase } from "@/components/business/record-purchase";
import { TestPayment } from "@/components/business/test-payment";
import { UnmatchedPayments } from "@/components/business/unmatched-payments";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { syncBusinessIfStale } from "@/lib/bank/sync";
import { getPurchases, getStats, getUnmatchedPayments, hasBankConnection } from "@/lib/business";
import { after } from "next/server";
import { cn } from "@/lib/cn";
import { testPaymentsEnabled } from "@/lib/env";
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
  const [payments, stats, unmatched, connected] = await Promise.all([
    getPurchases(bizId, { status: filter.status }),
    getStats(bizId),
    getUnmatchedPayments(bizId),
    hasBankConnection(bizId),
  ]);
  // Fetch new bank payments in the background if it's been a while.
  if (connected) after(() => syncBusinessIfStale(bizId).catch((e) => console.error("Bank sync failed", e)));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payments"
        description={
          connected
            ? "Transfers into your bank count for the right customer by themselves. Record cash and card payments here."
            : "Connect your bank in Settings and transfers will count for the right customer by themselves."
        }
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

      {!connected && (
        <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="font-semibold">Count transfers without receipts</p>
            <p className="text-sm text-muted">Connect your bank (read-only) and every transfer from a customer counts by itself.</p>
          </div>
          <Link href={`/dashboard/${bizId}/settings/bank`} className={buttonClass({ variant: "primary", size: "sm" })}>
            Connect your bank
          </Link>
        </Card>
      )}

      {testPaymentsEnabled() && <TestPayment bizId={bizId} />}

      <UnmatchedPayments bizId={bizId} payments={unmatched} />

      {payments.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="size-5" />}
          title={filter.status === "pending" ? "Nothing to review" : "No payments here yet"}
          description={
            filter.status === "pending"
              ? "Payments that need a quick check from you will show here."
              : "When customers pay into your connected bank, or you record a purchase, it shows up here."
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
