// Asking for the trip film (./trip-layer.tsx, docs/TRIPS.md): playTrip(...) shows it and resolves
// when it's over or skipped. Straight away instead when the layer isn't there, the player turned
// it off ("Always skip"), or their phone asks for less motion. Kept tiny: the film itself loads
// only when it plays.

import type { Commute } from "@/lib/world/work";

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

export const TRIP_OFF_KEY = "nt-trip-off";
let listening = 0;
let seq = 0;

/** The layer says it's there (and when it goes). */
export function tripLayerMounted(on: boolean) {
  listening += on ? 1 : -1;
}

export function tripsOff() {
  try {
    return localStorage.getItem(TRIP_OFF_KEY) === "1";
  } catch {
    return false;
  }
}

/** Whether a trip would play now (otherwise going somewhere stays instant, as before). */
export function tripsWillPlay() {
  if (typeof window === "undefined" || !listening || tripsOff()) return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function playTrip(show: TripShow): Promise<void> {
  if (!tripsWillPlay()) return Promise.resolve();
  const id = ++seq;
  return new Promise((resolve) => {
    let over = false;
    // Never stuck: if the film doesn't start within a few seconds, on our way (and in any case
    // within a few minutes, however long a choice on the road takes).
    let started = false;
    const start = (e: Event) => {
      if ((e as CustomEvent<{ id: number }>).detail?.id === id) started = true;
    };
    const finish = () => {
      if (over) return;
      over = true;
      window.removeEventListener("nt-trip-done", done);
      window.removeEventListener("nt-trip-started", start);
      resolve();
    };
    function done(e: Event) {
      if ((e as CustomEvent<{ id: number }>).detail?.id === id) finish();
    }
    window.addEventListener("nt-trip-started", start);
    window.addEventListener("nt-trip-done", done);
    window.dispatchEvent(new CustomEvent("nt-trip-play", { detail: { id, ...show } }));
    setTimeout(() => !started && finish(), 4_000);
    setTimeout(finish, 300_000);
  });
}
