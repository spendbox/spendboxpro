// Public, deterministic team and fighter generation for the stadium. Everything here comes
// from the match slot or the side's name, so every server and browser agrees, and nothing
// here says who wins (the secret simulation adds each match's form on top).

import { hashStr, rngFrom, type Rng } from "./rng";
import type { Side, Sport } from "./types";

// ---------------------------------------------------------------- name pools

type Pool = "ng" | "gh" | "fw" | "za" | "ea" | "uk" | "es" | "pt" | "it" | "fr" | "nl" | "us" | "jp" | "jm";

const FIRST: Record<Pool, readonly string[]> = {
  ng: [
    "Adebayo", "Tunde", "Kunle", "Segun", "Femi", "Dayo", "Wale", "Bayo", "Tobi", "Seun", "Kola", "Gbenga", "Jide",
    "Lanre", "Niyi", "Yinka", "Ayo", "Dapo", "Bode", "Rotimi", "Ademola", "Taiwo", "Kehinde", "Emeka", "Chidi",
    "Obinna", "Ikenna", "Nnamdi", "Chinedu", "Uche", "Kelechi", "Ifeanyi", "Chukwudi", "Ebuka", "Tochukwu", "Somto",
    "Chima", "Ugo", "Musa", "Ibrahim", "Abdullahi", "Sani", "Usman", "Aliyu", "Yusuf", "Idris", "Kabiru", "Nasiru",
    "Umar", "Haruna", "Efe", "Ovie", "Tega", "Ese", "Etim", "Bassey", "Okon", "Ekene", "Victor", "Samuel", "Daniel",
    "John", "Peter", "Michael", "Joseph", "David", "Godwin", "Sunday", "Monday", "Promise", "Kingsley", "Austin",
    "Felix", "Henry", "Moses", "Isaac", "Emmanuel", "Paul", "Osaze", "Osas", "Ehis", "Tamuno", "Ebi", "Preye", "Timi",
    "Sodiq", "Rasheed", "Waheed", "Lekan", "Shina", "Mike", "Success", "Godspower", "Jamiu", "Habeeb",
  ],
  gh: ["Kofi", "Kwame", "Kwabena", "Yaw", "Kojo", "Kwesi", "Kwaku", "Ebo", "Nii", "Fiifi", "Kweku", "Selorm"],
  fw: ["Moussa", "Ibrahima", "Mamadou", "Cheikh", "Oumar", "Abdou", "Serge", "Yannick", "Franck", "Arnaud", "Christian", "Souleymane"],
  za: ["Thabo", "Sipho", "Themba", "Bongani", "Lwazi", "Kagiso", "Tumelo", "Mandla", "Sizwe", "Lebo"],
  ea: ["Brian", "Kevin", "Dennis", "Collins", "Baraka", "Juma", "Amani", "Otieno", "Kamau", "Mwangi"],
  uk: ["James", "Harry", "Jack", "Liam", "Oliver", "George", "Tom", "Callum", "Kieran", "Jamie", "Ryan", "Danny"],
  es: ["Mateo", "Diego", "Carlos", "Javier", "Pablo", "Sergio", "Alejandro", "Luis", "Santiago", "Iker"],
  pt: ["Lucas", "Pedro", "Joao", "Tiago", "Rafael", "Gabriel", "Bruno", "Thiago", "Caio", "Rui"],
  it: ["Marco", "Luca", "Matteo", "Lorenzo", "Andrea", "Davide", "Federico", "Simone"],
  fr: ["Hugo", "Theo", "Antoine", "Julien", "Mathis", "Bastien", "Florian", "Kylian"],
  nl: ["Lukas", "Jonas", "Felix", "Max", "Niklas", "Daan", "Sem", "Jesper"],
  us: ["Tyler", "Jordan", "Marcus", "Darius", "Jaylen", "DeShawn", "Brandon", "Malik", "Trey", "Andre", "Isaiah", "Cameron"],
  jp: ["Kenji", "Hiroshi", "Takumi", "Daichi", "Yuto", "Haruto", "Ren", "Sota"],
  jm: ["Andre", "Marlon", "Dwayne", "Shane", "Omar", "Rohan", "Kemar", "Leon"],
};

