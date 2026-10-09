// Famous places from the town's own country (and often its own city), standing out in the
// countryside round it: easter eggs to spot from the map or from a train window. The Third
// Mainland Bridge over a lagoon with Makoko's stilt houses, the Lekki-Ikoyi Link Bridge and the
// National Theatre for Lagos; Zuma Rock for Abuja; Cocoa House in Ibadan; Olumo Rock in Abeokuta;
// the dye pits in Kano; the Black Star Gate and Kakum's canopy walkway in Ghana; KICC, giraffes and
// Lake Nakuru's flamingos in Kenya; the Nelson Mandela Bridge, Moses Mabhida Stadium and Bo-Kaap in
// South Africa; Big Ben, the London Eye and Stonehenge in Britain; the Statue of Liberty, the Space
// Needle and the Hollywood Sign in America... Each is a few dozen simple shapes with a name label,
// built once per town and baked into a handful of meshes (one per colour), so it's cheap to draw.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hash, type CityPlan } from "@/lib/city/layout";

type Spot = { x: number; z: number; r: number };

const geo = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 16).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(0.5, 1, 16).translate(0, 0.5, 0),
  sphere: new THREE.SphereGeometry(0.5, 20, 14),
  dome: new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  torus: new THREE.TorusGeometry(0.5, 0.03, 6, 32),
  waist: new THREE.LatheGeometry(
    [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84, 1].map((y) => new THREE.Vector2(0.5 - 0.17 * Math.sin(y * Math.PI) ** 1.2, y)),
    20,
  ),
};
Object.values(geo).forEach((g) => (g.userData.keep = true));

type Kind = keyof typeof geo;
type Maker = (b: Builder) => void;
type Builder = {
  /** A shape at (x, y, z) in the landmark's own frame (+z faces the town). */
  add: (kind: Kind, color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry?: number, tilt?: number, shiny?: boolean) => THREE.Mesh;
  /** Water with soft, rounded shores (or a neat stone-edged pool). */
  water: (x: number, z: number, w: number, d: number, pool?: boolean) => void;
  /** Big white letters standing up, facing the town (w by h, bottom edge at y). */
  letters: (text: string, x: number, y: number, z: number, w: number, h: number, lean?: number) => void;
  rnd: (k: number) => number;
};

const SHALLOW = 0x8fd3ee;
const DEEP = 0x3d9ad6;
const SAND = 0xe8d7a8;
const STONE = 0xd8d1c3;
const WHITE = 0xf8f9fa;

/**
 * A flat rounded shape w by d, lying on the ground: a squarish oval (rounder for lagoons, nearly
 * square-cornered for pools) with a gentle wobble so shores aren't drawn with a ruler.
 */
function blob(w: number, d: number, squareness: number, seed: number) {
  const pts: THREE.Vector2[] = [];
  const n = 56;
  const p1 = hash(seed, 1, 992) * 6.3;
  const p2 = hash(seed, 2, 992) * 6.3;
  const wobble = squareness > 6 ? 0 : 0.035;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const r = (Math.abs(c) ** squareness + Math.abs(s) ** squareness) ** (-1 / squareness);
    const wob = 1 + wobble * (Math.sin(3 * a + p1) + 0.6 * Math.sin(5 * a + p2));
    pts.push(new THREE.Vector2((c * r * wob * w) / 2, (s * r * wob * d) / 2));
  }
  return new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI / 2);
}

/** Lagos: the long, low bridge across the lagoon, with canoes and stilt houses (Makoko) beside it. */
const thirdMainland: Maker = (b) => {
  b.water(0, 0, 6.4, 13.4);
  for (let k = -7; k <= 7; k++) {
    b.add("box", 0xd9d4ca, 0, 0.32, k, 0.7, 0.07, 1.02);
    b.add("box", 0xb4b9c0, 0, 0, k, 0.12, 0.32, 0.12);
    if (k % 2 === 0) for (const s of [-0.33, 0.33]) b.add("box", 0x868e96, s, 0.39, k, 0.02, 0.35, 0.02);
  }
  for (const s of [-0.34, 0.34]) b.add("box", WHITE, s, 0.39, 0, 0.03, 0.05, 15);
  b.add("box", 0x5b6470, 0, 0.395, 0, 0.6, 0.004, 15);
  for (let k = 0; k < 6; k++) {
    const x = 1.4 + (k % 3) * 0.55;
    const z = -5 + Math.floor(k / 3) * 0.7 + b.rnd(k) * 0.3;
    for (const lx of [-0.15, 0.15]) b.add("box", 0x6b4430, x + lx, -0.1, z, 0.04, 0.32, 0.04);
    b.add("box", 0x9c7b56, x, 0.22, z, 0.38, 0.18, 0.32);
    b.add("box", 0x8a8f96, x, 0.4, z, 0.42, 0.03, 0.36);
  }
  for (let k = 0; k < 4; k++) b.add("box", 0x5c3d2e, -1.6 - b.rnd(k + 10), 0.02, -3 + k * 2.2, 0.12, 0.04, 0.5, b.rnd(k) * 2);
};

/** Lagos: the cable-stayed Lekki-Ikoyi Link Bridge with its tall pylon. */
const lekkiLink: Maker = (b) => {
  b.water(0, 0, 5, 9.2);
  b.add("box", 0xe9ecef, 0, 0.42, 0, 0.6, 0.06, 10.5);
  for (const s of [-0.3, 0.3]) b.add("box", WHITE, s, 0.48, 0, 0.02, 0.05, 10.5);
  b.add("box", 0x5b6470, 0, 0.481, 0, 0.5, 0.004, 10.5);
  for (const z of [-4.5, 4.5]) b.add("box", 0xb4b9c0, 0, 0, z, 0.2, 0.42, 0.2);
  // The pylon: two legs meeting high above the deck.
  for (const s of [-1, 1]) b.add("box", WHITE, s * 0.32, 0, 0, 0.14, 3.2, 0.14, 0, s * 0.09);
  b.add("box", WHITE, 0, 3.1, 0, 0.16, 0.4, 0.16);
  // Cables fanning out to the deck.
  for (let k = 1; k <= 6; k++) {
    for (const dir of [-1, 1]) {
      const z = dir * k * 0.75;
      const len = Math.hypot(z, 3.0 - 0.45);
      b.add("box", 0xced4da, 0, 0.45, z, 0.012, len, 0.012, Math.PI / 2, Math.atan2(-z, 2.55));
    }
  }
};

/** Lagos: the National Theatre, shaped like a general's cap. */
const nationalTheatre: Maker = (b) => {
  b.add("box", 0xe7e1d5, 0, 0, 0, 5, 0.03, 5);
  b.add("cyl", WHITE, 0, 0.03, 0, 3.2, 0.62, 3.2);
  b.add("cyl", 0x2b3a4f, 0, 0.3, 0, 3.24, 0.14, 3.24);
  b.add("cone", 0x868e96, 0, 0.65, 0, 3.9, 0.6, 3.9);
  b.add("cyl", 0xadb5bd, 0, 0.63, 0, 3.95, 0.05, 3.95);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.add("box", 0xced4da, Math.cos(a) * 1.85, 0.66, Math.sin(a) * 1.85, 0.12, 0.25, 0.5, -a);
  }
  b.add("cyl", 0xffd43b, 0, 1.25, 0, 0.2, 0.08, 0.2);
};

