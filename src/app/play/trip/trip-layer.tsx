"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, FastForward } from "lucide-react";
import { COMMUTE_LABEL } from "@/lib/world/work";
import { cash } from "@/lib/world/value";
import { TRIP_OFF_KEY, tripLayerMounted, type TripShow } from "./play";

// The trip there, as a short film over the map (docs/TRIPS.md): the 3D scene (./trip-scene, loaded
// when a trip plays), where you're going, the fare, a line from the conductor or the driver, a
// progress bar, Skip and Always skip.

const SAY: Record<string, string[]> = {
  danfo: ["\"Obalende! CMS! Enter with your change o!\"", "\"Wole! Wole! One chance remain!\"", "\"Owa o! Driver, owa!\""],
  keke: ["\"Where you dey go? Enter, make we go!\"", "\"Shift small, e fit carry three.\""],
  okada: ["\"Hold me well o. We dey go!\"", "\"Helmet dey for back. Oya!\""],
  taxi: ["\"Air conditioner dey work, no worry.\"", "\"Na this side? I sabi the road.\""],
  car: ["Your car, your music. 🎶", "Windows down, Lagos breeze."],
  walk: ["A nice walk. 🚶🏾", "Hello, neighbours!"],
};

/** Lagos time: night from 7pm to 6am. */
const nightInLagos = () => {
  const h = (new Date().getUTCHours() + 1) % 24;
  return h >= 19 || h < 6;
};

export function TripLayer({ avatar }: { avatar: unknown }) {
  const [trip, setTrip] = useState<(TripShow & { id: number; at: number }) | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<{ finish(): void; dispose(): void } | null>(null);
  const [progress, setProgress] = useState(0);
  const avatarRef = useRef(avatar);
  useEffect(() => {
    avatarRef.current = avatar;
  });

  useEffect(() => {
    tripLayerMounted(true);
    const on = (e: Event) => {
      const d = (e as CustomEvent<TripShow & { id: number }>).detail;
      if (d) setTrip({ ...d, at: Date.now() });
    };
    window.addEventListener("nt-trip-play", on);
    return () => {
      tripLayerMounted(false);
      window.removeEventListener("nt-trip-play", on);
    };
  }, []);

  const end = (id: number) => {
    window.dispatchEvent(new CustomEvent("nt-trip-done", { detail: { id } }));
    setTrip((t) => (t?.id === id ? null : t));
  };

  // The film: loaded, played, freed.
  useEffect(() => {
    if (!trip || !host.current) return;
    let live = true;
    const el = host.current;
    void import("./trip-scene").then(({ createTripScene }) => {
      if (!live) return;
      // The bar follows the film's own clock (a few updates a second is plenty).
      let shown = 0;
      scene.current = createTripScene(el, {
        mode: trip.mode,
        avatar: avatarRef.current,
        toName: trip.to,
        night: nightInLagos(),
        onProgress: (u) => {
          if (u - shown < 0.04 && u < 1) return;
          shown = u;
          if (live) setProgress(u);
        },
        onDone: () => {
          // A breath at the end, then in.
          setTimeout(() => live && end(trip.id), 250);
        },
      });
    });
    return () => {
      live = false;
      scene.current?.dispose();
      scene.current = null;
      setProgress(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id]);

  if (!trip) return null;
  const lines = SAY[trip.mode] ?? SAY.walk;
  const line = lines[trip.id % lines.length];
  const how = trip.mode === "walk" ? "On foot" : COMMUTE_LABEL[trip.mode];
  return (
    <div className="trip-in fixed inset-0 z-[75] bg-black" role="dialog" aria-label={`On the way to ${trip.to}`}>
      <div ref={host} className="absolute inset-0" />
      {/* Where you're going. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-4 pb-10 pt-[max(0.9rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto max-w-md">
          <p className="flex items-center gap-2 text-sm font-semibold text-white/80">
            <span className="truncate">{trip.from}</span>
            <ArrowRight className="size-4 shrink-0" />
            <span className="truncate font-bold text-white">{trip.to}</span>
          </p>
          <p className="mt-0.5 text-xs text-white/70">
            {how}
            {trip.ferry ? " and ferry" : ""} · {trip.km < 1 ? `${Math.round(trip.km * 1000)} m` : `${trip.km.toFixed(1)} km`}
            {trip.fare > 0 ? ` · ${cash(trip.fare)}` : ""}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-[#ffd43b] transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </div>
      {/* What they say on the way. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center px-4">
        <p className="start-pop max-w-sm rounded-2xl bg-white/95 px-4 py-2 text-center text-sm font-semibold text-ink shadow-xl">{line}</p>
      </div>
      <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-3 px-4">
        <button onClick={() => (scene.current ? scene.current.finish() : end(trip.id))} className="flex h-11 items-center gap-1.5 rounded-full bg-white/90 px-5 text-sm font-bold text-ink shadow-lg">
          <FastForward className="size-4" /> Skip
        </button>
        <button
          onClick={() => {
            try {
              localStorage.setItem(TRIP_OFF_KEY, "1");
            } catch {}
            end(trip.id);
          }}
          className="h-11 rounded-full bg-black/40 px-4 text-xs font-semibold text-white/80"
        >
          Always skip
        </button>
      </div>
    </div>
  );
}
