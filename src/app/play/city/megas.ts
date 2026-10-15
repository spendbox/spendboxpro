// The big landmarks that span 3×3 tiles and more (see MEGAS in src/lib/city/layout.ts): the
// football stadium (a proper bowl: tiered stands round the pitch, a wall of glass and white
// panels outside, a ring of roof with an oval opening, floodlights), the domed capitol in its
// gardens with a statue out front, the mega mall under a glass vault, the grand bank, the big
// city park, the gym, the spa, the cathedral, the grand mosque, the international airport and
// the spaceport. Drawn from the shared instanced pieces like everything else, so even a few of
// them cost almost nothing.

import { airportPlan } from "./airport";
import type { Tile } from "@/lib/city/layout";

type BoxFn = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry?: number, mesh?: string, tilt?: number) => void;
type TreeFn = (dx: number, dz: number, size: number, v: number) => void;

const GRASS = 0xa8d79a;
const WHITE = 0xf8f9fa;

/** Club colours for a stadium's seats (home, away), picked per stadium. */
const SEATS: [number, number][] = [
  [0xc92a2a, 0x1864ab],
  [0x2b8a3e, 0xf8f9fa],
  [0x1864ab, 0xf59f00],
  [0x5f3dc4, 0xdee2e6],
  [0xe8590c, 0x343a40],
];

/**
 * A sloping ring of panels between two ellipses (inner radii ai/bi at height hi, outer ao/bo at
 * height ho), centred on (cx, cz): stands, roofs, terraces. N panels round.
 */
function ring(
  B: BoxFn,
  cx: number,
  cz: number,
  ai: number,
  bi: number,
  hi: number,
  ao: number,
  bo: number,
  ho: number,
  thick: number,
  n: number,
  color: (k: number) => number,
  mesh = "building",
) {
  const perimeter = Math.PI * (ai + bi + ao + bo) / 2;
  const wide = (perimeter / n) * 1.12;
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * Math.PI * 2;
    const ix = ai * Math.cos(a);
    const iz = bi * Math.sin(a);
    const ox = ao * Math.cos(a);
    const oz = bo * Math.sin(a);
    const run = Math.hypot(ox - ix, oz - iz);
    const rise = ho - hi;
    const ry = Math.atan2(-(oz - iz), ox - ix);
    const tilt = Math.atan2(rise, run);
    B(cx + (ix + ox) / 2, (hi + ho) / 2 - thick / 2, cz + (iz + oz) / 2, Math.hypot(run, rise) + 0.02, thick, wide, color(k), ry, mesh, tilt);
  }
}

/** Upright panels round an ellipse (a wall), from y0 up by h. */
function wall(B: BoxFn, cx: number, cz: number, a: number, b: number, y0: number, h: number, depth: number, n: number, color: (k: number) => number, mesh = "building") {
  const perimeter = Math.PI * (a + b);
  const wide = (perimeter / n) * 1.08;
  for (let k = 0; k < n; k++) {
    const t = ((k + 0.5) / n) * Math.PI * 2;
    // The wall faces outwards: turned to the ellipse's normal.
    const nx = Math.cos(t) / a;
    const nz = Math.sin(t) / b;
    const ry = Math.atan2(-nz, nx);
    B(cx + a * Math.cos(t), y0, cz + b * Math.sin(t), depth, h, wide, color(k), ry, mesh);
  }
}

/** The football stadium (4×4 or bigger). */
function stadium(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const w = st.w ?? 4;
  const d = st.d ?? 4;
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  const s = Math.min(w, d) / 4;
  const [home, away] = SEATS[Math.floor(t.r[0] * SEATS.length) % SEATS.length];
  // The concourse: paving all round, with trees at the corners and paths to the gates.
  B(cx, 0.02, cz, w - 0.04, 0.07, d - 0.04, 0xd9d4ca, 0, "ground");
  for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    tree(cx + qx * (w / 2 - 0.25), cz + qz * (d / 2 - 0.25), 0.55, t.r[1] + qx);
    tree(cx + qx * (w / 2 - 0.55), cz + qz * (d / 2 - 0.2), 0.45, t.r[2] + qz);
  }
  // The outside: a wall of white panels with a band of dark glass, and gates on four sides.
  const A = 1.78 * s;
  const Bz = 1.5 * s;
  wall(B, cx, cz, A, Bz, 0.09, 0.86, 0.1, 32, (k) => (k % 8 === 0 ? 0xdee2e6 : WHITE));
  wall(B, cx, cz, A + 0.012, Bz + 0.012, 0.36, 0.2, 0.08, 32, () => 0x2b3a4f, "glass");
  for (const [gx, gz, ry] of [[A + 0.06, 0, 0], [-A - 0.06, 0, 0], [0, Bz + 0.06, Math.PI / 2], [0, -Bz - 0.06, Math.PI / 2]]) {
    B(cx + gx, 0.09, cz + gz, 0.08, 0.3, 0.42, 0x343a40, ry);
    B(cx + gx * 1.02, 0.4, cz + gz * 1.02, 0.06, 0.06, 0.46, home, ry);
  }
  // The pitch: a dark green surround, striped grass, white lines, goals.
  const pw = 1.5 * s;
  const pd = 0.98 * s;
  B(cx, 0.09, cz, pw + 0.36, 0.03, pd + 0.32, 0x2f7d3b, 0, "ground");
  B(cx, 0.12, cz, pw, 0.006, pd, 0x3f9a4b, 0, "ground");
  const stripes = 10;
  for (let k = 0; k < stripes; k += 2) B(cx - pw / 2 + (k + 0.5) * (pw / stripes), 0.127, cz, pw / stripes, 0.002, pd, 0x4cad59, 0, "paint");
  const line = 0.012;
  for (const [lx, lz, lw, ld] of [
    [0, -pd / 2, pw, line],
    [0, pd / 2, pw, line],
    [-pw / 2, 0, line, pd],
    [pw / 2, 0, line, pd],
    [0, 0, line, pd],
    [-pw / 2 + 0.12, 0, line, pd * 0.45],
    [pw / 2 - 0.12, 0, line, pd * 0.45],
  ]) {
    B(cx + lx, 0.13, cz + lz, lw, 0.002, ld, 0xffffff, 0, "paint");
  }
  B(cx, 0.129, cz, 0.24 * s, 0.002, 0.24 * s, 0xffffff, 0, "disc");
  B(cx, 0.131, cz, 0.21 * s, 0.002, 0.21 * s, 0x3f9a4b, 0, "disc");
  for (const side of [-1, 1]) {
    B(cx + side * (pw / 2 + 0.02), 0.13, cz, 0.03, 0.06, 0.16, 0xffffff);
  }
  // The stands: two tiers rising from the pitch, in the club's colours (the aisles lighter).
  const N = 30;
  ring(B, cx, cz, 0.98 * s, 0.68 * s, 0.13, 1.36 * s, 1.06 * s, 0.46, 0.05, N, (k) => (k % 5 === 0 ? 0xdee2e6 : home));
  ring(B, cx, cz, 1.4 * s, 1.1 * s, 0.52, 1.7 * s, 1.42 * s, 0.9, 0.05, N, (k) => (k % 5 === 0 ? 0xdee2e6 : away));
  // A band of executive boxes between the tiers.
  wall(B, cx, cz, 1.38 * s, 1.08 * s, 0.44, 0.1, 0.04, N, () => 0x4c6e91, "glass");
  // The roof: a white ring over the stands with an oval opening above the pitch.
  ring(B, cx, cz, 1.2 * s, 0.9 * s, 1.06, A + 0.04, Bz + 0.04, 1.0, 0.035, 36, (k) => (k % 6 === 0 ? 0xe9ecef : WHITE));
  // Floodlights along the roof's inner edge, four sides.
  for (const [lx, lz] of [[1.15, 0], [-1.15, 0], [0, 0.86], [0, -0.86], [0.85, 0.62], [-0.85, 0.62], [0.85, -0.62], [-0.85, -0.62]]) {
    B(cx + lx * s, 1.09, cz + lz * s, 0.06, 0.03, 0.06, 0xfff3bf, 0, "lamp");
  }
}

