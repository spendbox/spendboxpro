"use client";

import { rememberPreviews } from "./card-cache";

import { useEffect, useState } from "react";
import { MapPin, MessageCircle, Search, User, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { type FoundPerson, type Gender } from "../people-actions";

// Everyone on the map you could talk to (docs/PEOPLE.md): search anyone by name, the nearest to
// where you're looking first, online ones marked green. Tap Message to chat privately, the face
// for their card, the pin to fly to them. Used by the online button and by Messages → People.

/** How far away, in words: "here", "350 m", "4.2 km". (A tile is 100 m.) */
export function farIn(tiles: number | null) {
  if (tiles === null) return null;
  const m = tiles * 100;
  if (m < 60) return "right here";
  return m < 1000 ? `${Math.round(m / 10) * 10} m away` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km away`;
}

/** A small male / female sign (drawn here, so it looks the same on every phone). */
export function GenderMark({ gender, className }: { gender: Gender | null; className?: string }) {
  if (!gender) return null;
  const male = gender === "male";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold", male ? "text-[#1c7ed6]" : "text-[#d6336c]", className)} title={male ? "Male" : "Female"}>
      <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        {male ? (
          <>
            <circle cx="6.5" cy="9.5" r="4" />
            <path d="M9.5 6.5 14 2M10 2h4v4" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <circle cx="8" cy="6" r="4" />
            <path d="M8 10v5M5.5 12.5h5" strokeLinecap="round" />
          </>
        )}
      </svg>
      {male ? "Male" : "Female"}
    </span>
  );
}

/** The last list of people per map (for this visit), so the list opens at once. */
const lastList = new Map<string, FoundPerson[]>();

/** Everyone on the map near a spot (a plain request: it doesn't wait behind the game's other calls). */
async function peopleNear(region: string, x: number, z: number, q: string): Promise<FoundPerson[]> {
  const r = await fetch(`/api/people?region=${encodeURIComponent(region)}&x=${Math.round(x)}&z=${Math.round(z)}&q=${encodeURIComponent(q)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("people");
  const people = ((await r.json()) as { people: FoundPerson[] }).people;
  // Their cards open at once from here (./card-cache).
  rememberPreviews(people);
  return people;
}

/** Look everyone up ahead of time (the game opening), so the list is ready the first time too. */
export function prefetchPeople(region: string, x: number, z: number) {
  if (lastList.has(region)) return;
  void peopleNear(region, x, z, "")
    .then((l) => lastList.set(region, l))
    .catch(() => {});
}

export function PeopleList({
  region,
  centre,
  onMessage,
  onPerson,
  onFly,
  compact,
  onlineOnly,
}: {
  region: string;
  /** Where the map is looking (tiles): the nearest people to here come first. */
  centre: () => { x: number; z: number };
  onMessage: (p: { id: string; name: string }) => void;
  onPerson: (id: string) => void;
  onFly?: (x: number, z: number) => void;
  /** Inside the chat: a little tighter. */
  compact?: boolean;
  /** Only the people online right now (searching a name still finds anyone). */
  onlineOnly?: boolean;
}) {
  const [q, setQ] = useState("");
  // The last list (kept for the visit): shown at once when it opens again, then brought up to date.
  const [list, setList] = useState<FoundPerson[] | null>(() => lastList.get(region) ?? null);
  // Search as you type (a moment after the last key), nearest first.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(
      () => {
        const c = centre();
        void peopleNear(region, c.x, c.z, q)
          .then((l) => {
            if (!alive) return;
            if (!q) lastList.set(region, l);
            setList(l);
          })
          .catch(() => alive && setList((cur) => cur ?? []));
      },
      q ? 300 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // centre is read when searching; a new one each render must not search again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, q]);
  const online = list?.filter((p) => p.online).length ?? 0;
  const shown = onlineOnly && !q ? (list?.filter((p) => p.online) ?? null) : list;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("relative", compact ? "p-2" : "pb-2")}>
        <Search className={cn("absolute top-1/2 size-4 -translate-y-1/2 text-muted", compact ? "left-5" : "left-3")} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search anyone by name"
          className="h-10 w-full rounded-full border border-line bg-panel pl-9 pr-9 text-base outline-none focus:border-gold sm:text-sm"
        />
        {q && (
          <button onClick={() => setQ("")} className={cn("absolute top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-ink/10", compact ? "right-4" : "right-1.5")} aria-label="Clear">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {shown && shown.length > 0 && (
        <p className={cn("text-[11px] text-muted", compact ? "px-4 pb-1" : "pb-1")}>
          {q ? `${shown.length} found` : onlineOnly ? `${online} online now · nearest first` : `Nearest to where you're looking first · ${online} online`}
        </p>
      )}
      <ul className={cn("min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain", compact && "px-2 pb-2")}>
        {shown === null &&
          [0, 1, 2, 3].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-2xl bg-ink/5" />
          ))}
        {shown?.length === 0 && (
          <li className="p-6 text-center text-sm text-muted">{q ? `Nobody called "${q}".` : onlineOnly && list?.length ? "Nobody else is online right now. Search a name to message anyone." : "Nobody else lives here yet. Invite a friend!"}</li>
        )}
        {shown?.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-2xl px-1.5 py-1.5 hover:bg-ink/[0.03]">
            <button onClick={() => onPerson(p.id)} className="relative shrink-0" aria-label={`${p.name}'s card`}>
              <AvatarFace avatar={cleanAvatar(p.avatar, p.name)} size={40} className="rounded-full" />
              {p.online && <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-[#2f9e44] ring-2 ring-panel" aria-label="online" />}
            </button>
            <button onClick={() => onPerson(p.id)} className="min-w-0 flex-1 text-left">
              <span className="flex min-w-0 items-center gap-1.5">
                <b className="truncate text-sm">{p.name}</b>
                {p.friend && <span className="shrink-0 rounded-full bg-me/10 px-1.5 text-[10px] font-semibold text-me">Friend</span>}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                <GenderMark gender={p.gender} />
                {p.online ? <span className="font-semibold text-[#2f9e44]">Online</span> : <span>Offline</span>}
                {farIn(p.dist) && <span>{farIn(p.dist)}</span>}
              </span>
            </button>
            {onFly && p.x !== null && p.z !== null && (
              <button onClick={() => onFly(p.x!, p.z!)} className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-ink/5 px-2.5 text-xs font-semibold" aria-label={`Meet ${p.name} where they are`} title="Meet them (on foot, the fare there)">
                <MapPin className="size-3.5" /> Meet
              </button>
            )}
            <button onClick={() => onMessage({ id: p.id, name: p.name })} className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-ink px-3 text-xs font-semibold text-white">
              <MessageCircle className="size-3.5" /> Message
            </button>
          </li>
        ))}
      </ul>
      {!compact && shown && shown.length > 0 && (
        <p className="pt-2 text-center text-[11px] text-muted">
          <User className="mr-1 inline size-3 align-[-0.1em]" />
          Tap a face for their card: message them, give money, make friends.
        </p>
      )}
    </div>
  );
}
