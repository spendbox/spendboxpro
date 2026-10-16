"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, MapPin } from "@/components/icons";
import { cityPlayers } from "./city-actions";
import { MapSearch, type SearchHit, type SearchNear } from "./life/map-search";
import type { RegionMap } from "@/lib/world/compile";
import type { MapBusiness } from "@/lib/world/business";
import type { AreaHomes } from "@/lib/world/homes";
import type { OwnedProperty } from "@/lib/world/owned";
import type { AssetUnit } from "@/lib/world/property-api";

/**
 * Tapping the place's name (top left): it opens out into a search across the top of the screen,
 * the results under it (the kinds of place before anything's typed), and the cities by how many
 * live there at the bottom. Tap the map below, the back arrow or Escape to close.
 */
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
  search?: { region: RegionMap; mine: AssetUnit[]; owned?: OwnedProperty[]; businesses?: MapBusiness[]; coins?: number; homes?: () => AreaHomes[]; onPick: (h: SearchHit) => void; near?: SearchNear } | null;
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label={`Search ${city}`}>
      {/* The map below, dimmed: tap it to close. */}
      <button aria-label="Close search" onClick={onClose} className="search-dim absolute inset-0 bg-ink/35" />
      <div className="search-open absolute inset-x-0 top-0 flex max-h-[100dvh] flex-col rounded-b-3xl bg-panel px-3 pb-3 pt-[max(0.6rem,env(safe-area-inset-top))] shadow-2xl sm:px-4">
        <div className="flex min-h-0 flex-1 items-start gap-2">
          <button onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full bg-ink/5" aria-label="Close search">
            <ArrowLeft className="size-5" />
          </button>
          {search ? (
            <div className="flex max-h-[calc(100dvh-7rem)] min-h-0 min-w-0 flex-1 flex-col">
              <MapSearch
                full
                region={search.region}
                mine={search.mine}
                owned={search.owned}
                businesses={search.businesses}
                coins={search.coins}
                homes={search.homes}
                near={search.near}
                onClose={onClose}
                onPick={(h) => {
                  search.onPick(h);
                  onClose();
                }}
              />
            </div>
          ) : (
            <p className="flex h-11 items-center font-display text-lg font-bold">{city}</p>
          )}
        </div>
        <div className="mt-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink/5 pt-2 text-xs text-muted">
          {area && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" /> You&apos;re looking at {area}
            </span>
          )}
          <span className="flex min-w-0 flex-wrap items-center gap-x-2">
            {(cities ?? []).map((c) => (
              <span key={c.id}>
                <b className="text-ink">{c.name}</b> {c.players.toLocaleString("en-GB")} living here
              </span>
            ))}
            {cities === null ? "Counting…" : "· More cities are coming."}
          </span>
        </div>
      </div>
    </div>
  );
}
