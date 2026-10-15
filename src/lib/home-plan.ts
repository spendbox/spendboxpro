// Planning your home (docs/HOME_PLANNER.md): a floor plan on a grid of half-metre squares, one
// plan per floor (up to four), with rooms drawn as rectangles and furniture placed square by
// square and turned in quarter turns. The same plan is drawn flat in the editor and built in 3D.
// Pure data and rules, shared by the editor, the 3D view and the server (which checks every
// plan before saving it).

/** One grid square, in metres. */
export const CELL_M = 0.5;
export const MAX_FLOORS = 6;
export const MAX_ROOMS = 16;
export const MAX_ITEMS = 200;

/**
 * How big the home is inside (its footprint, in squares). Only the inside grows: the building on
 * the map stays the same size.
 */
export const SIZES = {
  small: { label: "Small (7 × 6 m)", name: "Cosy", w: 14, d: 12 },
  medium: { label: "Medium (10 × 8 m)", name: "Comfy", w: 20, d: 16 },
  large: { label: "Large (14 × 11 m)", name: "Spacious", w: 28, d: 22 },
  grand: { label: "Grand (18 × 14 m)", name: "Grand", w: 36, d: 28 },
  estate: { label: "Estate (24 × 18 m)", name: "Estate", w: 48, d: 36 },
  palace: { label: "Palace (30 × 22 m)", name: "Palace", w: 60, d: 44 },
} as const;
export type HomeSize = keyof typeof SIZES;
export const SIZE_ORDER: HomeSize[] = ["small", "medium", "large", "grand", "estate", "palace"];
/** The sizes the house builder offers (the two smallest are for older, hand-drawn plans). */
export const BUILDER_SIZES: HomeSize[] = ["medium", "large", "grand", "estate", "palace"];

export const ROOM_KINDS = ["living", "bedroom", "kitchen", "bathroom", "dining", "study", "hall", "balcony", "dancehall", "cinema", "gym", "games", "bar", "pool"] as const;
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
  pool: "Indoor pool",
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
  pool: "#cdeef2",
};

/** The special rooms: built for fun, fitted out at a price (sound, lights, wiring), each with its own furniture. */
export const SPECIAL_ROOMS: RoomKind[] = ["dancehall", "cinema", "gym", "games", "bar", "pool"];
export const isSpecialRoom = (k: RoomKind) => SPECIAL_ROOMS.includes(k);
/** The smallest a special room can be, in squares each way (a dance hall: 4 × 4 m). */
export const ROOM_MIN: Partial<Record<RoomKind, number>> = { dancehall: 8, cinema: 7, gym: 6, games: 7, bar: 6, pool: 10 };
export const roomMin = (k: RoomKind) => ROOM_MIN[k] ?? 2;
/** Fitting out a special room (naira, Lagos 2026): sound-proofing, wiring, lights, the floor. The furniture is extra. */
export const ROOM_NAIRA: Partial<Record<RoomKind, number>> = {
  dancehall: 5_000_000,
  cinema: 4_000_000,
  gym: 2_000_000,
  games: 1_500_000,
  bar: 2_500_000,
  // Digging, the basin, tiling, pumps and filters (the pool itself is a piece of its own).
  pool: 15_000_000,
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
  // Pools (the water itself, edged in stone) and what goes round them.
  poolS: { label: "Plunge pool (4 × 2 m)", w: 8, d: 4, h: 0.05, colour: "#3bc9db", naira: 6_000_000 },
  poolM: { label: "Swimming pool (6 × 3 m)", w: 12, d: 6, h: 0.05, colour: "#22b8cf", naira: 12_000_000 },
  poolL: { label: "Big pool (8 × 4 m)", w: 16, d: 8, h: 0.05, colour: "#15aabf", naira: 20_000_000 },
  lounger: { label: "Sun lounger", w: 2, d: 4, h: 0.4, colour: "#f8f9fa", naira: 280_000 },
  // For the luxury rooms.
  piano: { label: "Grand piano", w: 3, d: 4, h: 1, colour: "#111111", naira: 9_500_000 },
  chandelier: { label: "Chandelier", w: 2, d: 2, h: 2.3, colour: "#fff3bf", naira: 4_500_000 },
} as const;
export type FurnitureKind = keyof typeof FURNITURE;

/** Hung on a wall (above the floor): they don't get in the way of what stands below. */
export const ON_WALL = new Set<FurnitureKind>(["art", "mirror", "clock", "screen", "dartboard"]);
/** Lying flat on the floor: things stand on a rug, people dance on the dance floor. */
export const UNDERFOOT = new Set<FurnitureKind>(["rug", "dancefloor", "gymmat"]);
/** Hung from the ceiling. */
export const OVERHEAD = new Set<FurnitureKind>(["discoball", "chandelier"]);
/** The pools (water: nothing stands in them, and nobody walks through them). */
export const POOLS = new Set<FurnitureKind>(["poolS", "poolM", "poolL"]);
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
  { label: "Pool", kinds: ["poolS", "poolM", "poolL", "lounger", "plant"] },
  { label: "Luxury", kinds: ["piano", "chandelier", "art", "mirror"] },
  { label: "Building", kinds: ["stairs"] },
];

