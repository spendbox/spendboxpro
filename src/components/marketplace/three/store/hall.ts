import { CATEGORIES, categoryInfo, guessCategory, type CategoryGroup, type CategoryInfo, type CustomCategory, type Placement } from "@/lib/product-categories";
import type { CategoryLook, DisplaySize, DisplayTableStyle, FrameShape, FrameStyle, ShelfStyle } from "@/lib/store-theme";
import type { StoreProduct } from "@/lib/types";
import { D, W } from "./layout";

// The product hall: behind the visitor as they stand in the shop. Every
// product is a framed picture, and each category is a section, shown the way
// the business chose: framed on the wall, on shelving units, or on display
// tables. Everything stands against a wall and faces the walkway down the
// middle, so the middle stays clear and no picture ever hides another.
//
// There are three places for sections: the left aisle and the right aisle
// (as you walk in), and the back wall at the end. Each section goes where the
// business put it, or else to whichever aisle is shorter, so both sides fill
// before the hall gets longer. Several sections can follow one another down
// the same aisle. Frames fit each photo's shape (tall, square, wide, long)
// unless the business picks one shape for the category.
//
// Vehicles can be a 3D showroom instead: a full-size 3D car for each product,
// on its own round platform, turned towards the walkway and the way in, with
// the product's photo framed on the wall behind it.

/** Where the old shop front was; the hall starts here. */
export const FRONT = D / 2 + 2;
const FIRST = FRONT + 0.9;
const SECTION_GAP = 1.2;
export const MAX_HALL_PRODUCTS = 400;

/** Where to stand and which way to look (yaw: turn, pitch: up/down), as the camera uses them. */
export interface View {
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
}

export type HallProduct = StoreProduct & { description?: string | null; kind?: CategoryGroup | null };

// ---------------------------------------------------------------- Frames

/** A frame (metres): the photo, the mat round it, the caption band below it, the moulding, and its style. */
export interface FrameSpec {
  photo: [number, number];
  mat: number;
  caption: number;
  moulding: number;
  depth: number;
  /** Canvas: the caption hangs as a separate label this far below the photo. */
  gap: number;
  style: FrameStyle;
  /** A video: a dark screen-like mat. */
  screen: boolean;
  small: boolean;
}

const STYLE: Record<FrameStyle, { mat: number; moulding: number; caption: number; gap: number }> = {
  classic: { mat: 0.06, moulding: 0.045, caption: 0.15, gap: 0 },
  gallery: { mat: 0.08, moulding: 0.02, caption: 0.15, gap: 0 },
  gold: { mat: 0.05, moulding: 0.07, caption: 0.14, gap: 0 },
  white: { mat: 0.015, moulding: 0.035, caption: 0.13, gap: 0 },
  canvas: { mat: 0, moulding: 0, caption: 0.12, gap: 0.05 },
};

/** A frame's outside width and height. */
export function frameSize(f: FrameSpec): [number, number] {
  return [f.photo[0] + 2 * (f.mat + f.moulding), f.photo[1] + f.mat + f.caption + 2 * f.moulding + f.gap];
}

const SHAPE_ASPECT: Record<Exclude<FrameShape, "auto">, number> = { portrait: 0.8, square: 1, landscape: 1.33, tall: 0.5, long: 2.4 };
/** Photo area of wall frames by size (square metres). */
const WALL_AREA: Record<DisplaySize, number> = { s: 0.4, m: 0.62, l: 0.95 };

/** The shape a product's frame takes: the category's chosen shape, or the photo's own. */
function aspectOf(p: HallProduct, shape: FrameShape, wide: boolean) {
  if (shape !== "auto") return SHAPE_ASPECT[shape];
  const own = p.media_aspect ?? (p.media_type === "video" ? 0.5625 : wide ? 1.33 : 0.8);
  return Math.min(3, Math.max(0.4, own));
}

function wallFrame(p: HallProduct, look: Required<CategoryLook>, wide: boolean): FrameSpec {
  const a = aspectOf(p, look.shape, wide);
  const area = WALL_AREA[look.size];
  let w = Math.sqrt(area * a);
  let h = Math.sqrt(area / a);
  // Not taller than the wall allows, nor longer than a long print.
  const fit = Math.min(1, 1.35 / h, 2.6 / w);
  w *= fit;
  h *= fit;
  const s = STYLE[look.frame];
  return { photo: [w, h], ...s, depth: look.frame === "canvas" ? 0.04 : 0.05, style: look.frame, screen: p.media_type === "video", small: false };
}