/** Abuja: Zuma Rock, a huge rounded monolith with streaks down its face. */
const zumaRock: Maker = (b) => {
  b.add("sphere", 0x9c8b78, 0, 0.6, 0, 5.2, 4.6, 4.2);
  b.add("sphere", 0x8c7b68, 1.2, 0.3, 0.6, 3.2, 2.6, 2.8);
  for (let k = 0; k < 7; k++) b.add("box", 0x6e6052, -1.6 + k * 0.5, 0.8, 2.0 - Math.abs(k - 3) * 0.12, 0.08, 1.6 + b.rnd(k) * 0.8, 0.05, 0, (b.rnd(k + 9) - 0.5) * 0.2);
  for (let k = 0; k < 8; k++) b.add("sphere", 0x6b8e23, -2.6 + k * 0.75, 0.2, 2.5 + b.rnd(k) * 0.4, 0.7, 0.6, 0.7);
};

/** Abuja: the National Mosque, a golden dome and four minarets. */
const nationalMosque: Maker = (b) => {
  b.add("box", 0xe9e2d4, 0, 0, 0, 4.6, 0.05, 4.6);
  b.add("box", WHITE, 0, 0.05, 0, 2.4, 0.9, 2.4);
  b.add("cyl", WHITE, 0, 0.95, 0, 1.7, 0.25, 1.7);
  b.add("dome", 0xe0b04a, 0, 1.2, 0, 1.9, 2.2, 1.9);
  b.add("cyl", 0xe0b04a, 0, 2.25, 0, 0.08, 0.3, 0.08);
  for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) {
    b.add("cyl", WHITE, x, 0.05, z, 0.26, 3.2, 0.26);
    b.add("cyl", 0xdee2e6, x, 2.3, z, 0.38, 0.08, 0.38);
    b.add("cone", 0x2b8a3e, x, 3.25, z, 0.26, 0.5, 0.26);
  }
};

/** Accra: the Black Star Gate on Independence Square. */
const blackStarGate: Maker = (b) => {
  b.add("box", 0xe7e1d5, 0, 0, 0, 6, 0.03, 4);
  for (const x of [-1.2, -0.4, 0.4, 1.2]) b.add("box", WHITE, x, 0.03, 0, 0.42, 1.6, 0.5);
  b.add("box", WHITE, 0, 1.63, 0, 3.2, 0.35, 0.6);
  for (const [x, c] of [[-0.6, 0xce1126], [0, 0xfcd116], [0.6, 0x006b3f]] as const) b.add("box", c, x, 1.75, 0.31, 0.5, 0.12, 0.01);
  // The black star on top.
  for (let k = 0; k < 5; k++) b.add("box", 0x18202b, 0, 2.3, 0, 0.12, 0.5, 0.06, 0, (k / 5) * Math.PI * 2);
  for (let k = 0; k < 6; k++) {
    b.add("box", 0x868e96, -2.6 + k * 1.04, 0.03, 1.6, 0.02, 0.9, 0.02);
    b.add("box", [0xce1126, 0xfcd116, 0x006b3f][k % 3], -2.6 + k * 1.04 + 0.12, 0.75, 1.6, 0.22, 0.14, 0.01);
  }
};

/** Accra: the Kwame Nkrumah Memorial, a tapering mausoleum among pools and palms. */
const nkrumah: Maker = (b) => {
  b.add("box", 0x9fd88f, 0, 0, 0, 5, 0.02, 5);
  b.add("box", STONE, 0, 0.02, 0, 1.2, 0.3, 1.2);
  for (let k = 0; k < 5; k++) b.add("box", 0xb5a48f, 0, 0.32 + k * 0.32, 0, 0.9 - k * 0.15, 0.32, 0.9 - k * 0.15);
  b.add("cone", 0xffd43b, 0, 1.92, 0, 0.18, 0.3, 0.18);
  for (const x of [-1.5, 1.5]) b.water(x, 1.3, 0.6, 2.2, true);
  for (const [x, z] of [[-2, -1.8], [2, -1.8], [-2.2, 0], [2.2, 0]]) {
    b.add("cyl", 0x8d6e4a, x, 0, z, 0.08, 1.3, 0.08);
    b.add("sphere", 0x2f9e44, x, 1.35, z, 0.9, 0.25, 0.9);
  }
};

/** Cape Coast Castle: white walls and cannons on the beach. */
const capeCoast: Maker = (b) => {
  b.water(0, -3.4, 9, 3.6);
  b.add("box", 0xe8d7a8, 0, 0, -1.4, 8, 0.02, 1.2);
  b.add("box", WHITE, 0, 0, 0.3, 4, 0.8, 2.2);
  b.add("box", WHITE, -1.6, 0.8, 0.3, 0.8, 0.6, 0.8);
  for (let k = 0; k < 9; k++) b.add("box", WHITE, -1.8 + k * 0.45, 0.8, -0.8, 0.2, 0.14, 0.12);
  for (let k = 0; k < 4; k++) b.add("cyl", 0x343a40, -1.2 + k * 0.8, 0.86, -0.9, 0.08, 0.5, 0.08, Math.PI / 2, Math.PI / 2);
  b.add("box", 0x5c6b73, 0.8, 0.8, 0.6, 1.4, 0.3, 1);
};

/** Nairobi: KICC, the tall round tower with the saucer on top, and its cone-roofed hall. */
const kicc: Maker = (b) => {
  b.add("box", 0xe7e1d5, 0, 0, 0, 5, 0.03, 4);
  b.add("cyl", 0xc9a87c, 0, 0.03, 0, 0.9, 4.2, 0.9);
  for (let y = 0.4; y < 4; y += 0.32) b.add("cyl", 0x5d4a36, 0, y, 0, 0.92, 0.06, 0.92);
  b.add("cyl", 0xb08d57, 0, 4.23, 0, 1.4, 0.12, 1.4);
  b.add("cyl", 0x8a6a3a, 0, 4.35, 0, 0.5, 0.15, 0.5);
  b.add("cyl", 0xc9a87c, 1.8, 0.03, 0.6, 1.4, 0.5, 1.4);
  b.add("cone", 0x8a6a3a, 1.8, 0.53, 0.6, 1.6, 0.8, 1.6);
};

/** Nairobi National Park: giraffes and zebras under flat-topped acacias, skyline behind. */
const giraffes: Maker = (b) => {
  b.add("box", 0xd4c27e, 0, 0, 0, 7, 0.02, 6);
  for (let k = 0; k < 4; k++) {
    const x = -2.4 + k * 1.6;
    b.add("cyl", 0x6b4f35, x, 0, -1.5, 0.08, 0.9, 0.08);
    b.add("sphere", 0x6b8e23, x, 0.95, -1.5, 1.4, 0.28, 1.2);
  }
  for (let k = 0; k < 4; k++) {
    const x = -2 + k * 1.3;
    const z = 0.4 + b.rnd(k) * 1.2;
    const ry = b.rnd(k + 5) * 6;
    b.add("box", 0xd9a441, x, 0.3, z, 0.36, 0.22, 0.14, ry);
    for (const [lx, lz] of [[-0.12, -0.04], [0.12, -0.04], [-0.12, 0.04], [0.12, 0.04]]) b.add("box", 0xb5852f, x + lx, 0, z + lz, 0.03, 0.3, 0.03, ry);
    b.add("box", 0xd9a441, x + Math.cos(ry) * 0.15, 0.48, z - Math.sin(ry) * 0.15, 0.07, 0.6, 0.07, ry, -0.3);
    b.add("box", 0xd9a441, x + Math.cos(ry) * 0.33, 1.02, z - Math.sin(ry) * 0.33, 0.16, 0.08, 0.08, ry);
  }
  for (let k = 0; k < 3; k++) {
    const x = 1 + k * 0.5;
    const z = -0.3 - k * 0.3;
    b.add("box", WHITE, x, 0.16, z, 0.3, 0.14, 0.12);
    for (let s = 0; s < 4; s++) b.add("box", 0x18202b, x - 0.12 + s * 0.08, 0.16, z, 0.025, 0.142, 0.122);
    for (const lx of [-0.1, 0.1]) b.add("box", WHITE, x + lx, 0, z, 0.03, 0.16, 0.03);
  }
};

