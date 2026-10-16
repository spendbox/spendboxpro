"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, House, Landmark, MapPin, Route, Search, Store, TrainFront, X } from "@/components/icons";
import type { MapBusiness } from "@/lib/world/business";
import type { RegionMap } from "@/lib/world/compile";
import { toTile } from "@/lib/world/geo";
import { HOME_KIND_LABEL, type AreaHomes } from "@/lib/world/homes";
import { landmarkPriceMint } from "@/lib/world/landmark-price";
import { cash } from "@/lib/world/value";
import { ownedSpot, type OwnedProperty } from "@/lib/world/owned";
import type { AssetUnit } from "@/lib/world/property-api";
import type { Tile } from "@/lib/city/layout";
import { QUICK_KINDS, distanceWords, findPlaces, kindsFor, wordMatches } from "@/lib/world/place-kinds";

export type SearchHit = {
  label: string;
  note: string;
  x: number;
  z: number;
  kind: "area" | "landmark" | "station" | "mine" | "named" | "business" | "road" | "home" | "place";
  /** What it costs to buy (mint), when it's for sale. */
  price?: number;
  /** A place found by its kind ("club"): the kind's emoji. */
  emoji?: string;
};

const ICON = { area: MapPin, landmark: Landmark, station: TrainFront, mine: House, named: Building2, business: Store, road: Route, home: House, place: MapPin };

/** Where you're looking, and the city's tile at any spot (for places found by their kind). */
export type SearchNear = () => { x: number; z: number; tileOf: (x: number, z: number) => Tile } | null;

/** The budget steps (naira): what a player can say they want to spend. */
const BUDGETS = [5e6, 20e6, 50e6, 250e6, 1e9];
type Budget = "afford" | number | null;

/**
 * Everything on a real map you can search for: your own property, the names players have given
 * buildings, businesses, areas, districts, landmarks, famous places, stations and main roads.
 */
export function searchable(region: RegionMap, mine: AssetUnit[], owned: OwnedProperty[] = [], businesses: MapBusiness[] = []): SearchHit[] {
  const at = (lat: number, lon: number) => toTile(region.frame, { lat, lon });
  const out: SearchHit[] = [];
  for (const u of mine) {
    const s = ownedSpot(u.building);
    if (s) out.push({ label: u.name ?? u.label, note: "Yours", x: s.x, z: s.z, kind: "mine" });
  }
  // Names players chose: a building's new name is found by it, as well as by what it was.
  for (const o of owned) {
    const s = ownedSpot(o.id);
    if (s && o.name) out.push({ label: o.name, note: "Named building", x: s.x, z: s.z, kind: "named" });
  }
  for (const b of businesses) {
    const s = ownedSpot(b.building);
    if (s && b.name) out.push({ label: b.name, note: b.category || "Business", x: s.x, z: s.z, kind: "business" });
  }
  for (const d of region.region.districts) out.push({ label: d.name, note: "District", ...at(d.at.lat, d.at.lon), kind: "area" });
  for (const a of region.region.areas) out.push({ label: a.name, note: a.kind === "town" ? "Town" : "Neighbourhood", ...at(a.at[0], a.at[1]), kind: "area" });
  for (const c of region.region.corrections) if (c.kind === "area") out.push({ label: c.area.name, note: "Neighbourhood", ...at(c.area.at[0], c.area.at[1]), kind: "area" });
  const perMint = region.region.prices.perMint;
  for (const l of region.landmarks) {
    const price = landmarkPriceMint({ type: l.type, w: l.w, d: l.d, name: l.name }, perMint);
    out.push({ label: l.name, note: `Landmark · ${cash(price)}`, x: l.ax + (l.w - 1) / 2, z: l.az + (l.d - 1) / 2, kind: "landmark", price });
  }
  for (const sp of region.spotList) {
    const price = landmarkPriceMint({ type: String(sp.kind), name: sp.name }, perMint);
    out.push({ label: sp.name, note: `Place · ${cash(price)}`, x: sp.x, z: sp.z, kind: "landmark", price });
  }
  for (const s of region.stations) out.push({ label: /station$/i.test(s.name) ? s.name : `${s.name} station`, note: "Railway station", x: s.x, z: s.z, kind: "station" });
  // Main roads, once each (at the middle of the first stretch with that name).
  const roads = new Set<string>();
  for (const r of region.region.roads ?? []) {
    if (!r.name || roads.has(r.name) || !r.path.length) continue;
    roads.add(r.name);
    const mid = r.path[Math.floor(r.path.length / 2)];
    out.push({ label: r.name, note: r.bridge ? "Bridge" : "Road", ...at(mid[0], mid[1]), kind: "road" });
  }
  return out;
}

