// Out in the open: rooftop terraces and gardens, helipads, the hotel pool deck, the station
// platform, the top of the dam, the oil rig's deck, and spots at street level in parks and
// plazas. These stand in the real city (so the view all round is the real city), built in
// metres and scaled down to city size by the caller. Also the balloon basket you ride in.

import * as THREE from "three";
import { sign, wicker, Sheet } from "./interior-art";
import { Kit, pickOf, rngFrom, shadeHex, shadowMesh, type Rng } from "./kit";
import type { Spot } from "./figures";
import type { Block } from "./interact";
import type { Theme } from "./levels";
import type { RoomItem, View } from "./interiors";

export type Deck = {
  /** In metres, centred on the spot, floor at y = 0 (scale it down to city size). */
  group: THREE.Group;
  views: View[];
  spots: Spot[];
  /** Every seat in a fixed order, things to use, where furniture stands, and the walkable size. */
  seats: Spot[];
  items: RoomItem[];
  blocks: Block[];
  w: number;
  d: number;
  setNight(n: number): void;
  dispose(): void;
};

type Ctx = { k: Kit; rnd: Rng; w: number; d: number; spots: Spot[]; views: View[]; sheet: Sheet; items: RoomItem[] };

function itemAt(x: Ctx, kind: RoomItem["kind"], label: string, px: number, pz: number, r = 0.8) {
  const p = x.k.world(px, 0, pz);
  x.items.push({ kind, label, x: p.x, y: p.y, z: p.z, r });
}

/** An archery target on a stand, with a bow rack. */
function archery(x: Ctx, px: number, pz: number, ry: number) {
  const { k } = x;
  k.at(px, 0, pz, ry, () => {
    for (const sx of [-0.4, 0.4]) k.box(sx, 0, 0.2, 0.06, 1.5, 0.06, 0x8f6b4a, { rx: -0.2 });
    k.cyl(0, 1.0, 0, 0.5, 0.5, 0.12, 0xe9d8a6, 20, { rx: Math.PI / 2 });
    for (const [r, c] of [[0.42, 0xffffff], [0.32, 0x1b1b1b], [0.22, 0x1c7ed6], [0.13, 0xe03131], [0.05, 0xffd43b]] as const) k.cyl(0, 1.0, 0.125, r, r, 0.01, c, 20, { rx: Math.PI / 2, noAo: true });
    k.box(1.0, 0, -0.6, 0.5, 1.0, 0.1, 0x6b4f37);
    k.shadow(0, 0, 1.2, 0.8, 0.25);
  });
  itemAt(x, "archery", "Archery", px + Math.sin(ry) * 2.2, pz + Math.cos(ry) * 2.2, 0.9);
}

const DECK_WOOD = [0xb08a62, 0x9c7652, 0xc29a6d, 0x8f6b4a];
const LEAVES = [0x4f8a5b, 0x5f9e6a, 0x3f7a4f, 0x6aa86f];

function spotAt(x: Ctx, px: number, pz: number, ry: number, pose: Spot["pose"] = "stand", seat?: number) {
  const p = x.k.world(px, 0, pz);
  x.spots.push({ x: p.x, z: p.z, ry: x.k.worldYaw(ry), pose, y: pose === "sit" ? seat ?? 0.42 : 0 });
}

function planter(x: Ctx, px: number, pz: number, w: number, d: number, color: number, crop = false) {
  const { k, rnd } = x;
  k.box(px, 0, pz, w, 0.55, d, color);
  k.box(px, 0.55, pz, w - 0.1, 0.02, d - 0.1, 0x4a3b2c);
  const n = Math.max(2, Math.round((w * d) / 0.25));
  for (let i = 0; i < n; i++) {
    const lx = px + (rnd() - 0.5) * (w - 0.3);
    const lz = pz + (rnd() - 0.5) * (d - 0.3);
    if (crop) {
      k.leafy(lx, 0.62, lz, 0.14 + rnd() * 0.06, pickOf(rnd, LEAVES), { sy: 0.7 });
      if (rnd() < 0.3) k.ball(lx, 0.72, lz, 0.045, pickOf(rnd, [0xe5484d, 0xf5a524, 0xffd43b]), { w: 6, h: 5 });
    } else k.leafy(lx, 0.66, lz, 0.2 + rnd() * 0.12, pickOf(rnd, LEAVES), { sy: 0.85, detail: 1 });
  }
  k.shadow(px, pz, w + 0.4, d + 0.4, 0.3);
}

