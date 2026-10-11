// Draws the real map's properties (src/lib/world/buildings): bungalows behind compound walls,
// duplexes, face-me-I-face-you rooming houses, blocks of flats with black water tanks on the roof,
// terraces, apartment and glass towers, lock-up shops with coloured shutters, plazas, warehouses,
// walled plots of land and farmland; and any of them left unfinished (bare concrete, rods sticking
// out of the top) or as a building site.
//
// Each kind comes in several shapes (L, T, twin blocks, courtyards, setbacks), roofs (hipped,
// gabled, flat with a parapet) and extras (porches, balconies, a parked car, a helipad), picked by
// the building's own stable numbers, and every building turns to face its street. Gated estates
// share one wall round their block. All of it from the city's shared instanced pieces (a few
// boxes each), so variety costs no more to draw.

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
const ESTATE_WALL = 0xe9e2d3;
const SHUTTERS = [0x1c7ed6, 0xe03131, 0x2f9e44, 0xf59f00, 0x7048e8, 0x0ca678, 0xadb5bd];
const SIGNS = [0xe03131, 0x1971c2, 0xf08c00, 0x2b8a3e, 0x862e9c];
const CARS = [0xf8f9fa, 0x212529, 0xc92a2a, 0x1864ab, 0xadb5bd, 0xf59f00];
const GLASS = [0x6c8eae, 0x5b7fa6, 0x7aa7c7, 0x4f6f8f, 0x8fb3cc, 0x6f8f7f];
/** Bands of colour round the foot of a wall, common on Lagos buildings. */
const ACCENTS = [0x8d6e63, 0x1c7ed6, 0x2b8a3e, 0xc92a2a, 0x495057, 0xe8590c];

const pick = (list: number[], v: number) => list[Math.floor(v * list.length) % list.length];
const pickOf = <T,>(list: readonly T[], v: number) => list[Math.floor(v * list.length) % list.length];

