// Draws the real map's properties (src/lib/world/buildings): bungalows behind compound walls,
// duplexes, face-me-I-face-you rooming houses, blocks of flats with black water tanks on the roof,
// terraces, apartment and glass towers, lock-up shops with coloured shutters, plazas, warehouses,
// walled plots of land and farmland; and any of them left unfinished (bare concrete, rods sticking
// out of the top) or as a building site. Built from the city's shared instanced pieces (a few
// boxes each), so many different buildings cost no more to draw than before.

import type { Palette, Tile } from "@/lib/city/layout";
import { STOREY, type Building } from "@/lib/world/buildings";

type BoxFn = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry?: number, mesh?: string, tilt?: number) => void;
type AddFn = (mesh: string, p: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; color: number; tilt?: number }) => void;
type TreeFn = (dx: number, dz: number, size: number, v: number) => void;

const BASE = 0.08;
const CONCRETE = 0xb8b2a7;
const OPENING = 0x343a40;
const WINDOW = 0x6c8eae;
const TANK = 0x212529;
const WALL_FENCE = 0xd9d2c3;
const SHUTTERS = [0x1c7ed6, 0xe03131, 0x2f9e44, 0xf59f00, 0x7048e8, 0x0ca678, 0xadb5bd];
const SIGNS = [0xe03131, 0x1971c2, 0xf08c00, 0x2b8a3e, 0x862e9c];

const pick = (list: number[], v: number) => list[Math.floor(v * list.length) % list.length];

