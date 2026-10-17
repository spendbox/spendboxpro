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
import { blobTexture, cssHex, Kit, mixHex, pickOf, rngFrom, shadeHex, shadowMesh, type Rng, type UvRect } from "./kit";
import { createAthletes, createCrowd, faceRig, runRig, skinOf, type AthleteLook } from "./arenas";
import { clubBeat } from "./dance-moves";
import type { Act, Spot } from "./figures";
import type { Block, InteractKind } from "./interact";
import type { Theme } from "./levels";
import { fireEngineKit } from "./vehicles";
import { CELL_M, FURNITURE, SIZES, danceFloorOf, gardenParts, gardenWalls, itemSize, planWalls, roomAt, roomStyle, shapeOf, type HomePlan, type PlanRoom } from "@/lib/home-plan";
import { BANK_ROBBERY } from "../activities/games";

/** Something to use in a room (its id is made by the city view). */
export type RoomItem = { kind: InteractKind; label: string; x: number; y: number; z: number; r: number };

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
  /** The city's flavour ("ng", "uk"...), for local food on menus. */
  flavor?: string;
  /** Built bigger than usual (a famous landmark's floors): the room's width and depth times this. */
  scale?: number;
  /** A player's planned home: which plan, and which of its floors (docs/HOME_PLANNER.md). */
  home?: { plan: HomePlan; level: number };
};

export type Interior = {
  /** The room, in metres (turn it to face the city). */
  group: THREE.Group;
  views: View[];
  spots: Spot[];
  /** Every seat, in a fixed order (seat n is the same for everyone). */
  seats: Spot[];
  /** Things to use (the bar, darts, the DJ booth...). */
  items: RoomItem[];
  /** Where furniture stands (for walking round it). */
  blocks: Block[];
  /** A club's dance floor (middle and size, metres), where players dance. */
  danceFloor?: { x: number; z: number; w: number; d: number };
  /** A club's dance poles (room metres). */
  poles?: { x: number; z: number }[];
  /** Room size (metres), for keeping things inside. */
  w: number;
  d: number;
  setNight(n: number): void;
  setAlpha(a: number): void;
  /** Moving parts (club lights...). */
  update(time: number): void;
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
  /** Places against the outside walls that need plain wall, not a window (a TV, the stairs...), metres. */
  keepClear?: { x: number; z: number; w: number; d: number }[];
  /** A hole in the ceiling (the stairwell going up), metres. */
  ceilingHole?: { x: number; z: number; w: number; d: number };
  /** Window frames. */
  frame?: number;
  /** Ceiling height of window heads (from the top). */
  headDrop?: number;
  /** No walls or ceiling (the stadium: it brings its own sky), and no floor (it has its own). */
  noShell?: boolean;
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
  /** Things to use, and what people do in the spots being made now. */
  items: RoomItem[];
  act?: Act;
  /** Animated extras (not merged): added to the room after it's built. */
  extras: THREE.Object3D[];
  anim: ((time: number) => void)[];
  /** Night-only light: the club stays dark and colourful whatever the time. */
  dark?: boolean;
  /** Called when day turns to night (0..1), for things with their own colours (a sky). */
  nightHooks: ((n: number) => void)[];
  /** Places nobody walks (besides under the furniture), e.g. over the stadium's lower tiers. */
  blocks: Block[];
  /** A club's dance floor. */
  dance?: { x: number; z: number; w: number; d: number };
  /** A club's dance poles (where pole dancers stand round them). */
  poles?: { x: number; z: number }[];
  /** Textures made for extras (disposed with the room). */
  textures: THREE.Texture[];
};

/** Something to use, at a point in the current drawing frame. */
function item(x: Ctx, kind: InteractKind, label: string, lx: number, ly: number, lz: number, r = 0.7) {
  const p = x.k.world(lx, ly, lz);
  x.items.push({ kind, label, x: p.x, y: p.y, z: p.z, r });
}

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
        k.box(0, 0, -T / 2, full, room.h, T, color, { noAo: true, grad: [0.84, 1.04, room.h] });
        k.box(0, 0, 0.008, L, 0.09, 0.02, pal.trim, { noAo: true });
        return;
      }
      const laid = windowLayout(kind, L, room.h, room.headDrop ?? 0.15);
      const { s, hh } = laid;
      // No window (or curtains) behind a TV, the stairs, a wardrobe...: plain wall there.
      const open = room.keepClear?.length ? laid.open.filter(([a, b]) => !blockedOpening(room, side, a, b)) : laid.open;
      if (s > 0) k.box(0, 0, -T / 2, full, s, T, color, { noAo: true, grad: [0.84, 1.04, room.h] });
      k.box(0, hh, -T / 2, full, room.h - hh, T, color, { noAo: true, grad: [0.84, 1.04, room.h] });
      let prev = -full / 2;
      for (const [a, b] of open) {
        if (a - prev > 0.001) k.box((prev + a) / 2, s, -T / 2, a - prev, hh - s, T, color, { noAo: true, grad: [0.84, 1.04, room.h] });
        prev = b;
      }
      if (full / 2 - prev > 0.001) k.box((prev + full / 2) / 2, s, -T / 2, full / 2 - prev, hh - s, T, color, { noAo: true, grad: [0.84, 1.04, room.h] });
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
  // The ceiling (round the stairwell, when the stairs go up through it).
  const hole = room.ceilingHole;
  if (!hole) k.box(0, room.h, 0, room.w + 0.6, 0.12, room.d + 0.6, pal.ceiling, { noAo: true });
  else {
    const X0 = -room.w / 2 - 0.3, X1 = room.w / 2 + 0.3, Z0 = -room.d / 2 - 0.3, Z1 = room.d / 2 + 0.3;
    const hx0 = hole.x - hole.w / 2, hx1 = hole.x + hole.w / 2, hz0 = hole.z - hole.d / 2, hz1 = hole.z + hole.d / 2;
    const slab = (x0: number, x1: number, z0: number, z1: number) => {
      if (x1 - x0 > 0.01 && z1 - z0 > 0.01) k.box((x0 + x1) / 2, room.h, (z0 + z1) / 2, x1 - x0, 0.12, z1 - z0, pal.ceiling, { noAo: true });
    };
    slab(X0, X1, Z0, hz0);
    slab(X0, X1, hz1, Z1);
    slab(X0, hx0, hz0, hz1);
    slab(hx1, X1, hz0, hz1);
    // The stairwell's sides, up into the floor above.
    for (const [cx, cz, w, d] of [[hole.x, hz0, hole.w, 0.04], [hole.x, hz1, hole.w, 0.04], [hx0, hole.z, 0.04, hole.d], [hx1, hole.z, 0.04, hole.d]] as const) k.box(cx, room.h, cz, w, 0.5, d, pal.wall, { noAo: true });
  }
}

/** Is the window from a to b along this wall behind something that needs plain wall? */
function blockedOpening(room: Room, side: number, a: number, b: number) {
  const [, , ry] = onWall(room, side, 0);
  const ix = Math.sin(ry), iz = Math.cos(ry);
  for (let u = a - 0.3; u <= b + 0.3; u += 0.2) {
    const [px, pz] = onWall(room, side, u);
    for (const dIn of [0.25, 0.6, 1.0]) {
      const x = px + ix * dIn, z = pz + iz * dIn;
      if (room.keepClear!.some((r) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2)) return true;
    }
  }
  return false;
}

/** The inside walls with no windows, for pictures and shelves. */
const solidSides = (room: Room) => [0, 1, 2, 3].filter((s) => room.walls[s] === "solid");

// ---------------------------------------------------------------- furniture

function spot(x: Ctx, lx: number, lz: number, ry: number, pose: Spot["pose"], seat?: number) {
  const p = x.k.world(lx, 0, lz);
  x.spots.push({ x: p.x, z: p.z, ry: x.k.worldYaw(ry), pose, y: pose === "sit" ? seat ?? 0.46 : 0, act: x.act });
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
  atWall(x, side, u - len / 4, () => {
    x.act = "cook";
    spot(x, 0, 0.85, Math.PI, "stand");
    x.act = undefined;
  });
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
    if (!x.items.some((it) => it.kind === "stairs")) item(x, "stairs", "Lifts", 0, 0, 0.9, 0.9);
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
  if (x.room.walls[side] !== "solid" && !x.items.some((it) => it.kind === "window")) {
    x.items.push({ kind: "window", label: "Look out", x: px + Math.sin(ry) * 0.9 + Math.cos(ry) * 1.2, y: 0, z: pz + Math.cos(ry) * 0.9 - Math.sin(ry) * 1.2, r: 0.7 });
  }
}

// ---------------------------------------------------------------- games, music and fun

function poolTable(x: Ctx, px: number, pz: number, ry: number) {
  const { k, pal } = x;
  k.at(px, 0, pz, ry, () => {
    for (const sx of [-0.95, 0.95]) for (const sz of [-0.45, 0.45]) k.box(sx, 0, sz, 0.12, 0.7, 0.12, pal.wood);
    k.box(0, 0.62, 0, 2.3, 0.14, 1.3, pal.wood);
    k.box(0, 0.76, 0, 2.06, 0.02, 1.06, 0x1f7a4d);
    for (const sx of [-1.07, 1.07]) k.box(sx, 0.76, 0, 0.12, 0.05, 1.3, shadeHex(pal.wood, 0.15));
    for (const sz of [-0.59, 0.59]) k.box(0, 0.76, sz, 2.3, 0.05, 0.12, shadeHex(pal.wood, 0.15));
    for (let b = 0; b < 7; b++) k.ball(-0.3 + (b % 3) * 0.06 + Math.floor(b / 3) * 0.05, 0.81, -0.06 + (b % 3) * 0.06, 0.028, [0xffd43b, 0x1c3faa, 0xe03131, 0x7048e8, 0xf08c00, 0x2f9e44, 0x1b1b1b][b], { w: 8, h: 6 });
    k.ball(0.5, 0.81, 0, 0.028, 0xffffff, { w: 8, h: 6 });
    k.cyl(0.2, 0.8, 0.3, 0.008, 0.012, 1.4, 0xd9c7a7, 6, { rz: Math.PI / 2 + 0.05, noAo: true });
    k.shadow(0, 0, 2.6, 1.6, 0.3);
    k.box(0, 1.6, 0, 1.4, 0.08, 0.3, 0x2b2b2b, { noAo: true });
    k.box(0, 1.56, 0, 1.3, 0.02, 0.24, 0xfff1d6, { layer: "glow" });
    item(x, "pool", "Pool table", 0, 0, 0.9, 1.2);
  });
}

function dartboard(x: Ctx, px: number, pz: number) {
  const { k } = x;
  k.at(px, 0, pz, Math.PI, () => {
    k.box(0, 0, 0, 0.5, 0.06, 0.4, 0x2b2b2b);
    k.box(0, 0.06, 0, 0.08, 1.55, 0.08, 0x2b2b2b);
    k.cyl(0, 1.73, 0.06, 0.24, 0.24, 0.04, 0x1b1b1b, 24, { rx: Math.PI / 2 });
    k.cyl(0, 1.73, 0.1, 0.2, 0.2, 0.01, 0xe9dcc3, 20, { rx: Math.PI / 2, noAo: true });
    k.cyl(0, 1.73, 0.11, 0.13, 0.13, 0.01, 0x2f9e44, 20, { rx: Math.PI / 2, noAo: true });
    k.cyl(0, 1.73, 0.12, 0.07, 0.07, 0.01, 0xe9dcc3, 20, { rx: Math.PI / 2, noAo: true });
    k.cyl(0, 1.73, 0.13, 0.025, 0.025, 0.01, 0xe03131, 12, { rx: Math.PI / 2, noAo: true });
    k.shadow(0, 0, 0.6, 0.5, 0.25);
    item(x, "darts", "Darts", 0, 0, 1.4, 0.9);
  });
}

function jukebox(x: Ctx, px: number, pz: number, ry: number) {
  const { k } = x;
  k.at(px, 0, pz, ry, () => {
    k.soft(0, 0, 0, 0.85, 1.35, 0.55, 0x7a2e3a, 0.08);
    k.ball(0, 1.32, 0, 0.42, 0x7a2e3a, { part: 0.5, sz: 0.62, w: 16, h: 8 });
    k.box(0, 0.75, 0.28, 0.6, 0.45, 0.02, 0xffd43b, { layer: "glow" });
    for (const sx of [-0.36, 0.36]) k.box(sx, 0.1, 0.28, 0.06, 1.3, 0.02, 0xff922b, { layer: "glow" });
    k.ring(0, 1.3, 0.25, 0.32, 0.03, 0x74c0fc, { layer: "glow", arc: Math.PI });
    k.shadow(0, 0, 1.1, 0.8, 0.3);
    item(x, "jukebox", "Jukebox", 0, 0, 0.75, 0.8);
  });
}

function grandPiano(x: Ctx, px: number, pz: number, ry: number) {
  const { k } = x;
  k.at(px, 0, pz, ry, () => {
    for (const [lx, lz] of [[-0.6, -0.5], [0.6, -0.5], [0.1, 0.7]]) k.cyl(lx, 0, lz, 0.05, 0.04, 0.68, 0x111111, 8);
    k.soft(0, 0.62, 0.05, 1.45, 0.3, 1.5, 0x111111, 0.12);
    k.box(0, 0.92, 0.25, 1.3, 0.03, 1.1, 0x161616, { rx: -0.55, noAo: true });
    k.box(0, 0.76, -0.78, 1.25, 0.05, 0.2, 0xf8f9fa, { noAo: true });
    for (let b = 0; b < 18; b++) k.box(-0.58 + b * 0.068, 0.81, -0.74, 0.03, 0.02, 0.11, 0x111111, { noAo: true });
    k.box(0, 0, -1.25, 0.9, 0.48, 0.38, 0x111111);
    k.shadow(0, 0, 1.9, 2.3, 0.3);
    spot(x, 0, -1.25, 0, "sit", 0.5);
    item(x, "piano", "Grand piano", 0, 0, -1.0, 1.0);
  });
}

function arcadeCabinet(x: Ctx, px: number, pz: number, ry: number, color: number) {
  const { k, sheet, rnd } = x;
  const scr = sheet.paint(64, 48, (c, w, h) => {
    c.fillStyle = "#0b0f2a";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      c.fillStyle = ["#ff6b6b", "#ffd43b", "#69db7c", "#4dabf7", "#da77f2"][i % 5];
      c.fillRect(rnd() * w, rnd() * h, 4 + rnd() * 6, 4 + rnd() * 6);
    }
  });
  k.at(px, 0, pz, ry, () => {
    k.box(0, 0, 0, 0.7, 1.75, 0.7, color);
    k.box(0, 0.95, -0.36, 0.6, 0.1, 0.25, 0x1b1b1b, { rx: -0.3 });
    k.quad(0, 1.35, -0.355, 0.52, 0.4, 0xffffff, { layer: "texGlow", ry: Math.PI }, scr);
    k.box(0, 1.7, -0.36, 0.66, 0.16, 0.02, shadeHex(color, -0.4), { layer: "glow" });
    for (const bx of [-0.1, 0.05, 0.15]) k.ball(bx, 1.02, -0.42, 0.025, [0xe03131, 0xffd43b, 0x4dabf7][Math.floor(rnd() * 3)], { layer: "glow", w: 6, h: 4 });
    k.shadow(0, 0, 0.9, 0.9, 0.3);
  });
}

function slotMachine(x: Ctx, px: number, pz: number, ry: number) {
  const { k } = x;
  k.at(px, 0, pz, ry, () => {
    k.soft(0, 0, 0, 0.75, 1.55, 0.6, 0xd4af37, 0.06);
    k.box(0, 1.0, -0.31, 0.56, 0.3, 0.02, 0xffffff, { layer: "glow" });
    for (let r = 0; r < 3; r++) k.cyl(-0.18 + r * 0.18, 1.15, -0.33, 0.05, 0.05, 0.01, [0xe03131, 0x2f9e44, 0xe03131][r], 12, { layer: "glow", rx: Math.PI / 2 });
    k.cyl(0.42, 0.9, 0, 0.025, 0.025, 0.5, 0xadb5bd, 8);
    k.ball(0.42, 1.42, 0, 0.06, 0xe03131, { w: 8, h: 6 });
    k.box(0, 1.55, -0.3, 0.7, 0.18, 0.04, 0xe03131, { layer: "glow" });
    k.shadow(0, 0, 0.9, 0.8, 0.3);
  });
}

function photoBooth(x: Ctx, px: number, pz: number, ry: number, color: number) {
  const { k } = x;
  k.at(px, 0, pz, ry, () => {
    k.box(0, 0, 0, 1.2, 2.2, 1.0, color);
    k.box(0, 0.2, -0.505, 0.7, 1.8, 0.02, 0x1b1b1b, { noAo: true });
    for (let f = 0; f < 5; f++) k.box(-0.3 + f * 0.15, 0.25, -0.53, 0.13, 1.7, 0.03, 0xc92a2a, { noAo: true });
    k.box(0, 1.95, -0.51, 1.0, 0.22, 0.02, 0xfff3bf, { layer: "glow" });
    k.shadow(0, 0, 1.4, 1.3, 0.3);
    item(x, "photo", "Photo booth", 0, 0, -0.9, 0.8);
  });
}

function karaokeCorner(x: Ctx, px: number, pz: number, ry: number) {
  const { k, sheet } = x;
  const lyr = sheet.paint(160, 90, (c, w, h) => {
    c.fillStyle = "#14102b";
    c.fillRect(0, 0, w, h);
    c.font = "700 14px system-ui";
    c.textAlign = "center";
    c.fillStyle = "#ffd43b";
    c.fillText("♪ Sing along! ♪", w / 2, 30);
    c.fillStyle = "#ffffff";
    c.fillText("la la la la...", w / 2, 58);
  });
  k.at(px, 0, pz, ry, () => {
    k.box(0, 0, 0.3, 1.8, 0.25, 1.4, 0x2b2b2b);
    k.box(0, 0.9, 0.95, 1.4, 0.85, 0.06, 0x111111, { noAo: true });
    k.quad(0, 1.33, 0.92, 1.3, 0.75, 0xffffff, { layer: "texGlow", ry: Math.PI }, lyr);
    k.cyl(0, 0.25, 0.1, 0.012, 0.012, 1.25, 0x868e96, 6);
    k.ball(0, 1.52, 0.1, 0.04, 0x343a40, { w: 8, h: 6 });
    k.shadow(0, 0.3, 2.0, 1.6, 0.3);
    item(x, "karaoke", "Karaoke", 0, 0.25, 0.1, 0.9);
  });
}

// ---------------------------------------------------------------- the club
//
// Clubs are big (a dance floor for a crowd, booths all round, a long bar, a DJ up on a stage) and
// each one is built in one of four designs, so no two feel the same:
//   crystal:   red and magenta faceted walls, a waving canopy of crystal lights over the floor,
//              glowing crystal pillars, a gold light strip round the floor;
//   ice:       violet and cyan, a cyan crystal canopy, lantern chandeliers, pink velvet booths;
//   gold:      a lounge of gold mosaic pillars, a mirrored ceiling, teal tufted sofas, red velvet;
//   warehouse: a Lagos rave in a warehouse, truss rigs of moving lights, a giant LED screen, lasers.
// The floor is dark and glossy with patterns of light thrown across it (no tiles, no mirror ball).
// Pole stages stand by the dance floor: players can dance there (the "Pole dance" move) and
// everyone else watches and sprays money.

export type ClubStyle = "crystal" | "ice" | "gold" | "warehouse";
export const CLUB_STYLES: ClubStyle[] = ["crystal", "ice", "gold", "warehouse"];

type ClubLook = {
  room: { w: number; d: number; h: number };
  wall: number;
  accentWall: number;
  ceiling: number;
  floor: [number, number];
  /** Booth fabric, the light colours (main, second, the floor's edge), and the gobo colours. */
  fabric: number;
  neon: number;
  neon2: number;
  edge: number;
  gobos: number[];
  /** Beams from the ceiling and their colour. */
  beams: number;
};

const CLUB_LOOKS: Record<ClubStyle, ClubLook> = {
  crystal: { room: { w: 30, d: 22, h: 7 }, wall: 0x8a1030, accentWall: 0xb3124a, ceiling: 0x14060f, floor: [0x16101c, 0x0b0810], fabric: 0xf4f0f2, neon: 0xff2d95, neon2: 0x7c3aed, edge: 0xffc61a, gobos: [0x3b82f6, 0xff2d55, 0x22d3ee], beams: 0xff4fd8 },
  ice: { room: { w: 28, d: 22, h: 6.5 }, wall: 0x4c1d95, accentWall: 0x6d28d9, ceiling: 0x0c0a24, floor: [0x101629, 0x0a0d1a], fabric: 0xe879f9, neon: 0x22d3ee, neon2: 0xe879f9, edge: 0x67e8f9, gobos: [0x22d3ee, 0xa5f3fc, 0xe879f9], beams: 0x22d3ee },
  gold: { room: { w: 28, d: 20, h: 5.5 }, wall: 0x3b1d14, accentWall: 0x5c1f1a, ceiling: 0x2a1a10, floor: [0x1c1210, 0x120b09], fabric: 0x0f5c5c, neon: 0xffb347, neon2: 0xff3d7f, edge: 0xffb347, gobos: [0xffb347, 0xff6b6b, 0xffd8a8], beams: 0xffc078 },
  warehouse: { room: { w: 36, d: 26, h: 9 }, wall: 0x3a3d42, accentWall: 0x2b2e33, ceiling: 0x111214, floor: [0x1d1f22, 0x141517], fabric: 0x1c1c1c, neon: 0x39ff14, neon2: 0x22d3ee, edge: 0x39ff14, gobos: [0x39ff14, 0x22d3ee, 0xff2d95], beams: 0xb2f2bb },
};

/** The room and colours for a club in this design. */
export function clubPlan(style: ClubStyle): { room: Room; pal: Pal } {
  const L = CLUB_LOOKS[style];
  return {
    room: { ...L.room, walls: ["solid", "solid", "solid", "solid"] },
    pal: { ...LOUNGE[0], wall: L.wall, accentWall: L.accentWall, trim: shadeHex(L.wall, 0.2), ceiling: L.ceiling, floor: ["marble", L.floor[0], L.floor[1]], fabric: L.fabric, fabric2: L.neon2, accent: L.neon, metal: style === "gold" ? 0xc9a227 : 0x2b2b2b },
  };
}

