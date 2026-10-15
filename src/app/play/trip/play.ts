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
    const done = (e: Event) => {
      if ((e as CustomEvent<{ id: number }>).detail?.id !== id) return;
      finish();
    };
    const finish = () => {
      if (over) return;
      over = true;
      window.removeEventListener("nt-trip-done", done);
      resolve();
    };
    window.addEventListener("nt-trip-done", done);
    window.dispatchEvent(new CustomEvent("nt-trip-play", { detail: { id, ...show } }));
    // Never stuck: whatever happens, on our way within 12 seconds.
    setTimeout(finish, 12_000);
  });
}
