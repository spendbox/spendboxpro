"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export interface CustomerListRow {
  id: string;
  label: string;
  initialsFrom: string | null;
  sub: string;
  visits: number;
  spent: string;
  /** Full amount for the tooltip when "spent" is shortened. */
  spentFull?: string;
  lastVisit: string | null;
  shared: boolean;
  invited: boolean;
  perksReady: number;
  search: string;
}

export function CustomerList({ bizId, rows }: { bizId: string; rows: CustomerListRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    if (!q) return rows;
    return rows.filter((r) => r.search.includes(q));
  }, [query, rows]);

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block">
        <span className="sr-only">Search customers</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone or member number"
          className="h-12 w-full rounded-2xl border border-line-strong bg-white pr-4 pl-11 text-[15px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
        />
      </label>

      <div className="overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-line">
        <div className="hidden grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_24px] gap-4 border-b border-line px-5 py-3 text-xs font-semibold text-muted uppercase md:grid">
          <span>Customer</span>
          <span className="text-right">Purchases</span>
          <span className="text-right">Spent</span>
          <span className="text-right">Last visit</span>
          <span />
        </div>
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-muted">No customers match “{query}”.</p>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/${bizId}/customers/${r.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5 transition hover:bg-canvas md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_24px]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <PersonAvatar name={r.initialsFrom} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-semibold text-ink">{r.label}</span>
                        {r.perksReady > 0 && <Badge tone="solid">{r.perksReady === 1 ? "Perk ready" : `${r.perksReady} perks`}</Badge>}
                        {r.invited && <Badge tone="violet">Invited</Badge>}
                      </div>
                      <p className="truncate text-sm text-muted">
                        {r.sub}
                        <span className="md:hidden"> · {r.visits} purchases · {r.spent}</span>
                      </p>
                    </div>
                  </div>
                  <span className="hidden text-right font-semibold text-ink md:block">{r.visits}</span>
                  <span className="hidden truncate text-right font-semibold text-ink tabular md:block" title={r.spentFull ?? r.spent}>
                    {r.spent}
                  </span>
                  <span className="hidden text-right text-sm text-muted md:block">{r.lastVisit ?? "—"}</span>
                  <ChevronRight className="size-5 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