export function buildingParts(t: Tile, b: Building, pal: Palette, B0: BoxFn, add0: AddFn, tree0: TreeFn) {
  const { x, z } = t;
  const [l0, l1, l2, l3, l4] = b.look;
  // Everything below is drawn facing +z, then turned to face the street.
  const turn = (b.face * Math.PI) / 2;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const rot = (dx: number, dz: number): [number, number] => [dx * cos + dz * sin, -dx * sin + dz * cos];
  const B: BoxFn = (dx, y, dz, sx, sy, sz, color, ry = 0, mesh = "building", tilt = 0) => {
    const [rx, rz] = rot(dx, dz);
    B0(rx, y, rz, sx, sy, sz, color, ry + turn, mesh, tilt);
  };
  const tree = (dx: number, dz: number, size: number, v: number) => {
    const [rx, rz] = rot(dx, dz);
    tree0(rx, rz, size, v);
  };
  const wall = pick(pal.walls, l0);
  const roofColor = pick(pal.roofs, l1);
  const office = pick(pal.offices, l2);
  const accent = pick(ACCENTS, l4);

  /** A roof over a w × d footprint: hipped, gabled (a ridge along the long side) or flat with a parapet. */
  const roof = (dx: number, y: number, dz: number, w: number, d: number, style: number, color = roofColor) => {
    const [rx, rz] = rot(dx, dz);
    if (style < 0.5) {
      add0("roof", { x: x + rx, y, z: z + rz, sx: (w + 0.08) / Math.SQRT2, sy: 0.22, sz: (d + 0.08) / Math.SQRT2, ry: turn, color });
    } else if (style < 0.8) {
      // Gabled: two tilted slabs meeting at a ridge.
      // Each slab turned so its length runs front to back, then tilted up towards the ridge.
      for (const side of [-1, 1]) B(dx, y + 0.045, dz + side * (d / 4 + 0.01), d / 2 + 0.07, 0.025, w + 0.06, color, Math.PI / 2, "building", side * 0.5);
      B(dx, y, dz, w, 0.06, 0.02, wall);
    } else {
      B(dx, y, dz, w + 0.02, 0.05, d + 0.02, 0xdee2e6);
      tanks(dx + w * 0.2, y + 0.05, dz - d * 0.15, 1);
    }
  };
  /** A band of windows round a block, one per storey. */
  const windows = (dx: number, dz: number, w: number, d: number, from: number, storeys: number, color = WINDOW) => {
    for (let k = 0; k < storeys; k++) B(dx, from + k * STOREY + STOREY * 0.35, dz, w + 0.012, STOREY * 0.32, d + 0.012, color, 0, "glass");
  };
  /** A block: walls, windows on each storey, a coloured band round its foot. */
  const block = (dx: number, dz: number, w: number, d: number, storeys: number, color = wall, glass = WINDOW) => {
    B(dx, BASE, dz, w, storeys * STOREY, d, color);
    windows(dx, dz, w, d, BASE, storeys, glass);
    B(dx, BASE, dz, w + 0.01, 0.05, d + 0.01, accent);
  };
  /** Black plastic water tanks on a roof (most Lagos buildings have them). */
  const tanks = (dx: number, y: number, dz: number, n: number) => {
    for (let k = 0; k < n; k++) B(dx + (k - (n - 1) / 2) * 0.08, y, dz, 0.055, 0.065, 0.055, TANK, 0, "cyl");
  };
  /** A parked car on the forecourt. */
  const car = (dx: number, dz: number, v: number) => {
    const c = pick(CARS, v);
    B(dx, BASE, dz, 0.09, 0.05, 0.16, c);
    B(dx, BASE + 0.05, dz + 0.01, 0.08, 0.04, 0.09, 0x343a40, 0, "glass");
  };
  /** A compound wall round the plot, with a gate at the front (or an estate's wall on its outside edges). */
  const compound = (gate = 0x495057) => {
    // Estate houses share the estate's wall instead (drawn at the end).
    if (b.estate) return;
    B(0, BASE, -0.45, 0.92, 0.12, 0.03, WALL_FENCE);
    B(-0.45, BASE, 0, 0.03, 0.12, 0.92, WALL_FENCE);
    B(0.45, BASE, 0, 0.03, 0.12, 0.92, WALL_FENCE);
    B(-0.27, BASE, 0.45, 0.38, 0.12, 0.03, WALL_FENCE);
    B(0.27, BASE, 0.45, 0.38, 0.12, 0.03, WALL_FENCE);
    B(0, BASE, 0.45, 0.16, 0.11, 0.025, gate);
  };
  /** The estate's own wall, only where this lot meets a road, and its gate now and then. */
  const estateWall = () => {
    if (b.estate) {
      const sides: [number, number, number, number][] = [[0, 0.46, 0.94, 0.03], [0.46, 0, 0.03, 0.94], [0, -0.46, 0.94, 0.03], [-0.46, 0, 0.03, 0.94]];
      b.estate.walls.forEach((on, k) => {
        if (!on) return;
        const [fx, fz, fw, fd] = sides[k];
        // Walls are given in world directions: undo the building's turn.
        B0(fx, BASE, fz, fw, 0.16, fd, ESTATE_WALL);
        if (b.estate!.gate) {
          B0(fx, BASE, fz, fw > fd ? 0.22 : fw + 0.01, 0.15, fd > fw ? 0.22 : fd + 0.01, 0x343a40);
          B0(fx + (fw > fd ? 0.14 : 0), BASE, fz + (fd > fw ? 0.14 : 0), 0.06, 0.24, 0.06, ESTATE_WALL);
        }
      });
    }
  };

  // ---- a building site: bare earth, a fence, the first floor's frame
  if (b.state === "site") {
    B(0, BASE, 0, 0.86, 0.004, 0.86, 0x9c8466, 0, "ground");
    for (const [fx, fz, fw, fd] of [[0, -0.45, 0.9, 0.02], [0, 0.45, 0.9, 0.02], [-0.45, 0, 0.02, 0.9], [0.45, 0, 0.02, 0.9]] as const) B(fx, BASE, fz, fw, 0.1, fd, 0x2b8a3e);
    B(0, BASE, 0, 0.56, 0.05, 0.46, CONCRETE);
    for (const [cx, cz] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) B(cx, BASE + 0.05, cz, 0.04, STOREY, 0.04, CONCRETE);
    B(0.32, BASE, 0.3, 0.12, 0.08, 0.1, 0xe9ecef);
    if (l3 > 0.5) B(-0.3, BASE, 0.3, 0.16, 0.08, 0.12, 0xc2a878);
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
    // Some have a half-built floor of columns on top, some a faded "for sale" board.
    if (l3 > 0.55) for (const cx of [-w / 2 + 0.03, w / 2 - 0.03]) B(cx, topY, 0, 0.04, STOREY, 0.04, CONCRETE);
    if (l4 > 0.6) B(0.3, BASE, 0.4, 0.2, 0.14, 0.012, 0xf8f9fa);
    if (l0 > 0.4) tree(0.38, 0.36, 0.35, l1);
    return;
  }

  switch (b.kind) {
    case "bungalow": {
      compound();
      const shape = l3;
      if (shape < 0.4) {
        B(0, BASE, -0.06, 0.58, STOREY, 0.42, wall);
        B(0, BASE + 0.1, -0.06, 0.59, 0.09, 0.43, WINDOW, 0, "glass");
        roof(0, BASE + STOREY, -0.06, 0.58, 0.42, l2);
      } else if (shape < 0.75) {
        // L-shaped.
        B(-0.08, BASE, -0.1, 0.5, STOREY, 0.36, wall);
        B(0.2, BASE, 0.05, 0.22, STOREY, 0.42, wall);
        B(-0.08, BASE + 0.1, -0.1, 0.51, 0.09, 0.37, WINDOW, 0, "glass");
        roof(-0.08, BASE + STOREY, -0.1, 0.5, 0.36, l2);
        roof(0.2, BASE + STOREY, 0.05, 0.22, 0.42, l2);
      } else {
        // T-shaped, with a pillared porch.
        B(0, BASE, -0.14, 0.64, STOREY, 0.3, wall);
        B(0, BASE, 0.08, 0.26, STOREY, 0.26, wall);
        roof(0, BASE + STOREY, -0.14, 0.64, 0.3, l2);
        roof(0, BASE + STOREY, 0.08, 0.26, 0.26, l2);
        for (const cx of [-0.1, 0.1]) B(cx, BASE, 0.24, 0.03, STOREY, 0.03, 0xf8f9fa, 0, "cyl");
        B(0, BASE + STOREY, 0.22, 0.28, 0.03, 0.1, 0xe9ecef);
      }
      B(0, BASE, 0.2, 0.12, 0.2, 0.03, 0x6b4430);
      if (l4 > 0.5) car(0.3, 0.28, l0);
      else tree(-0.33, 0.3, 0.45, l1);
      break;
    }
    case "duplex": {
      compound(0x343a40);
      const twin = l3 > 0.6;
      if (twin) {
        // Semi-detached: two mirrored halves.
        for (const side of [-1, 1]) {
          block(side * 0.17, -0.08, 0.32, 0.44, 2, side > 0 ? wall : pick(pal.walls, l2));
          roof(side * 0.17, BASE + 2 * STOREY, -0.08, 0.32, 0.44, l2);
          B(side * 0.17, BASE + STOREY, 0.17, 0.22, 0.03, 0.1, 0xe9ecef);
        }
      } else {
        block(-0.08, -0.08, 0.5, 0.44, 2);
        roof(-0.08, BASE + 2 * STOREY, -0.08, 0.5, 0.44, l2);
        // A balcony with a rail, and a carport.
        B(-0.08, BASE + STOREY, 0.17, 0.36, 0.03, 0.1, 0xe9ecef);
        B(-0.08, BASE + STOREY + 0.03, 0.215, 0.36, 0.06, 0.01, 0xf8f9fa);
        B(0.3, BASE, 0.22, 0.24, 0.02, 0.3, 0x868e96, 0, "ground");
        B(0.3, BASE + 0.22, 0.22, 0.26, 0.02, 0.32, roofColor);
        if (l4 > 0.4) car(0.3, 0.22, l1);
      }
      break;
    }
    case "rooming": {
      // A long low block of single rooms, doors in a row, a corrugated roof; sometimes two rows
      // facing each other across a yard.
      const rows = l3 > 0.6 ? [-0.24, 0.16] : [-0.05];
      for (const rz of rows) {
        B(0, BASE, rz, 0.82, STOREY * 0.9, rows.length > 1 ? 0.26 : 0.36, pick(pal.walls, l1));
        B(0, BASE, rz, 0.83, 0.05, rows.length > 1 ? 0.27 : 0.37, accent);
        B(0, BASE + STOREY * 0.9, rz, 0.88, 0.05, rows.length > 1 ? 0.32 : 0.42, 0x8d8172);
        const front = rz + (rows.length > 1 ? 0.135 : 0.185);
        for (let k = 0; k < 5; k++) B(-0.32 + k * 0.16, BASE, front, 0.06, 0.16, 0.012, 0x5c3d2e);
      }
      B(0.36, BASE, 0.36, 0.14, 0.12, 0.12, 0xced4da);
      tree(-0.36, 0.36, 0.35, l0);
      break;
    }
    case "flats": {
      const h = b.storeys * STOREY;
      const shape = l3;
      if (shape < 0.45) {
        block(0, -0.04, 0.66, 0.5, b.storeys);
        for (let k = 1; k < b.storeys; k++) B(0, BASE + k * STOREY, 0.23, 0.53, 0.025, 0.1, 0xe9ecef);
        roof(0, BASE + h, -0.04, 0.66, 0.5, l2 > 0.6 ? 0.9 : l2);
        tanks(0.12, BASE + h + 0.05, -0.12, 2);
      } else if (shape < 0.7) {
        // L-shaped block round a car park.
        block(-0.08, -0.18, 0.7, 0.36, b.storeys);
        block(0.24, 0.12, 0.3, 0.3, b.storeys);
        B(-0.08, BASE + h, -0.18, 0.72, 0.04, 0.38, 0xdee2e6);
        B(0.24, BASE + h, 0.12, 0.32, 0.04, 0.32, 0xdee2e6);
        tanks(-0.2, BASE + h + 0.04, -0.2, 3);
        car(-0.25, 0.25, l1);
      } else {
        // Twin blocks with a stair core between them.
        for (const cx of [-0.22, 0.22]) {
          block(cx, -0.04, 0.36, 0.5, b.storeys);
          B(cx, BASE + h, -0.04, 0.38, 0.04, 0.52, 0xdee2e6);
          tanks(cx, BASE + h + 0.04, -0.12, 1);
        }
        B(0, BASE, -0.04, 0.08, h + 0.12, 0.2, 0xced4da);
      }
      B(-0.3, BASE, 0.38, 0.3, 0.004, 0.14, 0x868e96, 0, "ground");
      break;
    }
    case "terrace": {
      const n = l3 > 0.5 ? 4 : 3;
      const step = 0.84 / n;
      for (let k = 0; k < n; k++) {
        const cx = -0.42 + step * (k + 0.5);
        const c = k % 2 ? wall : pick(pal.walls, l1);
        B(cx, BASE, -0.05, step - 0.01, 2 * STOREY, 0.42, c);
        B(cx, BASE + 0.4, -0.05, step, 0.08, 0.43, WINDOW, 0, "glass");
        roof(cx, BASE + 2 * STOREY, -0.05, step - 0.01, 0.42, l2);
      }
      B(0, BASE, 0.3, 0.9, 0.004, 0.14, 0x868e96, 0, "ground");
      if (l4 > 0.5) car(-0.2, 0.3, l0);
      break;
    }
    case "apartments": {
      const w = 0.62;
      const h = b.storeys * STOREY;
      const color = pick(pal.towers, l1);
      if (l3 < 0.5) {
        B(0, BASE, 0, w, h, w, color);
        for (let k = 1; k < b.storeys; k++) B(0, BASE + k * STOREY, 0, w + 0.06, 0.03, w + 0.06, 0xf1f3f5);
        windows(0, 0, w, w, BASE, b.storeys, 0x4c6e91);
        B(0, BASE + h, 0, w * 0.6, STOREY, w * 0.6, color);
      } else {
        // Stepped: setbacks with terraces, a penthouse on top.
        const lower = Math.ceil(b.storeys * 0.6);
        B(0, BASE, 0, w + 0.06, lower * STOREY, w, color);
        windows(0, 0, w + 0.06, w, BASE, lower, 0x4c6e91);
        B(0, BASE + lower * STOREY, -0.05, w * 0.75, (b.storeys - lower) * STOREY, w * 0.7, color);
        windows(0, -0.05, w * 0.75, w * 0.7, BASE + lower * STOREY, b.storeys - lower, 0x4c6e91);
        B(0, BASE + lower * STOREY, 0.22, w, 0.02, 0.15, 0x8ce99a, 0, "ground");
      }
      tanks(0.18, BASE + h, 0.18, 2);
      if (l4 > 0.6) B(-0.3, BASE, 0.35, 0.2, 0.04, 0.12, 0x74c0fc, 0, "glass");
      break;
    }
    case "shops": {
      // A row of lock-up shops, each with its own coloured shutter, and a sign along the top;
      // sometimes a canopy over the walkway.
      B(0, BASE, -0.08, 0.86, STOREY, 0.4, 0xf1ece4);
      for (let k = 0; k < 5; k++) B(-0.34 + k * 0.17, BASE, 0.125, 0.14, STOREY * 0.7, 0.012, pick(SHUTTERS, l0 + k * 0.37));
      B(0, BASE + STOREY, 0.12, 0.86, 0.07, 0.02, pick(SIGNS, l2));
      B(0, BASE + STOREY, -0.08, 0.9, 0.03, 0.44, 0x8d8172);
      if (l3 > 0.5) B(0, BASE + STOREY * 0.8, 0.2, 0.86, 0.02, 0.14, pick(SIGNS, l4));
      break;
    }
    case "plaza": {
      const h = b.storeys * STOREY;
      B(0, BASE, -0.1, 0.84, h, 0.6, office);
      B(0, BASE + 0.02, -0.1, 0.85, STOREY * 0.8, 0.61, 0x9ec5e8, 0, "glass");
      windows(0, -0.1, 0.84, 0.6, BASE + STOREY, b.storeys - 1);
      if (l3 > 0.5) {
        // A glass atrium in the middle.
        B(0, BASE, -0.1, 0.24, h + 0.12, 0.62, 0x9ec5e8, 0, "glass");
      }
      B(0, BASE + h, 0.2, 0.6, 0.14, 0.03, pick(SIGNS, l0));
      // Parking out front.
      B(0, BASE, 0.36, 0.84, 0.004, 0.18, 0x868e96, 0, "ground");
      for (let k = -3; k <= 3; k++) B(k * 0.12, BASE + 0.006, 0.36, 0.01, 0.002, 0.14, 0xffffff, 0, "paint");
      for (let k = 0; k < 3; k++) if (pickOf([true, false], l4 + k * 0.31)) car(-0.3 + k * 0.24, 0.36, l1 + k * 0.2);
      break;
    }
    case "mixed": {
      const h = b.storeys * STOREY;
      B(0, BASE, -0.06, 0.7, h, 0.5, wall);
      for (let k = 0; k < 3; k++) B(-0.22 + k * 0.22, BASE, 0.195, 0.18, STOREY * 0.7, 0.012, pick(SHUTTERS, l1 + k * 0.29));
      windows(0, -0.06, 0.7, 0.5, BASE + STOREY, b.storeys - 1);
      B(0, BASE + STOREY, 0.2, 0.7, 0.03, 0.08, 0xe9ecef);
      if (l3 > 0.5) for (let k = 2; k < b.storeys; k++) B(0, BASE + k * STOREY, 0.2, 0.5, 0.025, 0.08, 0xe9ecef);
      roof(0, BASE + h, -0.06, 0.7, 0.5, l2 > 0.5 ? 0.9 : l2);
      tanks(-0.15, BASE + h + 0.05, -0.1, 2);
      break;
    }
    case "offices": {
      const h = b.storeys * STOREY;
      const w = 0.7 + l0 * 0.12;
      if (l3 < 0.5) {
        B(0, BASE, 0, w, h, 0.6, office);
        windows(0, 0, w, 0.6, BASE, b.storeys, WINDOW);
      } else {
        // A glass front on a solid block.
        B(0, BASE, -0.05, w, h, 0.5, office);
        B(0, BASE, 0.21, w * 0.9, h, 0.03, pick(GLASS, l1), 0, "glass");
        windows(0, -0.05, w, 0.5, BASE, b.storeys, WINDOW);
      }
      B(-w * 0.2, BASE + h, 0, 0.18, 0.1, 0.18, 0xced4da);
      if (l4 > 0.5) B(w * 0.2, BASE + h, 0.05, 0.2, 0.12, 0.03, pick(SIGNS, l2));
      break;
    }
    case "glass": {
      const h = b.storeys * STOREY;
      const w = 0.64 + l1 * 0.12;
      const color = pick(GLASS, l0);
      const style = l3;
      if (style < 0.35) {
        B(0, BASE, 0, w, h * 0.78, w, color, 0, "glass");
        B(0, BASE + h * 0.78, 0, w * 0.76, h * 0.22, w * 0.76, color, 0, "glass");
        B(0, BASE + h, 0, 0.06, 0.4, 0.06, 0xdee2e6, 0, "cone");
      } else if (style < 0.7) {
        // Three tiers.
        B(0, BASE, 0, w, h * 0.5, w, color, 0, "glass");
        B(0, BASE + h * 0.5, 0, w * 0.82, h * 0.3, w * 0.82, color, 0, "glass");
        B(0, BASE + h * 0.8, 0, w * 0.62, h * 0.2, w * 0.62, color, 0, "glass");
        B(0, BASE + h, 0, w * 0.5, 0.03, w * 0.5, 0x495057, 0, "cyl");
        B(0, BASE + h + 0.035, 0, 0.16, 0.004, 0.04, 0xffffff, 0, "paint");
      } else {
        // Slim slab with a sloped crown.
        B(0, BASE, 0, w, h, w * 0.7, color, 0, "glass");
        B(0, BASE + h, 0, w, 0.3, w * 0.7, color, 0, "glass", 0.5);
      }
      for (let y = 1.2; y < h * 0.78; y += 1.2) B(0, BASE + y, 0, w + 0.015, 0.03, w * (style >= 0.7 ? 0.7 : 1) + 0.015, 0xe9ecef);
      // A podium of shops at the foot.
      if (l4 > 0.4) B(0, BASE, 0.3, w + 0.1, STOREY, 0.2, office);
      break;
    }
    case "warehouse": {
      B(0, BASE, -0.04, 0.86, 0.36, 0.66, l3 > 0.5 ? 0xdee2e6 : 0xced4da);
      add0("roof", { x, y: BASE + 0.36, z, sx: 0.66, sy: 0.12, sz: 0.5, ry: turn + Math.PI / 4, color: 0x868e96 });
      for (let k = 0; k < 3; k++) B(-0.28 + k * 0.28, BASE, 0.295, 0.2, 0.24, 0.012, 0x495057);
      B(0, BASE, 0.4, 0.9, 0.004, 0.16, 0x868e96, 0, "ground");
      if (l4 > 0.4) {
        // A container or a lorry in the yard.
        B(0.25, BASE, 0.4, 0.3, 0.1, 0.09, pick([0x1864ab, 0xc92a2a, 0x2b8a3e, 0xe8590c], l2));
      }
      break;
    }
    case "land": {
      // A walled plot: sand and weeds, a gate, a painted warning on the wall.
      compound(0x868e96);
      B(0, BASE, 0, 0.86, 0.004, 0.86, 0xd8c39a, 0, "ground");
      B(0.2, BASE + 0.06, 0.465, 0.3, 0.05, 0.004, 0xc92a2a, 0, "paint");
      if (l1 > 0.5) tree(-0.25, -0.2, 0.4, l2);
      if (l3 > 0.6) tree(0.25, -0.25, 0.3, l4);
      break;
    }
    case "farm": {
      // Rows of crops (or a plantain grove), a little shed.
      B(0, BASE, 0, 0.94, 0.004, 0.94, 0x8f7a55, 0, "ground");
      if (l3 < 0.6) {
        for (let k = -3; k <= 3; k++) B(k * 0.13, BASE + 0.005, 0, 0.06, 0.04, 0.88, pick([0x5c940d, 0x74b816, 0x82c91e], l0 + k * 0.1));
      } else {
        for (let k = 0; k < 6; k++) tree(-0.3 + (k % 3) * 0.3, -0.25 + Math.floor(k / 3) * 0.4, 0.35, l1 + k * 0.1);
      }
      B(0.36, BASE, -0.36, 0.16, 0.14, 0.14, 0xb08968);
      break;
    }
  }
  // An estate house: the estate's wall on its outside edges, a little front garden.
  if (b.estate) {
    estateWall();
    B(0, BASE, 0.38, 0.6, 0.004, 0.12, 0x9fd88f, 0, "ground");
  }
}
