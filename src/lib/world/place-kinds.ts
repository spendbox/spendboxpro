// Searching the map by what a place is, not only its name (docs/MAP_SEARCH.md): type "club",
// "church", "court" (a law court), "airport", "petrol" or "hospital" and the nearest ones come up first, with how
// far they are. Every kind of place on the map has the words people use for it (plurals, Nigerian
// words and short forms too); the everyday places are found on the streets round where you're
// looking, the big landmarks, named spots and stations anywhere in the city. No database.

import type { StructureType, Tile, TileKind } from "../city/layout.ts";
import type { RegionMap } from "./compile.ts";

export type PlaceKind = {
  id: string;
  /** One of them, and more than one ("Club", "Clubs"). */
  label: string;
  plural: string;
  /** What people type for it (lower case, no accents). */
  words: string[];
  tiles?: TileKind[];
  structures?: StructureType[];
  /** Railway stations. */
  stations?: boolean;
  /** An emoji for the quick buttons. */
  icon: string;
};

export const PLACE_KINDS: PlaceKind[] = [
  { id: "club", label: "Club", plural: "Clubs", icon: "🪩", words: ["club", "nightclub", "night club", "disco", "nightlife", "party", "rave", "dance", "lounge", "bar", "pub", "joint", "vibes"], tiles: ["club"] },
  { id: "restaurant", label: "Restaurant", plural: "Restaurants", icon: "🍽️", words: ["restaurant", "food", "eat", "eatery", "buka", "canteen", "chop", "mama put", "cafe", "diner", "suya", "jollof"], tiles: ["restaurant"] },
  { id: "church", label: "Church", plural: "Churches", icon: "⛪", words: ["church", "cathedral", "chapel", "parish", "worship", "pray", "prayer", "service"], tiles: ["worship"], structures: ["cathedral"] },
  { id: "mosque", label: "Mosque", plural: "Mosques", icon: "🕌", words: ["mosque", "masjid", "jumat", "juma", "worship", "pray", "prayer"], tiles: ["worship"], structures: ["grandmosque"] },
  { id: "hospital", label: "Hospital", plural: "Hospitals", icon: "🏥", words: ["hospital", "clinic", "doctor", "medical", "health", "emergency", "nurse", "pharmacy", "chemist", "luth"], tiles: ["hospital"], structures: ["medcentre"] },
  { id: "police", label: "Police station", plural: "Police stations", icon: "🚓", words: ["police", "cop", "cops", "precinct", "sars"], tiles: ["police"] },
  { id: "fire", label: "Fire station", plural: "Fire stations", icon: "🚒", words: ["fire", "firestation", "fire service", "firefighter"], tiles: ["fire"] },
  { id: "fuel", label: "Petrol station", plural: "Petrol stations", icon: "⛽", words: ["petrol", "fuel", "filling", "gas", "gas station", "fuel station", "filling station", "mega station"], tiles: ["fuel"] },
  { id: "school", label: "School", plural: "Schools", icon: "🏫", words: ["school", "college", "academy", "nursery", "primary", "secondary", "lesson", "class"], tiles: ["school"] },
  { id: "university", label: "University", plural: "Universities", icon: "🎓", words: ["university", "uni", "campus", "unilag", "polytechnic", "poly", "varsity"], structures: ["campus"] },
  { id: "court", label: "Law court", plural: "Law courts", icon: "⚖️", words: ["court", "law court", "courthouse", "court house", "magistrate", "magistrate court", "high court", "customary court", "judge", "justice", "law", "lawyer", "tribunal", "trial"], tiles: ["lawcourt"] },
  { id: "range", label: "Shooting range", plural: "Shooting ranges", icon: "🎯", words: ["shooting", "shooting range", "range", "gun range", "firing range", "shoot", "target", "targets", "gun", "guns"], tiles: ["range"] },
  { id: "basketball", label: "Basketball court", plural: "Basketball courts", icon: "🏀", words: ["basketball", "basketball court", "ball court", "hoops"], structures: ["court"] },
  { id: "stadium", label: "Stadium", plural: "Stadiums", icon: "🏟️", words: ["stadium", "arena", "football", "soccer", "match", "sport", "sports"], tiles: ["stadium"], structures: ["arena"] },
  { id: "pitch", label: "Football pitch", plural: "Football pitches", icon: "⚽", words: ["pitch", "field", "football", "soccer", "five aside", "5 aside"], tiles: ["pitch"] },
  { id: "boxing", label: "Boxing arena", plural: "Boxing arenas", icon: "🥊", words: ["boxing", "boxer", "fight", "ring"], structures: ["boxing"] },
  { id: "wrestling", label: "Wrestling arena", plural: "Wrestling arenas", icon: "🤼", words: ["wrestling", "wrestle", "fight"], structures: ["wrestling"] },
  { id: "gym", label: "Gym", plural: "Gyms", icon: "🏋️", words: ["gym", "fitness", "workout", "exercise", "training"], structures: ["gym"] },
  { id: "spa", label: "Spa", plural: "Spas", icon: "💆", words: ["spa", "massage", "salon", "relax", "sauna"], structures: ["spa"] },
  { id: "hotel", label: "Hotel", plural: "Hotels", icon: "🏨", words: ["hotel", "motel", "inn", "suite", "lodge", "stay"], structures: ["hotel"] },
  { id: "mall", label: "Mall", plural: "Malls", icon: "🛍️", words: ["mall", "shopping", "shop", "shops", "store", "plaza", "supermarket", "boutique"], structures: ["mall", "megamall"] },
  { id: "market", label: "Market", plural: "Markets", icon: "🧺", words: ["market", "oja", "kasuwa", "balogun", "trader", "buy"], structures: ["market"] },
  { id: "bank", label: "Bank", plural: "Banks", icon: "🏦", words: ["bank", "atm", "money", "cash", "branch", "savings", "deposit", "withdraw"], tiles: ["bank"], structures: ["bank"] },
  { id: "airport", label: "Airport", plural: "Airports", icon: "✈️", words: ["airport", "airstrip", "plane", "planes", "flight", "fly", "flights", "terminal", "mmia", "murtala"], structures: ["airport", "intlairport"] },
  { id: "spaceport", label: "Spaceport", plural: "Spaceports", icon: "🚀", words: ["spaceport", "rocket", "space"], structures: ["spaceport"] },
  { id: "port", label: "Port", plural: "Ports", icon: "⚓", words: ["port", "harbour", "harbor", "dock", "docks", "ship", "ships", "jetty", "apapa"], structures: ["port"] },
  { id: "station", label: "Railway station", plural: "Railway stations", icon: "🚆", words: ["train", "trains", "railway", "rail", "station", "metro", "brt", "monorail"], stations: true },
  { id: "park", label: "Park", plural: "Parks", icon: "🌳", words: ["park", "garden", "green", "picnic", "outdoors"], tiles: ["park"], structures: ["bigpark"] },
  { id: "square", label: "Square", plural: "Squares", icon: "⛲", words: ["square", "plaza", "piazza", "fountain"], tiles: ["plaza"] },
  { id: "playground", label: "Playground", plural: "Playgrounds", icon: "🛝", words: ["playground", "kids", "children", "swing", "slide"], tiles: ["playground"] },
  { id: "funfair", label: "Funfair", plural: "Funfairs", icon: "🎡", words: ["funfair", "fair", "fun fair", "rides", "ferris", "wheel", "carnival", "amusement"], tiles: ["ferris"], structures: ["funfair"] },
  { id: "waterpark", label: "Water park", plural: "Water parks", icon: "🌊", words: ["waterpark", "water park", "pool", "swim", "swimming", "slides"], structures: ["waterpark"] },
  { id: "museum", label: "Museum", plural: "Museums", icon: "🏛️", words: ["museum", "gallery", "art", "history", "exhibition"], structures: ["museum"] },
  { id: "monument", label: "Monument", plural: "Monuments", icon: "🗽", words: ["monument", "statue", "memorial", "landmark"], tiles: ["monument"] },
  { id: "government", label: "Government house", plural: "Government buildings", icon: "🏛️", words: ["government", "capitol", "governor", "assembly", "secretariat", "alausa", "state house"], structures: ["capitol"] },
  { id: "military", label: "Barracks", plural: "Barracks", icon: "🪖", words: ["military", "army", "barracks", "soldier", "navy"], structures: ["military"] },
  { id: "office", label: "Office", plural: "Offices", icon: "🏢", words: ["office", "offices", "work", "job", "jobs", "company", "business"], tiles: ["office"] },
  { id: "tower", label: "Tower", plural: "Towers", icon: "🏙️", words: ["tower", "skyscraper", "highrise", "high rise", "apartment", "apartments", "flat", "flats"], tiles: ["tower"] },
  { id: "power", label: "Power station", plural: "Power stations", icon: "⚡", words: ["power", "electricity", "nepa", "phcn", "plant", "solar", "dam"], structures: ["power", "solar", "dam"] },
];

