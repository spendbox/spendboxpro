// Explore on a real map: the places worth going to, in groups (nightlife, parks, shopping, culture,
// sport, travel, food and hotels), the nearest to where you're looking first. The city's big
// landmarks and named places come from the map; the everyday ones (a club, a restaurant, a park
// round the corner) from the streets near you. Shared by the Explore sheet; no database.

import type { StructureType, Tile, TileKind } from "../city/layout.ts";
import type { RegionMap } from "./compile.ts";

export type ExploreGroup = "nightlife" | "parks" | "shopping" | "culture" | "sport" | "travel" | "food";
export type ExplorePlace = { id: string; name: string; what: string; group: ExploreGroup; x: number; z: number; dist: number };

export const GROUPS: { id: ExploreGroup; label: string; blurb: string }[] = [
  { id: "nightlife", label: "Clubs & nightlife", blurb: "Dance, DJs, a drink and the people out tonight." },
  { id: "parks", label: "Parks & outdoors", blurb: "Green spaces, squares and playgrounds. Chat in the open air." },
  { id: "shopping", label: "Shopping & markets", blurb: "Malls and the big markets." },
  { id: "food", label: "Food & hotels", blurb: "Restaurants, hotels and a spa." },
  { id: "culture", label: "Culture & faith", blurb: "Museums, cathedrals, mosques and the halls of power." },
  { id: "sport", label: "Sport", blurb: "Stadiums, courts and arenas: watch a match." },
  { id: "travel", label: "Travel", blurb: "The airport, the ports and the railway stations." },
];

const STRUCTURE_GROUP: Partial<Record<StructureType, ExploreGroup>> = {
  bigpark: "parks", waterpark: "parks", funfair: "parks",
  megamall: "shopping", mall: "shopping", market: "shopping",
  museum: "culture", cathedral: "culture", grandmosque: "culture", capitol: "culture", campus: "culture",
  arena: "sport", court: "sport", boxing: "sport", wrestling: "sport", gym: "sport",
  intlairport: "travel", airport: "travel", port: "travel",
  hotel: "food", spa: "food",
};
const STRUCTURE_WHAT: Partial<Record<StructureType, string>> = {
  bigpark: "Park", waterpark: "Water park", funfair: "Funfair", megamall: "Shopping mall", mall: "Mall", market: "Market", museum: "Museum",
  cathedral: "Cathedral", grandmosque: "Mosque", capitol: "Government", campus: "University", arena: "Stadium", court: "Basketball court",
  boxing: "Boxing arena", wrestling: "Wrestling arena", gym: "Gym", intlairport: "International airport", airport: "Airport", port: "Port", hotel: "Hotel", spa: "Spa",
};
const TILE_GROUP: Partial<Record<TileKind, ExploreGroup>> = {
  club: "nightlife", park: "parks", plaza: "parks", playground: "parks", pitch: "sport", monument: "culture", worship: "culture",
  restaurant: "food", stadium: "sport",
};
const TILE_WHAT: Partial<Record<TileKind, string>> = {
  club: "Club", park: "Park", plaza: "Square", playground: "Playground", pitch: "Football pitch", monument: "Monument", worship: "Place of worship",
  restaurant: "Restaurant", stadium: "Stadium",
};

/** How far round the camera the everyday places are looked for (tiles). */
const NEAR = 24;

/**
 * The places to explore, nearest to (x, z) first, at most `per` in each group. tileOf gives the
 * city's tile at a spot (the plan's tileAt), for the everyday places near you.
 */
export function explorePlaces(map: RegionMap, tileOf: (x: number, z: number) => Tile, x: number, z: number, per = 14): ExplorePlace[] {
  const id = map.region.id;
  const seen = new Set<string>();
  const out: ExplorePlace[] = [];
  const add = (p: Omit<ExplorePlace, "dist">) => {
    if (seen.has(p.id) || seen.has(`${p.name}|${p.group}`)) return;
    seen.add(p.id);
    seen.add(`${p.name}|${p.group}`);
    out.push({ ...p, dist: Math.hypot(p.x - x, p.z - z) });
  };
  // The big landmarks, all over the city.
  for (const l of map.landmarks) {
    const group = STRUCTURE_GROUP[l.type];
    if (group) add({ id: `${id}:${l.ax},${l.az}`, name: l.name, what: STRUCTURE_WHAT[l.type] ?? "Landmark", group, x: l.ax + (l.w - 1) / 2, z: l.az + (l.d - 1) / 2 });
  }
  // Named single-tile places from the map (a famous club...).
  for (const sp of map.spotList) {
    const group = TILE_GROUP[sp.kind];
    if (group) add({ id: `${id}:${sp.x},${sp.z}`, name: sp.name, what: TILE_WHAT[sp.kind] ?? "Place", group, x: sp.x, z: sp.z });
  }
  // Railway stations.
  for (const s of map.stations) add({ id: `${id}:${Math.round(s.x)},${Math.round(s.z)}`, name: /station$/i.test(s.name) ? s.name : `${s.name} station`, what: "Railway station", group: "travel", x: s.x, z: s.z });
  // The everyday places round where you're looking.
  const cx = Math.round(x);
  const cz = Math.round(z);
  for (let dz = -NEAR; dz <= NEAR; dz++)
    for (let dx = -NEAR; dx <= NEAR; dx++) {
      if (dx * dx + dz * dz > NEAR * NEAR) continue;
      const tx = cx + dx;
      const tz = cz + dz;
      if (!map.inside(tx, tz) || map.waterAt(tx, tz)) continue;
      const t = tileOf(tx, tz);
      if (t.kind === "structure" && t.structure) {
        const s = t.structure;
        const group = STRUCTURE_GROUP[s.type];
        if (group) add({ id: `${id}:${s.ax},${s.az}`, name: s.name, what: STRUCTURE_WHAT[s.type] ?? "Landmark", group, x: s.ax + ((s.w ?? 1) - 1) / 2, z: s.az + ((s.d ?? 1) - 1) / 2 });
        continue;
      }
      const group = TILE_GROUP[t.kind];
      if (!group) continue;
      const what = TILE_WHAT[t.kind] ?? "Place";
      add({ id: `${id}:${tx},${tz}`, name: t.name ?? `${what}, ${map.areaAt(tx, tz)}`, what, group, x: tx, z: tz });
    }
  out.sort((a, b) => a.dist - b.dist);
  const count = new Map<ExploreGroup, number>();
  return out.filter((p) => {
    const n = count.get(p.group) ?? 0;
    count.set(p.group, n + 1);
    return n < per;
  });
}