/** Lower case, no accents or punctuation, single spaces: "St. Mary's" and "st marys" match. */
const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’.,()&-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** The search box on a real map: type a place, pick it, and the camera flies there. */
export function MapSearch({
  region,
  mine,
  owned,
  businesses,
  coins,
  homes,
  onPick,
  compact,
  onOpenChange,
  near,
}: {
  region: RegionMap;
  mine: AssetUnit[];
  /** Buildings players own (with the names they gave them). */
  owned?: OwnedProperty[];
  businesses?: MapBusiness[];
  /** Your cash (mint): "I can afford" in the budget filter. */
  coins?: number;
  /** The homes for sale, area by area (worked out when first needed). */
  homes?: () => AreaHomes[];
  onPick: (hit: SearchHit) => void;
  compact?: boolean;
  /** Compact: tells when the box opens and closes (the life buttons make way on phones). */
  onOpenChange?: (open: boolean) => void;
  /** Where you're looking: "club", "church", "airport"... finds the nearest ones. */
  near?: SearchNear;
}) {
  const [q, setQ] = useState("");
  // In a card (not the compact button): the kinds of place show straight away.
  const [open, setOpen] = useState(!compact);
  // Compact: a round search button that opens into the box (on a computer, always the box).
  const [shown, setShownState] = useState(false);
  const setShown = (v: boolean) => {
    setShownState(v);
    onOpenChange?.(v);
  };
  const all = useMemo(() => searchable(region, mine, owned, businesses).map((h) => ({ ...h, key: fold(h.label) })), [region, mine, owned, businesses]);
  // Names players gave their homes and buildings anywhere on the map: asked of the server as you type.
  const [named, setNamed] = useState<{ q: string; hits: SearchHit[] }>({ q: "", hits: [] });
  const typed = q.trim();
  useEffect(() => {
    if (typed.length < 2) return;
    let alive = true;
    // Typing on: the last question is dropped (on a slow network only the newest one matters).
    const stop = new AbortController();
    const t = setTimeout(() => {
      void fetch(`/api/places?region=${encodeURIComponent(region.region.id)}&q=${encodeURIComponent(typed)}`, { signal: stop.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ places?: { label: string; note: string; building: string }[] }>) : { places: [] }))
        .then(({ places: list = [] }) => {
          if (!alive) return;
          const hits: SearchHit[] = [];
          for (const p of list) {
            const s = ownedSpot(p.building);
            if (s) hits.push({ label: p.label, note: p.note, x: s.x, z: s.z, kind: p.note === "Home" ? "mine" : "named" });
          }
          setNamed({ q: typed, hits });
        })
        .catch(() => {});
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
      stop.abort();
    };
  }, [typed, region]);
  // The budget filter: pick one and the list is what you could buy for that, cheapest first.
  const [budget, setBudget] = useState<Budget>(null);
  const perMint = region.region.prices.perMint;
  const cap = budget === "afford" ? (coins ?? 0) : budget === null ? null : budget / perMint;
  const budgetHits = useMemo(() => {
    if (cap === null) return null;
    const t = fold(q);
    const words = t ? t.split(" ") : [];
    const match = (label: string) => !words.length || words.every((w) => fold(label).includes(w));
    const list: SearchHit[] = [];
    for (const a of homes?.() ?? []) {
      if (!match(a.area)) continue;
      for (const h of a.homes) if (h.mint <= cap) list.push({ label: a.area, note: `${HOME_KIND_LABEL[h.kind]} · ${cash(h.mint)}`, x: h.x, z: h.z, kind: "home", price: h.mint });
    }
    for (const h of all) if (h.kind === "landmark" && h.price !== undefined && h.price <= cap && match(h.label)) list.push(h);
    return list.sort((x, y) => (x.price ?? 0) - (y.price ?? 0));
  }, [cap, q, homes, all]);
  // A kind of place typed ("clubs", "church near me", "petrol"): the nearest ones, with how far.
  const kinds = useMemo(() => kindsFor(q), [q]);
  const placeHits = useMemo(() => {
    if (!kinds.length) return [];
    const at = near?.();
    if (!at) return [];
    const emoji = new Map(kinds.map((k) => [k.id, k.icon]));
    return findPlaces(region, at.tileOf, kinds, at.x, at.z, 10).map(
      (p): SearchHit => ({ label: p.name, note: `${p.what} · ${distanceWords(p.dist)}`, x: p.x, z: p.z, kind: "place", emoji: emoji.get(p.kind) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinds, region]);
  const hits = useMemo(() => {
    const t = fold(q);
    if (!t) return [];
    const words = t.split(" ");
    let local = all.filter((h) => words.every((w) => h.key.includes(w)));
    // Nothing spelt like that: allow a slip in each word ("Ikoyi" typed "Ikyoi").
    if (!local.length) local = all.filter((h) => words.every((w) => h.key.split(" ").some((kw) => wordMatches(w, kw))));
    // Whole name first, then names starting with it, then words starting with it, then the rest.
    const rank = (h: { key: string }) => (h.key === t ? 0 : h.key.startsWith(t) ? 1 : ` ${h.key}`.includes(` ${t}`) ? 2 : 3);
    local.sort((a, b) => rank(a) - rank(b) || a.label.length - b.label.length);
    const server = named.q && fold(named.q) === t ? named.hits : [];
    const seen = new Set<string>();
    return [...placeHits, ...local.slice(0, 4), ...server, ...local.slice(4)]
      .filter((h) => {
        const k = `${fold(h.label)}|${Math.round(h.x)},${Math.round(h.z)}`;
        return !seen.has(k) && seen.add(k);
      })
      .slice(0, placeHits.length ? 16 : 10);
  }, [all, q, named, placeHits]);
  const shownHits = budgetHits ? budgetHits.slice(0, 30) : hits;
  if (compact && !shown)
    return (
      <>
        <button onClick={() => setShown(true)} className="glass pointer-events-auto grid size-9 place-items-center rounded-full sm:hidden" aria-label="Search the map">
          <Search className="size-4" />
        </button>
        <div className="max-sm:hidden">{box()}</div>
      </>
    );
  return box();

  function box() {
    return (
      <div className={`pointer-events-auto relative ${compact ? "w-[min(18rem,calc(100vw-1.5rem))]" : "w-[min(20rem,calc(100vw-1.5rem))]"}`}>
        <label className="glass flex h-9 items-center gap-2 rounded-full px-3 text-sm">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            autoFocus={shown}
            onKeyDown={(e) => {
              if (e.key === "Enter" && shownHits[0]) {
                onPick(shownHits[0]);
                setOpen(false);
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder={`Search ${region.region.name}: club, church, a name…`}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
            aria-label="Search the map"
          />
          {(q || (compact && shown)) && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQ("");
                setOpen(false);
                if (compact) setShown(false);
              }}
              aria-label={compact && shown ? "Close search" : "Clear"}
            >
              <X className="size-4 text-muted" />
            </button>
          )}
        </label>
        {open && (
          <div className="absolute inset-x-0 top-11 z-20 overflow-hidden rounded-2xl bg-panel shadow-xl ring-1 ring-ink/10">
            {/* The budget: what you want to spend (a row you can swipe along). */}
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-ink/5 px-2.5 py-2 [scrollbar-width:none]" onMouseDown={(e) => e.preventDefault()}>
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">Budget</span>
              {([null, ...(coins !== undefined ? (["afford"] as const) : []), ...BUDGETS] as Budget[]).map((b) => (
                <button
                  key={String(b)}
                  onClick={() => setBudget(b === budget ? null : b)}
                  className={`h-7 shrink-0 rounded-full px-2.5 text-xs font-semibold ${b === budget ? "bg-ink text-white" : "bg-ink/5"}`}
                >
                  {b === null ? "Any" : b === "afford" ? `I can afford ${cash(coins ?? 0)}` : `Under ${cash(b / perMint)}`}
                </button>
              ))}
            </div>
            {budgetHits && (
              <p className="px-3 pt-2 text-[11px] text-muted">
                {budgetHits.length === 0
                  ? "Nothing for sale in that budget here. Try a bigger one."
                  : `${budgetHits.length > 30 ? "30 of " : ""}${budgetHits.length} places you could buy, cheapest first.`}
              </p>
            )}
            {/* Nothing typed yet: the kinds of place, one tap each. */}
            {!q.trim() && !budgetHits && (
              <div className="px-3 py-2.5">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Find the nearest</p>
                <div className="flex flex-wrap gap-1.5" onMouseDown={(e) => e.preventDefault()}>
                  {QUICK_KINDS.map((k) => (
                    <button key={k.id} onClick={() => setQ(k.plural)} className="flex h-8 items-center gap-1 rounded-full bg-ink/5 px-2.5 text-xs font-semibold">
                      <span aria-hidden>{k.icon}</span> {k.plural}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted">Or type any place, road, area or name.</p>
              </div>
            )}
            {!budgetHits && kinds.length > 0 && (
              <p className="px-3 pt-2 text-[11px] font-semibold text-muted">
                {placeHits.length ? `The nearest ${kinds[0].plural.toLowerCase()} to where you're looking` : `No ${kinds[0].plural.toLowerCase()} found nearby. Move the map and try again.`}
              </p>
            )}
            {!budgetHits && q.trim().length > 1 && shownHits.length === 0 && kinds.length === 0 && <p className="px-3 py-3 text-sm text-muted">Nothing called that here. Try a kind of place: club, church, court, airport…</p>}
          <ul className="max-h-[min(20rem,50dvh)] overflow-y-auto">
            {shownHits.map((h) => {
              const Icon = ICON[h.kind];
              return (
                <li key={`${h.label}|${h.note}|${h.x},${h.z}|${h.price ?? ""}`}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onPick(h);
                      setQ(h.label);
                      setOpen(false);
                      if (compact) setShown(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-ink/5"
                  >
                    {h.emoji ? <span className="w-4 shrink-0 text-center text-sm" aria-hidden>{h.emoji}</span> : <Icon className="size-4 shrink-0 text-muted" />}
                    <span className="min-w-0 flex-1 truncate">{h.label}</span>
                    <span className="shrink-0 text-xs text-muted">{h.note}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          </div>
        )}
      </div>
    );
  }
}
