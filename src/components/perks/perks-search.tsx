"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ReadyPerks, type ReadyPerk } from "@/components/perks/ready-perks";
import { BusinessAvatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/card";

export interface PerkGroup {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  color: string;
  categories: string[];
  perks: ReadyPerk[];
}

/** Perks grouped by business, with a search box to find a business (or a perk) quickly. */
export function PerksSearch({ groups }: { groups: PerkGroup[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? groups
        .map((g) => {
          const businessHit = `${g.name} ${g.categories.join(" ")}`.toLowerCase().includes(q);
          return businessHit ? g : { ...g, perks: g.perks.filter((p) => p.title.toLowerCase().includes(q)) };
        })
        .filter((g) => g.perks.length > 0)
    : groups;

  return (
    <div className="flex flex-col gap-6">
      {groups.length > 1 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search businesses or perks"
            aria-label="Search businesses or perks"
            className="h-12 w-full rounded-xl border border-line-strong bg-white pr-4 pl-10 text-[15px] outline-none transition placeholder:text-subtle focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
          />
        </div>
      )}
      {shown.length === 0 ? (
        <EmptyState icon={<Search className="size-5" />} title="Nothing matches" description="Try another business name, or a word from the perk." />
      ) : (
        shown.map((g) => (
          <section key={g.id} className="flex flex-col gap-3" aria-label={g.name}>
            <Link href={`/me/b/${g.slug}`} className="flex items-center gap-3">
              <BusinessAvatar name={g.name} color={g.color} logoUrl={g.logoUrl} size="sm" />
              <h2 className="min-w-0 flex-1 truncate font-display text-lg font-bold">{g.name}</h2>
              <span className="text-sm font-semibold text-brand-700">Open</span>
            </Link>
            <ReadyPerks perks={g.perks} />
          </section>
        ))
      )}
    </div>
  );
}
