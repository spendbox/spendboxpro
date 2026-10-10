// What you see round you on a ride: the inside of a train carriage, the front seat on the top
// deck of a bus, the driver's seat of a car, the deck of a river boat, a Ferris wheel cabin, a
// helicopter's cockpit.
// Built in metres (floor of the vehicle at y = 0 for the train and the bus's road level, facing
// -z = the way it goes) and drawn by the city view over the city, like rooms: the city shows
// through the windows, gliding past. `eye` is where your eyes are; `spots` seat other people.

import * as THREE from "three";
import { sign, Sheet } from "./interior-art";
import { Kit, mixHex, rngFrom, shadeHex, shadowMesh } from "./kit";
import type { Spot } from "./figures";

export type CabinKind = "train" | "bus" | "car" | "boat" | "ferris" | "heli";

export type Cabin = {
  kind: CabinKind;
  group: THREE.Group;
  /** Your eyes, in the cabin (metres). */
  eye: THREE.Vector3;
  /** Which way you look to start with (relative to the way it goes) and how far you can look round. */
  aim: { yaw: number; pitch: number; pitchMin: number; pitchMax: number };
  spots: Spot[];
  update(time: number, night: number, steer: number): void;
  setAlpha(a: number): void;
  dispose(): void;
};

type Ctx = { k: Kit; sheet: Sheet; spots: Spot[] };

const sit = (x: Ctx, px: number, pz: number, ry: number, y: number, floor = 0) => {
  const p = x.k.world(px, 0, pz);
  x.spots.push({ x: p.x, z: p.z, ry: x.k.worldYaw(ry), pose: "sit", y: floor + y, floor, act: "idle" });
};

/** A padded seat facing -z at (px, y, pz) (width w), with its back behind it. */
function seat(x: Ctx, px: number, y: number, pz: number, w: number, fabric: number, back = 0.62, facing = 0) {
  const { k } = x;
  k.at(px, y, pz, facing, () => {
    k.box(0, 0, 0, w - 0.06, 0.4, 0.42, 0x3a3f45);
    k.soft(0, 0.38, -0.02, w - 0.04, 0.12, 0.48, fabric, 0.05);
    k.soft(0, 0.46, 0.22, w - 0.04, back, 0.12, fabric, 0.05, { rx: 0.1 });
    k.soft(0, 0.46 + back - 0.14, 0.24, w - 0.1, 0.14, 0.13, shadeHex(fabric, -0.15), 0.05);
  });
}

// ---------------------------------------------------------------- train

