"use client";

import { useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar, type Avatar } from "@/lib/avatar";
import { addressOf, hash, KIND_LABEL, makePlan, riverCentre, smoothNoise, spiralXY, STRUCTURE_LABEL, tileAt, type CityPlan, type Tile } from "@/lib/city/layout";
import { ABBREV } from "@/lib/city/places";
import { daylight, weatherAt } from "@/lib/city/sky";
import { createBirds } from "./city/birds";
import { createBuildingSite, createSites } from "./city/construction";
import { coolingTowerGeometry, createPlumes, industryParts } from "./city/industry";
import { createPeople } from "./city/people";
import { balloonBannerTexture, billboardTexture, disposePills, pillTexture } from "./city/textures";
import { createTrains, railParts } from "./city/trains";
import { BRIDGE_TOP, makeWorld, signalJunction } from "./city/world";
import { playSfx } from "./sound";

// The game board, drawn as a small living 3D city with three.js.
// Every tile is a lot: a road, a building, a park... New tiles rise out of the ground
// as the city grows. Cars drive the roads, birds and clouds drift overhead.
// Lightweight on purpose: a handful of shared shapes drawn many times (instancing).

export type CityMarkers = {
  searchedEmpty: number[];
  searchedHit: number[];
  caught: number[];
  left: number[];
  me: number | null;
  sweeps: { tile: number; radius: number; count: number }[];
  pending: number | null;
  /** Latest searches by anyone, and how long ago (ms). They light up. */
  recent: { tile: number; ageMs: number }[];
  /** Every searched tile (hiders only): shown as locked. */
  locked: number[];
  /** Your own decoy's tile (only you see it): a little inflatable dummy stands there. */
  decoy: number | null;
};

/** Something that just happened, for a short animation (see GameEvent). */
export type CityEvent = {
  id: number;
  kind: string;
  /** Where it happened (null for things with no place, like "respawn"). */
  tile: number | null;
  ageMs: number;
  detail?: {
    radius?: number;
    /** decoy_found: "explode" or "toy". */
    outcome?: string;
    hiders?: { name: string | null; avatar: unknown; bot: boolean }[];
  } | null;
};

/** An advert shown on the city's billboards (image: a public URL, ideally about 2:1). */
export type CityAd = { id: string; image: string; headline: string; brand: string; link: string | null };

/**
 * A chat room: a building (id "b:<tile index>", the corner tile for big 2×2 buildings) or a
 * hot-air balloon (id "balloon:<k>").
 */
export type CityRoom = { id: string; name: string; capacity: number; kind: "building" | "balloon" };

/** A ghost caught this round: their face stays floating over the spot. */
export type CaughtFace = { tile: number; name: string | null; avatar: unknown };

type Props = {
  seed: number;
  tileCount: number;
  markers: CityMarkers;
  events: CityEvent[];
  interactive: boolean;
  onTile: (tile: number) => void;
  /** A billboard was tapped: which board, and the ad it was showing (null = "advertise here"). */
  onBillboard: (info: { id: string; tile: number; adId: string | null }) => void;
  onHover?: (info: { tile: number; label: string } | null) => void;
  /** Your face, floating over your hiding spot. */
  meAvatar: Avatar;
  /** A coin balloon drifting by just for you (its slot number), or none. */
  coinBalloon: number | null;
  onBalloon: (slot: number) => void;
  /** How far through the hunt we are (0..1), for day and night, and which way it runs. */
  progress: number;
  nightFirst: boolean;
  /** Adverts to rotate through on the billboards (empty = the house "advertise here" boards). */
  ads: CityAd[];
  /** Ad views seen on screen since the last call ({ adId: views }), sent at most every 15 s. */
  onAdViews: (counts: Record<string, number>) => void;
  /**
   * False during the join window: the real city stays secret and the whole map is a building
   * site. When it turns true (the hunt starts) the city rises. Default true.
   */
  revealed?: boolean;
  /** "chat": tap buildings and balloons to enter their chat rooms (onRoom) instead of onTile. Default "game". */
  mode?: "game" | "chat";
  /** How many people are in each chat room right now ({ roomId: count }). */
  roomCounts?: Record<string, number>;
  /** Chat mode: a building or balloon was tapped. */
  onRoom?: (room: CityRoom) => void;
  /** Ride hot-air balloon k (the camera flies into its basket), or null for the normal view. */
  ride?: number | null;
  /** How many hot-air balloons there are (called after the city is built). */
  onBalloons?: (count: number) => void;
  /** Ghosts caught this round (preferred over working it out from events, which get trimmed). */
  caughtFaces?: CaughtFace[];
};

type Part = { tile: number; x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; color: number; tilt?: number };

const SKY = 0xd7ebf7;
const BALLOON_NAMES = ["Red", "Yellow", "Blue", "Purple", "Mint"];
const GROUND = 0xd3e4c8;
const ASPHALT = 0x5b6470;
const SIDEWALK = 0xf3f1ec;
const GRASS = 0xa8d79a;
const WATER = 0x7cc4e8;
/** Traffic-light bulbs carry this plus (direction × 3 + bulb) as their colour until lit. */
const SIGNAL_TAG = 1000;
/** Blinking lights carry this plus their kind as their colour (see FLASH below). */
const FLASH_TAG = 2000;
const FLASH = { hazard: 0, policeRed: 1, policeBlue: 2, works: 3 } as const;

// ---------------------------------------------------------------- shapes
function geometries() {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roof = new THREE.CylinderGeometry(0, 1, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const crown = new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0);
  const trunk = new THREE.CylinderGeometry(0.05, 0.07, 1, 5).translate(0, 0.5, 0);
  const disc = new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0);
  // Half a ring, standing up: the arch under a bridge.
  const arch = new THREE.TorusGeometry(0.29, 0.035, 6, 18, Math.PI);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0);
  const cone = new THREE.ConeGeometry(0.5, 1, 16).translate(0, 0.5, 0);
  const dome = new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  // A quarter ring lying flat, centred on a tile corner: a bend in the road.
  const curve = new THREE.RingGeometry(0.2, 0.8, 14, 1, 0, Math.PI / 2).rotateX(-Math.PI / 2);
  const curveLine = new THREE.RingGeometry(0.485, 0.515, 14, 1, 0, Math.PI / 2).rotateX(-Math.PI / 2);
  const lamp = new THREE.SphereGeometry(0.5, 8, 6);
  const cooling = coolingTowerGeometry();
  return { box, roof, crown, trunk, disc, arch, cyl, cone, dome, curve, curveLine, lamp, cooling };
}

// ---------------------------------------------------------------- what stands on a tile
function partsFor(t: Tile, plan: CityPlan, add: (mesh: string, p: Omit<Part, "tile">) => void) {
  basePartsFor(t, plan, add);
  // The railway viaduct passes over some tiles (whatever is underneath).
  if (t.rail) railParts(t, plan, add);
}

function basePartsFor(t: Tile, plan: CityPlan, add: (mesh: string, p: Omit<Part, "tile">) => void) {
  const { x, z, r } = t;
  const pal = plan.palette;
  const pick = (list: number[], v: number) => list[Math.floor(v * list.length) % list.length];
  const tree = (dx: number, dz: number, size: number, v: number) => {
    add("trunk", { x: x + dx, y: 0.08, z: z + dz, sx: size, sy: 0.35 * size, sz: size, ry: 0, color: 0x8a6a4f });
    add("crown", { x: x + dx, y: 0.08 + 0.25 * size, z: z + dz, sx: 0.6 * size, sy: 0.75 * size, sz: 0.6 * size, ry: v * 6, color: pick(pal.leaves, v) });
  };

  if (t.kind === "river" || t.kind === "lake") {
    add("water", { x, y: -0.03, z, sx: 1, sy: 0.03, sz: 1, ry: 0, color: t.kind === "river" ? 0x6fb7e0 : WATER });
    return;
  }

  if (t.kind === "bridge") {
    // A humped bridge: ramps up from the road on both banks, a flat span with an arch
    // under it, railings and street lamps. Drawn along x, turned for streets along z.
    const alongX = t.road === "x";
    const ry = alongX ? 0 : Math.PI / 2;
    const at = (dx: number, dz: number) => (alongX ? { x: x + dx, z: z + dz } : { x: x + dz, z: z - dx });
    add("water", { x, y: -0.03, z, sx: 1, sy: 0.03, sz: 1, ry: 0, color: 0x6fb7e0 });
    const rise = BRIDGE_TOP - 0.06;
    const ramp = Math.atan2(rise, 0.3);
    const rampLen = Math.hypot(0.3, rise) + 0.02;
    const segs = [
      { dx: -0.35, y: 0.06 + rise / 2, len: rampLen, tilt: ramp },
      { dx: 0, y: BRIDGE_TOP, len: 0.42, tilt: 0 },
      { dx: 0.35, y: 0.06 + rise / 2, len: rampLen, tilt: -ramp },
    ];
    for (const sg of segs) {
      const c = at(sg.dx, 0);
      add("building", { ...c, y: sg.y - 0.06, sx: sg.len, sy: 0.05, sz: 0.66, ry, tilt: sg.tilt, color: 0xd5d9df });
      add("ground", { ...c, y: sg.y - 0.012, sx: sg.len, sy: 0.014, sz: 0.5, ry, tilt: sg.tilt, color: ASPHALT });
      for (const side of [-0.31, 0.31]) {
        const r2 = at(sg.dx, side);
        add("building", { ...r2, y: sg.y, sx: sg.len, sy: 0.06, sz: 0.03, ry, tilt: sg.tilt, color: 0xc0504a });
      }
    }
    for (const side of [-0.3, 0.3]) {
      add("arch", { ...at(0, side), y: -0.06, sx: 1, sy: 1, sz: 1, ry, color: 0xb9c0c9 });
      const lamp = at(0, side + (side > 0 ? 0.02 : -0.02));
      add("trunk", { ...lamp, y: BRIDGE_TOP, sx: 0.35, sy: 0.32, sz: 0.35, ry: 0, color: 0x495057 });
      add("disc", { ...lamp, y: BRIDGE_TOP + 0.32, sx: 0.07, sy: 0.04, sz: 0.07, ry: 0, color: 0xffe8a3 });
    }
    return;
  }

  if (t.kind === "road") {
    const m = t.mask ?? 0;
    // Bends: pavement with a curved stretch of road sweeping round the corner.
    const bend: Record<number, [number, number, number]> = { 3: [0.5, -0.5, Math.PI], 6: [0.5, 0.5, Math.PI / 2], 12: [-0.5, 0.5, 0], 9: [-0.5, -0.5, -Math.PI / 2] };
    if (bend[m]) {
      const [cx, cz, ry] = bend[m];
      add("ground", { x, y: 0, z, sx: 1, sy: 0.06, sz: 1, ry: 0, color: SIDEWALK });
      add("curve", { x: x + cx, y: 0.062, z: z + cz, sx: 1, sy: 1, sz: 1, ry, color: ASPHALT });
      add("curveLine", { x: x + cx, y: 0.064, z: z + cz, sx: 1, sy: 1, sz: 1, ry, color: 0xffffff });
      // A tree tucked into the outside of the bend.
      add("trunk", { x: x - cx * 0.7, y: 0.06, z: z - cz * 0.7, sx: 0.45, sy: 0.16, sz: 0.45, ry: 0, color: 0x8a6a4f });
      add("crown", { x: x - cx * 0.7, y: 0.17, z: z - cz * 0.7, sx: 0.27, sy: 0.34, sz: 0.27, ry: t.r[0] * 6, color: plan.palette.leaves[0] });
      return;
    }
    add("ground", { x, y: 0, z, sx: 1, sy: 0.06, sz: 1, ry: 0, color: ASPHALT });
    if (t.roundabout) {
      // Roundabout: a grassy island with a fountain or a tree, and a painted ring.
      add("curveLine", { x: x + 0.5, y: 0.064, z: z - 0.5, sx: 0.8, sy: 1, sz: 0.8, ry: Math.PI, color: 0xffffff });
      add("curveLine", { x: x + 0.5, y: 0.064, z: z + 0.5, sx: 0.8, sy: 1, sz: 0.8, ry: Math.PI / 2, color: 0xffffff });
      add("curveLine", { x: x - 0.5, y: 0.064, z: z + 0.5, sx: 0.8, sy: 1, sz: 0.8, ry: 0, color: 0xffffff });
      add("curveLine", { x: x - 0.5, y: 0.064, z: z - 0.5, sx: 0.8, sy: 1, sz: 0.8, ry: -Math.PI / 2, color: 0xffffff });
      add("disc", { x, y: 0.06, z, sx: 0.46, sy: 0.08, sz: 0.46, ry: 0, color: 0xdee2e6 });
      add("disc", { x, y: 0.06, z, sx: 0.4, sy: 0.1, sz: 0.4, ry: 0, color: GRASS });
      if (t.r[1] < 0.5) {
        add("disc", { x, y: 0.16, z, sx: 0.2, sy: 0.06, sz: 0.2, ry: 0, color: 0xcfd6dd });
        add("water", { x, y: 0.2, z, sx: 0.15, sy: 0.02, sz: 0.15, ry: 0, color: WATER });
        add("cyl", { x, y: 0.16, z, sx: 0.04, sy: 0.18, sz: 0.04, ry: 0, color: 0xcfd6dd });
      } else {
        add("trunk", { x, y: 0.16, z, sx: 0.6, sy: 0.2, sz: 0.6, ry: 0, color: 0x8a6a4f });
        add("crown", { x, y: 0.3, z, sx: 0.32, sy: 0.4, sz: 0.32, ry: t.r[2] * 6, color: plan.palette.leaves[1] });
      }
      return;
    }
    const straight = m === 5 || m === 10 || m === 1 || m === 4 || m === 2 || m === 8;
    if (straight) {
      const along = m === 10 || m === 2 || m === 8;
      // A street light on every other stretch, alternating sides.
      if ((x + z) % 2 === 0) {
        const side = (x * 3 + z) % 4 < 2 ? 0.47 : -0.47;
        const lx = along ? x : x + side;
        const lz = along ? z + side : z;
        add("trunk", { x: lx, y: 0.06, z: lz, sx: 0.3, sy: 0.5, sz: 0.3, ry: 0, color: 0x495057 });
        add("lamp", { x: lx - (along ? 0 : side * 0.12), y: 0.56, z: lz - (along ? side * 0.12 : 0), sx: 0.11, sy: 0.07, sz: 0.11, ry: 0, color: 0xffffff });
      }
      for (const o of [-0.25, 0.25]) {
        add("paint", { x: x + (along ? o : 0), y: 0.061, z: z + (along ? 0 : o), sx: along ? 0.22 : 0.04, sy: 0.005, sz: along ? 0.04 : 0.22, ry: 0, color: 0xffffff });
      }
      // Dead end: a turning circle.
      if (m === 1 || m === 4 || m === 2 || m === 8) add("disc", { x, y: 0.0, z, sx: 1.05, sy: 0.061, sz: 1.05, ry: 0, color: ASPHALT });
      if (t.works) roadWorksParts(t, along, add);
      else if (t.incident) incidentParts(t, along, plan, add);
    } else {
      // Junctions: a zebra crossing on each side that has a road.
      add("ground", { x, y: 0, z, sx: 0.5, sy: 0.062, sz: 0.5, ry: 0, color: 0x6a7380 });
      // Traffic lights on two opposite corners, one for each direction of traffic. The bulbs
      // are coloured live (see updateSignals); their colour here only says which is which.
      for (const [cx, cz, axis] of [[0.43, -0.43, 0], [-0.43, 0.43, 1]] as const) {
        add("trunk", { x: x + cx, y: 0.06, z: z + cz, sx: 0.28, sy: 0.5, sz: 0.28, ry: 0, color: 0x343a40 });
        add("building", { x: x + cx, y: 0.42, z: z + cz, sx: 0.07, sy: 0.19, sz: 0.07, ry: 0, color: 0x212529 });
        for (let k = 0; k < 3; k++) {
          add("signal", { x: x + cx, y: 0.585 - k * 0.058, z: z + cz, sx: 0.05, sy: 0.05, sz: 0.05, ry: 0, color: SIGNAL_TAG + axis * 3 + k });
        }
      }
      for (const [bit, dx, dz] of [[1, 0, -0.38], [2, 0.38, 0], [4, 0, 0.38], [8, -0.38, 0]] as const) {
        if (!(m & bit)) continue;
        for (let k = -2; k <= 2; k++) {
          const ns = bit === 1 || bit === 4;
          add("paint", { x: x + dx + (ns ? k * 0.09 : 0), y: 0.061, z: z + dz + (ns ? 0 : k * 0.09), sx: ns ? 0.05 : 0.16, sy: 0.005, sz: ns ? 0.16 : 0.05, ry: 0, color: 0xffffff });
        }
      }
    }
    return;
  }

  const GREEN_LOTS = ["park", "trees", "pond", "ferris", "turbine", "watertower", "mast"];
  const greenStructure = t.kind === "structure" && ["funfair", "solar", "campus", "dam"].includes(t.structure!.type);
  const lot = GREEN_LOTS.includes(t.kind) || greenStructure ? GRASS : SIDEWALK;
  add("ground", { x, y: 0, z, sx: 0.98, sy: 0.08, sz: 0.98, ry: 0, color: lot });

  // Little helpers: a box / cylinder / cone standing on the ground at (dx, dz) from the tile centre.
  const B = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry = 0, mesh = "building", tilt = 0) =>
    add(mesh, { x: x + dx, y, z: z + dz, sx, sy, sz, ry, color, tilt });
  const bands = (dx: number, dz: number, w: number, d: number, from: number, to: number, step: number, color = 0x5d7fa3, ry = 0) => {
    for (let y = from + step; y < to - 0.05; y += step) B(dx, y, dz, w + 0.012, 0.07, d + 0.012, color, ry, "glass");
  };

  if (t.kind === "structure") {
    if (t.structure!.anchor) structureParts(t, plan, B, tree);
    return;
  }

  switch (t.kind) {
    case "tower": {
      const color = pick(pal.towers, r[3]);
      const w = 0.62 + r[2] * 0.18;
      if (t.v === 1) {
        // Round glass tower
        const h = t.top - 0.4;
        B(0, 0.08, 0, w, h, w, color, 0, "cyl");
        for (let y = 0.5; y < h; y += 0.42) B(0, 0.08 + y, 0, w + 0.03, 0.06, w + 0.03, 0x4c6e91, 0, "cyl");
        B(0, 0.08 + h, 0, w * 0.6, 0.25, w * 0.6, color, 0, "cyl");
        B(0, 0.33 + h, 0, 0.12, 0.35, 0.12, 0xdee2e6, 0, "cone");
      } else if (t.v === 2) {
        // Twisting tower: floors turn a little as they rise
        const h = t.top - 0.4;
        const floors = Math.max(4, Math.floor(h / 0.32));
        for (let k = 0; k < floors; k++) {
          B(0, 0.08 + k * (h / floors), 0, w * 0.9, h / floors - 0.03, w * 0.9, k % 2 ? color : 0x6c8eae, k * 0.11);
        }
      } else if (t.v === 3) {
        // Needle spire
        const h = t.top - 1.6;
        B(0, 0.08, 0, w, h * 0.8, w, color);
        bands(0, 0, w, w, 0.08, 0.08 + h * 0.8, 0.5);
        B(0, 0.08 + h * 0.8, 0, w * 0.7, h * 0.2, w * 0.7, color);
        B(0, 0.08 + h, 0, 0.16, 1.5, 0.16, 0xe9ecef, 0, "cone");
      } else if (t.v === 4) {
        // Helipad on the roof
        const h = t.top - 0.4;
        B(0, 0.08, 0, w + 0.06, h, w + 0.06, color);
        bands(0, 0, w + 0.06, w + 0.06, 0.08, 0.08 + h, 0.45);
        B(0, 0.08 + h, 0, w * 0.85, 0.03, w * 0.85, 0x495057, 0, "cyl");
        B(-0.08, 0.115 + h, 0, 0.04, 0.005, 0.26, 0xffffff, 0, "paint");
        B(0.08, 0.115 + h, 0, 0.04, 0.005, 0.26, 0xffffff, 0, "paint");
        B(0, 0.115 + h, 0, 0.16, 0.005, 0.04, 0xffffff, 0, "paint");
      } else {
        // Stepped tower
        const h = t.top - 0.4;
        B(0, 0.08, 0, w, h * 0.72, w, color);
        B(0, 0.08 + h * 0.72, 0, w * 0.78, h * 0.28, w * 0.78, color);
        B(0.08, 0.08 + h, -0.06, 0.18, 0.18, 0.14, 0xdee2e6);
        if (r[0] > 0.55) add("trunk", { x: x - 0.1, y: 0.08 + h, z: z + 0.08, sx: 0.25, sy: 0.6, sz: 0.25, ry: 0, color: 0xadb5bd });
        bands(0, 0, w, w, 0.08, 0.08 + h * 0.72, 0.55);
      }
      break;
    }
    case "office": {
      const h = t.top - 0.08;
      const color = pick(pal.offices, r[1]);
      if (t.v === 1) {
        // L-shaped block
        B(0, 0.08, -0.2, 0.84, h, 0.38, color);
        B(-0.23, 0.08, 0.12, 0.38, h * 0.7, 0.42, color);
        bands(0, -0.2, 0.84, 0.38, 0.08, 0.08 + h, 0.38, 0x6c8eae);
        tree(0.25, 0.25, 0.5, r[0]);
      } else if (t.v === 2) {
        // Rooftop garden and stepped terraces
        const w = 0.74;
        B(0, 0.08, 0, w, h, w * 0.85, color);
        bands(0, 0, w, w * 0.85, 0.08, 0.08 + h, 0.36, 0x6c8eae);
        B(0, 0.08 + h, 0, w * 0.9, 0.03, w * 0.75, GRASS, 0, "ground");
        add("crown", { x: x - 0.15, y: 0.11 + h, z, sx: 0.25, sy: 0.3, sz: 0.25, ry: r[2], color: pick(pal.leaves, r[3]) });
        add("crown", { x: x + 0.15, y: 0.11 + h, z: z + 0.1, sx: 0.2, sy: 0.25, sz: 0.2, ry: r[1], color: pick(pal.leaves, r[0]) });
      } else {
        const w = 0.7 + r[2] * 0.15;
        const d = 0.6 + r[3] * 0.25;
        B(0, 0.08, 0, w, h, d, color);
        for (let k = 1; k <= Math.floor(h / 0.38); k++) B(0, 0.08 + k * 0.38 - 0.16, 0, w + 0.01, 0.08, d + 0.01, 0x6c8eae, 0, "glass");
        B(-w * 0.2, 0.08 + h, 0, 0.16, 0.1, 0.16, 0xced4da);
      }
      break;
    }
    case "house": {
      const dx = (r[1] - 0.5) * 0.1;
      if (t.v === 1) {
        // Flat-roofed modern house with a pool
        B(dx - 0.08, 0.08, -0.05, 0.56, 0.3, 0.45, 0xf8f9fa);
        B(dx - 0.08, 0.2, -0.05, 0.57, 0.08, 0.46, 0x495057, 0, "glass");
        B(dx - 0.05, 0.38, -0.05, 0.68, 0.04, 0.55, 0xdee2e6);
        B(dx + 0.3, 0.08, 0.22, 0.22, 0.02, 0.3, 0x74c0fc, 0, "water");
        tree(-0.36, 0.33, 0.45, r[0]);
      } else if (t.v === 2) {
        // Two-storey duplex with a garage
        const wall = pick(pal.walls, r[2]);
        B(dx - 0.06, 0.08, -0.04, 0.5, 0.6, 0.44, wall);
        add("roof", { x: x + dx - 0.06, y: 0.68, z: z - 0.04, sx: 0.58 / Math.SQRT2, sy: 0.26, sz: 0.52 / Math.SQRT2, ry: 0, color: pick(pal.roofs, r[3]) });
        B(dx + 0.3, 0.08, 0.05, 0.24, 0.22, 0.32, wall);
        B(dx - 0.06, 0.36, 0.2, 0.4, 0.03, 0.1, 0xced4da);
        tree(-0.38, 0.35, 0.45, r[0]);
      } else {
        const w = 0.5 + r[2] * 0.12;
        const d = 0.45 + r[3] * 0.12;
        B(dx, 0.08, 0, w, 0.38, d, pick(pal.walls, r[1]));
        add("roof", { x: x + dx, y: 0.46, z, sx: (w + 0.08) / Math.SQRT2, sy: 0.3, sz: (d + 0.08) / Math.SQRT2, ry: 0, color: pick(pal.roofs, r[3]) });
        tree(0.34 * (dx > 0 ? -1 : 1), 0.32, 0.55, r[0]);
      }
      break;
    }
    case "hospital":
      B(0, 0.08, -0.05, 0.82, 1.25, 0.62, 0xf8f9fa);
      B(0.2, 0.08, 0.2, 0.42, 0.7, 0.5, 0xf1f3f5);
      bands(0, -0.05, 0.82, 0.62, 0.08, 1.33, 0.32, 0x74c0fc);
      B(-0.15, 0.62, 0.265, 0.08, 0.3, 0.02, 0xe03131, 0, "paint");
      B(-0.15, 0.73, 0.265, 0.3, 0.08, 0.02, 0xe03131, 0, "paint");
      B(0, 1.33, -0.05, 0.5, 0.02, 0.5, 0x495057, 0, "cyl");
      B(0, 1.355, -0.05, 0.05, 0.005, 0.2, 0xe03131, 0, "paint");
      B(0, 1.355, -0.05, 0.2, 0.005, 0.05, 0xe03131, 0, "paint");
      break;
    case "clock":
      B(0, 0.08, 0, 0.6, 0.1, 0.6, 0xe7e1d5);
      B(0, 0.18, 0, 0.32, 1.9, 0.32, 0xd9c7a7);
      for (const [fx, fz, ry] of [[0, 0.165, Math.PI / 2], [0, -0.165, Math.PI / 2], [0.165, 0, 0], [-0.165, 0, 0]] as const) {
        B(fx, 1.78, fz, 0.24, 0.02, 0.24, 0xffffff, ry, "disc", Math.PI / 2);
      }
      add("roof", { x, y: 2.08, z, sx: 0.4 / Math.SQRT2, sy: 0.5, sz: 0.4 / Math.SQRT2, ry: 0, color: 0x2f9e44 });
      tree(0.32, 0.32, 0.45, r[0]);
      break;
    case "crane":
      // A building site: the building itself goes up during the hunt (see createSites), the
      // crane's arm is added separately so it can turn. Here: the earth, a fence, the mast.
      B(-0.06, 0.08, 0.05, 0.74, 0.004, 0.72, 0x9c8466, 0, "ground");
      for (const [fx, fz, fw, fd] of [[0, -0.45, 0.9, 0.02], [0, 0.45, 0.9, 0.02], [-0.45, 0, 0.02, 0.9]] as const) {
        B(fx, 0.08, fz, fw, 0.1, fd, 0xff922b);
      }
      B(0.32, 0.08, -0.32, 0.08, 3.0, 0.08, 0xfab005);
      B(0.3, 0.08, 0.3, 0.2, 0.12, 0.14, 0xf2b705);
      break;
    case "watertower":
      for (const [lx, lz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
        add("trunk", { x: x + lx, y: 0.08, z: z + lz, sx: 0.6, sy: 1.3, sz: 0.6, ry: 0, color: 0x868e96 });
      }
      B(0, 1.35, 0, 0.55, 0.5, 0.55, 0x74c0fc, 0, "cyl");
      B(0, 1.85, 0, 0.6, 0.3, 0.6, 0x495057, 0, "cone");
      break;
    case "mast":
      B(0, 0.08, 0, 0.3, 0.2, 0.3, 0xadb5bd);
      B(0, 0.28, 0, 0.28, 3.6, 0.28, 0xf03e3e, 0, "cone");
      for (const y of [1.0, 1.9, 2.8]) B(0, 0.28 + y, 0, 0.28 * (1 - y / 3.6) + 0.02, 0.18, 0.28 * (1 - y / 3.6) + 0.02, 0xffffff, 0, "cyl");
      break;
    case "police": {
      // Blue-and-white police station with a light on the roof and a patrol car outside.
      B(-0.05, 0.08, -0.08, 0.72, 0.62, 0.55, 0xf8f9fa);
      B(-0.05, 0.42, -0.08, 0.73, 0.1, 0.56, 0x1c3faa);
      B(-0.05, 0.7, -0.08, 0.5, 0.04, 0.4, 0xdee2e6);
      B(-0.05, 0.74, -0.08, 0.08, 0.08, 0.08, 0x4dabf7, 0, "lamp");
      B(-0.05, 0.08, 0.22, 0.24, 0.24, 0.04, 0x1c3faa);
      B(0.28, 0.08, 0.34, 0.3, 0.09, 0.15, 0xffffff);
      B(0.28, 0.12, 0.34, 0.305, 0.03, 0.155, 0x1c3faa);
      B(0.28, 0.17, 0.34, 0.15, 0.06, 0.13, 0x343a40);
      break;
    }
    case "fuel": {
      const brand = [0xe03131, 0x1971c2, 0x2f9e44, 0xf08c00][Math.floor(r[2] * 4)];
      for (const [px, pz] of [[-0.32, -0.2], [0.32, -0.2], [-0.32, 0.25], [0.32, 0.25]]) {
        add("trunk", { x: x + px, y: 0.08, z: z + pz, sx: 0.5, sy: 0.42, sz: 0.5, ry: 0, color: 0xdee2e6 });
      }
      B(0, 0.48, 0.02, 0.84, 0.06, 0.6, brand);
      B(0, 0.08, -0.05, 0.08, 0.16, 0.12, brand);
      B(0, 0.08, 0.15, 0.08, 0.16, 0.12, brand);
      B(-0.22, 0.08, -0.36, 0.45, 0.28, 0.22, 0xf8f9fa);
      break;
    }
    case "park": {
      const n = 2 + Math.floor(r[1] * 3);
      for (let k = 0; k < n; k++) {
        const a = r[2] * 6.28 + (k * 6.28) / n;
        tree(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.7 + ((r[3] * (k + 1)) % 0.4), (r[0] + k * 0.37) % 1);
      }
      add("disc", { x, y: 0.08, z, sx: 0.32, sy: 0.01, sz: 0.32, ry: 0, color: 0xe9dcc3 });
      break;
    }
    case "trees":
      for (let k = 0; k < 5; k++) {
        tree((hashish(r[1], k) - 0.5) * 0.7, (hashish(r[2], k) - 0.5) * 0.7, 0.75 + hashish(r[3], k) * 0.5, hashish(r[0], k));
      }
      break;
    case "pond":
      add("water", { x, y: 0.08, z, sx: 0.82, sy: 0.02, sz: 0.72, ry: r[1], color: WATER });
      tree(0.36, -0.36, 0.6, r[2]);
      break;
    case "ferris":
      // The legs; the turning wheel is added separately (see landmarks).
      for (const o of [-0.2, 0.2]) {
        add("building", { x: x + o, y: 0.08, z, sx: 0.05, sy: 1.25, sz: 0.05, ry: 0, color: 0xdee2e6 });
      }
      add("building", { x, y: 0.08, z: z + 0.32, sx: 0.5, sy: 0.12, sz: 0.2, ry: 0, color: 0xf08c6b });
      break;
    case "turbine":
      add("trunk", { x, y: 0.08, z, sx: 1.1, sy: 2.6, sz: 1.1, ry: 0, color: 0xf1f3f5 });
      add("building", { x, y: 2.6, z: z + 0.02, sx: 0.1, sy: 0.1, sz: 0.2, ry: 0, color: 0xf1f3f5 });
      tree(0.32, 0.3, 0.5, r[1]);
      break;
    case "stadium":
      add("disc", { x, y: 0.08, z, sx: 0.96, sy: 0.4, sz: 0.82, ry: 0, color: 0xdfe3e8 });
      add("disc", { x, y: 0.08, z, sx: 0.78, sy: 0.43, sz: 0.62, ry: 0, color: 0xd9734e });
      add("disc", { x, y: 0.08, z, sx: 0.62, sy: 0.44, sz: 0.46, ry: 0, color: 0x69c06a });
      add("paint", { x, y: 0.52, z, sx: 0.02, sy: 0.005, sz: 0.4, ry: 0, color: 0xffffff });
      break;
    case "billboard":
      // The board itself is added separately (see billboards); a little greenery here.
      add("ground", { x, y: 0.08, z, sx: 0.5, sy: 0.01, sz: 0.5, ry: 0, color: GRASS });
      break;
    case "plaza":
      add("ground", { x, y: 0.08, z, sx: 0.8, sy: 0.02, sz: 0.8, ry: 0, color: 0xe7e1d5 });
      add("disc", { x, y: 0.1, z, sx: 0.3, sy: 0.12, sz: 0.3, ry: 0, color: 0xcfd6dd });
      add("water", { x, y: 0.22, z, sx: 0.22, sy: 0.02, sz: 0.22, ry: 0, color: WATER });
      break;
  }
}

