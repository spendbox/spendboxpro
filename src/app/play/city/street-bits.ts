// Single-lot buildings and little named things round the city, drawn with the city's shared
// shapes (so they cost nothing extra to draw): the fire station with its red doors and parked
// engines, nightclubs glowing with neon at night, restaurants with awnings and tables outside,
// and the easter eggs (a suya spot, a danfo park, a Mama Put stand, a keke, a mural...).

import type { Tile } from "@/lib/city/layout";

/** Draw a shape at (dx, y, dz) from the tile's middle (city units). See city-view's partsFor. */
type BoxFn = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry?: number, mesh?: string, tilt?: number) => void;

const RED = 0xc92a2a;

/** A fire engine parked along x (front at +x), as city shapes. */
function engine(B: BoxFn, x: number, z: number, ry = 0) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (a: number, b: number) => [x + a * c + b * s, z - a * s + b * c] as const;
  const P = (a: number, y: number, b: number, sa: number, sy: number, sb: number, color: number, mesh = "building") => {
    const [px, pz] = at(a, b);
    B(px, y, pz, sa, sy, sb, color, ry, mesh);
  };
  P(0, 0.09, 0, 0.32, 0.1, 0.15, RED);
  P(0.12, 0.19, 0, 0.08, 0.05, 0.14, 0x9fd3ff, "glass");
  P(0, 0.135, 0, 0.322, 0.02, 0.152, 0xf8f9fa);
  P(-0.04, 0.2, 0, 0.22, 0.012, 0.06, 0xdee2e6);
  P(0.12, 0.25, 0, 0.03, 0.02, 0.1, 0xff2d2d, "lamp");
}

export function fireStationParts(t: Tile, B: BoxFn) {
  // The station: a long brick front with three big red doors, a white band, the drill tower.
  B(-0.04, 0.08, -0.12, 0.84, 0.52, 0.56, 0xe9dccb);
  B(-0.04, 0.6, -0.12, 0.86, 0.06, 0.58, RED);
  B(-0.04, 0.48, -0.12, 0.85, 0.05, 0.57, 0xf8f9fa);
  for (const dx of [-0.31, -0.04, 0.23]) {
    B(dx, 0.08, 0.16, 0.22, 0.34, 0.02, 0xf8f9fa);
    B(dx, 0.08, 0.17, 0.18, 0.31, 0.02, RED);
    for (let k = 1; k < 5; k++) B(dx, 0.08 + k * 0.062, 0.181, 0.18, 0.008, 0.004, 0x9c1f1f, 0, "paint");
  }
  B(-0.04, 0.5, 0.17, 0.5, 0.06, 0.02, RED, 0, "paint");
  B(-0.38, 0.08, -0.32, 0.16, 0.95, 0.16, 0xb5523b);
  B(-0.38, 1.03, -0.32, 0.2, 0.05, 0.2, RED);
  B(-0.38, 1.08, -0.32, 0.05, 0.05, 0.05, 0xff2d2d, 0, "lamp");
  for (const y of [0.35, 0.6, 0.85]) B(-0.38, y, -0.239, 0.08, 0.08, 0.01, 0x495057, 0, "glass");
  // Engines out front, ready to go.
  engine(B, -0.12, 0.34);
  engine(B, 0.24, 0.34);
  // A hydrant on the corner.
  B(0.42, 0.08, 0.42, 0.05, 0.08, 0.05, 0xffd43b, 0, "cyl");
  void t;
}

export function clubParts(t: Tile, B: BoxFn) {
  const tall = t.v === 1;
  const h = tall ? 0.78 : 0.55;
  const body = [0x2b2140, 0x1f2a44, 0x301934][Math.floor(t.r[3] * 3) % 3];
  const neon = [0xff4fd8, 0x22d3ee, 0xa3e635, 0xffd43b][Math.floor(t.r[2] * 4) % 4];
  const neon2 = [0x22d3ee, 0xff4fd8, 0xffd43b, 0xff6b6b][Math.floor(t.r[1] * 4) % 4];
  B(0, 0.08, -0.05, 0.78, h, 0.62, body);
  // Neon strips along the edges and round the door: they glow at night.
  for (const z of [-0.36, 0.26]) B(0, 0.08 + h - 0.03, z, 0.78, 0.025, 0.025, neon, 0, "lamp");
  for (const x of [-0.39, 0.39]) B(x, 0.08 + h - 0.03, -0.05, 0.025, 0.025, 0.62, neon, 0, "lamp");
  B(0, 0.3, 0.265, 0.5, 0.02, 0.02, neon2, 0, "lamp");
  B(0, 0.08, 0.27, 0.16, 0.2, 0.02, 0x111111);
  B(0, 0.29, 0.31, 0.3, 0.02, 0.1, 0x111111);
  // A vertical sign, a little queue rope, and spotlights pointing up.
  B(0.28, 0.3, 0.27, 0.06, 0.3, 0.02, 0x111111);
  for (let k = 0; k < 4; k++) B(0.28, 0.33 + k * 0.065, 0.285, 0.045, 0.045, 0.01, k % 2 ? neon : neon2, 0, "lamp");
  for (const x of [-0.12, -0.22, -0.32]) B(x, 0.08, 0.4, 0.015, 0.08, 0.015, 0xd4af37, 0, "trunk");
  B(-0.22, 0.15, 0.4, 0.22, 0.01, 0.01, 0xc92a2a);
  if (tall) for (let w = 0; w < 3; w++) B(-0.24 + w * 0.24, 0.5, 0.265, 0.16, 0.12, 0.012, 0x6741d9, 0, "glass");
  for (const x of [-0.36, 0.36]) B(x, 0.08, 0.42, 0.04, 0.03, 0.04, neon2, 0, "lamp");
}