const LAST: Record<Pool, readonly string[]> = {
  ng: [
    "Okafor", "Okonkwo", "Adeyemi", "Bakare", "Balogun", "Ogunleye", "Olawale", "Eze", "Nwosu", "Nwankwo", "Obi",
    "Okeke", "Okoro", "Uzor", "Chukwu", "Onyeka", "Ibe", "Mbah", "Bello", "Abubakar", "Mohammed", "Lawal", "Danjuma",
    "Garba", "Yakubu", "Shehu", "Usman", "Idowu", "Ogundipe", "Akinola", "Akpan", "Ekpo", "Etuk", "Edet", "Inyang",
    "Ojo", "Afolabi", "Ajayi", "Alabi", "Babatunde", "Coker", "Dosunmu", "Fagbemi", "Lasisi", "Martins", "Oyebanji",
    "Sanni", "Taiwo", "Williams", "Johnson", "Onuoha", "Agu", "Anyanwu", "Ezeh", "Igwe", "Nnaji", "Obasi", "Ugwu",
    "Ogbu", "Ekwueme", "Oboh", "Omoregie", "Osagie", "Idahosa", "Aigbe", "Briggs", "Amadi", "George", "Horsfall",
    "Okorie", "Nwachukwu", "Ogbonna", "Adewale", "Ogunbiyi", "Oladipo", "Olatunji", "Bankole", "Durojaiye",
    "Adeleke", "Akande", "Usoro", "Essien", "Udo", "Effiong", "Okpara", "Ibrahim", "Suleiman", "Tijani", "Oyelaran",
    "Adebisi", "Ojukwu", "Iwobi", "Okoye", "Onyekachi", "Ikwuemesi", "Ukpong", "Oshodi", "Ademola",
  ],
  gh: ["Mensah", "Boateng", "Asante", "Owusu", "Appiah", "Addo", "Osei", "Agyei", "Danso", "Quaye", "Tetteh", "Ansah"],
  fw: ["Diallo", "Ndiaye", "Traore", "Kone", "Diop", "Sow", "Camara", "Toure", "Bamba", "Kouassi", "Fofana", "Sylla", "Cisse", "Sarr", "Gueye"],
  za: ["Mokoena", "Dlamini", "Nkosi", "Ndlovu", "Khumalo", "Mahlangu", "Sithole", "Mthembu", "Zungu", "Radebe"],
  ea: ["Otieno", "Kamau", "Mwangi", "Odhiambo", "Ochieng", "Kiprono", "Mutua", "Wekesa", "Onyango", "Njoroge"],
  uk: ["Smith", "Jones", "Brown", "Taylor", "Wilson", "Evans", "Walker", "Hughes", "Clarke", "Wright", "Hall", "Wood"],
  es: ["Garcia", "Martinez", "Lopez", "Fernandez", "Ruiz", "Moreno", "Navarro", "Torres", "Romero", "Herrera"],
  pt: ["Silva", "Santos", "Costa", "Oliveira", "Pereira", "Souza", "Almeida", "Ferreira", "Carvalho", "Rocha"],
  it: ["Rossi", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Esposito"],
  fr: ["Dubois", "Martin", "Bernard", "Petit", "Durand", "Moreau", "Laurent", "Lefebvre"],
  nl: ["Muller", "Schmidt", "Fischer", "Weber", "de Jong", "Bakker", "Visser", "Jansen"],
  us: ["Johnson", "Williams", "Davis", "Harris", "Jackson", "Robinson", "Thompson", "Carter", "Mitchell", "Coleman", "Brooks", "Price"],
  jp: ["Tanaka", "Suzuki", "Takahashi", "Watanabe", "Ito", "Nakamura", "Kobayashi", "Yamamoto"],
  jm: ["Campbell", "Reid", "Grant", "Powell", "Bailey", "Brown", "Thompson", "Morgan"],
};

type Place = { name: string; pool: Pool; lagos?: boolean; big?: boolean };

const P = (name: string, pool: Pool, extra?: Partial<Place>): Place => ({ name, pool, ...extra });
const L = (name: string, big = false): Place => ({ name, pool: "ng", lagos: true, big });

const NG_PLACES: Place[] = [
  L("Lagos", true), L("Ikeja", true), L("Surulere", true), L("Yaba"), L("Lekki", true), L("Ikorodu"), L("Ajegunle"),
  L("Mushin"), L("Oshodi"), L("Agege"), L("Badagry"), L("Epe"), L("Apapa"), L("Festac"), L("Ojota"), L("Victoria Island"),
  P("Ibadan", "ng", { big: true }), P("Abeokuta", "ng"), P("Abuja", "ng", { big: true }), P("Kano", "ng", { big: true }),
  P("Kaduna", "ng"), P("Enugu", "ng", { big: true }), P("Onitsha", "ng"), P("Aba", "ng"), P("Owerri", "ng"),
  P("Port Harcourt", "ng", { big: true }), P("Calabar", "ng"), P("Uyo", "ng"), P("Benin", "ng", { big: true }),
  P("Warri", "ng"), P("Jos", "ng"), P("Ilorin", "ng"), P("Ogbomosho", "ng"), P("Akure", "ng"), P("Asaba", "ng"),
  P("Makurdi", "ng"), P("Sokoto", "ng"), P("Maiduguri", "ng"), P("Zaria", "ng"), P("Lokoja", "ng"), P("Osogbo", "ng"),
  P("Ile-Ife", "ng"), P("Nsukka", "ng"), P("Umuahia", "ng"), P("Yenagoa", "ng"), P("Bauchi", "ng"),
];

const WORLD_FOOTBALL: Place[] = [
  P("Accra", "gh"), P("Kumasi", "gh"), P("Tema", "gh"), P("Dakar", "fw"), P("Abidjan", "fw"), P("Douala", "fw"),
  P("Yaounde", "fw"), P("Nairobi", "ea"), P("Mombasa", "ea"), P("Kampala", "ea"), P("Soweto", "za"), P("Cape Town", "za"),
  P("Durban", "za"), P("London", "uk"), P("Manchester", "uk"), P("Bristol", "uk"), P("Madrid", "es"), P("Seville", "es"),
  P("Buenos Aires", "es"), P("Lisbon", "pt"), P("Porto", "pt"), P("Rio", "pt"), P("Sao Paulo", "pt"), P("Naples", "it"),
  P("Turin", "it"), P("Marseille", "fr"), P("Lyon", "fr"), P("Rotterdam", "nl"), P("Hamburg", "nl"), P("Tokyo", "jp"),
  P("Kingston", "jm"),
];

const WORLD_HOOPS: Place[] = [
  P("Accra", "gh"), P("Dakar", "fw"), P("Abidjan", "fw"), P("Nairobi", "ea"), P("Kigali", "ea"), P("Johannesburg", "za"),
  P("London", "uk"), P("Madrid", "es"), P("Barcelona", "es"), P("Lisbon", "pt"), P("Paris", "fr"), P("Berlin", "nl"),
  P("Brooklyn", "us"), P("Chicago", "us"), P("Atlanta", "us"), P("Houston", "us"), P("Oakland", "us"), P("Toronto", "us"),
  P("Kingston", "jm"), P("Tokyo", "jp"),
];

const FOOTBALL_MASCOTS = [
  "Lions", "Eagles", "Strikers", "Stars", "Warriors", "Dragons", "Panthers", "Leopards", "Sharks", "Rockets", "Bees",
  "Buffaloes", "Hawks", "Falcons", "Kings", "Royals", "Thunder", "Comets", "Tigers", "Crocodiles", "Elephants",
  "Gorillas", "Cobras", "Scorpions", "Hurricanes", "Giants", "Raiders", "Pirates", "Vipers", "Flyers", "Titans",
  "Stallions", "Gladiators", "Mavericks", "Spartans", "Jaguars", "Rhinos", "Wolves", "Hornets", "Pythons", "Antelopes",
  "Eagles", "Lions", "Strikers", "Stars", "Rangers",
] as const;
/** "Real Ikeja", "Inter Lekki"... (Nigerian places only, so no real club comes out). */
const FOOTBALL_PREFIXES = ["Real", "Inter", "Sporting", "Racing", "Dynamo", "Royal"] as const;
const FOOTBALL_SUFFIXES = ["United", "City", "FC", "Athletic", "Rovers", "Wanderers"] as const;

const HOOPS_MASCOTS = [
  "Ballers", "Hoopers", "Thunder", "Kings", "Royals", "Titans", "Stallions", "Blaze", "Giants", "Dunkers", "Skyhawks",
  "Waves", "Comets", "Flames", "Lightning", "Cheetahs", "Storm", "Jets", "Rhythm", "Express", "Leopards", "Panthers",
  "Mamba", "Crusaders", "Cyclones", "Bandits", "Eagles", "Rockstars", "Buffaloes", "Phantoms",
] as const;

/** Names that would come out as real clubs; re-rolled. */
const NOT_REAL = new Set([
  "Accra Lions", "London Lions", "Manchester Giants", "Cape Town Tigers", "Ikorodu City", "Sokoto United", "Kaduna United",
  "Abuja FC", "Lagos City", "Kano Pillars", "Brooklyn Nets", "Toronto Raptors", "Atlanta Hawks", "Houston Rockets",
  "Chicago Bulls", "Oakland Raiders", "Lagos Islanders", "Kingston Kings",
]);

// ---------------------------------------------------------------- kits

/** Shirt colour, trim colour. */
const KITS: readonly [string, string][] = [
  ["#d62828", "#ffffff"], ["#1d4ed8", "#ffffff"], ["#0b1d3a", "#f4c430"], ["#f4c430", "#0b1d3a"], ["#ffffff", "#d62828"],
  ["#111827", "#f59e0b"], ["#7c3aed", "#fde047"], ["#ea580c", "#111827"], ["#38bdf8", "#0b1d3a"], ["#9f1239", "#fbbf24"],
  ["#ffffff", "#111827"], ["#db2777", "#111827"], ["#0f766e", "#fde68a"], ["#008751", "#ffffff"], ["#facc15", "#008751"],
  ["#1e3a8a", "#ef4444"], ["#b91c1c", "#111827"], ["#475569", "#f97316"], ["#06b6d4", "#ffffff"], ["#4c1d95", "#ffffff"],
  ["#f97316", "#ffffff"], ["#e11d48", "#1e3a8a"], ["#a3e635", "#111827"], ["#0369a1", "#facc15"],
];

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Rough perceptual distance between two colours (0..~760). */
export function colourGap(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

const PITCH_GREEN = "#3d8b3d";
const COURT_WOOD = "#d9a066";

// ---------------------------------------------------------------- football and basketball teams

export const FORMATIONS = ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "5-3-2", "4-1-4-1", "3-4-3", "4-4-1-1"] as const;
export type Formation = (typeof FORMATIONS)[number];

/** A formation's 11 spots, from the team's own view: depth 0 (own goal line side) .. 1 (front), width 0 left .. 1 right. */
export type Spot = { role: string; d: number; w: number; num: number };

const S = (role: string, d: number, w: number, num: number): Spot => ({ role, d, w, num });
const GK = S("GK", -1, 0.5, 1);
export const FORMATION_SPOTS: Record<Formation, Spot[]> = {
  "4-4-2": [GK, S("LB", 0.02, 0.1, 3), S("CB", 0, 0.37, 5), S("CB", 0, 0.63, 4), S("RB", 0.02, 0.9, 2), S("LM", 0.52, 0.1, 11), S("CM", 0.45, 0.38, 8), S("CM", 0.45, 0.62, 6), S("RM", 0.52, 0.9, 7), S("ST", 0.95, 0.38, 10), S("ST", 1, 0.62, 9)],
  "4-3-3": [GK, S("LB", 0.03, 0.1, 3), S("CB", 0, 0.37, 5), S("CB", 0, 0.63, 4), S("RB", 0.03, 0.9, 2), S("CM", 0.45, 0.3, 8), S("DM", 0.33, 0.5, 6), S("CM", 0.45, 0.7, 10), S("LW", 0.9, 0.12, 11), S("ST", 1, 0.5, 9), S("RW", 0.9, 0.88, 7)],
  "4-2-3-1": [GK, S("LB", 0.03, 0.1, 3), S("CB", 0, 0.37, 5), S("CB", 0, 0.63, 4), S("RB", 0.03, 0.9, 2), S("DM", 0.3, 0.38, 6), S("DM", 0.3, 0.62, 8), S("LW", 0.68, 0.13, 11), S("AM", 0.65, 0.5, 10), S("RW", 0.68, 0.87, 7), S("ST", 1, 0.5, 9)],
  "3-5-2": [GK, S("CB", 0, 0.25, 5), S("CB", 0, 0.5, 4), S("CB", 0, 0.75, 6), S("LWB", 0.38, 0.06, 3), S("CM", 0.42, 0.32, 8), S("DM", 0.32, 0.5, 14), S("CM", 0.42, 0.68, 10), S("RWB", 0.38, 0.94, 2), S("ST", 1, 0.38, 9), S("ST", 0.95, 0.62, 11)],
  "5-3-2": [GK, S("LWB", 0.12, 0.06, 3), S("CB", 0, 0.28, 5), S("CB", 0, 0.5, 4), S("CB", 0, 0.72, 6), S("RWB", 0.12, 0.94, 2), S("CM", 0.45, 0.3, 8), S("CM", 0.4, 0.5, 14), S("CM", 0.45, 0.7, 10), S("ST", 1, 0.38, 9), S("ST", 0.95, 0.62, 11)],
  "4-1-4-1": [GK, S("LB", 0.03, 0.1, 3), S("CB", 0, 0.37, 5), S("CB", 0, 0.63, 4), S("RB", 0.03, 0.9, 2), S("DM", 0.28, 0.5, 6), S("LM", 0.58, 0.1, 11), S("CM", 0.52, 0.37, 8), S("CM", 0.52, 0.63, 10), S("RM", 0.58, 0.9, 7), S("ST", 1, 0.5, 9)],
  "3-4-3": [GK, S("CB", 0, 0.25, 5), S("CB", 0, 0.5, 4), S("CB", 0, 0.75, 6), S("LM", 0.42, 0.08, 3), S("CM", 0.4, 0.38, 8), S("CM", 0.4, 0.62, 10), S("RM", 0.42, 0.92, 2), S("LW", 0.92, 0.15, 11), S("ST", 1, 0.5, 9), S("RW", 0.92, 0.85, 7)],
  "4-4-1-1": [GK, S("LB", 0.02, 0.1, 3), S("CB", 0, 0.37, 5), S("CB", 0, 0.63, 4), S("RB", 0.02, 0.9, 2), S("LM", 0.5, 0.1, 11), S("CM", 0.42, 0.38, 8), S("CM", 0.42, 0.62, 6), S("RM", 0.5, 0.9, 7), S("SS", 0.78, 0.5, 10), S("ST", 1, 0.5, 9)],
};

export const HOOPS_ROLES = ["PG", "SG", "SF", "PF", "C"] as const;

export type TeamProfile = {
  name: string;
  sport: "football" | "basketball";
  /** Overall strength 55..92 (public; each match adds secret form on top). */
  rating: number;
  /** Football: attack / midfield / defence / keeper. Basketball: offence / defence / threes / pace. */
  att: number;
  mid: number;
  def: number;
  gk: number;
  /** Football: 0 patient .. 1 direct. Basketball: 0 slow .. 1 run-and-gun. */
  style: number;
  formation: Formation;
  /** Shirt numbers matching the roster. */
  numbers: number[];
  /** Football: role per starter; basketball: PG..C for the first five. */
  roles: string[];
  roster: string[];
  kit: [string, string];
  away: [string, string];
  /** Only used by the football / basketball name generator (where the players come from). */
  pool: Pool;
};

function findPlace(name: string, list: Place[]): Place | undefined {
  let best: Place | undefined;
  for (const p of list) {
    if ((name.startsWith(p.name + " ") || name.endsWith(" " + p.name)) && (!best || p.name.length > best.name.length)) best = p;
  }
  return best;
}

const OTHER_POOLS: Pool[] = ["gh", "fw", "za", "ea", "uk", "es", "pt", "fr", "nl", "us", "jm"];

/** A full name from a pool, with a surname not used yet in this squad. */
function personName(rng: Rng, pool: Pool, taken: Set<string>): string {
  for (let tries = 0; tries < 60; tries++) {
    // Small pools run out of surnames: then a Nigerian (or other) signing joins.
    const p = tries < 12 ? pool : tries < 40 ? "ng" : rng.pick(OTHER_POOLS);
    const last = rng.pick(LAST[p]);
    if (taken.has(last)) continue;
    taken.add(last);
    return `${rng.pick(FIRST[p])} ${last}`;
  }
  return `${rng.pick(FIRST[pool])} ${rng.pick(LAST[pool])}`;
}

function squad(rng: Rng, pool: Pool, size: number, foreignShare: number): string[] {
  const taken = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < size; i++) {
    const p = rng.chance(foreignShare) ? (pool === "ng" ? rng.pick(OTHER_POOLS) : "ng") : pool;
    out.push(personName(rng, p, taken));
  }
  return out;
}