/** Nairobi: Uhuru Gardens' monument, tall white columns and a dove. */
const uhuru: Maker = (b) => {
  b.add("box", 0x9fd88f, 0, 0, 0, 5, 0.02, 5);
  b.add("box", STONE, 0, 0.02, 0, 1.6, 0.2, 1.6);
  for (const x of [-0.25, 0.25]) b.add("box", WHITE, x, 0.22, 0, 0.22, 2.6, 0.22);
  b.add("box", WHITE, 0, 2.8, 0, 0.4, 0.15, 0.25);
  b.add("box", WHITE, 0, 3.0, 0, 0.6, 0.06, 0.12, 0, 0.2);
  for (let k = 0; k < 6; k++) b.add("cyl", [0x18202b, 0xbb0000, 0x006600][k % 3], -2 + k * 0.8, 0.02, 1.8, 0.03, 1, 0.03);
};

/** Johannesburg: the Nelson Mandela Bridge, two white pylons and a harp of cables over the rail yard. */
const mandelaBridge: Maker = (b) => {
  b.add("box", 0x8a8178, 0, 0, 0, 5, 0.02, 12);
  for (let k = -2; k <= 2; k++) for (const z of [-5, -2.5, 0, 2.5, 5]) b.add("box", 0x6b4f35, k * 0.6, 0.02, z, 0.08, 0.02, 2);
  b.add("box", 0xe9ecef, 0, 0.6, 0, 0.7, 0.07, 11.5);
  b.add("box", 0x5b6470, 0, 0.671, 0, 0.6, 0.004, 11.5);
  for (const [z, h] of [[-2.2, 3.4], [2.6, 2.6]] as const) {
    b.add("box", WHITE, 0, 0, z, 0.2, h, 0.2, 0, z < 0 ? 0.12 : -0.12);
    for (let k = 1; k <= 5; k++) {
      for (const dir of [-1, 1]) {
        const dz = dir * k * 0.7;
        const len = Math.hypot(dz, h - 0.65);
        b.add("box", 0xced4da, 0, 0.65, z + dz, 0.012, len, 0.012, Math.PI / 2, Math.atan2(-dz, h - 0.65));
      }
    }
  }
};

/** Soweto: the two painted cooling towers (with a bungee platform between). */
const sowetoTowers: Maker = (b) => {
  b.add("box", 0xc7b56f, 0, 0, 0, 5, 0.02, 4);
  const paint = [0xe03131, 0xf59f00, 0x1c7ed6, 0x2f9e44, 0x7048e8];
  const H = 3.2;
  const radius = (f: number) => 1.5 * (0.5 - 0.17 * Math.sin(f * Math.PI) ** 1.2);
  for (const x of [-1, 1]) {
    b.add("waist", 0xf1f3f5, x, 0, 0, 1.5, H, 1.5);
    // Painted bands (murals) round each tower.
    for (let k = 0; k < 4; k++) {
      const f = 0.12 + k * 0.22;
      const r = radius(f + 0.05) + 0.015;
      b.add("cyl", paint[(k + (x > 0 ? 2 : 0)) % paint.length], x, f * H, 0, r * 2, 0.32, r * 2);
    }
  }
  b.add("box", 0x343a40, 0, 3.0, 0, 1.4, 0.06, 0.2);
};

/** Johannesburg: Hillbrow Tower, a tall concrete needle with pods near the top. */
const hillbrow: Maker = (b) => {
  b.add("box", 0xd9d4ca, 0, 0, 0, 3, 0.03, 3);
  b.add("cyl", 0xc9c2b4, 0, 0.03, 0, 0.5, 5.6, 0.5);
  for (const [y, r] of [[4.2, 1.1], [4.6, 1.2], [5.0, 0.9]] as const) {
    b.add("cyl", 0xdee2e6, 0, y, 0, r, 0.28, r);
    b.add("cyl", 0x2b3a4f, 0, y + 0.08, 0, r + 0.02, 0.1, r + 0.02);
  }
  b.add("cyl", 0xadb5bd, 0, 5.6, 0, 0.1, 1.2, 0.1);
  b.add("sphere", 0xff6b6b, 0, 6.85, 0, 0.12, 0.12, 0.12);
};

/** Britain: Stonehenge on its grassy plain. */
const stonehenge: Maker = (b) => {
  b.add("cyl", 0x8fbf6a, 0, 0, 0, 6, 0.02, 6);
  const n = 14;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    if (b.rnd(k) < 0.15) continue;
    b.add("box", 0x9a968c, Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8, 0.35, 0.95, 0.22, -a + Math.PI / 2);
    if (k % 2 === 0) b.add("box", 0x8f8b80, Math.cos(a + Math.PI / n) * 1.8, 0.95, Math.sin(a + Math.PI / n) * 1.8, 0.85, 0.16, 0.22, -a - Math.PI / n + Math.PI / 2);
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 1.2 - 0.6;
    b.add("box", 0x8f8b80, Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8, 0.4, 1.25, 0.25, -a + Math.PI / 2);
  }
};

/** Britain: Tower Bridge over the river, with its two towers and high walkways. */
const towerBridge: Maker = (b) => {
  b.water(0, 0, 3.4, 9.8);
  b.add("box", 0x5b6470, 0, 0.32, 0, 0.7, 0.07, 11.5);
  for (const s of [-0.34, 0.34]) b.add("box", 0x6fa8dc, s, 0.39, 0, 0.03, 0.06, 11.5);
  for (const z of [-1.4, 1.4]) {
    b.add("box", 0xd6cdb8, 0, 0, z, 0.9, 2.6, 0.9);
    for (const [x, zz] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]) {
      b.add("box", 0xd6cdb8, x, 2.6, z + zz, 0.16, 0.3, 0.16);
      b.add("cone", 0x5c6b73, x, 2.9, z + zz, 0.2, 0.35, 0.2);
    }
    b.add("cone", 0x5c6b73, 0, 2.6, z, 0.75, 0.9, 0.75);
    b.add("box", 0x5d7fa3, 0, 1.3, z + 0.455, 0.3, 0.6, 0.01);
  }
  for (const s of [-0.2, 0.2]) b.add("box", 0x6fa8dc, s, 2.2, 0, 0.16, 0.22, 2.0);
  for (const z of [-4, 4]) b.add("box", 0xb4b9c0, 0, 0, z, 0.25, 0.32, 0.25);
};

/** Britain: the Angel of the North, a rusty giant with its wings out. */
const angel: Maker = (b) => {
  b.add("cyl", 0x8fbf6a, 0, 0, 0, 4, 0.04, 4);
  b.add("box", 0x9c4a1f, 0, 0.04, 0, 0.3, 2.4, 0.22);
  b.add("box", 0x9c4a1f, 0, 2.44, 0, 0.22, 0.3, 0.2);
  b.add("box", 0x8a3f1a, 0, 1.6, 0, 5.4, 0.35, 0.06, 0, 0.04);
  for (let k = -5; k <= 5; k++) if (k) b.add("box", 0x7a3616, k * 0.48, 1.6, 0.035, 0.03, 0.36, 0.02);
};

/** Chicago: Cloud Gate, the shiny bean, on its plaza. */
const cloudGate: Maker = (b) => {
  b.add("box", 0xe7e1d5, 0, 0, 0, 5, 0.03, 4);
  b.add("sphere", 0xdfe6ee, 0, 0.75, 0, 2.6, 1.3, 1.5, 0, 0, true);
  b.add("box", 0xe7e1d5, 0, 0.03, 0, 0.7, 0.32, 1.6);
  for (let k = 0; k < 5; k++) b.add("cyl", 0x2f9e44, -2 + k, 0.03, 1.6, 0.4, 0.6, 0.4);
};