function lounger(x: Ctx, px: number, pz: number, ry: number, towel: number) {
  const { k } = x;
  k.at(px, 0, pz, ry, () => {
    k.box(0, 0.22, 0.1, 0.7, 0.06, 1.5, 0xf1efea);
    for (const sx of [-0.3, 0.3]) for (const sz of [-0.55, 0.75]) k.box(sx, 0, sz, 0.05, 0.22, 0.05, 0xd9d3c7);
    k.box(0, 0.3, -0.75, 0.7, 0.06, 0.65, 0xf1efea, { rx: 0.7 });
    k.soft(0, 0.28, 0.25, 0.6, 0.04, 1.1, towel, 0.02);
    k.shadow(0, 0, 0.9, 1.9, 0.25);
    spotAt(x, 0, 0.1, Math.PI, "sit", 0.3);
  });
}

function parasol(x: Ctx, px: number, pz: number, color: number) {
  const { k } = x;
  k.cyl(px, 0, pz, 0.25, 0.28, 0.06, 0x495057, 12);
  k.cyl(px, 0.06, pz, 0.025, 0.025, 2.3, 0xf1efea, 6);
  k.cyl(px, 2.0, pz, 0.02, 1.35, 0.45, color, 12, { noAo: true });
  k.cyl(px, 1.98, pz, 1.36, 1.36, 0.05, shadeHex(color, 0.15), 12, { noAo: true, open: true });
}

function bistro(x: Ctx, px: number, pz: number, metal: number) {
  const { k } = x;
  k.cyl(px, 0, pz, 0.2, 0.22, 0.03, metal, 12);
  k.cyl(px, 0.03, pz, 0.025, 0.025, 0.7, metal, 6);
  k.cyl(px, 0.72, pz, 0.38, 0.38, 0.03, 0xf1efea, 18);
  for (const side of [-1, 1]) {
    k.at(px + side * 0.6, 0, pz, side < 0 ? Math.PI / 2 : -Math.PI / 2, () => {
      for (const sx of [-0.18, 0.18]) for (const sz of [-0.16, 0.16]) k.cyl(sx, 0, sz, 0.015, 0.015, 0.44, metal, 5);
      k.box(0, 0.44, 0, 0.42, 0.04, 0.4, metal);
      k.box(0, 0.48, -0.19, 0.42, 0.4, 0.03, metal, { rx: -0.1 });
      spotAt(x, 0, 0.02, 0, "sit", 0.46);
    });
  }
  k.shadow(px, pz, 1.6, 0.9, 0.25);
}

function acUnit(x: Ctx, px: number, pz: number, ry = 0) {
  const { k } = x;
  k.at(px, 0, pz, ry, () => {
    k.box(0, 0, 0, 1.2, 0.9, 0.8, 0xdfe3e8);
    k.cyl(0, 0.9, 0, 0.32, 0.32, 0.02, 0x495057, 16);
    k.box(0, 0.08, 0.41, 1.1, 0.6, 0.01, 0xadb5bd, { noAo: true });
    k.shadow(0, 0, 1.5, 1.1, 0.3);
  });
}

function waterTank(x: Ctx, px: number, pz: number) {
  const { k } = x;
  for (const [lx, lz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) k.box(px + lx, 0, pz + lz, 0.08, 1.0, 0.08, 0x6b4f37);
  k.cyl(px, 1.0, pz, 0.85, 0.85, 1.4, 0x9c7652, 18);
  k.cyl(px, 2.4, pz, 0.1, 0.9, 0.35, 0x6b4f37, 18);
  for (const y of [1.3, 1.9]) k.ring(px, y, pz, 0.86, 0.03, 0x495057, { rx: Math.PI / 2 });
  k.shadow(px, pz, 2.0, 2.0, 0.3);
}

/** Lights strung in loops between posts (glow at night). */
function stringLights(x: Ctx, pts: [number, number][], h = 2.5) {
  const { k } = x;
  for (const [px, pz] of pts) k.cyl(px, 0, pz, 0.04, 0.05, h, 0x2b2b2b, 6);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const n = Math.max(4, Math.round(Math.hypot(bx - ax, bz - az) / 0.45));
    for (let j = 1; j < n; j++) {
      const t = j / n;
      const sag = Math.sin(t * Math.PI) * 0.35;
      k.ball(ax + (bx - ax) * t, h - sag, az + (bz - az) * t, 0.05, 0xffe1a1, { layer: "glow", w: 6, h: 4 });
    }
  }
}

