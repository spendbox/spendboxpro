import { FileImage, Landmark, PenLine, UserCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { PurchaseStatusBadge } from "@/components/purchases/purchase-list";
import { formatMoney, formatWhen, isWithinMinutes, memberLabel, memberNo } from "@/lib/format";
import type { BusinessPurchaseRow } from "@/lib/types";
import { PaymentActions } from "./payment-actions";

function senderText(name: string | null) {
  return name ? name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "the sender";
}

function howMatched(p: BusinessPurchaseRow) {
  if (p.source === "bank") {
    const from = `From ${senderText(p.sender_name)}`;
    if (p.match_method === "payer") return { icon: Landmark, text: `${from} · recognised` };
    if (p.match_method === "name") return { icon: UserCheck, text: `${from} · matched by name` };
    return { icon: Landmark, text: `${from} · picked by you` };
  }
  if (p.source === "business" && p.from_bank) return { icon: PenLine, text: `Added by you · from ${senderText(p.sender_name)}` };
  if (p.source === "business") return { icon: PenLine, text: "Added by you" };
  if (p.match_method === "account") return { icon: Landmark, text: `Paid into ${p.bank_label ?? "your account"}` };
  if (p.match_method === "name") return { icon: UserCheck, text: "Matched by name — please check" };
  return { icon: UserRound, text: "Customer picked your business — please check" };
}

/** One payment in the business's list, with confirm / not-received buttons. */
export function PaymentRow({ bizId, payment, showMember = true }: { bizId: string; payment: BusinessPurchaseRow; showMember?: boolean }) {
  const how = howMatched(payment);
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {showMember ? (
            <Link
              href={`/dashboard/${bizId}/customers/${payment.membership_id}`}
              className="font-semibold text-ink hover:underline"
            >
              {memberLabel(payment.member_no, payment.member_name)}
            </Link>
          ) : (
            <span className="font-semibold text-ink">{payment.description || "Purchase"}</span>
          )}
          {showMember && payment.member_name && <span className="text-sm text-muted">{memberNo(payment.member_no)}</span>}
          <PurchaseStatusBadge status={payment.status} audience="business" />
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <how.icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{how.text}</span>
        </p>
        <p className="mt-0.5 truncate text-sm text-muted">
          {formatWhen(payment.paid_at)}
          {payment.reference ? ` · Ref ${payment.reference}` : ""}
          {showMember && payment.description ? ` · ${payment.description}` : ""}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <div className="flex items-center gap-2">
          {payment.has_receipt && (
            <a
              href={`/api/receipts/${payment.id}/file`}
              target="_blank"
              rel="noreferrer"
              className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-black/5 hover:text-ink"
              aria-label="View receipt"
              title="View receipt"
            >
              <FileImage className="size-4" aria-hidden />
            </a>
          )}
          <span className="text-lg font-semibold text-ink">{formatMoney(payment.amount, payment.currency)}</span>
        </div>
        <PaymentActions
          bizId={bizId}
          purchaseId={payment.id}
          status={payment.status}
          fromBank={payment.from_bank}
          canDelete={payment.source === "business" && isWithinMinutes(payment.created_at, 60)}
        />
      </div>
    </li>
  );
}