/** Route 66: a chrome diner, the road sign and an old red car. */
const route66: Maker = (b) => {
  b.add("box", 0x5b6470, 0, 0, 1.2, 7, 0.02, 0.8);
  for (let k = -3; k <= 3; k++) b.add("box", 0xffd43b, k, 0.021, 1.2, 0.4, 0.003, 0.05);
  b.add("box", 0xdee2e6, 0, 0, -0.6, 2.6, 0.55, 1.0, 0, 0, true);
  b.add("box", 0xe03131, 0, 0.18, -0.09, 2.62, 0.08, 0.02);
  b.add("box", 0x2b3a4f, 0, 0.3, -0.09, 2.4, 0.14, 0.02);
  b.add("box", 0xe03131, 1.6, 0, 0.5, 0.06, 1.4, 0.06);
  b.add("box", WHITE, 1.6, 1.25, 0.5, 0.6, 0.6, 0.04);
  b.add("box", 0x18202b, 1.6, 1.32, 0.48, 0.4, 0.4, 0.04);
  b.add("box", 0xc92a2a, -1.2, 0, 0.6, 0.6, 0.16, 0.28);
  b.add("box", 0xc92a2a, -1.25, 0.16, 0.6, 0.32, 0.12, 0.26);
  b.add("box", 0x74c0fc, -1.25, 0.18, 0.6, 0.33, 0.06, 0.27);
};

/** Chicago: Navy Pier, a long pier into the lake with its big wheel. */
const navyPier: Maker = (b) => {
  b.water(0, -3.4, 5.4, 8.4);
  b.add("box", 0xd9d4ca, 0, 0.05, -1, 1.2, 0.1, 9);
  b.add("box", 0xe9ecef, 0, 0.15, -3.8, 1.0, 0.5, 2.4);
  b.add("box", 0xb5523b, 0, 0.65, -3.8, 1.04, 0.08, 2.44);
  const wheel = b.add("torus", 0xe03131, 0, 1.75, 0.2, 3, 3, 3, Math.PI / 2);
  wheel.rotation.set(0, Math.PI / 2, 0);
  for (let k = 0; k < 8; k++) b.add("box", 0xced4da, 0, 1.75, 0.2, 0.02, 1.5, 0.02, Math.PI / 2, (k / 8) * Math.PI * 2);
  for (const s of [-0.3, 0.3]) b.add("box", 0x868e96, s, 0.15, 0.2, 0.05, 1.6, 0.05, 0, s > 0 ? -0.2 : 0.2);
};

/** Ibadan: Cocoa House, once the tallest building in Africa, banded with windows. */
const cocoaHouse: Maker = (b) => {
  b.add("box", 0xe7e1d5, 0, 0, 0, 3.4, 0.03, 3.4);
  b.add("box", 0xe9e2d4, 0, 0.03, 0.3, 2.2, 0.5, 1.6);
  b.add("box", 0xf1ece0, 0, 0.03, 0, 1.0, 4.6, 1.0);
  for (let y = 0.7; y < 4.5; y += 0.24) b.add("box", 0x6b7b8c, 0, y, 0, 1.02, 0.07, 1.02);
  for (const x of [-0.5, 0.5]) b.add("box", 0xf8f9fa, x, 0.03, 0.5, 0.06, 4.6, 0.06);
  b.add("box", 0xdee2e6, 0, 4.63, 0, 1.1, 0.22, 1.1);
  b.add("box", 0xadb5bd, 0, 4.85, 0, 0.05, 0.9, 0.05);
  b.add("sphere", 0xff6b6b, 0, 5.78, 0, 0.1, 0.1, 0.1);
};

/** Abeokuta: Olumo Rock, a cluster of granite boulders with steps cut up the front. */
const olumoRock: Maker = (b) => {
  b.add("cyl", 0x8fbf6a, 0, 0, 0, 7, 0.02, 6);
  b.add("sphere", 0x8f8577, -0.6, 0.5, -0.5, 3.2, 2.8, 2.6);
  b.add("sphere", 0x9c9284, 1.1, 0.7, 0, 2.2, 3.2, 2.0);
  b.add("sphere", 0x857b6d, -1.9, 0.25, 0.6, 1.8, 1.5, 1.6);
  for (let k = 0; k < 7; k++) b.add("box", 0xc9bfae, 0.15, 0, 1.7 - k * 0.2, 0.5, 0.14 * (k + 1), 0.2);
  for (let k = 0; k < 6; k++) b.add("sphere", 0x2f9e44, -2.8 + k * 1.1, 0.25, 2.2 + b.rnd(k) * 0.5, 0.8, 0.7, 0.8);
  b.add("cyl", 0xc98f5e, 2.4, 0, 1.4, 0.5, 0.3, 0.5);
  b.add("cone", 0xb08d57, 2.4, 0.3, 1.4, 0.65, 0.35, 0.65);
};

/** Kano: the Kofar Mata dye pits, indigo pools in the ground, cloth drying by the old city wall. */
const kanoDyePits: Maker = (b) => {
  b.add("box", 0xd9b48a, 0, 0, 0, 6.4, 0.02, 5.2);
  const dye = [0x1d3a8a, 0x24418f, 0x2a2f6e];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      const x = -1.8 + i * 1.2;
      const z = 0.2 + j * 0.9;
      b.add("cyl", 0x8a6a4a, x, 0, z, 0.6, 0.05, 0.6);
      b.add("cyl", dye[(i + j) % 3], x, 0.02, z, 0.44, 0.04, 0.44);
    }
  }
  // Cloth on lines between posts.
  for (const x of [-2.6, 2.6]) b.add("box", 0x6b4f35, x, 0, -1.1, 0.05, 0.75, 0.05);
  b.add("box", 0x343a40, 0, 0.72, -1.1, 5.2, 0.01, 0.01);
  for (let k = 0; k < 8; k++) b.add("box", [0x2b4c9b, 0xf1f3f5, 0x1d3a8a, 0x4dabf7][k % 4], -2.2 + k * 0.62, 0.3, -1.1, 0.42, 0.42, 0.01);
  // The red-earth city wall with its pointed tops, and the gate.
  b.add("box", 0xc98f5e, -1.9, 0, -2.1, 2.4, 0.8, 0.35);
  b.add("box", 0xc98f5e, 1.9, 0, -2.1, 2.4, 0.8, 0.35);
  for (let k = 0; k < 12; k++) if (Math.abs(k - 5.5) > 1) b.add("cone", 0xc98f5e, -3 + k * 0.55, 0.8, -2.1, 0.22, 0.3, 0.22);
  for (const x of [-0.6, 0.6]) b.add("box", 0xb5793f, x, 0, -2.1, 0.4, 1.3, 0.45);
  b.add("box", 0xb5793f, 0, 1.0, -2.1, 1.6, 0.3, 0.45);
};

