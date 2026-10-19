"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search, SlidersHorizontal } from "lucide-react";
import { X } from "@/components/icons";
import { cn } from "@/lib/cn";
import { EVENT_CATEGORIES, EVENT_FORMATS, eventCategory, eventFormat, untilText } from "@/lib/world/events";
import { cash } from "@/lib/world/value";
import type { EventView } from "../events/event-actions";
import { Sheet } from "../sheet";

// Lite's Events (docs/LITE.md): search first, then browse by kind. There will be many kinds of
// event, so they're a grid (growing down, never squeezed into one line) and a tick list in Filters,
// not a row of buttons. Going in, the event's page and hosting are the game's own (../events).

type When = "any" | "now" | "today" | "week";
type Price = "any" | "free" | "paid";
type Filters = { cats: string[]; when: When; price: Price };
const NONE: Filters = { cats: [], when: "any", price: "any" };
/** "games" isn't an event the database keeps: it's the game tables and challenges (the Play sheet). */
const GAMES = "games";

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const dayEnd = (now: number) => {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

function matches(e: EventView, q: string, f: Filters, now: number) {
  if (f.cats.length && !f.cats.includes(e.category)) return false;
  if (f.price === "free" && e.price > 0) return false;
  if (f.price === "paid" && e.price <= 0) return false;
  const starts = Date.parse(e.startsAt);
  if (f.when === "now" && e.status !== "live") return false;
  if (f.when === "today" && e.status !== "live" && starts > dayEnd(now)) return false;
  if (f.when === "week" && e.status !== "live" && starts > now + 7 * 24 * 3600_000) return false;
  if (!q) return true;
  const fmt = eventFormat(e.format);
  const hay = fold([e.title, e.about, e.place, e.host.name, fmt?.title ?? "", eventCategory(e.category)?.label ?? ""].join(" "));
  return fold(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function LiteEvents({
  list,
  gamesOn,
  now,
  where,
  onOpen,
  onGoIn,
  onHost,
  onGames,
}: {
  list: EventView[];
  /** Game tables and challenges near you right now. */
  gamesOn: number;
  now: number;
  /** Where you are (for "nearest first"). */
  where: () => { x: number; z: number } | null;
  onOpen: (id: number) => void;
  onGoIn: (id: number) => void;
  onHost: (kind: "party" | "stage" | "game") => void;
  onGames: () => void;
}) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filters>(NONE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [sort, setSort] = useState<"near" | "soon">("near");
  const searching = q.trim().length > 0 || filters !== NONE;
  const filterCount = filters.cats.length + (filters.when !== "any" ? 1 : 0) + (filters.price !== "any" ? 1 : 0);

  const at = where();
  const far = (e: EventView) => (at ? Math.hypot(e.x - at.x, e.z - at.z) : 0);
  const open = useMemo(() => list.filter((e) => e.status === "live" || e.status === "upcoming"), [list]);
  const results = open
    .filter((e) => matches(e, q.trim(), filters, now))
    .sort((a, b) => (a.status === "live" ? 0 : 1) - (b.status === "live" ? 0 : 1) || (sort === "near" ? far(a) - far(b) : Date.parse(a.startsAt) - Date.parse(b.startsAt)));
  const live = open.filter((e) => e.status === "live").sort((a, b) => far(a) - far(b));
  const soon = open.filter((e) => e.status === "upcoming").sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const countOf = (cat: string) => (cat === GAMES ? gamesOn : open.filter((e) => e.category === cat).length);
  // A word the search matches that's one of the kinds (owambe, rave, talk...): say so.
  const formatHit = q.trim() ? EVENT_FORMATS.find((f) => fold(f.title).includes(fold(q.trim()))) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-2.5 px-5 pb-4">
        <label className="flex h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-2xl bg-panel-2 px-4 text-muted focus-within:ring-2 focus-within:ring-ink/20">
          <Search className="size-5 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search parties, games, talks" aria-label="Search events" className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted" />
          {q && (
            <button onClick={() => setQ("")} className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full" aria-label="Clear the search">
              <X className="size-4" />
            </button>
          )}
        </label>
        <button onClick={() => setFiltersOpen(true)} className={cn("relative grid size-[52px] shrink-0 place-items-center rounded-2xl", filterCount ? "bg-ink text-white" : "bg-panel-2")} aria-label={filterCount ? `Filters (${filterCount} on)` : "Filters"}>
          <SlidersHorizontal className="size-5" />
          {filterCount > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#7048e8] text-[11px] font-bold text-white ring-2 ring-white">{filterCount}</span>}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
        {searching ? (
          <>
            <div className="flex items-center justify-between gap-2 pb-1">
              <p className="min-w-0 truncate text-sm text-muted">
                {[filters.cats.map((c) => eventCategory(c as never)?.label ?? c).join(", "), filters.when !== "any" ? { now: "On now", today: "Today", week: "This week" }[filters.when] : "", filters.price !== "any" ? (filters.price === "free" ? "Free" : "Paid") : ""]
                  .filter(Boolean)
                  .concat(`${results.length} found`)
                  .join(" · ")}
              </p>
              <button onClick={() => setSort(sort === "near" ? "soon" : "near")} className="h-10 shrink-0 rounded-xl px-3 text-sm font-bold text-[#5b3cc4]">
                {sort === "near" ? "Nearest first" : "Soonest first"}
              </button>
            </div>
            {formatHit && !filters.cats.length && <p className="pb-1 text-xs text-muted">Showing {formatHit.title.toLowerCase()}s and anything named like it.</p>}
            {results.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-base font-bold">Nothing like that on yet</p>
                <p className="mt-1 text-sm text-muted">Be the one who gets it started.</p>
                <button onClick={() => setHostOpen(true)} className="mt-4 h-12 rounded-2xl bg-ink px-6 text-sm font-extrabold text-white">
                  Host something
                </button>
              </div>
            ) : (
              <EventList list={results} now={now} onOpen={onOpen} onGoIn={onGoIn} />
            )}
            {filterCount > 0 && (
              <button onClick={() => setFilters(NONE)} className="mt-2 h-11 w-full rounded-2xl bg-panel-2 text-sm font-bold">
                Clear filters
              </button>
            )}
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between pb-2.5">
              <h2 className="text-[17px] font-extrabold">Browse</h2>
              <button onClick={() => setFiltersOpen(true)} className="text-sm font-bold text-[#5b3cc4]">
                All kinds
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {[...EVENT_CATEGORIES.filter((c) => c.ready), { id: GAMES, label: "Games", icon: "🃏", colour: "#2b8a3e", ready: true } as const, ...EVENT_CATEGORIES.filter((c) => !c.ready && c.id !== "games")].slice(0, 6).map((c) => {
                const n = countOf(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => (c.id === GAMES ? onGames() : c.ready ? setFilters({ ...NONE, cats: [c.id] }) : setFiltersOpen(true))}
                    className="flex h-16 min-w-0 items-center gap-3 rounded-2xl bg-[#f7f8fa] px-3 text-left"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl text-lg" style={{ background: `${c.colour}22` }} aria-hidden>
                      {c.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-extrabold">{shortLabel(c.label)}</span>
                      <span className="block truncate text-[13px] text-muted">{c.ready ? (n ? `${n} on` : "Nothing yet") : "Coming soon"}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <h2 className="pb-1 pt-6 text-[17px] font-extrabold">On now</h2>
            {live.length ? <EventList list={live.slice(0, 8)} now={now} onOpen={onOpen} onGoIn={onGoIn} /> : <p className="py-3 text-sm text-muted">Nothing on right now. Parties and talks show here the moment they start.</p>}
            {soon.length > 0 && (
              <>
                <h2 className="pb-1 pt-5 text-[17px] font-extrabold">Coming up</h2>
                <EventList list={soon.slice(0, 12)} now={now} onOpen={onOpen} onGoIn={onGoIn} />
              </>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 px-5 pb-4 pt-2">
        <button onClick={() => setHostOpen(true)} className="flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-ink text-base font-extrabold text-white">
          <Plus className="size-5" /> Host something
        </button>
      </div>

      {filtersOpen && <FiltersSheet value={filters} countOf={countOf} onClose={() => setFiltersOpen(false)} onApply={setFilters} onGames={onGames} />}
      {hostOpen && (
        <HostPicker
          onClose={() => setHostOpen(false)}
          onPick={(k) => {
            setHostOpen(false);
            onHost(k);
          }}
        />
      )}
    </div>
  );
}

const shortLabel = (l: string) => l.replace(" & screenings", "").replace(" & fitness", "").replace(" & community", "").replace(" & mixers", "").replace("Pop-up market", "Markets");

function EventList({ list, now, onOpen, onGoIn }: { list: EventView[]; now: number; onOpen: (id: number) => void; onGoIn: (id: number) => void }) {
  return (
    <ul>
      {list.map((e) => {
        const f = eventFormat(e.format);
        const isLive = e.status === "live";
        const starts = Date.parse(e.startsAt);
        const tile = isLive ? "LIVE" : starts - now < 24 * 3600_000 ? new Date(starts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : new Date(starts).toLocaleDateString([], { weekday: "short" });
        return (
          <li key={e.id} className="flex items-center gap-3.5 py-2.5">
            <button onClick={() => onOpen(e.id)} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
              <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `${eventCategory(e.category)?.colour ?? "#7048e8"}1f` }} aria-hidden>
                {f?.icon ?? "🎉"}
                <span className={cn("absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 text-[10px] font-extrabold", isLive ? "bg-hit text-white" : "bg-white text-ink ring-1 ring-line")}>{tile}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-extrabold">{e.title}</span>
                <span className="block truncate text-sm text-muted">
                  {[f?.title ?? "Event", e.place || null, e.price > 0 ? cash(e.price) : "Free", isLive ? `${e.came} in` : e.going ? `${e.going} going` : null, isLive ? `${untilText(Date.parse(e.endsAt) - now)} left` : null].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
            {isLive ? (
              <button onClick={() => onGoIn(e.id)} className="h-12 w-[5.5rem] shrink-0 rounded-2xl bg-[#7048e8] text-[15px] font-extrabold text-white">
                Go in
              </button>
            ) : (
              <button onClick={() => onOpen(e.id)} className="h-12 w-[5.5rem] shrink-0 rounded-2xl bg-panel-2 text-[15px] font-extrabold">
                {e.me.host ? "Yours" : e.me.going ? "Going ✓" : "See"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FiltersSheet({ value, countOf, onClose, onApply, onGames }: { value: Filters; countOf: (cat: string) => number; onClose: () => void; onApply: (f: Filters) => void; onGames: () => void }) {
  const [f, setF] = useState<Filters>(value);
  const toggle = (id: string) => setF((v) => ({ ...v, cats: v.cats.includes(id) ? v.cats.filter((c) => c !== id) : [...v.cats, id] }));
  const seg = <T extends string>(key: "when" | "price", options: [T, string][]) => (
    <div className="grid gap-1 rounded-2xl bg-panel-2 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([id, label]) => (
        <button key={id} onClick={() => setF((v) => ({ ...v, [key]: id }))} className={cn("h-11 rounded-xl text-sm font-extrabold", f[key] === id ? "bg-white text-ink shadow-sm" : "text-muted")}>
          {label}
        </button>
      ))}
    </div>
  );
  return (
    <Sheet onClose={onClose} title="Filters">
      <p className="pb-1 text-sm font-extrabold text-muted">What</p>
      <ul>
        {EVENT_CATEGORIES.filter((c) => c.id !== "games").map((c) => {
          const on = f.cats.includes(c.id);
          return (
            <li key={c.id}>
              <button disabled={!c.ready} onClick={() => toggle(c.id)} className="flex h-[52px] w-full items-center gap-3 text-left disabled:opacity-50" aria-pressed={on}>
                <span className="text-xl" aria-hidden>
                  {c.icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-base font-bold">{c.label}</span>
                <span className="text-sm text-muted">{c.ready ? countOf(c.id) : "Soon"}</span>
                <span className={cn("grid size-[26px] shrink-0 place-items-center rounded-lg", on ? "bg-[#7048e8] text-white" : "border-2 border-[#c5cdd6]")}>
                  {on && (
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button onClick={onGames} className="flex h-[52px] w-full items-center gap-3 text-left">
            <span className="text-xl" aria-hidden>
              🃏
            </span>
            <span className="min-w-0 flex-1 truncate text-base font-bold">Games: Whot!, chess, draughts…</span>
            <span className="text-sm text-muted">{countOf(GAMES)}</span>
            <ChevronRight className="size-5 text-muted" />
          </button>
        </li>
      </ul>
      <p className="pb-2 pt-4 text-sm font-extrabold text-muted">When</p>
      {seg<When>("when", [
        ["any", "Any time"],
        ["now", "Now"],
        ["today", "Today"],
        ["week", "This week"],
      ])}
      <p className="pb-2 pt-4 text-sm font-extrabold text-muted">Price</p>
      {seg<Price>("price", [
        ["any", "Any"],
        ["free", "Free"],
        ["paid", "Paid"],
      ])}
      <div className="mt-5 grid grid-cols-[1fr_2fr] gap-2.5">
        <button onClick={() => setF(NONE)} className="h-14 rounded-[18px] bg-panel-2 text-base font-extrabold">
          Clear
        </button>
        <button
          onClick={() => {
            onApply(f.cats.length || f.when !== "any" || f.price !== "any" ? f : NONE);
            onClose();
          }}
          className="h-14 rounded-[18px] bg-[#7048e8] text-base font-extrabold text-white"
        >
          Show results
        </button>
      </div>
    </Sheet>
  );
}

function HostPicker({ onClose, onPick }: { onClose: () => void; onPick: (k: "party" | "stage" | "game") => void }) {
  const kinds: { id: "party" | "game" | "stage"; title: string; line: string; icon: string; colour: string }[] = [
    { id: "party", title: "A party", line: "Owambe, house party, street party, rave", icon: "🎉", colour: "#d6336c" },
    { id: "game", title: "A game", line: "Whot!, chess, draughts, Truth or Dare", icon: "🃏", colour: "#2b8a3e" },
    { id: "stage", title: "A talk or screening", line: "Talk, class, watch party, open mic", icon: "🎤", colour: "#7048e8" },
  ];
  return (
    <Sheet onClose={onClose} title="What are you hosting?">
      <p className="-mt-1 pb-4 text-sm text-muted">People near you hear about it straight away.</p>
      <div className="space-y-3">
        {kinds.map((k) => (
          <button key={k.id} onClick={() => onPick(k.id)} className="flex w-full items-center gap-4 rounded-[22px] p-4 text-left ring-1 ring-line">
            <span className="grid size-[52px] shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `${k.colour}1f` }} aria-hidden>
              {k.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-extrabold">{k.title}</span>
              <span className="block text-sm text-muted">{k.line}</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted" />
          </button>
        ))}
      </div>
      <p className="pt-4 text-sm text-muted">Coming soon: sport, pop-up markets, meet-ups.</p>
    </Sheet>
  );
}