/** A texture drawn on a canvas, kept with the room (disposed with it). */
function canvasTex(x: Ctx, w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  x.textures.push(t);
  return t;
}
const glowMat = (color: number, map?: THREE.Texture, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/** A pattern of light like a gobo projector throws: petals of dashes round a ring. */
function goboTexture(x: Ctx, kind: number) {
  return canvasTex(x, 256, 256, (c, w, h) => {
    c.translate(w / 2, h / 2);
    c.fillStyle = "#fff";
    c.shadowColor = "#fff";
    c.shadowBlur = 6;
    const arms = kind === 0 ? 14 : kind === 1 ? 9 : 20;
    for (let a = 0; a < arms; a++) {
      c.save();
      c.rotate((a / arms) * Math.PI * 2);
      for (let r = 0; r < (kind === 2 ? 3 : 5); r++) {
        const at = 30 + r * 19;
        const len = kind === 1 ? 14 : 10;
        c.beginPath();
        c.ellipse(at, 0, len, kind === 1 ? 6 : 4, kind === 0 ? 0.5 : 0, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
    if (kind === 2) {
      c.lineWidth = 6;
      c.strokeStyle = "#fff";
      c.beginPath();
      c.arc(0, 0, 112, 0, Math.PI * 2);
      c.stroke();
    }
  });
}

function club(x: Ctx, style: ClubStyle) {
  const { room, pal, rnd, info, k } = x;
  const L = CLUB_LOOKS[style];
  const W = room.w;
  const D = room.d;
  const H = room.h;
  x.dark = true;
  const neon = L.neon;
  const neon2 = L.neon2;

  // ---- walls: each design dresses them its own way.
  if (style === "crystal" || style === "ice") {
    // Faceted panels: triangles in two shades of the wall colour, like cut glass.
    const facets = canvasTex(x, 512, 256, (c, w, h) => {
      const a = cssHex(shadeHex(L.wall, 0.15));
      const b = cssHex(shadeHex(L.wall, -0.15));
      const s = 64;
      for (let i = 0; i < w / s; i++)
        for (let j = 0; j < h / s; j++) {
          c.fillStyle = (i + j) % 2 ? a : b;
          c.beginPath();
          c.moveTo(i * s, j * s);
          c.lineTo(i * s + s, j * s);
          c.lineTo(i * s, j * s + s);
          c.fill();
          c.fillStyle = (i + j) % 2 ? b : a;
          c.beginPath();
          c.moveTo(i * s + s, j * s);
          c.lineTo(i * s + s, j * s + s);
          c.lineTo(i * s, j * s + s);
          c.fill();
        }
    }, true);
    for (const side of [1, 3]) {
      const len = wallLen(room, side);
      const t = facets.clone();
      t.repeat.set(len / 6, (H - 1.2) / 3);
      t.needsUpdate = true;
      x.textures.push(t);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H - 1.2), new THREE.MeshLambertMaterial({ map: t, color: 0xffffff }));
      const [px, pz, ry] = onWall(room, side, 0);
      m.position.set(px + Math.sin(ry) * 0.02, 1.2 + (H - 1.2) / 2, pz + Math.cos(ry) * 0.02);
      m.rotation.y = ry;
      x.extras.push(m);
    }
  }
  if (style === "gold" || style === "crystal") {
    // Velvet curtains in the corners and either side of the DJ.
    const velvet = style === "gold" ? 0x7a0f1d : 0x5c0b2a;
    for (const [side, u] of [[0, -W / 2 + 1.2], [0, W / 2 - 1.2], [2, -6.2], [2, 6.2]] as const) {
      atWall(x, side, u, () => {
        for (let f = 0; f < 6; f++) k.box(-0.75 + f * 0.3, 0, 0.18 + (f % 2) * 0.06, 0.28, H - 0.2, 0.12, shadeHex(velvet, (f % 2) * 0.12 - 0.04), { grad: [0.7, 1.1, H] });
        k.box(0, H - 0.5, 0.2, 2.0, 0.5, 0.3, shadeHex(velvet, 0.1));
      });
    }
  }
  if (style === "warehouse") {
    // Brick and concrete, painted murals in neon.
    const brick = canvasTex(x, 256, 256, (c, w, h) => {
      c.fillStyle = "#2d2f33";
      c.fillRect(0, 0, w, h);
      for (let j = 0; j < 16; j++)
        for (let i = 0; i < 8; i++) {
          c.fillStyle = `hsl(10, ${12 + ((i * 7 + j * 13) % 10)}%, ${16 + ((i * 11 + j * 5) % 7)}%)`;
          c.fillRect(i * 32 + (j % 2) * 16 + 1, j * 16 + 1, 30, 14);
        }
    }, true);
    for (const side of [0, 1, 3]) {
      const len = wallLen(room, side);
      const t = brick.clone();
      t.repeat.set(len / 4, H / 4);
      t.needsUpdate = true;
      x.textures.push(t);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshLambertMaterial({ map: t }));
      const [px, pz, ry] = onWall(room, side, 0);
      m.position.set(px + Math.sin(ry) * 0.02, H / 2, pz + Math.cos(ry) * 0.02);
      m.rotation.y = ry;
      x.extras.push(m);
    }
    // Steel beams and roof trusses.
    for (let b = -2; b <= 2; b++) k.box(b * (W / 5), H - 0.6, 0, 0.3, 0.4, D, 0x3b3f45, { noAo: true });
  }

  // Light strips round the ceiling and along the bottom of the walls.
  for (const [cx, cz, cw, cd] of [[0, -D / 2 + 0.05, W, 0.05], [0, D / 2 - 0.05, W, 0.05], [-W / 2 + 0.05, 0, 0.05, D], [W / 2 - 0.05, 0, 0.05, D]] as const) {
    k.box(cx, H - 0.14, cz, cw, 0.05, cd, neon, { layer: "glow" });
    k.box(cx, 0.08, cz, cw, 0.04, cd, neon2, { layer: "glow" });
  }

  // ---- the dance floor: big, in the middle, a strip of light round its edge that pulses on the beat.
  const fw = Math.min(14, W * 0.45);
  const fd = Math.min(10, D * 0.45);
  const fz = -0.8;
  x.dance = { x: 0, z: fz, w: fw, d: fd };
  const edgeMat = new THREE.MeshBasicMaterial({ color: L.edge });
  const edge = new THREE.Group();
  for (const [ex, ez, ew, ed] of [[0, fz - fd / 2, fw + 0.12, 0.06], [0, fz + fd / 2, fw + 0.12, 0.06], [-fw / 2, fz, 0.06, fd], [fw / 2, fz, 0.06, fd]] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ew, 0.03, ed), edgeMat);
    m.position.set(ex, 0.03, ez);
    edge.add(m);
  }
  x.extras.push(edge);
  item(x, "dance", "Dance floor", 0, 0.07, fz, 2.2);
  // The regulars dancing (players get the middle; a bigger crowd joins them, see the city view).
  x.act = "dance";
  for (let d = 0; d < 26; d++) {
    const a = rnd() * Math.PI * 2;
    const r = 1.6 + rnd() * (Math.min(fw, fd) / 2 - 2);
    spot(x, Math.cos(a) * r * (fw / fd), fz + Math.sin(a) * r, rnd() * 6, "stand");
  }
  x.act = undefined;

  // Patterns of light thrown over the floor, turning and drifting (and changing colour on the beat).
  const goboTex = [0, 1, 2].map((g) => goboTexture(x, g));
  const gobos: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; ox: number; oz: number; sp: number; ph: number; r: number }[] = [];
  const goboGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  for (let g = 0; g < 16; g++) {
    const mat = glowMat(L.gobos[g % L.gobos.length], goboTex[g % 3], 0.75);
    const m = new THREE.Mesh(goboGeo, mat);
    const size = 2.2 + rnd() * 1.8;
    m.scale.set(size, 1, size);
    m.renderOrder = 2;
    const inFloor = g < 10;
    const ox = inFloor ? (rnd() - 0.5) * fw : (rnd() - 0.5) * (W - 4);
    const oz = inFloor ? fz + (rnd() - 0.5) * fd : (rnd() - 0.5) * (D - 4);
    m.position.set(ox, 0.025 + g * 0.0004, oz);
    gobos.push({ m, mat, ox, oz, sp: 0.15 + rnd() * 0.35, ph: rnd() * 6, r: inFloor ? 1.2 : 2.5 });
    x.extras.push(m);
  }

  // ---- over the floor: the crystal canopy (crystal, ice), a mirrored ceiling (gold) or a truss rig (warehouse).
  const animCanopy: ((t: number) => void)[] = [];
  if (style === "crystal" || style === "ice") {
    const dots = canvasTex(x, 64, 64, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(255,255,255,0.9)");
      g.addColorStop(0.6, "rgba(255,255,255,0.15)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }, true);
    const cw = fw + 3;
    const cd = fd + 3;
    dots.repeat.set(cw / 0.16, cd / 0.16);
    const geo = new THREE.PlaneGeometry(cw, cd, 48, 36).rotateX(-Math.PI / 2);
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    // A billowing sheet, lowest in the middle, like the crystal ceilings of the big clubs.
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      const r = Math.hypot(px / (cw / 2), pz / (cd / 2));
      pos.setY(i, -0.9 * Math.max(0, 1 - r * r) - 0.25 * Math.sin(px * 0.7) * Math.cos(pz * 0.6));
    }
    geo.computeVertexNormals();
    const mat = glowMat(neon, dots, 0.95);
    const canopy = new THREE.Mesh(geo, mat);
    canopy.position.set(0, H - 0.5, fz);
    x.extras.push(canopy);
    const base = new THREE.Color(neon);
    const alt = new THREE.Color(style === "ice" ? 0xffffff : neon2);
    animCanopy.push((t) => {
      // A wave of light running across it, the colour swinging between the two.
      dots.offset.set(t * 0.6, Math.sin(t * 0.4) * 0.5);
      mat.color.copy(base).lerp(alt, 0.5 + 0.5 * Math.sin(t * 0.6));
    });
    // Crystal pillars at the corners of the floor: glowing columns wrapped in the same lights.
    const colDots = dots.clone();
    colDots.repeat.set(10, (H / 0.16) | 0);
    colDots.needsUpdate = true;
    x.textures.push(colDots);
    const colMat = glowMat(style === "ice" ? 0xa5f3fc : 0xffd6e8, colDots, 0.9);
    for (const [cx, cz] of [[-fw / 2 - 1.4, fz - fd / 2 - 1.2], [fw / 2 + 1.4, fz - fd / 2 - 1.2], [-fw / 2 - 1.4, fz + fd / 2 + 1.2], [fw / 2 + 1.4, fz + fd / 2 + 1.2]] as const) {
      k.cyl(cx, 0, cz, 0.42, 0.42, H, 0x2a1030, 20);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, H, 24, 1, true), colMat);
      col.position.set(cx, H / 2, cz);
      x.extras.push(col);
      k.shadow(cx, cz, 1.1, 1.1, 0.4);
    }
    animCanopy.push((t) => {
      colDots.offset.y = -t * 0.35;
    });
  }
  if (style === "ice") {
    // Lantern chandeliers: hexagonal cages of brass with candles glowing inside.
    for (const [lx, lz] of [[-W / 2 + 4, -D / 2 + 4], [W / 2 - 4, -D / 2 + 4], [-W / 2 + 4, D / 2 - 5], [W / 2 - 4, D / 2 - 5], [-W / 2 + 4, 0], [W / 2 - 4, 0]] as const) {
      const top = H - 1.1;
      k.cyl(lx, top + 0.6, lz, 0.01, 0.01, H - top - 0.6, 0x8a7a5a, 4);
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2;
        k.cyl(lx + Math.cos(a) * 0.45, top - 0.6, lz + Math.sin(a) * 0.45, 0.012, 0.012, 1.2, 0xc9a227, 4);
      }
      k.cyl(lx, top + 0.55, lz, 0.05, 0.5, 0.12, 0xc9a227, 6);
      k.cyl(lx, top - 0.65, lz, 0.5, 0.05, 0.1, 0xc9a227, 6);
      for (let c = 0; c < 5; c++) k.cyl(lx + Math.cos(c * 1.25) * 0.2, top - 0.5, lz + Math.sin(c * 1.25) * 0.2, 0.025, 0.025, 0.2 + (c % 2) * 0.1, 0xfff1d6, 6, { layer: "glow" });
      k.ball(lx, top - 0.2, lz, 0.3, 0xffd8a0, { layer: "glow", sy: 1.4 });
    }
  }
  if (style === "gold") {
    // Gold mosaic pillars down both sides, and a ceiling of mirror panels catching the light.
    const mosaic = canvasTex(x, 128, 128, (c, w, h) => {
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 16; j++) {
          c.fillStyle = `hsl(${38 + ((i * 7 + j * 3) % 8)}, ${60 + ((i * 5 + j * 11) % 25)}%, ${34 + ((i * 13 + j * 7) % 22)}%)`;
          c.fillRect(i * 8, j * 8, 7, 7);
        }
    }, true);
    mosaic.repeat.set(2, 6);
    const pillarMat = new THREE.MeshPhongMaterial({ map: mosaic, shininess: 90, specular: 0x8a6a2a, emissive: 0x3a2508 });
    for (const side of [-1, 1])
      for (let p = 0; p < 4; p++) {
        const px = side * (fw / 2 + 0.8);
        const pz = -D / 2 + 4.5 + p * ((D - 9) / 3);
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.1, H, 1.1), pillarMat);
        m.position.set(px, H / 2, pz);
        x.extras.push(m);
        k.shadow(px, pz, 1.4, 1.4, 0.45);
        // Wall lamps on the pillars.
        k.cyl(px - side * 0.58, 2.2, pz, 0.09, 0.14, 0.26, 0xffd8a0, 10, { layer: "glow" });
      }
    for (let i = -3; i <= 3; i++)
      for (let j = -2; j <= 2; j++) k.box(i * (W / 7), H - 0.06, j * (D / 5), W / 7 - 0.15, 0.04, D / 5 - 0.15, 0x6b4a1c, { noAo: true, layer: "glow" });
    // Standard lamps along the booths.
    for (const side of [-1, 1])
      for (let l = 0; l < 6; l++) {
        const lx = side * (W / 2 - 2.9);
        const lz = -D / 2 + 2 + l * ((D - 4) / 5);
        k.cyl(lx, 0, lz, 0.02, 0.02, 1.6, 0xc9a227, 6);
        k.cyl(lx, 1.6, lz, 0.12, 0.2, 0.25, 0xffc878, 12, { layer: "glow" });
      }
  }
  if (style === "warehouse") {
    // Truss rigs across the room, hung with lights.
    for (const tz of [fz - fd / 2, fz + fd / 2, fz]) {
      for (const dy of [0, 0.5])
        for (const dz of [-0.25, 0.25]) k.box(0, H - 2.2 + dy, tz + dz, W - 2, 0.05, 0.05, 0x9aa0a6, { noAo: true });
      for (let s = -W / 2 + 1.5; s < W / 2 - 1; s += 0.5) k.box(s, H - 2.2, tz, 0.03, 0.5, 0.5, 0x9aa0a6, { noAo: true });
      for (let s = -6; s <= 6; s += 2) k.cyl(s, H - 2.6, tz, 0.14, 0.14, 0.3, 0x222222, 10);
    }
    // Shipping containers turned into booths' backs, stacked at the far corners.
    for (const [cx, y0, col] of [[-W / 2 + 3, 0, 0xc92a2a], [W / 2 - 3, 0, 0x1c7ed6], [-W / 2 + 3, 2.6, 0xf08c00]] as const) {
      const cz = D / 2 - 1.6;
      k.box(cx, y0, cz, 4.8, 2.6, 2.4, col);
      for (let r = -2.2; r <= 2.2; r += 0.2) k.box(cx + r, y0 + 0.1, cz - 1.21, 0.06, 2.4, 0.02, shadeHex(col, 0.2), { noAo: true });
    }
  }

  // Beams of light from the ceiling, sweeping the floor (more, and thinner, in the warehouse).
  const beamN = style === "warehouse" ? 10 : style === "gold" ? 4 : 7;
  const coneMat = glowMat(L.beams, undefined, style === "gold" ? 0.07 : 0.11);
  const coneLen = H - 0.4;
  const coneGeo = new THREE.ConeGeometry(style === "warehouse" ? 0.55 : 0.9, coneLen, 20, 1, true).translate(0, -coneLen / 2, 0);
  const cones: THREE.Mesh[] = [];
  for (let c = 0; c < beamN; c++) {
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set((c - (beamN - 1) / 2) * (fw / beamN) * 1.2, H - 0.3, fz + (c % 2 ? -fd / 4 : fd / 4));
    cones.push(cone);
    x.extras.push(cone);
  }
  // Lasers fanning out from over the DJ (not in the gold lounge).
  const lasers = new THREE.Group();
  if (style !== "gold") {
    const beamMat = glowMat(style === "warehouse" ? 0x39ff14 : neon, undefined, 0.6);
    const beamGeo = new THREE.CylinderGeometry(0.014, 0.014, D, 4).translate(0, D / 2, 0);
    for (let l = 0; l < 9; l++) {
      const b = new THREE.Mesh(beamGeo, beamMat);
      b.rotation.z = -1.1 + (l / 8) * 2.2;
      b.rotation.x = -1.25;
      lasers.add(b);
    }
    lasers.position.set(0, H - 1.0, D / 2 - 1.2);
    x.extras.push(lasers);
  }

  // ---- the DJ on a stage at the back, with a big screen behind (a giant LED wall in the warehouse).
  const name = info.name.toUpperCase().slice(0, 18);
  const screenW = style === "warehouse" ? Math.min(16, W * 0.5) : 9;
  const screenH = style === "warehouse" ? 4.6 : 2.6;
  const screenTex = canvasTex(x, 1024, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    const css = cssHex;
    g.addColorStop(0, css(shadeHex(neon2, 0.5)));
    g.addColorStop(0.5, css(shadeHex(neon, 0.35)));
    g.addColorStop(1, css(shadeHex(neon2, 0.5)));
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 0.25;
    c.fillStyle = "#fff";
    for (let i = 0; i < 40; i++) c.fillRect((i * 97) % w, 0, 3, h);
    c.globalAlpha = 1;
    c.font = "900 120px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowColor = css(neon);
    c.shadowBlur = 30;
    c.fillStyle = "#ffffff";
    c.fillText(name, w / 2, h / 2, w - 60);
  }, true);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), screenMat);
  screen.position.set(0, 1.6 + screenH / 2, D / 2 - 0.06);
  screen.rotation.y = Math.PI;
  x.extras.push(screen);
  atWall(x, 2, 0, () => {
    // The stage, a step up, with the decks on a glowing desk.
    k.box(0, 0, 1.4, 7.5, 0.35, 2.8, 0x111111);
    k.box(0, 0.35, 2.82, 7.5, 0.03, 0.03, neon, { layer: "glow" });
    k.box(0, 0.35, 1.7, 3.2, 0.95, 0.8, 0x1b1b1b);
    k.box(0, 0.4, 2.11, 3.0, 0.8, 0.02, neon2, { layer: "glow" });
    k.box(0, 1.3, 1.7, 3.3, 0.04, 0.9, 0x0d0d0d);
    for (const dx of [-0.9, 0.9]) {
      k.cyl(dx, 1.34, 1.72, 0.24, 0.24, 0.03, 0x343a40, 20);
      k.cyl(dx, 1.37, 1.72, 0.08, 0.08, 0.01, neon, 12, { layer: "glow" });
    }
    k.box(0, 1.34, 1.72, 0.5, 0.05, 0.34, 0x495057);
    // Stacks of speakers either side.
    for (const sx of [-3.0, 3.0])
      for (let s = 0; s < 3; s++) {
        k.box(sx, 0.35 + s * 1.0, 1.2, 1.1, 0.95, 0.9, 0x161616);
        k.cyl(sx, 0.35 + s * 1.0 + 0.48, 1.66, 0.3, 0.3, 0.02, 0x2b2b2b, 18, { rx: Math.PI / 2 });
      }
    k.shadow(0, 1.4, 7.8, 3.0, 0.5);
    x.act = "dj";
    spot(x, 0, 1.2, Math.PI, "stand");
    x.act = undefined;
    item(x, "dj", "DJ booth", 0, 0.5, 2.6, 1.4);
  });

  // ---- pole stages by the dance floor: a glowing disc, a chrome pole up to the ceiling.
  const chrome = new THREE.MeshPhongMaterial({ color: 0xe9ecef, shininess: 120, specular: 0xffffff, emissive: 0x222222 });
  const poleGeo = new THREE.CylinderGeometry(0.035, 0.035, H, 12).translate(0, H / 2, 0);
  const ringMats: THREE.MeshBasicMaterial[] = [];
  const poles: { x: number; z: number }[] = [
    { x: -fw / 2 - 2.8, z: fz - 1.6 },
    { x: fw / 2 + 2.8, z: fz - 1.6 },
    { x: -fw / 2 - 2.8, z: fz + 2.2 },
  ];
  for (const [i, p] of poles.entries()) {
    const pole = new THREE.Mesh(poleGeo, chrome);
    pole.position.set(p.x, 0, p.z);
    x.extras.push(pole);
    k.cyl(p.x, 0, p.z, 1.15, 1.2, 0.04, 0x0d0d0d, 32);
    k.cyl(p.x, 0, p.z, 0.12, 0.16, 0.08, 0xadb5bd, 16);
    k.cyl(p.x, H - 0.1, p.z, 0.16, 0.12, 0.1, 0xadb5bd, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: i % 2 ? neon : L.edge });
    ringMats.push(ringMat);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.2, 48).rotateX(-Math.PI / 2), ringMat);
    ring.position.set(p.x, 0.045, p.z);
    x.extras.push(ring);
    // A pink spotlight on each pole.
    const spotCone = new THREE.Mesh(new THREE.ConeGeometry(1.1, H - 0.2, 24, 1, true).translate(0, -(H - 0.2) / 2, 0), glowMat(style === "gold" ? 0xffa8a8 : 0xff6ad5, undefined, 0.09));
    spotCone.position.set(p.x, H - 0.1, p.z);
    x.extras.push(spotCone);
    item(x, "pole", "Pole", p.x, 0.9, p.z, 0.9);
  }
  x.poles = poles;

  // ---- the bar: long, backlit, shelves of glowing bottles, stools all along.
  atWall(x, 1, -1.0, () => {
    const len = Math.min(11, D - 6);
    k.box(0, 0, 1.7, len, 1.1, 0.75, style === "gold" ? 0x2a1a10 : 0x111111);
    k.box(0, 1.1, 1.7, len + 0.1, 0.06, 0.85, style === "gold" ? 0xc9a227 : 0x2b2b2b);
    k.box(0, 0.06, 2.08, len, 0.03, 0.02, neon, { layer: "glow" });
    k.box(0, 0.95, 2.08, len, 0.02, 0.02, neon2, { layer: "glow" });
    k.box(0, 1.1, 0.12, len, 2.3, 0.2, shadeHex(neon2, 0.55), { layer: "glow" });
    for (let row = 0; row < 3; row++) {
      k.box(0, 1.25 + row * 0.62, 0.3, len, 0.03, 0.3, 0x2b2b2b);
      for (let b = 0; b < Math.floor(len / 0.32); b++) k.cyl(-len / 2 + 0.2 + b * 0.32, 1.28 + row * 0.62, 0.3, 0.045, 0.045, 0.3, pickOf(rnd, [0x2f9e44, 0xe8c07d, 0xb6d7e6, 0x7a2e3a, 0xff922b, 0xfab005]), 8, { layer: "glow" });
    }
    spot(x, -1.5, 1.0, 0, "stand");
    spot(x, 1.5, 1.0, 0, "stand");
    x.act = "sip";
    const stools = Math.floor(len / 0.85);
    for (let s2 = 0; s2 < stools; s2++) chair(x, -len / 2 + 0.5 + s2 * 0.85, 2.45, 0, neon2, 0x343a40, { stool: true });
    x.act = undefined;
    item(x, "bar", "Bar", 0, 0, 2.7, 1.6);
  });

  // ---- booths: rows of curved booths along the walls, champagne and sparklers on the tables.
  const sparks: THREE.Vector3[] = [];
  const booth = (cx: number, cz: number, ry: number) => {
    k.at(cx, 0, cz, ry, () => {
      x.act = "sip";
      sofa(x, 0, -0.95, 0, 2.6, pal.fabric, { legs: 0x111111 });
      sofa(x, -1.35, 0.15, Math.PI / 2, 1.5, pal.fabric, { legs: 0x111111, seats: 2 });
      sofa(x, 1.35, 0.15, -Math.PI / 2, 1.5, pal.fabric, { legs: 0x111111, seats: 2 });
      x.act = undefined;
      table(x, 0, 0.15, 0, 1.3, 0.8, style === "gold" ? 0x2a1a10 : 0x111111, 0x343a40, { h: 0.5 });
      k.cyl(0, 0.5, 0.15, 0.13, 0.1, 0.24, 0xced4da, 14);
      for (const bx of [-0.05, 0.06]) k.cyl(bx, 0.6, 0.15 + bx, 0.035, 0.035, 0.32, 0x1b4d2b, 8);
      k.cyl(0.35, 0.5, 0.0, 0.03, 0.03, 0.06, neon, 8, { layer: "glow" });
      const sp = k.world(0, 0.98, 0.15);
      sparks.push(new THREE.Vector3(sp.x, sp.y, sp.z));
      k.box(0, 0, 1.25, 3.0, 0.02, 0.02, L.edge, { layer: "glow" });
    });
  };
  const rows = Math.max(2, Math.floor((D - 8) / 3.4));
  for (let b = 0; b < rows; b++) {
    const bz = -D / 2 + 3 + b * 3.4;
    booth(-W / 2 + 1.5, bz, Math.PI / 2);
  }
  for (let b = 0; b < 2; b++) booth(-W / 2 + 6 + b * 4.2, -D / 2 + 1.5, 0);
  for (let b = 0; b < 2; b++) booth(W / 2 - 6 - b * 4.2, -D / 2 + 1.5, 0);
  // A glass rail with a light strip between the booths and the floor (the VIP side).
  k.box(-W / 2 + 3.25, 0, 0, 0.04, 1.0, D - 6, 0xd6e9f5, { layer: "glass" });
  k.box(-W / 2 + 3.25, 0.02, 0, 0.06, 0.04, D - 6, L.edge, { layer: "glow" });
  k.box(-W / 2 + 3.25, 1.0, 0, 0.07, 0.05, D - 6, style === "gold" ? 0xc9a227 : 0xced4da);
  // Sparklers fizzing on the tables (each flickers).
  const sparkMat = glowMat(0xfff3bf, undefined, 0.95);
  const sparkMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), sparkMat, Math.max(1, sparks.length));
  sparkMesh.frustumCulled = false;
  x.extras.push(sparkMesh);
  const sm = new THREE.Matrix4();
  const sq = new THREE.Quaternion();
  const ss = new THREE.Vector3();

  // A photo booth in the corner, and the club's name in neon.
  if (style === "gold") karaokeCorner(x, W / 2 - 1.8, -D / 2 + 1.5, -Math.PI / 2);
  else photoBooth(x, W / 2 - 1.4, -D / 2 + 1.6, -Math.PI / 2, neon2);
  wallSign(x, 0, 0, H * 0.55, name.slice(0, 14), 0x14102b, neon, 5.0, 1.0);

  x.lamps.push({ x: -fw / 3, y: H - 1, z: fz }, { x: fw / 3, y: H - 1, z: fz });
  x.views.push(
    { x: W / 2 - 3.5, z: -D / 2 + 3, yaw: yawTo(W / 2 - 3.5, -D / 2 + 3, -2, D / 3), pitch: -0.14 },
    { x: -W / 2 + 5, z: -D / 2 + 3.5, yaw: yawTo(-W / 2 + 5, -D / 2 + 3.5, 2, D / 3), pitch: -0.12 },
    { x: 0, z: fz - fd / 2 + 1.2, yaw: yawTo(0, fz - fd / 2 + 1.2, 0, D / 2), pitch: -0.02 },
  );

  // ---- everything that moves, every frame.
  const goboCol = L.gobos.map((c) => new THREE.Color(c));
  let lastBeat = -1;
  x.anim.push((t) => {
    const beat = clubBeat();
    const on = 0.5 + 0.5 * Math.cos(beat * Math.PI * 2);
    edgeMat.color.setHex(L.edge).multiplyScalar(0.45 + 0.75 * on);
    for (const [i, m] of ringMats.entries()) m.color.setHex(i % 2 ? neon : L.edge).multiplyScalar(0.5 + 0.6 * (0.5 + 0.5 * Math.cos((beat + i * 0.5) * Math.PI)));
    for (const g of gobos) {
      g.m.rotation.y = t * g.sp * (g.ph > 3 ? 1 : -1);
      g.m.position.x = g.ox + Math.sin(t * 0.3 + g.ph) * g.r;
      g.m.position.z = g.oz + Math.cos(t * 0.23 + g.ph * 1.7) * g.r * 0.7;
    }
    const b = Math.floor(beat);
    if (b !== lastBeat) {
      lastBeat = b;
      for (const [i, g] of gobos.entries()) g.mat.color.copy(goboCol[(i + Math.floor(b / 4)) % goboCol.length]);
    }
    for (const [i, c] of cones.entries()) {
      c.rotation.z = Math.sin(t * 0.8 + i * 1.7) * 0.55;
      c.rotation.x = Math.cos(t * 0.6 + i) * 0.4;
    }
    lasers.rotation.y = Math.sin(t * 0.7) * 0.7;
    lasers.visible = Math.sin(t * 0.45) > -0.35;
    screenTex.offset.x = t * 0.03;
    screenMat.color.setScalar(0.75 + 0.35 * on);
    for (const [i, p] of sparks.entries()) {
      const f = 0.6 + 0.6 * Math.abs(Math.sin(t * 23 + i * 7.1)) * Math.abs(Math.cos(t * 17 + i));
      ss.setScalar(f);
      sm.compose(p, sq, ss);
      sparkMesh.setMatrixAt(i, sm);
    }
    sparkMesh.instanceMatrix.needsUpdate = true;
    for (const a of animCanopy) a(t);
  });
}

// ---------------------------------------------------------------- restaurants

const DISHES: Record<string, string[]> = {
  ng: ["Jollof rice & chicken", "Pounded yam & egusi", "Suya platter", "Goat pepper soup", "Moi moi", "Puff-puff", "Chapman"],
  uk: ["Fish & chips", "Sunday roast", "Shepherd's pie", "Full English", "Sticky toffee pudding", "Pot of tea"],
  us: ["Cheeseburger", "BBQ ribs", "Mac & cheese", "Buffalo wings", "Apple pie", "Milkshake"],
  gh: ["Waakye", "Banku & tilapia", "Kelewele", "Red red", "Fufu & light soup", "Sobolo"],
  ke: ["Nyama choma", "Ugali & sukuma", "Pilau", "Chapati", "Mandazi", "Chai"],
  za: ["Bunny chow", "Braai platter", "Bobotie", "Pap & chakalaka", "Malva pudding", "Rooibos"],
};

function restaurant(x: Ctx) {
  const { room, pal, rnd, sheet, info, k } = x;
  const W = room.w;
  const D = room.d;
  const dishes = DISHES[info.flavor ?? "ng"] ?? DISHES.ng;
  const fancy = rnd() < 0.5;
  const cloth = fancy ? 0xf7f4ee : pickOf(rnd, [0xe03131, 0x2f9e44, 0x1971c2]);
  // Tables in rows in the front of the room, by the windows.
  x.act = "eat";
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const tx = -W / 2 + 2.0 + c * ((W - 4.5) / 3);
      const tz = -D / 2 + 1.7 + r * 2.4;
      const four = (r + c) % 2 === 0;
      table(x, tx, tz, 0, four ? 1.0 : 0.8, four ? 1.0 : 0.8, cloth, pal.metal, { round: !four, cloth: fancy ? cloth : undefined });
      if (!fancy && four) for (let cc = 0; cc < 4; cc++) k.box(tx - 0.5 + cc * 0.25 + 0.125, 0.752, tz, 0.125, 0.002, 1.0, cc % 2 ? 0xffffff : cloth, { noAo: true });
      const seatsAt = four ? [[0, -0.7, 0], [0, 0.7, Math.PI], [-0.7, 0, Math.PI / 2], [0.7, 0, -Math.PI / 2]] : [[0, -0.62, 0], [0, 0.62, Math.PI]];
      seatsAt.forEach(([sx, sz, ry], i) => chair(x, tx + sx, tz + sz, ry, pal.fabric, pal.wood, { spot: i < 2 || rnd() < 0.5 }));
      k.cyl(tx, 0.76, tz, 0.03, 0.035, 0.08, 0xfff1d6, 10, { layer: "glow" });
      k.cyl(tx + 0.18, 0.76, tz + 0.1, 0.035, 0.03, 0.12, 0xffffff, 10);
      k.ball(tx + 0.18, 0.92, tz + 0.1, 0.045, pickOf(rnd, [0xe64980, 0xffd43b, 0xff922b]), { w: 6, h: 5 });
      for (const [px2, pz2] of [[0.15, -0.15], [-0.15, 0.15]]) k.cyl(tx + px2, 0.76, tz + pz2, 0.12, 0.1, 0.02, 0xffffff, 16);
      pendant(x, tx, tz, 1.15, fancy ? "globe" : "cone", pal.metal);
    }
  }
  x.act = undefined;
  // The kitchen pass on the back wall: a counter, heat lamps, chefs at work behind it.
  atWall(x, 2, -1.2, () => {
    k.box(0, 0, 0.05, 4.2, room.h, 0.1, 0x2b2f33, { noAo: true });
    k.box(0, 0, 0.6, 3.8, 1.05, 0.6, pal.wood);
    k.box(0, 1.05, 0.6, 3.9, 0.05, 0.7, 0xdee2e6);
    for (let l = 0; l < 4; l++) {
      k.cyl(-1.35 + l * 0.9, 1.75, 0.6, 0.12, 0.18, 0.18, 0x343a40, 12, { open: true });
      k.ball(-1.35 + l * 0.9, 1.78, 0.6, 0.07, 0xff922b, { layer: "glow", w: 8, h: 6 });
      k.cyl(-1.35 + l * 0.9, 1.93, 0.6, 0.008, 0.008, room.h - 1.93, 0x2b2b2b, 4, { noAo: true });
    }
    for (let p2 = 0; p2 < 5; p2++) k.cyl(-1.6 + p2 * 0.8, 1.1, 0.6, 0.13, 0.11, 0.03, 0xffffff, 16);
    k.box(0, 1.3, 0.12, 3.8, 0.04, 0.3, 0xadb5bd, { noAo: true });
    k.box(0, 1.9, 0.12, 3.8, 0.04, 0.3, 0xadb5bd, { noAo: true });
    for (let p2 = 0; p2 < 6; p2++) k.cyl(-1.6 + p2 * 0.64, 1.34, 0.12, 0.1, 0.1, 0.18, 0xced4da, 12);
    x.act = "cook";
    spot(x, -0.8, 0.22, 0, "stand");
    spot(x, 0.9, 0.22, 0, "stand");
    x.act = undefined;
  });
  // A chalkboard menu of local dishes.
  const menu = sheet.paint(240, 300, (c, w, h) => {
    c.fillStyle = "#1f2a24";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#8a6a4f";
    c.lineWidth = 10;
    c.strokeRect(0, 0, w, h);
    c.fillStyle = "#ffffff";
    c.font = "700 26px Georgia, serif";
    c.textAlign = "center";
    c.fillText("Today's menu", w / 2, 44);
    c.font = "400 17px Georgia, serif";
    dishes.slice(0, 6).forEach((d, i) => c.fillText(d, w / 2, 90 + i * 34, w - 30));
  });
  atWall(x, 2, W / 2 - 2.2, () => {
    k.quad(0, 1.75, 0.04, 1.2, 1.5, 0xffffff, { layer: "tex" }, menu);
    item(x, "menu", "Menu", 0, 0, 1.2, 0.9);
  });
  // The bar along the east wall, with stools.
  atWall(x, 1, 1.5, () => {
    k.box(0, 0, 1.0, 3.0, 1.05, 0.6, pal.wood);
    k.box(0, 1.05, 1.0, 3.1, 0.05, 0.7, 0x2b2b2b);
    k.box(0, 1.25, 0.15, 2.8, 0.03, 0.25, pal.wood, { noAo: true });
    for (let b = 0; b < 10; b++) k.cyl(-1.2 + b * 0.27, 1.28, 0.15, 0.035, 0.035, 0.26, pickOf(rnd, [0x2f9e44, 0x7a2e3a, 0xe8c07d, 0xb6d7e6]), 8);
    x.act = "sip";
    for (let s2 = 0; s2 < 3; s2++) chair(x, -0.9 + s2 * 0.9, 1.7, 0, pal.fabric, pal.metal, { stool: true });
    x.act = undefined;
    spot(x, 0, 0.45, 0, "stand");
    item(x, "bar", "Bar", 0, 0, 1.9, 1.0);
  });
  // Music: a jukebox in a diner, a piano in a fancier place.
  if (fancy) grandPiano(x, W / 2 - 1.6, -D / 2 + 1.6, -Math.PI * 0.75);
  else jukebox(x, W / 2 - 0.6, -D / 2 + 0.8, -Math.PI / 2);
  // A host stand by the door, plants, art.
  k.box(-W / 2 + 1.2, 0, D / 2 - 1.4, 0.6, 1.1, 0.45, pal.wood);
  spot(x, -W / 2 + 1.2, D / 2 - 2.0, Math.PI, "stand");
  plant(x, -W / 2 + 0.5, D / 2 - 0.5, 1.2, "tall");
  plant(x, W / 2 - 0.5, D / 2 - 0.5, 1.2, "palm");
  for (const sd of solidSides(room)) if (sd !== 2) art(x, sd, -1.0, 1.7, 1.1, 0.8);
  x.lamps.push({ x: -W / 4, y: room.h - 1.2, z: -D / 2 + 2.9 }, { x: W / 4, y: room.h - 1.2, z: -D / 2 + 2.9 });
  x.views.push(
    { x: -W / 2 + 1.4, z: D / 2 - 2.6, yaw: yawTo(-W / 2 + 1.4, D / 2 - 2.6, W / 4, -D / 2), pitch: -0.1 },
    { x: W / 2 - 1.5, z: D / 2 - 2.8, yaw: yawTo(W / 2 - 1.5, D / 2 - 2.8, -W / 3, -D / 2), pitch: -0.1 },
    { x: 0, z: -D / 2 + 0.9, yaw: Math.PI, pitch: -0.08 },
  );
}

// ---------------------------------------------------------------- the fire station