function railing(x: Ctx, w: number, d: number, glass: boolean, color: number) {
  const { k } = x;
  const H = 1.05;
  const sides: [number, number, number, number][] = [
    [0, -d / 2, w, 0],
    [0, d / 2, w, 0],
    [-w / 2, 0, d, Math.PI / 2],
    [w / 2, 0, d, Math.PI / 2],
  ];
  for (const [cx, cz, len, ry] of sides) {
    k.at(cx, 0, cz, ry, () => {
      if (glass) {
        k.box(0, 0, 0, len, 0.12, 0.12, color);
        k.box(0, H - 0.04, 0, len + 0.05, 0.05, 0.08, color);
        k.box(0, 0.12, 0, len, H - 0.16, 0.02, 0xd6e9f5, { layer: "glass" });
        for (let p = 0; p <= Math.round(len / 1.6); p++) k.box(-len / 2 + (p * len) / Math.max(1, Math.round(len / 1.6)), 0, 0, 0.05, H, 0.06, color);
      } else {
        k.box(0, 0, 0, len + 0.25, H, 0.25, color);
        k.box(0, H, 0, len + 0.3, 0.06, 0.32, shadeHex(color, -0.15));
      }
    });
  }
}

function boards(x: Ctx, w: number, d: number, colors: number[]) {
  const { k, rnd } = x;
  const n = Math.max(4, Math.round(w / 0.16));
  for (let i = 0; i < n; i++) {
    const px = -w / 2 + (w / n) * (i + 0.5);
    k.box(px, 0, 0, w / n - 0.012, 0.05, d, shadeHex(pickOf(rnd, colors), (rnd() - 0.5) * 0.08), { noAo: true });
  }
}

