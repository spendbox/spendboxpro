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

/** What you can put in: its size in squares (wide × deep, before turning), height in metres, colour. */
export const FURNITURE = {
  bed: { label: "Bed", w: 4, d: 4, h: 0.55, colour: "#8d6e63" },
  single: { label: "Single bed", w: 2, d: 4, h: 0.5, colour: "#a1887f" },
  sofa: { label: "Sofa", w: 4, d: 2, h: 0.8, colour: "#5c7cfa" },
  armchair: { label: "Armchair", w: 2, d: 2, h: 0.8, colour: "#748ffc" },
  table: { label: "Table", w: 3, d: 2, h: 0.75, colour: "#a0785a" },
  chair: { label: "Chair", w: 1, d: 1, h: 0.9, colour: "#8d6e63" },
  desk: { label: "Desk", w: 3, d: 2, h: 0.75, colour: "#795548" },
  tv: { label: "TV", w: 3, d: 1, h: 1.1, colour: "#212529" },
  wardrobe: { label: "Wardrobe", w: 3, d: 2, h: 2, colour: "#6d4c41" },
  shelf: { label: "Shelf", w: 2, d: 1, h: 1.8, colour: "#8d6e63" },
  fridge: { label: "Fridge", w: 2, d: 2, h: 1.8, colour: "#dee2e6" },
  cooker: { label: "Cooker", w: 2, d: 2, h: 0.9, colour: "#adb5bd" },
  counter: { label: "Counter", w: 4, d: 2, h: 0.9, colour: "#ced4da" },
  sink: { label: "Sink", w: 2, d: 1, h: 0.9, colour: "#e9ecef" },
  toilet: { label: "Toilet", w: 1, d: 2, h: 0.8, colour: "#f8f9fa" },
  shower: { label: "Shower", w: 2, d: 2, h: 2.1, colour: "#a5d8ff" },
  bath: { label: "Bath", w: 4, d: 2, h: 0.6, colour: "#f1f3f5" },
  rug: { label: "Rug", w: 4, d: 3, h: 0.02, colour: "#e64980" },
  plant: { label: "Plant", w: 1, d: 1, h: 1.2, colour: "#2f9e44" },
  lamp: { label: "Lamp", w: 1, d: 1, h: 1.6, colour: "#ffd43b" },
  fan: { label: "Standing fan", w: 1, d: 1, h: 1.3, colour: "#868e96" },
  stairs: { label: "Stairs", w: 2, d: 5, h: 2.8, colour: "#b08968" },
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