export function restaurantParts(t: Tile, B: BoxFn) {
  const wall = [0xf3e3c3, 0xe9c9a8, 0xd9e4d0, 0xf1d1c1][Math.floor(t.r[3] * 4) % 4];
  const awn = [0xe03131, 0x2f9e44, 0x1971c2, 0xf08c00][Math.floor(t.r[2] * 4) % 4];
  const roof = t.v === 1;
  B(0, 0.08, -0.08, 0.68, 0.42, 0.52, wall);
  B(0, 0.18, 0.181, 0.6, 0.2, 0.012, 0x5d7fa3, 0, "glass");
  B(0, 0.08, 0.185, 0.14, 0.22, 0.012, 0x6b4f37);
  // A striped awning over the windows.
  for (let k = 0; k < 7; k++) B(-0.3 + k * 0.1, 0.38, 0.24, 0.1, 0.012, 0.13, k % 2 ? 0xffffff : awn, 0, "building", 0);
  B(0, 0.5, -0.08, 0.7, 0.03, 0.54, roof ? 0xc9c4b8 : shadeRoof(awn));
  // Tables with umbrellas out front.
  for (const x of [-0.24, 0.0, 0.24]) {
    B(x, 0.08, 0.36, 0.1, 0.06, 0.1, 0xf8f9fa, 0, "disc");
    B(x, 0.08, 0.36, 0.25, 0.22, 0.25, 0xdee2e6, 0, "trunk");
    B(x, 0.27, 0.36, 0.16, 0.05, 0.16, awn, 0, "cone");
  }
  // A chimney from the kitchen, and on two-storey ones a terrace with umbrellas.
  B(0.24, 0.53, -0.26, 0.06, 0.14, 0.06, 0x8a6a4f);
  if (roof) {
    for (const x of [-0.18, 0.12]) {
      B(x, 0.53, -0.02, 0.2, 0.18, 0.2, 0xdee2e6, 0, "trunk");
      B(x, 0.69, -0.02, 0.18, 0.05, 0.18, awn, 0, "cone");
    }
    for (const z of [-0.33, 0.17]) B(0, 0.53, z, 0.68, 0.05, 0.012, 0xf8f9fa);
  }
}
const shadeRoof = (c: number) => ((((c >> 16) & 255) * 0.6) << 16) | ((((c >> 8) & 255) * 0.6) << 8) | ((c & 255) * 0.6);

