"use client";

import { cash } from "@/lib/world/value";
import { useState } from "react";
import { DoorOpen } from "lucide-react";
import { Building2, Flag, House, KeyRound, MapPin, Megaphone, Pencil, Store, Trees, TrendingDown, TrendingUp, X } from "@/components/icons";
import type { PropertyInfo, PropertyUnit } from "@/lib/world/property";
import { BUY_TAX, type BuildingOwner } from "@/lib/world/property-api";
import { JobsHere, type JobsContext } from "./life/jobs-here";
import { Sheet } from "./sheet";

const fmt = (n: number) => n.toLocaleString("en-GB");

const ICON: Record<PropertyUnit["use"], typeof House> = { home: House, shop: Store, office: Building2, industry: Building2, land: Trees };

/** What you can do with the units of a property: who owns what, what you can afford, your own units. */
export type Market = {
  /** Who owns which units (null while loading). */
  owners: BuildingOwner[] | null;
  coins: number;
  /** You've started your life here (the starting budget's arrived). */
  started: boolean;
  homeUnit: string | null;
  /** Your units that are let out. */
  letting: Set<string>;
  busy: boolean;
  onBuy: (unit: PropertyUnit) => void;
  onHome: (unit: PropertyUnit) => void;
  onLet: (unit: PropertyUnit, on: boolean) => void;
  onRename: (name: string) => void;
  /** Buy a unit another player has up for sale, at their price. */
  onBuyListed: (unit: PropertyUnit, price: number) => void;
  /** Make an offer on a unit another player owns. */
  onOffer: (unit: PropertyUnit) => void;
  /** Put one of yours up for sale (or change its price), or take it off. */
  onSell: (unit: PropertyUnit) => void;
  onUnsell: (unit: PropertyUnit) => void;
};

