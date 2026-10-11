"use client";

import { useState } from "react";
import { Building2, House, KeyRound, MapPin, Pencil, Store, Trees, X } from "@/components/icons";
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
};

/** A property on the real map, tapped: what it is, what it's worth, and every unit in it. */
export function PropertyCard({ info, market, jobs, onClose }: { info: PropertyInfo; market?: Market; jobs?: JobsContext; onClose: () => void }) {
  const owners = new Map((market?.owners ?? []).map((o) => [o.unit, o]));
  const mineAll = !!market?.owners && info.units.every((u) => owners.get(u.id)?.mine);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(info.kind ? info.title : "");
  return (
    <Sheet onClose={onClose} wide>
      <div className="sticky -top-5 z-10 -mx-5 -mt-5 flex items-start justify-between gap-3 bg-panel/95 px-5 pb-2 pt-5 backdrop-blur">
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
        <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/5 hover:bg-ink/10" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-ink/[0.04] p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-muted">Worth</span>
          <span className="font-display text-2xl font-extrabold tabular-nums">₥{fmt(info.mint)}</span>
        </div>
        <p className="text-right text-xs text-muted">about {info.local}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Pill label="Land" value={`₥${fmt(info.landMint)}`} />
          <Pill label="Building" value={`₥${fmt(info.buildingMint)}`} />
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

      <h3 className="mt-5 text-sm font-semibold">
        {info.units.length === 1 ? "One unit" : `${info.units.length} units`}
        {market ? "" : " you could own"}
      </h3>
      <ul className="mt-2 max-h-80 divide-y divide-ink/5 overflow-y-auto rounded-2xl ring-1 ring-ink/5">
        {info.units.map((u) => {
          const Icon = ICON[u.use];
          const owner = owners.get(u.id);
          return (
            <li key={u.id} className="flex items-center gap-3 px-3 py-2.5">
              <Icon className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.label}</p>
                <p className="truncate text-xs text-muted">
                  {fmt(u.area)} m² · {owner ? (owner.mine ? "Yours" : `Owned by ${owner.name}`) : u.earns}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">₥{fmt(u.mint)}</p>
                <p className="text-[11px] text-muted">{u.local}</p>
              </div>
              {market && <UnitAction u={u} owner={owner} market={market} />}
            </li>
          );
        })}
      </ul>
      {info.workplace && jobs && (
        <div className="mt-5">
          <JobsHere place={info.workplace} ctx={jobs} />
        </div>
      )}
      {!market && <p className="mt-4 text-center text-xs text-muted">Sign in to buy property.</p>}
      {(market?.owners ?? []).length === 0 && (
        <a href={`/business?building=${encodeURIComponent(info.id)}`} className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-gold/10 px-4 py-3 text-sm ring-1 ring-gold/30">
          <span>
            <b>Own a real business?</b> Lease this building for a year: your name and logo on the map, lit up for every player.
          </span>
          <span className="shrink-0 font-semibold text-gold-dark">Lease →</span>
        </a>
      )}
    </Sheet>
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
  if (owner && !owner.mine) return null;
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
      title={needHome ? "Buy a home first" : short ? `You need ₥${fmt(cost)} with tax` : `₥${fmt(cost)} with the ${Math.round(BUY_TAX * 100)}% tax`}
      className={`${btn} bg-ink text-white`}
    >
      Buy
    </button>
  );
}
