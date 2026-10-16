// Asking for the trip film (./trip-layer.tsx, docs/TRIPS.md): it plays only when something will
// happen on the way (a road moment). tripWanted(km) rolls whether to try for one; playTrip(...)
// asks the server for the moment and, if there is one, shows the ride up to it, and resolves when
// it's over or skipped. Straight away instead when the layer isn't there, no moment comes, or the
// phone asks for less motion. Kept tiny: the film itself loads only when it plays.

import type { Commute } from "@/lib/world/work";

/** How likely a trip of at least minKm tries for a road moment (src/lib/world/moments.ts ROAD_RULES). */
const ROAD = { chance: 0.33, minKm: 0.3 };

export type TripShow = {
  mode: Commute;
  /** Where from and to (area or place names), how far and the fare (mint; 0: free). */
  from: string;
  to: string;
  km: number;
  fare: number;
  /** Part of it by ferry (km). */
  ferry?: number;
  /** The area you're going to (on the welcome arch). */
  area?: string;
};

let listening = 0;
let seq = 0;

/** The layer says it's there (and when it goes). */
export function tripLayerMounted(on: boolean) {
  listening += on ? 1 : -1;
}

/** Whether a trip could play now. */
export function tripsWillPlay() {
  if (typeof window === "undefined" || !listening) return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Try for a film on this trip? Long enough, and the dice say so (it plays only if a moment comes). */
export function tripWanted(km: number) {
  return km >= ROAD.minKm && tripsWillPlay() && Math.random() < ROAD.chance;
}

/** Resolves true once a film has played (or was skipped), false at once when there's none. */
export function playTrip(show: TripShow): Promise<boolean> {
  if (!tripsWillPlay()) return Promise.resolve(false);
  const id = ++seq;
  return new Promise((resolve) => {
    let over = false;
    // Never stuck: if the film doesn't start within a few seconds, on our way (and in any case
    // within a few minutes, however long a choice on the road takes).
    let started = false;
    const start = (e: Event) => {
      if ((e as CustomEvent<{ id: number }>).detail?.id === id) started = true;
    };
    const finish = (shown = false) => {
      if (over) return;
      over = true;
      window.removeEventListener("nt-trip-done", done);
      window.removeEventListener("nt-trip-started", start);
      resolve(shown);
    };
    function done(e: Event) {
      const d = (e as CustomEvent<{ id: number; shown?: boolean }>).detail;
      if (d?.id === id) finish(!!d.shown);
    }
    window.addEventListener("nt-trip-started", start);
    window.addEventListener("nt-trip-done", done);
    window.dispatchEvent(new CustomEvent("nt-trip-play", { detail: { id, ...show } }));
    setTimeout(() => !started && finish(), 4_000);
    setTimeout(() => finish(true), 300_000);
  });
}