/** The domed capitol in its gardens, with a reflecting pool and a statue out front. */
function capitol(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const w = st.w ?? 3;
  const d = st.d ?? 3;
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  const stone = 0xf1ece2;
  const pale = 0xf8f4ec;
  B(cx, 0.02, cz, w - 0.04, 0.07, d - 0.04, GRASS, 0, "ground");
  // Paths: a wide walk from the front, and one across.
  B(cx, 0.09, cz + 0.6, 0.42, 0.006, d * 0.55, 0xe9e2d4, 0, "ground");
  B(cx, 0.09, cz - 0.15, w - 0.3, 0.006, 0.18, 0xe9e2d4, 0, "ground");
  // The building: a raised base, the main hall with wings, a portico of columns, the dome.
  const by = cz - 0.45;
  B(cx, 0.09, by, 2.3, 0.1, 1.05, 0xe6dfd2);
  B(cx, 0.19, by, 1.25, 0.6, 0.85, pale);
  for (const side of [-1, 1]) {
    B(cx + side * 0.86, 0.19, by + 0.04, 0.55, 0.46, 0.72, pale);
    B(cx + side * 0.86, 0.65, by + 0.04, 0.6, 0.04, 0.76, stone);
    for (let k = 0; k < 3; k++) B(cx + side * (0.68 + k * 0.17), 0.3, by + 0.41, 0.07, 0.2, 0.02, 0x8a9bb0, 0, "glass");
  }
  B(cx, 0.79, by, 1.3, 0.05, 0.9, stone);
  for (let k = 0; k < 8; k++) B(cx - 0.52 + k * 0.148, 0.19, by + 0.5, 0.06, 0.6, 0.06, 0xffffff, 0, "cyl");
  B(cx, 0.79, by + 0.5, 1.24, 0.06, 0.16, stone);
  add3(B, cx, 0.85, by + 0.5, 1.2, 0.2, 0.14, pale);
  // The drum and the dome, with a lantern and a flag on top.
  B(cx, 0.84, by, 0.82, 0.32, 0.82, pale, 0, "cyl");
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    B(cx + Math.cos(a) * 0.42, 0.86, by + Math.sin(a) * 0.42, 0.04, 0.28, 0.04, 0xffffff, 0, "cyl");
  }
  B(cx, 1.16, by, 0.86, 0.04, 0.86, stone, 0, "cyl");
  B(cx, 1.2, by, 0.8, 1.1, 0.8, 0xdfe4ea, 0, "dome");
  B(cx, 1.72, by, 0.14, 0.18, 0.14, pale, 0, "cyl");
  B(cx, 1.9, by, 0.1, 0.12, 0.1, 0xffd43b, 0, "cone");
  B(cx + 0.02, 2.0, by, 0.012, 0.3, 0.012, 0x868e96);
  B(cx + 0.08, 2.22, by, 0.12, 0.07, 0.005, 0x2b8a3e, 0, "paint");
  // Steps down to a long reflecting pool, and the statue at its far end.
  B(cx, 0.09, by + 0.72, 0.9, 0.06, 0.2, 0xe6dfd2);
  B(cx, 0.09, cz + 0.55, 0.3, 0.02, 0.9, 0x74c0fc, 0, "water");
  statue(B, cx, cz + d / 2 - 0.22, 0.75);
  // Trees in rows along the garden sides.
  for (let k = 0; k < 4; k++) {
    for (const side of [-1, 1]) tree(cx + side * (w / 2 - 0.22), cz + 0.15 + k * 0.32, 0.45, t.r[k % 4] + side);
  }
}

/** A triangular pediment (a box with a little roof) over a portico. */
function add3(B: BoxFn, x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
  B(x, y, z, w / Math.SQRT2, h, d / Math.SQRT2, color, 0, "roof");
}

/** A statue on a plinth, holding a torch up high (green copper, a gold flame). */
export function statue(B: BoxFn, x: number, z: number, size = 1) {
  const k = size;
  B(x, 0.09, z, 0.26 * k, 0.12 * k, 0.26 * k, 0xc9c2b4);
  B(x, 0.21 * k, z, 0.18 * k, 0.22 * k, 0.18 * k, 0xd8d1c3);
  B(x, 0.43 * k, z, 0.11 * k, 0.32 * k, 0.11 * k, 0x63b59a, 0, "cone");
  B(x, 0.62 * k, z, 0.07 * k, 0.12 * k, 0.07 * k, 0x63b59a, 0, "cyl");
  B(x + 0.05 * k, 0.66 * k, z, 0.025 * k, 0.2 * k, 0.025 * k, 0x63b59a);
  B(x + 0.05 * k, 0.86 * k, z, 0.05 * k, 0.07 * k, 0.05 * k, 0xffc53d, 0, "cone");
  B(x, 0.74 * k, z, 0.1 * k, 0.05 * k, 0.1 * k, 0x63b59a, 0, "cone");
}

/** The mega mall: a long glass vault over shops, with a car park and a big sign. */
function megamall(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const w = st.w ?? 3;
  const d = st.d ?? 3;
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  const colours = [0xf3e6d8, 0xe9ecef, 0xe7e1f5, 0xdcefe6];
  const wallC = colours[Math.floor(t.r[1] * colours.length) % colours.length];
  B(cx, 0.02, cz, w - 0.04, 0.07, d - 0.04, 0xcfd3d8, 0, "ground");
  const my = cz - 0.35;
  // Two blocks of shops either side of a glass-roofed street.
  for (const side of [-1, 1]) {
    B(cx, 0.09, my + side * 0.52, w - 0.35, 0.62, 0.62, wallC);
    B(cx, 0.32, my + side * 0.52 + side * 0.312, w - 0.36, 0.12, 0.012, 0x4c6e91, 0, "glass");
    B(cx, 0.71, my + side * 0.52, w - 0.4, 0.03, 0.6, 0xced4da);
  }
  B(cx, 0.09, my, w - 0.35, 0.5, 0.45, 0xf8f9fa);
  B(cx, 0.6, my, w - 0.36, 0.5, 0.5, 0xa5d8ff, 0, "dome");
  for (let k = 0; k < 7; k++) B(cx - (w - 0.5) / 2 + k * ((w - 0.5) / 6), 0.6, my, 0.02, 0.26, 0.5, 0xadb5bd);
  // An atrium dome in the middle, and the sign.
  B(cx, 0.73, my, 0.7, 0.7, 0.7, 0xd0ebff, 0, "dome");
  B(cx, 0.75, my + 0.84, 1.2, 0.18, 0.04, 0xe64980);
  B(cx, 0.79, my + 0.865, 1.0, 0.1, 0.01, 0xffffff, 0, "paint");
  // The car park in front: tarmac, white bays, a few trees.
  const py = cz + d / 2 - 0.42;
  B(cx, 0.09, py, w - 0.3, 0.008, 0.62, 0x5b6470, 0, "ground");
  for (let k = 0; k < 11; k++) B(cx - (w - 0.5) / 2 + k * ((w - 0.5) / 10), 0.1, py, 0.012, 0.003, 0.5, 0xffffff, 0, "paint");
  for (const side of [-1, 1]) tree(cx + side * (w / 2 - 0.12), py, 0.4, t.r[2] + side);
}

/** A pitched roof over a long hall whose ridge runs along z: two sloping panels. */
function gable(B: BoxFn, cx: number, y: number, cz: number, width: number, len: number, rise: number, color: number) {
  const half = width / 2;
  const slope = Math.hypot(half, rise);
  const tilt = Math.atan2(rise, half);
  for (const side of [-1, 1]) {
    B(cx + side * (half / 2), y + rise / 2 - 0.02, cz, slope + 0.04, 0.04, len, color, 0, "building", -side * tilt);
  }
  // Gable ends filled in.
  B(cx, y, cz - len / 2 + 0.01, width * 0.7, rise * 0.65, 0.02, color);
  B(cx, y, cz + len / 2 - 0.01, width * 0.7, rise * 0.65, 0.02, color);
}

/** A lamp post on a plaza (lit at night). */
function lampPost(B: BoxFn, x: number, z: number, h = 0.32) {
  B(x, 0.09, z, 0.018, h, 0.018, 0x343a40, 0, "cyl");
  B(x, 0.09 + h, z, 0.05, 0.05, 0.05, 0xfff3bf, 0, "lamp");
}

/** The grand bank: a stone hall on a stepped base behind ten columns, a pediment with a gold
 * name band, a clock, guards' booth and an armoured van out front. */
function bank(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const w = st.w ?? 3;
  const d = st.d ?? 3;
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  const stone = 0xece4d4;
  const pale = 0xf7f1e6;
  const gold = 0xf2b632;
  // A marble plaza with a darker border.
  B(cx, 0.02, cz, w - 0.04, 0.07, d - 0.04, 0xd9d2c4, 0, "ground");
  B(cx, 0.09, cz + 0.55, w - 0.5, 0.005, 1.2, 0xe9e4da, 0, "ground");
  const by = cz - 0.35;
  // Stepped base (three steps wider than the hall).
  for (let k = 0; k < 3; k++) B(cx, 0.09 + k * 0.04, by + 0.1 - k * 0.04, 2.4 - k * 0.12, 0.04, 1.5 - k * 0.08, k % 2 ? stone : pale);
  // The hall, with a taller block behind (the offices and vault).
  B(cx, 0.21, by - 0.05, 2.0, 0.78, 1.0, pale);
  B(cx, 0.21, by - 0.55, 1.5, 1.2, 0.5, stone);
  for (let f = 0; f < 3; f++) B(cx, 0.45 + f * 0.3, by - 0.81, 1.4, 0.12, 0.02, 0x4c6e91, 0, "glass");
  B(cx, 1.41, by - 0.55, 1.56, 0.05, 0.56, 0xd8cfbd);
  // Ten columns along the front, an architrave, a pediment with a gold band.
  for (let k = 0; k < 10; k++) {
    const px = cx - 0.95 + k * (1.9 / 9);
    B(px, 0.21, by + 0.52, 0.09, 0.08, 0.09, stone);
    B(px, 0.29, by + 0.52, 0.07, 0.62, 0.07, 0xffffff, 0, "cyl");
    B(px, 0.91, by + 0.52, 0.1, 0.05, 0.1, stone);
  }
  B(cx, 0.96, by + 0.25, 2.1, 0.1, 0.62, stone);
  B(cx, 0.99, by + 0.565, 1.6, 0.05, 0.01, gold, 0, "paint");
  add3(B, cx, 1.06, by + 0.42, 2.1, 0.32, 0.3, pale);
  B(cx, 1.13, by + 0.57, 0.18, 0.02, 0.18, 0xfdfaf2, Math.PI / 2, "disc", Math.PI / 2);
  B(cx, 1.13, by + 0.59, 0.1, 0.01, 0.1, 0x343a40, Math.PI / 2, "disc", Math.PI / 2);
  // Big bronze doors and tall windows between the columns.
  B(cx, 0.21, by + 0.455, 0.28, 0.42, 0.02, 0x8c6a3c);
  for (const side of [-1, 1]) for (let k = 1; k <= 3; k++) B(cx + side * (0.12 + k * 0.2), 0.32, by + 0.455, 0.1, 0.36, 0.02, 0x5d7fa3, 0, "glass");
  // Gold dome-topped corners on the back block, and a flag.
  for (const side of [-1, 1]) {
    B(cx + side * 0.72, 1.41, by - 0.55, 0.16, 0.16, 0.16, stone, 0, "cyl");
    B(cx + side * 0.72, 1.57, by - 0.55, 0.18, 0.2, 0.18, gold, 0, "dome");
  }
  B(cx, 1.46, by - 0.55, 0.012, 0.42, 0.012, 0x868e96);
  B(cx + 0.07, 1.78, by - 0.55, 0.13, 0.08, 0.005, 0x2b8a3e, 0, "paint");
  // The name on a gold board by the steps, lamp posts, a guards' booth and an armoured van.
  B(cx - 0.9, 0.09, by + 0.95, 0.5, 0.2, 0.04, 0x343a40);
  B(cx - 0.9, 0.14, by + 0.972, 0.44, 0.1, 0.005, gold, 0, "paint");
  for (const side of [-1, 1]) lampPost(B, cx + side * 0.6, by + 1.0);
  B(cx + 0.95, 0.09, by + 0.95, 0.2, 0.2, 0.2, 0x495057);
  B(cx + 0.95, 0.2, by + 1.05, 0.16, 0.06, 0.01, 0x9ec5fe, 0, "glass");
  B(cx + 0.95, 0.29, by + 0.95, 0.24, 0.03, 0.24, 0x212529);
  const vz = cz + d / 2 - 0.3;
  B(cx + 0.45, 0.09, vz, 0.42, 0.18, 0.2, 0x5c6066);
  B(cx + 0.62, 0.15, vz, 0.1, 0.08, 0.18, 0x9ec5fe, 0, "glass");
  B(cx + 0.45, 0.27, vz, 0.36, 0.02, 0.18, 0xf2b632);
  for (const wx of [-0.12, 0.12]) for (const wz of [-0.11, 0.09]) B(cx + 0.45 + wx, 0.125, vz + wz, 0.07, 0.02, 0.07, 0x212529, Math.PI / 2, "cyl", Math.PI / 2);
  for (const side of [-1, 1]) tree(cx + side * (w / 2 - 0.18), cz + d / 2 - 0.25, 0.4, t.r[1] + side);
}