/** Kakum's canopy walkway: rope bridges strung between platforms high in the rainforest. */
const kakum: Maker = (b) => {
  b.add("cyl", 0x5e9a3b, 0, 0, 0, 7.4, 0.03, 6);
  const posts = [[-2.6, -0.6], [-0.9, 0.7], [0.9, -0.5], [2.6, 0.6]];
  const deck = 1.9;
  posts.forEach(([x, z], k) => {
    b.add("cyl", 0x6b4f35, x, 0, z, 0.24, 2.7, 0.24);
    b.add("sphere", [0x2b8a3e, 0x2f9e44, 0x237032][k % 3], x, 3.0, z, 1.6, 1.0, 1.6);
    b.add("cyl", 0x8d6e4a, x, deck - 0.06, z, 0.7, 0.06, 0.7);
  });
  for (let k = 0; k + 1 < posts.length; k++) {
    const [x1, z1] = posts[k];
    const [x2, z2] = posts[k + 1];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const ry = Math.atan2(-dz, dx);
    // Two halves, sagging a little in the middle.
    for (const half of [0, 1]) {
      const sag = 0.18;
      const mx = x1 + dx * (0.25 + half * 0.5);
      const mz = z1 + dz * (0.25 + half * 0.5);
      const tilt = (half ? 1 : -1) * Math.atan2(sag, len / 2);
      b.add("box", 0xc9a87c, mx, deck - sag / 2, mz, len / 2 + 0.04, 0.03, 0.14, ry, tilt);
      for (const side of [-1, 1]) {
        const ox = (-dz / len) * 0.08 * side;
        const oz = (dx / len) * 0.08 * side;
        b.add("box", 0xe9d8a6, mx + ox, deck + 0.22 - sag / 2, mz + oz, len / 2 + 0.04, 0.015, 0.015, ry, tilt);
      }
    }
  }
};

/** Lake Nakuru: a pink crowd of flamingos wading in the shallows. */
const flamingos: Maker = (b) => {
  b.water(0, 0, 9.4, 6.4);
  for (let k = 0; k < 30; k++) {
    const x = (b.rnd(k) * 2 - 1) * 3.4;
    const z = (b.rnd(k + 40) * 2 - 1) * 2.0;
    const ry = b.rnd(k + 80) * 6.3;
    const pink = [0xf783ac, 0xfaa2c1, 0xf06595][k % 3];
    b.add("box", 0xe64980, x, 0, z, 0.015, 0.3, 0.015);
    b.add("sphere", pink, x, 0.34, z, 0.2, 0.11, 0.11, ry);
    b.add("box", pink, x + Math.cos(ry) * 0.07, 0.36, z - Math.sin(ry) * 0.07, 0.025, 0.2, 0.025, ry, -0.25);
    b.add("sphere", pink, x + Math.cos(ry) * 0.11, 0.56, z - Math.sin(ry) * 0.11, 0.06, 0.05, 0.05, ry);
  }
};

/** Mombasa: Fort Jesus, the coral-stone fort with its angled bastions by the sea. */
const fortJesus: Maker = (b) => {
  b.water(0, -3.6, 9.6, 3.4);
  b.add("box", 0xe8d7a8, 0, 0, -1.6, 8.4, 0.02, 1.4);
  const W = 0xd8a47f;
  b.add("box", 0xc9b28f, 0, 0, 0.4, 2.4, 0.04, 1.8);
  for (const [x, z, sx, sz] of [[0, -0.5, 2.6, 0.26], [0, 1.3, 2.6, 0.26], [-1.2, 0.4, 0.26, 2.0], [1.2, 0.4, 0.26, 2.0]] as const) b.add("box", W, x, 0, z, sx, 0.8, sz);
  for (const [x, z] of [[-1.3, -0.6], [1.3, -0.6], [-1.3, 1.4], [1.3, 1.4]]) {
    b.add("box", W, x, 0, z, 0.75, 0.88, 0.75, Math.PI / 4);
    b.add("box", 0xc98f6a, x, 0.88, z, 0.8, 0.06, 0.8, Math.PI / 4);
  }
  b.add("box", 0xb5793f, 0, 0, 1.44, 0.4, 0.5, 0.04);
  b.add("box", 0x868e96, 0.8, 0.8, 0.4, 0.03, 0.9, 0.03);
  for (const [y, c] of [[1.55, 0x18202b], [1.45, 0xbb0000], [1.35, 0x006600]] as const) b.add("box", c, 1.05, y, 0.4, 0.45, 0.1, 0.01);
};

/** Durban: Moses Mabhida Stadium, the bowl with the great white arch leaping over it. */
const mosesMabhida: Maker = (b) => {
  b.add("box", 0xd9d4ca, 0, 0, 0, 8, 0.03, 5.6);
  b.add("cyl", WHITE, 0, 0.03, 0, 4.4, 0.7, 3.3);
  b.add("cyl", 0x868e96, 0, 0.73, 0, 3.8, 0.02, 2.8);
  b.add("cyl", 0x2f9e44, 0, 0.75, 0, 2.6, 0.02, 1.7);
  b.add("cyl", 0xdee2e6, 0, 0.6, 0, 4.5, 0.12, 3.4);
  const N = 16;
  const pt = (t: number) => ({ x: 3.6 * t, y: 0.03 + 3.4 * (1 - t * t) });
  for (let k = 0; k < N; k++) {
    const p1 = pt(-1 + (2 * k) / N);
    const p2 = pt(-1 + (2 * (k + 1)) / N);
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    b.add("box", WHITE, p1.x, p1.y, 0, 0.16, len + 0.02, 0.2, 0, Math.atan2(-(p2.x - p1.x), p2.y - p1.y));
  }
  b.add("box", 0xe03131, 0, 3.45, 0.14, 0.24, 0.14, 0.14);
};

/** Cape Town: Bo-Kaap, rows of brightly painted houses on a cobbled street. */
const boKaap: Maker = (b) => {
  const C = [0xff6b9a, 0x4dabf7, 0xffd43b, 0x69db7c, 0xb197fc, 0xffa94d, 0x63e6be, 0xff8787];
  b.add("box", 0x8a8f96, 0, 0, 1.0, 6.8, 0.02, 0.7);
  b.add("box", 0x9fd88f, 0, 0, -1.3, 6.8, 0.26, 1.4);
  for (let k = 0; k < 8; k++) {
    const x = -2.8 + k * 0.8;
    const h = 0.6 + b.rnd(k) * 0.3;
    b.add("box", C[k], x, 0, 0, 0.76, h, 1.1);
    b.add("box", WHITE, x, h, 0.53, 0.76, 0.08, 0.04);
    b.add("box", 0x5c3d2e, x, 0, 0.555, 0.18, 0.32, 0.01);
    for (const wx of [-0.22, 0.22]) b.add("box", WHITE, x + wx, 0.3, 0.555, 0.14, 0.2, 0.01);
  }
  for (let k = 0; k < 7; k++) {
    const x = -2.4 + k * 0.8;
    b.add("box", C[(k + 3) % 8], x, 0.26, -1.3, 0.76, 0.6 + b.rnd(k + 9) * 0.3, 1.0);
  }
};

/** Pretoria: the Union Buildings, sandstone wings with twin domed towers above terraced gardens. */
const unionBuildings: Maker = (b) => {
  const S = 0xd9b98a;
  b.add("box", 0x9fd88f, 0, 0, 1.1, 7.4, 0.03, 2.6);
  for (let k = 0; k < 3; k++) b.add("box", 0x8fbf6a, 0, 0.03, 1.7 - k * 0.5, 6.4 - k * 0.4, 0.08 + k * 0.08, 0.5);
  b.add("box", 0xb5a48f, 0, 0, -0.5, 6.8, 0.3, 1.3);
  b.add("box", S, 0, 0.3, -0.5, 6.2, 0.7, 0.9);
  b.add("box", 0xb5523b, 0, 1.0, -0.5, 6.2, 0.1, 0.9);
  for (const x of [-2.7, 2.7]) {
    b.add("box", S, x, 0.3, -0.1, 0.9, 0.85, 1.0);
    b.add("box", 0xb5523b, x, 1.15, -0.1, 0.95, 0.1, 1.05);
  }
  for (let k = 0; k < 9; k++) b.add("box", 0xf1e6d0, -1.0 + k * 0.25, 0.3, -0.03, 0.08, 0.66, 0.08);
  for (const x of [-1.4, 1.4]) {
    b.add("box", S, x, 1.0, -0.5, 0.44, 0.9, 0.44);
    b.add("dome", 0x7a8a6a, x, 1.9, -0.5, 0.52, 0.56, 0.52);
  }
  b.add("box", 0x868e96, 0, 1.1, -0.5, 0.03, 1.1, 0.03);
  for (const [y, c] of [[2.08, 0xe03131], [1.98, 0xffffff], [1.88, 0x007a4d], [1.78, 0x1c3f94]] as const) b.add("box", c, 0.24, y, -0.5, 0.42, 0.1, 0.01);
};

