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

export const ROOM_KINDS = ["living", "bedroom", "kitchen", "bathroom", "dining", "study", "hall", "balcony"] as const;
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
} as const;
export type FurnitureKind = keyof typeof FURNITURE;

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
  const solid = floor.items.filter((i) => i.kind !== "rug");
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

/** What you've paid for: how many floors, and how many of each piece (taking one out doesn't sell it). */
export type PlanPaid = { floors: number; items: Partial<Record<FurnitureKind, number>> };

const countItems = (plan: HomePlan) => {
  const out: Partial<Record<FurnitureKind, number>> = {};
  for (const f of plan.floors) for (const i of f.items) out[i.kind] = (out[i.kind] ?? 0) + 1;
  return out;
};

/** A new home comes with its ground floor and the starter furniture. */
export function startPaid(): PlanPaid {
  const items: Partial<Record<FurnitureKind, number>> = {};
  for (const size of Object.keys(SIZES) as HomeSize[])
    for (const [k, n] of Object.entries(countItems(starterPlan(size))) as [FurnitureKind, number][]) items[k] = Math.max(items[k] ?? 0, n);
  return { floors: 1, items };
}

/** Paid-for record from the database, made safe. */
export function cleanPaid(raw: unknown): PlanPaid {
  const base = startPaid();
  const r = (raw ?? {}) as { floors?: unknown; items?: Record<string, unknown> };
  const floors = Math.max(1, Math.min(MAX_FLOORS, Math.round(Number(r.floors) || 1)));
  const items = { ...base.items };
  for (const [k, v] of Object.entries(r.items ?? {})) if (k in FURNITURE) items[k as FurnitureKind] = Math.max(items[k as FurnitureKind] ?? 0, Math.min(MAX_ITEMS * MAX_FLOORS, Math.round(Number(v) || 0)));
  return { floors, items };
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

/** What saving this plan costs: the floors and furniture beyond what you've already paid for. */
export function planBill(plan: HomePlan, paid: PlanPaid): PlanBill {
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
  return { lines, naira, valueNaira, paid: { floors: Math.max(paid.floors, plan.floors.length), items } };
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

/** What goes in each kind of room, in the order it's placed (the important things first). */
const ROOM_SET: Record<RoomKind, FurnitureKind[]> = {
  living: ["sofa", "tv", "armchair", "rug", "shelf", "plant", "lamp", "fan"],
  bedroom: ["bed", "wardrobe", "lamp", "desk", "chair", "plant", "fan"],
  kitchen: ["counter", "cooker", "fridge", "sink", "table", "chair", "chair"],
  bathroom: ["toilet", "shower", "sink", "bath", "plant"],
  dining: ["table", "chair", "chair", "chair", "chair", "shelf", "plant"],
  study: ["desk", "chair", "shelf", "armchair", "lamp", "plant"],
  hall: ["shelf", "plant"],
  balcony: ["chair", "chair", "plant", "plant"],
};

const overlaps = (a: { x: number; y: number; w: number; d: number }, b: { x: number; y: number; w: number; d: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

/**
 * Furnish one room: each piece against a wall (its back to the wall), rugs in the middle,
 * nothing on top of anything else, and a clear way in at the doorways (the middle of each side).
 * Adds to `floor.items` and returns how many went in.
 */
export function furnishRoom(floor: PlanFloor, room: PlanRoom, seed = 1): number {
  const rand = rng(seed * 7919 + room.id * 104729);
  let placed = 0;
  const big = room.w * room.d;
  // Doorways: keep the middle square of each side free.
  const doors = [
    { x: room.x + Math.floor(room.w / 2) - 1, y: room.y, w: 2, d: 2 },
    { x: room.x + Math.floor(room.w / 2) - 1, y: room.y + room.d - 2, w: 2, d: 2 },
    { x: room.x, y: room.y + Math.floor(room.d / 2) - 1, w: 2, d: 2 },
    { x: room.x + room.w - 2, y: room.y + Math.floor(room.d / 2) - 1, w: 2, d: 2 },
  ];
  for (let kind of ROOM_SET[room.kind]) {
    if (kind === "bed" && room.w < 7 && room.d < 7) kind = "single";
    if (kind === "bath" && big < 50) continue;
    const id = nextId(floor.items);
    const solid = floor.items.filter((i) => i.kind !== "rug");
    const free = (c: { x: number; y: number; w: number; d: number }, rug: boolean) =>
      c.x >= room.x && c.y >= room.y && c.x + c.w <= room.x + room.w && c.y + c.d <= room.y + room.d &&
      (rug ? !floor.items.some((i) => i.kind === "rug" && overlaps(c, { ...itemSize(i), x: i.x, y: i.y })) : !solid.some((i) => overlaps(c, { ...itemSize(i), x: i.x, y: i.y })) && !doors.some((dr) => overlaps(c, dr)));
    let spot: PlanItem | null = null;
    if (kind === "rug" || kind === "table") {
      // The middle of the room.
      const s = itemSize({ kind, rot: room.w >= room.d ? 0 : 1 });
      const c = { x: room.x + Math.floor((room.w - s.w) / 2), y: room.y + Math.floor((room.d - s.d) / 2), ...s };
      if (free(c, kind === "rug")) spot = { id, kind, rot: room.w >= room.d ? 0 : 1, x: c.x, y: c.y };
    }
    if (!spot) {
      // Along the walls: top (back to the top wall), right, bottom, left, starting somewhere random.
      const start = Math.floor(rand() * 4);
      for (let k = 0; k < 4 && !spot; k++) {
        const wall = (start + k) % 4;
        const rot = wall;
        const s = itemSize({ kind, rot });
        const along = wall % 2 === 0 ? room.w - s.w : room.d - s.d;
        const offs = Array.from({ length: Math.max(0, along + 1) }, (_, i) => i);
        if (rand() < 0.5) offs.reverse();
        for (const o of offs) {
          const c =
            wall === 0 ? { x: room.x + o, y: room.y, ...s }
            : wall === 1 ? { x: room.x + room.w - s.w, y: room.y + o, ...s }
            : wall === 2 ? { x: room.x + o, y: room.y + room.d - s.d, ...s }
            : { x: room.x, y: room.y + o, ...s };
          if (free(c, false)) {
            spot = { id, kind, rot, x: c.x, y: c.y };
            break;
          }
        }
      }
    }
    if (spot) {
      floor.items.push(spot);
      placed++;
    }
  }
  return placed;
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
 * furnished. `seed` picks between designs (tap again for another).
 */
export function autoDesign(size: HomeSize, floors: number, seed: number): HomePlan {
  const { w, d } = SIZES[size];
  const rand = rng(seed);
  const n = Math.max(1, Math.min(MAX_FLOORS, floors));
  const shuffle = <T,>(a: T[]) => (rand() < 0.5 ? a : [...a].reverse());
  const out: HomePlan = { v: 1, size, floors: [] };
  for (let level = 0; level < n; level++) {
    const front = Math.round(d * (0.5 + rand() * 0.12));
    const top: { kind: RoomKind; w: number }[] = [];
    const bottom: { kind: RoomKind; w: number }[] = [];
    const stairsHere = level < n - 1;
    if (level === 0) {
      bottom.push(...shuffle([{ kind: "living" as RoomKind, w: 3 }, { kind: "kitchen" as RoomKind, w: 2 }]));
      top.push(...shuffle([{ kind: "dining" as RoomKind, w: 2 }, { kind: "bathroom" as RoomKind, w: 1.2 }]));
      if (stairsHere || size !== "small") top.push({ kind: "hall", w: 1.2 });
    } else {
      bottom.push(...shuffle([{ kind: "bedroom" as RoomKind, w: 2 }, { kind: "bedroom" as RoomKind, w: 2 }]));
      if (size === "large") bottom.push({ kind: rand() < 0.5 ? "study" : "bedroom", w: 1.6 });
      top.push(...shuffle([{ kind: "bathroom" as RoomKind, w: 1.2 }, { kind: (rand() < 0.5 ? "study" : "balcony") as RoomKind, w: 1.5 }]));
      top.push({ kind: "hall", w: 1.2 });
    }
    const rooms: PlanRoom[] = [];
    const lay = (row: typeof top, y: number, depth: number) => {
      let x = 0;
      cut(w, row.map((r) => r.w)).forEach((rw, i) => {
        rooms.push({ id: rooms.length + 1, kind: row[i].kind, x, y, w: rw, d: depth });
        x += rw;
      });
    };
    lay(top, 0, d - front);
    lay(bottom, d - front, front);
    const floor: PlanFloor = { rooms, items: [] };
    // The stairs go up from the hall (in the same spot on every floor, so they line up).
    const hall = rooms.find((r) => r.kind === "hall");
    if (stairsHere && hall) {
      const s = itemSize({ kind: "stairs", rot: 0 });
      floor.items.push({ id: 1, kind: "stairs", rot: 0, x: Math.min(w - s.w, hall.x + hall.w - s.w), y: Math.max(0, Math.min(d - s.d, hall.y)) });
    }
    for (const r of rooms) furnishRoom(floor, r, seed + level);
    out.floors.push(floor);
  }
  return out;
}