function roofDeck(x: Ctx, theme: Theme) {
  const { k, rnd, w, d } = x;
  const W = w;
  const D = d;
  if (theme === "roofTerrace") {
    const iw = W - 0.6;
    const id = D - 0.6;
    boards(x, iw, id, DECK_WOOD);
    railing(x, W - 0.3, D - 0.3, true, 0x2b2f33);
    const big = W > 5.5;
    lounger(x, -iw / 2 + 0.7, -id / 2 + 1.2, Math.PI, pickOf(rnd, [0x4dabf7, 0xffd43b, 0xf783ac]));
    if (big) lounger(x, -iw / 2 + 1.6, -id / 2 + 1.2, Math.PI, pickOf(rnd, [0x69db7c, 0xff922b]));
    parasol(x, -iw / 2 + (big ? 1.15 : 0.7), -id / 2 + 2.3, pickOf(rnd, [0xf1efea, 0xe5484d, 0x2f6d6a, 0xe3b04b]));
    bistro(x, iw / 2 - 1.2, id / 2 - 1.2, 0x2b2f33);
    planter(x, iw / 2 - 0.35, -id / 2 + 1.0, 0.5, 1.6, 0x6b5440);
    planter(x, -iw / 2 + 0.35, id / 2 - 1.0, 0.5, 1.4, 0x6b5440);
    stringLights(x, [[-iw / 2 + 0.2, id / 2 - 0.2], [0, id / 2 - 0.3], [iw / 2 - 0.2, id / 2 - 0.2], [iw / 2 - 0.2, -id / 2 + 0.2]]);
    if (big) {
      acUnit(x, iw / 2 - 1.0, -id / 2 + 2.6);
      if (W > 6.5) waterTank(x, -iw / 2 + 1.3, id / 2 - 2.0);
    }
    spotAt(x, 0.6, -id / 2 + 0.6, Math.PI);
    spotAt(x, iw / 2 - 0.6, 0.3, -Math.PI / 2);
    itemAt(x, "photo", "Photo spot", 0, -id / 2 + 0.7);
    if (big && rnd() < 0.6) archery(x, -iw / 2 + 0.8, 0.4, Math.PI / 2);
    // From a back corner looking across the deck and out over the city.
    x.views.push(
      { x: iw / 2 - 0.8, z: id / 2 - 0.8, yaw: Math.atan2(iw / 2 - 0.8 + iw / 2, id / 2 - 0.8 + id / 2), pitch: -0.2 },
      { x: -iw / 2 + 0.8, z: id / 2 - 0.8, yaw: Math.atan2(-(iw / 2), id), pitch: -0.2 },
      { x: 0, z: 0, yaw: Math.PI, pitch: -0.35 },
    );
    return;
  }
  if (theme === "roofGarden") {
    const iw = W - 0.6;
    const id = D - 0.6;
    k.box(0, 0, 0, iw, 0.04, id, 0xc9c4b8, { noAo: true });
    railing(x, W - 0.3, D - 0.3, false, 0xd9d3c7);
    // Raised beds with vegetables, a path of boards between them.
    k.at(0, 0.04, 0, 0, () => boards(x, 1.0, id - 0.4, DECK_WOOD));
    for (const sx of [-1, 1]) {
      const n = Math.max(1, Math.floor((id - 1.2) / 1.6));
      for (let i = 0; i < n; i++) planter(x, sx * (0.6 + 0.6), -id / 2 + 1.0 + i * 1.6, 1.1, 1.3, 0x7a5a3e, true);
    }
    // A pergola with a bench.
    const px = -iw / 2 + 1.0;
    for (const [lx, lz] of [[-0.6, -0.8], [0.6, -0.8], [-0.6, 0.8], [0.6, 0.8]]) k.box(px + lx, 0, lz, 0.1, 2.3, 0.1, 0x6b5440);
    for (let b = 0; b < 6; b++) k.box(px, 2.3, -0.9 + b * 0.36, 1.5, 0.08, 0.06, 0x6b5440);
    for (let l = 0; l < 6; l++) k.leafy(px + (rnd() - 0.5) * 1.3, 2.4, (rnd() - 0.5) * 1.8, 0.25, pickOf(rnd, LEAVES), { sy: 0.5 });
    k.box(px, 0, 0, 0.45, 0.45, 1.4, 0x8f6b4a);
    spotAt(x, px, -0.3, Math.PI / 2, "sit", 0.45);
    spotAt(x, px, 0.4, Math.PI / 2, "sit", 0.45);
    if (iw > 5) acUnit(x, iw / 2 - 0.9, id / 2 - 0.9);
    if (iw > 5.5) waterTank(x, iw / 2 - 1.0, -id / 2 + 1.2);
    else for (let s = 0; s < 3; s++) k.box(iw / 2 - 0.6, 0.3, -id / 2 + 0.8 + s * 0.9, 0.9, 0.04, 0.7, 0x1c3f6e, { rx: 0.3 });
    stringLights(x, [[-iw / 2 + 0.2, -id / 2 + 0.2], [iw / 2 - 0.2, -id / 2 + 0.2]]);
    spotAt(x, 0, -id / 2 + 0.6, Math.PI);
    spotAt(x, 0.2, id / 2 - 0.6, 0);
    itemAt(x, "photo", "Photo spot", 0.4, -id / 2 + 0.8);
    x.views.push(
      { x: 0, z: id / 2 - 0.6, yaw: 0, pitch: -0.2 },
      { x: iw / 2 - 0.7, z: id / 2 - 0.7, yaw: Math.PI * 0.25, pitch: -0.22 },
      { x: -iw / 2 + 2.2, z: -id / 2 + 0.7, yaw: Math.PI * 0.75, pitch: -0.3 },
    );
    return;
  }
  if (theme === "helipad") {
    k.box(0, 0, 0, W - 0.3, 0.04, D - 0.3, 0x6c737b, { noAo: true });
    railing(x, W - 0.3, D - 0.3, false, 0x9aa1a8);
    const r = Math.min(W, D) / 2 - 1.0;
    k.cyl(0, 0.04, 0, r, r, 0.03, 0x3a3f45, 32);
    k.ring(0, 0.075, 0, r * 0.82, 0.08, 0xffd43b, { rx: Math.PI / 2 });
    k.box(-r * 0.25, 0.07, 0, 0.3, 0.01, r * 0.9, 0xffffff, { noAo: true });
    k.box(r * 0.25, 0.07, 0, 0.3, 0.01, r * 0.9, 0xffffff, { noAo: true });
    k.box(0, 0.07, 0, r * 0.5, 0.01, 0.3, 0xffffff, { noAo: true });
    for (let l = 0; l < 12; l++) {
      const a = (l / 12) * Math.PI * 2;
      k.ball(Math.cos(a) * r, 0.1, Math.sin(a) * r, 0.06, l % 2 ? 0x51cf66 : 0xffd43b, { layer: "glow", w: 6, h: 4 });
    }
    // Windsock and the stair house.
    const wx = W / 2 - 0.5;
    const wz = D / 2 - 0.5;
    k.cyl(wx, 0, wz, 0.03, 0.04, 2.6, 0xe9ecef, 6);
    k.cyl(wx + 0.45, 2.45, wz, 0.12, 0.2, 0.9, 0xff7a1a, 10, { rz: Math.PI / 2 + 0.25, open: true });
    k.box(-W / 2 + 1.0, 0, D / 2 - 0.9, 1.5, 2.4, 1.2, 0xdfe3e8);
    k.box(-W / 2 + 1.0, 0, D / 2 - 1.51, 0.8, 2.0, 0.02, 0x495057, { noAo: true });
    spotAt(x, -W / 2 + 1.0, D / 2 - 2.1, Math.PI);
    spotAt(x, W / 2 - 1.0, -D / 2 + 1.0, Math.PI * 0.75);
    itemAt(x, "photo", "Photo on the helipad", 0, 0, 1.2);
    x.views.push({ x: -W / 2 + 1.0, z: D / 2 - 2.0, yaw: Math.PI * 0.15, pitch: -0.28 }, { x: W / 2 - 0.9, z: -D / 2 + 0.9, yaw: Math.PI * 0.75 + Math.PI, pitch: -0.3 }, { x: 0, z: 0, yaw: Math.PI, pitch: -0.4 });
    return;
  }
  if (theme === "poolDeck") {
    k.at(0, 0, 0, 0, () => boards(x, W - 0.4, D - 0.4, [0xd9c7a7, 0xcdb894, 0xe3d3b6]));
    railing(x, W - 0.2, D - 0.2, true, 0xf1efea);
    // The pool itself (a water mesh is added by the caller at poolRect).
    k.box(0.4, 0, 0.6, 2.4, 0.09, 4.6, 0xf1efea);
    for (let l = 0; l < 3; l++) lounger(x, -W / 2 + 0.75, -1.9 + l * 1.15, Math.PI / 2, pickOf(rnd, [0x4dabf7, 0xffffff, 0xffd43b, 0x63e6be]));
    parasol(x, -W / 2 + 0.75, -2.5 + 1.15 * 1.5, pickOf(rnd, [0xf1efea, 0x2f6d6a, 0xe3b04b]));
    for (const pz of [-D / 2 + 0.6, D / 2 - 0.6]) {
      k.cyl(W / 2 - 0.6, 0, pz, 0.32, 0.26, 0.6, 0xf1efea, 14);
      k.cyl(W / 2 - 0.6, 0.6, pz, 0.04, 0.05, 1.5, 0x7a6248, 6);
      for (let f = 0; f < 7; f++) {
        const a = (f / 7) * Math.PI * 2;
        k.box(W / 2 - 0.6 + Math.sin(a) * 0.45, 2.05, pz + Math.cos(a) * 0.45, 0.16, 0.02, 0.85, pickOf(rnd, LEAVES), { ry: a, rx: 0.5, layer: "foliage" });
      }
    }
    stringLights(x, [[-W / 2 + 0.3, -D / 2 + 0.3], [W / 2 - 0.3, -D / 2 + 0.3]], 2.6);
    spotAt(x, 1.9, -D / 2 + 1.3, Math.PI);
    spotAt(x, -0.7, D / 2 - 0.8, 0.3);
    itemAt(x, "photo", "Poolside photo", 1.6, D / 2 - 1.0);
    // Along the pool and out over the city (the hotel tower stands to the west).
    x.views.push(
      { x: 0.3, z: D / 2 - 0.7, yaw: -0.25, pitch: -0.22 },
      { x: 0.3, z: -D / 2 + 0.8, yaw: Math.PI + 0.25, pitch: -0.22 },
      { x: -W / 2 + 1.0, z: 2.9, yaw: -Math.PI / 2 - 0.4, pitch: -0.2 },
    );
    return;
  }
  if (theme === "platform") {
    // Benches, a sign with the station's name and a timetable, along the platform (along x).
    for (const bx of [-2.4, 2.4]) {
      k.box(bx, 0, 0.2, 1.6, 0.45, 0.45, 0x8f6b4a);
      for (const s of [-0.4, 0.4]) spotAt(x, bx + s, 0.2, 0, "sit", 0.46);
    }
    k.box(0, 0, 0.45, 0.06, 2.6, 0.06, 0x495057);
    k.box(0, 2.1, 0.45, 2.2, 0.45, 0.06, 0x1971c2);
    k.box(4.2, 0, 0.5, 0.5, 1.6, 0.08, 0x495057);
    k.box(4.2, 1.0, 0.45, 0.45, 0.55, 0.01, 0xfff3bf, { layer: "glow", noAo: true });
    spotAt(x, -1.0, -0.2, Math.PI * 0.5);
    spotAt(x, 1.2, -0.3, -Math.PI * 0.5);
    x.views.push({ x: -3.5, z: -0.1, yaw: -Math.PI / 2, pitch: -0.1 }, { x: 3.5, z: -0.1, yaw: Math.PI / 2, pitch: -0.1 }, { x: 0, z: 0.1, yaw: Math.PI, pitch: -0.18 });
    return;
  }
  if (theme === "damTop" || theme === "rigDeck") {
    for (const side of [-1, 1]) {
      k.box(0, 0, side * (D / 2 - 0.1), W, 1.05, 0.08, 0x9aa1a8);
      for (let p = 0; p < Math.floor(W / 3); p++) {
        const lx = -W / 2 + 1.5 + p * 3;
        k.box(lx, 0, side * (D / 2 - 0.1), 0.08, 1.1, 0.12, 0x6c737b);
        if (theme === "damTop" && p % 2 === 0) {
          k.cyl(lx, 0, side * (D / 2 - 0.25), 0.05, 0.06, 3.0, 0x495057, 6);
          k.ball(lx, 3.0, side * (D / 2 - 0.45), 0.12, 0xfff1d6, { layer: "glow" });
        }
      }
    }
    if (theme === "rigDeck") {
      for (let c = 0; c < 4; c++) k.box(-W / 2 + 1 + c * 1.1, 0, -D / 2 + 1.0, 1.0, 0.8, 0.8, pickOf(rnd, [0xe5484d, 0x1971c2, 0xf08c00, 0x2f9e44]));
      for (let p = 0; p < 3; p++) k.cyl(0, 0.3 + p * 0.25, D / 2 - 0.9, 0.1, 0.1, W - 1, 0x868e96, 10, { rz: Math.PI / 2 });
    }
    spotAt(x, 1.2, -D / 2 + 0.5, Math.PI);
    spotAt(x, -1.5, D / 2 - 0.5, 0);
    x.views.push({ x: -W / 2 + 1.0, z: 0, yaw: -Math.PI / 2, pitch: -0.2 }, { x: W / 2 - 1.0, z: 0, yaw: Math.PI / 2, pitch: -0.2 });
    return;
  }
}

