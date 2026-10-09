// Smaller pieces that make the town less samey: the neighbourhood places dotted through the
// suburbs (schools, mosques and churches, little football pitches, playgrounds, monuments),
// low causeways where streets cross the big lakes, wooden jetties with boats by the shore, and
// the supertall towers at the heart of big downtowns. All drawn from the city's shared
// instanced pieces.

import { isRoad, type CityPlan, type Tile } from "@/lib/city/layout";
import { statue } from "./megas";

type BoxFn = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry?: number, mesh?: string, tilt?: number) => void;
type TreeFn = (dx: number, dz: number, size: number, v: number) => void;
type AddFn = (mesh: string, p: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; color: number; tilt?: number }) => void;

const ASPHALT = 0x5b6470;
const WHITE = 0xf8f9fa;
const WOOD = 0x9c6b47;

/** Which side of a tile faces a road (0 +x, 1 -x, 2 +z, 3 -z), from its neighbours; -1 if none. */
function roadSide(t: Tile, plan: CityPlan) {
  // Same order as Tile.jetty / billboards.
  const sides: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  return sides.findIndex(([dx, dz]) => isRoad(plan, t.x + dx, t.z + dz));
}

/** Turn so a building's front (+z in its own frame) faces side `face`. */
const FACE_RY = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];

/** A box in a turned frame: (fx, fz) are along the front / out towards it. */
function turned(B: BoxFn, ry: number) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, r = 0, mesh?: string, tilt = 0) =>
    B(dx * c + dz * s, y, -dx * s + dz * c, sx, sy, sz, color, r + ry, mesh, tilt);
}