/** A big city park: lawns, a lake with an island fountain, a bandstand, paths, flower beds,
 * benches, a statue and lots of trees. */
function bigpark(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const w = st.w ?? 5;
  const d = st.d ?? 5;
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  const path = 0xe9dfc8;
  B(cx, 0.02, cz, w - 0.04, 0.07, d - 0.04, 0x9fd38c, 0, "ground");
  // A ring path and two paths across.
  B(cx, 0.09, cz, w - 0.5, 0.004, 0.16, path, 0, "ground");
  B(cx, 0.09, cz, 0.16, 0.004, d - 0.5, path, 0, "ground");
  for (const side of [-1, 1]) {
    B(cx, 0.09, cz + side * (d / 2 - 0.45), w - 0.7, 0.004, 0.14, path, 0, "ground");
    B(cx + side * (w / 2 - 0.45), 0.09, cz, 0.14, 0.004, d - 0.7, path, 0, "ground");
  }
  // The lake (one quarter), with an island and a fountain, and a little bridge.
  const lx = cx - w * 0.22;
  const lz = cz - d * 0.22;
  B(lx, 0.075, lz, 1.7, 0.03, 1.4, 0xc8d8b0, 0, "disc");
  B(lx, 0.1, lz, 1.6, 0.012, 1.3, 0x5fb0e8, 0, "waterDisc");
  B(lx + 0.2, 0.08, lz + 0.1, 0.36, 0.06, 0.36, 0x9fd38c, 0, "disc");
  B(lx + 0.2, 0.13, lz + 0.1, 0.14, 0.03, 0.14, 0xcfd6dd, 0, "disc");
  B(lx + 0.2, 0.16, lz + 0.1, 0.03, 0.22, 0.03, 0xdbe4ea, 0, "cyl");
  B(lx + 0.2, 0.38, lz + 0.1, 0.12, 0.05, 0.12, 0xa5d8ff, 0, "dome");
  B(lx + 0.75, 0.1, lz + 0.05, 0.42, 0.03, 0.12, 0x8c6a4f, 0, "building", 0);
  for (const side of [-1, 1]) B(lx + 0.75, 0.13, lz + 0.05 + side * 0.06, 0.42, 0.05, 0.01, 0x6b5440);
  // Boats on the lake.
  B(lx - 0.3, 0.1, lz - 0.15, 0.12, 0.03, 0.05, 0xf8f9fa);
  B(lx - 0.1, 0.1, lz + 0.35, 0.12, 0.03, 0.05, 0xff8787);
  // A bandstand (other quarter): a round floor, posts, a pointed roof.
  const bx = cx + w * 0.22;
  const bz = cz - d * 0.22;
  B(bx, 0.09, bz, 0.6, 0.06, 0.6, 0xf1ece2, 0, "cyl");
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    B(bx + Math.cos(a) * 0.26, 0.15, bz + Math.sin(a) * 0.26, 0.025, 0.24, 0.025, 0xffffff, 0, "cyl");
  }
  B(bx, 0.39, bz, 0.64, 0.03, 0.64, 0x2b8a3e, 0, "cyl");
  B(bx, 0.42, bz, 0.64, 0.26, 0.64, 0x2b8a3e, 0, "cone");
  B(bx, 0.68, bz, 0.04, 0.06, 0.04, 0xffd43b, 0, "cone");
  // Flower beds round the middle, a statue in the centre.
  const flowers = [0xff6b6b, 0xffd43b, 0xda77f2, 0xff922b, 0xf783ac];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    B(cx + Math.cos(a) * 0.5, 0.085, cz + Math.sin(a) * 0.5, 0.18, 0.03, 0.18, flowers[k % flowers.length], 0, "disc");
  }
  B(cx, 0.085, cz, 0.5, 0.02, 0.5, 0xe9dfc8, 0, "disc");
  statue(B, cx, cz, 0.7);
  // A playground and a café kiosk (the front quarters).
  const px = cx - w * 0.22;
  const pz = cz + d * 0.24;
  B(px, 0.09, pz, 0.9, 0.004, 0.7, 0xf2c48d, 0, "ground");
  B(px - 0.15, 0.09, pz, 0.04, 0.3, 0.04, 0xe03131);
  B(px + 0.15, 0.09, pz, 0.04, 0.3, 0.04, 0xe03131);
  B(px, 0.37, pz, 0.36, 0.03, 0.04, 0xe03131);
  B(px + 0.25, 0.09, pz + 0.2, 0.24, 0.2, 0.08, 0x1c7ed6, 0, "building", 0.5);
  const kx = cx + w * 0.22;
  B(kx, 0.09, pz, 0.36, 0.2, 0.26, 0xfff4e6);
  B(kx, 0.29, pz, 0.44, 0.12, 0.34, 0xe8590c, 0, "roof");
  for (let k = 0; k < 3; k++) {
    B(kx - 0.3 + k * 0.3, 0.09, pz + 0.32, 0.12, 0.08, 0.12, 0xffffff, 0, "cyl");
    B(kx - 0.3 + k * 0.3, 0.17, pz + 0.32, 0.2, 0.012, 0.2, 0xffffff, 0, "disc");
    B(kx - 0.3 + k * 0.3, 0.18, pz + 0.32, 0.012, 0.18, 0.012, 0xadb5bd);
    B(kx - 0.3 + k * 0.3, 0.33, pz + 0.32, 0.22, 0.06, 0.22, flowers[k], 0, "cone");
  }
  // Benches along the paths, lamp posts.
  for (const side of [-1, 1]) {
    for (let k = -1; k <= 1; k++) {
      B(cx + k * 1.1, 0.09, cz + side * 0.14, 0.2, 0.04, 0.05, 0x8c6a4f);
      lampPost(B, cx + k * 1.1 + 0.25, cz + side * 0.13, 0.26);
    }
  }
  // Trees: round the edge, and clumps on the lawns.
  for (let k = 0; k < 12; k++) {
    const u = (k + 0.5) / 12;
    for (const side of [-1, 1]) {
      tree(cx - w / 2 + 0.2 + u * (w - 0.4), cz + side * (d / 2 - 0.18), 0.5 + (k % 3) * 0.08, t.r[k % 4] + k + side);
      tree(cx + side * (w / 2 - 0.18), cz - d / 2 + 0.2 + u * (d - 0.4), 0.5 + ((k + 1) % 3) * 0.08, t.r[(k + 1) % 4] + k - side);
    }
  }
  for (let k = 0; k < 10; k++) {
    const a = t.r[k % 4] * 6 + k * 1.7;
    const r = 0.9 + (k % 3) * 0.25;
    const tx = cx + w * 0.22 + Math.cos(a) * r * 0.6;
    const tz = cz + d * 0.24 + Math.sin(a) * r * 0.4;
    if (Math.abs(tx - cx) > 0.3 && Math.abs(tz - cz) > 0.3) tree(tx, tz, 0.55, k + t.r[2]);
  }
}

/** A modern gym: a glass box with orange stripes, a running track on the roof, an outdoor
 * court, and a giant dumbbell out front. */
