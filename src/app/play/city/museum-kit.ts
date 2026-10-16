// Draws a museum (see museumParts): one of four buildings, none of them domed (a dome reads as a
// mosque), in grounds full of bold sculptures. From the city's shared instanced pieces.

import type { Tile } from "@/lib/city/layout";

type BoxFn = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry?: number, mesh?: string, tilt?: number) => void;
type TreeFn = (dx: number, dz: number, size: number, v: number) => void;

/** A stable number 0..1 from v and k. */
const hashish = (v: number, k: number) => {
  const x = Math.sin(v * 9301 + k * 49297) * 233280;
  return x - Math.floor(x);
};

/** Bold sculpture colours: Lagos red, gold, cobalt, bronze, black, white, green. */
const BOLD = [0xe03131, 0xfab005, 0x1c63d6, 0xb07a3b, 0x1a1b1e, 0xf8f9fa, 0x2b8a3e, 0xf76707, 0x8a5a2b];

/**
 * A big sculpture standing on the ground at (x, z), about `s` tall: a giant bronze head, a ring,
 * stacked tilted blocks, a painted totem, a spike, a ball on a cube, a pair of arches, or a figure.
 */
export function sculpture(B: BoxFn, x: number, z: number, s: number, v: number) {
  const kind = Math.floor(hashish(v, 1) * 8);
  const c1 = BOLD[Math.floor(hashish(v, 2) * BOLD.length)];
  const c2 = BOLD[Math.floor(hashish(v, 3) * BOLD.length)];
  const turn = hashish(v, 4) * Math.PI;
  B(x, 0.09, z, s * 0.42, 0.03, s * 0.42, 0xd8d2c4);
  const y = 0.12;
  switch (kind) {
    case 0: // a giant head (Ife-style), on a short neck
      B(x, y, z, s * 0.18, s * 0.25, s * 0.18, c1 === 0xf8f9fa ? 0xb07a3b : c1, 0, "cyl");
      B(x, y + s * 0.2, z, s * 0.42, s * 0.55, s * 0.36, 0xb07a3b, turn, "crown");
      break;
    case 1: // a great arch on a block
      B(x, y, z, s * 0.5, s * 0.12, s * 0.14, c2, turn);
      B(x, y + s * 0.12, z, s * 1.6, s * 1.6, s * 1.6, c1, turn, "arch");
      break;
    case 2: // stacked blocks, each turned a little more
      for (let k = 0; k < 4; k++) B(x, y + k * s * 0.22, z, s * (0.32 - k * 0.05), s * 0.22, s * (0.32 - k * 0.05), k % 2 ? c1 : c2, turn + k * 0.35);
      break;
    case 3: // a painted totem
      for (let k = 0; k < 5; k++) B(x, y + k * s * 0.2, z, s * 0.18, s * 0.2, s * 0.18, [c1, c2, 0xfab005, 0x1a1b1e, 0xf8f9fa][k], 0, "cyl");
      B(x, y + s, z, s * 0.26, s * 0.18, s * 0.26, c1, 0, "cone");
      break;
    case 4: // a tall spike, leaning
      B(x, y, z, s * 0.3, s * 1.2, s * 0.3, c1, turn, "cone", 0.12);
      break;
    case 5: // a ball on a cube
      B(x, y, z, s * 0.34, s * 0.34, s * 0.34, c2, turn);
      B(x, y + s * 0.34, z, s * 0.5, s * 0.5, s * 0.5, c1, 0, "crown");
      break;
    case 6: // two arches crossing
      B(x, y, z, s * 1.2, s * 1.2, s * 1.2, c1, turn, "arch");
      B(x, y, z, s * 1.2, s * 1.2, s * 1.2, c2, turn + Math.PI / 2, "arch");
      break;
    default: // a standing figure, arms up
      B(x, y, z, s * 0.16, s * 0.6, s * 0.12, c1, turn);
      B(x, y + s * 0.6, z, s * 0.16, s * 0.16, s * 0.16, c1, 0, "crown");
      for (const side of [-1, 1]) B(x + Math.cos(turn) * side * s * 0.1, y + s * 0.42, z - Math.sin(turn) * side * s * 0.1, s * 0.05, s * 0.4, s * 0.05, c1, turn, "building", side * 0.5);
  }
}

/**
 * A museum filling its site: the building (a modern white gallery, a classical museum with columns
 * and a pediment, a red-earth heritage house with carved posts, or a glass pavilion) in a paved
 * sculpture garden with as many bold sculptures as fit.
 */