type AddFn = (mesh: string, p: Omit<Part, "tile">) => void;


/** A soft round glow (white in the middle, fading to nothing), for pools of light. */
function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const c = canvas.getContext("2d")!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Road works on a straight road: a dug-up patch, barriers, cones, blinking lamps and a digger or roller. */
function roadWorksParts(t: Tile, along: boolean, add: AddFn) {
  // a = along the road, c = across it.
  const at = (a: number, c: number) => (along ? { x: t.x + a, z: t.z + c } : { x: t.x + c, z: t.z + a });
  const ry = along ? 0 : -Math.PI / 2;
  const P = (mesh: string, a: number, y: number, c: number, sa: number, sy: number, sc: number, color: number, tilt = 0, turn = 0) =>
    add(mesh, { ...at(a, c), y, sx: sa, sy, sz: sc, ry: ry + turn, color, tilt });
  // The hole and a heap of earth.
  P("ground", 0, 0.055, -0.04, 0.46, 0.012, 0.36, 0x7a5a3c);
  P("ground", 0, 0.062, -0.04, 0.34, 0.006, 0.24, 0x5e4430);
  add("crown", { ...at(0.12, 0.27), y: 0.04, sx: 0.22, sy: 0.14, sz: 0.18, ry: t.r[1] * 6, color: 0x8b6a48 });
  // Red-and-white barriers right across the road at both ends, with a blinking lamp on each.
  for (const a of [-0.4, 0.4]) {
    P("building", a, 0.15, 0, 0.035, 0.06, 0.74, 0xffffff);
    for (const c of [-0.27, 0, 0.27]) P("paint", a, 0.15, c, 0.04, 0.062, 0.1, 0xe03131);
    for (const c of [-0.34, 0.34]) {
      P("trunk", a, 0.06, c, 0.2, 0.1, 0.2, 0x495057);
      add("flash", { ...at(a, c), y: 0.235, sx: 0.045, sy: 0.045, sz: 0.045, ry: 0, color: FLASH_TAG + FLASH.works });
    }
  }
  // Cones round the hole.
  for (const [a, c] of [[-0.24, -0.3], [0, -0.3], [0.24, -0.3], [-0.26, 0.18], [0.26, 0.18]]) {
    P("cone", a, 0.06, c, 0.07, 0.12, 0.07, 0xff7a1a);
    P("paint", a, 0.06, c, 0.09, 0.012, 0.09, 0x343a40);
  }
  if (t.r[2] < 0.6) {
    // A little digger: tracks, a yellow body, a cab and an arm reaching into the hole.
    const c0 = 0.22;
    P("building", -0.14, 0.06, c0, 0.24, 0.045, 0.15, 0x343a40);
    P("building", -0.14, 0.105, c0, 0.2, 0.07, 0.13, 0xf2b705);
    P("glass", -0.18, 0.175, c0, 0.09, 0.09, 0.11, 0x74c0fc);
    P("building", -0.18, 0.265, c0, 0.1, 0.015, 0.12, 0xf2b705);
    P("building", -0.02, 0.17, c0 - 0.06, 0.2, 0.03, 0.03, 0xf2b705, 0.55);
    P("building", 0.07, 0.1, c0 - 0.12, 0.03, 0.14, 0.03, 0xf2b705, -0.35);
    P("building", 0.1, 0.07, c0 - 0.16, 0.07, 0.05, 0.07, 0x495057);
  } else {
    // A road roller: a drum at the front, a body and a canopy.
    const c0 = 0.24;
    // (the drum is a lying cylinder drawn from one end, so shift it to centre it)
    add("cyl", { ...at(0.0, along ? c0 - 0.075 : c0 + 0.075), y: 0.105, sx: 0.09, sy: 0.15, sz: 0.09, ry: ry + Math.PI / 2, color: 0x868e96, tilt: Math.PI / 2 });
    P("building", -0.15, 0.07, c0, 0.18, 0.08, 0.13, 0xf2b705);
    P("trunk", -0.18, 0.15, c0, 0.15, 0.12, 0.15, 0x343a40);
    P("building", -0.17, 0.27, c0, 0.14, 0.015, 0.14, 0xf2b705);
  }
}

/** A broken-down car with its hazards on and its bonnet up, or a police car with lights flashing. */
function incidentParts(t: Tile, along: boolean, plan: CityPlan, add: AddFn) {
  const at = (a: number, c: number) => (along ? { x: t.x + a, z: t.z + c } : { x: t.x + c, z: t.z + a });
  const ry = along ? 0 : -Math.PI / 2;
  const side = t.r[1] < 0.5 ? 0.33 : -0.33;
  const P = (mesh: string, a: number, y: number, c: number, sa: number, sy: number, sc: number, color: number, tilt = 0) =>
    add(mesh, { ...at(a, c), y, sx: sa, sy, sz: sc, ry, color, tilt });
  const flash = (a: number, y: number, c: number, kind: number, size = 0.035) =>
    add("flash", { ...at(a, c), y, sx: size, sy: size, sz: size, ry: 0, color: FLASH_TAG + kind });
  if (t.incident === "breakdown") {
    const body = plan.palette.car[Math.floor(t.r[2] * plan.palette.car.length) % plan.palette.car.length];
    P("building", 0, 0.06, side, 0.3, 0.09, 0.15, body);
    P("building", -0.03, 0.15, side, 0.15, 0.06, 0.13, 0xe9f2fb);
    // Bonnet up.
    P("building", 0.1, 0.19, side, 0.1, 0.008, 0.13, body, -1.0);
    for (const a of [-0.15, 0.15]) for (const c of [-0.06, 0.06]) flash(a, 0.12, side + c, FLASH.hazard, 0.03);
    // A warning triangle behind it.
    add("roof", { ...at(-0.36, side), y: 0.06, sx: 0.035, sy: 0.07, sz: 0.035, ry: ry + Math.PI / 4, color: 0xe03131 });
  } else {
    P("building", 0, 0.06, side, 0.32, 0.09, 0.16, 0xffffff);
    P("paint", 0, 0.09, side, 0.325, 0.03, 0.165, 0x1c3faa);
    P("building", -0.02, 0.15, side, 0.16, 0.06, 0.14, 0x343a40);
    flash(-0.02, 0.225, side - 0.04, FLASH.policeRed);
    flash(-0.02, 0.225, side + 0.04, FLASH.policeBlue);
  }
}

type BoxFn = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry?: number, mesh?: string, tilt?: number) => void;
type TreeFn = (dx: number, dz: number, size: number, v: number) => void;

/** The big 2×2 buildings, drawn from their corner tile (the block's centre is at +0.5, +0.5). */
function structureParts(t: Tile, plan: CityPlan, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const pal = plan.palette;
  const r = t.r;
  const pick = (list: number[], v: number) => list[Math.floor(v * list.length) % list.length];
  const c = 0.5; // centre offset
  const floor =
    st.type === "funfair" || st.type === "solar" || st.type === "campus" || st.type === "dam"
      ? GRASS
      : st.type === "military"
        ? 0xa3ad7f
        : st.type === "airport"
          ? 0xb7c4a5
          : st.type === "power"
            ? 0xc9cdd2
            : st.type === "oilrig"
              ? 0x2f74b5
              : 0xe7e1d5;
  B(c, 0.02, c, 1.98, 0.07, 1.98, floor, 0, "ground");
  switch (st.type) {
    case "mall": {
      const color = pick(pal.offices, r[1]);
      B(c, 0.09, c - 0.3, 1.7, 0.6, 1.05, color);
      B(c, 0.09, c - 0.3, 1.71, 0.12, 1.06, 0x6c8eae, 0, "glass");
      B(c, 0.69, c - 0.3, 0.8, 0.32, 0.6, 0xa5d8ff, 0, "glass");
      B(c, 0.4, c + 0.25, 0.6, 0.05, 0.12, 0xfa5252);
      B(c, 0.09, c + 0.6, 1.7, 0.012, 0.66, ASPHALT, 0, "ground");
      for (let k = -3; k <= 3; k++) B(c + k * 0.22, 0.103, c + 0.6, 0.02, 0.004, 0.3, 0xffffff, 0, "paint");
      break;
    }
    case "twin": {
      const color = pick(pal.towers, r[2]);
      const H = 6 + r[1] * 1.5;
      for (const side of [-0.42, 0.42]) {
        B(c + side, 0.09, c, 0.6, H, 0.6, color);
        for (let y = 0.6; y < H - 0.2; y += 0.55) B(c + side, 0.09 + y, c, 0.612, 0.07, 0.612, 0x5d7fa3, 0, "glass");
        B(c + side, 0.09 + H, c, 0.12, 0.9, 0.12, 0xe9ecef, 0, "cone");
      }
      B(c, 0.09 + H * 0.55, c, 0.3, 0.22, 0.28, 0xadb5bd);
      break;
    }
    case "museum": {
      B(c, 0.09, c, 1.8, 0.15, 1.6, 0xf1ece2);
      B(c, 0.24, c - 0.1, 1.3, 0.65, 1.0, 0xf8f4ec);
      B(c, 0.89, c - 0.1, 0.9, 0.6, 0.9, 0x96c7c1, 0, "dome");
      for (let k = 0; k < 6; k++) B(c - 0.55 + k * 0.22, 0.24, c + 0.5, 0.08, 0.6, 0.08, 0xffffff, 0, "cyl");
      B(c, 0.84, c + 0.5, 1.3, 0.08, 0.2, 0xf8f4ec);
      B(c, 0.09, c + 0.78, 1.2, 0.08, 0.2, 0xe9ecef);
      break;
    }
    case "funfair": {
      // Ferris wheel and carousel turn (see landmarks); tents and a little roller coaster here.
      const tents = [0xff6b6b, 0xffd43b, 0x4dabf7, 0xda77f2];
      [[c - 0.55, c + 0.55], [c - 0.2, c + 0.7], [c + 0.65, c - 0.6]].forEach(([tx, tz], k) => {
        B(tx, 0.09, tz, 0.3, 0.2, 0.3, 0xffffff, 0, "cyl");
        B(tx, 0.29, tz, 0.36, 0.3, 0.36, tents[k % tents.length], 0, "cone");
      });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI;
        B(c + 0.55 + Math.cos(a) * 0.35, 0.09, c + 0.55, 0.05, 0.3 + Math.sin(a) * 0.6, 0.05, 0xe03131);
      }
      B(c + 0.55, 0.39, c + 0.55, 1, 1, 1, 0xe03131, 0, "arch");
      break;
    }
    case "market": {
      const roofs = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xf783ac, 0xff922b];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const sx = c - 0.6 + i * 0.6;
          const sz = c - 0.6 + j * 0.6;
          B(sx, 0.09, sz, 0.36, 0.22, 0.36, 0xf1e3c8);
          B(sx, 0.31, sz, 0.48 / Math.SQRT2, 0.2, 0.48 / Math.SQRT2, roofs[(i * 3 + j + Math.floor(r[0] * 6)) % roofs.length], 0, "roof");
        }
      }
      break;
    }
    case "arena": {
      B(c, 0.09, c, 1.92, 0.62, 1.62, 0xdfe3e8, 0, "disc");
      B(c, 0.09, c, 1.6, 0.66, 1.3, 0xadb5bd, 0, "disc");
      B(c, 0.09, c, 1.35, 0.67, 1.05, 0xd9734e, 0, "disc");
      B(c, 0.09, c, 1.05, 0.68, 0.75, 0x69c06a, 0, "disc");
      B(c, 0.775, c, 0.02, 0.005, 0.6, 0xffffff, 0, "paint");
      for (const [lx, lz] of [[-0.85, -0.7], [0.85, -0.7], [-0.85, 0.7], [0.85, 0.7]]) {
        B(c + lx, 0.09, c + lz, 0.04, 1.3, 0.04, 0x868e96);
        B(c + lx, 1.39, c + lz, 0.2, 0.1, 0.06, 0xfff3bf);
      }
      break;
    }
    case "campus": {
      const brick = 0xb5523b;
      B(c, 0.09, c - 0.6, 1.4, 0.75, 0.4, brick);
      B(c, 0.09, c - 0.6, 1.41, 0.08, 0.41, 0xf1e3c8, 0, "glass");
      B(c - 0.68, 0.09, c + 0.1, 0.36, 0.55, 0.9, brick);
      B(c + 0.68, 0.09, c + 0.1, 0.36, 0.55, 0.9, brick);
      B(c, 0.09, c - 0.3, 0.2, 1.5, 0.2, 0xd9c7a7);
      B(c, 1.59, c - 0.3, 0.2 / Math.SQRT2 + 0.05, 0.25, 0.2 / Math.SQRT2 + 0.05, 0x2f9e44, 0, "roof");
      B(c, 0.09, c + 0.3, 0.12, 0.01, 0.9, 0xe9dcc3, 0, "ground");
      tree(c - 0.3, c + 0.45, 0.6, r[0]);
      tree(c + 0.3, c + 0.6, 0.55, r[1]);
      break;
    }
    case "hotel": {
      const color = pick(pal.towers, r[3]);
      B(c, 0.09, c - 0.1, 1.6, 0.4, 1.1, 0xf1f3f5);
      B(c - 0.2, 0.49, c - 0.25, 0.95, 3.7, 0.55, color);
      for (let y = 0.4; y < 3.6; y += 0.4) B(c - 0.2, 0.49 + y, c - 0.25, 0.962, 0.06, 0.562, 0x4c6e91, 0, "glass");
      B(c - 0.2, 4.19, c - 0.25, 0.7, 0.2, 0.4, 0xffd43b);
      B(c + 0.5, 0.49, c + 0.2, 0.45, 0.02, 0.5, 0x4dabf7, 0, "water");
      for (let k = 0; k < 3; k++) B(c + 0.25, 0.49, c + 0.05 + k * 0.15, 0.08, 0.02, 0.05, 0xffffff);
      tree(c + 0.75, c + 0.75, 0.6, r[2]);
      break;
    }
    case "airport": {
      // Runway with markings, a terminal, a control tower, a hangar and a parked plane.
      B(c, 0.09, c + 0.35, 1.94, 0.012, 0.5, 0x4b5563, 0, "ground");
      for (let k = -3; k <= 3; k++) B(c + k * 0.25, 0.103, c + 0.35, 0.12, 0.004, 0.03, 0xffffff, 0, "paint");
      B(c - 0.9, 0.103, c + 0.35, 0.04, 0.004, 0.3, 0xffffff, 0, "paint");
      B(c + 0.9, 0.103, c + 0.35, 0.04, 0.004, 0.3, 0xffffff, 0, "paint");
      B(c - 0.15, 0.09, c - 0.5, 1.0, 0.32, 0.42, 0xe9ecef);
      B(c - 0.15, 0.19, c - 0.5, 1.01, 0.1, 0.43, 0x74c0fc, 0, "glass");
      B(c + 0.7, 0.09, c - 0.55, 0.12, 1.25, 0.12, 0xdee2e6, 0, "cyl");
      B(c + 0.7, 1.34, c - 0.55, 0.3, 0.16, 0.3, 0x4dabf7, 0, "cyl");
      B(c + 0.7, 1.5, c - 0.55, 0.32, 0.04, 0.32, 0x495057, 0, "cyl");
      B(c - 0.75, 0.09, c - 0.05, 0.42, 0.28, 0.3, 0xadb5bd, 0, "dome");
      // Parked plane
      B(c + 0.3, 0.13, c - 0.05, 0.5, 0.09, 0.09, 0xffffff);
      B(c + 0.3, 0.15, c - 0.05, 0.13, 0.02, 0.5, 0xffffff);
      B(c + 0.08, 0.19, c - 0.05, 0.08, 0.13, 0.02, 0xe5484d);
      break;
    }
    case "port": {
      // A harbour basin with a ship, container stacks and a big gantry crane.
      B(c, 0.0, c + 0.45, 1.98, 0.08, 1.05, 0x5b9bd5, 0, "water");
      B(c, 0.09, c - 0.55, 1.98, 0.04, 0.85, 0xced4da, 0, "ground");
      const boxes = [0xe5484d, 0x228be6, 0xfab005, 0x2f9e44, 0xf76707, 0x7048e8];
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 2; j++)
          for (let h = 0; h <= (i + j) % 3; h++) B(c - 0.75 + i * 0.25, 0.13 + h * 0.11, c - 0.75 + j * 0.16, 0.22, 0.1, 0.13, boxes[(i * 2 + j + h) % boxes.length]);
      B(c + 0.45, 0.13, c - 0.3, 0.06, 1.3, 0.06, 0xe03131);
      B(c + 0.75, 0.13, c - 0.3, 0.06, 1.3, 0.06, 0xe03131);
      B(c + 0.6, 1.43, c + 0.05, 0.4, 0.08, 1.0, 0xe03131);
      // The ship
      B(c - 0.1, 0.0, c + 0.5, 1.2, 0.22, 0.36, 0x343a40);
      B(c - 0.1, 0.22, c + 0.5, 1.15, 0.04, 0.34, 0xc92a2a);
      B(c - 0.55, 0.26, c + 0.5, 0.22, 0.3, 0.28, 0xffffff);
      for (let k = 0; k < 3; k++) B(c - 0.2 + k * 0.25, 0.26, c + 0.5, 0.2, 0.12, 0.26, boxes[k + 2]);
      break;
    }
    case "military": {
      // A fenced camp: barracks, tents, a watchtower, a flag, and a tank.
      for (const [fx, fz, w, d] of [[c, c - 0.95, 1.9, 0.03], [c, c + 0.95, 1.9, 0.03], [c - 0.95, c, 0.03, 1.9], [c + 0.95, c, 0.03, 1.9]]) {
        B(fx, 0.09, fz, w, 0.12, d, 0x868e96);
      }
      B(c - 0.45, 0.09, c - 0.5, 0.7, 0.3, 0.32, 0x6b7a4b);
      B(c - 0.45, 0.39, c - 0.5, 0.72 / Math.SQRT2, 0.14, 0.34 / Math.SQRT2, 0x55603b, 0, "roof");
      for (const [tx, tz] of [[c + 0.25, c - 0.55], [c + 0.6, c - 0.55], [c + 0.6, c - 0.15]]) {
        B(tx, 0.09, tz, 0.3 / Math.SQRT2, 0.26, 0.3 / Math.SQRT2, 0x5c6b3a, 0, "roof");
      }
      for (const [lx, lz] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) B(c - 0.75 + lx, 0.09, c + 0.7 + lz, 0.025, 0.85, 0.025, 0x495057);
      B(c - 0.75, 0.94, c + 0.7, 0.26, 0.16, 0.26, 0x6b7a4b);
      B(c, 0.09, c + 0.1, 0.02, 1.0, 0.02, 0xdee2e6);
      B(c + 0.13, 0.95, c + 0.1, 0.24, 0.13, 0.01, 0x2f9e44, 0, "paint");
      // Tank
      B(c + 0.4, 0.09, c + 0.55, 0.42, 0.12, 0.26, 0x55603b);
      B(c + 0.4, 0.21, c + 0.55, 0.22, 0.09, 0.18, 0x6b7a4b);
      B(c + 0.15, 0.25, c + 0.55, 0.3, 0.03, 0.03, 0x343a40);
      break;
    }
    case "power":
    case "dam":
    case "oilrig":
      industryParts(st.type, B);
      break;
    case "solar": {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
          B(c - 0.66 + i * 0.44, 0.16, c - 0.55 + j * 0.5, 0.38, 0.02, 0.3, 0x1c3f6e, 0, "glass", 0);
          B(c - 0.66 + i * 0.44, 0.09, c - 0.55 + j * 0.5, 0.03, 0.08, 0.03, 0x868e96);
        }
      }
      B(c + 0.7, 0.09, c + 0.75, 0.3, 0.25, 0.25, 0xf1f3f5);
      break;
    }
  }
}