function gym(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const w = st.w ?? 3;
  const d = st.d ?? 3;
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  const orange = 0xff6b1a;
  const dark = 0x2b2f36;
  B(cx, 0.02, cz, w - 0.04, 0.07, d - 0.04, 0xc9ced4, 0, "ground");
  const gz = cz - 0.4;
  // The building: dark frame, glass walls, orange stripes.
  B(cx, 0.09, gz, 2.3, 1.0, 1.4, dark);
  B(cx, 0.12, gz + 0.705, 2.2, 0.85, 0.01, 0x7fa6c9, 0, "glass");
  for (const side of [-1, 1]) B(cx + side * 1.155, 0.12, gz, 0.01, 0.85, 1.3, 0x7fa6c9, 0, "glass");
  for (let k = 0; k < 3; k++) B(cx, 0.36 + k * 0.28, gz + 0.712, 2.24, 0.03, 0.01, orange, 0, "paint");
  for (let k = 0; k < 8; k++) B(cx - 1.0 + k * (2 / 7), 0.09, gz + 0.71, 0.04, 1.0, 0.03, dark);
  // People working out inside (dark figures) and machines' screens glowing.
  for (let k = 0; k < 6; k++) B(cx - 0.8 + k * 0.32, 0.12, gz + 0.5, 0.05, 0.16, 0.05, 0x495057, 0, "cyl");
  // The big sign.
  B(cx, 1.09, gz + 0.62, 1.1, 0.24, 0.06, orange);
  B(cx, 1.13, gz + 0.655, 0.9, 0.14, 0.01, 0xffffff, 0, "paint");
  // A running track on the roof: a red ring with a green middle, and a rail round.
  B(cx, 1.09, gz, 2.2, 0.02, 1.3, 0x40c057, 0, "ground");
  B(cx, 1.11, gz, 2.0, 0.006, 1.1, 0xc84b31, 0, "disc");
  B(cx, 1.115, gz, 1.6, 0.006, 0.7, 0x40c057, 0, "disc");
  for (const side of [-1, 1]) B(cx, 1.11, gz + side * 0.66, 2.3, 0.08, 0.01, 0xdee2e6);
  // An outdoor basketball court beside it and the dumbbell sculpture.
  const kz = cz + d / 2 - 0.42;
  B(cx - 0.55, 0.09, kz, 1.2, 0.006, 0.6, 0x2f6fd1, 0, "ground");
  B(cx - 0.55, 0.096, kz, 1.1, 0.004, 0.5, 0x4dabf7, 0, "ground");
  for (const side of [-1, 1]) {
    B(cx - 0.55 + side * 0.56, 0.09, kz, 0.015, 0.3, 0.015, 0xdee2e6);
    B(cx - 0.55 + side * 0.53, 0.33, kz, 0.04, 0.06, 0.08, 0xffffff);
  }
  const dx = cx + 0.7;
  B(dx, 0.09, kz, 0.24, 0.06, 0.24, 0x868e96);
  // (A cylinder tipped on its side runs from where it's placed towards -x.)
  B(dx + 0.27, 0.24, kz, 0.04, 0.54, 0.04, 0x495057, 0, "cyl", Math.PI / 2);
  for (const side of [-1, 1]) B(dx + side * 0.22 + 0.045, 0.24, kz, 0.18, 0.09, 0.18, orange, 0, "cyl", Math.PI / 2);
  for (const side of [-1, 1]) tree(cx + side * (w / 2 - 0.15), gz + 0.9, 0.4, t.r[0] + side);
}

/** A spa: white pavilions with wooden slats, pools in steps, domed bath houses, loungers
 * and palms. */
function spa(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const w = st.w ?? 3;
  const d = st.d ?? 3;
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  const wood = 0xb08458;
  const white = 0xfbf8f2;
  B(cx, 0.02, cz, w - 0.04, 0.07, d - 0.04, 0xeee6d6, 0, "ground");
  // The main pavilion at the back: white, a wide flat roof, slats.
  const pz = cz - 0.75;
  B(cx, 0.09, pz, 2.2, 0.42, 0.75, white);
  B(cx, 0.51, pz, 2.5, 0.05, 1.0, 0xf1ece2);
  for (let k = 0; k < 16; k++) B(cx - 1.05 + k * 0.14, 0.12, pz + 0.38, 0.03, 0.38, 0.03, wood);
  B(cx, 0.56, pz, 1.0, 0.2, 0.5, white);
  B(cx, 0.76, pz, 1.06, 0.03, 0.56, wood);
  // Two domed bath houses.
  for (const side of [-1, 1]) {
    B(cx + side * 1.05, 0.09, cz + 0.05, 0.42, 0.24, 0.42, white, 0, "cyl");
    B(cx + side * 1.05, 0.33, cz + 0.05, 0.44, 0.34, 0.44, 0xf8f4ec, 0, "dome");
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      B(cx + side * 1.05 + Math.cos(a) * 0.19, 0.4, cz + 0.05 + Math.sin(a) * 0.19, 0.03, 0.03, 0.03, 0xfff3bf, 0, "lamp");
    }
  }
  // Pools: a long one and a round hot tub, with stone edges.
  B(cx, 0.08, cz + 0.2, 1.3, 0.03, 0.55, 0xe6dfd2);
  B(cx, 0.1, cz + 0.2, 1.2, 0.014, 0.45, 0x3bc9db, 0, "water");
  B(cx, 0.08, cz + 0.85, 0.5, 0.04, 0.5, 0xe6dfd2, 0, "disc");
  B(cx, 0.11, cz + 0.85, 0.42, 0.014, 0.42, 0x66d9e8, 0, "waterDisc");
  // Loungers with parasols.
  for (let k = 0; k < 4; k++) {
    for (const side of [-1, 1]) {
      const lx = cx + side * (0.85 + (k % 2) * 0.2);
      const lz = cz + 0.55 + Math.floor(k / 2) * 0.3;
      B(lx, 0.09, lz, 0.08, 0.025, 0.18, 0xffffff);
      if (k % 2 === 0) {
        B(lx + side * 0.1, 0.09, lz, 0.008, 0.2, 0.008, 0xadb5bd);
        B(lx + side * 0.1, 0.27, lz, 0.22, 0.05, 0.22, k ? 0xfab005 : 0x12b886, 0, "cone");
      }
    }
  }
  // Palms (trees) all round, and a pebble path.
  for (let k = 0; k < 6; k++) {
    for (const side of [-1, 1]) tree(cx + side * (w / 2 - 0.15), cz - d / 2 + 0.3 + k * ((d - 0.6) / 5), 0.45, t.r[k % 4] + k + side);
  }
  B(cx, 0.09, cz + d / 2 - 0.2, 0.25, 0.004, 0.35, 0xd8d0c0, 0, "ground");
}

/** A cathedral: a long nave with buttresses under a steep roof, twin towers with spires at
 * the front, a rose window, and a spire over the crossing. */
function cathedral(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const w = st.w ?? 4;
  const d = st.d ?? 4;
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  const stone = 0xd8cfc0;
  const light = 0xe9e2d4;
  const roof = 0x5f6b77;
  B(cx, 0.02, cz, w - 0.04, 0.07, d - 0.04, 0xa8d79a, 0, "ground");
  // A stone square in front.
  B(cx, 0.09, cz + d / 2 - 0.5, w - 0.4, 0.005, 0.8, 0xe2dacb, 0, "ground");
  const nz = cz - 0.25;
  const len = 2.4;
  // The nave and the aisles.
  B(cx, 0.09, nz, 0.8, 1.05, len, light);
  for (const side of [-1, 1]) B(cx + side * 0.55, 0.09, nz, 0.32, 0.6, len - 0.1, stone);
  gable(B, cx, 1.14, nz, 0.86, len, 0.45, roof);
  for (const side of [-1, 1]) {
    B(cx + side * 0.55, 0.69, nz, 0.36, 0.04, len - 0.1, roof);
    // Tall pointed windows down the side, and flying buttresses.
    for (let k = 0; k < 7; k++) {
      const z = nz - len / 2 + 0.25 + k * ((len - 0.5) / 6);
      B(cx + side * 0.405, 0.75, z, 0.01, 0.3, 0.09, 0x4c5fa8, 0, "glass");
      B(cx + side * 0.715, 0.09, z, 0.08, 0.66, 0.08, stone);
      B(cx + side * 0.71, 0.75, z, 0.04, 0.1, 0.04, stone, 0, "cone");
      B(cx + side * 0.56, 0.76, z, 0.32, 0.03, 0.04, stone, 0, "building", side * -0.55);
    }
  }
  // The transept crossing, with a slim spire.
  B(cx, 0.09, nz - 0.35, 1.8, 0.9, 0.5, light);
  B(cx, 0.99, nz - 0.35, 1.84, 0.04, 0.54, roof);
  for (const side of [-1, 1]) B(cx + side * 0.9, 0.5, nz - 0.35, 0.01, 0.3, 0.2, 0x4c5fa8, 0, "glass");
  B(cx, 1.5, nz - 0.35, 0.2, 0.3, 0.2, stone);
  B(cx, 1.8, nz - 0.35, 0.18, 1.0, 0.18, roof, 0, "cone");
  B(cx, 2.8, nz - 0.35, 0.03, 0.15, 0.03, 0xffd43b);
  B(cx, 2.88, nz - 0.35, 0.1, 0.025, 0.025, 0xffd43b);
  // The west front: twin towers with spires, a rose window, the great doors.
  const fz = nz + len / 2;
  B(cx, 0.09, fz, 1.0, 1.25, 0.18, stone);
  B(cx, 0.75, fz + 0.09, 0.4, 0.02, 0.4, 0x7b5cc2, Math.PI / 2, "disc", Math.PI / 2);
  B(cx, 0.75, fz + 0.1, 0.3, 0.02, 0.3, 0xe64980, Math.PI / 2, "disc", Math.PI / 2);
  B(cx, 0.75, fz + 0.11, 0.12, 0.02, 0.12, 0xffd43b, Math.PI / 2, "disc", Math.PI / 2);
  B(cx, 0.09, fz + 0.095, 0.26, 0.42, 0.02, 0x6b4f35);
  for (const side of [-1, 1]) {
    B(cx + side * 0.13, 0.09, fz + 0.1, 0.12, 0.3, 0.02, 0x6b4f35);
    const tx = cx + side * 0.6;
    B(tx, 0.09, fz - 0.05, 0.42, 1.8, 0.42, stone);
    for (let k = 0; k < 3; k++) B(tx, 0.6 + k * 0.4, fz + 0.165, 0.1, 0.24, 0.01, 0x3d4a5c, 0, "glass");
    B(tx, 1.89, fz - 0.05, 0.46, 0.06, 0.46, light);
    for (const ox of [-0.19, 0.19]) for (const oz of [-0.19, 0.19]) B(tx + ox, 1.95, fz - 0.05 + oz, 0.05, 0.22, 0.05, stone, 0, "cone");
    B(tx, 1.95, fz - 0.05, 0.36, 1.25, 0.36, roof, 0, "roof");
    B(tx, 3.2, fz - 0.05, 0.03, 0.14, 0.03, 0xffd43b);
    B(tx, 3.28, fz - 0.05, 0.09, 0.02, 0.02, 0xffd43b);
  }
  // Trees round the close, lamps on the square.
  for (let k = 0; k < 5; k++) {
    for (const side of [-1, 1]) tree(cx + side * (w / 2 - 0.2), cz - d / 2 + 0.3 + k * 0.62, 0.5, t.r[k % 4] + k + side);
  }
  for (const side of [-1, 1]) lampPost(B, cx + side * 0.7, cz + d / 2 - 0.35);
}

