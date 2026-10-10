"use client";

import { Compass, Users, X } from "lucide-react";
import { HotAirBalloon, Trophy } from "@/components/icons";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { SPORT_ICON } from "@/lib/sports/icons";
import { SPORT_INFO, SPORTS } from "@/lib/sports/schedule";
import type { Sport } from "@/lib/sports/types";
import type { CityRide } from "./city-view";
import { RIDE_INFO, RideIcon, type RideKindName } from "./ride-icon";
import { rideRoom } from "./rooms";
import { Sheet } from "./sheet";

// Explore: everything to ride (balloons, trains, buses, cars, boats, the Ferris wheel, water
// slides), and sport to watch (football, basketball, boxing, wrestling), in two tabs.

const RIDE_ORDER: RideKindName[] = ["balloon", "heli", "train", "bus", "car", "boat", "ferris", "slide"];

export function ExploreSheet({
  tab,
  onTab,
  rides,
  counts,
  liveVenues,
  onRide,
  onSport,
  onClose,
}: {
  tab: "rides" | "sports";
  onTab: (t: "rides" | "sports") => void;
  rides: CityRide[];
  /** People on each ride (by room id). */
  counts: Record<string, number>;
  /** What's on at each venue right now (null: nothing live). */
  liveVenues: Record<Sport, string | null>;
  onRide: (r: CityRide) => void;
  onSport: (s: Sport) => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} wide>
      <div className="flex items-center gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-[#ffe3ec] text-[#d6336c]">
          <Compass className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-extrabold leading-tight">Explore</h2>
          <p className="text-xs text-muted">Hop on a ride, or watch a match.</p>
        </div>
        <button onClick={onClose} className="grid size-9 shrink-0 place-items-center self-start rounded-full text-muted hover:bg-panel-2" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-panel-2 p-1 text-sm font-semibold" role="tablist">
        {(["rides", "sports"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
            className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2", tab === t ? "bg-panel shadow-sm" : "text-muted")}
          >
            {t === "rides" ? <HotAirBalloon className="size-4 text-[#e64980]" /> : <Trophy className="size-4 text-[#12a37a]" />}
            {t === "rides" ? "Rides" : "Sports"}
          </button>
        ))}
      </div>

      {tab === "sports" ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted">Every match is a brand-new game, shown live from above. Tickets cost a few mint, and you can bet mint on who wins.</p>
          {SPORTS.map((sp) => {
            const Icon = SPORT_ICON[sp];
            const live = liveVenues[sp];
            return (
              <button key={sp} onClick={() => onSport(sp)} className="flex w-full items-center gap-3 rounded-2xl bg-panel-2 px-4 py-3 text-left hover:bg-[#d3f9d8]">
                <Icon className="size-6 shrink-0 text-[#12a37a]" />
                <span className="min-w-0 flex-1">
                  <b className="block">{SPORT_INFO[sp].label}</b>
                  <span className="block truncate text-xs text-muted">{live ? `Live now: ${live}` : `At the ${SPORT_INFO[sp].place.toLowerCase()}`}</span>
                </span>
                {live && <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-hit" aria-label="live" />}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted">Everyone on the same ride chats together on the way.</p>
          <div className="mt-3 max-h-[55dvh] space-y-4 overflow-y-auto overscroll-contain">
            {RIDE_ORDER.map((kind) => {
              const list = rides.filter((r) => r.kind === kind);
              if (!list.length) return null;
              const info = RIDE_INFO[kind];
              return (
                <section key={kind}>
                  <h3 className="flex items-center gap-2 text-sm font-bold">
                    <RideIcon kind={kind} className="size-4 shrink-0" style={{ color: info.colour }} />
                    {info.plural}
                  </h3>
                  <p className="text-xs text-muted">{info.blurb}</p>
                  <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {list.map((r) => (
                      <button
                        key={`${r.kind}:${r.index}`}
                        onClick={() => onRide(r)}
                        className="flex items-center gap-3 rounded-2xl bg-panel-2 px-4 py-2.5 text-left hover:bg-gold/20"
                      >
                        <RideIcon kind={r.kind} className="size-5 shrink-0" style={{ color: info.colour }} />
                        <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                          <Users className="size-3.5" />
                          {short(counts[rideRoom(r.kind, r.index)] ?? 0)}/{short(r.capacity)}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </Sheet>
  );
}
