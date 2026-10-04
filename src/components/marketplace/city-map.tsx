"use client";

import { Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { useCallback, useRef, type ReactNode } from "react";
import { BusinessAvatar } from "@/components/ui/avatar";
import type { ExploreBusiness } from "@/lib/types";
import CityCanvas from "./three/city/city-canvas";
import type { LabelPlacement } from "./three/city/label-tracker";
import type { MapApi } from "./three/city/map-controls";

/** The 3D marketplace map, with zoom and full-screen buttons over it. */
export default function CityMap({
  businesses,
  onOpen,
  paused,
  expanded,
  onToggleExpanded,
}: {
  businesses: ExploreBusiness[];
  onOpen: (business: ExploreBusiness) => void;
  paused: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const api = useRef<MapApi | null>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  // Moves the label buttons straight in the page (every frame), without re-rendering React.
  const place = useCallback((placements: LabelPlacement[]) => {
    for (const p of placements) {
      const el = labels.current.get(p.id);
      if (!el) continue;
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -100%)`;
      el.style.visibility = p.visible ? "visible" : "hidden";
    }
  }, []);
  return (
    <div className="relative size-full overflow-hidden">
      <div className="absolute inset-0">
        <CityCanvas businesses={businesses} onOpen={onOpen} paused={paused} apiRef={api} onPlace={place} />
      </div>
      <nav aria-label="Shops on the map" className="pointer-events-none absolute inset-0">
        {businesses.map((b) => (
          <button
            key={b.id}
            ref={(el) => {
              if (el) labels.current.set(b.id, el);
              else labels.current.delete(b.id);
            }}
            type="button"
            onClick={() => onOpen(b)}
            aria-label={`Visit ${b.name}${b.new_products ? `, ${b.new_products} new` : ""}`}
            style={{ visibility: "hidden" }}
            className="pointer-events-auto absolute top-0 left-0 flex items-center gap-1.5 rounded-full bg-white/95 py-1 pr-2.5 pl-1 text-xs font-bold whitespace-nowrap text-ink shadow-lift ring-1 ring-black/5 backdrop-blur will-change-transform select-none hover:ring-brand-400"
          >
            <BusinessAvatar name={b.name} color={b.brand_color} logoUrl={b.logo_url} size="xs" />
            <span className="max-w-28 truncate">{b.name}</span>
            {b.new_products > 0 && (
              <span className="animate-bounce-soft -mr-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] text-white shadow">
                {b.new_products}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="absolute right-3 bottom-3 flex flex-col gap-2">
        <MapButton label={expanded ? "Exit full screen" : "Full screen"} onClick={onToggleExpanded}>
          {expanded ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
        </MapButton>
        <MapButton label="Zoom in" onClick={() => api.current?.zoomBy(1.3)}>
          <Plus className="size-4" aria-hidden />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => api.current?.zoomBy(1 / 1.3)}>
          <Minus className="size-4" aria-hidden />
        </MapButton>
      </div>
    </div>
  );
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center rounded-xl bg-white/95 text-ink shadow-lift ring-1 ring-black/5 backdrop-blur hover:bg-white"
    >
      {children}
    </button>
  );
}
