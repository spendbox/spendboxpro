"use client";

import { useMemo, useState } from "react";
import { House, Search } from "@/components/icons";
import { HOME_KIND_LABEL, type AreaHomes, type HomeFind, type HomeKind } from "@/lib/world/homes";
import type { Listing } from "@/lib/world/market";
import type { Prices } from "@/lib/world/region";
import { cash } from "@/lib/world/value";
import { Sheet } from "../sheet";

const KINDS: (HomeKind | "all")[] = ["all", "room", "flat", "house"];

/**
 * Quick search for a home, area by area: every price shows, the ones your money buys in green and
 * first (nothing to switch on). Tap one to fly there and see it.
 */
export function HomeFinder({
  areas,
  listings,
  coins,
  onPick,
  onListing,
  onClose,
}: {
  areas: AreaHomes[];
  /** Homes other players are selling (null while loading). */
  listings: (Listing & { area: string })[] | null;
  onListing: (l: Listing) => void;
  coins: number;
  prices: Prices;
  onPick: (find: HomeFind) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<HomeKind | "all">("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = areas
      .filter((a) => !t || a.area.toLowerCase().includes(t))
      .map((a) => ({ ...a, homes: a.homes.filter((h) => kind === "all" || h.kind === kind) }))
      .filter((a) => a.homes.length > 0);
    // Areas with a home you can buy now come first (in their own order: cheapest first).
    return [...list.filter((a) => a.homes.some((h) => h.mint <= coins)), ...list.filter((a) => !a.homes.some((h) => h.mint <= coins))];
  }, [areas, q, kind, coins]);
  const sales = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = (listings ?? []).filter((l) => l.use === "home" && (!t || l.area.toLowerCase().includes(t)));
    return [...list.filter((l) => l.price <= coins), ...list.filter((l) => l.price > coins)];
  }, [listings, q, coins]);
  const affordable = rows.reduce((n, a) => n + a.homes.filter((h) => h.mint <= coins).length, 0);
  return (
    <Sheet onClose={onClose} title="Find a home">
      <p className="text-sm text-muted">
        You have <b className="text-ink">{cash(coins)}</b>. <span className="font-semibold text-me">Green</span> ones you can buy now. Tap a home to see it.
      </p>
      <label className="mt-3 flex h-10 items-center gap-2 rounded-full bg-ink/5 px-3 text-sm">
        <Search className="size-4 shrink-0 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Area: Yaba, Surulere…" className="min-w-0 flex-1 bg-transparent outline-none" aria-label="Search areas" />
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`h-8 rounded-full px-3 text-xs font-semibold ${kind === k ? "bg-ink text-white" : "bg-ink/5"}`}
          >
            {k === "all" ? "All" : `${HOME_KIND_LABEL[k]}s`}
          </button>
        ))}
      </div>
      {sales.length > 0 && (
        <>
          <p className="mt-4 text-sm font-semibold">For sale by players</p>
          <ul className="mt-2 divide-y divide-ink/5 rounded-2xl ring-1 ring-gold/30">
            {sales.slice(0, 20).map((l) => (
              <li key={l.unit}>
                <button onClick={() => onListing(l)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-ink/[0.03]">
                  <House className="size-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{l.label}</span>
                    <span className="block truncate text-xs text-muted">
                      {l.area} · {l.mine ? "yours" : l.who}
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${l.price <= coins ? "text-me" : ""}`}>{cash(l.price)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm font-semibold">From the city</p>
        </>
      )}
      <ul className="mt-3 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
        {rows.slice(0, 60).map((a) => (
          <li key={a.area} className="px-3 py-2.5">
            <p className="text-sm font-semibold">{a.area}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {a.homes.map((h) => {
                const ok = h.mint <= coins;
                return (
                  <button
                    key={h.kind}
                    onClick={() => onPick(h)}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${ok ? "bg-me/10 ring-me/30" : "bg-ink/[0.03] text-muted ring-ink/10"}`}
                  >
                    <House className="size-3.5" />
                    <span className="font-semibold">{HOME_KIND_LABEL[h.kind]}</span>
                    <span className="tabular-nums">{cash(h.mint)}</span>
                  </button>
                );
              })}
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted">
            No area by that name.
          </li>
        )}
      </ul>
      <p className="mt-2 text-[11px] text-muted">
        {affordable === 0 && rows.length > 0 ? "None in your budget yet: renting is cheaper, or keep stacking. " : ""}
        What you can afford first, then cheapest first. Prices are the cheapest of each kind near the middle of each area.
      </p>
    </Sheet>
  );
}
