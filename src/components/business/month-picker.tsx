"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/cn";
import { formatMoney, monthName } from "@/lib/format";

const arrow =
  "flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-ink-2 ring-1 ring-line transition hover:bg-canvas aria-disabled:pointer-events-none aria-disabled:opacity-40";

/** ‹ September 2026 › with a searchable list of every month that has sales. */
export function MonthPicker({
  month,
  months,
  hrefFor,
  currency,
  prevHref,
  nextHref,
}: {
  month: string;
  months: { month: string; total: number }[];
  /** month (YYYY-MM) → link */
  hrefFor: Record<string, string>;
  currency: string;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className={cn("flex items-center gap-2 transition-opacity", pending && "opacity-60")}>
      <Link href={prevHref ?? "#"} scroll={false} aria-disabled={!prevHref} aria-label="Previous month" className={arrow}>
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <Combobox
        aria-label="Choose a month"
        className="min-w-0 flex-1 sm:w-56 sm:flex-none"
        options={months.map((m) => ({
          value: m.month,
          label: monthName(m.month),
          hint: m.total ? formatMoney(m.total, currency) : "No sales",
        }))}
        value={month}
        onChange={(value) => startTransition(() => router.push(hrefFor[value], { scroll: false }))}
        searchable={months.length > 8}
        searchPlaceholder="Search months"
      />
      <Link href={nextHref ?? "#"} scroll={false} aria-disabled={!nextHref} aria-label="Next month" className={arrow}>
        <ChevronRight className="size-5" aria-hidden />
      </Link>
    </div>
  );
}
