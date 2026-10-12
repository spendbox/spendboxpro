"use client";

import { useEffect, useState } from "react";
import { MapPin, Users } from "@/components/icons";
import { Sheet } from "./sheet";
import { cityPlayers } from "./city-actions";
import { MapSearch, type SearchHit } from "./life/map-search";
import type { RegionMap } from "@/lib/world/compile";
import type { AssetUnit } from "@/lib/world/property-api";

/** Tapping the place's name: search the map, who's here now, how many play, and the cities by how many live there. */
export function CityCard({
  city,
  area,
  online,
  players,
  onClose,
  search,
}: {
  city: string;
  area: string | null;
  online: number | null;
  players: number;
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
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-2xl bg-ink/[0.04] p-3">
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
            <span className="size-2 animate-pulse rounded-full bg-me" /> Online now
          </p>
          <p className="font-display text-2xl font-extrabold tabular-nums">{online === null ? "…" : online.toLocaleString("en-GB")}</p>
        </div>
        <div className="rounded-2xl bg-ink/[0.04] p-3">
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
            <Users className="size-3.5" /> Players
          </p>
          <p className="font-display text-2xl font-extrabold tabular-nums">{players.toLocaleString("en-GB")}</p>
        </div>
      </div>
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
