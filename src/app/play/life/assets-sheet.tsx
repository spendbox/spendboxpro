"use client";

import { useState } from "react";
import { Building2, ChevronDown, ChevronUp, Coins, House, Landmark, MapPin, Search, Store, Trees, TrendingUp } from "@/components/icons";
import type { RegionMap } from "@/lib/world/compile";
import { BUILDING_LABEL } from "@/lib/world/buildings";
import { RENT_LEVEL, type MarketBoard, type Offer, type RentLevel } from "@/lib/world/market";
import { ownedSpot, type OwnedProperty } from "@/lib/world/owned";
import type { AssetsData, AssetUnit } from "@/lib/world/property-api";
import { toMint, valueOf } from "@/lib/world/value";

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");
const fmt2 = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
const ICON: Record<AssetUnit["use"], typeof House> = { home: House, shop: Store, office: Building2, industry: Building2, land: Trees };
const LEVELS: RentLevel[] = ["low", "fair", "high"];

/** What one of your units is worth now (its building as bought, the land where it stands now). */
export function unitValueNow(u: AssetUnit, owned: OwnedProperty[], region: RegionMap) {
  const b = owned.find((o) => o.id === u.building)?.building;
  const spot = ownedSpot(u.building);
  const k = Number(u.unit.split("/")[1]);
  if (!b || !spot) return u.price;
  return toMint(valueOf(b, region.landPriceAt(spot.x, spot.z), region.region.prices).units[k] ?? 0, region.region.prices);
}

/** "in 2h 10m", "in 25m", "now". */
export function inTime(iso: string | null | undefined) {
  const ms = iso ? Date.parse(iso) - Date.now() : 0;
  if (ms <= 0) return "now";
  const m = Math.round(ms / 60_000);
  return m >= 60 ? `in ${Math.floor(m / 60)}h ${m % 60}m` : `in ${m}m`;
}

/** What you can do with your property from the Money screen. */
export type Owning = {
  board: MarketBoard | null;
  onLet: (u: AssetUnit, on: boolean) => void;
  onLevel: (u: AssetUnit, level: RentLevel) => void;
  onSell: (u: AssetUnit, worth: number) => void;
  onUnsell: (u: AssetUnit) => void;
  onAnswer: (o: Offer, action: "accept" | "refuse") => void;
  onCounter: (o: Offer) => void;
  onReply: (o: Offer, action: "accept" | "withdraw") => void;
  onBorrow: () => void;
  onRepay: () => void;
  /** Look for property to buy (the home search, with players' sales). */
  onFind: () => void;
};