function pickKit(rng: Rng, avoid: string): [[string, string], [string, string]] {
  for (let tries = 0; tries < 20; tries++) {
    const k = rng.pick(KITS);
    if (colourGap(k[0], avoid) > 160) {
      const alt = rng.pick(KITS.filter((x) => colourGap(x[0], k[0]) > 260 && colourGap(x[0], avoid) > 160));
      return [k, alt ?? ["#ffffff", k[0]]];
    }
  }
  return [["#d62828", "#ffffff"], ["#ffffff", "#1d4ed8"]];
}

const teamCache = new Map<string, TeamProfile>();

/** Everything public about a team, from its name. */
export function teamProfile(sport: "football" | "basketball", name: string): TeamProfile {
  const key = `${sport}|${name}`;
  const hit = teamCache.get(key);
  if (hit) return hit;
  const rng = rngFrom(`team:${key}`);
  const place = findPlace(name, sport === "football" ? [...NG_PLACES, ...WORLD_FOOTBALL] : [...NG_PLACES, ...WORLD_HOOPS]);
  const pool = place?.pool ?? "ng";
  // Strength: most teams are middling, a few are giants, a few are minnows.
  const base = 56 + 30 * ((rng.next() + rng.next() + rng.next()) / 3) + (place?.big ? 3 : 0);
  const rating = Math.round(Math.min(92, base));
  const spread = () => Math.round(Math.max(45, Math.min(97, rating + rng.normal() * 5)));
  const [kit, away] = pickKit(rng, sport === "football" ? PITCH_GREEN : COURT_WOOD);
  let profile: TeamProfile;
  if (sport === "football") {
    const formation = rng.pick(FORMATIONS);
    const spots = FORMATION_SPOTS[formation];
    const roster = squad(rng, pool, 16, 0.18);
    const used = new Set<number>(spots.map((s) => s.num));
    const numbers = spots.map((s) => s.num);
    while (numbers.length < roster.length) {
      const n = rng.int(12, 33);
      if (!used.has(n)) {
        used.add(n);
        numbers.push(n);
      }
    }
    profile = {
      name, sport, rating, att: spread(), mid: spread(), def: spread(), gk: spread(), style: rng.next(), formation,
      numbers, roles: spots.map((s) => s.role), roster, kit, away, pool,
    };
  } else {
    const roster = squad(rng, pool, 8, 0.25);
    const used = new Set<number>();
    const numbers: number[] = [];
    while (numbers.length < roster.length) {
      const n = rng.chance(0.7) ? rng.int(0, 35) : rng.int(36, 55);
      if (!used.has(n)) {
        used.add(n);
        numbers.push(n);
      }
    }
    profile = {
      name, sport, rating, att: spread(), mid: spread(), def: spread(), gk: spread(), style: rng.next(), formation: "4-4-2",
      numbers, roles: [...HOOPS_ROLES, "G", "F", "C"], roster, kit, away, pool,
    };
  }
  if (teamCache.size > 500) teamCache.clear();
  teamCache.set(key, profile);
  return profile;
}