/**
 * An ad's picture, letterboxed onto a 2:1 canvas (the billboard's shape): the whole picture
 * shows, and any space round it is filled with a soft blur of the picture itself.
 */
function adTexture(img: CanvasImageSource & { width: number; height: number }) {
  const W = 1024;
  const H = 512;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d")!;
  const iw = img.width || W;
  const ih = img.height || H;
  // The blur: shrink the picture to a few pixels, then stretch it back up.
  const tiny = document.createElement("canvas");
  tiny.width = 16;
  tiny.height = 8;
  tiny.getContext("2d")!.drawImage(img, 0, 0, 16, 8);
  c.imageSmoothingEnabled = true;
  c.drawImage(tiny, 0, 0, W, H);
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.fillRect(0, 0, W, H);
  const k = Math.min(W / iw, H / ih);
  const dw = iw * k;
  const dh = ih * k;
  c.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A player's face as a round sprite texture (drawn from the same SVG as the rest of the app). */
const faceCache = new Map<string, THREE.CanvasTexture>();
function faceTexture(avatar: Avatar, ring: string) {
  const key = JSON.stringify(avatar) + ring;
  const cached = faceCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const svg = renderToStaticMarkup(<AvatarFace avatar={avatar} size={128} ring={ring} />);
  const img = new Image();
  img.onload = () => {
    canvas.getContext("2d")!.drawImage(img, 0, 0, 128, 128);
    tex.needsUpdate = true;
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  faceCache.set(key, tex);
  return tex;
}

function labelTexture(text: string, bg: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const c = canvas.getContext("2d")!;
  c.fillStyle = bg;
  c.beginPath();
  c.arc(64, 64, 56, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#ffffff";
  c.font = "800 72px system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A cartoon "BOOM!" in a spiky yellow burst. */
function boomTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const c = canvas.getContext("2d")!;
  c.beginPath();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const r = k % 2 ? 0.62 : 1;
    const x = 128 + Math.cos(a) * 124 * r;
    const y = 64 + Math.sin(a) * 62 * r;
    if (k) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
  c.fillStyle = "#ffd43b";
  c.fill();
  c.lineWidth = 6;
  c.strokeStyle = "#e8590c";
  c.stroke();
  c.font = "900 52px system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineWidth = 8;
  c.strokeStyle = "#ffffff";
  c.strokeText("BOOM!", 128, 68);
  c.fillStyle = "#e03131";
  c.fillText("BOOM!", 128, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const hashish = (v: number, k: number) => {
  const s = Math.sin(v * 9301 + k * 49297) * 233280;
  return s - Math.floor(s);
};

const easeOutBack = (t: number) => {
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// ---------------------------------------------------------------- component
export function CityView({
  seed,
  tileCount,
  markers,
  events,
  interactive,
  onTile,
  onBillboard,
  onHover,
  meAvatar,
  coinBalloon,
  onBalloon,
  progress,
  nightFirst,
  ads,
  onAdViews,
  revealed = true,
  mode = "game",
  roomCounts,
  onRoom,
  ride = null,
  onBalloons,
  caughtFaces,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    build: (seed: number, count: number) => void;
    setMarkers: (m: CityMarkers) => void;
    playEvents: (e: CityEvent[]) => void;
    setBalloon: (slot: number | null) => void;
    setAds: (ads: CityAd[]) => void;
    setRevealed: (on: boolean) => void;
    setMode: (m: "game" | "chat") => void;
    setRoomCounts: (counts: Record<string, number>) => void;
    setRide: (k: number | null) => void;
    setCaughtFaces: (list: CaughtFace[] | undefined) => void;
  } | null>(null);
  const cb = useRef({ onTile, onHover, onBillboard, onBalloon, onAdViews, interactive, onRoom, onBalloons, mode });
  const atmos = useRef({ progress, nightFirst, meAvatar });
  useEffect(() => {
    cb.current = { onTile, onHover, onBillboard, onBalloon, onAdViews, interactive, onRoom, onBalloons, mode };
    atmos.current = { progress, nightFirst, meAvatar };
  });

  // Set up the scene once.
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    // Phones have very dense screens; 1.5× looks just as sharp and draws much faster.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.5 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 40, 110);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.2;
    controls.minDistance = 6;
    controls.maxDistance = 90;
    controls.screenSpacePanning = false;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

    const hemi = new THREE.HemisphereLight(0xeef7ff, 0xc9d3c0, 1.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    // The flat ground the city stands on (a circle; the countryside starts round its edge).
    const base = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: GROUND }));
    base.receiveShadow = true;
    base.position.y = -0.01;
    scene.add(base);

    const geo = geometries();
    const mat = (opts: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, ...opts });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const meshDefs: Record<string, { geometry: THREE.BufferGeometry; material: THREE.Material; shadow: boolean }> = {
      ground: { geometry: geo.box, material: mat(), shadow: false },
      paint: { geometry: geo.box, material: mat(), shadow: false },
      building: { geometry: geo.box, material: mat(), shadow: true },
      glass: { geometry: geo.box, material: mat({ emissive: 0x0b1a2a, emissiveIntensity: 0.2 }), shadow: false },
      roof: { geometry: geo.roof, material: mat({ flatShading: true }), shadow: true },
      crown: { geometry: geo.crown, material: mat({ flatShading: true }), shadow: true },
      trunk: { geometry: geo.trunk, material: mat(), shadow: true },
      disc: { geometry: geo.disc, material: mat(), shadow: false },
      arch: { geometry: geo.arch, material: mat(), shadow: true },
      cyl: { geometry: geo.cyl, material: mat(), shadow: true },
      cone: { geometry: geo.cone, material: mat({ flatShading: true }), shadow: true },
      dome: { geometry: geo.dome, material: mat(), shadow: true },
      curve: { geometry: geo.curve, material: mat(), shadow: false },
      curveLine: { geometry: geo.curveLine, material: mat(), shadow: false },
      // Street-lamp heads: plain colour that we brighten as night falls.
      lamp: { geometry: geo.lamp, material: lampMat, shadow: false },
      // Traffic-light bulbs (red, amber, green), lit in turn.
      signal: { geometry: geo.lamp, material: new THREE.MeshBasicMaterial({ color: 0xffffff }), shadow: false },
      // Blinking lamps: hazard lights, police lights, road-works lamps (see updateFlashers).
      flash: { geometry: geo.lamp, material: new THREE.MeshBasicMaterial({ color: 0xffffff }), shadow: false },
      water: { geometry: geo.box, material: new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 90, specular: 0xffffff }), shadow: false },
      cooling: { geometry: geo.cooling, material: mat({ side: THREE.DoubleSide }), shadow: true },
    };

    const city = new THREE.Group();
    scene.add(city);
    const moving = new THREE.Group();
    scene.add(moving);
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);
    const fxGroup = new THREE.Group();
    scene.add(fxGroup);
    // Street life (traffic, people, trains, billboards, moving landmarks): hidden while the map
    // is still a secret building site.
    const life = new THREE.Group();
    scene.add(life);
    const world = makeWorld();

    let meshes: Record<string, THREE.InstancedMesh> = {};
    let parts: Record<string, Part[]> = {};
    let tiles: Tile[] = [];
    let kindAt = new Map<string, Tile["kind"]>();
    let tileIndex = new Map<string, number>();
    let currentPlan: CityPlan | null = null;
    let currentSeed = -1;
    let born = new Map<number, number>(); // tile → time it started rising
    let growing: number[] = [];
    // Traffic lights: which direction and bulb each lit instance is, and the last phase shown.
    let signalTags: number[] = [];
    let signalPhase = -1;
    let tileParts = new Map<number, [string, number][]>();
    let radius = 10;
    /** The tallest thing in the city (balloon rides float above it). */
    let tallest = 0;
    let framed = false;
    let focus: THREE.Vector3 | null = null;
    let lastMe: number | null = null;

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const color = new THREE.Color();

    const tiltQ = new THREE.Quaternion();
    const tq = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);
    function writePart(mesh: THREE.InstancedMesh, idx: number, p: Part, g: number) {
      const gx = Math.min(1, g * 1.15);
      v.set(p.x, p.y * g, p.z);
      s.set(p.sx * gx, Math.max(0.0001, p.sy * g), p.sz * gx);
      q.setFromAxisAngle(up, p.ry);
      if (p.tilt) q.multiply(tiltQ.setFromAxisAngle(zAxis, p.tilt));
      m4.compose(v, q, s);
      mesh.setMatrixAt(idx, m4);
    }

    // ---- cars: each one drives the street network, turning at junctions and bends. Road works
    // close a street (cars turn back before them), and now and then a street jams up: cars
    // queue bumper to bumper with their brake lights glowing, then the queue clears.
    // Vehicle kinds: 0 car, 1 taxi, 2 delivery van, 3 bus, 4 truck, 5 articulated lorry.
    type Car = {
      kind: number;
      /** Length, for queuing in jams. */
      len: number;
      from: [number, number];
      to: [number, number];
      /** Where the stretch before this one started (an articulated trailer follows that way). */
      prev: [number, number];
      t: number;
      speed: number;
      /** Bridges under the start and end of this stretch (for the hump). */
      bridgeFrom: boolean;
      bridgeTo: boolean;
      /** The jam this car is queuing in (-1 none), its place, and where along the street it stops. */
      jam: number;
      slot: number;
      target: number;
      /** Seconds to wait before moving off (a queue clears one car at a time; buses at stops). */
      hold: number;
      /** A bus has already pulled in at a stop on this stretch. */
      stopped: boolean;
      /** Brake lights drawn on (1) or off (0), or -1 (not drawn yet). */
      lit: number;
    };
    const VEH_LEN = [0.3, 0.3, 0.34, 0.62, 0.52, 0.9];
    const VEH_SPEED = [1, 1.05, 0.9, 0.7, 0.75, 0.65];
    let cars: Car[] = [];
    let carBody: THREE.InstancedMesh | null = null;
    let carTop: THREE.InstancedMesh | null = null;
    let carLights: THREE.InstancedMesh | null = null;
    /** Truck boxes, lorry trailers, bus roofs. */
    let carExtra: THREE.InstancedMesh | null = null;
    /** Bus windows and taxi signs: they light up at night. */
    let carGlow: THREE.InstancedMesh | null = null;
    const carLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const carGlowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    let carNight = 0;
    let carNightDrawn = -1;
    let blocked = new Set<string>();
    const roadAt = (x: number, z: number) => {
      const key = `${x},${z}`;
      const k = kindAt.get(key);
      return (k === "road" || k === "bridge") && !blocked.has(key);
    };
    const tileXY = (x: number, z: number) => {
      const i = tileIndex.get(`${x},${z}`);
      return i === undefined ? undefined : tiles[i];
    };

    type Jam = { stop: number; tail: number; count: number; active: boolean; period: number; on: number; offset: number };
    let jams: Jam[] = [];
    /** Directed street stretches that belong to a jam: which jam, and how far along it (−1 = the way in). */
    const jamSeg = new Map<number, { jam: number; i: number }>();
    const segKey = (x: number, z: number, dx: number, dz: number) => ((x + 1024) * 2048 + (z + 1024)) * 4 + (dx === 1 ? 0 : dx === -1 ? 1 : dz === 1 ? 2 : 3);
    const QUEUE_GAP = 0.36;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    const jamFull = (jam: Jam) => jam.tail - QUEUE_GAP < -0.85;

    function nextStop(c: Car): [number, number] {
      const [x, z] = c.to;
      const dx = Math.sign(c.to[0] - c.from[0]);
      const dz = Math.sign(c.to[1] - c.from[1]);
      const options = DIRS.filter(([ox, oz]) => {
        if ((ox === -dx && oz === -dz) || !roadAt(x + ox, z + oz)) return false;
        // Don't join a jam that's already backed right up.
        const info = jamSeg.get(segKey(x, z, ox, oz));
        return !(info && info.i === -1 && jams[info.jam].active && jamFull(jams[info.jam]));
      }).map(([ox, oz]) => [x + ox, z + oz] as [number, number]);
      if (!options.length) return c.from; // dead end (or road works): turn round
      const ahead = options.find(([nx, nz]) => nx - x === dx && nz - z === dz);
      if (ahead && Math.random() < 0.6) return ahead;
      return options[Math.floor(Math.random() * options.length)];
    }
    const isBridge = (x: number, z: number) => kindAt.get(`${x},${z}`) === "bridge";

    /** What sort of area a road is in: near docks and industry, downtown, or the suburbs. */
    const INDUSTRY = ["port", "airport", "military", "power", "oilrig", "dam", "market", "solar"];
    function zoneOf(t: Tile) {
      let industry = 0;
      let town = 0;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const n = tileXY(t.x + dx, t.z + dz);
          if (!n) continue;
          if (n.kind === "tower" || n.kind === "office") town++;
          if (n.kind === "crane" || n.kind === "fuel" || (n.structure && INDUSTRY.includes(n.structure.type))) industry++;
        }
      }
      return industry >= 2 ? 2 : town >= 5 ? 1 : 0;
    }
    // Chances of each kind (car, taxi, van, bus, truck, lorry) in the suburbs, downtown, near industry.
    const MIX = [
      [0.7, 0.06, 0.12, 0.05, 0.05, 0.02],
      [0.5, 0.24, 0.1, 0.13, 0.02, 0.01],
      [0.28, 0.02, 0.2, 0.02, 0.28, 0.2],
    ];
    function pickKind(t: Tile) {
      const mix = MIX[zoneOf(t)];
      let r = Math.random();
      for (let k = 0; k < mix.length; k++) if ((r -= mix[k]) < 0) return k;
      return 0;
    }

    function buildCars(plan: CityPlan) {
      for (const m of [carBody, carTop, carLights, carExtra, carGlow]) {
        if (!m) continue;
        life.remove(m);
        m.dispose();
      }
      const roads = tiles.filter((t) => (t.kind === "road" || t.kind === "bridge") && !t.works);
      cars = [];
      const n = Math.min(160, Math.floor(roads.length / 4));
      for (let k = 0; k < n; k++) {
        const t = roads[Math.floor(Math.random() * roads.length)];
        const options = DIRS.filter(([ox, oz]) => roadAt(t.x + ox, t.z + oz));
        if (!options.length) continue;
        const [ox, oz] = options[Math.floor(Math.random() * options.length)];
        const kind = pickKind(t);
        cars.push({
          kind,
          len: VEH_LEN[kind],
          from: [t.x, t.z],
          to: [t.x + ox, t.z + oz],
          prev: [t.x - ox, t.z - oz],
          t: Math.random(),
          speed: (0.8 + Math.random() * 0.9) * VEH_SPEED[kind],
          bridgeFrom: t.kind === "bridge",
          bridgeTo: isBridge(t.x + ox, t.z + oz),
          jam: -1,
          slot: -1,
          target: 0,
          hold: 0,
          stopped: false,
          lit: -1,
        });
      }
      const N = Math.max(1, cars.length);
      carBody = new THREE.InstancedMesh(geo.box, mat(), N);
      carTop = new THREE.InstancedMesh(geo.box, mat({ color: 0xffffff }), N);
      carExtra = new THREE.InstancedMesh(geo.box, mat(), N);
      carGlow = new THREE.InstancedMesh(geo.box, carGlowMat, N);
      // Two little lamps per car: headlights in front (on at night), brake lights behind.
      carLights = new THREE.InstancedMesh(geo.box, carLightMat, N * 2);
      carBody.castShadow = true;
      carExtra.castShadow = true;
      const pal = plan.palette.car;
      const pickC = (list: number[], k: number) => list[k % list.length];
      cars.forEach((c, k) => {
        const body =
          c.kind === 0 ? pickC(pal, k) : c.kind === 1 ? 0xffd43b : c.kind === 2 ? pickC([0xffffff, 0xdee2e6, 0x1971c2, 0xe03131, 0xf08c00], k) : c.kind === 3 ? pickC([0xe03131, 0x1971c2, 0x2f9e44], plan.seed) : c.kind === 4 ? pickC([0xe03131, 0x1971c2, 0xf08c00, 0xffffff], k) : pickC([0x343a40, 0x1971c2, 0xe03131, 0xf1f3f5], k);
        carBody!.setColorAt(k, color.setHex(body));
        carTop!.setColorAt(k, color.setHex(c.kind <= 1 ? 0xe9f2fb : 0xbcd4e6));
        carExtra!.setColorAt(k, color.setHex(c.kind === 3 ? 0xf1f3f5 : c.kind === 4 ? pickC([0xf1f3f5, 0xffd43b, 0xdee2e6, 0x69db7c], k) : pickC([0xe5484d, 0x228be6, 0xfab005, 0x2f9e44, 0xf1f3f5], k)));
        carGlow!.setColorAt(k, color.setHex(0x2b3a4f));
      });
      carBody.count = carTop.count = carExtra.count = carGlow.count = cars.length;
      carLights.count = cars.length * 2;
      for (let k = 0; k < cars.length * 2; k++) carLights.setColorAt(k, color.setHex(0x6b1d1d));
      for (const m of [carBody, carTop, carLights, carExtra, carGlow]) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
      }
      carNightDrawn = -1;
      life.add(carBody, carTop, carLights, carExtra, carGlow);
    }

    /** Pick a few streets that jam up now and then: the last few stretches before a junction. */
    function buildJams(seedV: number) {
      jams = [];
      jamSeg.clear();
      const roadCount = tiles.reduce((n, t) => n + (t.kind === "road" ? 1 : 0), 0);
      const want = Math.min(3, Math.floor(roadCount / 80));
      if (!want) return;
      const cands: { h: Tile; dx: number; dz: number; score: number }[] = [];
      for (const t of tiles) {
        const m = t.mask ?? 0;
        const arms = (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
        if (t.kind !== "road" || arms < 3) continue;
        DIRS.forEach(([dx, dz], d) => cands.push({ h: t, dx, dz, score: hash(t.x * 4 + d, t.z, seedV + 1401) }));
      }
      cands.sort((a, b) => a.score - b.score);
      for (const c of cands) {
        if (jams.length >= want) break;
        // Walk back from the junction along a straight street (2 to 4 stretches).
        let K = 0;
        for (let k = 1; k <= 4; k++) {
          const t = tileXY(c.h.x - c.dx * k, c.h.z - c.dz * k);
          if (!t || t.kind !== "road" || t.works || t.mask !== (c.dx !== 0 ? 10 : 5)) break;
          K = k;
        }
        if (K < 2) continue;
        const keys: number[] = [];
        for (let i = -1; i < K; i++) keys.push(segKey(c.h.x - c.dx * (K - i), c.h.z - c.dz * (K - i), c.dx, c.dz));
        if (keys.some((k) => jamSeg.has(k))) continue;
        const j = jams.length;
        keys.forEach((k, n) => jamSeg.set(k, { jam: j, i: n - 1 }));
        const r = (n: number) => hash(c.h.x, c.h.z, seedV + 1410 + n);
        const period = 45 + r(1) * 40;
        jams.push({ stop: K - 0.68, tail: 0, count: 0, active: false, period, on: 12 + r(2) * 10, offset: r(3) * period });
      }
    }

    // A car's place in the queue: one car-length behind the last. (A car already past that
    // point simply stops where it is.)
    function joinQueue(c: Car, j: number) {
      const jam = jams[j];
      const target = jam.tail - QUEUE_GAP - Math.max(0, c.len - 0.3);
      c.jam = j;
      c.slot = jam.count++;
      c.target = target;
      jam.tail = target;
    }

    const carP = (c: Car, i: number) => i + c.t;
    function updateJams(time: number) {
      for (let j = 0; j < jams.length; j++) {
        const jam = jams[j];
        const on = (time + jam.offset) % jam.period < jam.on;
        if (on === jam.active) continue;
        jam.active = on;
        jam.tail = jam.stop + QUEUE_GAP;
        jam.count = 0;
        if (on) {
          // Cars already on the street queue up in the order they're in.
          const queued: { c: Car; p: number }[] = [];
          for (const c of cars) {
            const info = jamSeg.get(segKey(c.from[0], c.from[1], c.to[0] - c.from[0], c.to[1] - c.from[1]));
            if (info && info.jam === j && carP(c, info.i) <= jam.stop) queued.push({ c, p: carP(c, info.i) });
          }
          queued.sort((a, b) => b.p - a.p);
          for (const { c } of queued) if (!jamFull(jam)) joinQueue(c, j);
        } else {
          // The jam clears: the front car moves off first, the others one after another.
          for (const c of cars) {
            if (c.jam !== j) continue;
            c.hold = 0.3 + c.slot * 0.3;
            c.jam = -1;
            c.slot = -1;
          }
        }
      }
    }

    const BRAKE_ON = new THREE.Color(0xff2a2a);
    const BRAKE_OFF = new THREE.Color(0x5a1a1a);
    const BRAKE_NIGHT = new THREE.Color(0xb8222b);
    const HEAD_DAY = new THREE.Color(0x9aa3ad);
    const HEAD_NIGHT = new THREE.Color(0xfff2c4);
    const BUS_DAY = new THREE.Color(0x2b3a4f);
    const BUS_NIGHT = new THREE.Color(0xffd98a);
    const TAXI_DAY = new THREE.Color(0xc9b458);
    const TAXI_NIGHT = new THREE.Color(0xfff3bf);
    const HIDDEN = new THREE.Vector3(0.0001, 0.0001, 0.0001);
    // A point some way back along a vehicle's path (for lorry trailers), in its lane.
    const trail = { x: 0, z: 0 };
    function pathPoint(c: Car, back: number) {
      let t = c.t - back;
      let a = c.from;
      let b = c.to;
      if (t < 0) {
        t = Math.max(0, t + 1);
        a = c.prev;
        b = c.from;
      }
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      trail.x = a[0] + dx * t - dz * 0.14;
      trail.z = a[1] + dz * t + dx * 0.14;
    }
    // One box of a vehicle: `a` along it from its centre, `lift` up, of the given size.
    const fwd = { x: 0, z: 0 };
    function box(mesh: THREE.InstancedMesh, k: number, x: number, y: number, z: number, a: number, lift: number, len: number, h: number, w: number) {
      m4.compose(v.set(x + fwd.x * a, y + lift, z + fwd.z * a), q, s.set(len, h, w));
      mesh.setMatrixAt(k, m4);
    }
    function hide(mesh: THREE.InstancedMesh, k: number) {
      m4.compose(v.set(0, -5, 0), q, HIDDEN);
      mesh.setMatrixAt(k, m4);
    }
    function updateCars(dt: number, time: number) {
      if (!carBody || !carTop || !carLights || !carExtra || !carGlow) return;
      updateJams(time);
      let colorsDirty = false;
      const nightChanged = Math.abs(carNight - carNightDrawn) > 0.03;
      if (nightChanged) {
        carNightDrawn = carNight;
        color.copy(HEAD_DAY).lerp(HEAD_NIGHT, carNight);
        for (let k = 0; k < cars.length; k++) {
          carLights.setColorAt(k * 2, color);
          cars[k].lit = -1;
        }
        for (let k = 0; k < cars.length; k++) {
          const kind = cars[k].kind;
          if (kind === 3) carGlow.setColorAt(k, color.copy(BUS_DAY).lerp(BUS_NIGHT, carNight));
          else if (kind === 1) carGlow.setColorAt(k, color.copy(TAXI_DAY).lerp(TAXI_NIGHT, carNight));
        }
        if (carGlow.instanceColor) carGlow.instanceColor.needsUpdate = true;
        colorsDirty = true;
      }
      for (let k = 0; k < cars.length; k++) {
        const c = cars[k];
        let dx = c.to[0] - c.from[0];
        let dz = c.to[1] - c.from[1];
        let move = c.speed * dt;
        let braking = false;
        if (c.hold > 0) {
          c.hold -= dt;
          move = 0;
          braking = true;
        } else if (jams.length) {
          const info = jamSeg.get(segKey(c.from[0], c.from[1], dx, dz));
          const jam = info ? jams[info.jam] : null;
          if (info && jam?.active) {
            const p = carP(c, info.i);
            if (c.jam !== info.jam && p <= jam.stop && !jamFull(jam)) joinQueue(c, info.jam);
            if (c.jam === info.jam) {
              const room = c.target - p;
              move = Math.max(0, Math.min(move * Math.min(1, Math.max(0.12, room / 0.5)), room));
              braking = room < 0.5;
            }
          }
        }
        // Buses pull in at a stop now and then, half way along a straight stretch.
        if (c.kind === 3 && !c.stopped && c.t < 0.5 && c.t + move >= 0.5 && c.jam < 0) {
          c.stopped = true;
          const here = tileXY(c.from[0], c.from[1]);
          if (here && (here.mask === 5 || here.mask === 10) && Math.random() < 0.4) {
            move = 0.5 - c.t;
            c.hold = 2 + Math.random() * 2;
          }
        }
        c.t += move;
        while (c.t >= 1) {
          c.t -= 1;
          const next = nextStop(c);
          c.prev = c.from;
          c.from = c.to;
          c.to = next;
          c.stopped = false;
          c.bridgeFrom = c.bridgeTo;
          c.bridgeTo = isBridge(next[0], next[1]);
          dx = c.to[0] - c.from[0];
          dz = c.to[1] - c.from[1];
        }
        // Keep to the right-hand lane.
        const x = c.from[0] + dx * c.t - dz * 0.14;
        const z = c.from[1] + dz * c.t + dx * 0.14;
        const onBridge = c.t < 0.5 ? c.bridgeFrom : c.bridgeTo;
        const off = Math.abs(c.t < 0.5 ? c.t : 1 - c.t);
        const y = onBridge ? 0.06 + (BRIDGE_TOP - 0.06) * Math.min(1, Math.max(0, (0.5 - off) / 0.3)) : 0.06;
        q.setFromAxisAngle(up, Math.atan2(-dz, dx));
        fwd.x = dx;
        fwd.z = dz;
        let front = 0.151;
        let rear = -0.151;
        let lampW = 0.11;
        switch (c.kind) {
          case 0:
          case 1:
            box(carBody, k, x, y, z, 0, 0, 0.3, 0.09, 0.15);
            box(carTop, k, x, y, z, -0.02, 0.09, 0.16, 0.06, 0.13);
            hide(carExtra, k);
            if (c.kind === 1) box(carGlow, k, x, y, z, -0.02, 0.15, 0.05, 0.025, 0.09);
            else hide(carGlow, k);
            break;
          case 2:
            box(carBody, k, x, y, z, -0.02, 0, 0.3, 0.15, 0.155);
            box(carTop, k, x, y, z, 0.125, 0.07, 0.05, 0.06, 0.15);
            hide(carExtra, k);
            hide(carGlow, k);
            front = 0.131;
            rear = -0.171;
            lampW = 0.12;
            break;
          case 3:
            box(carBody, k, x, y, z, 0, 0, 0.62, 0.15, 0.17);
            hide(carTop, k);
            box(carGlow, k, x, y, z, 0, 0.075, 0.6, 0.05, 0.176);
            box(carExtra, k, x, y, z, 0, 0.15, 0.58, 0.015, 0.15);
            front = 0.311;
            rear = -0.311;
            lampW = 0.13;
            break;
          case 4:
            box(carBody, k, x, y, z, 0.17, 0, 0.16, 0.15, 0.16);
            box(carTop, k, x, y, z, 0.24, 0.07, 0.03, 0.06, 0.15);
            box(carExtra, k, x, y, z, -0.09, 0.03, 0.34, 0.19, 0.17);
            hide(carGlow, k);
            front = 0.251;
            rear = -0.261;
            lampW = 0.13;
            break;
          default: {
            // Articulated lorry: the tractor here, its trailer following round corners.
            box(carBody, k, x, y, z, 0, 0, 0.18, 0.15, 0.16);
            box(carTop, k, x, y, z, 0.08, 0.07, 0.03, 0.06, 0.15);
            hide(carGlow, k);
            pathPoint(c, 0.1);
            const hx = trail.x;
            const hz = trail.z;
            pathPoint(c, 0.66);
            const tx = trail.x;
            const tz = trail.z;
            const yaw = Math.atan2(-(hz - tz), hx - tx || 0.0001);
            tq.setFromAxisAngle(up, yaw);
            m4.compose(v.set((hx + tx) / 2, y + 0.03, (hz + tz) / 2), tq, s.set(0.56, 0.19, 0.17));
            carExtra.setMatrixAt(k, m4);
            front = 0.091;
            lampW = 0.13;
            s.set(0.012, 0.03, lampW);
            m4.compose(v.set(tx - Math.cos(yaw) * 0.005, y + 0.06, tz + Math.sin(yaw) * 0.005), tq, s);
            carLights.setMatrixAt(k * 2 + 1, m4);
            rear = NaN;
          }
        }
        s.set(0.012, 0.026, lampW);
        m4.compose(v.set(x + dx * front, y + 0.05, z + dz * front), q, s);
        carLights.setMatrixAt(k * 2, m4);
        if (!Number.isNaN(rear)) {
          m4.compose(v.set(x + dx * rear, y + 0.05, z + dz * rear), q, s);
          carLights.setMatrixAt(k * 2 + 1, m4);
        }
        const lit = braking ? 1 : 0;
        if (lit !== c.lit) {
          c.lit = lit;
          carLights.setColorAt(k * 2 + 1, lit ? BRAKE_ON : color.copy(BRAKE_OFF).lerp(BRAKE_NIGHT, carNight));
          colorsDirty = true;
        }
      }
      for (const m of [carBody, carTop, carLights, carExtra, carGlow]) m.instanceMatrix.needsUpdate = true;
      if (colorsDirty && carLights.instanceColor) carLights.instanceColor.needsUpdate = true;
    }

    // ---- birds and clouds
    const birds = createBirds(world, moving);

    const clouds: THREE.Group[] = [];
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, flatShading: true });
    for (let k = 0; k < 6; k++) {
      const c = new THREE.Group();
      const puffs = 3 + (k % 3);
      for (let p = 0; p < puffs; p++) {
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cloudMat);
        ball.position.set(p * 1.1 - puffs * 0.5, Math.sin(p * 2) * 0.3, (p % 2) * 0.6);
        ball.scale.setScalar(0.5 + ((p * 37) % 5) * 0.1);
        c.add(ball);
      }
      c.userData = { speed: 0.25 + (k % 4) * 0.1, z: (k / 6 - 0.5), y: 0, x: ((k * 23) % 60) / 60 - 0.5 };
      clouds.push(c);
      moving.add(c);
    }

    function updateSky(time: number, dt: number) {
      birds.update(time, dt, camera, performance.now());
      // Clouds drift across, high above the city.
      const span = radius * 3 + 20;
      for (const c of clouds) {
        c.userData.x += (c.userData.speed * dt) / span;
        if (c.userData.x > 0.5) c.userData.x = -0.5;
        c.position.set(c.userData.x * span, radius * 0.9 + 9, c.userData.z * radius * 2.2);
      }
    }

    // ---- landmarks that move: Ferris wheels turn, wind turbines spin
    let landmarks: { obj: THREE.Object3D; spin: THREE.Object3D; tile: number; speed: number; axis?: "y" | "z" }[] = [];
    const lmMat = {
      white: new THREE.MeshLambertMaterial({ color: 0xf1f3f5 }),
      frame: new THREE.MeshLambertMaterial({ color: 0xe9ecef }),
      cabins: [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2, 0xff922b].map((c) => new THREE.MeshLambertMaterial({ color: c })),
    };
    const lmGeo = {
      rim: new THREE.TorusGeometry(0.62, 0.025, 6, 32),
      spoke: new THREE.BoxGeometry(0.02, 1.24, 0.02),
      cabin: new THREE.BoxGeometry(0.12, 0.12, 0.12),
      blade: new THREE.BoxGeometry(0.06, 0.9, 0.02).translate(0, 0.45, 0),
    };
    // ---- billboards: the city's ad space. Big panels on legs with a lit frame and two little
    // spotlights, glowing at night. Each one turns to a different ad every few seconds (or shows
    // "advertise here" when there are none). Tap one to see the ad, or to advertise.
    const boardTextures = [0, 1, 2, 3].map((d) => billboardTexture(d));
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x495057 });
    const boardGlowMat = new THREE.MeshBasicMaterial({ color: 0x5c636a });
    const boardBeamMat = new THREE.MeshBasicMaterial({
      color: 0xfff1c4,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    // Per design: panel width and height (about 2:1), panel centre height, where the legs go.
    const BOARD_SPEC = [
      { w: 1.5, h: 0.75, y: 1.75, poles: [-0.45, 0.45] },
      { w: 1.4, h: 0.7, y: 2.3, poles: [0] },
      { w: 1.7, h: 0.85, y: 1.5, poles: [-0.6, 0, 0.6] },
      { w: 1.24, h: 0.62, y: 1.4, poles: [-0.36, 0.36] },
    ];
    const AD_SECONDS = 12;
    const AD_FLIP = 0.32;
    type Board = {
      obj: THREE.Group;
      tile: number;
      id: string;
      design: number;
      panel: THREE.Mesh;
      mat: THREE.MeshLambertMaterial;
      beams: THREE.Mesh;
      /** Middle of the panel (world), and its width: for "is it on screen?". */
      centre: THREE.Vector3;
      w: number;
      /** Which turn of the rotation we're on, the ad it wants, and the ad actually showing. */
      slot: number;
      want: CityAd | null;
      shown: string | null;
      /** Seconds on screen during this turn, and whether this turn's view is counted. */
      seen: number;
      counted: boolean;
      flip: number;
      swapped: boolean;
    };
    let boards: Board[] = [];
    let boardHits: THREE.Mesh[] = [];
    function buildBillboard(t: Tile, index: number): Board {
      const b = t.billboard!;
      const spec = BOARD_SPEC[b.design] ?? BOARD_SPEC[0];
      const { w, h } = spec;
      const cy = spec.y + 0.08;
      const g = new THREE.Group();
      const lampY = cy + h / 2 + 0.08;
      const armZ = 0.3;
      const lampXs = [-w * 0.28, w * 0.28];
      // Legs, the backing board, a walkway on the tall one, and the lamp arms: one mesh.
      const solid: THREE.BufferGeometry[] = spec.poles.map((px) =>
        new THREE.CylinderGeometry(px === 0 ? 0.06 : 0.035, px === 0 ? 0.075 : 0.045, cy, 8).translate(px, cy / 2, 0),
      );
      solid.push(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.045).translate(0, cy, 0));
      if (b.design === 1) solid.push(new THREE.BoxGeometry(w, 0.025, 0.16).translate(0, cy - h / 2 - 0.06, 0.09));
      for (const lx of lampXs) solid.push(new THREE.BoxGeometry(0.022, 0.022, armZ).translate(lx, lampY, armZ / 2 + 0.02));
      const structure = new THREE.Mesh(mergeGeometries(solid), poleMat);
      structure.castShadow = true;
      // The lit frame and the lamp heads: one glowing mesh.
      const lit: THREE.BufferGeometry[] = [
        new THREE.BoxGeometry(w + 0.12, 0.04, 0.075).translate(0, cy + h / 2 + 0.04, 0),
        new THREE.BoxGeometry(w + 0.12, 0.04, 0.075).translate(0, cy - h / 2 - 0.04, 0),
        new THREE.BoxGeometry(0.04, h + 0.12, 0.075).translate(-w / 2 - 0.04, cy, 0),
        new THREE.BoxGeometry(0.04, h + 0.12, 0.075).translate(w / 2 + 0.04, cy, 0),
        ...lampXs.map((lx) => new THREE.BoxGeometry(0.09, 0.045, 0.07).translate(lx, lampY, armZ + 0.02)),
      ];
      const glow = new THREE.Mesh(mergeGeometries(lit), boardGlowMat);
      // Soft beams of light from the lamps down onto the panel (seen at night).
      const dy = lampY - cy;
      const dz = armZ - 0.01;
      const len = Math.hypot(dy, dz) + h * 0.35;
      const beamGeo = lampXs.map((lx) =>
        new THREE.ConeGeometry(w * 0.3, len, 14, 1, true)
          .translate(0, -len / 2, 0)
          .rotateX(Math.atan2(dz, dy))
          .translate(lx, lampY, armZ + 0.02),
      );
      const beams = new THREE.Mesh(mergeGeometries(beamGeo), boardBeamMat);
      beams.renderOrder = 5;
      beams.visible = false;
      for (const x of [...solid, ...lit, ...beamGeo]) x.dispose();
      // The picture, on both sides.
      const front = new THREE.PlaneGeometry(w, h).translate(0, 0, 0.027);
      const back = new THREE.PlaneGeometry(w, h).rotateY(Math.PI).translate(0, 0, -0.027);
      const house = boardTextures[b.design] ?? boardTextures[0];
      const mat = new THREE.MeshLambertMaterial({ map: house, emissive: 0xffffff, emissiveMap: house, emissiveIntensity: 0.28 });
      const panel = new THREE.Mesh(mergeGeometries([front, back]), mat);
      front.dispose();
      back.dispose();
      panel.position.y = cy;
      panel.userData = { billboard: b.id, tile: t.i, board: index };
      g.add(structure, glow, beams, panel);
      // Stand at the road edge of the tile, facing the road.
      const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][b.face];
      g.position.set(t.x + dir[0] * 0.28, 0, t.z + dir[1] * 0.28);
      g.rotation.y = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][b.face];
      return {
        obj: g,
        tile: t.i,
        id: b.id,
        design: b.design,
        panel,
        mat,
        beams,
        centre: new THREE.Vector3(g.position.x, cy, g.position.z),
        w,
        slot: -1,
        want: null,
        shown: null,
        seen: 0,
        counted: false,
        flip: 0,
        swapped: true,
      };
    }

    // The ads: loaded once each (by id), drawn letterboxed onto a 2:1 canvas.
    let adsList: CityAd[] = [];
    const adCache = new Map<string, { url: string; tex: THREE.CanvasTexture | null; failed: boolean }>();
    const adLoader = new THREE.TextureLoader();
    adLoader.setCrossOrigin("anonymous");
    let alive = true;
    function setAds(list: CityAd[]) {
      adsList = (list ?? []).filter((a) => a && a.id && a.image);
      const wanted = new Map(adsList.map((a) => [a.id, a.image]));
      for (const [id, entry] of adCache) {
        if (wanted.get(id) === entry.url) continue;
        entry.tex?.dispose();
        adCache.delete(id);
      }
      for (const ad of adsList) {
        if (adCache.has(ad.id)) continue;
        const entry: { url: string; tex: THREE.CanvasTexture | null; failed: boolean } = { url: ad.image, tex: null, failed: false };
        adCache.set(ad.id, entry);
        adLoader.load(
          ad.image,
          (loaded) => {
            if (alive && adCache.get(ad.id) === entry) {
              try {
                entry.tex = adTexture(loaded.image as CanvasImageSource & { width: number; height: number });
              } catch {
                entry.failed = true;
              }
            }
            loaded.dispose();
          },
          undefined,
          () => {
            entry.failed = true;
          },
        );
      }
      // Every board picks its ad again from the new list.
      for (const b of boards) b.slot = -1;
    }
    const adReady = (id: string) => !!adCache.get(id)?.tex;
    function pickAd(slot: number, k: number): CityAd | null {
      const n = adsList.length;
      for (let j = 0; j < n; j++) {
        const ad = adsList[(slot + k + j) % n];
        if (!adCache.get(ad.id)?.failed) return ad;
      }
      return null;
    }

    // Counting views: an ad counts once per turn on a board, if the board was on screen (and
    // not tiny) for 1.5 s while showing it. Sent up at most every 15 s.
    const MIN_AD_PX = 40;
    const frustum = new THREE.Frustum();
    const projScreen = new THREE.Matrix4();
    const boardSphere = new THREE.Sphere();
    let viewCounts: Record<string, number> = {};
    let viewsPending = false;
    let lastFlush = performance.now();
    let viewAcc = 0;
    function flushViews(now: number) {
      lastFlush = now;
      if (!viewsPending) return;
      const out = viewCounts;
      viewCounts = {};
      viewsPending = false;
      cb.current.onAdViews?.(out);
    }

    function updateBoards(dt: number, time: number, now: number) {
      for (let k = 0; k < boards.length; k++) {
        const b = boards[k];
        const grow = Math.min(1, Math.max(0, (now - (born.get(b.tile) ?? 0)) / 700));
        b.obj.scale.setScalar(Math.max(0.0001, grow));
        const slot = Math.floor((time + k * 4.7) / AD_SECONDS);
        if (slot !== b.slot) {
          b.slot = slot;
          b.want = pickAd(slot, k);
          b.seen = 0;
          b.counted = false;
        }
        const target = b.want && adReady(b.want.id) ? b.want.id : null;
        if (target !== b.shown) {
          // A quick flip to the next ad (the picture changes half way).
          b.shown = target;
          b.flip = AD_FLIP;
          b.swapped = false;
          b.seen = 0;
          b.counted = false;
        }
        if (b.flip > 0) {
          b.flip = Math.max(0, b.flip - dt);
          const f = 1 - b.flip / AD_FLIP;
          if (!b.swapped && f >= 0.5) {
            b.swapped = true;
            const tex = (b.shown && adCache.get(b.shown)?.tex) || boardTextures[b.design] || boardTextures[0];
            b.mat.map = tex;
            b.mat.emissiveMap = tex;
          }
          b.panel.scale.y = Math.max(0.04, Math.abs(Math.cos(f * Math.PI)));
        }
      }
      viewAcc += dt;
      if (viewAcc >= 0.2) {
        const step = viewAcc;
        viewAcc = 0;
        projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreen);
        const focal = (el.clientHeight || 1) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
        for (const b of boards) {
          if (!b.shown || b.counted) continue;
          boardSphere.center.copy(b.centre);
          boardSphere.radius = b.w / 2;
          const px = (b.w * focal) / Math.max(0.001, camera.position.distanceTo(b.centre));
          if (b.obj.scale.x >= 1 && b.flip === 0 && px >= MIN_AD_PX && frustum.intersectsSphere(boardSphere)) {
            b.seen += step;
            if (b.seen >= 1.5) {
              b.counted = true;
              viewCounts[b.shown] = (viewCounts[b.shown] ?? 0) + 1;
              viewsPending = true;
            }
          } else b.seen = 0;
        }
      }
      if (now - lastFlush >= 15000) flushViews(now);
    }

    function addFerris(px: number, pz: number, rotY: number, tile: number, scale: number) {
      const obj = new THREE.Group();
      const wheel = new THREE.Group();
      wheel.add(new THREE.Mesh(lmGeo.rim, lmMat.frame));
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Mesh(lmGeo.spoke, lmMat.frame);
        sp.rotation.z = (k * Math.PI) / 4;
        wheel.add(sp);
      }
      for (let k = 0; k < 8; k++) {
        const c = new THREE.Mesh(lmGeo.cabin, lmMat.cabins[k % lmMat.cabins.length]);
        const a = (k / 8) * Math.PI * 2;
        c.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
        c.castShadow = true;
        wheel.add(c);
      }
      wheel.position.y = 1.35;
      obj.add(wheel);
      if (scale !== 1) {
        // Legs for the bigger funfair wheel (the single-tile one has legs drawn with the tile).
        for (const o of [-0.2, 0.2]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 0.05), lmMat.frame);
          leg.position.set(o, 0.7, 0);
          obj.add(leg);
        }
      }
      obj.position.set(px, 0, pz);
      obj.rotation.y = rotY;
      obj.userData.scale = scale;
      landmarks.push({ obj, spin: wheel, tile, speed: 0.35 });
      life.add(obj);
    }

    function buildLandmarks() {
      // Boards keep showing what they showed (no flicker when the city grows).
      const wasShowing = new Map(boards.map((b) => [b.id, b.shown]));
      for (const l of landmarks) life.remove(l.obj);
      landmarks = [];
      for (const b of boards) {
        life.remove(b.obj);
        b.obj.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
        b.mat.dispose();
      }
      boards = [];
      boardHits = [];
      for (const t of tiles) {
        if (t.kind === "billboard") {
          const board = buildBillboard(t, boards.length);
          const shown = wasShowing.get(board.id);
          const tex = shown ? adCache.get(shown)?.tex : null;
          if (shown && tex) {
            board.shown = shown;
            board.mat.map = tex;
            board.mat.emissiveMap = tex;
          }
          boards.push(board);
          boardHits.push(board.panel);
          life.add(board.obj);
        }
        if (t.kind === "ferris") addFerris(t.x, t.z, t.r[1] < 0.5 ? 0 : Math.PI / 2, t.i, 1);
        if (t.kind === "crane") {
          // The crane's arm swings slowly round, with a load hanging off it.
          const obj = new THREE.Group();
          const jib = new THREE.Group();
          const yellow = new THREE.MeshLambertMaterial({ color: 0xfab005 });
          const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.07), yellow);
          arm.position.x = 0.45;
          const back = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.12), lmMat.frame);
          back.position.x = -0.35;
          const cab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), yellow);
          cab.position.set(0.05, -0.08, 0.06);
          const cable = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.6, 0.01), lmMat.frame);
          cable.position.set(0.9, -0.3, 0);
          const load = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), new THREE.MeshLambertMaterial({ color: 0x8a6a4f }));
          load.position.set(0.9, -0.64, 0);
          jib.add(arm, back, cab, cable, load);
          jib.position.y = 3.08;
          obj.add(jib);
          obj.position.set(t.x + 0.32, 0, t.z - 0.32);
          // The hook winds up and down, and the trolley runs along the arm.
          obj.userData.lift = { cable, load, phase: t.r[0] * 6 };
          landmarks.push({ obj, spin: jib, tile: t.i, speed: 0.15, axis: "y" });
          life.add(obj);
        }
        if (t.structure?.anchor && t.structure.type === "funfair") {
          addFerris(t.x + 0.05, t.z, Math.PI / 4, t.i, 1.15);
          // A carousel that turns
          const obj = new THREE.Group();
          const spin = new THREE.Group();
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 20), lmMat.frame);
          base.position.y = 0.12;
          const top = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.22, 20), lmMat.cabins[0]);
          top.position.y = 0.48;
          spin.add(base, top);
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            const pole = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.33, 0.015), lmMat.frame);
            pole.position.set(Math.cos(a) * 0.22, 0.3, Math.sin(a) * 0.22);
            const horse = new THREE.Mesh(lmGeo.cabin, lmMat.cabins[(k + 1) % lmMat.cabins.length]);
            horse.position.set(Math.cos(a) * 0.22, 0.24, Math.sin(a) * 0.22);
            horse.scale.set(0.8, 0.6, 0.5);
            spin.add(pole, horse);
          }
          obj.add(spin);
          obj.position.set(t.x + 0.95, 0, t.z + 0.15);
          landmarks.push({ obj, spin, tile: t.i, speed: 0.8, axis: "y" });
          life.add(obj);
        }
        if (t.kind === "turbine") {
          const obj = new THREE.Group();
          const rotor = new THREE.Group();
          for (let k = 0; k < 3; k++) {
            const b = new THREE.Mesh(lmGeo.blade, lmMat.white);
            b.rotation.z = (k * Math.PI * 2) / 3;
            rotor.add(b);
          }
          rotor.position.set(0, 2.68, 0.14);
          obj.add(rotor);
          obj.position.set(t.x, 0, t.z);
          obj.rotation.y = t.r[2] * 0.6;
          landmarks.push({ obj, spin: rotor, tile: t.i, speed: 1.6 + t.r[3] });
          life.add(obj);
        }
      }
    }
    function updateLandmarks(dt: number, now: number) {
      const secs = now / 1000;
      for (const l of landmarks) {
        if (l.axis === "y") l.spin.rotation.y += l.speed * dt;
        else l.spin.rotation.z += l.speed * dt;
        const lift = l.obj.userData.lift as { cable: THREE.Object3D; load: THREE.Object3D; phase: number } | undefined;
        if (lift) {
          const drop = 0.35 + 0.9 * (0.5 + 0.5 * Math.sin(secs * 0.45 + lift.phase));
          const reach = 0.75 + 0.3 * Math.sin(secs * 0.23 + lift.phase);
          lift.cable.scale.y = drop / 0.6;
          lift.cable.position.set(reach, -drop / 2, 0);
          lift.load.position.set(reach, -drop - 0.04, 0);
        }
        const t = Math.min(1, Math.max(0, (now - (born.get(l.tile) ?? 0)) / 700));
        l.obj.scale.setScalar(Math.max(0.0001, t) * (l.obj.userData.scale ?? 1));
      }
    }

    // ---- boats drift along the river
    const boatMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const boatGeo = new THREE.BoxGeometry(0.34, 0.08, 0.14).translate(0, 0.04, 0);
    const cabinGeo = new THREE.BoxGeometry(0.12, 0.07, 0.1).translate(0, 0.115, 0);
    let boats: { obj: THREE.Group; pos: number; speed: number; side: number }[] = [];
    let boatPlan: CityPlan | null = null;
    function buildBoats(plan: CityPlan) {
      for (const b of boats) life.remove(b.obj);
      boats = [];
      boatPlan = plan;
      if (!plan.river) return;
      const hasRiver = tiles.some((t) => t.kind === "river");
      if (!hasRiver) return;
      const n = Math.min(6, 2 + Math.floor(radius / 6));
      for (let k = 0; k < n; k++) {
        const obj = new THREE.Group();
        const hull = new THREE.Mesh(boatGeo, boatMat);
        const cabin = new THREE.Mesh(cabinGeo, lmMat.cabins[k % lmMat.cabins.length]);
        obj.add(hull, cabin);
        boats.push({ obj, pos: (Math.random() - 0.5) * radius * 2, speed: (k % 2 ? 1 : -1) * (0.25 + Math.random() * 0.25), side: (k % 2 ? 1 : -1) * 0.2 });
        life.add(obj);
      }
    }
    function updateBoats(time: number, dt: number) {
      if (!boatPlan?.river) return;
      const along = boatPlan.river.along;
      for (const b of boats) {
        b.pos += b.speed * dt;
        if (b.pos > radius) b.pos = -radius;
        if (b.pos < -radius) b.pos = radius;
        const c = riverCentre(boatPlan, b.pos) + b.side;
        const c2 = riverCentre(boatPlan, b.pos + 0.1 * Math.sign(b.speed)) + b.side;
        const x = along === "x" ? b.pos : c;
        const z = along === "x" ? c : b.pos;
        const onWater = kindAt.get(`${Math.round(x)},${Math.round(z)}`);
        b.obj.visible = onWater === "river" || onWater === "bridge";
        b.obj.position.set(x, 0.03 + Math.sin(time * 2 + b.pos) * 0.01, z);
        const dx = along === "x" ? 0.1 * Math.sign(b.speed) : c2 - c;
        const dz = along === "x" ? c2 - c : 0.1 * Math.sign(b.speed);
        b.obj.rotation.y = Math.atan2(-dz, dx);
      }
    }

    // ---- hot-air balloons and planes
    const balloonColors = [0xff6b6b, 0xffd43b, 0x4dabf7, 0xda77f2, 0x38d9a9];
    // Each balloon carries an advert on a banner round its middle (the same ads as the
    // billboards, changing every 20 s; "Your ad here" when there are none), and slowly turns so
    // both sides show. In chat mode each one is a chat room you can ride in.
    const bannerTex = balloonBannerTexture();
    const bannerGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.41, 0.445, 0.22, 12, 1, true, -0.62, 1.24),
      new THREE.CylinderGeometry(0.41, 0.445, 0.22, 12, 1, true, Math.PI - 0.62, 1.24),
    ]);
    const ropeGeo = mergeGeometries(
      [[-0.07, -0.07], [0.07, -0.07], [-0.07, 0.07], [0.07, 0.07]].map(([rx, rz]) => new THREE.BoxGeometry(0.008, 0.2, 0.008).translate(rx, -0.52, rz)),
    );
    const BALLOON_SCALE = 1.25;
    type Balloon = {
      obj: THREE.Group;
      body: THREE.Group;
      basket: THREE.Object3D;
      /** Extra height while you ride it (to clear the tallest towers). */
      lift: number;
      mat: THREE.MeshLambertMaterial;
      shown: string | null;
      hits: THREE.Object3D[];
      a: number;
      r: number;
      h: number;
      speed: number;
      cx: number;
      cz: number;
      k: number;
    };
    const balloons: Balloon[] = balloonColors.map((c, k) => {
      const g = new THREE.Group();
      const body = new THREE.Group();
      const envelope = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
      envelope.scale.y = 1.15;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.38, 0.12, 12), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      band.position.y = -0.12;
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), new THREE.MeshLambertMaterial({ color: 0x8a6a4f }));
      basket.position.y = -0.68;
      const mat = new THREE.MeshLambertMaterial({ map: bannerTex, emissive: 0xffffff, emissiveMap: bannerTex, emissiveIntensity: 0.3 });
      const banner = new THREE.Mesh(bannerGeo, mat);
      banner.position.y = 0.08;
      body.add(envelope, band, banner);
      // The basket and its ropes (hidden while you ride in it).
      const rig = new THREE.Group();
      rig.add(new THREE.Mesh(ropeGeo, lmMat.frame), basket);
      g.add(body, rig);
      g.scale.setScalar(BALLOON_SCALE);
      moving.add(g);
      return {
        obj: g,
        body,
        basket: rig,
        lift: 0,
        mat,
        shown: null,
        hits: [envelope, band, banner, basket],
        a: (k / balloonColors.length) * Math.PI * 2,
        r: 0.45 + (k % 3) * 0.22,
        h: 5.6 + (k % 3) * 1.3,
        speed: 0.022 + k * 0.005,
        cx: (k - 2) * 0.7,
        cz: ((k * 3) % 5 - 2) * 0.6,
        k,
      };
    });
    const balloonHits = balloons.flatMap((b) => b.hits);
    /** Where balloon b is (into out), and which way it's heading (into dir). A gentle loop over the city. */
    function balloonPose(b: Balloon, time: number, out: THREE.Vector3, dir?: THREE.Vector3) {
      const R = Math.max(3, radius * b.r);
      const a = b.a;
      out.set(b.cx + Math.cos(a) * R, b.h + b.lift + Math.sin(time * 0.5 + b.k) * 0.25, b.cz + Math.sin(a) * R * 0.78 + Math.sin(2 * a + b.k) * R * 0.18);
      dir?.set(-Math.sin(a) * R, 0, Math.cos(a) * R * 0.78 + Math.cos(2 * a + b.k) * R * 0.36).normalize();
    }
    const planes = [0, 1].map((k) => {
      const g = new THREE.Group();
      const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.9, 8).rotateZ(Math.PI / 2), white);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.9), white);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.02), new THREE.MeshLambertMaterial({ color: k ? 0xe5484d : 0x228be6 }));
      tail.position.set(-0.4, 0.1, 0);
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff4d4f }));
      light.position.set(0, 0, 0.46);
      g.add(body, wing, tail, light);
      g.userData = { t: k * 0.5, angle: 0.4 + k * 2.2, light };
      moving.add(g);
      return g;
    });
    function updateAir(time: number, dt: number) {
      for (const b of balloons) {
        b.a += b.speed * dt;
        const lift = rideActive && rideK === b.k ? Math.max(0, tallest + 1.8 - b.h) : 0;
        b.lift += (lift - b.lift) * Math.min(1, dt * 0.6);
        balloonPose(b, time, b.obj.position);
        b.body.rotation.y += dt * 0.12;
        // Turn to the next ad every 20 s.
        const want = pickAd(Math.floor((time + b.k * 9) / 20), b.k + 2);
        const id = want && adReady(want.id) ? want.id : null;
        if (id !== b.shown) {
          b.shown = id;
          const tex = (id && adCache.get(id)?.tex) || bannerTex;
          b.mat.map = tex;
          b.mat.emissiveMap = tex;
        }
      }
      for (const p of planes) {
        const u = p.userData;
        u.t += dt / 26;
        if (u.t > 1) {
          u.t = 0;
          u.angle += 1.9;
        }
        const span = radius * 3 + 30;
        const ca = Math.cos(u.angle);
        const sa = Math.sin(u.angle);
        const d = (u.t - 0.5) * span;
        p.position.set(ca * d - sa * 4, 15 + radius * 0.3, sa * d + ca * 4);
        p.rotation.y = -u.angle;
        (u.light as THREE.Mesh).visible = Math.sin(time * 6) > 0.6;
      }
    }

    // ---- the countryside round the city: gentle hills and little valleys near the edge, rising
    // to mountains in the distance (different every round), fading into the haze. Two meshes
    // (the land and its trees), rebuilt only when the city changes size. Never tappable.
    const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const terrain = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
    terrain.receiveShadow = true;
    terrain.frustumCulled = false;
    scene.add(terrain);
    const HILL_TREES = 340;
    const hillTrees = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      HILL_TREES,
    );
    hillTrees.count = 0;
    hillTrees.frustumCulled = false;
    scene.add(hillTrees);
    let terrainKey = "";
    // This round's land: its seed, the half-size of the flat ground the city stands on, how hilly
    // it is, how high the mountains get, and how far out they start and reach full height.
    const land = { seed: 0, half: 10, hills: 1, peaks: 14, start: 20, full: 60 };
    const LAND_COLORS = [
      { meadow: 0xb9d99b, hill: 0x8cc178, forest: 0x5f9e5a, rock: 0x9b958a, low: 0x9fcb8a },
      { meadow: 0xd3d8a2, hill: 0xbcc283, forest: 0x7b9b58, rock: 0xa89a86, low: 0xb7c98d },
      { meadow: 0xcfd9a6, hill: 0xcdb47c, forest: 0xa8743f, rock: 0x948b85, low: 0xb5c894 },
    ];
    const SNOW = new THREE.Color(0xf3f6f9);
    const smooth = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    /** How far outside the city's flat ground the last landHeight() point was. */
    let landE = 0;
    function landHeight(x: number, z: number) {
      // Distance outside a square with rounded corners round the city.
      const c = 2.5;
      const qx = Math.abs(x) - land.half + c;
      const qz = Math.abs(z) - land.half + c;
      const e = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - c;
      landE = Math.max(0, e);
      if (e <= 0) return -0.02;
      const n = smoothNoise(x / 4.5, z / 4.5, land.seed) * 0.65 + smoothNoise(x / 1.9 + 50, z / 1.9, land.seed + 1) * 0.35 - 0.5;
      const hills = n * (0.55 * smooth(0, 5, e) + 3.4 * land.hills * smooth(5, 30, e));
      const r1 = 1 - Math.abs(2 * smoothNoise(x / 20, z / 20, land.seed + 2) - 1);
      const r2 = 1 - Math.abs(2 * smoothNoise(x / 8 + 9, z / 8 - 4, land.seed + 3) - 1);
      const ridges = r1 * r1 * 0.75 + r2 * r2 * 0.3;
      const range = 0.35 + 0.9 * smoothNoise(x / 55, z / 55, land.seed + 4);
      return -0.02 + hills + ridges * range * land.peaks * smooth(land.start, land.full, e);
    }
    function buildTerrain(seedV: number, R: number) {
      const key = `${seedV}:${R}`;
      if (key === terrainKey) return;
      terrainKey = key;
      const rr = (k: number) => hash(seedV, k, 5151);
      land.seed = (seedV * 31 + 7) | 0;
      land.half = R + 1.2;
      land.hills = 0.45 + rr(1) * 0.9;
      land.peaks = (9 + R * 0.5) * (0.6 + rr(2) * 0.8);
      land.start = 10 + R * 0.5;
      land.full = 40 + R * 1.6;
      const pal = LAND_COLORS[Math.floor(rr(3) * LAND_COLORS.length) % LAND_COLORS.length];
      const cGround = new THREE.Color(GROUND);
      const cMeadow = new THREE.Color(pal.meadow);
      const cHill = new THREE.Color(pal.hill);
      const cForest = new THREE.Color(pal.forest);
      const cRock = new THREE.Color(pal.rock);
      const cLow = new THREE.Color(pal.low);
      const snowy = land.peaks > 11;
      // A polar grid: rings close together near the city, wide apart far out.
      const N = 60;
      const M = 144;
      const r0 = land.half - 0.8;
      const rOut = R * 14 + 80;
      const pos = new Float32Array((N + 1) * M * 3);
      const col = new Float32Array((N + 1) * M * 3);
      const cc = new THREE.Color();
      for (let i = 0; i <= N; i++) {
        const r = r0 + (rOut - r0) * Math.pow(i / N, 1.9);
        for (let j = 0; j < M; j++) {
          const a = (j / M) * Math.PI * 2 + (i % 2) * (Math.PI / M);
          const x = Math.cos(a) * r;
          const z = Math.sin(a) * r;
          const y = landHeight(x, z);
          const e = landE;
          const o = (i * M + j) * 3;
          pos[o] = x;
          pos[o + 1] = y;
          pos[o + 2] = z;
          cc.copy(cGround).lerp(cMeadow, smooth(0, 4, e));
          if (y < -0.12) cc.lerp(cLow, smooth(-0.12, -0.8, y));
          cc.lerp(cHill, smooth(0.3, 2, y));
          cc.lerp(cForest, smooth(1.5, 4, y) * (0.4 + 0.6 * smoothNoise(x / 9, z / 9, land.seed + 5)));
          cc.lerp(cRock, smooth(land.peaks * 0.22, land.peaks * 0.45, y));
          if (snowy) cc.lerp(SNOW, smooth(land.peaks * 0.55, land.peaks * 0.7, y));
          col[o] = cc.r;
          col[o + 1] = cc.g;
          col[o + 2] = cc.b;
        }
      }
      const index = new Uint32Array(N * M * 6);
      let n = 0;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < M; j++) {
          const a = i * M + j;
          const b = i * M + ((j + 1) % M);
          const c = (i + 1) * M + j;
          const d = (i + 1) * M + ((j + 1) % M);
          index.set([a, b, c, c, b, d], n);
          n += 6;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(index, 1));
      g.computeVertexNormals();
      terrain.geometry.dispose();
      terrain.geometry = g;
      // Little woods on the hills.
      let count = 0;
      for (let k = 0; k < 4000 && count < HILL_TREES; k++) {
        const a = hash(k, 1, seedV + 5252) * Math.PI * 2;
        const d = land.half + 1 + Math.sqrt(hash(k, 2, seedV + 5252)) * (32 + R * 0.6);
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const y = landHeight(x, z);
        if (landE < 1.2 || y > land.peaks * 0.2 || smoothNoise(x / 7, z / 7, land.seed + 6) < 0.5) continue;
        const h = (0.55 + hash(k, 3, seedV + 5252) * 0.6) * (1 + landE / 45);
        m4.compose(v.set(x, y - 0.05, z), q.identity(), s.set(h * 0.42, h, h * 0.42));
        hillTrees.setMatrixAt(count, m4);
        hillTrees.setColorAt(count, cc.copy(cForest).multiplyScalar(0.75 + hash(k, 4, seedV + 5252) * 0.35));
        count++;
      }
      hillTrees.count = count;
      hillTrees.instanceMatrix.needsUpdate = true;
      if (hillTrees.instanceColor) hillTrees.instanceColor.needsUpdate = true;
      // The flat ground under the city, and how far we can see.
      base.scale.setScalar(land.half);
      camera.far = Math.max(400, rOut * 1.3);
      camera.updateProjectionMatrix();
    }

    // ---- traffic lights light up the road at night: soft coloured pools on the asphalt
    // under each light, following its colour.
    const poolMat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    let pools: THREE.InstancedMesh | null = null;
    let poolAxis: number[] = [];
    function buildPools() {
      if (pools) {
        scene.remove(pools);
        pools.dispose();
      }
      const spots: { x: number; z: number; axis: number }[] = [];
      for (const t of tiles) {
        if (!signalJunction(t)) continue;
        spots.push({ x: t.x + 0.24, z: t.z - 0.24, axis: 0 }, { x: t.x - 0.24, z: t.z + 0.24, axis: 1 });
      }
      poolAxis = spots.map((p) => p.axis);
      pools = new THREE.InstancedMesh(poolGeo, poolMat, Math.max(1, spots.length));
      pools.count = spots.length;
      spots.forEach((p, k) => {
        m4.compose(v.set(p.x, 0.072, p.z), q.identity(), s.set(1.15, 1, 1.15));
        pools!.setMatrixAt(k, m4);
        pools!.setColorAt(k, color.setHex(0x000000));
      });
      pools.renderOrder = 3;
      pools.visible = false;
      pools.computeBoundingSphere();
      scene.add(pools);
    }

    // ---- blinking lamps: hazard lights, police lights, road-works lamps
    let flashTags: number[] = [];
    let flashState = -1;
    const FLASH_COL = {
      amber: new THREE.Color(0xffa41b),
      amberOff: new THREE.Color(0x4a3a20),
      red: new THREE.Color(0xff2d2d),
      blue: new THREE.Color(0x2d6bff),
      off: new THREE.Color(0x1d2330),
    };
    function updateFlashers(time: number) {
      const mesh = meshes.flash;
      if (!mesh || !flashTags.length) return;
      const hazard = Math.sin(time * 5.5) > 0 ? 1 : 0;
      const police = Math.floor(time * 6) % 2;
      const works = Math.sin(time * 3.2) > 0.2 ? 1 : 0;
      const state = hazard | (police << 1) | (works << 2);
      if (state === flashState) return;
      flashState = state;
      for (let k = 0; k < flashTags.length; k++) {
        const tag = flashTags[k];
        const c =
          tag === FLASH.hazard
            ? hazard ? FLASH_COL.amber : FLASH_COL.amberOff
            : tag === FLASH.policeRed
              ? police ? FLASH_COL.red : FLASH_COL.off
              : tag === FLASH.policeBlue
                ? police ? FLASH_COL.off : FLASH_COL.blue
                : works ? FLASH_COL.amber : FLASH_COL.amberOff;
        mesh.setColorAt(k, c);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // ---- the city's moving parts and things being built (see ./city/*)
    const people = createPeople(world, life);
    const trains = createTrains(world, life);
    const plumes = createPlumes(world, life);
    const sites = createSites(world, life);
    const buildingSite = createBuildingSite(scene);
    /** False while the map is still a secret building site (the join window). */
    let isRevealed = true;
    /** Street life comes back a moment after the city starts rising. */
    let lifeAt = 0;

    // ---- build / grow the city
    function build(newSeed: number, count: number) {
      const sameCity = newSeed === currentSeed;
      if (!sameCity) {
        born = new Map();
        framed = false;
        caughtFromEvents.clear();
      }
      currentSeed = newSeed;
      const plan = makePlan(newSeed);
      tiles = Array.from({ length: count }, (_, i) => tileAt(plan, i));
      // A big building only appears once all four of its tiles exist; until then each
      // of its tiles shows what it would otherwise be.
      const present = new Set(tiles.map((t) => `${t.x},${t.z}`));
      tiles = tiles.map((t) => {
        if (t.kind !== "structure" || !t.structure || !t.fallback) return t;
        const { ax, az } = t.structure;
        const whole = [`${ax},${az}`, `${ax + 1},${az}`, `${ax},${az + 1}`, `${ax + 1},${az + 1}`].every((k) => present.has(k));
        return whole ? t : { ...t.fallback, i: t.i };
      });
      kindAt = new Map(tiles.map((t) => [`${t.x},${t.z}`, t.kind]));
      tileIndex = new Map(tiles.map((t) => [`${t.x},${t.z}`, t.i]));
      blocked = new Set(tiles.filter((t) => t.works).map((t) => `${t.x},${t.z}`));
      currentPlan = plan;

      const now = performance.now();
      for (const t of tiles) {
        if (!born.has(t.i)) {
          // First load: rise from the centre outwards. Later: new tiles pop up.
          const delay = sameCity ? (t.i - born.size) * 25 : Math.hypot(t.x, t.z) * 45;
          born.set(t.i, now + Math.min(delay, 2500));
        }
      }

      parts = {};
      tileParts = new Map();
      for (const t of tiles) {
        partsFor(t, plan, (mesh, p) => {
          (parts[mesh] ??= []).push({ ...p, tile: t.i });
          const list = tileParts.get(t.i) ?? [];
          list.push([mesh, parts[mesh].length - 1]);
          tileParts.set(t.i, list);
        });
      }

      for (const m of Object.values(meshes)) {
        city.remove(m);
        m.dispose();
      }
      meshes = {};
      growing = [];
      for (const [name, def] of Object.entries(meshDefs)) {
        const list = parts[name] ?? [];
        const mesh = new THREE.InstancedMesh(def.geometry, def.material, Math.max(1, list.length));
        mesh.count = list.length;
        mesh.castShadow = def.shadow;
        mesh.receiveShadow = true;
        mesh.userData.name = name;
        list.forEach((p, k) => {
          const b = born.get(p.tile)!;
          const g = now >= b + 700 ? 1 : 0;
          writePart(mesh, k, p, g);
          mesh.setColorAt(k, color.setHex(p.color));
        });
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        meshes[name] = mesh;
        city.add(mesh);
      }
      for (const t of tiles) if (now < born.get(t.i)! + 700) growing.push(t.i);
      signalTags = (parts.signal ?? []).map((p) => p.color - SIGNAL_TAG);
      signalPhase = -1;
      flashTags = (parts.flash ?? []).map((p) => p.color - FLASH_TAG);
      flashState = -1;

      radius = tiles.reduce((m, t) => Math.max(m, Math.abs(t.x), Math.abs(t.z)), 4) + 1.5;
      tallest = tiles.reduce((m, t) => Math.max(m, t.top), 0);
      buildTerrain(newSeed, radius);
      const sc = sun.shadow.camera;
      sc.left = sc.bottom = -radius * 1.3;
      sc.right = sc.top = radius * 1.3;
      sc.near = 1;
      sc.far = radius * 6 + 40;
      sc.updateProjectionMatrix();
      sun.position.set(-radius * 1.2, radius * 2 + 12, radius * 0.9);
      controls.maxDistance = Math.max(30, radius * 4.5);
      if (!framed) {
        framed = true;
        const d = (radius * 2.3 + 8) * Math.max(1, 0.95 / camera.aspect);
        camera.position.set(d * 0.62, d * 0.72, d * 0.62);
        controls.target.set(0, 0, 0);
        controls.update();
      }
      buildCars(plan);
      buildJams(newSeed);
      buildPools();
      buildLandmarks();
      buildBoats(plan);
      buildGhosts(count);
      for (const g of ghosts) g.visible = isRevealed;
      // Everyone else who needs to know about the new city.
      world.tiles = tiles;
      world.plan = plan;
      world.radius = radius;
      world.kindAt = kindAt;
      world.tileIndex = tileIndex;
      world.blocked = blocked;
      world.born = born;
      birds.build(newSeed);
      people.build();
      trains.build();
      plumes.build();
      sites.build();
      if (!isRevealed) buildingSite.build(newSeed, count);
      cb.current.onBalloons?.(balloons.length);
      setMarkers(lastMarkers);
      rebuildPills();
      caughtKey = "";
      drawCaught();
    }

    function updateGrowth(now: number) {
      if (!growing.length) return;
      const touched = new Set<string>();
      growing = growing.filter((tile) => {
        const b = born.get(tile)!;
        const t = Math.min(1, Math.max(0, (now - b) / 700));
        const g = t <= 0 ? 0 : easeOutBack(t);
        for (const [name, idx] of tileParts.get(tile) ?? []) {
          writePart(meshes[name], idx, parts[name][idx], g);
          touched.add(name);
        }
        return t < 1;
      });
      for (const name of touched) {
        meshes[name].instanceMatrix.needsUpdate = true;
        meshes[name].computeBoundingSphere();
      }
    }

    // ---- markers
    let lastMarkers: CityMarkers = { searchedEmpty: [], searchedHit: [], caught: [], left: [], me: null, sweeps: [], pending: null, recent: [], locked: [], decoy: null };
    const pulsers: { obj: THREE.Object3D; kind: "pulse" | "bob" | "spin" | "flash" | "sway"; base: number }[] = [];
    const glassBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const markerGeo = {
      pinHead: new THREE.SphereGeometry(0.14, 16, 12),
      pinStick: new THREE.ConeGeometry(0.06, 0.32, 10).rotateX(Math.PI),
      ring: new THREE.TorusGeometry(0.36, 0.05, 8, 32).rotateX(Math.PI / 2),
      beam: new THREE.CylinderGeometry(0.22, 0.22, 1, 24, 1, true).translate(0, 0.5, 0),
      gem: new THREE.OctahedronGeometry(0.22),
      square: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      cross: new THREE.BoxGeometry(0.42, 0.04, 0.08),
      // Your decoy: an inflatable tube man.
      tube: new THREE.CylinderGeometry(0.06, 0.075, 0.5, 10).translate(0, 0.25, 0),
      arm: new THREE.CylinderGeometry(0.025, 0.03, 0.26, 8).translate(0, 0.13, 0),
      ball: new THREE.SphereGeometry(0.5, 12, 8),
      dash: new THREE.RingGeometry(0.34, 0.4, 32).rotateX(-Math.PI / 2),
      stand: new THREE.CylinderGeometry(0.5, 0.5, 1, 16).translate(0, 0.5, 0),
    };
    // Shared with the little scenes (which free what they made, but not these).
    markerGeo.square.userData.keep = true;
    const topOf = (tile: number) => tiles[tile]?.top ?? 0.2;
    const posOf = (tile: number) => tiles[tile] ?? { x: 0, z: 0 };

    function pin(tile: number, hex: number) {
      const g = new THREE.Group();
      const head = new THREE.Mesh(markerGeo.pinHead, new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.25 }));
      head.position.y = 0.42;
      const stick = new THREE.Mesh(markerGeo.pinStick, new THREE.MeshLambertMaterial({ color: hex }));
      stick.position.y = 0.2;
      g.add(head, stick);
      g.position.set(posOf(tile).x, topOf(tile) + 0.05, posOf(tile).z);
      return g;
    }

    function setMarkers(m: CityMarkers) {
      lastMarkers = m;
      for (const c of [...markerGroup.children]) {
        markerGroup.remove(c);
        c.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
        });
      }
      pulsers.length = 0;
      if (!tiles.length) return;
      const ok = (t: number) => t >= 0 && t < tiles.length;

      // Searched tiles: a coloured glass block over the whole tile, with a solid cap on top.
      // Blue = you searched, empty. Red = you found someone. Orange = searched (hiders' view).
      const mineSet = new Set([...m.searchedEmpty, ...m.searchedHit]);
      const blocks: { tile: number; color: number }[] = [
        ...m.locked.filter((t) => ok(t) && !mineSet.has(t)).map((tile) => ({ tile, color: 0xff922b })),
        ...m.searchedEmpty.filter(ok).map((tile) => ({ tile, color: 0x5c7cfa })),
        ...m.searchedHit.filter(ok).map((tile) => ({ tile, color: 0xe5484d })),
      ];
      if (blocks.length) {
        const glass = new THREE.InstancedMesh(glassBox, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, depthWrite: false }), blocks.length);
        const caps = new THREE.InstancedMesh(glassBox, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85 }), blocks.length);
        blocks.forEach((b, k) => {
          const p = posOf(b.tile);
          const h = topOf(b.tile) + 0.12;
          m4.compose(v.set(p.x, 0, p.z), q.identity(), s.set(1.02, h, 1.02));
          glass.setMatrixAt(k, m4);
          m4.compose(v.set(p.x, h, p.z), q.identity(), s.set(1.02, 0.04, 1.02));
          caps.setMatrixAt(k, m4);
          glass.setColorAt(k, color.setHex(b.color));
          caps.setColorAt(k, color.setHex(b.color));
        });
        glass.renderOrder = 2;
        markerGroup.add(glass, caps);
      }
      for (const t of m.caught.filter(ok)) markerGroup.add(pin(t, 0xe5484d));

      // Everyone's latest searches light up: a bright beam that fades, then a ring that stays.
      for (const r of m.recent.filter((x) => ok(x.tile))) {
        const p = posOf(r.tile);
        const beam = new THREE.Mesh(
          markerGeo.beam,
          new THREE.MeshBasicMaterial({ color: 0xfff3bf, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
        );
        beam.scale.set(2.2, topOf(r.tile) + 7, 2.2);
        beam.position.set(p.x, 0, p.z);
        beam.renderOrder = 4;
        markerGroup.add(beam);
        pulsers.push({ obj: beam, kind: "flash", base: Date.now() - r.ageMs });
        const ring = new THREE.Mesh(markerGeo.ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
        ring.scale.setScalar(1.25);
        ring.position.set(p.x, topOf(r.tile) + 0.2, p.z);
        markerGroup.add(ring);
      }
      for (const t of m.left.filter(ok)) {
        const ring = new THREE.Mesh(markerGeo.ring, new THREE.MeshBasicMaterial({ color: 0xffb400 }));
        ring.position.set(posOf(t).x, topOf(t) + 0.15, posOf(t).z);
        markerGroup.add(ring);
        pulsers.push({ obj: ring, kind: "pulse", base: 1 });
      }
      for (const sw of m.sweeps) {
        if (!ok(sw.tile)) continue;
        const size = sw.radius * 2 + 1;
        const hex = sw.count > 0 ? 0xffb400 : 0x4dabf7;
        const sq = new THREE.Mesh(
          markerGeo.square,
          new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.18, depthWrite: false }),
        );
        sq.scale.set(size, 1, size);
        sq.position.set(posOf(sw.tile).x, 0.12, posOf(sw.tile).z);
        sq.renderOrder = 2;
        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(size, 0.01, size)),
          new THREE.LineBasicMaterial({ color: hex }),
        );
        edge.position.copy(sq.position);
        markerGroup.add(sq, edge);
      }
      if (m.me !== null && ok(m.me) && m.me !== lastMe) {
        // Glide the camera to the player's hiding spot when it is first known (or after a move).
        focus = new THREE.Vector3(posOf(m.me).x, 0, posOf(m.me).z);
      }
      lastMe = m.me;
      if (m.me !== null && ok(m.me)) {
        const g = new THREE.Group();
        const beam = new THREE.Mesh(
          markerGeo.beam,
          new THREE.MeshBasicMaterial({ color: 0x12b886, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
        );
        beam.scale.set(1.6, topOf(m.me) + 6, 1.6);
        beam.renderOrder = 3;
        // Your own face floats above your hiding spot.
        const gem = new THREE.Sprite(new THREE.SpriteMaterial({ map: faceTexture(atmos.current.meAvatar, "#12b886"), depthTest: false }));
        gem.renderOrder = 7;
        gem.scale.setScalar(1.1);
        gem.position.y = topOf(m.me) + 1.3;
        const pinTip = new THREE.Mesh(markerGeo.pinStick, new THREE.MeshBasicMaterial({ color: 0x12b886 }));
        pinTip.scale.set(1.4, 1.4, 1.4);
        pinTip.position.y = topOf(m.me) + 0.55;
        g.add(beam, gem, pinTip);
        g.position.set(posOf(m.me).x, 0, posOf(m.me).z);
        markerGroup.add(g);
        pulsers.push({ obj: gem, kind: "bob", base: gem.position.y });
      }
      if (m.decoy !== null && m.decoy !== undefined && ok(m.decoy)) {
        // Your decoy: a purple inflatable tube man waving about (only you see it).
        const g = new THREE.Group();
        const purple = new THREE.MeshLambertMaterial({ color: 0x9775fa, emissive: 0x5f3dc4, emissiveIntensity: 0.25 });
        const man = new THREE.Group();
        const tube = new THREE.Mesh(markerGeo.tube, purple);
        tube.castShadow = true;
        const head = new THREE.Mesh(markerGeo.ball, purple);
        head.scale.setScalar(0.16);
        head.position.y = 0.56;
        const face = new THREE.MeshBasicMaterial({ color: 0x1b1b1b });
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(markerGeo.ball, face);
          eye.scale.setScalar(0.03);
          eye.position.set(side * 0.035, 0.58, 0.07);
          man.add(eye);
        }
        const mouth = new THREE.Mesh(markerGeo.ball, face);
        mouth.scale.set(0.06, 0.02, 0.02);
        mouth.position.set(0, 0.525, 0.075);
        const arms: THREE.Mesh[] = [];
        for (const side of [-1, 1]) {
          const arm = new THREE.Mesh(markerGeo.arm, purple);
          arm.position.set(side * 0.05, 0.4, 0);
          arm.rotation.z = -side * 1.1;
          arms.push(arm);
          man.add(arm);
        }
        man.add(tube, head, mouth);
        man.userData.arms = arms;
        man.scale.setScalar(1.5);
        const base = new THREE.Mesh(markerGeo.stand, new THREE.MeshLambertMaterial({ color: 0x5f3dc4 }));
        base.scale.set(0.3, 0.04, 0.3);
        const ring = new THREE.Mesh(markerGeo.dash, new THREE.MeshBasicMaterial({ color: 0x9775fa, transparent: true, opacity: 0.85, depthWrite: false }));
        ring.position.y = 0.02;
        g.add(man, base, ring);
        g.position.set(posOf(m.decoy).x, topOf(m.decoy) + 0.02, posOf(m.decoy).z);
        markerGroup.add(g);
        pulsers.push({ obj: man, kind: "sway", base: Math.random() * 6 });
      }
      if (m.pending !== null && ok(m.pending)) {
        const beam = new THREE.Mesh(
          markerGeo.beam,
          new THREE.MeshBasicMaterial({ color: 0xffb400, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
        );
        beam.scale.set(2, topOf(m.pending) + 2, 2);
        beam.position.set(posOf(m.pending).x, 0, posOf(m.pending).z);
        markerGroup.add(beam);
        pulsers.push({ obj: beam, kind: "spin", base: 1 });
      }
    }

    function updateMarkers(time: number) {
      for (const p of pulsers) {
        if (p.kind === "pulse") p.obj.scale.setScalar(1 + Math.sin(time * 4) * 0.12);
        if (p.kind === "bob") {
          p.obj.position.y = p.base + Math.sin(time * 2.5) * 0.15;
        }
        if (p.kind === "spin") ((p.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.abs(Math.sin(time * 5)) * 0.3;
        if (p.kind === "sway") {
          // The tube man wobbles and flaps its arms.
          const t = time + p.base;
          p.obj.rotation.z = Math.sin(t * 2.6) * 0.18 + Math.sin(t * 6.1) * 0.05;
          p.obj.rotation.x = Math.sin(t * 1.9) * 0.08;
          const arms = p.obj.userData.arms as THREE.Object3D[];
          arms[0].rotation.z = 1.1 + Math.sin(t * 7) * 0.6;
          arms[1].rotation.z = -1.1 + Math.sin(t * 6.3 + 1) * 0.6;
        }
        if (p.kind === "flash") {
          const age = (Date.now() - p.base) / 1000;
          const mat = (p.obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.opacity = age < 0 || age > 12 ? 0 : (1 - age / 12) * (0.45 + Math.abs(Math.sin(time * 6)) * 0.25);
          p.obj.visible = mat.opacity > 0.01;
        }
      }
    }

    // ---- little scenes for things that just happened
    // Search: a person, soldier or dog walks round the tile and looks about; if nobody turns
    // up, a puff and a "?" . Sweep: a drone flies over and scans the area. Catch: police
    // lights and a siren ring. Move: a puff where the hider was.
    type Fx = { obj: THREE.Object3D; start: number; dur: number; step: (t: number) => void };
    let fx: Fx[] = [];
    const seenEvents = new Set<number>();
    const fxMat = (color: number) => new THREE.MeshLambertMaterial({ color });
    const unknownTex = labelTexture("?", "#8b95a1");
    const cuffTex = labelTexture("!", "#e5484d");
    const ringGeo = new THREE.RingGeometry(0.42, 0.5, 32).rotateX(-Math.PI / 2);

    // Searchers share their shapes and paints (marked "keep" so finished scenes don't free them).
    const keep = <T extends THREE.BufferGeometry | THREE.Material>(x: T) => {
      x.userData.keep = true;
      return x;
    };
    const walkerGeo = {
      body: keep(new THREE.CylinderGeometry(0.045, 0.055, 0.18, 8)),
      legs: keep(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 8)),
      head: keep(new THREE.SphereGeometry(0.045, 10, 8)),
      helmet: keep(new THREE.SphereGeometry(0.052, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
      dogBody: keep(new THREE.BoxGeometry(0.2, 0.08, 0.08)),
      dogHead: keep(new THREE.BoxGeometry(0.08, 0.08, 0.07)),
      dogTail: keep(new THREE.BoxGeometry(0.06, 0.02, 0.02)),
      dogLeg: keep(new THREE.BoxGeometry(0.025, 0.08, 0.025)),
    };
    const paints = new Map<number, THREE.MeshLambertMaterial>();
    const paint = (hex: number) => {
      let m = paints.get(hex);
      if (!m) {
        m = keep(new THREE.MeshLambertMaterial({ color: hex }));
        paints.set(hex, m);
      }
      return m;
    };
    function makeWalker(kind: number) {
      const g = new THREE.Group();
      if (kind === 2) {
        // Dog
        const fur = paint(0xa0703c);
        const body = new THREE.Mesh(walkerGeo.dogBody, fur);
        body.position.y = 0.11;
        const head = new THREE.Mesh(walkerGeo.dogHead, fur);
        head.position.set(0.12, 0.16, 0);
        const tail = new THREE.Mesh(walkerGeo.dogTail, fur);
        tail.position.set(-0.12, 0.15, 0);
        tail.rotation.z = 0.6;
        g.add(body, head, tail);
        for (const [lx, lz] of [[0.07, 0.03], [0.07, -0.03], [-0.07, 0.03], [-0.07, -0.03]]) {
          const leg = new THREE.Mesh(walkerGeo.dogLeg, fur);
          leg.position.set(lx, 0.04, lz);
          g.add(leg);
        }
      } else {
        // Person (kind 0) or soldier (kind 1)
        const shirt = kind === 1 ? 0x5c7a3a : [0x4dabf7, 0xff6b6b, 0xffd43b, 0x845ef7][Math.floor(Math.random() * 4)];
        const body = new THREE.Mesh(walkerGeo.body, paint(shirt));
        body.position.y = 0.17;
        const legs = new THREE.Mesh(walkerGeo.legs, paint(kind === 1 ? 0x4a5d2f : 0x343a40));
        legs.position.y = 0.045;
        const head = new THREE.Mesh(walkerGeo.head, paint(0xf1c27d));
        head.position.y = 0.3;
        g.add(body, legs, head);
        if (kind === 1) {
          const helmet = new THREE.Mesh(walkerGeo.helmet, paint(0x4a5d2f));
          helmet.position.y = 0.305;
          g.add(helmet);
        }
      }
      g.traverse((o) => (o.castShadow = true));
      g.scale.setScalar(1.5);
      return g;
    }

    function addFx(obj: THREE.Object3D, dur: number, step: (t: number) => void) {
      fxGroup.add(obj);
      fx.push({ obj, start: performance.now(), dur, step });
    }

    function puff(tile: Tile, color: number, delay = 0) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
      ring.position.set(tile.x, 0.12, tile.z);
      addFx(ring, 1400 + delay, (t) => {
        const k = Math.max(0, (t * (1400 + delay) - delay) / 1400);
        ring.visible = k > 0;
        ring.scale.setScalar(0.4 + k * 1.6);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      });
    }

    function searchScene(tile: Tile, found: boolean) {
      const kind = Math.floor(hashish(tile.r[0], tile.i) * 3);
      const walker = makeWalker(kind);
      const corners = [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]];
      const start = Math.floor(Math.random() * 4);
      addFx(walker, 2000, (t) => {
        // A dash along two sides of the tile, a good look around, then gone (two seconds).
        const walk = Math.min(1, t / 0.7) * 2;
        const a = corners[(start + Math.floor(walk)) % 4];
        const b = corners[(start + Math.floor(walk) + 1) % 4];
        const f = walk % 1;
        const px = a[0] + (b[0] - a[0]) * (walk >= 2 ? 1 : f);
        const pz = a[1] + (b[1] - a[1]) * (walk >= 2 ? 1 : f);
        walker.position.set(tile.x + px, 0.08 + (t < 0.7 ? Math.abs(Math.sin(t * 40)) * 0.02 : 0), tile.z + pz);
        walker.rotation.y = t < 0.7 ? Math.atan2(-(b[1] - a[1]), b[0] - a[0]) : Math.sin(t * 9) * 1.2;
        const fade = t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1;
        walker.scale.setScalar(1.5 * Math.min(1, t * 10) * fade + 0.0001);
      });
      if (!found) {
        puff(tile, 0x8b95a1, 1350);
        const q = new THREE.Sprite(new THREE.SpriteMaterial({ map: unknownTex, transparent: true, depthTest: false }));
        q.renderOrder = 6;
        addFx(q, 2800, (t) => {
          const k = Math.max(0, (t - 0.5) / 0.5);
          q.visible = k > 0;
          q.position.set(tile.x, tile.top + 0.4 + k * 0.6, tile.z);
          q.scale.setScalar(0.45);
          q.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        });
      }
    }

    function sweepScene(tile: Tile, radius: number) {
      const drone = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.22), fxMat(0x343a40));
      drone.add(body);
      const rotors: THREE.Mesh[] = [];
      for (const [rx, rz] of [[0.15, 0.15], [-0.15, 0.15], [0.15, -0.15], [-0.15, -0.15]]) {
        const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.02), fxMat(0xdee2e6));
        rotor.position.set(rx, 0.05, rz);
        drone.add(rotor);
        rotors.push(rotor);
      }
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x4dabf7 }));
      light.position.y = -0.04;
      drone.add(light);
      drone.scale.setScalar(1.6);
      const size = radius * 2 + 1;
      const scan = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x4dabf7, transparent: true, opacity: 0, depthWrite: false }),
      );
      scan.position.set(tile.x, 0.14, tile.z);
      scan.renderOrder = 3;
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(size, 0.02, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xa5d8ff, transparent: true, depthWrite: false }),
      );
      line.renderOrder = 4;
      const fromX = tile.x + 8;
      const fromZ = tile.z + 6;
      addFx(drone, 6500, (t) => {
        for (const r of rotors) r.rotation.y += 0.9;
        const h = 2.6 + radius * 0.4;
        if (t < 0.2) {
          const k = t / 0.2;
          drone.position.set(fromX + (tile.x - fromX) * k, h + 2 * (1 - k), fromZ + (tile.z - fromZ) * k);
        } else if (t < 0.8) {
          const a = ((t - 0.2) / 0.6) * Math.PI * 2;
          drone.position.set(tile.x + Math.cos(a) * radius * 0.6, h, tile.z + Math.sin(a) * radius * 0.6);
        } else {
          const k = (t - 0.8) / 0.2;
          drone.position.set(tile.x - k * 6, h + k * 4, tile.z - k * 5);
        }
      });
      addFx(scan, 6500, (t) => {
        const on = t > 0.2 && t < 0.8;
        (scan.material as THREE.MeshBasicMaterial).opacity = on ? 0.18 + Math.abs(Math.sin(t * 30)) * 0.12 : 0;
      });
      addFx(line, 6500, (t) => {
        const on = t > 0.2 && t < 0.8;
        line.visible = on;
        line.position.set(tile.x, 0.16, tile.z - size / 2 + (((t - 0.2) / 0.3) % 1) * size);
      });
    }

    function arrestScene(tile: Tile, hiders: { name: string | null; avatar: unknown; bot: boolean }[] = []) {
      // The faces of whoever got caught pop up over the spot.
      hiders.slice(0, 3).forEach((h, k) => {
        const tex = h.bot ? labelTexture("🤖", "#7048e8") : faceTexture(cleanAvatar(h.avatar, h.name ?? "ghost"), "#e5484d");
        const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
        face.renderOrder = 8;
        addFx(face, 6000, (t) => {
          const pop = Math.min(1, t * 6);
          face.scale.setScalar(0.9 * pop);
          face.position.set(tile.x + (k - (Math.min(hiders.length, 3) - 1) / 2) * 0.95, tile.top + 1.5 + Math.sin(t * 10) * 0.05, tile.z);
          face.material.opacity = t > 0.85 ? (1 - t) / 0.15 : 1;
        });
      });
      const g = new THREE.Group();
      const red = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
      const blue = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0x2d6bff }));
      red.position.x = -0.1;
      blue.position.x = 0.1;
      g.add(red, blue);
      const car = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.17), fxMat(0xffffff));
      shell.position.y = 0.08;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.345, 0.03, 0.175), fxMat(0x1c3faa));
      band.position.y = 0.09;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.15), fxMat(0x343a40));
      cab.position.y = 0.16;
      car.add(shell, band, cab);
      car.position.set(tile.x + 0.42, 0.06, tile.z);
      car.rotation.y = Math.PI / 2;
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: cuffTex, transparent: true, depthTest: false }));
      sign.renderOrder = 6;
      addFx(car, 5500, (t) => car.scale.setScalar(Math.min(1, t * 10) * (t > 0.9 ? (1 - t) * 10 : 1) + 0.0001));
      addFx(g, 5500, (t) => {
        g.position.set(tile.x + 0.42, 0.33, tile.z);
        const flip = Math.sin(t * 70) > 0;
        red.visible = flip;
        blue.visible = !flip;
      });
      addFx(sign, 5500, (t) => {
        sign.position.set(tile.x, tile.top + 0.6 + Math.sin(t * 12) * 0.05, tile.z);
        sign.scale.setScalar(0.5);
        sign.material.opacity = t > 0.85 ? (1 - t) / 0.15 : 1;
      });
      puff(tile, 0xe5484d);
      puff(tile, 0xe5484d, 600);
    }

    // A big search: a squad fans out over the 3×3 block round the tile while a searchlight sweeps it.
    const searchlightGeo = keep(new THREE.ConeGeometry(0.9, 1, 20, 1, true).translate(0, -0.5, 0));
    function areaSearchScene(tile: Tile, r: number) {
      const size = r * 2 + 1;
      const ORDER = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [0, 0]];
      ORDER.forEach(([ox, oz], k) => {
        const kind = k === 8 ? 2 : k % 3 === 2 ? 2 : k % 2;
        const walker = makeWalker(kind);
        const tx = tile.x + ox * r;
        const tz = tile.z + oz * r;
        const spin = Math.random() * Math.PI * 2;
        const delay = k * 0.025;
        addFx(walker, 2500, (t) => {
          const u = Math.max(0, t - delay);
          let px: number;
          let pz: number;
          let face: number;
          if (u < 0.32) {
            // Fan out from the middle.
            const f = u / 0.32;
            px = tile.x + (tx - tile.x) * f;
            pz = tile.z + (tz - tile.z) * f;
            face = Math.atan2(-(tz - tile.z), tx - tile.x || 0.001);
          } else {
            // Search round the tile, looking about.
            const a = spin + (u - 0.32) * 9;
            px = tx + Math.cos(a) * 0.28;
            pz = tz + Math.sin(a) * 0.28;
            face = -a - Math.PI / 2 + Math.sin(u * 30) * 0.5;
          }
          walker.position.set(px, 0.08 + (u < 0.85 ? Math.abs(Math.sin(u * 45)) * 0.025 : 0), pz);
          walker.rotation.y = face;
          const fade = t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1;
          walker.scale.setScalar(1.5 * Math.min(1, u * 12) * fade + 0.0001);
        });
      });
      // The area lights up...
      const zone = new THREE.Mesh(
        markerGeo.square,
        new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, opacity: 0, depthWrite: false }),
      );
      zone.scale.set(size, 1, size);
      zone.position.set(tile.x, 0.13, tile.z);
      zone.renderOrder = 3;
      addFx(zone, 2500, (t) => {
        const env = Math.min(1, t * 6) * (t > 0.8 ? (1 - t) / 0.2 : 1);
        (zone.material as THREE.MeshBasicMaterial).opacity = env * (0.12 + Math.abs(Math.sin(t * 14)) * 0.1);
      });
      // ...and a searchlight sweeps round it.
      const beam = new THREE.Mesh(
        searchlightGeo,
        new THREE.MeshBasicMaterial({ color: 0xfff3bf, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      beam.renderOrder = 5;
      const spot = new THREE.Mesh(
        markerGeo.square,
        new THREE.MeshBasicMaterial({ map: poolMat.map, color: 0xfff3bf, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      spot.renderOrder = 4;
      const H = 4.5;
      addFx(beam, 2500, (t) => {
        const env = Math.min(1, t * 5) * (t > 0.85 ? (1 - t) / 0.15 : 1);
        const a = t * Math.PI * 2 * 1.3;
        const gx = tile.x + Math.cos(a) * r * 0.9;
        const gz = tile.z + Math.sin(a) * r * 0.9;
        // Hang the beam from above the middle and point it at (gx, gz).
        const dx = gx - tile.x;
        const dz = gz - tile.z;
        const len = Math.hypot(dx, dz, H);
        beam.position.set(tile.x, H, tile.z);
        beam.scale.set(1, len, 1);
        beam.quaternion.setFromUnitVectors(up, v.set(-dx / len, H / len, -dz / len));
        (beam.material as THREE.MeshBasicMaterial).opacity = env * 0.28;
        spot.position.set(gx, 0.15, gz);
        spot.scale.set(2.2, 1, 2.2);
        (spot.material as THREE.MeshBasicMaterial).opacity = env * 0.8;
      });
      addFx(spot, 2500, () => {});
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, depthWrite: false }));
      ring.position.set(tile.x, 0.14, tile.z);
      addFx(ring, 2500, (t) => {
        const k = Math.min(1, t / 0.4);
        ring.scale.setScalar(0.5 + k * size * 1.1);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      });
    }

    // A decoy goes off: a cartoon explosion, or a toy pops out and wobbles.
    const sparkGeo = keep(new THREE.BoxGeometry(0.05, 0.05, 0.05));
    const blobGeo = keep(new THREE.IcosahedronGeometry(0.5, 1));
    const smokeRingGeo = keep(new THREE.TorusGeometry(0.5, 0.13, 6, 24).rotateX(Math.PI / 2));
    const ballGeo = keep(new THREE.SphereGeometry(0.5, 14, 10));
    const boomTex = boomTexture();
    function explodeScene(tile: Tile) {
      const y0 = tile.top + 0.1;
      const fire = new THREE.Group();
      const outer = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true }));
      const inner = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true }));
      inner.scale.setScalar(0.65);
      fire.add(outer, inner);
      fire.position.set(tile.x, y0, tile.z);
      addFx(fire, 3000, (t) => {
        const k = t / 0.16;
        const size = t < 0.16 ? easeOutBack(Math.min(1, k)) * 1.5 : 1.5 * Math.max(0, 1 - (t - 0.16) / 0.2);
        fire.scale.setScalar(size + 0.0001);
        fire.rotation.y = t * 4;
        fire.visible = size > 0.01;
      });
      const ring = new THREE.Mesh(smokeRingGeo, new THREE.MeshLambertMaterial({ color: 0xb8bec6, transparent: true, depthWrite: false }));
      ring.position.set(tile.x, y0, tile.z);
      addFx(ring, 3000, (t) => {
        const k = Math.min(1, t / 0.6);
        ring.scale.setScalar(0.4 + k * 2.4);
        ring.position.y = y0 + k * 0.3;
        (ring.material as THREE.MeshLambertMaterial).opacity = 0.85 * (1 - Math.min(1, t / 0.7));
      });
      // Puffs of smoke drifting up.
      const smokeMat = new THREE.MeshLambertMaterial({ color: 0x9aa1aa, transparent: true, depthWrite: false, flatShading: true });
      const smoke = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const b = new THREE.Mesh(blobGeo, smokeMat);
        const a = (k / 6) * Math.PI * 2;
        b.userData = { dx: Math.cos(a) * 0.3, dz: Math.sin(a) * 0.3, s: 0.5 + (k % 3) * 0.2 };
        smoke.add(b);
      }
      smoke.position.set(tile.x, y0, tile.z);
      addFx(smoke, 3000, (t) => {
        const k = Math.max(0, (t - 0.08) / 0.92);
        smoke.visible = k > 0;
        for (const b of smoke.children) {
          const u = b.userData as { dx: number; dz: number; s: number };
          b.position.set(u.dx * (1 + k * 2), 0.2 + k * 1.6, u.dz * (1 + k * 2));
          b.scale.setScalar(u.s * (0.4 + k * 1.2));
        }
        smokeMat.opacity = 0.75 * (1 - k);
      });
      // Sparks flying out.
      const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd43b });
      const sparks = new THREE.Group();
      for (let k = 0; k < 12; k++) {
        const b = new THREE.Mesh(sparkGeo, sparkMat);
        const a = Math.random() * Math.PI * 2;
        const sp = 1.6 + Math.random() * 1.8;
        b.userData = { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 2.5 };
        sparks.add(b);
      }
      sparks.position.set(tile.x, y0, tile.z);
      addFx(sparks, 3000, (t) => {
        const tt = t * 3;
        sparks.visible = tt < 0.9;
        for (const b of sparks.children) {
          const u = b.userData as { vx: number; vy: number; vz: number };
          b.position.set(u.vx * tt, u.vy * tt - 4.9 * tt * tt, u.vz * tt);
          b.rotation.set(tt * 9, tt * 7, 0);
        }
      });
      // "BOOM!"
      const word = new THREE.Sprite(new THREE.SpriteMaterial({ map: boomTex, transparent: true, depthTest: false }));
      word.renderOrder = 8;
      addFx(word, 3000, (t) => {
        const k = Math.min(1, t / 0.12);
        word.scale.set(1.6 * easeOutBack(k), 0.8 * easeOutBack(k), 1);
        word.position.set(tile.x, y0 + 1.1 + t * 0.4, tile.z);
        word.material.opacity = t > 0.7 ? (1 - t) / 0.3 : 1;
      });
    }

    function toyScene(tile: Tile, id: number) {
      const y0 = tile.top + 0.05;
      const toy = new THREE.Group();
      const duck = id % 2 === 0;
      if (duck) {
        // A rubber duck
        const yellow = new THREE.MeshLambertMaterial({ color: 0xffd43b });
        const body = new THREE.Mesh(ballGeo, yellow);
        body.scale.set(0.62, 0.44, 0.48);
        body.position.y = 0.22;
        const head = new THREE.Mesh(ballGeo, yellow);
        head.scale.setScalar(0.3);
        head.position.set(0.18, 0.52, 0);
        const beak = new THREE.Mesh(ballGeo, new THREE.MeshLambertMaterial({ color: 0xff8a1f }));
        beak.scale.set(0.16, 0.06, 0.14);
        beak.position.set(0.34, 0.5, 0);
        const tail = new THREE.Mesh(ballGeo, yellow);
        tail.scale.set(0.16, 0.18, 0.16);
        tail.position.set(-0.3, 0.36, 0);
        toy.add(body, head, beak, tail);
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: 0x1b1b1b }));
          eye.scale.setScalar(0.05);
          eye.position.set(0.27, 0.58, side * 0.08);
          toy.add(eye);
        }
      } else {
        // A teddy bear
        const fur = new THREE.MeshLambertMaterial({ color: 0xb07d48 });
        const light = new THREE.MeshLambertMaterial({ color: 0xe8c9a0 });
        const add = (m: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
          const b = new THREE.Mesh(ballGeo, m);
          b.scale.set(sx, sy, sz);
          b.position.set(x, y, z);
          toy.add(b);
        };
        add(fur, 0, 0.22, 0, 0.42, 0.46, 0.38);
        add(light, 0.12, 0.22, 0, 0.12, 0.26, 0.24);
        add(fur, 0, 0.58, 0, 0.32);
        add(light, 0.13, 0.55, 0, 0.12, 0.1, 0.13);
        for (const side of [-1, 1]) {
          add(fur, -0.02, 0.73, side * 0.12, 0.12);
          add(fur, 0.02, 0.3, side * 0.2, 0.13, 0.22, 0.13);
          add(fur, 0.08, 0.05, side * 0.11, 0.15, 0.12, 0.15);
          const eye = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: 0x1b1b1b }));
          eye.scale.setScalar(0.045);
          eye.position.set(0.14, 0.63, side * 0.06);
          toy.add(eye);
        }
      }
      toy.traverse((o) => (o.castShadow = true));
      toy.position.set(tile.x, y0, tile.z);
      const turn = Math.random() * Math.PI * 2;
      addFx(toy, 3000, (t) => {
        const pop = t < 0.12 ? easeOutBack(t / 0.12) : t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1;
        const sc = 1.3 * pop + 0.0001;
        // Squash and stretch as it bounces, wobbling side to side.
        const bounce = Math.abs(Math.sin(t * 16)) * Math.max(0, 0.6 - t) * 0.5;
        toy.scale.set(sc * (1 - bounce * 0.3), sc * (1 + bounce * 0.4), sc * (1 - bounce * 0.3));
        toy.position.y = y0 + bounce * 0.4;
        toy.rotation.set(Math.sin(t * 22) * 0.3 * (1 - t), turn + t * 1.5, Math.sin(t * 18) * 0.35 * (1 - t));
      });
      // A burst of confetti.
      const conf = new THREE.Group();
      const hues = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2];
      for (let k = 0; k < 14; k++) {
        const b = new THREE.Mesh(sparkGeo, paint(hues[k % hues.length]));
        const a = Math.random() * Math.PI * 2;
        const sp = 0.8 + Math.random() * 1.2;
        b.scale.set(1, 0.3, 0.7);
        b.userData = { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2.2 + Math.random() * 1.5 };
        conf.add(b);
      }
      conf.position.set(tile.x, y0 + 0.2, tile.z);
      addFx(conf, 3000, (t) => {
        const tt = t * 3;
        conf.visible = tt < 1.4;
        for (const b of conf.children) {
          const u = b.userData as { vx: number; vy: number; vz: number };
          b.position.set(u.vx * tt, Math.max(-0.2, u.vy * tt - 3 * tt * tt), u.vz * tt);
          b.rotation.set(tt * 8, tt * 5, tt * 3);
        }
      });
      puff(tile, 0xf783ac);
    }

    function playEvents(list: CityEvent[]) {
      for (const e of list) {
        if (seenEvents.has(e.id)) continue;
        // Things with no place on the map (respawns, new decoys...) have nothing to show.
        if (typeof e.tile !== "number" || !Number.isInteger(e.tile) || e.tile < 0) {
          seenEvents.add(e.id);
          continue;
        }
        const tile = tiles[e.tile];
        if (!tile) continue; // not built yet: try again once the city has grown
        seenEvents.add(e.id);
        // Whoever got caught keeps floating over the spot for the rest of the round.
        if (e.kind === "caught") {
          (e.detail?.hiders ?? []).forEach((h, k) => caughtFromEvents.set(`${e.id}:${k}`, { tile: e.tile!, name: h.name, avatar: h.avatar, bot: h.bot }));
        }
        if (e.ageMs > 15000) continue;
        if (e.kind === "searched") {
          const found = list.some((x) => x.kind === "caught" && x.tile === e.tile && Math.abs(x.id - e.id) <= 2);
          searchScene(tile, found);
        } else if (e.kind === "area_search") areaSearchScene(tile, Math.max(1, Math.min(3, e.detail?.radius ?? 1)));
        else if (e.kind === "decoy_found") {
          if (e.detail?.outcome === "toy") toyScene(tile, e.id);
          else explodeScene(tile);
        } else if (e.kind === "sweep") sweepScene(tile, e.detail?.radius ?? 1);
        else if (e.kind === "caught") arrestScene(tile, e.detail?.hiders ?? []);
        else if (e.kind === "moved") puff(tile, 0xffb400);
        else if (e.kind === "shielded") {
          // A shield flash: the hider blinked away to somewhere nearby.
          puff(tile, 0x9775fa);
          puff(tile, 0x9775fa, 250);
          puff(tile, 0xd0bfff, 500);
        }
      }
      drawCaught();
    }

    function updateFx(now: number) {
      fx = fx.filter((f) => {
        const t = (now - f.start) / f.dur;
        if (t >= 1) {
          fxGroup.remove(f.obj);
          f.obj.traverse((o) => {
            if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
              if (o instanceof THREE.Mesh && o.geometry !== ringGeo && !o.geometry.userData.keep) o.geometry.dispose();
              const m = o.material as THREE.Material;
              if (!m.userData.keep) m.dispose();
            }
          });
          return false;
        }
        f.step(t);
        return true;
      });
    }

    // ---- sky: day and night, weather, stars and rain
    const glassMat = meshDefs.glass.material as THREE.MeshLambertMaterial;
    const C = {
      day: new THREE.Color(SKY),
      dusk: new THREE.Color(0xf2b48a),
      night: new THREE.Color(0x0d1630),
      grey: new THREE.Color(0x9aa5b1),
      fog: new THREE.Color(0xcfd6dc),
      lampOff: new THREE.Color(0x868e96),
      lampOn: new THREE.Color(0xfff1b8),
      windowDay: new THREE.Color(0x0b1a2a),
      windowNight: new THREE.Color(0xffc970),
      frameDay: new THREE.Color(0x5c636a),
      frameNight: new THREE.Color(0xfff4d6),
      flash: new THREE.Color(0xe4e9ff),
      plotDay: new THREE.Color(0xdfe5ec),
      plotNight: new THREE.Color(0x3a4352),
      ghostDay: new THREE.Color(0x7c8da3),
      ghostNight: new THREE.Color(0x5a6a80),
    };
    const skyCol = new THREE.Color();
    let fogFactor = 0;
    let atmosT = 1;

    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(700 * 3);
    for (let k = 0; k < 700; k++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.45 + 0.08;
      starPos.set([Math.cos(a) * Math.cos(e) * 160, Math.sin(e) * 160, Math.sin(a) * Math.cos(e) * 160], k * 3);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const RAIN = 900;
    const rainPos = new Float32Array(RAIN * 6);
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.LineBasicMaterial({ color: 0xb8cce6, transparent: true, opacity: 0, depthWrite: false });
    const rain = new THREE.LineSegments(rainGeo, rainMat);
    rain.frustumCulled = false;
    rain.visible = false;
    scene.add(rain);
    const rainSpan = () => radius * 1.4 + 8;
    for (let k = 0; k < RAIN; k++) {
      const x = (Math.random() - 0.5) * 2;
      const y = Math.random() * 14;
      const z = (Math.random() - 0.5) * 2;
      rainPos.set([x, y, z, x, y - 0.35, z], k * 6);
    }

    function updateAtmosphere(dt: number) {
      atmosT += dt;
      if (atmosT < 0.25) return;
      atmosT = 0;
      const { progress, nightFirst } = atmos.current;
      const dl = daylight(progress, nightFirst);
      const w = weatherAt(currentSeed, progress);
      const cloud = w.kind === "clear" ? 0 : w.kind === "cloudy" ? 0.45 * w.strength : w.kind === "rain" ? 0.45 + 0.3 * w.strength : 0.5 * w.strength;
      if (dl > 0.5) skyCol.copy(C.dusk).lerp(C.day, (dl - 0.5) / 0.5);
      else skyCol.copy(C.night).lerp(C.dusk, dl / 0.5);
      skyCol.lerp(dl > 0.3 ? C.grey : C.night, cloud * 0.6);
      if (w.kind === "fog") skyCol.lerp(C.fog, 0.35 * w.strength * Math.max(dl, 0.25));
      (scene.background as THREE.Color).copy(skyCol);
      (scene.fog as THREE.Fog).color.copy(skyCol);
      hemi.intensity = 0.3 + 1.2 * dl * (1 - cloud * 0.35);
      sun.intensity = Math.max(0.3, 2.4 * dl * (1 - cloud * 0.7));
      sun.color.set(dl <= 0.12 ? 0x9fb4ff : dl < 0.75 ? 0xffb37a : 0xfff1dc);
      glassMat.emissive.copy(C.windowDay).lerp(C.windowNight, 1 - dl);
      glassMat.emissiveIntensity = 0.2 + (1 - dl) * 0.8;
      lampMat.color.copy(C.lampOff).lerp(C.lampOn, Math.min(1, (1 - dl) * 1.6));
      starMat.opacity = Math.max(0, (0.35 - dl) / 0.35) * (1 - cloud);
      cloudMat.color.setRGB(1 - cloud * 0.4, 1 - cloud * 0.38, 1 - cloud * 0.33);
      rain.visible = w.kind === "rain";
      rainMat.opacity = 0.45 * w.strength;
      storm = w.kind === "rain" ? w.strength : 0;
      fogFactor = w.kind === "fog" ? 0.6 * w.strength : w.kind === "rain" ? 0.25 * w.strength : 0;
      baseHemi = hemi.intensity;
      // Night lights: traffic-light pools, glowing billboards, car headlights.
      const night = Math.min(1, Math.max(0, (0.75 - dl) / 0.6));
      poolMat.opacity = 0.6 * night;
      if (pools) pools.visible = night > 0.02 && isRevealed;
      sites.setNight(night, C.windowDay, C.windowNight);
      boardGlowMat.color.copy(C.frameDay).lerp(C.frameNight, night);
      boardBeamMat.opacity = 0.2 * night;
      for (const b of boards) {
        b.mat.emissiveIntensity = 0.28 + 0.62 * night;
        b.beams.visible = night > 0.02;
      }
      carNight = night;
      // The see-through plots round the edge dim with the light (instead of glowing at night).
      plotMat.color.copy(C.plotDay).lerp(C.plotNight, night);
      ghostMat.color.copy(C.ghostDay).lerp(C.ghostNight, night);
    }

    // ---- thunder and lightning, now and then while it pours
    let storm = 0;
    let baseHemi = hemi.intensity;
    let nextStrike = 4 + Math.random() * 8;
    let strikeT = -1;
    const flashSky = new THREE.Color();
    const BOLT_PTS = 14;
    const boltPos = new Float32Array(BOLT_PTS * 2 * 3);
    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute("position", new THREE.BufferAttribute(boltPos, 3));
    const boltIdx: number[] = [];
    for (let k = 0; k < BOLT_PTS - 1; k++) boltIdx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 2, k * 2 + 1, k * 2 + 3);
    boltGeo.setIndex(boltIdx);
    const boltMat = new THREE.MeshBasicMaterial({ color: 0xf4f1ff, transparent: true, opacity: 0, fog: false, depthWrite: false, side: THREE.DoubleSide });
    const bolt = new THREE.Mesh(boltGeo, boltMat);
    bolt.frustumCulled = false;
    bolt.visible = false;
    bolt.renderOrder = 1;
    scene.add(bolt);
    function strike() {
      // A jagged bolt far off over the hills, roughly on the side we're looking at.
      const look = Math.atan2(controls.target.z - camera.position.z, controls.target.x - camera.position.x);
      const a = look + (Math.random() - 0.5) * 1.6;
      const d = radius * 1.8 + 22 + Math.random() * 25;
      let x = controls.target.x + Math.cos(a) * d;
      let z = controls.target.z + Math.sin(a) * d;
      const ground = landHeight(x, z);
      const top = ground + 34 + Math.random() * 10;
      // Ribbon across the view.
      const px = -Math.sin(look);
      const pz = Math.cos(look);
      for (let k = 0; k < BOLT_PTS; k++) {
        const f = k / (BOLT_PTS - 1);
        const y = top + (ground - top) * f;
        if (k > 0) {
          x += (Math.random() - 0.5) * 2.4 * px;
          z += (Math.random() - 0.5) * 2.4 * pz;
        }
        const wd = 0.45 * (1 - f * 0.6);
        boltPos.set([x - px * wd, y, z - pz * wd, x + px * wd, y, z + pz * wd], k * 6);
      }
      boltGeo.attributes.position.needsUpdate = true;
      strikeT = 0;
      playSfx("thunder", { delay: 0.35 + d / 140 });
    }
    function updateLightning(dt: number) {
      if (storm > 0.45) {
        nextStrike -= dt;
        if (nextStrike <= 0 && strikeT < 0) {
          strike();
          nextStrike = 7 + Math.random() * 16;
        }
      }
      if (strikeT < 0) return;
      strikeT += dt;
      // Two or three quick flickers, then gone.
      const t = strikeT;
      const f = t < 0.07 ? 1 : t < 0.13 ? 0.15 : t < 0.2 ? 0.75 : t < 0.27 ? 0.1 : t < 0.36 ? 0.55 * (1 - (t - 0.27) / 0.09) : 0;
      hemi.intensity = baseHemi + f * 2.4;
      flashSky.copy(skyCol).lerp(C.flash, f * 0.55);
      (scene.background as THREE.Color).copy(flashSky);
      (scene.fog as THREE.Fog).color.copy(flashSky);
      boltMat.opacity = Math.min(1, f * 1.4);
      bolt.visible = f > 0.02;
      if (t > 0.4) {
        strikeT = -1;
        bolt.visible = false;
        hemi.intensity = baseHemi;
        (scene.background as THREE.Color).copy(skyCol);
        (scene.fog as THREE.Fog).color.copy(skyCol);
      }
    }

    function updateRain(dt: number) {
      if (!rain.visible) return;
      const span = rainSpan();
      rain.position.set(controls.target.x, 0, controls.target.z);
      rain.scale.set(span, 1, span);
      for (let k = 0; k < RAIN; k++) {
        const i = k * 6;
        let y = rainPos[i + 1] - dt * 13;
        if (y < 0) y += 14;
        rainPos[i + 1] = y;
        rainPos[i + 4] = y - 0.35;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    // ---- the edge of the city: see-through outlines of what's about to be built
    let ghosts: THREE.Object3D[] = [];
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x7c8da3, wireframe: true, transparent: true, opacity: 0.35 });
    const plotMat = new THREE.MeshBasicMaterial({ color: 0xdfe5ec, transparent: true, opacity: 0.45, depthWrite: false });
    const craneMat = new THREE.MeshBasicMaterial({ color: 0xfab005, transparent: true, opacity: 0.5 });
    function buildGhosts(count: number) {
      for (const g of ghosts) scene.remove(g);
      ghosts = [];
      const n = Math.min(200, Math.round(8 * Math.sqrt(count) + 8));
      const frame = new THREE.InstancedMesh(geo.box, ghostMat, n);
      const plot = new THREE.InstancedMesh(geo.box, plotMat, n);
      for (let k = 0; k < n; k++) {
        const [gx, gz] = spiralXY(count + k);
        const h = 0.3 + hashish(gx * 0.13, gz) * 1.2;
        m4.compose(v.set(gx, 0.02, gz), q.identity(), s.set(0.7, h, 0.7));
        frame.setMatrixAt(k, m4);
        m4.compose(v.set(gx, 0, gz), q.identity(), s.set(0.94, 0.02, 0.94));
        plot.setMatrixAt(k, m4);
        if (k % 23 === 7) {
          const crane = new THREE.Group();
          const mast = new THREE.Mesh(geo.box, craneMat);
          mast.scale.set(0.07, 2.4, 0.07);
          const jib = new THREE.Mesh(geo.box, craneMat);
          jib.scale.set(1.3, 0.05, 0.05);
          jib.position.set(0.4, 2.4, 0);
          crane.add(mast, jib);
          crane.position.set(gx, 0, gz);
          crane.rotation.y = hashish(gx, gz) * 6;
          ghosts.push(crane);
          scene.add(crane);
        }
      }
      ghosts.push(frame, plot);
      scene.add(frame, plot);
    }

    // ---- a coin balloon, just for you: tap it to pop it
    let coin: { slot: number; obj: THREE.Group; hits: THREE.Object3D[]; born: number } | null = null;
    const coinTex = labelTexture("+", "#f5a524");
    function setBalloon(slot: number | null) {
      if (coin && coin.slot === slot) return;
      if (coin) {
        scene.remove(coin.obj);
        coin = null;
      }
      if (slot === null) return;
      const obj = new THREE.Group();
      const gold = new THREE.MeshLambertMaterial({ color: 0xffc53d, emissive: 0xb37400, emissiveIntensity: 0.35, flatShading: true });
      const envelope = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), gold);
      envelope.scale.y = 1.15;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.51, 0.45, 0.14, 14), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      band.position.y = -0.14;
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), new THREE.MeshLambertMaterial({ color: 0x8a6a4f }));
      basket.position.y = -0.8;
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: coinTex, depthTest: false }));
      tag.renderOrder = 9;
      tag.scale.setScalar(0.45);
      tag.position.y = 0.95;
      obj.add(envelope, band, basket, tag);
      scene.add(obj);
      coin = { slot, obj, hits: [envelope, band, basket], born: performance.now() };
    }
    function updateCoin(time: number) {
      if (!coin) return;
      const a = time * 0.12 + coin.slot;
      const r = Math.min(radius * 0.5, 5);
      coin.obj.position.set(controls.target.x + Math.cos(a) * r, 3.2 + Math.sin(time * 1.3) * 0.25, controls.target.z + Math.sin(a) * r);
      coin.obj.scale.setScalar(Math.min(1, (performance.now() - coin.born) / 800));
    }
    function coinUnder(clientX: number, clientY: number) {
      if (!coin) return false;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      return ray.intersectObjects(coin.hits, false).length > 0;
    }

    // ---- hover highlight and taps
    const hoverBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
      new THREE.LineBasicMaterial({ color: 0xffb400 }),
    );
    hoverBox.visible = false;
    scene.add(hoverBox);
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function tileUnder(clientX: number, clientY: number): number | null {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      if (!isRevealed) {
        // The city is hidden: use the ground.
        if (Math.abs(ray.ray.direction.y) < 1e-4) return null;
        const d = -ray.ray.origin.y / ray.ray.direction.y;
        if (d < 0) return null;
        const gx = Math.round(ray.ray.origin.x + ray.ray.direction.x * d);
        const gz = Math.round(ray.ray.origin.z + ray.ray.direction.z * d);
        return tileIndex.get(`${gx},${gz}`) ?? null;
      }
      const hits = ray.intersectObjects(Object.values(meshes), false);
      for (const h of hits) {
        // The square under the exact point touched (big buildings cover several squares).
        const byPoint = tileIndex.get(`${Math.round(h.point.x)},${Math.round(h.point.z)}`);
        if (byPoint !== undefined) return byPoint;
        const name = (h.object as THREE.InstancedMesh).userData.name as string;
        if (h.instanceId === undefined) continue;
        const p = parts[name]?.[h.instanceId];
        if (p) return p.tile;
      }
      return null;
    }

    function boardUnder(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      const boardHit = ray.intersectObjects(boardHits, false)[0];
      if (!boardHit) return null;
      const tileHit = ray.intersectObjects(Object.values(meshes), false)[0];
      if (tileHit && tileHit.distance < boardHit.distance) return null;
      const board = boards[boardHit.object.userData.board as number];
      return { id: boardHit.object.userData.billboard as string, tile: boardHit.object.userData.tile as number, adId: board?.shown ?? null };
    }

    function showHover(tile: number | null) {
      if (tile === null || (!cb.current.interactive && !chatMode)) {
        hoverBox.visible = false;
        cb.current.onHover?.(null);
        return;
      }
      const t = tiles[tile];
      if (!t) return;
      if (!isRevealed) {
        // The city is still a secret: no addresses, no shapes.
        hoverBox.visible = true;
        hoverBox.position.set(t.x, 0, t.z);
        hoverBox.scale.set(1.02, 0.3, 1.02);
        cb.current.onHover?.({ tile, label: "Building site · the city appears when the hunt starts" });
        return;
      }
      if (chatMode) {
        // Highlight the whole building, and say who's inside.
        const r = roomFor(tile);
        if (!r) {
          hoverBox.visible = false;
          cb.current.onHover?.(null);
          return;
        }
        const a = r.anchor;
        hoverBox.visible = true;
        hoverBox.position.set(a.x + (r.big ? 0.5 : 0), 0, a.z + (r.big ? 0.5 : 0));
        hoverBox.scale.set(r.big ? 2.04 : 1.04, a.top + 0.12, r.big ? 2.04 : 1.04);
        const n = roomCountsNow[r.room.id] ?? 0;
        cb.current.onHover?.({ tile: a.i, label: `${r.room.name} · ${n ? `${n} inside` : "nobody inside yet"} · tap to go in` });
        return;
      }
      hoverBox.visible = true;
      hoverBox.position.set(t.x, 0, t.z);
      hoverBox.scale.set(1.02, t.top + 0.1, 1.02);
      const what = t.station
        ? "Railway station"
        : t.kind === "structure" && t.structure
          ? STRUCTURE_LABEL[t.structure.type]
          : t.works
            ? "Road works"
            : `${KIND_LABEL[t.kind]}${t.rail ? " · under the railway" : ""}`;
      cb.current.onHover?.({ tile, label: currentPlan ? `${addressOf(currentPlan, t)} · ${what}` : what });
    }

    // ---- chat mode: buildings and balloons are chat rooms
    let chatMode = false;
    let roomCountsNow: Record<string, number> = {};
    const ROOM_LABEL: Partial<Record<Tile["kind"], string>> = {
      house: "House",
      office: "Office",
      tower: "Skyscraper",
      hospital: "Hospital",
      police: "Police station",
      fuel: "Fuel station",
      clock: "Clock tower",
      ferris: "Ferris wheel",
      stadium: "Stadium",
      park: "Park",
      plaza: "Plaza",
      trees: "Woods",
      pond: "Pond",
    };
    const OUTDOOR = new Set<Tile["kind"]>(["park", "plaza", "trees", "pond"]);
    const shortAddress = (a: string) => {
      for (const [full, short] of Object.entries(ABBREV)) {
        if (a.endsWith(` ${full}`)) return `${a.slice(0, -full.length)}${short}`;
      }
      return a;
    };
    /** The chat room a tile belongs to (big buildings: their corner tile), or null. */
    function roomFor(i: number): { room: CityRoom; anchor: Tile; big: boolean } | null {
      const t = tiles[i];
      if (!t || !currentPlan) return null;
      const rail = currentPlan.rail;
      if (t.station && rail && rail.station !== null) {
        const at = rail.along === "z" ? tileIndex.get(`${rail.at},${rail.station}`) : tileIndex.get(`${rail.station},${rail.at}`);
        const anchor = at !== undefined ? tiles[at] : t;
        return { room: { id: `b:${anchor.i}`, name: `${currentPlan.city.name} Central Station`, capacity: 500, kind: "building" }, anchor, big: false };
      }
      if (t.kind === "structure" && t.structure) {
        const at = tileIndex.get(`${t.structure.ax},${t.structure.az}`);
        const anchor = at !== undefined ? tiles[at] : t;
        return { room: { id: `b:${anchor.i}`, name: t.structure.name, capacity: 500, kind: "building" }, anchor, big: true };
      }
      const label = ROOM_LABEL[t.kind];
      if (!label) return null;
      let capacity = 50;
      if (t.kind === "house") capacity = 10;
      else if (t.kind === "office") capacity = t.top < 1.9 ? 30 : 100;
      else if (t.kind === "tower") capacity = Math.max(100, Math.min(300, 100 + Math.round(((t.top - 2) / 6) * 20) * 10));
      else if (t.kind === "hospital") capacity = 100;
      else if (t.kind === "police" || t.kind === "fuel") capacity = 30;
      else if (t.kind === "clock" || t.kind === "ferris" || t.kind === "stadium") capacity = 500;
      else if (OUTDOOR.has(t.kind)) capacity = 50;
      return { room: { id: `b:${t.i}`, name: `${shortAddress(addressOf(currentPlan, t))} · ${label}`, capacity, kind: "building" }, anchor: t, big: false };
    }
    const balloonRoom = (k: number): CityRoom => ({ id: `balloon:${k}`, name: `${BALLOON_NAMES[k] ?? `Balloon ${k + 1}`} hot-air balloon`, capacity: 1000, kind: "balloon" });

    function balloonUnder(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(balloonHits, false)[0];
      if (!hit) return null;
      const k = balloons.findIndex((b) => b.hits.includes(hit.object));
      return k >= 0 ? k : null;
    }

    // Count pills ("👥 12") over the busiest rooms (at most 40, for speed).
    type Pill = { sprite: THREE.Sprite; balloon: number };
    let pills: Pill[] = [];
    const pillGroup = new THREE.Group();
    scene.add(pillGroup);
    let pillKey = "";
    function rebuildPills() {
      const entries = chatMode
        ? Object.entries(roomCountsNow)
            .filter(([, n]) => typeof n === "number" && n > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 40)
        : [];
      // The counts often arrive as a new object with the same numbers: nothing to redo then.
      const key = `${currentSeed}|${tiles.length}|${entries.join(";")}`;
      if (key === pillKey) return;
      pillKey = key;
      for (const p of pills) {
        pillGroup.remove(p.sprite);
        p.sprite.material.dispose();
      }
      pills = [];
      for (const [id, n] of entries) {
        let balloon = -1;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pillTexture(n), depthTest: false, transparent: true, toneMapped: false }));
        sprite.center.set(0.5, 0);
        sprite.renderOrder = 9;
        if (id.startsWith("balloon:")) {
          balloon = Number(id.slice(8));
          if (!balloons[balloon]) continue;
        } else if (id.startsWith("b:")) {
          const t = tiles[Number(id.slice(2))];
          if (!t) continue;
          const big = t.kind === "structure";
          sprite.position.set(t.x + (big ? 0.5 : 0), t.top + 0.35, t.z + (big ? 0.5 : 0));
        } else continue;
        pills.push({ sprite, balloon });
        pillGroup.add(sprite);
      }
    }
    function updatePills() {
      pillGroup.visible = chatMode && isRevealed;
      if (!pillGroup.visible) return;
      for (const p of pills) {
        if (p.balloon >= 0) {
          const b = balloons[p.balloon];
          p.sprite.position.copy(b.obj.position);
          p.sprite.position.y += 0.75 * BALLOON_SCALE;
          // No label on the balloon you're riding in.
          p.sprite.visible = !(rideActive && rideK === p.balloon);
        }
        // Keep them readable at any zoom.
        const k = Math.min(2.4, Math.max(0.35, camera.position.distanceTo(p.sprite.position) * 0.045));
        p.sprite.scale.set(k * 0.95, k * 0.386, 1);
      }
    }
    function setMode(m: "game" | "chat") {
      chatMode = m === "chat";
      (hoverBox.material as THREE.LineBasicMaterial).color.set(chatMode ? 0x63e6be : 0xffb400);
      hoverBox.visible = false;
      rebuildPills();
    }
    function setRoomCounts(counts: Record<string, number>) {
      roomCountsNow = counts ?? {};
      rebuildPills();
    }

    // ---- riding a balloon: the camera flies into the basket and drifts round with it
    let rideK: number | null = null;
    let rideActive = false;
    let rideBlend = 0;
    const rideFrom = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    const saved = { pos: new THREE.Vector3(), target: new THREE.Vector3(), quat: new THREE.Quaternion() };
    const look = { yaw: 0, pitch: 0 };
    const ridePos = new THREE.Vector3();
    const rideDir = new THREE.Vector3();
    const rideQuat = new THREE.Quaternion();
    const rideM = new THREE.Matrix4();
    const lookAtV = new THREE.Vector3();
    function setRide(k: number | null) {
      if (k !== null && !balloons[k]) k = null;
      if (k === rideK) return;
      if (k !== null && !rideActive) {
        // Remember the normal view, to fly back to it later.
        saved.pos.copy(camera.position);
        saved.target.copy(controls.target);
        saved.quat.copy(camera.quaternion);
        controls.enabled = false;
        rideActive = true;
        focus = null;
      }
      if (rideActive) {
        rideFrom.pos.copy(camera.position);
        rideFrom.quat.copy(camera.quaternion);
        rideBlend = 0;
      }
      rideK = k;
      look.yaw = 0;
      look.pitch = 0;
    }
    /** Moves the camera while riding (or flying in or out). False when the normal controls are in charge. */
    function updateRide(dt: number, time: number) {
      if (!rideActive) return false;
      rideBlend = Math.min(1, rideBlend + dt / 2.8);
      const e = rideBlend * rideBlend * (3 - 2 * rideBlend);
      for (const b of balloons) b.basket.visible = !(rideK === b.k && rideBlend > 0.7);
      if (rideK !== null) {
        const b = balloons[rideK];
        balloonPose(b, time, ridePos, rideDir);
        ridePos.copy(b.obj.position);
        ridePos.y -= 0.5 * BALLOON_SCALE;
        // Look ahead and down over the city (towards a point ahead of us near the middle);
        // drag to look round a bit.
        const ax = rideDir.x * radius * 0.45 - ridePos.x;
        const az = rideDir.z * radius * 0.45 - ridePos.z;
        const yaw = Math.atan2(ax, az) + look.yaw;
        const pitch = Math.max(-0.8, Math.min(-0.22, Math.atan2(-ridePos.y, Math.hypot(ax, az)))) + look.pitch;
        lookAtV.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).add(ridePos);
        rideQuat.setFromRotationMatrix(rideM.lookAt(ridePos, lookAtV, up));
        camera.position.lerpVectors(rideFrom.pos, ridePos, e);
        camera.position.y += Math.sin(e * Math.PI) * 1.5;
        camera.quaternion.slerpQuaternions(rideFrom.quat, rideQuat, e);
      } else {
        camera.position.lerpVectors(rideFrom.pos, saved.pos, e);
        camera.quaternion.slerpQuaternions(rideFrom.quat, saved.quat, e);
        if (rideBlend >= 1) {
          rideActive = false;
          controls.enabled = true;
          controls.target.copy(saved.target);
          camera.position.copy(saved.pos);
          for (const b of balloons) b.basket.visible = true;
          return false;
        }
      }
      return true;
    }

    // ---- caught ghosts: their faces float over where they were caught, all round long
    type Caught = CaughtFace & { bot?: boolean };
    const caughtFromEvents = new Map<string, Caught>();
    let caughtProp: CaughtFace[] | undefined;
    let caughtKey = "";
    const caughtGroup = new THREE.Group();
    scene.add(caughtGroup);
    function drawCaught() {
      const list: Caught[] = caughtProp ?? [...caughtFromEvents.values()];
      const key = `${tiles.length}|${list.map((f) => `${f.tile}:${f.name ?? ""}`).join(",")}`;
      if (key === caughtKey) return;
      caughtKey = key;
      for (const c of [...caughtGroup.children]) {
        caughtGroup.remove(c);
        ((c as THREE.Sprite).material as THREE.Material).dispose();
      }
      const perTile = new Map<number, number>();
      for (const f of list.slice(-40)) {
        const t = tiles[f.tile];
        if (!t) continue;
        const n = perTile.get(f.tile) ?? 0;
        perTile.set(f.tile, n + 1);
        const tex = f.bot ? labelTexture("🤖", "#7048e8") : faceTexture(cleanAvatar(f.avatar, f.name ?? "ghost"), "#e5484d");
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
        sp.renderOrder = 6;
        sp.scale.setScalar(0.55);
        const col = n % 3;
        sp.userData = {
          x: t.x + (col === 0 ? 0 : col === 1 ? -0.42 : 0.42),
          y: t.top + 0.95 + Math.floor(n / 3) * 0.5,
          z: t.z,
          phase: (f.tile * 1.7 + n) % 6.28,
        };
        caughtGroup.add(sp);
      }
    }
    function setCaughtFaces(list: CaughtFace[] | undefined) {
      caughtProp = list;
      drawCaught();
    }
    function updateCaught(time: number) {
      caughtGroup.visible = isRevealed;
      for (const c of caughtGroup.children) {
        const u = c.userData as { x: number; y: number; z: number; phase: number };
        c.position.set(u.x, u.y + Math.sin(time * 1.6 + u.phase) * 0.08, u.z);
      }
    }

    // ---- little extras when you tap things: trees shake, parked cars honk, fountains splash
    const shakes = new Map<number, number>();
    const wobble = new THREE.Quaternion();
    const wobbleE = new THREE.Euler();
    function tapExtras(i: number) {
      const t = tiles[i];
      if (!t || !isRevealed) return;
      const fountain = t.kind === "plaza" || (t.kind === "road" && t.roundabout && t.r[1] < 0.5);
      if (fountain) {
        splashScene(t);
        playSfx("splash");
        return;
      }
      if ((t.kind === "road" && t.incident) || t.kind === "police") {
        honkScene(t);
        playSfx("honk");
        return;
      }
      if ((tileParts.get(i) ?? []).some(([n]) => n === "crown")) {
        if (!shakes.has(i)) leavesScene(t, i);
        shakes.set(i, performance.now());
        playSfx("rustle");
      }
    }
    function updateShakes(now: number) {
      if (!shakes.size) return;
      const mesh = meshes.crown;
      if (!mesh) return;
      for (const [tile, start] of shakes) {
        const k = (now - start) / 1000;
        const done = k >= 1.1;
        for (const [name, idx] of tileParts.get(tile) ?? []) {
          if (name !== "crown") continue;
          const p = parts.crown[idx];
          if (done || growing.includes(tile)) {
            writePart(mesh, idx, p, 1);
            continue;
          }
          const amp = 0.25 * (1 - k / 1.1);
          wobble.setFromEuler(wobbleE.set(Math.sin(k * 31 + idx) * amp, 0, Math.sin(k * 26 + idx * 2) * amp));
          q.setFromAxisAngle(up, p.ry);
          wobble.multiply(q);
          m4.compose(v.set(p.x, p.y, p.z), wobble, s.set(p.sx, p.sy, p.sz));
          mesh.setMatrixAt(idx, m4);
        }
        if (done) shakes.delete(tile);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    function leavesScene(t: Tile, i: number) {
      const crowns = (tileParts.get(i) ?? []).filter(([n]) => n === "crown").slice(0, 3);
      crowns.forEach(([, idx], j) => {
        const p = parts.crown[idx];
        for (let k = 0; k < 2; k++) {
          const leaf = new THREE.Mesh(sparkGeo, paint(p.color));
          const sx = (Math.random() - 0.5) * p.sx * 0.8;
          const sz = (Math.random() - 0.5) * p.sz * 0.8;
          const top = p.y + p.sy * 0.6;
          const delay = 0.1 + Math.random() * 0.2 + j * 0.05;
          const spin = Math.random() * 6;
          addFx(leaf, 2400, (u) => {
            const f = Math.max(0, u - delay / 2.4) / (1 - delay / 2.4);
            leaf.visible = u > delay / 2.4;
            const y = top - (top - 0.09) * Math.min(1, f * 1.15);
            leaf.position.set(p.x + sx + Math.sin(f * 9 + spin) * 0.12, y, p.z + sz + Math.cos(f * 7 + spin) * 0.08);
            leaf.rotation.set(f * 8 + spin, f * 5, Math.sin(f * 10) * 0.8);
            leaf.scale.set(1, 0.25, 0.8);
            leaf.scale.multiplyScalar(f > 0.85 ? Math.max(0.0001, (1 - f) / 0.15) : 1);
          });
        }
      });
    }
    function splashScene(t: Tile) {
      const y0 = t.kind === "plaza" ? 0.24 : 0.22;
      const drops = new THREE.Group();
      for (let k = 0; k < 16; k++) {
        const d = new THREE.Mesh(sparkGeo, paint(k % 2 ? 0xa5d8ff : 0xe7f5ff));
        const a = Math.random() * Math.PI * 2;
        const sp = 0.25 + Math.random() * 0.45;
        d.userData = { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 1.6 + Math.random() * 1.2 };
        drops.add(d);
      }
      drops.position.set(t.x, y0, t.z);
      addFx(drops, 1300, (u) => {
        const tt = u * 1.3;
        for (const d of drops.children) {
          const w = d.userData as { vx: number; vy: number; vz: number };
          d.position.set(w.vx * tt, Math.max(-0.05, w.vy * tt - 4 * tt * tt), w.vz * tt);
          d.scale.setScalar(0.8 * (1 - u * 0.5));
        }
      });
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x74c0fc, transparent: true, depthWrite: false }));
      ring.position.set(t.x, y0 + 0.01, t.z);
      addFx(ring, 900, (u) => {
        ring.scale.setScalar(0.2 + u * 0.7);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - u);
      });
    }
    function honkScene(t: Tile) {
      // Where the parked car is.
      let cx = t.x + 0.28;
      let cz = t.z + 0.34;
      if (t.kind === "road") {
        const side = t.r[1] < 0.5 ? 0.33 : -0.33;
        const alongX = t.mask === 10;
        cx = alongX ? t.x : t.x + side;
        cz = alongX ? t.z + side : t.z;
      }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: poolMat.map, color: 0xffd43b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(cx, 0.16, cz);
      glow.renderOrder = 6;
      addFx(glow, 1300, (u) => {
        const on = Math.sin(u * Math.PI * 8) > 0;
        glow.scale.setScalar(on ? 0.75 : 0.0001);
      });
      const hop = new THREE.Sprite(new THREE.SpriteMaterial({ map: honkTex, transparent: true, depthTest: false }));
      hop.renderOrder = 7;
      addFx(hop, 1300, (u) => {
        hop.position.set(cx, 0.55 + u * 0.4, cz);
        hop.scale.set(0.7, 0.35, 1);
        hop.material.opacity = u > 0.7 ? (1 - u) / 0.3 : 1;
      });
    }
    const honkTex = (() => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 128;
      const c = canvas.getContext("2d")!;
      c.font = "900 64px system-ui, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineWidth = 10;
      c.strokeStyle = "#ffffff";
      c.strokeText("BEEP!", 128, 66);
      c.fillStyle = "#1c7ed6";
      c.fillText("BEEP!", 128, 66);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    })();

    // ---- the secret city: a building site until the hunt starts, then the big reveal
    function setRevealed(on: boolean) {
      if (on === isRevealed) return;
      isRevealed = on;
      world.revealed = on;
      if (!on) {
        city.visible = false;
        life.visible = false;
        for (const g of ghosts) g.visible = false;
        hoverBox.visible = false;
        buildingSite.build(currentSeed, tiles.length);
        buildingSite.show(true);
        return;
      }
      // Everything rises out of the ground, from the middle outwards, in about three seconds.
      const now = performance.now();
      const far = tiles.reduce((m, t) => Math.max(m, Math.hypot(t.x, t.z)), 1);
      born = new Map();
      for (const t of tiles) born.set(t.i, now + 350 + (Math.hypot(t.x, t.z) / far) * 2200 + Math.random() * 200);
      world.born = born;
      growing = tiles.map((t) => t.i);
      for (const [name, list] of Object.entries(parts)) {
        const mesh = meshes[name];
        if (!mesh) continue;
        list.forEach((p, k) => writePart(mesh, k, p, 0));
        mesh.instanceMatrix.needsUpdate = true;
      }
      city.visible = true;
      for (const g of ghosts) g.visible = true;
      buildingSite.show(false);
      lifeAt = now + 1600;
    }

    let down: { x: number; y: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 600;
      down = null;
      if (moved > 8 || !quick) return;
      if (coin && coinUnder(e.clientX, e.clientY)) {
        // Pop! A burst of gold where the balloon was.
        const at = coin.obj.position.clone();
        const burst = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffc53d, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        burst.position.copy(at);
        addFx(burst, 700, (t) => {
          burst.scale.setScalar(0.5 + t * 3);
          burst.lookAt(camera.position);
          (burst.material as THREE.MeshBasicMaterial).opacity = 1 - t;
        });
        const slot = coin.slot;
        scene.remove(coin.obj);
        coin = null;
        cb.current.onBalloon(slot);
        return;
      }
      const board = isRevealed ? boardUnder(e.clientX, e.clientY) : null;
      if (board) {
        cb.current.onBillboard(board);
        return;
      }
      if (chatMode) {
        // Chat mode: buildings and balloons are rooms.
        const k = balloonUnder(e.clientX, e.clientY);
        if (k !== null) {
          cb.current.onRoom?.(balloonRoom(k));
          return;
        }
        const tile = tileUnder(e.clientX, e.clientY);
        if (tile === null) return;
        tapExtras(tile);
        const r = isRevealed ? roomFor(tile) : null;
        if (r) {
          showHover(tile);
          cb.current.onRoom?.(r.room);
        }
        return;
      }
      const tile = tileUnder(e.clientX, e.clientY);
      if (tile === null) return;
      tapExtras(tile);
      if (!cb.current.interactive) return;
      showHover(tile);
      cb.current.onTile(tile);
    };
    let hoverQueued: PointerEvent | null = null;
    let lastDrag: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && !down) hoverQueued = e;
      // Riding a balloon: drag to look round.
      if (down && rideActive && rideK !== null) {
        if (lastDrag) {
          look.yaw = Math.max(-2.6, Math.min(2.6, look.yaw - (e.clientX - lastDrag.x) * 0.006));
          look.pitch = Math.max(-0.7, Math.min(0.5, look.pitch + (e.clientY - lastDrag.y) * 0.004));
        }
        lastDrag = { x: e.clientX, y: e.clientY };
      } else lastDrag = null;
    };
    const onLeave = () => showHover(null);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    // ---- size and loop
    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Traffic lights cycle every 10 s: one direction green, then amber, then the other's turn.
    const SIGNAL_ON = [new THREE.Color(0xff3b30), new THREE.Color(0xffb020), new THREE.Color(0x2fd158)];
    const SIGNAL_OFF = new THREE.Color(0x2b2f33);
    function updateSignals(time: number) {
      const mesh = meshes.signal;
      if (!mesh || !signalTags.length) return;
      const c = time % 10;
      const phase = c < 4 ? 0 : c < 5 ? 1 : c < 9 ? 2 : 3;
      if (phase === signalPhase) return;
      signalPhase = phase;
      // Which bulb is lit for each direction in this phase (0 red, 1 amber, 2 green).
      const lit = [[2, 0], [1, 0], [0, 2], [0, 1]][phase];
      signalTags.forEach((tag, k) => {
        const axis = Math.floor(tag / 3);
        const bulb = tag % 3;
        mesh.setColorAt(k, bulb === lit[axis] ? SIGNAL_ON[bulb] : SIGNAL_OFF);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (pools) {
        for (let k = 0; k < poolAxis.length; k++) pools.setColorAt(k, SIGNAL_ON[lit[poolAxis[k]]]);
        if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
      }
    }

    const clock = new THREE.Clock();
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.1);
      const time = clock.elapsedTime;
      const now = performance.now();
      if (hoverQueued) {
        const balloonK = chatMode ? balloonUnder(hoverQueued.clientX, hoverQueued.clientY) : null;
        const board = balloonK === null && isRevealed ? boardUnder(hoverQueued.clientX, hoverQueued.clientY) : null;
        renderer.domElement.style.cursor = board || balloonK !== null ? "pointer" : "";
        if (balloonK !== null) {
          const room = balloonRoom(balloonK);
          const n = roomCountsNow[room.id] ?? 0;
          hoverBox.visible = false;
          cb.current.onHover?.({ tile: -1, label: `${room.name} · ${n ? `${n} aboard` : "nobody aboard yet"} · tap to climb in` });
        } else if (board) {
          const t = tiles[board.tile];
          const ad = board.adId ? adsList.find((a) => a.id === board.adId) : null;
          const where = t && currentPlan ? addressOf(currentPlan, t) : "this spot";
          cb.current.onHover?.({ tile: board.tile, label: ad ? `${ad.brand}: ${ad.headline} · tap to see more` : `Billboard at ${where} · your ad here, tap to find out more` });
        } else showHover(tileUnder(hoverQueued.clientX, hoverQueued.clientY));
        hoverQueued = null;
      }
      world.night = carNight;
      world.rain = storm;
      world.progress = atmos.current.progress;
      life.visible = isRevealed && now >= lifeAt;
      updateGrowth(now);
      updateShakes(now);
      if (life.visible) {
        updateCars(dt, time);
        updateLandmarks(dt, now);
        updateBoards(dt, time, now);
        updateBoats(time, dt);
        people.update(dt, now);
        trains.update(dt, now);
        plumes.update(time, now);
        sites.update(now);
      }
      updateSignals(time);
      updateSky(time, dt);
      updateFlashers(time);
      updateAir(time, dt);
      buildingSite.update(dt, now);
      updateFx(now);
      updateAtmosphere(dt);
      updateLightning(dt);
      updateRain(dt);
      updateCoin(time);
      updateMarkers(time);
      updateCaught(time);
      // Chat mode: the city dims a little so the rooms' counts stand out.
      const exposure = chatMode ? 0.8 : 1.05;
      renderer.toneMappingExposure += (exposure - renderer.toneMappingExposure) * Math.min(1, dt * 3);
      const riding = updateRide(dt, time);
      if (!riding) {
        if (focus) {
          controls.target.lerp(focus, 0.06);
          if (controls.target.distanceTo(focus) < 0.05) focus = null;
        }
        controls.update();
      }
      updatePills();
      const dist = riding ? 10 : camera.position.distanceTo(controls.target);
      const fog = scene.fog as THREE.Fog;
      fog.near = (dist + radius * 0.8) * (1 - fogFactor * 0.45);
      fog.far = (dist + radius * 4 + 30) * (1 - fogFactor * 0.3);
      renderer.render(scene, camera);
    };
    loop();

    // Coming back to the game: stop drawing while the page is hidden (saves battery and keeps
    // the phone from throttling us), and pick straight up again when it's visible. If the phone
    // dropped the 3D canvas while we were away, three.js restores it; we just restart drawing.
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (document.visibilityState === "visible") {
        clock.getDelta();
        loop();
      }
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frame);
    };
    const onRestored = () => {
      clock.getDelta();
      loop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    renderer.domElement.addEventListener("webglcontextlost", onLost);
    renderer.domElement.addEventListener("webglcontextrestored", onRestored);

    api.current = { build, setMarkers, playEvents, setBalloon, setAds, setRevealed, setRoomCounts, setRide, setCaughtFaces, setMode };

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      // Send off any ad views not reported yet.
      flushViews(performance.now());
      for (const entry of adCache.values()) entry.tex?.dispose();
      adCache.clear();
      birds.dispose();
      people.dispose();
      trains.dispose();
      plumes.dispose();
      sites.dispose();
      buildingSite.dispose();
      for (const p of pills) p.sprite.material.dispose();
      disposePills();
      bannerTex.dispose();
      honkTex.dispose();
      for (const t of boardTextures) t.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onRestored);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
        }
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
      api.current = null;
    };
  }, []);

  useEffect(() => {
    api.current?.build(seed, tileCount);
  }, [seed, tileCount]);

  useEffect(() => {
    api.current?.setMarkers(markers);
  }, [markers]);

  useEffect(() => {
    api.current?.playEvents(events);
  }, [events, tileCount]);

  useEffect(() => {
    api.current?.setBalloon(coinBalloon);
  }, [coinBalloon]);

  useEffect(() => {
    api.current?.setAds(ads ?? []);
  }, [ads]);

  useEffect(() => {
    api.current?.setRevealed(revealed);
  }, [revealed]);

  useEffect(() => {
    api.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    api.current?.setRoomCounts(roomCounts ?? {});
  }, [roomCounts]);

  useEffect(() => {
    api.current?.setRide(ride);
  }, [ride]);

  useEffect(() => {
    api.current?.setCaughtFaces(caughtFaces);
  }, [caughtFaces, tileCount]);

  return <div ref={host} className="absolute inset-0" />;
}
