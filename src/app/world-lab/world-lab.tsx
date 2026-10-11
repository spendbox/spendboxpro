"use client";

import { useState, useSyncExternalStore } from "react";
import { CityView, type CityEvent, type CityMarkers } from "@/app/play/city-view";
import { useWorldLife } from "@/app/play/life/world-life";
import { PlacePill } from "@/app/play/place-pill";
import { defaultAvatar } from "@/lib/avatar";
import { REGIONS } from "@/lib/world";
import { makeLabApi } from "./lab-api";

const MARKERS: CityMarkers = { searchedEmpty: [], searchedHit: [], caught: [], left: [], me: null, decoy: null, sweeps: [], pending: null, recent: [], locked: [] };
const EVENTS: CityEvent[] = [];
const AVATAR = defaultAvatar("world-lab");
const noop = () => {};
const noSubscribe = () => () => {};
let lab: ReturnType<typeof makeLabApi> | null = null;
const labApi = () => (lab ??= makeLabApi(BUDGET));
const noApi = () => null;
/** The lab's pretend starting budget (the real one is the database's start_grant). */
const BUDGET = 5000;

export function WorldLab({ region }: { region: string }) {
  const [area, setArea] = useState<string | null>(null);
  // A pretend wallet kept in this browser (the server never has one).
  const api = useSyncExternalStore(noSubscribe, labApi, noApi);
  const r = REGIONS[region];
  const life = useWorldLife({ api: api ?? SERVERLESS, regionId: r ? region : null, signedIn: !!api, budget: BUDGET });
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
        onProperty={life.onProperty}
        onWorkplace={life.onWorkplace}
        owned={life.owned}
        flyTo={life.flyTo}
      />
      <div className="pointer-events-none absolute left-2.5 top-2.5 sm:left-4 sm:top-4">
        <PlacePill area={area} state={r.state} />
      </div>
      {life.overlay}
      {credit && (
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="absolute bottom-1 left-1.5 text-[9px] leading-none text-black/40">
          © OpenStreetMap
        </a>
      )}
    </main>
  );
}

/** Before the browser's ready: nothing to load. */
const SERVERLESS = {
  startLife: async () => ({ ok: false as const, error: "" }),
  buyUnit: async () => ({ ok: false as const, error: "" }),
  setHome: async () => ({ ok: false as const, error: "" }),
  letUnit: async () => ({ ok: false as const, error: "" }),
  collectRent: async () => ({ ok: false as const, error: "" }),
  renameBuilding: async () => ({ ok: false as const, error: "" }),
  myAssets: async () => null,
  ownedBuildings: async () => [],
  buildingOwners: async () => [],
  workStatus: async () => null,
  takeJob: async () => ({ ok: false as const, error: "" }),
  setCommute: async () => ({ ok: false as const, error: "" }),
  collectPay: async () => ({ ok: false as const, error: "" }),
  quitJob: async () => ({ ok: false as const, error: "" }),
  neighbours: async () => [],
  lifeStatus: async () => null,
  setBudget: async () => ({ ok: false as const, error: "" }),
  movePot: async () => ({ ok: false as const, error: "" }),
  care: async () => ({ ok: false as const, error: "" }),
  procedure: async () => ({ ok: false as const, error: "" }),
  enrol: async () => ({ ok: false as const, error: "" }),
  money: async () => ({}),
};