export function buildingParts(t: Tile, b: Building, pal: Palette, B: BoxFn, add: AddFn, tree: TreeFn) {
  const { x, z } = t;
  const [l0, l1, l2] = b.look;
  const wall = pick(pal.walls, l0);
  const roofColor = pick(pal.roofs, l1);
  const office = pick(pal.offices, l2);

  /** A hipped roof over a w × d footprint. */
  const roof = (dx: number, y: number, dz: number, w: number, d: number, tall: number, color = roofColor) =>
    add("roof", { x: x + dx, y, z: z + dz, sx: (w + 0.08) / Math.SQRT2, sy: tall, sz: (d + 0.08) / Math.SQRT2, ry: 0, color });
  /** A band of windows round a block, one per storey. */
  const windows = (dx: number, dz: number, w: number, d: number, from: number, storeys: number, color = WINDOW) => {
    for (let k = 0; k < storeys; k++) B(dx, from + k * STOREY + STOREY * 0.35, dz, w + 0.012, STOREY * 0.32, d + 0.012, color, 0, "glass");
  };
  /** Black plastic water tanks on a roof (most Lagos buildings have them). */
  const tanks = (dx: number, y: number, dz: number, n: number) => {
    for (let k = 0; k < n; k++) B(dx + (k - (n - 1) / 2) * 0.08, y, dz, 0.055, 0.065, 0.055, TANK, 0, "cyl");
  };
  /** A compound wall round the plot, with a gate at the front. */
  const compound = (gate = 0x495057) => {
    B(0, BASE, -0.45, 0.92, 0.12, 0.03, WALL_FENCE);
    B(-0.45, BASE, 0, 0.03, 0.12, 0.92, WALL_FENCE);
    B(0.45, BASE, 0, 0.03, 0.12, 0.92, WALL_FENCE);
    B(-0.27, BASE, 0.45, 0.38, 0.12, 0.03, WALL_FENCE);
    B(0.27, BASE, 0.45, 0.38, 0.12, 0.03, WALL_FENCE);
    B(0, BASE, 0.45, 0.16, 0.11, 0.025, gate);
  };

  // ---- a building site: bare earth, a fence, the first floor's frame
  if (b.state === "site") {
    B(0, BASE, 0, 0.86, 0.004, 0.86, 0x9c8466, 0, "ground");
    for (const [fx, fz, fw, fd] of [[0, -0.45, 0.9, 0.02], [0, 0.45, 0.9, 0.02], [-0.45, 0, 0.02, 0.9], [0.45, 0, 0.02, 0.9]] as const) B(fx, BASE, fz, fw, 0.1, fd, 0x2b8a3e);
    B(0, BASE, 0, 0.56, 0.05, 0.46, CONCRETE);
    for (const [cx, cz] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) B(cx, BASE + 0.05, cz, 0.04, STOREY, 0.04, CONCRETE);
    B(0.32, BASE, 0.3, 0.12, 0.08, 0.1, 0xe9ecef);
    return;
  }

  // ---- left unfinished: bare concrete floors, dark openings, rods out of the top
  if (b.state === "uncompleted") {
    const w = b.storeys > 4 ? 0.62 : 0.6;
    const d = b.storeys > 4 ? 0.62 : 0.48;
    const floors = Math.max(1, Math.ceil(b.storeys * 0.6));
    B(0, BASE, 0, w, floors * STOREY, d, CONCRETE);
    windows(0, 0, w, d, BASE, floors, OPENING);
    const topY = BASE + floors * STOREY;
    for (const [cx, cz] of [[-w / 2 + 0.03, -d / 2 + 0.03], [w / 2 - 0.03, -d / 2 + 0.03], [-w / 2 + 0.03, d / 2 - 0.03], [w / 2 - 0.03, d / 2 - 0.03], [0, -d / 2 + 0.03], [0, d / 2 - 0.03]]) {
      B(cx, topY, cz, 0.02, 0.2, 0.02, 0x7a5a3a);
    }
    if (l0 > 0.4) tree(0.38, 0.36, 0.35, l1);
    return;
  }

  switch (b.kind) {
    case "bungalow": {
      compound();
      const w = 0.52 + l2 * 0.1;
      const d = 0.4 + l0 * 0.08;
      B(0, BASE, -0.06, w, STOREY, d, wall);
      B(0, BASE + 0.1, -0.06, w + 0.012, 0.09, d + 0.012, WINDOW, 0, "glass");
      roof(0, BASE + STOREY, -0.06, w, d, 0.22);
      B(0, BASE, 0.17, 0.12, 0.2, 0.03, 0x6b4430);
      tree(-0.33, 0.3, 0.45, l1);
      break;
    }
    case "duplex": {
      compound(0x343a40);
      const w = 0.5;
      B(-0.08, BASE, -0.08, w, 2 * STOREY, 0.44, wall);
      windows(-0.08, -0.08, w, 0.44, BASE, 2);
      roof(-0.08, BASE + 2 * STOREY, -0.08, w, 0.44, 0.24);
      // A balcony and a carport.
      B(-0.08, BASE + STOREY, 0.17, 0.36, 0.03, 0.1, 0xe9ecef);
      B(0.3, BASE, 0.22, 0.24, 0.02, 0.3, 0x868e96, 0, "ground");
      B(0.3, BASE + 0.22, 0.22, 0.26, 0.02, 0.32, roofColor);
      break;
    }
    case "rooming": {
      // A long low block of single rooms, doors in a row, a corrugated roof.
      B(0, BASE, -0.05, 0.82, STOREY * 0.9, 0.36, pick(pal.walls, l1));
      B(0, BASE + STOREY * 0.9, -0.05, 0.88, 0.05, 0.42, 0x8d8172);
      for (let k = 0; k < 5; k++) B(-0.32 + k * 0.16, BASE, 0.135, 0.06, 0.16, 0.012, 0x5c3d2e);
      B(0.36, BASE, 0.3, 0.14, 0.12, 0.12, 0xced4da);
      tree(-0.36, 0.33, 0.35, l0);
      break;
    }
    case "flats": {
      const w = 0.66;
      const d = 0.5;
      const h = b.storeys * STOREY;
      B(0, BASE, -0.04, w, h, d, wall);
      windows(0, -0.04, w, d, BASE, b.storeys);
      // Balconies on each upper floor, a parapet and the tanks on the roof.
      for (let k = 1; k < b.storeys; k++) B(0, BASE + k * STOREY, d / 2 - 0.02, w * 0.8, 0.025, 0.1, 0xe9ecef);
      B(0, BASE + h, -0.04, w + 0.02, 0.04, d + 0.02, 0xdee2e6);
      tanks(0.12, BASE + h + 0.04, -0.12, 2);
      B(-0.3, BASE, 0.36, 0.3, 0.004, 0.16, 0x868e96, 0, "ground");
      break;
    }
    case "terrace": {
      const n = 3;
      for (let k = 0; k < n; k++) {
        const cx = -0.28 + k * 0.28;
        const c = k % 2 ? wall : pick(pal.walls, l1);
        B(cx, BASE, -0.05, 0.27, 2 * STOREY, 0.42, c);
        B(cx, BASE + 0.4, -0.05, 0.28, 0.08, 0.43, WINDOW, 0, "glass");
        roof(cx, BASE + 2 * STOREY, -0.05, 0.27, 0.42, 0.18);
      }
      B(0, BASE, 0.3, 0.9, 0.004, 0.14, 0x868e96, 0, "ground");
      break;
    }
    case "apartments": {
      const w = 0.62;
      const h = b.storeys * STOREY;
      B(0, BASE, 0, w, h, w, pick(pal.towers, l1));
      for (let k = 1; k < b.storeys; k++) B(0, BASE + k * STOREY, 0, w + 0.06, 0.03, w + 0.06, 0xf1f3f5);
      windows(0, 0, w, w, BASE, b.storeys, 0x4c6e91);
      B(0, BASE + h, 0, w * 0.6, STOREY, w * 0.6, pick(pal.towers, l1));
      tanks(0.18, BASE + h, 0.18, 2);
      break;
    }
    case "shops": {
      // A row of lock-up shops, each with its own coloured shutter, and a sign along the top.
      B(0, BASE, -0.08, 0.86, STOREY, 0.4, 0xf1ece4);
      for (let k = 0; k < 5; k++) B(-0.34 + k * 0.17, BASE, 0.125, 0.14, STOREY * 0.7, 0.012, pick(SHUTTERS, l0 + k * 0.37));
      B(0, BASE + STOREY, 0.12, 0.86, 0.07, 0.02, pick(SIGNS, l2));
      B(0, BASE + STOREY, -0.08, 0.9, 0.03, 0.44, 0x8d8172);
      break;
    }
    case "plaza": {
      const h = b.storeys * STOREY;
      B(0, BASE, -0.1, 0.84, h, 0.6, office);
      B(0, BASE + 0.02, -0.1, 0.85, STOREY * 0.8, 0.61, 0x9ec5e8, 0, "glass");
      windows(0, -0.1, 0.84, 0.6, BASE + STOREY, b.storeys - 1);
      B(0, BASE + h, 0.2, 0.6, 0.14, 0.03, pick(SIGNS, l0));
      // Parking out front.
      B(0, BASE, 0.36, 0.84, 0.004, 0.18, 0x868e96, 0, "ground");
      for (let k = -3; k <= 3; k++) B(k * 0.12, BASE + 0.006, 0.36, 0.01, 0.002, 0.14, 0xffffff, 0, "paint");
      break;
    }
    case "mixed": {
      const h = b.storeys * STOREY;
      B(0, BASE, -0.06, 0.7, h, 0.5, wall);
      for (let k = 0; k < 3; k++) B(-0.22 + k * 0.22, BASE, 0.195, 0.18, STOREY * 0.7, 0.012, pick(SHUTTERS, l1 + k * 0.29));
      windows(0, -0.06, 0.7, 0.5, BASE + STOREY, b.storeys - 1);
      B(0, BASE + STOREY, 0.2, 0.7, 0.03, 0.08, 0xe9ecef);
      tanks(-0.15, BASE + h, -0.1, 2);
      break;
    }
    case "offices": {
      const h = b.storeys * STOREY;
      const w = 0.7 + l0 * 0.12;
      B(0, BASE, 0, w, h, 0.6, office);
      windows(0, 0, w, 0.6, BASE, b.storeys, WINDOW);
      B(-w * 0.2, BASE + h, 0, 0.18, 0.1, 0.18, 0xced4da);
      break;
    }
    case "glass": {
      const h = b.storeys * STOREY;
      const w = 0.64 + l1 * 0.12;
      const color = pick([0x6c8eae, 0x5b7fa6, 0x7aa7c7, 0x4f6f8f, 0x8fb3cc], l0);
      B(0, BASE, 0, w, h * 0.78, w, color, 0, "glass");
      B(0, BASE + h * 0.78, 0, w * 0.76, h * 0.22, w * 0.76, color, 0, "glass");
      for (let y = 1.2; y < h * 0.78; y += 1.2) B(0, BASE + y, 0, w + 0.015, 0.03, w + 0.015, 0xe9ecef);
      B(0, BASE + h, 0, 0.06, 0.4, 0.06, 0xdee2e6, 0, "cone");
      break;
    }
    case "warehouse": {
      B(0, BASE, -0.04, 0.86, 0.36, 0.66, 0xdee2e6);
      add("roof", { x, y: BASE + 0.36, z: z - 0.04, sx: 0.66, sy: 0.12, sz: 0.5, ry: Math.PI / 4, color: 0x868e96 });
      for (let k = 0; k < 3; k++) B(-0.28 + k * 0.28, BASE, 0.295, 0.2, 0.24, 0.012, 0x495057);
      B(0, BASE, 0.4, 0.9, 0.004, 0.16, 0x868e96, 0, "ground");
      break;
    }
    case "land": {
      // A walled plot: sand and weeds, a gate, a painted warning on the wall.
      compound(0x868e96);
      B(0, BASE, 0, 0.86, 0.004, 0.86, 0xd8c39a, 0, "ground");
      B(0.2, BASE + 0.06, 0.465, 0.3, 0.05, 0.004, 0xc92a2a, 0, "paint");
      if (l1 > 0.5) tree(-0.25, -0.2, 0.4, l2);
      break;
    }
    case "farm": {
      // Rows of crops, a little shed.
      B(0, BASE, 0, 0.94, 0.004, 0.94, 0x8f7a55, 0, "ground");
      for (let k = -3; k <= 3; k++) B(k * 0.13, BASE + 0.005, 0, 0.06, 0.04, 0.88, pick([0x5c940d, 0x74b816, 0x82c91e], l0 + k * 0.1));
      B(0.36, BASE, -0.36, 0.16, 0.14, 0.14, 0xb08968);
      break;
    }
  }
}
