// Planning your home (docs/HOME_PLANNER.md): a floor plan on a grid of half-metre squares, one
// plan per floor (up to four), with rooms drawn as rectangles and furniture placed square by
// square and turned in quarter turns. The same plan is drawn flat in the editor and built in 3D.
// Pure data and rules, shared by the editor, the 3D view and the server (which checks every
// plan before saving it).

/** One grid square, in metres. */
export const CELL_M = 0.5;
export const MAX_FLOORS = 4;
export const MAX_ROOMS = 12;
export const MAX_ITEMS = 80;

/** How big the home is (its footprint, in squares). */
export const SIZES = {
  small: { label: "Small (7 × 6 m)", w: 14, d: 12 },
  medium: { label: "Medium (10 × 8 m)", w: 20, d: 16 },
  large: { label: "Large (14 × 11 m)", w: 28, d: 22 },
} as const;
export type HomeSize = keyof typeof SIZES;

export const ROOM_KINDS = ["living", "bedroom", "kitchen", "bathroom", "dining", "study", "hall", "balcony", "dancehall", "cinema", "gym", "games", "bar"] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];
export const ROOM_LABEL: Record<RoomKind, string> = {
  living: "Living room",
  bedroom: "Bedroom",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  dining: "Dining room",
  study: "Study",
  hall: "Hall",
  balcony: "Balcony",
  dancehall: "Dance hall",
  cinema: "Home cinema",
  gym: "Home gym",
  games: "Games room",
  bar: "Bar lounge",
};
/** Each room's floor colour (flat and in 3D). */
export const ROOM_FLOOR: Record<RoomKind, string> = {
  living: "#e9d8b4",
  bedroom: "#d8c3e6",
  kitchen: "#d3e4cf",
  bathroom: "#cfe3ec",
  dining: "#ecd2bd",
  study: "#dcd6c8",
  hall: "#e4e0d6",
  balcony: "#c9d1c3",
  dancehall: "#c9b6f2",
  cinema: "#e3b5b5",
  gym: "#bccbdc",
  games: "#b5dcc2",
  bar: "#e4cfa6",
};

/** The special rooms: built for fun, fitted out at a price (sound, lights, wiring), each with its own furniture. */
export const SPECIAL_ROOMS: RoomKind[] = ["dancehall", "cinema", "gym", "games", "bar"];
export const isSpecialRoom = (k: RoomKind) => SPECIAL_ROOMS.includes(k);
/** The smallest a special room can be, in squares each way (a dance hall: 4 × 4 m). */
export const ROOM_MIN: Partial<Record<RoomKind, number>> = { dancehall: 8, cinema: 7, gym: 6, games: 7, bar: 6 };
export const roomMin = (k: RoomKind) => ROOM_MIN[k] ?? 2;
/** Fitting out a special room (naira, Lagos 2026): sound-proofing, wiring, lights, the floor. The furniture is extra. */
export const ROOM_NAIRA: Partial<Record<RoomKind, number>> = {
  dancehall: 5_000_000,
  cinema: 4_000_000,
  gym: 2_000_000,
  games: 1_500_000,
  bar: 2_500_000,
};

/** What you can put in: its size in squares (wide × deep, before turning), height in metres, colour, and price (naira, Lagos 2026). */
export const FURNITURE = {
  bed: { label: "Bed", w: 4, d: 4, h: 0.55, colour: "#8d6e63", naira: 450_000 },
  single: { label: "Single bed", w: 2, d: 4, h: 0.5, colour: "#a1887f", naira: 220_000 },
  sofa: { label: "Sofa", w: 4, d: 2, h: 0.8, colour: "#5c7cfa", naira: 650_000 },
  armchair: { label: "Armchair", w: 2, d: 2, h: 0.8, colour: "#748ffc", naira: 180_000 },
  table: { label: "Table", w: 3, d: 2, h: 0.75, colour: "#a0785a", naira: 250_000 },
  chair: { label: "Chair", w: 1, d: 1, h: 0.9, colour: "#8d6e63", naira: 45_000 },
  desk: { label: "Desk", w: 3, d: 2, h: 0.75, colour: "#795548", naira: 180_000 },
  tv: { label: "TV", w: 3, d: 1, h: 1.1, colour: "#212529", naira: 380_000 },
  wardrobe: { label: "Wardrobe", w: 3, d: 2, h: 2, colour: "#6d4c41", naira: 350_000 },
  shelf: { label: "Shelf", w: 2, d: 1, h: 1.8, colour: "#8d6e63", naira: 90_000 },
  fridge: { label: "Fridge", w: 2, d: 2, h: 1.8, colour: "#dee2e6", naira: 520_000 },
  cooker: { label: "Cooker", w: 2, d: 2, h: 0.9, colour: "#adb5bd", naira: 320_000 },
  counter: { label: "Counter", w: 4, d: 2, h: 0.9, colour: "#ced4da", naira: 400_000 },
  sink: { label: "Sink", w: 2, d: 1, h: 0.9, colour: "#e9ecef", naira: 150_000 },
  toilet: { label: "Toilet", w: 1, d: 2, h: 0.8, colour: "#f8f9fa", naira: 180_000 },
  shower: { label: "Shower", w: 2, d: 2, h: 2.1, colour: "#a5d8ff", naira: 250_000 },
  bath: { label: "Bath", w: 4, d: 2, h: 0.6, colour: "#f1f3f5", naira: 480_000 },
  rug: { label: "Rug", w: 4, d: 3, h: 0.02, colour: "#e64980", naira: 120_000 },
  plant: { label: "Plant", w: 1, d: 1, h: 1.2, colour: "#2f9e44", naira: 25_000 },
  lamp: { label: "Lamp", w: 1, d: 1, h: 1.6, colour: "#ffd43b", naira: 40_000 },
  fan: { label: "Standing fan", w: 1, d: 1, h: 1.3, colour: "#868e96", naira: 45_000 },
  stairs: { label: "Stairs", w: 2, d: 5, h: 2.8, colour: "#b08968", naira: 1_500_000 },
  coffee: { label: "Coffee table", w: 2, d: 2, h: 0.42, colour: "#8d6e63", naira: 95_000 },
  sideboard: { label: "Sideboard", w: 3, d: 1, h: 0.75, colour: "#a1887f", naira: 210_000 },
  nightstand: { label: "Bedside table", w: 1, d: 1, h: 0.55, colour: "#8d6e63", naira: 60_000 },
  art: { label: "Wall art", w: 2, d: 1, h: 1.6, colour: "#e8590c", naira: 85_000 },
  mirror: { label: "Mirror", w: 2, d: 1, h: 1.6, colour: "#a5d8ff", naira: 70_000 },
  clock: { label: "Wall clock", w: 1, d: 1, h: 1.9, colour: "#495057", naira: 30_000 },
  // For the special rooms.
  dancefloor: { label: "Light-up dance floor", w: 4, d: 4, h: 0.08, colour: "#be4bdb", naira: 1_800_000 },
  djbooth: { label: "DJ booth", w: 4, d: 2, h: 1.1, colour: "#343a40", naira: 2_800_000 },
  speaker: { label: "Big speaker", w: 1, d: 1, h: 1.4, colour: "#212529", naira: 650_000 },
  discoball: { label: "Disco ball", w: 1, d: 1, h: 2.4, colour: "#ced4da", naira: 180_000 },
  partylight: { label: "Party lights", w: 1, d: 1, h: 2, colour: "#f783ac", naira: 350_000 },
  screen: { label: "Cinema screen", w: 6, d: 1, h: 2.2, colour: "#e9ecef", naira: 3_200_000 },
  recliner: { label: "Cinema seat", w: 2, d: 2, h: 1, colour: "#c92a2a", naira: 850_000 },
  popcorn: { label: "Popcorn machine", w: 1, d: 1, h: 1.5, colour: "#fab005", naira: 420_000 },
  treadmill: { label: "Treadmill", w: 2, d: 4, h: 1.4, colour: "#495057", naira: 1_900_000 },
  bike: { label: "Exercise bike", w: 1, d: 2, h: 1.2, colour: "#868e96", naira: 750_000 },
  weights: { label: "Weights bench", w: 4, d: 3, h: 1.2, colour: "#c92a2a", naira: 950_000 },
  dumbbells: { label: "Dumbbell rack", w: 3, d: 1, h: 0.9, colour: "#343a40", naira: 450_000 },
  gymmat: { label: "Exercise mat", w: 2, d: 4, h: 0.02, colour: "#4dabf7", naira: 60_000 },
  pooltable: { label: "Pool table", w: 5, d: 3, h: 0.9, colour: "#2f9e44", naira: 3_500_000 },
  arcade: { label: "Arcade machine", w: 2, d: 2, h: 1.8, colour: "#7048e8", naira: 1_600_000 },
  dartboard: { label: "Dartboard", w: 1, d: 1, h: 1.7, colour: "#e03131", naira: 45_000 },
  homebar: { label: "Bar counter", w: 4, d: 2, h: 1.1, colour: "#5c3d2e", naira: 2_200_000 },
  barstool: { label: "Bar stool", w: 1, d: 1, h: 0.75, colour: "#adb5bd", naira: 90_000 },
  jukebox: { label: "Jukebox", w: 2, d: 1, h: 1.5, colour: "#a61e4d", naira: 1_200_000 },
} as const;
export type FurnitureKind = keyof typeof FURNITURE;