/** style: its look (ROOM_STYLES), which furniture it has and in what colours; 0 when missing. */
export type PlanRoom = { id: number; kind: RoomKind; x: number; y: number; w: number; d: number; style?: number };
/** rot: quarter turns clockwise (0–3). x, y: the top-left square it covers. */
export type PlanItem = { id: number; kind: FurnitureKind; x: number; y: number; rot: number };
export type PlanFloor = { rooms: PlanRoom[]; items: PlanItem[] };
/**
 * structure: the kind of house (STRUCTURES), which gives its shape. Plans from before house types
 * have none: a plain box.
 */
export type HomePlan = { v: 1; size: HomeSize; floors: PlanFloor[]; structure?: StructureId };

/** The squares an item covers once turned. */
export function itemSize(item: Pick<PlanItem, "kind" | "rot">) {
  const f = FURNITURE[item.kind];
  return item.rot % 2 === 0 ? { w: f.w, d: f.d } : { w: f.d, d: f.w };
}

// ---------------------------------------------------------------- house types and their shapes

/** A part of a house's footprint (in squares). A shape is one or more of these, side by side. */
export type Wing = { x: number; y: number; w: number; d: number };

/**
 * The shapes a house can be, seen from above with the back at the top (y = 0) and the front door
 * in the middle of the bottom edge. What isn't house is garden (or a terrace upstairs).
 */
export const SHAPES = {
  box: { label: "Square", minSize: "small" as HomeSize },
  slim: { label: "Slim, with gardens each side", minSize: "medium" as HomeSize },
  lshape: { label: "L-shaped, round a garden", minSize: "medium" as HomeSize },
  ushape: { label: "Three wings round a courtyard", minSize: "large" as HomeSize },
} as const;
export type ShapeId = keyof typeof SHAPES;

/** The kinds of house to choose from: their shape, how many floors they come with and can have, and what the design costs. */
export const STRUCTURES = {
  bungalow: { label: "Bungalow", blurb: "Everything on one level. Simple, airy and homely.", shape: "box", floors: 1, maxFloors: 2, naira: 0, size: "large", pool: false, special: [] },
  duplex: { label: "Duplex", blurb: "Living downstairs, bedrooms upstairs. The Lagos classic.", shape: "box", floors: 2, maxFloors: 3, naira: 8_000_000, size: "large", pool: false, special: [] },
  terrace: { label: "Townhouse", blurb: "Slim and tall, three floors with a garden each side.", shape: "slim", floors: 3, maxFloors: 5, naira: 12_000_000, size: "grand", pool: false, special: [] },
  villa: { label: "L-shaped villa", blurb: "Two wings round a private garden, with an indoor pool.", shape: "lshape", floors: 2, maxFloors: 4, naira: 25_000_000, size: "grand", pool: true, special: [] },
  courtyard: { label: "Courtyard mansion", blurb: "Three wings round a courtyard pool, and a pool indoors too.", shape: "ushape", floors: 2, maxFloors: 4, naira: 60_000_000, size: "estate", pool: true, special: ["games"] },
  mansion: { label: "Grand mansion", blurb: "Big in every way: an indoor pool, a cinema, a bar and room for everyone.", shape: "box", floors: 3, maxFloors: 6, naira: 120_000_000, size: "palace", pool: true, special: ["cinema", "bar"] },
} as const satisfies Record<string, { label: string; blurb: string; shape: ShapeId; floors: number; maxFloors: number; naira: number; size: HomeSize; pool: boolean; special: readonly RoomKind[] }>;
export type StructureId = keyof typeof STRUCTURES;
export const STRUCTURE_ORDER = Object.keys(STRUCTURES) as StructureId[];

/** A plan's shape (a plan from before house types is a box). */
export const shapeOf = (plan: Pick<HomePlan, "structure" | "size">): ShapeId => {
  const shape: ShapeId = plan.structure && STRUCTURES[plan.structure] ? STRUCTURES[plan.structure].shape : "box";
  return sizeFits(shape, plan.size) ? shape : "box";
};
/** Whether a shape works at a size (the slim house and the wings need room). */
export const sizeFits = (shape: ShapeId, size: HomeSize) => SIZE_ORDER.indexOf(size) >= SIZE_ORDER.indexOf(SHAPES[shape].minSize);

/** The parts of a house's footprint. */
export function wingsOf(shape: ShapeId, size: HomeSize): Wing[] {
  const { w, d } = SIZES[size];
  switch (shape) {
    case "slim": {
      const sw = Math.round(w * 0.6);
      return [{ x: Math.floor((w - sw) / 2), y: 0, w: sw, d }];
    }
    case "lshape": {
      const back = Math.round(d * 0.45);
      return [
        { x: 0, y: back, w, d: d - back },
        { x: 0, y: 0, w: Math.round(w * 0.5), d: back },
      ];
    }
    case "ushape": {
      const back = Math.round(d * 0.5);
      const side = Math.round(w * 0.32);
      return [
        { x: 0, y: back, w, d: d - back },
        { x: 0, y: 0, w: side, d: back },
        { x: w - side, y: 0, w: side, d: back },
      ];
    }
    default:
      return [{ x: 0, y: 0, w, d }];
  }
}

