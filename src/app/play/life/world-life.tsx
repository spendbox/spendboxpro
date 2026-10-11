"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet, X } from "@/components/icons";
import { spiralIndex } from "@/lib/city/layout";
import { regionMap } from "@/lib/world";
import { ownedSpot } from "@/lib/world/owned";
import type { PropertyInfo } from "@/lib/world/property";
import type { BuildingOwner, PropertyApi, PropertyResult } from "@/lib/world/property-api";
import { PropertyCard } from "../property-card";
import { AssetsSheet } from "./assets-sheet";
import { MapSearch, type SearchHit } from "./map-search";
import { StartLife } from "./start-life";
import { useLife } from "./use-life";

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
    if (property) void api.buildingOwners(property.id).then(setOwners);
    onChanged?.();
  }

  const life = assets?.life ?? null;
  const homeUnit = life?.home_unit ?? null;
  const letting = useMemo(() => new Set((assets?.units ?? []).filter((u) => u.let).map((u) => u.unit)), [assets]);
  const coins = assets?.coins ?? 0;
  const showWelcome = signedIn && loaded && !homeUnit && !welcomeShut && !property;

  const overlay = region ? (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center gap-2 px-3 sm:top-16">
        <MapSearch region={region} mine={assets?.units ?? []} onPick={(h: SearchHit) => fly(h.x, h.z)} />
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
      {property && (
        <PropertyCard
          key={property.id}
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

  return { owned, flyTo, onProperty, overlay };
}