/** A little named thing on a lot (see layout's easter eggs), facing the road. */
export function eggParts(t: Tile, B: BoxFn) {
  const e = t.egg;
  if (!e) return;
  const [fx, fz] = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)[e.face] ?? [1, 0];
  const ry = Math.atan2(-fz, fx);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  // a: towards the road, b: along it.
  const P = (a: number, y: number, b: number, sa: number, sy: number, sb: number, color: number, mesh = "building", turn = 0, tilt = 0) =>
    B(0.22 * fx + a * c + b * s, y, 0.22 * fz - a * s + b * c, sa, sy, sb, color, ry + turn, mesh, tilt);
  const col = e.color ?? 0xffc727;
  switch (e.kind) {
    case "grill": {
      // A suya / braai stand: a grill with glowing coals, a table, an umbrella, a bench.
      P(0.04, 0.08, 0, 0.16, 0.08, 0.07, 0x343a40);
      for (let k = 0; k < 4; k++) P(0.0 + k * 0.03, 0.165, 0, 0.022, 0.012, 0.05, 0xff6b1a, "lamp");
      P(0.04, 0.17, 0, 0.16, 0.004, 0.07, 0x868e96, "paint");
      P(-0.08, 0.08, 0.08, 0.1, 0.07, 0.07, 0x8a6a4f);
      P(-0.02, 0.08, -0.06, 0.012, 0.26, 0.012, 0xdee2e6, "trunk");
      P(-0.02, 0.32, -0.06, 0.26, 0.05, 0.26, 0xe03131, "cone");
      P(-0.12, 0.08, -0.12, 0.16, 0.04, 0.04, 0x6b4f37);
      break;
    }
    case "minibus": {
      // A park of minibuses (danfo, trotro, matatu), noses to the road.
      for (let k = -1; k <= 1; k++) {
        P(0, 0.08, k * 0.15, 0.24, 0.1, 0.12, col);
        P(0.02, 0.18, k * 0.15, 0.18, 0.05, 0.11, 0x9fd3ff, "glass");
        P(0, 0.12, k * 0.15, 0.242, 0.015, 0.122, 0x1b1b1b, "paint");
        P(0, 0.23, k * 0.15, 0.16, 0.012, 0.1, 0x495057);
      }
      break;
    }
    case "stall": {
      // Mama Put: a big umbrella, a table of pots, benches.
      P(0, 0.08, 0, 0.18, 0.08, 0.1, 0x8a6a4f);
      for (let k = 0; k < 3; k++) P(-0.05 + k * 0.05, 0.16, 0, 0.04, 0.03, 0.04, [0xadb5bd, 0xe8590c, 0xadb5bd][k], "cyl");
      P(0, 0.08, 0, 0.012, 0.3, 0.012, 0xdee2e6, "trunk");
      P(0, 0.34, 0, 0.34, 0.06, 0.34, col, "cone");
      for (const b of [-0.13, 0.13]) P(-0.02, 0.08, b, 0.16, 0.035, 0.035, 0x6b4f37);
      break;
    }
    case "bigbus": {
      // A molue, a food truck or a red double-decker, parked up.
      const tall = e.name.toLowerCase().includes("double");
      const h = tall ? 0.26 : 0.15;
      P(0, 0.08, 0, 0.52, h, 0.15, col, "building", Math.PI / 2);
      P(0, 0.08 + h * 0.55, 0, 0.53, h * 0.22, 0.152, 0x2b3a4f, "glass", Math.PI / 2);
      if (tall) P(0, 0.08 + h * 0.15, 0, 0.53, h * 0.18, 0.152, 0x2b3a4f, "glass", Math.PI / 2);
      else P(0, 0.12, 0, 0.522, 0.012, 0.152, 0x1b1b1b, "paint", Math.PI / 2);
      break;
    }
    case "tricycle": {
      // A keke / tuk-tuk on its own.
      P(0, 0.09, 0, 0.14, 0.07, 0.09, col);
      P(-0.01, 0.16, 0, 0.13, 0.012, 0.1, 0x1b1b1b);
      P(0.06, 0.16, 0, 0.012, 0.06, 0.08, 0x9fd3ff, "glass");
      P(-0.04, 0.16, 0.04, 0.008, 0.06, 0.008, 0x1b1b1b);
      P(-0.04, 0.16, -0.04, 0.008, 0.06, 0.008, 0x1b1b1b);
      break;
    }
    case "mural": {
      // A painted wall: bold blocks of colour (a face, a sun, stripes).
      P(-0.05, 0.08, 0, 0.04, 0.34, 0.55, 0xf1e3c8);
      const cols = [0xe03131, 0xffd43b, 0x2f9e44, 0x1971c2, 0xf08c00, 0x7048e8, 0x1b1b1b];
      for (let k = 0; k < 9; k++) P(-0.028, 0.11 + (k % 3) * 0.1, -0.2 + Math.floor(k / 3) * 0.2, 0.004, 0.08, 0.16, cols[(k * 3 + Math.floor(t.r[1] * 7)) % cols.length], "paint");
      P(-0.026, 0.2, 0, 0.004, 0.12, 0.12, 0x6b4f37, "paint");
      break;
    }
    case "phonebox": {
      P(0, 0.08, 0, 0.07, 0.22, 0.07, 0xc92a2a);
      P(0, 0.12, 0, 0.072, 0.13, 0.06, 0x9fd3ff, "glass");
      P(0, 0.3, 0, 0.075, 0.015, 0.075, 0xc92a2a);
      break;
    }
    case "cabs": {
      for (let k = -1; k <= 1; k++) {
        P(0, 0.08, k * 0.16, 0.24, 0.08, 0.12, col);
        P(-0.02, 0.16, k * 0.16, 0.13, 0.05, 0.11, 0xe9f2fb);
        P(-0.02, 0.21, k * 0.16, 0.04, 0.02, 0.06, 0xfff3bf, "lamp");
      }
      break;
    }
    case "cart": {
      P(0, 0.1, 0, 0.16, 0.1, 0.1, col);
      P(0, 0.08, 0.05, 0.03, 0.03, 0.03, 0x1b1b1b, "cyl");
      P(0, 0.08, -0.05, 0.03, 0.03, 0.03, 0x1b1b1b, "cyl");
      P(0, 0.2, 0, 0.012, 0.2, 0.012, 0xdee2e6, "trunk");
      P(0, 0.4, 0, 0.24, 0.05, 0.24, 0xf8f9fa, "cone");
      break;
    }
  }
}
