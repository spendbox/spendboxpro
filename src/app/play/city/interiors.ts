// The insides of buildings. Each room is made up on the spot from the round, the building and
// the floor (so it's the same for everyone, different in every building and every round): a
// shell with windows, a floor, a ceiling, furniture, lamps, plants, rugs and pictures in one
// tasteful colour palette, and places for the regulars to stand and sit.
//
// Rooms are built in metres with the floor at y = 0, centred on the origin, the main windows on
// the north wall (-z). The city view draws them as an overlay on top of the real city (which
// shows through the window openings), turned so the main windows face the city centre.

import * as THREE from "three";
import { books, board, cityMap, dashboard, departures, floorTexture, painting, products, rug, sign, tvPicture, ART_STYLES, RUG_STYLES, Sheet, type FloorStyle } from "./interior-art";
import { blobTexture, Kit, mixHex, pickOf, rngFrom, shadeHex, shadowMesh, type Rng, type UvRect } from "./kit";
import type { Spot } from "./figures";
import type { Theme } from "./levels";

export type View = { x: number; z: number; yaw: number; pitch: number };

export type InteriorInfo = {
  theme: Theme;
  /** Seed text: the same text always gives the same room. */
  key: string;
  floor: number;
  /** Building / city names for signs. */
  name: string;
  city: string;
  places: string[];
  /** A smaller version (the clock tower's hall) or a station concourse (departure board). */
  variant?: "small" | "station";
};

export type Interior = {
  /** The room, in metres (turn it to face the city). */
  group: THREE.Group;
  views: View[];
  spots: Spot[];
  /** Room size (metres), for keeping things inside. */
  w: number;
  d: number;
  setNight(n: number): void;
  setAlpha(a: number): void;
  dispose(): void;
};

// ---------------------------------------------------------------- palettes

type Pal = {
  wall: number;
  accentWall: number;
  trim: number;
  ceiling: number;
  floor: [FloorStyle, number, number];
  wood: number;
  fabric: number;
  fabric2: number;
  accent: number;
  metal: number;
  art: number[];
  frame: number;
  leaves: number[];
  pot: number;
};

const LEAVES = [0x4f8a5b, 0x5f9e6a, 0x3f7a4f, 0x6aa86f, 0x4a7f62];

const HOME: Pal[] = [
  { wall: 0xf3efe8, accentWall: 0xdfe5e2, trim: 0xffffff, ceiling: 0xfbfaf7, floor: ["planks", 0xd8b98f, 0xc49e72], wood: 0xc89f72, fabric: 0xb9c4c9, fabric2: 0xe8e1d6, accent: 0xd9825b, metal: 0x2f3236, art: [0xd9825b, 0x9cb0a1, 0xe8c07d, 0x3f5a6b], frame: 0xffffff, leaves: LEAVES, pot: 0xe9e2d6 },
  { wall: 0xefe5d6, accentWall: 0x2f6d6a, trim: 0xf7f1e6, ceiling: 0xfaf6ef, floor: ["parquet", 0xa77349, 0x86583a], wood: 0x7f5233, fabric: 0x2f6d6a, fabric2: 0xe3b04b, accent: 0xc8553d, metal: 0x2b2b2b, art: [0xe3b04b, 0x2f6d6a, 0xc8553d, 0xf2e8cf], frame: 0x2b2b2b, leaves: LEAVES, pot: 0xc8553d },
  { wall: 0xe9ece3, accentWall: 0x8fa98b, trim: 0xffffff, ceiling: 0xfbfbf8, floor: ["planks", 0xcfb18b, 0xb99670], wood: 0xb48a60, fabric: 0x8fa98b, fabric2: 0xf0e8dc, accent: 0xd9a37a, metal: 0x3a3a3a, art: [0x8fa98b, 0xd9a37a, 0xf2d6a2, 0x4e6e5d], frame: 0xb48a60, leaves: LEAVES, pot: 0xf0e8dc },
  { wall: 0xf1ede6, accentWall: 0x2e4057, trim: 0xffffff, ceiling: 0xfaf8f4, floor: ["parquet", 0xb8875a, 0x9c6f45], wood: 0x6f4a2f, fabric: 0x2e4057, fabric2: 0xd8cfc0, accent: 0xc9a227, metal: 0xb08d57, art: [0x2e4057, 0xc9a227, 0xe8dcc8, 0x8c5a3c], frame: 0xb08d57, leaves: LEAVES, pot: 0x2e4057 },
  { wall: 0xf6ebe6, accentWall: 0x2f6650, trim: 0xffffff, ceiling: 0xfdf9f6, floor: ["planks", 0xe0c9a6, 0xd2b893], wood: 0xc49a6c, fabric: 0xe2b6a6, fabric2: 0x2f6650, accent: 0x2f6650, metal: 0xc8a96e, art: [0x2f6650, 0xe2b6a6, 0xf2d0a4, 0xb85c4a], frame: 0xc8a96e, leaves: LEAVES, pot: 0xe2b6a6 },
  { wall: 0xf5ece2, accentWall: 0x3e5c76, trim: 0xfffaf3, ceiling: 0xfbf6f0, floor: ["hex", 0xc8714f, 0xb05f40], wood: 0x8c5a3c, fabric: 0xe9dfcf, fabric2: 0x3e5c76, accent: 0x3e5c76, metal: 0x2b2b2b, art: [0xc8714f, 0x3e5c76, 0xe9c46a, 0xf4f1de], frame: 0x2b2b2b, leaves: LEAVES, pot: 0xc8714f },
  { wall: 0xe8e6e2, accentWall: 0x3a3a3c, trim: 0xf4f3f1, ceiling: 0xf7f6f4, floor: ["marble", 0xefefec, 0xc9c9c6], wood: 0x4a3a2e, fabric: 0x3a3a3c, fabric2: 0xd6d2cb, accent: 0xb08d57, metal: 0xb08d57, art: [0x3a3a3c, 0xb08d57, 0xe8e6e2, 0x8a8f94], frame: 0xb08d57, leaves: LEAVES, pot: 0x3a3a3c },
  { wall: 0xeef3f4, accentWall: 0x3d7ea6, trim: 0xffffff, ceiling: 0xfafcfc, floor: ["stone", 0xd9dcd8, 0xc5c9c4], wood: 0xb9926b, fabric: 0x3d7ea6, fabric2: 0xf2efe8, accent: 0xf2c14e, metal: 0x2f3236, art: [0x3d7ea6, 0xf2c14e, 0x9ad1d4, 0xe76f51], frame: 0x2f3236, leaves: LEAVES, pot: 0xf2efe8 },
];

const CORP: Pal[] = [
  { wall: 0xf2f0ec, accentWall: 0x6b4a33, trim: 0xe5e2dc, ceiling: 0xf7f6f3, floor: ["marble", 0xf1efea, 0xcfcac2], wood: 0x6b4a33, fabric: 0x2f3e46, fabric2: 0xc9b79c, accent: 0xb08d57, metal: 0x1f2326, art: [0x2f3e46, 0xb08d57, 0xc9b79c, 0x8a9a9f], frame: 0x1f2326, leaves: LEAVES, pot: 0x2f3236 },
  { wall: 0xeeeae3, accentWall: 0x9a7b5b, trim: 0xe0dbd2, ceiling: 0xf6f4f0, floor: ["stone", 0xe2dccf, 0xcfc5b3], wood: 0x9a7b5b, fabric: 0x5b6b5d, fabric2: 0xe8e1d4, accent: 0x1f1f1f, metal: 0x1f1f1f, art: [0x5b6b5d, 0x1f1f1f, 0xd9c7a7, 0xa9b4a6], frame: 0x1f1f1f, leaves: LEAVES, pot: 0xd9d3c7 },
  { wall: 0xf4f4f2, accentWall: 0xc8a27a, trim: 0xe6e6e3, ceiling: 0xfafaf9, floor: ["terrazzo", 0xe9e6e0, 0xb7a99a], wood: 0xc8a27a, fabric: 0x24527a, fabric2: 0xe8e4dc, accent: 0xe07a5f, metal: 0x2b2d31, art: [0x24527a, 0xe07a5f, 0xf2cc8f, 0x81b29a], frame: 0x2b2d31, leaves: LEAVES, pot: 0xf4f1ea },
  { wall: 0xe9e7e4, accentWall: 0x2b2b2e, trim: 0xd9d6d1, ceiling: 0xf3f2f0, floor: ["marble", 0x5a5a5e, 0x3c3c40], wood: 0x5c4130, fabric: 0x8b2f3c, fabric2: 0xd8cfc3, accent: 0xc9a227, metal: 0xc9a227, art: [0x8b2f3c, 0xc9a227, 0xe8e0d0, 0x2b2b2e], frame: 0xc9a227, leaves: LEAVES, pot: 0x2b2b2e },
];

const OFFICE: Pal[] = [
  { wall: 0xf3f4f2, accentWall: 0x2f6fd1, trim: 0xe3e5e2, ceiling: 0xf7f8f7, floor: ["carpet", 0x7d8691, 0x5f6873], wood: 0xc8a882, fabric: 0x2f6fd1, fabric2: 0xd6dbe0, accent: 0x2f6fd1, metal: 0x2b2f33, art: [0x2f6fd1, 0xf2c14e, 0xe8eef5, 0x8aa1b1], frame: 0x2b2f33, leaves: LEAVES, pot: 0xffffff },
  { wall: 0xf4f3ef, accentWall: 0x2f8f6a, trim: 0xe4e2dc, ceiling: 0xf8f7f4, floor: ["carpet", 0x8a8378, 0x6e675d], wood: 0xb48a60, fabric: 0x2f8f6a, fabric2: 0xe6dfd2, accent: 0x2f8f6a, metal: 0x2b2b2b, art: [0x2f8f6a, 0xe9c46a, 0xf4a261, 0xe6dfd2], frame: 0x2b2b2b, leaves: LEAVES, pot: 0x2f8f6a },
  { wall: 0xf2f1f4, accentWall: 0x6a4c93, trim: 0xe2e1e6, ceiling: 0xf8f8fa, floor: ["carpet", 0x6c6f7d, 0x545767], wood: 0xd8c3a5, fabric: 0x6a4c93, fabric2: 0xdcd6e6, accent: 0xff8c42, metal: 0x2a2a33, art: [0x6a4c93, 0xff8c42, 0xffd166, 0xdcd6e6], frame: 0x2a2a33, leaves: LEAVES, pot: 0xffffff },
  { wall: 0xf5f3ef, accentWall: 0xe07a5f, trim: 0xe6e2da, ceiling: 0xfaf8f5, floor: ["concrete", 0xb9b6b0, 0xa29e97], wood: 0xc19a6b, fabric: 0x3d405b, fabric2: 0xf4f1de, accent: 0xe07a5f, metal: 0x1f1f24, art: [0xe07a5f, 0x3d405b, 0x81b29a, 0xf2cc8f], frame: 0x1f1f24, leaves: LEAVES, pot: 0x3d405b },
];

const LOUNGE: Pal[] = [
  { wall: 0x2c3a35, accentWall: 0x1f2a26, trim: 0x3a4a44, ceiling: 0x6b5a48, floor: ["parquet", 0x6b4a33, 0x553826], wood: 0x4a3226, fabric: 0x2f5d50, fabric2: 0xd9c7a7, accent: 0xc9a227, metal: 0xc9a227, art: [0xc9a227, 0x2f5d50, 0xd9c7a7, 0x8b5e3c], frame: 0xc9a227, leaves: LEAVES, pot: 0x1f2a26 },
  { wall: 0x2a2f3d, accentWall: 0x1d212b, trim: 0x394052, ceiling: 0x5a4a3c, floor: ["planks", 0x5a4232, 0x47331f], wood: 0x3d2c22, fabric: 0x26385a, fabric2: 0xe0d2bc, accent: 0xd4a65a, metal: 0xd4a65a, art: [0xd4a65a, 0x26385a, 0xe0d2bc, 0x8c4a3c], frame: 0xd4a65a, leaves: LEAVES, pot: 0x1d212b },
  { wall: 0x3b2a2c, accentWall: 0x2a1d1f, trim: 0x4a3638, ceiling: 0x6a5240, floor: ["marble", 0x3a3634, 0x2a2624], wood: 0x2f2220, fabric: 0x7a2e3a, fabric2: 0xe2d4c0, accent: 0xc9a227, metal: 0xc9a227, art: [0xc9a227, 0x7a2e3a, 0xe2d4c0, 0x445566], frame: 0xc9a227, leaves: LEAVES, pot: 0x2a1d1f },
  { wall: 0xe9e2d6, accentWall: 0x6b4a33, trim: 0xd9cfbf, ceiling: 0xf1ebe1, floor: ["parquet", 0x8a6040, 0x6e4a30], wood: 0x5c3e2a, fabric: 0x2f5d50, fabric2: 0xf3ead8, accent: 0xc8553d, metal: 0x2b2b2b, art: [0xc8553d, 0x2f5d50, 0xe3b04b, 0xf3ead8], frame: 0x2b2b2b, leaves: LEAVES, pot: 0xc8553d },
];

const CLINIC: Pal = { wall: 0xf4f7f6, accentWall: 0x6cc4b0, trim: 0xe3eae8, ceiling: 0xfafcfb, floor: ["terrazzo", 0xe8ecea, 0xa9bdb8], wood: 0xd8c3a5, fabric: 0x3aa58f, fabric2: 0xe8f1ef, accent: 0x3aa58f, metal: 0x8a959b, art: [0x6cc4b0, 0xa8dadc, 0xf1faee, 0x457b9d], frame: 0xffffff, leaves: LEAVES, pot: 0xffffff };
const POLICE: Pal = { wall: 0xf1f3f6, accentWall: 0x1c3faa, trim: 0xdfe3ea, ceiling: 0xf8f9fb, floor: ["checker", 0xd3d8e0, 0xbfc6d1], wood: 0x8a6a4f, fabric: 0x1c3faa, fabric2: 0xdfe3ea, accent: 0x1c3faa, metal: 0x2b2f38, art: [0x1c3faa, 0xf1f3f6, 0xe5484d, 0xffd43b], frame: 0x2b2f38, leaves: LEAVES, pot: 0x1c3faa };
const GALLERY: Pal[] = [
  { wall: 0xfbfaf8, accentWall: 0x2d3a4a, trim: 0xf0eeea, ceiling: 0xffffff, floor: ["planks", 0x8a6a4c, 0x76583c], wood: 0x6b4f37, fabric: 0x2d3a4a, fabric2: 0xe8e2d8, accent: 0xc8553d, metal: 0x1f1f1f, art: [0xc8553d, 0x2d3a4a, 0xe3b04b, 0x8fa98b, 0xf2e8cf], frame: 0x1f1f1f, leaves: LEAVES, pot: 0xf0eeea },
  { wall: 0xf6f3ee, accentWall: 0x7a2e3a, trim: 0xebe6de, ceiling: 0xffffff, floor: ["concrete", 0xbab5ac, 0xa7a197], wood: 0x9a7b5b, fabric: 0x7a2e3a, fabric2: 0xe8e1d4, accent: 0x24527a, metal: 0x2b2b2b, art: [0x24527a, 0x7a2e3a, 0xe9c46a, 0x81b29a, 0xf4a261], frame: 0xd9c7a7, leaves: LEAVES, pot: 0xebe6de },
];
const LIBRARY: Pal = { wall: 0xe9e0cf, accentWall: 0x2f4a3a, trim: 0xd9ccb4, ceiling: 0xf2ebdf, floor: ["parquet", 0x7d5737, 0x684629], wood: 0x5c3d26, fabric: 0x2f4a3a, fabric2: 0xc7a76c, accent: 0x2f6650, metal: 0xb08d57, art: [0x2f4a3a, 0xc7a76c, 0x8c3b2e, 0x2e4057, 0xd9c7a7], frame: 0xb08d57, leaves: LEAVES, pot: 0x2f4a3a };

// ---------------------------------------------------------------- the room shell

type WallKind = "glass" | "windows" | "band" | "tall" | "solid";
type Room = {
  w: number;
  d: number;
  h: number;
  /** North (-z), east (+x), south (+z), west (-x). */
  walls: [WallKind, WallKind, WallKind, WallKind];
  /** A feature wall (side) painted in the accent colour, or -1. */
  accentSide?: number;
  /** Curtain fabric for windows, or none. */
  curtains?: number;
  /** Window frames. */
  frame?: number;
  /** Ceiling height of window heads (from the top). */
  headDrop?: number;
};