/** Hung on a wall (above the floor): they don't get in the way of what stands below. */
export const ON_WALL = new Set<FurnitureKind>(["art", "mirror", "clock", "screen", "dartboard"]);
/** Lying flat on the floor: things stand on a rug, people dance on the dance floor. */
export const UNDERFOOT = new Set<FurnitureKind>(["rug", "dancefloor", "gymmat"]);
/** Hung from the ceiling. */
export const OVERHEAD = new Set<FurnitureKind>(["discoball"]);
/** Lying flat or hung up: nothing bumps into them. */
export const NOT_SOLID = new Set<FurnitureKind>([...UNDERFOOT, ...ON_WALL, ...OVERHEAD]);

/** The furniture list, by room (a piece can be in more than one). */
export const FURNITURE_GROUPS: { label: string; kinds: FurnitureKind[] }[] = [
  { label: "Living", kinds: ["sofa", "armchair", "coffee", "tv", "sideboard", "shelf", "rug", "lamp", "fan"] },
  { label: "Bedroom", kinds: ["bed", "single", "nightstand", "wardrobe", "desk", "chair", "lamp", "mirror"] },
  { label: "Kitchen", kinds: ["counter", "cooker", "fridge", "sink", "table", "chair"] },
  { label: "Bathroom", kinds: ["toilet", "shower", "bath", "sink", "mirror"] },
  { label: "Decor", kinds: ["plant", "art", "mirror", "clock", "rug", "lamp"] },
  { label: "Dance hall", kinds: ["dancefloor", "djbooth", "speaker", "discoball", "partylight", "jukebox"] },
  { label: "Cinema", kinds: ["screen", "recliner", "popcorn", "speaker"] },
  { label: "Gym", kinds: ["treadmill", "bike", "weights", "dumbbells", "gymmat", "mirror"] },
  { label: "Games", kinds: ["pooltable", "arcade", "dartboard", "jukebox"] },
  { label: "Bar", kinds: ["homebar", "barstool", "jukebox", "sofa", "coffee"] },
  { label: "Building", kinds: ["stairs"] },
];

export type PlanRoom = { id: number; kind: RoomKind; x: number; y: number; w: number; d: number };
/** rot: quarter turns clockwise (0–3). x, y: the top-left square it covers. */
export type PlanItem = { id: number; kind: FurnitureKind; x: number; y: number; rot: number };
export type PlanFloor = { rooms: PlanRoom[]; items: PlanItem[] };
export type HomePlan = { v: 1; size: HomeSize; floors: PlanFloor[] };

/** The squares an item covers once turned. */
export function itemSize(item: Pick<PlanItem, "kind" | "rot">) {
  const f = FURNITURE[item.kind];
  return item.rot % 2 === 0 ? { w: f.w, d: f.d } : { w: f.d, d: f.w };
}

/** A starter home: a living room, a bedroom, a kitchen and a bathroom, a few things in each. */
export function starterPlan(size: HomeSize = "medium"): HomePlan {
  const { w, d } = SIZES[size];
  const half = Math.floor(w / 2);
  const back = Math.floor(d * 0.55);
  const rooms: PlanRoom[] = [
    { id: 1, kind: "living", x: 0, y: back, w: half + 2, d: d - back },
    { id: 2, kind: "bedroom", x: 0, y: 0, w: half, d: back },
    { id: 3, kind: "kitchen", x: half + 2, y: back, w: w - half - 2, d: d - back },
    { id: 4, kind: "bathroom", x: half, y: 0, w: w - half, d: back },
  ];
  const items: PlanItem[] = [
    { id: 1, kind: "sofa", x: 1, y: d - 3, rot: 0 },
    { id: 2, kind: "tv", x: 1, y: back + 1, rot: 0 },
    { id: 3, kind: "rug", x: 1, y: back + 2, rot: 0 },
    { id: 4, kind: "bed", x: 1, y: 1, rot: 0 },
    { id: 5, kind: "wardrobe", x: half - 2, y: 1, rot: 1 },
    { id: 6, kind: "fridge", x: w - 3, y: back + 1, rot: 0 },
    { id: 7, kind: "cooker", x: w - 5, y: back + 1, rot: 0 },
    { id: 8, kind: "toilet", x: w - 2, y: 1, rot: 0 },
    { id: 9, kind: "shower", x: half + 1, y: 1, rot: 0 },
  ];
  return { v: 1, size, floors: [{ rooms, items: items.filter((i) => fits(i, w, d)) }] };
}

