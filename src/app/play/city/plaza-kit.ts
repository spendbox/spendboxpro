// Town squares (plazas) on the map: not all fountains. Each one is one of eight: a statue, a
// fountain, a clock tower, a bandstand, a bold sculpture, a shady square of trees and benches with
// umbrella tables, a flag square with a star-shaped planter, or a chessboard square. Drawn on the
// paved square (0.8 of a tile, top at about 0.1) from the city's shared pieces.

import type { Tile } from "@/lib/city/layout";
import { statue } from "./megas";
import { sculpture } from "./museum-kit";

type BoxFn = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry?: number, mesh?: string, tilt?: number) => void;
type TreeFn = (dx: number, dz: number, size: number, v: number) => void;

export const PLAZA_DESIGNS = ["statue", "fountain", "clock", "bandstand", "sculpture", "shade", "flags", "chess"] as const;
export type PlazaDesign = (typeof PLAZA_DESIGNS)[number];

/** Which square this is (stable for the tile). */
export function plazaDesign(t: Pick<Tile, "r">): PlazaDesign {
  return PLAZA_DESIGNS[Math.floor(t.r[1] * PLAZA_DESIGNS.length) % PLAZA_DESIGNS.length];
}

const STONE = 0xcfd6dd;
const BENCH = 0x8d5a3b;
const UMBRELLAS = [0xe03131, 0x1c7ed6, 0xfab005, 0x2f9e44, 0xf76707];

const bench = (B: BoxFn, x: number, z: number, ry: number) => {
  B(x, 0.1, z, 0.16, 0.03, 0.05, BENCH, ry);
  B(x, 0.13, z - Math.cos(ry) * 0.022, 0.16, 0.035, 0.008, BENCH, ry);
};

