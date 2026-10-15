// The passport (docs/PASSPORT.md): a stamp for every real place you go into on the map, its
// landmarks, named places and railway stations, gathered on area pages (Lagos Island, Ikoyi & VI,
// Lekki & Ajah...). Worked out from the map once per region, the same on the phone (to draw the
// passport) and on the server (to stamp it when you arrive), so nothing about the places is sent
// over the network: only which ones you've stamped.

import type { TileKind } from "../city/layout.ts";
import type { RegionMap } from "./compile.ts";
import { toTile } from "./geo.ts";

export type PassportPlace = {
  /** Stays the same for good: what a stamp is kept by. */
  id: string;
  name: string;
  /** "Museum", "Railway station"... */
  what: string;
  /** The stamp's look. */
  look: StampLook;
  /** Its area page. */
  area: string;
  /** Where to fly to on the map (its middle). */
  x: number;
  z: number;
};

export type StampLook = "culture" | "faith" | "sport" | "market" | "park" | "hotel" | "travel" | "study" | "night" | "landmark";

/** Each look: its colour and sign. */
export const STAMP_LOOKS: Record<StampLook, { color: string; sign: string }> = {
  culture: { color: "#7048e8", sign: "🏛️" },
  faith: { color: "#1c7ed6", sign: "⛪" },
  sport: { color: "#2b8a3e", sign: "🏟️" },
  market: { color: "#e8590c", sign: "🛍️" },
  park: { color: "#2f9e44", sign: "🌳" },
  hotel: { color: "#c2255c", sign: "🏨" },
  travel: { color: "#1971c2", sign: "🚉" },
  study: { color: "#5f3dc4", sign: "🎓" },
  night: { color: "#d6336c", sign: "🪩" },
  landmark: { color: "#b8860b", sign: "📍" },
};

const STRUCTURE: Record<string, [StampLook, string]> = {
  museum: ["culture", "Museum"],
  capitol: ["culture", "Government"],
  cathedral: ["faith", "Cathedral"],
  grandmosque: ["faith", "Mosque"],
  arena: ["sport", "Stadium"],
  court: ["sport", "Court"],
  boxing: ["sport", "Boxing arena"],
  wrestling: ["sport", "Wrestling arena"],
  gym: ["sport", "Gym"],
  market: ["market", "Market"],
  megamall: ["market", "Shopping mall"],
  mall: ["market", "Mall"],
  bigpark: ["park", "Park"],
  waterpark: ["park", "Water park"],
  funfair: ["park", "Funfair"],
  hotel: ["hotel", "Hotel"],
  spa: ["hotel", "Spa"],
  intlairport: ["travel", "Airport"],
  airport: ["travel", "Airport"],
  port: ["travel", "Port"],
  campus: ["study", "University"],
  medcentre: ["study", "Teaching hospital"],
};
const SPOT: Partial<Record<TileKind, [StampLook, string]>> = {
  worship: ["faith", "Place of worship"],
  monument: ["culture", "Monument"],
  club: ["night", "Club"],
  hospital: ["study", "Hospital"],
  stadium: ["sport", "Stadium"],
  plaza: ["park", "Square"],
  park: ["park", "Park"],
  restaurant: ["hotel", "Restaurant"],
};

/**
 * Area pages, by district (src/lib/world/regions/<id>/districts.ts): a place goes on the page of
 * the district it's nearest. A district not listed has a page of its own.
 */
const PAGES: Record<string, Record<string, string>> = {
  lagos: {
    "lagos-island": "Lagos Island",
    ikoyi: "Ikoyi & VI",
    "banana-island": "Ikoyi & VI",
    "victoria-island": "Ikoyi & VI",
    "eko-atlantic": "Ikoyi & VI",
    "lekki-phase-1": "Lekki & Ajah",
    "lekki-ajah": "Lekki & Ajah",
    sangotedo: "Lekki & Ajah",
    awoyaya: "Lekki & Ajah",
    yaba: "The Mainland",
    surulere: "The Mainland",
    "ebute-metta": "The Mainland",
    mushin: "The Mainland",
    apapa: "The Mainland",
    ajegunle: "The Mainland",
    gbagada: "The Mainland",
    ikeja: "Ikeja & the North",
    maryland: "Ikeja & the North",
    oshodi: "Ikeja & the North",
    agege: "Ikeja & the North",
    "abule-egba": "Ikeja & the North",
    ojodu: "Ikeja & the North",
    festac: "Badagry & the West",
    ojo: "Badagry & the West",
    badagry: "Badagry & the West",
    seme: "Badagry & the West",
    "ibeju-lekki": "Ibeju-Lekki & Epe",
    "lekki-free-zone": "Ibeju-Lekki & Epe",
    epe: "Ibeju-Lekki & Epe",
    ikorodu: "Ikeja & the North",
  },
};

