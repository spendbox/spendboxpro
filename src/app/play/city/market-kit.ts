// Draws a market (see marketParts): the stalls, aisles and lock-up shops of a Nigerian market,
// from the city's shared instanced pieces.

import type { Tile } from "@/lib/city/layout";

type BoxFn = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry?: number, mesh?: string, tilt?: number) => void;
type TreeFn = (dx: number, dz: number, size: number, v: number) => void;

/** A stable number 0..1 from v and k. */
const hashish = (v: number, k: number) => {
  const x = Math.sin(v * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * A Nigerian market (Balogun, Oshodi, Mile 12, a street's own market): dusty ground packed with
 * rows of stalls between narrow aisles (rusty zinc sheds, big umbrellas in every colour, blue
 * tarpaulins on poles, traders' mats on the ground), heaps of tomatoes, pepper, yam, plantain,
 * onions, bright fabric and shiny pots, and lock-up shops with coloured shutters along two edges.
 * Fills the whole site, whatever its size, at the same scale (a few of the city's shared pieces
 * a stall, so a big market costs no more to draw than a few buildings' worth).
 */
export function marketParts(t: Tile, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const W = st.w ?? 2;
  const D = st.d ?? 2;
  const Cx = (W - 1) / 2;
  const Cz = (D - 1) / 2;
  const h = (k: number) => hashish(t.r[0] + t.r[1] * 7, k);
  B(Cx, 0.02, Cz, W - 0.04, 0.07, D - 0.04, 0xc2ad86, 0, "ground");
  const GOODS = [0xd9480f, 0xe03131, 0xc8a27a, 0x82c91e, 0xfcc419, 0x862e9c, 0xe64980, 0x1c7ed6, 0xadb5bd, 0xf08c00, 0x2f9e44, 0xffffff];
  const UMBRELLAS = [0xe03131, 0x1c7ed6, 0xfab005, 0x2f9e44, 0xf76707, 0xffffff, 0x7048e8];
  const ZINC = [0x8b5a3c, 0x9c6644, 0x7d7a74, 0xa0522d, 0x8f8a82];
  const SHUTTERS = [0x1c7ed6, 0xe03131, 0x2f9e44, 0xf59f00, 0x7048e8, 0x0ca678, 0xadb5bd];
  // Lock-up shops along the north and south edges, facing in.
  const edge = 0.3;
  for (const side of [-1, 1]) {
    const z = side < 0 ? -0.5 + edge / 2 + 0.03 : D - 0.5 - edge / 2 - 0.03;
    for (let k = 0; k < W; k++) {
      const tall = h(10 + k + side * 50) < 0.35;
      const height = tall ? 0.5 : 0.28;
      B(k, 0.09, z, 0.94, height, edge, [0xf1ece4, 0xe9dcc4, 0xdee2e6, 0xf3d9c4][Math.floor(h(20 + k + side) * 4)]);
      for (let s = 0; s < 3; s++) B(k - 0.3 + s * 0.3, 0.09, z - (side * edge) / 2 - side * 0.006, 0.24, 0.2, 0.01, SHUTTERS[Math.floor(h(30 + k * 3 + s + side * 7) * SHUTTERS.length)]);
      B(k, 0.09 + height, z, 0.98, 0.03, edge + 0.06, ZINC[Math.floor(h(40 + k + side) * ZINC.length)]);
      B(k, 0.09 + height - 0.08, z - (side * edge) / 2 - side * 0.008, 0.9, 0.06, 0.01, [0xe03131, 0x1971c2, 0xf08c00, 0x2b8a3e][Math.floor(h(50 + k + side) * 4)], 0, "paint");
    }
  }
  // Rows of stalls in between, aisles between the rows.
  const z0 = -0.5 + edge + 0.14;
  const z1 = D - 0.5 - edge - 0.14;
  const rowStep = 0.36;
  const rows = Math.max(1, Math.floor((z1 - z0) / rowStep));
  for (let row = 0; row < rows; row++) {
    const rz = z0 + (row + 0.5) * ((z1 - z0) / rows);
    const face = row % 2 ? 1 : -1;
    let x = -0.42;
    let k = 0;
    while (x < W - 0.58) {
      const w = 0.22 + h(100 + row * 97 + k) * 0.12;
      const sx = Math.min(x + w / 2, W - 0.5 - w / 2 - 0.08);
      x += w + 0.015;
      k++;
      const roll = h(200 + row * 97 + k);
      const goods = (j: number) => GOODS[Math.floor(h(300 + row * 97 + k * 5 + j) * GOODS.length)];
      if (roll < 0.06) continue; // a gap: a way through between the rows
      if (roll < 0.38) {
        // A zinc shed: a back board, a sloping rusty roof, the table of goods in front.
        B(sx, 0.09, rz - face * 0.12, w - 0.02, 0.26, 0.02, 0x8d7b68);
        B(sx, 0.31, rz, 0.24, 0.015, w + 0.02, ZINC[Math.floor(h(400 + row * 97 + k) * ZINC.length)], Math.PI / 2, "building", face * 0.25);
        B(sx, 0.09, rz + face * 0.02, w - 0.04, 0.1, 0.16, 0x9c7b56);
        for (let j = 0; j < 3; j++) B(sx - w / 3 + (j * w) / 3 + w / 6, 0.19, rz + face * 0.02, w / 3 - 0.02, 0.04 + h(500 + j + k) * 0.03, 0.12, goods(j), 0, "cone");
      } else if (roll < 0.66) {
        // A big umbrella over a table.
        B(sx, 0.09, rz, 0.012, 0.3, 0.012, 0x495057, 0, "cyl");
        B(sx, 0.36, rz, w + 0.06, 0.06, w + 0.06, UMBRELLAS[Math.floor(h(600 + row * 97 + k) * UMBRELLAS.length)], 0, "cone");
        B(sx, 0.09, rz + face * 0.03, w - 0.04, 0.09, 0.14, 0xb08968);
        for (let j = 0; j < 2; j++) B(sx - w / 4 + (j * w) / 2, 0.18, rz + face * 0.03, w / 2 - 0.03, 0.05, 0.1, goods(j), 0, "cone");
      } else if (roll < 0.86) {
        // A tarpaulin on poles over goods on a low bench.
        for (const px of [-1, 1]) B(sx + (px * (w - 0.04)) / 2, 0.09, rz + face * 0.1, 0.01, 0.26, 0.01, 0x6b5440);
        B(sx, 0.34, rz, w + 0.02, 0.01, 0.26, [0x1c7ed6, 0x4dabf7, 0xf1f3f5, 0x2f9e44][Math.floor(h(700 + k + row) * 4)], 0, "building", face * 0.12);
        B(sx, 0.09, rz, w - 0.04, 0.05, 0.18, 0x8d6e63);
        for (let j = 0; j < 3; j++) B(sx - w / 3 + (j * w) / 3 + w / 6, 0.14, rz, w / 3 - 0.02, 0.05, 0.12, goods(j + 2), 0, "cone");
      } else {
        // A trader's mat on the ground with heaps of goods, a basin and a stool.
        B(sx, 0.091, rz, w - 0.02, 0.004, 0.2, [0xe8590c, 0xfab005, 0x7048e8][Math.floor(h(800 + k) * 3)], 0, "ground");
        for (let j = 0; j < 3; j++) B(sx - w / 3 + (j * w) / 3 + w / 6, 0.095, rz + (j % 2 ? 0.04 : -0.03), w / 4, 0.05, w / 4, goods(j + 4), 0, "cone");
        B(sx + w / 2 - 0.03, 0.09, rz + face * 0.1, 0.05, 0.04, 0.05, 0xadb5bd, 0, "cyl");
      }
    }
  }
  // A few shade trees where the aisles meet.
  for (let k = 0; k < Math.max(1, Math.floor((W * D) / 6)); k++) tree(h(900 + k) * (W - 1), 0.5 + h(950 + k) * (D - 2), 0.45, h(990 + k));
}