/** Which squares are inside the house (1) and which are garden (0), row by row. */
export function footprintMask(shape: ShapeId, size: HomeSize): Uint8Array {
  const { w, d } = SIZES[size];
  const m = new Uint8Array(w * d);
  for (const g of wingsOf(shape, size)) for (let y = g.y; y < g.y + g.d; y++) for (let x = g.x; x < g.x + g.w; x++) m[y * w + x] = 1;
  return m;
}

/** The floor area of one storey, in square metres. */
export const storeyM2 = (shape: ShapeId, size: HomeSize) => wingsOf(shape, size).reduce((a, g) => a + g.w * g.d, 0) * CELL_M * CELL_M;
/** All the floors together, in square metres. */
export const planM2 = (plan: HomePlan) => storeyM2(shapeOf(plan), plan.size) * plan.floors.length;

/**
 * The house's outside walls where it meets its own garden (inside the bounding box), and with
 * `border` all the way round the outside too: straight runs between squares' edges. `out` says
 * which side is outside (+1: towards larger x or y).
 */
export function gardenWalls(shape: ShapeId, size: HomeSize, border = false): (PlanWall & { out: 1 | -1 })[] {
  if (shape === "box" && !border) return [];
  const { w, d } = SIZES[size];
  const m = footprintMask(shape, size);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < d && m[y * w + x] === 1;
  const out: (PlanWall & { out: 1 | -1 })[] = [];
  // Vertical edges (line x), then horizontal (line y), each merged into straight runs.
  for (let x = border ? 0 : 1; x <= (border ? w : w - 1); x++) {
    let start = -1;
    let dir: 1 | -1 = 1;
    for (let y = 0; y <= d; y++) {
      const a = y < d && inside(x - 1, y), b = y < d && inside(x, y);
      const edge = a !== b ? (a ? 1 : -1) : 0;
      if (edge && start < 0) {
        start = y;
        dir = edge as 1 | -1;
      } else if (start >= 0 && edge !== dir) {
        out.push({ x0: x, y0: start, x1: x, y1: y, out: dir });
        start = edge ? y : -1;
        if (edge) dir = edge as 1 | -1;
      }
    }
  }
  for (let y = border ? 0 : 1; y <= (border ? d : d - 1); y++) {
    let start = -1;
    let dir: 1 | -1 = 1;
    for (let x = 0; x <= w; x++) {
      const a = x < w && inside(x, y - 1), b = x < w && inside(x, y);
      const edge = a !== b ? (a ? 1 : -1) : 0;
      if (edge && start < 0) {
        start = x;
        dir = edge as 1 | -1;
      } else if (start >= 0 && edge !== dir) {
        out.push({ x0: start, y0: y, x1: x, y1: y, out: dir });
        start = edge ? x : -1;
        if (edge) dir = edge as 1 | -1;
      }
    }
  }
  return out;
}

/** The garden's own pieces (rectangles of squares outside the house), for drawing grass or a terrace. */
export function gardenParts(shape: ShapeId, size: HomeSize): Wing[] {
  const { w, d } = SIZES[size];
  switch (shape) {
    case "slim": {
      const g = wingsOf(shape, size)[0];
      return [
        { x: 0, y: 0, w: g.x, d },
        { x: g.x + g.w, y: 0, w: w - g.x - g.w, d },
      ];
    }
    case "lshape": {
      const [front, back] = wingsOf(shape, size);
      return [{ x: back.w, y: 0, w: w - back.w, d: front.y }];
    }
    case "ushape": {
      const [front, left, right] = wingsOf(shape, size);
      return [{ x: left.w, y: 0, w: right.x - left.w, d: front.y }];
    }
    default:
      return [];
  }
}

