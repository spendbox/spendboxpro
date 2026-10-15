"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, ImagePlus, LoaderCircle, MapPin, Navigation, PartyPopper, Search, Share2, Ticket, Users, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import {
  ABOUT_MAX,
  CAPACITY_MAX,
  PARTY_SIZES,
  PARTY_SIZE_DEFAULT,
  capacityChoices,
  partySize,
  DAYS_AHEAD,
  DURATIONS,
  EARLY_DOORS_MINS,
  EVENT_CATEGORIES,
  HOSTS_A_DAY,
  HOST_SHARE,
  INCOME_TAX,
  TICKET_VAT,
  ticketSplit,
  NEAR_TILES,
  PARTY_NAIRA_PER_HOUR,
  VENUE_COST,
  VENUE_OF_GROUP,
  partyCost,
  streetClash,
  type VenueKind,
  REP_MAX,
  REP_PER_HOSTED,
  TICKETS_NAIRA,
  TITLE_MAX,
  cleanTitle,
  doorsOpen,
  eventCategory,
  eventFormat,
  eventRep,
  formatsIn,
  startChoices,
  untilText,
  whenText,
  type EventCategoryId,
  type EventFormat,
  EMPTY_STAGE,
  QUEUE_MAX,
  SLIDES_MAX,
  youtubeId,
  type StageState,
} from "@/lib/world/events";
import type { WorldEvent } from "@/lib/world-events";
import type { ExplorePlace } from "@/lib/world/explore";
import { spiralIndex } from "@/lib/city/layout";
import { cash, cashSymbol, fromShown, toShown } from "@/lib/world/value";
import { playSfx } from "../sound";
import { Sheet } from "../sheet";
import { cancelEvent, endEvent, enterEvent, eventQuote, hostEvent, rsvpEvent, setStage, streetParties, type EventQuote, type EventView } from "./event-actions";
import { PartyRoom } from "./party-room";
import { RoomGuard, shrinkPhoto } from "./room-kit";
import { StageRoom } from "./stage-room";
import { HostGuide } from "./host-guide";
import { whileHere } from "../activity";
import { onLatest } from "../pulse";
import type { PartyZone } from "../city/party-lights";

// Events on the map (docs/EVENTS.md). The Events button (top right) opens what's on (on now and
// coming up, nearest first) and hosting your own: what kind, where (the street you're on or a place
// nearby), when, tickets. Events shine on the map; a party on now fills its street with a dancing
// crowd for everyone who looks. Going in opens the event's room over the map.

export type EventLight = { id: number; x: number; z: number; colour: string; playing: boolean; endsAt: number | null; label: string | null };
type Me = { id: string; name: string; avatar: unknown };
/** Where a spot is, in words: the named street nearest it (if any, with where it is), its area, and how dear the area is (src/lib/world/events.ts areaK). */
export type SpotWords = { street: { name: string; x: number; z: number } | null; area: string; areaK: number };
/** A named road near a spot (the nearest stretch of it), for a street party. */
export type NearRoad = { name: string; x: number; z: number; dist: number; area: string; areaK: number };

const INTRO_KEY = "nt-events-intro";
const colourOf = (e: Pick<EventView, "category">) => eventCategory(e.category)?.colour ?? "#d6336c";
const shareUrl = (e: EventView) => `${window.location.origin}/play?world=${encodeURIComponent(e.region)}&event=${e.id}`;
const fail = (error = "The connection blinked. Try again.") => ({ ok: false as const, error });