const fits = (i: PlanItem, w: number, d: number) => {
  const s = itemSize(i);
  return i.x >= 0 && i.y >= 0 && i.x + s.w <= w && i.y + s.d <= d;
};

/** Keep a value a whole number between lo and hi. */
const clampInt = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

/**
 * A plan made safe: anything unknown dropped, everything kept inside the home, ids made unique.
 * Returns null if it isn't a plan at all. Used before saving and after loading.
 */
export function cleanPlan(raw: unknown): HomePlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { size?: unknown; floors?: unknown };
  const size: HomeSize = typeof r.size === "string" && r.size in SIZES ? (r.size as HomeSize) : "medium";
  if (!Array.isArray(r.floors) || r.floors.length === 0) return null;
  const { w, d } = SIZES[size];
  const floors: PlanFloor[] = r.floors.slice(0, MAX_FLOORS).map((f) => {
    const fl = (f ?? {}) as { rooms?: unknown; items?: unknown };
    const rooms: PlanRoom[] = [];
    for (const x of Array.isArray(fl.rooms) ? fl.rooms.slice(0, MAX_ROOMS) : []) {
      const o = (x ?? {}) as Record<string, unknown>;
      if (!ROOM_KINDS.includes(o.kind as RoomKind)) continue;
      const rx = clampInt(o.x, 0, w - 2);
      const ry = clampInt(o.y, 0, d - 2);
      rooms.push({ id: rooms.length + 1, kind: o.kind as RoomKind, x: rx, y: ry, w: clampInt(o.w, 2, w - rx), d: clampInt(o.d, 2, d - ry) });
    }
    const items: PlanItem[] = [];
    for (const x of Array.isArray(fl.items) ? fl.items.slice(0, MAX_ITEMS) : []) {
      const o = (x ?? {}) as Record<string, unknown>;
      if (typeof o.kind !== "string" || !(o.kind in FURNITURE)) continue;
      const kind = o.kind as FurnitureKind;
      const rot = clampInt(o.rot, 0, 3);
      const s = itemSize({ kind, rot });
      if (s.w > w || s.d > d) continue;
      items.push({ id: items.length + 1, kind, rot, x: clampInt(o.x, 0, w - s.w), y: clampInt(o.y, 0, d - s.d) });
    }
    return { rooms, items };
  });
  return { v: 1, size, floors };
}

/** Which room a square is in on a floor (the last drawn wins), or null. */
export function roomAt(floor: PlanFloor, x: number, y: number): PlanRoom | null {
  for (let i = floor.rooms.length - 1; i >= 0; i--) {
    const r = floor.rooms[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.d) return r;
  }
  return null;
}

/** Items on a floor that overlap another one (shown in red, so you can tidy them). Rugs lie under things. */
export function clashes(floor: PlanFloor): Set<number> {
  const out = new Set<number>();
  const solid = floor.items.filter((i) => !NOT_SOLID.has(i.kind));
  for (let a = 0; a < solid.length; a++)
    for (let b = a + 1; b < solid.length; b++) {
      const A = solid[a];
      const B = solid[b];
      const sa = itemSize(A);
      const sb = itemSize(B);
      if (A.x < B.x + sb.w && B.x < A.x + sa.w && A.y < B.y + sb.d && B.y < A.y + sa.d) {
        out.add(A.id);
        out.add(B.id);
      }
    }
  return out;
}

/** The next free id in a list. */
export const nextId = (list: { id: number }[]) => list.reduce((m, x) => Math.max(m, x.id), 0) + 1;

// ---------------------------------------------------------------- what building onto your home costs

/** Building one more floor: naira per square metre (Lagos 2026: blocks, concrete, roofing, finishing). */
export const FLOOR_NAIRA_M2 = 180_000;
/** How much of what you spend is added to your home's value: a floor most of it, furniture some. */
export const FLOOR_VALUE_SHARE = 0.9;
export const FURNITURE_VALUE_SHARE = 0.5;
/** Fitting out a special room is building work: most of it is added to the value. */
export const ROOM_VALUE_SHARE = 0.8;

/**
 * What you've paid for: how many floors, how many of each piece, and how many of each special
 * room you've had fitted out (taking one out doesn't sell it). `rooms` is missing from records
 * saved before special rooms existed.
 */
export type PlanPaid = { floors: number; items: Partial<Record<FurnitureKind, number>>; rooms?: Partial<Record<RoomKind, number>> };

const countItems = (plan: HomePlan) => {
  const out: Partial<Record<FurnitureKind, number>> = {};
  for (const f of plan.floors) for (const i of f.items) out[i.kind] = (out[i.kind] ?? 0) + 1;
  return out;
};
/** How many of each special room the plan has (over every floor). */
const countRooms = (plan: HomePlan) => {
  const out: Partial<Record<RoomKind, number>> = {};
  for (const f of plan.floors) for (const r of f.rooms) if (ROOM_NAIRA[r.kind]) out[r.kind] = (out[r.kind] ?? 0) + 1;
  return out;
};

/**
 * A new home comes with its ground floor and the starter furniture of its own size (a small home
 * isn't credited with what a large one starts with), and no special rooms.
 */
export function startPaid(size: HomeSize = "medium"): PlanPaid {
  return { floors: 1, items: countItems(starterPlan(size)), rooms: {} };
}

/** Paid-for record from the database, made safe, with the starter furniture for a home of this size. */
export function cleanPaid(raw: unknown, size: HomeSize = "medium"): PlanPaid {
  const base = startPaid(size);
  const r = (raw ?? {}) as { floors?: unknown; items?: Record<string, unknown>; rooms?: Record<string, unknown> };
  const floors = Math.max(1, Math.min(MAX_FLOORS, Math.round(Number(r.floors) || 1)));
  const items = { ...base.items };
  for (const [k, v] of Object.entries(r.items ?? {})) if (k in FURNITURE) items[k as FurnitureKind] = Math.max(items[k as FurnitureKind] ?? 0, Math.min(MAX_ITEMS * MAX_FLOORS, Math.round(Number(v) || 0)));
  const rooms: Partial<Record<RoomKind, number>> = {};
  for (const [k, v] of Object.entries(r.rooms && typeof r.rooms === "object" ? r.rooms : {})) {
    const n = Math.max(0, Math.min(MAX_ROOMS * MAX_FLOORS, Math.round(Number(v) || 0)));
    if (ROOM_NAIRA[k as RoomKind] && n) rooms[k as RoomKind] = n;
  }
  return { floors, items, rooms };
}

