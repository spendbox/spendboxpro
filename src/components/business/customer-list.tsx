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
  joined: string;
  shared: boolean;
  invited: boolean;
  perksReady: number;
  search: string;
}

export function CustomerList({ bizId, rows, perksOnly = false }: { bizId: string; rows: CustomerListRow[]; perksOnly?: boolean }) {
  const [query, setQuery] = useState("");
  const [onlyPerks, setOnlyPerks] = useState(perksOnly);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    return rows.filter((r) => (!q || r.search.includes(q)) && (!onlyPerks || r.perksReady > 0));
  }, [query, rows, onlyPerks]);

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block">
        <span className="sr-only">Search customers</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone, email or member number"
          className="h-12 w-full rounded-2xl border border-line-strong bg-white pr-4 pl-11 text-[15px] outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
        />
      </label>
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-ink-2">
        <input type="checkbox" checked={onlyPerks} onChange={(e) => setOnlyPerks(e.target.checked)} className="size-4 accent-brand-600" />
        Only customers with perks to give
      </label>

      <div className="overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-line">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-muted">{query ? `No customers match “${query}”.` : "No customers with perks to give right now."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/${bizId}/customers/${r.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-canvas"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <PersonAvatar name={r.initialsFrom} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-semibold text-ink">{r.label}</span>
                        {r.perksReady > 0 && <Badge tone="solid">{r.perksReady === 1 ? "Perk ready" : `${r.perksReady} perks`}</Badge>}
                        {r.invited && <Badge tone="violet">Invited</Badge>}
                      </div>
                      <p className="truncate text-sm text-muted">{r.sub}</p>
                    </div>
                  </div>
                  <span className="hidden shrink-0 text-sm text-muted sm:block">Joined {r.joined}</span>
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