type Ctx = {
  k: Kit;
  sheet: Sheet;
  rnd: Rng;
  pal: Pal;
  room: Room;
  spots: Spot[];
  views: View[];
  /** Warm lights for the evening: where they hang (max two are real lights). */
  lamps: { x: number; y: number; z: number }[];
  info: InteriorInfo;
};

/** Position and turn of a point on the inside face of a wall, u along it (from its middle). */
function onWall(room: Room, side: number, u: number): [number, number, number] {
  switch (side) {
    case 0:
      return [u, -room.d / 2, 0];
    case 1:
      return [room.w / 2, u, -Math.PI / 2];
    case 2:
      return [-u, room.d / 2, Math.PI];
    default:
      return [-room.w / 2, -u, Math.PI / 2];
  }
}
const wallLen = (room: Room, side: number) => (side % 2 === 0 ? room.w : room.d);
/** Draw fn in a wall's frame: x along the wall, y up, z out into the room. */
function atWall(x: Ctx, side: number, u: number, fn: () => void, y = 0) {
  const [px, pz, ry] = onWall(x.room, side, u);
  x.k.at(px, y, pz, ry, fn);
}
/** Which way to turn to look from (fx, fz) towards (tx, tz) (camera yaw). */
const yawTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(-(tx - fx), -(tz - fz));
/** Turn for a piece of furniture at (fx, fz) to face (tx, tz). */
const faceTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, tz - fz);

function windowLayout(kind: WallKind, L: number, h: number, headDrop: number) {
  const open: [number, number][] = [];
  let s = 0;
  let hh = h;
  if (kind === "glass") {
    s = 0.06;
    hh = h - Math.max(0.12, headDrop);
    open.push([-L / 2 + 0.25, L / 2 - 0.25]);
  } else if (kind === "band") {
    s = 0.85;
    hh = h - Math.max(0.3, headDrop);
    open.push([-L / 2 + 0.4, L / 2 - 0.4]);
  } else if (kind === "windows" || kind === "tall") {
    s = kind === "tall" ? 0.5 : 0.85;
    hh = kind === "tall" ? h - 0.6 : Math.min(h - 0.35, 2.3);
    const ww = kind === "tall" ? 1.5 : 1.4;
    const gap = kind === "tall" ? 1.3 : 1.1;
    const n = Math.max(1, Math.floor((L - 0.8 + gap) / (ww + gap)));
    const span = n * ww + (n - 1) * gap;
    for (let k = 0; k < n; k++) {
      const a = -span / 2 + k * (ww + gap);
      open.push([a, a + ww]);
    }
  }
  return { open, s, hh };
}

function shell(x: Ctx) {
  const { k, room, pal } = x;
  const T = 0.25;
  const frame = room.frame ?? pal.metal;
  for (let side = 0; side < 4; side++) {
    const L = wallLen(room, side);
    const kind = room.walls[side];
    const color = side === room.accentSide ? pal.accentWall : pal.wall;
    atWall(x, side, 0, () => {
      const full = L + 2 * T;
      if (kind === "solid") {
        k.box(0, 0, -T / 2, full, room.h, T, color, { noAo: true });
        k.box(0, 0, 0.008, L, 0.09, 0.02, pal.trim, { noAo: true });
        return;
      }
      const { open, s, hh } = windowLayout(kind, L, room.h, room.headDrop ?? 0.15);
      if (s > 0) k.box(0, 0, -T / 2, full, s, T, color, { noAo: true });
      k.box(0, hh, -T / 2, full, room.h - hh, T, color, { noAo: true });
      let prev = -full / 2;
      for (const [a, b] of open) {
        if (a - prev > 0.001) k.box((prev + a) / 2, s, -T / 2, a - prev, hh - s, T, color, { noAo: true });
        prev = b;
      }
      if (full / 2 - prev > 0.001) k.box((prev + full / 2) / 2, s, -T / 2, full / 2 - prev, hh - s, T, color, { noAo: true });
      if (kind !== "glass") k.box(0, 0, 0.008, L, 0.09, 0.02, pal.trim, { noAo: true });
      for (const [a, b] of open) {
        const ow = b - a;
        const mid = (a + b) / 2;
        // Frame round the opening, mullions, the glass, a sill.
        const fz = -T * 0.55;
        k.box(mid, s, fz, ow, 0.05, 0.1, frame, { noAo: true });
        k.box(mid, hh - 0.05, fz, ow, 0.05, 0.1, frame, { noAo: true });
        k.box(a + 0.025, s, fz, 0.05, hh - s, 0.1, frame, { noAo: true });
        k.box(b - 0.025, s, fz, 0.05, hh - s, 0.1, frame, { noAo: true });
        const panes = Math.max(1, Math.round(ow / (kind === "glass" ? 1.7 : 0.8)));
        for (let p = 1; p < panes; p++) k.box(a + (p * ow) / panes, s, fz, 0.045, hh - s, 0.08, frame, { noAo: true });
        if (kind === "tall" || kind === "windows") k.box(mid, s + (hh - s) * 0.7, fz, ow, 0.035, 0.07, frame, { noAo: true });
        k.quad(mid, (s + hh) / 2, fz, ow, hh - s, 0xffffff, { layer: "glass" });
        if (kind !== "glass") k.box(mid, s - 0.035, -T * 0.4, ow + 0.12, 0.035, T * 0.4 + 0.06, pal.trim, { noAo: true });
        // Reveals (the depth of the wall round the window).
        if (room.curtains !== undefined && kind !== "glass") {
          // Soft folded curtains drawn back either side of the window.
          const folds = 4;
          for (const side2 of [-1, 1]) {
            for (let f = 0; f < folds; f++) {
              const cx = (side2 < 0 ? a : b) + side2 * (0.06 + f * 0.09) - side2 * 0.12;
              k.cyl(cx, 0.03, 0.12 + (f % 2) * 0.03, 0.07, 0.075, room.h - 0.22, room.curtains, 10, { noAo: true });
            }
          }
          k.cyl(mid, room.h - 0.19, 0.13, 0.015, 0.015, ow + 1.0, pal.metal, 6, { noAo: true, rz: Math.PI / 2 });
        }
      }
    });
  }
  // The ceiling.
  k.box(0, room.h, 0, room.w + 0.6, 0.12, room.d + 0.6, pal.ceiling, { noAo: true });
}

/** The inside walls with no windows, for pictures and shelves. */
const solidSides = (room: Room) => [0, 1, 2, 3].filter((s) => room.walls[s] === "solid");

// ---------------------------------------------------------------- furniture

function spot(x: Ctx, lx: number, lz: number, ry: number, pose: Spot["pose"], seat?: number) {
  const p = x.k.world(lx, 0, lz);
  x.spots.push({ x: p.x, z: p.z, ry: x.k.worldYaw(ry), pose, y: pose === "sit" ? seat ?? 0.46 : 0 });
}

function sofa(x: Ctx, px: number, pz: number, ry: number, len: number, fabric: number, opts?: { legs?: number; seats?: number; low?: boolean }) {
  const { k } = x;
  const seats = opts?.seats ?? Math.max(2, Math.round(len / 0.75));
  const legs = opts?.legs ?? x.pal.wood;
  k.at(px, 0, pz, ry, () => {
    const d = 0.92;
    for (const sx of [-len / 2 + 0.08, len / 2 - 0.08]) for (const sz of [-d / 2 + 0.08, d / 2 - 0.1]) k.cyl(sx, 0, sz, 0.022, 0.018, 0.12, legs, 8);
    k.soft(0, 0.12, 0, len, 0.2, d, shadeHex(fabric, 0.08), 0.05);
    const sw = (len - 0.3) / seats;
    for (let s = 0; s < seats; s++) k.soft(-len / 2 + 0.15 + sw * (s + 0.5), 0.3, 0.06, sw - 0.02, 0.16, d - 0.22, fabric, 0.06);
    k.soft(0, 0.3, -d / 2 + 0.11, len - 0.04, 0.48, 0.22, shadeHex(fabric, 0.05), 0.07);
    for (let s = 0; s < seats; s++) k.soft(-len / 2 + 0.15 + sw * (s + 0.5), 0.42, -d / 2 + 0.26, sw - 0.06, 0.38, 0.14, fabric, 0.06, { rx: -0.12 });
    for (const side of [-1, 1]) k.soft(side * (len / 2 - 0.08), 0.12, 0, 0.16, 0.5, d, shadeHex(fabric, 0.06), 0.06);
    // A couple of cushions.
    k.soft(-len / 2 + 0.38, 0.45, -d / 2 + 0.38, 0.4, 0.34, 0.12, x.pal.fabric2, 0.06, { rx: -0.25, ry: 0.15 });
    if (len > 1.8) k.soft(len / 2 - 0.38, 0.45, -d / 2 + 0.38, 0.4, 0.34, 0.12, x.pal.accent, 0.06, { rx: -0.25, ry: -0.15 });
    k.shadow(0, 0, len + 0.3, d + 0.3, 0.32);
    for (let s = 0; s < seats; s++) spot(x, -len / 2 + 0.15 + sw * (s + 0.5), 0.02, 0, "sit", 0.44);
  });
}

function armchair(x: Ctx, px: number, pz: number, ry: number, fabric: number) {
  const { k } = x;
  k.at(px, 0, pz, ry, () => {
    for (const sx of [-0.3, 0.3]) for (const sz of [-0.3, 0.28]) k.cyl(sx, 0, sz, 0.02, 0.016, 0.14, x.pal.wood, 8);
    k.soft(0, 0.14, 0, 0.78, 0.26, 0.78, fabric, 0.07);
    k.soft(0, 0.36, -0.29, 0.74, 0.5, 0.2, fabric, 0.08, { rx: -0.1 });
    for (const side of [-1, 1]) k.soft(side * 0.33, 0.3, 0.02, 0.13, 0.26, 0.72, shadeHex(fabric, 0.05), 0.06);
    k.shadow(0, 0, 1, 1, 0.3);
    spot(x, 0, 0.02, 0, "sit", 0.44);
  });
}

function chair(x: Ctx, px: number, pz: number, ry: number, seat: number, frame: number, opts?: { spot?: boolean; stool?: boolean }) {
  const { k } = x;
  k.at(px, 0, pz, ry, () => {
    if (opts?.stool) {
      k.cyl(0, 0, 0, 0.18, 0.2, 0.02, frame, 16);
      k.cyl(0, 0.02, 0, 0.025, 0.025, 0.62, frame, 8);
      k.ring(0, 0.28, 0, 0.16, 0.012, frame, { rx: Math.PI / 2 });
      k.soft(0, 0.64, 0, 0.38, 0.08, 0.38, seat, 0.04);
      k.shadow(0, 0, 0.5, 0.5, 0.25);
      if (opts?.spot !== false) spot(x, 0, 0.0, 0, "sit", 0.68);
      return;
    }
    for (const sx of [-0.19, 0.19]) for (const sz of [-0.18, 0.18]) k.cyl(sx, 0, sz, 0.018, 0.015, 0.44, frame, 6);
    k.soft(0, 0.43, 0, 0.46, 0.06, 0.44, seat, 0.03);
    k.soft(0, 0.48, -0.2, 0.44, 0.42, 0.05, seat, 0.025, { rx: -0.08 });
    k.shadow(0, 0, 0.55, 0.55, 0.22);
    if (opts?.spot !== false) spot(x, 0, 0.02, 0, "sit", 0.46);
  });
}

function officeChair(x: Ctx, px: number, pz: number, ry: number, color: number, withSpot = true) {
  const { k } = x;
  k.at(px, 0, pz, ry, () => {
    for (let a = 0; a < 5; a++) {
      const ang = (a / 5) * Math.PI * 2;
      k.box(Math.sin(ang) * 0.16, 0.04, Math.cos(ang) * 0.16, 0.04, 0.03, 0.32, 0x2b2b2b, { ry: ang });
      k.ball(Math.sin(ang) * 0.3, 0.03, Math.cos(ang) * 0.3, 0.03, 0x1f1f1f, { w: 6, h: 4 });
    }
    k.cyl(0, 0.06, 0, 0.025, 0.025, 0.36, 0x9aa1a8, 8);
    k.soft(0, 0.42, 0, 0.5, 0.08, 0.48, color, 0.035);
    k.soft(0, 0.52, -0.24, 0.46, 0.55, 0.07, color, 0.03, { rx: -0.1 });
    k.shadow(0, 0, 0.7, 0.7, 0.22);
    if (withSpot) spot(x, 0, 0.03, 0, "sit", 0.47);
  });
}

function table(x: Ctx, px: number, pz: number, ry: number, w: number, d: number, top: number, legs: number, opts?: { round?: boolean; h?: number; pedestal?: boolean; cloth?: number }) {
  const { k } = x;
  const h = opts?.h ?? 0.75;
  k.at(px, 0, pz, ry, () => {
    if (opts?.round) {
      if (opts.pedestal !== false) {
        k.cyl(0, 0, 0, 0.22, 0.26, 0.04, legs, 16);
        k.cyl(0, 0.04, 0, 0.04, 0.05, h - 0.08, legs, 10);
      }
      if (opts.cloth !== undefined) k.cyl(0, h - 0.3, 0, w / 2 + 0.06, w / 2 + 0.12, 0.3, opts.cloth, 24, { open: true });
      k.cyl(0, h - 0.04, 0, w / 2, w / 2, 0.04, opts.cloth ?? top, 28);
    } else {
      for (const sx of [-w / 2 + 0.06, w / 2 - 0.06]) for (const sz of [-d / 2 + 0.06, d / 2 - 0.06]) k.box(sx, 0, sz, 0.05, h - 0.04, 0.05, legs);
      k.box(0, h - 0.04, 0, w, 0.04, d, top);
    }
    k.shadow(0, 0, w + 0.3, (opts?.round ? w : d) + 0.3, 0.25);
  });
}

function plant(x: Ctx, px: number, pz: number, size: number, kind?: "tall" | "bush" | "palm" | "snake") {
  const { k, rnd, pal } = x;
  const type = kind ?? pickOf(rnd, ["tall", "bush", "palm", "snake"] as const);
  const leaf = () => pickOf(rnd, pal.leaves);
  const pot = pal.pot;
  k.at(px, 0, pz, rnd() * 6, () => {
    const pr = 0.2 * size;
    k.cyl(0, 0, 0, pr, pr * 0.8, 0.42 * size, pot, 16);
    k.cyl(0, 0.4 * size, 0, pr * 0.92, pr * 0.92, 0.02, 0x4a3b2c, 16);
    if (type === "tall") {
      k.cyl(0, 0.4 * size, 0, 0.02, 0.025, 0.9 * size, 0x6b5440, 6);
      for (let l = 0; l < 7; l++) {
        const a = l * 2.4;
        const y = (0.9 + l * 0.14) * size;
        k.leafy(Math.cos(a) * 0.18 * size, y, Math.sin(a) * 0.18 * size, 0.2 * size, leaf(), { sy: 0.7 });
      }
    } else if (type === "bush") {
      for (let l = 0; l < 5; l++) {
        const a = l * 1.3;
        k.leafy(Math.cos(a) * 0.12 * size, (0.62 + (l % 2) * 0.12) * size, Math.sin(a) * 0.12 * size, 0.24 * size, leaf(), { detail: 1 });
      }
    } else if (type === "palm") {
      k.cyl(0, 0.4 * size, 0, 0.03, 0.04, 1.0 * size, 0x7a6248, 6);
      for (let l = 0; l < 8; l++) {
        const a = (l / 8) * Math.PI * 2;
        k.box(Math.sin(a) * 0.32 * size, 1.32 * size, Math.cos(a) * 0.32 * size, 0.14 * size, 0.02, 0.62 * size, leaf(), { ry: a, rx: 0.5, layer: "foliage" });
      }
    } else {
      for (let l = 0; l < 9; l++) {
        const a = l * 2.1;
        k.box(Math.cos(a) * 0.07 * size, 0.42 * size, Math.sin(a) * 0.07 * size, 0.07 * size, (0.5 + (l % 3) * 0.15) * size, 0.02, leaf(), { ry: a, rx: Math.cos(a) * 0.15, rz: Math.sin(a) * 0.15, layer: "foliage" });
      }
    }
    k.shadow(0, 0, pr * 3, pr * 3, 0.3);
  });
}