/** A school, a mosque or church, a little pitch, a playground or a monument. */
export function neighbourhoodParts(t: Tile, plan: CityPlan, B0: BoxFn, tree: TreeFn) {
  const r = t.r;
  const side = roadSide(t, plan);
  const B = turned(B0, FACE_RY[side >= 0 ? side : 2]);
  switch (t.kind) {
    case "school": {
      // A two-storey block with a wing, a yard with a hoop, a flag and the school bus.
      const wall = [0xf2d9a0, 0xf4e3c1, 0xe9d3b0][Math.floor(r[1] * 3) % 3];
      B(-0.1, 0.08, -0.2, 0.7, 0.42, 0.34, wall);
      B(0.28, 0.08, 0.02, 0.26, 0.3, 0.5, wall);
      for (const y of [0.17, 0.33]) B(-0.1, y, -0.2, 0.71, 0.05, 0.35, 0x5d7fa3, 0, "glass");
      B(-0.1, 0.5, -0.2, 0.72, 0.03, 0.36, 0xc0392b);
      B(-0.1, 0.08, -0.025, 0.12, 0.2, 0.02, 0x6b4430);
      B(-0.12, 0.081, 0.24, 0.5, 0.004, 0.32, 0xd9d4ca, 0, "ground");
      B(-0.32, 0.08, 0.3, 0.015, 0.22, 0.015, 0x868e96);
      B(-0.31, 0.27, 0.3, 0.06, 0.04, 0.005, WHITE);
      B(0.36, 0.08, 0.4, 0.012, 0.42, 0.012, 0xadb5bd);
      B(0.4, 0.42, 0.4, 0.08, 0.05, 0.004, [0x2b8a3e, 0x1864ab, 0xc92a2a][Math.floor(r[2] * 3) % 3], 0, "paint");
      B(0.05, 0.08, 0.38, 0.3, 0.09, 0.1, 0xfab005);
      B(0.05, 0.12, 0.38, 0.29, 0.03, 0.101, 0x343a40, 0, "glass");
      break;
    }
    case "worship": {
      if (t.v === 1) {
        // A church: a long nave with a pitched roof and a tower with a spire.
        const wall = 0xe9e2d4;
        B(0, 0.08, -0.05, 0.36, 0.32, 0.62, wall);
        B(0, 0.4, -0.05, 0.4 / Math.SQRT2, 0.2, 0.66 / Math.SQRT2, 0x7a4b3a, 0, "roof");
        B(0, 0.08, 0.32, 0.2, 0.62, 0.2, wall);
        B(0, 0.7, 0.32, 0.22 / Math.SQRT2, 0.5, 0.22 / Math.SQRT2, 0x5c6b73, 0, "roof");
        B(0, 0.42, 0.42, 0.08, 0.1, 0.005, 0x4c6e91, 0, "glass");
        B(0, 0.08, 0.425, 0.08, 0.16, 0.01, 0x6b4430);
        for (const k of [-0.2, 0, 0.2]) B(0.185, 0.2, -0.05 + k, 0.005, 0.12, 0.06, 0x4c6e91, 0, "glass");
        tree(-0.36, -0.36, 0.4, r[0]);
      } else {
        // A mosque: a white hall under a green dome, and a tall minaret.
        const dome = [0x2b8a3e, 0xe0b04a, 0x1c7ed6][Math.floor(r[1] * 3) % 3];
        B(0, 0.08, -0.05, 0.56, 0.3, 0.56, WHITE);
        B(0, 0.38, -0.05, 0.3, 0.06, 0.3, WHITE, 0, "cyl");
        B(0, 0.44, -0.05, 0.32, 0.4, 0.32, dome, 0, "dome");
        B(0, 0.6, -0.05, 0.02, 0.1, 0.02, 0xffd43b);
        for (const sx of [-0.18, 0, 0.18]) B(sx, 0.16, 0.23, 0.08, 0.14, 0.005, 0x2f6d6a, 0, "glass");
        B(0.32, 0.08, 0.3, 0.1, 1.2, 0.1, WHITE, 0, "cyl");
        B(0.32, 0.86, 0.3, 0.14, 0.04, 0.14, 0xdee2e6, 0, "cyl");
        B(0.32, 1.28, 0.3, 0.1, 0.24, 0.1, dome, 0, "cone");
      }
      break;
    }
    case "pitch": {
      // A five-a-side pitch: striped grass, lines, goals, a fence and two floodlights.
      B(0, 0.08, 0, 0.86, 0.01, 0.6, 0x3f9a4b, 0, "ground");
      for (let k = 0; k < 6; k += 2) B(-0.43 + (k + 0.5) * (0.86 / 6), 0.091, 0, 0.86 / 6, 0.002, 0.6, 0x4cad59, 0, "paint");
      for (const [lx, lz, lw, ld] of [[0, -0.29, 0.84, 0.01], [0, 0.29, 0.84, 0.01], [-0.42, 0, 0.01, 0.58], [0.42, 0, 0.01, 0.58], [0, 0, 0.01, 0.58]]) {
        B(lx, 0.093, lz, lw, 0.002, ld, WHITE, 0, "paint");
      }
      for (const gx of [-0.43, 0.43]) B(gx, 0.09, 0, 0.03, 0.07, 0.16, WHITE);
      for (const [fx, fz, fw, fd] of [[0, -0.44, 0.94, 0.01], [0, 0.44, 0.94, 0.01], [-0.47, 0, 0.01, 0.88], [0.47, 0, 0.01, 0.88]]) {
        B(fx, 0.08, fz, fw, 0.12, fd, 0x6c757d, 0, "glass");
      }
      for (const lx of [-0.45, 0.45]) {
        B(lx, 0.08, -0.42, 0.02, 0.6, 0.02, 0x868e96);
        B(lx, 0.68, -0.42, 0.08, 0.03, 0.03, 0xfff3bf, 0, "lamp");
      }
      break;
    }
    case "playground": {
      // Soft red ground, a slide, swings, a see-saw, a sandpit and a couple of trees.
      B(-0.05, 0.08, -0.05, 0.64, 0.006, 0.64, 0xd9775b, 0, "ground");
      B(-0.25, 0.08, -0.22, 0.12, 0.26, 0.12, 0x1c7ed6);
      B(-0.25, 0.34, -0.22, 0.14, 0.04, 0.14, 0xfab005);
      B(-0.06, 0.08, -0.22, 0.36, 0.03, 0.09, 0xfa5252, 0, "building", -0.62);
      B(0.18, 0.08, 0.15, 0.03, 0.3, 0.03, 0x868e96, 0, "building", 0.2);
      B(0.18, 0.08, -0.05, 0.03, 0.3, 0.03, 0x868e96, 0, "building", 0.2);
      B(0.16, 0.36, 0.05, 0.03, 0.03, 0.26, 0x868e96);
      for (const sz of [0.12, -0.02]) B(0.16, 0.14, sz, 0.06, 0.01, 0.05, 0xf08c00);
      B(-0.2, 0.09, 0.22, 0.3, 0.02, 0.05, 0x40c057, 0, "building", 0.18);
      B(0.2, 0.08, 0.3, 0.22, 0.03, 0.18, 0xf3e3b5, 0, "ground");
      tree(0.35, -0.35, 0.45, r[0]);
      tree(-0.38, 0.38, 0.4, r[1]);
      break;
    }
    case "monument": {
      B(0, 0.08, 0, 0.7, 0.02, 0.7, 0xe7e1d5, 0, "ground");
      if (t.v === 1) {
        statue(B, 0, 0, 1.25);
      } else {
        // An obelisk on stepped stone, flowers round it.
        B(0, 0.1, 0, 0.36, 0.06, 0.36, 0xd8d1c3);
        B(0, 0.16, 0, 0.26, 0.06, 0.26, 0xe6dfd2);
        B(0, 0.22, 0, 0.12, 0.95, 0.12, 0xf1ece2);
        B(0, 1.17, 0, 0.12, 0.16, 0.12, 0xf1ece2, 0, "cone");
      }
      for (const [fx, fz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) B(fx, 0.1, fz, 0.1, 0.03, 0.1, 0xf783ac, 0, "disc");
      break;
    }
  }
}

/** A street on a low causeway across a lake: water all round, the road deck, railings, lamps. */
export function causewayParts(t: Tile, add: AddFn) {
  const { x, z } = t;
  const m = t.mask ?? 0;
  // (The water round it is part of the smooth water surface, see ./water.)
  const alongX = (m & 2) || (m & 8);
  const alongZ = (m & 1) || (m & 4);
  const W = 0.6;
  if (alongX) add("ground", { x, y: 0, z, sx: 1.002, sy: 0.06, sz: W, ry: 0, color: ASPHALT });
  if (alongZ) add("ground", { x, y: 0, z, sx: W, sy: 0.06, sz: 1.002, ry: 0, color: ASPHALT });
  if (!alongX && !alongZ) add("ground", { x, y: 0, z, sx: W, sy: 0.06, sz: W, ry: 0, color: ASPHALT });
  // Railings along the sides (not across a junction), lamps, dashes, and piers in the water.
  if (alongX && !alongZ) {
    for (const s of [-1, 1]) {
      add("building", { x, y: 0.06, z: z + s * (W / 2 - 0.01), sx: 1, sy: 0.05, sz: 0.02, ry: 0, color: 0xdee2e6 });
      add("cyl", { x, y: -0.03, z: z + s * 0.2, sx: 0.07, sy: 0.04, sz: 0.07, ry: 0, color: 0xadb5bd });
    }
    for (let k = -1; k <= 1; k++) add("paint", { x: x + k * 0.33, y: 0.061, z, sx: 0.16, sy: 0.005, sz: 0.03, ry: 0, color: 0xffffff });
    add("trunk", { x, y: 0.06, z: z + W / 2 - 0.02, sx: 0.25, sy: 0.4, sz: 0.25, ry: 0, color: 0x868e96 });
    add("lamp", { x, y: 0.46, z: z + W / 2 - 0.05, sx: 0.06, sy: 0.04, sz: 0.06, ry: 0, color: 0xfff3bf });
  } else if (alongZ && !alongX) {
    for (const s of [-1, 1]) {
      add("building", { x: x + s * (W / 2 - 0.01), y: 0.06, z, sx: 0.02, sy: 0.05, sz: 1, ry: 0, color: 0xdee2e6 });
      add("cyl", { x: x + s * 0.2, y: -0.03, z, sx: 0.07, sy: 0.04, sz: 0.07, ry: 0, color: 0xadb5bd });
    }
    for (let k = -1; k <= 1; k++) add("paint", { x, y: 0.061, z: z + k * 0.33, sx: 0.03, sy: 0.005, sz: 0.16, ry: 0, color: 0xffffff });
    add("trunk", { x: x + W / 2 - 0.02, y: 0.06, z, sx: 0.25, sy: 0.4, sz: 0.25, ry: 0, color: 0x868e96 });
    add("lamp", { x: x + W / 2 - 0.05, y: 0.46, z, sx: 0.06, sy: 0.04, sz: 0.06, ry: 0, color: 0xfff3bf });
  }
}

/** A wooden jetty from the shore out into the water, with a little boat tied up beside it. */
export function jettyParts(t: Tile, add: AddFn) {
  const face = t.jetty ?? 0;
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const [dx, dz] = dirs[face];
  const { x, z } = t;
  // From the land edge (face side) out 0.7 into the water.
  const len = 0.72;
  const cx = x + dx * (0.5 - len / 2);
  const cz = z + dz * (0.5 - len / 2);
  const along = dx !== 0;
  add("building", { x: cx, y: 0.0, z: cz, sx: along ? len : 0.16, sy: 0.035, sz: along ? 0.16 : len, ry: 0, color: WOOD });
  for (let k = 0; k < 3; k++) {
    const px = x + dx * (0.5 - (k + 0.5) * (len / 3));
    const pz = z + dz * (0.5 - (k + 0.5) * (len / 3));
    for (const s of [-1, 1]) add("cyl", { x: px + (along ? 0 : s * 0.08), y: -0.04, z: pz + (along ? s * 0.08 : 0), sx: 0.025, sy: 0.08, sz: 0.025, ry: 0, color: 0x6b4430 });
  }
  // The boat: a hull and a little cabin, beside the jetty.
  const side = t.r[2] < 0.5 ? -1 : 1;
  const bx = cx + (along ? 0 : side * 0.2);
  const bz = cz + (along ? side * 0.2 : 0);
  const hull = [0xffffff, 0xe03131, 0x1c7ed6, 0xfab005][Math.floor(t.r[3] * 4) % 4];
  add("building", { x: bx, y: -0.01, z: bz, sx: along ? 0.34 : 0.12, sy: 0.05, sz: along ? 0.12 : 0.34, ry: 0, color: hull });
  add("building", { x: bx - (along ? 0.03 * dx : 0), y: 0.04, z: bz - (along ? 0 : 0.03 * dz), sx: along ? 0.12 : 0.08, sy: 0.05, sz: along ? 0.08 : 0.12, ry: 0, color: WHITE });
}

/** A supertall: three setbacks of glass and stone, a lit crown and a long spire. */
export function supertallParts(t: Tile, color: number, B: BoxFn) {
  const r = t.r;
  const spire = 1.4;
  const h = t.top - spire - 0.08;
  const w = 0.8;
  const tiers = [
    { w, h: h * 0.5 },
    { w: w * 0.8, h: h * 0.3 },
    { w: w * 0.6, h: h * 0.2 },
  ];
  let y = 0.08;
  tiers.forEach((tier, k) => {
    const mesh = r[1] < 0.5 && k === 1 ? "cyl" : "building";
    B(0, y, 0, tier.w, tier.h, tier.w, color, 0, mesh);
    for (let yy = 0.45; yy < tier.h - 0.1; yy += 0.45) B(0, y + yy, 0, tier.w + 0.012, 0.06, tier.w + 0.012, 0x4c6e91, 0, mesh === "cyl" ? "cyl" : "glass");
    y += tier.h;
    B(0, y - 0.02, 0, tier.w + 0.04, 0.04, tier.w + 0.04, 0xe9ecef, 0, mesh);
  });
  B(0, y, 0, w * 0.5, 0.25, w * 0.5, 0xfff3bf, 0, "lamp");
  B(0, y + 0.25, 0, 0.14, spire, 0.14, 0xe9ecef, 0, "cone");
  B(0, y + 0.25 + spire, 0, 0.04, 0.04, 0.04, 0xff6b6b, 0, "lamp");
}

/**
 * A swimming pool: a stone deck, a white rim, clear blue water that's darker at the deep end,
 * a ladder and (if there's room) a couple of sun loungers. (x, z) is its middle, w × d the water.
 */
export function pool(B: BoxFn, x: number, y: number, z: number, w: number, d: number, loungers = true) {
  const alongX = w >= d;
  B(x, y, z, w + 0.09, 0.012, d + 0.09, 0xe9e2d4, 0, "ground");
  B(x, y + 0.012, z, w + 0.035, 0.01, d + 0.035, 0xffffff, 0, "ground");
  B(x, y + 0.012, z, w, 0.012, d, 0x6fd0f2, 0, "water");
  // The deep end, a shade darker, and a dark stripe on the floor down the middle.
  const deepW = alongX ? w * 0.38 : w;
  const deepD = alongX ? d : d * 0.38;
  B(x + (alongX ? w / 2 - deepW / 2 : 0), y + 0.0245, z + (alongX ? 0 : d / 2 - deepD / 2), deepW, 0.001, deepD, 0x2f9fd8, 0, "paint");
  B(x, y + 0.0247, z, alongX ? w * 0.8 : 0.008, 0.0005, alongX ? 0.008 : d * 0.8, 0x1c7ed6, 0, "paint");
  // The ladder at the shallow end.
  const lx = x - (alongX ? w / 2 - 0.02 : 0);
  const lz = z - (alongX ? 0 : d / 2 - 0.02);
  for (const s of [-0.018, 0.018]) B(lx + (alongX ? 0 : s), y + 0.012, lz + (alongX ? s : 0), 0.006, 0.05, 0.006, 0xced4da);
  if (loungers) {
    for (const s of [-1, 1]) {
      const ox = alongX ? s * w * 0.22 : w / 2 + 0.08;
      const oz = alongX ? d / 2 + 0.08 : s * d * 0.22;
      B(x + ox, y + 0.012, z + oz, alongX ? 0.05 : 0.1, 0.014, alongX ? 0.1 : 0.05, 0xffffff);
    }
  }
}

/**
 * A pond with soft, rounded edges: a few overlapping ovals of water on a sandy rim, lily pads,
 * and reeds at the edge. y is the ground it sits in.
 */
export function pond(B: BoxFn, y: number, r: readonly number[], scale = 1) {
  const s = scale;
  const blobs: [number, number, number, number, number][] = [
    [0, 0, 0.62, 0.48, r[1] * 3],
    [0.14, 0.1, 0.42, 0.36, r[2] * 3],
    [-0.12, -0.09, 0.4, 0.32, r[3] * 3],
  ];
  for (const [bx, bz, w, d, ry] of blobs) B(bx * s, y, bz * s, (w + 0.08) * s, 0.004, (d + 0.08) * s, 0xd8c99a, ry, "disc");
  for (const [bx, bz, w, d, ry] of blobs) B(bx * s, y + 0.004, bz * s, w * s, 0.004, d * s, 0x5fb8e6, ry, "waterDisc");
  B(0, y + 0.0045, 0, 0.3 * s, 0.004, 0.22 * s, 0x3d9fd6, r[1] * 3, "waterDisc");
  for (const [px, pz] of [[0.12, -0.05], [-0.05, 0.12], [0.2, 0.15]]) B(px * s, y + 0.009, pz * s, 0.07 * s, 0.002, 0.07 * s, 0x5c940d, 0, "disc");
  B(0.13 * s, y + 0.011, -0.05 * s, 0.025 * s, 0.002, 0.025 * s, 0xf783ac, 0, "disc");
  for (const [rx, rz] of [[-0.33, 0.05], [-0.3, 0.12], [0.3, -0.18], [0.34, -0.1]]) B(rx * s, y, rz * s, 0.012, 0.09, 0.012, 0x6b8e23, 0, "building");
}
