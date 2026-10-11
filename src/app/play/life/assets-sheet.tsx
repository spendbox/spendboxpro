"use client";

import { Building2, Coins, House, KeyRound, MapPin, Store, Trees, TrendingUp } from "@/components/icons";
import type { RegionMap } from "@/lib/world/compile";
import { BUILDING_LABEL } from "@/lib/world/buildings";
import { ownedSpot, type OwnedProperty } from "@/lib/world/owned";
import type { AssetsData, AssetUnit } from "@/lib/world/property-api";
import { toMint, valueOf } from "@/lib/world/value";

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");
const ICON: Record<AssetUnit["use"], typeof House> = { home: House, shop: Store, office: Building2, industry: Building2, land: Trees };

/** What one of your units is worth now (its building as bought, the land where it stands now). */
export function unitValueNow(u: AssetUnit, owned: OwnedProperty[], region: RegionMap) {
  const b = owned.find((o) => o.id === u.building)?.building;
  const spot = ownedSpot(u.building);
  const k = Number(u.unit.split("/")[1]);
  if (!b || !spot) return u.price;
  return toMint(valueOf(b, region.landPriceAt(spot.x, spot.z), region.region.prices).units[k] ?? 0, region.region.prices);
}

/** Your property: everything you own, what it's worth now against what you paid, what it earns. */
export function AssetsBody({
  assets,
  owned,
  region,
  busy,
  onCollect,
  onShow,
}: {
  assets: AssetsData;
  owned: OwnedProperty[];
  region: RegionMap;
  busy: boolean;
  onCollect: () => void;
  onShow: (u: AssetUnit) => void;
}) {
  const rows = assets.units.map((u) => ({ u, now: unitValueNow(u, owned, region) }));
  const worth = rows.reduce((t, r) => t + r.now, 0);
  const paid = rows.reduce((t, r) => t + r.u.price, 0);
  const waiting = assets.units.reduce((t, u) => t + u.waiting, 0);
  const daily = assets.units.reduce((t, u) => t + (u.let ? u.rentDay : 0), 0);
  const home = assets.life?.home_unit ?? null;
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Owned" value={String(rows.length)} />
        <Stat label="Worth" value={`₥${fmt(worth)}`} note={paid ? `${worth >= paid ? "+" : ""}${(((worth - paid) / paid) * 100).toFixed(1)}%` : undefined} />
        <Stat label="Rent a day" value={`₥${fmt(daily)}`} />
      </div>
      {waiting >= 0.01 && (
        <button disabled={busy} onClick={onCollect} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gold font-semibold text-ink disabled:opacity-50">
          <Coins className="size-4" /> Collect ₥{waiting.toFixed(2)}
        </button>
      )}
      {rows.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted">Nothing yet. Tap a building to buy.</p>
      ) : (
        <ul className="mt-4 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
          {rows.map(({ u, now }) => {
            const Icon = ICON[u.use];
            const b = owned.find((o) => o.id === u.building)?.building;
            const what = u.name ?? (b ? BUILDING_LABEL[b.kind] : "");
            const gain = now - u.price;
            return (
              <li key={u.unit} className="flex items-center gap-3 px-3 py-3">
                <Icon className="size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {u.label}
                    {home === u.unit && <span className="ml-2 rounded-full bg-me/15 px-2 py-0.5 text-[11px] font-semibold text-me">Home</span>}
                    {u.let && (
                      <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-semibold text-gold-dark">
                        <KeyRound className="mr-0.5 inline size-3" />
                        ₥{u.rentDay.toFixed(2)}/day
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {what} · {region.areaAt(ownedSpot(u.building)?.x ?? 0, ownedSpot(u.building)?.z ?? 0)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">₥{fmt(now)}</p>
                  <p className={`flex items-center justify-end gap-0.5 text-[11px] ${gain >= 0 ? "text-me" : "text-hit"}`}>
                    <TrendingUp className="size-3" />
                    {gain >= 0 ? "+" : ""}
                    {fmt(gain)}
                  </p>
                </div>
                <button onClick={() => onShow(u)} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-ink/5" aria-label="Show on the map">
                  <MapPin className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-ink/[0.04] px-2 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="font-display text-base font-extrabold tabular-nums">{value}</p>
      {note && <p className="text-[11px] text-muted">{note}</p>}
    </div>
  );
}
