import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/** A number with a label, and an optional small line under it. */
export function StatTile({ label, value, note, href }: { label: string; value: ReactNode; note?: ReactNode; href?: string }) {
  const body = (
    <Card className={cn("flex h-full flex-col gap-1 p-4 sm:p-5", href && "transition hover:ring-brand-200")}>
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="font-display text-2xl font-bold tracking-tight tabular sm:text-3xl">{value}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-3xl">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Search box that updates the address (?q=), so results can be shared and the back button works. */
export function SearchBox({ action, q, placeholder, hidden }: { action: string; q: string; placeholder: string; hidden?: Record<string, string> }) {
  return (
    <form action={action} className="relative" role="search">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-12 w-full rounded-2xl border border-line-strong bg-white pr-4 pl-11 text-[16px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
      />
    </form>
  );
}

export function FilterChips({ items, current }: { items: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <nav aria-label="Filter" className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {items.map((f) => (
        <Link
          key={f.key}
          href={f.href}
          aria-current={f.key === current ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition",
            f.key === current ? "bg-ink text-white ring-ink" : "bg-white text-ink-2 ring-line hover:bg-black/5",
          )}
        >
          {f.label}
        </Link>
      ))}
    </nav>
  );
}

export function Pager({ page, pages, hrefFor, total }: { page: number; pages: number; hrefFor: (p: number) => string; total: number }) {
  if (pages <= 1) return <p className="text-sm text-muted">{total} in total</p>;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <p className="text-muted">
        Page {page} of {pages} · {total} in total
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={hrefFor(page - 1)} className="flex h-10 items-center gap-1 rounded-xl px-3 font-semibold ring-1 ring-line hover:bg-black/5">
            <ChevronLeft className="size-4" aria-hidden /> Back
          </Link>
        )}
        {page < pages && (
          <Link href={hrefFor(page + 1)} className="flex h-10 items-center gap-1 rounded-xl px-3 font-semibold ring-1 ring-line hover:bg-black/5">
            Next <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

/** Builds a link to the same list with some search params changed. */
export function listHref(base: string, params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || (k === "page" && Number(v) <= 1) || (k === "filter" && v === "all")) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-semibold break-words sm:text-right">{children}</dd>
    </div>
  );
}
