"use client";

import { Check, X } from "lucide-react";
import { useState, useTransition } from "react";
import { setPurchaseStatus } from "@/app/dashboard/[bizId]/actions";
import { unmatchPayment } from "@/app/dashboard/[bizId]/bank-actions";
import { Button } from "@/components/ui/button";
import type { PurchaseStatus } from "@/lib/types";

export function PaymentActions({
  bizId,
  purchaseId,
  status,
  fromBank = false,
}: {
  bizId: string;
  purchaseId: string;
  status: PurchaseStatus;
  /** Seen in the business's bank: the money arrived, but the customer could be wrong. */
  fromBank?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<PurchaseStatus | null>(null);
  const set = (next: PurchaseStatus) => {
    setTarget(next);
    startTransition(async () => void (await setPurchaseStatus(bizId, purchaseId, next)));
  };
  const busy = (s: PurchaseStatus) => pending && target === s;

  if (fromBank) {
    return (
      <Button
        size="sm"
        variant="ghost"
        loading={pending}
        className="text-muted"
        onClick={() => {
          if (confirm("Not this customer? The payment goes back to “Who paid this?” so you can pick the right one.")) {
            startTransition(async () => void (await unmatchPayment(bizId, purchaseId)));
          }
        }}
      >
        Wrong customer?
      </Button>
    );
  }

  if (status === "pending") {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} loading={busy("verified")} onClick={() => set("verified")}>
          {!busy("verified") && <Check className="size-4" aria-hidden />} Received
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} loading={busy("rejected")} onClick={() => set("rejected")}>
          {!busy("rejected") && <X className="size-4" aria-hidden />} Not received
        </Button>
      </div>
    );
  }
  if (status === "verified") {
    return (
      <Button size="sm" variant="ghost" loading={pending} onClick={() => set("rejected")} className="text-muted">
        Not received?
      </Button>
    );
  }
  return (
    <Button size="sm" variant="ghost" loading={pending} onClick={() => set("verified")}>
      Mark as received
    </Button>
  );
}