/** The style a room is done in: the furniture it gets and its colours. */
export const ROOM_STYLES = ["Classic", "Modern", "Luxury", "Cosy"] as const;
export const roomStyle = (r: Pick<PlanRoom, "style">) => Math.max(0, Math.min(ROOM_STYLES.length - 1, Math.round(r.style ?? 0)));

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
  const r = raw as { size?: unknown; floors?: unknown; structure?: unknown };
  const size: HomeSize = typeof r.size === "string" && r.size in SIZES ? (r.size as HomeSize) : "medium";
  if (!Array.isArray(r.floors) || r.floors.length === 0) return null;
  const structure = typeof r.structure === "string" && r.structure in STRUCTURES ? (r.structure as StructureId) : undefined;
  const { w, d } = SIZES[size];
  const mask = footprintMask(shapeOf({ structure, size }), size);
  /** Every square of a box inside the house. */
  const inHouse = (b: { x: number; y: number; w: number; d: number }) => {
    for (let y = b.y; y < b.y + b.d; y++) for (let x = b.x; x < b.x + b.w; x++) if (!mask[y * w + x]) return false;
    return true;
  };
  const floors: PlanFloor[] = r.floors.slice(0, MAX_FLOORS).map((f) => {
    const fl = (f ?? {}) as { rooms?: unknown; items?: unknown };
    const rooms: PlanRoom[] = [];
    for (const x of Array.isArray(fl.rooms) ? fl.rooms.slice(0, MAX_ROOMS) : []) {
      const o = (x ?? {}) as Record<string, unknown>;
      if (!ROOM_KINDS.includes(o.kind as RoomKind)) continue;
      const rx = clampInt(o.x, 0, w - 2);
      const ry = clampInt(o.y, 0, d - 2);
      const room: PlanRoom = { id: rooms.length + 1, kind: o.kind as RoomKind, x: rx, y: ry, w: clampInt(o.w, 2, w - rx), d: clampInt(o.d, 2, d - ry) };
      const style = clampInt(o.style, 0, ROOM_STYLES.length - 1);
      if (style) room.style = style;
      if (inHouse(room)) rooms.push(room);
    }
    const items: PlanItem[] = [];
    for (const x of Array.isArray(fl.items) ? fl.items.slice(0, MAX_ITEMS) : []) {
      const o = (x ?? {}) as Record<string, unknown>;
      if (typeof o.kind !== "string" || !(o.kind in FURNITURE)) continue;
      const kind = o.kind as FurnitureKind;
      const rot = clampInt(o.rot, 0, 3);
      const s = itemSize({ kind, rot });
      if (s.w > w || s.d > d) continue;
      const it: PlanItem = { id: items.length + 1, kind, rot, x: clampInt(o.x, 0, w - s.w), y: clampInt(o.y, 0, d - s.d) };
      if (inHouse({ x: it.x, y: it.y, ...s })) items.push(it);
    }
    return { rooms, items };
  });
  const plan: HomePlan = { v: 1, size, floors };
  if (structure) plan.structure = structure;
  return plan;
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
export type PlanPaid = {
  floors: number;
  items: Partial<Record<FurnitureKind, number>>;
  rooms?: Partial<Record<RoomKind, number>>;
  /** Floor area built and paid for, all floors together (m²). Missing from older records: worked out from `floors`. */
  area?: number;
  /** The house types whose design has been paid for. */
  builds?: StructureId[];
};

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
  return { floors: 1, items: countItems(starterPlan(size)), rooms: {}, area: storeyM2("box", size), builds: [] };
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
  // The area: as recorded, or (older records, and new homes) every floor paid for at this size,
  // which must be the size of the home that was paid for, not of a new plan.
  const rec = (r as { area?: unknown }).area;
  const area = rec == null ? storeyM2("box", size) * floors : Math.max(0, Math.min(1e6, Number(rec) || 0));
  const given = (r as { builds?: unknown }).builds;
  const builds = (Array.isArray(given) ? given : []).filter((b): b is StructureId => typeof b === "string" && b in STRUCTURES);
  return { floors, items, rooms, area: Math.round(area * 100) / 100, builds: [...new Set(builds)] };
}

/** Everything in a plan, as paid for (a home given furnished: nothing in it is charged for later). */
export function paidFor(plan: HomePlan): PlanPaid {
  return { floors: plan.floors.length, items: countItems(plan), rooms: countRooms(plan), area: planM2(plan), builds: plan.structure ? [plan.structure] : [] };
}

/** Two paid-for records together: the most of each. */
export function mergePaid(a: PlanPaid, b: PlanPaid): PlanPaid {
  const items = { ...a.items };
  for (const [k, v] of Object.entries(b.items)) items[k as FurnitureKind] = Math.max(items[k as FurnitureKind] ?? 0, v ?? 0);
  const rooms = { ...(a.rooms ?? {}) };
  for (const [k, v] of Object.entries(b.rooms ?? {})) rooms[k as RoomKind] = Math.max(rooms[k as RoomKind] ?? 0, v ?? 0);
  return { floors: Math.max(a.floors, b.floors), items, rooms, area: Math.max(a.area ?? 0, b.area ?? 0), builds: [...new Set([...(a.builds ?? []), ...(b.builds ?? [])])] };
}

/**
 * The home a starter pack gives (docs/PACKS.md): "home", fully furnished on one floor; "dancehall",
 * two floors, fully furnished, with a dance hall upstairs. The same every time for the same player.
 */
export function packHomePlan(gift: "home" | "dancehall", seed: number): HomePlan {
  return gift === "dancehall" ? autoDesign("large", 2, seed, ["dancehall"]) : autoDesign("medium", 1, seed);
}