function firehall(x: Ctx) {
  const { room, rnd, k } = x;
  const W = room.w;
  const D = room.d;
  // Red doors on the front, yellow lines on the floor.
  atWall(x, 0, 0, () => {
    for (const dx of [-3.4, 0, 3.4]) {
      k.box(dx, 0, 0.03, 3.0, 3.2, 0.06, 0xc92a2a, { noAo: true });
      for (let p2 = 1; p2 < 8; p2++) k.box(dx, p2 * 0.4, 0.07, 2.9, 0.03, 0.02, 0x9c1f1f, { noAo: true });
      k.box(dx, 2.0, 0.08, 2.4, 0.5, 0.02, 0x9fd3ff, { noAo: true });
    }
  });
  for (const dx of [-3.4, 0, 3.4]) for (const sx of [-1.4, 1.4]) k.box(dx + sx, 0.002, -0.5, 0.1, 0.004, D - 3, 0xffd43b, { noAo: true });
  // Two engines, noses to the doors.
  for (const dx of [-3.4, 0]) {
    k.at(dx, 0, -0.2, Math.PI / 2, () => fireEngineKit(k));
    k.shadow(dx, -0.2, 2.8, 8.2, 0.35);
  }
  item(x, "photo", "Photo with the fire engine", -1.7, 0, 1.6, 1.0);
  // Lockers with helmets and jackets along the west wall.
  atWall(x, 3, 0, () => {
    for (let l = 0; l < 6; l++) {
      const lx = -2.5 + l * 1.0;
      k.box(lx, 0, 0.3, 0.9, 2.0, 0.55, 0x495057);
      k.box(lx, 0.1, 0.58, 0.8, 1.2, 0.02, 0x2b2f33, { noAo: true });
      k.soft(lx, 0.5, 0.62, 0.5, 0.8, 0.1, 0x343a40, 0.04);
      k.ball(lx, 1.5, 0.5, 0.17, l % 2 ? 0xffd43b : 0xc92a2a, { part: 0.5, w: 12, h: 6 });
    }
    k.shadow(0, 0.3, 6.4, 0.9, 0.3);
    k.box(0, 0, 1.4, 3.0, 0.45, 0.45, 0x6b4f37);
    spot(x, -0.6, 1.4, 0, "sit", 0.45);
    spot(x, 0.6, 1.4, 0, "sit", 0.45);
  });
  // The brass pole down from the crew room, through a hole in the ceiling.
  const px = W / 2 - 1.1;
  const pz = -D / 2 + 2.6;
  k.cyl(px, 0, pz, 0.05, 0.05, room.h, 0xd4af37, 12);
  k.cyl(px, 0, pz, 0.5, 0.5, 0.04, 0x343a40, 20);
  k.cyl(px, room.h - 0.02, pz, 0.6, 0.6, 0.03, 0x1b1b1b, 20, { noAo: true });
  item(x, "stairs", "Fire pole", px, 0, pz - 0.6, 0.8);
  // Hose reels and a notice board on the east wall.
  atWall(x, 1, -1.5, () => {
    for (let h = 0; h < 2; h++) k.cyl(-0.6 + h * 1.2, 1.2, 0.2, 0.4, 0.4, 0.3, 0xc92a2a, 18, { rx: Math.PI / 2 });
    k.box(1.8, 1.1, 0.03, 1.4, 1.0, 0.04, 0xb98a5a, { noAo: true });
    for (let n = 0; n < 5; n++) k.box(1.4 + (n % 3) * 0.35, 1.7 - Math.floor(n / 3) * 0.4, 0.06, 0.25, 0.3, 0.005, 0xf8f9fa, { noAo: true, rz: (rnd() - 0.5) * 0.2 });
  });
  x.act = "talk";
  spot(x, 1.6, 1.8, -2.4, "stand");
  spot(x, 2.3, 1.2, 2.2, "stand");
  x.act = undefined;
  linearLights(x, 3, "z");
  x.views.push(
    { x: W / 2 - 1.2, z: D / 2 - 0.9, yaw: yawTo(W / 2 - 1.2, D / 2 - 0.9, -2, -D / 2), pitch: -0.12 },
    { x: 2.6, z: -D / 2 + 1.2, yaw: yawTo(2.6, -D / 2 + 1.2, -2, D / 2), pitch: -0.1 },
  );
}

// ---------------------------------------------------------------- themes

/**
 * A home's room: one of several designs, the same one for everyone in this house (picked from its
 * key). Downstairs: the open-plan kitchen and lounge, a Nigerian parlour, a family lounge or a
 * grand lounge. Upstairs: a bedroom with a desk, a master bedroom, a children's room or a study.
 */
function livingRoom(x: Ctx, upstairs: boolean) {
  const design = Math.floor(x.rnd() * 4);
  if (design === 1) return upstairs ? masterBedroom(x) : parlour(x);
  if (design === 2) return upstairs ? kidsRoom(x) : familyLounge(x);
  if (design === 3) return upstairs ? study(x) : grandLounge(x);
  openPlan(x, upstairs);
}

/** A standing fan: a round base, a pole, the guard and blades (turned a little). */
function standingFan(x: Ctx, px: number, pz: number, ry: number) {
  const { k } = x;
  k.at(px, 0, pz, ry, () => {
    k.cyl(0, 0, 0, 0.2, 0.22, 0.04, 0x2b2b2b, 14);
    k.cyl(0, 0.04, 0, 0.02, 0.02, 1.1, 0xdee2e6, 8);
    k.box(0, 1.1, 0.02, 0.14, 0.14, 0.18, 0xf1f3f5);
    k.ring(0, 1.17, 0.14, 0.24, 0.015, 0xdee2e6);
    for (let b = 0; b < 3; b++) k.box(0, 1.17, 0.13, 0.4, 0.06, 0.01, 0x74c0fc, { rz: (b * Math.PI * 2) / 3, noAo: true });
  });
}

/** A wall clock (side, u along the wall, y its middle). */
function wallClock(x: Ctx, side: number, u: number, y: number) {
  const { k } = x;
  atWall(x, side, u, () => {
    k.cyl(0, y, 0.02, 0.22, 0.22, 0.04, 0x2b2b2b, 20, { rx: Math.PI / 2, noAo: true });
    k.cyl(0, y, 0.045, 0.19, 0.19, 0.01, 0xfbfaf7, 20, { rx: Math.PI / 2, noAo: true });
    k.box(0, y, 0.055, 0.015, 0.13, 0.005, 0x111111, { noAo: true });
    k.box(0.04, y, 0.056, 0.09, 0.012, 0.005, 0x111111, { noAo: true });
  });
}

/** A Nigerian parlour: the big sofa set round a centre table facing the TV, a dining set for six,
 * a standing fan, a deep freezer, a wall clock and family photos, net curtains at the windows. */
function parlour(x: Ctx) {
  const { k, room, pal, rnd } = x;
  const W = room.w;
  const D = room.d;
  const leather = pickOf(rnd, [0x5c3d2e, 0x2b2b2b, 0x8a5a3c, 0xe9dcc4, 0x7a2e3a]);
  tvWall(x, 3, 0.4);
  // The three-seater facing the TV, two armchairs either side, the glass-top centre table.
  sofa(x, 0.6, 0.4, -Math.PI / 2, 2.4, leather, { seats: 3 });
  armchair(x, -0.9, -1.0, 0, leather);
  armchair(x, -0.9, 1.8, Math.PI, leather);
  rugAt(x, -1.0, 0.4, 2.6, 2.4, 0);
  table(x, -1.0, 0.4, 0, 1.2, 0.7, 0xcfe3ea, pal.metal, { h: 0.42 });
  k.cyl(-0.8, 0.42, 0.4, 0.09, 0.07, 0.06, 0xe9ecef, 10);
  // Dining for six at the back.
  const tx = W / 2 - 1.6;
  const tz = -D / 2 + 1.3;
  table(x, tx, tz, 0, 1.8, 0.9, pal.wood, pal.wood);
  for (let c = 0; c < 6; c++) chair(x, tx - 0.6 + (c % 3) * 0.6, tz + (c < 3 ? -0.65 : 0.65), c < 3 ? 0 : Math.PI, pal.fabric2, pal.wood, { spot: c === 1 });
  pendant(x, tx, tz, 1.0, "drum", pal.metal);
  x.lamps.push({ x: tx, y: room.h - 1.2, z: tz });
  standingFan(x, -W / 2 + 0.7, D / 2 - 0.7, Math.PI * 0.8);
  // The deep freezer by the wall, a plate of chin-chin on it.
  atWall(x, 1, 1.4, () => {
    k.box(0, 0, 0.4, 1.1, 0.88, 0.7, 0xf8f9fa);
    k.box(0, 0.88, 0.4, 1.12, 0.03, 0.72, 0xdee2e6);
    k.cyl(0.25, 0.91, 0.4, 0.12, 0.1, 0.04, 0xe8b04a, 12);
  });
  wallClock(x, 2, 0.6, 2.2);
  art(x, 2, -1.4, 1.6, 0.6, 0.8);
  art(x, 2, 1.8, 1.6, 0.9, 0.6);
  plant(x, W / 2 - 0.5, D / 2 - 0.5, 1.0, "snake");
  downlights(x, 2, 2, 1.6);
  x.views.push(
    { x: 1.8, z: D / 2 - 0.7, yaw: yawTo(1.8, D / 2 - 0.7, -W / 4, -D / 3), pitch: -0.12 },
    { x: W / 2 - 0.8, z: 0.8, yaw: yawTo(W / 2 - 0.8, 0.8, -W / 2, 0), pitch: -0.1 },
  );
  atWindow(x, 0, -W / 4);
}

/** A family lounge: an L of sofas round a big rug facing the TV, a bookshelf, a little table for two. */
function familyLounge(x: Ctx) {
  const { room, pal, rnd } = x;
  const W = room.w;
  const D = room.d;
  const fabric = pickOf(rnd, [pal.fabric, pal.fabric2, 0x6b8f71, 0x4a6fa5]);
  // The TV on the side wall, an L of sofas facing it round the rug.
  tvWall(x, 3, 0);
  rugAt(x, -1.2, 0, 2.6, 2.8, 0);
  sofa(x, 0.4, 0, -Math.PI / 2, 2.6, fabric);
  sofa(x, -1.2, 1.6, Math.PI, 1.8, fabric);
  table(x, -1.3, 0, Math.PI / 2, 1.1, 0.6, pal.wood, pal.wood, { h: 0.4 });
  bookshelf(x, 2, 2.4, 1.8, 2.0);
  bookshelf(x, 1, 0.8, 1.4, 1.6);
  const tx = -W / 2 + 1.3;
  const tz = D / 2 - 1.2;
  table(x, tx, tz, 0, 0.8, 0.8, pal.wood, pal.metal, { round: true });
  for (const sz of [-0.55, 0.55]) chair(x, tx, tz + sz, sz < 0 ? 0 : Math.PI, pal.fabric2, pal.metal, { spot: sz < 0 });
  floorLamp(x, W / 2 - 0.45, -0.6, pal.metal);
  plant(x, W / 2 - 0.5, -D / 2 + 0.5, 1.2, "tall");
  plant(x, -W / 2 + 0.5, -D / 2 + 0.5, 0.9, "bush");
  art(x, 1, 0.2, 1.6, 1.0, 0.7);
  downlights(x, 3, 2, 1.4);
  x.views.push(
    { x: 1.9, z: D / 2 - 0.6, yaw: yawTo(1.9, D / 2 - 0.6, -W / 2, -0.4), pitch: -0.14 },
    { x: W / 2 - 0.8, z: D / 2 - 0.8, yaw: yawTo(W / 2 - 0.8, D / 2 - 0.8, -W / 3, -D / 3), pitch: -0.12 },
  );
  atWindow(x, 0, W / 3);
}

/** A grand lounge: two sofas facing over a long table under a chandelier, a piano, a bar. */
function grandLounge(x: Ctx) {
  const { k, room, pal, rnd } = x;
  const W = room.w;
  const D = room.d;
  const fabric = pickOf(rnd, [0xefe6d8, 0xf8f4ec, 0x1f3b2c, 0x2b2b2b]);
  rugAt(x, 0.6, 0, 3.4, 2.6, 0, 0xefe6d8, 0xc9a227);
  sofa(x, 0.6, -1.1, 0, 2.4, fabric);
  sofa(x, 0.6, 1.1, Math.PI, 2.4, fabric);
  table(x, 0.6, 0, 0, 1.4, 0.7, 0xf1efea, 0xc9a227, { h: 0.42 });
  armchair(x, 2.4, 0, -Math.PI / 2, pal.accent);
  grandPiano(x, -W / 2 + 1.6, -D / 2 + 1.7, Math.PI * 0.2);
  // The bar: a sideboard with bottles and glasses.
  sideboard(x, 2, -2.6, 1.6, 0x2b2b2b, false);
  atWall(x, 2, -2.6, () => {
    for (let b = 0; b < 5; b++) k.cyl(-0.55 + b * 0.27, 0.72, 0.24, 0.035, 0.035, 0.28, pickOf(rnd, [0x2f6b3a, 0x7a2e3a, 0xc9a227, 0x5c3d2e]), 8);
  });
  // The chandelier.
  k.cyl(0.6, room.h - 0.5, 0, 0.012, 0.012, 0.5, 0xc9a227, 6, { noAo: true });
  k.ring(0.6, room.h - 0.75, 0, 0.42, 0.02, 0xc9a227, { rx: Math.PI / 2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.ball(0.6 + Math.cos(a) * 0.42, room.h - 0.84, Math.sin(a) * 0.42, 0.05, 0xfff6dc, { layer: "glow", w: 8, h: 6 });
  }
  x.lamps.push({ x: 0.6, y: room.h - 0.9, z: 0 });
  plant(x, W / 2 - 0.5, D / 2 - 0.5, 1.6, "palm");
  plant(x, W / 2 - 0.5, -D / 2 + 0.5, 1.6, "palm");
  art(x, 3, 0.8, 1.7, 1.4, 1.0);
  art(x, 1, 0, 1.7, 1.2, 0.9);
  x.views.push(
    { x: 0, z: D / 2 - 0.6, yaw: yawTo(0, D / 2 - 0.6, 0.6, -D / 2), pitch: -0.12 },
    { x: W / 2 - 0.9, z: D / 2 - 0.9, yaw: yawTo(W / 2 - 0.9, D / 2 - 0.9, -W / 2, -D / 2), pitch: -0.12 },
  );
  atWindow(x, 0, W / 4);
}

/** A wardrobe against a wall (side, u), w wide. */
function wardrobe(x: Ctx, side: number, u: number, w: number) {
  const { k, pal } = x;
  atWall(x, side, u, () => {
    k.box(0, 0, 0.32, w, 2.1, 0.6, pal.wood);
    for (let d = 0; d < Math.max(2, Math.round(w / 0.6)); d++) {
      const n = Math.max(2, Math.round(w / 0.6));
      k.box(-w / 2 + (w / n) * (d + 0.5), 0.05, 0.625, w / n - 0.02, 2.0, 0.01, shadeHex(pal.wood, 0.06), { noAo: true });
      k.box(-w / 2 + (w / n) * (d + 0.5) + (d % 2 ? -1 : 1) * (w / n / 2 - 0.08), 0.95, 0.64, 0.02, 0.2, 0.02, pal.metal, { noAo: true });
    }
    k.shadow(0, 0.32, w + 0.2, 0.8, 0.3);
  });
}

/** A master bedroom: the big bed, a wardrobe, a dressing table with a mirror, an armchair. */
function masterBedroom(x: Ctx) {
  const { k, room, pal } = x;
  const W = room.w;
  const D = room.d;
  bed(x, 1, -0.3, pal.fabric);
  wardrobe(x, 3, -0.6, 2.4);
  // The dressing table and its mirror.
  atWall(x, 2, -2.4, () => {
    k.box(0, 0.72, 0.25, 1.1, 0.04, 0.45, pal.wood);
    for (const sx of [-0.5, 0.5]) k.box(sx, 0, 0.25, 0.05, 0.72, 0.42, pal.wood);
    k.box(0, 0.9, 0.04, 0.8, 0.9, 0.03, pal.frame, { noAo: true });
    k.box(0, 0.95, 0.06, 0.72, 0.8, 0.005, 0xd8e6ee, { noAo: true });
    for (let b = 0; b < 4; b++) k.cyl(-0.35 + b * 0.12, 0.76, 0.3, 0.025, 0.025, 0.1, [0xe64980, 0xc9a227, 0xffffff, 0x7048e8][b], 8);
  });
  armchair(x, -W / 2 + 1.0, -D / 2 + 1.0, Math.PI * 0.25, pal.fabric2);
  floorLamp(x, -W / 2 + 0.45, -D / 2 + 0.45, pal.metal);
  rugAt(x, 0.8, -0.3, 2.4, 2.8, 0);
  art(x, 0, 0.6, 1.7, 1.2, 0.8);
  plant(x, W / 2 - 0.45, D / 2 - 0.45, 1.0, "tall");
  downlights(x, 2, 2, 1.6);
  x.views.push(
    { x: -W / 2 + 0.9, z: D / 2 - 0.7, yaw: yawTo(-W / 2 + 0.9, D / 2 - 0.7, W / 3, -D / 4), pitch: -0.14 },
    { x: 0, z: D / 2 - 0.6, yaw: 0, pitch: -0.12 },
  );
  atWindow(x, 0, -W / 4);
}

/** A children's room: two single beds, a toy box, a little desk, stars on the wall. */
function kidsRoom(x: Ctx) {
  const { k, room, pal, rnd } = x;
  const W = room.w;
  const D = room.d;
  const covers = [pickOf(rnd, [0x4dabf7, 0xf783ac, 0x69db7c]), pickOf(rnd, [0xffd43b, 0x9775fa, 0xff922b])];
  for (const [n, u] of [[0, -1.6], [1, 1.2]] as const) {
    atWall(x, 3, u, () => {
      k.box(0, 0, 1.0, 1.0, 0.3, 2.0, pal.wood);
      k.soft(0, 0.3, 1.0, 0.95, 0.18, 1.95, 0xfbfaf7, 0.06);
      k.soft(0, 0.46, 1.25, 0.98, 0.06, 1.4, covers[n], 0.04);
      k.soft(0, 0.5, 0.25, 0.6, 0.14, 0.3, 0xffffff, 0.06);
      k.box(0, 0, 0.04, 1.0, 0.9, 0.06, pal.wood);
      k.shadow(0, 1.0, 1.2, 2.2, 0.3);
    });
  }
  // A toy box with a ball and a teddy on it.
  k.box(W / 2 - 1.2, 0, D / 2 - 0.6, 0.9, 0.5, 0.5, pickOf(rnd, [0xe03131, 0x1c7ed6, 0x2f9e44]));
  k.ball(W / 2 - 1.4, 0.62, D / 2 - 0.6, 0.12, 0xffd43b);
  k.ball(W / 2 - 1.0, 0.64, D / 2 - 0.6, 0.14, 0x8a5a3c);
  const screen = x.sheet.paint(160, 100, (c, w, h) => dashboard(c, w, h, pal.accent, rnd));
  desk(x, W / 2 - 1.0, -D / 2 + 1.0, Math.PI, pal.wood, screen, covers[0]);
  rugAt(x, 0.6, 0.3, 2.0, 2.0, 0, 0xfff3bf, covers[1]);
  for (let st = 0; st < 6; st++) atWall(x, 1, -1.5 + st * 0.6, () => k.box(0, 1.8 + (st % 2) * 0.35, 0.02, 0.12, 0.12, 0.01, 0xffd43b, { rz: 0.785, noAo: true }));
  downlights(x, 2, 2, 1.4);
  x.views.push(
    { x: W / 2 - 0.8, z: D / 2 - 1.2, yaw: yawTo(W / 2 - 0.8, D / 2 - 1.2, -W / 2, -D / 4), pitch: -0.14 },
    { x: 0, z: -D / 2 + 0.8, yaw: yawTo(0, -D / 2 + 0.8, -W / 3, D / 2), pitch: -0.12 },
  );
  atWindow(x, 0, W / 4);
}

/** A study: bookshelves on two walls, a big desk, a reading chair, a sofa bed for guests. */
function study(x: Ctx) {
  const { room, pal, rnd } = x;
  const W = room.w;
  const D = room.d;
  bookshelf(x, 3, -1.0, 2.4, 2.3);
  bookshelf(x, 3, 1.6, 1.6, 2.3);
  bookshelf(x, 2, 2.2, 2.0, 2.3);
  const screen = x.sheet.paint(160, 100, (c, w, h) => dashboard(c, w, h, pal.accent, rnd));
  desk(x, 0.6, -D / 2 + 1.1, Math.PI, pal.wood, screen, pal.fabric);
  armchair(x, -1.2, 1.1, Math.PI * 0.8, pal.fabric2);
  floorLamp(x, -1.9, 1.6, pal.metal);
  sofa(x, W / 2 - 0.7, 0.4, -Math.PI / 2, 2.0, pal.fabric);
  rugAt(x, 0, 0.6, 2.4, 1.8, 0);
  plant(x, W / 2 - 0.45, -D / 2 + 0.45, 1.1, "tall");
  art(x, 1, -2.2, 1.7, 0.8, 0.6);
  downlights(x, 2, 2, 1.4);
  x.views.push(
    { x: W / 2 - 1.6, z: D / 2 - 0.6, yaw: yawTo(W / 2 - 1.6, D / 2 - 0.6, -W / 3, -D / 3), pitch: -0.13 },
    { x: -W / 2 + 1.2, z: D / 2 - 0.7, yaw: yawTo(-W / 2 + 1.2, D / 2 - 0.7, W / 4, -D / 2), pitch: -0.12 },
  );
  atWindow(x, 0, -W / 4);
}

/** The open-plan home: kitchen, island, round dining table and a lounge (or upstairs, a bedroom with a desk). */
function openPlan(x: Ctx, upstairs: boolean) {
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
    // A deck of cards on the table.
    for (let c = 0; c < 4; c++) x.k.box(dx - 0.15 + c * 0.1, 0.76, -1.1 + (c % 2) * 0.06, 0.06, 0.004, 0.09, c % 2 ? 0xffffff : 0xe03131, { noAo: true, ry: c * 0.3 });
    item(x, "cards", "Card game", dx, 0.75, -1.1, 0.6);
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
    grandPiano(x, -W / 2 + 3.0, 2.0, Math.PI * 0.85);
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
        x.act = "work";
        desk(x, dx, dz, side < 0 ? Math.PI : 0, top, pickOf(rnd, screens), pal.fabric, rnd() < 0.8);
        x.act = undefined;
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
  x.act = restaurant ? "eat" : "sip";
  for (let s = 0; s < 5; s++) chair(x, -1.6 + s * 0.8, 1.45, Math.PI, pal.fabric, pal.metal, { stool: true });
  item(x, "bar", "Bar", 0, 0, 1.25, 1.1);
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
  x.act = undefined;
  // A games corner: a pool table and a darts board, and a jukebox.
  poolTable(x, W / 2 - 3.6, D / 2 - 2.0, 0);
  dartboard(x, 2.7, D / 2 - 0.35);
  jukebox(x, -W / 2 + 2.2, D / 2 - 0.55, Math.PI);
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
          item(x, "menu", `${name} · menu`, 0, 0, 1.5, 0.8);
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
        x.act = "eat";
        for (const side of [-1, 1]) chair(x, tx + 0.3 * side, tz + side * 0.62, side < 0 ? 0 : Math.PI, pickOf(rnd, hues), pal.metal, { spot: (i + j + (side > 0 ? 1 : 0)) % 2 === 0 });
        x.act = undefined;
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
    // An arcade corner: cabinets, a (free) slot machine, a photo booth.
    for (let a = 0; a < 3; a++) arcadeCabinet(x, -W / 4 - 1.1 + a * 0.85, 2.9, Math.PI, pickOf(rnd, hues));
    item(x, "arcade", "Arcade games", -W / 4 - 0.25, 0, 2.1, 1.1);
    slotMachine(x, -W / 4 + 1.6, 2.9, Math.PI);
    item(x, "slots-free", "Lucky slots (free)", -W / 4 + 1.6, 0, 2.2, 0.7);
    photoBooth(x, W / 2 - 1.4, 2.6, -Math.PI / 2, pickOf(rnd, hues));
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

/** Bold colours for museum sculptures and modern art. */
const BOLD = [0xe03131, 0xfab005, 0x1c63d6, 0xb07a3b, 0x1a1b1e, 0xf8f9fa, 0x2b8a3e, 0xf76707, 0xc2255c];

/**
 * A big, bold sculpture on the floor at (px, pz), about `s` metres tall: a giant bronze head, a
 * great ring, stacked turning blocks, a painted totem, a leaning spike, a ball on a cube, crossing
 * arches or a figure with its arms up.
 */
function boldSculpture(x: Ctx, px: number, pz: number, s: number) {
  const { k, rnd } = x;
  const kind = Math.floor(rnd() * 8);
  const c1 = pickOf(rnd, BOLD);
  const c2 = pickOf(rnd, BOLD);
  const turn = rnd() * Math.PI;
  k.at(px, 0, pz, turn, () => {
    k.box(0, 0, 0, s * 0.5, 0.18, s * 0.5, 0xf1efea);
    const y = 0.18;
    switch (kind) {
      case 0:
        k.cyl(0, y, 0, s * 0.1, s * 0.12, s * 0.25, 0x8a5a2b, 12);
        k.ball(0, y + s * 0.5, 0, s * 0.26, 0xb07a3b, { sx: 0.85, sy: 1.15, w: 14, h: 12 });
        k.box(0, y + s * 0.5, s * 0.22, s * 0.08, s * 0.1, s * 0.06, 0x8a5a2b);
        break;
      case 1:
        k.box(0, y, 0, s * 0.5, s * 0.1, s * 0.16, c2);
        k.ring(0, y + s * 0.5, 0, s * 0.4, s * 0.06, c1);
        break;
      case 2:
        for (let b = 0; b < 4; b++) k.box(0, y + b * s * 0.22, 0, s * (0.36 - b * 0.05), s * 0.22, s * (0.36 - b * 0.05), b % 2 ? c1 : c2, { ry: b * 0.4 });
        break;
      case 3:
        for (let b = 0; b < 5; b++) k.cyl(0, y + b * s * 0.18, 0, s * 0.12, s * 0.12, s * 0.18, [c1, c2, 0xfab005, 0x1a1b1e, 0xf8f9fa][b], 12);
        k.cyl(0, y + s * 0.9, 0, 0, s * 0.18, s * 0.25, c1, 12);
        break;
      case 4:
        k.cyl(0, y, 0, 0, s * 0.16, s * 1.1, c1, 10, { rz: 0.15 });
        break;
      case 5:
        k.box(0, y, 0, s * 0.36, s * 0.36, s * 0.36, c2);
        k.ball(0, y + s * 0.36 + s * 0.22, 0, s * 0.22, c1, { w: 14, h: 12 });
        break;
      case 6:
        k.ring(0, y, 0, s * 0.45, s * 0.05, c1, { arc: Math.PI });
        k.ring(0, y, 0, s * 0.45, s * 0.05, c2, { arc: Math.PI, ry: Math.PI / 2 });
        break;
      default:
        k.box(0, y, 0, s * 0.18, s * 0.55, s * 0.12, c1);
        k.ball(0, y + s * 0.65, 0, s * 0.1, c1, { w: 10, h: 8 });
        for (const side of [-1, 1]) k.box(side * s * 0.13, y + s * 0.4, 0, s * 0.05, s * 0.4, s * 0.05, c1, { rz: side * 0.5 });
    }
    k.shadow(0, 0, s * 0.7, s * 0.7, 0.3);
  });
}

/**
 * A museum's floors, each its own show: the main gallery (paintings round the walls, or in some
 * museums a wall of masks and textiles), the sculpture hall (a room full of big bold sculptures),
 * modern art (huge bright canvases and an installation hanging from the ceiling), and the rotunda
 * (a giant piece in the middle).
 */
function gallery(x: Ctx, rotunda: boolean) {
  const { room, pal, rnd } = x;
  const W = room.w;
  const D = room.d;
  if (!rotunda && x.info.floor === 1) return sculptureHall(x);
  if (!rotunda && x.info.floor === 2) return modernArt(x);
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
    boldSculpture(x, 0, 0, Math.min(room.h - 1.2, 3.2));
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
  // In some museums, a wall of carved masks over a long display case.
  if (rnd() < 0.5) {
    atWall(x, 0, 0, () => {
      for (let m = 0; m < 7; m++) {
        const mx = -3 + m;
        x.k.ball(mx, 1.9 + (m % 2) * 0.35, 0.08, 0.2, pickOf(rnd, [0x5c3d2e, 0x8a5a2b, 0x1a1b1e, 0xb07a3b]), { sx: 0.8, sy: 1.25, sz: 0.4, w: 10, h: 8 });
      }
      x.k.box(0, 0, 0.4, 6.4, 0.9, 0.6, 0x2b2b2b);
      x.k.box(0, 0.9, 0.4, 6.4, 0.5, 0.6, 0xd8e6ee, { layer: "glass" });
    });
  }
  // Sculptures and benches in the middle.
  boldSculpture(x, -W / 4, 0, 1.6);
  boldSculpture(x, W / 4, 0.3, 1.4);
  bench(x, 0, 0.4, 0, 2.2, pal.wood, pal.wood);
  bench(x, 0, -1.2, Math.PI, 2.2, pal.wood, pal.wood);
  item(x, "photo", "Selfie with the art", -W / 4, 0, 1.1, 0.8);
  wallSign(x, 2, 0, room.h - 0.9, x.info.name, 0xfbfaf8, 0x2b2b2b, 3.2, 0.45, false);
  x.views.push(
    { x: -W / 2 + 1.2, z: -D / 2 + 1.4, yaw: yawTo(-W / 2 + 1.2, -D / 2 + 1.4, W / 4, D / 2), pitch: -0.05 },
    { x: W / 2 - 1.2, z: D / 2 - 1.2, yaw: yawTo(W / 2 - 1.2, D / 2 - 1.2, -W / 3, -D / 2), pitch: -0.04 },
    { x: 0, z: -D / 2 + 1.0, yaw: Math.PI, pitch: -0.02 },
  );
}

/** The sculpture hall: rows of big, bold sculptures, room to walk between them, benches. */
function sculptureHall(x: Ctx) {
  const { room, pal } = x;
  const W = room.w;
  const D = room.d;
  // Rows of them across the room (the end you come in at, -z, kept clear to look from).
  const cols = Math.max(3, Math.floor((W - 2) / 3.4));
  const rows = Math.max(2, Math.floor((D - 4) / 3.2));
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) boldSculpture(x, -W / 2 + 1.8 + (i * (W - 3.6)) / (cols - 1), -D / 2 + 3.4 + (j * (D - 5.2)) / Math.max(1, rows - 1), 2.2 + x.rnd() * 1.4);
  bench(x, 0, -D / 2 + 1.6, 0, 2.4, pal.wood, pal.wood);
  wallSign(x, 2, 0, room.h - 0.9, "SCULPTURE HALL", 0x1a1b1e, 0xfab005, 3.6, 0.45, false);
  linearLights(x, 3, "x", 0xffffff);
  item(x, "photo", "Selfie with the sculptures", 0, 0, -D / 2 + 2.2, 0.8);
  for (let s = 0; s < 6; s++) x.spots.push({ x: -W / 2 + 1 + x.rnd() * (W - 2), z: -D / 2 + 1 + x.rnd() * (D - 2), ry: x.rnd() * 6, pose: "stand", y: 0 });
  x.views.push(
    { x: 0, z: -D / 2 + 0.8, yaw: Math.PI, pitch: 0.02 },
    { x: W / 2 - 1.0, z: -D / 2 + 1.0, yaw: yawTo(W / 2 - 1.0, -D / 2 + 1.0, -W / 3, D / 2), pitch: 0.02 },
  );
}

/** Modern art: huge bright canvases on the walls, a mobile hanging from the ceiling, a neon line. */
function modernArt(x: Ctx) {
  const { k, room, pal, rnd } = x;
  const W = room.w;
  const D = room.d;
  for (const s of [1, 2, 3]) {
    const L = wallLen(room, s);
    const n = Math.max(1, Math.floor(L / 5));
    for (let p = 0; p < n; p++) {
      const u = -L / 2 + (L / n) * (p + 0.5);
      // A big canvas of colour blocks.
      atWall(x, s, u, () => {
        const w = 2.6 + rnd() * 1.0;
        const h = 1.8 + rnd() * 0.8;
        k.box(0, 0.9, 0.03, w, h, 0.05, 0xf8f9fa, { noAo: true });
        for (let b = 0; b < 5; b++) k.box(-w / 2 + rnd() * w * 0.7 + 0.3, 0.95 + rnd() * h * 0.7, 0.06, 0.4 + rnd() * 0.9, 0.3 + rnd() * 0.7, 0.01, pickOf(rnd, BOLD), { noAo: true });
      });
    }
  }
  // The mobile: shapes on wires, high up.
  for (let m = 0; m < 9; m++) {
    const mx = (rnd() - 0.5) * (W - 3);
    const mz = (rnd() - 0.5) * (D - 3);
    const my = room.h - 1.2 - rnd() * 1.2;
    k.cyl(mx, my, mz, 0.005, 0.005, room.h - my, 0x2b2b2b, 4, { noAo: true });
    k.ball(mx, my, mz, 0.18 + rnd() * 0.2, pickOf(rnd, BOLD), { w: 10, h: 8 });
  }
  // A neon line along the back wall.
  atWall(x, 0, 0, () => k.box(0, room.h - 0.6, 0.04, W - 2, 0.05, 0.03, pickOf(rnd, [0xff4fd8, 0x22d3ee, 0xa3e635]), { layer: "glow", noAo: true }));
  boldSculpture(x, 0, 0.6, 2.6);
  bench(x, -W / 4, -D / 4, Math.PI, 2.0, pal.wood, pal.wood);
  bench(x, W / 4, -D / 4, Math.PI, 2.0, pal.wood, pal.wood);
  wallSign(x, 2, 0, room.h - 0.9, "MODERN ART", 0xf8f9fa, 0xe03131, 3.0, 0.45, false);
  item(x, "photo", "Selfie with the art", 0, 0, 1.6, 0.8);
  for (let s = 0; s < 5; s++) x.spots.push({ x: -W / 2 + 1 + rnd() * (W - 2), z: -D / 2 + 1.5 + rnd() * (D - 3), ry: rnd() * 6, pose: "stand", y: 0 });
  x.views.push(
    { x: 0, z: -D / 2 + 0.8, yaw: Math.PI, pitch: 0.04 },
    { x: -W / 2 + 1.2, z: -D / 2 + 1.2, yaw: yawTo(-W / 2 + 1.2, -D / 2 + 1.2, W / 3, D / 2), pitch: 0.02 },
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

// ---------------------------------------------------------------- sports venues
//
// The stands round a football pitch, an indoor basketball court, and the boxing and wrestling
// rings: seats facing the action (the front rows are real seats anyone can sit in), a crowd in
// the tiers behind, a big screen, a "Watch the match" spot by it, and the players themselves
// playing away (see ./arenas).

const SPORT_PAL: Pal = {
  wall: 0x232b38,
  accentWall: 0x2f3a4b,
  trim: 0x2f3a4b,
  ceiling: 0x141920,
  floor: ["concrete", 0x3b4049, 0x31363e],
  wood: 0x8a6a4f,
  fabric: 0x1c7ed6,
  fabric2: 0xe03131,
  accent: 0xf5a524,
  metal: 0x2b2f36,
  art: [0xe03131, 0x1c7ed6, 0xf5a524, 0xf1f3f5],
  frame: 0x2b2f36,
  leaves: LEAVES,
  pot: 0x2b2f36,
};

/** Big-screen picture: LIVE, the venue's name and a line about what's on. */
function screenArt(c: CanvasRenderingContext2D, w: number, h: number, title: string, line: string, accent: string) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#0d1626");
  g.addColorStop(1, "#1b2a44");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.fillStyle = accent;
  c.fillRect(0, h - h * 0.08, w, h * 0.08);
  // LIVE pill.
  c.fillStyle = "#e5484d";
  c.beginPath();
  c.roundRect(w * 0.05, h * 0.1, w * 0.17, h * 0.17, h * 0.085);
  c.fill();
  c.fillStyle = "#ffffff";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `900 ${Math.round(h * 0.11)}px system-ui, sans-serif`;
  c.fillText("LIVE", w * 0.135, h * 0.19);
  c.font = `800 ${Math.round(h * 0.12)}px system-ui, sans-serif`;
  c.fillText(title.toUpperCase().slice(0, 30), w / 2, h * 0.45, w * 0.9);
  c.fillStyle = accent;
  c.font = `900 ${Math.round(h * 0.17)}px system-ui, sans-serif`;
  c.fillText(line, w / 2, h * 0.7, w * 0.9);
}

/** A seat up in the tiers (its floor at fy): a plastic stadium seat that anyone can sit in. */
function tierSeat(x: Ctx, px: number, fy: number, pz: number, ry: number, color: number) {
  const { k } = x;
  k.at(px, fy, pz, ry, () => {
    k.box(0, 0, -0.02, 0.36, 0.4, 0.34, shadeHex(color, 0.35), { noAo: true });
    k.soft(0, 0.4, 0.02, 0.46, 0.06, 0.42, color, 0.03);
    k.soft(0, 0.44, -0.2, 0.46, 0.42, 0.05, color, 0.025, { rx: -0.1 });
  });
  const p = k.world(px, fy, pz);
  x.spots.push({ x: p.x, z: p.z, ry: k.worldYaw(ry), pose: "sit", y: fy + 0.46, floor: fy, act: "idle" });
}

/**
 * Tiers of steps behind the front rows, with the crowd sitting on them. In the frame at
 * (cx, cz) turned by ry: the front edge runs along x (len long) at z = 0, rising backwards (-z).
 * `skip` leaves gaps in the crowd (u, row) for real seats.
 */
function tiers(x: Ctx, crowd: { x: number; y: number; z: number; ry: number }[], cx: number, cz: number, ry: number, len: number, rows: number, depth: number, rise: number, colors: [number, number], fill = 0.8, skip?: (u: number, row: number) => boolean, empty?: number) {
  const { k, rnd } = x;
  k.at(cx, 0, cz, ry, () => {
    for (let r = 0; r < rows; r++) {
      const top = (r + 1) * rise;
      k.box(0, 0, -(r + 0.5) * depth, len, top, depth, r % 2 ? colors[1] : colors[0], { noAo: true });
      // A thin bright edge on every step.
      k.box(0, top - 0.02, -r * depth - 0.02, len, 0.03, 0.04, 0xdee2e6, { noAo: true });
      for (let u = -len / 2 + 0.4; u <= len / 2 - 0.4; u += 0.72) {
        if (rnd() > fill) continue;
        if (skip?.(u, r)) {
          // An empty seat.
          if (empty !== undefined) {
            k.box(u, top, -(r + 0.5) * depth + 0.12, 0.44, 0.08, 0.4, empty, { noAo: true });
            k.box(u, top, -(r + 0.5) * depth - 0.1, 0.44, 0.42, 0.06, empty, { noAo: true });
          }
          continue;
        }
        const p = k.world(u, top, -(r + 0.5) * depth + 0.1);
        crowd.push({ x: p.x, y: p.y, z: p.z, ry: k.worldYaw(0) });
      }
    }
    k.shadow(0, -(rows * depth) / 2, len, rows * depth, 0.25);
  });
}

/** The crowd and the players are added to the room, and move every frame. */
function addCrowd(x: Ctx, crowd: { x: number; y: number; z: number; ry: number }[]) {
  if (!crowd.length) return;
  const c = createCrowd(crowd, x.rnd);
  x.extras.push(c.group);
  x.anim.push(c.update);
}

/** A big screen high on a wall (side), showing the venue and what's on. */
function wallScreen(x: Ctx, side: number, y: number, w: number, h: number, line: string) {
  const { k, sheet, info } = x;
  const uv = sheet.paint(512, Math.round(512 * (h / w)), (c, cw, ch) => screenArt(c, cw, ch, info.name, line, "#f5a524"));
  atWall(x, side, 0, () => {
    k.box(0, y - 0.25, 0.12, w + 0.5, h + 0.5, 0.24, 0x111418, { noAo: true });
    k.quad(0, y + h / 2, 0.25, w, h, 0xffffff, { layer: "texGlow" }, uv);
  });
}

/** A four-sided screen hanging over the middle (the jumbotron), at height y. */
function hangingScreen(x: Ctx, y: number, size: number, line: string) {
  const { k, sheet, info, room } = x;
  const uv = sheet.paint(256, 144, (c, cw, ch) => screenArt(c, cw, ch, info.name, line, "#f5a524"));
  const h = size * 0.56;
  k.box(0, y, 0, size, h + 0.3, size, 0x111418, { noAo: true });
  for (let s = 0; s < 4; s++) {
    const a = (s * Math.PI) / 2;
    k.at(0, 0, 0, a, () => k.quad(0, y + 0.15 + h / 2, size / 2 + 0.01, size * 0.92, h, 0xffffff, { layer: "texGlow" }, uv));
  }
  // Hung from the roof on four cables.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box((sx * size) / 2.4, y + h + 0.3, (sz * size) / 2.4, 0.03, room.h - (y + h + 0.3), 0.03, 0x2b2f36, { noAo: true });
}

/** Soft cones of light shining down on the action, from lamps high up. */
function spotlights(x: Ctx, pts: [number, number][], top: number, color = 0xfff3d6) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const geo = new THREE.ConeGeometry(1.6, top, 18, 1, true).translate(0, -top / 2, 0);
  for (const [px, pz] of pts) {
    const cone = new THREE.Mesh(geo, mat);
    cone.position.set(px * 0.4, top, pz * 0.4);
    cone.lookAt(px, 0, pz);
    cone.rotateX(-Math.PI / 2);
    x.extras.push(cone);
    x.k.cyl(px * 0.4, top - 0.1, pz * 0.4, 0.22, 0.3, 0.3, 0x2b2f36, 12, { noAo: true });
    x.k.cyl(px * 0.4, top - 0.12, pz * 0.4, 0.2, 0.2, 0.02, color, 12, { layer: "glow" });
  }
}

/** Boxing (four ropes, red and blue corners) or wrestling (three ropes, a brighter apron). */
function ringHall(x: Ctx, wrestling: boolean) {
  const { k, room, rnd } = x;
  const W = room.w;
  const S = 6.2;
  const half = S / 2;
  const H = 1.0;
  const canvas = wrestling ? 0xf1f3f5 : 0x2f6fd1;
  const apron = wrestling ? pickOf(rnd, [0x7c3aed, 0xe03131, 0x111418]) : 0x111418;
  // The ring: a platform with a skirt, the canvas, corner posts with pads, ropes, and steps.
  k.box(0, 0, 0, S + 1.0, H - 0.04, S + 1.0, apron, { noAo: true });
  k.box(0, H - 0.04, 0, S + 1.0, 0.04, S + 1.0, shadeHex(apron, -0.25), { noAo: true });
  k.box(0, H, 0, S, 0.05, S, canvas, { noAo: true });
  k.mat(0, H + 0.052, 0, S * 0.38, S * 0.38, wrestling ? apron : 0xf5a524, { noAo: true });
  k.mat(0, H + 0.053, 0, S * 0.3, S * 0.3, canvas, { noAo: true });
  const corners: [number, number, number][] = [[-half, -half, wrestling ? 0xf5a524 : 0xe03131], [half, -half, 0xf1f3f5], [half, half, wrestling ? 0xf5a524 : 0x1c7ed6], [-half, half, 0xf1f3f5]];
  for (const [cx, cz, pad] of corners) {
    k.cyl(cx, H, cz, 0.07, 0.07, 1.5, 0xadb5bd, 10);
    k.soft(cx - Math.sign(cx) * 0.08, H + 0.35, cz - Math.sign(cz) * 0.08, 0.22, 1.05, 0.22, pad, 0.06);
  }
  const ropes = wrestling ? [0.45, 0.85, 1.25] : [0.4, 0.72, 1.04, 1.36];
  const ropeColor = wrestling ? apron : 0xf1f3f5;
  for (const ry of ropes) {
    k.box(0, H + ry, -half, S, 0.05, 0.05, ropeColor, { noAo: true });
    k.box(0, H + ry, half, S, 0.05, 0.05, ropeColor, { noAo: true });
    k.box(-half, H + ry, 0, 0.05, 0.05, S, ropeColor, { noAo: true });
    k.box(half, H + ry, 0, 0.05, 0.05, S, ropeColor, { noAo: true });
  }
  for (let st = 0; st < 3; st++) k.box(half + 0.75 + st * 0.3, 0, half - 0.3, 0.32, H - st * 0.32, 0.9, 0x343a40);
  k.shadow(0, 0, S + 1.6, S + 1.6, 0.4);
  // Lights over the ring: a square rig, lamps and soft cones of light.
  const rig = 7.6;
  for (const [bx, bz, bw, bd] of [[0, -half, S + 0.4, 0.2], [0, half, S + 0.4, 0.2], [-half, 0, 0.2, S + 0.4], [half, 0, 0.2, S + 0.4]]) k.box(bx, rig, bz, bw, 0.25, bd, 0x2b2f36, { noAo: true });
  spotlights(x, [[-half + 0.6, -half + 0.6], [half - 0.6, -half + 0.6], [-half + 0.6, half - 0.6], [half - 0.6, half - 0.6]], rig - 0.1);
  hangingScreen(x, rig + 0.4, 2.8, wrestling ? "MAIN EVENT" : "ROUND 3");
  wallScreen(x, 0, 4.2, 8, 4.5, wrestling ? "TITLE MATCH" : "FIGHT NIGHT");
  // Ringside: a row of chairs facing the ring on every side (real seats).
  const row = half + 1.5;
  for (let side = 0; side < 4; side++) {
    const a = (side * Math.PI) / 2;
    for (let s = 0; s < 5; s++) {
      const u = -2.6 + s * 1.3;
      const px = Math.cos(a) * u - Math.sin(a) * row;
      const pz = Math.sin(a) * u + Math.cos(a) * row;
      // Leave the corner with the steps free.
      if (px > half && pz > half - 1.2) continue;
      chair(x, px, pz, faceTo(px, pz, 0, 0), wrestling ? 0xae3ec9 : 0xe03131, 0x2b2f36);
    }
  }
  // Tiers all round with the crowd.
  const crowd: { x: number; y: number; z: number; ry: number }[] = [];
  const front = half + 3.7;
  const rows = 5;
  const depth = 0.85;
  tiers(x, crowd, 0, -front, 0, W - 2 * 0.4, rows, depth, 0.45, [0x2f3a4b, 0x283241]);
  tiers(x, crowd, 0, front, Math.PI, W - 2 * 0.4, rows, depth, 0.45, [0x2f3a4b, 0x283241]);
  tiers(x, crowd, -front, 0, Math.PI / 2, 2 * front - 0.2, rows, depth, 0.45, [0x2f3a4b, 0x283241]);
  tiers(x, crowd, front, 0, -Math.PI / 2, 2 * front - 0.2, rows, depth, 0.45, [0x2f3a4b, 0x283241]);
  addCrowd(x, crowd);
  // The fighters and the referee.
  const skinA = skinOf(rnd);
  const skinB = skinOf(rnd);
  const looks = wrestling
    ? [
        { shirt: 0xe03131, shorts: 0xe03131, skin: skinA, shoes: 0x111418 },
        { shirt: 0x1c7ed6, shorts: 0x1c7ed6, skin: skinB, shoes: 0xf1f3f5 },
        { shirt: 0xf1f3f5, shorts: 0x111418, skin: skinOf(rnd) },
      ]
    : [
        { shirt: skinA, shorts: 0xe03131, skin: skinA, gloves: 0xe03131 },
        { shirt: skinB, shorts: 0x1c7ed6, skin: skinB, gloves: 0x1c7ed6 },
        { shirt: 0xf1f3f5, shorts: 0x111418, skin: skinOf(rnd) },
      ];
  const team = createAthletes(looks);
  team.group.position.y = H + 0.05;
  x.extras.push(team.group);
  const [a, b, ref] = team.rigs;
  a.x = -1.2;
  b.x = 1.2;
  ref.z = 2.2;
  let last = -1;
  x.anim.push((t) => {
    const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, t - last));
    last = t;
    if (wrestling) {
      // Circle, lock up, a slam, a pose to the crowd, and up again (every 9 s).
      const c = t % 9;
      const ang = t * 0.5;
      const r = c < 3.5 ? 1.5 : c < 5 ? 0.38 : 0.6;
      runRig(a, Math.cos(ang) * r, Math.sin(ang) * r, 1.8, dt, false);
      if (c < 5.2 || c > 7.6) runRig(b, -Math.cos(ang) * r, -Math.sin(ang) * r, 1.8, dt, false);
      faceRig(a, b.x, b.z, 0.25);
      if (b.down < 0.5) faceRig(b, a.x, a.z, 0.25);
      const lock = c > 3.5 && c < 5.2 ? 1 : 0;
      a.reachL = a.reachR = lock;
      b.reachL = b.reachR = lock * (c < 5 ? 1 : 0);
      a.lean = b.lean = lock * 0.35;
      a.guard = c > 5.6 && c < 7.4 ? 1 : 0.3;
      b.guard = 0.3;
      b.down += ((c > 5.1 && c < 7.6 ? 1 : 0) - b.down) * Math.min(1, dt * (c < 5.6 ? 9 : 2.5));
    } else {
      // Circle each other, guards up, throwing jabs and the odd big right.
      const ang = t * 0.42;
      const r = 1.05 + Math.sin(t * 0.7) * 0.3;
      runRig(a, Math.cos(ang) * r, Math.sin(ang) * r, 1.6, dt, false);
      runRig(b, -Math.cos(ang) * r, -Math.sin(ang) * r, 1.6, dt, false);
      faceRig(a, b.x, b.z, 0.3);
      faceRig(b, a.x, a.z, 0.3);
      const jab = (s: number) => Math.pow(Math.max(0, Math.sin(s)), 10);
      a.guard = b.guard = 1;
      a.reachL = jab(t * 3.1);
      a.reachR = jab(t * 1.3 + 2);
      b.reachL = jab(t * 2.7 + 1);
      b.reachR = jab(t * 1.1 + 4);
      b.lean = -a.reachR * 0.25;
      a.lean = -b.reachR * 0.25;
    }
    // The referee keeps to the side, watching.
    const ra = t * 0.3 + Math.PI / 2;
    runRig(ref, Math.cos(ra) * 2.3, Math.sin(ra) * 2.3, 1.2, dt, false);
    faceRig(ref, (a.x + b.x) / 2, (a.z + b.z) / 2, 0.2);
    team.update();
  });
  // Where to watch from, and where to tap to watch the fight.
  item(x, "match", "Watch the fight", 0, 0, row - 0.9, 0.9);
  for (let s = 0; s < 4; s++) x.spots.push({ x: -4.5 + s * 1.6, z: front - 0.5, ry: Math.PI, pose: "stand", y: 0, act: "wave" });
  x.lamps.push({ x: 0, y: rig - 0.5, z: 0 }, { x: 0, y: 6, z: front + 2 });
  x.views.push(
    { x: 0.65, z: row + 1.9, yaw: yawTo(0.65, row + 1.9, 0, 0), pitch: 0.0 },
    { x: -row - 1.9, z: -0.65, yaw: yawTo(-row - 1.9, -0.65, 0, 0), pitch: 0.0 },
    { x: row + 1.7, z: -row - 1.7, yaw: yawTo(row + 1.7, -row - 1.7, 0, 0), pitch: -0.02 },
  );
}

