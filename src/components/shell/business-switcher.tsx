import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { BusinessAvatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import type { Business } from "@/lib/types";

/** Shows the current business; lets owners of several businesses switch between them. */
export function BusinessSwitcher({
  current,
  businesses,
  compact,
}: {
  current: Business;
  businesses: Business[];
  compact?: boolean;
}) {
  return (
    <details className="group relative">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-3 rounded-2xl transition hover:bg-black/5 [&::-webkit-details-marker]:hidden",
          compact ? "h-10 max-w-[60vw] px-2" : "p-2 ring-1 ring-line",
        )}
      >
        <BusinessAvatar name={current.name} color={current.brand_color} logoUrl={current.logo_url} size="sm" className={compact ? "size-7 rounded-lg text-[10px]" : ""} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate font-bold text-ink", compact ? "text-sm" : "text-[15px]")}>{current.name}</span>
          {!compact && <span className="block truncate text-xs text-muted">Business account</span>}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
      </summary>
      <div
        className={cn(
          "absolute z-40 mt-2 flex w-64 flex-col gap-1 rounded-2xl bg-white p-2 shadow-lift ring-1 ring-line",
          compact ? "right-0" : "left-0",
        )}
      >
        {businesses.map((b) => (
          <Link
            key={b.id}
            href={`/dashboard/${b.id}`}
            className="flex items-center gap-3 rounded-xl p-2 text-sm font-semibold hover:bg-canvas"
          >
            <BusinessAvatar name={b.name} color={b.brand_color} logoUrl={b.logo_url} size="sm" className="size-7 rounded-lg text-[10px]" />
            <span className="min-w-0 flex-1 truncate">{b.name}</span>
            {b.id === current.id && <Check className="size-4 text-brand-600" aria-label="Current" />}
          </Link>
        ))}
        <Link href="/start" className="flex items-center gap-3 rounded-xl p-2 text-sm font-semibold text-brand-700 hover:bg-canvas">
          <span className="flex size-7 items-center justify-center rounded-lg bg-brand-50">
            <Plus className="size-4" aria-hidden />
          </span>
          Add a business
        </Link>
      </div>
    </details>
  );
}
