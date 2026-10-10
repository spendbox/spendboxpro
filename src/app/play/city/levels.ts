// The places you can go inside a building: the ground floor, a few floors up (for taller
// buildings), and the roof when it's flat and safe. Parks, plazas, markets and the like are a
// single open-air spot. Pure maths from the tile: where each level is in the city (so the camera
// can fly there), how big it is, and which kind of room design it gets.
//
// Level ids: "g" ground floor / lobby, "f<n>" floor n (floor numbers count from the ground,
// roughly one every quarter of a city unit), "r" the roof (or a terrace / deck high up),
// "o" an open-air spot at street level (parks, plazas, markets, docks...).

import { structureCentre, venueName, type CityPlan, type Sport, type StructureType, type Tile } from "@/lib/city/layout";
import { RAIL_Y } from "./trains";

export type LevelKind = "interior" | "roof" | "outdoor";

/** The room style a player picked for their house, as a room design here. */
const HOME_ROOM: Record<string, { label: string; theme: Theme }> = {
  living: { label: "Living room", theme: "living" },
  lounge: { label: "Lounge", theme: "lounge" },
  studio: { label: "Studio", theme: "office" },
  party: { label: "Party room", theme: "club" },
  dining: { label: "Dining room", theme: "restaurant" },
};

export type Theme =
  // insides
  | "living"
  | "upstairs"
  | "lobby"
  | "office"
  | "lounge"
  | "suite"
  | "hotelLobby"
  | "reception"
  | "ward"
  | "police"
  | "detectives"
  | "shop"
  | "mall"
  | "foodcourt"
  | "gallery"
  | "rotunda"
  | "library"
  | "lecture"
  | "terminal"
  | "control"
  | "tower"
  | "concourse"
  | "skybridge"
  | "clockroom"
  | "club"
  | "restaurant"
  | "firehall"
  // the grand bank's hall and its vault, a gym, a spa, a cathedral's nave, a mosque's prayer hall
  | "bank"
  | "vault"
  | "gym"
  | "spa"
  | "church"
  | "mosque"
  // sports venues: the stands round a football pitch, an indoor basketball court, a boxing
  // ring and a wrestling ring (seats facing the action, a big screen)
  | "stands"
  | "court"
  | "boxing"
  | "wrestling"
  // roofs and decks high up
  | "roofGarden"
  | "roofTerrace"
  | "helipad"
  | "poolDeck"
  | "platform"
  | "damTop"
  | "rigDeck"
  // open air at street level
  | "park"
  | "plaza"
  | "woods"
  | "pond"
  | "ferris"
  | "market"
  | "funfair"
  | "quay"
  | "parade"
  | "solar"
  | "waterpark"
  | "courtside";

/** The sport at a venue level (its theme), or null for everything else. */
export const THEME_SPORT: Partial<Record<Theme, Sport>> = { stands: "football", court: "basketball", boxing: "boxing", wrestling: "wrestling" };

export type PlaceLevel = {
  id: string;
  label: string;
  capacity: number;
  kind: LevelKind;
  theme: Theme;
  /** Centre of the floor in the city (x, z) and the floor's height (y). */
  x: number;
  y: number;
  z: number;
  /** Half the footprint (city units), for keeping the camera inside; and how it's turned. */
  hw: number;
  hd: number;
  ry: number;
  /** Floor number (0 = ground), for lift signs. */
  floor: number;
  /** Roofs: hide the building's own bits on the roof (things starting at/above this height). */
  hide?: { above: number; rect?: [number, number, number, number]; maxH?: number };
};

/** One city unit is about this many metres (people are ~0.17 units tall). */
export const METRES = 10;
/** Height of one storey, in city units (for floor numbers). */
export const STOREY = 0.25;
/** Eye height above the floor, in city units. */
export const EYE = 0.16;

export const ROOM_LABEL: Partial<Record<Tile["kind"], string>> = {
  house: "House",
  office: "Office",
  tower: "Skyscraper",
  hospital: "Hospital",
  police: "Police station",
  fuel: "Fuel station",
  clock: "Clock tower",
  ferris: "Ferris wheel",
  stadium: "Stadium",
  park: "Park",
  plaza: "Plaza",
  trees: "Woods",
  pond: "Pond",
  fire: "Fire station",
  club: "Nightclub",
  restaurant: "Restaurant",
  school: "School",
  worship: "Place of worship",
  pitch: "Football pitch",
  playground: "Playground",
  monument: "Monument",
};
const OUTDOOR = new Set<Tile["kind"]>(["park", "plaza", "trees", "pond", "ferris", "pitch", "playground", "monument"]);