export function plazaParts(t: Tile, B: BoxFn, tree: TreeFn, water: number) {
  const v = t.r[0];
  switch (plazaDesign(t)) {
    case "statue":
      statue(B, 0, 0, 0.7);
      for (const [x, z, ry] of [[-0.3, 0, Math.PI / 2], [0.3, 0, -Math.PI / 2]] as const) bench(B, x, z, ry);
      break;
    case "fountain":
      B(0, 0.1, 0, 0.3, 0.12, 0.3, STONE, 0, "disc");
      B(0, 0.22, 0, 0.25, 0.02, 0.25, water, 0, "waterDisc");
      B(0, 0.22, 0, 0.04, 0.12, 0.04, STONE, 0, "cyl");
      B(0, 0.34, 0, 0.1, 0.02, 0.1, STONE, 0, "disc");
      break;
    case "clock": {
      // A clock tower: a tall square shaft, four white faces, a pointed cap.
      B(0, 0.1, 0, 0.16, 0.04, 0.16, 0xb5a68c);
      B(0, 0.14, 0, 0.11, 0.46, 0.11, v < 0.5 ? 0xd9c7a3 : 0xb0563a);
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        B(Math.sin(a) * 0.056, 0.47, Math.cos(a) * 0.056, 0.07, 0.07, 0.006, 0xffffff, a);
        B(Math.sin(a) * 0.06, 0.5, Math.cos(a) * 0.06, 0.004, 0.028, 0.003, 0x1a1b1e, a);
      }
      B(0, 0.6, 0, 0.13, 0.03, 0.13, 0x6b5b45);
      B(0, 0.63, 0, 0.16, 0.12, 0.16, 0x2b8a3e, Math.PI / 4, "roof");
      for (const [x, z] of [[-0.28, -0.28], [0.28, 0.28]]) tree(x, z, 0.3, v + x);
      break;
    }
    case "bandstand": {
      // An eight-sided bandstand: a raised floor, thin posts, a green tent roof.
      B(0, 0.1, 0, 0.42, 0.05, 0.42, 0xe9e2d0, 0, "disc");
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        B(Math.sin(a) * 0.18, 0.15, Math.cos(a) * 0.18, 0.012, 0.16, 0.012, 0xffffff, 0, "cyl");
      }
      B(0, 0.31, 0, 0.46, 0.02, 0.46, 0xffffff, 0, "disc");
      B(0, 0.33, 0, 0.5, 0.14, 0.5, v < 0.5 ? 0x2b8a3e : 0xc92a2a, 0, "cone");
      for (const [x, z, ry] of [[-0.33, 0.3, 0], [0.33, 0.3, 0], [0, -0.33, Math.PI]] as const) bench(B, x, z, ry);
      break;
    }
    case "sculpture":
      sculpture(B, 0, 0, 0.45, v * 97 + t.r[2] * 13);
      for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) tree(x, z, 0.24, v + x * 3 + z);
      break;
    case "shade": {
      // Trees with benches round them, and umbrella tables where people eat.
      for (const [x, z] of [[-0.22, -0.22], [0.22, 0.22]]) {
        B(x, 0.1, z, 0.2, 0.04, 0.2, 0x8a7a68, 0, "cyl");
        tree(x, z, 0.38, v + x);
      }
      for (const [x, z] of [[0.22, -0.22], [-0.22, 0.22]] as const) {
        const u = UMBRELLAS[Math.floor((v * 7 + x * 3 + z * 5 + 9) % UMBRELLAS.length)];
        B(x, 0.1, z, 0.012, 0.2, 0.012, 0xdee2e6, 0, "cyl");
        B(x, 0.28, z, 0.22, 0.05, 0.22, u, 0, "cone");
        B(x, 0.15, z, 0.1, 0.01, 0.1, 0xffffff, 0, "disc");
        for (const s of [-1, 1]) B(x + s * 0.08, 0.1, z, 0.035, 0.04, 0.035, 0xf8f9fa);
      }
      break;
    }
    case "flags": {
      // A star-shaped planter in the middle, flag poles round it.
      B(0, 0.1, 0, 0.3, 0.05, 0.3, 0xb5a68c, Math.PI / 4);
      B(0, 0.1, 0, 0.3, 0.05, 0.3, 0xb5a68c);
      B(0, 0.15, 0, 0.26, 0.012, 0.26, 0x5c940d);
      B(0, 0.15, 0, 0.26, 0.012, 0.26, 0x5c940d, Math.PI / 4);
      for (let k = 0; k < 6; k++) B(Math.sin(k) * 0.06, 0.16, Math.cos(k) * 0.06, 0.04, 0.03, 0.04, [0xe64980, 0xfab005, 0xf8f9fa][k % 3], 0, "crown");
      for (let k = 0; k < 5; k++) {
        const x = -0.3 + k * 0.15;
        B(x, 0.1, -0.33, 0.01, 0.5, 0.01, 0xdee2e6, 0, "cyl");
        const c = k % 2 ? [0x008751, 0xffffff, 0x008751] : [0x1c63d6, 0xfab005, 0xe03131];
        for (let j = 0; j < 3; j++) B(x + 0.03 + j * 0.03, 0.5, -0.33, 0.03, 0.06, 0.004, c[j]);
      }
      break;
    }
    default: {
      // A big chessboard on the paving, two benches, and shade trees.
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) B(-0.12 + i * 0.08, 0.101, -0.12 + j * 0.08, 0.08, 0.004, 0.08, (i + j) % 2 ? 0x343a40 : 0xf1f3f5, 0, "paint");
      for (let k = 0; k < 4; k++) B(-0.1 + k * 0.08, 0.1, -0.12 + (k % 2) * 0.24, 0.025, 0.06, 0.025, k < 2 ? 0xf8f9fa : 0x1a1b1e, 0, "cyl");
      for (const [x, z, ry] of [[0, 0.3, 0], [0, -0.3, Math.PI]] as const) bench(B, x, z, ry);
      for (const [x, z] of [[-0.3, -0.28], [0.3, 0.28], [0.3, -0.28]]) tree(x, z, 0.3, v + x + z);
    }
  }
}