/** London: the Elizabeth Tower (Big Ben) at the end of the Houses of Parliament. */
const bigBen: Maker = (b) => {
  const S = 0xd6c08f;
  const LINE = 0xb89f6a;
  b.add("box", 0xe7e1d5, 0, 0, 0, 5.6, 0.03, 3);
  // The Houses of Parliament: a long hall with tall lancet windows and a row of pinnacles.
  b.add("box", S, -1.4, 0.03, -0.2, 2.6, 0.85, 1.0);
  b.add("box", 0x5c6b73, -1.4, 0.88, -0.2, 2.5, 0.16, 0.8);
  for (let k = 0; k < 12; k++) b.add("box", LINE, -2.6 + k * 0.22, 0.18, 0.305, 0.05, 0.6, 0.01);
  for (let k = 0; k < 7; k++) for (const z of [-0.68, 0.28]) b.add("cone", S, -2.6 + k * 0.4, 0.88, z, 0.08, 0.26, 0.08);
  // Victoria Tower at the far end.
  b.add("box", S, -2.75, 0.03, -0.2, 0.6, 1.9, 0.6);
  for (const [dx, dz] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]]) b.add("cone", S, -2.75 + dx, 1.93, -0.2 + dz, 0.1, 0.3, 0.1);
  // The clock tower.
  b.add("box", S, 0.6, 0.03, 0, 0.7, 3.2, 0.7);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    for (const o of [-0.2, 0, 0.2]) b.add("box", LINE, 0.6 + Math.sin(a) * 0.352 + Math.cos(a) * o, 0.25, Math.cos(a) * 0.352 - Math.sin(a) * o, 0.04, 2.8, 0.04);
  }
  b.add("box", S, 0.6, 3.23, 0, 0.84, 0.8, 0.84);
  for (let k = 0; k < 4; k++) {
    // A clock on each side: gilded rim, pale face, two black hands.
    const a = (k / 4) * Math.PI * 2;
    const fx = Math.sin(a);
    const fz = Math.cos(a);
    b.add("cyl", 0xb08d57, 0.6 + fx * 0.42, 3.63, fz * 0.42, 0.68, 0.015, 0.68, a + Math.PI / 2, Math.PI / 2);
    b.add("cyl", 0xfff4d6, 0.6 + fx * 0.425, 3.63, fz * 0.425, 0.58, 0.015, 0.58, a + Math.PI / 2, Math.PI / 2);
    b.add("box", 0x18202b, 0.6 + fx * 0.443, 3.63, fz * 0.443, 0.03, 0.17, 0.008, a, 0.9);
    b.add("box", 0x18202b, 0.6 + fx * 0.443, 3.63, fz * 0.443, 0.02, 0.25, 0.008, a, -0.35);
  }
  b.add("box", S, 0.6, 4.03, 0, 0.7, 0.42, 0.7);
  b.add("cone", 0x4a5560, 0.6, 4.45, 0, 0.82, 1.3, 0.82);
  b.add("cone", 0xd4a017, 0.6, 5.7, 0, 0.08, 0.3, 0.08);
};

/** London: the London Eye, the great wheel by the river with its glass pods. */
const londonEye: Maker = (b) => {
  b.water(0, -2.6, 9.4, 2.8);
  b.add("box", 0xe7e1d5, 0, 0, 0.6, 5.6, 0.03, 2.4);
  const H = 2.45;
  b.add("torus", WHITE, 0, H, 0, 4.3, 4.3, 4.3);
  b.add("torus", 0xdee2e6, 0, H, 0, 4.0, 4.0, 4.0);
  for (let k = 0; k < 16; k++) b.add("box", 0xced4da, 0, H, 0, 0.015, 2.05, 0.015, 0, (k / 16) * Math.PI * 2);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    b.add("sphere", 0x9ad0f5, Math.cos(a) * 2.25, H + Math.sin(a) * 2.25, 0, 0.2, 0.14, 0.28);
  }
  b.add("cyl", 0x868e96, 0, H, -0.2, 0.3, 0.4, 0.3, Math.PI / 2, Math.PI / 2);
  for (const x of [-0.18, 0.18]) b.add("box", WHITE, x, 0, -1.3, 0.1, Math.hypot(1.3, H), 0.1, Math.PI / 2, Math.atan2(1.3, H));
};

/** Edinburgh Castle, on its low crag of dark rock. */
const edinburghCastle: Maker = (b) => {
  b.add("sphere", 0x6e6a62, 0, -0.25, 0, 6.4, 2.5, 4.4);
  b.add("sphere", 0x7da35a, 0, -0.45, 1.2, 6.8, 1.6, 3.2);
  const W = 0xa39e93;
  b.add("box", W, 0, 0.7, -0.2, 3.6, 0.55, 1.6);
  for (let k = 0; k < 10; k++) b.add("box", W, -1.6 + k * 0.36, 1.25, 0.58, 0.18, 0.12, 0.08);
  b.add("box", 0x948f84, -0.9, 1.25, -0.4, 1.1, 0.7, 0.8);
  b.add("box", 0x5c6b73, -0.9, 1.95, -0.4, 1.14, 0.08, 0.84);
  b.add("box", 0x948f84, 0.8, 1.25, -0.5, 0.9, 0.5, 0.7);
  b.add("cyl", W, 1.7, 0.6, 0.3, 1.0, 0.75, 1.0);
  b.add("box", 0x868e96, -0.9, 2.03, -0.4, 0.03, 0.7, 0.03);
  b.add("box", 0x0065bd, -0.73, 2.55, -0.4, 0.32, 0.18, 0.01);
  b.add("box", WHITE, -0.73, 2.55, -0.39, 0.34, 0.03, 0.01, 0, 0.5);
  b.add("box", WHITE, -0.73, 2.55, -0.39, 0.34, 0.03, 0.01, 0, -0.5);
};

/** Liverpool: the Royal Liver Building on the waterfront, with a Liver Bird on each tower. */
const liverBuilding: Maker = (b) => {
  b.water(0, -2.8, 9.4, 2.8);
  b.add("box", 0xe7e1d5, 0, 0, 0.4, 6, 0.03, 3);
  const S = 0xd9d4ca;
  b.add("box", S, 0, 0.03, 0.2, 2.4, 1.9, 1.4);
  for (let r = 0; r < 6; r++) b.add("box", 0x5b6470, 0, 0.3 + r * 0.27, 0.91, 2.2, 0.08, 0.01);
  for (const x of [-0.8, 0.8]) {
    b.add("box", S, x, 1.93, 0.2, 0.62, 1.0, 0.62);
    b.add("cyl", WHITE, x, 2.35, 0.51, 0.42, 0.02, 0.42, Math.PI / 2, Math.PI / 2);
    b.add("cyl", 0x18202b, x, 2.35, 0.53, 0.06, 0.02, 0.06, Math.PI / 2, Math.PI / 2);
    b.add("cyl", S, x, 2.93, 0.2, 0.5, 0.25, 0.5);
    b.add("dome", 0x6fae9a, x, 3.18, 0.2, 0.52, 0.6, 0.52);
    b.add("box", 0x6fae9a, x, 3.45, 0.2, 0.1, 0.22, 0.1);
    b.add("box", 0x6fae9a, x, 3.6, 0.2, 0.3, 0.05, 0.06);
  }
};

