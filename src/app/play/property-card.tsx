"use client";

import { Building2, House, MapPin, Store, Trees, X } from "@/components/icons";
import type { PropertyInfo, PropertyUnit } from "@/lib/world/property";
import { Sheet } from "./sheet";

const fmt = (n: number) => n.toLocaleString("en-GB");

const ICON: Record<PropertyUnit["use"], typeof House> = { home: House, shop: Store, office: Building2, industry: Building2, land: Trees };

/** A property on the real map, tapped: what it is, what it's worth, and every unit in it. */
export function PropertyCard({ info, onClose }: { info: PropertyInfo; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} wide>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-extrabold leading-tight">
            {info.title}
            {info.state && <span className="ml-2 rounded-full bg-gold/15 px-2 py-0.5 align-middle text-xs font-semibold text-gold-dark">{info.state}</span>}
          </h2>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">
              {info.address} · {info.area}
            </span>
          </p>
          {info.kind && <p className="mt-0.5 text-sm text-muted">{info.kind}</p>}
          {info.estate && <p className="mt-0.5 text-sm text-muted">In {info.estate} (a gated estate)</p>}
        </div>
        <button onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-ink/5" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-ink/[0.04] p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-muted">Worth</span>
          <span className="font-display text-2xl font-extrabold tabular-nums">₥{fmt(info.mint)}</span>
        </div>
        <p className="text-right text-xs text-muted">about {info.local}</p>
        <div className="mt-2 flex gap-4 text-xs text-muted">
          <span>Land ₥{fmt(info.landMint)}</span>
          <span>Building ₥{fmt(info.buildingMint)}</span>
          <span>Plot {fmt(info.plot)} m²</span>
          {info.storeys > 0 && <span>{info.storeys} {info.storeys === 1 ? "storey" : "storeys"}</span>}
        </div>
      </div>

      <h3 className="mt-5 text-sm font-semibold">
        {info.units.length === 1 ? "One unit" : `${info.units.length} units`} you could own
      </h3>
      <ul className="mt-2 max-h-72 divide-y divide-ink/5 overflow-y-auto rounded-2xl ring-1 ring-ink/5">
        {info.units.map((u) => {
          const Icon = ICON[u.use];
          return (
            <li key={u.id} className="flex items-center gap-3 px-3 py-2.5">
              <Icon className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.label}</p>
                <p className="truncate text-xs text-muted">
                  {fmt(u.area)} m² · {u.earns}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">₥{fmt(u.mint)}</p>
                <p className="text-[11px] text-muted">{u.local}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-center text-xs text-muted">Buying property is coming next.</p>
    </Sheet>
  );
}
