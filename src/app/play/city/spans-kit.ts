// Draws a real place's bridges, flyovers and railways along their real curves
// (src/lib/world/spans): each short straight piece as a deck tilted to its slope, with parapets
// and lamps, on piers that stand on the ground or in the water; railways as ballast and rails,
// on viaducts where the map raises them; stations with platforms, a canopy and a hall beside the
// line. Also the pedestrian crossings (zebra, with lights, ladder, refuge island, school,
// raised) and the ground kept clear under decks and along railways. All from the city's shared
// instanced pieces.

import type { Tile } from "@/lib/city/layout";
import type { Piece, StationPlan } from "@/lib/world/spans";

type AddFn = (mesh: string, p: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; color: number; tilt?: number }) => void;

const CONCRETE = 0xc9ccd1;
const ASPHALT = 0x4a5058;
const PARAPET = 0xdee2e6;
const BALLAST = 0x9c9488;
const RAIL = 0x5c5f66;
const SLEEPER = 0x6b5b4b;

/** One piece of a bridge, flyover or railway. */
export function pieceParts(p: Piece, add: AddFn) {
  const dx = p.bx - p.ax;
  const dz = p.bz - p.az;
  const flat = Math.hypot(dx, dz);
  if (flat < 1e-4) return;
  const ry = -Math.atan2(dz, dx);
  const tilt = Math.atan2(p.by - p.ay, flat);
  const len = Math.hypot(flat, p.by - p.ay) + 0.015;
  const mx = (p.ax + p.bx) / 2;
  const mz = (p.az + p.bz) / 2;
  const my = (p.ay + p.by) / 2;
  // Across the deck, at an offset c from its centre line.
  const nx = -dz / flat;
  const nz = dx / flat;
  const at = (c: number) => ({ x: mx + nx * c, z: mz + nz * c });
  const part = (mesh: string, c: number, y: number, sy: number, w: number, color: number, l = len) => add(mesh, { ...at(c), y, sx: l, sy, sz: w, ry, color, tilt });

  if (p.ground) {
    // A railway on the ground: a bed of ballast, sleepers, two rails.
    part("ground", 0, 0.06, 0.02, 0.34, BALLAST);
    part("building", 0, 0.08, 0.012, 0.24, SLEEPER, len * 0.9);
    for (const c of [-0.06, 0.06]) part("building", c, 0.092, 0.012, 0.014, RAIL);
    return;
  }
  // The deck, tilted to its slope, a little thicker for a road.
  const thick = p.kind === "rail" ? 0.06 : 0.07;
  part("building", 0, my - thick, thick, p.width, CONCRETE);
  if (p.kind === "rail") {
    part("ground", 0, my - 0.004, 0.012, p.width - 0.06, BALLAST);
    for (const c of [-0.06, 0.06]) part("building", c, my + 0.008, 0.012, 0.014, RAIL);
  } else {
    part("ground", 0, my - 0.004, 0.006, p.width - 0.04, ASPHALT);
    // A lane line down the middle (a dashed look: shorter than the piece).
    part("paint", 0, my + 0.003, 0.003, 0.012, 0xffffff, len * 0.45);
  }
  for (const c of [-p.width / 2 + 0.01, p.width / 2 - 0.01]) part("building", c, my - 0.004, 0.045, 0.02, PARAPET);
  if (p.pier) {
    // A pier under the deck (two side by side under a wide road deck), from the ground or the water.
    const h = Math.max(0.05, p.ay - thick - 0.02);
    const cols = p.width > 0.4 ? [-p.width / 4, p.width / 4] : [0];
    for (const c of cols) {
      const q = { x: p.ax + nx * c, z: p.az + nz * c };
      add("building", { ...q, y: 0, sx: 0.09, sy: h, sz: 0.09, ry, color: CONCRETE });
    }
    add("building", { x: p.ax, z: p.az, y: h - 0.04, sx: 0.1, sy: 0.05, sz: p.width * 0.9, ry, color: CONCRETE });
    // A street lamp on the parapet now and then.
    if (p.kind === "road") {
      const q = { x: p.ax + nx * (p.width / 2 - 0.02), z: p.az + nz * (p.width / 2 - 0.02) };
      add("cyl", { ...q, y: p.ay, sx: 0.015, sy: 0.28, sz: 0.015, ry: 0, color: 0x495057 });
      add("lamp", { ...q, y: p.ay + 0.28, sx: 0.06, sy: 0.04, sz: 0.06, ry: 0, color: 0xffffff });
    }
  }
}

