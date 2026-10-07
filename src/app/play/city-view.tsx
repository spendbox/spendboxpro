"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { addressOf, KIND_LABEL, makePlan, riverCentre, STRUCTURE_LABEL, tileAt, type CityPlan, type Tile } from "@/lib/city/layout";

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
};

/** Something that just happened, for a short animation (see GameEvent). */
export type CityEvent = { id: number; kind: string; tile: number; ageMs: number; detail?: { radius?: number } | null };

type Props = {
  seed: number;
  tileCount: number;
  markers: CityMarkers;
  events: CityEvent[];
  interactive: boolean;
  onTile: (tile: number) => void;
  onBillboard: (info: { id: string; tile: number }) => void;
  onHover?: (info: { tile: number; label: string } | null) => void;
};

type Part = { tile: number; x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; color: number; tilt?: number };

const SKY = 0xd7ebf7;
const GROUND = 0xd3e4c8;
const ASPHALT = 0x5b6470;
const SIDEWALK = 0xf3f1ec;
const GRASS = 0xa8d79a;
const WATER = 0x7cc4e8;
const BRIDGE_TOP = 0.24;

// ---------------------------------------------------------------- shapes
function geometries() {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roof = new THREE.CylinderGeometry(0, 1, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const crown = new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0);
  const trunk = new THREE.CylinderGeometry(0.05, 0.07, 1, 5).translate(0, 0.5, 0);
  const disc = new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0);
  // A bird: two wings in a V. Scaling it up and down on y makes it flap.
  const bird = new THREE.BufferGeometry();
  bird.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0.12, -0.32, 0.12, -0.05, 0, 0, -0.08, 0, 0, 0.12, 0, 0, -0.08, 0.32, 0.12, -0.05], 3),
  );
  bird.computeVertexNormals();
  // Half a ring, standing up: the arch under a bridge.
  const arch = new THREE.TorusGeometry(0.29, 0.035, 6, 18, Math.PI);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0);
  const cone = new THREE.ConeGeometry(0.5, 1, 16).translate(0, 0.5, 0);
  const dome = new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  return { box, roof, crown, trunk, disc, bird, arch, cyl, cone, dome };
}

// ---------------------------------------------------------------- what stands on a tile
function partsFor(t: Tile, plan: CityPlan, add: (mesh: string, p: Omit<Part, "tile">) => void) {
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
    add("ground", { x, y: 0, z, sx: 1, sy: 0.06, sz: 1, ry: 0, color: ASPHALT });
    if (t.road !== "cross") {
      const along = t.road === "x";
      for (const o of [-0.25, 0.25]) {
        add("paint", { x: x + (along ? o : 0), y: 0.061, z: z + (along ? 0 : o), sx: along ? 0.22 : 0.04, sy: 0.005, sz: along ? 0.04 : 0.22, ry: 0, color: 0xffffff });
      }
    } else {
      add("ground", { x, y: 0, z, sx: 0.5, sy: 0.062, sz: 0.5, ry: 0, color: 0x6a7380 });
    }
    return;
  }

  const GREEN_LOTS = ["park", "trees", "pond", "ferris", "turbine", "watertower", "mast"];
  const greenStructure = t.kind === "structure" && ["funfair", "solar", "campus"].includes(t.structure!.type);
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
      // A building going up; the crane's arm is added separately so it can turn.
      B(-0.06, 0.08, 0.05, 0.62, 1.1, 0.6, 0xced4da);
      B(-0.06, 1.18, 0.05, 0.62, 0.3, 0.6, 0xffd43b, 0, "glass");
      B(0.32, 0.08, -0.32, 0.08, 3.0, 0.08, 0xfab005);
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

type BoxFn = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry?: number, mesh?: string, tilt?: number) => void;
type TreeFn = (dx: number, dz: number, size: number, v: number) => void;