function teamName(rng: Rng, sport: "football" | "basketball"): { name: string; short: string; place: Place } {
  for (;;) {
    const world = rng.chance(0.24);
    const place = world ? rng.pick(sport === "football" ? WORLD_FOOTBALL : WORLD_HOOPS) : rng.pick(NG_PLACES);
    let name: string;
    let short: string;
    if (sport === "football" && place.pool === "ng" && rng.chance(0.22)) {
      if (rng.chance(0.5)) {
        const pre = rng.pick(FOOTBALL_PREFIXES);
        name = `${pre} ${place.name}`;
      } else {
        name = `${place.name} ${rng.pick(FOOTBALL_SUFFIXES)}`;
      }
      short = place.name;
    } else {
      const mascot = sport === "football" ? rng.pick(FOOTBALL_MASCOTS) : rng.pick(HOOPS_MASCOTS);
      name = `${place.name} ${mascot}`;
      short = mascot;
    }
    if (!NOT_REAL.has(name)) return { name, short, place };
  }
}

/** The two teams of a football or basketball slot, in their kits for this match. */
function teamSides(sport: "football" | "basketball", rng: Rng): [Side, Side, boolean] {
  const a = teamName(rng, sport);
  let b = teamName(rng, sport);
  for (let i = 0; i < 40 && (b.place.name === a.place.name || b.short === a.short || b.name === a.name); i++) b = teamName(rng, sport);
  if (b.short === a.short) b = { ...b, short: b.place.name };
  const pa = teamProfile(sport, a.name);
  const pb = teamProfile(sport, b.name);
  const home: Side = { name: a.name, short: a.short, colour: pa.kit[0], colour2: pa.kit[1], roster: pa.roster };
  let awayKit = pb.kit;
  if (colourGap(awayKit[0], home.colour) < 190) awayKit = pb.away;
  if (colourGap(awayKit[0], home.colour) < 190) awayKit = colourGap("#ffffff", home.colour) > 250 ? ["#ffffff", pb.kit[0]] : ["#111827", "#ffffff"];
  const away: Side = { name: b.name, short: b.short, colour: awayKit[0], colour2: awayKit[1], roster: pb.roster };
  return [home, away, !!(a.place.lagos && b.place.lagos)];
}