/** A station along a railway: platforms either side, a canopy, a hall beside the line. */
export function stationParts(st: StationPlan, add: AddFn) {
  const cos = Math.cos(st.ry);
  const sin = Math.sin(st.ry);
  // Along the line by a, across it by c.
  const P = (mesh: string, a: number, c: number, y: number, la: number, sy: number, wc: number, color: number) =>
    add(mesh, { x: st.x + a * cos + c * sin, y, z: st.z - a * sin + c * cos, sx: la, sy, sz: wc, ry: st.ry, color });
  const y = st.raised ? 0.55 : 0.07;
  for (const side of [-1, 1]) {
    P("building", 0, side * 0.26, st.raised ? 0 : 0.06, 1.6, y + 0.06 - (st.raised ? 0 : 0.06), 0.2, st.raised ? CONCRETE : 0xdee2e6);
    P("paint", 0, side * 0.175, y + 0.061, 1.6, 0.004, 0.02, 0xffd43b);
    // Canopy on posts.
    for (const a of [-0.6, 0, 0.6]) P("cyl", a, side * 0.3, y + 0.06, 0.025, 0.3, 0.025, 0x495057);
    P("building", 0, side * 0.27, y + 0.36, 1.5, 0.025, 0.26, side > 0 ? 0x1c7ed6 : 0x1971c2);
  }
  // The station hall on the ground beside the line, with glass and a name board.
  P("building", 0, 0.72, 0.06, 0.9, 0.42, 0.32, 0xf1f3f5);
  P("glass", 0, 0.56, 0.12, 0.8, 0.22, 0.01, 0x9ec5fe);
  P("building", 0, 0.72, 0.48, 0.96, 0.04, 0.38, 0x1c7ed6);
  P("paint", 0, 0.555, 0.36, 0.5, 0.06, 0.004, 0xffffff);
  if (st.raised) {
    // Stairs and a lift up to the platform.
    P("building", 0.55, 0.48, 0.06, 0.14, 0.5, 0.14, 0xadb5bd);
    P("glass", 0.55, 0.48, 0.1, 0.145, 0.4, 0.145, 0x9ec5fe);
  }
}

/** A pedestrian crossing over a straight road (along x when `alongX`). */
export function crossingParts(t: Tile, type: number, alongX: boolean, add: AddFn) {
  const { x, z } = t;
  // Positions across the road (c) at the crossing's spot along it.
  const put = (mesh: string, c: number, y: number, along: number, sy: number, across: number, color: number, a = 0) =>
    add(mesh, alongX ? { x: x + a, y, z: z + c, sx: along, sy, sz: across, ry: 0, color } : { x: x + c, y, z: z + a, sx: across, sy, sz: along, ry: 0, color });
  const stripes = (color: number, y = 0.061, width = 0.05) => {
    for (let k = -4; k <= 4; k++) put("paint", k * 0.09, y, 0.16, 0.005, width, color);
  };
  switch (type) {
    case 1:
      // With its own lights: stripes, stop lines both ways, a pole each side with a red man and a green man.
      stripes(0xffffff);
      for (const a of [-0.17, 0.17]) put("paint", a > 0 ? 0.2 : -0.2, 0.061, 0.02, 0.005, 0.36, 0xffffff, a);
      for (const c of [-0.47, 0.47]) {
        put("trunk", c, 0.06, 0.18, 0.4, 0.18, 0x343a40);
        put("building", c, 0.4, 0.05, 0.1, 0.05, 0x212529);
        put("lamp", c, 0.47, 0.03, 0.03, 0.03, 0x2fd158);
        put("lamp", c, 0.43, 0.03, 0.03, 0.03, 0x6b1d1d);
      }
      break;
    case 2:
      // Ladder: two lines across, rungs between.
      for (const a of [-0.1, 0.1]) put("paint", 0, 0.061, 0.02, 0.005, 0.86, 0xffffff, a);
      for (let k = -4; k <= 4; k++) put("paint", k * 0.09, 0.061, 0.18, 0.005, 0.035, 0xffffff);
      break;
    case 3:
      // A refuge island in the middle, with bollards.
      stripes(0xffffff);
      put("building", 0, 0.06, 0.26, 0.035, 0.12, 0xdee2e6);
      for (const a of [-0.1, 0.1]) put("cyl", 0, 0.095, 0.025, 0.08, 0.025, 0xf8f9fa, a);
      break;
    case 4:
      // A school crossing: yellow and white, a warning sign.
      stripes(0xffd43b);
      for (const a of [-0.12, 0.12]) put("paint", 0, 0.062, 0.02, 0.005, 0.86, 0xffffff, a);
      put("trunk", 0.46, 0.06, 0.15, 0.45, 0.15, 0x495057, 0.3);
      put("building", 0.46, 0.45, 0.02, 0.1, 0.1, 0xffd43b, 0.3);
      break;
    case 5:
      // Raised: a light table of the crossing's width, stripes on top.
      put("ground", 0, 0.055, 0.24, 0.025, 0.9, 0xb5b0a6);
      stripes(0xffffff, 0.081);
      break;
    default:
      stripes(0xffffff);
  }
}

/** Ground kept clear: dark paving under a deck, gravel along a railway, light paving round a station. */
export const CLEAR_GROUND: Record<NonNullable<Tile["clear"]>, number> = { deck: 0x8f949b, track: 0xb3aa98, station: 0xe9ecef };
