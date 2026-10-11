"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, House, MapPin, Wallet, X } from "@/components/icons";
import { makePlan, spiralIndex, type CityPlan } from "@/lib/city/layout";
import { BUILDING_LABEL } from "@/lib/world/buildings";
import type { RegionMap } from "@/lib/world/compile";
import { regionMap } from "@/lib/world";
import { ownedSpot } from "@/lib/world/owned";
import type { PropertyInfo } from "@/lib/world/property";
import type { BuildingOwner, Neighbour, PaySettled, PropertyApi, PropertyResult, WorkStatus } from "@/lib/world/property-api";
import { COMMUTE_LABEL } from "@/lib/world/work";
import type { Workplace } from "@/lib/world/workplace";
import { PropertyCard } from "../property-card";
import { Sheet } from "../sheet";
import { AssetsSheet } from "./assets-sheet";
import { HomeCard } from "./home-card";
import { JobsHere, type JobsContext } from "./jobs-here";
import { MapSearch, type SearchHit } from "./map-search";
import { StartLife } from "./start-life";
import { useLife } from "./use-life";
import { WorkSheet } from "./work-sheet";

/** Each region's plan for finding jobs near home, worked out once (only when Work is opened). */
const plans = new Map<string, CityPlan>();
function planOf(region: RegionMap) {
  let p = plans.get(region.region.id);
  if (!p) {
    p = makePlan(region.region.seed, region);
    plans.set(region.region.id, p);
  }
  return p;
}

const money = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
const paid = (p: PaySettled | undefined) =>
  p && p.gross > 0 ? ` Collected ₥${money(p.net)} pay (after ₥${money(p.tax)} tax and ₥${money(p.fares)} fares).` : "";

/**
 * A life on a real map (docs/PROPERTY.md): the search box, your assets, the welcome (start with a
 * budget, buy a home first), and buying from a property's card. Gives the city view what it needs
 * (owned buildings, where to fly, what to do when a property is tapped) and the screens to show.
 */