// ---------------------------------------------------------------- boxers

const BOXER_ADJ = ["Iron", "Smokin'", "Baby-Face", "Kid", "Sugar", "Thunder", "Lightning", "Sweet", "Big", "Prince", "Steel", "Gentleman", "Bad-Boy", "Golden", "Rapid", "Quiet", "Lucky", "Dangerous"];
const BOXER_NICK = [
  "The Hammer", "Machine Gun", "Bonecrusher", "The Bull", "Showtime", "The Professor", "The Jaguar", "Hurricane", "Tank",
  "Lion Heart", "Mr. Danger", "Danfo", "Okada", "Area Boy", "The Truth", "Gidi Bomber", "Jollof", "Suya", "Eko Express",
  "The Landlord", "Pressure", "Wahala", "Sledgehammer", "The Surgeon", "Night Train", "Mainland Menace",
];
const WEIGHTS = ["Flyweight", "Bantamweight", "Featherweight", "Lightweight", "Welterweight", "Middleweight", "Super-middleweight", "Light-heavyweight", "Cruiserweight", "Heavyweight"];
const STYLES_BOX = ["out-boxer", "slugger", "counter-puncher", "pressure fighter", "boxer-puncher"] as const;

export type FighterProfile = {
  name: string;
  sport: "boxing" | "wrestling";
  rating: number;
  /** Boxing: power, speed, chin, stamina, defence. Wrestling: power, agility, toughness, stamina, technique. */
  power: number;
  speed: number;
  chin: number;
  engine: number;
  guard: number;
  style: string;
  hometown: string;
  /** Boxing: "21-3 (14 KO)"; wrestling: a catchphrase. */
  record: string;
  /** Boxing: orthodox or southpaw. Wrestling: "power", "high-flyer", "technician", "brawler". */
  stance: string;
  heightCm: number;
  reachCm: number;
  weightKg: number;
  /** Wrestling: the signature move and the finisher; boxing: their favourite punch. */
  signature: string;
  finisher: string;
  colour: string;
  colour2: string;
};