/** A property on the real map, tapped: Go there, Rent / Buy (its worth and every unit in it), Advertise. */
export function PropertyCard({
  info,
  market,
  jobs,
  onReport,
  onEnter,
  enterLabel,
  onClose,
}: {
  info: PropertyInfo;
  market?: Market;
  jobs?: JobsContext;
  onReport?: () => void;
  /** Go inside, and what the button says (with the fare there). */
  onEnter?: () => void;
  enterLabel?: string;
  onClose: () => void;
}) {
  const owners = new Map((market?.owners ?? []).map((o) => [o.unit, o]));
  const mineAny = !!market?.owners && info.units.some((u) => owners.get(u.id)?.mine);
  const mineAll = !!market?.owners && info.units.every((u) => owners.get(u.id)?.mine);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(info.kind ? info.title : "");
  // The worth and the units open from Rent / Buy (already open when some of it is yours).
  const [details, setDetails] = useState(false);
  const open = details || mineAny;
  const [jobsOpen, setJobsOpen] = useState(false);
  // Nobody owns any of it: a business can lease it.
  const leasable = market ? (market.owners ?? []).length === 0 : true;
  return (
    <Sheet onClose={onClose} wide clear>
      <div className="sticky -top-5 z-10 -mx-5 -mt-5 flex items-start justify-between gap-3 bg-panel/95 px-5 pb-2 pt-5">
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
        </div>
        <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/5 hover:bg-ink/10" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>

      {/* What it's worth and which way that's going. */}
      <div className="mt-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Worth</p>
          <p className="font-display text-2xl font-extrabold tabular-nums leading-tight">{cash(info.mint)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Trend change={info.trend.month} />
          <Spark values={info.trend.history} up={info.trend.month >= 0} />
        </div>
      </div>

      {/* The three things to do. */}
      <div className="mt-3 space-y-2">
        {onEnter && !info.state && (
          <button onClick={onEnter} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#f08c00] px-4 py-2 text-center text-sm font-semibold leading-tight text-white">
            <DoorOpen className="size-4 shrink-0" /> {(enterLabel ?? "Go there").replace(/^Go inside/, "Go there")}
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setDetails((d) => !d)}
            aria-expanded={open}
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold ${open ? "bg-ink text-white" : "bg-ink/5"}`}
          >
            <KeyRound className="size-4 shrink-0" /> {mineAll ? "Yours" : "Rent / Buy"}
          </button>
          {leasable ? (
            <a href={`/business?building=${encodeURIComponent(info.id)}`} className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-gold/15 px-3 text-sm font-semibold text-gold-dark">
              <Megaphone className="size-4 shrink-0" /> Advertise
            </a>
          ) : (
            <span className="flex min-h-11 items-center justify-center rounded-full bg-ink/[0.03] px-3 text-center text-xs text-muted">Owned, so not for adverts</span>
          )}
        </div>
      </div>

      {open && (
        <>
          <div className="mt-4 rounded-2xl bg-ink/[0.04] p-3.5">
            <p className="text-xs text-muted">
              {info.kind ?? info.title}
              {info.estate ? ` in ${info.estate} (a gated estate)` : ""}. Land moves with the area&apos;s market; the building is what it cost to build.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Pill label="Land" value={`${cash(info.landMint)}`} />
              <Pill label="Building" value={`${cash(info.buildingMint)}`} />
              <Pill label="Plot" value={`${fmt(info.plot)} m²`} />
              {info.storeys > 0 && <Pill label={info.storeys === 1 ? "Storey" : "Storeys"} value={String(info.storeys)} />}
            </div>
          </div>

          {mineAll && market && (
            <div className="mt-3">
              {renaming ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    market.onRename(name);
                    setRenaming(false);
                  }}
                >
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={40}
                    placeholder="Its name (2 to 40 letters)"
                    className="h-10 min-w-0 flex-1 rounded-full bg-ink/5 px-4 text-sm outline-none ring-ink/20 focus:ring-2"
                    autoFocus
                  />
                  <button disabled={market.busy} className="h-10 rounded-full bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50">
                    Save
                  </button>
                </form>
              ) : (
                <button onClick={() => setRenaming(true)} className="flex items-center gap-1.5 text-sm font-medium text-gold-dark">
                  <Pencil className="size-3.5" /> {info.kind ? "Rename it" : "Give it a name"}
                </button>
              )}
            </div>
          )}

          <h3 className="mt-4 text-sm font-semibold">
            {info.units.length === 1 ? "One unit" : `${info.units.length} units`}
            {market ? "" : " you could own"}
          </h3>
          <p className="text-xs text-muted">Buy one to live in or to let out: tenants pay you rent.</p>
          <ul className="mt-2 max-h-72 divide-y divide-ink/5 overflow-y-auto rounded-2xl ring-1 ring-ink/5">
            {info.units.map((u) => {
              const Icon = ICON[u.use];
              const owner = owners.get(u.id);
              return (
                <li key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Icon className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.label}</p>
                    <p className="text-xs text-muted">
                      {fmt(u.area)} m² · {owner ? (owner.mine ? "Yours" : `Owned by ${owner.name}`) : u.earns}
                      {owner?.forSale != null ? ` · for sale ${cash(owner.forSale)}` : owner?.home && !owner.mine ? " · their home" : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">{cash(u.mint)}</p>
                  </div>
                  {market && <UnitAction u={u} owner={owner} market={market} />}
                </li>
              );
            })}
          </ul>
          {!market && <p className="mt-3 text-center text-xs text-muted">Sign in to buy property.</p>}
        </>
      )}

      {info.workplace && jobs && (
        <div className="mt-4">
          {jobsOpen ? (
            <JobsHere place={info.workplace} ctx={jobs} />
          ) : (
            <button onClick={() => setJobsOpen(true)} className="flex w-full items-center justify-between rounded-2xl bg-ink/[0.04] px-4 py-2.5 text-sm">
              <span className="font-medium">Jobs here</span>
              <span className="text-muted">{info.workplace.jobs.length} →</span>
            </button>
          )}
        </div>
      )}
      {onReport && (
        <button onClick={onReport} className="mt-4 flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
          <Flag className="size-3.5" /> Report a problem with this building
        </button>
      )}
    </Sheet>
  );
}

/** Which way a worth is going: "▲ 2.4% this month" (green), down in red, or steady. */
export function Trend({ change }: { change: number }) {
  const pct = Math.abs(change * 100);
  if (pct < 0.05) return <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-muted">Steady this month</span>;
  const up = change > 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${up ? "bg-[#2f9e44]/12 text-[#2b8a3e]" : "bg-[#e03131]/10 text-[#c92a2a]"}`}>
      {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
      {up ? "+" : "−"}
      {pct.toFixed(pct >= 10 ? 0 : 1)}% this month
    </span>
  );
}

/** A tiny line of a worth over the last few game months. */
export function Spark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const W = 72;
  const H = 20;
  const pts = values.map((v, k) => `${((k / (values.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - lo) / span) * (H - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-label="Worth over the last few game months" role="img">
      <polyline points={pts} fill="none" stroke={up ? "#2b8a3e" : "#c92a2a"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A small labelled chip: "Land ₥24,058". */
function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full bg-panel px-3 py-1 text-xs shadow-sm ring-1 ring-ink/5">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function UnitAction({ u, owner, market }: { u: PropertyUnit; owner: BuildingOwner | undefined; market: Market }) {
  const btn = "h-8 shrink-0 rounded-full px-3 text-xs font-semibold disabled:opacity-40";
  if (market.owners === null) return <span className="w-14" />;
  if (owner && !owner.mine) {
    if (owner.forSale != null) {
      const cost = Math.round(owner.forSale * (1 + BUY_TAX));
      const needHome = !market.homeUnit && u.use !== "home";
      return (
        <button
          disabled={market.busy || !market.started || needHome || market.coins < cost}
          onClick={() => market.onBuyListed(u, owner.forSale!)}
          title={needHome ? "Buy a home first" : `${cash(cost)} with the ${Math.round(BUY_TAX * 100)}% tax`}
          className={`${btn} bg-ink text-white`}
        >
          Buy
        </button>
      );
    }
    if (owner.home) return null;
    return (
      <button disabled={market.busy || !market.started} onClick={() => market.onOffer(u)} className={`${btn} bg-ink/5`}>
        Offer
      </button>
    );
  }
  if (owner?.mine) {
    if (market.homeUnit === u.id) return <span className="shrink-0 rounded-full bg-me/15 px-2.5 py-1 text-xs font-semibold text-me">Home</span>;
    const letting = market.letting.has(u.id);
    return (
      <div className="flex shrink-0 flex-col gap-1">
        {u.use === "home" && (
          <button disabled={market.busy} onClick={() => market.onHome(u)} className={`${btn} bg-ink/5`}>
            Live here
          </button>
        )}
        {u.use !== "land" && (
          <button disabled={market.busy} onClick={() => market.onLet(u, !letting)} className={`${btn} ${letting ? "bg-gold/20 text-gold-dark" : "bg-ink/5"}`}>
            <KeyRound className="mr-1 inline size-3" />
            {letting ? "Let · stop" : "Let out"}
          </button>
        )}
        {owner.forSale != null ? (
          <button disabled={market.busy} onClick={() => market.onUnsell(u)} className={`${btn} bg-gold/20 text-gold-dark`}>
            On sale · stop
          </button>
        ) : (
          <button disabled={market.busy} onClick={() => market.onSell(u)} className={`${btn} bg-ink/5`}>
            Sell
          </button>
        )}
      </div>
    );
  }
  const cost = Math.round(u.mint * (1 + BUY_TAX));
  const needHome = !market.homeUnit && u.use !== "home";
  const short = market.coins < cost;
  return (
    <button
      disabled={market.busy || !market.started || needHome || short}
      onClick={() => market.onBuy(u)}
      title={needHome ? "Buy a home first" : short ? `You need ${cash(cost)} with tax` : `${cash(cost)} with the ${Math.round(BUY_TAX * 100)}% tax`}
      className={`${btn} bg-ink text-white`}
    >
      Buy
    </button>
  );
}