/** Everything in a plan, as paid for (a home given furnished: nothing in it is charged for later). */
export function paidFor(plan: HomePlan): PlanPaid {
  return { floors: plan.floors.length, items: countItems(plan), rooms: countRooms(plan) };
}

/** Two paid-for records together: the most of each. */
export function mergePaid(a: PlanPaid, b: PlanPaid): PlanPaid {
  const items = { ...a.items };
  for (const [k, v] of Object.entries(b.items)) items[k as FurnitureKind] = Math.max(items[k as FurnitureKind] ?? 0, v ?? 0);
  const rooms = { ...(a.rooms ?? {}) };
  for (const [k, v] of Object.entries(b.rooms ?? {})) rooms[k as RoomKind] = Math.max(rooms[k as RoomKind] ?? 0, v ?? 0);
  return { floors: Math.max(a.floors, b.floors), items, rooms };
}

/**
 * The home a starter pack gives (docs/PACKS.md): "home", fully furnished on one floor; "dancehall",
 * two floors, fully furnished, with a dance hall upstairs. The same every time for the same player.
 */
export function packHomePlan(gift: "home" | "dancehall", seed: number): HomePlan {
  return gift === "dancehall" ? autoDesign("large", 2, seed, ["dancehall"]) : autoDesign("medium", 1, seed);
}

export const floorNaira = (size: HomeSize) => SIZES[size].w * SIZES[size].d * CELL_M * CELL_M * FLOOR_NAIRA_M2;

export type PlanBill = {
  /** What's new, line by line. */
  lines: { label: string; count: number; naira: number }[];
  naira: number;
  /** What it adds to the home's value (naira). */
  valueNaira: number;
  /** Everything paid for once this is paid. */
  paid: PlanPaid;
};

/** What saving this plan costs: the floors, special rooms and furniture beyond what you've already paid for. */
export function planBill(plan: HomePlan, given: PlanPaid): PlanBill {
  // The plan's own size decides the starter furniture that comes free.
  const paid = cleanPaid(given, plan.size);
  const lines: PlanBill["lines"] = [];
  let naira = 0;
  let valueNaira = 0;
  const newFloors = Math.max(0, plan.floors.length - paid.floors);
  if (newFloors) {
    const each = floorNaira(plan.size);
    lines.push({ label: newFloors === 1 ? "A new floor" : "New floors", count: newFloors, naira: each * newFloors });
    naira += each * newFloors;
    valueNaira += each * newFloors * FLOOR_VALUE_SHARE;
  }
  const haveRooms = countRooms(plan);
  const rooms = { ...(paid.rooms ?? {}) };
  for (const k of SPECIAL_ROOMS) {
    const extra = Math.max(0, (haveRooms[k] ?? 0) - (paid.rooms?.[k] ?? 0));
    const each = ROOM_NAIRA[k] ?? 0;
    if (!extra || !each) continue;
    lines.push({ label: `${ROOM_LABEL[k]} fit-out`, count: extra, naira: each * extra });
    naira += each * extra;
    valueNaira += each * extra * ROOM_VALUE_SHARE;
    rooms[k] = haveRooms[k];
  }
  const have = countItems(plan);
  const items = { ...paid.items };
  for (const k of Object.keys(FURNITURE) as FurnitureKind[]) {
    const extra = Math.max(0, (have[k] ?? 0) - (paid.items[k] ?? 0));
    if (!extra) continue;
    const cost = FURNITURE[k].naira * extra;
    lines.push({ label: FURNITURE[k].label, count: extra, naira: cost });
    naira += cost;
    valueNaira += cost * (k === "stairs" ? FLOOR_VALUE_SHARE : FURNITURE_VALUE_SHARE);
    items[k] = have[k];
  }
  return { lines, naira, valueNaira, paid: { floors: Math.max(paid.floors, plan.floors.length), items, rooms } };
}

/** Whether a home has a dance hall (on any floor): a place to dance at home. */
export const homeHasDanceHall = (plan: HomePlan | null | undefined) => !!plan?.floors.some((f) => f.rooms.some((r) => r.kind === "dancehall"));

/**
 * Where a floor's dance floor is (in squares): round all the light-up tiles in its first dance
 * hall, or the middle of the hall if it has none yet. Null if the floor has no dance hall.
 */
export function danceFloorOf(floor: PlanFloor): { x: number; y: number; w: number; d: number } | null {
  const hall = floor.rooms.find((r) => r.kind === "dancehall");
  if (!hall) return null;
  const tiles = floor.items.filter((i) => i.kind === "dancefloor" && roomAt(floor, i.x + 1, i.y + 1)?.id === hall.id);
  if (!tiles.length) return { x: hall.x + 1, y: hall.y + 1, w: Math.max(1, hall.w - 2), d: Math.max(1, hall.d - 2) };
  const x0 = Math.min(...tiles.map((t) => t.x)), y0 = Math.min(...tiles.map((t) => t.y));
  const x1 = Math.max(...tiles.map((t) => t.x + itemSize(t).w)), y1 = Math.max(...tiles.map((t) => t.y + itemSize(t).d));
  return { x: x0, y: y0, w: x1 - x0, d: y1 - y0 };
}

// ---------------------------------------------------------------- designing it for you

/** A little seeded random (the same seed, the same design). */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- walls and doorways

/** A wall between two squares' edges (in squares: from x0,y0 to x1,y1, straight). */
export type PlanWall = { x0: number; y0: number; x1: number; y1: number };
/** A doorway: where it starts, along x or y, and how many squares wide. */
export type PlanDoor = { x: number; y: number; along: "x" | "y"; len: number };

/**
 * The inside walls of a floor: wherever two rooms meet (or a room meets the open floor), with
 * one doorway (a metre wide) in the middle of where each pair meets, so every room can be walked
 * into. The outside walls are the home's own, not listed here.
 */
