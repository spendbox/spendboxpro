"use client";

import { Landmark, X } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { forgetPayer } from "../actions";

export interface RecognisedPayer {
  id: string;
  sender_name: string | null;
  sender_account: string | null;
  last_seen_at: string;
}

function titleCase(name: string) {
  return name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Bank senders Spendbox counts as this customer. They can remove any of them. */
export function RecognisedPayers({ payers }: { payers: RecognisedPayer[] }) {
  const [shown, remove] = useOptimistic(payers, (list, id: string) => list.filter((p) => p.id !== id));
  const [, startTransition] = useTransition();

  if (shown.length === 0) {
    return (
      <p className="py-5 text-muted">
        None yet. When you pay a business by transfer and it&apos;s counted for you, the account you paid from shows up here.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {shown.map((p) => (
        <li key={p.id} className="flex items-center gap-3 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <Landmark className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {p.sender_name ? titleCase(p.sender_name) : "Bank account"}
              {p.sender_account && <span className="font-normal text-muted"> •••{p.sender_account.slice(-4)}</span>}
            </p>
            <p className="text-sm text-muted">Last payment {formatDate(p.last_seen_at, { withYear: true })}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted"
            aria-label={`This isn't me: stop counting payments from ${p.sender_name ?? "this account"}`}
            onClick={() =>
              startTransition(async () => {
                remove(p.id);
                await forgetPayer(p.id);
              })
            }
          >
            <X className="size-4" aria-hidden /> Not me
          </Button>
        </li>
      ))}
    </ul>
  );
}