const TOWNS_NG = ["Surulere", "Ajegunle", "Mushin", "Ikorodu", "Ibadan", "Kano", "Enugu", "Aba", "Port Harcourt", "Benin", "Warri", "Jos", "Abuja", "Calabar", "Oshodi", "Agege", "Yaba", "Onitsha", "Ilorin", "Owerri", "Lekki", "Festac"];
const TOWNS_WORLD = ["Accra", "Dakar", "Kumasi", "Nairobi", "Soweto", "London", "Manchester", "Madrid", "Rio", "Kingston", "Tokyo", "Marseille", "Chicago"];

function boxerName(rng: Rng): { name: string; short: string; pool: Pool } {
  const pool: Pool = rng.chance(0.78) ? "ng" : rng.pick(["gh", "fw", "za", "ea", "uk", "es", "pt", "us", "jm"] as Pool[]);
  const first = rng.pick(FIRST[pool]);
  const last = rng.pick(LAST[pool]);
  const r = rng.next();
  if (r < 0.38) return { name: `${rng.pick(BOXER_ADJ)} ${first} ${last}`, short: last, pool };
  if (r < 0.7) return { name: `${first} "${rng.pick(BOXER_NICK)}" ${last}`, short: last, pool };
  return { name: `${first} ${last}`, short: last, pool };
}

// ---------------------------------------------------------------- wrestlers

const WRESTLER_CORES = [
  "Danfo Driver", "Okada Outlaw", "Jollof Juggernaut", "Suya Slayer", "Molue Monster", "Agbero King", "Third Mainland Menace",
  "Bole Bomber", "Keke Crusher", "Garri Grinder", "Egusi Enforcer", "Lekki Lightning", "Ojota Ogre", "Mushin Mauler",
  "Ajegunle Avalanche", "NEPA Nightmare", "Pure Water Panther", "Bukka Brawler", "Owambe Outlaw", "Aso-Ebi Assassin",
  "Fufu Fury", "Plantain Python", "Chin-Chin Champion", "Go-Slow Giant", "Generator Gorilla", "Pepper Soup Punisher",
  "Lagos Landlord", "Mainland Machine", "Island Tycoon", "Abuja Architect", "Kano Colossus", "Calabar Crusher",
  "Enugu Express", "Ibadan Iron Man", "Warri Warlord", "Benin Bronze", "Jos Juggernaut", "Delta Dragon",
  "Harmattan Hurricane", "Naira Ninja", "Night Bus", "Okrika Overlord", "Tokunbo Titan", "Area Father", "Gala Gladiator",
];
const WRESTLER_TITLES = ["Chief", "Big", "Mr.", "Professor", "Captain", "Lil'", "King", "Oga", "Doctor", "Senator", "Alhaji", "Baba", "Prince", "Sir", "General", "Uncle", "Madman", "Bishop"];
const WRESTLER_WORDS = [
  "Wahala", "Shakara", "Gbege", "Kasala", "Pepper", "Thunder", "Danger", "Wrecker", "Slam", "Pain", "Trouble",
  "Pressure", "Palava", "Katakata", "Yawa", "Jaga-Jaga", "Ogbonge", "Gidi", "Eko", "Bassey", "Tunde", "Emeka",
  "Musa", "Efe", "Ovie", "Suplex", "Body Bag", "Konk", "Wakawaka", "Sapa",
];
const WRESTLER_WORLD = [
  "El Toro Loco", "The Tokyo Typhoon", "The Viking Vendor", "Captain Cardiff", "Kingston Kong", "Le Grand Fromage",
  "The Brazilian Buzzsaw", "Senor Suplex", "The Accra Anaconda", "The Mombasa Mamba", "The Dakar Dragon",
  "The Joburg Jackhammer", "The Lisbon Lighthouse", "The Bristol Bulldozer",
];