export function planWalls(floor: PlanFloor, size: HomeSize): { walls: PlanWall[]; doors: PlanDoor[] } {
  const { w, d } = SIZES[size];
  const own = new Int32Array(w * d);
  for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) own[y * w + x] = roomAt(floor, x, y)?.id ?? 0;
  // Each boundary edge, by the pair of rooms it divides. Vertical edges: x is the line; horizontal: y.
  type Edge = { line: number; at: number; along: "x" | "y" };
  const pairs = new Map<string, Edge[]>();
  const add = (a: number, b: number, e: Edge) => {
    const key = `${Math.min(a, b)}|${Math.max(a, b)}|${e.along}|${e.line}`;
    (pairs.get(key) ?? pairs.set(key, []).get(key)!).push(e);
  };
  for (let y = 0; y < d; y++) for (let x = 1; x < w; x++) { const a = own[y * w + x - 1], b = own[y * w + x]; if (a !== b) add(a, b, { line: x, at: y, along: "y" }); }
  for (let y = 1; y < d; y++) for (let x = 0; x < w; x++) { const a = own[(y - 1) * w + x], b = own[y * w + x]; if (a !== b) add(a, b, { line: y, at: x, along: "x" }); }
  // The longest straight run for each pair of rooms gets the doorway.
  const best = new Map<string, { key: string; start: number; len: number }>();
  const runs: { key: string; along: "x" | "y"; line: number; start: number; len: number }[] = [];
  for (const [key, edges] of pairs) {
    const along = edges[0].along, line = edges[0].line;
    const ats = edges.map((e) => e.at).sort((a, b) => a - b);
    let i = 0;
    while (i < ats.length) {
      let j = i;
      while (j + 1 < ats.length && ats[j + 1] === ats[j] + 1) j++;
      const run = { key, along, line, start: ats[i], len: j - i + 1 };
      runs.push(run);
      const pair = key.split("|").slice(0, 2).join("|");
      const b = best.get(pair);
      if (!b || run.len > b.len) best.set(pair, { key: `${key}@${run.start}`, start: run.start, len: run.len });
      i = j + 1;
    }
  }
  const walls: PlanWall[] = [];
  const doors: PlanDoor[] = [];
  for (const r of runs) {
    const pair = r.key.split("|").slice(0, 2).join("|");
    const hasDoor = best.get(pair)?.key === `${r.key}@${r.start}` && r.len >= 2;
    const piece = (a: number, b: number) => {
      if (b <= a) return;
      walls.push(r.along === "y" ? { x0: r.line, y0: a, x1: r.line, y1: b } : { x0: a, y0: r.line, x1: b, y1: r.line });
    };
    if (!hasDoor) piece(r.start, r.start + r.len);
    else {
      const dl = Math.min(2, r.len);
      const ds = r.start + Math.floor((r.len - dl) / 2);
      piece(r.start, ds);
      piece(ds + dl, r.start + r.len);
      doors.push(r.along === "y" ? { x: r.line, y: ds, along: "y", len: dl } : { x: ds, y: r.line, along: "x", len: dl });
    }
  }
  return { walls, doors };
}

// ---------------------------------------------------------------- furnishing a room