export function Events({
  region,
  me,
  open,
  onClose,
  where,
  places,
  describe,
  roads,
  onLights,
  onScenes,
  onZones,
  onMessage,
  onFly,
  onPerson,
  openId,
}: {
  region: string;
  me: Me | null;
  open: boolean;
  onClose: () => void;
  /** Where you are on the map now. */
  where: () => { x: number; z: number } | null;
  /** Places nearby to hold an event at (landmarks, restaurants, parks...). */
  places: () => ExplorePlace[];
  describe: (x: number, z: number) => SpotWords;
  /** Named roads round a spot, nearest first. */
  roads: (x: number, z: number) => NearRoad[];
  onLights: (lights: EventLight[]) => void;
  /** The party scenes to play on the map (a crowd dancing in the street...). */
  onScenes: (scenes: WorldEvent[]) => void;
  /** The parties on now as areas (as big as their hosts made them): their roads strung with lights. */
  onZones: (zones: PartyZone[]) => void;
  onMessage: (text: string, good: boolean) => void;
  onFly: (x: number, z: number) => void;
  onPerson: (id: string) => void;
  /** An event's beam (or the bubble over it) was tapped on the map: open it. */
  openId?: { id: number; at: number } | null;
}) {
  const [list, setList] = useState<EventView[]>([]);
  const [off, setOff] = useState(false);
  const [detail, setDetail] = useState<number | null>(null);
  /** The event you're in, and whether it's tucked away (you're on the map). */
  const [inside, setInside] = useState<EventView | null>(null);
  const [tucked, setTucked] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "end" | "cancel"; e: EventView }>(null);
  const [dismissed, setDismissed] = useState<number[]>([]);
  /** Out of the room for good (the ticket stays paid: Go in again any time while it's on). */
  const leave = () => {
    setInside(null);
    setTucked(false);
  };
  const [now, setNow] = useState(() => Date.now());

  /** The party being placed on the map (Choose on the map): its area shows while you move. */
  const [preview, setPreview] = useState<PartyZone | null>(null);
  const whereRef = useRef(where);
  const cbs = useRef({ onLights, onScenes, onZones });
  useEffect(() => {
    whereRef.current = where;
    cbs.current = { onLights, onScenes, onZones };
  });
  const signedIn = !!me;
  const look = useCallback(async () => {
    const at = whereRef.current() ?? { x: 0, z: 0 };
    const r = await fetch(`/api/events?region=${encodeURIComponent(region)}&x=${Math.round(at.x)}&z=${Math.round(at.z)}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ list: EventView[]; off?: boolean }>) : null))
      .catch(() => null);
    if (!r) return;
    setList(r.list);
    setOff(!!r.off);
  }, [region]);
  // Asked again only when the city's events change (the minute's ping says, ../pulse), every 5
  // minutes in case, and every 20 s while Events is open or you're in one.
  const busy = open || inside !== null;
  useEffect(() => {
    if (!signedIn) return;
    const first = setTimeout(() => void look(), 1500);
    let seen = "";
    const stopLatest = onLatest((l) => {
      if (l.events !== seen) {
        const was = seen;
        seen = l.events;
        if (was) void look();
      }
    });
    const every = whileHere(() => void look(), busy ? 20_000 : 5 * 60_000);
    return () => {
      clearTimeout(first);
      stopLatest();
      every();
    };
  }, [signedIn, look, busy]);
  useEffect(() => {
    if (open) void look();
  }, [open, look]);
  useEffect(() => {
    // The map's lights only change by the minute.
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Its beam tapped on the map: open it.
  useEffect(() => {
    if (openId) setDetail(openId.id);
  }, [openId]);

  // A link to an event (?event=12): open it.
  useEffect(() => {
    if (!signedIn) return;
    const id = Number(new URLSearchParams(window.location.search).get("event"));
    if (Number.isInteger(id) && id > 0) setDetail(id);
  }, [signedIn]);

  // On the map: a beam for each event on now (and those starting within the hour), and a crowd in
  // the street for each party on now.
  const mapKey =
    list.map((e) => `${e.id}:${e.status}:${e.startsAt}:${e.endsAt}:${e.radiusM}`).join("|") +
    `|${Math.floor(now / 60_000)}|${preview ? `${preview.x},${preview.z},${preview.r}` : ""}`;
  useEffect(() => {
    const t = Date.now();
    const showing = list.filter((e) => e.status === "live" || (e.status === "upcoming" && Date.parse(e.startsAt) - t < 60 * 60_000));
    cbs.current.onLights(showing.map((e) => ({ id: -e.id, x: e.x, z: e.z, colour: colourOf(e), playing: e.status === "live", endsAt: null, label: e.status === "live" ? "LIVE" : "SOON" })));
    // A party's crowd at its middle, and the bigger it is the more crowds round it (one for every
    // 300 m it reaches, up to 4 more), so a carnival dances all over its streets.
    const parties = list.filter((e) => e.status === "live" && eventFormat(e.format)?.scene);
    cbs.current.onScenes(
      parties
        .flatMap((e) => {
          const key = eventFormat(e.format)!.scene!;
          const more = Math.min(4, Math.floor((e.radiusM ?? 50) / 300));
          const r = ((e.radiusM ?? 50) / 100) * 0.55;
          return [
            { id: -1_000_000 - e.id, key, tile: spiralIndex(e.x, e.z), startsAt: e.startsAt, endsAt: e.endsAt, near: true },
            ...Array.from({ length: more }, (_, k) => {
              const a = (k / more) * Math.PI * 2 + e.id;
              return { id: -1_000_000 - e.id - (k + 1) * 10_000_000, key, tile: spiralIndex(Math.round(e.x + Math.cos(a) * r), Math.round(e.z + Math.sin(a) * r)), startsAt: e.startsAt, endsAt: e.endsAt, near: true };
            }),
          ];
        })
        .slice(0, 12),
    );
    cbs.current.onZones([
      ...list.filter((e) => e.category === "party" && e.status === "live").map((e) => ({ id: e.id, x: e.x, z: e.z, r: (e.radiusM ?? 50) / 100, colour: colourOf(e) })),
      ...(preview ? [preview] : []),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey]);
  useEffect(
    () => () => {
      cbs.current.onLights([]);
      cbs.current.onScenes([]);
      cbs.current.onZones([]);
    },
    [],
  );

  // The event you're in, checked now and then: over or called off, the room closes.
  const insideId = inside?.id ?? null;
  useEffect(() => {
    if (insideId === null) return;
    const stop = whileHere(async () => {
      const v = await fetch(`/api/events?id=${insideId}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ view: EventView | null }>) : null))
        .then((d) => d?.view ?? null)
        .catch(() => undefined);
      if (v === undefined) return;
      if (!v || v.status === "ended" || v.status === "cancelled") {
        setInside(null);
        onMessage(v?.status === "cancelled" ? "The host called it off." : "That's the end of the event. Thanks for coming!", true);
        void look();
      } else setInside(v);
    }, 20_000);
    return stop;
  }, [insideId, look, onMessage]);

  // Going in: the room opens at once, and the server lets you in (and takes the ticket) meanwhile.
  // If it says no (not enough money, full...), the room closes again with why.
  const goIn = async (e: EventView) => {
    playSfx("start");
    setDetail(null);
    onClose();
    onFly(e.x, e.z);
    setInside(e);
    setTucked(false);
    if (e.me.in && !e.me.host) return;
    const r = await enterEvent(e.id).catch(() => fail());
    if (!r.ok) {
      setInside((cur) => (cur?.id === e.id ? null : cur));
      return onMessage(r.error, false);
    }
    if (r.paid > 0) onMessage(`Ticket paid: ${cash(r.paid)}. Enjoy!`, true);
    void look();
  };

  // Alerts: a party or a stage that's just started near you (or one you said you're going to).
  const at = where();
  const alerts = list
    .filter(
      (e) =>
        e.status === "live" &&
        e.id !== inside?.id &&
        !e.me.host &&
        !dismissed.includes(e.id) &&
        (e.me.going || (at && Math.hypot(e.x - at.x, e.z - at.z) <= NEAR_TILES && now - Date.parse(e.startsAt) < 15 * 60_000)),
    )
    .slice(0, 1);

  const shown = detail !== null ? (list.find((e) => e.id === detail) ?? null) : null;

  return (
    <>
      {open && me && (
        <EventsSheet
          region={region}
          list={list}
          off={off}
          now={now}
          where={where}
          places={places}
          describe={describe}
          roads={roads}
          onClose={() => {
            setPreview(null);
            onClose();
          }}
          onPreview={setPreview}
          onOpen={(id) => setDetail(id)}
          onHosted={(id, startsNow, v) => {
            void look();
            if (startsNow && v) return void goIn(v);
            setDetail(id);
          }}
        />
      )}
      {detail !== null && me && (
        <EventDetail
          key={detail}
          id={detail}
          known={shown}
          now={now}
          onClose={() => setDetail(null)}
          onGoIn={goIn}
          onFly={(e) => {
            setDetail(null);
            onClose();
            onFly(e.x, e.z);
          }}
          onPerson={onPerson}
          onCancel={(e) => setConfirm({ kind: "cancel", e })}
          onChanged={() => void look()}
          onMessage={onMessage}
        />
      )}
      {!inside && alerts.map((e) => (
        <div key={e.id} className="pointer-events-none fixed inset-x-0 top-28 z-40 flex justify-center px-3">
          <div className="toast-in pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-3xl bg-ink p-2.5 pr-2 text-white shadow-2xl" style={{ boxShadow: `0 0 0 2px ${colourOf(e)}, 0 10px 30px rgba(0,0,0,.35)` }}>
            <button onClick={() => onFly(e.x, e.z)} className="relative shrink-0" aria-label="See it on the map">
              <AvatarFace avatar={cleanAvatar(e.host.avatar, e.host.name)} size={40} className="rounded-full ring-2 ring-white" />
              <span className="absolute -bottom-1 -right-1 text-lg">{eventFormat(e.format)?.icon}</span>
            </button>
            <button onClick={() => setDetail(e.id)} className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-bold">{e.title} is on!</p>
              <p className="truncate text-xs text-white/70">
                {e.place || "Nearby"} · {e.came} there · {e.price > 0 ? cash(e.price) : "Free"}
              </p>
            </button>
            <button onClick={() => void goIn(e)} className="shrink-0 rounded-full bg-gold px-3 py-2 text-xs font-bold text-ink">
              Go in
            </button>
            <button onClick={() => setDismissed((d) => [...d, e.id])} className="grid size-7 shrink-0 place-items-center rounded-full text-white/60" aria-label="Not now">
              <X className="size-4" />
            </button>
          </div>
        </div>
      ))}
      {inside && me && tucked && (
        <div
          className="toast-in pointer-events-auto fixed left-1/2 top-28 z-40 flex w-max max-w-[calc(100vw-7rem)] -translate-x-1/2 items-center gap-1 rounded-full bg-ink py-1.5 pl-1.5 pr-1.5 text-sm font-bold text-white shadow-2xl"
          style={{ boxShadow: `0 0 0 2px ${colourOf(inside)}, 0 10px 30px rgba(0,0,0,.35)` }}
        >
          <button onClick={() => setTucked(false)} className="flex min-w-0 items-center gap-2 pr-1">
            <span className="grid size-8 shrink-0 place-items-center rounded-full text-lg" style={{ background: colourOf(inside) }}>
              {eventFormat(inside.format)?.icon}
            </span>
            {/* One line, cut short if the name is long. */}
            <span className="min-w-0 truncate whitespace-nowrap">Back to {inside.title}</span>
            <span className="shrink-0 rounded-full bg-hit px-1.5 text-[10px]">LIVE</span>
          </button>
          <button onClick={leave} className="grid size-7 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10" aria-label="Leave the event">
            <X className="size-4" />
          </button>
        </div>
      )}
      {/* Still in the room while it's tucked away (back on the map): hidden, not closed, so the
          music, voices and chat carry on until you leave. */}
      {inside && me && (
        <div className={tucked ? "hidden" : undefined}>
          <RoomGuard key={inside.id} onClose={() => setTucked(true)}>
            {inside.category === "stage" ? (
              <StageRoom view={inside} me={me} onMin={() => setTucked(true)} onLeave={leave} onPerson={onPerson} onMessage={onMessage} onEnd={() => setConfirm({ kind: "end", e: inside })} onCancel={() => setConfirm({ kind: "cancel", e: inside })} />
            ) : (
              <PartyRoom view={inside} me={me} onMin={() => setTucked(true)} onLeave={leave} onPerson={onPerson} onMessage={onMessage} onEnd={() => setConfirm({ kind: "end", e: inside })} onCancel={() => setConfirm({ kind: "cancel", e: inside })} />
            )}
          </RoomGuard>
        </div>
      )}
      {confirm && (
        <Sheet onClose={() => setConfirm(null)} title={confirm.kind === "end" ? "End it now?" : "Call it off?"} centred>
          <p className="text-sm text-muted">
            {confirm.kind === "end"
              ? `Everyone leaves the room${confirm.e.price > 0 ? `, and the ticket money is paid to you (less VAT and income tax)` : ""}.`
              : `${confirm.e.price > 0 ? `Everyone who bought a ticket gets their money back, including people who have already come in, so you won't be paid for any of them. ` : ""}Everyone going or inside is told it's off.${confirm.e.category === "party" ? (confirm.e.status === "upcoming" ? " Your hosting fee comes back too." : " As it has already started, your hosting fee is only returned if fewer than 10 people have come.") : ""}`}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => setConfirm(null)} className="h-11 rounded-full bg-ink/5 text-sm font-semibold">
              Keep it on
            </button>
            <button
              onClick={async () => {
                const c = confirm;
                setConfirm(null);
                const r = await (c.kind === "end" ? endEvent(c.e.id) : cancelEvent(c.e.id)).catch(() => fail());
                if (!r.ok) return onMessage(r.error, false);
                if (inside?.id === c.e.id) setInside(null);
                setDetail(null);
                onMessage(c.kind === "end" ? "It's over. Thanks for hosting!" : c.e.price > 0 ? "Called off. Every ticket has been paid back, and everyone has been told." : "Called off. Everyone has been told.", true);
                void look();
              }}
              className="h-11 rounded-full bg-hit text-sm font-bold text-white"
            >
              {confirm.kind === "end" ? "End it" : "Call it off"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

// ---------------------------------------------------------------- what's on, and hosting

type Tab = "on" | "host";
type Shelf = "all" | "party" | "stage" | "going";

function EventsSheet({
  region,
  list,
  off,
  now,
  where,
  places,
  describe,
  roads,
  onClose,
  onPreview,
  onOpen,
  onHosted,
}: {
  region: string;
  list: EventView[];
  off: boolean;
  now: number;
  where: () => { x: number; z: number } | null;
  places: () => ExplorePlace[];
  describe: (x: number, z: number) => SpotWords;
  roads: (x: number, z: number) => NearRoad[];
  onClose: () => void;
  /** The party being placed (Choose on the map), shown on the map; null when done. */
  onPreview: (zone: PartyZone | null) => void;
  onOpen: (id: number) => void;
  onHosted: (id: number, startsNow: boolean, view: EventView | null) => void;
}) {
  const [intro, setIntro] = useState(() => {
    try {
      return !localStorage.getItem(INTRO_KEY);
    } catch {
      return true;
    }
  });
  const [tab, setTab] = useState<Tab>("on");
  const [shelf, setShelf] = useState<Shelf>("all");
  // Choose on the map: the card tucks away (all you've filled in kept), a pin in the middle of the
  // screen shows where and how far the party reaches, and Use this spot brings the card back.
  const [picking, setPicking] = useState<number | null>(null);
  const [guide, setGuide] = useState(false);
  const [picked, setPicked] = useState(0);

  if (intro)
    return (
      <Sheet onClose={onClose} title="Events">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#d6336c] via-[#ae3ec9] to-[#7048e8] p-4 text-white">
          <span className="pointer-events-none absolute -right-3 -top-4 text-7xl opacity-25">🎉</span>
          <p className="font-display text-xl font-extrabold leading-tight">Host it. Go to it. Meet people.</p>
          <p className="mt-1 text-sm text-white/85">Parties, talks and watch parties, right on the map.</p>
        </div>
        <div className="mt-3 space-y-2.5 text-sm">
          <Point icon="📍" text="Host anywhere you like: the street you're on, a landmark, a restaurant or a park." />
          <Point icon="🎊" text="Parties fill the street on the map. Inside there's music, the hot seat, shout-outs, toasts, new people to meet and a host to spray." />
          <Point icon="🎤" text="Talks and screenings put slides or a video on a big screen. Everyone watches together and can react and ask questions." />
          <Point icon="🎟️" text={`Make it free or sell tickets. Once it's over you keep about ${Math.round(HOST_SHARE * 100)}% of each ticket. Tickets include ${+(TICKET_VAT * 100).toFixed(1)}% VAT, and your takings pay ${Math.round(INCOME_TAX * 100)}% income tax, just like pay.`} />
          <Point icon="⭐" text={`+${REP_PER_HOSTED} reputation for every event you host that 3 or more people come to.`} />
        </div>
        <button
          onClick={() => {
            try {
              localStorage.setItem(INTRO_KEY, "1");
            } catch {}
            setIntro(false);
          }}
          className="mt-4 h-12 w-full rounded-full bg-gradient-to-r from-[#d6336c] to-[#7048e8] font-bold text-white shadow-lg"
        >
          Let&apos;s go
        </button>
      </Sheet>
    );

  const live = list.filter((e) => e.status === "live");
  const soon = list.filter((e) => e.status === "upcoming");
  const keep = (e: EventView) => (shelf === "all" ? true : shelf === "going" ? e.me.going || e.me.host : e.category === shelf);

  return (
    <>
    {picking !== null && (
      <MapPicker
        radiusM={picking}
        where={where}
        describe={describe}
        onPreview={onPreview}
        onDone={(use) => {
          onPreview(null);
          setPicking(null);
          if (use) setPicked((k) => k + 1);
        }}
      />
    )}
    <div className={picking !== null ? "hidden" : undefined}>
    <Sheet onClose={onClose} title="Events" wide>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-ink/5 p-1">
        {(
          [
            ["on", "What's on"],
            ["host", "Host an event"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={cn("h-10 rounded-full text-sm font-bold transition", tab === id ? "bg-ink text-white shadow" : "text-ink")}>
            {label}
          </button>
        ))}
      </div>
      {off && <p className="mt-3 rounded-2xl bg-gold/15 px-3 py-2 text-xs">Events are switched on soon (the game&apos;s owner has one update to run). You can look around in the meantime.</p>}
      {tab === "on" ? (
        <>
          <div className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {(
              [
                ["all", "All", "✨"],
                ["party", "Parties", "🎉"],
                ["stage", "Talks & screenings", "🎤"],
                ["going", "I'm going", "🎟️"],
              ] as [Shelf, string, string][]
            ).map(([id, label, icon]) => (
              <button key={id} onClick={() => setShelf(id)} className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition", shelf === id ? "bg-ink text-white shadow" : "bg-ink/5")}>
                {icon} {label}
              </button>
            ))}
          </div>
          <Section title="On now" list={live.filter(keep)} now={now} onOpen={onOpen} empty={null} />
          <Section title="Coming up" list={soon.filter(keep)} now={now} onOpen={onOpen} empty={null} />
          {live.filter(keep).length + soon.filter(keep).length === 0 && (
            <div className="mt-4 rounded-3xl bg-ink/5 p-5 text-center">
              <p className="text-3xl">🎈</p>
              <p className="mt-1 font-bold">{shelf === "going" ? "Nothing you're going to yet" : "Nothing on in this state yet"}</p>
              <p className="text-sm text-muted">Be the one who gets it started. Your friends hear about it the moment you do.</p>
              <button onClick={() => setTab("host")} className="mt-3 h-11 rounded-full bg-ink px-5 text-sm font-bold text-white">
                Host an event
              </button>
            </div>
          )}
        </>
      ) : (
        <>
        <button onClick={() => setGuide(true)} className="mt-3 flex w-full items-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#d6336c]/10 to-[#7048e8]/10 px-3 py-2.5 text-left">
          <span className="text-2xl">📖</span>
          <span className="min-w-0 flex-1">
            <b className="block text-sm">How to host a great party</b>
            <span className="text-xs text-muted">Setting it up, adding music and getting it going, in 9 short steps</span>
          </span>
        </button>
        {guide && <HostGuide onClose={() => setGuide(false)} />}
        <HostForm region={region} where={where} places={places} describe={describe} roads={roads} onOpen={onOpen} onHosted={onHosted} picked={picked} onPickOnMap={(m) => setPicking(m)} />
        </>
      )}
    </Sheet>
    </div>
    </>
  );
}

function Point({ icon, text }: { icon: string; text: string }) {
  return (
    <p className="flex items-start gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-ink/5 text-base">{icon}</span>
      <span className="pt-1">{text}</span>
    </p>
  );
}

function Section({ title, list, now, onOpen, empty }: { title: string; list: EventView[]; now: number; onOpen: (id: number) => void; empty: string | null }) {
  if (!list.length && !empty) return null;
  return (
    <>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
        {title} <span className="tabular-nums">· {list.length}</span>
      </p>
      <div className="mt-2 space-y-2">
        {list.map((e) => (
          <EventRow key={e.id} e={e} now={now} onOpen={() => onOpen(e.id)} />
        ))}
      </div>
    </>
  );
}

function EventRow({ e, now, onOpen }: { e: EventView; now: number; onOpen: () => void }) {
  const f = eventFormat(e.format);
  const colour = colourOf(e);
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-3xl bg-ink/5 p-2.5 text-left transition active:scale-[.98]">
      <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl text-2xl text-white" style={{ background: `linear-gradient(150deg, ${colour}, #1b1530)` }}>
        {f?.icon ?? "🎉"}
        {e.status === "live" && <span className="absolute -top-1 rounded-full bg-hit px-1.5 text-[9px] font-bold">LIVE</span>}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{e.title}</p>
        <p className="truncate text-xs text-muted">
          {f?.title ?? "Event"} · {e.place || "On the map"}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-[11px] font-semibold">
          <span className={cn(e.status === "live" ? "text-hit" : "text-ink")}>{whenText(Date.parse(e.startsAt), Date.parse(e.endsAt), now)}</span>
          <span className="flex items-center gap-0.5 text-muted">
            <Users className="size-3" /> {e.status === "live" ? e.came : e.going}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", e.price > 0 ? "bg-gold/30" : "bg-[#12a37a]/15 text-[#0b7a5a]")}>{e.price > 0 ? cash(e.price) : "Free"}</span>
        <AvatarFace avatar={cleanAvatar(e.host.avatar, e.host.name)} size={26} className="rounded-full ring-2 ring-white" />
      </div>
    </button>
  );
}

/** Mint shown in the player's currency, as the number to type. */
const typedOf = (mint: number) => {
  const v = toShown(mint);
  return String(v >= 100 ? Math.round(v) : Math.round(v * 100) / 100);
};

type Venue = { key: string; name: string; what: string; x: number; z: number; street: boolean; dist: number; suits: boolean; kind: VenueKind; areaK: number };

/** Host an event: what kind, the name, where, when, tickets, and go. */
function HostForm({
  region,
  where,
  places,
  describe,
  roads,
  onOpen,
  onHosted,
  picked,
  onPickOnMap,
}: {
  region: string;
  where: () => { x: number; z: number } | null;
  places: () => ExplorePlace[];
  describe: (x: number, z: number) => SpotWords;
  roads: (x: number, z: number) => NearRoad[];
  onOpen: (id: number) => void;
  onHosted: (id: number, startsNow: boolean, view: EventView | null) => void;
  /** Counts up each time a spot is chosen on the map: look round it again. */
  picked: number;
  /** Tuck the card away to choose the spot on the map (showing a party this big). */
  onPickOnMap: (radiusM: number) => void;
}) {
  const [quote, setQuote] = useState<EventQuote | null>(null);
  useEffect(() => {
    void eventQuote(region).then(setQuote).catch(() => setQuote(null));
  }, [region]);
  const [cat, setCat] = useState<EventCategoryId>("party");
  const [formatId, setFormatId] = useState("street_party");
  const f = eventFormat(formatId) as EventFormat;
  const [title, setTitle] = useState("");
  const [about, setAbout] = useState("");
  const [venueKey, setVenueKey] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [startId, setStartId] = useState("now");
  const [custom, setCustom] = useState("");
  const [minutes, setMinutes] = useState(f.minutes);
  const [chip, setChip] = useState<number | null>(0);
  const [raw, setRaw] = useState("");
  const [capacity, setCapacity] = useState(f.capacity);
  /** How far the party reaches (metres): one spot up to a carnival. */
  const [radiusM, setRadiusM] = useState<number>(PARTY_SIZE_DEFAULT);
  const size = partySize(radiusM);
  const crowds = cat === "party" ? capacityChoices(radiusM) : [20, 50, 100, 300, CAPACITY_MAX];
  const [going, setGoing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const opened = useRef(Date.now());
  // The music (parties): YouTube songs, in order. The screen (talks): slides or a YouTube video.
  const [songs, setSongs] = useState<string[]>([]);
  const [songLink, setSongLink] = useState("");
  const [mediaKind, setMediaKind] = useState<"slides" | "video">("slides");
  const [slideFiles, setSlideFiles] = useState<File[]>([]);
  const [videoLink, setVideoLink] = useState("");
  /** Uploading the slides after it's made ("Adding slide 2 of 5…"). */
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  /** Which screen of the form (see `steps`). */
  const [stepAt, setStepAt] = useState(0);

  // Where it can be: any named road round the middle of your screen (move the map and look again
  // to pick another), and the places round you (those that suit it first).
  const [here, setHere] = useState(() => where());
  const [nearby, setNearby] = useState(() => places());
  const [nearRoads, setNearRoads] = useState<NearRoad[]>(() => (here ? roads(Math.round(here.x), Math.round(here.z)) : []));
  const lookAgain = () => {
    const at = where();
    setHere(at);
    setNearby(places());
    setNearRoads(at ? roads(Math.round(at.x), Math.round(at.z)) : []);
    setVenueKey(null);
  };
  // Back from choosing on the map: the roads and places round that spot (the nearest road picked).
  const [seenPick, setSeenPick] = useState(picked);
  if (picked !== seenPick) {
    setSeenPick(picked);
    lookAgain();
  }
  // Street parties already on the roads (two can't share a stretch at the same time).
  const [taken, setTaken] = useState<{ x: number; z: number; start: number; end: number; title: string; radiusM: number }[]>([]);
  useEffect(() => {
    void streetParties(region).then(setTaken).catch(() => setTaken([]));
  }, [region]);
  const venues = useMemo<Venue[]>(() => {
    const out: Venue[] = [];
    for (const r of nearRoads) out.push({ key: `road:${r.name}`, name: `${r.name}, ${r.area}`, what: "On the street", x: r.x, z: r.z, street: true, dist: r.dist, suits: f.suits.includes("street"), kind: "street", areaK: r.areaK });
    if (here && !nearRoads.length) {
      const w = describe(Math.round(here.x), Math.round(here.z));
      if (w.street) out.push({ key: "street", name: `${w.street.name}, ${w.area}`, what: "On the street", x: w.street.x, z: w.street.z, street: true, dist: 0, suits: f.suits.includes("street"), kind: "street", areaK: w.areaK });
    }
    for (const p of nearby) {
      const x = Math.round(p.x);
      const z = Math.round(p.z);
      out.push({ key: p.id, name: p.name, what: p.what, x, z, street: false, dist: p.dist, suits: (f.suits as string[]).includes(p.group), kind: VENUE_OF_GROUP[p.group] ?? "outdoors", areaK: describe(x, z).areaK });
    }
    return out;
  }, [here, nearby, nearRoads, describe, f]);
  const words = q.trim().toLowerCase();
  const shownVenues = venues
    .filter((v) => !words || `${v.name} ${v.what}`.toLowerCase().includes(words))
    .sort((a, b) => Number(b.street) - Number(a.street) || Number(b.suits) - Number(a.suits) || a.dist - b.dist)
    .slice(0, words ? 30 : 12);
  const venue = venues.find((v) => v.key === venueKey) ?? (venueKey === null ? (venues.find((v) => v.street) ?? venues[0] ?? null) : null);

  const choices = useMemo(() => startChoices(opened.current), []);
  const startAt = startId === "custom" ? (custom ? new Date(custom).getTime() : NaN) : (choices.find((c) => c.id === startId)?.at ?? opened.current);
  const perMint = quote?.perMint ?? 1_500;
  const price = chip !== null ? Math.round((chip / perMint) * 100) / 100 : (() => {
    const v = Number(raw.replace(/[,\s]/g, ""));
    return raw.trim() && Number.isFinite(v) ? Math.round(fromShown(v) * 100) / 100 : null;
  })();
  const priceBad = price === null || price < 0 || (quote !== null && price > quote.priceMax);
  const name = cleanTitle(title);
  const timeBad = !Number.isFinite(startAt) || startAt > opened.current + DAYS_AHEAD * 86_400_000;
  // A street party on a stretch of road another one already has at that time.
  const span = { start: startId === "now" ? Date.now() : startAt, end: (startId === "now" ? Date.now() : startAt) + minutes * 60_000 };
  const clashOf = (v: Venue) => (cat === "party" && v.street && Number.isFinite(span.start) ? (taken.find((t) => streetClash({ x: v.x, z: v.z, ...span, radiusM: cat === "party" ? radiusM : PARTY_SIZE_DEFAULT }, t)) ?? null) : null);
  const clash = venue ? clashOf(venue) : null;
  // What hosting costs (parties): the hours, how many can come, the kind of place and the area.
  const cost = cat === "party" && venue ? partyCost({ minutes, capacity, venue: venue.kind, area: venue.areaK, radiusM }) : null;
  const ready = !!name && !!venue && !priceBad && !timeBad && !going && !clash;
  /** Not enough money to pay for hosting it. */
  const short = !!cost && quote?.canSpend != null && quote.canSpend < cost.naira / (quote?.perMint ?? 1_500) - 0.005;

  const pickFormat = (id: string) => {
    const nf = eventFormat(id);
    if (!nf) return;
    setFormatId(id);
    setMinutes(nf.minutes);
    setCapacity(Math.min(nf.capacity, nf.category === "party" ? size.most : CAPACITY_MAX));
  };
  const pickSize = (m: number) => {
    setRadiusM(m);
    setCapacity((c) => Math.min(c, partySize(m).most));
  };

  if (quote?.hosting)
    return (
      <div className="mt-4 rounded-3xl bg-ink/5 p-5 text-center">
        <p className="text-3xl">🎟️</p>
        <p className="mt-1 font-bold">You&apos;re hosting an event already</p>
        <p className="text-sm text-muted">One at a time. End it or call it off to host another.</p>
        <button onClick={() => onOpen(quote.hosting!)} className="mt-3 h-11 rounded-full bg-ink px-5 text-sm font-bold text-white">
          Open my event
        </button>
      </div>
    );

  const rep = quote?.rep ? eventRep(quote.rep.hosted, quote.rep.attended) : null;
  // One question a screen (docs/EVENTS.md): what, its name, where, how big (parties), when,
  // tickets, then the music (parties) or slides and video (talks), and a last look before it goes on
  // the map.
  const steps: { id: string; title: string; tip: string }[] = [
    { id: "kind", title: "What are you hosting?", tip: "Parties fill the street with music and dancing. Talks and screenings put slides or a video on a big screen." },
    { id: "name", title: "Give it a name", tip: "A good name makes people want to come. Add a line about the dress code, the music or the speaker if you like." },
    { id: "where", title: "Where is it?", tip: "Pick a road or a place near you, or tap Choose on the map and drop the pin where you want it." },
    ...(cat === "party" ? [{ id: "size", title: "How big is the party?", tip: "Every road inside the circle lights up with bulbs and dancing crowds. Bigger parties hold more people." }] : []),
    { id: "when", title: "When does it start?", tip: `Start now, or any time in the next ${DAYS_AHEAD} days. People who say they're going are told when it starts.` },
    { id: "tickets", title: "Tickets and guests", tip: "Make it free, or sell tickets. You're paid once it's over." },
    cat === "party"
      ? { id: "music", title: "Add your music", tip: "Line up songs now so the party starts the moment you walk in." }
      : { id: "media", title: "Add slides or a video", tip: "Get your screen ready now, so you can start as soon as you walk in." },
    { id: "review", title: "Ready to go?", tip: "Here's your event. Tap Back to change anything." },
  ];
  const k = Math.min(stepAt, steps.length - 1);
  const stepId = steps[k].id;
  const stepOk =
    stepId === "name" ? !!name : stepId === "where" ? !!venue && !clash : stepId === "when" ? !timeBad : stepId === "tickets" ? !priceBad : true;
  const stepHint = stepId === "name" ? "Give it a name first." : stepId === "where" ? (clash ? "That road is taken then. Pick another." : "Pick where it is first.") : stepId === "when" ? `Pick a time in the next ${DAYS_AHEAD} days.` : stepId === "tickets" ? "Check the ticket price." : "";

  /** After it's made: the songs, or the slides (uploaded now) or video, put on its stage. */
  const loadStage = async (id: number): Promise<StageState | null> => {
    let stage: StageState | null = null;
    if (cat === "party" && songs.length) {
      stage = { ...EMPTY_STAGE, mode: "video", video: songs[0], queue: songs.slice(1, QUEUE_MAX + 1), playing: false };
    } else if (cat !== "party" && mediaKind === "video" && youtubeId(videoLink)) {
      stage = { ...EMPTY_STAGE, mode: "video", video: youtubeId(videoLink), playing: false };
    } else if (cat !== "party" && slideFiles.length) {
      const urls: string[] = [];
      for (let i = 0; i < slideFiles.length; i++) {
        setLoadingStage(`Adding slide ${i + 1} of ${slideFiles.length}…`);
        const body = new FormData();
        body.set("id", String(id));
        body.set("photo", await shrinkPhoto(slideFiles[i], 1600), "slide.jpg");
        const r = (await fetch("/api/events/slide", { method: "POST", body }).then((res) => res.json())) as { ok: boolean; url?: string };
        if (r.ok && r.url) urls.push(r.url);
      }
      if (urls.length) stage = { ...EMPTY_STAGE, mode: "slides", slides: urls, slide: 0 };
    }
    setLoadingStage(null);
    if (!stage) return null;
    const r = await setStage(id, stage);
    return r.ok ? stage : null;
  };

  return (
    <div className="mt-3">
      {/* Where you are in it, and the question on this screen. */}
      <div className="flex items-center gap-2">
        {k > 0 ? (
          <button onClick={() => setStepAt(k - 1)} className="grid size-8 shrink-0 place-items-center rounded-full bg-ink/5" aria-label="Back">
            <ChevronLeft className="size-4" />
          </button>
        ) : (
          <span className="size-8 shrink-0" />
        )}
        <div className="flex flex-1 gap-1" aria-label={`Step ${k + 1} of ${steps.length}`}>
          {steps.map((st, i) => (
            <span key={st.id} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= k ? "bg-[#d6336c]" : "bg-ink/10")} />
          ))}
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
          {k + 1}/{steps.length}
        </span>
      </div>
      <div key={stepId} className="mt-3 motion-safe:animate-[stepIn_.2s_ease-out]">
        <p className="font-display text-xl font-extrabold leading-tight">{steps[k].title}</p>
        <p className="mb-3 mt-1 text-sm text-muted">{steps[k].tip}</p>
        {stepId === "kind" && (
          <>
            {rep !== null && (
              <div className="rounded-2xl bg-ink/5 px-3 py-2">
                <div className="flex justify-between text-[11px] font-semibold text-muted">
                  <span>Your reputation from events</span>
                  <span className="tabular-nums">
                    {rep} / {REP_MAX}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full rounded-full bg-[#d6336c]" style={{ width: `${Math.min(100, (rep / REP_MAX) * 100)}%` }} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {EVENT_CATEGORIES.map((c) => {
                const on = c.id === cat;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      if (!c.ready) return;
                      setCat(c.id);
                      pickFormat(formatsIn(c.id)[0].id);
                    }}
                    className={cn("relative flex min-h-[5.5rem] flex-col items-start overflow-hidden rounded-2xl p-2.5 text-left text-white transition active:scale-95", on ? "ring-4 ring-gold" : "ring-1 ring-black/10", !c.ready && "opacity-60 saturate-50")}
                    style={{ background: `linear-gradient(150deg, ${c.colour} 0%, ${c.colour} 40%, #101418 130%)` }}
                  >
                    <span className="text-2xl leading-none">{c.icon}</span>
                    <b className="mt-auto pt-1 text-[13px] leading-tight">{c.label}</b>
                    {!c.ready && <span className="absolute right-1.5 top-1.5 rounded-full bg-black/35 px-1.5 py-0.5 text-[9px] font-bold uppercase">Soon</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted">{eventCategory(cat)?.blurb}</p>

            <div className="-mx-5 mt-2 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
              {formatsIn(cat).map((x) => (
                <button key={x.id} onClick={() => pickFormat(x.id)} className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold", x.id === formatId ? "bg-ink text-white shadow" : "bg-ink/5")}>
                  {x.icon} {x.title}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">{f.blurb}</p>
          </>
        )}
        {stepId === "name" && (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
              placeholder={cat === "party" ? "Ada's birthday owambe" : f.id === "watch_party" ? "Friday film night" : "How I saved my first ₦1m"}
              className="h-12 w-full rounded-2xl bg-ink/5 px-4 font-semibold outline-none focus:ring-2 focus:ring-ink/20"
            />
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value.slice(0, ABOUT_MAX))}
              rows={2}
              placeholder="What to expect (optional): the dress code, the speaker, the film…"
              className="mt-2 w-full resize-none rounded-2xl bg-ink/5 p-3 text-sm outline-none focus:ring-2 focus:ring-ink/20"
            />
          </>
        )}
        {stepId === "where" && (
          <>
            {venue && (
              <div className="mb-2 flex items-center gap-2 rounded-2xl bg-[#d6336c]/10 px-3 py-2 text-sm">
                <MapPin className="size-4 shrink-0 text-[#d6336c]" />
                <span className="min-w-0 flex-1 truncate">
                  <b>{venue.name}</b> <span className="text-muted">· {venue.what}</span>
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-ink/5 px-3.5">
                <Search className="size-4 shrink-0 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 40))} placeholder="Search roads and places" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
              </label>
              <button onClick={lookAgain} className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-ink/5 px-3 text-xs font-bold" title="Use where the map is now">
                <Navigation className="size-3.5" /> Here
              </button>
            </div>
            <button onClick={() => onPickOnMap(cat === "party" ? radiusM : PARTY_SIZE_DEFAULT)} className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-ink text-sm font-bold text-white">
              <MapPin className="size-4" /> Choose on the map
            </button>
            <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
              {shownVenues.length === 0 && <p className="rounded-2xl bg-ink/5 p-3 text-center text-sm text-muted">{venues.length ? "No place by that name near you." : "Walk somewhere on the map (or go home) first."}</p>}
              {shownVenues.map((v) => {
                const c = clashOf(v);
                return (
                  <button key={v.key} onClick={() => setVenueKey(v.key)} className={cn("flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left", venue?.key === v.key ? "bg-ink text-white" : "bg-ink/5", c && venue?.key !== v.key && "opacity-55")}>
                    <span className="text-lg">{v.street ? "🛣️" : "📍"}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-sm">{v.name}</b>
                      <span className={cn("text-[11px]", venue?.key === v.key ? "text-white/70" : "text-muted")}>
                        {c ? `Taken then: "${c.title}"` : v.what}
                        {v.dist > 0 ? ` · ${v.dist < 10 ? `${Math.round(v.dist * 100)} m` : `${(v.dist / 10).toFixed(1)} km`}` : ""}
                        {!c && v.suits ? " · good for this" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {stepId === "size" && (
          <>
            {cat === "party" && (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  {PARTY_SIZES.map((sz) => (
                    <button key={sz.m} onClick={() => pickSize(sz.m)} className={cn("rounded-2xl px-2 py-2 text-left", radiusM === sz.m ? "bg-ink text-white shadow" : "bg-ink/5")}>
                      <b className="block text-[13px] leading-tight">{sz.label}</b>
                      <span className={cn("block text-[10px] leading-tight", radiusM === sz.m ? "text-white/70" : "text-muted")}>
                        {sz.m < 1000 ? `${sz.m} m` : `${sz.m / 1000} km`} round · up to {sz.most.toLocaleString("en-GB")}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {size.blurb}. Every road inside it is strung with lights and full of dancing on the map{size.m >= 600 ? ", and a party this big makes the Lagos news" : ""}.
                </p>
              </>
            )}
          </>
        )}
        {stepId === "when" && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {choices.map((c) => (
                <Chip key={c.id} on={startId === c.id} onClick={() => setStartId(c.id)}>
                  {c.label}
                </Chip>
              ))}
              <Chip on={startId === "custom"} onClick={() => setStartId("custom")}>
                <CalendarDays className="size-3.5" /> Pick a time
              </Chip>
            </div>
            {startId === "custom" && (
              <input
                type="datetime-local"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="mt-2 h-11 w-full rounded-2xl bg-ink/5 px-3 text-sm outline-none"
                min={new Date(opened.current - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)}
              />
            )}
            {timeBad && startId === "custom" && custom && <p className="mt-1 text-xs font-semibold text-hit">Pick a time in the next {DAYS_AHEAD} days.</p>}
            <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-muted">
              <Clock className="size-3.5" /> How long
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DURATIONS.map((m) => (
                <Chip key={m} on={minutes === m} onClick={() => setMinutes(m)}>
                  {m < 60 ? `${m} min` : `${m / 60} hour${m > 60 ? "s" : ""}`}
                </Chip>
              ))}
            </div>
          </>
        )}
        {stepId === "tickets" && (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              {TICKETS_NAIRA.map((t) => (
                <button key={t} onClick={() => setChip(t)} className={cn("h-10 min-w-0 truncate rounded-full px-1 text-[13px] font-bold", chip === t ? "bg-ink text-white shadow" : "bg-ink/5")}>
                  {t === 0 ? "Free" : cash(t / perMint)}
                </button>
              ))}
            </div>
            <label className={cn("mt-2 flex h-11 items-center gap-2 rounded-2xl px-4", chip === null ? "bg-panel ring-2 ring-ink" : "bg-ink/5")}>
              <Ticket className="size-4 text-muted" />
              <span className="font-display text-lg font-extrabold text-muted">{cashSymbol()}</span>
              <input
                value={chip !== null ? (chip === 0 ? "" : Number(typedOf(chip / perMint)).toLocaleString("en-GB")) : raw}
                onFocus={() => {
                  if (chip !== null) {
                    setRaw(chip === 0 ? "" : typedOf(chip / perMint));
                    setChip(null);
                  }
                }}
                onChange={(e) => {
                  setChip(null);
                  setRaw(e.target.value.replace(/[^\d.,\s]/g, "").slice(0, 12));
                }}
                inputMode="decimal"
                placeholder="Or type any price"
                className="h-full min-w-0 flex-1 bg-transparent font-display text-lg font-extrabold tabular-nums outline-none"
              />
            </label>
            <p className={cn("mt-1 text-xs", priceBad && raw ? "font-semibold text-hit" : "text-muted")}>
              {priceBad && raw
                ? `Up to ${cash(quote?.priceMax ?? 0)} a ticket.`
                : price
                  ? `Guests pay ${cash(price)} to come in (VAT included). Once it's over you get ${cash(ticketSplit(price).host)} of each: ${cash(ticketSplit(price).vat)} is VAT and ${cash(ticketSplit(price).tax)} income tax, paid to the state. If you call it off, everyone gets theirs back.`
                  : "Free to come. People can still spray you at a party."}
            </p>
            <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-muted">
              <Users className="size-3.5" /> How many can come
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {crowds.map((c) => (
                <Chip key={c} on={capacity === c} onClick={() => setCapacity(c)}>
                  {c.toLocaleString("en-GB")}
                </Chip>
              ))}
            </div>
          </>
        )}
        {stepId === "music" && (
          <>
            <div className="rounded-2xl bg-ink/5 p-3 text-sm">
              <p className="font-bold">How to add a song</p>
              <ol className="mt-1.5 space-y-1 text-muted">
                <li>1. Open YouTube and find the song.</li>
                <li>2. Tap Share, then Copy link.</li>
                <li>3. Come back here, paste it below and tap Add.</li>
              </ol>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={songLink}
                onChange={(e) => setSongLink(e.target.value.slice(0, 300))}
                placeholder="Paste a YouTube link"
                inputMode="url"
                className="h-11 min-w-0 flex-1 rounded-2xl bg-ink/5 px-3.5 text-sm outline-none focus:ring-2 focus:ring-ink/20"
              />
              <button
                disabled={!youtubeId(songLink) || songs.length >= QUEUE_MAX + 1}
                onClick={() => {
                  const id = youtubeId(songLink);
                  if (!id) return;
                  setSongs((l) => (l.includes(id) ? l : [...l, id]));
                  setSongLink("");
                }}
                className="h-11 shrink-0 rounded-full bg-ink px-4 text-sm font-bold text-white disabled:opacity-40"
              >
                Add
              </button>
            </div>
            {songLink && !youtubeId(songLink) && <p className="mt-1 text-xs font-semibold text-hit">That isn&apos;t a YouTube link.</p>}
            {songs.length > 0 && (
              <ol className="mt-3 space-y-1.5">
                {songs.map((id, k) => (
                  <li key={id} className="flex items-center gap-2.5 rounded-2xl bg-ink/5 p-1.5 pr-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://i.ytimg.com/vi/${id}/default.jpg`} alt="" loading="lazy" className="h-9 w-12 shrink-0 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1 text-sm font-semibold">{k === 0 ? "Plays first" : `Song ${k + 1}`}</span>
                    <button onClick={() => setSongs((l) => l.filter((x) => x !== id))} className="grid size-8 place-items-center rounded-full text-muted hover:bg-ink/10" aria-label="Remove this song">
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-2 text-xs text-muted">
              {songs.length
                ? `${songs.length} song${songs.length > 1 ? "s" : ""} ready. When you go in, tap Play in DJ & music and everyone hears them at the same moment, one after another.`
                : "No songs yet? That's fine. You can add them inside, or pick a ready-made beat (Afrobeats, Amapiano and more)."}
            </p>
          </>
        )}
        {stepId === "media" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMediaKind("slides")} className={cn("rounded-2xl p-3 text-left", mediaKind === "slides" ? "bg-ink text-white" : "bg-ink/5")}>
                <b className="block text-sm">🖼️ Slides</b>
                <span className={cn("text-[11px]", mediaKind === "slides" ? "text-white/70" : "text-muted")}>Pictures you show one by one</span>
              </button>
              <button onClick={() => setMediaKind("video")} className={cn("rounded-2xl p-3 text-left", mediaKind === "video" ? "bg-ink text-white" : "bg-ink/5")}>
                <b className="block text-sm">🎬 A video</b>
                <span className={cn("text-[11px]", mediaKind === "video" ? "text-white/70" : "text-muted")}>From YouTube, watched together</span>
              </button>
            </div>
            {mediaKind === "slides" ? (
              <>
                <p className="mt-3 rounded-2xl bg-ink/5 p-3 text-sm text-muted">
                  Made your slides in PowerPoint, Google Slides or Canva? Save or screenshot each slide as a picture, then add them here in order.
                </p>
                <label className="mt-2 flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-ink text-sm font-bold text-white">
                  <ImagePlus className="size-4" /> {slideFiles.length ? "Add more slides" : "Choose pictures"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const list = [...(e.target.files ?? [])];
                      setSlideFiles((l) => [...l, ...list].slice(0, SLIDES_MAX));
                      e.target.value = "";
                    }}
                  />
                </label>
                {slideFiles.length > 0 && (
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {slideFiles.map((file, k) => (
                      <SlideThumb key={`${file.name}-${k}`} file={file} n={k + 1} onRemove={() => setSlideFiles((l) => l.filter((_, i) => i !== k))} />
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted">
                  {slideFiles.length ? `${slideFiles.length} of ${SLIDES_MAX} slides. Inside, you move through them with Next and everyone sees the same one.` : `Up to ${SLIDES_MAX} slides. You can also add them once you're inside.`}
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 rounded-2xl bg-ink/5 p-3 text-sm text-muted">Open YouTube, find the video, tap Share, then Copy link. Paste it below.</p>
                <input
                  value={videoLink}
                  onChange={(e) => setVideoLink(e.target.value.slice(0, 300))}
                  placeholder="Paste a YouTube link"
                  inputMode="url"
                  className="mt-2 h-11 w-full rounded-2xl bg-ink/5 px-3.5 text-sm outline-none focus:ring-2 focus:ring-ink/20"
                />
                {videoLink && !youtubeId(videoLink) && <p className="mt-1 text-xs font-semibold text-hit">That isn&apos;t a YouTube link.</p>}
                {youtubeId(videoLink) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`https://i.ytimg.com/vi/${youtubeId(videoLink)}/hqdefault.jpg`} alt="The video" className="mt-2 aspect-video w-full rounded-2xl object-cover" />
                )}
                <p className="mt-2 text-xs text-muted">It&apos;s ready on the screen when you go in. Tap Play and everyone watches at the same moment.</p>
              </>
            )}
          </>
        )}
        {stepId === "review" && (
          <>
            <div className="space-y-1.5 rounded-2xl bg-ink/5 p-3 text-sm">
              <p>
                <b>{f.icon} {name || "No name yet"}</b> <span className="text-muted">· {f.title}</span>
              </p>
              <p className="text-muted">📍 {venue ? venue.name : "No place picked"}</p>
              <p className="text-muted">
                🕒 {startId === "now" ? "Starts now" : Number.isFinite(startAt) ? new Date(startAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Pick a time"} · {minutes < 60 ? `${minutes} min` : `${minutes / 60} hour${minutes > 60 ? "s" : ""}`}
              </p>
              <p className="text-muted">
                🎟️ {price ? `${cash(price)} a ticket` : "Free"} · up to {capacity.toLocaleString("en-GB")} people{cat === "party" ? ` · ${size.label}` : ""}
              </p>
              <p className="text-muted">
                {cat === "party"
                  ? `🎵 ${songs.length ? `${songs.length} song${songs.length > 1 ? "s" : ""} ready` : "No songs yet (add them inside)"}`
                  : mediaKind === "video" && youtubeId(videoLink)
                    ? "🎬 Video ready"
                    : `🖼️ ${slideFiles.length ? `${slideFiles.length} slide${slideFiles.length > 1 ? "s" : ""} ready` : "No slides yet (add them inside)"}`}
              </p>
            </div>
            <p className="mt-2 text-xs text-muted">Your friends and the people nearest to it are told as soon as it&apos;s on the map. You can host up to {HOSTS_A_DAY} events a day.</p>
            <div className="mt-3" />
            {cost ? (
              <div className="rounded-2xl bg-ink/5 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">Hosting this party costs</span>
                  <b className="font-display text-xl font-extrabold tabular-nums">{cash(cost.naira / perMint)}</b>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-[11px] font-semibold text-muted">
                  <span className="rounded-full bg-panel px-2 py-0.5">{cash(PARTY_NAIRA_PER_HOUR / perMint)} an hour × {cost.parts.hours % 1 ? cost.parts.hours.toFixed(1) : cost.parts.hours}</span>
                  <span className="rounded-full bg-panel px-2 py-0.5">{capacity.toLocaleString("en-GB")} people ×{cost.parts.capacity}</span>
                  {cost.parts.size !== 1 && <span className="rounded-full bg-panel px-2 py-0.5">{size.label} ×{cost.parts.size}</span>}
                  <span className="rounded-full bg-panel px-2 py-0.5">{VENUE_COST[venue!.kind].label} ×{cost.parts.venue}</span>
                  {cost.parts.area !== 1 && <span className="rounded-full bg-panel px-2 py-0.5">{cost.parts.area > 1 ? "Pricey area" : "Cheaper area"} ×{cost.parts.area}</span>}
                </div>
                <p className="mt-2 text-[11px] text-muted">A permit paid to the state, when you put it on the map (from your Fun money, then your wallet). Call it off before it starts, or fewer than 10 people come, and it all comes back.</p>
              </div>
            ) : (
              <p className="rounded-2xl bg-ink/5 p-3 text-sm text-muted">{cat === "party" ? "Pick where it is to see the price." : "Free to host."}</p>
            )}
            {clash && <p className="mt-3 rounded-2xl bg-hit/10 px-3 py-2 text-sm font-semibold text-hit">&ldquo;{clash.title}&rdquo; has that stretch of road then. Pick another road, one further along, or another time.</p>}
            {problem && <p className="mt-3 rounded-2xl bg-hit/10 px-3 py-2 text-sm font-semibold text-hit">{problem}</p>}
            <button
              disabled={!ready || short}
              onClick={async () => {
                if (!venue || !name || price === null) return;
                setGoing(true);
                setProblem(null);
                const at = startId === "now" ? Date.now() : startAt;
                const r = await hostEvent({ region, format: f.id, title: name, about, x: venue.x, z: venue.z, place: venue.name, onStreet: venue.street, venue: venue.kind, startsAt: at, minutes, price, capacity, radiusM: cat === "party" ? radiusM : PARTY_SIZE_DEFAULT }).catch(() => fail());
                if (!r.ok) {
                  setGoing(false);
                  return setProblem(r.error);
                }
                // What's on its stage, ready for when it starts: the songs (parties), or the slides or
                // video (talks).
                const ready = await loadStage(r.id).catch(() => null);
                setGoing(false);
                if (ready && r.view) r.view = { ...r.view, stage: ready };
                playSfx("levelup");
                onHosted(r.id, Date.parse(r.startsAt) - Date.now() < EARLY_DOORS_MINS * 60_000, r.view);
              }}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#d6336c] to-[#7048e8] font-bold text-white shadow-lg disabled:opacity-40"
            >
              {going ? <LoaderCircle className="size-5 animate-spin" /> : <PartyPopper className="size-5" />}
              {going ? (loadingStage ?? "Setting it up…") : `${startId === "now" ? "Start it now" : "Put it on the map"}${cost ? ` · ${cash(cost.naira / perMint)}` : ""}`}
            </button>
            {/* What they have to pay it with (Fun money and wallet together, as the server checks). */}
            {quote?.canSpend != null && (
              <p className={cn("mt-2 text-center text-sm", short ? "font-semibold text-hit" : "text-muted")}>
                Your balance: <b className={short ? "" : "text-ink"}>{cash(quote.canSpend)}</b>
                {short && cost ? `. You need ${cash(cost.naira / perMint - quote.canSpend)} more. Top up in your Wallet.` : ""}
              </p>
            )}
          </>
        )}
      </div>
      {stepId !== "review" && (
        <>
          <button
            disabled={!stepOk}
            onClick={() => setStepAt(k + 1)}
            className="mt-5 flex h-12 w-full items-center justify-center gap-1.5 rounded-full bg-ink font-bold text-white disabled:opacity-40"
          >
            {stepId === "music" && !songs.length ? "Skip for now" : stepId === "media" && !slideFiles.length && !youtubeId(videoLink) ? "Skip for now" : "Next"}
            <ChevronRight className="size-4" />
          </button>
          {!stepOk && stepHint && <p className="mt-2 text-center text-xs text-muted">{stepHint}</p>}
        </>
      )}
      <style>{`@keyframes stepIn { from { opacity: 0; transform: translateX(10px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  );
}

/** A slide picked for a talk, before it's uploaded. */
function SlideThumb({ file, n, onRemove }: { file: File; n: number; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    const t = setTimeout(() => setUrl(u), 0);
    return () => {
      clearTimeout(t);
      URL.revokeObjectURL(u);
    };
  }, [file]);
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-ink/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt={`Slide ${n}`} className="size-full object-cover" />}
      <span className="absolute bottom-0.5 left-1 text-[10px] font-bold text-white drop-shadow">{n}</span>
      <button onClick={onRemove} className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/60 text-white" aria-label={`Remove slide ${n}`}>
        <X className="size-3" />
      </button>
    </div>
  );
}

/**
 * Choosing where a party is on the map: the card is tucked away, a pin stands in the middle of the
 * screen with the party's area round it (as big as picked), and the road under it is named as you
 * move. Use this spot brings the card back with the roads round there.
 */
function MapPicker({
  radiusM,
  where,
  describe,
  onPreview,
  onDone,
}: {
  radiusM: number;
  where: () => { x: number; z: number } | null;
  describe: (x: number, z: number) => SpotWords;
  onPreview: (zone: PartyZone | null) => void;
  onDone: (use: boolean) => void;
}) {
  const [spot, setSpot] = useState<SpotWords | null>(null);
  useEffect(() => {
    let last = "";
    const look = () => {
      const at = where();
      if (!at) return;
      const x = Math.round(at.x);
      const z = Math.round(at.z);
      if (`${x},${z}` === last) return;
      last = `${x},${z}`;
      setSpot(describe(x, z));
      onPreview({ id: -1, x, z, r: radiusM / 100, colour: "#d6336c" });
    };
    look();
    const t = setInterval(look, 300);
    return () => clearInterval(t);
  }, [where, describe, onPreview, radiusM]);
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center" aria-hidden>
        <div className="-mt-10 flex flex-col items-center">
          <span className="text-4xl drop-shadow-[0_2px_4px_rgba(0,0,0,.4)]">📍</span>
          <span className="-mt-1 size-2 rounded-full bg-black/40" />
        </div>
      </div>
      <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm rounded-3xl bg-panel p-3 shadow-2xl ring-1 ring-black/5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Move the map to where it is</p>
          <p className="mt-1 truncate text-sm font-bold">
            {spot?.street ? `${spot.street.name}, ${spot.area}` : spot?.area || "Somewhere in the city"}
          </p>
          <p className="text-[11px] text-muted">The ring shows how far it reaches ({radiusM < 1000 ? `${radiusM} m` : `${radiusM / 1000} km`} round).</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={() => onDone(false)} className="h-11 rounded-full bg-ink/5 text-sm font-semibold">
              Back
            </button>
            <button onClick={() => onDone(true)} className="h-11 rounded-full bg-gradient-to-r from-[#d6336c] to-[#7048e8] text-sm font-bold text-white">
              Use this spot
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("flex h-9 items-center gap-1 rounded-full px-3 text-xs font-bold transition", on ? "bg-ink text-white shadow" : "bg-ink/5")}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- one event

function EventDetail({
  id,
  known,
  now,
  onClose,
  onGoIn,
  onFly,
  onPerson,
  onCancel,
  onChanged,
  onMessage,
}: {
  id: number;
  known: EventView | null;
  now: number;
  onClose: () => void;
  onGoIn: (e: EventView) => Promise<void>;
  onFly: (e: EventView) => void;
  onPerson: (id: string) => void;
  onCancel: (e: EventView) => void;
  onChanged: () => void;
  onMessage: (text: string, good: boolean) => void;
}) {
  const [e, setE] = useState<EventView | null>(known);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const get = useCallback(async () => {
    const v = await fetch(`/api/events?id=${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ view: EventView | null }>) : null))
      .then((d) => d?.view ?? null)
      .catch(() => null);
    if (v) setE(v);
    else setMissing(true);
  }, [id]);
  useEffect(() => {
    void get();
  }, [get]);

  if (!e)
    return (
      <Sheet onClose={onClose} title="Event">
        <p className="py-6 text-center text-sm text-muted">{missing ? "That event is gone." : "Loading…"}</p>
      </Sheet>
    );
  const f = eventFormat(e.format);
  const colour = colourOf(e);
  const starts = Date.parse(e.startsAt);
  const ends = Date.parse(e.endsAt);
  const over = e.status === "ended" || e.status === "cancelled";
  const canIn = !over && (e.me.host || doorsOpen(starts, ends, now));

  const rsvp = async (going: boolean) => {
    setBusy(true);
    const r = await rsvpEvent(e.id, going).catch(() => fail());
    setBusy(false);
    if (!r.ok) return onMessage(r.error, false);
    playSfx(going ? "chime" : "pop");
    if (going) onMessage("You're going! You'll be told when it starts.", true);
    await get();
    onChanged();
  };
  const share = async () => {
    const url = shareUrl(e);
    const text = `${e.title} (${f?.title ?? "event"}) on Newtown: ${whenText(starts, ends, Date.now())}${e.place ? ` at ${e.place}` : ""}.`;
    try {
      if (navigator.share) return await navigator.share({ title: e.title, text, url });
      await navigator.clipboard.writeText(`${text} ${url}`);
      onMessage("Link copied. Send it to your friends!", true);
    } catch {}
  };

  return (
    <Sheet onClose={onClose} title={f?.title ?? "Event"}>
      <div className="relative overflow-hidden rounded-3xl p-4 text-white" style={{ background: `linear-gradient(150deg, ${colour}, #1b1530)` }}>
        <span className="pointer-events-none absolute -right-2 -top-3 text-8xl opacity-25">{f?.icon}</span>
        <p className="text-xs font-bold uppercase tracking-wide text-white/80">
          {f?.icon} {f?.title ?? "Event"}
          {e.status === "live" && <span className="ml-2 rounded-full bg-hit px-1.5 py-0.5 text-[10px]">LIVE</span>}
          {e.status === "cancelled" && <span className="ml-2 rounded-full bg-black/40 px-1.5 py-0.5 text-[10px]">CALLED OFF</span>}
        </p>
        <p className="mt-1 font-display text-2xl font-extrabold leading-tight">{e.title}</p>
        <button onClick={() => !e.me.host && onPerson(e.host.id)} className="mt-2 flex items-center gap-2 text-sm">
          <AvatarFace avatar={cleanAvatar(e.host.avatar, e.host.name)} size={28} className="rounded-full ring-2 ring-white" />
          Hosted by <b>{e.me.host ? "you" : e.host.name}</b>
        </button>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <p className="flex items-center gap-2">
          <Clock className="size-4 shrink-0 text-muted" />
          <span>
            <b>{whenText(starts, ends, now)}</b>
            {e.status === "upcoming" && <span className="text-muted"> · {untilText(ends - starts)}</span>}
          </span>
        </p>
        <button onClick={() => onFly(e)} className="flex w-full items-center gap-2 text-left">
          <MapPin className="size-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate">
            <b>{e.place || "On the map"}</b>
            {e.onStreet && <span className="text-muted"> · on the street</span>}
          </span>
          <span className="flex items-center gap-1 text-xs font-bold text-[#1c7ed6]">
            <Navigation className="size-3.5" /> Show me
          </span>
        </button>
        <p className="flex items-center gap-2">
          <Ticket className="size-4 shrink-0 text-muted" />
          <b>{e.price > 0 ? `${cash(e.price)} ticket` : "Free"}</b>
          <span className="text-muted">· up to {e.capacity.toLocaleString("en-GB")} people</span>
        </p>
        {e.about && <p className="whitespace-pre-line rounded-2xl bg-ink/5 p-3">{e.about}</p>}
        <div className="flex items-center gap-2 pt-1">
          <div className="flex -space-x-2">
            {e.faces.slice(0, 6).map((p) => (
              <button key={p.id} onClick={() => p.id !== e.host.id && onPerson(p.id)}>
                <AvatarFace avatar={cleanAvatar(p.avatar, p.name)} size={30} className="rounded-full ring-2 ring-panel" />
              </button>
            ))}
          </div>
          <span className="text-xs text-muted">
            <b className="text-ink">{e.going}</b> going{e.status === "live" ? ` · ${e.came} came in` : ""}
          </span>
        </div>
      </div>

      {!over && (
        <div className="mt-4 space-y-2">
          {canIn && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onGoIn(e);
                setBusy(false);
              }}
              className="h-12 w-full rounded-full font-bold text-white shadow-lg disabled:opacity-50"
              style={{ background: `linear-gradient(90deg, ${colour}, #7048e8)` }}
            >
              {e.me.in || e.me.host ? (e.me.host && e.status === "upcoming" ? "Open the room (get ready)" : "Go back in") : e.price > 0 ? `Go in · ${cash(e.price)}` : "Go in"}
            </button>
          )}
          {!e.me.host && e.status === "upcoming" && (
            <button
              disabled={busy}
              onClick={() => void rsvp(!e.me.going)}
              className={cn("h-12 w-full rounded-full font-bold disabled:opacity-50", e.me.going ? "bg-[#12a37a]/15 text-[#0b7a5a]" : "bg-ink text-white")}
            >
              {e.me.going ? "✓ You're going (tap to change)" : "I'm going"}
            </button>
          )}
          {!e.me.host && e.status === "upcoming" && !canIn && <p className="text-center text-[11px] text-muted">The doors open {EARLY_DOORS_MINS} minutes before it starts. Those going are told.</p>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => void share()} className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-ink/5 text-sm font-semibold">
              <Share2 className="size-4" /> Invite friends
            </button>
            {e.me.host ? (
              <button onClick={() => onCancel(e)} className="h-11 rounded-full bg-hit/10 text-sm font-semibold text-hit">
                Call it off
              </button>
            ) : (
              <button onClick={() => onFly(e)} className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-ink/5 text-sm font-semibold">
                <MapPin className="size-4" /> On the map
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
