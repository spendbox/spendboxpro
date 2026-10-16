// Many buildings to a tile (docs/PLOTS.md): a real neighbourhood isn't one house per 100 m square,
// it's dozens of small roofs packed together at slight angles. So on the real map each tile of
// low-rise property is split into plots. Plot 0, at the front on the street, is the property you
// can buy (src/lib/world/buildings), drawn smaller; the plots round it are filled with little
// houses that are only scenery: their sizes, turns, roofs and colours are worked out from the
// tile's position, the same way every time, and nothing about them is stored or owned.
//
// Pure maths, no drawing: ./building-kit draws what this lays out. Coordinates are in the
// building's own frame (as building-kit draws it): a tile is -0.5..0.5 each way, +z faces its street.

import type { Building, BuildingKind } from "../world/buildings.ts";
import { hash } from "./noise.ts";

/** The little houses round the property: where, how big, turned how much, how tall, what roof. */
export type Filler = {
  x: number;
  z: number;
  w: number;
  d: number;
  ry: number;
  storeys: number;
  /** 0 hipped, 1 gabled, 2 flat concrete (with a water tank). */
  roof: 0 | 1 | 2;
  /** Stable numbers (0..1) for the wall and roof colours. */
  wall: number;
  tint: number;
  /** A yard instead of a house: a tree (or two) and bare earth. */
  yard?: boolean;
};

export type PlotLayout = {
  /** Plot 0 (the property): where its middle goes, how much smaller it's drawn across (s) and up (v). */
  main: { x: number; z: number; s: number; v: number };
  fillers: Filler[];
};

/** Low-rise kinds that share their tile with neighbours; towers, offices, plazas, warehouses and farms fill theirs. */
const SHARED = new Set<BuildingKind>(["bungalow", "duplex", "rooming", "terrace", "shops", "mixed", "flats", "land"]);
/** Bigger properties keep more of the tile. */
const SCALE: Partial<Record<BuildingKind, number>> = { flats: 0.62, mixed: 0.6, shops: 0.6, rooming: 0.56, terrace: 0.58 };
/**
 * How tall a storey is drawn on a shared tile, as a share of the city's usual storey (which is drawn
 * tall, for towers): low houses wider than they're high, as they look from above.
 */
export const LOW_STOREY = 0.55;
/** The property in plot 0 is drawn this much lower too (its insides keep their usual heights). */
const MAIN_V = 0.7;
/** At most this many little houses on a tile (the drawing budget, see building-kit). */
export const MAX_FILLERS = 7;

/** Whether a property shares its tile with little houses round it. */
export function sharesTile(b: Building) {
  return SHARED.has(b.kind) && !b.estate && b.storeys <= 4;
}

/**
 * How a tile of property at (x, z) is split up, or null when the property fills its tile (towers,
 * offices, estates...). `wealth` 0..1: richer streets have fewer, bigger houses and more trees.
 */
export function plotLayout(b: Building, x: number, z: number, wealth = 0.5): PlotLayout | null {
  if (!sharesTile(b)) return null;
  const r = (k: number) => hash(x, z, 9100 + k);
  const s = SCALE[b.kind] ?? 0.5;
  // The property: at the front, on the street, a little to one side or the other.
  const half = 0.45 * s;
  const slack = 0.5 - half - 0.03;
  const main = { x: (r(1) - 0.5) * 2 * slack * 0.7, z: 0.5 - half - 0.02, s, v: MAIN_V };

  const fillers: Filler[] = [];
  const gap = 0.014 + wealth * 0.035;
  const yardChance = 0.08 + wealth * 0.22;
  let n = 0;
  /** Fill a rectangle with a row of houses (two rows when it's deep enough). */
  const pack = (x0: number, x1: number, z0: number, z1: number, salt: number) => {
    const W = x1 - x0;
    const D = z1 - z0;
    if (W < 0.13 || D < 0.13) return;
    const rows = D > 0.4 ? 2 : 1;
    for (let row = 0; row < rows; row++) {
      const rz0 = z0 + (D / rows) * row;
      const rz1 = rz0 + D / rows;
      // Cells of different widths along the row.
      const widths: number[] = [];
      let left = W;
      let k = 0;
      while (left > 0.13) {
        const want = 0.19 + r(salt + row * 31 + k * 7) * (0.12 + wealth * 0.08);
        const w = left - want < 0.13 ? left : want;
        widths.push(w);
        left -= w;
        k++;
      }
      if (widths.length) widths[widths.length - 1] += left;
      let cx = x0;
      widths.forEach((cw, c) => {
        const h = (j: number) => r(salt + row * 31 + c * 7 + j * 101);
        const cd = rz1 - rz0;
        const mx = cx + cw / 2;
        const mz = (rz0 + rz1) / 2;
        cx += cw;
        if (n >= MAX_FILLERS) return;
        n++;
        if (h(1) < yardChance) {
          fillers.push({ x: mx, z: mz, w: cw - gap, d: cd - gap, ry: 0, storeys: 0, roof: 0, wall: h(2), tint: h(3), yard: true });
          return;
        }
        // The house: the cell less a gap round it, a little smaller now and then, slightly turned.
        const inset = h(4) * 0.04;
        let w = Math.max(0.08, cw - gap - inset);
        let d = Math.max(0.08, cd - gap - inset * 0.7);
        const ry = (h(5) - 0.5) * 0.22;
        // Turned so it's slightly off the cell: keep it inside by shrinking a little.
        w *= 1 - Math.abs(ry) * 0.5;
        d *= 1 - Math.abs(ry) * 0.5;
        const tall = h(6);
        const storeys = tall < 0.76 - wealth * 0.2 ? 1 : tall < 0.97 ? 2 : 3;
        const roofRoll = h(7);
        const roof: Filler["roof"] = storeys >= 2 && roofRoll < 0.45 ? 2 : roofRoll < 0.72 ? 0 : roofRoll < 0.92 ? 1 : 2;
        fillers.push({ x: mx + (h(8) - 0.5) * inset, z: mz + (h(9) - 0.5) * inset, w, d, ry, storeys, roof, wall: h(2), tint: h(3) });
      });
    }
  };
  const mainX0 = main.x - half - 0.03;
  const mainX1 = main.x + half + 0.03;
  const mainZ0 = main.z - half - 0.03;
  // Beside the property, along the street; then the back of the tile, all the way across.
  pack(-0.48, mainX0, mainZ0 + 0.02, 0.48, 10);
  pack(mainX1, 0.48, mainZ0 + 0.02, 0.48, 20);
  pack(-0.48, 0.48, -0.48, mainZ0, 30);
  return { main, fillers };
}

/** Corrugated roofs in Lagos: mostly rusty browns and reds, some faded grey, a few newer coloured sheets. */
export const ROOF_TINTS = [0x8b5a3c, 0x7a4b33, 0x9c6644, 0xa0522d, 0x8a5a44, 0x6f4a36, 0xb06a45, 0x94573a, 0x7f5440, 0xa86f4c, 0x9a948c, 0x7d7a74, 0x8f8a82, 0x3b6ea5, 0x2f7d5b, 0xb03a2e];
/** Wall paint: cream, beige, peach, pink, pale blue, white, grey render. */
export const WALL_TINTS = [0xefe6d4, 0xe8dcc4, 0xf2d7bd, 0xeccfcf, 0xd7e3ea, 0xf8f6f0, 0xc9c4ba, 0xe9d8a6];
