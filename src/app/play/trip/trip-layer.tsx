"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, FastForward } from "lucide-react";
import { MOMENT_BY_ID } from "@/lib/world/moments";
import { COMMUTE_LABEL } from "@/lib/world/work";
import { cash } from "@/lib/world/value";
import { momentNext, type MomentShown } from "../moment-actions";
import { MomentCard, type MomentMood } from "../moments/moment-card";
import { tripLayerMounted, type TripShow } from "./play";
import { lagosHour } from "./sky";
import type { TripScene } from "./trip-scene";
import { useTopLayer } from "../layers";

// The trip there, as a short film over the map (docs/TRIPS.md), only when something happens on the
// way (a road moment): the moment is asked for first, and with none there's no film. Then the 3D
// scene (./trip-scene) rides up to it, it's acted out, its card asks what you do, and the film ends
// soon after. On top: where you're going, the fare, a line from the conductor or the driver, a
// progress bar and Skip.

const SAY: Record<string, string[]> = {
  danfo: ["\"Obalende! CMS! Enter with your change o!\"", "\"Wole! Wole! One chance remain!\"", "\"Owa o! Driver, owa!\""],
  keke: ["\"Where you dey go? Enter, make we go!\"", "\"Shift small, e fit carry three.\""],
  okada: ["\"Hold me well o. We dey go!\"", "\"Helmet dey for back. Oya!\""],
  taxi: ["\"Air conditioner dey work, no worry.\"", "\"Na this side? I sabi the road.\""],
  car: ["Your car, your music. 🎶", "Windows down, Lagos breeze."],
  walk: ["A nice walk. 🚶🏾", "Hello, neighbours!"],
};

export function TripLayer({ avatar }: { avatar: unknown }) {
  const [trip, setTrip] = useState<(TripShow & { id: number; at: number }) | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<TripScene | null>(null);
  const [progress, setProgress] = useState(0);
  // The road moment: what it is, whether its card is up, and how the choice went.
  const [event, setEvent] = useState<MomentShown | null>(null);
  const [cardUp, setCardUp] = useState(false);
  const mood = useRef<MomentMood>("calm");
  const avatarRef = useRef(avatar);
  useEffect(() => {
    avatarRef.current = avatar;
  });

  useEffect(() => {
    tripLayerMounted(true);
    // "Always skip" is gone (the film only plays when something happens): forget it.
    try {
      localStorage.removeItem("nt-trip-off");
    } catch {}
    const on = (e: Event) => {
      const d = (e as CustomEvent<TripShow & { id: number }>).detail;
      if (!d) return;
      setTrip({ ...d, at: Date.now() });
      setEvent(null);
      setCardUp(false);
      window.dispatchEvent(new CustomEvent("nt-trip-started", { detail: { id: d.id } }));
    };
    window.addEventListener("nt-trip-play", on);
    return () => {
      tripLayerMounted(false);
      window.removeEventListener("nt-trip-play", on);
    };
  }, []);

  /** shown: a film played (the caller then goes in after it; with none, it goes in at once). */
  const end = (id: number, shown = false) => {
    window.dispatchEvent(new CustomEvent("nt-trip-done", { detail: { id, shown } }));
    setTrip((t) => (t?.id === id ? null : t));
    setCardUp(false);
  };

  // First the moment on the way (the film plays only for one), then the film, staged with it.
  const [ready, setReady] = useState<number | null>(null);
  useEffect(() => {
    if (!trip || !host.current) return;
    let live = true;
    const el = host.current;
    // Asked quickly: no answer within a second and a half, no film (going in isn't held up).
    const quick = Promise.race([momentNext({ spot: "road", ride: trip.mode, place: trip.to }).catch(() => null), new Promise<null>((ok) => setTimeout(() => ok(null), 1500))]);
    void quick
      .then(async (m) => {
        const def = m && MOMENT_BY_ID.get(m.moment);
        if (!live) return;
        // Nothing on the way this time: no film, straight there.
        if (!m || !def?.stage) return end(trip.id);
        const { createTripScene } = await import("./trip-scene");
        if (!live) return;
        setEvent(m);
        setReady(trip.id);
        scene.current = createTripScene(el, {
          mode: trip.mode,
          avatar: avatarRef.current,
          toName: trip.to,
          area: trip.area ?? trip.to,
          hour: lagosHour(),
          onProgress: (u) => live && setProgress(u),
          onEvent: () => live && setCardUp(true),
          onDone: () => {
            // A breath at the end, then on.
            setTimeout(() => live && end(trip.id, true), 250);
          },
        });
        if (!scene.current.stage(def.stage, m.moment)) end(trip.id);
      })
      .catch(() => live && end(trip.id));
    return () => {
      live = false;
      scene.current?.dispose();
      scene.current = null;
      setProgress(0);
      setReady(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id]);
  // The film goes over anything open when it starts.
  const layer = useTopLayer(!!trip && ready === trip.id);

  if (!trip) return null;
  const showing = ready === trip.id;
  const lines = SAY[trip.mode] ?? SAY.walk;
  const line = lines[trip.id % lines.length];
  const how = trip.mode === "walk" ? "On foot" : COMMUTE_LABEL[trip.mode];
  const carryOn = () => {
    setCardUp(false);
    setEvent(null);
    scene.current?.resolve(mood.current);
  };
  return (
    // Until the moment's in, nothing shows (no film without one).
    <div className={showing ? "trip-in fixed inset-0 bg-black" : "pointer-events-none fixed inset-0 -z-10 opacity-0"} style={showing ? { zIndex: layer } : undefined} role={showing ? "dialog" : undefined} aria-label={`On the way to ${trip.to}`}>
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
            <div className="h-full rounded-full bg-[#ffd43b] transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </div>
      {cardUp && event ? (
        // What happened on the way: choose.
        <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex justify-center px-3">
          <MomentCard
            key={event.id}
            shown={event}
            closeLabel="Ignore it"
            onAnswered={(m) => (mood.current = m)}
            onClose={carryOn}
            className="max-h-[70dvh] overflow-y-auto"
          />
        </div>
      ) : (
        <>
          {/* What they say on the way. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center px-4">
            <p className="start-pop max-w-sm rounded-2xl bg-white/95 px-4 py-2 text-center text-sm font-semibold text-ink shadow-xl">{line}</p>
          </div>
          <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-3 px-4">
            <button onClick={() => (scene.current ? scene.current.finish() : end(trip.id, true))} className="flex h-11 items-center gap-1.5 rounded-full bg-white/90 px-5 text-sm font-bold text-ink shadow-lg">
              <FastForward className="size-4" /> Skip
            </button>
          </div>
        </>
      )}
    </div>
  );
}