/** A grand mosque: a prayer hall under a great dome with half domes, a courtyard ringed with
 * arches round a fountain, and four tall minarets. */
function grandmosque(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const w = st.w ?? 4;
  const d = st.d ?? 4;
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  const white = 0xfbfaf6;
  const cream = 0xf1eadb;
  const dome = 0xe9eef2;
  const green = 0x1f8a5b;
  const gold = 0xf2b632;
  B(cx, 0.02, cz, w - 0.04, 0.07, d - 0.04, 0xe8e0cf, 0, "ground");
  // The prayer hall at the back, with the great dome, half domes and little domes.
  const hz = cz - 0.75;
  B(cx, 0.09, hz, 2.0, 0.75, 1.2, white);
  for (let k = 0; k < 9; k++) {
    const x = cx - 0.88 + k * 0.22;
    B(x, 0.3, hz + 0.605, 0.1, 0.3, 0.01, 0x2f5f8a, 0, "glass");
    B(x, 0.6, hz + 0.605, 0.11, 0.06, 0.012, gold, 0, "paint");
  }
  B(cx, 0.84, hz, 0.9, 0.22, 0.9, cream, 0, "cyl");
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    B(cx + Math.cos(a) * 0.455, 0.9, hz + Math.sin(a) * 0.455, 0.05, 0.1, 0.01, 0x2f5f8a, Math.PI / 2 - a, "glass");
  }
  B(cx, 1.06, hz, 1.0, 1.0, 1.0, dome, 0, "dome");
  B(cx, 1.55, hz, 0.06, 0.18, 0.06, gold, 0, "cyl");
  B(cx, 1.73, hz, 0.1, 0.1, 0.1, gold, 0, "lamp");
  B(cx + 0.06, 1.8, hz, 0.02, 0.1, 0.02, gold, 0, "building", 0.4);
  for (const side of [-1, 1]) {
    B(cx + side * 0.62, 0.84, hz, 0.5, 0.5, 0.5, dome, 0, "dome");
    B(cx, 0.84, hz + side * 0.42, 0.5, 0.4, 0.5, dome, 0, "dome");
    for (const oz of [-0.4, 0.4]) {
      B(cx + side * 0.82, 0.84, hz + oz, 0.26, 0.26, 0.26, dome, 0, "dome");
      B(cx + side * 0.82, 0.97, hz + oz, 0.03, 0.06, 0.03, gold, 0, "cone");
    }
  }
  // The courtyard: arcades on three sides round a fountain.
  const yz = cz + 0.55;
  B(cx, 0.09, yz, 1.8, 0.004, 1.3, 0xf3efe6, 0, "ground");
  B(cx, 0.09, yz, 0.36, 0.08, 0.36, cream, 0, "cyl");
  B(cx, 0.17, yz, 0.3, 0.012, 0.3, 0x66d9e8, 0, "waterDisc");
  B(cx, 0.17, yz, 0.16, 0.16, 0.16, green, 0, "dome");
  for (const side of [-1, 1]) {
    B(cx + side * 0.95, 0.09, yz, 0.2, 0.32, 1.35, white);
    B(cx + side * 0.95, 0.41, yz, 0.24, 0.04, 1.39, green);
    for (let k = 0; k < 6; k++) B(cx + side * 0.845, 0.09, yz - 0.56 + k * 0.224, 0.01, 0.22, 0.13, 0x8a7a63, 0, "glass");
  }
  B(cx, 0.09, yz + 0.68, 1.7, 0.32, 0.18, white);
  B(cx, 0.41, yz + 0.68, 1.74, 0.04, 0.22, green);
  B(cx, 0.09, yz + 0.775, 0.32, 0.44, 0.03, white);
  B(cx, 0.09, yz + 0.79, 0.22, 0.34, 0.01, 0x6b4f35);
  add3(B, cx, 0.53, yz + 0.775, 0.36, 0.14, 0.04, green);
  // Four minarets: tall white shafts, two balconies each, a green cone and a gold crescent.
  for (const ox of [-1, 1]) {
    for (const oz of [-1, 1]) {
      const mx = cx + ox * (w / 2 - 0.3);
      const mz = (oz < 0 ? hz - 0.35 : yz + 0.6);
      B(mx, 0.09, mz, 0.16, 0.2, 0.16, cream);
      B(mx, 0.29, mz, 0.11, 2.3, 0.11, white, 0, "cyl");
      for (const by of [1.4, 2.2]) {
        B(mx, 0.09 + by, mz, 0.2, 0.05, 0.2, cream, 0, "cyl");
        B(mx, 0.14 + by, mz, 0.21, 0.05, 0.21, green, 0, "cyl");
      }
      B(mx, 2.59, mz, 0.13, 0.42, 0.13, green, 0, "cone");
      B(mx, 3.01, mz, 0.025, 0.12, 0.025, gold);
      B(mx, 3.15, mz, 0.06, 0.06, 0.06, gold, 0, "lamp");
    }
  }
  // Palms round the edge.
  for (let k = 0; k < 4; k++) for (const side of [-1, 1]) tree(cx + side * (w / 2 - 0.15), cz - 0.3 + k * 0.5, 0.42, t.r[k % 4] + k + side);
}

/** A parked jet with its nose towards +z (dx, dz: where its middle is), in an airline's colours. */
function jet(B: BoxFn, x: number, z: number, livery: number, size = 1) {
  const k = size;
  const L = 0.9 * k;
  const y = 0.16 * k;
  // (A cylinder turned and tipped runs from where it's placed towards +z.)
  B(x, y, z - L / 2, 0.13 * k, L * 0.82, 0.13 * k, 0xf8f9fa, Math.PI / 2, "cyl", Math.PI / 2);
  B(x, y, z - L / 2 + L * 0.82, 0.13 * k, L * 0.18, 0.13 * k, 0xf8f9fa, Math.PI / 2, "cone", Math.PI / 2);
  B(x, y + 0.035 * k, z - L / 2 + 0.05 * k, 0.135 * k, L * 0.8, 0.02 * k, livery, Math.PI / 2, "cyl", Math.PI / 2);
  // Wings, engines, the tail fin and tailplane.
  B(x, y - 0.01 * k, z - 0.02 * k, 0.95 * k, 0.018 * k, 0.16 * k, 0xdee2e6);
  for (const side of [-1, 1]) B(x + side * 0.22 * k, y - 0.06 * k, z + 0.06 * k - 0.07 * k, 0.06 * k, 0.14 * k, 0.06 * k, 0xadb5bd, Math.PI / 2, "cyl", Math.PI / 2);
  B(x, y + 0.06 * k, z - L / 2 + 0.06 * k, 0.015 * k, 0.17 * k, 0.12 * k, livery);
  B(x, y + 0.02 * k, z - L / 2 + 0.05 * k, 0.32 * k, 0.012 * k, 0.08 * k, 0xdee2e6);
  for (const side of [-1, 1]) for (const wz of [-0.05, 0.25]) B(x + side * 0.04 * k, 0.09, z + wz * k, 0.02 * k, 0.07 * k, 0.02 * k, 0x343a40);
}

/** An international airport (its size from the map: Lagos's is about 2.4 × 1.4 km): long runways
 * with lights (two on a big one), a taxiway, an apron with jets parked at a long glass terminal's
 * jet bridges, a tall control tower, hangars, helipads and a car park. Where each part goes is in
 * airport.ts (the jets and helicopters that move there use the same plan). */