/** An indoor basketball court: the court and its lines, hoops, courtside seats and tiers. */
function courtHall(x: Ctx) {
  const { k, room, rnd } = x;
  const W = room.w;
  const L = 26;
  const B = 14;
  const hl = L / 2;
  const hb = B / 2;
  const white = 0xf8f9fa;
  const teams = pickOf(rnd, [[0xf5a524, 0x1c7ed6], [0xe03131, 0x2f9e44], [0x7048e8, 0xf1f3f5], [0x0ca678, 0xe8590c]] as [number, number][]);
  // Lines: the edge, the halfway line, the centre circle, the keys and the three-point arcs.
  const line = (cx: number, cz: number, w: number, d: number) => k.mat(cx, 0.008, cz, w, d, white, { noAo: true });
  line(0, -hb, L, 0.08);
  line(0, hb, L, 0.08);
  line(-hl, 0, 0.08, B);
  line(hl, 0, 0.08, B);
  line(0, 0, 0.08, B);
  k.cyl(0, 0.002, 0, 1.8, 1.8, 0.004, teams[0], 32, { noAo: true });
  k.ring(0, 0.01, 0, 1.8, 0.04, white, { rx: Math.PI / 2, noAo: true });
  for (const side of [-1, 1]) {
    const ex = side * hl;
    k.mat(ex - side * 2.9, 0.006, 0, 5.8, 4.9, side < 0 ? teams[0] : teams[1], { noAo: true });
    line(ex - side * 5.8, 0, 0.08, 4.9);
    line(ex - side * 2.9, -2.45, 5.8, 0.08);
    line(ex - side * 2.9, 2.45, 5.8, 0.08);
    k.ring(ex - side * 5.8, 0.01, 0, 1.8, 0.04, white, { rx: Math.PI / 2, rz: -Math.PI / 2, ry: side < 0 ? 0 : Math.PI, arc: Math.PI, noAo: true });
    k.ring(ex - side * 1.6, 0.01, 0, 6.0, 0.04, white, { rx: Math.PI / 2, rz: -Math.PI / 2, ry: side < 0 ? 0 : Math.PI, arc: Math.PI, noAo: true });
    line(ex - side * 0.8, -6.0, 1.6, 0.08);
    line(ex - side * 0.8, 6.0, 1.6, 0.08);
    // The hoop: a padded base off the court, an arm, the backboard, the rim and the net.
    const bx = ex + side * 1.3;
    k.box(bx, 0, 0, 1.2, 0.9, 1.4, 0x1c2430);
    k.box(bx, 0.9, 0, 0.3, 2.6, 0.3, 0x2b2f36);
    k.box(bx - side * 0.65, 3.3, 0, 1.4, 0.2, 0.2, 0x2b2f36);
    k.box(ex - side * 0.0, 2.85, 0, 0.06, 1.05, 1.8, 0xf1f3f5, { noAo: true });
    k.box(ex - side * 0.04, 3.05, 0, 0.02, 0.45, 0.59, 0xe03131, { noAo: true });
    k.box(ex - side * 0.045, 3.1, 0, 0.02, 0.35, 0.49, 0xf1f3f5, { noAo: true });
    k.ring(ex - side * 0.45, 3.05, 0, 0.23, 0.02, 0xf76707, { rx: Math.PI / 2, noAo: true });
    k.cyl(ex - side * 0.45, 2.62, 0, 0.23, 0.15, 0.42, 0xf8f9fa, 10, { open: true, layer: "glow" });
    k.shadow(bx, 0, 1.4, 1.6, 0.3);
  }
  // Courtside: the scorer's table across the court, and rows of chairs either side.
  const near = hb + 1.2;
  k.box(0, 0, -(near - 0.1), 3.6, 0.78, 0.7, 0x111418);
  k.box(0, 0.08, -(near - 0.1) + 0.36, 3.4, 0.55, 0.02, teams[0], { layer: "glow" });
  for (const side of [-1, 1]) {
    for (let c = 0; c < 8; c++) {
      const px = -9.8 + c * 2.8;
      if (Math.abs(px) < 2.8) continue;
      chair(x, px, side * (near + 0.6), side > 0 ? Math.PI : 0, side > 0 ? teams[0] : teams[1], 0x2b2f36);
    }
  }
  item(x, "match", "Watch the match", 0, 0, near - 0.75, 0.9);
  // Tiers on all four sides, and the crowd.
  const crowd: { x: number; y: number; z: number; ry: number }[] = [];
  const tz = near + 1.7;
  tiers(x, crowd, 0, -tz, 0, L + 4, 3, 0.9, 0.5, [0x2f3a4b, 0x283241]);
  tiers(x, crowd, 0, tz, Math.PI, L + 4, 3, 0.9, 0.5, [0x2f3a4b, 0x283241]);
  tiers(x, crowd, -(hl + 2.5), 0, Math.PI / 2, 2 * tz - 0.4, 2, 0.9, 0.5, [0x2f3a4b, 0x283241]);
  tiers(x, crowd, hl + 2.5, 0, -Math.PI / 2, 2 * tz - 0.4, 2, 0.9, 0.5, [0x2f3a4b, 0x283241]);
  addCrowd(x, crowd);
  hangingScreen(x, 7.2, 3.6, "Q3  58 - 54");
  wallScreen(x, 0, 6.0, 9, 3.4, "GAME NIGHT");
  linearLights(x, 3, "x");
  spotlights(x, [[-6, 0], [6, 0]], room.h - 0.3, 0xf4f8ff);
  // The players (two on two) and the ball.
  const looks = [0, 1, 2, 3].map((i) => ({ shirt: teams[i % 2], shorts: teams[i % 2], skin: skinOf(rnd), shoes: 0xf1f3f5 }));
  const team = createAthletes(looks);
  x.extras.push(team.group);
  const ballMat = new THREE.MeshLambertMaterial({ color: 0xe8590c });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), ballMat);
  x.extras.push(ball);
  team.rigs.forEach((r, i) => {
    r.x = (i - 1.5) * 2;
    r.z = (i % 2 ? 1 : -1) * 2;
  });
  let last = -1;
  x.anim.push((t) => {
    const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, t - last));
    last = t;
    // Each attack lasts 9 s, towards alternate ends: dribble up, shoot, score.
    const p = Math.floor(t / 9);
    const u = t - p * 9;
    const dir = p % 2 ? 1 : -1;
    const atk = p % 2;
    const rimX = dir * (hl - 0.45);
    const carrier = team.rigs[atk + (p % 4 < 2 ? 0 : 2)];
    const mate = team.rigs[atk + (p % 4 < 2 ? 2 : 0)];
    const shootX = dir * 7.2;
    const shootZ = Math.sin(p * 1.7) * 3;
    const go = Math.min(1, u / 5.5);
    const cx = -dir * 2 + (shootX + dir * 2) * go;
    const cz = shootZ * go + Math.sin(u * 1.3) * 0.8 * (1 - go);
    runRig(carrier, cx, cz, 5, dt);
    if (u > 5) faceRig(carrier, rimX, 0, 0.2);
    runRig(mate, dir * 9.5, -shootZ * 0.8 + Math.sin(t) * 1.5, 4.5, dt);
    // Defenders mark them, between them and the basket.
    const def = team.rigs.filter((r) => r !== carrier && r !== mate);
    runRig(def[0], carrier.x + dir * 1.1, carrier.z * 0.85, 5, dt, false);
    faceRig(def[0], carrier.x, carrier.z, 0.2);
    runRig(def[1], mate.x + dir * 1.0, mate.z * 0.85, 4.5, dt, false);
    faceRig(def[1], mate.x, mate.z, 0.2);
    for (const r of team.rigs) r.y = 0;
    for (const r of team.rigs) r.guard = 0;
    if (u < 5.5) {
      // Dribbling.
      const f = Math.abs(Math.sin(u * 7));
      ball.position.set(carrier.x + Math.sin(carrier.yaw) * 0.35 + Math.cos(carrier.yaw) * 0.25, 0.12 + f * 0.75, carrier.z + Math.cos(carrier.yaw) * 0.35 - Math.sin(carrier.yaw) * 0.25);
      carrier.reachR = 0.25 + (1 - f) * 0.2;
      def[0].guard = 0.4;
    } else if (u < 6.6) {
      // The shot: a jump, arms up, the ball arcs to the rim.
      const s = (u - 5.5) / 1.1;
      carrier.y = Math.sin(Math.min(1, s * 2.2) * Math.PI) * 0.45;
      carrier.guard = 1;
      def[0].guard = 1;
      def[0].y = Math.sin(Math.min(1, s * 2.4) * Math.PI) * 0.35;
      const sx = carrier.x;
      const sz = carrier.z;
      ball.position.set(sx + (rimX - sx) * s, 2.3 + (3.25 - 2.3) * s + Math.sin(s * Math.PI) * 2.2, sz + (0 - sz) * s);
    } else if (u < 7.0) {
      // Through the net.
      const s = (u - 6.6) / 0.4;
      ball.position.set(rimX, 3.2 - s * 2.9, 0);
    } else {
      // It bounces away to the other team.
      const s = (u - 7) / 2;
      ball.position.set(rimX - dir * s * 2.5, 0.12 + Math.abs(Math.sin(s * 9)) * (1 - s) * 0.9, Math.sin(s * 3) * 0.6);
    }
    team.update();
  });
  x.lamps.push({ x: -5, y: room.h - 1, z: 0 }, { x: 5, y: room.h - 1, z: 0 });
  x.views.push(
    { x: 0, z: near + 1.2, yaw: yawTo(0, near + 1.2, 0, 0), pitch: -0.04 },
    { x: -hl - 1.4, z: 3.0, yaw: yawTo(-hl - 1.4, 3.0, 0, 0), pitch: 0 },
    { x: -8, z: -(near + 0.8), yaw: yawTo(-8, -(near + 0.8), 0, 0), pitch: -0.02 },
  );
  void W;
}

/**
 * The stands round a football pitch, open to the sky, with floodlights and a big screen. The
 * pitch lies below: you stand on the walkway part way up the near stand (floor level here),
 * with real seats in the row behind it.
 */