function floorLamp(x: Ctx, px: number, pz: number, metal: number, shade = 0xfff1d6) {
  const { k } = x;
  k.at(px, 0, pz, 0, () => {
    k.cyl(0, 0, 0, 0.15, 0.16, 0.02, metal, 16);
    k.cyl(0, 0.02, 0, 0.012, 0.012, 1.4, metal, 6);
    k.cyl(0, 1.38, 0, 0.16, 0.22, 0.28, shade, 18, { layer: "glow" });
    k.shadow(0, 0, 0.4, 0.4, 0.25);
  });
  x.lamps.push({ ...pos(x, px, 1.5, pz) });
}

function tableLamp(x: Ctx, px: number, y: number, pz: number, base: number) {
  const { k } = x;
  k.ball(px, y + 0.1, pz, 0.08, base, { sy: 1.2 });
  k.cyl(px, y + 0.2, pz, 0.1, 0.14, 0.18, 0xfff1d6, 16, { layer: "glow" });
}

function pendant(x: Ctx, px: number, pz: number, drop: number, style: "globe" | "cone" | "drum", color: number) {
  const { k, room } = x;
  const y = room.h - drop;
  k.cyl(px, y, pz, 0.006, 0.006, drop, 0x2b2b2b, 4, { noAo: true });
  if (style === "globe") k.ball(px, y - 0.12, pz, 0.16, 0xfff3dc, { layer: "glow", w: 14, h: 10 });
  else if (style === "cone") {
    k.cyl(px, y - 0.24, pz, 0.04, 0.24, 0.26, color, 18, { noAo: true, open: true });
    k.ball(px, y - 0.22, pz, 0.07, 0xfff3dc, { layer: "glow" });
  } else {
    k.cyl(px, y - 0.3, pz, 0.32, 0.32, 0.26, 0xfff3dc, 20, { layer: "glow" });
    k.cyl(px, y - 0.31, pz, 0.33, 0.33, 0.02, color, 20, { noAo: true });
  }
}

function downlights(x: Ctx, nx: number, nz: number, margin = 1.2) {
  const { k, room } = x;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const px = -room.w / 2 + margin + (i * (room.w - 2 * margin)) / Math.max(1, nx - 1);
      const pz = -room.d / 2 + margin + (j * (room.d - 2 * margin)) / Math.max(1, nz - 1);
      k.cyl(px, room.h - 0.012, pz, 0.08, 0.08, 0.012, 0xfff6e0, 12, { layer: "glow" });
    }
  }
}

function linearLights(x: Ctx, n: number, along: "x" | "z", color = 0xf4f8ff) {
  const { k, room } = x;
  for (let i = 0; i < n; i++) {
    const f = (i + 1) / (n + 1);
    // Slim recessed strips with a dark trim.
    if (along === "x") {
      k.box(0, room.h - 0.012, -room.d / 2 + f * room.d, room.w * 0.62 + 0.06, 0.012, 0.11, 0x3a3d42, { noAo: true });
      k.box(0, room.h - 0.02, -room.d / 2 + f * room.d, room.w * 0.62, 0.012, 0.06, color, { layer: "glow" });
    } else {
      k.box(-room.w / 2 + f * room.w, room.h - 0.012, 0, 0.11, 0.012, room.d * 0.62 + 0.06, 0x3a3d42, { noAo: true });
      k.box(-room.w / 2 + f * room.w, room.h - 0.02, 0, 0.06, 0.012, room.d * 0.62, color, { layer: "glow" });
    }
  }
}

function pos(x: Ctx, lx: number, ly: number, lz: number) {
  const p = x.k.world(lx, ly, lz);
  return { x: p.x, y: p.y, z: p.z };
}

function rugAt(x: Ctx, px: number, pz: number, w: number, d: number, ry = 0, base?: number, accent?: number) {
  const { k, sheet, rnd, pal } = x;
  const uv = sheet.paint(256, Math.round((256 * d) / w), (c, cw, ch) => rug(c, cw, ch, pickOf(rnd, RUG_STYLES), base ?? pal.fabric2, accent ?? pal.accent, rnd));
  k.at(px, 0, pz, ry, () => {
    k.mat(0, 0.008, 0, w, d, 0xffffff, { layer: "tex" }, uv);
    k.box(0, 0, 0, w, 0.008, d, shadeHex(base ?? pal.fabric2, 0.15), { noAo: true });
  });
}

/** A framed painting on a wall (u along the wall from its middle, y = centre height). */
function art(x: Ctx, side: number, u: number, y: number, w: number, h: number, styleIndex?: number) {
  const { k, sheet, rnd, pal } = x;
  const style = ART_STYLES[(styleIndex ?? Math.floor(rnd() * ART_STYLES.length)) % ART_STYLES.length];
  const uv = sheet.paint(Math.round(200 * Math.min(1.6, w / h)), 200, (c, cw, ch) => painting(c, cw, ch, style, pal.art, rnd));
  atWall(x, side, u, () => {
    k.box(0, y - h / 2 - 0.04, 0.02, w + 0.08, h + 0.08, 0.04, pal.frame, { noAo: true });
    k.quad(0, y, 0.042, w, h, 0xffffff, { layer: "tex" }, uv);
  });
}

function bookshelf(x: Ctx, side: number, u: number, w: number, h: number, colors?: number[]) {
  const { k, sheet, rnd, pal } = x;
  const rows = Math.max(2, Math.round(h / 0.38));
  const uv = sheet.paint(Math.round(64 * w), Math.round(52 * rows), (c, cw, ch) => books(c, cw, ch, rows, colors ?? [0x8c3b2e, 0x2e4057, 0xd9c7a7, 0x2f5d50, 0xc9a227, 0x5c4033, 0xe8e1d4, 0x7a2e3a], rnd));
  atWall(x, side, u, () => {
    const d = 0.36;
    k.box(0, 0, d / 2, w, 0.08, d, pal.wood);
    k.box(0, h - 0.04, d / 2, w + 0.04, 0.04, d + 0.02, pal.wood);
    for (const sx of [-w / 2, w / 2]) k.box(sx, 0, d / 2, 0.04, h, d, pal.wood);
    const rh = (h - 0.12) / rows;
    for (let r = 1; r < rows; r++) k.box(0, 0.08 + r * rh - 0.02, d / 2, w, 0.025, d, pal.wood, { noAo: true });
    k.quad(0, 0.08 + (h - 0.12) / 2, 0.05, w - 0.04, h - 0.12, 0xffffff, { layer: "tex" }, uv);
    k.shadow(0, d / 2, w + 0.2, d + 0.3, 0.3);
  });
}

function sideboard(x: Ctx, side: number, u: number, w: number, color: number, decor = true) {
  const { k, pal, rnd } = x;
  atWall(x, side, u, () => {
    for (const sx of [-w / 2 + 0.06, w / 2 - 0.06]) for (const sz of [0.08, 0.38]) k.cyl(sx, 0, sz, 0.018, 0.014, 0.16, pal.metal, 6);
    k.box(0, 0.16, 0.24, w, 0.56, 0.44, color);
    for (let d = 0; d < 3; d++) k.box(-w / 2 + (w / 3) * (d + 0.5), 0.2, 0.465, w / 3 - 0.02, 0.48, 0.01, shadeHex(color, 0.06), { noAo: true });
    if (decor) {
      k.cyl(-w / 2 + 0.25, 0.72, 0.24, 0.07, 0.09, 0.32, pickOf(rnd, pal.art), 12);
      tableLamp(x, w / 2 - 0.3, 0.72, 0.24, pal.metal);
      k.box(0.05, 0.72, 0.24, 0.3, 0.04, 0.22, pal.fabric2);
    }
    k.shadow(0, 0.24, w + 0.2, 0.7, 0.3);
  });
}

function tvWall(x: Ctx, side: number, u: number) {
  const { k, sheet, rnd, pal } = x;
  const uv = sheet.paint(256, 144, (c, w, h) => tvPicture(c, w, h, rnd));
  atWall(x, side, u, () => {
    k.box(0, 0.2, 0.22, 2.0, 0.42, 0.42, pal.wood);
    k.box(0, 1.0, 0.035, 1.5, 0.86, 0.05, 0x111316, { noAo: true });
    k.quad(0, 1.43, 0.062, 1.44, 0.8, 0xffffff, { layer: "texGlow" }, uv);
    k.shadow(0, 0.22, 2.2, 0.7, 0.3);
  });
}

function kitchen(x: Ctx, side: number, u: number, len: number) {
  const { k, pal, rnd } = x;
  const body = pickOf(rnd, [pal.wall, pal.accentWall, 0xffffff, pal.wood]);
  const top = pickOf(rnd, [0xf1efea, 0x2b2b2b, 0xd9d3c7]);
  const upper = body === pal.wall ? pal.wood : mixHex(body, 0xffffff, 0.15);
  atWall(x, side, u, () => {
    k.box(0, 0, 0.32, len, 0.1, 0.56, shadeHex(body, 0.3));
    k.box(0, 0.1, 0.32, len, 0.78, 0.6, body);
    k.box(0, 0.88, 0.32, len + 0.02, 0.04, 0.64, top);
    const doors = Math.floor(len / 0.6);
    for (let d = 0; d < doors; d++) {
      const dx = -len / 2 + 0.3 + d * 0.6;
      k.box(dx, 0.14, 0.625, 0.56, 0.7, 0.012, shadeHex(body, 0.04), { noAo: true });
      k.box(dx, 0.76, 0.635, 0.3, 0.02, 0.02, pal.metal, { noAo: true });
      k.box(dx, 1.5, 0.37, 0.56, 0.68, 0.012, shadeHex(upper, 0.04), { noAo: true });
      k.box(dx + 0.22, 1.56, 0.38, 0.02, 0.2, 0.02, pal.metal, { noAo: true });
    }
    // Tiled splashback and the wall cupboards above it.
    k.box(0, 0.92, 0.02, len, 0.55, 0.02, mixHex(pal.wall, 0xffffff, 0.5), { noAo: true });
    for (let t = 1; t < Math.floor(len / 0.15); t++) k.box(-len / 2 + t * 0.15, 0.92, 0.031, 0.005, 0.55, 0.002, shadeHex(pal.wall, 0.12), { noAo: true });
    k.box(0, 1.47, 0.18, len, 0.75, 0.36, upper, { noAo: true });
    k.box(len / 2 - 0.6, 1.47, 0.24, 0.62, 0.12, 0.48, pal.metal, { noAo: true });
    k.box(0, 1.46, 0.3, len, 0.012, 0.2, 0xfff1d6, { layer: "glow" });
    k.box(len / 2 - 0.6, 0.92, 0.3, 0.6, 0.012, 0.45, 0x2b2b2b);
    k.box(-len / 4, 0.92, 0.32, 0.5, 0.01, 0.4, 0xadb5bd);
    k.cyl(-len / 4, 0.92, 0.12, 0.012, 0.012, 0.3, pal.metal, 6);
    // Fridge at the end.
    k.box(-len / 2 - 0.4, 0, 0.34, 0.76, 2.0, 0.66, 0xe9ecef);
    k.box(-len / 2 - 0.12, 0.9, 0.68, 0.02, 0.5, 0.02, 0x868e96, { noAo: true });
    k.shadow(-0.2, 0.32, len + 1.2, 0.9, 0.3);
    // Little things on the counter.
    k.cyl(len / 2 - 1.1, 0.92, 0.25, 0.08, 0.08, 0.18, pickOf(rnd, pal.art), 12);
    k.cyl(0.1, 0.92, 0.2, 0.12, 0.1, 0.06, 0xffffff, 16);
    for (let f = 0; f < 3; f++) k.ball(0.1 + (f - 1) * 0.06, 0.99, 0.2, 0.04, [0xe5484d, 0xf5a524, 0x69db7c][f], { w: 6, h: 5 });
  });
  atWall(x, side, u - len / 4, () => spot(x, 0, 0.85, Math.PI, "stand"));
}

function bed(x: Ctx, side: number, u: number, fabric: number) {
  const { k, pal } = x;
  atWall(x, side, u, () => {
    k.soft(0, 0, 1.05, 1.8, 0.32, 2.1, pal.wood, 0.03);
    k.soft(0, 0.32, 1.05, 1.72, 0.24, 2.0, 0xfbfaf7, 0.08);
    k.soft(0, 0.5, 1.45, 1.76, 0.08, 1.3, fabric, 0.05);
    k.soft(0, 0.52, 1.95, 1.8, 0.06, 0.4, pal.fabric2, 0.03);
    for (const sx of [-0.45, 0.45]) k.soft(sx, 0.56, 0.32, 0.66, 0.16, 0.36, 0xffffff, 0.08);
    k.soft(0, 0.5, 0.42, 0.5, 0.14, 0.18, pal.accent, 0.06);
    k.soft(0, 0, 0.06, 2.1, 1.25, 0.12, fabric, 0.05);
    for (const sx of [-1.35, 1.35]) {
      k.box(sx, 0, 0.26, 0.5, 0.52, 0.42, pal.wood);
      tableLamp(x, sx, 0.52, 0.24, pal.metal);
      k.shadow(sx, 0.26, 0.7, 0.6, 0.25);
    }
    k.shadow(0, 1.05, 2.2, 2.4, 0.35);
  });
}

function desk(x: Ctx, px: number, pz: number, ry: number, top: number, screen: UvRect | null, chairColor: number, sitSpot = true) {
  const { k, pal } = x;
  k.at(px, 0, pz, ry, () => {
    k.box(0, 0.72, 0, 1.4, 0.035, 0.7, top);
    for (const sx of [-0.66, 0.66]) k.box(sx, 0, 0, 0.04, 0.72, 0.62, pal.metal);
    if (screen) {
      k.box(0, 0.755, -0.18, 0.2, 0.02, 0.14, 0x2b2b2b);
      k.box(0, 0.76, -0.2, 0.04, 0.2, 0.03, 0x2b2b2b);
      k.box(0, 0.92, -0.21, 0.62, 0.38, 0.025, 0x16191d);
      k.quad(0, 1.11, -0.196, 0.58, 0.34, 0xffffff, { layer: "texGlow" }, screen);
      k.box(0, 0.755, 0.08, 0.44, 0.015, 0.14, 0xdee2e6);
    }
    k.cyl(0.5, 0.755, -0.1, 0.04, 0.035, 0.1, pickOf(x.rnd, [0xffffff, pal.accent, 0x2b2b2b]), 10);
    k.shadow(0, 0, 1.6, 0.9, 0.25);
    officeChair(x, 0, 0.55, Math.PI, chairColor, sitSpot);
  });
}

function receptionDesk(x: Ctx, px: number, pz: number, ry: number, w: number, front: number, top: number, staff = true) {
  const { k } = x;
  k.at(px, 0, pz, ry, () => {
    k.box(0, 0, 0, w, 1.05, 0.7, front);
    for (let s = 0; s < Math.floor(w / 0.12); s++) k.box(-w / 2 + 0.06 + s * 0.12, 0.05, 0.352, 0.05, 0.95, 0.01, shadeHex(front, 0.12), { noAo: true });
    k.box(0, 1.05, 0.02, w + 0.1, 0.05, 0.78, top);
    k.box(0, 0.72, -0.5, w - 0.2, 0.04, 0.5, top);
    k.box(w / 2 - 0.5, 0.76, -0.5, 0.5, 0.3, 0.02, 0x16191d);
    k.shadow(0, 0, w + 0.4, 1.4, 0.3);
    if (staff) spot(x, 0, -0.75, 0, "stand");
  });
}

function elevators(x: Ctx, side: number, u: number, n: number) {
  const { k, pal, sheet, info } = x;
  const uv = sheet.paint(96, 48, (c, w, h) => sign(c, w, h, String(info.floor || "G"), 0x0e1116, 0xffb020, { weight: 800 }));
  atWall(x, side, u, () => {
    for (let e = 0; e < n; e++) {
      const ex = (e - (n - 1) / 2) * 1.6;
      k.box(ex, 0, 0.01, 1.2, 2.35, 0.06, shadeHex(pal.metal, -0.4), { noAo: true });
      k.box(ex - 0.26, 0, 0.04, 0.5, 2.2, 0.02, 0xb8bec6, { noAo: true });
      k.box(ex + 0.26, 0, 0.04, 0.5, 2.2, 0.02, 0xb8bec6, { noAo: true });
      k.quad(ex, 2.5, 0.05, 0.3, 0.15, 0xffffff, { layer: "texGlow" }, uv);
      k.box(ex + 0.72, 1.05, 0.03, 0.08, 0.16, 0.02, 0x2b2b2b, { noAo: true });
      k.ball(ex + 0.72, 1.13, 0.045, 0.018, 0xfff1d6, { layer: "glow" });
    }
  });
}