export function useWorldLife({ api, regionId, signedIn, budget, onChanged }: { api: PropertyApi; regionId: string | null; signedIn: boolean; budget: number; onChanged?: () => void }) {
  const region = useMemo(() => regionMap(regionId), [regionId]);
  const { assets, owned, loaded, refresh } = useLife(api, signedIn ? regionId : null);
  const [property, setProperty] = useState<PropertyInfo | null>(null);
  const [owners, setOwners] = useState<BuildingOwner[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [flyTo, setFlyTo] = useState<{ tile: number; at: number } | null>(null);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [welcomeShut, setWelcomeShut] = useState(false);
  const [work, setWork] = useState<WorkStatus | null>(null);
  const [workOpen, setWorkOpen] = useState(false);
  const [place, setPlace] = useState<Workplace | null>(null);
  const [homeOpen, setHomeOpen] = useState(false);
  const [neighbours, setNeighbours] = useState<Neighbour[] | null>(null);

  useEffect(() => {
    if (!signedIn || !regionId) return;
    const t = setTimeout(() => void api.workStatus().then(setWork), 0);
    return () => clearTimeout(t);
  }, [api, signedIn, regionId]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4500);
    return () => clearTimeout(t);
  }, [message]);

  const onProperty = useCallback(
    (info: PropertyInfo) => {
      setProperty(info);
      setOwners(null);
      if (signedIn) void api.buildingOwners(info.id).then(setOwners);
    },
    [api, signedIn],
  );

  const fly = (x: number, z: number) => setFlyTo({ tile: spiralIndex(Math.round(x), Math.round(z)), at: Date.now() });

  async function act(run: () => Promise<PropertyResult>, done: (r: PropertyResult & { ok: true }) => string | null) {
    setBusy(true);
    const r = await run();
    setBusy(false);
    if (!r.ok) setMessage({ text: r.error, good: false });
    else {
      const text = done(r);
      if (text) setMessage({ text, good: true });
    }
    await refresh();
    setWork(await api.workStatus());
    if (property) void api.buildingOwners(property.id).then(setOwners);
    onChanged?.();
  }

  const life = assets?.life ?? null;
  const homeUnit = life?.home_unit ?? null;
  const letting = useMemo(() => new Set((assets?.units ?? []).filter((u) => u.let).map((u) => u.unit)), [assets]);
  const coins = assets?.coins ?? 0;
  const showWelcome = signedIn && loaded && !homeUnit && !welcomeShut && !property && !place;
  const plan = useMemo(() => (workOpen && region ? planOf(region) : null), [workOpen, region]);

  const jobs: JobsContext | undefined =
    signedIn && region
      ? {
          prices: region.region.prices,
          homeUnit,
          skills: work?.skills ?? {},
          current: work?.job ? { place: work.job.place, job: work.job.job } : null,
          busy,
          onTake: (wp, job, mode) =>
            act(
              () => api.takeJob(wp.id, job.job, mode),
              (r) => `You're a ${job.title} now. Pay builds up every game day (2 hours).${paid(r.pay)}`,
            ),
        }
      : undefined;

  const home = homeUnit ? (assets?.units ?? []).find((u) => u.unit === homeUnit) : undefined;
  const homeSpot = homeUnit ? ownedSpot(homeUnit.split("/")[0]) : null;
  const homeBuilding = home ? owned.find((o) => o.id === home.building) : undefined;
  const homeLabel = home ? [home.label, home.name ?? (homeBuilding ? BUILDING_LABEL[homeBuilding.building.kind] : null)].filter(Boolean).join(", ") : "";

  const goHome = () => {
    if (!homeSpot) return;
    fly(homeSpot.x, homeSpot.z);
    setHomeOpen(true);
    setNeighbours(null);
    void api.neighbours().then(setNeighbours);
  };

  const overlay = region ? (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center gap-2 px-3 sm:top-16">
        <MapSearch region={region} mine={assets?.units ?? []} onPick={(h: SearchHit) => fly(h.x, h.z)} />
        {signedIn && homeUnit && (
          <button onClick={goHome} className="glass pointer-events-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold" aria-label="Go home">
            <House className="size-4" />
            <span className="max-sm:hidden">Home</span>
          </button>
        )}
        {signedIn && life && (
          <button onClick={() => setWorkOpen(true)} className="glass pointer-events-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold" aria-label="Work">
            <Briefcase className="size-4" />
            <span className="max-sm:hidden">Work</span>
          </button>
        )}
        {signedIn && (
          <button
            onClick={() => setAssetsOpen(true)}
            className="glass pointer-events-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold"
            aria-label="Your assets"
          >
            <Wallet className="size-4" />
            <span className="max-sm:hidden">Assets</span>
          </button>
        )}
      </div>
      {message && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-24 z-50 flex justify-center px-3">
          <p className={`flex max-w-sm items-center gap-2 rounded-2xl px-4 py-2.5 text-sm shadow-lg ${message.good ? "bg-ink text-white" : "bg-hit text-white"}`}>
            {message.text}
            <button onClick={() => setMessage(null)} aria-label="Close">
              <X className="size-4" />
            </button>
          </p>
        </div>
      )}
      {showWelcome && (
        <StartLife
          place={region.region.name}
          budget={life ? coins : budget}
          prices={region.region.prices}
          started={!!life}
          busy={busy}
          onStart={() => act(() => api.startLife(region.region.id), () => null)}
          onClose={() => setWelcomeShut(true)}
        />
      )}
      {homeOpen && homeSpot && <HomeCard label={homeLabel} area={region.areaAt(homeSpot.x, homeSpot.z)} neighbours={neighbours} onClose={() => setHomeOpen(false)} />}
      {place && (
        <Sheet onClose={() => setPlace(null)} wide>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-extrabold leading-tight">{place.name}</h2>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{region.areaAt(place.x, place.z)}</span>
              </p>
            </div>
            <button onClick={() => setPlace(null)} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-ink/5" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-4">
            {jobs ? <JobsHere place={place} ctx={jobs} /> : <p className="text-sm text-muted">Sign in to work here.</p>}
          </div>
        </Sheet>
      )}
      {workOpen && jobs && (
        <WorkSheet
          status={work}
          region={region}
          plan={plan}
          ctx={jobs}
          onCollect={() => act(() => api.collectPay(), (r) => `+₥${money(r.pay?.net ?? 0)} pay, after ₥${money(r.pay?.tax ?? 0)} income tax and ₥${money(r.pay?.fares ?? 0)} fares.`)}
          onMode={(mode) => act(() => api.setCommute(mode), (r) => `${mode === "walk" ? "You'll walk to work" : `You'll go by ${COMMUTE_LABEL[mode].toLowerCase()}`} from now on.${paid(r.pay)}`)}
          onQuit={() => act(() => api.quitJob(), (r) => `You've left your job.${paid(r.pay)}`)}
          onShow={(id) => {
            const s = ownedSpot(id);
            if (s) fly(s.x, s.z);
            setWorkOpen(false);
          }}
          onClose={() => setWorkOpen(false)}
        />
      )}
      {property && (
        <PropertyCard
          key={property.id}
          jobs={jobs}
          info={property}
          onClose={() => setProperty(null)}
          market={
            signedIn
              ? {
                  owners,
                  coins,
                  started: !!life,
                  homeUnit,
                  letting,
                  busy,
                  onBuy: (u) =>
                    act(
                      () => api.buyUnit(u.id),
                      (r) => (r.home ? `${u.label} is yours, and your home. Welcome!` : `${u.label} is yours.`),
                    ),
                  onHome: (u) => act(() => api.setHome(u.id), () => `You live at ${u.label} now.`),
                  onLet: (u, on) => act(() => api.letUnit(u.id, on), () => (on ? `${u.label} is up for rent.` : `${u.label} isn't let any more.`)),
                  onRename: (name) => act(() => api.renameBuilding(property.id, name), () => (name.trim() ? `Renamed ${name.trim()}.` : "Name cleared.")),
                }
              : undefined
          }
        />
      )}
      {assetsOpen && assets && (
        <AssetsSheet
          assets={assets}
          owned={owned}
          region={region}
          busy={busy}
          onClose={() => setAssetsOpen(false)}
          onCollect={() => act(() => api.collectRent(), (r) => `+₥${(r.rent ?? 0).toFixed(2)} rent (after tax).`)}
          onShow={(u) => {
            const s = ownedSpot(u.building);
            if (s) fly(s.x, s.z);
            setAssetsOpen(false);
          }}
        />
      )}
    </>
  ) : null;

  return { owned, flyTo, onProperty, onWorkplace: setPlace, overlay };
}