/** Lower case, no accents or punctuation, single spaces: "St. Mary's" and "st marys" match. */
export const foldText = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.,()&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A word without its plural ending: "clubs" → "club", "churches" → "church", "pitches" → "pitch". */
function single(w: string) {
  if (w.length > 4 && /(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** How alike two words are: the fewest letters to change, add or drop (stops past `max`). */
export function editDistance(a: string, b: string, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Whether a typed word is close enough to a word: the same, the start of it (3 letters on), or one slip (two in long words). */
export function wordMatches(typed: string, word: string) {
  if (!typed) return false;
  if (word === typed || (word.startsWith(typed) && typed.length >= 3)) return true;
  if (typed.length < 4) return false;
  return editDistance(typed, word, typed.length >= 7 ? 2 : 1) <= (typed.length >= 7 ? 2 : 1);
}

/**
 * The kinds of place a search is asking for: "clubs near me", "church", "petrol station",
 * "hospitl" (a slip). Words like "near", "me", "the" don't count. Best match first; [] when it
 * isn't a kind of place.
 */
export function kindsFor(query: string): PlaceKind[] {
  const words = foldText(query)
    .split(" ")
    .filter((w) => w && !FILLER.has(w))
    .map(single);
  if (!words.length) return [];
  const text = words.join(" ");
  const scored: { k: PlaceKind; score: number }[] = [];
  for (const k of PLACE_KINDS) {
    let score = 0;
    for (const raw of [k.id, k.label.toLowerCase(), k.plural.toLowerCase(), ...k.words]) {
      const phrase = foldText(raw);
      // The whole thing typed (or the kind's name typed in full): best.
      if (phrase === text) score = Math.max(score, 3);
      else if (phrase.split(" ").length > 1 && text.includes(phrase)) score = Math.max(score, 2.5);
      else if (words.length === 1 && wordMatches(words[0], phrase)) score = Math.max(score, phrase.startsWith(words[0]) ? 2 : 1);
      else if (words.some((w) => phrase.split(" ").some((pw) => pw === w))) score = Math.max(score, 1.5);
    }
    if (score > 0) scored.push({ k, score });
  }
  scored.sort((a, b) => b.score - a.score);
  // The best ones only (a typed "club" isn't also asking for every "dance" place).
  const top = scored[0]?.score ?? 0;
  return scored.filter((s) => s.score >= top - 0.5 && s.score >= 1).map((s) => s.k);
}
const FILLER = new Set(["near", "nearby", "nearest", "me", "the", "a", "an", "in", "at", "around", "closest", "close", "to", "find", "where", "is", "any", "my", "of", "here", "place", "places"]);

export type FoundPlace = { id: string; name: string; what: string; kind: string; x: number; z: number; dist: number };

/** How far round where you're looking the everyday places are looked for (tiles, 100 m each). */
const NEAR_MAX = 50;

/**
 * The nearest places of these kinds to (x, z), at most `limit`: big landmarks, named spots and
 * stations from anywhere in the city, the everyday places from the streets round you (looking
 * further out until there are enough). tileOf gives the city's tile at a spot.
 */
export function findPlaces(map: RegionMap, tileOf: (x: number, z: number) => Tile, kinds: PlaceKind[], x: number, z: number, limit = 12): FoundPlace[] {
  if (!kinds.length) return [];
  const id = map.region.id;
  const tileKinds = new Map<TileKind, PlaceKind>();
  const structKinds = new Map<StructureType, PlaceKind>();
  for (const k of kinds) {
    for (const t of k.tiles ?? []) if (!tileKinds.has(t)) tileKinds.set(t, k);
    for (const s of k.structures ?? []) if (!structKinds.has(s)) structKinds.set(s, k);
  }
  const out = new Map<string, FoundPlace>();
  const add = (key: string, name: string, k: PlaceKind, what: string, px: number, pz: number) => {
    if (out.has(key)) return;
    out.set(key, { id: `${id}:${key}`, name, what, kind: k.id, x: px, z: pz, dist: Math.hypot(px - x, pz - z) });
  };
  const whatOf = (k: PlaceKind, raw?: string) => (k.id === "church" || k.id === "mosque") && raw === "worship" ? "Place of worship" : k.label;
  for (const l of map.landmarks) {
    const k = structKinds.get(l.type);
    if (k) add(`${l.ax},${l.az}`, l.name, k, whatOf(k), l.ax + (l.w - 1) / 2, l.az + (l.d - 1) / 2);
  }
  for (const sp of map.spotList) {
    const k = tileKinds.get(sp.kind) ?? structKinds.get(sp.kind as unknown as StructureType);
    if (k) add(`${sp.x},${sp.z}`, sp.name, k, whatOf(k, String(sp.kind)), sp.x, sp.z);
  }
  const stationKind = kinds.find((k) => k.stations);
  if (stationKind) for (const s of map.stations) add(`${Math.round(s.x)},${Math.round(s.z)}`, /station$/i.test(s.name) ? s.name : `${s.name} station`, stationKind, stationKind.label, s.x, s.z);
  // The streets round you, ring after ring, until there are enough (or it's far enough).
  if (tileKinds.size || structKinds.size) {
    const cx = Math.round(x);
    const cz = Math.round(z);
    for (let r = 0; r <= NEAR_MAX; r++) {
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const tx = cx + dx;
          const tz = cz + dz;
          if (!map.inside(tx, tz) || map.waterAt(tx, tz)) continue;
          const t = tileOf(tx, tz);
          if (t.kind === "structure" && t.structure) {
            const s = t.structure;
            const k = structKinds.get(s.type);
            if (k) add(`${s.ax},${s.az}`, s.name, k, whatOf(k), s.ax + ((s.w ?? 1) - 1) / 2, s.az + ((s.d ?? 1) - 1) / 2);
            continue;
          }
          const k = tileKinds.get(t.kind);
          if (!k) continue;
          const what = whatOf(k, t.kind);
          add(`${tx},${tz}`, t.name ?? `${what}, ${map.areaAt(tx, tz)}`, k, what, tx, tz);
        }
      // Enough found nearer than this ring: anything further out is further than them.
      const nearer = [...out.values()].filter((p) => p.dist <= r).length;
      if (nearer >= limit) break;
    }
  }
  return [...out.values()].sort((a, b) => a.dist - b.dist).slice(0, limit);
}

/** How far, in words: "300 m", "1.2 km", "14 km". */
export const distanceWords = (tiles: number) => {
  const m = tiles * 100;
  return m < 950 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : m < 9_950 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`;
};

/** The kinds offered as quick buttons when the search box is empty. */
export const QUICK_KINDS = ["club", "restaurant", "church", "mosque", "hospital", "court", "stadium", "mall", "market", "bank", "hotel", "airport", "station", "park", "fuel", "police"]
  .map((k) => PLACE_KINDS.find((p) => p.id === k)!)
  .filter(Boolean);