export type Passport = {
  places: PassportPlace[];
  /** The area pages in order (the city's middle first), with their places. */
  areas: { name: string; ids: string[] }[];
  byId: Map<string, PassportPlace>;
  /** The place a tile belongs to (anywhere on a landmark's ground), if any. */
  at: (x: number, z: number) => PassportPlace | undefined;
};

const made = new WeakMap<RegionMap, Passport>();

/** A region's passport: its places and pages (worked out once). */
export function passportOf(map: RegionMap): Passport {
  const done = made.get(map);
  if (done) return done;
  const districts = map.region.districts.map((d) => ({ id: d.id, name: d.name, ...toTile(map.frame, d.at) }));
  const pages = PAGES[map.region.id] ?? {};
  const pageAt = (x: number, z: number) => {
    let best = districts[0];
    let bestD = Infinity;
    for (const d of districts) {
      const dd = (d.x - x) ** 2 + (d.z - z) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return best ? (pages[best.id] ?? best.name) : map.region.name;
  };
  const places: PassportPlace[] = [];
  const tiles = new Map<string, PassportPlace>();
  const add = (p: Omit<PassportPlace, "area">, cover: [number, number][]) => {
    const place = { ...p, area: pageAt(p.x, p.z) };
    places.push(place);
    for (const [x, z] of cover) if (!tiles.has(`${x},${z}`)) tiles.set(`${x},${z}`, place);
  };
  for (const l of map.landmarks) {
    const [look, what] = STRUCTURE[l.type] ?? ["landmark", "Landmark"];
    const cover: [number, number][] = [];
    for (let dz = 0; dz < l.d; dz++) for (let dx = 0; dx < l.w; dx++) cover.push([l.ax + dx, l.az + dz]);
    add({ id: `lm:${l.id}`, name: l.name, what, look, x: l.ax + (l.w - 1) / 2, z: l.az + (l.d - 1) / 2 }, cover);
  }
  for (const s of map.spotList) {
    const [look, what] = SPOT[s.kind] ?? ["landmark", "Place"];
    add({ id: `sp:${s.id}`, name: s.name, what, look, x: s.x, z: s.z }, [[s.x, s.z]]);
  }
  for (const s of map.stations) {
    const x = Math.round(s.x);
    const z = Math.round(s.z);
    const cover: [number, number][] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) cover.push([x + dx, z + dz]);
    const name = /station$/i.test(s.name) ? s.name : `${s.name} station`;
    add({ id: `st:${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name, what: "Railway station", look: "travel", x: s.x, z: s.z }, cover);
  }
  // Pages: the one with the most places first (the city's middle), then by size, then name.
  const byPage = new Map<string, string[]>();
  for (const p of places) byPage.set(p.area, [...(byPage.get(p.area) ?? []), p.id]);
  const order = Object.values(pages);
  const areas = [...byPage.entries()]
    .map(([name, ids]) => ({ name, ids }))
    .sort((a, b) => (order.indexOf(a.name) + 1 || 999) - (order.indexOf(b.name) + 1 || 999) || b.ids.length - a.ids.length || a.name.localeCompare(b.name));
  const passport: Passport = { places, areas, byId: new Map(places.map((p) => [p.id, p])), at: (x, z) => tiles.get(`${Math.round(x)},${Math.round(z)}`) };
  made.set(map, passport);
  return passport;
}

/** A new stamp pays this (mint): a bit more for the big landmarks. */
export const STAMP_REWARD = { landmark: 10, other: 4 };
/** Every place on an area page stamped: this bonus (mint). */
export const AREA_REWARD = 200;