function intlairport(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const w = st.w ?? 7;
  const d = st.d ?? 5;
  const a = airportPlan(w, d);
  const { cx, cz } = a;
  B(cx, 0.02, cz, w - 0.04, 0.07, d - 0.04, 0xb7c4a5, 0, "ground");
  // The runways: tarmac, centre dashes, white bars at each end, lights down both sides.
  for (const r of a.runways) {
    B(cx, 0.09, r.z, r.len, 0.008, r.w, 0x495057, 0, "ground");
    const dashes = Math.max(18, Math.round(r.len * 2.4));
    for (let k = 0; k < dashes; k++) B(cx - (r.len - 1.1) / 2 + k * ((r.len - 1.1) / (dashes - 1)), 0.1, r.z, 0.16, 0.003, 0.025, 0xffffff, 0, "paint");
    const lights = Math.max(14, Math.round(r.len * 2));
    for (const side of [-1, 1]) {
      for (let k = 0; k < 6; k++) B(cx + side * (r.len / 2 - 0.08), 0.1, r.z - r.w * 0.35 + k * ((r.w * 0.7) / 5), 0.22, 0.003, 0.04, 0xffffff, 0, "paint");
      B(cx + side * (r.len / 2 - 0.45), 0.1, r.z, 0.1, 0.003, r.w * 0.3, 0xffffff, 0, "paint");
      for (let k = 0; k < lights; k++) B(cx - (r.len - 0.2) / 2 + k * ((r.len - 0.2) / (lights - 1)), 0.1, r.z + side * (r.w / 2 + 0.03), 0.025, 0.02, 0.025, 0xfff3bf, 0, "lamp");
    }
  }
  // The taxiway with a yellow line, and links to each runway.
  const tLen = Math.max(w - 0.9, 3);
  B(cx, 0.09, a.taxiway, tLen, 0.007, 0.24, 0x5b6470, 0, "ground");
  B(cx, 0.1, a.taxiway, tLen, 0.003, 0.015, 0xffd43b, 0, "paint");
  const links = Math.max(3, Math.round(w / 3.5));
  const top = a.runways[0].z;
  for (let k = 0; k < links; k++) {
    const lx = cx - (tLen - 1) / 2 + k * ((tLen - 1) / (links - 1));
    B(lx, 0.09, (top + a.taxiway) / 2, 0.22, 0.007, a.taxiway - top, 0x5b6470, 0, "ground");
  }
  // The apron (concrete) with a jet parked nose-in at each gate.
  B(cx, 0.09, a.apron, Math.max(a.terminal.len + 1.2, w - 1.4), 0.006, Math.max(0.7, a.terminal.z - a.apron + 0.2), 0xced4da, 0, "ground");
  const liveries = [0x1c7ed6, 0xe03131, 0x2f9e44, 0xf08c00, 0x7048e8, 0x0b7a3e];
  a.gates.forEach((gx, k) => jet(B, gx, a.apron, liveries[(k + Math.floor(t.r[0] * 6)) % liveries.length], 0.85));
  // The terminal: a long glass hall under a floating roof with skylights, and jet bridges.
  const gz = a.terminal.z;
  const L = a.terminal.len;
  B(cx, 0.09, gz, L, 0.42, 0.62, 0xe9ecef);
  B(cx, 0.12, gz - 0.315, L - 0.05, 0.34, 0.01, 0x6f9fc8, 0, "glass");
  B(cx, 0.12, gz + 0.315, L - 0.05, 0.34, 0.01, 0x6f9fc8, 0, "glass");
  B(cx, 0.51, gz, L + 0.2, 0.045, 0.86, 0xf8f9fa);
  B(cx, 0.555, gz, L, 0.06, 0.5, 0xe9ecef);
  const sky = Math.max(8, Math.round(L * 2));
  for (let k = 0; k < sky; k++) B(cx - (L - 0.4) / 2 + k * ((L - 0.4) / (sky - 1)), 0.615, gz, 0.3, 0.02, 0.3, 0x9ec5fe, 0, "glass");
  const posts = Math.max(9, Math.round(L * 2.3));
  for (let k = 0; k < posts; k++) for (const side of [-1, 1]) B(cx - (L - 0.1) / 2 + k * ((L - 0.1) / (posts - 1)), 0.09, gz + side * 0.42, 0.025, 0.42, 0.025, 0xdee2e6, 0, "cyl");
  for (const jx of a.gates) {
    B(jx, 0.24, gz - 0.42, 0.08, 0.08, 0.26, 0xdee2e6);
    B(jx, 0.09, gz - 0.5, 0.03, 0.15, 0.03, 0x868e96);
  }
  // The control tower, with a glass cab and a beacon.
  const { x: tx, z: tw, h: th } = a.tower;
  B(tx, 0.09, tw, 0.2, th, 0.2, 0xdee2e6, 0, "cyl");
  B(tx, th + 0.05, tw, 0.4, 0.05, 0.4, 0xadb5bd, 0, "cyl");
  B(tx, th + 0.1, tw, 0.36, 0.19, 0.36, 0x5d8fb8, 0, "cyl");
  B(tx, th + 0.29, tw, 0.42, 0.05, 0.42, 0x495057, 0, "cyl");
  B(tx, th + 0.34, tw, 0.02, 0.32, 0.02, 0x868e96);
  B(tx, th + 0.64, tw, 0.04, 0.04, 0.04, 0xff3b3b, 0, "lamp");
  // Hangars with arched roofs.
  for (const h of a.hangars) {
    B(h.x, 0.09, h.z, 0.9, 0.18, 0.52, 0xc9ced4);
    B(h.x, 0.27, h.z, 0.92, 0.3, 0.54, 0xadb5bd, Math.PI / 2, "dome");
    B(h.x + 0.455, 0.09, h.z, 0.01, 0.26, 0.4, 0x495057);
  }
  // The helipads.
  for (const { x: px, z: pz } of a.helipads) {
    B(px, 0.09, pz, 0.5, 0.03, 0.5, 0x6c757d, 0, "disc");
    B(px, 0.12, pz, 0.44, 0.004, 0.44, 0xffd43b, 0, "disc");
    B(px, 0.124, pz, 0.38, 0.004, 0.38, 0x6c757d, 0, "disc");
    for (const ox of [-0.07, 0.07]) B(px + ox, 0.128, pz, 0.03, 0.003, 0.2, 0xffffff, 0, "paint");
    B(px, 0.128, pz, 0.14, 0.003, 0.03, 0xffffff, 0, "paint");
  }
  // The car park and the road in front, with trees along it.
  const cp = a.carPark;
  B(cx + 0.3, 0.09, cp.z, cp.len, 0.007, 0.55, 0x5b6470, 0, "ground");
  const bays = Math.max(15, Math.round(cp.len * 4));
  for (let k = 0; k < bays; k++) B(cx + 0.3 - (cp.len - 0.2) / 2 + k * ((cp.len - 0.2) / (bays - 1)), 0.1, cp.z, 0.012, 0.003, 0.42, 0xffffff, 0, "paint");
  const trees = Math.max(6, Math.round(cp.len / 0.7));
  for (let k = 0; k < trees; k++) tree(cx + 0.3 - (cp.len - 0.4) / 2 + k * ((cp.len - 0.4) / Math.max(1, trees - 1)), Math.min(d - 0.6, cp.z + 0.35), 0.35, t.r[k % 4] + k);
}

/** A sphere tank on legs (two domes, one turned upside down). */
function tank(B: BoxFn, x: number, z: number, r: number, y: number, color: number) {
  for (const ox of [-0.6, 0.6]) for (const oz of [-0.6, 0.6]) B(x + ox * r, 0.09, z + oz * r, 0.03, y, 0.03, 0x868e96);
  B(x, y, z, r * 2, r, r * 2, color, 0, "dome");
  B(x, y, z, r * 2, r, r * 2, color, 0, "dome", Math.PI);
}

/** A spaceport: the launch pad with its flame trench and a lattice gantry (the rocket itself is
 * drawn moving, see aircraft.ts), the tall assembly building, fuel tanks, mission control with a
 * dish, a landing pad and a viewing stand. */