/** A rooftop / terrace / platform / deck, w × d metres. */
export function createDeck(theme: Theme, key: string, w: number, d: number): Deck & { pool: THREE.Mesh | null } {
  const rnd = rngFrom(key);
  const k = new Kit();
  const sheet = new Sheet(256);
  const x: Ctx = { k, rnd, w, d, spots: [], views: [], sheet, items: [] };
  roofDeck(x, theme);
  const tex = sheet.finish();
  const mats = {
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    foliage: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    glass: new THREE.MeshBasicMaterial({ color: 0xd6e9f5, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    tex: new THREE.MeshLambertMaterial({ vertexColors: true, map: tex }),
  };
  const group = k.build(mats);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name !== "glass" && o.name !== "glow") {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  const sh = shadowMesh(k.shadows);
  if (sh) group.add(sh);
  let pool: THREE.Mesh | null = null;
  const poolMat = new THREE.MeshPhongMaterial({ color: 0x3fb5e8, shininess: 90, specular: 0xffffff, emissive: 0x0b4f7a, emissiveIntensity: 0.15 });
  if (theme === "poolDeck") {
    pool = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.02, 4.2).translate(0, 0.09, 0), poolMat);
    pool.position.set(0.4, 0, 0.6);
    group.add(pool);
  }
  if (!x.views.length) x.views.push({ x: 0, z: 0, yaw: 0, pitch: -0.25 });
  for (let s = x.spots.length; s < 5; s++) {
    const a = rnd() * Math.PI * 2;
    x.spots.push({ x: Math.cos(a) * w * 0.25, z: Math.sin(a) * d * 0.25, ry: a + Math.PI, pose: "stand", y: 0 });
  }
  const seats = x.spots.filter((sp) => sp.pose === "sit");
  const blocks: Block[] = k.shadows.map((b) => ({ x: b.x, z: b.z, w: b.w - 0.15, d: b.d - 0.15, ry: b.ry }));
  const clear = x.spots.filter((sp) => x.views.every((v) => Math.hypot(sp.x - v.x, sp.z - v.z) > 2.0));
  return {
    group,
    pool,
    views: x.views,
    seats,
    items: x.items,
    blocks,
    w: Math.max(1, w - 0.8),
    d: Math.max(1, d - 0.8),
    spots: [...(clear.length >= 3 ? clear : x.spots)].sort(() => rnd() - 0.5),
    setNight(n: number) {
      mats.glow.color.setScalar(0.75 + 0.6 * n);
      poolMat.emissiveIntensity = 0.15 + 0.6 * n;
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const m of Object.values(mats)) m.dispose();
      if (sh) (sh.material as THREE.Material).dispose();
      poolMat.dispose();
      tex.dispose();
    },
  };
}