function standsBowl(x: Ctx) {
  const { k, room, rnd } = x;
  const W = room.w;
  const D = room.d;
  const L = 56;
  const B = 36;
  const hl = L / 2;
  const hb = B / 2;
  const white = 0xf8f9fa;
  const depth = 0.85;
  const rise = 0.55;
  // The pitch is five rows down.
  const P = -5 * rise;
  // The sky (it gets dark at night), on a big dome round everything.
  const skyGeo = new THREE.SphereGeometry(150, 24, 12);
  const skyCols: number[] = [];
  const pos = skyGeo.getAttribute("position");
  const top = new THREE.Color(0x6fb2e6);
  const low = new THREE.Color(0xd9eef9);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(low).lerp(top, Math.min(1, Math.max(0, pos.getY(i) / 90)));
    skyCols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(skyCols, 3));
  const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -1;
  x.extras.push(sky);
  x.nightHooks.push((n) => skyMat.color.setRGB(1 - 0.85 * n, 1 - 0.83 * n, 1 - 0.72 * n));
  const crowd: { x: number; y: number; z: number; ry: number }[] = [];
  const sz = hb + 2.6;
  const sx = hl + 3.6;
  const walk0 = sz + 5 * depth;
  const walk1 = walk0 + 3.4;
  k.floorY = P;
  k.at(0, P, 0, 0, () => {
    // Under everything, then the pitch: mown stripes, a grass margin, and the lines.
    k.mat(0, -0.02, 0, W, D, 0x2b2f36, { noAo: true });
    k.mat(0, 0.004, 0, L + 8, B + 6, 0x3f8f45, { noAo: true });
    for (let s = 0; s < 14; s++) k.mat(-hl + (s + 0.5) * (L / 14), 0.006, 0, L / 14, B, s % 2 ? 0x4caf50 : 0x43a047, { noAo: true });
    const line = (cx: number, cz: number, w: number, d: number) => k.mat(cx, 0.009, cz, w, d, white, { noAo: true });
    line(0, -hb, L, 0.12);
    line(0, hb, L, 0.12);
    line(-hl, 0, 0.12, B);
    line(hl, 0, 0.12, B);
    line(0, 0, 0.12, B);
    k.ring(0, 0.01, 0, 5.2, 0.06, white, { rx: Math.PI / 2, noAo: true });
    k.cyl(0, 0.008, 0, 0.18, 0.18, 0.004, white, 12, { noAo: true });
    for (const side of [-1, 1]) {
      const ex = side * hl;
      // Penalty box, goal area, penalty spot.
      line(ex - side * 9, 0, 0.12, 22);
      line(ex - side * 4.5, -11, 9, 0.12);
      line(ex - side * 4.5, 11, 9, 0.12);
      line(ex - side * 3, 0, 0.12, 10);
      line(ex - side * 1.5, -5, 3, 0.12);
      line(ex - side * 1.5, 5, 3, 0.12);
      k.cyl(ex - side * 6.5, 0.008, 0, 0.15, 0.15, 0.004, white, 10, { noAo: true });
      // The goal: posts, crossbar and a net.
      for (const gz of [-3.6, 3.6]) k.box(ex, 0, gz, 0.14, 2.44, 0.14, white);
      k.box(ex, 2.37, 0, 0.14, 0.14, 7.34, white);
      k.box(ex + side * 1.6, 0, 0, 0.05, 1.6, 7.3, white, { layer: "glass" });
      k.box(ex + side * 0.8, 2.36, 0, 1.6, 0.04, 7.3, white, { layer: "glass" });
      for (const gz of [-3.65, 3.65]) k.box(ex + side * 0.8, 0, gz, 1.6, 2.4, 0.04, white, { layer: "glass" });
    }
    // The dugouts by the near touchline.
    for (const dx of [-14, 14]) {
      k.box(dx, 0, hb + 1.4, 6, 0.1, 1.6, 0x2b2f36);
      k.box(dx, 0, hb + 2.15, 6, 1.9, 0.1, 0x2b2f36);
      k.box(dx, 1.9, hb + 1.4, 6.1, 0.08, 1.7, 0xdee2e6, { layer: "glass" });
      k.box(dx, 0, hb + 1.8, 5.4, 0.45, 0.45, 0x1c7ed6);
    }
    // The lower stands: up to the walkway on the near side, all the way up on the others.
    // (Nobody in the top rows right under the walkway, so they don't block the view.)
    tiers(x, crowd, 0, sz, Math.PI, L + 6, 5, depth, rise, [0xc92a2a, 0xa61e1e], 1, (_u, row) => row >= 3, 0xe03131);
    tiers(x, crowd, 0, -sz, 0, L + 6, 10, depth, rise, [0x1864ab, 0x145591], 0.85);
    tiers(x, crowd, -sx, 0, Math.PI / 2, 2 * sz - 1, 8, depth, rise, [0x343a40, 0x2b2f36], 0.8);
    tiers(x, crowd, sx, 0, -Math.PI / 2, 2 * sz - 1, 8, depth, rise, [0x343a40, 0x2b2f36], 0.8);
    // Floodlights on the four corners.
    for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = fx * (sx + 4);
      const pz = fz * (sz + 6);
      k.box(px, 0, pz, 0.6, 18, 0.6, 0x868e96);
      k.at(px, 18, pz, Math.atan2(-px, -pz), () => {
        k.box(0, 0, 0, 3.4, 1.8, 0.4, 0x495057, { rx: 0.4 });
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) k.box(-1.2 + i * 0.8, 0.25 + j * 0.75, 0.2, 0.55, 0.5, 0.06, 0xfff8e1, { layer: "glow", rx: 0.4 });
      });
    }
    // The big screen over the east end.
    const uv = x.sheet.paint(512, 256, (cc, cw, ch) => screenArt(cc, cw, ch, x.info.name, "LIONS 1 - 0 EAGLES", "#f5a524"));
    k.at(sx + 8 * depth + 0.4, 0, 0, -Math.PI / 2, () => {
      k.box(0, 8 * rise + 1.0, 0, 15, 8, 0.6, 0x111418);
      k.quad(0, 8 * rise + 5.0, 0.31, 14, 7, 0xffffff, { layer: "texGlow" }, uv);
    });
    // Back walls behind the end stands and the far stand, and its roof.
    for (const xx of [sx, -sx]) k.box(xx + Math.sign(xx) * (8 * depth + 0.3), 0, 0, 0.6, 8 * rise + 1.2, 2 * sz + 4, 0x2b2f36);
    const farBack = -sz - 10 * depth;
    k.box(0, 0, farBack - 0.3, L + 6, 10 * rise + 4.2, 0.6, 0x2b2f36);
    k.box(0, 10 * rise + 4.0, farBack + 4.0, L + 6, 0.25, 10 * depth + 1.2, 0xe9ecef);
    for (let p = -3; p <= 3; p++) k.box(p * 9, 10 * rise, farBack, 0.25, 4.0, 0.25, 0xadb5bd);
  });
  k.floorY = 0;
  // The walkway (where you stand), its glass rail, and the upper tier behind with real seats in
  // its first row, under a roof.
  k.box(0, -0.4, (walk0 + walk1) / 2, W, 0.4, walk1 - walk0, 0x8d939a, { noAo: true });
  k.box(0, 0, walk0 + 0.05, L + 6, 1.0, 0.06, 0xd6e9f5, { layer: "glass" });
  k.box(0, 1.0, walk0 + 0.05, L + 6, 0.06, 0.1, 0xadb5bd, { noAo: true });
  tiers(x, crowd, 0, walk1, Math.PI, L + 6, 5, depth, rise, [0xc92a2a, 0xa61e1e], 0.85, (u, row) => row === 0 && Math.abs(u) < 9);
  addCrowd(x, crowd);
  for (let s = 0; s < 22; s++) tierSeat(x, -8.5 + s * 0.81, rise, walk1 + 0.5 * depth - 0.05, Math.PI, 0xf1f3f5);
  const upBack = walk1 + 5 * depth;
  k.box(0, 0, upBack + 0.3, L + 6, 5 * rise + 4.2, 0.6, 0x2b2f36);
  k.box(0, 5 * rise + 4.0, (walk0 + upBack) / 2 + 0.4, L + 6, 0.25, upBack - walk0 + 1.2, 0xe9ecef);
  for (let p = -3; p <= 3; p++) k.box(p * 9, 5 * rise, upBack, 0.25, 4.0, 0.25, 0xadb5bd);
  // Just over the rail, in front of you (on the empty seats at the top of the lower tier).
  item(x, "match", "Watch the match", 0.3, 0.05, walk0 - 0.5, 0.9);
  // Keep walkers on the walkway (the pitch and the lower tiers are down below).
  for (let k3 = 0; k3 < 3; k3++) x.blocks.push({ x: -W / 3 + (k3 * W) / 3, z: (-D / 2 + walk0) / 2, w: W / 3, d: walk0 + D / 2, ry: 0 });
  // The players: two teams of five, their keepers, a referee, and the ball.
  const home = pickOf(rnd, [[0xe03131, 0xf8f9fa], [0xf5a524, 0x18202b], [0x2f9e44, 0xf8f9fa]] as [number, number][]);
  const away = pickOf(rnd, [[0x1c7ed6, 0x18202b], [0xf8f9fa, 0x1c7ed6], [0x7048e8, 0xf8f9fa]] as [number, number][]);
  const looks: AthleteLook[] = [];
  for (let i = 0; i < 5; i++) looks.push({ shirt: home[0], shorts: home[1], skin: skinOf(rnd), shoes: 0x111418 });
  for (let i = 0; i < 5; i++) looks.push({ shirt: away[0], shorts: away[1], skin: skinOf(rnd), shoes: 0x111418 });
  looks.push({ shirt: 0x2f9e44, shorts: 0x111418, skin: skinOf(rnd), gloves: 0xf1f3f5 }, { shirt: 0xffd43b, shorts: 0x111418, skin: skinOf(rnd), gloves: 0xf1f3f5 }, { shirt: 0x18202b, shorts: 0x18202b, skin: skinOf(rnd) });
  const team = createAthletes(looks);
  team.group.position.y = P;
  x.extras.push(team.group);
  const ballMat = new THREE.MeshLambertMaterial({ color: 0xf8f9fa });
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), ballMat);
  x.extras.push(ball);
  // Where each outfield player keeps to (home team attacks +x), as a share of the pitch.
  const shape = [[-0.55, -0.45], [-0.55, 0.45], [-0.15, 0], [0.25, -0.35], [0.25, 0.35]];
  team.rigs.forEach((r, i) => {
    const s = shape[i % 5];
    r.x = (i < 5 ? s[0] : -s[0]) * hl;
    r.z = s[1] * hb;
  });
  let last = -1;
  x.anim.push((t) => {
    const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, t - last));
    last = t;
    // The ball wanders round the pitch (a smooth path), now and then lofted.
    const bx = Math.sin(t * 0.11) * (hl - 6) + Math.sin(t * 0.37 + 1) * 5;
    const bz = Math.sin(t * 0.17 + 2) * (hb - 5) + Math.sin(t * 0.53) * 3;
    const loft = Math.max(0, Math.sin(t * 0.9)) ** 6 * 2.2;
    ball.position.set(bx, P + 0.16 + loft, bz);
    ball.rotation.x = t * 6;
    ball.rotation.z = t * 4;
    // The nearest player of each side goes for it; the others keep their shape, drawn towards it.
    for (let side = 0; side < 2; side++) {
      let best = side * 5;
      for (let i = side * 5; i < side * 5 + 5; i++) {
        const r = team.rigs[i];
        const b = team.rigs[best];
        if (Math.hypot(r.x - bx, r.z - bz) < Math.hypot(b.x - bx, b.z - bz)) best = i;
      }
      for (let i = side * 5; i < side * 5 + 5; i++) {
        const r = team.rigs[i];
        const s = shape[i % 5];
        const hx = (side === 0 ? s[0] : -s[0]) * hl;
        const hz = s[1] * hb;
        if (i === best) runRig(r, bx - (side === 0 ? 0.5 : -0.5), bz, 7, dt);
        else {
          runRig(r, hx + (bx - hx) * 0.45, hz + (bz - hz) * 0.35, 4.5, dt, false);
          faceRig(r, bx, bz, Math.min(1, dt * 3));
        }
      }
    }
    // Keepers move along their goal line with the ball; the referee follows play.
    const kh = team.rigs[10];
    const ka = team.rigs[11];
    runRig(kh, -hl + 1.2, Math.max(-3, Math.min(3, bz * 0.2)), 3, dt, false);
    faceRig(kh, bx, bz, 0.1);
    runRig(ka, hl - 1.2, Math.max(-3, Math.min(3, bz * 0.2)), 3, dt, false);
    faceRig(ka, bx, bz, 0.1);
    kh.guard = ka.guard = 0.35;
    const ref = team.rigs[12];
    runRig(ref, bx - 6, bz * 0.6 + 4, 5, dt, false);
    faceRig(ref, bx, bz, 0.1);
    team.update();
  });
  x.lamps.push({ x: -hl / 2, y: 12, z: 0 }, { x: hl / 2, y: 12, z: 0 });
  const vz = walk0 + 1.3;
  x.views.push(
    { x: 0, z: vz, yaw: yawTo(0, vz, 0, 0), pitch: -0.16 },
    { x: -18, z: vz, yaw: yawTo(-18, vz, -8, 0), pitch: -0.15 },
    { x: 18, z: vz, yaw: yawTo(18, vz, 8, 0), pitch: -0.15 },
  );
}

// ---------------------------------------------------------------- bank, gym, spa, church, mosque

const BANK_PAL: Pal = { wall: 0xf3ede1, accentWall: 0x1f3b2c, trim: 0xe2d6bd, ceiling: 0xf8f3e8, floor: ["marble", 0xf2ece0, 0xc9bfa9], wood: 0x5c3d26, fabric: 0x1f3b2c, fabric2: 0xd9c7a7, accent: 0xc9a227, metal: 0xc9a227, art: [0x1f3b2c, 0xc9a227, 0xe8dcc8, 0x8c5a3c], frame: 0xc9a227, leaves: LEAVES, pot: 0x1f3b2c };
const VAULT_PAL: Pal = { wall: 0x8d949c, accentWall: 0x6c737b, trim: 0x5f666e, ceiling: 0x5a6068, floor: ["concrete", 0x7d838a, 0x6e747b], wood: 0x4a4f55, fabric: 0x2b2f33, fabric2: 0xc9a227, accent: 0xc9a227, metal: 0xb8bec6, art: [0xc9a227], frame: 0x2b2f33, leaves: LEAVES, pot: 0x2b2f33 };
const GYM_PAL: Pal = { wall: 0xdfe3e8, accentWall: 0xff6b1a, trim: 0xc9ced4, ceiling: 0x4a505a, floor: ["concrete", 0x3d4148, 0x33373d], wood: 0x2b2f36, fabric: 0xff6b1a, fabric2: 0x495057, accent: 0xff6b1a, metal: 0xadb5bd, art: [0xff6b1a, 0xffffff], frame: 0x1f2226, leaves: LEAVES, pot: 0x2b2f36 };
const SPA_PAL: Pal = { wall: 0xf4efe6, accentWall: 0xb08458, trim: 0xe6dccb, ceiling: 0xfaf6ef, floor: ["stone", 0xe2d9c8, 0xd2c6b0], wood: 0xb08458, fabric: 0xf8f4ec, fabric2: 0x8fb5a3, accent: 0x8fb5a3, metal: 0xc8a96e, art: [0x8fb5a3, 0xe2d6bd, 0xb08458], frame: 0xb08458, leaves: LEAVES, pot: 0xe2d6bd };
const CHURCH_PAL: Pal = { wall: 0xe9e1d0, accentWall: 0xd8ccb2, trim: 0xcfc1a4, ceiling: 0x9a8a72, floor: ["stone", 0xd6cdbb, 0xc2b79f], wood: 0x6b4a2f, fabric: 0x8b1e2d, fabric2: 0xd9c7a7, accent: 0xc9a227, metal: 0xc9a227, art: [0x2e4a8a, 0xc9a227, 0x8b1e2d, 0x2f6650], frame: 0xc9a227, leaves: LEAVES, pot: 0x6b4a2f };
const MOSQUE_PAL: Pal = { wall: 0xf7f4ec, accentWall: 0x1f8a5b, trim: 0xe6dfcd, ceiling: 0xf2ece0, floor: ["carpet", 0x1f6b4a, 0x175a3d], wood: 0x6b4a2f, fabric: 0x1f8a5b, fabric2: 0xf2b632, accent: 0xf2b632, metal: 0xc9a227, art: [0x1f8a5b, 0xf2b632], frame: 0xc9a227, leaves: LEAVES, pot: 0x1f8a5b };

/** A row of brass posts with a red rope between them (the queue at the bank). */
function queueRope(x: Ctx, x0: number, z: number, n: number, gap: number) {
  const { k } = x;
  for (let p = 0; p < n; p++) {
    const px = x0 + p * gap;
    k.cyl(px, 0, z, 0.12, 0.14, 0.03, 0xc9a227, 12);
    k.cyl(px, 0.03, z, 0.025, 0.025, 0.9, 0xc9a227, 8);
    k.ball(px, 0.95, z, 0.045, 0xc9a227);
    if (p < n - 1) k.box(px + gap / 2, 0.82, z, gap - 0.06, 0.03, 0.03, 0x9b1c2c, { noAo: true });
  }
}

/** The big round steel door of a vault, set in a wall (in the wall's frame), open or shut. */
function vaultDoor(x: Ctx, open: boolean) {
  const { k } = x;
  k.box(0, 0, 0.05, 3.4, 3.2, 0.1, 0x6c737b, { noAo: true });
  k.cyl(0, 1.5, 0.1, 1.35, 1.35, 0.12, 0x495057, 32, { rx: Math.PI / 2, noAo: true });
  if (open) {
    // The door swung out to the side, the dark inside showing gold.
    k.cyl(0, 1.5, 0.12, 1.15, 1.15, 0.02, 0x1d2024, 32, { rx: Math.PI / 2, noAo: true });
    k.at(1.3, 0, 1.05, -1.2, () => {
      k.cyl(0, 1.5, 0, 1.2, 1.2, 0.45, 0xb8bec6, 32, { rx: Math.PI / 2, noAo: true });
      for (let s = 0; s < 6; s++) k.cyl(Math.cos((s / 6) * 6.28) * 0.75, 1.5 + Math.sin((s / 6) * 6.28) * 0.75, 0.25, 0.08, 0.08, 0.12, 0xdee2e6, 10, { rx: Math.PI / 2, noAo: true });
    });
  } else {
    k.cyl(0, 1.5, 0.22, 1.2, 1.2, 0.2, 0xb8bec6, 32, { rx: Math.PI / 2, noAo: true });
    k.ring(0, 1.5, 0.44, 0.5, 0.05, 0xdee2e6, { rx: 0 });
    for (let s = 0; s < 3; s++) k.box(0, 1.47, 0.46, 1.1, 0.06, 0.04, 0xdee2e6, { rz: (s / 3) * Math.PI, noAo: true });
    k.cyl(0, 1.5, 0.44, 0.14, 0.14, 0.1, 0x868e96, 16, { rx: Math.PI / 2, noAo: true });
  }
}

function bankHall(x: Ctx) {
  const { k, room, pal, info } = x;
  const W = room.w;
  const D = room.d;
  // Columns down both sides, with gold capitals.
  for (const side of [-1, 1]) {
    for (let c = 0; c < 4; c++) {
      const cz = -D / 2 + 2.5 + c * ((D - 5) / 3);
      k.cyl(side * (W / 2 - 1.6), 0, cz, 0.32, 0.32, room.h - 0.5, 0xf7f1e6, 20);
      k.box(side * (W / 2 - 1.6), room.h - 0.5, cz, 0.85, 0.3, 0.85, 0xe2d6bd, { noAo: true });
      k.box(side * (W / 2 - 1.6), room.h - 0.62, cz, 0.75, 0.12, 0.75, pal.accent, { noAo: true });
    }
  }
  // The tellers' counter across the back: wood, marble top, glass screens, gold numbers.
  const cz = -D / 2 + 3.2;
  k.box(0, 0, cz, W - 6, 1.1, 0.8, pal.wood);
  k.box(0, 1.1, cz, W - 5.9, 0.06, 0.9, 0xf2ece0);
  for (let t = 0; t < 5; t++) {
    const tx = -((W - 6) / 2) + 1 + t * ((W - 8) / 4);
    k.box(tx, 1.16, cz, 1.4, 0.9, 0.03, 0xd6e9f5, { layer: "glass" });
    const uv = x.sheet.paint(96, 48, (c, w, h) => sign(c, w, h, String(t + 1), 0x1f3b2c, 0xf2c94c, { weight: 800 }));
    k.quad(tx, 2.25, cz + 0.05, 0.3, 0.15, 0xffffff, { layer: "texGlow" }, uv);
    spot(x, tx, cz - 0.7, 0, "stand");
    spot(x, tx, cz + 1.0, Math.PI, "stand");
  }
  // The vault door, shut, in the wall behind the tellers (tap it to try robbing the bank).
  atWall(x, 0, W / 2 - 3.5, () => vaultDoor(x, false));
  // (Things only light up within a few steps, so the button stands out on the hall floor.)
  if (BANK_ROBBERY) item(x, "vault", "Rob the vault", W / 2 - 7.5, 0, 0.8, 1.2);
  // The bank's name in gold over the counter.
  wallSign(x, 0, -2.5, 3.6, info.name.toUpperCase(), 0x1f3b2c, 0xf2c94c, 6.5, 0.7, true);
  // The queue, a desk with forms, cash machines on a side wall, chandeliers.
  queueRope(x, -3.5, cz + 2.2, 6, 1.2);
  table(x, -W / 2 + 3.2, -1.2, Math.PI / 2, 2.2, 0.8, 0xf2ece0, pal.wood, { h: 1.05 });
  for (let a = 0; a < 3; a++) {
    atWall(x, 1, -2 + a * 1.4, () => {
      k.box(0, 0, 0.25, 0.9, 1.7, 0.5, 0x2b2f33);
      k.box(0, 1.15, 0.51, 0.5, 0.35, 0.02, 0x4dabf7, { layer: "glow" });
      k.box(0, 0.95, 0.52, 0.5, 0.06, 0.06, 0x495057);
    });
  }
  for (const px of [-W / 4, W / 4]) {
    k.cyl(px, room.h - 1.6, 0.5, 0.9, 0.5, 0.6, pal.accent, 20, { noAo: true, open: true });
    for (let b = 0; b < 8; b++) k.ball(px + Math.cos(b * 0.785) * 0.8, room.h - 1.65, 0.5 + Math.sin(b * 0.785) * 0.8, 0.09, 0xfff3dc, { layer: "glow" });
    k.cyl(px, room.h - 1.0, 0.5, 0.01, 0.01, 1.0, 0x2b2b2b, 4, { noAo: true });
    x.lamps.push({ x: px, y: room.h - 1.6, z: 0.5 });
  }
  bench(x, -W / 2 + 2.6, 2.2, Math.PI / 2, 2.2, 0x1f3b2c, pal.wood, 3);
  bench(x, W / 2 - 2.6, 2.2, -Math.PI / 2, 2.2, 0x1f3b2c, pal.wood, 3);
  plant(x, -W / 2 + 0.8, D / 2 - 0.8, 1.6, "palm");
  plant(x, W / 2 - 0.8, D / 2 - 0.8, 1.6, "palm");
  // A guard by the door.
  spot(x, W / 2 - 1.2, D / 2 - 1.6, -Math.PI / 2, "stand");
  x.views.push({ x: 0, z: D / 2 - 1.5, yaw: 0, pitch: -0.05 }, { x: -W / 2 + 2, z: D / 2 - 2, yaw: yawTo(-W / 2 + 2, D / 2 - 2, W / 4, -D / 2), pitch: -0.06 });
}

function vaultRoom(x: Ctx) {
  const { k, room } = x;
  const W = room.w;
  const D = room.d;
  // The open vault door in the front wall; the gold is there for the taking (at a price).
  atWall(x, 2, 0, () => vaultDoor(x, true));
  if (BANK_ROBBERY) item(x, "vault", "Rob the vault", 0, 0, 0, 1.4);
  // Walls of safe-deposit boxes.
  for (const side of [1, 3]) {
    atWall(x, side, 0, () => {
      for (let r = 0; r < 7; r++) for (let c = 0; c < 10; c++) {
        k.box(-D / 2 + 1 + c * ((D - 2) / 9), 0.3 + r * 0.38, 0.04, 0.42, 0.32, 0.06, 0xb8bec6, { noAo: true });
        k.box(-D / 2 + 1 + c * ((D - 2) / 9), 0.42 + r * 0.38, 0.08, 0.06, 0.06, 0.03, 0xc9a227, { noAo: true });
      }
    });
  }
  // Stacks of gold bars and money on steel shelves down the middle, a cage at the back.
  for (const sx of [-1.4, 1.4]) {
    k.box(sx, 0, 0, 1.2, 0.9, 3.5, 0x6c737b);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        k.box(sx - 0.35 + (r % 2) * 0.7, 0.9 + Math.floor(r / 2) * 0.12, -1.4 + c * 0.55, 0.28, 0.1, 0.5, 0xf2b632);
      }
    }
    for (let c = 0; c < 4; c++) k.box(sx, 1.15, -1.2 + c * 0.8, 0.9, 0.25, 0.5, 0x2f9e44);
  }
  for (let b = 0; b < 9; b++) k.box(-2 + b * 0.5, 0, -D / 2 + 1.2, 0.04, 2.6, 0.04, 0x495057);
  k.box(0, 2.6, -D / 2 + 1.2, 4.2, 0.05, 0.05, 0x495057);
  for (let p = 0; p < 3; p++) k.box(-1 + p, 0, -D / 2 + 0.6, 0.6, 0.6, 0.6, 0x5c3d26);
  // Red alarm lights and a laser grid on the floor.
  for (const px of [-W / 2 + 0.6, W / 2 - 0.6]) k.ball(px, room.h - 0.3, -D / 2 + 0.6, 0.12, 0xff3b3b, { layer: "glow" });
  for (let l = 0; l < 5; l++) k.box(0, 0.35 + l * 0.12, D / 2 - 2.5, W - 1, 0.01, 0.01, 0xff2d2d, { layer: "glow", noAo: true });
  linearLights(x, 2, "z", 0xe9f2ff);
  x.views.push({ x: 0, z: D / 2 - 1, yaw: 0, pitch: -0.12 });
}

function gymFloor(x: Ctx) {
  const { k, room, pal } = x;
  const W = room.w;
  const D = room.d;
  const orange = pal.accent;
  // Rubber mats, a mirror wall (west), an orange stripe, the motto.
  k.mat(0, 0.006, 0, W - 1.2, D - 1.2, 0x2b2f36);
  atWall(x, 3, 0, () => {
    k.box(0, 0.3, 0.03, D - 1.5, 2.4, 0.02, 0xc9e4f5, { layer: "glow", noAo: true });
    k.box(0, 2.9, 0.04, D - 1, 0.12, 0.02, orange, { noAo: true });
  });
  wallSign(x, 0, 0, 3.6, "NO PAIN NO GAIN", 0x16191d, orange, 5, 0.6, true);
  // Treadmills in a row along the east windows, facing out.
  for (let t = 0; t < 6; t++) {
    const tz = -D / 2 + 2.2 + t * 1.45;
    k.at(W / 2 - 2.0, 0, tz, -Math.PI / 2, () => {
      k.box(0, 0, 0, 0.75, 0.2, 1.8, 0x1f2226);
      k.box(0, 0.2, 0, 0.55, 0.02, 1.5, 0x343a40);
      for (const sx of [-0.33, 0.33]) k.box(sx, 0.2, -0.75, 0.05, 1.15, 0.05, pal.metal);
      k.box(0, 1.3, -0.78, 0.7, 0.35, 0.08, 0x212529);
      k.box(0, 1.35, -0.83, 0.5, 0.22, 0.01, 0x4dabf7, { layer: "glow" });
      if (t % 2 === 0) spot(x, 0, 0.1, Math.PI, "stand");
    });
  }
  // Weight racks along the back wall, benches with barbells in front.
  for (const rx of [-3, 2]) {
    const rz = -D / 2 + 0.9;
    k.box(rx, 0, rz, 2.4, 0.9, 0.5, 0x343a40);
    for (let d = 0; d < 7; d++) {
      for (const sz of [-0.12, 0.12]) k.cyl(rx - 1.0 + d * 0.33, 0.97, rz + sz, 0.07 + d * 0.008, 0.07 + d * 0.008, 0.07, d % 2 ? 0x212529 : orange, 12, { rx: Math.PI / 2, noAo: true });
    }
    k.at(rx, 0, rz + 2.0, 0, () => {
      k.box(0, 0, 0, 0.35, 0.45, 1.2, 0x212529);
      k.soft(0, 0.45, 0, 0.32, 0.08, 1.2, 0xc92a2a, 0.03);
      for (const sx of [-0.4, 0.4]) k.box(sx, 0, -0.45, 0.05, 1.0, 0.05, pal.metal, { noAo: true });
      k.box(0, 1.0, -0.45, 1.6, 0.03, 0.03, pal.metal, { noAo: true });
      for (const sx of [-0.7, 0.7]) k.cyl(sx, 1.0, -0.45, 0.22, 0.22, 0.05, 0x212529, 16, { rz: Math.PI / 2, noAo: true });
      spot(x, 0, 0, Math.PI, "sit", 0.5);
    });
  }
  // Punch bags hanging by the mirrors, and a stretching area with coloured mats.
  for (let b = 0; b < 3; b++) {
    const bz = -1.5 + b * 1.8;
    k.cyl(-W / 2 + 2.2, room.h - 0.5, bz, 0.01, 0.01, 0.5, 0x2b2b2b, 4, { noAo: true });
    k.cyl(-W / 2 + 2.2, room.h - 1.9, bz, 0.24, 0.24, 1.4, b === 1 ? orange : 0x212529, 16, { noAo: true });
    spot(x, -W / 2 + 3.0, bz, -Math.PI / 2, "stand");
  }
  for (let m = 0; m < 4; m++) k.mat(-1.6 + m * 1.1, 0.012, 2.2, 0.7, 1.8, [0x4dabf7, 0xda77f2, 0x40c057, orange][m]);
  plant(x, -W / 2 + 0.7, D / 2 - 0.7, 1.4, "snake");
  linearLights(x, 3, "x", 0xffffff);
  x.lamps.push({ x: 0, y: room.h - 0.3, z: 0 });
  x.views.push({ x: -1, z: D / 2 - 0.8, yaw: yawTo(-1, D / 2 - 0.8, 0, -D / 2), pitch: -0.1 }, { x: -W / 2 + 1.2, z: D / 2 - 1, yaw: yawTo(-W / 2 + 1.2, D / 2 - 1, W / 4, -D / 2), pitch: -0.08 });
}

function spaRoom(x: Ctx) {
  const { k, room, pal } = x;
  const W = room.w;
  const D = room.d;
  // An indoor pool down the middle, with steps and soft lights in the water.
  k.box(0, 0, -0.5, 4.6, 0.12, 8.4, 0xe6dccb);
  k.box(0, 0.06, -0.5, 4.2, 0.07, 8.0, 0x3bc9db, { layer: "glow" });
  for (let l = 0; l < 4; l++) for (const sx of [-1.95, 1.95]) k.ball(sx, 0.1, -3.8 + l * 2.2, 0.06, 0xc5f6fa, { layer: "glow" });
  // Wooden slatted walls, candles, big plants.
  slatWall(x, 0, 0, W - 2, room.h - 0.4, pal.wood);
  for (let c = 0; c < 9; c++) {
    k.cyl(-3.2 + c * 0.8, 0, -D / 2 + 0.6, 0.06, 0.06, 0.18 + (c % 3) * 0.1, 0xfffaf0, 10);
    k.ball(-3.2 + c * 0.8, 0.24 + (c % 3) * 0.1, -D / 2 + 0.6, 0.03, 0xffc078, { layer: "glow" });
  }
  // Loungers both sides of the pool.
  for (const side of [-1, 1]) {
    for (let l = 0; l < 4; l++) {
      const lz = -3.4 + l * 2.0;
      k.at(side * 3.6, 0, lz, side * Math.PI / 2, () => {
        k.box(0, 0, 0, 0.7, 0.35, 1.9, pal.wood);
        k.soft(0, 0.35, 0.15, 0.68, 0.08, 1.5, 0xf8f4ec, 0.03);
        k.soft(0, 0.43, -0.75, 0.68, 0.45, 0.12, 0xf8f4ec, 0.03, { rx: -0.6 });
        spot(x, 0, 0.1, Math.PI, "sit", 0.45);
      });
    }
    plant(x, side * (W / 2 - 0.8), -D / 2 + 0.8, 1.7, "palm");
    plant(x, side * (W / 2 - 0.8), D / 2 - 0.8, 1.5, "tall");
  }
  // Massage tables at the back corner, and towels.
  for (let m = 0; m < 2; m++) {
    k.at(-W / 2 + 1.6, 0, 2.6 + m * 1.6, Math.PI / 2, () => {
      k.box(0, 0, 0, 0.7, 0.75, 1.9, 0xf8f4ec);
      k.soft(0, 0.75, 0, 0.72, 0.08, 1.92, 0x8fb5a3, 0.03);
    });
  }
  for (let t = 0; t < 4; t++) k.soft(W / 2 - 1.2, 0.85 + t * 0.12, 3.6, 0.5, 0.1, 0.35, [0xffffff, 0x8fb5a3, 0xf8f4ec, 0xe2d6bd][t], 0.03);
  k.box(W / 2 - 1.2, 0, 3.6, 0.7, 0.85, 0.5, pal.wood);
  downlights(x, 4, 3, 1.5);
  x.lamps.push({ x: 0, y: room.h - 0.3, z: -2 }, { x: 0, y: room.h - 0.3, z: 2 });
  x.views.push({ x: 0, z: D / 2 - 1, yaw: 0, pitch: -0.1 }, { x: -W / 2 + 1.2, z: D / 2 - 1.2, yaw: yawTo(-W / 2 + 1.2, D / 2 - 1.2, 1, -D / 2), pitch: -0.08 });
}