function spaceport(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const w = st.w ?? 5;
  const d = st.d ?? 5;
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  B(cx, 0.02, cz, w - 0.04, 0.07, d - 0.04, 0xd8d2c4, 0, "ground");
  // The launch pad, raised, with a dark flame trench through it.
  const lx = cx - 0.6;
  const lz = cz - 0.6;
  B(lx, 0.09, lz, 1.5, 0.08, 1.5, 0xbfc4ca);
  B(lx, 0.17, lz, 0.9, 0.004, 0.9, 0xadb5bd, 0, "paint");
  B(lx, 0.12, lz + 0.55, 0.3, 0.06, 0.6, 0x343a40);
  for (const ox of [-0.25, 0.25]) for (const oz of [-0.25, 0.25]) B(lx + ox, 0.17, lz + oz, 0.06, 0.12, 0.06, 0x868e96);
  // The gantry: four red-and-white columns, braces, two arms out to the rocket, a lightning mast.
  const gx = lx + 0.42;
  for (const ox of [-0.09, 0.09]) for (const oz of [-0.09, 0.09]) B(gx + ox, 0.17, lz + oz, 0.03, 2.9, 0.03, 0xc92a2a);
  for (let k = 0; k < 10; k++) {
    const y = 0.35 + k * 0.28;
    for (const oz of [-0.09, 0.09]) B(gx, y, lz + oz, 0.2, 0.015, 0.015, 0xf8f9fa);
    for (const ox of [-0.09, 0.09]) B(gx + ox, y, lz, 0.015, 0.015, 0.2, 0xf8f9fa);
    B(gx, y, lz + 0.09, 0.26, 0.015, 0.015, 0xc92a2a, 0, "building", k % 2 ? 0.9 : -0.9);
  }
  for (const y of [1.55, 2.45]) B(gx - 0.2, y, lz, 0.24, 0.05, 0.08, 0x495057);
  B(gx, 3.07, lz, 0.02, 0.45, 0.02, 0xadb5bd);
  B(gx, 3.5, lz, 0.04, 0.04, 0.04, 0xff3b3b, 0, "lamp");
  // The vehicle assembly building: tall and white, with a huge door and a flag stripe.
  const vx = cx + 1.25;
  const vz = cz - 0.3;
  B(vx, 0.09, vz, 1.0, 1.6, 1.2, 0xf1f3f5);
  B(vx - 0.505, 0.09, vz, 0.01, 1.4, 0.46, 0x6c757d);
  for (let k = 0; k < 4; k++) B(vx - 0.506, 0.25 + k * 0.32, vz, 0.012, 0.02, 0.48, 0x495057);
  B(vx - 0.506, 1.25, vz - 0.44, 0.012, 0.3, 0.2, 0x1c7ed6);
  B(vx, 1.69, vz, 1.04, 0.05, 1.24, 0xced4da);
  // A crawler road from the building to the pad.
  B((vx + lx) / 2, 0.09, lz + 0.25, vx - lx - 0.6, 0.005, 0.32, 0xc9b99a, 0, "ground");
  // Fuel tanks.
  tank(B, cx + 1.45, cz - 1.75, 0.2, 0.38, 0xf8f9fa);
  tank(B, cx + 0.85, cz - 1.75, 0.2, 0.38, 0xdee2e6);
  // Mission control with a big dish.
  const mx = cx + 1.3;
  const mz = cz + 1.35;
  B(mx, 0.09, mz, 1.3, 0.36, 0.62, 0xe9ecef);
  B(mx, 0.2, mz - 0.315, 1.25, 0.12, 0.01, 0x4c6e91, 0, "glass");
  B(mx, 0.45, mz, 1.34, 0.04, 0.66, 0x868e96);
  B(mx + 0.4, 0.49, mz, 0.04, 0.26, 0.04, 0x868e96);
  B(mx + 0.4, 0.7, mz, 0.5, 0.14, 0.5, 0xf8f9fa, 0, "dome", Math.PI * 0.8);
  // The landing pad, and a viewing stand for watching launches.
  const px = cx - 1.5;
  const pz = cz + 0.8;
  B(px, 0.09, pz, 0.8, 0.03, 0.8, 0x6c757d, 0, "disc");
  B(px, 0.12, pz, 0.7, 0.004, 0.7, 0xffffff, 0, "disc");
  B(px, 0.124, pz, 0.62, 0.004, 0.62, 0x6c757d, 0, "disc");
  for (const r of [0.78, -0.78]) B(px, 0.128, pz, 0.5, 0.003, 0.05, 0xffd43b, r, "paint");
  const sx = cx - 1.4;
  const sz = cz + 1.55;
  B(sx, 0.09, sz, 0.9, 0.46, 0.5, 0xe9ecef);
  for (let k = 0; k < 4; k++) B(sx, 0.55 - k * 0.0, sz - 0.18 + k * 0.12, 0.84, 0.02, 0.05, 0x1c7ed6);
  for (const ox of [-0.42, 0.42]) B(sx + ox, 0.55, sz, 0.02, 0.1, 0.5, 0xdee2e6);
  for (let k = 0; k < 4; k++) tree(cx - w / 2 + 0.2, cz - 1.5 + k * 0.6, 0.35, t.r[k % 4] + k);
}

/** Draws a big landmark from its corner (anchor) tile. False if it isn't one of these. */
/**
 * A real university campus at its true size (Unilag at Akoka is 11 × 9 tiles): a gate and a
 * boulevard in from the street side, the Senate tower and the Main Library in the middle, rows
 * of faculty blocks, hostels along the back, a sports centre with a running track, and a
 * promenade of trees and benches along the far side (the lagoon front). Laid out from the
 * campus's own size, so any big campus works.
 */
/**
 * Drawing a big landmark the way round its entrance faces: the drawing is laid out with its
 * gate on the west (local x small, the boulevard along x), and this turns (or mirrors) it so the
 * gate is on the side the map gave its main entrance (compile.ts), right behind the name sign.
 * Returns the drawing functions and the local size (w along the boulevard, d across it).
 */
function facingEntrance(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const W = st.w ?? 4;
  const D = st.d ?? 4;
  const e = st.entrance ?? { dx: -1, dz: 0 };
  const across = e.dz !== 0;
  const w = across ? D : W;
  const d = across ? W : D;
  const Cx = (W - 1) / 2;
  const Cz = (D - 1) / 2;
  const lcx = (w - 1) / 2;
  const lcz = (d - 1) / 2;
  const at = (lx: number, lz: number): [number, number] => {
    const u = lx - lcx;
    const v = lz - lcz;
    if (e.dx < 0) return [Cx + u, Cz + v];
    if (e.dx > 0) return [Cx - u, Cz + v];
    if (e.dz < 0) return [Cx + v, Cz + u];
    return [Cx + v, Cz - u];
  };
  const B2: BoxFn = (x, y, z, sx, sy, sz, color, ry = 0, mesh, tilt) => {
    const [wx, wz] = at(x, z);
    B(wx, y, wz, across ? sz : sx, sy, across ? sx : sz, color, ry, mesh, tilt);
  };
  const tree2: TreeFn = (x, z, size, v) => {
    const [wx, wz] = at(x, z);
    tree(wx, wz, size, v);
  };
  return { B: B2, tree: tree2, w, d };
}

