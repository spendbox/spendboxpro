// The big landmarks that span 3×3 tiles and more (see MEGAS in src/lib/city/layout.ts): the
// football stadium (a proper bowl: tiered stands round the pitch, a wall of glass and white
// panels outside, a ring of roof with an oval opening, floodlights), the domed capitol in its
// gardens with a statue out front, and the mega mall under a glass vault. Drawn from the shared
// instanced pieces like everything else, so even a few of them cost almost nothing.

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

/** Draws a big landmark from its corner (anchor) tile. False if it isn't one of these. */
export function megaParts(t: Tile, B: BoxFn, tree: TreeFn): boolean {
  const st = t.structure;
  if (!st || !st.w) return false;
  if (st.type === "arena") stadium(t, B, tree);
  else if (st.type === "capitol") capitol(t, B, tree);
  else if (st.type === "megamall") megamall(t, B, tree);
  else return false;
  return true;
}