function slatWall(x: Ctx, side: number, u: number, w: number, h: number, color: number) {
  const { k } = x;
  atWall(x, side, u, () => {
    k.box(0, 0, 0.01, w, h, 0.02, shadeHex(color, 0.35), { noAo: true });
    const n = Math.floor(w / 0.09);
    for (let s = 0; s < n; s++) k.box(-w / 2 + 0.045 + s * 0.09, 0, 0.035, 0.05, h, 0.04, color, { noAo: true });
  });
}

function wallSign(x: Ctx, side: number, u: number, y: number, text: string, bg: number, fg: number, w = 2.4, h = 0.5, lit = true, sub?: string) {
  const { k, sheet } = x;
  const uv = sheet.paint(Math.round(96 * (w / h)), 96, (c, cw, ch) => sign(c, cw, ch, text, bg, fg, { sub, weight: 700 }));
  atWall(x, side, u, () => k.quad(0, y, 0.07, w, h, 0xffffff, { layer: lit ? "texGlow" : "tex" }, uv));
}

function bench(x: Ctx, px: number, pz: number, ry: number, len: number, seat: number, legs: number, seats = 2) {
  const { k } = x;
  k.at(px, 0, pz, ry, () => {
    for (const sx of [-len / 2 + 0.1, len / 2 - 0.1]) k.box(sx, 0, 0, 0.06, 0.42, 0.4, legs);
    k.soft(0, 0.42, 0, len, 0.06, 0.44, seat, 0.02);
    k.shadow(0, 0, len + 0.2, 0.6, 0.22);
    for (let s = 0; s < seats; s++) spot(x, -len / 2 + (len / seats) * (s + 0.5), 0.02, 0, "sit", 0.46);
  });
}

function plinth(x: Ctx, px: number, pz: number, color: number, art: number) {
  const { k, rnd } = x;
  k.at(px, 0, pz, rnd() * 3, () => {
    k.box(0, 0, 0, 0.6, 0.95, 0.6, color);
    const kind = Math.floor(rnd() * 4);
    if (kind === 0) {
      k.ball(0, 1.25, 0, 0.26, art, { w: 18, h: 14 });
      k.ball(0.12, 1.55, 0.04, 0.12, art, { w: 12, h: 10 });
    } else if (kind === 1) {
      k.ring(0, 1.35, 0, 0.26, 0.06, art, { rx: Math.PI / 2 - 0.3 });
      k.box(0, 0.95, 0, 0.12, 0.12, 0.12, shadeHex(art, 0.2));
    } else if (kind === 2) {
      for (let s = 0; s < 4; s++) k.box(0, 0.95 + s * 0.16, 0, 0.36 - s * 0.07, 0.16, 0.36 - s * 0.07, s % 2 ? art : shadeHex(art, -0.3), { ry: s * 0.3 });
    } else {
      k.cyl(0, 0.95, 0, 0.06, 0.2, 0.75, art, 6);
      k.ball(0, 1.78, 0, 0.12, shadeHex(art, -0.2), { w: 10, h: 8 });
    }
    k.shadow(0, 0, 0.9, 0.9, 0.3);
  });
}

function counterRun(x: Ctx, px: number, pz: number, ry: number, w: number, color: number, top: number, staff = true) {
  const { k } = x;
  k.at(px, 0, pz, ry, () => {
    k.box(0, 0, 0, w, 1.0, 0.6, color);
    k.box(0, 1.0, 0, w + 0.06, 0.05, 0.66, top);
    k.shadow(0, 0, w + 0.3, 1, 0.3);
    if (staff) spot(x, 0, -0.65, 0, "stand");
  });
}

/** Standing spots spread round a point (for people chatting in a group). */
function huddle(x: Ctx, cx: number, cz: number, n: number, r = 0.55) {
  const a0 = x.rnd() * Math.PI * 2;
  for (let s = 0; s < n; s++) {
    const a = a0 + (s / n) * Math.PI * 2;
    const px = cx + Math.cos(a) * r;
    const pz = cz + Math.sin(a) * r;
    x.spots.push({ x: px, z: pz, ry: faceTo(px, pz, cx, cz), pose: "stand", y: 0 });
  }
}

/** Someone standing at a window, looking out. */
function atWindow(x: Ctx, side: number, u: number) {
  const [px, pz, ry] = onWall(x.room, side, u);
  const ix = px + Math.sin(ry) * 0.6;
  const iz = pz + Math.cos(ry) * 0.6;
  x.spots.push({ x: ix, z: iz, ry: ry + Math.PI, pose: "stand", y: 0 });
}

// ---------------------------------------------------------------- themes

function livingRoom(x: Ctx, upstairs: boolean) {
  const { room, pal, rnd } = x;
  const W = room.w;
  const D = room.d;
  if (!upstairs) {
    kitchen(x, 3, 0.4, 2.6);
    // Kitchen island with stools.
    const ix = -W / 2 + 2.25;
    table(x, ix, 0.2, Math.PI / 2, 1.8, 0.8, pickOf(rnd, [0xf1efea, 0x2b2b2b]), pal.wood, { h: 0.92 });
    x.k.box(ix, 0, 0.2, 0.7, 0.88, 1.6, pal.wood);
    for (const sz of [-0.4, 0.4]) chair(x, ix + 0.75, 0.2 + sz, -Math.PI / 2, pal.fabric, pal.metal, { stool: true });
    // Dining.
    const dx = -0.3;
    table(x, dx, -1.1, 0, 1.1, 1.1, pal.wood, pal.wood, { round: true });
    for (let c = 0; c < 4; c++) {
      const a = (c / 4) * Math.PI * 2 + Math.PI / 4;
      chair(x, dx + Math.sin(a) * 0.78, -1.1 + Math.cos(a) * 0.78, a + Math.PI, pal.fabric2, pal.wood, { spot: c < 2 });
    }
    pendant(x, dx, -1.1, 1.0, pickOf(rnd, ["globe", "cone", "drum"] as const), pal.metal);
    x.lamps.push({ x: dx, y: room.h - 1.2, z: -1.1 });
  }
  // Lounge.
  const lx = W / 2 - 2.2;
  const lz = upstairs ? -0.6 : 0.4;
  if (upstairs) {
    bed(x, 2, 0.6, pal.fabric);
    const desks = x.sheet.paint(160, 100, (c, w, h) => dashboard(c, w, h, pal.accent, rnd));
    desk(x, -W / 2 + 1.0, -0.4, Math.PI / 2, pal.wood, desks, pal.fabric2);
    armchair(x, W / 2 - 1.0, -D / 2 + 1.1, -Math.PI * 0.75, pal.fabric2);
    floorLamp(x, W / 2 - 0.45, -D / 2 + 0.5, pal.metal);
    rugAt(x, 0.6, 0.6, 2.6, 2.0, 0);
    plant(x, -W / 2 + 0.45, D / 2 - 0.45, 1.1, "tall");
    art(x, 1, 0.6, 1.6, 0.9, 0.7);
    x.k.box(-W / 2 + 0.4, 0, D / 2 - 1.6, 0.7, 2.1, 1.4, pal.wood);
  } else {
    rugAt(x, lx, lz + 0.1, 2.8, 2.2, 0);
    sofa(x, lx, lz + 1.2, Math.PI, 2.2, pal.fabric);
    table(x, lx, lz, 0, 1.0, 0.6, pickOf(rnd, [pal.wood, 0xf1efea, 0x2b2b2b]), pal.wood, { h: 0.4 });
    x.k.box(lx - 0.2, 0.4, lz, 0.3, 0.05, 0.22, pal.accent);
    x.k.cyl(lx + 0.25, 0.4, lz + 0.05, 0.06, 0.05, 0.16, 0xffffff, 12);
    armchair(x, lx + 1.6, lz - 0.2, -Math.PI / 2 - 0.3, pal.fabric2);
    floorLamp(x, lx + 1.6, lz + 1.0, pal.metal);
    plant(x, W / 2 - 0.5, -D / 2 + 0.55, 1.15, "tall");
    art(x, 2, lx - 0.2 - 0, 1.75, 1.2, 0.8);
    sideboard(x, 1, 0.9, 1.6, pal.wood);
  }
  plant(x, -W / 2 + 0.5, -D / 2 + 0.5, 0.9, "bush");
  downlights(x, 3, 2, 1.4);
  for (const s of solidSides(room)) if (s !== 2 && rnd() < 0.7) art(x, s, -0.8, 1.6, 0.7, 0.9);
  if (upstairs) {
    x.views.push(
      { x: W / 2 - 0.8, z: D / 2 - 0.7, yaw: yawTo(W / 2 - 0.8, D / 2 - 0.7, -W / 4, -D / 2), pitch: -0.14 },
      { x: -W / 2 + 0.9, z: -D / 2 + 0.9, yaw: yawTo(-W / 2 + 0.9, -D / 2 + 0.9, W / 4, D / 2), pitch: -0.16 },
      { x: 0.4, z: -0.6, yaw: 0, pitch: -0.08 },
    );
  } else {
    x.views.push(
      { x: 0.5, z: D / 2 - 0.55, yaw: yawTo(0.5, D / 2 - 0.55, -W / 5, -D / 2), pitch: -0.13 },
      { x: W / 2 - 0.7, z: -D / 2 + 0.8, yaw: yawTo(W / 2 - 0.7, -D / 2 + 0.8, -W / 3, D / 3), pitch: -0.14 },
      { x: -0.6, z: -D / 2 + 0.7, yaw: yawTo(-0.6, -D / 2 + 0.7, W / 4, D / 2), pitch: -0.12 },
    );
  }
  atWindow(x, 0, W / 4);
}

function lobby(x: Ctx, kind: "corp" | "hotel" | "clinic" | "police" | "small") {
  const { room, pal, rnd, info } = x;
  const W = room.w;
  const D = room.d;
  const deskZ = D / 2 - 2.2;
  if (kind === "small") {
    // A small entrance hall (the clock tower): stone floor, a bench, a plaque, a plant.
    bench(x, 0, D / 2 - 0.6, Math.PI, 1.4, pal.fabric, pal.wood);
    wallSign(x, 2, 0, 1.9, info.name, 0x2b2b2b, 0xd9c7a7, 1.6, 0.3, false, `Since ${1880 + Math.floor(rnd() * 90)}`);
    plant(x, -W / 2 + 0.4, -D / 2 + 0.4, 0.9, "snake");
    pendant(x, 0, 0, 1.2, "globe", pal.metal);
    x.lamps.push({ x: 0, y: room.h - 1.4, z: 0 });
    huddle(x, 0.2, -0.3, 2, 0.45);
    x.views.push({ x: 0, z: -D / 2 + 0.5, yaw: Math.PI, pitch: -0.15 }, { x: 0.4, z: D / 2 - 0.5, yaw: 0.3, pitch: -0.05 });
    return;
  }
  // The back wall: a feature wall with the name, lifts either side.
  const feature = kind === "corp" ? pal.wood : kind === "hotel" ? pal.accentWall : kind === "clinic" ? pal.accentWall : pal.accentWall;
  if (kind === "corp" || kind === "hotel") slatWall(x, 2, 0, Math.min(6, W * 0.42), room.h, feature);
  const signText = kind === "clinic" ? "Reception" : kind === "police" ? "POLICE" : info.name;
  const signBg = kind === "clinic" ? 0x3aa58f : kind === "police" ? 0x1c3faa : shadeHex(feature, 0.45);
  wallSign(x, 2, 0, 2.6, signText, signBg, kind === "corp" || kind === "hotel" ? 0xf3e3c3 : 0xffffff, Math.min(4.4, W * 0.3), 0.6, true, kind === "clinic" ? "Welcome · Please check in" : kind === "police" ? "Front desk · Open 24 hours" : undefined);
  if (kind !== "police") {
    elevators(x, 2, -W / 2 + 2.2, 2);
    elevators(x, 2, W / 2 - 2.2, kind === "clinic" ? 1 : 2);
  } else {
    // Notice board and a city map.
    const map = x.sheet.paint(256, 180, (c, w, h) => cityMap(c, w, h, rnd));
    atWall(x, 3, 0.6, () => {
      x.k.box(0, 0.9, 0.02, 2.0, 1.3, 0.04, 0x2b2f38, { noAo: true });
      x.k.quad(0, 1.55, 0.045, 1.9, 1.2, 0xffffff, { layer: "tex" }, map);
    });
    bench(x, -W / 2 + 0.6, -0.8, Math.PI / 2, 2.0, pal.fabric, pal.metal, 3);
  }
  receptionDesk(x, 0, deskZ, Math.PI, Math.min(4.2, W * 0.32), kind === "corp" ? pal.wood : kind === "hotel" ? pal.wood : 0xf1f3f5, kind === "hotel" || kind === "corp" ? 0xf1efea : pal.accent);
  // Speed gates between the desk and the lifts (offices).
  if (kind === "corp") {
    for (const bank of [-1, 1]) {
      for (let g = 0; g < 3; g++) {
        const gx = bank * (W / 2 - 2.2) + (g - 1) * 0.75;
        x.k.box(gx, 0, D / 2 - 1.9, 0.16, 1.0, 1.0, 0x2b2d31);
        x.k.box(gx, 1.0, D / 2 - 1.9, 0.17, 0.02, 1.0, 0xbfd9ea, { layer: "glow" });
        if (g < 2) x.k.box(gx + 0.37, 0.55, D / 2 - 1.9, 0.5, 0.45, 0.015, 0xbfd9ea, { layer: "glass" });
      }
    }
    spot(x, W / 2 - 3.6, D / 2 - 2.6, Math.PI * 0.85, "stand");
  }
  // Waiting / lounge area by the windows.
  const sx = W / 2 - 3.2;
  if (kind === "clinic" || kind === "police") {
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) chair(x, sx - 1.2 + c * 0.62, -0.6 + r * 1.6, r ? Math.PI : 0, pal.fabric, pal.metal);
    }
    plant(x, sx + 1.6, -0.2, 1.1, "tall");
    if (kind === "clinic") {
      const scr = x.sheet.paint(200, 112, (c, w, h) => sign(c, w, h, "Now seeing: 14", 0x123b34, 0x9ff0d8, { weight: 700, sub: "Please wait to be called" }));
      atWall(x, 1, 0, () => x.k.quad(0, 2.1, 0.06, 1.6, 0.9, 0xffffff, { layer: "texGlow" }, scr));
      x.k.box(-W / 2 + 0.5, 0, -D / 2 + 1.6, 0.36, 1.1, 0.36, 0xe9ecef);
      x.k.cyl(-W / 2 + 0.5, 1.1, -D / 2 + 1.6, 0.13, 0.13, 0.4, 0xbfe3f2, 14, { layer: "glass" });
    }
  } else {
    rugAt(x, sx, -0.6, 3.6, 2.8, 0, pal.fabric2, pal.fabric);
    sofa(x, sx, 0.6, Math.PI, 2.2, pal.fabric);
    armchair(x, sx - 1.4, -1.0, Math.PI / 2, pal.fabric2);
    armchair(x, sx + 1.4, -1.0, -Math.PI / 2, pal.fabric2);
    table(x, sx, -0.5, 0, 1.1, 0.7, kind === "hotel" ? pal.metal : 0xf1efea, pal.metal, { h: 0.42 });
    x.k.cyl(sx, 0.42, -0.5, 0.12, 0.08, 0.32, 0xffffff, 16);
    for (let f = 0; f < 5; f++) x.k.ball(sx + (rnd() - 0.5) * 0.16, 0.8 + rnd() * 0.12, -0.5 + (rnd() - 0.5) * 0.16, 0.06, pickOf(rnd, [0xf783ac, 0xffffff, 0xfab005, 0xe5484d]), { w: 8, h: 6 });
    // Opposite side: a second seating group or a café corner.
    const ox = -W / 2 + 2.6;
    table(x, ox, -0.8, 0, 0.8, 0.8, 0xf1efea, pal.metal, { round: true });
    chair(x, ox - 0.6, -0.8, Math.PI / 2, pal.fabric, pal.metal);
    chair(x, ox + 0.6, -0.8, -Math.PI / 2, pal.fabric, pal.metal);
    plant(x, ox + 1.6, -D / 2 + 0.7, 1.4, kind === "hotel" ? "palm" : "tall");
    plant(x, -W / 2 + 0.6, D / 2 - 0.7, 1.3, "tall");
    plant(x, W / 2 - 0.6, D / 2 - 0.7, 1.3, "palm");
  }
  if (kind === "hotel") {
    // Chandeliers and columns.
    for (const cx of [-W / 4, W / 4]) {
      const y = room.h - 1.4;
      x.k.cyl(cx, y + 0.3, 0, 0.01, 0.01, 1.1, pal.metal, 4, { noAo: true });
      x.k.ring(cx, y, 0, 0.7, 0.03, pal.metal, { rx: Math.PI / 2, noAo: true });
      x.k.ring(cx, y + 0.3, 0, 0.45, 0.025, pal.metal, { rx: Math.PI / 2, noAo: true });
      for (let b = 0; b < 12; b++) {
        const a = (b / 12) * Math.PI * 2;
        x.k.ball(cx + Math.cos(a) * 0.7, y + 0.08, Math.sin(a) * 0.7, 0.06, 0xfff1d6, { layer: "glow", w: 8, h: 6 });
      }
      for (let b = 0; b < 8; b++) {
        const a = (b / 8) * Math.PI * 2;
        x.k.ball(cx + Math.cos(a) * 0.45, y + 0.38, Math.sin(a) * 0.45, 0.05, 0xfff1d6, { layer: "glow", w: 8, h: 6 });
      }
      x.lamps.push({ x: cx, y: y - 0.2, z: 0 });
    }
    for (const cx of [-W / 2 + 4.5, W / 2 - 4.5]) {
      for (const cz of [-D / 2 + 3.2, D / 2 - 3.6]) {
        x.k.cyl(cx, 0, cz, 0.3, 0.3, room.h, 0xf3efe6, 20, { noAo: false });
        x.k.cyl(cx, 0, cz, 0.36, 0.36, 0.25, pal.metal, 20);
        x.k.cyl(cx, room.h - 0.3, cz, 0.36, 0.3, 0.3, pal.metal, 20, { noAo: true });
      }
    }
    // A luggage trolley.
    const tx = -1.6;
    const tz = deskZ - 1.6;
    x.k.box(tx, 0.1, tz, 1.0, 0.04, 0.55, pal.metal);
    for (const sx2 of [-0.48, 0.48]) x.k.box(sx2 + tx, 0.1, tz, 0.03, 1.7, 0.03, pal.metal);
    x.k.box(tx, 1.78, tz, 1.0, 0.03, 0.03, pal.metal);
    x.k.soft(tx - 0.15, 0.14, tz, 0.5, 0.65, 0.3, 0x7a2e3a, 0.04);
    x.k.soft(tx + 0.25, 0.14, tz, 0.35, 0.45, 0.25, 0x2e4057, 0.04);
  } else if (kind === "corp") {
    // A ring light over the desk.
    x.k.ring(0, room.h - 0.8, deskZ, 1.6, 0.04, 0xfff3dc, { rx: Math.PI / 2, layer: "glow" });
    for (let s = 0; s < 3; s++) x.k.cyl((s - 1) * 1.4, room.h - 0.8, deskZ, 0.004, 0.004, 0.8, 0x2b2b2b, 4, { noAo: true });
    x.lamps.push({ x: 0, y: room.h - 1.2, z: deskZ });
    downlights(x, 4, 3, 1.6);
  } else {
    linearLights(x, 3, "x", 0xf8fbff);
  }
  // Pictures on the side walls.
  for (const s of solidSides(room)) if (s !== 2) art(x, s, 0, 1.8, 1.4, 1.0);
  // People: waiting, chatting, coming in.
  huddle(x, -1.2, -D / 2 + 2.2, 3, 0.55);
  atWindow(x, 0, W / 2 - 1.5);
  x.views.push(
    { x: 0, z: -D / 2 + 1.0, yaw: Math.PI, pitch: -0.08 },
    { x: -W / 2 + 1.2, z: D / 2 - 1.6, yaw: yawTo(-W / 2 + 1.2, D / 2 - 1.6, W / 4, -D / 2), pitch: -0.05 },
    { x: W / 2 - 1.2, z: 1.0, yaw: yawTo(W / 2 - 1.2, 1.0, -W / 2, -D / 4), pitch: -0.06 },
  );
}

