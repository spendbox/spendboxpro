"use client";

import { useMemo, useState } from "react";
import { House, Landmark, MapPin, Search, TrainFront, X } from "@/components/icons";
import type { RegionMap } from "@/lib/world/compile";
import { toTile } from "@/lib/world/geo";
import { ownedSpot } from "@/lib/world/owned";
import type { AssetUnit } from "@/lib/world/property-api";

export type SearchHit = { label: string; note: string; x: number; z: number; kind: "area" | "landmark" | "station" | "mine" };

const ICON = { area: MapPin, landmark: Landmark, station: TrainFront, mine: House };

/** Everything on a real map you can search for: areas, districts, landmarks, stations, your own property. */
export function searchable(region: RegionMap, mine: AssetUnit[]): SearchHit[] {
  const at = (lat: number, lon: number) => toTile(region.frame, { lat, lon });
  const out: SearchHit[] = [];
  for (const u of mine) {
    const s = ownedSpot(u.building);
    if (s) out.push({ label: u.name ?? u.label, note: "Yours", x: s.x, z: s.z, kind: "mine" });
  }
  for (const d of region.region.districts) out.push({ label: d.name, note: "District", ...at(d.at.lat, d.at.lon), kind: "area" });
  for (const a of region.region.areas) out.push({ label: a.name, note: a.kind === "town" ? "Town" : "Neighbourhood", ...at(a.at[0], a.at[1]), kind: "area" });
  for (const c of region.region.corrections) if (c.kind === "area") out.push({ label: c.area.name, note: "Neighbourhood", ...at(c.area.at[0], c.area.at[1]), kind: "area" });
  for (const l of region.landmarks) out.push({ label: l.name, note: "Landmark", x: l.ax + (l.w - 1) / 2, z: l.az + (l.d - 1) / 2, kind: "landmark" });
  for (const s of region.stations) out.push({ label: `${s.name} station`, note: "Railway station", x: s.x, z: s.z, kind: "station" });
  return out;
}

/** The search box on a real map: type a place, pick it, and the camera flies there. */
export function MapSearch({
  region,
  mine,
  onPick,
  compact,
  onOpenChange,
}: {
  region: RegionMap;
  mine: AssetUnit[];
  onPick: (hit: SearchHit) => void;
  compact?: boolean;
  /** Compact: tells when the box opens and closes (the life buttons make way on phones). */
  onOpenChange?: (open: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  // Compact: a round search button that opens into the box (on a computer, always the box).
  const [shown, setShownState] = useState(false);
  const setShown = (v: boolean) => {
    setShownState(v);
    onOpenChange?.(v);
  };
  const all = useMemo(() => searchable(region, mine), [region, mine]);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const starts = all.filter((h) => h.label.toLowerCase().startsWith(t));
    const has = all.filter((h) => !h.label.toLowerCase().startsWith(t) && h.label.toLowerCase().includes(t));
    const seen = new Set<string>();
    return [...starts, ...has].filter((h) => !seen.has(h.label + h.note) && seen.add(h.label + h.note)).slice(0, 8);
  }, [all, q]);
  if (compact && !shown)
    return (
      <>
        <button onClick={() => setShown(true)} className="glass pointer-events-auto grid size-9 place-items-center rounded-full sm:hidden" aria-label="Search the map">
          <Search className="size-4" />
        </button>
        <div className="max-sm:hidden">{box()}</div>
      </>
    );
  return box();

  function box() {
    return (
      <div className={`pointer-events-auto relative ${compact ? "w-[min(18rem,calc(100vw-1.5rem))]" : "w-[min(20rem,calc(100vw-1.5rem))]"}`}>
        <label className="glass flex h-9 items-center gap-2 rounded-full px-3 text-sm">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            autoFocus={shown}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[0]) {
                onPick(hits[0]);
                setOpen(false);
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search Lagos: Yaba, National Theatre…"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
            aria-label="Search the map"
          />
          {(q || (compact && shown)) && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQ("");
                setOpen(false);
                if (compact) setShown(false);
              }}
              aria-label={compact && shown ? "Close search" : "Clear"}
            >
              <X className="size-4 text-muted" />
            </button>
          )}
        </label>
        {open && hits.length > 0 && (
          <ul className="absolute inset-x-0 top-11 z-20 overflow-hidden rounded-2xl bg-panel shadow-xl ring-1 ring-ink/10">
            {hits.map((h) => {
              const Icon = ICON[h.kind];
              return (
                <li key={h.label + h.note + h.x}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onPick(h);
                      setQ(h.label);
                      setOpen(false);
                      if (compact) setShown(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-ink/5"
                  >
                    <Icon className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{h.label}</span>
                    <span className="shrink-0 text-xs text-muted">{h.note}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }
}