/** A spot at street level: a couple of benches maybe; people standing around chatting. */
export function createOpenAir(theme: Theme, key: string): Deck {
  const rnd = rngFrom(key);
  const k = new Kit();
  const x: Ctx = { k, rnd, w: 4, d: 4, spots: [], views: [], sheet: new Sheet(64), items: [] };
  if (theme === "park" || theme === "pond" || theme === "plaza") {
    k.at(1.6, 0, -1.2, -0.6, () => {
      k.box(0, 0, 0, 1.5, 0.45, 0.45, 0x8f6b4a);
      k.box(0, 0.45, -0.2, 1.5, 0.4, 0.06, 0x8f6b4a, { rx: -0.15 });
      for (const sx of [-0.65, 0.65]) k.box(sx, 0, 0, 0.06, 0.45, 0.45, 0x2b2b2b);
      spotAt(x, -0.35, 0.02, 0, "sit", 0.45);
      spotAt(x, 0.35, 0.02, 0, "sit", 0.45);
    });
  }
  if (theme === "park" || theme === "plaza" || theme === "pond" || theme === "waterpark") itemAt(x, "photo", theme === "waterpark" ? "Splash photo" : "Photo spot", -1.4, -1.0);
  if (theme === "funfair") archery(x, -1.8, 1.4, 0.4);
  if (theme === "waterpark") {
    // Loungers by the pool.
    for (let l = 0; l < 3; l++) {
      k.at(1.2, 0, -1.0 + l * 1.0, -Math.PI / 2, () => {
        k.box(0, 0.22, 0.1, 0.7, 0.06, 1.5, 0xf1efea);
        k.box(0, 0.3, -0.75, 0.7, 0.06, 0.65, 0xf1efea, { rx: 0.7 });
        k.soft(0, 0.28, 0.25, 0.6, 0.04, 1.1, [0x4dabf7, 0xffd43b, 0xff6b6b][l], 0.02);
        spotAt(x, 0, 0.1, Math.PI, "sit", 0.3);
      });
    }
  }
  if (theme === "market") {
    for (let c = 0; c < 3; c++) k.box(-1.5 + c * 0.7, 0, 1.4, 0.55, 0.4, 0.4, pickOf(rnd, [0x8f6b4a, 0x6b5440]));
    for (let f = 0; f < 10; f++) k.ball(-1.5 + (f % 3) * 0.7 + (rnd() - 0.5) * 0.3, 0.45, 1.4 + (rnd() - 0.5) * 0.2, 0.07, pickOf(rnd, [0xe5484d, 0xf5a524, 0x69db7c, 0xffd43b]), { w: 6, h: 5 });
  }
  // People standing about in twos and threes.
  const groups = 2 + Math.floor(rnd() * 2);
  for (let g = 0; g < groups; g++) {
    const a = rnd() * Math.PI * 2;
    const r = 2.6 + rnd() * 1.6;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const n = 2 + Math.floor(rnd() * 2);
    for (let s = 0; s < n; s++) {
      const b = (s / n) * Math.PI * 2 + rnd();
      const px = cx + Math.cos(b) * 0.5;
      const pz = cz + Math.sin(b) * 0.5;
      x.spots.push({ x: px, z: pz, ry: Math.atan2(cx - px, cz - pz), pose: "stand", y: 0 });
    }
  }
  const mats = { solid: new THREE.MeshLambertMaterial({ vertexColors: true }) };
  const group = k.build(mats);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  const yaw0 = rnd() * Math.PI * 2;
  x.views.push({ x: 0, z: 0, yaw: yaw0, pitch: -0.08 }, { x: 0.8, z: 0.8, yaw: yaw0 + 2.1, pitch: -0.08 }, { x: -0.8, z: 0.4, yaw: yaw0 + 4.2, pitch: -0.12 });
  // Nobody stands right in front of where you look from.
  const clear = x.spots.filter((sp) => x.views.every((v) => Math.hypot(sp.x - v.x, sp.z - v.z) > 1.8));
  return {
    group,
    views: x.views,
    spots: clear.length >= 3 ? clear : x.spots,
    seats: x.spots.filter((sp) => sp.pose === "sit"),
    items: x.items,
    blocks: k.shadows.map((b) => ({ x: b.x, z: b.z, w: b.w - 0.15, d: b.d - 0.15, ry: b.ry })),
    w: 7,
    d: 7,
    setNight() {},
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      mats.solid.dispose();
    },
  };
}

