"use client";

import { CityView, type CityEvent, type CityMarkers } from "@/app/play/city-view";
import { defaultAvatar } from "@/lib/avatar";
import { REGIONS } from "@/lib/world";

const MARKERS: CityMarkers = { searchedEmpty: [], searchedHit: [], caught: [], left: [], me: null, decoy: null, sweeps: [], pending: null, recent: [], locked: [] };
const EVENTS: CityEvent[] = [];
const AVATAR = defaultAvatar("world-lab");
const noop = () => {};

export function WorldLab({ region }: { region: string }) {
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
      />
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs text-black/70">
        {r.name}
        {!r.water && " · map data not baked yet (all land)"}
      </div>
      {credit && (
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="absolute bottom-1 left-1.5 text-[9px] leading-none text-black/40">
          © OpenStreetMap
        </a>
      )}
    </main>
  );
}