/** Your property: everything you own, its tenants, sales and offers, and your World Bank loan. */
export function AssetsBody({
  assets,
  owned,
  region,
  busy,
  owning,
  onCollect,
  onShow,
}: {
  assets: AssetsData;
  owned: OwnedProperty[];
  region: RegionMap;
  busy: boolean;
  owning: Owning;
  onCollect: () => void;
  onShow: (u: AssetUnit) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [clock] = useState(() => Date.now());
  const rows = assets.units.map((u) => ({ u, now: unitValueNow(u, owned, region) }));
  const worth = rows.reduce((t, r) => t + r.now, 0);
  const paid = rows.reduce((t, r) => t + r.u.price, 0);
  const waiting = assets.units.reduce((t, u) => t + u.waiting, 0);
  const tenantIn = (u: AssetUnit) => u.let && !!u.tenantFrom && Date.parse(u.tenantFrom) <= clock;
  const daily = assets.units.reduce((t, u) => t + (tenantIn(u) ? u.rentDay * RENT_LEVEL[u.rentLevel ?? "fair"].factor : 0), 0);
  const home = assets.life?.home_unit ?? null;
  const { board } = owning;
  const btn = "h-8 rounded-full px-3 text-xs font-semibold disabled:opacity-40";
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

      {(board?.received.length ?? 0) > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">Offers for you</p>
          <ul className="mt-2 space-y-2">
            {board!.received.map((o) => (
              <li key={o.id} className="rounded-2xl bg-gold/10 p-3 ring-1 ring-gold/30">
                <p className="text-sm">
                  <b>{o.who}</b> offers <b className="tabular-nums">₥{fmt2(o.price)}</b> for {o.label ?? "your unit"}
                </p>
                {o.status === "countered" ? (
                  <p className="mt-1 text-xs text-muted">You asked ₥{fmt2(o.counter ?? 0)}. Waiting for them.</p>
                ) : (
                  <div className="mt-2 flex gap-1.5">
                    <button disabled={busy} onClick={() => owning.onAnswer(o, "accept")} className={`${btn} bg-ink text-white`}>
                      Sell for ₥{fmt2(o.price)}
                    </button>
                    <button disabled={busy} onClick={() => owning.onCounter(o)} className={`${btn} bg-ink/5`}>
                      Ask more
                    </button>
                    <button disabled={busy} onClick={() => owning.onAnswer(o, "refuse")} className={`${btn} bg-ink/5`}>
                      No
                    </button>
                  </div>
                )}
                <p className="mt-1 text-[11px] text-muted">Ends {inTime(o.expiresAt)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(board?.made.length ?? 0) > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">Your offers</p>
          <ul className="mt-2 divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
            {board!.made.map((o) => (
              <li key={o.id} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    ₥{fmt2(o.price)} for {o.label ?? "a unit"}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {o.status === "open" ? `Waiting for ${o.who}` : o.status === "countered" ? `${o.who} asks ₥${fmt2(o.counter ?? 0)}` : STATUS[o.status]}
                  </p>
                </div>
                {o.status === "countered" && (
                  <button disabled={busy} onClick={() => owning.onReply(o, "accept")} className={`${btn} shrink-0 bg-ink text-white`}>
                    Pay ₥{fmt2(o.counter ?? 0)}
                  </button>
                )}
                {(o.status === "open" || o.status === "countered") && (
                  <button disabled={busy} onClick={() => owning.onReply(o, "withdraw")} className={`${btn} shrink-0 bg-ink/5`}>
                    Withdraw
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
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
            const isHome = home === u.unit;
            const expanded = open === u.unit;
            const level = u.rentLevel ?? "fair";
            return (
              <li key={u.unit} className="px-3 py-3">
                <button onClick={() => setOpen(expanded ? null : u.unit)} className="flex w-full items-center gap-3 text-left">
                  <Icon className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.label}</p>
                    <p className="mt-0.5 flex flex-wrap gap-1">
                      {isHome && <Chip tone="me">Home</Chip>}
                      {u.let && (tenantIn(u) ? <Chip tone="gold">Tenant in · ₥{fmt2(u.rentDay * RENT_LEVEL[level].factor)}/day</Chip> : <Chip>Finding a tenant {inTime(u.tenantFrom)}</Chip>)}
                      {u.forSale != null && <Chip tone="gold">For sale ₥{fmt2(u.forSale)}</Chip>}
                      {u.loan && <Chip>Behind your loan</Chip>}
                      {!isHome && !u.let && u.forSale == null && <span className="truncate text-xs text-muted">{what}</span>}
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
                  {expanded ? <ChevronUp className="size-4 shrink-0 text-muted" /> : <ChevronDown className="size-4 shrink-0 text-muted" />}
                </button>
                {expanded && (
                  <div className="mt-3 space-y-2.5 rounded-2xl bg-ink/[0.03] p-3">
                    {!isHome && u.use !== "land" && (
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold">Rent</p>
                          <button disabled={busy} onClick={() => owning.onLet(u, !u.let)} className={`${btn} ${u.let ? "bg-ink/5" : "bg-ink text-white"}`}>
                            {u.let ? "Stop letting" : "Let it out"}
                          </button>
                        </div>
                        <div className="mt-1.5 flex gap-1.5">
                          {LEVELS.map((l) => (
                            <button
                              key={l}
                              disabled={busy}
                              onClick={() => owning.onLevel(u, l)}
                              className={`flex-1 rounded-xl px-2 py-1.5 text-center ${level === l ? "bg-ink text-white" : "bg-panel ring-1 ring-ink/10"}`}
                            >
                              <span className="block text-xs font-semibold">{RENT_LEVEL[l].label}</span>
                              <span className="block text-[11px] tabular-nums opacity-80">₥{fmt2(u.rentDay * RENT_LEVEL[l].factor)}/day</span>
                            </button>
                          ))}
                        </div>
                        <p className="mt-1 text-[11px] text-muted">{RENT_LEVEL[level].note}. Changing it while let means finding a new tenant.</p>
                      </div>
                    )}
                    {!isHome && (
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold">{u.forSale != null ? `On sale for ₥${fmt2(u.forSale)}` : "Sell it"}</p>
                        <div className="flex gap-1.5">
                          {u.forSale != null && (
                            <button disabled={busy} onClick={() => owning.onUnsell(u)} className={`${btn} bg-ink/5`}>
                              Take off sale
                            </button>
                          )}
                          <button disabled={busy} onClick={() => owning.onSell(u, now)} className={`${btn} bg-ink text-white`}>
                            {u.forSale != null ? "New price" : "Put up for sale"}
                          </button>
                        </div>
                      </div>
                    )}
                    {isHome && <p className="text-xs text-muted">Your home can&apos;t be let or sold. Live somewhere else first.</p>}
                    <button onClick={() => onShow(u)} className="flex items-center gap-1.5 text-xs font-semibold text-gold-dark">
                      <MapPin className="size-3.5" /> Show on the map
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button onClick={owning.onFind} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-ink/5 text-sm font-semibold">
        <Search className="size-4" /> Find property to buy
      </button>
      <div className="mt-4 rounded-2xl bg-ink/[0.04] p-3.5">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Landmark className="size-4 text-muted" /> World Bank
        </p>
        {board?.loan ? (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center">
              <Stat label="You owe" value={`₥${fmt2(board.loan.balance)}`} />
              <Stat label={`Next ₥${fmt2(board.loan.instalment)}`} value={inTime(board.loan.nextDue)} />
            </div>
            {board.loan.missed > 0 && (
              <p className="mt-2 text-xs font-semibold text-hit">
                {board.loan.missed} missed payment{board.loan.missed > 1 ? "s" : ""}. Miss {board.misses} in a row and the bank takes your property.
              </p>
            )}
            <button disabled={busy} onClick={owning.onRepay} className="mt-3 h-9 w-full rounded-full bg-ink/5 text-sm font-semibold disabled:opacity-40">
              Pay some off now
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">
              {board && board.canBorrow >= 10 ? `Borrow up to ₥${fmt2(board.canBorrow)} against your property, at ${Math.round(board.rate * 100)}% a game year.` : "Buy property to borrow against it."}
            </p>
            {board && board.canBorrow >= 10 && (
              <button disabled={busy} onClick={owning.onBorrow} className="mt-3 h-9 w-full rounded-full bg-ink text-sm font-semibold text-white disabled:opacity-40">
                Borrow
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const STATUS: Record<Offer["status"], string> = {
  open: "Waiting",
  countered: "They asked more",
  accepted: "Accepted: it's yours",
  refused: "Turned down",
  withdrawn: "Withdrawn",
  lapsed: "No answer in time",
  void: "Sold to someone else",
};

function Chip({ children, tone }: { children: React.ReactNode; tone?: "me" | "gold" }) {
  const c = tone === "me" ? "bg-me/15 text-me" : tone === "gold" ? "bg-gold/20 text-gold-dark" : "bg-ink/5 text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>;
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