export function museumParts(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const W = st.w ?? 2;
  const D = st.d ?? 2;
  const Cx = (W - 1) / 2;
  const Cz = (D - 1) / 2;
  const seed = (st.name ?? "").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) + t.r[0];
  const h = (k: number) => hashish(seed, k);
  const heritage = /palace|heritage|storey|slave|kalakuta|shrine/i.test(st.name ?? "");
  const design = heritage ? 2 : Math.floor(h(1) * 4) === 2 ? 3 : Math.floor(h(1) * 4);
  B(Cx, 0.02, Cz, W - 0.04, 0.07, D - 0.04, 0x9fcf8c, 0, "ground");
  B(Cx, 0.085, Cz, W - 0.3, 0.006, D - 0.3, 0xe7e1d5, 0, "ground");
  // The building, about half the site, towards the back (z small), its front facing +z.
  const bw = Math.max(1.2, W * 0.6);
  const bd = Math.max(0.9, D * 0.42);
  const bz = Cz - D * 0.16;
  const tall = Math.min(1.6, 0.45 + Math.min(W, D) * 0.18);
  switch (design) {
    case 0: {
      // Modern: white boxes stacked and cantilevered, a long glass front, a coloured fin.
      B(Cx, 0.09, bz, bw, tall * 0.5, bd, 0xf8f9fa);
      B(Cx + bw * 0.12, 0.09 + tall * 0.5, bz + bd * 0.08, bw * 0.8, tall * 0.42, bd * 0.85, 0xeef0f2);
      B(Cx, 0.09, bz + bd / 2 + 0.005, bw * 0.9, tall * 0.3, 0.02, 0x4c6e91, 0, "glass");
      B(Cx - bw * 0.42, 0.09, bz + bd / 2, 0.06, tall * 1.05, 0.25, BOLD[Math.floor(h(2) * 3)]);
      B(Cx + bw * 0.12, 0.09 + tall * 0.92, bz, bw * 0.7, 0.02, bd * 0.6, 0x9ec5fe, 0, "glass");
      break;
    }
    case 1: {
      // Classical: steps, a row of columns, a flat-topped pediment, a long stone hall behind.
      for (let k = 0; k < 3; k++) B(Cx, 0.09 + k * 0.03, bz + bd / 2 + 0.12 - k * 0.04, bw * 0.75 - k * 0.04, 0.03, 0.2, 0xece4d4);
      B(Cx, 0.09, bz - 0.06, bw, tall * 0.55, bd * 0.85, 0xf3ede1);
      const n = Math.max(6, Math.round(bw * 7));
      for (let k = 0; k < n; k++) B(Cx - bw * 0.36 + (k * bw * 0.72) / (n - 1), 0.18, bz + bd / 2 - 0.06, 0.05, tall * 0.45, 0.05, 0xffffff, 0, "cyl");
      B(Cx, 0.18 + tall * 0.45, bz + bd / 2 - 0.08, bw * 0.8, 0.06, 0.16, 0xece4d4);
      B(Cx, 0.24 + tall * 0.45, bz + bd / 2 - 0.08, (bw * 0.8) / Math.SQRT2, 0.14, 0.2 / Math.SQRT2, 0xece4d4, 0, "roof");
      B(Cx, 0.09 + tall * 0.55, bz - 0.06, bw + 0.02, 0.04, bd * 0.85 + 0.02, 0xd8cfbd);
      break;
    }
    case 2: {
      // Heritage: red-earth walls, carved wooden posts along a veranda, pitched zinc roofs.
      const earth = 0xa0522d;
      B(Cx, 0.09, bz, bw, tall * 0.42, bd, earth);
      for (let k = 0; k < 7; k++) B(Cx - bw * 0.45 + (k * bw * 0.9) / 6, 0.09, bz + bd / 2 + 0.1, 0.05, tall * 0.4, 0.05, 0x5c3d2e);
      B(Cx, 0.09 + tall * 0.42, bz + 0.05, bw / Math.SQRT2 + 0.08, 0.3, (bd + 0.3) / Math.SQRT2, 0x7d7a74, 0, "roof");
      for (let k = 0; k < 4; k++) B(Cx - bw * 0.3 + k * bw * 0.2, 0.15, bz + bd / 2 + 0.005, 0.08, 0.12, 0.01, [0xf8f9fa, 0x1a1b1e, 0xfab005, 0xf8f9fa][k], 0, "paint");
      // The courtyard wall with a gate.
      for (const side of [-1, 1]) B(Cx + side * (W / 2 - 0.12), 0.09, Cz, 0.06, 0.16, D - 0.3, earth);
      break;
    }
    default: {
      // A glass pavilion on stepped terraces, a bold red frame round its door.
      for (let k = 0; k < 3; k++) B(Cx, 0.09 + k * 0.05, bz - k * 0.05, bw - k * 0.12, 0.05, bd - k * 0.1, 0xdee2e6);
      B(Cx, 0.24, bz - 0.1, bw * 0.85, tall * 0.55, bd * 0.7, 0x9ec5e8, 0, "curtain");
      B(Cx, 0.24 + tall * 0.55, bz - 0.1, bw * 0.9, 0.05, bd * 0.75, 0xf8f9fa);
      B(Cx, 0.24, bz - 0.1 + (bd * 0.7) / 2 + 0.01, 0.3, tall * 0.4, 0.04, 0xe03131);
    }
  }
  // The name on a low wall at the front.
  B(Cx, 0.09, D - 0.62, Math.min(W * 0.5, 1.6), 0.12, 0.05, design === 2 ? 0xa0522d : 0x343a40);
  // The sculpture garden: as many as fit in front and down the sides.
  const spots: [number, number][] = [];
  const front0 = bz + bd / 2 + 0.35;
  for (let z = front0; z < D - 0.75; z += 0.5) for (let x = -0.22; x < W - 0.75; x += 0.5) spots.push([x, z]);
  for (let z = 0.1; z < front0 - 0.2; z += 0.5) for (const x of [-0.26, W - 0.74]) if (Math.abs(x - Cx) > bw / 2 + 0.15) spots.push([x, z]);
  spots.forEach(([x, z], k) => {
    if (h(100 + k) < 0.22) return tree(x, z, 0.4, h(200 + k));
    sculpture(B, x + (h(300 + k) - 0.5) * 0.1, z + (h(400 + k) - 0.5) * 0.1, 0.32 + h(500 + k) * 0.26, seed + k * 7.3);
  });
}