function officeFloor(x: Ctx, kind: "office" | "detectives" | "control") {
  const { room, pal, rnd, sheet } = x;
  const W = room.w;
  const D = room.d;
  const screens = [0, 1, 2].map(() => sheet.paint(160, 100, (c, w, h) => dashboard(c, w, h, pal.accent, rnd)));
  const top = kind === "control" ? 0x3a3f45 : pickOf(rnd, [0xf4f1ea, pal.wood, 0xffffff]);
  // Two clusters of desks facing each other.
  const rows = 2;
  for (let cl = 0; cl < 2; cl++) {
    const cx = (cl ? 1 : -1) * W * 0.22;
    for (let r = 0; r < rows; r++) {
      for (const side of [-1, 1]) {
        const dz = (kind === "control" ? -1.8 : -0.6) + side * 0.36;
        const dx = cx + (r - 0.5) * 1.45;
        desk(x, dx, dz, side < 0 ? Math.PI : 0, top, pickOf(rnd, screens), pal.fabric, rnd() < 0.8);
      }
    }
    if (kind === "office") {
      plant(x, cx + 2.0, -0.6, 0.8, "bush");
      x.k.box(cx, 0.75, -0.6, 2.8, 0.36, 0.03, pal.accentWall);
    }
  }
  // Back wall: lifts or a big screen, a kitchenette, a whiteboard.
  if (kind === "control") {
    const big = sheet.paint(400, 160, (c, w, h) => dashboard(c, w, h, 0x69db7c, rnd));
    const big2 = sheet.paint(300, 160, (c, w, h) => cityMap(c, w, h, rnd));
    atWall(x, 2, 0, () => {
      x.k.box(0, 1.0, 0.03, 6.2, 1.9, 0.06, 0x16191d, { noAo: true });
      x.k.quad(-1.1, 1.95, 0.065, 3.8, 1.75, 0xffffff, { layer: "texGlow" }, big);
      x.k.quad(1.95, 1.95, 0.065, 2.1, 1.75, 0xffffff, { layer: "texGlow" }, big2);
    });
    huddle(x, 0, 1.6, 2, 0.5);
  } else if (kind === "detectives") {
    // An evidence board.
    const ev = sheet.paint(300, 180, (c, w, h) => {
      c.fillStyle = "#b98a5a";
      c.fillRect(0, 0, w, h);
      const pins: [number, number][] = [];
      for (let p = 0; p < 7; p++) {
        const px = 20 + rnd() * (w - 70);
        const py = 15 + rnd() * (h - 60);
        c.fillStyle = "#f8f9fa";
        c.fillRect(px, py, 44, 34);
        c.fillStyle = ["#adb5bd", "#868e96", "#ced4da"][p % 3];
        c.fillRect(px + 4, py + 4, 36, 22);
        pins.push([px + 22, py + 4]);
      }
      c.strokeStyle = "#e03131";
      c.lineWidth = 2;
      c.beginPath();
      pins.forEach(([px, py], k) => (k ? c.lineTo(px, py) : c.moveTo(px, py)));
      c.stroke();
    });
    atWall(x, 2, -1.5, () => {
      x.k.box(0, 0.9, 0.02, 2.4, 1.4, 0.04, 0x5c4033, { noAo: true });
      x.k.quad(0, 1.6, 0.045, 2.3, 1.3, 0xffffff, { layer: "tex" }, ev);
    });
    for (let f = 0; f < 3; f++) x.k.box(W / 2 - 0.5, 0, D / 2 - 1.2 - f * 0.55, 0.6, 1.3, 0.5, 0x868e96);
    huddle(x, -1.5, D / 2 - 1.2, 2, 0.5);
  } else {
    elevators(x, 2, W / 2 - 5.6, 1);
    const wb = sheet.paint(240, 140, (c, w, h) => board(c, w, h, false, rnd));
    atWall(x, 2, W / 2 - 2.2, () => {
      x.k.box(0, 0.9, 0.02, 2.0, 1.2, 0.03, 0xdee2e6, { noAo: true });
      x.k.quad(0, 1.5, 0.036, 1.9, 1.1, 0xffffff, { layer: "tex" }, wb);
    });
    // A glass meeting room in the back corner.
    const mx = W / 2 - 2.4;
    const mz = D / 2 - 2.2;
    for (const [gx, gz, gw, gd] of [[mx - 2.3, mz, 0.06, 4.2], [mx, mz - 2.1, 4.6, 0.06]] as const) {
      x.k.box(gx, 0, gz, gw, room.h, gd, 0xbfd9ea, { layer: "glass" });
      x.k.box(gx, 0, gz, Math.max(gw, 0.05), 0.06, Math.max(gd, 0.05), pal.metal, { noAo: true });
      x.k.box(gx, room.h - 0.06, gz, Math.max(gw, 0.05), 0.06, Math.max(gd, 0.05), pal.metal, { noAo: true });
      x.k.box(gx, 1.0, gz, Math.max(gw, 0.012) + 0.01, 0.12, Math.max(gd, 0.012) + 0.01, 0xf4f4f2, { noAo: true });
    }
    table(x, mx, mz + 0.1, 0, 2.4, 1.1, pal.wood, pal.metal);
    for (let c = 0; c < 3; c++) {
      chair(x, mx - 0.8 + c * 0.8, mz - 0.75, 0, pal.fabric, pal.metal, { spot: c !== 1 });
      chair(x, mx - 0.8 + c * 0.8, mz + 0.95, Math.PI, pal.fabric, pal.metal, { spot: c === 1 });
    }
    pendant(x, mx, mz + 0.1, 1.0, "drum", pal.metal);
    // Planters along the windows.
    for (let p = 0; p < 3; p++) {
      const px = -W / 2 + 3.5 + p * 3.2;
      x.k.box(px, 0, -D / 2 + 0.5, 1.6, 0.45, 0.5, pal.accentWall);
      for (let l = 0; l < 4; l++) x.k.leafy(px - 0.6 + l * 0.4, 0.55, -D / 2 + 0.5, 0.22, pickOf(rnd, pal.leaves), { detail: 1 });
    }
    // Lounge corner by the windows.
    pendant(x, W / 2 - 2.0, -D / 2 + 1.8, 0.9, "cone", pal.accent);
    rugAt(x, W / 2 - 2.0, -D / 2 + 1.8, 2.6, 2.0, 0);
    sofa(x, W / 2 - 2.0, -D / 2 + 2.6, Math.PI, 1.9, pal.fabric2);
    armchair(x, W / 2 - 3.3, -D / 2 + 1.6, Math.PI / 2, pal.fabric);
    table(x, W / 2 - 2.0, -D / 2 + 1.7, 0, 0.8, 0.5, pal.wood, pal.metal, { h: 0.4 });
    plant(x, W / 2 - 0.5, -D / 2 + 0.5, 1.3, "tall");
    plant(x, -W / 2 + 0.5, -D / 2 + 0.5, 1.3, "palm");
    // A coffee point against the back wall, between the lifts and the whiteboard.
    counterRun(x, 0.6, D / 2 - 0.45, Math.PI, 2.2, pal.accentWall, 0xf1efea, false);
    x.k.box(1.2, 1.05, D / 2 - 0.4, 0.3, 0.42, 0.35, 0x2b2b2b);
    x.k.cyl(0.2, 1.05, D / 2 - 0.45, 0.09, 0.08, 0.25, pal.accent, 12);
    huddle(x, 0.6, D / 2 - 1.6, 2, 0.5);
  }
  linearLights(x, 4, "x");
  for (const s of solidSides(room)) if (s !== 2) art(x, s, 0, 1.7, 1.2, 0.85);
  atWindow(x, 0, -W / 4);
  x.views.push(
    { x: -W / 2 + 1.0, z: D / 2 - 1.6, yaw: yawTo(-W / 2 + 1.0, D / 2 - 1.6, W / 5, -D / 2), pitch: -0.12 },
    { x: W / 2 - 1.0, z: -D / 2 + 1.0, yaw: yawTo(W / 2 - 1.0, -D / 2 + 1.0, -W / 3, D / 3), pitch: -0.12 },
    { x: -1.6, z: D / 2 - 2.2, yaw: 0.15, pitch: -0.06 },
  );
}

function loungeFloor(x: Ctx, restaurant: boolean) {
  const { room, pal, rnd } = x;
  const W = room.w;
  const D = room.d;
  // A warm wooden slatted ceiling with a glowing cove round the edge.
  for (let sl = 0; sl < Math.floor(W / 0.3); sl++) x.k.box(-W / 2 + 0.15 + sl * 0.3, room.h - 0.09, 0, 0.12, 0.08, D - 0.6, pal.wood, { noAo: true });
  for (const [cx, cz, cw, cd] of [[0, -D / 2 + 0.3, W - 0.6, 0.06], [0, D / 2 - 0.3, W - 0.6, 0.06], [-W / 2 + 0.3, 0, 0.06, D - 0.6], [W / 2 - 0.3, 0, 0.06, D - 0.6]] as const) {
    x.k.box(cx, room.h - 0.1, cz, cw, 0.03, cd, 0xffd9a0, { layer: "glow" });
  }
  // The bar: an island in the middle with a lit shelf above.
  const bw = 4.2;
  x.k.box(0, 0, 0.6, bw, 1.08, 0.75, pal.wood);
  x.k.box(0, 1.08, 0.6, bw + 0.15, 0.05, 0.85, pal.metal === 0x2b2b2b ? 0xf1efea : 0x1f1f1f);
  x.k.box(0, 0.06, 1.0, bw, 0.03, 0.02, pal.accent, { layer: "glow" });
  x.k.box(0, room.h - 0.55, 0.6, bw - 0.3, 0.05, 0.42, pal.wood, { noAo: true });
  for (let s = 0; s < 3; s++) x.k.cyl((s - 1) * 1.5, room.h - 0.5, 0.6, 0.006, 0.006, 0.5, pal.metal, 4, { noAo: true });
  for (let b = 0; b < 14; b++) {
    const bx = -bw / 2 + 0.35 + b * ((bw - 0.7) / 13);
    x.k.cyl(bx, room.h - 0.5, 0.6, 0.03, 0.03, 0.22, pickOf(rnd, [0x2f9e44, 0x8c5a3c, 0xe8c07d, 0xb6d7e6, 0x7a2e3a]), 8, { layer: "glow" });
  }
  x.k.box(0, room.h - 0.57, 0.6, bw - 0.4, 0.02, 0.32, 0xfff1d6, { layer: "glow" });
  spot(x, 0.6, 0.05, Math.PI, "stand");
  for (let s = 0; s < 5; s++) chair(x, -1.6 + s * 0.8, 1.45, Math.PI, pal.fabric, pal.metal, { stool: true });
  x.lamps.push({ x: 0, y: room.h - 1.1, z: 0.6 });
  // Tables round the windows.
  const spotsT: [number, number][] = [];
  for (let i = 0; i < 4; i++) spotsT.push([-W / 2 + 1.6 + i * ((W - 3.2) / 3), -D / 2 + 1.5]);
  for (let i = 0; i < 3; i++) spotsT.push([-W / 2 + 1.6, -D / 2 + 3.6 + i * 2.2]);
  for (let i = 0; i < 3; i++) spotsT.push([W / 2 - 1.6, -D / 2 + 3.6 + i * 2.2]);
  spotsT.forEach(([tx, tz], i) => {
    if (restaurant || i % 3 !== 1) {
      table(x, tx, tz, 0, 0.8, 0.8, 0x1f1f1f, pal.metal, { round: true, cloth: restaurant ? 0xf7f4ee : undefined });
      chair(x, tx - 0.62, tz, Math.PI / 2, pal.fabric, pal.metal, { spot: i % 2 === 0 });
      chair(x, tx + 0.62, tz, -Math.PI / 2, pal.fabric, pal.metal, { spot: i % 2 === 1 });
      x.k.cyl(tx, 0.75, tz, 0.035, 0.04, 0.09, 0xfff1d6, 10, { layer: "glow" });
      pendant(x, tx, tz, 1.1, "globe", pal.metal);
    } else {
      armchair(x, tx - 0.55, tz, Math.PI / 2, pal.fabric);
      armchair(x, tx + 0.55, tz, -Math.PI / 2, pal.fabric2);
      table(x, tx, tz, 0, 0.5, 0.5, pal.metal, pal.metal, { round: true, h: 0.45 });
    }
  });
  // A velvet sofa group at the back.
  rugAt(x, 0, D / 2 - 1.8, 3.6, 2.2, 0, pal.fabric2, pal.fabric);
  sofa(x, 0, D / 2 - 1.0, Math.PI, 2.6, pal.fabric);
  armchair(x, -1.7, D / 2 - 2.2, Math.PI / 2 + 0.3, pal.fabric2);
  armchair(x, 1.7, D / 2 - 2.2, -Math.PI / 2 - 0.3, pal.fabric2);
  table(x, 0, D / 2 - 2.1, 0, 1.0, 0.6, pal.metal, pal.metal, { h: 0.4 });
  plant(x, -W / 2 + 0.6, D / 2 - 0.6, 1.4, "palm");
  plant(x, W / 2 - 0.6, D / 2 - 0.6, 1.4, "tall");
  plant(x, W / 2 - 0.6, -D / 2 + 0.6, 1.0, "bush");
  x.lamps.push({ x: 0, y: room.h - 0.9, z: -D / 2 + 1.6 });
  atWindow(x, 0, 2.2);
  atWindow(x, 1, -1.0);
  x.views.push(
    { x: W / 2 - 3.2, z: D / 2 - 3.3, yaw: yawTo(W / 2 - 3.2, D / 2 - 3.3, -W / 4, -D / 2), pitch: -0.1 },
    { x: -W / 2 + 3.0, z: -0.4, yaw: yawTo(-W / 2 + 3.0, -0.4, W / 2, -D / 2 + 1), pitch: -0.08 },
    { x: 0, z: -D / 2 + 2.6, yaw: Math.PI, pitch: -0.1 },
  );
}

