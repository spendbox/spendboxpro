import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { PerkIcon } from "@/components/perks/perk-card";
import { TimeLeft } from "@/components/perks/time-left";
import { Card } from "@/components/ui/card";
import { PERK_KINDS } from "@/lib/perks";
import type { PerkKind } from "@/lib/types";

export interface ReadyPerk {
  id: string;
  kind: PerkKind;
  title: string;
  expires_at: string | null;
  businessName: string;
}

/**
 * Perks ready to use, as one tidy list (however many there are). Each row
 * opens the perk full screen, ready to show at the counter.
 */
export function ReadyPerks({
  perks,
  showBusiness = false,
  limit,
  moreHref,
}: {
  perks: ReadyPerk[];
  /** Say which business each perk is from (on the home screen). */
  showBusiness?: boolean;
  /** Show only this many: the rest open in place with "View all", or on `moreHref`. */
  limit?: number;
  moreHref?: string;
}) {
  const shown = limit ? perks.slice(0, limit) : perks;
  const rest = perks.slice(shown.length);
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {shown.map((p) => (
        <PerkRow key={p.id} perk={p} showBusiness={showBusiness} />
      ))}
      {rest.length > 0 &&
        (moreHref ? (
          <Link href={moreHref} className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-brand-700 hover:bg-canvas sm:px-5">
            See all {perks.length} perks
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          // The rest open in place.
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-brand-700 hover:bg-canvas sm:px-5 [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">View all {perks.length}</span>
              <span className="hidden group-open:inline">Show fewer</span>
              <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="divide-y divide-line border-t border-line">
              {rest.map((p) => (
                <PerkRow key={p.id} perk={p} showBusiness={showBusiness} />
              ))}
            </div>
          </details>
        ))}
    </Card>
  );
}

function PerkRow({ perk: p, showBusiness }: { perk: ReadyPerk; showBusiness: boolean }) {
  return (
    <Link href={`/me/perks/${p.id}`} className="flex items-center gap-3.5 px-4 py-3.5 transition hover:bg-canvas sm:px-5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: PERK_KINDS[p.kind].color }}>
        <PerkIcon kind={p.kind} className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {showBusiness && <span className="truncate text-xs font-semibold text-muted">{p.businessName}</span>}
        <span className="leading-snug font-semibold break-words text-ink">{p.title}</span>
        <TimeLeft expiresAt={p.expires_at} tone="dark" />
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
