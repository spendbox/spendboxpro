"use client";

import { useState } from "react";
import { CityView, type CityEvent, type CityMarkers } from "@/app/play/city-view";
import { PlacePill } from "@/app/play/place-pill";
import { PropertyCard } from "@/app/play/property-card";
import type { PropertyInfo } from "@/lib/world/property";
import { defaultAvatar } from "@/lib/avatar";
import { REGIONS } from "@/lib/world";

const MARKERS: CityMarkers = { searchedEmpty: [], searchedHit: [], caught: [], left: [], me: null, decoy: null, sweeps: [], pending: null, recent: [], locked: [] };
const EVENTS: CityEvent[] = [];
const AVATAR = defaultAvatar("world-lab");
const noop = () => {};

export function WorldLab({ region }: { region: string }) {
  const [area, setArea] = useState<string | null>(null);
  const [property, setProperty] = useState<PropertyInfo | null>(null);
  const r = REGIONS[region];
  if (!r) return <main className="grid min-h-dvh place-items-center text-muted">No region called “{region}”.</main>;
  const credit = r.water || r.roads.length > 0;
  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      <CityView
        seed={0}
        tileCount={0}
        region={region}
        markers={MARKERS}
        events={EVENTS}
        onBillboard={noop}
        ads={[]}
        onAdViews={noop}
        meAvatar={AVATAR}
        coinBalloon={null}
        onBalloon={noop}
        progress={0.25}
        nightFirst={false}
        onArea={setArea}
        onProperty={setProperty}
      />
      {property && <PropertyCard info={property} onClose={() => setProperty(null)} />}
      <div className="pointer-events-none absolute left-2.5 top-2.5 sm:left-4 sm:top-4">
        <PlacePill area={area} state={r.state} />
      </div>
      {credit && (
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="absolute bottom-1 left-1.5 text-[9px] leading-none text-black/40">
          © OpenStreetMap
        </a>
      )}
    </main>
  );
}