/** Stained glass: a tall window of coloured panes (glowing), in a wall's frame. */
function stainedGlass(x: Ctx, w: number, h: number, y: number, cols: number[]) {
  const { k } = x;
  const rows = 6;
  const colsN = 3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < colsN; c++) {
      k.box(-w / 2 + (c + 0.5) * (w / colsN), y + r * (h / rows), 0.03, w / colsN - 0.04, h / rows - 0.04, 0.02, cols[(r + c * 2) % cols.length], { layer: "glow", noAo: true });
    }
  }
  k.cyl(0, y + h, 0.04, w / 2, w / 2, 0.02, cols[0], 16, { rx: Math.PI / 2, layer: "glow", noAo: true });
}

function churchNave(x: Ctx) {
  const { k, room, pal } = x;
  const W = room.w;
  const D = room.d;
  const glassCols = [0x3b5bdb, 0xc92a2a, 0xf2b632, 0x2f9e44, 0x7048e8, 0x1c7ed6];
  // A red carpet down the aisle, pews both sides (people sit facing the altar).
  k.mat(0, 0.008, 1, 1.6, D - 5, 0x8b1e2d);
  for (let r = 0; r < 9; r++) {
    const pz = -D / 2 + 6 + r * 1.35;
    for (const side of [-1, 1]) {
      k.at(side * (W / 4 + 0.45), 0, pz, Math.PI, () => {
        k.box(0, 0, 0, W / 2 - 2.4, 0.45, 0.45, pal.wood);
        k.box(0, 0.45, -0.22, W / 2 - 2.4, 0.5, 0.06, pal.wood);
        for (let s = 0; s < 4; s++) spot(x, -(W / 2 - 2.4) / 2 + 0.6 + s * ((W / 2 - 3.6) / 3), 0.05, 0, "sit", 0.45);
      });
    }
  }
  // Pillars and pointed arches down both sides, stained glass between them.
  for (const side of [-1, 1]) {
    for (let p = 0; p < 6; p++) {
      const pz = -D / 2 + 3 + p * ((D - 5) / 5);
      k.cyl(side * (W / 2 - 1.3), 0, pz, 0.28, 0.32, room.h - 2, 0xd8ccb2, 14);
      k.box(side * (W / 2 - 1.3), room.h - 2, pz, 0.7, 0.3, 0.7, 0xcfc1a4, { noAo: true });
    }
    for (let g = 0; g < 5; g++) atWall(x, side === 1 ? 1 : 3, -D / 2 + 4.5 + g * ((D - 7) / 4) * (side === 1 ? 1 : -1) * (side === 1 ? 1 : 1), () => stainedGlass(x, 1.2, 4.0, 2.4, glassCols.slice(g % 3)));
  }
  // The altar on steps, a cross, candles, the pulpit, organ pipes and a great rose window.
  k.box(0, 0, -D / 2 + 2.6, W - 3, 0.25, 4, 0xe2d6bd);
  k.box(0, 0.25, -D / 2 + 2.2, 3.2, 1.0, 1.0, 0xf8f4ec);
  k.box(0, 0.95, -D / 2 + 2.2, 3.3, 0.06, 1.1, 0xc9a227, { noAo: true });
  for (let c = 0; c < 6; c++) {
    k.cyl(-1.25 + c * 0.5, 1.01, -D / 2 + 2.2, 0.03, 0.03, 0.35, 0xfffaf0, 8);
    k.ball(-1.25 + c * 0.5, 1.4, -D / 2 + 2.2, 0.035, 0xffc078, { layer: "glow" });
  }
  atWall(x, 0, 0, () => {
    k.box(0, 2.0, 0.08, 0.3, 4.2, 0.12, 0xc9a227, { noAo: true });
    k.box(0, 4.6, 0.08, 2.0, 0.3, 0.12, 0xc9a227, { noAo: true });
    stainedGlass(x, 3.2, 3.0, 6.6, glassCols);
    for (let p = 0; p < 14; p++) k.cyl(-W / 2 + 2.2 + p * 0.35 + (p > 6 ? W - 9 : 0), 2.2, 0.4, 0.1, 0.1, 2 + (p % 7) * 0.4, 0xd9c08a, 10, { noAo: true });
  });
  k.at(W / 2 - 2.6, 0.25, -D / 2 + 4.0, -0.6, () => {
    k.cyl(0, 0, 0, 0.55, 0.45, 1.25, pal.wood, 8);
    k.box(0, 1.25, 0.2, 0.6, 0.06, 0.4, pal.wood, { rx: -0.3 });
  });
  spot(x, 0, -D / 2 + 3.2, 0, "stand");
  for (const pz of [-D / 4, D / 4]) {
    k.cyl(0, room.h - 2.4, pz, 1.1, 0.4, 0.4, pal.accent, 16, { noAo: true, open: true });
    for (let b = 0; b < 10; b++) k.ball(Math.cos(b * 0.628) * 1.0, room.h - 2.45, pz + Math.sin(b * 0.628) * 1.0, 0.08, 0xfff3dc, { layer: "glow" });
    k.cyl(0, room.h - 2.0, pz, 0.01, 0.01, 2.0, 0x2b2b2b, 4, { noAo: true });
    x.lamps.push({ x: 0, y: room.h - 2.4, z: pz });
  }
  x.views.push({ x: 0, z: D / 2 - 1.5, yaw: 0, pitch: 0.02 }, { x: -W / 2 + 2, z: D / 2 - 2, yaw: yawTo(-W / 2 + 2, D / 2 - 2, 0, -D / 2), pitch: 0.0 });
}

function mosqueHall(x: Ctx) {
  const { k, room, pal } = x;
  const W = room.w;
  const D = room.d;
  // Prayer-row lines woven into the carpet (gold stripes across).
  for (let r = 0; r < 9; r++) k.mat(0, 0.012, -D / 2 + 3 + r * 1.3, W - 1.6, 0.06, pal.fabric2);
  // The mihrab: a tall pointed niche in the far wall, tiled and edged in gold; the minbar steps.
  atWall(x, 0, 0, () => {
    k.box(0, 0, 0.1, 2.6, 4.2, 0.2, 0xe6dfcd, { noAo: true });
    k.box(0, 0, 0.21, 1.8, 3.2, 0.02, 0x1f6b8a, { noAo: true });
    k.cyl(0, 3.2, 0.21, 0.9, 0.9, 0.02, 0x1f6b8a, 20, { rx: Math.PI / 2, noAo: true });
    k.box(0, 0, 0.22, 2.0, 0.1, 0.03, pal.accent, { noAo: true });
    for (let t = 0; t < 6; t++) k.box(0, 0.4 + t * 0.45, 0.225, 1.6, 0.03, 0.01, pal.accent, { noAo: true });
  });
  k.at(2.6, 0, -D / 2 + 1.4, 0, () => {
    for (let s = 0; s < 7; s++) k.box(0, 0, 0.6 - s * 0.2, 0.9, 0.25 + s * 0.25, 0.22, pal.wood);
    k.box(0, 1.9, -0.75, 1.0, 1.6, 0.4, pal.wood);
    k.cyl(0, 3.5, -0.75, 0.0, 0.35, 0.8, pal.accent, 8);
  });
  // A calligraphy band in gold round the top of the walls.
  wallSign(x, 0, 0, room.h - 1.2, "بِسْمِ ٱللَّٰهِ", 0x1f8a5b, 0xf2b632, W - 2, 0.8, true);
  for (const side of [1, 3]) wallSign(x, side, 0, room.h - 1.2, "ٱللَّٰهُ أَكْبَرُ", 0x1f8a5b, 0xf2b632, D - 2, 0.8, true);
  // Pointed arched windows down the sides.
  for (const side of [1, 3]) {
    for (let a = 0; a < 5; a++) {
      atWall(x, side, -D / 2 + 3 + a * ((D - 6) / 4), () => {
        k.box(0, 1.6, 0.03, 1.0, 2.6, 0.02, 0x9ad1e8, { layer: "glow", noAo: true });
        k.cyl(0, 4.2, 0.03, 0.5, 0.5, 0.02, 0x9ad1e8, 16, { rx: Math.PI / 2, layer: "glow", noAo: true });
        k.box(0, 1.5, 0.05, 1.1, 0.06, 0.02, pal.accent, { noAo: true });
      });
    }
  }
  // Columns, and the great ring chandelier with its many lamps.
  for (const sx of [-W / 4, W / 4]) {
    for (let p = 0; p < 3; p++) {
      const pz = -D / 2 + 4 + p * ((D - 7) / 2);
      k.cyl(sx, 0, pz, 0.3, 0.3, room.h - 0.3, 0xf7f4ec, 16);
      k.box(sx, 0, pz, 0.8, 0.5, 0.8, 0xe6dfcd);
    }
  }
  const cy = room.h - 3.2;
  k.ring(0, cy, 0, 3.2, 0.06, pal.metal, { rx: Math.PI / 2 });
  k.ring(0, cy + 0.3, 0, 2.2, 0.05, pal.metal, { rx: Math.PI / 2 });
  for (let b = 0; b < 24; b++) k.ball(Math.cos((b / 24) * 6.283) * 3.2, cy - 0.08, Math.sin((b / 24) * 6.283) * 3.2, 0.08, 0xfff3dc, { layer: "glow" });
  for (let b = 0; b < 4; b++) k.cyl(Math.cos(b * 1.571) * 3.2, cy, Math.sin(b * 1.571) * 3.2, 0.006, 0.006, room.h - cy, 0x2b2b2b, 4, { noAo: true });
  x.lamps.push({ x: 0, y: cy, z: 0 }, { x: 0, y: cy, z: -D / 3 });
  // People in rows facing the mihrab, and a few reading by the wall.
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) spot(x, -3.5 + c * 1.4, -D / 2 + 3.6 + r * 1.3, 0, "stand");
  for (let s = 0; s < 3; s++) spot(x, -W / 2 + 1.2, 1 + s * 1.2, Math.PI / 2, "sit", 0.08);
  x.views.push({ x: 0, z: D / 2 - 1.2, yaw: 0, pitch: 0.04 }, { x: W / 2 - 1.5, z: D / 2 - 1.5, yaw: yawTo(W / 2 - 1.5, D / 2 - 1.5, 0, -D / 2), pitch: 0.02 });
}

// ---------------------------------------------------------------- a law court's courtroom

const COURT_PAL: Pal = { wall: 0xece3d2, accentWall: 0x5c3d26, trim: 0xd9ccb4, ceiling: 0xf6f0e4, floor: ["parquet", 0x7d5737, 0x684629], wood: 0x5c3d26, fabric: 0x1f3b5c, fabric2: 0xc7a76c, accent: 0x2f6650, metal: 0xb08d57, art: [0x1f3b5c, 0xc7a76c, 0x2f6650], frame: 0xb08d57, leaves: LEAVES, pot: 0x5c3d26 };

/**
 * A courtroom: the judge's raised bench at the front under the coat of arms, the clerk's desk
 * below it, the witness box to one side and the dock to the other, lawyers' tables facing the
 * bench, and rows of benches for the public at the back.
 */
function courtroom(x: Ctx) {
  const { k, room, pal, info } = x;
  const W = room.w;
  const D = room.d;
  const front = -D / 2;
  const dark = shadeHex(pal.wood, -0.15);
  // The judge's bench: a raised platform, a tall panelled front, a high-backed chair.
  k.box(0, 0, front + 1.2, 5.6, 0.5, 2.0, dark);
  k.box(0, 0.5, front + 2.15, 5.6, 0.75, 0.12, pal.wood);
  k.box(0, 1.25, front + 2.15, 5.8, 0.05, 0.4, pal.trim);
  k.at(0, 0.5, front + 1.2, 0, () => {
    k.box(0, 0, 0, 0.7, 0.5, 0.6, pal.fabric);
    k.box(0, 0.5, -0.28, 0.7, 1.1, 0.12, pal.fabric);
    k.box(0, 1.6, -0.28, 0.8, 0.08, 0.16, pal.metal);
  });
  // The gavel and a book on the bench top.
  k.box(0.6, 1.3, front + 2.1, 0.3, 0.06, 0.22, 0xf2ece0);
  k.cyl(-0.5, 1.3, front + 2.1, 0.035, 0.035, 0.05, 0x3b2618, 10);
  // The coat of arms and the court's name on the wall behind.
  atWall(x, 0, 0, () => {
    k.box(0, 2.3, 0.03, 1.3, 1.3, 0.04, pal.metal, { noAo: true });
    k.box(0, 2.35, 0.06, 0.9, 0.9, 0.02, pal.fabric, { noAo: true });
  });
  wallSign(x, 0, 0, 3.55, info.name.toUpperCase(), pal.accentWall, 0xf2c94c, Math.min(7, W * 0.5), 0.5, false);
  // Flags either side of the bench.
  for (const side of [-1, 1]) {
    k.cyl(side * 3.4, 0, front + 0.6, 0.03, 0.03, 2.4, pal.metal, 8);
    k.box(side * 3.4 + 0.3, 1.8, front + 0.6, 0.55, 0.5, 0.02, side < 0 ? 0x1f8a4c : pal.fabric);
  }
  // The clerk's desk just below the bench.
  table(x, 0, front + 2.9, 0, 2.2, 0.7, pal.wood, dark, { h: 0.8 });
  chair(x, 0, front + 2.45, 0, pal.fabric, dark);
  // The witness box (left) and the dock (right): low panelled pens.
  for (const [side, w] of [[-1, 1.4], [1, 2.2]] as const) {
    const bx = side * (W / 2 - 1.8);
    const bz = front + 3.0;
    k.box(bx, 0, bz, w, 0.12, 1.4, dark);
    for (const [px, pz, pw, pd] of [[0, 0.7, w, 0.08], [-w / 2, 0, 0.08, 1.4], [w / 2, 0, 0.08, 1.4]] as const) k.box(bx + px, 0.12, bz + pz, pw, 0.95, pd, pal.wood);
    k.box(bx, 1.07, bz + 0.7, w + 0.1, 0.05, 0.14, pal.trim);
    spot(x, bx, bz, side < 0 ? Math.PI / 2 : -Math.PI / 2, "stand");
  }
  // The lawyers' tables facing the bench, a chair each.
  for (const side of [-1, 1]) {
    const tx = side * 2.4;
    const tz = front + 4.9;
    table(x, tx, tz, 0, 2.6, 0.8, pal.wood, dark, { h: 0.78 });
    for (let c = 0; c < 3; c++) chair(x, tx - 0.85 + c * 0.85, tz + 0.65, Math.PI, pal.fabric, dark, { spot: c !== 1 });
    k.box(tx - 0.5, 0.78, tz, 0.35, 0.05, 0.26, 0xf2ece0);
  }
  // A wooden rail across the room, and the public benches behind it.
  k.box(0, 0, front + 6.1, W - 3, 0.9, 0.08, pal.wood);
  k.box(0, 0.9, front + 6.1, W - 2.9, 0.05, 0.14, pal.trim);
  for (let r = 0; r < 3; r++) for (const side of [-1, 1]) bench(x, side * 2.6, front + 7.0 + r * 1.15, Math.PI, 3.6, pal.wood, dark, 3);
  linearLights(x, 3, "x", 0xfff6e6);
  for (const s of solidSides(room)) if (s !== 0) art(x, s, 0, 2.0, 1.0, 1.3);
  plant(x, -W / 2 + 0.7, D / 2 - 0.7, 1.4, "tall");
  plant(x, W / 2 - 0.7, D / 2 - 0.7, 1.4, "tall");
  x.views.push(
    { x: 0, z: D / 2 - 0.9, yaw: 0, pitch: -0.06 },
    { x: W / 2 - 1.0, z: front + 5.2, yaw: yawTo(W / 2 - 1.0, front + 5.2, -W / 4, front + 1.5), pitch: -0.08 },
  );
}

// ---------------------------------------------------------------- a shooting range

const RANGE_PAL: Pal = { wall: 0x4a4f57, accentWall: 0xe8590c, trim: 0x2b2f35, ceiling: 0x2f343b, floor: ["concrete", 0x7b7f86, 0x6c7077], wood: 0x3b3f46, fabric: 0x1f2328, fabric2: 0xe8590c, accent: 0xe8590c, metal: 0x9aa1a8, art: [0xe8590c, 0xf8f9fa, 0x1f2328], frame: 0x2b2f35, leaves: LEAVES, pot: 0x2b2f35 };

/**
 * An indoor shooting range: six lanes down a long dark hall, a booth for each (partitions, a
 * shelf, ear defenders on a hook), paper targets hanging at 10, 25 and 50 m on their carriers,
 * distance lines on the floor, angled baffles across the ceiling, a sloping rubber backstop, and
 * behind the booths the lobby: the counter, guns on a wall rack, safety signs and benches.
 */
function shootingRange(x: Ctx) {
  const { k, room, pal, info } = x;
  const W = room.w;
  const D = room.d;
  const far = -D / 2;
  const line = D / 2 - 6.5;
  const lanes = 6;
  const lw = (W - 1) / lanes;
  // The backstop: a dark sloping berm across the far end, lit from above.
  k.box(0, 0, far + 1.0, W, 1.2, 2.0, 0x23262b);
  k.box(0, 1.2, far + 0.6, W, 1.6, 1.2, 0x1b1d21, { rx: -0.35 });
  for (let i = 0; i < 6; i++) k.box(-W / 2 + (i + 0.5) * (W / 6), 3.3, far + 1.5, 0.9, 0.06, 0.25, 0xfff4d6, { layer: "glow" });
  // Distance lines and numbers on the floor, a yellow firing line.
  for (const [dz, c] of [[10, 0xf8f9fa], [15, 0xadb5bd], [19, 0xf8f9fa]] as const) {
    const zz = line - dz;
    if (zz < far + 2.2) continue;
    k.box(0, 0.004, zz, W - 1, 0.006, 0.06, c, { noAo: true });
  }
  k.box(0, 0.005, line, W - 0.6, 0.008, 0.14, 0xfab005, { noAo: true });
  // Baffles: angled panels across the ceiling all the way down.
  for (let zz = line - 1.5; zz > far + 2; zz -= 2.2) k.box(0, room.h - 0.55, zz, W - 0.4, 0.06, 0.9, 0x3a3f46, { rx: 0.45 });
  // The lanes: partitions, a shelf, a target on its carrier at its own distance.
  for (let l = 0; l < lanes; l++) {
    const cx = -W / 2 + 0.5 + (l + 0.5) * lw;
    // Booth partitions (padded panels) either side, a shelf across the front.
    for (const sx of [-lw / 2, lw / 2]) k.box(cx + sx, 0, line + 0.75, 0.08, 1.9, 1.5, 0x5a6069);
    k.box(cx, 0.95, line + 0.1, lw - 0.12, 0.06, 0.45, 0x8a6a4f);
    k.box(cx, 0, line + 0.1, lw - 0.14, 0.95, 0.06, 0x3b3f46);
    // A lane number above, and ear defenders hanging on the partition.
    k.box(cx, 2.2, line + 0.2, 0.4, 0.3, 0.04, [0xe8590c, 0xf8f9fa][l % 2], { noAo: true });
    k.ball(cx - lw / 2 + 0.15, 1.5, line + 1.0, 0.08, 0x1f2328, { w: 8, h: 6 });
    // The target carrier: a rail along the ceiling, a hanger, the paper target.
    const dz = [10, 16, 20, 12, 18, 14][l];
    const tz = Math.max(far + 2.4, line - dz);
    k.box(cx, room.h - 0.25, (line + far) / 2, 0.05, 0.05, line - far, 0x6c7077);
    k.box(cx, room.h - 0.3, tz, 0.3, 0.1, 0.1, 0x2b2f35);
    k.cyl(cx, 1.6, tz, 0.006, 0.006, room.h - 1.9, 0x9aa1a8, 4);
    k.box(cx, 1.0, tz, 0.62, 0.86, 0.01, 0xf3efe6, { noAo: true });
    // Rings and a silhouette, drawn on the paper.
    k.box(cx, 1.14, tz + 0.007, 0.3, 0.6, 0.004, 0x2b2f35, { noAo: true });
    k.cyl(cx, 1.62, tz + 0.006, 0.08, 0.08, 0.004, 0x2b2f35, 14, { rx: Math.PI / 2, noAo: true });
    for (const [r, c] of [[0.13, 0xf3efe6], [0.09, 0xe8590c], [0.04, 0xf3efe6]] as const) k.cyl(cx, 1.3, tz + 0.012, r, r, 0.004, c, 18, { rx: Math.PI / 2, noAo: true });
    // A shooter at most lanes.
    if (l !== 2) spot(x, cx, line + 0.55, Math.PI, "stand");
  }
  // Lights down the range, red and green lamps over the line.
  for (let zz = line - 3; zz > far + 3; zz -= 4.5) k.box(0, room.h - 0.08, zz, W - 2, 0.04, 0.2, 0xf4f8ff, { layer: "glow" });
  for (const [sx, c] of [[-1, 0xff4d4d], [1, 0x40e080]] as const) k.ball(sx * (W / 2 - 0.6), 3.2, line + 0.3, 0.12, c, { layer: "glow" });
  // The lobby behind the booths: a glass wall, the counter, the gun rack, benches, signs.
  k.box(0, 0, line + 1.6, W, 0.9, 0.08, 0x3b3f46);
  k.box(0, 0.9, line + 1.6, W, room.h - 0.9, 0.03, 0xbcd7e8, { layer: "glass" });
  k.box(0, room.h - 0.12, line + 1.6, W, 0.12, 0.12, pal.trim);
  const cz = D / 2 - 2.2;
  k.box(-W / 2 + 3.2, 0, cz, 4.6, 1.05, 0.8, 0x2b2f35);
  k.box(-W / 2 + 3.2, 1.05, cz, 4.8, 0.05, 0.95, 0xe8590c);
  k.box(-W / 2 + 2.4, 1.1, cz, 0.6, 0.06, 0.4, 0x1a1b1e);
  spot(x, -W / 2 + 3.2, cz - 0.9, 0, "stand");
  // The gun rack on the side wall: rifles and pistols on a pegboard.
  atWall(x, 3, D / 2 - 3.2, () => {
    k.box(0, 1.0, 0.03, 3.2, 1.6, 0.05, 0x1f2328, { noAo: true });
    for (let g = 0; g < 6; g++) {
      k.box(-1.3 + g * 0.52, 1.75 - (g % 2) * 0.05, 0.08, 0.1, 0.06, 0.03, 0x9aa1a8);
      k.box(-1.3 + g * 0.52, 1.15, 0.08, 0.05, 1.1, 0.04, g % 3 === 0 ? 0x6b4a2b : 0x2b2f35);
    }
    for (let g = 0; g < 5; g++) k.box(-1.2 + g * 0.6, 1.95 - 0.02, 0.08, 0.26, 0.1, 0.04, 0x2b2f35);
  });
  wallSign(x, 1, D / 2 - 3.5, 2.6, "EYES & EARS ON", 0xe8590c, 0xffffff, 3.2, 0.5, true, "Muzzle down range. Always.");
  wallSign(x, 2, 0, 3.2, info.name.toUpperCase(), 0x1f2328, 0xe8590c, Math.min(8, W * 0.6), 0.6, true);
  bench(x, W / 2 - 2.6, D / 2 - 2.0, -Math.PI / 2, 3.0, 0x3b3f46, 0x2b2f35, 3);
  linearLights(x, 2, "x", 0xfff6e6);
  x.views.push(
    { x: -W / 2 + 0.5 + 2.5 * lw, z: line + 1.45, yaw: 0, pitch: -0.1 },
    { x: W / 2 - 1.2, z: D / 2 - 1.2, yaw: yawTo(W / 2 - 1.2, D / 2 - 1.2, 0, far), pitch: -0.04 },
  );
}

/** One straight run of steps: centred on x, its foot at zFoot, climbing towards -z (dir -1) or +z. */
type Run = { x: number; w: number; zFoot: number; dir: 1 | -1; n: number; go: number; y0: number; open: (1 | -1)[] };

/**
 * Where a home's staircase really goes (metres), facing you as you come in from the front: a
 * straight flight of 16 gentle steps up towards the back when the hall is deep enough; otherwise a
 * U-shaped stair (like most Lagos duplexes): 9 steps up one side to a landing at the back, 9 more
 * back down the other side. The stairs' spot in the plan sets where; the room it's in, how deep.
 */
function stairFlight(plan: HomePlan, level: number, it: { x: number; y: number; kind: string; rot: number }) {
  const { w: GW, d: GD } = SIZES[plan.size];
  const W = GW * CELL_M, D = GD * CELL_M;
  const H = 2.8;
  const s = itemSize(it as Parameters<typeof itemSize>[0]);
  const x0 = it.x * CELL_M - W / 2, x1 = (it.x + s.w) * CELL_M - W / 2;
  const z0 = it.y * CELL_M - D / 2;
  const r = roomAt(plan.floors[level], it.x, it.y);
  const zEnd = Math.min(D / 2 - 0.5, r ? (r.y + r.d) * CELL_M - D / 2 : z0 + 4);
  const avail = zEnd - z0;
  const nearLeft = x0 + W / 2 <= W / 2 - x1;
  const wall: 1 | -1 = nearLeft ? -1 : 1;
  const style = (it.x * 7 + it.y * 3) % 3;
  if (avail >= 5.6) {
    // Straight: from 0.9 m off the back wall (the floor above carries on there) to the front.
    const w = 1.1, L = 4.4, n = 16;
    const fx = nearLeft ? x0 + w / 2 : x1 - w / 2;
    const top = z0 + 0.9;
    const runs: Run[] = [{ x: fx, w, zFoot: top + L, dir: -1, n, go: L / n, y0: 0, open: [(-wall) as 1 | -1] }];
    return { kind: "straight" as const, runs, rise: H / n, x: fx, z: top + L / 2, w, d: L, foot: { x: fx, z: top + L + 0.45 }, exit: { x: fx, z: top - 0.45 }, wall, style };
  }
  // U-shaped: two runs side by side, a landing across the back.
  const each = Math.min(1.15, (x1 - x0 - 0.08) / 2);
  const ax = nearLeft ? x0 + each / 2 : x1 - each / 2;
  const bx = ax - wall * (each + 0.08);
  const Lu = Math.max(1.9, Math.min(3.6, avail - 1.0));
  const land = Math.min(1.0, Lu * 0.3);
  const n = 9;
  const go = (Lu - land) / n;
  const runs: Run[] = [
    { x: ax, w: each, zFoot: z0 + Lu, dir: -1, n, go, y0: 0, open: [(-wall) as 1 | -1] },
    { x: bx, w: each, zFoot: z0 + land, dir: 1, n, go, y0: (n + 0) * (H / (2 * n)), open: [wall] },
  ];
  return { kind: "u" as const, runs, land, rise: H / (2 * n), x: (ax + bx) / 2, z: z0 + Lu / 2, w: 2 * each + 0.08, d: Lu, foot: { x: ax, z: z0 + Lu + 0.45 }, exit: { x: bx, z: z0 + Lu + 0.45 }, wall, style, z0, ax, bx, each };
}
type Flight = ReturnType<typeof stairFlight>;
const overlapsFlight = (f: Flight, r: { x: number; z: number; w: number; d: number }) => Math.abs(r.x - f.x) < (r.w + f.w) / 2 && Math.abs(r.z - f.z) < (r.d + f.d) / 2 + 0.5;

/**
 * Draw a staircase (see stairFlight) in one of three styles, after real ones: floating oak treads
 * on a black steel spine with tall black bars and light strips on the wall; white stairs with a
 * blue carpet runner and slim black balusters; or dark wood treads over white risers with a
 * wrought-iron railing and a wide rounded bottom step.
 */
