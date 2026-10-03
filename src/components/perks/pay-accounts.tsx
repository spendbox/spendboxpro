import { Landmark } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/share-actions";

export interface PayAccount {
  institution: string | null;
  account_name: string | null;
  account_number: string;
}

/** Where to send money: the business's account number(s), ready to copy. */
export function PayAccounts({ accounts, businessName }: { accounts: PayAccount[]; businessName: string }) {
  if (accounts.length === 0) return null;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <p className="font-semibold text-ink">Pay {businessName} by transfer</p>
        <p className="text-sm text-muted">Send from an account you&apos;ve added and it counts for you by itself.</p>
      </div>
      <ul className="flex flex-col gap-2">
        {accounts.map((a) => (
          <li key={a.account_number} className="flex items-center gap-3 rounded-2xl bg-canvas p-3 ring-1 ring-line">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 ring-1 ring-line">
              <Landmark className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold tracking-wider text-ink tabular">{a.account_number}</span>
              <span className="block truncate text-sm text-muted">
                {[a.institution, a.account_name].filter(Boolean).join(" · ")}
              </span>
            </span>
            <CopyButton value={a.account_number} label="Copy" compact />
          </li>
        ))}
      </ul>
    </Card>
  );
}
