"use client";

import { CheckCircle2, Gift, Store } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PerkIcon } from "@/components/perks/perk-card";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/format";
import { PERK_KINDS } from "@/lib/perks";
import type { PerkKind } from "@/lib/types";

export interface UsedPerk {
  id: string;
  kind: PerkKind;
  title: string;
  businessName: string;
  redeemed_at: string | null;
}

const tile =
  "flex min-w-0 flex-col gap-1 rounded-3xl bg-surface p-4 text-left shadow-card ring-1 ring-line transition hover:ring-brand-300 sm:p-5";

/** Light numbers for the customer's home: perks ready, perks used (tap for the list), plugs. */
export function PerkStats({ ready, used, plugs }: { ready: number; used: UsedPerk[]; plugs: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Link href="/me/perks" className={tile}>
          <Gift className="size-5 text-brand-700" aria-hidden />
          <span className="text-2xl font-semibold tracking-tight text-ink tabular">{ready}</span>
          <span className="truncate text-xs font-semibold text-muted">Perks ready</span>
        </Link>
        <button type="button" onClick={() => setOpen(true)} className={tile} aria-haspopup="dialog">
          <CheckCircle2 className="size-5 text-brand-700" aria-hidden />
          <span className="text-2xl font-semibold tracking-tight text-ink tabular">{used.length}</span>
          <span className="truncate text-xs font-semibold text-muted">Perks used</span>
        </button>
        <a href="#plugs" className={tile}>
          <Store className="size-5 text-brand-700" aria-hidden />
          <span className="text-2xl font-semibold tracking-tight text-ink tabular">{plugs}</span>
          <span className="truncate text-xs font-semibold text-muted">My Plugs</span>
        </a>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Perks you've used"
        description={used.length ? "Newest first." : "When a business gives you a perk, it shows here."}
      >
        {used.length > 0 && (
          <ul className="-mx-1 flex max-h-[60dvh] flex-col divide-y divide-line overflow-y-auto">
            {used.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-1 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: PERK_KINDS[p.kind].color }}>
                  <PerkIcon kind={p.kind} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold break-words text-ink">{p.title}</span>
                  <span className="block text-sm text-muted">
                    {p.businessName}
                    {p.redeemed_at ? ` · used ${formatDate(p.redeemed_at, { withYear: true })}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