// ---------------------------------------------------------------- the balloon basket

/**
 * The basket you stand in on a balloon ride (metres, floor at y = 0, you in the middle): a
 * wicker basket with a padded leather rim, ropes up to the burner frame, and the burner.
 */
export function createBasket() {
  const sheet = new Sheet(256);
  const weave = sheet.paint(240, 120, (c, w, h) => wicker(c, w, h));
  const tag = sheet.paint(120, 40, (c, w, h) => sign(c, w, h, "Sky Tours", 0x8a6238, 0xfff1d6, { weight: 800 }));
  const tex = sheet.finish();
  const k = new Kit();
  k.floorY = -10;
  const S = 1.5;
  const H = 1.1;
  for (let side = 0; side < 4; side++) {
    k.at(0, 0, 0, (side * Math.PI) / 2, () => {
      k.box(0, 0, -S / 2, S + 0.08, H, 0.08, 0xffffff, { layer: "tex" });
      k.quad(0, H / 2, -S / 2 + 0.042, S, H, 0xdddddd, { layer: "tex" }, weave);
      k.soft(0, H - 0.02, -S / 2, S + 0.2, 0.12, 0.16, 0x4a2e1c, 0.05);
      if (side === 0) k.quad(0, 0.75, -S / 2 + 0.05, 0.6, 0.2, 0xffffff, { layer: "tex" }, tag);
    });
  }
  // Corner poles and the ropes up to the burner frame.
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    k.cyl(cx * (S / 2 - 0.05), H, cz * (S / 2 - 0.05), 0.022, 0.022, 1.15, 0x3a2a1c, 6);
    const top = new THREE.Vector3(cx * 0.32, 3.0, cz * 0.32);
    const bot = new THREE.Vector3(cx * (S / 2 - 0.05), H + 1.15, cz * (S / 2 - 0.05));
    const len = top.distanceTo(bot);
    const mid = top.clone().add(bot).multiplyScalar(0.5);
    const dir = top.clone().sub(bot).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
    k.cyl(mid.x, mid.y - len / 2, mid.z, 0.012, 0.012, len, 0xd9c7a7, 5, { rx: e.x, ry: e.y, rz: e.z, noAo: true });
  }
  // The burner frame and the burner.
  k.box(0, 2.25, 0, 0.9, 0.06, 0.06, 0x495057, { noAo: true });
  k.box(0, 2.25, 0, 0.06, 0.06, 0.9, 0x495057, { noAo: true });
  k.cyl(0, 2.31, 0, 0.16, 0.2, 0.32, 0x868e96, 14, { noAo: true });
  k.cyl(0, 2.1, 0, 0.12, 0.08, 0.15, 0x495057, 10, { noAo: true });
  // Gas bottles in a corner.
  for (const [bx, bz] of [[0.55, 0.55], [-0.55, 0.55]]) {
    k.cyl(bx, 0, bz, 0.13, 0.13, 0.7, 0xdfe3e8, 12);
    k.ball(bx, 0.7, bz, 0.13, 0xdfe3e8, { part: 0.5 });
  }
  const mats = {
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    tex: new THREE.MeshLambertMaterial({ vertexColors: true, map: tex }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  const group = k.build(mats);
  // The floor of the basket.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(S, 0.04, S), new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
  group.add(floor);
  // The burner's flame, which flares up now and then.
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 12).translate(0, 0.45, 0), flameMat);
  flame.position.y = 2.6;
  group.add(flame);
  const hemi = new THREE.HemisphereLight(0xfff6ea, 0x6b5a48, 1.6);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.0);
  sun.position.set(-3, 6, 2);
  const glowLight = new THREE.PointLight(0xffa040, 0, 6, 1.5);
  glowLight.position.set(0, 2.6, 0);
  group.add(hemi, sun, glowLight);
  const all: THREE.Material[] = [...Object.values(mats), floor.material as THREE.Material, flameMat];
  const base = new Map(all.map((m) => [m, { o: m.opacity, t: m.transparent }]));
  let alpha = 1;
  return {
    group,
    update(time: number, night: number) {
      // A long burn every so often, and a little flicker.
      const cycle = time % 9;
      const burn = cycle < 1.6 ? Math.sin((cycle / 1.6) * Math.PI) : 0;
      flame.visible = burn > 0.02;
      flame.scale.set(0.6 + burn * 0.6, 0.3 + burn * (1 + Math.sin(time * 40) * 0.08), 0.6 + burn * 0.6);
      glowLight.intensity = burn * 4;
      hemi.intensity = 1.6 - 1.0 * night;
      sun.intensity = 1.0 * (1 - night) + 0.08;
    },
    setAlpha(a: number) {
      if (a === alpha) return;
      alpha = a;
      for (const m of all) {
        const b = base.get(m)!;
        m.transparent = b.t || a < 0.999;
        m.opacity = b.o * a;
      }
      group.visible = a > 0.002;
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const m of all) m.dispose();
      tex.dispose();
    },
  };
}

export type Basket = ReturnType<typeof createBasket>;