function train(x: Ctx, livery: number, key: string) {
  const { k, sheet } = x;
  const rnd = rngFrom(key);
  const L = 7.6;
  const W = 2.7;
  const H = 2.35;
  const fabric = [0x2f5d8a, 0x7a2e3a, 0x2f6d6a, 0x5c4a8a][Math.floor(rnd() * 4)];
  k.box(0, -0.05, 0, W, 0.05, L, 0x5b6370, { noAo: true });
  k.box(0, -0.004, 0, 0.6, 0.006, L, 0x868e96, { noAo: true });
  // Side walls with big windows between pillars.
  for (const side of [-1, 1]) {
    const wx = side * (W / 2 + 0.05);
    k.box(wx, 0, 0, 0.1, 0.82, L, 0xe9ecef, { noAo: true, grad: [0.85, 1, 0.82] });
    k.box(wx, 1.98, 0, 0.1, H - 1.98, L, 0xe9ecef, { noAo: true });
    k.box(side * (W / 2 - 0.02), 0.78, 0, 0.06, 0.06, L, livery, { noAo: true });
    const n = 5;
    for (let p = 0; p <= n; p++) k.box(wx, 0.82, -L / 2 + (p * L) / n, 0.12, 1.16, 0.26, 0xdee2e6, { noAo: true });
    // Luggage racks.
    k.box(side * (W / 2 - 0.2), 2.02, 0, 0.36, 0.03, L - 0.4, 0xadb5bd, { noAo: true });
    for (let p = 0; p < n; p++) k.quad(wx - side * 0.0, 1.4, -L / 2 + ((p + 0.5) * L) / n, (L / n) - 0.26, 1.16, 0xffffff, { layer: "glass", ry: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  // Ceiling and its lights.
  k.box(0, H, 0, W + 0.2, 0.08, L, 0xf1f3f5, { noAo: true });
  for (const sx of [-0.45, 0.45]) k.box(sx, H - 0.025, 0, 0.18, 0.02, L - 0.6, 0xf8fbff, { layer: "glow" });
  // End walls: a door with a window into the next carriage, and a route display.
  const route = sheet.paint(320, 48, (c, w, h) => sign(c, w, h, "Next stop: Central Station", 0x0e1116, 0xff9f1c, { weight: 700 }));
  for (const end of [-1, 1]) {
    const ez = end * (L / 2 + 0.04);
    k.box(-W / 4 - 0.25, 0, ez, W / 2 - 0.5, H, 0.08, 0xe9ecef, { noAo: true });
    k.box(W / 4 + 0.25, 0, ez, W / 2 - 0.5, H, 0.08, 0xe9ecef, { noAo: true });
    k.box(0, 1.95, ez, 1.0, H - 1.95, 0.08, 0xe9ecef, { noAo: true });
    k.box(0, 0, ez - end * 0.02, 0.96, 1.95, 0.04, 0x9aa1a8, { noAo: true });
    k.quad(0, 1.35, ez - end * 0.05, 0.6, 0.6, 0xffffff, { layer: "glass", ry: end > 0 ? Math.PI : 0 });
    k.quad(0, 2.1, ez - end * 0.06, 0.9, 0.14, 0xffffff, { layer: "texGlow", ry: end > 0 ? Math.PI : 0 }, route);
  }
  // Bays of seats, facing each other, both sides of the aisle; grab poles by the doors.
  for (let b = -2; b <= 2; b++) {
    const bz = b * 1.45;
    for (const side of [-1, 1]) {
      const sx = side * 0.75;
      seat(x, sx, 0, bz - 0.42, 0.95, fabric, 0.62, 0);
      seat(x, sx, 0, bz + 0.42, 0.95, fabric, 0.62, Math.PI);
      if (rnd() < 0.55) {
        const back = rnd() < 0.5;
        sit(x, sx + (rnd() < 0.5 ? -0.22 : 0.22), bz + (back ? 0.4 : -0.4), back ? 0 : Math.PI, 0.44);
      }
    }
    if (b !== 0) {
      k.box(0, 0.62, bz, 0.12, 0.08, 0.7, shadeHex(fabric, 0.3));
    }
  }
  for (const pz of [-L / 2 + 0.5, L / 2 - 0.5]) k.cyl(0.25, 0, pz, 0.025, 0.025, H, 0xffd43b, 8, { noAo: true });
  k.cyl(0, 2.15, 0, 0.018, 0.018, L - 0.8, 0xced4da, 6, { noAo: true, rx: Math.PI / 2 });
  // A window seat: looking out (and a little ahead), the carriage round you.
  return { eye: new THREE.Vector3(-0.98, 1.22, 0.36), aim: { yaw: Math.PI / 2 - 0.55, pitch: -0.08, pitchMin: -0.7, pitchMax: 0.5 } };
}

// ---------------------------------------------------------------- bus (top deck)

function bus(x: Ctx, livery: number, key: string) {
  const { k } = x;
  const rnd = rngFrom(key);
  const L = 9;
  const W = 2.5;
  const F = 2.2; // the top deck's floor
  const H = 1.95;
  const fabric = [0x2f4a8a, 0x7a2e3a, 0x3a5a40][Math.floor(rnd() * 3)];
  k.floorY = F;
  k.box(0, F - 0.06, 0, W, 0.06, L, 0x4a4f57, { noAo: true });
  for (const side of [-1, 1]) {
    const wx = side * (W / 2 + 0.05);
    k.box(wx, F, 0, 0.1, 0.72, L, livery, { noAo: true });
    k.box(wx, F + 1.7, 0, 0.1, H - 1.7, L, livery, { noAo: true });
    for (let p = 0; p <= 7; p++) k.box(wx, F + 0.72, -L / 2 + (p * L) / 7, 0.1, 1.0, 0.16, shadeHex(livery, 0.2), { noAo: true });
    k.box(side * (W / 2 - 0.04), F + 0.72, 0, 0.06, 0.05, L, 0xced4da, { noAo: true });
  }
  k.box(0, F + H, 0, W + 0.2, 0.08, L, 0xe9ecef, { noAo: true });
  for (const sx of [-0.5, 0.5]) k.box(sx, F + H - 0.025, 0, 0.12, 0.02, L - 1, 0xfff6e0, { layer: "glow" });
  // The big front window, a rail across it, and the panel below.
  const fz = -L / 2 - 0.05;
  k.box(0, F, fz, W + 0.2, 0.52, 0.1, livery, { noAo: true });
  k.box(0, F + 0.52, fz + 0.15, W - 0.1, 0.06, 0.3, 0x343a40, { noAo: true });
  k.box(0, F + 1.82, fz, W + 0.2, H - 1.82, 0.1, livery, { noAo: true });
  for (const sx of [-W / 2, W / 2]) k.box(sx, F + 0.52, fz, 0.14, 1.32, 0.12, shadeHex(livery, 0.2), { noAo: true });
  k.cyl(-W / 2 + 0.1, F + 0.95, fz + 0.32, 0.02, 0.02, W - 0.2, 0xffd43b, 8, { rz: -Math.PI / 2, noAo: true });
  k.box(0, F + 1.86, fz + 0.04, 0.4, 0.1, 0.06, 0x111316, { noAo: true });
  // Rows of seats facing forward (the front row is yours).
  for (let r = 0; r < 9; r++) {
    const rz = -L / 2 + 0.7 + r * 0.85;
    for (const sx of [-0.62, 0.62]) {
      if (r > 6 && sx > 0) continue; // the stairs down
      seat(x, sx, F, rz, 1.0, fabric, 0.55, 0);
      if (r > 1 && rnd() < 0.4) sit(x, sx + (rnd() < 0.5 ? -0.24 : 0.24), rz - 0.02, Math.PI, 0.44, F);
    }
  }
  k.box(0.62, F - 0.06, L / 2 - 0.9, 1.0, 0.07, 1.6, 0x2b2f33, { noAo: true });
  k.box(0.12, F, L / 2 - 0.9, 0.04, 1.0, 1.6, 0xced4da, { noAo: true });
  k.floorY = 0;
  return { eye: new THREE.Vector3(-0.62, F + 1.18, -L / 2 + 0.72), aim: { yaw: 0.05, pitch: -0.14, pitchMin: -0.8, pitchMax: 0.45 } };
}

// ---------------------------------------------------------------- car (driver's seat)

function car(x: Ctx, body: number, key: string) {
  const { k } = x;
  const rnd = rngFrom(key);
  const dark = 0x2b2f33;
  const trim = [0x3a3f45, 0x5c4033, 0xd8cbb5][Math.floor(rnd() * 3)];
  // The bonnet out in front.
  k.soft(0, 0.55, -1.75, 1.75, 0.32, 1.7, body, 0.12);
  k.box(0, 0.86, -1.0, 1.7, 0.05, 0.3, shadeHex(body, 0.25), { noAo: true });
  // Dashboard with the dials glowing and a screen in the middle.
  k.soft(0, 0.72, -0.82, 1.62, 0.34, 0.5, dark, 0.08);
  k.soft(0, 0.96, -0.72, 1.62, 0.08, 0.3, trim, 0.03);
  k.box(-0.38, 0.92, -0.6, 0.36, 0.12, 0.02, 0x0b1a2a, { noAo: true, rx: -0.4 });
  for (const dx of [-0.46, -0.3]) k.cyl(dx, 0.92, -0.585, 0.05, 0.05, 0.01, 0x9fe8ff, 16, { layer: "glow", rx: Math.PI / 2 - 0.4 });
  k.box(0.05, 0.86, -0.58, 0.26, 0.16, 0.02, 0x4dabf7, { layer: "glow", rx: -0.3 });
  // The windscreen frame, roof and doors.
  for (const sx of [-0.8, 0.8]) {
    const len = Math.hypot(0.6, 0.45);
    k.box(sx, 0.95, -0.82, 0.08, len, 0.08, dark, { noAo: true, rx: Math.atan2(0.6, 0.45) });
    k.box(sx, 0.95, 0.75, 0.08, 0.55, 0.1, dark, { noAo: true });
    k.box(sx * 1.03, 0.35, -0.1, 0.06, 0.62, 1.9, trim, { noAo: true });
    k.box(sx * 1.0, 0.95, -0.1, 0.05, 0.05, 1.7, dark, { noAo: true });
  }
  k.soft(0, 1.42, 0.2, 1.7, 0.08, 1.4, 0xdee2e6, 0.03);
  k.box(0, 1.38, -0.4, 1.66, 0.06, 0.12, dark, { noAo: true });
  // Rear-view mirror with something dangling from it.
  k.box(0, 1.28, -0.38, 0.26, 0.08, 0.03, 0x1f1f1f, { noAo: true });
  k.cyl(0, 1.1, -0.39, 0.004, 0.004, 0.16, 0x1f1f1f, 4, { noAo: true });
  k.ball(0, 1.08, -0.39, 0.03, [0xe03131, 0x2f9e44, 0xffd43b][Math.floor(rnd() * 3)], { w: 8, h: 6 });
  // Seats.
  for (const sx of [-0.38, 0.38]) {
    k.soft(sx, 0.3, 0.25, 0.52, 0.16, 0.55, trim, 0.06);
    k.soft(sx, 0.42, 0.55, 0.52, 0.72, 0.14, trim, 0.06, { rx: 0.15 });
    k.soft(sx, 1.12, 0.6, 0.3, 0.16, 0.12, shadeHex(trim, -0.1), 0.05);
  }
  k.soft(0, 0.3, 1.2, 1.4, 0.16, 0.5, trim, 0.06);
  k.soft(0, 0.42, 1.48, 1.4, 0.6, 0.14, trim, 0.06, { rx: 0.12 });
  k.box(0, 0.36, -0.1, 0.22, 0.32, 0.9, dark);
  if (rnd() < 0.6) sit(x, 0.38, 0.22, Math.PI, 0.42);
  if (rnd() < 0.4) sit(x, 0.42, 1.0, Math.PI, 0.42);
  // The steering wheel turns (drawn on its own).
  return { eye: new THREE.Vector3(-0.38, 1.22, 0.34), aim: { yaw: 0, pitch: -0.05, pitchMin: -0.55, pitchMax: 0.35 } };
}

// ---------------------------------------------------------------- boat (deck)

function boat(x: Ctx, cabin: number, key: string) {
  const { k } = x;
  const rnd = rngFrom(key);
  const L = 7;
  const W = 2.6;
  const D = 0.3; // the deck's height above the water
  k.floorY = D;
  // Hull sides and a pointed bow.
  for (const side of [-1, 1]) k.box(side * (W / 2), 0, 0.3, 0.12, D + 0.35, L - 1.4, 0xf8f9fa, { noAo: true });
  for (const side of [-1, 1]) k.box(side * 0.62, 0, -L / 2 + 0.55, 0.12, D + 0.35, 1.5, 0xf8f9fa, { noAo: true, ry: side * 0.55 });
  k.box(0, D - 0.06, 0.3, W, 0.06, L - 1.4, 0x8f6b4a, { noAo: true });
  for (let b = 0; b < 12; b++) k.box(-W / 2 + 0.1 + b * 0.21, D, 0.3, 0.012, 0.004, L - 1.4, 0x6b4f37, { noAo: true });
  k.box(0, D - 0.06, -L / 2 + 0.7, 1.5, 0.06, 1.2, 0x8f6b4a, { noAo: true, ry: 0 });
  // Railings with life rings.
  for (const side of [-1, 1]) {
    k.box(side * (W / 2), D + 0.95, 0.3, 0.06, 0.05, L - 1.4, 0xced4da, { noAo: true });
    for (let p = 0; p < 7; p++) k.box(side * (W / 2), D + 0.3, -L / 2 + 1.0 + p * ((L - 1.4) / 6), 0.04, 0.65, 0.04, 0xced4da, { noAo: true });
    k.ring(side * (W / 2 + 0.02), D + 0.6, 1.4, 0.24, 0.06, 0xff7a1a, { ry: Math.PI / 2 });
  }
  // Benches along the sides, a canopy over the middle with a striped edge, a flag at the back.
  for (const side of [-1, 1]) {
    for (let b = 0; b < 3; b++) {
      const bz = -0.6 + b * 1.25;
      k.box(side * (W / 2 - 0.35), D, bz, 0.5, 0.42, 1.0, 0x6b4f37);
      if (rnd() < 0.6) sit(x, side * (W / 2 - 0.4), bz + (rnd() - 0.5) * 0.4, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0.42, D);
    }
  }
  for (const [px, pz] of [[-1.1, -1.2], [1.1, -1.2], [-1.1, 2.6], [1.1, 2.6]]) k.cyl(px, D, pz, 0.03, 0.03, 2.1, 0xced4da, 6, { noAo: true });
  k.box(0, D + 2.1, 0.7, 2.5, 0.06, 4.0, cabin, { noAo: true });
  for (let s = 0; s < 10; s++) k.box(-1.15 + s * 0.255, D + 1.95, -1.32, 0.13, 0.16, 0.02, s % 2 ? 0xffffff : cabin, { noAo: true });
  k.cyl(0, D, L / 2 - 0.4, 0.025, 0.025, 2.6, 0xced4da, 6, { noAo: true });
  // Sitting up front (low enough to pass under the bridges).
  k.box(0.3, D, -1.55, 1.2, 0.4, 0.45, 0x6b4f37);
  return { eye: new THREE.Vector3(0.3, D + 1.08, -1.5), aim: { yaw: 0.05, pitch: -0.08, pitchMin: -0.9, pitchMax: 0.45 }, flag: new THREE.Vector3(0, D + 2.4, L / 2 - 0.4) };
}

// ---------------------------------------------------------------- Ferris wheel cabin

function gondola(x: Ctx, color: number) {
  const { k } = x;
  const R = 1.25;
  const F = -1.05;
  k.floorY = F;
  k.cyl(0, F - 0.08, 0, R, R, 0.08, 0x5b6370, 8, { noAo: true });
  // Eight sides: a low wall, glass, posts, and a domed roof.
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * Math.PI * 2 + Math.PI / 8;
    const px = Math.sin(a) * R * 0.92;
    const pz = Math.cos(a) * R * 0.92;
    k.at(px, F, pz, a, () => {
      k.box(0, 0, 0, R * 0.78, 0.6, 0.06, color, { noAo: true });
      k.box(0, 0.58, 0, R * 0.8, 0.05, 0.1, 0xf1f3f5, { noAo: true });
      k.quad(0, 1.25, -0.0, R * 0.74, 1.3, 0xffffff, { layer: "glass" });
    });
    const ca = (s / 8) * Math.PI * 2;
    k.box(Math.sin(ca) * R * 0.96, F, Math.cos(ca) * R * 0.96, 0.07, 1.95, 0.07, 0xf1f3f5, { noAo: true });
  }
  k.cyl(0, F + 1.92, 0, R * 1.02, R * 1.02, 0.08, color, 8, { noAo: true });
  k.ball(0, F + 2.0, 0, R * 0.98, color, { part: 0.3, sy: 0.4, w: 16, h: 6, noAo: true });
  k.cyl(0, F + 2.3, 0, 0.05, 0.05, 1.4, 0xdee2e6, 6, { noAo: true });
  k.cyl(0, F + 1.88, 0, 0.18, 0.18, 0.02, 0xfff3d6, 14, { layer: "glow" });
  // Benches facing each other.
  for (const side of [-1, 1]) {
    k.box(0, F, side * 0.68, 1.5, 0.42, 0.45, 0x6b4f37);
    k.soft(0, F + 0.42, side * 0.68, 1.5, 0.08, 0.45, mixHex(color, 0xffffff, 0.5), 0.03);
  }
  // Other riders on your bench (the view out in front stays clear).
  sit(x, -0.64, 0.7, Math.PI, 0.46, F);
  sit(x, 0.64, 0.7, Math.PI, 0.46, F);
  return { eye: new THREE.Vector3(0, F + 1.18, 0.62), aim: { yaw: 0, pitch: -0.2, pitchMin: -1.1, pitchMax: 0.5 } };
}

// ---------------------------------------------------------------- helicopter (cockpit)

function heli(x: Ctx, body: number, key: string) {
  const { k } = x;
  const rnd = rngFrom(key);
  const F = -0.55;
  k.floorY = F;
  const dark = 0x2b2f33;
  const seat = [0x343a40, 0x5c4033, 0x1f3b5c][Math.floor(rnd() * 3)];
  // Floor at the back, a glass panel at your feet at the front (look straight down!).
  k.box(0, F - 0.06, 0.55, 1.7, 0.06, 1.7, 0x495057, { noAo: true });
  k.quad(0, F - 0.03, -0.75, 1.5, 0.9, 0xffffff, { layer: "glass", rx: -Math.PI / 2 });
  k.box(0, F - 0.08, -0.75, 1.56, 0.04, 0.96, dark, { noAo: true });
  k.box(0, F - 0.06, -0.75, 1.4, 0.05, 0.8, dark, { noAo: true });
  // Doors and a low wall in the helicopter's colour down both sides.
  for (const side of [-1, 1]) {
    k.box(side * 0.85, F, 0.3, 0.06, 0.55, 2.0, body, { noAo: true });
    k.quad(side * 0.85, F + 1.05, 0.3, 2.0, 0.95, 0xffffff, { layer: "glass", ry: side * Math.PI / 2 });
    k.box(side * 0.85, F + 0.55, 0.3, 0.07, 0.04, 2.0, 0xf1f3f5, { noAo: true });
    k.box(side * 0.85, F, 1.32, 0.08, 1.6, 0.08, dark, { noAo: true });
  }
  // The bubble: glass all round the front and over your head, on a thin frame.
  for (let s = 0; s < 5; s++) {
    const a = -0.7 + s * 0.35;
    k.at(Math.sin(a) * 0.95, F, -0.75 + -Math.cos(a) * 0.45, a, () => {
      k.quad(0, 0.85, 0, 0.36, 1.25, 0xffffff, { layer: "glass", rx: 0.25 });
    });
    k.box(Math.sin(a - 0.175) * 0.97, F + 0.2, -0.75 - Math.cos(a - 0.175) * 0.47, 0.022, 1.35, 0.022, dark, { noAo: true, rx: 0.25 });
  }
  k.quad(0, F + 1.6, -0.1, 1.7, 1.6, 0xffffff, { layer: "glass", rx: -Math.PI / 2 });
  for (const sx of [-0.55, 0.55]) k.box(sx, F + 1.6, -0.1, 0.04, 0.04, 1.8, dark, { noAo: true });
  k.box(0, F + 1.62, 1.0, 1.7, 0.06, 0.7, body, { noAo: true });
  // The instrument panel, low and in front of the pilot (your side stays clear), and a console.
  k.soft(0.42, F + 0.32, -1.1, 0.62, 0.26, 0.22, dark, 0.05);
  for (const sx of [0.3, 0.54]) k.box(sx, F + 0.48, -1.02, 0.2, 0.12, 0.02, sx < 0.4 ? 0x51cf66 : 0x4dabf7, { layer: "glow", rx: -0.5 });
  k.box(0, F, -0.65, 0.22, 0.42, 0.5, dark);
  k.box(0, F + 0.42, -0.62, 0.18, 0.02, 0.32, 0x4dabf7, { layer: "glow", rx: -0.3 });
  for (const sx of [-0.42, 0.42]) {
    k.cyl(sx, F, -0.45, 0.02, 0.02, 0.55, dark, 6, { noAo: true, rx: -0.25 });
    k.ball(sx, F + 0.55, -0.6, 0.04, 0x1f1f1f, { w: 8, h: 6 });
  }
  // Two seats up front (the pilot flies on the right), and a bench for three behind.
  for (const sx of [-0.42, 0.42]) {
    k.soft(sx, F + 0.25, -0.2, 0.5, 0.14, 0.5, seat, 0.05);
    k.soft(sx, F + 0.35, 0.08, 0.5, 0.75, 0.12, seat, 0.05, { rx: 0.12 });
    k.box(sx, F, -0.2, 0.3, 0.25, 0.3, dark);
  }
  k.soft(0, F + 0.25, 0.75, 1.5, 0.14, 0.5, seat, 0.05);
  k.soft(0, F + 0.35, 1.03, 1.5, 0.75, 0.12, seat, 0.05, { rx: 0.1 });
  k.box(0, F, 0.75, 1.4, 0.25, 0.4, dark);
  sit(x, 0.42, -0.28, Math.PI, 0.38, F);
  if (rnd() < 0.7) sit(x, -0.5, 0.68, Math.PI, 0.38, F);
  if (rnd() < 0.5) sit(x, 0.5, 0.68, Math.PI, 0.38, F);
  // You're in the co-pilot's seat: the whole city in front and below.
  return { eye: new THREE.Vector3(-0.42, F + 1.05, -0.22), aim: { yaw: 0, pitch: -0.35, pitchMin: -1.35, pitchMax: 0.45 } };
}

// ---------------------------------------------------------------- putting it together

export function createCabin(kind: CabinKind, key: string, color: number): Cabin {
  const sheet = new Sheet(512);
  const k = new Kit();
  const x: Ctx = { k, sheet, spots: [] };
  const built =
    kind === "train"
      ? train(x, color, key)
      : kind === "bus"
        ? bus(x, color, key)
        : kind === "car"
          ? car(x, color, key)
          : kind === "boat"
            ? boat(x, color, key)
            : kind === "heli"
              ? heli(x, color, key)
              : gondola(x, color);
  const tex = sheet.finish();
  const mats = {
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    tex: new THREE.MeshLambertMaterial({ vertexColors: true, map: tex }),
    texGlow: new THREE.MeshBasicMaterial({ vertexColors: true, map: tex }),
    glass: new THREE.MeshBasicMaterial({ color: 0xd6e9f5, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
    foliage: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  };
  const group = k.build(mats);
  const shadows = shadowMesh(k.shadows);
  if (shadows) group.add(shadows);
  const extra: THREE.Material[] = [];
  // The car's steering wheel, and the boat's flag, move.
  let wheel: THREE.Object3D | null = null;
  let flag: THREE.Mesh | null = null;
  if (kind === "car") {
    const wm = new THREE.MeshLambertMaterial({ color: 0x1f1f1f });
    extra.push(wm);
    const g = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 8, 28), wm);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12).rotateX(Math.PI / 2), wm);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.02), wm);
    const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.02).translate(0, -0.09, 0), wm);
    g.add(rim, hub, spoke, spoke2);
    const holder = new THREE.Group();
    holder.position.set(-0.38, 0.9, -0.42);
    holder.rotation.x = -0.5;
    g.scale.setScalar(0.92);
    holder.add(g);
    group.add(holder);
    wheel = g;
  }
  const flagAt = (built as { flag?: THREE.Vector3 }).flag;
  if (kind === "boat" && flagAt) {
    const fm = new THREE.MeshLambertMaterial({ color: 0xe03131, side: THREE.DoubleSide });
    extra.push(fm);
    flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45, 6, 1).translate(0.35, 0, 0), fm);
    flag.position.copy(flagAt);
    flag.rotation.y = Math.PI / 2;
    group.add(flag);
  }
  const hemi = new THREE.HemisphereLight(0xfff8ee, 0x8a7f72, 1.5);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.0);
  sun.position.set(-3, 6, -2);
  group.add(hemi, sun);
  const all: THREE.Material[] = [...Object.values(mats), ...extra];
  if (shadows) all.push(shadows.material as THREE.Material);
  const base = new Map(all.map((m) => [m, { o: m.opacity, t: m.transparent }]));
  let alpha = 1;
  return {
    kind,
    group,
    eye: built.eye,
    aim: built.aim,
    spots: x.spots,
    update(time, night, steer) {
      hemi.intensity = 1.5 - 0.95 * night;
      sun.intensity = 1.0 * (1 - night) + 0.06;
      mats.glow.color.setScalar(0.85 + 0.4 * night);
      if (wheel) wheel.rotation.z += (-steer * 2.4 - wheel.rotation.z) * 0.15;
      if (flag) {
        const pos = flag.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i);
          pos.setZ(i, Math.sin(time * 6 + px * 6) * 0.06 * px);
        }
        pos.needsUpdate = true;
      }
    },
    setAlpha(a) {
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
