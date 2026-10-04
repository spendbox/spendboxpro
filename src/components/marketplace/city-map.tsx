"use client";

import { Maximize2, Minimize2, Minus, Plus, Users } from "lucide-react";
import { useCallback, useRef, type ReactNode } from "react";
import { BusinessAvatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { shortCount } from "@/lib/format";
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
  const widths = useRef(new Map<string, number>());
  // Moves the label buttons straight in the page (every frame), without re-rendering React.
  // When labels would cover each other (lots of shops, or zoomed out), only the
  // front ones show their name; the rest shrink to their round logo.
  const place = useCallback((placements: LabelPlacement[]) => {
    const shown: { el: HTMLButtonElement; p: LabelPlacement; hot: boolean }[] = [];
    for (const p of placements) {
      const el = labels.current.get(p.id);
      if (!el) continue;
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -100%)`;
      el.style.visibility = p.visible ? "visible" : "hidden";
      if (p.visible) shown.push({ el, p, hot: el.dataset.new !== "0" });
    }
    // Shops with new products first, then the ones nearest the viewer (lower on screen).
    shown.sort((a, b) => Number(b.hot) - Number(a.hot) || b.p.y - a.p.y);
    const taken: { l: number; r: number; t: number; b: number }[] = [];
    for (const { el, p } of shown) {
      let width = widths.current.get(p.id);
      if (width === undefined && el.dataset.compact === undefined) {
        width = el.offsetWidth;
        widths.current.set(p.id, width);
      }
      const box = { l: p.x - (width ?? 160) / 2 - 4, r: p.x + (width ?? 160) / 2 + 4, t: p.y - 44, b: p.y };
      const clear = !taken.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t);
      if (clear) taken.push(box);
      if (clear && el.dataset.compact !== undefined) delete el.dataset.compact;
      else if (!clear && el.dataset.compact === undefined) el.dataset.compact = "";
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
            aria-label={`Visit ${b.name}, ${b.customers === 1 ? "1 customer" : `${shortCount(b.customers)} customers`}${b.new_products ? `, ${b.new_products} new` : ""}`}
            data-new={b.new_products}
            style={{ visibility: "hidden" }}
            className="group pointer-events-auto absolute top-0 left-0 flex items-center gap-1.5 rounded-full bg-white/95 py-1 pr-3 pl-1 text-left whitespace-nowrap text-ink shadow-lift ring-1 ring-black/5 backdrop-blur will-change-transform select-none hover:ring-brand-400 data-compact:z-0 data-compact:gap-0 data-compact:p-0.5 data-compact:opacity-90 not-data-compact:z-10"
          >
            <BusinessAvatar name={b.name} color={b.brand_color} logoUrl={b.logo_url} size="sm" className="size-8 rounded-full group-data-compact:size-7" />
            <span className="flex min-w-0 flex-col leading-tight group-data-compact:hidden">
              <span className="max-w-32 truncate text-xs font-bold">{b.name}</span>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-muted tabular-nums">
                <Users className="size-3" aria-hidden />
                {shortCount(b.customers)} {b.customers === 1 ? "customer" : "customers"}
              </span>
            </span>
            {b.new_products > 0 && (
              <span className="animate-bounce-soft -mr-1 flex h-5 group-data-compact:absolute group-data-compact:-top-1.5 group-data-compact:-right-1 group-data-compact:mr-0 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] text-white shadow">
                {b.new_products}
              </span>
            )}
          </button>
        ))}
      </nav>
      {/* Top corner, so the app's menu bar never covers them. */}
      <div className={cn("absolute right-3 flex flex-col gap-2", expanded ? "top-[max(0.75rem,env(safe-area-inset-top))]" : "top-3")}>
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