function suite(x: Ctx) {
  const { room, pal, rnd } = x;
  const W = room.w;
  const D = room.d;
  // The bed against the west wall, facing the TV; pictures over the headboard.
  bed(x, 3, 0.3, pal.fabric);
  art(x, 3, 0.3, 2.3, 1.5, 0.5, 0);
  rugAt(x, -W / 2 + 2.6, 0.3, 2.0, 2.8, Math.PI / 2);
  // Sitting on the end of the bed.
  x.spots.push({ x: -W / 2 + 2.25, z: 0.0, ry: Math.PI / 2, pose: "sit", y: 0.55 }, { x: -W / 2 + 2.25, z: 0.7, ry: Math.PI / 2, pose: "sit", y: 0.55 });
  tvWall(x, 1, -0.3);
  // A reading corner by the window: two armchairs, a little table, a lamp.
  armchair(x, 0.6, -D / 2 + 1.0, Math.PI - 0.5, pal.fabric2);
  armchair(x, 2.1, -D / 2 + 1.1, Math.PI + 0.5, pal.fabric);
  table(x, 1.35, -D / 2 + 0.7, 0, 0.5, 0.5, pal.metal, pal.metal, { round: true, h: 0.5 });
  x.k.cyl(1.35, 0.5, -D / 2 + 0.7, 0.07, 0.05, 0.22, 0xffffff, 12);
  floorLamp(x, -0.4, -D / 2 + 0.55, pal.metal);
  // A desk on the south wall.
  const scr = x.sheet.paint(160, 100, (c, w, h) => dashboard(c, w, h, pal.accent, rnd));
  desk(x, 1.4, D / 2 - 0.45, Math.PI, pal.wood, scr, pal.fabric2, true);
  plant(x, W / 2 - 0.5, -D / 2 + 0.5, 1.1, "tall");
  plant(x, -W / 2 + 0.5, D / 2 - 0.5, 0.9, "snake");
  atWindow(x, 0, -1.6);
  downlights(x, 3, 2, 1.2);
  x.lamps.push({ x: -W / 2 + 1.0, y: 1.0, z: 0.3 });
  x.views.push(
    { x: W / 2 - 0.8, z: D / 2 - 0.9, yaw: yawTo(W / 2 - 0.8, D / 2 - 0.9, -W / 2, -D / 3), pitch: -0.12 },
    { x: W / 2 - 1.0, z: -D / 2 + 1.4, yaw: yawTo(W / 2 - 1.0, -D / 2 + 1.4, -W / 2, D / 3), pitch: -0.12 },
    { x: -W / 2 + 3.6, z: D / 2 - 1.0, yaw: 0.15, pitch: -0.05 },
  );
}

function ward(x: Ctx) {
  const { room, pal } = x;
  const W = room.w;
  const D = room.d;
  for (let b = 0; b < 4; b++) {
    const bx = -W / 2 + 1.6 + b * ((W - 3.2) / 3);
    atWall(x, 2, -bx, () => {
      x.k.box(0, 0.25, 1.05, 0.95, 0.35, 2.0, 0xe9ecef);
      x.k.soft(0, 0.6, 1.05, 0.9, 0.14, 1.95, 0xffffff, 0.05);
      x.k.soft(0, 0.7, 1.35, 0.92, 0.06, 1.25, pal.fabric, 0.03);
      x.k.soft(0, 0.74, 0.35, 0.6, 0.12, 0.32, 0xffffff, 0.05);
      x.k.box(0, 0.25, 0.04, 1.0, 0.9, 0.06, 0xdee2e6);
      for (const sx of [-0.4, 0.4]) for (const sz of [0.15, 1.95]) x.k.cyl(sx, 0, sz, 0.03, 0.03, 0.25, 0x868e96, 6);
      // Curtain on a rail round the bed.
      x.k.box(0.95, 0.15, 1.05, 0.02, 2.2, 2.0, b % 2 ? 0xa8dadc : 0xcde7e1, { layer: "solid" });
      x.k.box(0, 2.6, 1.05, 2.0, 0.02, 2.1, 0xadb5bd, { noAo: true });
      x.k.box(-0.85, 0, 0.35, 0.45, 0.8, 0.45, 0xf1f3f5);
      x.k.box(0.75, 0.0, 0.25, 0.04, 1.6, 0.04, 0x868e96);
      x.k.box(0.75, 1.5, 0.25, 0.3, 0.22, 0.04, 0x16191d);
      x.k.box(0.75, 1.52, 0.275, 0.26, 0.18, 0.005, 0x51cf66, { layer: "glow" });
      x.k.shadow(0, 1.05, 1.3, 2.4, 0.3);
    });
  }
  // Visitors' chairs and a nurse.
  for (let c = 0; c < 4; c++) chair(x, -W / 2 + 1.0 + c * ((W - 3.2) / 3) + 0.6, 0.2, Math.PI, pal.fabric, pal.metal);
  plant(x, W / 2 - 0.5, -D / 2 + 0.5, 1.0, "tall");
  linearLights(x, 2, "x", 0xf6fbff);
  huddle(x, 0, -D / 2 + 1.4, 2, 0.5);
  atWindow(x, 0, W / 2 - 1.2);
  x.views.push(
    { x: -W / 2 + 0.9, z: -D / 2 + 1.0, yaw: yawTo(-W / 2 + 0.9, -D / 2 + 1.0, W / 4, D / 2), pitch: -0.15 },
    { x: W / 2 - 0.9, z: 0.4, yaw: Math.PI / 2 + 0.3, pitch: -0.08 },
  );
}

function shop(x: Ctx) {
  const { room, rnd, sheet } = x;
  const W = room.w;
  const D = room.d;
  const prod = sheet.paint(320, 200, (c, w, h) => products(c, w, h, 4, rnd));
  for (let r = 0; r < 2; r++) {
    const sz = -0.4 + r * 1.6;
    x.k.at(-0.6, 0, sz, 0, () => {
      x.k.box(0, 0, 0, 3.0, 1.5, 0.7, 0xe9ecef);
      for (const f of [-1, 1]) x.k.quad(0, 0.78, f * 0.355, 2.9, 1.3, 0xffffff, { layer: "tex", ry: f < 0 ? Math.PI : 0 }, prod);
      x.k.shadow(0, 0, 3.3, 1.0, 0.3);
    });
  }
  // Fridges along the west wall, glowing.
  atWall(x, 3, 0.2, () => {
    x.k.box(0, 0, 0.38, 3.0, 2.1, 0.75, 0xdee2e6);
    x.k.quad(0, 1.1, 0.76, 2.9, 1.8, 0xffffff, { layer: "texGlow" }, prod);
    x.k.quad(0, 1.1, 0.77, 2.9, 1.8, 0xffffff, { layer: "glass" });
  });
  counterRun(x, W / 2 - 1.2, D / 2 - 1.4, -Math.PI / 2, 2.0, 0x1971c2, 0xf1f3f5, true);
  x.k.box(W / 2 - 1.2, 1.05, D / 2 - 1.6, 0.4, 0.3, 0.3, 0x2b2b2b);
  wallSign(x, 2, 0.5, 2.5, "Open 24/7", 0x1971c2, 0xffffff, 1.8, 0.4);
  linearLights(x, 3, "z");
  huddle(x, 0.8, 0.4, 2, 0.5);
  x.views.push({ x: W / 2 - 0.7, z: -D / 2 + 0.7, yaw: yawTo(W / 2 - 0.7, -D / 2 + 0.7, -W / 3, D / 3), pitch: -0.15 }, { x: -W / 2 + 0.8, z: D / 2 - 0.6, yaw: yawTo(-W / 2 + 0.8, D / 2 - 0.6, W / 4, -D / 2), pitch: -0.1 });
}

const SHOPS = ["Mama's Kitchen", "Gadget Hub", "Fresh Mart", "Bloom & Co", "Sole Story", "Book Nook", "Sweet Tooth", "Style Lab", "Kids Corner", "Brew Bar", "Glow Beauty", "Sport Zone", "Home & Hearth", "Pixel Games"];

function mall(x: Ctx, food: boolean) {
  const { room, rnd, sheet, pal } = x;
  const W = room.w;
  const D = room.d;
  const hues = [0xe5484d, 0x1971c2, 0x2f9e44, 0xf08c00, 0x7048e8, 0xe64980, 0x0c8599, 0x5c4033];
  const names = [...SHOPS].sort(() => rnd() - 0.5);
  const n = food ? 4 : 3;
  for (const side of [2, 1, 3]) {
    const L = wallLen(room, side);
    const count = side === 2 ? n : 2;
    const sw = (L - 1.2) / count;
    for (let s = 0; s < count; s++) {
      const u = -L / 2 + 0.6 + sw * (s + 0.5);
      const hue = hues[Math.floor(rnd() * hues.length)];
      const name = food ? pickOf(rnd, ["Jollof Express", "Suya Spot", "Pizza Piazza", "Noodle Bar", "Grill House", "Smoothie Co", "Taco Town", "Bakery"]) : names.pop() ?? "Shop";
      const signUv = sheet.paint(240, 60, (c, w, h) => sign(c, w, h, name, hue, 0xffffff, { weight: 800 }));
      const inside = food
        ? sheet.paint(240, 120, (c, w, h) => {
            c.fillStyle = "#1b1e23";
            c.fillRect(0, 0, w, h);
            c.fillStyle = "#ffffff";
            c.font = "700 16px system-ui";
            for (let r = 0; r < 4; r++) c.fillText(pickOf(rnd, ["Combo", "Wrap", "Bowl", "Shake", "Grill", "Plate"]) + "   " + (1500 + Math.floor(rnd() * 40) * 100), 14, 26 + r * 26);
          })
        : sheet.paint(200, 120, (c, w, h) => products(c, w, h, 3, rnd));
      atWall(x, side, u, () => {
        x.k.box(0, 0, 0.05, sw - 0.3, 3.3, 0.1, 0x2b2d31, { noAo: true });
        x.k.quad(0, 1.5, 0.11, sw - 0.5, 2.6, 0xffffff, { layer: "texGlow" }, inside);
        x.k.box(0, 3.3, 0.12, sw - 0.2, 0.6, 0.12, hue, { noAo: true });
        x.k.quad(0, 3.6, 0.185, sw - 0.6, 0.45, 0xffffff, { layer: "texGlow" }, signUv);
        if (food) {
          x.k.box(0, 0, 0.75, sw - 0.6, 1.05, 0.6, shadeHex(hue, 0.25));
          x.k.box(0, 1.05, 0.75, sw - 0.5, 0.05, 0.7, 0xf1efea);
          spot(x, 0.3, 0.3, 0, "stand");
        } else {
          x.k.quad(0, 1.3, 0.16, sw - 0.5, 2.6, 0xffffff, { layer: "glass" });
          x.k.box(0, 0, 0.6, sw - 0.6, 0.05, 0.5, hue, { noAo: true });
        }
      });
    }
  }
  if (food) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        const tx = -W / 2 + 3.5 + i * ((W - 7) / 2);
        const tz = -D / 2 + 3.0 + j * 2.6;
        table(x, tx, tz, 0, 1.2, 0.8, 0xf1efea, pal.metal);
        for (const side of [-1, 1]) chair(x, tx + 0.3 * side, tz + side * 0.62, side < 0 ? 0 : Math.PI, pickOf(rnd, hues), pal.metal, { spot: (i + j + (side > 0 ? 1 : 0)) % 2 === 0 });
        pendant(x, tx, tz, 1.2, "cone", pal.accent);
      }
    }
  } else {
    // Planters with trees and benches in the middle.
    for (const px of [-W / 4, W / 4]) {
      x.k.box(px, 0, -0.5, 2.4, 0.5, 1.4, 0xd9d3c7);
      x.k.box(px, 0.5, -0.5, 2.3, 0.02, 1.3, 0x5c4033);
      plant(x, px - 0.6, -0.5, 1.5, "tall");
      plant(x, px + 0.6, -0.5, 1.2, "bush");
      bench(x, px, 0.6, 0, 2.0, pal.wood, pal.metal);
    }
    // A kiosk cart.
    const kx = W / 4 + 1.6;
    x.k.box(kx, 0, 2.2, 1.4, 1.0, 0.8, pal.accent);
    x.k.box(kx, 1.0, 2.2, 1.5, 0.05, 0.9, 0xf1efea);
    for (const sx of [-0.65, 0.65]) x.k.box(kx + sx, 1.05, 2.2, 0.04, 1.2, 0.04, pal.metal);
    x.k.box(kx, 2.25, 2.2, 1.8, 0.08, 1.1, 0xffffff);
    spot(x, kx, 2.8, Math.PI, "stand");
    // Skylights.
    for (let sk = 0; sk < 3; sk++) {
      const sx = (sk - 1) * (W / 3.2);
      x.k.box(sx, room.h - 0.02, -0.5, 3.4, 0.03, 2.4, 0xeaf4ff, { layer: "glow" });
      x.k.box(sx, room.h - 0.06, -0.5, 3.6, 0.06, 0.1, pal.metal, { noAo: true });
      x.k.box(sx, room.h - 0.06, -0.5, 0.1, 0.06, 2.6, pal.metal, { noAo: true });
    }
    huddle(x, -W / 4, 1.8, 2, 0.5);
  }
  linearLights(x, 3, "x", 0xfffaf0);
  x.views.push(
    { x: 0, z: -D / 2 + 1.0, yaw: Math.PI, pitch: -0.05 },
    { x: -W / 2 + 1.2, z: D / 2 - 2.2, yaw: yawTo(-W / 2 + 1.2, D / 2 - 2.2, W / 3, -D / 3), pitch: -0.06 },
    { x: W / 2 - 1.5, z: -1.2, yaw: Math.PI / 2 + 0.4, pitch: -0.05 },
  );
}

