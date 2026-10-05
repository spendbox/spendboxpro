import { CATEGORIES, categoryInfo, guessCategory, type CategoryGroup, type CustomCategory, type Placement } from "@/lib/product-categories";
import type { StoreProduct } from "@/lib/types";
import { D, W } from "./layout";

// The product hall: behind the visitor as they stand in the shop, it grows
// longer as the business adds products. Every product is a framed picture,
// and each category is a section with its own stretch of the hall, shown the
// way the business chose: large frames hung in one tidy row on both walls
// (landscape for homes, cars, events...; a slim screen for videos), small
// frames on shelving units against the walls, four to a shelf, or small
// frames on two rows of tables, with walkways either side. Wall sections come
// first, then shelves, then tables. Nothing ever stands in the middle of a wall section, and each
// frame has its own spot to view it from with nothing in between, so no
// picture ever hides another.

/** Where the old shop front was; the hall starts here. */
export const FRONT = D / 2 + 2;
const FIRST = FRONT + 0.9;
const SECTION_GAP = 1.2;
/** The inside face of the side walls. */
const WALL = W / 2;
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

export type FrameKind = "large" | "wide" | "screen" | "small";

/** Frame sizes (metres): the photo, the mat round it, the caption band below it, and the moulding. */
export const FRAMES: Record<FrameKind, { photo: [number, number]; mat: number; caption: number; moulding: number; depth: number }> = {
  large: { photo: [0.72, 0.9], mat: 0.06, caption: 0.15, moulding: 0.045, depth: 0.05 },
  wide: { photo: [1.04, 0.78], mat: 0.06, caption: 0.15, moulding: 0.045, depth: 0.05 },
  screen: { photo: [0.5625, 1], mat: 0.03, caption: 0.12, moulding: 0.04, depth: 0.05 },
  small: { photo: [0.28, 0.35], mat: 0.03, caption: 0.08, moulding: 0.025, depth: 0.03 },
};

/** A frame's outside width and height. */
export function frameSize(frame: FrameKind): [number, number] {
  const f = FRAMES[frame];
  return [f.photo[0] + 2 * (f.mat + f.moulding), f.photo[1] + f.mat + f.caption + 2 * f.moulding];
}

/** The frame a product gets where its category shows. */
function frameFor(placement: Placement, wide: boolean, video: boolean): FrameKind {
  if (placement !== "wall") return "small";
  return video ? "screen" : wide ? "wide" : "large";
}

/** Wall frames: the height of their middle, the space each takes along the wall, and where to view them from. */
const HANG = { middle: 1.8, gap: 0.4, distance: 2.4, eye: 1.65 };

/** A shelving unit against the wall: its size, its shelves' heights, and four frames to a shelf. */
export const SHELF = { width: 2.3, depth: 0.4, height: 2.3, shelves: [0.4, 1.02, 1.64], cols: 4, pitch: 0.54, set: 0.24, tilt: 0.12, gap: 0.45 };
/** The order shelves fill: eye level first, then the top, then the bottom. */
const SHELF_ORDER = [1, 2, 0];

/** A display table down the middle: its size, four frames on each long side, and where its row stands. */
export const TABLE = { length: 2.3, width: 0.8, height: 0.76, cols: 4, pitch: 0.54, set: 0.14, tilt: 0.16, x: 1.75, gap: 1.1 };

export interface HallItem {
  product: HallProduct;
  /** Its category's id. */
  category: string;
  frame: FrameKind;
  /** The foot of the frame's back, on the floor plan, and how high it stands. */
  x: number;
  z: number;
  y: number;
  /** Turned so the frame faces the walkway. */
  rotY: number;
  /** Leaned back (frames standing on shelves and tables). */
  tilt: number;
  view: View;
}

/** A shelving unit (against a wall) or a table (down the middle), centred at x, z. */
export interface Fixture {
  kind: "shelf" | "table";
  x: number;
  z: number;
  rotY: number;
}

export interface HallSection {
  /** The category's id. */
  key: string;
  placement: Placement;
  label: string;
  count: number;
  /** Where the section starts down the hall (for its hanging sign). */
  z: number;
  view: View;
}

export interface Hall {
  /** The far end wall. */
  end: number;
  items: HallItem[];
  sections: HallSection[];
  fixtures: Fixture[];
}

