import { DISPLAY_KINDS, displayKey, guessDisplay, type DisplayKind } from "@/lib/product-display";
import type { StoreProduct } from "@/lib/types";
import { D, W } from "./layout";

// The product hall: behind the visitor as they stand in the shop, it grows
// longer as the business adds products. Clothes, pedestals and video banners
// line both walls; tables of food and model houses stand on two islands down
// the middle, with walkways between. Each product has a spot to view it from.

/** Where the old shop front was; the hall starts here. */
export const FRONT = D / 2 + 2;
const WALL_X = W / 2 - 0.85;
const ISLAND_X = 2.1;
const FIRST = FRONT + 0.9;
const SECTION_GAP = 0.7;
export const MAX_HALL_PRODUCTS = 400;

/** Where to stand and which way to look (yaw: turn, pitch: up/down), as the camera uses them. */
export interface View {
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
}

export type HallProduct = StoreProduct & { description?: string | null };

export interface HallItem {
  product: HallProduct;
  kind: DisplayKind;
  x: number;
  z: number;
  /** Turned so the display's front faces the walkway. */
  rotY: number;
  view: View;
}

export interface HallSection {
  kind: DisplayKind;
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
}

const SPACING: Record<DisplayKind, number> = { wear: 1.5, shoes: 1.3, item: 1.3, video: 1.4, food: 2.5, home: 2.7 };
/** How far back to stand from each display, and the height to look at. */
// The point looked at sits a little below the display's middle, so the
// product shows above the details card at the bottom of the screen.
const VIEW: Record<DisplayKind, { distance: number; height: number; eye: number }> = {
  wear: { distance: 2.5, height: 0.85, eye: 1.6 },
  shoes: { distance: 1.7, height: 0.5, eye: 1.45 },
  item: { distance: 1.8, height: 0.85, eye: 1.55 },
  video: { distance: 2.8, height: 0.85, eye: 1.6 },
  food: { distance: 1.7, height: 0.5, eye: 1.6 },
  home: { distance: 2.4, height: 0.9, eye: 1.65 },
};
const WALL_KINDS: DisplayKind[] = ["wear", "shoes", "item", "video"];
const ISLAND_KINDS: DisplayKind[] = ["food", "home"];

/** The camera's yaw and pitch for looking from (x, y, z) at a point. */
export function lookFrom(x: number, y: number, z: number, at: [number, number, number]): Pick<View, "yaw" | "pitch"> {
  const dx = at[0] - x;
  const dy = at[1] - y;
  const dz = at[2] - z;
  return { yaw: Math.atan2(dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

function viewOf(kind: DisplayKind, x: number, z: number, rotY: number): View {
  const v = VIEW[kind];
  const vx = x + Math.sin(rotY) * v.distance;
  const vz = z + Math.cos(rotY) * v.distance;
  return { x: vx, z: vz, y: v.eye, ...lookFrom(vx, v.eye, vz, [x, v.height, z]) };
}

/** Lays out the products down the hall, grouped by display. */
export function layoutHall(products: HallProduct[], displays: Record<string, DisplayKind>, categories: string[]): Hall {
  const groups = new Map<DisplayKind, HallProduct[]>();
  for (const p of products.slice(0, MAX_HALL_PRODUCTS)) {
    const kind = displays[displayKey(p.id)] ?? guessDisplay(p, categories);
    groups.set(kind, [...(groups.get(kind) ?? []), p]);
  }
  const items: HallItem[] = [];
  const sections: HallSection[] = [];

  // Two rows (left and right) for each group of spots, filled in turn so a
  // section faces itself across the walkway.
  const fill = (kinds: DisplayKind[], rowX: number, facing: number) => {
    const cursor = [FIRST, FIRST];
    for (const kind of kinds) {
      const list = groups.get(kind);
      if (!list?.length) continue;
      const start = Math.max(cursor[0]!, cursor[1]!);
      cursor[0] = cursor[1] = start;
      const step = SPACING[kind];
      list.forEach((product, i) => {
        const side = i % 2;
        const x = side === 0 ? -rowX : rowX;
        // Left row faces +x (rotY π/2), right row faces -x; `facing` flips it for the islands.
        const rotY = (side === 0 ? Math.PI / 2 : -Math.PI / 2) * facing;
        const z = cursor[side]! + step / 2;
        cursor[side]! += step;
        items.push({ product, kind, x, z, rotY, view: viewOf(kind, x, z, rotY) });
      });
      // Stand a few steps before the section, looking down the hall at it.
      sections.push({
        kind,
        label: DISPLAY_KINDS.find((k) => k.id === kind)!.section,
        count: list.length,
        z: start,
        view: { x: 0, z: Math.max(FRONT - 1, start - 3.2), y: 1.7, yaw: Math.PI, pitch: -0.2 },
      });
      cursor[0]! += SECTION_GAP;
      cursor[1]! += SECTION_GAP;
    }
    return Math.max(cursor[0]!, cursor[1]!);
  };
  const wallEnd = fill(WALL_KINDS, WALL_X, 1);
  // Islands face the middle walkway: the left island faces +x, the right -x.
  const islandEnd = fill(ISLAND_KINDS, ISLAND_X, 1);

  sections.sort((a, b) => a.z - b.z || DISPLAY_KINDS.findIndex((k) => k.id === a.kind) - DISPLAY_KINDS.findIndex((k) => k.id === b.kind));
  // Products in walking order: down the hall, left before right.
  items.sort((a, b) => a.z - b.z || a.x - b.x);
  return { end: Math.max(FRONT + 2.2, wallEnd + 0.6, islandEnd + 0.6), items, sections };
}