/** What a level is for, as the UI sees it (a club, a restaurant and a sports venue get their own icon). */
export function levelUse(l: PlaceLevel): "room" | "club" | "restaurant" | "roof" | "outdoor" | "arena" {
  if (THEME_SPORT[l.theme]) return "arena";
  if (l.theme === "club") return "club";
  if (l.theme === "restaurant" || l.theme === "foodcourt") return "restaurant";
  return l.kind === "interior" ? "room" : l.kind;
}

/** How many people fit in the whole place. */
export function capacityOf(t: Tile) {
  if (t.station) return 500;
  if (t.kind === "structure") return 500;
  if (t.kind === "house") return 10;
  if (t.kind === "office") return t.top < 1.9 ? 30 : 100;
  if (t.kind === "tower") return Math.max(100, Math.min(300, 100 + Math.round(((t.top - 2) / 6) * 20) * 10));
  if (t.kind === "hospital") return 100;
  if (t.kind === "police" || t.kind === "fuel" || t.kind === "fire") return 30;
  if (t.kind === "club") return 150;
  if (t.kind === "restaurant") return 60;
  if (t.kind === "clock" || t.kind === "stadium") return 500;
  if (OUTDOOR.has(t.kind)) return 50;
  return 50;
}

type Draft = Omit<PlaceLevel, "capacity"> & { weight?: number };

const floorId = (y: number, base: number) => Math.max(1, Math.round((y - base) / STOREY));