function drawFlight(x: Ctx, f: Flight, wood: number) {
  const { k } = x;
  const black = 0x1f2125;
  const rise = f.rise;
  const dark = f.style === 2;
  const tread = dark ? 0x4a2c1c : wood;
  const riser = 0xf6f4ef;
  const runDraw = (r: Run, first: boolean) => {
    const zAt = (st: number) => r.zFoot + r.dir * (st + 0.5) * r.go;
    const yTop = (st: number) => r.y0 + (st + 1) * rise;
    const len = r.n * r.go;
    const hgt = r.n * rise;
    const slopeLen = Math.hypot(len, hgt);
    // Turned so the rail climbs the same way as the steps.
    const rx = r.dir === -1 ? Math.atan2(hgt, len) : -Math.atan2(hgt, len);
    const zMid = r.zFoot + (r.dir * len) / 2;
    for (let st = 0; st < r.n; st++) {
      const zz = zAt(st);
      if (f.style === 0) {
        k.box(r.x, yTop(st) - 0.06, zz, r.w, 0.06, r.go + 0.04, st % 2 ? wood : shadeHex(wood, 0.05));
        k.box(r.x, yTop(st) - rise, zz - (r.dir * r.go) / 2, 0.12, rise, 0.06, black);
        k.box(r.x, yTop(st) - 0.08, zz, 0.12, 0.03, r.go, black);
      } else {
        const wide = dark && first && st < 2 ? 0.3 - st * 0.13 : 0;
        const o = r.open[0];
        k.box(r.x + o * (wide / 2), yTop(st) - 0.045, zz, r.w + wide + 0.02, 0.045, r.go + 0.03, tread);
        k.box(r.x + o * (wide / 2), yTop(st) - rise, zz - (r.dir * r.go) / 2, r.w + wide, rise - 0.045, 0.02, riser, { noAo: true });
        if (wide) k.cyl(r.x + o * (r.w / 2 + wide), yTop(st) - rise, zz, r.go / 2 + 0.02, r.go / 2 + 0.02, rise, riser, 14);
        if (!dark) k.box(r.x, yTop(st) + 0.001, zz, r.w * 0.62, 0.01, r.go, st % 2 ? 0x41618f : 0x3b5880, { noAo: true });
        // Closed in underneath on the open side.
        k.box(r.x + o * (r.w / 2 + 0.025), r.y0, zz, 0.04, yTop(st) - r.y0 - 0.02, r.go, 0xf3f1ec, { noAo: true });
      }
    }
    // Underneath: a smooth white soffit (the floating stair shows its steel spine instead).
    if (f.style !== 0 && r.y0 > 0) k.box(r.x, r.y0 + hgt / 2 - 0.16, zMid, r.w, 0.05, slopeLen, riser, { rx, noAo: true });
    for (const o of r.open) {
      const ex = r.x + o * (r.w / 2 + 0.01);
      for (let st = 0; st < r.n; st++) {
        if (f.style === 0) k.box(ex, yTop(st), zAt(st), 0.025, 0.95, 0.025, black);
        else {
          k.cyl(ex, yTop(st), zAt(st), 0.012, 0.012, 0.88, black, 6);
          if (dark && st % 2 === 0) k.ring(ex, yTop(st) + 0.45, zAt(st), 0.05, 0.008, black);
        }
      }
      k.box(ex, r.y0 + hgt / 2 + 0.92, zMid, 0.06, 0.05, slopeLen + 0.06, f.style === 0 ? black : dark ? 0x3b2416 : shadeHex(wood, -0.15), { rx, noAo: true });
      if (first && f.style !== 0) k.box(ex, 0, r.zFoot - (r.dir * r.go) / 2, 0.1, 1.05 + rise, 0.1, dark ? 0x3b2416 : shadeHex(wood, -0.15));
    }
  };
  f.runs.forEach((r, i) => runDraw(r, i === 0));
  if (f.kind === "u") {
    // The landing across the back, at the height between the two runs, on a post.
    const y = f.runs[1].y0;
    k.box(f.x, y - 0.12, f.z0 + f.land / 2, f.w, 0.12, f.land, f.style === 0 ? wood : dark ? 0x4a2c1c : wood);
    if (f.style !== 0) k.box(f.x, 0, f.z0 + f.land / 2, f.w, y - 0.12, f.land, 0xf3f1ec, { noAo: true });
    else k.box(f.x, 0, f.z0 + f.land - 0.08, 0.1, y - 0.12, 0.1, black);
  }
  if (f.style === 0) {
    // Light strips on the wall beside the stairs.
    const wx = f.x + f.wall * (f.w / 2 + 0.01);
    for (let i = 0; i < 4; i++) {
      const zz = f.z - f.d / 2 + (i + 0.5) * (f.d / 4);
      k.box(wx, 0.5 + i * 0.35, zz, 0.02, 1.3, 0.07, 0xfff1d0, { layer: "glow" });
      k.box(wx + f.wall * 0.01, 0.45 + i * 0.35, zz, 0.03, 1.4, 0.2, shadeHex(wood, -0.1));
    }
  }
  k.shadow(f.x, 0, f.w + 0.3, f.d + 0.3, 0.25);
  x.blocks.push({ x: f.x, z: f.z, w: f.w + 0.1, d: f.d, ry: 0 });
}

/** Kinds that stand against a wall and need it plain (no window, no curtains in front of them). */
const AGAINST_WALL = new Set(["tv", "stairs", "wardrobe", "shelf", "fridge", "cooker", "counter", "sideboard", "art", "mirror", "clock", "screen", "djbooth", "homebar", "arcade", "dartboard", "jukebox", "piano"]);
/** A planned home's floor: where the outside walls must stay plain, and the stairwell in the ceiling. */
function homeClearings(home: NonNullable<InteriorInfo["home"]>): Pick<Room, "keepClear" | "ceilingHole"> {
  const floor = home.plan.floors[home.level];
  const { w: GW, d: GD } = SIZES[home.plan.size];
  const W = GW * CELL_M, D = GD * CELL_M;
  const rect = (it: (typeof floor.items)[number]) => {
    const s = itemSize(it);
    return { x: (it.x + s.w / 2) * CELL_M - W / 2, z: (it.y + s.d / 2) * CELL_M - D / 2, w: s.w * CELL_M, d: s.d * CELL_M };
  };
  const keepClear = floor.items.filter((i) => AGAINST_WALL.has(i.kind) && i.kind !== "stairs").map(rect);
  const up = home.level < home.plan.floors.length - 1 ? floor.items.find((i) => i.kind === "stairs") : undefined;
  const flight = up ? stairFlight(home.plan, home.level, up) : undefined;
  const below = home.level > 0 ? home.plan.floors[home.level - 1].items.find((i) => i.kind === "stairs") : undefined;
  for (const f of [flight, below ? stairFlight(home.plan, home.level - 1, below) : undefined]) if (f) keepClear.push({ x: f.x, z: f.z, w: f.w, d: f.d });
  return { keepClear, ceilingHole: flight ? { x: flight.x, z: flight.z, w: flight.w + 0.1, d: flight.d } : undefined };
}

function plan(theme: Theme, rnd: Rng, variant?: InteriorInfo["variant"], info?: InteriorInfo): { room: Room; pal: Pal; build: (x: Ctx) => void } {
  const home = pickOf(rnd, HOME);
  if (info?.home) {
    const { w, d } = SIZES[info.home.plan.size];
    const kinds: WallKind[] = ["windows", "windows", "windows", "windows"];
    return {
      room: { w: w * CELL_M, d: d * CELL_M, h: 2.8, walls: kinds as Room["walls"], curtains: rnd() < 0.8 ? mixHex(home.fabric2, 0xfaf6ef, 0.5) : undefined, frame: rnd() < 0.5 ? 0xffffff : 0x2b2b2b, ...homeClearings(info.home) },
      pal: home,
      build: (x) => plannedHome(x, info.home!),
    };
  }
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
    case "club": {
      // One of the four designs (the same one for everyone in this club).
      const style = pickOf(rnd, CLUB_STYLES);
      return { ...clubPlan(style), build: (x) => club(x, style) };
    }
    case "restaurant":
      return { room: { w: 14, d: 10, h: 3.5, walls: ["glass", "solid", "solid", "solid"], accentSide: 3, frame: 0x2b2b2b }, pal: pickOf(rnd, [...HOME.slice(1, 6), LOUNGE[3]]), build: restaurant };
    case "firehall":
      return { room: { w: 14, d: 10, h: 4.6, walls: ["solid", "band", "solid", "solid"], headDrop: 0.4 }, pal: { ...POLICE, accentWall: 0xc92a2a, wall: 0xf1ede6, floor: ["concrete", 0xb9b6b0, 0xa29e97] }, build: firehall };
    case "stands":
      return { room: { w: 80, d: 68, h: 12, walls: ["solid", "solid", "solid", "solid"], noShell: true }, pal: { ...SPORT_PAL, floor: ["concrete", 0x9aa0a6, 0x8d939a] }, build: standsBowl };
    case "court":
      return { room: { w: 36, d: 26, h: 11, walls: ["solid", "solid", "solid", "solid"] }, pal: { ...SPORT_PAL, floor: ["parquet", 0xd9b382, 0xc9a06c] }, build: courtHall };
    case "boxing":
    case "wrestling":
      return { room: { w: 24, d: 24, h: 11, walls: ["solid", "solid", "solid", "solid"] }, pal: SPORT_PAL, build: (x) => ringHall(x, theme === "wrestling") };
    case "bank":
      return { room: { w: 20, d: 14, h: 7, walls: ["solid", "tall", "glass", "tall"] }, pal: BANK_PAL, build: bankHall };
    case "vault":
      return { room: { w: 9, d: 9, h: 3.4, walls: ["solid", "solid", "solid", "solid"] }, pal: VAULT_PAL, build: vaultRoom };
    case "gym":
      return { room: { w: 18, d: 13, h: 5, walls: ["solid", "glass", "glass", "solid"], frame: 0x1f2226 }, pal: GYM_PAL, build: gymFloor };
    case "spa":
      return { room: { w: 14, d: 12, h: 4.2, walls: ["solid", "glass", "glass", "glass"], frame: 0xb08458 }, pal: SPA_PAL, build: spaRoom };
    case "courtroom":
      return { room: { w: 14, d: 11, h: 4.4, walls: ["solid", "tall", "solid", "tall"] }, pal: COURT_PAL, build: courtroom };
    case "range":
      return { room: { w: 13, d: 26, h: 4.2, walls: ["solid", "solid", "solid", "solid"] }, pal: RANGE_PAL, build: shootingRange };
    case "church":
      return { room: { w: 16, d: 26, h: 12, walls: ["solid", "tall", "solid", "tall"] }, pal: CHURCH_PAL, build: churchNave };
    case "mosque":
      return { room: { w: 18, d: 18, h: 11, walls: ["solid", "tall", "solid", "tall"] }, pal: MOSQUE_PAL, build: mosqueHall };
    default:
      return { room: { w: 8, d: 6, h: 3, walls: ["glass", "solid", "solid", "solid"] }, pal: home, build: (x) => livingRoom(x, false) };
  }
}

// ---------------------------------------------------------------- a planned home (docs/HOME_PLANNER.md)

/** A room style's colours (src/lib/home-plan.ts ROOM_STYLES): Modern greys and black, Luxury cream and gold, Cosy terracotta and warm wood. */
const STYLE_PALS: (Partial<Pal> | null)[] = [
  null,
  { fabric: 0x4a4f55, fabric2: 0xe9ecef, wood: 0x2b2b2b, accent: 0x12b886, metal: 0x1b1b1b, frame: 0x1b1b1b },
  { fabric: 0xefe6d8, fabric2: 0x8a6d3b, wood: 0x3b2618, accent: 0xc9a227, metal: 0xc9a227, frame: 0xc9a227 },
  { fabric: 0xb5653d, fabric2: 0xf1e3cf, wood: 0xa0724a, accent: 0x6b8f71, metal: 0x5a4636, frame: 0xa0724a },
];
const styledPal = (base: Pal, r: PlanRoom | null): Pal => {
  const sp = r ? STYLE_PALS[roomStyle(r)] : null;
  return sp ? { ...base, ...sp } : base;
};

/**
 * A pool: stone edging round clear blue water that shimmers, a step in at one end. Nobody walks
 * through it (they walk round).
 */
function water(x: Ctx, cx: number, cz: number, w: number, d: number) {
  const { k } = x;
  k.box(cx, 0, cz, w + 0.1, 0.06, d + 0.1, 0xece6da, { noAo: true });
  k.box(cx, 0.06, cz, w - 0.3, 0.005, d - 0.3, 0x0b7285, { noAo: true });
  const mat = new THREE.MeshBasicMaterial({ color: 0x3bc9db, transparent: true, opacity: 0.85 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, d - 0.3).rotateX(-Math.PI / 2), mat);
  m.position.set(cx, 0.07, cz);
  x.extras.push(m);
  const a = new THREE.Color(0x3bc9db), b = new THREE.Color(0x66d9e8);
  x.anim.push((time) => {
    mat.color.copy(a).lerp(b, 0.5 + 0.5 * Math.sin(time * 1.2 + cx));
  });
  // Lane lines and a ladder.
  k.box(cx, 0.072, cz, w - 0.8, 0.002, 0.05, 0x1864ab, { noAo: true });
  for (const sx of [-0.18, 0.18]) k.cyl(cx - w / 2 + 0.35 + sx, 0.07, cz - d / 2 + 0.1, 0.02, 0.02, 0.6, 0xced4da, 8);
  x.blocks.push({ x: cx, z: cz, w, d, ry: 0 });
}

/**
 * A player's home as they planned it, one floor: the outside walls with windows and curtains,
 * the inside walls with doorways, each piece of furniture where it was put (drawn with the same
 * pieces as every other room in the game), a light in every room, tiles in the kitchen and
 * bathroom, and stairs up and down.
 */