/** New York: the Statue of Liberty on her island, torch held high. */
const liberty: Maker = (b) => {
  b.water(0, 0, 9.4, 7.4);
  b.add("cyl", 0x8fbf6a, 0, 0, 0, 3.6, 0.08, 3.2);
  b.add("box", 0xbfb8a8, 0, 0.08, 0, 1.5, 0.3, 1.5, Math.PI / 4);
  b.add("box", 0xbfb8a8, 0, 0.08, 0, 1.5, 0.3, 1.5);
  b.add("box", 0xc9bfa8, 0, 0.38, 0, 0.6, 0.9, 0.6);
  b.add("box", 0xb5aa92, 0, 1.28, 0, 0.7, 0.08, 0.7);
  const G = 0x7fb8a4;
  b.add("cone", G, 0, 1.36, 0, 0.44, 1.3, 0.44);
  b.add("cyl", G, 0, 1.36, 0, 0.32, 0.92, 0.32);
  b.add("sphere", G, 0, 2.62, 0, 0.2, 0.22, 0.2);
  for (let k = 0; k < 5; k++) {
    const a = -0.9 + k * 0.45;
    b.add("cone", G, Math.sin(a) * 0.11, 2.66, Math.cos(a) * 0.11, 0.05, 0.16, 0.05);
  }
  b.add("box", G, 0.18, 2.1, 0, 0.09, 0.75, 0.09, 0, -0.15);
  b.add("cyl", 0xd4a017, 0.29, 2.82, 0, 0.12, 0.1, 0.12);
  b.add("cone", 0xffc53d, 0.29, 2.92, 0, 0.11, 0.18, 0.11);
  b.add("box", G, -0.2, 1.9, 0.08, 0.06, 0.3, 0.18);
};

/** Seattle: the Space Needle, legs pinched at the waist and the saucer on top. */
const spaceNeedle: Maker = (b) => {
  b.add("cyl", 0x9fd88f, 0, 0, 0, 4, 0.02, 4);
  b.add("cyl", 0xdee2e6, 0, 0, 0, 0.26, 4.4, 0.26);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const lo = Math.atan2(0.5, 2.4);
    b.add("box", WHITE, Math.cos(a) * 0.68, 0, Math.sin(a) * 0.68, 0.09, Math.hypot(0.5, 2.4), 0.09, -a, lo);
    b.add("box", WHITE, Math.cos(a) * 0.18, 2.35, Math.sin(a) * 0.18, 0.09, Math.hypot(0.34, 2.0), 0.09, -a, -Math.atan2(0.34, 2.0));
  }
  b.add("cone", WHITE, 0, 4.32, 0, 1.7, 0.4, 1.7, 0, Math.PI);
  b.add("cyl", 0x2b3a4f, 0, 4.32, 0, 1.72, 0.12, 1.72);
  b.add("cyl", WHITE, 0, 4.44, 0, 1.76, 0.06, 1.76);
  b.add("cone", 0xf08c00, 0, 4.5, 0, 1.4, 0.3, 1.4);
  b.add("cyl", 0xadb5bd, 0, 4.78, 0, 0.06, 0.8, 0.06);
};

/** Los Angeles: the Hollywood Sign along a dry, scrubby hillside. */
const hollywood: Maker = (b) => {
  // A low, rounded hill (not a mountain), the letters standing on its front slope.
  const hill = (x: number, z: number) => -0.5 + 1.3 * Math.sqrt(Math.max(0, 1 - (x / 4.3) ** 2 - ((z + 0.6) / 2.3) ** 2));
  b.add("sphere", 0xb8ad78, 0, -0.5, -0.6, 8.6, 2.6, 4.6);
  for (let k = 0; k < 14; k++) {
    const x = -3.4 + k * 0.52;
    const z = -1.6 + b.rnd(k + 20) * 1.8;
    b.add("sphere", 0x7d8f4a, x, hill(x, z) - 0.05, z, 0.45, 0.32, 0.45);
  }
  b.letters("HOLLYWOOD", 0, 0.08, 1.45, 6.2, 0.95, 0.22);
};

type Landmark = { name: string; make: Maker; r: number };
const L = (name: string, make: Maker, r: number): Landmark => ({ name, make, r });

const LAGOS = ["Ikeja", "Lekki", "Yaba", "Surulere", "Victoria Island", "Ikoyi"];

const THIRD_MAINLAND = L("Third Mainland Bridge", thirdMainland, 8.5);
const LEKKI = L("Lekki-Ikoyi Link Bridge", lekkiLink, 6);
const THEATRE = L("National Theatre", nationalTheatre, 3.4);
const ZUMA = L("Zuma Rock", zumaRock, 4);
const BLACK_STAR = L("Black Star Gate", blackStarGate, 3.6);
const CAPE_COAST = L("Cape Coast Castle", capeCoast, 5);
const KAKUM = L("Kakum Canopy Walkway", kakum, 4.4);
const KICC = L("KICC", kicc, 3.2);
const NAIROBI_PARK = L("Nairobi National Park", giraffes, 4.4);
const FORT_JESUS = L("Fort Jesus", fortJesus, 5);
const MANDELA = L("Nelson Mandela Bridge", mandelaBridge, 6.4);
const SOWETO = L("Soweto Towers", sowetoTowers, 3.2);
const HILLBROW = L("Hillbrow Tower", hillbrow, 2.4);
const STONEHENGE = L("Stonehenge", stonehenge, 3.6);
const TOWER_BRIDGE = L("Tower Bridge", towerBridge, 5.6);
const ANGEL = L("Angel of the North", angel, 3.2);
const LIBERTY = L("Statue of Liberty", liberty, 4.8);
const ROUTE_66 = L("Route 66 Diner", route66, 4);
const CLOUD_GATE = L("Cloud Gate", cloudGate, 3.2);

/** A city's very own landmarks (it gets its country's best-known ones too, up to three in all). */
const CITY: Record<string, Landmark[]> = {
  Abuja: [ZUMA, L("National Mosque", nationalMosque, 3.4)],
  Ibadan: [L("Cocoa House", cocoaHouse, 2.6)],
  Abeokuta: [L("Olumo Rock", olumoRock, 3.8)],
  Kano: [L("Kofar Mata Dye Pits", kanoDyePits, 4.2)],
  Accra: [BLACK_STAR, L("Kwame Nkrumah Memorial", nkrumah, 3.4)],
  Nairobi: [KICC, NAIROBI_PARK, L("Uhuru Gardens", uhuru, 3.4)],
  Nakuru: [L("Lake Nakuru Flamingos", flamingos, 4.8)],
  Durban: [L("Moses Mabhida Stadium", mosesMabhida, 4.2)],
  "Cape Town": [L("Bo-Kaap", boKaap, 3.6)],
  Pretoria: [L("Union Buildings", unionBuildings, 3.8)],
  London: [L("Big Ben", bigBen, 3.2), L("London Eye", londonEye, 4.8), TOWER_BRIDGE],
  Edinburgh: [L("Edinburgh Castle", edinburghCastle, 3.4)],
  Liverpool: [L("Royal Liver Building", liverBuilding, 4.8)],
  "New York": [LIBERTY],
  Seattle: [L("Space Needle", spaceNeedle, 2.2)],
  "Los Angeles": [L("Hollywood Sign", hollywood, 4.4)],
  Chicago: [CLOUD_GATE, L("Navy Pier", navyPier, 6.4)],
};