/** Signature moves and finishers with silly local names. */
export const WRESTLING_SPECIALS = [
  "Danfo Doorslam", "Okada Overdrive", "Jollof Driver", "Suya Skewer", "Third Mainland Drop", "NEPA Blackout",
  "Go-Slow Clothesline", "Pepper Soup Splash", "Agbero Toll Gate", "Mama Put Powerbomb", "Owambe Elbow",
  "Aso Rock Bottom", "Bole Bomb", "Generator Kick", "Keke Knee", "Area Boy Spear", "Molue Moonsault", "Bukka Buster",
  "Eko Atomic Drop", "Egusi Elbow", "Fufu Facebuster", "Amala Avalanche", "Pure Water Plunge", "Ojuelegba Overpass",
  "Lekki Toll Lariat", "Ajala Air Raid", "Naira Splash", "Oga at the Top", "Dey Play Driver", "Wahala Whip",
  "Shakara Slam", "Kasala Cutter", "Tokunbo Tornado", "Harmattan Haze", "Bridge Collapse", "Traffic Light Kick",
];
export const WRESTLING_HOLDS = ["Lagos Traffic Jam", "Garri Grip", "Chin-Chin Choke", "Agbada Armbar", "Okrika Crab", "Sapa Sleeper", "Landlord Lock", "Rent Is Due Crossface"];
const WRESTLING_STYLES = ["powerhouse", "high-flyer", "technician", "brawler"] as const;
const CATCHPHRASES = [
  "\"No wahala, only pain.\"", "\"Your village people cannot save you.\"", "\"I am the traffic.\"", "\"Rent is due!\"",
  "\"E go shock you.\"", "\"Na me get this ring.\"", "\"Pepper dem!\"", "\"Sapa will not catch me.\"",
  "\"Ask about me in Mushin.\"", "\"One chance, one slam.\"", "\"Light don go, you too don go.\"", "\"Respect the danfo.\"",
];

function wrestlerName(rng: Rng): { name: string; short: string } {
  const r = rng.next();
  if (r < 0.45) {
    const core = rng.pick(WRESTLER_CORES);
    return { name: `The ${core}`, short: core };
  }
  if (r < 0.9) {
    const name = `${rng.pick(WRESTLER_TITLES)} ${rng.pick(WRESTLER_WORDS)}`;
    return { name, short: name };
  }
  const name = rng.pick(WRESTLER_WORLD);
  return { name, short: name.replace(/^The /, "") };
}

const RING_COLOURS: readonly [string, string][] = [
  ["#dc2626", "#fde047"], ["#2563eb", "#ffffff"], ["#111827", "#f59e0b"], ["#f59e0b", "#111827"], ["#7c3aed", "#fde047"],
  ["#059669", "#ffffff"], ["#db2777", "#ffffff"], ["#ea580c", "#111827"], ["#0ea5e9", "#0b1d3a"], ["#ffffff", "#dc2626"],
  ["#9f1239", "#fbbf24"], ["#16a34a", "#facc15"], ["#475569", "#38bdf8"], ["#e11d48", "#111827"],
];

const fighterCache = new Map<string, FighterProfile>();