/** Frames on shelves and tables: the photo fits a small box, so every frame fits its slot. */
function smallFrame(p: HallProduct, look: Required<CategoryLook>, wide: boolean): FrameSpec {
  const a = aspectOf(p, look.shape, wide);
  const s = STYLE[look.frame];
  const k = 0.5;
  const mat = s.mat * k;
  const moulding = s.moulding * (look.frame === "gold" ? 0.45 : 0.55);
  const caption = s.caption * 0.55;
  const maxW = PITCH - 2 * (mat + moulding) - 0.1;
  const maxH = 0.33;
  const [w, h] = a >= maxW / maxH ? [maxW, maxW / a] : [maxH * a, maxH];
  return { photo: [w, h], mat, caption, moulding, depth: 0.03, gap: s.gap * k, style: look.frame, screen: p.media_type === "video", small: true };
}

// ---------------------------------------------------------------- Fixtures

/** Space between frames on a shelf or table. */
const PITCH = 0.54;
const COLS: Record<DisplaySize, number> = { s: 3, m: 4, l: 6 };
const spanOf = (size: DisplaySize) => COLS[size] * PITCH + 0.14;

/** A shelving unit against the wall: its depth, height and shelves (eye level fills first, then the top, then the bottom). */
export const SHELF = { depth: 0.4, height: 2.3, shelves: [0.4, 1.02, 1.64], set: 0.24, tilt: 0.12, gap: 0.45 };
const SHELF_ORDER = [1, 2, 0];
/** A display table against the wall, its frames in one row facing the walkway. */
export const TABLE = { depth: 0.7, back: 0.15, height: 0.76, set: 0.32, tilt: 0.16, gap: 0.8 };

/** A car's round platform (metres): how big, how high, how far its middle stands from the wall, and the room each car takes along it. */
export const SHOWROOM = { radius: 2.55, height: 0.12, out: 2.05, bay: 5.7, angle: 0.62 };

/** A car on its platform in a showroom section: the middle of the platform, and which way the car's nose points. */
export interface CarSpot {
  x: number;
  z: number;
  rotY: number;
  /** The product it shows (its photo hangs on the wall behind). */
  productId: string;
}

export interface Fixture {
  kind: "shelf" | "table";
  /** The middle of its back, at the wall. */
  x: number;
  z: number;
  /** Turned to face the walkway. */
  rotY: number;
  /** Along the wall. */
  length: number;
  style: ShelfStyle | DisplayTableStyle;
}

// ---------------------------------------------------------------- The hall

export interface HallItem {
  product: HallProduct;
  /** Its category's id. */
  category: string;
  frame: FrameSpec;
  /** The foot of the frame's back, on the floor plan, and how high it stands. */
  x: number;
  z: number;
  y: number;
  /** Turned so the frame faces the walkway. */
  rotY: number;
  /** Leaned back (frames standing on shelves and tables). */
  tilt: number;
  /** Wall frames get a picture light. */
  onWall: boolean;
  view: View;
}

export type LaneId = "left" | "right" | "back";

export interface HallSection {
  /** Unique (a category that overflows the back wall carries on in an aisle). */
  key: string;
  category: string;
  placement: Placement;
  lane: LaneId;
  label: string;
  count: number;
  /** Its sign: where it hangs and which way it faces. */
  sign: { x: number; y: number; z: number; rotY: number };
  view: View;
}

export interface Hall {
  /** The far end wall. */
  end: number;
  items: HallItem[];
  sections: HallSection[];
  fixtures: Fixture[];
  /** Cars in showroom sections. */
  cars: CarSpot[];
  /** The back wall shows products (so its decorations step aside). */
  backInUse: boolean;
}