const overlaps = (a: { x: number; y: number; w: number; d: number }, b: { x: number; y: number; w: number; d: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

type Box = { x: number; y: number; w: number; d: number };

/**
 * Furnish one room the way people arrange them: the TV facing the sofa across a rug and coffee
 * table, the bed in the middle of a wall with a bedside table each side, chairs round the dining
 * table, the kitchen in a run along one wall, a basin with a mirror over it; then plants, lamps
 * and art on the walls. Doorways stay clear. Adds to `floor.items`; returns how many went in.
 */
export function furnishRoom(floor: PlanFloor, room: PlanRoom, seed = 1, size: HomeSize = "medium"): number {
  const rand = rng(seed * 7919 + room.id * 104729);
  const { doors } = planWalls(floor, size);
  // Keep a square and a half clear on both sides of every doorway into this room.
  const clear: Box[] = doors.map((dr) => (dr.along === "y" ? { x: dr.x - 2, y: dr.y, w: 4, d: dr.len } : { x: dr.x, y: dr.y - 2, w: dr.len, d: 4 }));
  // Nothing hung on the wall right beside a doorway.
  const doorBands: Box[] = doors.map((dr) => (dr.along === "y" ? { x: dr.x - 1, y: dr.y - 1, w: 2, d: dr.len + 2 } : { x: dr.x - 1, y: dr.y - 1, w: dr.len + 2, d: 2 }));
  const before = floor.items.length;
  const inRoom = (c: Box) => c.x >= room.x && c.y >= room.y && c.x + c.w <= room.x + room.w && c.y + c.d <= room.y + room.d;
  const boxOf = (i: PlanItem): Box => ({ ...itemSize(i), x: i.x, y: i.y });
  /** Put one in if it fits there (and return it), or null. */
  const put = (kind: FurnitureKind, x: number, y: number, rot: number): PlanItem | null => {
    const it: PlanItem = { id: nextId(floor.items), kind, x, y, rot: ((rot % 4) + 4) % 4 };
    const c = boxOf(it);
    if (!inRoom(c)) return null;
    if (ON_WALL.has(kind)) {
      if (floor.items.some((o) => ON_WALL.has(o.kind) && overlaps(c, boxOf(o)))) return null;
      if (doorBands.some((b) => overlaps(c, b))) return null;
    } else if (UNDERFOOT.has(kind)) {
      if (floor.items.some((o) => UNDERFOOT.has(o.kind) && overlaps(c, boxOf(o)))) return null;
    } else if (OVERHEAD.has(kind)) {
      if (floor.items.some((o) => OVERHEAD.has(o.kind) && overlaps(c, boxOf(o)))) return null;
    } else {
      // Nothing stands on the dance floor.
      if (floor.items.some((o) => (!NOT_SOLID.has(o.kind) || o.kind === "dancefloor") && overlaps(c, boxOf(o)))) return null;
      if (clear.some((b) => overlaps(c, b))) return null;
    }
    floor.items.push(it);
    return it;
  };
  /**
   * Against a wall of the room (side 0 top, 1 right, 2 bottom, 3 left), its back to the wall, at
   * `u` (0..1) along it, nudged along until it fits. rot follows the wall.
   */
  const onWallSide = (kind: FurnitureKind, side: number, u = 0.5, inset = 0): PlanItem | null => {
    const rot = side;
    const s = itemSize({ kind, rot });
    const span = side % 2 === 0 ? room.w - s.w : room.d - s.d;
    if (span < 0) return null;
    const want = Math.round(span * u);
    for (let k = 0; k <= span; k++) {
      for (const o of k === 0 ? [0] : [k, -k]) {
        const t = want + o;
        if (t < 0 || t > span) continue;
        const x = side === 0 || side === 2 ? room.x + t : side === 1 ? room.x + room.w - s.w - inset : room.x + inset;
        const y = side === 1 || side === 3 ? room.y + t : side === 0 ? room.y + inset : room.y + room.d - s.d - inset;
        const got = put(kind, x, y, rot);
        if (got) return got;
      }
    }
    return null;
  };
  /** The sides, longest first (ties shuffled), so the big pieces get the best walls. */
  const sides = [0, 1, 2, 3].sort((a, b) => (b % 2 === 0 ? room.w : room.d) - (a % 2 === 0 ? room.w : room.d) || rand() - 0.5);
  const opp = (side: number) => (side + 2) % 4;
  /** Something against the first wall that takes it. */
  const anyWall = (kind: FurnitureKind, list = sides, u = 0.5) => {
    for (const sd of list) {
      const got = onWallSide(kind, sd, u);
      if (got) return { got, side: sd };
    }
    return null;
  };
  /** A wall piece (art, a mirror, a clock) on the wall behind something. */
  const above = (kind: FurnitureKind, it: PlanItem | null) => {
    if (!it) return;
    const s = itemSize(it);
    const a = itemSize({ kind, rot: it.rot });
    const cx = it.x + Math.floor((s.w - a.w) / 2), cy = it.y + Math.floor((s.d - a.d) / 2);
    const x = it.rot === 1 ? room.x + room.w - a.w : it.rot === 3 ? room.x : cx;
    const y = it.rot === 0 ? room.y : it.rot === 2 ? room.y + room.d - a.d : cy;
    put(kind, x, y, it.rot);
  };
  const corners = () => [
    [room.x, room.y],
    [room.x + room.w - 1, room.y],
    [room.x, room.y + room.d - 1],
    [room.x + room.w - 1, room.y + room.d - 1],
  ].sort(() => rand() - 0.5);
  const inCorner = (kind: FurnitureKind, n = 1) => {
    let got = 0;
    for (const [x, y] of corners()) if (got < n && put(kind, x, y, 0)) got++;
    return got;
  };
  /** Put one in measured from a wall: `t` squares along it, `depth` squares out from it. */
  const fromWall = (kind: FurnitureKind, side: number, t: number, depth: number, rot: number) => {
    const s = itemSize({ kind, rot });
    const x = side === 0 || side === 2 ? room.x + t : side === 1 ? room.x + room.w - depth - s.w : room.x + depth;
    const y = side === 1 || side === 3 ? room.y + t : side === 0 ? room.y + depth : room.y + room.d - depth - s.d;
    return put(kind, x, y, rot);
  };
  /** Put one in just in front of something (centred on it, `gap` squares out), turned the same way. */
  const inFront = (kind: FurnitureKind, it: PlanItem, gap = 0) => {
    const s = itemSize(it);
    const a = itemSize({ kind, rot: it.rot });
    const cx = it.x + Math.floor((s.w - a.w) / 2), cy = it.y + Math.floor((s.d - a.d) / 2);
    const x = it.rot === 1 ? it.x - a.w - gap : it.rot === 3 ? it.x + s.w + gap : cx;
    const y = it.rot === 0 ? it.y + s.d + gap : it.rot === 2 ? it.y - a.d - gap : cy;
    return put(kind, x, y, it.rot);
  };
  /** Put one in the middle of the room, or as near it as it fits (clear of the doorways). */
  const inMiddle = (kind: FurnitureKind, rot: number) => {
    const s = itemSize({ kind, rot });
    const mx = room.x + Math.floor((room.w - s.w) / 2), my = room.y + Math.floor((room.d - s.d) / 2);
    for (let r = 0; r <= 2; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const got = put(kind, mx + dx, my + dy, rot);
          if (got) return got;
        }
    return null;
  };
  /** Squares along a wall, and out from it. */
  const lenOf = (side: number) => (side % 2 === 0 ? room.w : room.d);
  const deepOf = (side: number) => (side % 2 === 0 ? room.d : room.w);

  switch (room.kind) {
    case "living": {
      // The TV on one long wall, the sofa facing it across the room, a rug and a coffee table between.
      const tv = anyWall("tv");
      if (tv) {
        const across = opp(tv.side);
        // Not too far from the screen: about three metres at most.
        const L = tv.side % 2 === 0 ? room.d : room.w;
        const inset = Math.max(0, L - 1 - 2 - 6);
        const sofa = onWallSide("sofa", across, 0.5, inset) ?? onWallSide("sofa", across, 0.5, 0);
        if (sofa) {
          above("art", sofa);
          // The rug and the coffee table in the middle, between them.
          const midX = Math.round((tv.got.x + sofa.x) / 2), midY = Math.round((tv.got.y + sofa.y) / 2);
          const rr = tv.side % 2 === 0 ? 0 : 1;
          const rs = itemSize({ kind: "rug", rot: rr });
          put("rug", midX - Math.floor(rs.w / 2) + 1, midY - Math.floor(rs.d / 2) + 1, rr);
          const cs = itemSize({ kind: "coffee", rot: 0 });
          put("coffee", midX - Math.floor(cs.w / 2) + 1, midY - Math.floor(cs.d / 2) + 1, 0) ?? put("coffee", midX, midY, 0);
          // An armchair beside the rug, a lamp by the sofa.
          for (const sd of [(tv.side + 1) % 4, (tv.side + 3) % 4]) if (onWallSide("armchair", sd, 0.5)) break;
          const ls = sofa.rot % 2 === 0 ? [sofa.x - 1, sofa.y] : [sofa.x, sofa.y - 1];
          put("lamp", ls[0], ls[1], 0) ?? put("lamp", sofa.x + itemSize(sofa).w, sofa.y, 0);
        }
        // Something beside the TV.
        put("plant", tv.got.x - 1, tv.got.y, 0) ?? put("plant", tv.got.x + itemSize(tv.got).w, tv.got.y, 0);
      }
      anyWall("shelf", sides.slice().reverse()) ?? anyWall("sideboard");
      inCorner("plant", 2);
      anyWall("clock", sides.slice().reverse(), 0.2);
      break;
    }
    case "bedroom": {
      // The bed in the middle of a wall (a single in a small room), a bedside table each side.
      const kind = room.w < 7 && room.d < 7 ? "single" : "bed";
      const bed = anyWall(kind, sides.slice().sort((a, b) => (a % 2 === 0 ? room.w : room.d) - (b % 2 === 0 ? room.w : room.d)));
      if (bed) {
        above("art", bed.got);
        const bs = itemSize(bed.got);
        const hor = bed.side % 2 === 0;
        put("nightstand", hor ? bed.got.x - 1 : bed.got.x, hor ? bed.got.y : bed.got.y - 1, bed.side);
        put("nightstand", hor ? bed.got.x + bs.w : bed.got.x, hor ? bed.got.y : bed.got.y + bs.d, bed.side);
        const foot = opp(bed.side);
        put("rug", hor ? bed.got.x : bed.side === 1 ? bed.got.x - 3 : bed.got.x + bs.w, hor ? (bed.side === 0 ? bed.got.y + bs.d : bed.got.y - 3) : bed.got.y, hor ? 0 : 1);
        anyWall("wardrobe", [foot, (bed.side + 1) % 4, (bed.side + 3) % 4]);
      }
      const desk = anyWall("desk", sides.slice().reverse(), 0.3);
      if (desk) {
        const s = itemSize(desk.got);
        const front = [[0, s.d], [-1, 0], [0, -1], [s.w, 0]][desk.side];
        put("chair", desk.got.x + (desk.side % 2 === 0 ? 1 : front[0]), desk.got.y + (desk.side % 2 === 0 ? front[1] : 1), desk.side + 2);
      }
      anyWall("mirror", sides.slice().reverse(), 0.8);
      inCorner("plant");
      inCorner("lamp");
      break;
    }
    case "kitchen": {
      // A run along the longest wall: fridge, counter, cooker, sink side by side.
      for (const sd of sides) {
        const hor = sd % 2 === 0;
        const len = hor ? room.w : room.d;
        if (len < 7) continue;
        const run: FurnitureKind[] = ["fridge", "counter", "cooker", "sink"];
        let at = hor ? room.x : room.y;
        const placed: PlanItem[] = [];
        for (const kind of run) {
          const s = itemSize({ kind, rot: sd });
          const x = hor ? at : sd === 1 ? room.x + room.w - s.w : room.x;
          const y = hor ? (sd === 0 ? room.y : room.y + room.d - s.d) : at;
          const got = put(kind, x, y, sd);
          if (got) {
            placed.push(got);
            at += hor ? s.w : s.d;
          } else at += 1;
        }
        if (placed.length >= 3) break;
        // Not a proper run along this wall: take them back out and try the next.
        floor.items = floor.items.filter((i) => !placed.includes(i));
      }
      // A small table and two chairs, if there's room.
      const cx = room.x + Math.floor(room.w / 2) - 1, cy = room.y + Math.floor(room.d / 2) - 1;
      if (room.w >= 8 && room.d >= 8 && put("table", cx - 1, cy, 0)) {
        put("chair", cx, cy - 1, 2);
        put("chair", cx, cy + 2, 0);
      }
      anyWall("clock", sides.slice().reverse(), 0.5);
      inCorner("plant");
      break;
    }
    case "bathroom": {
      const tl = anyWall("toilet", sides, 0.2);
      void tl;
      const sink = anyWall("sink", sides, 0.6);
      above("mirror", sink?.got ?? null);
      if (room.w * room.d >= 40) anyWall("bath", sides.slice().reverse()) ?? inCorner("shower");
      else inCorner("shower") || anyWall("shower");
      inCorner("plant");
      break;
    }
    case "dining": {
      // The table in the middle, chairs all round it, facing in.
      const t = itemSize({ kind: "table", rot: room.w >= room.d ? 0 : 1 });
      const rot = room.w >= room.d ? 0 : 1;
      const tx = room.x + Math.floor((room.w - t.w) / 2), ty = room.y + Math.floor((room.d - t.d) / 2);
      if (put("table", tx, ty, rot)) {
        put("rug", tx - 1, ty - 1, rot);
        for (let i = 0; i < t.w; i++) {
          if (i % 2 === 0 || t.w <= 3) {
            put("chair", tx + i, ty - 1, 2);
            put("chair", tx + i, ty + t.d, 0);
          }
        }
        if (t.w > 2) {
          put("chair", tx - 1, ty + Math.floor(t.d / 2), 1);
          put("chair", tx + t.w, ty + Math.floor(t.d / 2), 3);
        }
      }
      anyWall("sideboard");
      const sb = floor.items.at(-1);
      if (sb?.kind === "sideboard") above("art", sb);
      inCorner("plant", 2);
      break;
    }
    case "study": {
      const desk = anyWall("desk", sides, 0.5);
      if (desk) {
        const s = itemSize(desk.got);
        const off = [[1, s.d], [-1, 1], [1, -1], [s.w, 1]][desk.side];
        put("chair", desk.got.x + off[0], desk.got.y + off[1], desk.side + 2);
        above("art", desk.got);
      }
      anyWall("shelf", sides.slice().reverse());
      anyWall("armchair", sides.slice().reverse(), 0.8);
      inCorner("lamp");
      inCorner("plant");
      break;
    }
    case "hall":
      anyWall("sideboard", sides.slice().reverse(), 0.5);
      anyWall("mirror", sides, 0.5);
      inCorner("plant");
      break;
    case "balcony":
      for (let i = 0; i < 2; i++) anyWall("chair", sides, 0.4 + i * 0.2);
      inCorner("plant", 3);
      break;
    case "dancehall": {
      // The DJ booth in the middle of a long wall, a big speaker each side of it.
      const dj = anyWall("djbooth");
      let x0 = room.x + 1, y0 = room.y + 1, x1 = room.x + room.w - 1, y1 = room.y + room.d - 1;
      if (dj) {
        const s = itemSize(dj.got);
        const sd = dj.side;
        const t = sd % 2 === 0 ? dj.got.x - room.x : dj.got.y - room.y;
        const len = sd % 2 === 0 ? s.w : s.d;
        fromWall("speaker", sd, t - 1, 0, sd);
        fromWall("speaker", sd, t + len, 0, sd);
        // The dance floor starts a step out from the booth.
        if (sd === 0) y0 = dj.got.y + s.d + 1;
        else if (sd === 2) y1 = dj.got.y - 1;
        else if (sd === 1) x1 = dj.got.x - 1;
        else x0 = dj.got.x + s.w + 1;
      }
      // The floor: light-up tiles (2 m squares) filling the middle, a step in from the walls.
      const tile = FURNITURE.dancefloor.w;
      const nx = Math.floor((x1 - x0) / tile), ny = Math.floor((y1 - y0) / tile);
      if (nx > 0 && ny > 0) {
        const ox = x0 + Math.floor((x1 - x0 - nx * tile) / 2), oy = y0 + Math.floor((y1 - y0 - ny * tile) / 2);
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) put("dancefloor", ox + i * tile, oy + j * tile, 0);
        // The disco ball over the middle of it.
        put("discoball", ox + Math.floor((nx * tile) / 2), oy + Math.floor((ny * tile) / 2), 0);
      }
      // Party lights in the corners, a jukebox and somewhere to sit out a song if there's room.
      inCorner("partylight", 2);
      anyWall("jukebox", sides.slice().reverse(), 0.8);
      anyWall("sofa", sides.slice().reverse(), 0.5);
      inCorner("plant");
      break;
    }
    case "cinema": {
      // The screen on the shortest wall that takes it (so the rows run back), a speaker each side,
      // and rows of seats facing it: the first row about two metres back, an aisle behind each row.
      const scr = anyWall("screen", sides.slice().reverse());
      if (scr) {
        const sd = scr.side;
        const t = sd % 2 === 0 ? scr.got.x - room.x : scr.got.y - room.y;
        const len = FURNITURE.screen.w;
        fromWall("speaker", sd, t - 1, 0, sd);
        fromWall("speaker", sd, t + len, 0, sd);
        const L = lenOf(sd), deep = deepOf(sd);
        for (let depth = 4; depth + 2 <= deep - 1; depth += 3)
          for (let a = 1; a + 2 <= L - 1; a += 2) fromWall("recliner", sd, a, depth, opp(sd));
      }
      inCorner("popcorn");
      inCorner("plant");
      break;
    }
    case "gym": {
      // Treadmills side by side along the longest wall, mirrors on the wall across from them with
      // the dumbbells below, the weights bench in the middle, mats and a bike wherever they fit.
      const tw = sides[0];
      onWallSide("treadmill", tw, 0.2);
      onWallSide("treadmill", tw, 0.8);
      const across = [opp(tw), (tw + 1) % 4, (tw + 3) % 4];
      anyWall("mirror", across, 0.3);
      anyWall("mirror", across, 0.7);
      anyWall("dumbbells", across, 0.5);
      inMiddle("weights", tw % 2);
      anyWall("gymmat", sides.slice().reverse(), 0.5);
      anyWall("bike", sides.slice().reverse(), 0.8);
      inCorner("fan");
      inCorner("plant");
      break;
    }
    case "games": {
      // The pool table in the middle, the long way, then arcade machines against the walls, a
      // dartboard, a jukebox.
      inMiddle("pooltable", room.w >= room.d ? 0 : 1);
      const back = sides.slice().reverse();
      anyWall("arcade", back, 0.15);
      anyWall("arcade", back, 0.85);
      anyWall("dartboard", sides, 0.5);
      anyWall("jukebox", sides, 0.9);
      inCorner("plant");
      break;
    }
    case "bar": {
      // The bar counter along a long wall with stools along its front, facing it; a sofa and a
      // coffee table across the room; a jukebox and low lights.
      const bar = anyWall("homebar");
      if (bar) {
        const s = itemSize(bar.got);
        const sd = bar.side;
        for (let i = 0; i < (sd % 2 === 0 ? s.w : s.d); i++) {
          const x = sd % 2 === 0 ? bar.got.x + i : sd === 1 ? bar.got.x - 1 : bar.got.x + s.w;
          const y = sd % 2 === 1 ? bar.got.y + i : sd === 0 ? bar.got.y + s.d : bar.got.y - 1;
          put("barstool", x, y, opp(sd));
        }
      }
      const sofa = anyWall("sofa", bar ? [opp(bar.side), ...sides] : sides);
      if (sofa) inFront("coffee", sofa.got, 1) ?? inFront("coffee", sofa.got, 0);
      anyWall("jukebox", sides.slice().reverse(), 0.8);
      anyWall("art", sides, 0.3);
      inCorner("lamp");
      inCorner("plant");
      break;
    }
  }
  return floor.items.length - before;
}

/** Cut a strip of `len` squares into pieces by weight (each at least `min`). */
function cut(len: number, weights: number[], min = 4): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.max(min, Math.round((len * w) / total)));
  out[out.length - 1] = len - out.slice(0, -1).reduce((a, b) => a + b, 0);
  return out;
}

