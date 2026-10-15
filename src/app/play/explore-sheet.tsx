"use client";

import { Building2, ChevronRight, Compass, Landmark, Music, Plane, ShoppingBag, Trees, Users, UtensilsCrossed, X } from "lucide-react";
import { GROUPS, type ExploreGroup, type ExplorePlace } from "@/lib/world/explore";
import { HotAirBalloon, Trophy } from "@/components/icons";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { cash } from "@/lib/world/value";
import { SPORT_ICON } from "@/lib/sports/icons";
import { SPORT_INFO, SPORTS } from "@/lib/sports/schedule";
import type { Sport } from "@/lib/sports/types";
import type { CityRide } from "./city-view";
import { RIDE_INFO, RideIcon, type RideKindName } from "./ride-icon";
import { rideRoom } from "./rooms";
import { Sheet } from "./sheet";

// Explore: everything to ride (balloons, trains, buses, cars, boats, the Ferris wheel, water
// slides), and sport to watch (football, basketball, boxing, wrestling), in two tabs.

const RIDE_ORDER: RideKindName[] = ["train", "balloon", "boat", "heli", "bus", "car", "ferris", "slide"];

const GROUP_ICON: Record<ExploreGroup, typeof Trees> = { nightlife: Music, parks: Trees, shopping: ShoppingBag, food: UtensilsCrossed, culture: Landmark, sport: Trophy, travel: Plane };
const GROUP_COLOUR: Record<ExploreGroup, string> = { nightlife: "#ae3ec9", parks: "#2f9e44", shopping: "#e8590c", food: "#f08c00", culture: "#5f3dc4", sport: "#12a37a", travel: "#1c7ed6" };
/** "300 m", "4.5 km" (a tile is 100 m). */
const far = (tiles: number) => (tiles < 10 ? `${Math.max(1, Math.round(tiles)) * 100} m` : `${(tiles / 10).toFixed(tiles < 100 ? 1 : 0)} km`);

export function ExploreSheet({
  tab,
  onTab,
  places,
  onPlace,
  rides,
  counts,
  liveVenues,
  onRide,
  onSport,
  onClose,
}: {
  tab: "places" | "rides" | "sports";
  onTab: (t: "places" | "rides" | "sports") => void;
  /** The real map: places worth going to (clubs, parks, markets...), nearest first. */
  places?: ExplorePlace[];
  onPlace?: (p: ExplorePlace) => void;
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
          <p className="text-xs text-muted">{places ? "Go out, hop on a ride, or watch a match." : "Hop on a ride, or watch a match."}</p>
        </div>
        <button onClick={onClose} className="grid size-9 shrink-0 place-items-center self-start rounded-full text-muted hover:bg-panel-2" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className={cn("mt-3 grid gap-1 rounded-xl bg-panel-2 p-1 text-sm font-semibold", places ? "grid-cols-3" : "grid-cols-2")} role="tablist">
        {(places ? (["places", "rides", "sports"] as const) : (["rides", "sports"] as const)).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
            className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2", tab === t ? "bg-panel shadow-sm" : "text-muted")}
          >
            {t === "places" ? <Building2 className="size-4 text-[#5f3dc4]" /> : t === "rides" ? <HotAirBalloon className="size-4 text-[#e64980]" /> : <Trophy className="size-4 text-[#12a37a]" />}
            {t === "places" ? "Places" : t === "rides" ? "Rides" : "Sports"}
          </button>
        ))}
      </div>

      {tab === "places" && places ? (
        <div className="mt-3 max-h-[58dvh] space-y-4 overflow-y-auto overscroll-contain">
          <p className="text-sm text-muted">Where to go, nearest to where you&apos;re looking first. Tap one to fly there and go in.</p>
          {GROUPS.map((g) => {
            const list = places.filter((p) => p.group === g.id);
            if (!list.length) return null;
            const Icon = GROUP_ICON[g.id];
            return (
              <section key={g.id}>
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <Icon className="size-4 shrink-0" style={{ color: GROUP_COLOUR[g.id] }} />
                  {g.label}
                </h3>
                <p className="text-xs text-muted">{g.blurb}</p>
                <div className="-mx-1 mt-1.5 flex gap-2 overflow-x-auto px-1 pb-1">
                  {list.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onPlace?.(p)}
                      className="flex w-40 shrink-0 flex-col rounded-2xl bg-panel-2 p-3 text-left hover:bg-gold/20"
                    >
                      <span className="grid size-8 place-items-center rounded-xl text-white" style={{ background: GROUP_COLOUR[g.id] }}>
                        <Icon className="size-4" />
                      </span>
                      <b className="mt-2 line-clamp-2 text-sm leading-tight">{p.name}</b>
                      <span className="mt-auto flex items-center justify-between pt-1 text-[11px] text-muted">
                        {p.what} · {far(p.dist)}
                        <ChevronRight className="size-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : tab === "sports" ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted">Every match is a brand-new game, shown live from above. Tickets cost a little, and you can bet on who wins.</p>
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
                        {r.fare ? <span className="shrink-0 rounded-full bg-gold/25 px-2 py-0.5 text-[11px] font-bold text-gold-dark">{places ? cash(r.fare) : `${cash(r.fare)}`}</span> : null}
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