/** The camera's yaw and pitch for looking from (x, y, z) at a point. */
export function lookFrom(x: number, y: number, z: number, at: [number, number, number]): Pick<View, "yaw" | "pitch"> {
  const dx = at[0] - x;
  const dy = at[1] - y;
  const dz = at[2] - z;
  return { yaw: Math.atan2(dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** A wall to line things along: where it starts, which way it runs (a) and which way is into the room (n). */
interface Lane {
  id: LaneId;
  ox: number;
  oz: number;
  ax: number;
  az: number;
  nx: number;
  nz: number;
}

// Walking in (down +z), the left hand is +x.
const LEFT: Lane = { id: "left", ox: W / 2, oz: FIRST, ax: 0, az: 1, nx: -1, nz: 0 };
const RIGHT: Lane = { id: "right", ox: -W / 2, oz: FIRST, ax: 0, az: 1, nx: 1, nz: 0 };
/** The back wall's usable length (clear of the corners). */
const BACK_LENGTH = W - 1.6;

const place = (lane: Lane, u: number, v: number): [number, number] => [lane.ox + lane.ax * u + lane.nx * v, lane.oz + lane.az * u + lane.nz * v];
const facing = (lane: Lane) => Math.atan2(lane.nx, lane.nz);


/** Where categories show and how they look, a business's own categories, and what's on the back wall: from the shop design. */
export interface HallCategories {
  custom: CustomCategory[];
  looks: Record<string, CategoryLook>;
}
export interface HallOptions {
  /** The category shown on the back wall, if the business chose one. */
  backCategory?: string | null;
}

const ORDER: Placement[] = ["showroom", "wall", "shelf", "table"];
const CATALOG = new Map(CATEGORIES.map((c, i) => [c.id, i]));

/** The category a product shows under: its own, or the best guess for older products without one. */
export function categoryOf(p: HallProduct, cats: HallCategories, businessCategories: string[]) {
  const known = p.category && (CATALOG.has(p.category) || cats.custom.some((c) => c.id === p.category));
  return known ? p.category! : guessCategory({ title: p.title, description: p.description, kind: p.kind }, { businessCategories, custom: cats.custom });
}

/** A category's look with the usual for anything not chosen. */
export function lookOf(cats: HallCategories, id: string): Required<CategoryLook> & { info: CategoryInfo } {
  const info = categoryInfo(id, cats.custom, cats.looks);
  const l = cats.looks[id] ?? {};
  return { info, placement: info.placement, side: l.side ?? "left", shelf: l.shelf ?? "brand", table: l.table ?? "brand", frame: l.frame ?? "classic", shape: l.shape ?? "auto", size: l.size ?? "m" };
}

/** What one section puts against its wall: its frames and fixtures, laid out from u = 0. */
interface Block {
  length: number;
  items: Omit<HallItem, "view" | "x" | "z" | "rotY">[];
  /** Per item: position along the wall, distance out from it, and how to view it (distance, eye, look-at height). */
  spots: { u: number; v: number; dist: number; eye: number; lookY: number }[];
  fixtures: { u: number; length: number; kind: "shelf" | "table"; style: ShelfStyle | DisplayTableStyle }[];
  cars: { u: number; productId: string }[];
}

function buildBlock(list: HallProduct[], category: string, look: ReturnType<typeof lookOf>): Block {
  const block: Block = { length: 0, items: [], spots: [], fixtures: [], cars: [] };
  const { placement, size } = look;
  if (placement === "showroom") {
    // A bay per car: the platform, with the photo framed on the wall behind, above the roof.
    list.forEach((product, i) => {
      const u = i * SHOWROOM.bay + SHOWROOM.bay / 2;
      const frame = wallFrame(product, { ...look, size: "m" }, true);
      block.items.push({ product, category, frame, y: 1.75, tilt: 0, onWall: true });
      // Seen from the walkway, far enough back to take in the whole car and its photo above it.
      block.spots.push({ u, v: 0.01, dist: SHOWROOM.out + SHOWROOM.radius + 4.4, eye: 2.1, lookY: 1.2 });
      block.cars.push({ u, productId: product.id });
    });
    block.length = list.length * SHOWROOM.bay;
    return block;
  }
  if (placement === "wall") {
    const gap = size === "s" ? 0.3 : size === "m" ? 0.4 : 0.5;
    let u = 0;
    for (const product of list) {
      const frame = wallFrame(product, look, look.info.wide);
      const [w, h] = frameSize(frame);
      const y = Math.max(1.15, 1.85 - h / 2);
      block.items.push({ product, category, frame, y, tilt: 0, onWall: true });
      block.spots.push({ u: u + w / 2, v: 0.01, dist: Math.min(3.2, Math.max(1.9, h * 1.5 + 0.6)), eye: 1.65, lookY: y + h / 2 - 0.18 });
      u += w + gap;
    }
    block.length = Math.max(0, u - gap);
    return block;
  }
  const cols = COLS[size];
  const span = spanOf(size);
  const per = placement === "shelf" ? SHELF.shelves.length * cols : cols;
  const kind = placement === "shelf" ? "shelf" : "table";
  const fixtureGap = placement === "shelf" ? SHELF.gap : TABLE.gap;
  let u = 0;
  for (let n = 0; n * per < list.length; n++) {
    const unit = list.slice(n * per, (n + 1) * per);
    const center = u + span / 2;
    block.fixtures.push({ u: center, length: span, kind, style: placement === "shelf" ? look.shelf : look.table });
    const rows = placement === "shelf" ? SHELF_ORDER.map((shelf, r) => ({ y: SHELF.shelves[shelf]! + 0.002, row: unit.slice(r * cols, (r + 1) * cols) })) : [{ y: TABLE.height + 0.002, row: unit }];
    // Shelves: walked top shelf first, front to back.
    const ordered = [...rows].sort((a, b) => b.y - a.y);
    for (const { y, row } of ordered)
      row.forEach((product, c) => {
        const frame = smallFrame(product, look, look.info.wide);
        const h = frameSize(frame)[1];
        const mid = y + h / 2;
        const set = placement === "shelf" ? SHELF.set : TABLE.set;
        block.items.push({ product, category, frame, y, tilt: placement === "shelf" ? SHELF.tilt : TABLE.tilt, onWall: false });
        block.spots.push({
          // A part-filled shelf or table is centred.
          u: center + (c - (row.length - 1) / 2) * PITCH,
          v: set,
          dist: placement === "shelf" ? 1.85 : 1.35,
          eye: placement === "shelf" ? Math.min(1.75, Math.max(1.2, mid + 0.25)) : 1.45,
          lookY: mid - 0.08,
        });
      });
    u += span + fixtureGap;
  }
  block.length = Math.max(0, u - fixtureGap);
  return block;
}

/** Puts a block on a lane, starting `start` along it. */
function lay(hall: Hall, lane: Lane, start: number, block: Block) {
  const rotY = facing(lane);
  block.items.forEach((item, i) => {
    const s = block.spots[i]!;
    const [x, z] = place(lane, start + s.u, s.v);
    // The camera stands straight out from the frame, in the walkway.
    const [vx, vz] = place(lane, start + s.u, s.v + s.dist);
    hall.items.push({ ...item, x, z, rotY, view: { x: vx, z: vz, y: s.eye, ...lookFrom(vx, s.eye, vz, [x, s.lookY, z]) } });
  });
  for (const f of block.fixtures) {
    const [x, z] = place(lane, start + f.u, 0);
    hall.fixtures.push({ kind: f.kind, x, z, rotY, length: f.length, style: f.style });
  }
  for (const c of block.cars) {
    const [x, z] = place(lane, start + c.u, SHOWROOM.out);
    // Nose towards the walkway and back the way visitors come in.
    const dx = -lane.ax * Math.cos(SHOWROOM.angle) + lane.nx * Math.sin(SHOWROOM.angle);
    const dz = -lane.az * Math.cos(SHOWROOM.angle) + lane.nz * Math.sin(SHOWROOM.angle);
    hall.cars.push({ x, z, rotY: Math.atan2(dx, dz), productId: c.productId });
  }
}

/** Lays out the products, one section per category (empty ones are left out). */
export function layoutHall(products: HallProduct[], cats: HallCategories, businessCategories: string[], options: HallOptions = {}): Hall {
  const groups = new Map<string, HallProduct[]>();
  for (const p of products.slice(0, MAX_HALL_PRODUCTS)) {
    const id = categoryOf(p, cats, businessCategories);
    groups.set(id, [...(groups.get(id) ?? []), p]);
  }
  const hall: Hall = { end: 0, items: [], sections: [], fixtures: [], cars: [], backInUse: false };
  const cursor: Record<"left" | "right", number> = { left: 0, right: 0 };
  // Walls first, then shelves, then tables; within each, the usual order of categories (a business's own last).
  const order = [...groups.keys()]
    .map((id) => lookOf(cats, id))
    .sort((a, b) => ORDER.indexOf(a.placement) - ORDER.indexOf(b.placement) || (CATALOG.get(a.info.id) ?? 999) - (CATALOG.get(b.info.id) ?? 999) || a.info.name.localeCompare(b.info.name));

  // The back wall first (it has a fixed length), so what doesn't fit carries on in an aisle.
  const pending: { look: ReturnType<typeof lookOf>; list: HallProduct[]; key: string; side: "left" | "right" | "auto" }[] = [];
  const backLook = options.backCategory ? order.find((l) => l.info.id === options.backCategory) : undefined;
  let back: { look: ReturnType<typeof lookOf>; block: Block; count: number } | null = null;
  if (backLook) {
    const list = groups.get(backLook.info.id)!;
    // As many as fit along the back wall.
    let n = list.length;
    let block = buildBlock(list, backLook.info.id, backLook);
    while (n > 1 && block.length > BACK_LENGTH) {
      n--;
      block = buildBlock(list.slice(0, n), backLook.info.id, backLook);
    }
    if (block.length <= BACK_LENGTH) {
      back = { look: backLook, block, count: n };
      if (n < list.length) pending.push({ look: backLook, list: list.slice(n), key: `${backLook.info.id}~more`, side: "auto" });
    } else pending.push({ look: backLook, list, key: backLook.info.id, side: "auto" });
  }
  for (const look of order) if (look !== backLook) pending.push({ look, list: groups.get(look.info.id)!, key: look.info.id, side: (cats.looks[look.info.id]?.side as "left" | "right" | undefined) ?? "auto" });

  for (const { look, list, key, side: chosen } of pending) {
    const block = buildBlock(list, look.info.id, look);
    // A chosen side, or the shorter aisle (left first), so both sides fill before the hall gets longer.
    const side = chosen !== "auto" ? chosen : cursor.left <= cursor.right ? "left" : "right";
    const lane = side === "left" ? LEFT : RIGHT;
    const start = cursor[side];
    lay(hall, lane, start, block);
    const [sx, sz] = place(lane, start + Math.min(0.9, block.length / 2), 0.03);
    const [cx, cz] = place(lane, start - 1.2, 4.6);
    const [tx, tz] = place(lane, start + 2.8, 0);
    hall.sections.push({
      key,
      category: look.info.id,
      placement: look.placement,
      lane: side,
      label: look.info.name,
      count: list.length,
      sign: { x: sx, y: 3.3, z: sz, rotY: facing(lane) },
      view: { x: cx, z: Math.max(FRONT - 1, cz), y: 1.65, ...lookFrom(cx, 1.65, Math.max(FRONT - 1, cz), [tx, 1.4, tz]) },
    });
    cursor[side] = start + block.length + SECTION_GAP;
  }

  hall.end = Math.max(FRONT + 2.2, FIRST + Math.max(cursor.left, cursor.right) + 0.6);
  if (back) {
    // Centred on the back wall, facing back up the hall, running from the visitor's left to right.
    const lane: Lane = { id: "back", ox: back.block.length / 2, oz: hall.end, ax: -1, az: 0, nx: 0, nz: -1 };
    lay(hall, lane, 0, back.block);
    hall.backInUse = true;
    const z = Math.max(FRONT, hall.end - 6.5);
    hall.sections.unshift({
      key: back.look.info.id,
      category: back.look.info.id,
      placement: back.look.placement,
      lane: "back",
      label: back.look.info.name,
      count: back.count,
      sign: { x: 0, y: 3.4, z: hall.end - 0.03, rotY: Math.PI },
      view: { x: 0, z, y: 1.7, ...lookFrom(0, 1.7, z, [0, 1.5, hall.end]) },
    });
  }
  // Products in walking order: section by section, as the sections are listed.
  const rank = new Map(hall.sections.map((s, i) => [s.category, i]));
  hall.items = hall.items.map((item, i) => ({ item, i })).sort((a, b) => (rank.get(a.item.category) ?? 0) - (rank.get(b.item.category) ?? 0) || a.i - b.i).map((x) => x.item);
  return hall;
}

/**
 * A spot to walk to near (x, z) that isn't inside or right up against a
 * shelving unit or table (tapping the floor there would walk into it).
 */
export function clearOfFixtures(hall: Hall, x: number, z: number): [number, number] {
  const margin = 1.1;
  for (const f of hall.fixtures) {
    // Into the fixture's own frame: along its wall (a) and out from it (n).
    const nx = Math.sin(f.rotY);
    const nz = Math.cos(f.rotY);
    const along = (x - f.x) * nz - (z - f.z) * nx;
    const out = (x - f.x) * nx + (z - f.z) * nz;
    const depth = f.kind === "shelf" ? SHELF.depth : TABLE.back + TABLE.depth;
    if (Math.abs(along) < f.length / 2 + 0.3 && out < depth + margin) {
      const push = depth + margin - out;
      x += nx * push;
      z += nz * push;
    }
  }
  // Not onto a car's platform: just off its edge.
  for (const c of hall.cars) {
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.hypot(dx, dz);
    const keep = SHOWROOM.radius + 0.7;
    if (d < keep) {
      const k = d > 1e-3 ? keep / d : 1;
      x = c.x + (d > 1e-3 ? dx : 1) * k;
      z = c.z + (d > 1e-3 ? dz : 0) * k;
    }
  }
  return [x, z];
}