/** The big 2×2 buildings, drawn from their corner tile (the block's centre is at +0.5, +0.5). */
function structureParts(t: Tile, plan: CityPlan, B: BoxFn, tree: TreeFn) {
  const st = t.structure!;
  const pal = plan.palette;
  const r = t.r;
  const pick = (list: number[], v: number) => list[Math.floor(v * list.length) % list.length];
  const c = 0.5; // centre offset
  const floor = st.type === "funfair" || st.type === "solar" || st.type === "campus" ? GRASS : 0xe7e1d5;
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

/** Artwork for the four billboard designs ("your ad here"), drawn on a canvas. */
function billboardTexture(design: number) {
  const canvas = document.createElement("canvas");
  canvas.width = design === 2 ? 1024 : 512;
  canvas.height = 256;
  const c = canvas.getContext("2d")!;
  const font = (size: number, weight = 800) => `${weight} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  if (design === 0) {
    c.fillStyle = "#ffd43b";
    c.fillRect(0, 0, 512, 256);
    c.fillStyle = "#18202b";
    c.font = font(64);
    c.fillText("YOUR AD HERE", 256, 105);
    c.font = font(30, 600);
    c.fillText("Tap to advertise", 256, 175);
  } else if (design === 1) {
    c.fillStyle = "#1c2541";
    c.fillRect(0, 0, 512, 256);
    c.fillStyle = "#ffc53d";
    c.font = font(58);
    c.fillText("ADVERTISE", 256, 92);
    c.fillText("HERE", 256, 152);
    c.fillStyle = "#ffffff";
    c.font = font(24, 600);
    c.fillText("Tap this billboard", 256, 210);
  } else if (design === 2) {
    const grad = c.createLinearGradient(0, 0, 1024, 256);
    grad.addColorStop(0, "#7048e8");
    grad.addColorStop(0.5, "#e64980");
    grad.addColorStop(1, "#7048e8");
    c.fillStyle = grad;
    c.fillRect(0, 0, 1024, 256);
    c.fillStyle = "#ffffff";
    c.font = font(72);
    c.fillText("YOUR BRAND HERE  ✦  TAP TO ADVERTISE  ✦", 512, 128);
  } else {
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, 512, 256);
    c.strokeStyle = "#e5484d";
    c.lineWidth = 18;
    c.strokeRect(9, 9, 494, 238);
    c.fillStyle = "#e5484d";
    c.font = font(70);
    c.fillText("AD SPACE", 256, 110);
    c.fillStyle = "#18202b";
    c.font = font(30, 600);
    c.fillText("Tap to book", 256, 180);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (design === 2) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = 0.5;
  }
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

const hashish = (v: number, k: number) => {
  const s = Math.sin(v * 9301 + k * 49297) * 233280;
  return s - Math.floor(s);
};

const easeOutBack = (t: number) => {
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// ---------------------------------------------------------------- component
export function CityView({ seed, tileCount, markers, events, interactive, onTile, onBillboard, onHover }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    build: (seed: number, count: number) => void;
    setMarkers: (m: CityMarkers) => void;
    playEvents: (e: CityEvent[]) => void;
  } | null>(null);
  const cb = useRef({ onTile, onHover, onBillboard, interactive });
  useEffect(() => {
    cb.current = { onTile, onHover, onBillboard, interactive };
  });

  // Set up the scene once.
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    scene.add(new THREE.HemisphereLight(0xeef7ff, 0xc9d3c0, 1.5));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    const base = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: GROUND }));
    base.receiveShadow = true;
    base.position.y = -0.01;
    scene.add(base);

    const geo = geometries();
    const mat = (opts: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, ...opts });
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
      water: { geometry: geo.box, material: new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 90, specular: 0xffffff }), shadow: false },
    };

    const city = new THREE.Group();
    scene.add(city);
    const moving = new THREE.Group();
    scene.add(moving);
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);
    const fxGroup = new THREE.Group();
    scene.add(fxGroup);

    let meshes: Record<string, THREE.InstancedMesh> = {};
    let parts: Record<string, Part[]> = {};
    let tiles: Tile[] = [];
    let kindAt = new Map<string, Tile["kind"]>();
    let tileIndex = new Map<string, number>();
    let currentPlan: CityPlan | null = null;
    let currentSeed = -1;
    let born = new Map<number, number>(); // tile → time it started rising
    let growing: number[] = [];
    let tileParts = new Map<number, [string, number][]>();
    let radius = 10;
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

    // ---- cars: each drives back and forth along one road line
    type Car = { line: { axis: "x" | "z"; at: number; min: number; max: number }; pos: number; speed: number; lane: number };
    let cars: Car[] = [];
    let carBody: THREE.InstancedMesh | null = null;
    let carTop: THREE.InstancedMesh | null = null;

    function buildCars(plan: CityPlan) {
      if (carBody) moving.remove(carBody, carTop!);
      const lines = new Map<string, { axis: "x" | "z"; at: number; min: number; max: number }>();
      for (const t of tiles) {
        if (t.kind !== "road" && t.kind !== "bridge") continue;
        if (t.road === "x" || t.road === "cross") {
          const k = `x${t.z}`;
          const l = lines.get(k) ?? { axis: "x" as const, at: t.z, min: t.x, max: t.x };
          l.min = Math.min(l.min, t.x);
          l.max = Math.max(l.max, t.x);
          lines.set(k, l);
        }
        if (t.road === "z" || t.road === "cross") {
          const k = `z${t.x}`;
          const l = lines.get(k) ?? { axis: "z" as const, at: t.x, min: t.z, max: t.z };
          l.min = Math.min(l.min, t.z);
          l.max = Math.max(l.max, t.z);
          lines.set(k, l);
        }
      }
      cars = [];
      for (const l of lines.values()) {
        const len = l.max - l.min;
        if (len < 3) continue;
        const n = Math.min(4, Math.max(1, Math.round(len / 6)));
        for (let k = 0; k < n; k++) {
          const dir = (k + l.at) % 2 === 0 ? 1 : -1;
          cars.push({ line: l, pos: l.min + Math.random() * len, speed: dir * (0.8 + Math.random() * 0.9), lane: dir * 0.14 });
        }
      }
      cars = cars.slice(0, 140);
      carBody = new THREE.InstancedMesh(geo.box, mat(), Math.max(1, cars.length));
      carTop = new THREE.InstancedMesh(geo.box, mat({ color: 0xe9f2fb }), Math.max(1, cars.length));
      carBody.castShadow = true;
      cars.forEach((_, k) => carBody!.setColorAt(k, color.setHex(plan.palette.car[k % plan.palette.car.length])));
      carBody.count = carTop.count = cars.length;
      moving.add(carBody, carTop);
    }

    function updateCars(dt: number) {
      if (!carBody || !carTop) return;
      cars.forEach((c, k) => {
        c.pos += c.speed * dt;
        if (c.pos > c.line.max + 0.4) c.pos = c.line.min - 0.4;
        if (c.pos < c.line.min - 0.4) c.pos = c.line.max + 0.4;
        const alongX = c.line.axis === "x";
        const x = alongX ? c.pos : c.line.at + c.lane;
        const z = alongX ? c.line.at - c.lane : c.pos;
        // Ride up onto bridges; hide where the road line is interrupted (water, park...).
        const under = kindAt.get(`${Math.round(x)},${Math.round(z)}`);
        // Over a bridge, follow its hump.
        const off = Math.abs((alongX ? x : z) - Math.round(alongX ? x : z));
        const y = under === "bridge" ? 0.06 + (BRIDGE_TOP - 0.06) * Math.min(1, Math.max(0, (0.5 - off) / 0.3)) : 0.06;
        const shown = under === "road" || under === "bridge" ? 1 : 0.0001;
        q.setFromAxisAngle(up, alongX ? 0 : Math.PI / 2);
        m4.compose(v.set(x, y, z), q, s.set(0.3 * shown, 0.09 * shown, 0.15 * shown));
        carBody!.setMatrixAt(k, m4);
        m4.compose(v.set(x - (alongX ? 0.02 * Math.sign(c.speed) : 0), y + 0.09, z - (alongX ? 0 : 0.02 * Math.sign(c.speed))), q, s.set(0.16 * shown, 0.06 * shown, 0.13 * shown));
        carTop!.setMatrixAt(k, m4);
      });
      carBody.instanceMatrix.needsUpdate = true;
      carTop.instanceMatrix.needsUpdate = true;
    }

    // ---- birds and clouds
    const BIRDS = 18;
    const birds = new THREE.InstancedMesh(geo.bird, new THREE.MeshLambertMaterial({ color: 0x3d4752, side: THREE.DoubleSide }), BIRDS);
    const birdData = Array.from({ length: BIRDS }, (_, k) => ({
      flock: k % 3,
      offset: (k % 6) * 0.5,
      phase: Math.random() * 10,
      spread: 0.6 + Math.random() * 1.2,
    }));
    moving.add(birds);

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
      birdData.forEach((b, k) => {
        const a = time * 0.12 + b.flock * 2.1 - b.offset * 0.08;
        const R = radius * 0.6 + b.flock * 3;
        const x = Math.cos(a) * R + Math.cos(b.phase) * b.spread;
        const z = Math.sin(a) * R + Math.sin(b.phase) * b.spread;
        const y = 6 + b.flock * 1.6 + Math.sin(time * 0.8 + b.phase) * 0.4;
        q.setFromAxisAngle(up, -a);
        const flap = 0.4 + Math.abs(Math.sin(time * 9 + b.phase)) * 1.4;
        m4.compose(v.set(x, y, z), q, s.set(1, flap, 1));
        birds.setMatrixAt(k, m4);
      });
      birds.instanceMatrix.needsUpdate = true;
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
    // ---- billboards: the city's ad space. Tap one to advertise on it.
    const boardTextures = [0, 1, 2, 3].map((d) => billboardTexture(d));
    const boardMats = boardTextures.map((tex, d) =>
      d === 2
        ? new THREE.MeshBasicMaterial({ map: tex })
        : new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveIntensity: 0.12, emissiveMap: tex }),
    );
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x495057 });
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x343a40 });
    let boards: { obj: THREE.Group; tile: number }[] = [];
    let boardHits: THREE.Mesh[] = [];
    function buildBillboard(t: Tile) {
      const b = t.billboard!;
      const g = new THREE.Group();
      // Sizes per design: [panel width, panel height, panel centre height, poles]
      const spec = [
        { w: 0.95, h: 0.46, y: 0.95, poles: [-0.3, 0.3] },
        { w: 0.9, h: 0.44, y: 1.5, poles: [0] },
        { w: 0.78, h: 0.5, y: 0.75, poles: [-0.28, 0.28] },
        { w: 0.5, h: 0.34, y: 0.6, poles: [0] },
      ][b.design];
      for (const px of spec.poles) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(px === 0 ? 0.05 : 0.025, px === 0 ? 0.06 : 0.03, spec.y, 8), poleMat);
        pole.position.set(px, spec.y / 2 + 0.08, 0);
        pole.castShadow = true;
        g.add(pole);
      }
      const frame = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.05, spec.h + 0.05, 0.04), frameMat);
      frame.position.y = spec.y + 0.08;
      frame.castShadow = true;
      g.add(frame);
      for (const side of [1, -1]) {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.h), boardMats[b.design]);
        face.position.set(0, spec.y + 0.08, side * 0.021);
        if (side < 0) face.rotation.y = Math.PI;
        face.userData = { billboard: b.id, tile: t.i };
        g.add(face);
        boardHits.push(face);
      }
      if (b.design === 1) {
        const walk = new THREE.Mesh(new THREE.BoxGeometry(spec.w, 0.02, 0.12), poleMat);
        walk.position.set(0, spec.y + 0.08 - spec.h / 2 - 0.04, 0.06);
        g.add(walk);
      }
      if (b.design === 3) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe8a3 }));
        lamp.position.set(0, spec.y + 0.08 + spec.h / 2 + 0.06, 0.05);
        g.add(lamp);
      }
      // Stand at the road edge of the tile, facing the road.
      const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][b.face];
      g.position.set(t.x + dir[0] * 0.28, 0, t.z + dir[1] * 0.28);
      g.rotation.y = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][b.face];
      return g;
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
      moving.add(obj);
    }

    function buildLandmarks() {
      for (const l of landmarks) moving.remove(l.obj);
      landmarks = [];
      for (const b of boards) moving.remove(b.obj);
      boards = [];
      boardHits = [];
      for (const t of tiles) {
        if (t.kind === "billboard") {
          const obj = buildBillboard(t);
          boards.push({ obj, tile: t.i });
          moving.add(obj);
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
          landmarks.push({ obj, spin: jib, tile: t.i, speed: 0.15, axis: "y" });
          moving.add(obj);
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
          moving.add(obj);
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
          moving.add(obj);
        }
      }
    }
    function updateLandmarks(dt: number, now: number) {
      boardTextures[2].offset.x = (boardTextures[2].offset.x + dt * 0.12) % 1;
      for (const b of boards) {
        const t = Math.min(1, Math.max(0, (now - (born.get(b.tile) ?? 0)) / 700));
        b.obj.scale.setScalar(Math.max(0.0001, t));
      }
      for (const l of landmarks) {
        if (l.axis === "y") l.spin.rotation.y += l.speed * dt;
        else l.spin.rotation.z += l.speed * dt;
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
      for (const b of boats) moving.remove(b.obj);
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
        moving.add(obj);
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
    const balloons = balloonColors.map((c, k) => {
      const g = new THREE.Group();
      const envelope = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
      envelope.scale.y = 1.15;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.38, 0.12, 12), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      band.position.y = -0.12;
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), new THREE.MeshLambertMaterial({ color: 0x8a6a4f }));
      basket.position.y = -0.68;
      g.add(envelope, band, basket);
      g.userData = { a: (k / balloonColors.length) * Math.PI * 2, r: 0.5 + (k % 3) * 0.25, h: 4.5 + (k % 3) * 1.4, speed: 0.025 + k * 0.006 };
      moving.add(g);
      return g;
    });
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
        const u = b.userData;
        u.a += u.speed * dt;
        b.position.set(Math.cos(u.a) * radius * u.r, u.h + Math.sin(time * 0.6 + u.a * 5) * 0.25, Math.sin(u.a) * radius * u.r);
      }
      for (const p of planes) {
        const u = p.userData;
        u.t += dt / 26;
        if (u.t > 1) {
          u.t = 0;
          u.angle += 1.9;
        }
        const span = radius * 3 + 30;
        const dir = new THREE.Vector3(Math.cos(u.angle), 0, Math.sin(u.angle));
        p.position.copy(dir).multiplyScalar((u.t - 0.5) * span).add(new THREE.Vector3(-dir.z * 4, 15 + radius * 0.3, dir.x * 4));
        p.rotation.y = -u.angle;
        (u.light as THREE.Mesh).visible = Math.sin(time * 6) > 0.6;
      }
    }

    // ---- build / grow the city
    function build(newSeed: number, count: number) {
      const sameCity = newSeed === currentSeed;
      if (!sameCity) {
        born = new Map();
        framed = false;
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

      radius = tiles.reduce((m, t) => Math.max(m, Math.abs(t.x), Math.abs(t.z)), 4) + 1.5;
      base.scale.setScalar(radius * 8 + 120);
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
      buildLandmarks();
      buildBoats(plan);
      setMarkers(lastMarkers);
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
    let lastMarkers: CityMarkers = { searchedEmpty: [], searchedHit: [], caught: [], left: [], me: null, sweeps: [], pending: null, recent: [], locked: [] };
    const pulsers: { obj: THREE.Object3D; kind: "pulse" | "bob" | "spin" | "flash"; base: number }[] = [];
    const glassBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const markerGeo = {
      pinHead: new THREE.SphereGeometry(0.14, 16, 12),
      pinStick: new THREE.ConeGeometry(0.06, 0.32, 10).rotateX(Math.PI),
      ring: new THREE.TorusGeometry(0.36, 0.05, 8, 32).rotateX(Math.PI / 2),
      beam: new THREE.CylinderGeometry(0.22, 0.22, 1, 24, 1, true).translate(0, 0.5, 0),
      gem: new THREE.OctahedronGeometry(0.22),
      square: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      cross: new THREE.BoxGeometry(0.42, 0.04, 0.08),
    };
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
        const gem = new THREE.Mesh(markerGeo.gem, new THREE.MeshLambertMaterial({ color: 0x12b886, emissive: 0x12b886, emissiveIntensity: 0.4 }));
        gem.scale.setScalar(1.6);
        gem.position.y = topOf(m.me) + 1.2;
        g.add(beam, gem);
        g.position.set(posOf(m.me).x, 0, posOf(m.me).z);
        markerGroup.add(g);
        pulsers.push({ obj: gem, kind: "bob", base: gem.position.y });
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
          p.obj.rotation.y = time * 1.5;
        }
        if (p.kind === "spin") ((p.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.abs(Math.sin(time * 5)) * 0.3;
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

    function makeWalker(kind: number) {
      const g = new THREE.Group();
      if (kind === 2) {
        // Dog
        const fur = fxMat(0xa0703c);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.08), fur);
        body.position.y = 0.11;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.07), fur);
        head.position.set(0.12, 0.16, 0);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), fur);
        tail.position.set(-0.12, 0.15, 0);
        tail.rotation.z = 0.6;
        g.add(body, head, tail);
        for (const [lx, lz] of [[0.07, 0.03], [0.07, -0.03], [-0.07, 0.03], [-0.07, -0.03]]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.08, 0.025), fur);
          leg.position.set(lx, 0.04, lz);
          g.add(leg);
        }
      } else {
        // Person (kind 0) or soldier (kind 1)
        const shirt = kind === 1 ? 0x5c7a3a : [0x4dabf7, 0xff6b6b, 0xffd43b, 0x845ef7][Math.floor(Math.random() * 4)];
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.18, 8), fxMat(shirt));
        body.position.y = 0.17;
        const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 8), fxMat(kind === 1 ? 0x4a5d2f : 0x343a40));
        legs.position.y = 0.045;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), fxMat(0xf1c27d));
        head.position.y = 0.3;
        g.add(body, legs, head);
        if (kind === 1) {
          const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), fxMat(0x4a5d2f));
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
      addFx(walker, 4200, (t) => {
        // Walk two sides of the tile, pause and look around, then leave.
        const walk = Math.min(1, t / 0.6) * 2;
        const a = corners[(start + Math.floor(walk)) % 4];
        const b = corners[(start + Math.floor(walk) + 1) % 4];
        const f = walk % 1;
        const px = a[0] + (b[0] - a[0]) * (walk >= 2 ? 1 : f);
        const pz = a[1] + (b[1] - a[1]) * (walk >= 2 ? 1 : f);
        walker.position.set(tile.x + px, 0.08 + (t < 0.6 ? Math.abs(Math.sin(t * 60)) * 0.02 : 0), tile.z + pz);
        walker.rotation.y = t < 0.6 ? Math.atan2(-(b[1] - a[1]), b[0] - a[0]) : Math.sin(t * 20) * 1.2;
        const fade = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
        walker.scale.setScalar(1.5 * Math.min(1, t * 8) * fade + 0.0001);
      });
      if (!found) {
        puff(tile, 0x8b95a1, 2600);
        const q = new THREE.Sprite(new THREE.SpriteMaterial({ map: unknownTex, transparent: true, depthTest: false }));
        q.renderOrder = 6;
        addFx(q, 4200, (t) => {
          const k = Math.max(0, (t - 0.6) / 0.4);
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

    function arrestScene(tile: Tile) {
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

    function playEvents(list: CityEvent[]) {
      for (const e of list) {
        if (seenEvents.has(e.id)) continue;
        const tile = tiles[e.tile];
        if (!tile) continue;
        seenEvents.add(e.id);
        if (e.ageMs > 15000) continue;
        if (e.kind === "searched") {
          const found = list.some((x) => x.kind === "caught" && x.tile === e.tile && Math.abs(x.id - e.id) <= 2);
          searchScene(tile, found);
        } else if (e.kind === "sweep") sweepScene(tile, e.detail?.radius ?? 1);
        else if (e.kind === "caught") arrestScene(tile);
        else if (e.kind === "moved") puff(tile, 0xffb400);
      }
    }

    function updateFx(now: number) {
      fx = fx.filter((f) => {
        const t = (now - f.start) / f.dur;
        if (t >= 1) {
          fxGroup.remove(f.obj);
          f.obj.traverse((o) => {
            if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
              if (o instanceof THREE.Mesh && o.geometry !== ringGeo) o.geometry.dispose();
              (o.material as THREE.Material).dispose();
            }
          });
          return false;
        }
        f.step(t);
        return true;
      });
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
      return { id: boardHit.object.userData.billboard as string, tile: boardHit.object.userData.tile as number };
    }

    function showHover(tile: number | null) {
      if (tile === null || !cb.current.interactive) {
        hoverBox.visible = false;
        cb.current.onHover?.(null);
        return;
      }
      const t = tiles[tile];
      hoverBox.visible = true;
      hoverBox.position.set(t.x, 0, t.z);
      hoverBox.scale.set(1.02, t.top + 0.1, 1.02);
      const what = t.kind === "structure" && t.structure ? STRUCTURE_LABEL[t.structure.type] : KIND_LABEL[t.kind];
      cb.current.onHover?.({ tile, label: currentPlan ? `${addressOf(currentPlan, t)} · ${what}` : what });
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
      const board = boardUnder(e.clientX, e.clientY);
      if (board) {
        cb.current.onBillboard(board);
        return;
      }
      if (!cb.current.interactive) return;
      const tile = tileUnder(e.clientX, e.clientY);
      if (tile !== null) {
        showHover(tile);
        cb.current.onTile(tile);
      }
    };
    let hoverQueued: PointerEvent | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && !down) hoverQueued = e;
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

    const clock = new THREE.Clock();
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.1);
      const time = clock.elapsedTime;
      if (hoverQueued) {
        const board = boardUnder(hoverQueued.clientX, hoverQueued.clientY);
        renderer.domElement.style.cursor = board ? "pointer" : "";
        if (board) {
          const t = tiles[board.tile];
          cb.current.onHover?.({ tile: board.tile, label: `Billboard at ${t && currentPlan ? addressOf(currentPlan, t) : "this spot"} · tap to advertise` });
        }
        else showHover(tileUnder(hoverQueued.clientX, hoverQueued.clientY));
        hoverQueued = null;
      }
      updateGrowth(performance.now());
      updateCars(dt);
      updateSky(time, dt);
      updateLandmarks(dt, performance.now());
      updateBoats(time, dt);
      updateAir(time, dt);
      updateFx(performance.now());
      updateMarkers(time);
      if (focus) {
        controls.target.lerp(focus, 0.06);
        if (controls.target.distanceTo(focus) < 0.05) focus = null;
      }
      controls.update();
      const dist = camera.position.distanceTo(controls.target);
      const fog = scene.fog as THREE.Fog;
      fog.near = dist + radius * 0.8;
      fog.far = dist + radius * 4 + 30;
      renderer.render(scene, camera);
    };
    loop();

    api.current = { build, setMarkers, playEvents };

    return () => {
      cancelAnimationFrame(frame);
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

  return <div ref={host} className="absolute inset-0" />;
}