export const floorNaira = (size: HomeSize, shape: ShapeId = "box") => storeyM2(shape, size) * FLOOR_NAIRA_M2;

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
  // The house type's design (once per type: going back to one you've had is free).
  const builds = [...(paid.builds ?? [])];
  if (plan.structure && !builds.includes(plan.structure)) {
    const fee = STRUCTURES[plan.structure].naira;
    if (fee) {
      lines.push({ label: `${STRUCTURES[plan.structure].label} design and build`, count: 1, naira: fee });
      naira += fee;
      valueNaira += fee * FLOOR_VALUE_SHARE;
    }
    builds.push(plan.structure);
  }
  // Building: every square metre beyond what's been built already (more floors, or a bigger home).
  const area = planM2(plan);
  const newM2 = Math.max(0, area - (paid.area ?? 0));
  if (newM2 > 0.01) {
    const cost = Math.round(newM2 * FLOOR_NAIRA_M2);
    const extra = Math.max(0, plan.floors.length - paid.floors);
    lines.push({ label: extra ? (extra === 1 ? "A new floor" : "New floors") : "More space inside", count: extra || 1, naira: cost });
    naira += cost;
    valueNaira += cost * FLOOR_VALUE_SHARE;
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
    valueNaira += cost * (k === "stairs" || POOLS.has(k) ? FLOOR_VALUE_SHARE : FURNITURE_VALUE_SHARE);
    items[k] = have[k];
  }
  return {
    lines,
    naira,
    valueNaira,
    paid: { floors: Math.max(paid.floors, plan.floors.length), items, rooms, area: Math.max(paid.area ?? 0, area), builds },
  };
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
export function planWalls(floor: PlanFloor, size: HomeSize, shape: ShapeId = "box"): { walls: PlanWall[]; doors: PlanDoor[] } {
  const { w, d } = SIZES[size];
  const own = new Int32Array(w * d);
  const mask = shape === "box" ? null : footprintMask(shape, size);
  // The garden is -1: where the house meets it is an outside wall (gardenWalls), not one of these.
  for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) own[y * w + x] = mask && !mask[y * w + x] ? -1 : (roomAt(floor, x, y)?.id ?? 0);
  // Each boundary edge, by the pair of rooms it divides. Vertical edges: x is the line; horizontal: y.
  type Edge = { line: number; at: number; along: "x" | "y" };
  const pairs = new Map<string, Edge[]>();
  const add = (a: number, b: number, e: Edge) => {
    const key = `${Math.min(a, b)}|${Math.max(a, b)}|${e.along}|${e.line}`;
    (pairs.get(key) ?? pairs.set(key, []).get(key)!).push(e);
  };
  for (let y = 0; y < d; y++) for (let x = 1; x < w; x++) { const a = own[y * w + x - 1], b = own[y * w + x]; if (a !== b && a >= 0 && b >= 0) add(a, b, { line: x, at: y, along: "y" }); }
  for (let y = 1; y < d; y++) for (let x = 0; x < w; x++) { const a = own[(y - 1) * w + x], b = own[y * w + x]; if (a !== b && a >= 0 && b >= 0) add(a, b, { line: y, at: x, along: "x" }); }
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
export function furnishRoom(floor: PlanFloor, room: PlanRoom, seed = 1, size: HomeSize = "medium", shape: ShapeId = "box"): number {
  const rand = rng(seed * 7919 + room.id * 104729);
  const { doors } = planWalls(floor, size, shape);
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
      // Nothing stands on the dance floor, or in a pool.
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
    case "pool": {
      // The biggest pool that fits with a walkway round it, in the middle, the long way; sun
      // loungers along a wall beside it, plants in the corners.
      const along = room.w >= room.d ? 0 : 1;
      let pool: PlanItem | null = null;
      for (const kind of ["poolL", "poolM", "poolS"] as FurnitureKind[]) {
        const ps = itemSize({ kind, rot: along });
        if (ps.w + 4 > room.w || ps.d + 4 > room.d) continue;
        pool = inMiddle(kind, along);
        if (pool) break;
      }
      const loungeSides = pool ? (along === 0 ? [0, 2] : [1, 3]) : sides;
      for (const sd of loungeSides) for (const u of [0.2, 0.4, 0.6, 0.8]) onWallSide("lounger", sd, u);
      inCorner("plant", 4);
      anyWall("lamp", sides.slice().reverse(), 0.5);
      break;
    }
  }
  // The room's style: a luxury room gets a chandelier (and the living room a grand piano), a cosy
  // one more rugs, lamps and plants; a modern one is kept clean (no clutter on the walls).
  const style = roomStyle(room);
  const big = room.w * room.d >= 64;
  if (style === 2 && (room.kind === "living" || room.kind === "dining" || room.kind === "bedroom" || room.kind === "hall" || room.kind === "bar")) {
    inMiddle("chandelier", 0);
    if (room.kind === "living" && big && !inCorner("piano")) anyWall("piano", sides.slice().reverse(), 0.85);
    if (room.kind !== "hall") anyWall("art", sides.slice().reverse(), 0.5);
    inCorner("plant", 2);
  } else if (style === 3 && !isSpecialRoom(room.kind) && room.kind !== "kitchen" && room.kind !== "bathroom") {
    inCorner("lamp");
    inCorner("plant", 2);
    if (big) inMiddle("rug", room.w >= room.d ? 0 : 1);
  } else if (style === 1) {
    floor.items = floor.items.filter((i, n) => n < before || !(i.kind === "clock" || (i.kind === "plant" && floor.items.slice(before, n).some((o) => o.kind === "plant"))));
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

// ---------------------------------------------------------------- the house builder (docs/HOME_BUILDER.md)
// Pick a kind of house, its size and floors, then shape each floor by how many rooms it has (laid
// out for you, another layout a tap away), and each room by what it's for and its style. Every
// room comes furnished.

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

/** The stair hall: a strip down one side of the main wing, the same on every floor (the stairs at its back). */
export function hallStrip(plan: Pick<HomePlan, "structure" | "size">): Wing {
  const main = wingsOf(shapeOf(plan), plan.size)[0];
  return { x: main.x, y: main.y, w: SIZES[plan.size].w >= 40 ? 6 : 5, d: main.d };
}

/** Where a floor's stairs go (the same spot on every floor, at the back of the hall). */
function stairsAt(plan: Pick<HomePlan, "structure" | "size">): PlanItem {
  const h = hallStrip(plan);
  return { id: 0, kind: "stairs", rot: 1, x: h.x, y: h.y };
}

/** The pieces of a floor that rooms are laid out in: the house, less the stair hall. */
function freeParts(plan: Pick<HomePlan, "structure" | "size">): Wing[] {
  const [main, ...rest] = wingsOf(shapeOf(plan), plan.size);
  const h = hallStrip(plan);
  return [{ x: main.x + h.w, y: main.y, w: main.w - h.w, d: main.d }, ...rest];
}

/** The most rooms a floor of this home can have (besides its hall): none narrower than 3.5 m. */
export function maxRoomsOn(plan: Pick<HomePlan, "structure" | "size">): number {
  return clampN(freeParts(plan).reduce((a, p) => a + capacity(p), 0), 1, 12);
}

/** How many rooms a floor starts with, by the home's size: few enough that every room is big. */
export function defaultRooms(plan: Pick<HomePlan, "structure" | "size">): number {
  const n = { small: 2, medium: 3, large: 4, grand: 5, estate: 6, palace: 8 }[plan.size];
  return Math.min(n, maxRoomsOn(plan));
}

/** The narrowest a laid-out room can be (3.5 m). */
const ROOM_MIN_SQ = 7;
/** How many rooms a rectangle can be cut into, none narrower than `min`. */
const capacity = (r: Wing, min = ROOM_MIN_SQ) => Math.floor(r.w / min) * Math.floor(r.d / min);

/** Cut a rectangle into k rooms (as many as fit, none narrower than `min` squares), in a random but tidy way. */
function splitInto(r: Wing, k: number, rand: () => number, min = ROOM_MIN_SQ): Wing[] {
  k = Math.min(k, capacity(r, min));
  if (k <= 1) return [r];
  const longX = r.w > r.d * 1.2 ? true : r.d > r.w * 1.2 ? false : rand() < 0.5;
  const halves = rand() < 0.5 ? [Math.floor(k / 2), Math.ceil(k / 2)] : [Math.ceil(k / 2), Math.floor(k / 2)];
  for (const cutX of [longX, !longX]) {
    const len = cutX ? r.w : r.d;
    for (const k1 of halves) {
      const want = Math.round(len * (k1 / k) * (0.9 + rand() * 0.2));
      // The cut nearest to where it's wanted that leaves room for both halves' rooms.
      for (let off = 0; off <= len; off++) {
        for (const at of off ? [want + off, want - off] : [want]) {
          if (at < min || len - at < min) continue;
          const [a, b] = cutX ? [{ ...r, w: at }, { ...r, x: r.x + at, w: r.w - at }] : [{ ...r, d: at }, { ...r, y: r.y + at, d: r.d - at }];
          if (capacity(a, min) >= k1 && capacity(b, min) >= k - k1) return [...splitInto(a, k1, rand, min), ...splitInto(b, k - k1, rand, min)];
        }
      }
    }
  }
  return splitInto(r, k - 1, rand, min);
}

/** The rooms a floor wants, most important first. */
function wantedKinds(plan: HomePlan, level: number, floors: number): RoomKind[] {
  const st = plan.structure ? STRUCTURES[plan.structure] : null;
  const top = level === floors - 1 && floors > 1;
  const special: RoomKind[] = st && (top || floors === 1) ? [...st.special] : [];
  const pool: RoomKind[] = st?.pool ? ["pool"] : [];
  // One floor: somewhere to sleep comes straight after the living room.
  if (floors === 1) return ["living", "bedroom", "kitchen", "bathroom", ...pool, "bedroom", "dining", ...special, "bedroom", "study", "bathroom", "gym", "games", "bar"];
  if (level === 0) return ["living", ...pool, "kitchen", "dining", "bathroom", ...special, "study", "bedroom", "gym", "bathroom", "games", "bar"];
  return [...special, "bedroom", "bathroom", "bedroom", "bedroom", "study", "bathroom", "bedroom", "gym", "balcony", "bedroom"];
}

/** A room's starting style for a kind of house: grand homes start luxurious, villas modern. */
function startStyle(plan: HomePlan, kind: RoomKind, rand: () => number): number {
  const s = plan.structure;
  if (s === "mansion" || s === "courtyard") return 2;
  if (s === "villa" || s === "terrace") return kind === "bedroom" && rand() < 0.4 ? 3 : 1;
  return kind === "bedroom" && rand() < 0.5 ? 3 : 0;
}

/**
 * Lay out one floor: the stair hall, then about `rooms` rooms (`variant` picks between layouts),
 * each given a kind by what the floor needs (the biggest rooms first), then furnished.
 */
export function layoutFloor(plan: HomePlan, level: number, rooms: number, variant: number): PlanFloor {
  const floors = plan.floors.length;
  const rand = rng(variant * 9973 + level * 131 + 7);
  const size = plan.size;
  const shape = shapeOf(plan);
  const n = clampN(rooms, 1, maxRoomsOn(plan));
  const parts = freeParts(plan);
  // Share the rooms out between the parts of the house by their size (each part at least one, and
  // no more than it holds).
  const total = parts.reduce((a, p) => a + p.w * p.d, 0);
  const counts = parts.map((p) => Math.min(capacity(p), Math.max(1, Math.round((n * p.w * p.d) / total))));
  while (counts.reduce((a, b) => a + b, 0) > n && counts.some((c) => c > 1)) counts[counts.indexOf(Math.max(...counts))]--;
  for (let i = 0; counts.reduce((a, b) => a + b, 0) < n && i < 50; i++) {
    const j = parts.findIndex((p, q) => counts[q] < capacity(p));
    if (j < 0) break;
    counts[j]++;
  }
  const rects = parts.flatMap((p, i) => splitInto(p, counts[i], rand));
  // Kinds: each wanted kind takes the biggest room left that's big enough for it.
  const left = rects.slice().sort((a, b) => b.w * b.d - a.w * a.d);
  const out: PlanRoom[] = [{ id: 1, kind: "hall", ...hallStrip(plan) }];
  for (const kind of wantedKinds(plan, level, floors)) {
    if (!left.length) break;
    const m = roomMin(kind);
    const i = left.findIndex((r) => r.w >= m && r.d >= m);
    if (i < 0) continue;
    const [r] = left.splice(i, 1);
    out.push({ id: out.length + 1, kind, ...r });
  }
  for (const r of left) out.push({ id: out.length + 1, kind: level === 0 ? "study" : "bedroom", ...r });
  for (const r of out) {
    const st = startStyle(plan, r.kind, rand);
    if (st) r.style = st;
  }
  const floor: PlanFloor = { rooms: out, items: [] };
  // The stairs up (and on the top floor, the spot where they arrive is kept clear while furnishing).
  const stairs = stairsAt(plan);
  floor.items.push({ ...stairs, id: 1 });
  for (const r of out) furnishRoom(floor, r, variant + level * 31, size, shape);
  if (level === floors - 1 && level > 0) floor.items = floor.items.filter((i) => i.kind !== "stairs");
  if (level === floors - 1 && level === 0) floor.items = floor.items.filter((i) => i.kind !== "stairs");
  floor.items.forEach((it, i) => (it.id = i + 1));
  return floor;
}

/** A whole new home of a kind: its size and floors, every floor laid out and furnished. */
export function buildHouse(structure: StructureId, size: HomeSize, floors: number, variant = 1): HomePlan {
  const st = STRUCTURES[structure];
  const plan: HomePlan = { v: 1, size: sizeFits(st.shape, size) ? size : st.size, structure, floors: [] };
  const n = clampN(floors, 1, st.maxFloors);
  plan.floors = Array.from({ length: n }, () => ({ rooms: [], items: [] }));
  plan.floors = plan.floors.map((_, level) => layoutFloor(plan, level, defaultRooms(plan), variant));
  return plan;
}

/** Make sure every floor but the top has its stairs up, and the top has none. */
function fixStairs(plan: HomePlan) {
  const at = stairsAt(plan);
  const s = itemSize(at);
  plan.floors.forEach((f, level) => {
    const top = level === plan.floors.length - 1;
    f.items = f.items.filter((i) => i.kind !== "stairs");
    if (top) return;
    // Clear the spot, then put the stairs in.
    f.items = f.items.filter((i) => {
      const b = itemSize(i);
      return NOT_SOLID.has(i.kind) || !(i.x < at.x + s.w && at.x < i.x + b.w && i.y < at.y + s.d && at.y < i.y + b.d);
    });
    f.items.push({ ...at, id: nextId(f.items) });
  });
}

/** Add or take away floors (new ones laid out as upstairs floors). */
export function setFloorCount(plan: HomePlan, floors: number, variant = 1): HomePlan {
  const max = plan.structure ? STRUCTURES[plan.structure].maxFloors : MAX_FLOORS;
  const n = clampN(floors, 1, Math.min(MAX_FLOORS, max));
  const out = structuredClone(plan);
  if (n < out.floors.length) out.floors = out.floors.slice(0, n);
  while (out.floors.length < n) {
    out.floors.push({ rooms: [], items: [] });
    const level = out.floors.length - 1;
    out.floors[level] = layoutFloor(out, level, defaultRooms(out), variant + level);
  }
  fixStairs(out);
  return out;
}

/** A new layout for one floor (`rooms` rooms, layout `variant`): its rooms and furniture start again. */
export function relayoutFloor(plan: HomePlan, level: number, rooms: number, variant: number): HomePlan {
  const out = structuredClone(plan);
  out.floors[level] = layoutFloor(out, level, rooms, variant);
  fixStairs(out);
  return out;
}

/** The furniture in a room (by where each piece's middle is), not counting the stairs. */
const inRoomItems = (f: PlanFloor, r: PlanRoom) =>
  f.items.filter((i) => {
    if (i.kind === "stairs") return false;
    const s = itemSize(i);
    const cx = i.x + s.w / 2, cy = i.y + s.d / 2;
    return cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.d;
  });

/** Clear a room and furnish it again (its kind and style as they are now; `seed` picks the arrangement). */
export function refurnish(plan: HomePlan, level: number, roomId: number, seed: number): HomePlan {
  const out = structuredClone(plan);
  const f = out.floors[level];
  const r = f?.rooms.find((x) => x.id === roomId);
  if (!r) return plan;
  const gone = new Set(inRoomItems(f, r));
  f.items = f.items.filter((i) => !gone.has(i));
  furnishRoom(f, r, seed, out.size, shapeOf(out));
  return out;
}

/** Whether a room is big enough to be a kind of room. */
export const roomFits = (r: Pick<PlanRoom, "w" | "d">, kind: RoomKind) => r.w >= roomMin(kind) && r.d >= roomMin(kind);

/** Change what a room is for (furnished afresh). Too small for it: unchanged. */
export function setRoomKind(plan: HomePlan, level: number, roomId: number, kind: RoomKind, seed: number): HomePlan {
  const r = plan.floors[level]?.rooms.find((x) => x.id === roomId);
  if (!r || !roomFits(r, kind)) return plan;
  const out = structuredClone(plan);
  out.floors[level].rooms.find((x) => x.id === roomId)!.kind = kind;
  return refurnish(out, level, roomId, seed);
}

/** Change a room's style (furnished afresh in it). */
export function setRoomStyle(plan: HomePlan, level: number, roomId: number, style: number, seed: number): HomePlan {
  const out = structuredClone(plan);
  const r = out.floors[level]?.rooms.find((x) => x.id === roomId);
  if (!r) return plan;
  if (style) r.style = clampN(style, 0, ROOM_STYLES.length - 1);
  else delete r.style;
  return refurnish(out, level, roomId, seed);
}

/** Whether a room can be split in two (each half at least 3.5 m across). */
export const canSplit = (r: PlanRoom) => r.kind !== "hall" && (r.w >= 14 || r.d >= 14);

/** Split a room in two across its longer side: the new half is the same kind of room. */
export function splitRoom(plan: HomePlan, level: number, roomId: number, seed: number): HomePlan {
  const r0 = plan.floors[level]?.rooms.find((x) => x.id === roomId);
  if (!r0 || !canSplit(r0) || plan.floors[level].rooms.length >= MAX_ROOMS) return plan;
  const out = structuredClone(plan);
  const f = out.floors[level];
  const r = f.rooms.find((x) => x.id === roomId)!;
  const gone = new Set(inRoomItems(f, r));
  f.items = f.items.filter((i) => !gone.has(i));
  const cutX = r.w >= r.d;
  const half = Math.floor((cutX ? r.w : r.d) / 2);
  const other: PlanRoom = cutX ? { ...r, id: nextId(f.rooms), x: r.x + half, w: r.w - half } : { ...r, id: nextId(f.rooms), y: r.y + half, d: r.d - half };
  if (cutX) r.w = half;
  else r.d = half;
  // A special room too small for its half becomes a bedroom (or a study downstairs).
  for (const x of [r, other]) if (!roomFits(x, x.kind)) x.kind = level === 0 ? "study" : "bedroom";
  f.rooms.push(other);
  furnishRoom(f, r, seed, out.size, shapeOf(out));
  furnishRoom(f, other, seed + 1, out.size, shapeOf(out));
  return out;
}

/** The room next to this one that shares a whole wall with it (so the two make a rectangle), if any. */
export function joinable(floor: PlanFloor, roomId: number): PlanRoom | null {
  const r = floor.rooms.find((x) => x.id === roomId);
  if (!r || r.kind === "hall") return null;
  return (
    floor.rooms.find(
      (o) =>
        o.id !== r.id &&
        o.kind !== "hall" &&
        ((o.y === r.y && o.d === r.d && (o.x === r.x + r.w || o.x + o.w === r.x)) || (o.x === r.x && o.w === r.w && (o.y === r.y + r.d || o.y + o.d === r.y))),
    ) ?? null
  );
}

/** Knock through to the room next door: one big room (of this room's kind), furnished afresh. */
export function joinRoom(plan: HomePlan, level: number, roomId: number, seed: number): HomePlan {
  const o0 = plan.floors[level] ? joinable(plan.floors[level], roomId) : null;
  if (!o0) return plan;
  const out = structuredClone(plan);
  const f = out.floors[level];
  const r = f.rooms.find((x) => x.id === roomId)!;
  const o = f.rooms.find((x) => x.id === o0.id)!;
  const gone = new Set([...inRoomItems(f, r), ...inRoomItems(f, o)]);
  f.items = f.items.filter((i) => !gone.has(i));
  const x0 = Math.min(r.x, o.x), y0 = Math.min(r.y, o.y);
  Object.assign(r, { x: x0, y: y0, w: Math.max(r.x + r.w, o.x + o.w) - x0, d: Math.max(r.y + r.d, o.y + o.d) - y0 });
  f.rooms = f.rooms.filter((x) => x.id !== o.id);
  furnishRoom(f, r, seed, out.size, shapeOf(out));
  return out;
}

/** A floor's name: "Ground floor", "First floor"... */
export const floorName = (level: number) => ["Ground floor", "First floor", "Second floor", "Third floor", "Fourth floor", "Fifth floor"][level] ?? `Floor ${level + 1}`;