function plannedHome(x: Ctx, home: NonNullable<InteriorInfo["home"]>) {
  const { k, pal, rnd, room } = x;
  const { plan, level } = home;
  const floor = plan.floors[level];
  const { w: GW, d: GD } = SIZES[plan.size];
  const W = GW * CELL_M, D = GD * CELL_M;
  const mx = (c: number) => c * CELL_M - W / 2;
  const mz = (c: number) => c * CELL_M - D / 2;
  const T = 0.12;
  const doorH = 2.1;
  const shape = shapeOf(plan);
  // Inside walls and doorways.
  const { walls, doors } = planWalls(floor, plan.size, shape);
  for (const wl of walls) {
    const x0 = mx(wl.x0), z0 = mz(wl.y0), x1 = mx(wl.x1), z1 = mz(wl.y1);
    const along = z0 === z1;
    const len = along ? x1 - x0 : z1 - z0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    k.box(cx, 0, cz, along ? len + T : T, room.h, along ? T : len + T, pal.wall, { noAo: true, grad: [0.84, 1.04, room.h] });
    // Skirting both sides.
    k.box(cx, 0, cz, along ? len + T : T + 0.03, 0.09, along ? T + 0.03 : len + T, pal.trim, { noAo: true });
    x.blocks.push({ x: cx, z: cz, w: along ? len : 0.3, d: along ? 0.3 : len, ry: 0 });
  }
  for (const dr of doors) {
    const along = dr.along === "x";
    const a = along ? mx(dr.x) : mz(dr.y);
    const L = dr.len * CELL_M;
    const cx = along ? a + L / 2 : mx(dr.x), cz = along ? mz(dr.y) : a + L / 2;
    // The wall over the doorway, and a frame round it.
    k.box(cx, doorH, cz, along ? L : T, room.h - doorH, along ? T : L, pal.wall, { noAo: true });
    k.box(cx, doorH - 0.06, cz, along ? L + 0.1 : T + 0.04, 0.08, along ? T + 0.04 : L + 0.1, pal.trim, { noAo: true });
    for (const s of [-1, 1]) k.box(along ? cx + s * (L / 2 - 0.03) : cx, 0, along ? cz : cz + s * (L / 2 - 0.03), along ? 0.06 : T + 0.04, doorH, along ? T + 0.04 : 0.06, pal.trim, { noAo: true });
  }
  // Where the house meets its own garden: a low wall with tall windows looking out on it.
  for (const wl of gardenWalls(shape, plan.size)) {
    const along = wl.y0 === wl.y1;
    const x0 = mx(wl.x0), z0 = mz(wl.y0), x1 = mx(wl.x1), z1 = mz(wl.y1);
    const len = along ? x1 - x0 : z1 - z0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const bw = along ? len + T : T, bd = along ? T : len + T;
    k.box(cx, 0, cz, bw, 0.6, bd, pal.wall, { noAo: true });
    k.box(cx, 2.4, cz, bw, room.h - 2.4, bd, pal.wall, { noAo: true });
    const posts = Math.max(1, Math.round(len / 1.6));
    for (let i = 0; i <= posts; i++) {
      const t = -len / 2 + (i * len) / posts;
      k.box(along ? cx + t : cx, 0.6, along ? cz : cz + t, along ? 0.06 : T + 0.02, 1.8, along ? T + 0.02 : 0.06, pal.frame, { noAo: true });
    }
    k.quad(cx, 1.5, cz, len, 1.8, 0xffffff, { layer: "glass", ry: along ? 0 : Math.PI / 2 });
    x.blocks.push({ x: cx, z: cz, w: along ? len : 0.3, d: along ? 0.3 : len, ry: 0 });
  }
  // The garden itself (a terrace upstairs), with palms, and in a courtyard house its pool.
  for (const g of gardenParts(shape, plan.size)) {
    const gw = g.w * CELL_M, gd = g.d * CELL_M;
    const gx = mx(g.x) + gw / 2, gz = mz(g.y) + gd / 2;
    k.box(gx, 0, gz, gw, 0.02, gd, level === 0 ? 0x7fb36a : 0xcfc6b8, { noAo: true });
    if (level === 0 && shape === "ushape" && g.w >= 14 && g.d >= 10) water(x, gx, gz, Math.min(16, g.w - 6) * CELL_M, Math.min(8, g.d - 6) * CELL_M);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) plant(x, gx + sx * (gw / 2 - 0.7), gz + sz * (gd / 2 - 0.7), 1.3, level === 0 ? "palm" : "bush");
    x.blocks.push({ x: gx, z: gz, w: gw, d: gd, ry: 0 });
  }
  // Tiled floors in the kitchen and bathroom, a light in every room, art where there's none.
  const tiles: Record<string, [FloorStyle, number, number]> = {
    kitchen: ["checker", 0xeeeeea, 0xcfd4d6],
    bathroom: ["hex", 0xf3f5f6, 0xbcc8cf],
    balcony: ["stone", 0xd9d4ca, 0xc4bdb0],
    // The special rooms: a dark shiny dance hall, cinema carpet, rubber in the gym, baize green in the games room.
    dancehall: ["marble", 0x2b2a33, 0x1c1b22],
    cinema: ["carpet", 0x5a1f28, 0x4a1820],
    gym: ["concrete", 0x50565e, 0x454b52],
    games: ["carpet", 0x2f5d50, 0x26503f],
    bar: ["parquet", 0x6b4a33, 0x553826],
    pool: ["hex", 0xe6f4f5, 0xc9e3e6],
  };
  // The other rooms, by their style: Modern polished concrete, Luxury marble, Cosy carpet.
  const styleFloor: ([FloorStyle, number, number] | null)[] = [null, ["concrete", 0xd9d9d6, 0xcfcfcb], ["marble", 0xf3efe8, 0xd9d2c5], ["carpet", 0xcdb59a, 0xbfa58a]];
  // (Not from rnd, so homes without special rooms look just as they did.)
  const neon = [0xff4fd8, 0x22d3ee, 0xa3e635, 0xffd43b][level % 4];
  for (const r of floor.rooms) {
    if (r.kind === "dancehall" || r.kind === "bar") {
      // Glowing strips round the top of the walls (and along the bottom in the dance hall).
      const x0 = mx(r.x) + 0.1, x1 = mx(r.x + r.w) - 0.1, z0 = mz(r.y) + 0.1, z1 = mz(r.y + r.d) - 0.1;
      const strips: [number, number, number, number][] = [[(x0 + x1) / 2, z0, x1 - x0, 0.04], [(x0 + x1) / 2, z1, x1 - x0, 0.04], [x0, (z0 + z1) / 2, 0.04, z1 - z0], [x1, (z0 + z1) / 2, 0.04, z1 - z0]];
      for (const [sx, sz, sw, sd] of strips) {
        k.box(sx, room.h - 0.14, sz, sw, 0.04, sd, neon, { layer: "glow" });
        if (r.kind === "dancehall") k.box(sx, 0.1, sz, sw, 0.03, sd, 0x7c3aed, { layer: "glow" });
      }
    }
  }
  for (const r of floor.rooms) {
    const cx = mx(r.x + r.w / 2), cz = mz(r.y + r.d / 2);
    const rw = r.w * CELL_M, rd = r.d * CELL_M;
    const tile = tiles[r.kind] ?? styleFloor[roomStyle(r)];
    if (tile) {
      const { tex, metres } = floorTexture(tile[0], tile[1], tile[2], rnd);
      tex.repeat.set(rw / metres, rd / metres);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(rw, rd).rotateX(-Math.PI / 2), mat);
      m.position.set(cx, 0.003, cz);
      x.extras.push(m);
      x.textures.push(tex);
    }
    if (r.kind === "hall" || r.kind === "bathroom" || r.kind === "dancehall" || r.kind === "cinema") k.cyl(cx, room.h - 0.012, cz, 0.12, 0.12, 0.012, 0xfff6e0, 14, { layer: "glow" });
    // (A room with a chandelier needs no other light.)
    else if (!floor.items.some((i) => i.kind === "chandelier" && roomAt(floor, i.x, i.y)?.id === r.id)) pendant(x, cx, cz, r.kind === "dining" ? 1.05 : 0.6, r.kind === "dining" ? "drum" : pickOf(rnd, ["globe", "cone", "drum"] as const), pal.metal);
    x.lamps.push({ x: cx, y: room.h - 0.8, z: cz });
    x.spots.push({ x: cx + 0.3, z: cz + 0.4, ry: rnd() * 6, pose: "stand", y: 0 });
    x.views.push({ x: cx, z: cz + Math.min(1.2, rd / 3), yaw: 0, pitch: -0.12 });
  }
  // The flights on this floor (up from here, and up to here from below): nothing stands on them.
  const upItem = level < plan.floors.length - 1 ? floor.items.find((i) => i.kind === "stairs") : undefined;
  const belowItem = level > 0 ? plan.floors[level - 1].items.find((i) => i.kind === "stairs") : undefined;
  const flights = [upItem ? stairFlight(plan, level, upItem) : null, belowItem ? stairFlight(plan, level - 1, belowItem) : null].filter((f): f is Flight => !!f);
  // The furniture, in the colours of each room's style.
  for (const it of floor.items) {
    if (it.kind !== "stairs" && it.kind !== "rug") {
      const sz = itemSize(it);
      const r = { x: mx(it.x + sz.w / 2), z: mz(it.y + sz.d / 2), w: sz.w * CELL_M, d: sz.d * CELL_M };
      if (flights.some((f) => overlapsFlight(f, r))) continue;
      // Nothing standing about in the stair hall to block the view of the stairs.
      if (flights.length && (it.kind === "plant" || it.kind === "sideboard") && roomAt(floor, it.x, it.y)?.kind === "hall") continue;
    }
    const centre = itemSize(it);
    const pal = styledPal(x.pal, roomAt(floor, Math.floor(it.x + centre.w / 2), Math.floor(it.y + centre.d / 2)));
    const wood = pal.wood;
    const f = FURNITURE[it.kind];
    const s = itemSize(it);
    const cx = mx(it.x + s.w / 2), cz = mz(it.y + s.d / 2);
    const ry = (-it.rot * Math.PI) / 2;
    const fw = f.w * CELL_M, fd = f.d * CELL_M;
    const inRoom = roomAt(floor, it.x, it.y)?.kind;
    /** Draw against a pretend wall at the piece's back (for the pieces drawn on a wall). */
    const backed = (fn: () => void) =>
      k.at(cx, 0, cz, ry, () => {
        const was = x.room;
        x.room = { ...was, w: 60, d: fd };
        try {
          fn();
        } finally {
          x.room = was;
        }
      });
    switch (it.kind) {
      case "sofa":
        sofa(x, cx, cz - Math.cos(ry) * 0.02, ry, fw - 0.1, pal.fabric);
        break;
      case "armchair":
        armchair(x, cx, cz, ry, pal.fabric2);
        break;
      case "chair":
        chair(x, cx, cz, ry, pal.fabric2, wood);
        break;
      case "table":
        table(x, cx, cz, ry, fw - 0.12, fd - 0.12, wood, wood);
        k.at(cx, 0, cz, ry, () => {
          k.cyl(0, 0.75, 0, 0.09, 0.07, 0.07, 0xffffff, 16);
          for (let b = 0; b < 3; b++) k.ball((b - 1) * 0.05, 0.84, 0, 0.04, [0xe5484d, 0xf5a524, 0x69db7c][b], { w: 6, h: 5 });
        });
        break;
      case "coffee":
        table(x, cx, cz, ry, fw - 0.3, fd - 0.45, pickOf(rnd, [wood, 0x2b2b2b, 0xf1efea]), wood, { h: 0.42 });
        k.at(cx, 0, cz, ry, () => {
          k.box(-0.2, 0.42, 0, 0.3, 0.04, 0.22, pal.accent);
          k.cyl(0.22, 0.42, 0.05, 0.06, 0.05, 0.18, pickOf(rnd, pal.art), 12);
        });
        break;
      case "desk":
        k.at(cx, 0, cz, ry, () => {
          k.box(0, 0.72, 0, fw - 0.1, 0.035, fd - 0.2, wood);
          for (const sx of [-(fw / 2 - 0.1), fw / 2 - 0.1]) k.box(sx, 0, 0, 0.04, 0.72, fd - 0.3, pal.metal);
          // A laptop and a mug.
          k.box(0, 0.755, -0.05, 0.36, 0.015, 0.24, 0xadb5bd);
          k.box(0, 0.77, -0.17, 0.36, 0.22, 0.012, 0x2b2b2b, { rx: -0.25 });
          k.cyl(fw / 2 - 0.3, 0.755, -0.1, 0.04, 0.035, 0.1, pal.accent, 10);
          k.shadow(0, 0, fw + 0.2, fd + 0.1, 0.25);
        });
        break;
      case "tv": {
        const uv = x.sheet.paint(256, 144, (c, w, h) => tvPicture(c, w, h, rnd));
        k.at(cx, 0, cz, ry, () => {
          k.box(0, 0, 0, fw, 0.45, fd - 0.08, wood);
          for (let d = 0; d < 3; d++) k.box(-fw / 2 + (fw / 3) * (d + 0.5), 0.05, fd / 2 - 0.03, fw / 3 - 0.03, 0.36, 0.01, shadeHex(wood, 0.06), { noAo: true });
          k.box(0, 0.45, -0.05, 0.3, 0.03, 0.18, 0x2b2b2b);
          k.box(0, 0.5, -0.06, 0.05, 0.12, 0.04, 0x2b2b2b);
          k.box(0, 0.6, -0.08, Math.min(1.4, fw - 0.1), 0.78, 0.05, 0x111316, { noAo: true });
          k.quad(0, 0.99, -0.052, Math.min(1.34, fw - 0.16), 0.72, 0xffffff, { layer: "texGlow" }, uv);
          k.shadow(0, 0, fw + 0.2, fd + 0.2, 0.3);
        });
        break;
      }
      case "shelf":
        backed(() => bookshelf(x, 0, 0, fw - 0.06, 1.8));
        break;
      case "sideboard":
        backed(() => sideboard(x, 0, 0, fw - 0.1, wood));
        break;
      case "art":
        backed(() => art(x, 0, 0, 1.55, fw * 0.75, 0.62));
        break;
      case "mirror":
        k.at(cx, 0, cz, ry, () => {
          const z = -fd / 2;
          k.box(0, inRoom === "bathroom" ? 1.15 : 0.9, z + 0.02, fw * 0.6 + 0.06, inRoom === "bathroom" ? 0.7 : 1.1, 0.03, pal.frame, { noAo: true });
          k.quad(0, inRoom === "bathroom" ? 1.5 : 1.45, z + 0.037, fw * 0.6, inRoom === "bathroom" ? 0.62 : 1.02, 0xdfeef7, { layer: "glow" });
        });
        break;
      case "clock":
        k.at(cx, 0, cz, ry, () => {
          const z = -fd / 2 + 0.03;
          k.cyl(0, 1.9, z, 0.17, 0.17, 0.04, pal.metal, 24, { rx: Math.PI / 2 });
          k.cyl(0, 1.9, z + 0.025, 0.15, 0.15, 0.01, 0xfdfbf6, 24, { rx: Math.PI / 2, noAo: true });
          k.box(-0.004, 1.9, z + 0.04, 0.008, 0.11, 0.006, 0x222222, { noAo: true });
          k.box(0, 1.9, z + 0.042, 0.08, 0.008, 0.006, 0x222222, { noAo: true });
        });
        break;
      case "rug":
        rugAt(x, cx, cz, fw - 0.1, fd - 0.1, ry);
        break;
      case "plant":
        plant(x, cx, cz, 0.95 + rnd() * 0.25);
        break;
      case "lamp":
        floorLamp(x, cx, cz, pal.metal);
        break;
      case "fan":
        k.at(cx, 0, cz, ry, () => {
          k.cyl(0, 0, 0, 0.16, 0.18, 0.04, 0x2b2b2b, 16);
          k.cyl(0, 0.04, 0, 0.018, 0.018, 1.1, 0xadb5bd, 8);
          k.cyl(0, 1.15, 0.05, 0.2, 0.2, 0.08, 0xdee2e6, 20, { rx: Math.PI / 2 });
          k.ring(0, 1.15, 0.1, 0.2, 0.012, 0x868e96, { rx: 0 });
        });
        break;
      case "nightstand":
        k.at(cx, 0, cz, ry, () => {
          k.box(0, 0, 0, 0.44, 0.52, 0.4, wood);
          k.box(0, 0.3, 0.205, 0.38, 0.16, 0.01, shadeHex(wood, 0.06), { noAo: true });
          k.box(0, 0.37, 0.215, 0.1, 0.02, 0.02, pal.metal, { noAo: true });
          tableLamp(x, 0.05, 0.52, -0.05, pal.metal);
          k.shadow(0, 0, 0.6, 0.55, 0.25);
        });
        break;
      case "bed":
      case "single":
        k.at(cx, 0, cz, ry, () => {
          const bw = fw - 0.12, bl = fd - 0.12;
          const z0 = -fd / 2 + 0.06;
          k.soft(0, 0, 0, bw, 0.3, bl, wood, 0.03);
          k.soft(0, 0.3, 0.02, bw - 0.08, 0.22, bl - 0.08, 0xfbfaf7, 0.08);
          k.soft(0, 0.48, 0.25, bw - 0.04, 0.08, bl * 0.62, pal.fabric, 0.05);
          k.soft(0, 0.5, bl / 2 - 0.25, bw, 0.06, 0.35, pal.fabric2, 0.03);
          const pillows = it.kind === "bed" ? [-bw / 4, bw / 4] : [0];
          for (const sx of pillows) k.soft(sx, 0.52, z0 + 0.3, Math.min(0.62, bw / pillows.length - 0.12), 0.15, 0.34, 0xffffff, 0.08);
          if (it.kind === "bed") k.soft(0, 0.52, z0 + 0.45, 0.45, 0.13, 0.16, pal.accent, 0.06);
          // Headboard.
          k.soft(0, 0, z0 - 0.02, bw + 0.08, 1.15, 0.1, pal.fabric, 0.05);
          k.shadow(0, 0, bw + 0.2, bl + 0.2, 0.35);
          spot(x, bw / 2 - 0.25, 0.25, Math.PI / 2, "sit", 0.52);
        });
        break;
      case "wardrobe":
        k.at(cx, 0, cz, ry, () => {
          const ww = fw - 0.08, wd = fd - 0.12;
          k.box(0, 0, 0, ww, 2.05, wd, wood);
          for (const sx of [-ww / 4, ww / 4]) {
            k.box(sx, 0.08, wd / 2, ww / 2 - 0.03, 1.9, 0.012, shadeHex(wood, 0.05), { noAo: true });
            k.box(sx + (sx < 0 ? ww / 4 - 0.07 : -ww / 4 + 0.07), 0.95, wd / 2 + 0.012, 0.02, 0.25, 0.02, pal.metal, { noAo: true });
          }
          k.shadow(0, 0, ww + 0.2, wd + 0.2, 0.3);
        });
        break;
      case "fridge":
        k.at(cx, 0, cz, ry, () => {
          k.box(0, 0, 0, fw - 0.15, 1.85, fd - 0.2, 0xe9ecef);
          k.box(0, 1.15, fd / 2 - 0.1, fw - 0.17, 0.01, 0.01, 0xadb5bd, { noAo: true });
          k.box(fw / 2 - 0.2, 0.75, fd / 2 - 0.09, 0.02, 0.3, 0.02, 0x868e96, { noAo: true });
          k.box(fw / 2 - 0.2, 1.3, fd / 2 - 0.09, 0.02, 0.3, 0.02, 0x868e96, { noAo: true });
          k.shadow(0, 0, fw, fd, 0.3);
        });
        break;
      case "cooker":
      case "counter":
      case "sink": {
        const bath = it.kind === "sink" && inRoom === "bathroom";
        k.at(cx, 0, cz, ry, () => {
          const cw = fw - 0.02, cd = Math.min(0.62, fd - 0.04);
          const z = -fd / 2 + cd / 2;
          if (bath) {
            // A basin on a small cabinet.
            k.box(0, 0, z, cw * 0.8, 0.78, cd * 0.8, 0xffffff);
            k.box(0, 0.78, z, cw * 0.82, 0.06, cd * 0.85, 0xf1f3f5);
            k.box(0, 0.8, z + 0.02, cw * 0.5, 0.045, cd * 0.45, 0xdde3e7, { noAo: true });
            k.cyl(0, 0.84, z - cd * 0.3, 0.015, 0.015, 0.18, 0xadb5bd, 8);
            return;
          }
          k.box(0, 0, z, cw, 0.1, cd - 0.04, 0x3a3a3a);
          k.box(0, 0.1, z, cw, 0.78, cd, it.kind === "cooker" ? 0x2b2b2b : pal.trim);
          k.box(0, 0.88, z, cw + 0.02, 0.04, cd + 0.03, 0x2b2b2b);
          for (let dd = 0; dd < Math.max(1, Math.floor(cw / 0.5)); dd++) {
            const dx = -cw / 2 + 0.25 + dd * 0.5;
            if (it.kind !== "cooker") k.box(dx, 0.14, z + cd / 2, 0.46, 0.7, 0.01, shadeHex(pal.trim, 0.06), { noAo: true });
            k.box(dx, 0.76, z + cd / 2 + 0.01, 0.25, 0.02, 0.02, pal.metal, { noAo: true });
          }
          if (it.kind === "cooker") {
            k.box(0, 0.18, z + cd / 2, cw - 0.1, 0.45, 0.01, 0x495057, { noAo: true });
            for (const [bx, bz] of [[-0.12, -0.1], [0.12, -0.1], [-0.12, 0.12], [0.12, 0.12]]) k.ring(bx, 0.925, z + bz, 0.07, 0.012, 0x868e96, { rx: Math.PI / 2 });
            k.cyl(0.12, 0.93, z - 0.1, 0.1, 0.1, 0.1, 0xadb5bd, 16);
          } else if (it.kind === "sink") {
            k.box(0, 0.905, z + 0.02, cw * 0.6, 0.01, cd * 0.6, 0xadb5bd, { noAo: true });
            k.cyl(0, 0.92, z - cd * 0.35, 0.015, 0.015, 0.26, pal.metal, 8);
          } else {
            k.cyl(-cw / 4, 0.92, z, 0.1, 0.08, 0.08, 0xffffff, 16);
            k.box(cw / 4, 0.92, z - 0.1, 0.3, 0.25, 0.18, 0x343a40);
          }
          // Wall cupboards above.
          k.box(0, 1.5, -fd / 2 + 0.18, cw, 0.7, 0.34, pal.trim, { noAo: true });
          k.shadow(0, z, cw + 0.1, cd + 0.2, 0.3);
        });
        if (it.kind === "cooker") {
          k.at(cx, 0, cz, ry, () => {
            x.act = "cook";
            spot(x, 0, 0.8, Math.PI, "stand");
            x.act = undefined;
          });
        }
        break;
      }
      case "toilet":
        k.at(cx, 0, cz, ry, () => {
          const z = -fd / 2;
          k.box(0, 0.4, z + 0.04, 0.4, 0.38, 0.18, 0xffffff);
          k.cyl(0, 0, z + 0.4, 0.17, 0.13, 0.4, 0xffffff, 18);
          k.cyl(0, 0.4, z + 0.4, 0.2, 0.2, 0.04, 0xf1f3f5, 18);
          k.shadow(0, z + 0.3, 0.55, 0.75, 0.25);
        });
        break;
      case "shower":
        k.at(cx, 0, cz, ry, () => {
          k.box(0, 0, 0, fw - 0.05, 0.06, fd - 0.05, 0xf1f3f5);
          k.quad(0, 1.05, fd / 2 - 0.04, fw - 0.06, 2.0, 0xffffff, { layer: "glass" });
          k.box(fw / 2 - 0.05, 0.06, fd / 2 - 0.04, 0.03, 2.0, 0.03, 0xadb5bd, { noAo: true });
          k.cyl(0, 2.0, -fd / 2 + 0.25, 0.1, 0.1, 0.02, 0xadb5bd, 14);
          k.box(0, 1.2, -fd / 2 + 0.02, 0.03, 0.85, 0.03, 0xadb5bd, { noAo: true });
        });
        break;
      case "bath":
        k.at(cx, 0, cz, ry, () => {
          const bw = fw - 0.08, bd = fd - 0.12;
          k.soft(0, 0, 0, bw, 0.55, bd, 0xffffff, 0.06);
          k.box(0, 0.5, 0, bw - 0.14, 0.06, bd - 0.14, 0xd8e4ea, { noAo: true });
          k.cyl(-bw / 2 + 0.12, 0.55, 0, 0.02, 0.02, 0.2, 0xadb5bd, 8);
          k.shadow(0, 0, bw + 0.2, bd + 0.2, 0.3);
        });
        break;
      // ---- the special rooms (the dance floor tiles themselves are laid after this, all together)
      case "dancefloor":
        k.box(cx, 0, cz, fw, 0.06, fd, 0x1b1b1b, { noAo: true });
        break;
      case "djbooth":
        // Like the club's: the decks on a desk, a glowing front, the DJ behind it.
        k.at(cx, 0, cz, ry, () => {
          const bw = fw - 0.08;
          k.box(0, 0, 0.1, bw, 1.0, fd * 0.55, 0x2b2b2b);
          k.box(0, 1.0, 0.1, bw + 0.06, 0.04, fd * 0.6, 0x111111);
          for (const dx of [-bw * 0.25, bw * 0.25]) {
            k.cyl(dx, 1.04, 0.1, 0.2, 0.2, 0.03, 0x343a40, 20);
            k.cyl(dx, 1.07, 0.1, 0.07, 0.07, 0.01, neon, 12, { layer: "glow" });
          }
          k.box(0, 1.04, 0.1, 0.36, 0.05, 0.28, 0x495057);
          k.box(0, 0.2, 0.1 + fd * 0.275 + 0.01, bw - 0.1, 0.55, 0.02, 0x7c3aed, { layer: "glow" });
          k.shadow(0, 0, fw + 0.2, fd + 0.1, 0.3);
          x.act = "dj";
          spot(x, 0, -fd / 2 + 0.2, 0, "stand");
          x.act = undefined;
          item(x, "dj", "DJ booth", 0, 0.5, fd / 2 + 0.3, 1.0);
        });
        break;
      case "speaker":
        k.at(cx, 0, cz, ry, () => {
          k.box(0, 0, 0, 0.44, 1.35, 0.4, 0x1b1b1b);
          for (const sy of [0.35, 0.95]) k.cyl(0, sy, 0.2, 0.15, 0.15, 0.02, 0x343a40, 18, { rx: Math.PI / 2 });
          k.cyl(0, 1.2, 0.2, 0.05, 0.05, 0.02, neon, 10, { rx: Math.PI / 2, layer: "glow" });
          k.shadow(0, 0, 0.6, 0.55, 0.3);
        });
        break;
      case "discoball": {
        // A mirror ball hung from the ceiling, turning, with coloured beams swinging under it.
        const top = room.h - 0.6;
        k.box(cx, top + 0.3, cz, 0.015, room.h - top - 0.3, 0.015, 0x495057, { noAo: true });
        const ballMat = new THREE.MeshBasicMaterial({ color: 0xdfe6ff });
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), ballMat);
        ball.position.set(cx, top, cz);
        x.extras.push(ball);
        const coneMat = new THREE.MeshBasicMaterial({ color: neon, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const coneGeo = new THREE.ConeGeometry(0.8, top, 18, 1, true).translate(0, -top / 2, 0);
        const cones = [0, 1].map((c) => {
          const cone = new THREE.Mesh(coneGeo, coneMat);
          cone.position.set(cx + (c - 0.5) * 0.4, top, cz);
          x.extras.push(cone);
          return cone;
        });
        x.anim.push((t) => {
          ball.rotation.y = t * 0.8;
          ballMat.color.setHSL((t * 0.1) % 1, 0.4, 0.85);
          cones.forEach((c, i) => {
            c.rotation.z = Math.sin(t * 0.9 + i * 2) * 0.4;
            c.rotation.x = Math.cos(t * 0.7 + i) * 0.3;
          });
        });
        break;
      }
      case "partylight":
        k.at(cx, 0, cz, ry, () => {
          k.cyl(0, 0, 0, 0.16, 0.18, 0.04, 0x2b2b2b, 14);
          k.cyl(0, 0.04, 0, 0.02, 0.02, 1.9, 0x343a40, 8);
          k.box(0, 1.94, 0, 0.5, 0.05, 0.06, 0x343a40, { noAo: true });
          [0xff4fd8, 0x22d3ee, 0xffd43b].forEach((c, i) => k.box((i - 1) * 0.17, 1.82, 0.04, 0.12, 0.12, 0.12, c, { layer: "glow" }));
          k.shadow(0, 0, 0.4, 0.4, 0.25);
        });
        break;
      case "screen": {
        // A big screen on the wall with a film on it, the projector up on the ceiling across from it.
        const uv = x.sheet.paint(320, 160, (c, w, h) => tvPicture(c, w, h, rnd));
        k.at(cx, 0, cz, ry, () => {
          const z = -fd / 2 + 0.02;
          const sw = fw - 0.2;
          k.box(0, 0.7, z, sw + 0.1, sw * 0.42 + 0.1, 0.04, 0x111316, { noAo: true });
          k.quad(0, 0.75 + sw * 0.21, z + 0.025, sw, sw * 0.42, 0xffffff, { layer: "texGlow" }, uv);
          k.box(0, room.h - 0.3, 2.2, 0.4, 0.18, 0.35, 0xdee2e6, { noAo: true });
          k.box(0, room.h - 0.12, 2.2, 0.03, 0.12, 0.03, 0x495057, { noAo: true });
        });
        break;
      }
      case "recliner":
        k.at(cx, 0, cz, ry, () => {
          const c = 0x7a1d2a;
          k.soft(0, 0, 0.05, 0.8, 0.42, 0.8, c, 0.06);
          k.soft(0, 0.3, -0.3, 0.78, 0.7, 0.2, c, 0.08, { rx: -0.15 });
          for (const side of [-1, 1]) k.soft(side * 0.38, 0.3, 0.05, 0.12, 0.3, 0.75, shadeHex(c, 0.08), 0.05);
          k.cyl(0.38, 0.6, 0.25, 0.05, 0.04, 0.08, 0xadb5bd, 10);
          k.shadow(0, 0, 1, 1, 0.3);
          spot(x, 0, 0.05, 0, "sit", 0.46);
        });
        break;
      case "popcorn":
        k.at(cx, 0, cz, ry, () => {
          k.box(0, 0, 0, 0.42, 0.8, 0.4, 0xc92a2a);
          k.box(0, 0.8, 0, 0.46, 0.5, 0.44, 0xffffff, { layer: "glass" });
          k.box(0, 0.8, 0, 0.42, 0.28, 0.4, 0xffe8a3);
          k.box(0, 1.3, 0, 0.48, 0.12, 0.46, 0xc92a2a);
          k.shadow(0, 0, 0.6, 0.6, 0.3);
        });
        break;
      case "treadmill":
        k.at(cx, 0, cz, ry, () => {
          k.box(0, 0, 0, fw - 0.25, 0.2, fd - 0.2, 0x1f2226);
          k.box(0, 0.2, 0.05, fw - 0.45, 0.02, fd - 0.5, 0x343a40);
          for (const sx of [-(fw / 2 - 0.15), fw / 2 - 0.15]) k.box(sx, 0.2, -fd / 2 + 0.2, 0.05, 1.15, 0.05, pal.metal);
          k.box(0, 1.3, -fd / 2 + 0.18, fw - 0.25, 0.3, 0.08, 0x212529);
          k.box(0, 1.35, -fd / 2 + 0.23, fw * 0.5, 0.2, 0.01, 0x4dabf7, { layer: "glow" });
          k.shadow(0, 0, fw, fd, 0.3);
          spot(x, 0, 0.1, Math.PI, "stand");
        });
        break;
      case "bike":
        k.at(cx, 0, cz, ry, () => {
          k.box(0, 0, 0, 0.12, 0.06, fd - 0.2, 0x343a40);
          k.cyl(0, 0.18, -0.2, 0.2, 0.2, 0.08, 0x495057, 16, { rz: Math.PI / 2 });
          k.box(0, 0.06, 0.2, 0.06, 0.75, 0.06, 0x868e96);
          k.soft(0, 0.8, 0.2, 0.24, 0.07, 0.3, 0x212529, 0.03);
          k.box(0, 0.06, -0.3, 0.06, 1.0, 0.06, 0x868e96);
          k.box(0, 1.05, -0.3, 0.42, 0.04, 0.04, 0x212529);
          k.shadow(0, 0, 0.5, fd, 0.25);
        });
        break;
      case "weights":
        k.at(cx, 0, cz, ry, () => {
          k.box(0, 0, 0.15, 0.35, 0.42, fd - 0.5, 0x212529);
          k.soft(0, 0.42, 0.15, 0.32, 0.08, fd - 0.5, 0xc92a2a, 0.03);
          for (const sx of [-0.42, 0.42]) k.box(sx, 0, -fd / 2 + 0.3, 0.05, 1.0, 0.05, pal.metal, { noAo: true });
          k.box(0, 1.0, -fd / 2 + 0.3, fw - 0.3, 0.03, 0.03, pal.metal, { noAo: true });
          for (const sx of [-(fw / 2 - 0.3), fw / 2 - 0.3]) k.cyl(sx, 1.0, -fd / 2 + 0.3, 0.22, 0.22, 0.05, 0x212529, 16, { rz: Math.PI / 2, noAo: true });
          k.shadow(0, 0, fw - 0.2, fd, 0.3);
          spot(x, 0, 0.15, Math.PI, "sit", 0.5);
        });
        break;
      case "dumbbells":
        k.at(cx, 0, cz, ry, () => {
          k.box(0, 0, -0.02, fw - 0.1, 0.65, 0.35, 0x343a40);
          for (let d = 0; d < 6; d++) {
            const dx = -fw / 2 + 0.25 + d * ((fw - 0.5) / 5);
            for (const sx of [-0.07, 0.07]) k.cyl(dx + sx, 0.72, -0.02, 0.05 + d * 0.006, 0.05 + d * 0.006, 0.05, d % 2 ? 0x212529 : 0xe8590c, 12, { rz: Math.PI / 2, noAo: true });
          }
          k.shadow(0, 0, fw, 0.5, 0.25);
        });
        break;
      case "gymmat":
        k.mat(cx, 0.012, cz, s.w * CELL_M - 0.1, s.d * CELL_M - 0.1, pickOf(rnd, [0x4dabf7, 0xda77f2, 0x40c057, 0xff922b]));
        break;
      case "pooltable":
        // (Drawn 2.3 × 1.3 m, along the piece's width.)
        poolTable(x, cx, cz, ry);
        break;
      case "arcade":
        // The cabinet's screen faces its -z, so turn it round to face the room.
        arcadeCabinet(x, cx, cz, ry + Math.PI, pickOf(rnd, [0x7048e8, 0xe03131, 0x1c7ed6, 0x2f9e44]));
        item(x, "arcade", "Arcade game", cx, 0, cz, 0.9);
        break;
      case "dartboard":
        k.at(cx, 0, cz, ry, () => {
          const z = -fd / 2 + 0.02;
          k.box(0, 1.4, z, 0.6, 0.6, 0.03, 0x2b2b2b, { noAo: true });
          k.cyl(0, 1.7, z + 0.03, 0.22, 0.22, 0.04, 0x1b1b1b, 24, { rx: Math.PI / 2 });
          k.cyl(0, 1.7, z + 0.07, 0.19, 0.19, 0.01, 0xe9dcc3, 20, { rx: Math.PI / 2, noAo: true });
          k.cyl(0, 1.7, z + 0.08, 0.12, 0.12, 0.01, 0x2f9e44, 20, { rx: Math.PI / 2, noAo: true });
          k.cyl(0, 1.7, z + 0.09, 0.025, 0.025, 0.01, 0xe03131, 12, { rx: Math.PI / 2, noAo: true });
          item(x, "darts", "Darts", 0, 0, 1.2, 0.9);
        });
        break;
      case "homebar":
        k.at(cx, 0, cz, ry, () => {
          const bw = fw - 0.06;
          // Shelves of bottles against the wall, the counter in front.
          k.box(0, 0, -fd / 2 + 0.15, bw, 0.9, 0.3, shadeHex(wood, -0.1));
          k.box(0, 1.2, -fd / 2 + 0.06, bw, 0.9, 0.12, 0x2b2b2b, { noAo: true });
          for (let b = 0; b < 16; b++) k.cyl(-bw / 2 + 0.2 + (b % 8) * ((bw - 0.4) / 7), 0.9 + Math.floor(b / 8) * 0.45, -fd / 2 + 0.14, 0.035, 0.035, 0.26, pickOf(rnd, [0x2f9e44, 0xe8c07d, 0xb6d7e6, 0x7a2e3a, 0xff922b]), 8, { layer: "glow" });
          k.box(0, 0, fd / 2 - 0.3, bw, 1.05, 0.5, 0x3b2a20);
          k.box(0, 1.05, fd / 2 - 0.3, bw + 0.05, 0.05, 0.6, 0x212529);
          k.box(0, 0.08, fd / 2 - 0.04, bw, 0.03, 0.02, neon, { layer: "glow" });
          k.shadow(0, 0, fw + 0.1, fd + 0.1, 0.3);
          x.act = "sip";
          spot(x, 0, -0.1, 0, "stand");
          x.act = undefined;
          item(x, "bar", "Bar", 0, 0, fd / 2 + 0.4, 1.0);
        });
        break;
      case "barstool":
        x.act = "sip";
        chair(x, cx, cz, ry, pal.accent, 0x343a40, { stool: true });
        x.act = undefined;
        break;
      case "jukebox":
        jukebox(x, cx, cz, ry);
        break;
      case "poolS":
      case "poolM":
      case "poolL":
        water(x, cx, cz, s.w * CELL_M, s.d * CELL_M);
        break;
      case "lounger":
        k.at(cx, 0, cz, ry, () => {
          const lw = fw - 0.3, ll = fd - 0.2;
          k.box(0, 0, 0, lw, 0.28, ll, 0xd0bfa6);
          k.soft(0, 0.28, 0.2, lw - 0.06, 0.08, ll * 0.62, pal.fabric2, 0.03);
          k.soft(0, 0.3, -ll / 2 + 0.35, lw - 0.06, 0.08, 0.7, pal.fabric2, 0.03, { rx: -0.7 });
          k.shadow(0, 0, lw + 0.2, ll + 0.2, 0.25);
          spot(x, 0, 0.1, 0, "sit", 0.36);
        });
        break;
      case "piano":
        k.at(cx, 0, cz, ry, () => {
          const pw = fw - 0.2, pl = fd - 0.3;
          for (const [lx, lz] of [[-pw / 2 + 0.12, -pl / 2 + 0.25], [pw / 2 - 0.12, -pl / 2 + 0.25], [0, pl / 2 - 0.25]]) k.cyl(lx, 0, lz, 0.05, 0.04, 0.68, 0x111111, 10);
          k.box(0, 0.68, 0.05, pw, 0.3, pl - 0.1, 0x111111);
          k.box(0, 0.98, 0.15, pw - 0.1, 0.02, pl - 0.4, 0x111111, { rx: -0.45 });
          k.box(0, 0.72, -pl / 2 + 0.12, pw - 0.1, 0.06, 0.18, 0xfdfdfb, { noAo: true });
          k.box(0, 0.45, -pl / 2 - 0.35, pw * 0.6, 0.06, 0.35, 0x111111);
          k.shadow(0, 0, pw + 0.3, pl + 0.3, 0.35);
          spot(x, 0, -pl / 2 - 0.35, 0, "sit", 0.5);
        });
        break;
      case "chandelier":
        k.at(cx, 0, cz, ry, () => {
          k.cyl(0, room.h - 0.5, 0, 0.012, 0.012, 0.5, 0xc9a227, 6, { noAo: true });
          k.ring(0, room.h - 0.75, 0, 0.42, 0.02, 0xc9a227, { rx: Math.PI / 2 });
          k.ring(0, room.h - 0.6, 0, 0.26, 0.018, 0xc9a227, { rx: Math.PI / 2 });
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            k.ball(Math.cos(a) * 0.42, room.h - 0.86, Math.sin(a) * 0.42, 0.05, 0xfff6dc, { layer: "glow", w: 8, h: 6 });
            k.cyl(Math.cos(a) * 0.42, room.h - 1.0, Math.sin(a) * 0.42, 0.012, 0.03, 0.12, 0xeaf6ff, 6, { layer: "glow" });
          }
          k.ball(0, room.h - 0.95, 0, 0.09, 0xfff6dc, { layer: "glow", w: 10, h: 8 });
        });
        x.lamps.push({ x: cx, y: room.h - 0.9, z: cz });
        break;
      case "stairs": {
        if (level >= plan.floors.length - 1) break;
        const fl = stairFlight(plan, level, it);
        drawFlight(x, fl, wood);
        // The way up: at the foot of the stairs. And a view from there, looking up them.
        x.items.push({ kind: "stairs", label: "Go upstairs", x: fl.foot.x, y: 0.5, z: fl.foot.z, r: 0.8 });
        {
          const D2 = (SIZES[plan.size].d * CELL_M) / 2;
          x.views.push({ x: fl.x, z: Math.min(D2 - 0.4, fl.z + fl.d / 2 + 1.9), yaw: 0, pitch: 0.12 });
        }
        break;
      }
    }
  }
  // The dance floor: every light-up tile on this floor in one go, changing colour on the beat
  // (the same beat as the clubs); the first dance hall's floor is where people dance.
  const dance = floor.items.filter((i) => i.kind === "dancefloor");
  if (dance.length) {
    const per = Math.round((FURNITURE.dancefloor.w * CELL_M) / 0.5);
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.02, 0.46).translate(0, 0.07, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), dance.length * per * per);
    const cols = [0xff4fd8, 0x22d3ee, 0xa3e635, 0xffd43b, 0x7c3aed, 0xff6b6b].map((c) => new THREE.Color(c));
    // Each tile's place on the grid of half-metre tiles (for the waves of colour).
    const grid: [number, number][] = [];
    const m4 = new THREE.Matrix4();
    for (const it of dance)
      for (let i = 0; i < per; i++)
        for (let j = 0; j < per; j++) {
          const gx = it.x + i, gy = it.y + j;
          m4.makeTranslation(mx(it.x) + 0.25 + i * 0.5, 0, mz(it.y) + 0.25 + j * 0.5);
          tiles.setMatrixAt(grid.length, m4);
          tiles.setColorAt(grid.length, cols[(gx + gy) % cols.length]);
          grid.push([gx, gy]);
        }
    x.extras.push(tiles);
    let lastBeat = -1;
    const dim = new THREE.Color();
    x.anim.push(() => {
      const beat = Math.floor(clubBeat());
      if (beat === lastBeat) return;
      lastBeat = beat;
      grid.forEach(([i, j], n) => {
        const wave = Math.sin(i * 0.9 + j * 0.7 + beat * 1.3);
        tiles.setColorAt(n, dim.copy(cols[(i + j + beat) % cols.length]).multiplyScalar(wave > 0.2 ? 1 : 0.18));
      });
      if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
    });
  }
  const df = danceFloorOf(floor);
  if (df) {
    const w = df.w * CELL_M, d = df.d * CELL_M;
    const fx = mx(df.x) + w / 2, fz = mz(df.y) + d / 2;
    x.dance = { x: fx, z: fz, w, d };
    item(x, "dance", "Dance floor", fx, 0.07, fz, Math.min(1.6, Math.min(w, d) / 2));
    // A few people dancing (the rest of the room is left to the party-goers).
    x.act = "dance";
    for (let n = 0; n < 4; n++) spot(x, fx + (rnd() - 0.5) * (w - 0.8), fz + (rnd() - 0.5) * (d - 0.8), rnd() * 6, "stand");
    x.act = undefined;
  }
  // The way down: where the stairs from the floor below come up.
  if (level > 0) {
    const below = plan.floors[level - 1].items.find((i) => i.kind === "stairs");
    if (below) {
      // The stairwell: the opening over the stairs from below, the top steps showing, a railing
      // round it except where you step off. (When the stairs carry on up from here, they stand in
      // it instead.)
      const f = stairFlight(plan, level - 1, below);
      const upHere = level < plan.floors.length - 1 && floor.items.some((i) => i.kind === "stairs");
      if (!upHere) {
        const { x: cx, z: cz, w, d } = f;
        k.box(cx, 0.001, cz, w, 0.01, d, 0x2b2622, { noAo: true });
        const last = f.runs[f.runs.length - 1];
        for (let st = 0; st < 4; st++) k.box(last.x, 0.002 - st * 0.0004, f.exit.z + (f.kind === "u" ? -0.6 - st * last.go : 0.6 + st * last.go), last.w - 0.06, 0.008, Math.max(0.1, last.go - 0.03), shadeHex(pal.wood, -0.05 - st * 0.1), { noAo: true });
        const rail = shadeHex(pal.wood, -0.15);
        const openX = cx - f.wall * (w / 2);
        // Straight: rail down the open side and across the front. U: across the front of the first run.
        const rails: [number, number, number, number][] =
          f.kind === "straight" ? [[openX, cz, 0.05, d], [cx, cz + d / 2, w, 0.05]] : [[f.ax, cz + d / 2, f.each, 0.05]];
        for (const [rx, rz, rw, rd] of rails) {
          k.box(rx, 0.92, rz, rw + 0.04, 0.05, rd + 0.04, rail, { noAo: true });
          const along = rw > rd ? rw : rd;
          const nb = Math.max(2, Math.round(along / 0.2));
          for (let bb = 0; bb <= nb; bb++) {
            const t = -along / 2 + (along / nb) * bb;
            k.cyl(rx + (rw > rd ? t : 0), 0, rz + (rw > rd ? 0 : t), 0.014, 0.014, 0.92, 0x1f2125, 6);
          }
        }
        x.blocks.push({ x: cx, z: cz, w: w + 0.1, d, ry: 0 });
      }
      x.items.push({ kind: "stairs", label: "Go downstairs", x: f.exit.x, y: 0.3, z: f.exit.z, r: 0.8 });
    }
  }
  // Coming in: the front door is in the middle of the front wall.
  x.views.unshift({ x: 0, z: D / 2 - 0.7, yaw: 0, pitch: -0.12 });
}

// ---------------------------------------------------------------- putting it together

export function createInterior(info: InteriorInfo): Interior {
  const rnd = rngFrom(info.key);
  const { room: baseRoom, pal, build } = plan(info.theme, rnd, info.variant, info);
  // A landmark's floor: the same room, built bigger (the furniture spreads out to fill it).
  const sc = info.scale && info.scale > 1 && !info.home ? info.scale : 1;
  const room = sc > 1 ? { ...baseRoom, w: baseRoom.w * sc, d: baseRoom.d * sc, h: Math.max(baseRoom.h, Math.min(baseRoom.h * 1.25, 4.5)) } : baseRoom;
  const sheet = new Sheet(1024);
  const k = new Kit();
  const x: Ctx = { k, sheet, rnd, pal, room, spots: [], views: [], lamps: [], info, items: [], extras: [], anim: [], nightHooks: [], blocks: [], textures: [] };
  // The clock tower's dials make their own walls (and the stadium is open to the sky).
  if (room.noShell) {
    // Nothing: no walls, no ceiling.
  } else if (info.theme !== "clockroom") shell(x);
  else k.box(0, room.h, 0, room.w + 0.6, 0.12, room.d + 0.6, pal.ceiling, { noAo: true });
  build(x);
  // Soft shadows along the bottom of the walls (and they keep walkers off the walls).
  if (!room.noShell) {
    for (let side = 0; side < 4; side++) {
      const L = wallLen(room, side);
      atWall(x, side, 0, () => k.shadow(0, 0.18, L, 0.42, 0.18));
    }
  }
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
  // (The stadium has its own ground.)
  floorMesh.visible = !room.noShell;
  group.add(floorMesh);
  const blocks: Block[] = [...k.shadows.filter((b) => b.a >= 0.2).map((b) => ({ x: b.x, z: b.z, w: b.w - 0.15, d: b.d - 0.15, ry: b.ry })), ...x.blocks];
  const shadows = shadowMesh(k.shadows);
  if (shadows) group.add(shadows);
  for (const e of x.extras) group.add(e);

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
  // Every seat, in the order they were made (the same for everyone).
  const seats = x.spots.filter((sp) => sp.pose === "sit");
  // Nobody stands right in front of where you look from; then mix up who goes where.
  const clear = x.spots.filter((sp) => x.views.every((v) => Math.hypot(sp.x - v.x, sp.z - v.z) > 2.6));
  const spots = [...(clear.length >= 4 ? clear : x.spots)].sort(() => rnd() - 0.5);

  const allMats: THREE.Material[] = [...Object.values(mats), floorMat];
  if (shadows) allMats.push(shadows.material as THREE.Material);
  allMats.push(poolMat);
  for (const e of x.extras)
    e.traverse((o) => {
      if ((o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) && !allMats.includes(o.material as THREE.Material)) allMats.push(o.material as THREE.Material);
    });
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
    if (x.dark) {
      // A club: dark and colourful whatever the time of day.
      hemi.intensity = 0.95;
      hemi.color.setHex(0x9b7bff);
      hemi.groundColor.setHex(0x2a1840);
      sun.intensity = 0.05;
      for (const l of warm) l.intensity = 3.2;
      mats.glow.color.setScalar(1.3);
      poolMat.opacity = 0.35;
    }
    if (!x.dark) poolMat.opacity = 0.32 * n;
    for (const h of x.nightHooks) h(n);
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
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    for (const m of allMats) m.dispose();
    tex.dispose();
    ftex.dispose();
    for (const t of x.textures) t.dispose();
    poolGeo.dispose();
  }

  function update(time: number) {
    for (const a of x.anim) a(time);
    if (x.dark) warm.forEach((l, i) => l.color.setHSL((time * 0.07 + i * 0.4) % 1, 0.8, 0.6));
  }

  return { group, views: x.views, spots, seats, items: x.items, blocks, danceFloor: x.dance, poles: x.poles, w: room.w, d: room.d, setNight, setAlpha, update, dispose };
}
