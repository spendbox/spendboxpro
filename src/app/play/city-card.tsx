"use client";

import { useEffect, useState } from "react";
import { MapPin } from "@/components/icons";
import { Sheet } from "./sheet";
import { cityPlayers } from "./city-actions";
import { MapSearch, type SearchHit } from "./life/map-search";
import type { RegionMap } from "@/lib/world/compile";
import type { AssetUnit } from "@/lib/world/property-api";

/** Tapping the place's name: search the map, and the cities by how many live there (the numbers are on the online button). */
export function CityCard({
  city,
  area,
  onClose,
  search,
}: {
  city: string;
  area: string | null;
  onClose: () => void;
  /** Searching the map: pick a place and the camera flies there. */
  search?: { region: RegionMap; mine: AssetUnit[]; onPick: (h: SearchHit) => void } | null;
}) {
  const [cities, setCities] = useState<{ id: string; name: string; players: number }[] | null>(null);
  useEffect(() => {
    let alive = true;
    void cityPlayers()
      .then((c) => alive && setCities(c))
      .catch(() => alive && setCities([]));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Sheet onClose={onClose} title={city} clear>
      {search && (
        <div className="mb-3">
          <MapSearch
            region={search.region}
            mine={search.mine}
            onPick={(h) => {
              search.onPick(h);
              onClose();
            }}
          />
        </div>
      )}
      {area && (
        <p className="flex items-center gap-1 text-sm text-muted">
          <MapPin className="size-3.5" /> You&apos;re looking at {area}
        </p>
      )}
      <p className="mt-4 text-sm font-semibold">Cities</p>
      <ul className="mt-2 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
        {(cities ?? []).map((c, k) => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="grid size-6 place-items-center rounded-full bg-gold/20 text-xs font-bold text-gold-dark">{k + 1}</span>
            <span className="flex-1 text-sm font-medium">{c.name}</span>
            <span className="text-sm text-muted tabular-nums">{c.players.toLocaleString("en-GB")} living here</span>
          </li>
        ))}
        {cities === null && <li className="px-3 py-3 text-sm text-muted">Counting…</li>}
      </ul>
      <p className="mt-2 text-[11px] text-muted">More cities are coming.</p>
    </Sheet>
  );
}