/** Share a place's capacity out over its levels (the ground floor gets a little more). */
function share(total: number, drafts: Draft[]): PlaceLevel[] {
  const weights = drafts.map((d) => d.weight ?? (d.id === "g" ? 1.3 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  return drafts.map((d, k) => {
    const { weight: _w, ...rest } = d;
    void _w;
    return { ...rest, capacity: Math.max(4, Math.round((total * weights[k]) / sum)) };
  });
}

/** Where the city centre is from (x, z), as a turn (the way big windows face first). */
const faceCentre = (x: number, z: number) => (Math.hypot(x, z) < 0.5 ? Math.PI * 0.25 : Math.atan2(-x, -z) + Math.PI);

/**
 * The levels of the place on tile t (the corner tile for big buildings, the middle tile for the
 * station). Empty for tiles that aren't places.
 */
export function levelsOf(t: Tile, plan: CityPlan): PlaceLevel[] {
  const total = capacityOf(t);
  const out: Draft[] = [];
  const R = (id: string, label: string, kind: LevelKind, theme: Theme, x: number, y: number, z: number, hw: number, hd: number, extra?: Partial<Draft>) =>
    out.push({ id, label, kind, theme, x, y, z, hw, hd, ry: 0, floor: id === "g" || id === "o" ? 0 : id === "r" ? 99 : Number(id.slice(1)), ...extra });
  const floorLabel = (n: number, what?: string) => (what ? `Floor ${n} · ${what}` : `Floor ${n}`);
  const { x, z, r } = t;

  if (t.station && plan.rail) {
    const alongZ = plan.rail.along === "z";
    const across = (c: number) => (alongZ ? { x: x + c, z } : { x, z: z + c });
    const tower = across(0.58);
    R("g", "Concourse", "interior", "concourse", tower.x, 0.06, tower.z, alongZ ? 0.1 : 0.18, alongZ ? 0.18 : 0.1);
    const plat = across(0.33);
    const platY = RAIL_Y - 0.1 - 0.02 + 0.13;
    R(`f${floorId(platY, 0.06)}`, "Platforms", "roof", "platform", plat.x, platY, plat.z, alongZ ? 0.06 : 0.45, alongZ ? 0.45 : 0.06, { ry: alongZ ? 0 : Math.PI / 2 });
    return share(total, out);
  }

  if (t.kind === "structure" && t.structure) {
    const drafts = structureLevels(t, t.structure.type, plan);
    // Famous places name their rooms ("Unilag Main Library", "Senate Building"...).
    t.structure.inside?.forEach((name, k) => {
      if (drafts[k] && name) drafts[k].label = name;
    });
    return share(total, drafts);
  }

  switch (t.kind) {
    case "house": {
      if (t.home) {
        // A player's house: the ground floor in the room style they picked, plus a roof
        // terrace (modern, villa) or an upstairs (duplex).
        const room = HOME_ROOM[t.home.interior] ?? HOME_ROOM.living;
        const style = t.home.style;
        if (style === "modern") {
          R("g", room.label, "interior", room.theme, x - 0.08, 0.08, z - 0.05, 0.25, 0.2);
          R("r", "Roof terrace", "roof", "roofTerrace", x - 0.05, 0.42, z - 0.05, 0.34, 0.275, { weight: 0.8 });
        } else if (style === "villa") {
          R("g", room.label, "interior", room.theme, x - 0.06, 0.08, z - 0.08, 0.32, 0.22);
          R("r", "Roof terrace", "roof", "roofTerrace", x - 0.14, 0.62, z - 0.12, 0.27, 0.22, { weight: 0.8 });
        } else if (style === "duplex") {
          R("g", room.label, "interior", room.theme, x - 0.06, 0.08, z - 0.04, 0.22, 0.2);
          R("f1", "Upstairs", "interior", "upstairs", x - 0.06, 0.38, z - 0.04, 0.22, 0.2, { weight: 0.8 });
        } else if (style === "bungalow") {
          R("g", room.label, "interior", room.theme, x, 0.08, z - 0.04, 0.34, 0.22);
        } else {
          R("g", room.label, "interior", room.theme, x, 0.08, z, 0.24, 0.21);
        }
        break;
      }
      const dx = (r[1] - 0.5) * 0.1;
      if (t.v === 1) {
        R("g", "Living room", "interior", "living", x + dx - 0.08, 0.08, z - 0.05, 0.25, 0.2);
        R("r", "Roof terrace", "roof", "roofTerrace", x + dx - 0.05, 0.42, z - 0.05, 0.34, 0.275, { weight: 0.8 });
      } else if (t.v === 2) {
        R("g", "Downstairs", "interior", "living", x + dx - 0.06, 0.08, z - 0.04, 0.22, 0.2);
        R("f1", "Upstairs", "interior", "upstairs", x + dx - 0.06, 0.38, z - 0.04, 0.22, 0.2, { weight: 0.8 });
      } else {
        R("g", "Living room", "interior", "living", x + dx, 0.08, z, (0.5 + r[2] * 0.12) / 2 - 0.03, (0.45 + r[3] * 0.12) / 2 - 0.03);
      }
      break;
    }
    case "office": {
      const h = t.top - 0.08;
      const cx = x;
      let cz = z;
      let hw = (0.7 + r[2] * 0.15) / 2;
      let hd = (0.6 + r[3] * 0.25) / 2;
      if (t.v === 1) {
        cz = z - 0.2;
        hw = 0.42;
        hd = 0.19;
      } else if (t.v === 2) {
        hw = 0.37;
        hd = 0.31;
      }
      const top = 0.08 + h;
      R("g", "Lobby", "interior", "lobby", cx, 0.08, cz, hw - 0.03, hd - 0.03);
      const n = Math.floor((h - 0.2) / STOREY);
      const mids = h > 2.2 ? [Math.round(n * 0.4), n] : h > 1.4 ? [Math.max(1, Math.round(n * 0.6))] : [];
      const fl = [...new Set(mids)].filter((f) => f >= 1 && 0.08 + f * STOREY + 0.2 < top);
      fl.forEach((f, k) => {
        // Now and then the top one of these is a restaurant or a club.
        const last = k === fl.length - 1;
        const use = last && r[3] < 0.18 ? "restaurant" : last && r[3] < 0.3 ? "club" : null;
        if (use) R(`f${f}`, floorLabel(f, venueName(plan, use, x, z)), "interior", use, cx, 0.08 + f * STOREY, cz, hw - 0.03, hd - 0.03);
        else R(`f${f}`, floorLabel(f), "interior", "office", cx, 0.08 + f * STOREY, cz, hw - 0.03, hd - 0.03);
      });
      R("r", t.v === 2 ? "Roof garden" : "Rooftop", "roof", "roofGarden", cx, top, cz, hw, hd, { hide: { above: top - 0.005 } });
      break;
    }
    case "tower": {
      const v = t.v ?? 0;
      const w = 0.62 + r[2] * 0.18 + (v === 4 ? 0.06 : 0);
      const h = v === 3 ? t.top - 1.6 : t.top - 0.4;
      const bodyTop = v === 3 ? 0.08 + h * 0.8 : v === 2 ? 0.08 + h - 0.03 : 0.08 + h;
      const hw = (v === 0 ? w * 0.78 : v === 2 ? w * 0.9 : v === 1 ? w * 0.7 : w) / 2;
      R("g", "Lobby", "interior", "lobby", x, 0.08, z, hw - 0.04, hw - 0.04);
      const usable = (v === 0 ? 0.08 + h * 0.72 : bodyTop) - 0.08;
      const n = Math.floor((usable - 0.2) / STOREY);
      const count = h > 4 ? 3 : h > 2.2 ? 2 : 1;
      const floors =
        count === 3 ? [Math.round(n * 0.3), Math.round(n * 0.62), n] : count === 2 ? [Math.round(n * 0.45), n] : [Math.max(1, Math.round(n * 0.6))];
      const uniq = [...new Set(floors)].filter((f) => f >= 1);
      uniq.forEach((f, k) => {
        const top = k === uniq.length - 1 && count >= 2;
        // A club part way up some towers (the middle floor of tall ones, the first of others).
        const club = !top && ((count === 3 && k === 1 && r[1] < 0.6) || (count === 2 && k === 0 && r[1] < 0.3));
        const sky = r[0] < 0.5 ? "lounge" : "restaurant";
        const theme: Theme = top ? sky : club ? "club" : "office";
        const label = top
          ? floorLabel(f, sky === "lounge" ? "Sky lounge" : `Sky restaurant · ${venueName(plan, "restaurant", x, z)}`)
          : club
            ? floorLabel(f, venueName(plan, "club", x, z))
            : floorLabel(f);
        // Twisting towers turn a little every floor.
        const ry = v === 2 ? Math.floor((0.08 + f * STOREY - 0.08) / (h / Math.max(4, Math.floor(h / 0.32)))) * 0.11 : 0;
        R(`f${f}`, label, "interior", theme, x, 0.08 + f * STOREY, z, hw * 0.7, hw * 0.7, { ry, weight: club ? 1.4 : 1 });
      });
      if (v === 0 || v === 2 || v === 4) {
        const floors2 = Math.max(4, Math.floor(h / 0.32));
        const roofRy = v === 2 ? (floors2 - 1) * 0.11 : 0;
        const roofW = v === 0 ? w * 0.78 : v === 2 ? w * 0.9 : w;
        R("r", v === 4 ? "Helipad" : "Rooftop", "roof", v === 4 ? "helipad" : "roofTerrace", x, bodyTop, z, roofW / 2, roofW / 2, {
          ry: roofRy,
          hide: { above: bodyTop - 0.005 },
        });
      }
      break;
    }
    case "hospital":
      R("g", "Reception", "interior", "reception", x, 0.08, z - 0.05, 0.37, 0.27);
      R("f3", floorLabel(3, "Ward"), "interior", "ward", x, 0.08 + 3 * STOREY, z - 0.05, 0.37, 0.27);
      R("r", "Helipad", "roof", "helipad", x, 1.33, z - 0.05, 0.41, 0.31, { hide: { above: 1.325 } });
      break;
    case "police":
      R("g", "Front desk", "interior", "police", x - 0.05, 0.08, z - 0.08, 0.32, 0.24);
      R("f1", floorLabel(1, "Detectives"), "interior", "detectives", x - 0.05, 0.08 + STOREY + 0.02, z - 0.08, 0.32, 0.24, { weight: 0.8 });
      break;
    case "fuel":
      R("g", "Shop", "interior", "shop", x - 0.22, 0.08, z - 0.36, 0.2, 0.09);
      break;
    case "fire":
      R("g", "Engine bay", "interior", "firehall", x - 0.04, 0.08, z - 0.08, 0.3, 0.24);
      R("f1", floorLabel(1, "Crew room"), "interior", "living", x - 0.04, 0.08 + STOREY + 0.06, z - 0.08, 0.3, 0.24, { weight: 0.6 });
      break;
    case "club":
      R("g", t.name ?? "Dance floor", "interior", "club", x, 0.08, z, 0.36, 0.3, { weight: 1.6 });
      if (t.v === 1) R("f1", floorLabel(1, "VIP lounge"), "interior", "lounge", x, 0.08 + STOREY + 0.05, z, 0.36, 0.3);
      break;
    case "restaurant":
      R("g", t.name ?? "Dining room", "interior", "restaurant", x, 0.08, z - 0.04, 0.33, 0.27);
      if (t.v === 1) R("r", "Roof terrace", "roof", "roofTerrace", x, 0.08 + 0.42, z - 0.04, 0.36, 0.3, { hide: { above: 0.495 }, weight: 0.7 });
      break;
    case "clock":
      R("g", "Entrance hall", "interior", "lobby", x, 0.18, z, 0.13, 0.13);
      R(`f${floorId(1.66, 0.18)}`, "Clock room", "interior", "clockroom", x, 1.66, z, 0.12, 0.12);
      break;
    case "stadium":
      R("g", "Concourse", "interior", "concourse", x + 0.435, 0.08, z, 0.02, 0.1);
      R("o", "Outside the stadium", "outdoor", "plaza", x - 0.0, 0.08, z + 0.46, 0.05, 0.05, { weight: 0.7 });
      break;
    case "ferris":
      R("o", "At the wheel", "outdoor", "ferris", x + 0.3, 0.08, z - 0.3, 0.1, 0.1);
      break;
    case "park":
      R("o", "In the park", "outdoor", "park", x, 0.08, z, 0.1, 0.1);
      break;
    case "plaza":
      R("o", "On the plaza", "outdoor", "plaza", x + 0.28, 0.1, z + 0.28, 0.08, 0.08);
      break;
    case "trees":
      R("o", "In the woods", "outdoor", "woods", x + 0.38, 0.08, z + 0.38, 0.05, 0.05);
      break;
    case "pond":
      R("o", "By the pond", "outdoor", "pond", x + 0.36, 0.08, z + 0.4, 0.06, 0.06);
      break;
    case "school":
      R("g", "Classroom", "interior", "lecture", x - 0.1, 0.08, z - 0.12, 0.28, 0.18);
      R("o", "School yard", "outdoor", "plaza", x + 0.3, 0.08, z + 0.3, 0.06, 0.06, { weight: 0.7 });
      break;
    case "worship":
      R("g", t.v === 1 ? "Church hall" : "Prayer hall", "interior", "gallery", x, 0.08, z - 0.05, 0.25, 0.25);
      break;
    case "pitch":
      R("o", "On the pitch", "outdoor", "park", x, 0.08, z, 0.1, 0.1);
      break;
    case "playground":
      R("o", "At the playground", "outdoor", "park", x + 0.2, 0.08, z + 0.2, 0.08, 0.08);
      break;
    case "monument":
      R("o", "By the monument", "outdoor", "plaza", x + 0.3, 0.08, z + 0.3, 0.08, 0.08);
      break;
  }
  return share(total, out);
}

function structureLevels(t: Tile, type: StructureType, plan: CityPlan): Draft[] {
  const out: Draft[] = [];
  const centre = t.structure ? structureCentre(t.structure) : { x: t.x + 0.5, z: t.z + 0.5 };
  const X = centre.x;
  const Z = centre.z;
  const big = (t.structure?.w ?? 2) >= 3;
  const R = (id: string, label: string, kind: LevelKind, theme: Theme, x: number, y: number, z: number, hw: number, hd: number, extra?: Partial<Draft>) =>
    out.push({ id, label, kind, theme, x, y, z, hw, hd, ry: 0, floor: id === "g" || id === "o" ? 0 : id === "r" ? 99 : Number(id.slice(1)), ...extra });
  switch (type) {
    case "mall":
      R("g", "Shops", "interior", "mall", X, 0.09, Z - 0.3, 0.8, 0.48);
      R("f1", "Floor 1 · Food court", "interior", "foodcourt", X, 0.09 + 0.3, Z - 0.3, 0.8, 0.48);
      break;
    case "twin": {
      const H = 6 + t.r[1] * 1.5;
      const n = Math.floor((H - 0.3) / STOREY);
      const bridgeY = 0.09 + H * 0.55;
      R("g", "Lobby", "interior", "lobby", X - 0.42, 0.09, Z, 0.26, 0.26);
      R(`f${Math.round(n * 0.25)}`, `Floor ${Math.round(n * 0.25)}`, "interior", "office", X - 0.42, 0.09 + Math.round(n * 0.25) * STOREY, Z, 0.26, 0.26);
      R(`f${Math.round((bridgeY - 0.09) / STOREY)}`, `Floor ${Math.round((bridgeY - 0.09) / STOREY)} · Sky bridge`, "interior", "skybridge", X, bridgeY, Z, 0.03, 0.08);
      R(`f${n}`, `Floor ${n} · Sky lounge`, "interior", "lounge", X + 0.42, 0.09 + n * STOREY, Z, 0.26, 0.26);
      break;
    }
    case "museum":
      R("g", "Main gallery", "interior", "gallery", X, 0.24, Z - 0.1, 0.6, 0.45);
      R("f3", "Rotunda", "interior", "rotunda", X, 0.89, Z - 0.1, 0.3, 0.3, { weight: 0.8 });
      break;
    case "funfair":
      R("o", "Funfair", "outdoor", "funfair", X - 0.25, 0.09, Z + 0.15, 0.1, 0.1);
      break;
    case "market":
      R("o", "Market stalls", "outdoor", "market", X - 0.3, 0.09, Z - 0.3, 0.05, 0.05);
      break;
    case "arena":
      // The stands round the pitch first (the reason to come), then the concourse.
      if (big) {
        R("g", "The stands", "interior", "stands", X, 0.13, Z, 1.5, 1.2, { weight: 2.6 });
        R("f1", "Concourse", "interior", "concourse", X + 1.7, 0.09, Z, 0.05, 0.3);
        R("f2", "Executive box", "interior", "lounge", X, 0.44, Z - 1.08, 0.3, 0.04, { weight: 0.6 });
      } else {
        R("g", "The stands", "interior", "stands", X, 0.09, Z, 0.9, 0.75, { weight: 2.2 });
        R("f1", "Concourse", "interior", "concourse", X + 0.88, 0.09, Z, 0.04, 0.2);
      }
      break;
    case "capitol":
      R("g", "Great hall", "interior", "gallery", X, 0.19, Z - 0.45, 0.6, 0.4);
      R("f3", "Rotunda", "interior", "rotunda", X, 0.84, Z - 0.45, 0.38, 0.38, { weight: 0.8 });
      R("o", "Capitol gardens", "outdoor", "park", X, 0.09, Z + 0.7, 0.1, 0.1, { weight: 0.8 });
      break;
    case "megamall":
      R("g", "Shopping street", "interior", "mall", X, 0.09, Z - 0.35, 1.2, 0.2, { weight: 1.4 });
      R("f1", "Floor 1 · Food court", "interior", "foodcourt", X, 0.34, Z - 0.87, 1.2, 0.28);
      R("f2", `Floor 2 · ${venueName(plan, "club", t.x, t.z)}`, "interior", "club", X, 0.34, Z + 0.17, 1.2, 0.28, { weight: 0.8 });
      break;
    case "court":
      R("g", "Indoor court", "interior", "court", X, 0.09, Z - 0.5, 0.8, 0.4, { weight: 1.8 });
      R("o", "Outdoor court", "outdoor", "courtside", X - 0.62, 0.09, Z + 0.86, 0.06, 0.06, { weight: 0.8 });
      break;
    case "boxing":
      R("g", "Ringside", "interior", "boxing", X, 0.09, Z, 0.8, 0.8, { weight: 2 });
      break;
    case "wrestling":
      R("g", "Ringside", "interior", "wrestling", X, 0.09, Z, 0.8, 0.8, { weight: 2 });
      break;
    case "campus":
      R("g", "Library", "interior", "library", X, 0.09, Z - 0.6, 0.66, 0.17);
      R("f1", "Floor 1 · Lecture hall", "interior", "lecture", X, 0.09 + 0.3, Z - 0.6, 0.66, 0.17);
      break;
    case "hotel": {
      R("g", "Lobby", "interior", "hotelLobby", X + 0.2, 0.09, Z + 0.05, 0.5, 0.35);
      R("f1", `Floor 1 · ${venueName(plan, "restaurant", t.x, t.z)}`, "interior", "restaurant", X - 0.2, 0.09 + STOREY, Z - 0.25, 0.42, 0.22);
      const n = Math.floor(3.5 / STOREY);
      const mid = Math.round(n * 0.5);
      R(`f${mid + 2}`, `Floor ${mid + 2} · Suite`, "interior", "suite", X - 0.2, 0.49 + mid * STOREY, Z - 0.25, 0.42, 0.22);
      const club = t.r[2] < 0.5;
      R(`f${n + 2}`, club ? `Floor ${n + 2} · Sky club` : `Floor ${n + 2} · Sky bar`, "interior", club ? "club" : "lounge", X - 0.2, 0.49 + n * STOREY, Z - 0.25, 0.42, 0.22);
      R("r", "Pool deck", "roof", "poolDeck", X + 0.5, 0.49, Z - 0.05, 0.27, 0.5, {
        hide: { above: 0.488, rect: [X + 0.2, Z - 0.62, X + 0.82, Z + 0.52], maxH: 0.1 },
      });
      break;
    }
    case "airport":
      R("g", "Terminal", "interior", "terminal", X - 0.15, 0.09, Z - 0.5, 0.46, 0.18);
      R("f5", "Control tower", "interior", "tower", X + 0.7, 1.34, Z - 0.55, 0.05, 0.05, { weight: 0.6 });
      break;
    case "port":
      R("o", "Quayside", "outdoor", "quay", X + 0.1, 0.13, Z - 0.22, 0.1, 0.05);
      break;
    case "military":
      R("o", "Parade ground", "outdoor", "parade", X + 0.15, 0.09, Z + 0.3, 0.1, 0.1);
      break;
    case "power":
      R("g", "Control room", "interior", "control", X + 0.2, 0.09, Z + 0.45, 0.46, 0.27);
      break;
    case "dam":
      R("r", "Top of the dam", "roof", "damTop", X + 0.25, 0.68, Z, 0.7, 0.08);
      break;
    case "oilrig":
      R("r", "Rig deck", "roof", "rigDeck", X + 0.25, 0.84, Z - 0.3, 0.2, 0.15);
      break;
    case "solar":
      R("o", "Solar farm", "outdoor", "solar", X, 0.09, Z - 0.3, 0.3, 0.03);
      break;
    case "waterpark":
      R("o", "Poolside", "outdoor", "waterpark", X - 0.45, 0.09, Z + 0.62, 0.1, 0.1);
      break;
    case "bank":
      R("g", "Banking hall", "interior", "bank", X, 0.21, Z - 0.4, 0.95, 0.45, { weight: 1.4 });
      R("f1", "The vault", "interior", "vault", X, 0.21, Z - 0.9, 0.6, 0.2, { weight: 0.7 });
      break;
    case "bigpark":
      R("o", "In the park", "outdoor", "park", X, 0.09, Z + 0.3, 0.1, 0.1, { weight: 1.6 });
      break;
    case "gym":
      R("g", "Gym floor", "interior", "gym", X, 0.09, Z - 0.4, 1.1, 0.65, { weight: 1.4 });
      break;
    case "spa":
      R("g", "Spa", "interior", "spa", X, 0.09, Z - 0.75, 1.05, 0.35, { weight: 1.2 });
      R("o", "Pools", "outdoor", "waterpark", X, 0.09, Z + 0.55, 0.1, 0.1);
      break;
    case "cathedral":
      R("g", "The nave", "interior", "church", X, 0.09, Z - 0.25, 0.38, 1.15, { weight: 1.4 });
      break;
    case "grandmosque":
      R("g", "Prayer hall", "interior", "mosque", X, 0.09, Z - 0.75, 0.95, 0.55, { weight: 1.4 });
      R("o", "Courtyard", "outdoor", "plaza", X, 0.09, Z + 0.55, 0.1, 0.1);
      break;
    case "intlairport":
      R("g", "Departures hall", "interior", "terminal", X - 0.5, 0.09, Z + 0.55, 1.4, 0.35, { weight: 1.6 });
      R("f6", "Control tower", "interior", "tower", X + 2.55, 1.65, Z + 0.95, 0.05, 0.05, { weight: 0.6 });
      R("r", "Helipad", "roof", "helipad", X - 2.4, 0.09, Z + 1.45, 0.25, 0.25, { weight: 0.8 });
      break;
    case "spaceport":
      R("g", "Mission control", "interior", "control", X + 1.3, 0.09, Z + 1.35, 0.6, 0.3, { weight: 1.2 });
      R("r", "Viewing deck", "roof", "roofTerrace", X - 1.4, 0.55, Z + 1.4, 0.4, 0.25, { weight: 1 });
      break;
  }
  return out;
}

/** True when the tile is a place people can go into (a chat room). */
export const isPlaceTile = (t: Tile) => !!ROOM_LABEL[t.kind] || t.kind === "structure" || !!t.station;

export { faceCentre };