/** The camera's yaw and pitch for looking from (x, y, z) at a point. */
export function lookFrom(x: number, y: number, z: number, at: [number, number, number]): Pick<View, "yaw" | "pitch"> {
  const dx = at[0] - x;
  const dy = at[1] - y;
  const dz = at[2] - z;
  return { yaw: Math.atan2(dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** Standing `distance` in front of a frame at eye height `eye`, looking at height `at` on it. */
function viewOf(x: number, z: number, rotY: number, distance: number, eye: number, at: number): View {
  const vx = x + Math.sin(rotY) * distance;
  const vz = z + Math.cos(rotY) * distance;
  return { x: vx, z: vz, y: eye, ...lookFrom(vx, eye, vz, [x, at, z]) };
}

/**
 * Where a section's button takes the visitor: for the walls, standing just
 * before the section and looking along the left wall at its first frames;
 * for the tables, looking down the walkway between them.
 */
function sectionView(placement: Placement, start: number): View {
  if (placement === "table") {
    const z = Math.max(FRONT - 1, start - 2.2);
    return { x: 0, z, y: 1.7, ...lookFrom(0, 1.7, z, [0, 0.9, start + 3]) };
  }
  const z = Math.max(FRONT - 1, start - 0.8);
  return { x: 1.2, z, y: 1.65, ...lookFrom(1.2, 1.65, z, [-WALL, 1.45, start + 3.5]) };
}

/** Facing into the hall from the left (-1) or right (1) wall, or out to that side. */
const facingIn = (side: number) => (side < 0 ? Math.PI / 2 : -Math.PI / 2);

/** Where categories show, and a business's own: from the shop design. */
export interface HallCategories {
  custom: CustomCategory[];
  placements: Record<string, Placement>;
}

const ORDER: Placement[] = ["wall", "shelf", "table"];
const CATALOG = new Map(CATEGORIES.map((c, i) => [c.id, i]));

/** The category a product shows under: its own, or the best guess for older products without one. */
export function categoryOf(p: HallProduct, cats: HallCategories, businessCategories: string[]) {
  const known = p.category && (CATALOG.has(p.category) || cats.custom.some((c) => c.id === p.category));
  return known ? p.category! : guessCategory({ title: p.title, description: p.description, kind: p.kind }, { businessCategories, custom: cats.custom });
}

/** Lays out the products down the hall, one section per category (empty ones are left out). */
export function layoutHall(products: HallProduct[], cats: HallCategories, businessCategories: string[]): Hall {
  const groups = new Map<string, HallProduct[]>();
  for (const p of products.slice(0, MAX_HALL_PRODUCTS)) {
    const id = categoryOf(p, cats, businessCategories);
    groups.set(id, [...(groups.get(id) ?? []), p]);
  }
  const blocks: { section: HallSection; items: HallItem[] }[] = [];
  const fixtures: Fixture[] = [];
  // Running positions down the left and right sides of the hall.
  const cursor = [FIRST, FIRST];
  // Walls first, then shelves, then tables; within each, the usual order of categories (a business's own last).
  const sections = [...groups.keys()]
    .map((id) => categoryInfo(id, cats.custom, cats.placements))
    .sort((a, b) => ORDER.indexOf(a.placement) - ORDER.indexOf(b.placement) || (CATALOG.get(a.id) ?? 999) - (CATALOG.get(b.id) ?? 999) || a.name.localeCompare(b.name));

  for (const info of sections) {
    const list = groups.get(info.id)!;
    const { placement } = info;
    const category = info.id;
    const label = info.name;
    // A section starts level on both sides, so it faces itself across the walkway.
    const start = Math.max(cursor[0]!, cursor[1]!);
    cursor[0] = cursor[1] = start;
    const items: HallItem[] = [];

    if (placement === "wall") {
      // One row, alternating left and right.
      list.forEach((product, i) => {
        const frame = frameFor("wall", info.wide, product.media_type === "video");
        const [fw, fh] = frameSize(frame);
        const step = fw + HANG.gap;
        const s = i % 2;
        const side = s === 0 ? -1 : 1;
        const x = side * (WALL - 0.01);
        const z = cursor[s]! + step / 2;
        cursor[s]! += step;
        const rotY = facingIn(side);
        const y = HANG.middle - fh / 2;
        items.push({ product, category, frame, x, z, y, rotY, tilt: 0, view: viewOf(x, z, rotY, HANG.distance, HANG.eye, HANG.middle - 0.18) });
      });
    } else {
      const frame: FrameKind = "small";
      const fh = frameSize(frame)[1];
      // Shelving units (twelve frames each) or tables (eight each), alternating left and right.
      const per = placement === "shelf" ? SHELF.shelves.length * SHELF.cols : 2 * TABLE.cols;
      const [span, gap] = placement === "shelf" ? [SHELF.width, SHELF.gap] : [TABLE.length, TABLE.gap];
      for (let u = 0; u * per < list.length; u++) {
        const s = u % 2;
        const side = s === 0 ? -1 : 1;
        const center = cursor[s]! + span / 2;
        cursor[s]! += span + gap;
        const unit = list.slice(u * per, (u + 1) * per);
        if (placement === "shelf") {
          fixtures.push({ kind: "shelf", x: side * WALL, z: center, rotY: facingIn(side) });
          const rotY = facingIn(side);
          const x = side * (WALL - SHELF.set);
          const placed: HallItem[] = [];
          SHELF_ORDER.forEach((shelf, r) => {
            const row = unit.slice(r * SHELF.cols, (r + 1) * SHELF.cols);
            const y = SHELF.shelves[shelf]! + 0.002;
            const middleY = y + fh / 2;
            const eye = Math.min(1.75, Math.max(1.2, middleY + 0.25));
            row.forEach((product, c) => {
              // A part-filled shelf is centred.
              const z = center + (c - (row.length - 1) / 2) * SHELF.pitch;
              placed.push({ product, category, frame, x, z, y, rotY, tilt: SHELF.tilt, view: viewOf(x, z, rotY, 1.85, eye, middleY - 0.08) });
            });
          });
          // Walk them top shelf first, front to back.
          items.push(...placed.sort((a, b) => b.y - a.y || a.z - b.z));
        } else {
          const tx = side * TABLE.x;
          fixtures.push({ kind: "table", x: tx, z: center, rotY: 0 });
          // The side facing the middle walkway first, then the side facing the wall.
          [-side, side].forEach((face, r) => {
            const row = unit.slice(r * TABLE.cols, (r + 1) * TABLE.cols);
            const rotY = face > 0 ? Math.PI / 2 : -Math.PI / 2;
            const x = tx + face * TABLE.set;
            const y = TABLE.height + 0.002;
            row.forEach((product, c) => {
              const z = center + (c - (row.length - 1) / 2) * TABLE.pitch;
              items.push({ product, category, frame, x, z, y, rotY, tilt: TABLE.tilt, view: viewOf(x, z, rotY, 1.3, 1.4, y + fh / 2 - 0.08) });
            });
          });
        }
      }
    }

    blocks.push({
      items,
      section: {
        key: category,
        placement,
        label,
        count: list.length,
        z: start,
        view: sectionView(placement, start),
      },
    });
    cursor[0]! += SECTION_GAP;
    cursor[1]! += SECTION_GAP;
  }

  // Sections are laid out in walking order; products follow their section.
  return {
    end: Math.max(FRONT + 2.2, cursor[0]! + 0.6, cursor[1]! + 0.6),
    items: blocks.flatMap((b) => b.items),
    sections: blocks.map((b) => b.section),
    fixtures,
  };
}

/**
 * A spot to walk to near (x, z) that isn't inside or right up against a
 * shelving unit or table (tapping the floor there would walk into it).
 */
export function clearOfFixtures(hall: Hall, x: number, z: number): [number, number] {
  const margin = 1.1;
  for (const f of hall.fixtures) {
    if (f.kind === "shelf") {
      const front = Math.abs(f.x) - SHELF.depth;
      if (Math.abs(z - f.z) < SHELF.width / 2 + 0.3 && Math.abs(x) > front - margin && Math.sign(x) === Math.sign(f.x)) x = Math.sign(f.x) * (front - margin);
    } else if (Math.abs(z - f.z) < TABLE.length / 2 + 0.3 && Math.abs(x - f.x) < TABLE.width / 2 + margin) {
      x = f.x + Math.sign(x - f.x || 1) * (TABLE.width / 2 + margin);
    }
  }
  return [x, z];
}