/** Each country's best-known landmarks. */
const COUNTRY: Record<string, Landmark[]> = {
  ng: [THIRD_MAINLAND, ZUMA, THEATRE],
  gh: [BLACK_STAR, KAKUM, CAPE_COAST],
  ke: [NAIROBI_PARK, FORT_JESUS, KICC],
  za: [MANDELA, SOWETO, HILLBROW],
  uk: [STONEHENGE, TOWER_BRIDGE, ANGEL],
  us: [LIBERTY, ROUTE_66, CLOUD_GATE],
};

/** The landmarks a town has round it: its city's own first, then its country's, three in all. */
function landmarksFor(plan: CityPlan): Landmark[] {
  const city = plan.city.name;
  const own = LAGOS.includes(city) ? [THIRD_MAINLAND, LEKKI, THEATRE] : (CITY[city] ?? []);
  const list = [...own];
  for (const lm of COUNTRY[plan.city.flavor.id] ?? []) if (list.length < 3 && !list.includes(lm)) list.push(lm);
  return list.slice(0, 3);
}

/** Big white capitals on a clear background, for a sign that stands in the landscape. */
function lettersTexture(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 160;
  const c = canvas.getContext("2d")!;
  c.font = "900 150px system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "alphabetic";
  c.fillStyle = "#ffffff";
  c.fillText(text, 512, 148, 1000);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Bakes a landmark's shapes into one mesh per material (and per casts-a-shadow or not): the same
 * look in a handful of draws instead of dozens. Signs with their own texture stay as they are.
 */
function bake(g: THREE.Group, out: THREE.BufferGeometry[]) {
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; parts: THREE.BufferGeometry[] }>();
  for (const child of [...g.children]) {
    if (!(child instanceof THREE.Mesh) || child.userData.alone) continue;
    child.updateMatrix();
    const mat = child.material as THREE.Material;
    const cast = child.castShadow && !mat.userData.water;
    const key = `${mat.uuid}|${cast}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = { mat, cast, parts: [] }));
    bucket.parts.push(child.geometry.clone().applyMatrix4(child.matrix));
    if (child.userData.own) child.geometry.dispose();
    g.remove(child);
  }
  for (const { mat, cast, parts } of buckets.values()) {
    const merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    if (!merged) continue;
    out.push(merged);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
}

function label(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 112;
  const c = canvas.getContext("2d")!;
  c.font = "700 46px system-ui, sans-serif";
  const w = Math.min(500, c.measureText(text).width + 56);
  c.fillStyle = "rgba(24, 32, 43, 0.82)";
  c.beginPath();
  c.roundRect((512 - w) / 2, 18, w, 76, 38);
  c.fill();
  c.fillStyle = "#ffffff";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 256, 58, 470);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.center.set(0.5, 0);
  sprite.scale.set(4.6, 1, 1);
  return sprite;
}

/**
 * Builds this town's landmarks just outside it (in the flat farmland), turned to face the town,
 * clear of the railway's way out. Returns the group and where they stand (to keep the farmland
 * clear round them).
 */
export function buildLandmarks(plan: CityPlan, half: number, ground: (x: number, z: number) => number, blocked: (x: number, z: number, r: number) => boolean) {
  const group = new THREE.Group();
  const spots: Spot[] = [];
  const list = landmarksFor(plan);
  const mats = new Map<string, THREE.Material>();
  const mat = (color: number, shiny: boolean) => {
    const k = `${color}|${shiny}`;
    let m = mats.get(k);
    if (!m) {
      m = shiny ? new THREE.MeshPhongMaterial({ color, shininess: 120, specular: 0xffffff }) : new THREE.MeshLambertMaterial({ color });
      mats.set(k, m);
    }
    return m;
  };
  // Water catches the sun softly (a white highlight washes a big flat surface out).
  const waterMat = (color: number) => {
    const k = `water|${color}`;
    let m = mats.get(k);
    if (!m) {
      m = new THREE.MeshPhongMaterial({ color, shininess: 140, specular: 0x3a5f80, emissive: 0x0b2a44, emissiveIntensity: 0.12 });
      m.userData.water = true;
      mats.set(k, m);
    }
    return m;
  };
  /** Geometry and textures made for this town's landmarks (freed with them). */
  const geos: THREE.BufferGeometry[] = [];
  const textures: THREE.Texture[] = [];
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  geos.push(plane);
  list.forEach((lm, k) => {
    // Round the town at roughly even angles (each town turns them differently), a few tiles out.
    for (let tries = 0; tries < 16; tries++) {
      const a = ((k + hash(plan.seed, k, 990) * 0.6 + tries * 0.37) / list.length) * Math.PI * 2;
      const dirx = Math.cos(a);
      const dirz = Math.sin(a);
      const m = Math.max(Math.abs(dirx), Math.abs(dirz));
      const dist = (half + 2 + lm.r) / m;
      const x = dirx * dist;
      const z = dirz * dist;
      if (blocked(x, z, lm.r) || spots.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + lm.r + 1.5)) continue;
      const g = new THREE.Group();
      const b: Builder = {
        add(kind, color, lx, ly, lz, sx, sy, sz, ry = 0, tilt = 0, shiny = false) {
          const mesh = new THREE.Mesh(geo[kind], mat(color, shiny));
          mesh.position.set(lx, ly, lz);
          mesh.scale.set(sx, sy, sz);
          mesh.rotation.set(0, ry, tilt, "YXZ");
          mesh.castShadow = kind !== "box" || sy > 0.1;
          g.add(mesh);
          return mesh;
        },
        water(lx, lz, w, d, pool = false) {
          // A rim (sand or stone), pale shallows, then deeper water in the middle.
          const squareness = pool ? 12 : 3.2;
          const seed = plan.seed + k * 17 + Math.round(lx * 7 + lz * 13);
          const layers: [number, number, THREE.Material, number][] = [
            [pool ? 0.16 : 0.6, pool ? 0.16 : 0.6, mat(pool ? STONE : SAND, false), 0.02],
            [0, 0, waterMat(SHALLOW), 0.026],
            [-w * 0.3, -d * 0.18, waterMat(DEEP), 0.03],
          ];
          for (const [gw, gd, m, y] of layers) {
            if (pool && gw < 0) continue;
            const mesh = new THREE.Mesh(blob(w + gw, d + gd, squareness, seed), m);
            mesh.userData.own = true;
            mesh.position.set(lx, y, lz);
            g.add(mesh);
          }
        },
        letters(text, lx, ly, lz, w, h, lean = 0) {
          const tex = lettersTexture(text);
          textures.push(tex);
          const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
          mats.set(`letters|${mats.size}`, m);
          const mesh = new THREE.Mesh(plane, m);
          mesh.position.set(lx, ly, lz);
          mesh.scale.set(w, h, 1);
          mesh.rotation.x = -lean;
          mesh.castShadow = true;
          mesh.userData.alone = true;
          g.add(mesh);
        },
        rnd: (n) => hash(plan.seed, k * 31 + n, 991),
      };
      lm.make(b);
      bake(g, geos);
      // Face the town (the landmark's +z towards the middle).
      g.rotation.y = Math.atan2(-x, -z);
      g.position.set(x, ground(x, z), z);
      const tag = label(lm.name);
      const top = new THREE.Box3().setFromObject(g).max.y;
      tag.position.set(x, top + 0.4, z);
      group.add(g, tag);
      spots.push({ x, z, r: lm.r });
      break;
    }
  });
  return {
    group,
    spots,
    /** Is (x, z) on one of the landmarks' ground? */
    covers: (x: number, z: number) => spots.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 0.6),
    dispose() {
      group.removeFromParent();
      group.traverse((o) => {
        if (o instanceof THREE.Sprite) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
      for (const m of mats.values()) m.dispose();
      for (const g of geos) g.dispose();
      for (const t of textures) t.dispose();
    },
  };
}
