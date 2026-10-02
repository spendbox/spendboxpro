import { FileImage } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatWhen } from "@/lib/format";
import type { Purchase } from "@/lib/types";

export function PurchaseStatusBadge({
  status,
  audience = "customer",
}: {
  status: Purchase["status"];
  audience?: "customer" | "business";
}) {
  if (status === "verified") return <Badge tone="green">Counted</Badge>;
  if (status === "pending") return <Badge tone="amber">{audience === "customer" ? "Being checked" : "Needs review"}</Badge>;
  return <Badge tone="red">Not received</Badge>;
}

/** A customer's purchases, newest first. */
export function PurchaseList({
  purchases,
  businessNames,
}: {
  purchases: Purchase[];
  /** business_id → name, to show which business each purchase was for. */
  businessNames?: Record<string, string>;
}) {
  return (
    <ul className="divide-y divide-line">
      {purchases.map((p) => (
        <li key={p.id} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">
              {businessNames ? businessNames[p.business_id] : p.description || (p.source === "bank" ? "Bank transfer" : p.source === "business" ? "Purchase" : "Receipt")}
            </p>
            <p className="truncate text-sm text-muted">
              {formatWhen(p.paid_at)}
              {businessNames && p.description ? ` · ${p.description}` : ""}
              {p.source === "business" ? " · added by the business" : p.source === "bank" ? " · transfer" : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="font-bold text-ink tabular">{formatMoney(p.amount, p.currency)}</span>
            <div className="flex items-center gap-1.5">
              {p.receipt_path && (
                <a
                  href={`/api/receipts/${p.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-black/5 hover:text-ink"
                  aria-label="View receipt"
                >
                  <FileImage className="size-4" aria-hidden />
                </a>
              )}
              <PurchaseStatusBadge status={p.status} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