function gallery(x: Ctx, rotunda: boolean) {
  const { room, pal, rnd } = x;
  const W = room.w;
  const D = room.d;
  if (rotunda) {
    // Columns round a central sculpture.
    for (let c = 0; c < 10; c++) {
      const a = (c / 10) * Math.PI * 2;
      const r = Math.min(W, D) / 2 - 1.3;
      x.k.cyl(Math.cos(a) * r, 0, Math.sin(a) * r, 0.22, 0.25, room.h - 0.3, 0xf3efe6, 18);
      x.k.box(Math.cos(a) * r, room.h - 0.35, Math.sin(a) * r, 0.55, 0.12, 0.55, 0xe8e2d6, { noAo: true });
      x.k.box(Math.cos(a) * r, 0, Math.sin(a) * r, 0.55, 0.12, 0.55, 0xe8e2d6);
    }
    x.k.cyl(0, 0, 0, 1.1, 1.2, 0.25, 0xe8e2d6, 28);
    plinth(x, 0, 0, 0xf3efe6, pickOf(rnd, pal.art));
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * Math.PI * 2 + Math.PI / 4;
      bench(x, Math.cos(a) * 2.6, Math.sin(a) * 2.6, -a + Math.PI / 2 + Math.PI, 1.6, pal.wood, pal.wood);
    }
    x.views.push({ x: 0, z: D / 2 - 1.0, yaw: 0, pitch: -0.06 }, { x: -W / 2 + 1.0, z: 0, yaw: -Math.PI / 2, pitch: 0.05 });
    huddle(x, 1.5, -1.5, 2, 0.45);
    return;
  }
  // Paintings along the walls, each with a spotlight.
  for (const s of [1, 2, 3]) {
    const L = wallLen(room, s);
    const n = Math.max(1, Math.floor(L / 3.2));
    for (let p = 0; p < n; p++) {
      const u = -L / 2 + (L / n) * (p + 0.5);
      const w = 1.0 + rnd() * 0.9;
      const h = 0.8 + rnd() * 0.7;
      art(x, s, u, 1.75, w, h);
      atWall(x, s, u, () => {
        x.k.box(0, room.h - 0.3, 1.0, 0.1, 0.1, 0.18, 0x1f1f1f, { noAo: true, rx: 0.5 });
        x.k.cyl(0, room.h - 0.36, 0.9, 0.04, 0.04, 0.01, 0xfff1d6, 10, { layer: "glow" });
      });
      if (p % 2 === 0) {
        const [px, pz, ry] = onWall(room, s, u);
        x.spots.push({ x: px + Math.sin(ry) * 1.5, z: pz + Math.cos(ry) * 1.5, ry: ry + Math.PI, pose: "stand", y: 0 });
      }
    }
    atWall(x, s, 0, () => x.k.box(0, room.h - 0.25, 1.0, wallLen(room, s) - 0.4, 0.03, 0.05, 0x1f1f1f, { noAo: true }));
  }
  // Sculptures and benches in the middle.
  plinth(x, -W / 4, 0, 0xf6f4f0, pickOf(rnd, pal.art));
  plinth(x, W / 4, 0.3, 0xf6f4f0, pickOf(rnd, pal.art));
  bench(x, 0, 0.4, 0, 2.2, pal.wood, pal.wood);
  bench(x, 0, -1.2, Math.PI, 2.2, pal.wood, pal.wood);
  wallSign(x, 2, 0, room.h - 0.9, x.info.name, 0xfbfaf8, 0x2b2b2b, 3.2, 0.45, false);
  x.views.push(
    { x: -W / 2 + 1.2, z: -D / 2 + 1.4, yaw: yawTo(-W / 2 + 1.2, -D / 2 + 1.4, W / 4, D / 2), pitch: -0.05 },
    { x: W / 2 - 1.2, z: D / 2 - 1.2, yaw: yawTo(W / 2 - 1.2, D / 2 - 1.2, -W / 3, -D / 2), pitch: -0.04 },
    { x: 0, z: -D / 2 + 1.0, yaw: Math.PI, pitch: -0.02 },
  );
}

function library(x: Ctx) {
  const { room, pal } = x;
  const W = room.w;
  const D = room.d;
  for (const s of [1, 2, 3]) {
    const L = wallLen(room, s);
    const n = Math.floor((L - 0.8) / 1.9);
    for (let b = 0; b < n; b++) bookshelf(x, s, -((n - 1) * 1.9) / 2 + b * 1.9, 1.8, Math.min(room.h - 0.4, 3.0));
  }
  for (let t = 0; t < 2; t++) {
    const tz = -0.9 + t * 2.2;
    table(x, 0, tz, 0, 3.4, 1.1, pal.wood, pal.wood);
    for (let c = 0; c < 3; c++) {
      chair(x, -1.1 + c * 1.1, tz - 0.75, 0, pal.fabric, pal.wood, { spot: c !== 1 });
      chair(x, -1.1 + c * 1.1, tz + 0.75, Math.PI, pal.fabric, pal.wood, { spot: c === 1 });
    }
    for (const lx of [-0.9, 0.9]) {
      x.k.box(lx, 0.75, tz, 0.12, 0.02, 0.12, pal.metal);
      x.k.cyl(lx, 0.77, tz, 0.012, 0.012, 0.3, pal.metal, 6);
      x.k.cyl(lx, 1.02, tz, 0.08, 0.16, 0.12, 0x2f6650, 12, { open: true });
      x.k.ball(lx, 1.02, tz, 0.05, 0xfff1d6, { layer: "glow", w: 8, h: 6 });
    }
    pendant(x, 0, tz, 1.3, "drum", pal.metal);
  }
  rugAt(x, W / 2 - 2.2, -D / 2 + 1.8, 2.6, 2.0, 0, pal.fabric2, pal.fabric);
  armchair(x, W / 2 - 2.8, -D / 2 + 1.8, Math.PI / 2, pal.fabric);
  armchair(x, W / 2 - 1.5, -D / 2 + 1.8, -Math.PI / 2, pal.fabric);
  // A globe.
  x.k.cyl(-W / 2 + 1.2, 0, -D / 2 + 1.0, 0.18, 0.2, 0.05, pal.wood, 14);
  x.k.cyl(-W / 2 + 1.2, 0.05, -D / 2 + 1.0, 0.03, 0.03, 0.75, pal.wood, 8);
  x.k.ball(-W / 2 + 1.2, 1.05, -D / 2 + 1.0, 0.27, 0x7fb8c9, { w: 16, h: 12 });
  x.k.ring(-W / 2 + 1.2, 1.05, -D / 2 + 1.0, 0.3, 0.012, pal.metal, { rz: 0.4 });
  x.lamps.push({ x: 0, y: room.h - 1.5, z: 0.2 });
  atWindow(x, 0, -W / 4);
  x.views.push(
    { x: 0, z: D / 2 - 0.9, yaw: 0, pitch: -0.1 },
    { x: -W / 2 + 1.0, z: -D / 2 + 1.8, yaw: yawTo(-W / 2 + 1.0, -D / 2 + 1.8, W / 3, D / 2), pitch: -0.05 },
  );
}

function lecture(x: Ctx) {
  const { room, pal, rnd, sheet } = x;
  const W = room.w;
  const D = room.d;
  const wb = sheet.paint(300, 140, (c, w, h) => board(c, w, h, rnd() < 0.5, rnd));
  atWall(x, 2, 0, () => {
    x.k.box(0, 0.9, 0.02, 4.2, 1.5, 0.04, 0x5c4033, { noAo: true });
    x.k.quad(0, 1.65, 0.045, 4.0, 1.35, 0xffffff, { layer: "tex" }, wb);
  });
  counterRun(x, -2.6, D / 2 - 1.3, Math.PI, 1.0, pal.wood, pal.wood, true);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      const tz = D / 2 - 3.2 - r * 1.5;
      const tx = (c ? 1 : -1) * 2.4;
      table(x, tx, tz, 0, 3.2, 0.55, pal.wood, pal.metal);
      for (let s = 0; s < 3; s++) chair(x, tx - 1.0 + s * 1.0, tz - 0.5, 0, pickOf(rnd, [pal.fabric, pal.fabric2]), pal.metal, { spot: (r + s + c) % 2 === 0 });
    }
  }
  linearLights(x, 3, "x");
  for (const s of solidSides(room)) if (s !== 2) art(x, s, 0, 1.7, 1.1, 0.8);
  x.views.push({ x: 0, z: -D / 2 + 0.9, yaw: Math.PI, pitch: -0.12 }, { x: W / 2 - 1.0, z: D / 2 - 1.0, yaw: yawTo(W / 2 - 1.0, D / 2 - 1.0, -W / 4, -D / 2), pitch: -0.1 });
}

function terminal(x: Ctx) {
  const { room, pal, rnd, sheet, info } = x;
  const W = room.w;
  const D = room.d;
  const deps = sheet.paint(400, 220, (c, w, h) => departures(c, w, h, info.places, "Departures", rnd));
  // The big board, hanging.
  x.k.box(0, room.h - 2.7, D / 2 - 3.0, 4.6, 2.3, 0.2, 0x16191d, { noAo: true });
  x.k.quad(0, room.h - 1.55, D / 2 - 3.11, 4.4, 2.15, 0xffffff, { layer: "texGlow", ry: Math.PI }, deps);
  for (const sx of [-2.0, 2.0]) x.k.cyl(sx, room.h - 0.4, D / 2 - 3.0, 0.01, 0.01, 0.4, 0x2b2b2b, 4, { noAo: true });
  // Check-in desks along the back.
  for (let d = 0; d < 4; d++) {
    const dx = -W / 2 + 3 + d * ((W - 6) / 3);
    counterRun(x, dx, D / 2 - 1.2, Math.PI, 1.6, 0x2b2d31, 0xf1efea, d % 2 === 0);
    const sg = sheet.paint(160, 40, (c, w, h) => sign(c, w, h, `Check-in ${d + 1}`, 0x1864ab, 0xffffff, { weight: 700 }));
    x.k.quad(dx, 2.3, D / 2 - 0.2, 1.4, 0.35, 0xffffff, { layer: "texGlow", ry: Math.PI }, sg);
  }
  // Rows of seats facing the windows.
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const bx = (c ? 1 : -1) * W * 0.22;
      const bz = -D / 2 + 2.6 + r * 1.8;
      for (let s = 0; s < 5; s++) chair(x, bx - 1.6 + s * 0.8, bz, Math.PI, pickOf(rnd, [pal.fabric, 0x2b2d31]), pal.metal, { spot: (s + r + c) % 3 === 0 });
    }
  }
  plant(x, 0, -D / 2 + 3.4, 1.5, "palm");
  plant(x, -W / 2 + 0.7, -D / 2 + 0.7, 1.4, "tall");
  plant(x, W / 2 - 0.7, -D / 2 + 0.7, 1.4, "tall");
  linearLights(x, 4, "z", 0xffffff);
  huddle(x, W / 4, 0.8, 3, 0.55);
  atWindow(x, 0, -2.0);
  x.views.push(
    { x: 0, z: D / 2 - 4.4, yaw: 0, pitch: -0.04 },
    { x: -W / 2 + 1.5, z: D / 2 - 2.6, yaw: yawTo(-W / 2 + 1.5, D / 2 - 2.6, W / 3, -D / 2), pitch: -0.04 },
    { x: W / 2 - 1.2, z: -D / 2 + 1.4, yaw: yawTo(W / 2 - 1.2, -D / 2 + 1.4, -W / 2, D / 3), pitch: -0.08 },
  );
}