function campus(t: Tile, B0: BoxFn, tree0: TreeFn, hospital = false) {
  // Laid out with the gate on the (local) west; turned to face the real entrance.
  const { B, tree, w, d } = facingEntrance(t, B0, tree0);
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  const x0 = -0.5;
  const z0 = -0.5;
  const ROAD = 0x5c636b;
  const PATH = 0xe9dfc8;
  // A teaching hospital: white and pale blue blocks (red crosses on the roofs) instead of brick.
  const BRICK = hospital ? 0xdbe4ee : 0xb5523b;
  const CREAM = hospital ? 0xf8f9fa : 0xefe3c8;
  const RED = 0xe03131;
  const r = (k: number) => {
    const v = Math.sin((t.x * 12.9898 + t.z * 78.233 + k * 37.719) * 0.5) * 43758.5453;
    return v - Math.floor(v);
  };
  B(cx, 0.02, cz, w - 0.04, 0.07, d - 0.04, GRASS, 0, "ground");
  // A ring road just inside the fence, and a boulevard in from the gate on the west side.
  B(cx, 0.095, z0 + 0.35, w - 0.7, 0.006, 0.22, ROAD, 0, "ground");
  B(cx, 0.095, z0 + d - 0.35, w - 0.7, 0.006, 0.22, ROAD, 0, "ground");
  B(x0 + 0.35, 0.095, cz, 0.22, 0.006, d - 0.7, ROAD, 0, "ground");
  B(x0 + w - 0.35, 0.095, cz, 0.22, 0.006, d - 0.7, ROAD, 0, "ground");
  B(x0 + w * 0.3, 0.096, cz, w * 0.6, 0.006, 0.26, ROAD, 0, "ground");
  for (let k = 0; k < 8; k++) B(x0 + 0.5 + (k * w * 0.55) / 8, 0.1, cz, 0.12, 0.004, 0.02, 0xffffff, 0, "paint");
  // A low fence all round.
  for (const side of [-1, 1]) {
    B(cx, 0.09, cz + side * (d / 2 - 0.04), w - 0.06, 0.08, 0.02, 0xdee2e6);
    B(cx + side * (w / 2 - 0.04), 0.09, cz, 0.02, 0.08, d - 0.06, 0xdee2e6);
  }
  // The main gate itself (and its name sign) stand just outside, on the street: see the city
  // view's entrance signs. Here, only the opening in the fence for the boulevard.
  // Trees along the boulevard.
  for (let k = 1; k < 7; k++) for (const side of [-1, 1]) tree(x0 + 0.4 + (k * w * 0.5) / 7, cz + side * 0.32, 0.4, r(k + side));

  // The middle: the Senate tower (tall, cream bands of windows) and the Main Library beside it,
  // round a square with a fountain.
  const sx = x0 + w * 0.6;
  B(sx, 0.09, cz, 1.4, 0.01, 1.4, PATH, 0, "ground");
  B(sx, 0.1, cz, 0.36, 0.06, 0.36, 0xcfd6dd, 0, "disc");
  B(sx, 0.13, cz, 0.3, 0.02, 0.3, 0x5fb0e8, 0, "waterDisc");
  const tx = sx + 0.15;
  const tz = cz - 1.05;
  B(tx, 0.09, tz, 0.9, 0.3, 0.55, CREAM);
  B(tx, 0.39, tz, 0.55, 2.7, 0.4, 0xd8cbb0);
  for (let y = 0.55; y < 3; y += 0.22) B(tx, y, tz, 0.562, 0.07, 0.412, 0x3b5068, 0, "glass");
  B(tx, 3.09, tz, 0.4, 0.12, 0.3, hospital ? 0xf8f9fa : 0x8a6a4a);
  if (hospital) {
    // The main block's red cross on the roof, and its emergency entrance with ambulances.
    B(tx, 3.22, tz, 0.26, 0.02, 0.07, RED, 0, "paint");
    B(tx, 3.22, tz, 0.07, 0.02, 0.26, RED, 0, "paint");
    B(tx - 0.62, 0.09, tz, 0.36, 0.02, 0.5, 0xadb5bd, 0, "ground");
    for (const k of [-1, 1]) {
      B(tx - 0.62, 0.11, tz + k * 0.12, 0.2, 0.09, 0.09, 0xffffff);
      B(tx - 0.62, 0.205, tz + k * 0.12, 0.2, 0.012, 0.03, RED, 0, "paint");
    }
  }
  const lx = sx + 0.1;
  const lz = cz + 1.0;
  B(lx, 0.09, lz, 1.2, 0.62, 0.6, CREAM);
  B(lx, 0.25, lz - 0.305, 1.21, 0.3, 0.01, 0x4c6e91, 0, "glass");
  for (let k = -3; k <= 3; k++) B(lx + k * 0.16, 0.09, lz - 0.34, 0.04, 0.55, 0.04, 0xffffff, 0, "cyl");
  B(lx, 0.71, lz, 1.26, 0.06, 0.66, 0x8a6a4a);

  // Faculty blocks in rows: brick and cream, two or three storeys, between the paths. Not on
  // the boulevard, the middle square, or the sports centre and hostels at the ends.
  const busy = (x: number, z: number) =>
    Math.abs(z - cz) < 0.7 ||
    (Math.abs(x - sx) < 1.0 && Math.abs(z - cz) < 1.6) ||
    x < x0 + 0.9 ||
    x > x0 + w - 0.9 ||
    z < z0 + 0.9 ||
    z > z0 + d - 0.9 ||
    (x > x0 + w * 0.72 && z < z0 + d * 0.42) ||
    (x < x0 + w * 0.3 && z > z0 + d * 0.62);
  let n = 0;
  for (let fx = x0 + 1.2; fx < x0 + w - 0.8; fx += 1.05) {
    for (let fz = z0 + 1.15; fz < z0 + d - 0.8; fz += 0.95) {
      if (busy(fx, fz)) continue;
      n++;
      const h = 0.35 + r(n) * 0.35;
      const color = r(n + 50) < 0.5 ? BRICK : CREAM;
      const long = r(n + 90) < 0.5;
      B(fx, 0.09, fz, long ? 0.75 : 0.45, h, long ? 0.4 : 0.6, color);
      B(fx, 0.09 + h * 0.55, fz, (long ? 0.75 : 0.45) + 0.01, 0.06, (long ? 0.4 : 0.6) + 0.01, 0x4c6e91, 0, "glass");
      B(fx, 0.09 + h, fz, (long ? 0.75 : 0.45) + 0.04, 0.04, (long ? 0.4 : 0.6) + 0.04, hospital ? 0xced4da : 0x6b5440);
      if (hospital && n % 2 === 0) {
        B(fx, 0.14 + h, fz, 0.16, 0.012, 0.045, RED, 0, "paint");
        B(fx, 0.14 + h, fz, 0.045, 0.012, 0.16, RED, 0, "paint");
      }
      B(fx, 0.092, fz + 0.42, 0.08, 0.004, 0.3, PATH, 0, "ground");
      tree(fx + 0.38, fz + 0.3, 0.35, r(n + 7));
    }
  }

  // Hostels along the back (tall blocks of rooms with balconies).
  for (let k = 0; k < Math.max(2, Math.floor(w * 0.3 / 0.75)); k++) {
    const hx = x0 + 0.95 + k * 0.75;
    const hz = z0 + d - 1.15;
    B(hx, 0.09, hz, 0.55, 0.95, 0.4, k % 2 ? 0xf1e3c8 : 0xe3c9a0);
    for (let y = 0.25; y < 1; y += 0.18) B(hx, 0.09 + y, hz - 0.205, 0.5, 0.03, 0.03, 0x495057);
  }

  const px = x0 + w * 0.86;
  const pz = z0 + d * 0.22;
  if (hospital) {
    // A helipad and a car park where a university has its sports centre.
    B(px, 0.09, pz, 0.9, 0.02, 0.9, 0x868e96, 0, "disc");
    B(px, 0.11, pz, 0.7, 0.004, 0.7, 0xf8f9fa, 0, "disc");
    B(px, 0.115, pz, 0.62, 0.004, 0.62, 0x868e96, 0, "disc");
    B(px - 0.12, 0.12, pz, 0.05, 0.004, 0.36, 0xffffff, 0, "paint");
    B(px + 0.12, 0.12, pz, 0.05, 0.004, 0.36, 0xffffff, 0, "paint");
    B(px, 0.12, pz, 0.2, 0.004, 0.05, 0xffffff, 0, "paint");
    B(px, 0.09, pz + 1.05, 1.6, 0.008, 0.7, 0x5b6470, 0, "ground");
    for (let k = 0; k < 9; k++) B(px - 0.75 + k * 0.19, 0.1, pz + 1.05, 0.012, 0.003, 0.5, 0xffffff, 0, "paint");
  } else {
  // The sports centre: a running track round a football pitch, a small stand.
  const ta = Math.min(1.2, w * 0.12);
  const tb = Math.min(0.8, d * 0.14);
  B(px, 0.09, pz, ta * 2, 0.012, tb * 2, 0xc0573e, 0, "disc");
  B(px, 0.1, pz, ta * 1.6, 0.012, tb * 1.45, 0x3f9a4b, 0, "disc");
  B(px, 0.111, pz, ta * 1.1, 0.003, tb * 0.9, 0x4cad59, 0, "paint");
  B(px, 0.115, pz, 0.01, 0.002, tb * 0.9, 0xffffff, 0, "paint");
  B(px, 0.09, pz + tb + 0.2, ta * 1.2, 0.18, 0.2, 0xdee2e6);
  B(px, 0.27, pz + tb + 0.26, ta * 1.2, 0.02, 0.32, 0x1c3f94);
  }

  // The lagoon front (the far east side): a promenade under palms, benches looking out.
  B(x0 + w - 0.62, 0.093, cz, 0.16, 0.004, d - 1.4, PATH, 0, "ground");
  for (let z = z0 + 0.9; z < z0 + d - 0.8; z += 0.55) {
    tree(x0 + w - 0.48, z, 0.42, r(z * 10));
    B(x0 + w - 0.75, 0.09, z + 0.25, 0.05, 0.04, 0.16, 0x8c6a4f);
  }
}

/**
 * Lagos's National Theatre (Iganmu), shaped like a general's cap: a round drum of dark glass ringed
 * by white fins that lean outwards, white bands round it, a wide white rim and a raised white crown
 * and dome on top, on a broad low podium (the halls round its base), in round lawns inside a ring
 * road with paths in from four sides.
 */
function nationalTheatre(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const w = st.w ?? 6;
  const d = st.d ?? 6;
  const cx = (w - 1) / 2;
  const cz = (d - 1) / 2;
  const s = Math.min(w, d) / 6;
  // The grounds: lawns, the ring road round them, and paths in.
  B(cx, 0.02, cz, w - 0.04, 0.07, d - 0.04, GRASS, 0, "ground");
  B(cx, 0.09, cz, 5.5 * s, 0.004, 5.5 * s, 0x9ea3a8, 0, "disc");
  B(cx, 0.094, cz, 5.0 * s, 0.004, 5.0 * s, GRASS, 0, "disc");
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const r = 2.0 * s;
    B(cx + Math.cos(a) * r, 0.097, cz + Math.sin(a) * r, 1.3 * s, 0.003, 0.16 * s, 0xe9e4da, Math.atan2(-Math.sin(a), Math.cos(a)), "paint");
  }
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + t.r[0];
    const r = (2.85 + (k % 3) * 0.12) * s;
    tree(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.42 + (k % 2) * 0.1, t.r[1] + k * 0.37);
  }
  // The brim: a broad, low podium with a grey roof ring.
  B(cx, 0.09, cz, 3.9 * s, 0.13, 3.9 * s, 0xe4e1da, 0, "cyl");
  B(cx, 0.22, cz, 3.7 * s, 0.015, 3.7 * s, 0x9aa0a6, 0, "cyl");
  // The drum: dark glass, white bands round it.
  const R = 1.3 * s;
  B(cx, 0.22, cz, 2 * R, 0.62, 2 * R, 0x2b3a4f, 0, "cyl");
  for (const y of [0.4, 0.62]) B(cx, y, cz, 2 * R + 0.04 * s, 0.035, 2 * R + 0.04 * s, WHITE, 0, "cyl");
  // The fins: white, all the way round, leaning outwards.
  const fins = 28;
  for (let k = 0; k < fins; k++) {
    const a = (k / fins) * Math.PI * 2;
    const ry = Math.atan2(-Math.sin(a), Math.cos(a));
    B(cx + Math.cos(a) * (R + 0.02), 0.22, cz + Math.sin(a) * (R + 0.02), 0.16 * s, 0.68, 0.05 * s, WHITE, ry, "building", -0.3);
  }
  // The rim where the fins meet the top, then the crown and the dome.
  B(cx, 0.82, cz, 2 * R + 0.5 * s, 0.06, 2 * R + 0.5 * s, WHITE, 0, "cyl");
  B(cx, 0.88, cz, 2 * R - 0.1 * s, 0.12, 2 * R - 0.1 * s, 0xeef0f2, 0, "cyl");
  B(cx, 1.0, cz, 2 * R - 0.3 * s, 0.3, 2 * R - 0.3 * s, WHITE, 0, "dome");
}

export function megaParts(t: Tile, B: BoxFn, tree: TreeFn): boolean {
  const st = t.structure;
  if (!st || !st.w) return false;
  if (/^National Theatre/i.test(st.name ?? "")) {
    nationalTheatre(t, B, tree);
    return true;
  }
  if (st.type === "arena") stadium(t, B, tree);
  else if (st.type === "capitol") capitol(t, B, tree);
  else if (st.type === "megamall") megamall(t, B, tree);
  else if (st.type === "bank") bank(t, B, tree);
  else if (st.type === "bigpark") bigpark(t, B, tree);
  else if (st.type === "gym") gym(t, B, tree);
  else if (st.type === "spa") spa(t, B, tree);
  else if (st.type === "cathedral") cathedral(t, B, tree);
  else if (st.type === "grandmosque") grandmosque(t, B, tree);
  else if (st.type === "intlairport") intlairport(t, B, tree);
  else if (st.type === "spaceport") spaceport(t, B, tree);
  else if (st.type === "campus" && (st.w > 2 || (st.d ?? 2) > 2)) campus(t, B, tree);
  else if (st.type === "medcentre") campus(t, B, tree, true);
  else return false;
  return true;
}