/** Everything public about a boxer or wrestler, from their name. */
export function fighterProfile(sport: "boxing" | "wrestling", name: string): FighterProfile {
  const key = `${sport}|${name}`;
  const hit = fighterCache.get(key);
  if (hit) return hit;
  const rng = rngFrom(`fighter:${key}`);
  const rating = Math.round(55 + 33 * ((rng.next() + rng.next() + rng.next()) / 3));
  const stat = () => Math.round(Math.max(40, Math.min(98, rating + rng.normal() * 7)));
  const hometown = rng.chance(0.8) ? rng.pick(TOWNS_NG) : rng.pick(TOWNS_WORLD);
  const [colour, colour2] = rng.pick(RING_COLOURS);
  let profile: FighterProfile;
  if (sport === "boxing") {
    const fights = rng.int(8, 34);
    const winShare = Math.min(0.97, Math.max(0.45, (rating - 40) / 52 + rng.normal() * 0.05));
    const wins = Math.min(fights, Math.round(fights * winShare));
    const draws = rng.chance(0.3) ? 1 : 0;
    const losses = Math.max(0, fights - wins - draws);
    const power = stat();
    const kos = Math.round(wins * Math.min(0.9, Math.max(0.2, (power - 35) / 70)));
    const height = rng.int(162, 198);
    profile = {
      name, sport, rating, power, speed: stat(), chin: stat(), engine: stat(), guard: stat(), style: rng.pick(STYLES_BOX),
      hometown, record: `${wins}-${losses}${draws ? `-${draws}` : ""} (${kos} KO)`, stance: rng.chance(0.25) ? "southpaw" : "orthodox",
      heightCm: height, reachCm: height + rng.int(-4, 10), weightKg: 0,
      signature: rng.pick(["left hook", "right hand", "uppercut", "jab", "body shot", "overhand right", "check hook"]),
      finisher: "", colour, colour2,
    };
  } else {
    const style = rng.pick(WRESTLING_STYLES);
    const sig = rng.pick(WRESTLING_SPECIALS);
    let fin = rng.pick(WRESTLING_SPECIALS);
    while (fin === sig) fin = rng.pick(WRESTLING_SPECIALS);
    const height = rng.int(172, 206);
    profile = {
      name, sport, rating, power: stat(), speed: stat(), chin: stat(), engine: stat(), guard: stat(), style, hometown,
      record: rng.pick(CATCHPHRASES), stance: style, heightCm: height, reachCm: height, weightKg: rng.int(85, 150),
      signature: rng.chance(0.25) ? rng.pick(WRESTLING_HOLDS) : sig, finisher: fin, colour, colour2,
    };
  }
  if (fighterCache.size > 500) fighterCache.clear();
  fighterCache.set(key, profile);
  return profile;
}

function fighterSides(sport: "boxing" | "wrestling", rng: Rng): [Side, Side] {
  const gen = () => (sport === "boxing" ? boxerName(rng) : wrestlerName(rng));
  const a = gen();
  let b = gen();
  for (let i = 0; i < 40 && (b.short === a.short || b.name === a.name); i++) b = gen();
  const pa = fighterProfile(sport, a.name);
  const pb = fighterProfile(sport, b.name);
  let awayCol: [string, string] = [pb.colour, pb.colour2];
  if (colourGap(awayCol[0], pa.colour) < 200) awayCol = colourGap("#2563eb", pa.colour) > 200 ? ["#2563eb", "#ffffff"] : ["#f59e0b", "#111827"];
  return [
    { name: a.name, short: a.short, colour: pa.colour, colour2: pa.colour2, roster: [a.name] },
    { name: b.name, short: b.short, colour: awayCol[0], colour2: awayCol[1], roster: [b.name] },
  ];
}

// ---------------------------------------------------------------- per slot

const LEAGUES_FOOTBALL = ["Eko Premier League", "Naija Super League", "Harmattan Cup", "Continental Cup", "Unity Shield", "Champions Trophy", "Atlantic Friendly"];
const LEAGUES_HOOPS = ["Naija Hoops League", "Eko Basketball Cup", "Atlantic Classic", "Pan-African Hoops", "Street Kings Series"];
const BILLS_WRESTLING = ["Friday Night Owambe", "Eko Rumble", "Mainland Mayhem", "Island Slam", "Naija Wrestling Federation", "Gbege Grand Prix"];
const WRESTLING_TYPES = ["Singles match", "Grudge match", "Title match", "Main event", "Street rules"];
const CUP_ROUNDS = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final"];

/** Both sides of a slot and the competition (all public). */
export function sidesFor(sport: Sport, slot: number): { home: Side; away: Side; league: string } {
  const rng = rngFrom(`slot:${sport}:${slot}`);
  if (sport === "football" || sport === "basketball") {
    const [home, away, derby] = teamSides(sport, rng);
    const comp = rng.pick(sport === "football" ? LEAGUES_FOOTBALL : LEAGUES_HOOPS);
    const stage = /Cup|Shield|Trophy|Classic/.test(comp) ? rng.pick(CUP_ROUNDS) : `Matchday ${(slot % 34) + 1}`;
    const league = derby && sport === "football" ? `Lagos derby · ${comp}` : `${comp} · ${stage}`;
    return { home, away, league };
  }
  const [home, away] = fighterSides(sport, rng);
  if (sport === "boxing") {
    const weight = rng.pick(WEIGHTS);
    const title = rng.chance(0.25) ? `${rng.pick(["Naija Boxing Council", "West African", "Commonwealth-style", "Eko Belt"])} title · ` : "";
    return { home, away, league: `${title}${weight} · 6 rounds` };
  }
  return { home, away, league: `${rng.pick(BILLS_WRESTLING)} · ${rng.pick(WRESTLING_TYPES)}` };
}

/** Last five results (public, a hint at form), newest last: "WWDLW". */
export function formGuide(sport: Sport, name: string, slot: number): string {
  const rating =
    sport === "football" || sport === "basketball" ? teamProfile(sport, name).rating : fighterProfile(sport, name).rating;
  const rng = rngFrom(`form:${sport}:${name}:${Math.floor(slot / 3)}`);
  let out = "";
  for (let i = 0; i < 5; i++) {
    const r = rng.next() + (rating - 73) / 60;
    out += sport === "football" && Math.abs(r - 0.5) < 0.13 ? "D" : r > 0.5 ? "W" : "L";
  }
  return out;
}

/** A stable small number from a name (used for tie-breaks that must look random but stay fixed). */
export function nameHash(name: string): number {
  return hashStr(name, 77);
}