function controlCab(x: Ctx) {
  const { room, pal, rnd, sheet } = x;
  const W = room.w;
  const D = room.d;
  const radar = sheet.paint(160, 160, (c, w, h) => {
    c.fillStyle = "#06140c";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#2fd158";
    c.lineWidth = 2;
    for (let r = 1; r <= 3; r++) {
      c.beginPath();
      c.arc(w / 2, h / 2, (r * w) / 7, 0, Math.PI * 2);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(w / 2, h / 2);
    c.lineTo(w * 0.9, h * 0.25);
    c.stroke();
    for (let b = 0; b < 5; b++) {
      c.fillStyle = "#9ff0b0";
      c.fillRect(rnd() * w, rnd() * h, 5, 5);
    }
  });
  for (let s = 0; s < 4; s++) {
    atWall(x, s, 0, () => {
      x.k.box(0, 0, 0.45, wallLen(room, s) - 1.2, 0.95, 0.6, 0x3a3f45);
      x.k.box(0, 0.95, 0.45, wallLen(room, s) - 1.1, 0.04, 0.66, 0x2b2f33);
      for (let m = -1; m <= 1; m++) x.k.quad(m * 1.1, 1.18, 0.3, 0.7, 0.42, 0xffffff, { layer: "texGlow", rx: -0.4 }, radar);
    });
  }
  officeChair(x, 0.6, -0.6, Math.PI, pal.fabric);
  officeChair(x, -0.6, 0.6, 0, pal.fabric);
  x.views.push({ x: 0, z: 0.4, yaw: 0, pitch: -0.12 }, { x: 0, z: -0.4, yaw: Math.PI, pitch: -0.12 }, { x: W / 4, z: D / 4, yaw: Math.PI * 0.25, pitch: -0.2 });
}

function concourse(x: Ctx, station: boolean) {
  const { room, pal, rnd, sheet, info } = x;
  const W = room.w;
  const D = room.d;
  if (station) {
    const deps = sheet.paint(400, 220, (c, w, h) => departures(c, w, h, info.places, `${info.city} Central`, rnd));
    atWall(x, 2, 0, () => {
      x.k.box(0, 1.6, 0.06, 4.2, 2.1, 0.12, 0x16191d, { noAo: true });
      x.k.quad(0, 2.65, 0.125, 4.0, 1.95, 0xffffff, { layer: "texGlow" }, deps);
    });
    for (let g = 0; g < 4; g++) {
      const gx = -2.2 + g * 1.0;
      x.k.box(gx, 0, D / 2 - 2.0, 0.22, 1.0, 1.1, 0x2b2d31);
      x.k.box(gx + 0.12, 0.85, D / 2 - 2.0 + 0.4, 0.06, 0.06, 0.06, g % 2 ? 0x51cf66 : 0xe5484d, { layer: "glow" });
    }
    for (let m = 0; m < 2; m++) {
      x.k.box(W / 2 - 0.6, 0, -1.0 + m * 1.0, 0.6, 1.7, 0.5, 0x1864ab);
      x.k.box(W / 2 - 0.34, 1.0, -1.0 + m * 1.0, 0.02, 0.4, 0.3, 0x9fd3ff, { layer: "glow" });
    }
  } else {
    const items = ["Snacks", "Drinks", "Team Shop"];
    items.forEach((label, i) => {
      const u = -W / 2 + 2.4 + i * ((W - 4.8) / 2);
      const hue = [0xe03131, 0x1971c2, 0x2f9e44][i];
      const sg = sheet.paint(200, 60, (c, w, h) => sign(c, w, h, label, hue, 0xffffff, { weight: 800 }));
      atWall(x, 2, u, () => {
        x.k.box(0, 0, 0.4, 2.4, 1.05, 0.7, shadeHex(hue, 0.2));
        x.k.box(0, 1.05, 0.4, 2.5, 0.05, 0.8, 0xf1efea);
        x.k.quad(0, 2.6, 0.06, 2.2, 0.6, 0xffffff, { layer: "texGlow" }, sg);
      });
      const [px, pz, ry] = onWall(room, 2, u);
      x.spots.push({ x: px + Math.sin(ry) * 0.15, z: pz + Math.cos(ry) * 0.15, ry: ry, pose: "stand", y: 0 });
    });
    // Team banners on the side walls.
    for (const s of [1, 3]) {
      for (let b = 0; b < 2; b++) {
        atWall(x, s, (b - 0.5) * 2.2, () => {
          x.k.box(0, 1.2, 0.03, 0.8, 2.2, 0.02, b ? pal.accent : pal.fabric, { noAo: true });
          x.k.box(0, 2.0, 0.045, 0.5, 0.5, 0.005, 0xffffff, { noAo: true });
        });
      }
    }
  }
  for (let b = 0; b < 3; b++) bench(x, -W / 2 + 2.5 + b * ((W - 5) / 2), -D / 2 + 1.6, Math.PI, 2.0, pal.wood, pal.metal, 2);
  plant(x, -W / 2 + 0.6, -D / 2 + 0.6, 1.3, "tall");
  plant(x, W / 2 - 0.6, -D / 2 + 0.6, 1.3, "tall");
  linearLights(x, 3, "x");
  huddle(x, 0, 0.2, 3, 0.6);
  x.views.push(
    { x: 0, z: -D / 2 + 0.9, yaw: Math.PI, pitch: -0.04 },
    { x: -W / 2 + 1.0, z: D / 2 - 1.2, yaw: yawTo(-W / 2 + 1.0, D / 2 - 1.2, W / 3, -D / 2), pitch: -0.05 },
  );
}

function skybridge(x: Ctx) {
  const { room, pal } = x;
  const W = room.w;
  for (const sx of [-W / 2 + 0.05, W / 2 - 0.05]) {
    atWall(x, sx < 0 ? 3 : 1, 0, () => {
      x.k.box(0, 0, 0.03, 1.4, 2.3, 0.06, pal.metal, { noAo: true });
      x.k.box(0, 0, 0.065, 1.3, 2.2, 0.01, 0xbfd9ea, { layer: "glass" });
    });
  }
  for (const bx of [-3.0, 3.0]) {
    bench(x, bx, 0.9, Math.PI, 1.8, pal.wood, pal.metal, 2);
    x.k.box(bx + 1.6, 0, 0.9, 0.6, 0.55, 0.6, 0xd9d3c7);
    plant(x, bx + 1.6, 0.9, 0.7, "bush");
  }
  // A coin telescope by the glass.
  x.k.cyl(0, 0, -0.9, 0.12, 0.16, 0.05, pal.metal, 12);
  x.k.cyl(0, 0.05, -0.9, 0.04, 0.04, 1.0, pal.metal, 8);
  x.k.cyl(0, 1.12, -0.9, 0.07, 0.09, 0.4, 0x2b2d31, 12, { rx: Math.PI / 2 - 0.3 });
  linearLights(x, 1, "z");
  x.spots.push({ x: 1.2, z: -1.0, ry: Math.PI, pose: "stand", y: 0 }, { x: -1.6, z: -1.0, ry: Math.PI - 0.3, pose: "stand", y: 0 });
  x.views.push({ x: -W / 2 + 1.0, z: 0.4, yaw: -Math.PI / 2 + 0.25, pitch: -0.12 }, { x: W / 2 - 1.0, z: 0.0, yaw: Math.PI / 2 - 0.2, pitch: -0.15 }, { x: 0, z: 0.6, yaw: 0, pitch: -0.3 });
}

function clockroom(x: Ctx) {
  const { room, pal } = x;
  // The dials: round windows on every side, with the hands silhouetted against the city.
  for (let s = 0; s < 4; s++) {
    atWall(x, s, 0, () => {
      const r = 1.2;
      const cy = 2.0;
      x.k.ring(0, cy, -0.02, r, 0.06, 0x3a2f25, { noAo: true });
      for (let h = 0; h < 12; h++) {
        const a = (h / 12) * Math.PI * 2;
        x.k.box(Math.sin(a) * r * 0.86, cy + Math.cos(a) * r * 0.86 - 0.08, -0.05, 0.05, h % 3 ? 0.1 : 0.18, 0.02, 0x2a221b, { rz: -a, noAo: true });
      }
      x.k.box(0, cy, -0.05, 0.05, 0.75, 0.02, 0x2a221b, { rz: 0.5 + s, noAo: true });
      x.k.box(0, cy, -0.05, 0.06, 0.5, 0.02, 0x2a221b, { rz: -1.2 + s * 0.3, noAo: true });
      x.k.cyl(0, cy - 0.03, -0.06, 0.06, 0.06, 0.06, 0x2a221b, 10, { rx: Math.PI / 2, noAo: true });
      // The wall round the dial.
      const T = 0.25;
      x.k.box(0, 0, -T / 2, 4.6, cy - r, T, pal.wall, { noAo: true });
      x.k.box(0, cy + r, -T / 2, 4.6, room.h - cy - r, T, pal.wall, { noAo: true });
      for (const sx of [-1, 1]) x.k.box(sx * (r + 1.2), cy - r, -T / 2, 2.4, 2 * r, T, pal.wall, { noAo: true });
      // Corner fillets so the opening is round.
      for (let q = 0; q < 16; q++) {
        const a = (q / 16) * Math.PI * 2;
        const cx = Math.sin(a) * (r + 0.32);
        const cz = Math.cos(a) * (r + 0.32);
        x.k.box(cx, cy + cz - 0.3, -T / 2, 0.62, 0.62, T, pal.wall, { noAo: true, rz: a });
      }
      x.k.quad(0, cy, -0.1, 2 * r, 2 * r, 0xfff6dc, { layer: "glass" });
    });
  }
  // The mechanism: a frame with gears and shafts out to each dial.
  x.k.box(0, 0, 0, 1.2, 1.5, 0.9, pal.wood);
  for (let g = 0; g < 3; g++) {
    const gy = 1.0 + g * 0.35;
    const gr = 0.35 - g * 0.08;
    x.k.cyl(-0.3 + g * 0.3, gy, 0.47, gr, gr, 0.05, 0xc9a227, 20, { rx: Math.PI / 2 });
    for (let t = 0; t < 12; t++) {
      const a = (t / 12) * Math.PI * 2;
      x.k.box(-0.3 + g * 0.3 + Math.cos(a) * gr, gy + Math.sin(a) * gr - 0.03, 0.47, 0.06, 0.06, 0.05, 0xb08d57, { rz: a });
    }
  }
  x.k.cyl(0, 2.0, 0, 0.04, 0.04, 2.0, pal.metal, 8, { rz: Math.PI / 2 });
  x.k.cyl(0, 2.0, 0, 0.04, 0.04, 2.0, pal.metal, 8, { rx: Math.PI / 2 });
  x.k.box(1.6, 0, 1.4, 0.5, 0.5, 0.5, pal.wood);
  x.spots.push({ x: -1.2, z: 0.9, ry: 0.6, pose: "stand", y: 0 }, { x: 1.0, z: -1.2, ry: -2.4, pose: "stand", y: 0 });
  x.lamps.push({ x: 0, y: 3.4, z: 0 });
  x.k.ball(0, 3.6, 0, 0.12, 0xfff1d6, { layer: "glow" });
  x.views.push({ x: 0, z: 1.2, yaw: 0, pitch: 0.12 }, { x: -1.2, z: 0, yaw: Math.PI / 2, pitch: 0.1 });
}

// ---------------------------------------------------------------- room plans per theme

function plan(theme: Theme, rnd: Rng, variant?: InteriorInfo["variant"]): { room: Room; pal: Pal; build: (x: Ctx) => void } {
  const home = pickOf(rnd, HOME);
  if (theme === "lobby" && variant === "small") {
    return { room: { w: 6, d: 6, h: 4.2, walls: ["tall", "solid", "solid", "solid"] }, pal: { ...LIBRARY, floor: ["stone", 0xd8d2c4, 0xc4bca9] }, build: (x) => lobby(x, "small") };
  }
  switch (theme) {
    case "living":
    case "upstairs":
      return {
        room: { w: 8.4, d: 6.6, h: 2.8, walls: ["glass", rnd() < 0.5 ? "windows" : "solid", "solid", "solid"], accentSide: rnd() < 0.5 ? 2 : -1, curtains: rnd() < 0.6 ? mixHex(home.fabric2, 0xfaf6ef, 0.55) : undefined, frame: rnd() < 0.5 ? 0xffffff : 0x2b2b2b },
        pal: home,
        build: (x) => livingRoom(x, theme === "upstairs"),
      };
    case "lobby":
      return { room: { w: 14, d: 10, h: 4.4, walls: ["glass", "glass", "solid", "solid"] }, pal: pickOf(rnd, CORP), build: (x) => lobby(x, "corp") };
    case "hotelLobby":
      return { room: { w: 16, d: 12, h: 5.6, walls: ["tall", "solid", "solid", "solid"], curtains: undefined }, pal: pickOf(rnd, CORP), build: (x) => lobby(x, "hotel") };
    case "reception":
      return { room: { w: 13, d: 9, h: 3.4, walls: ["glass", "windows", "solid", "solid"] }, pal: CLINIC, build: (x) => lobby(x, "clinic") };
    case "police":
      return { room: { w: 11, d: 8, h: 3.2, walls: ["windows", "solid", "solid", "solid"] }, pal: POLICE, build: (x) => lobby(x, "police") };
    case "office":
      return { room: { w: 15, d: 10.5, h: 3.3, walls: ["glass", "glass", "solid", "glass"] }, pal: pickOf(rnd, OFFICE), build: (x) => officeFloor(x, "office") };
    case "detectives":
      return { room: { w: 12, d: 9, h: 3.1, walls: ["band", "solid", "solid", "solid"] }, pal: POLICE, build: (x) => officeFloor(x, "detectives") };
    case "control":
      return { room: { w: 12, d: 9, h: 3.4, walls: ["band", "solid", "solid", "solid"] }, pal: pickOf(rnd, OFFICE), build: (x) => officeFloor(x, "control") };
    case "lounge":
      return { room: { w: 16, d: 14, h: 3.6, walls: ["glass", "glass", "glass", "glass"], frame: 0x1f1f1f }, pal: pickOf(rnd, LOUNGE), build: (x) => loungeFloor(x, rnd() < 0.4) };
    case "suite":
      return { room: { w: 9, d: 7, h: 3.2, walls: ["tall", "solid", "solid", "solid"], curtains: mixHex(home.fabric2, 0xf3ede2, 0.5), accentSide: 2 }, pal: home, build: suite };
    case "ward":
      return { room: { w: 12, d: 7.5, h: 3.0, walls: ["band", "solid", "solid", "solid"] }, pal: CLINIC, build: ward };
    case "shop":
      return { room: { w: 8, d: 5.4, h: 3.0, walls: ["glass", "solid", "solid", "solid"] }, pal: pickOf(rnd, OFFICE), build: shop };
    case "mall":
      return { room: { w: 22, d: 14, h: 5.0, walls: ["glass", "solid", "solid", "solid"] }, pal: pickOf(rnd, CORP), build: (x) => mall(x, false) };
    case "foodcourt":
      return { room: { w: 20, d: 13, h: 4.5, walls: ["band", "solid", "solid", "solid"] }, pal: pickOf(rnd, OFFICE), build: (x) => mall(x, true) };
    case "gallery":
      return { room: { w: 18, d: 11, h: 5.0, walls: ["tall", "solid", "solid", "solid"] }, pal: pickOf(rnd, GALLERY), build: (x) => gallery(x, false) };
    case "rotunda":
      return { room: { w: 12, d: 12, h: 6.0, walls: ["tall", "tall", "tall", "tall"] }, pal: pickOf(rnd, GALLERY), build: (x) => gallery(x, true) };
    case "library":
      return { room: { w: 15, d: 9, h: 4.2, walls: ["tall", "solid", "solid", "solid"] }, pal: LIBRARY, build: library };
    case "lecture":
      return { room: { w: 13, d: 9, h: 3.6, walls: ["windows", "windows", "solid", "solid"] }, pal: LIBRARY, build: lecture };
    case "terminal":
      return { room: { w: 24, d: 14, h: 7, walls: ["glass", "glass", "solid", "glass"] }, pal: pickOf(rnd, CORP), build: terminal };
    case "tower":
      return { room: { w: 6, d: 6, h: 3, walls: ["glass", "glass", "glass", "glass"], frame: 0x2b2f33 }, pal: pickOf(rnd, OFFICE), build: controlCab };
    case "concourse":
      return { room: { w: 16, d: 9, h: 4.5, walls: ["glass", "solid", "solid", "solid"] }, pal: pickOf(rnd, CORP), build: (x) => concourse(x, x.info.variant === "station") };
    case "skybridge":
      return { room: { w: 12, d: 3.6, h: 3.0, walls: ["glass", "solid", "glass", "solid"], frame: 0x2b2f33 }, pal: pickOf(rnd, CORP), build: skybridge };
    case "clockroom":
      return { room: { w: 4.6, d: 4.6, h: 4.4, walls: ["solid", "solid", "solid", "solid"] }, pal: { ...LIBRARY, wall: 0x8a6a4f, floor: ["planks", 0x8a6a4f, 0x6b5440] }, build: clockroom };
    default:
      return { room: { w: 8, d: 6, h: 3, walls: ["glass", "solid", "solid", "solid"] }, pal: home, build: (x) => livingRoom(x, false) };
  }
}

// ---------------------------------------------------------------- putting it together

export function createInterior(info: InteriorInfo): Interior {
  const rnd = rngFrom(info.key);
  const { room, pal, build } = plan(info.theme, rnd, info.variant);
  const sheet = new Sheet(1024);
  const k = new Kit();
  const x: Ctx = { k, sheet, rnd, pal, room, spots: [], views: [], lamps: [], info };
  // The clock tower's dials make their own walls.
  if (info.theme !== "clockroom") shell(x);
  else k.box(0, room.h, 0, room.w + 0.6, 0.12, room.d + 0.6, pal.ceiling, { noAo: true });
  build(x);
  const tex = sheet.finish();

  const mats = {
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    foliage: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    tex: new THREE.MeshLambertMaterial({ vertexColors: true, map: tex }),
    texGlow: new THREE.MeshBasicMaterial({ vertexColors: true, map: tex }),
    glass: new THREE.MeshBasicMaterial({ color: 0xd6e9f5, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide }),
  };
  const group = k.build(mats);

  // The floor: a repeating texture, a little shiny for stone and marble.
  const [fstyle, fa, fb] = pal.floor;
  const { tex: ftex, metres } = floorTexture(fstyle, fa, fb, rnd);
  ftex.repeat.set(room.w / metres, room.d / metres);
  const shiny = fstyle === "marble" || fstyle === "stone" || fstyle === "terrazzo" || fstyle === "concrete" || fstyle === "checker";
  const floorMat = shiny
    ? new THREE.MeshPhongMaterial({ map: ftex, shininess: 70, specular: 0x2a2a2a })
    : new THREE.MeshLambertMaterial({ map: ftex });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(room.w, room.d).rotateX(-Math.PI / 2), floorMat);
  floorMesh.name = "floor";
  group.add(floorMesh);
  const shadows = shadowMesh(k.shadows);
  if (shadows) group.add(shadows);

  // Light: soft light from the sky through the windows, a little sun, and warm lamps at night.
  const hemi = new THREE.HemisphereLight(0xfff8ee, 0xd8cdbf, 1.35);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.1);
  sun.position.set(-3, 6, -8);
  const warm = x.lamps.slice(0, 2).map((p) => {
    const l = new THREE.PointLight(0xffc98a, 0, Math.max(room.w, room.d) * 0.9, 1.6);
    l.position.set(p.x, p.y, p.z);
    return l;
  });
  // Pools of light on the floor under the lamps (seen in the evening).
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffd8a0, alphaMap: blobTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  for (const p of x.lamps.slice(0, 6)) {
    const m = new THREE.Mesh(poolGeo, poolMat);
    m.position.set(p.x, 0.01, p.z);
    m.scale.setScalar(Math.min(4, Math.max(2, p.y * 1.4)));
    m.renderOrder = 1;
    group.add(m);
  }
  group.add(hemi, sun, ...warm);

  // Every room gets at least a couple of places to stand, and two ways to look.
  if (!x.views.length) x.views.push({ x: 0, z: room.d / 2 - 1, yaw: 0, pitch: -0.08 });
  for (let s = x.spots.length; s < 6; s++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.min(room.w, room.d) * 0.25;
    x.spots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, ry: rnd() * 6, pose: "stand", y: 0 });
  }
  // Nobody stands right in front of where you look from; then mix up who goes where.
  const clear = x.spots.filter((sp) => x.views.every((v) => Math.hypot(sp.x - v.x, sp.z - v.z) > 2.2));
  const spots = (clear.length >= 4 ? clear : x.spots).sort(() => rnd() - 0.5);

  const allMats: THREE.Material[] = [...Object.values(mats), floorMat];
  if (shadows) allMats.push(shadows.material as THREE.Material);
  allMats.push(poolMat);
  const baseOpacity = new Map(allMats.map((m) => [m, m.opacity]));
  const baseTransparent = new Map(allMats.map((m) => [m, m.transparent]));

  let night = -1;
  function setNight(n: number) {
    if (Math.abs(n - night) < 0.01) return;
    night = n;
    hemi.intensity = 1.35 - 0.75 * n;
    hemi.color.setHex(mixHex(0xfff8ee, 0xffd9a8, n));
    hemi.groundColor.setHex(mixHex(0xd8cdbf, 0x8a6f58, n));
    sun.intensity = 1.1 * (1 - n) + 0.08;
    sun.color.setHex(mixHex(0xfff1dc, 0x9fb4ff, n));
    for (const l of warm) l.intensity = 2.2 * n;
    mats.glow.color.setScalar(0.8 + 0.45 * n);
    poolMat.opacity = 0.32 * n;
    mats.glass.opacity = 0.09 + 0.05 * n;
    baseOpacity.set(mats.glass, mats.glass.opacity);
    baseOpacity.set(poolMat, poolMat.opacity);
  }
  let alpha = 1;
  function setAlpha(a: number) {
    if (a === alpha) return;
    alpha = a;
    for (const m of allMats) {
      const fade = a < 0.999;
      m.transparent = fade || !!baseTransparent.get(m);
      m.opacity = (baseOpacity.get(m) ?? 1) * a;
      m.depthWrite = !m.transparent || (fade && !baseTransparent.get(m));
    }
    group.visible = a > 0.002;
  }

  function dispose() {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of allMats) m.dispose();
    tex.dispose();
    ftex.dispose();
    poolGeo.dispose();
  }

  return { group, views: x.views, spots, w: room.w, d: room.d, setNight, setAlpha, dispose };
}