/**
 * A whole home designed for you: rooms laid out on every floor (living room and kitchen
 * downstairs, bedrooms upstairs, stairs in the hall to each floor above) and every room
 * furnished. `seed` picks between designs (tap again for another). `special`: special rooms to
 * keep (a dance hall, a cinema...): they take the front of the top floor, as many as fit, in
 * place of bedrooms (so there must be at least two floors).
 */
export function autoDesign(size: HomeSize, floors: number, seed: number, special: RoomKind[] = []): HomePlan {
  const { w, d } = SIZES[size];
  const rand = rng(seed);
  const n = Math.max(1, Math.min(MAX_FLOORS, floors));
  const shuffle = <T,>(a: T[]) => (rand() < 0.5 ? a : [...a].reverse());
  // The same lines on every floor: the front and back halves, and the hall (with the stairs) at
  // one end of the back half, so the stairs land in the hall upstairs.
  const back = Math.max(6, Math.round(d * (0.42 + rand() * 0.08)));
  const hallW = 5;
  const hallLeft = rand() < 0.5;
  const out: HomePlan = { v: 1, size, floors: [] };
  for (let level = 0; level < n; level++) {
    const front: { kind: RoomKind; w: number }[] = [];
    const rear: { kind: RoomKind; w: number }[] = [];
    if (level === 0) {
      front.push(...shuffle([{ kind: "living" as RoomKind, w: 3 }, { kind: "kitchen" as RoomKind, w: 2 }]));
      rear.push(...shuffle([{ kind: "dining" as RoomKind, w: 2 }, { kind: "bathroom" as RoomKind, w: 1.1 }]));
    } else {
      front.push(...shuffle([{ kind: "bedroom" as RoomKind, w: 2 }, { kind: "bedroom" as RoomKind, w: 2 }]));
      if (size === "large") front.push({ kind: rand() < 0.5 ? "study" : "bedroom", w: 1.6 });
      rear.push(...shuffle([{ kind: "bathroom" as RoomKind, w: 1.1 }, { kind: (rand() < 0.6 ? "study" : "balcony") as RoomKind, w: 1.5 }]));
    }
    // The special rooms on the top floor: each at least its smallest size, the rest shared out,
    // and a bedroom too if there's still room for one.
    let widths: number[] | null = null;
    if (level > 0 && level === n - 1 && special.length) {
      const depth = d - back;
      const fit: RoomKind[] = [];
      let used = 0;
      for (const k of special) {
        const m = roomMin(k);
        if (isSpecialRoom(k) && m <= depth && used + m <= w && !fit.includes(k)) {
          fit.push(k);
          used += m;
        }
      }
      if (fit.length) {
        const row = fit.map((k) => ({ kind: k, w: roomMin(k) }));
        if (w - used >= 6) row.push({ kind: "bedroom", w: 6 });
        const spare = w - row.reduce((a, r) => a + r.w, 0);
        widths = row.map((r, i) => r.w + Math.floor(spare / row.length) + (i === row.length - 1 ? spare % row.length : 0));
        front.splice(0, front.length, ...row);
      }
    }
    const rooms: PlanRoom[] = [];
    const lay = (row: { kind: RoomKind; w: number }[], x0: number, width: number, y: number, depth: number, exact?: number[] | null) => {
      let x = x0;
      (exact ?? cut(width, row.map((r) => r.w))).forEach((rw, i) => {
        rooms.push({ id: rooms.length + 1, kind: row[i].kind, x, y, w: rw, d: depth });
        x += rw;
      });
    };
    lay(rear, hallLeft ? hallW : 0, w - hallW, 0, back);
    rooms.push({ id: rooms.length + 1, kind: "hall", x: hallLeft ? 0 : w - hallW, y: 0, w: hallW, d: back });
    lay(front, 0, w, back, d - back, widths);
    const floor: PlanFloor = { rooms, items: [] };
    // The stairs, against the hall's back wall (the same spot on every floor).
    if (level < n - 1) {
      const s = itemSize({ kind: "stairs", rot: 1 });
      floor.items.push({ id: 1, kind: "stairs", rot: 1, x: hallLeft ? 0 : w - s.w, y: 0 });
    }
    for (const r of rooms) furnishRoom(floor, r, seed + level * 31, size);
    out.floors.push(floor);
  }
  return out;
}
