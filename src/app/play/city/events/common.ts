// Building blocks for the world-event scenes: little people (standing, walking, dancing,
// cheering), crowds, fire and smoke, water jets, fireworks, confetti, sparkles, vehicles driving
// a route or parked by the road. Everything is a pure function of the event's own clock and id,
// so every player sees the same thing at the same moment. No allocations per frame.

import type { LucideIcon } from "lucide-react";
import * as THREE from "three";
import type { WorldEvent, WorldEventKind } from "@/lib/world-events";
import type { EventSound } from "../event-sounds";
import { BALL, BOX, CONE, CYL, FACE, type Kit, type Model } from "./kit";
import { along, type Along, type Spot } from "./spots";

/** Everything a scene needs to draw one event, one frame. One per event, reused every frame. */
export type Ev = {
  k: Kit;
  id: number;
  key: string;
  kind: WorldEventKind;
  ev: WorldEvent;
  s: Spot;
  /** Seconds since it started, how long it lasts, seconds left. */
  t: number;
  dur: number;
  left: number;
  /** 0..1: fades in over the first seconds and out over the last ones. */
  life: number;
  /** Size for things that pop up (a little overshoot at the start, shrink away at the end). */
  pop: number;
  night: number;
  /** A reward that can still be grabbed (by you). */
  claimable: boolean;
  /** Where the badge floats (scenes can move it, e.g. to follow a parade). */
  bx: number;
  by: number;
  bz: number;
  /** Half the width of the built city (in tiles). */
  half: number;
  /** A badge-sheet cell this event owns (bounty poster), or -1. */
  cell: number;
  /** Stable random numbers for this event: r(n) is always the same for the same n. */
  r: (n: number) => number;
  a: Along;
  b: Along;
  v: THREE.Vector3;
};

export type Scene = {
  icon: LucideIcon;
  sound: EventSound;
  draw: (e: Ev) => void;
};

export const TAU = Math.PI * 2;
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const frac = (v: number) => v - Math.floor(v);
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Integer hash → 0..1 (stable). */
export function h1(a: number, b = 0, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const easeOutBack = (t: number) => {
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

export const SHIRTS = [0xe5484d, 0x4dabf7, 0xffd43b, 0x69db7c, 0xf783ac, 0xffffff, 0x845ef7, 0xff922b, 0x20c997, 0x343a40, 0x1c7ed6, 0xe64980];
export const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a1e, 0xffdbac, 0x7a4a2a];
export const PARTY = [0xff4d6d, 0xffd43b, 0x4dabf7, 0x69db7c, 0xf783ac, 0x9775fa, 0xff922b, 0x22d3ee];
export const ASO = [0xd4af37, 0x7b2cbf, 0xd4af37, 0x7b2cbf, 0xffffff];
export const HIVIS = [0xffd43b, 0xff922b];

// ---------------------------------------------------------------- people

export const STAND = 0;
export const WALK = 1;
export const RUN = 2;
export const DANCE = 3;
export const CHEER = 4;
export const WAVE = 5;
export const SYNC = 6;
export const WORK = 7;

const HIP = 0.09;
const SHOULDER = 0.172;
const legDir = new THREE.Vector3();

/**
 * One little person (about a quarter of a tile tall at size 1), facing yaw (+x at 0).
 * pose: STAND, WALK, RUN, DANCE, CHEER, WAVE, SYNC (everyone dances the same moves), WORK.
 */
export function person(k: Kit, x: number, y: number, z: number, yaw: number, shirt: number, skin: number, pose: number, t: number, ph: number, sc = 1, legs = 0x343a40, hat = -1) {
  let bob = 0;
  let lean = 0;
  let legA = 0;
  let armF = 0;
  let armUpL = 0.12;
  let armUpR = 0.12;
  let turn = 0;
  const tt = t + ph;
  switch (pose) {
    case WALK:
      legA = Math.sin(tt * 7) * 0.5;
      armF = -legA * 0.8;
      bob = Math.abs(Math.sin(tt * 7)) * 0.008;
      break;
    case RUN:
      legA = Math.sin(tt * 12) * 0.9;
      armF = -legA * 0.9;
      bob = Math.abs(Math.sin(tt * 12)) * 0.016;
      lean = -0.25;
      break;
    case DANCE:
      bob = Math.abs(Math.sin(tt * 5)) * 0.022;
      armUpL = 1.2 + Math.sin(tt * 5) * 0.9;
      armUpR = 1.2 - Math.sin(tt * 5) * 0.9;
      legA = Math.sin(tt * 5) * 0.25;
      turn = Math.sin(tt * 2.5) * 0.6;
      break;
    case SYNC: {
      // Everyone does the same moves at the same time (ph ignored).
      const b = Math.floor(t * 2) % 4;
      bob = Math.abs(Math.sin(t * 6.28)) * 0.025;
      armUpL = b === 0 ? 2.6 : b === 1 ? 0.2 : b === 2 ? 1.5 : 2.6;
      armUpR = b === 0 ? 0.2 : b === 1 ? 2.6 : b === 2 ? 1.5 : 2.6;
      legA = b === 2 ? 0.4 : 0;
      turn = b === 3 ? Math.sin(t * 6.28) * 1.2 : 0;
      break;
    }
    case CHEER:
      bob = Math.max(0, Math.sin(tt * 6)) * 0.035;
      armUpL = 2.6 + Math.sin(tt * 9) * 0.25;
      armUpR = 2.6 - Math.sin(tt * 9) * 0.25;
      break;
    case WAVE:
      armUpR = 2.4 + Math.sin(tt * 8) * 0.35;
      break;
    case WORK:
      armF = -0.9 + Math.sin(tt * 4) * 0.5;
      lean = -0.2 - Math.max(0, Math.sin(tt * 4)) * 0.2;
      break;
  }
  k.root(x, y + bob * sc, z, yaw + turn, sc, 0, lean);
  for (let side = -1; side <= 1; side += 2) {
    const a = legA * side;
    legDir.set(Math.sin(a), -Math.cos(a), 0);
    k.rput(BOX, legDir.x * 0.045, HIP + legDir.y * 0.045, side * 0.017, 0.022, 0.09, 0.022, legs, 0, 0, a);
  }
  k.rput(CYL, 0, 0.135, 0, 0.07, 0.09, 0.062, shirt);
  k.rput(BALL, 0, 0.207, 0, 0.052, 0.056, 0.052, skin);
  if (hat >= 0) k.rput(CYL, 0, 0.243, 0, 0.06, 0.025, 0.06, hat);
  for (let side = -1; side <= 1; side += 2) {
    const up = side < 0 ? armUpL : armUpR;
    const f = armF * side;
    const th = -up * side;
    // Arm hangs from the shoulder: down, swung forward by f, raised out sideways by up.
    const dx = Math.sin(f);
    const dy = -Math.cos(f) * Math.cos(th);
    const dz = -Math.cos(f) * Math.sin(th);
    k.rput(BOX, dx * 0.04, SHOULDER + dy * 0.04, side * 0.045 + dz * 0.04, 0.018, 0.08, 0.018, side > 0 && up > 2 ? skin : shirt, 0, th, f);
  }
}

/**
 * A crowd of n people round (cx, cz) within rx × rz, all doing `pose`. If (fx, fz) is given
 * they face it (a stage, a fire, a parade); otherwise every which way.
 */
export function crowd(e: Ev, n: number, cx: number, cy: number, cz: number, rx: number, rz: number, pose: number, fx = NaN, fz = NaN, salt = 0, shirts: readonly number[] = SHIRTS, sc = 1) {
  const k = e.k;
  const grow = clamp(e.pop);
  if (grow <= 0.02) return;
  for (let i = 0; i < n; i++) {
    const a = h1(e.id, i, salt + 11);
    const b = h1(e.id, i, salt + 12);
    // Spread out evenly in an ellipse (sunflower pattern), with a little jitter.
    const rr = Math.sqrt((i + 0.5) / n);
    const ang = i * 2.39996 + a * 0.6;
    const x = cx + Math.cos(ang) * rr * rx + (b - 0.5) * 0.05;
    const z = cz + Math.sin(ang) * rr * rz + (a - 0.5) * 0.05;
    const yaw = Number.isNaN(fx) ? b * TAU : Math.atan2(-(fz - z), fx - x);
    person(k, x, cy, z, yaw, shirts[Math.floor(a * shirts.length) % shirts.length], SKINS[Math.floor(b * SKINS.length) % SKINS.length], pose, e.t, a * 10, sc * grow);
  }
}

/** A line of people (a queue), from (x0, z0) towards (x1, z1), facing the front. */
export function queue(e: Ev, n: number, x0: number, y: number, z0: number, x1: number, z1: number, salt = 0, shuffle = true) {
  const yaw = Math.atan2(-(z0 - z1), x0 - x1);
  const grow = clamp(e.pop);
  for (let i = 0; i < n; i++) {
    const f = i / Math.max(1, n - 1);
    const a = h1(e.id, i, salt + 31);
    const step = shuffle ? Math.max(0, Math.sin(e.t * 0.8 - i * 0.4)) * 0.02 : 0;
    person(e.k, x0 + (x1 - x0) * f + (a - 0.5) * 0.04, y, z0 + (z1 - z0) * f + (a - 0.5) * 0.04 + step, yaw, SHIRTS[Math.floor(a * SHIRTS.length) % SHIRTS.length], SKINS[i % SKINS.length], STAND, e.t, a * 5, grow);
  }
}

// ---------------------------------------------------------------- fire, smoke, water

/** Flames rising from (x, y, z): size about the flame's height. */
export function fire(k: Kit, x: number, y: number, z: number, size: number, t: number, salt: number, a: number, n = 26) {
  if (a <= 0.01) return;
  for (let i = 0; i < n; i++) {
    const r1 = h1(salt, i, 1);
    const r2 = h1(salt, i, 2);
    const u = frac(t * (1.1 + r1 * 0.8) + r2);
    const spread = (1 - u) * size * 0.35;
    const ang = r1 * TAU + t * 0.5;
    const px = x + Math.cos(ang) * spread * r2;
    const pz = z + Math.sin(ang) * spread * r2;
    const py = y + u * size * (0.9 + r2 * 0.5);
    const col = u < 0.25 ? 0xfff3a0 : u < 0.55 ? 0xffa21a : 0xff4d1a;
    k.spark(px, py, pz, size * (0.55 - u * 0.4), col, a * (1 - u) * 0.95);
  }
  k.glow(x, y + size * 0.3, z, size * 2.4, 0xff7a1a, a * (0.55 + 0.15 * Math.sin(t * 13 + salt)));
}

/** A column of smoke from (x, y, z), drifting with the wind. */
export function smoke(k: Kit, x: number, y: number, z: number, t: number, salt: number, height: number, width: number, hex: number, a: number, n = 18, windX = 0.25, windZ = 0.1) {
  if (a <= 0.01) return;
  for (let i = 0; i < n; i++) {
    const r1 = h1(salt, i, 3);
    const r2 = h1(salt, i, 4);
    const u = frac(t * 0.18 * (0.8 + r1 * 0.5) + r2);
    const px = x + (r1 - 0.5) * width * 0.6 + windX * u * height;
    const pz = z + (r2 - 0.5) * width * 0.6 + windZ * u * height;
    k.puff(px, y + u * height, pz, width * (0.6 + u * 1.6), hex, a * Math.sin(u * Math.PI) * 0.75);
  }
}

/** Water flying along an arc from (x0, y0, z0) to (x1, y1, z1), peaking `lift` above. */
export function waterArc(k: Kit, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, lift: number, t: number, salt: number, a: number, n = 22, hex = 0xd8f1ff) {
  if (a <= 0.01) return;
  for (let i = 0; i < n; i++) {
    const r = h1(salt, i, 5);
    const u = frac(t * 1.4 + i / n);
    const px = x0 + (x1 - x0) * u + (r - 0.5) * 0.03 * u;
    const pz = z0 + (z1 - z0) * u + (r - 0.5) * 0.03 * u;
    const py = y0 + (y1 - y0) * u + lift * 4 * u * (1 - u);
    k.bit(px, py, pz, 0.035 + u * 0.03, hex, a * 0.9);
    if (i % 3 === 0) k.puff(px, py, pz, 0.08 + u * 0.1, 0xffffff, a * 0.25);
  }
  k.puff(x1, y1, z1, 0.25, 0xffffff, a * 0.35);
}

/** A fountain of water shooting up h high from (x, y, z), splashing round. */
export function fountain(k: Kit, x: number, y: number, z: number, h: number, t: number, salt: number, a: number, n = 40, width = 0.25) {
  if (a <= 0.01) return;
  for (let i = 0; i < n; i++) {
    const r1 = h1(salt, i, 6);
    const r2 = h1(salt, i, 7);
    const u = frac(t * 0.9 + r1);
    const ang = r2 * TAU;
    const out = width * (0.3 + r1) * u;
    const py = y + h * (4 * u * (1 - u)) * (0.75 + r2 * 0.4);
    k.bit(x + Math.cos(ang) * out, py, z + Math.sin(ang) * out, 0.03 + r1 * 0.03, 0xe3f4ff, a);
    if (i % 2) k.puff(x + Math.cos(ang) * out, py, z + Math.sin(ang) * out, 0.12 + u * 0.2, 0xffffff, a * 0.22);
  }
}

// ---------------------------------------------------------------- party things

/** Unit directions for firework bursts (evenly spread on a sphere). */
const BURST = (() => {
  const n = 40;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    out[i * 3] = Math.cos(a) * r;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(a) * r;
  }
  return out;
})();
const BURST_N = 40;

/**
 * Fireworks over (cx, cz): shells climb from the ground at y0 and burst between y1 and y2.
 * `shells` go up at once, each on its own rhythm; colours from `cols`.
 */
export function fireworks(k: Kit, cx: number, y0: number, cz: number, y1: number, y2: number, spread: number, t: number, salt: number, a: number, shells = 4, cols: readonly number[] = PARTY, period = 2.8) {
  if (a <= 0.01) return 0;
  let flash = 0;
  for (let j = 0; j < shells; j++) {
    const tt = t + (j * period) / shells + h1(salt, j, 9) * 0.5;
    const cyc = Math.floor(tt / period);
    const u = tt - cyc * period;
    const r1 = h1(salt + cyc, j, 10);
    const r2 = h1(salt + cyc, j, 11);
    const bx = cx + (r1 - 0.5) * spread;
    const bz = cz + (r2 - 0.5) * spread;
    const by = y1 + (y2 - y1) * h1(salt + cyc, j, 12);
    const col = cols[Math.floor(h1(salt + cyc, j, 13) * cols.length) % cols.length];
    const rise = 0.75;
    if (u < rise) {
      const f = u / rise;
      const e = 1 - (1 - f) * (1 - f);
      const py = y0 + (by - y0) * e;
      k.spark(bx, py, bz, 0.18, 0xfff1c0, a);
      k.spark(bx, py - 0.15, bz, 0.12, 0xffb35c, a * 0.5);
    } else {
      const v = u - rise;
      const life = period - rise - 0.3;
      if (v > life) continue;
      const f = v / life;
      const radius = (1 - Math.pow(1 - Math.min(1, v / 0.9), 3)) * (0.9 + r1 * 0.6);
      const drop = v * v * 0.35;
      const fade = a * (1 - f) * (1 - f);
      for (let i = 0; i < BURST_N; i++) {
        const sx = bx + BURST[i * 3] * radius;
        const sy = by + BURST[i * 3 + 1] * radius - drop;
        const sz = bz + BURST[i * 3 + 2] * radius;
        const tw = i % 3 === 0 && f > 0.4 ? 0.5 + 0.5 * Math.sin(v * 40 + i) : 1;
        k.spark(sx, sy, sz, 0.16 * (1 - f * 0.5), col, fade * tw);
      }
      if (v < 0.25) {
        k.glow(bx, by, bz, 3.2 * (1 - v * 3), col, a * (1 - v * 4));
        flash = Math.max(flash, 1 - v * 4);
      }
    }
  }
  return flash;
}

/** Confetti raining over (cx, cz) from height y + h, spread wide. */
export function confetti(k: Kit, cx: number, y: number, cz: number, spread: number, h: number, t: number, salt: number, a: number, n = 60, cols: readonly number[] = PARTY) {
  if (a <= 0.01) return;
  for (let i = 0; i < n; i++) {
    const r1 = h1(salt, i, 14);
    const r2 = h1(salt, i, 15);
    const u = frac(t * (0.22 + r1 * 0.12) + r2);
    const px = cx + (r1 - 0.5) * spread + Math.sin(t * 3 + i) * 0.06;
    const pz = cz + (r2 - 0.5) * spread + Math.cos(t * 2.6 + i) * 0.06;
    k.bit(px, y + h * (1 - u), pz, 0.035 + 0.015 * Math.abs(Math.sin(t * 8 + i)), cols[i % cols.length], a * Math.min(1, (1 - u) * 6));
  }
}

/** Twinkling sparkles in a box round (cx, cy, cz). */
export function sparkles(k: Kit, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, t: number, salt: number, hex: number, a: number, n = 24, size = 0.12) {
  if (a <= 0.01) return;
  for (let i = 0; i < n; i++) {
    const r1 = h1(salt, i, 16);
    const r2 = h1(salt, i, 17);
    const r3 = h1(salt, i, 18);
    const tw = Math.max(0, Math.sin(t * (2 + r1 * 3) + r2 * 10));
    k.spark(cx + (r1 - 0.5) * 2 * rx, cy + (r3 - 0.5) * 2 * ry + Math.sin(t + i) * 0.05, cz + (r2 - 0.5) * 2 * rz, size * (0.5 + tw), hex, a * tw);
  }
}

/** Coloured spotlights sweeping the sky from (x, y, z). */
export function searchlights(k: Kit, x: number, y: number, z: number, n: number, len: number, t: number, cols: readonly number[], a: number, spread = 0.6, speed = 0.7) {
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU + Math.sin(t * speed + i) * 0.8;
    const tilt = spread * (0.5 + 0.5 * Math.sin(t * speed * 1.3 + i * 2));
    const dx = Math.cos(ang) * Math.sin(tilt);
    const dz = Math.sin(ang) * Math.sin(tilt);
    const dy = Math.cos(tilt);
    k.beam(x, y, z, x + dx * len, y + dy * len, z + dz * len, len * 0.09, cols[i % cols.length], a * 0.35);
  }
}

/** Red and blue flashes (police, ambulances, fire engines), seen from far away. */
export function flashers(k: Kit, x: number, y: number, z: number, t: number, ph: number, a: number, size = 0.7) {
  const on = Math.floor(t * 6 + ph) % 2 === 0;
  k.glow(x, y, z, size, on ? 0xff2a2a : 0x2a5bff, a * (0.75 + 0.25 * Math.sin(t * 30)));
}

/** A string of little flags between two points (bunting), sagging in the middle. */
export function bunting(k: Kit, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, n: number, t: number, cols: readonly number[] = PARTY, sc = 1) {
  const yaw = Math.atan2(-(z1 - z0), x1 - x0);
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const sag = Math.sin(f * Math.PI) * 0.12;
    k.put(BOX, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f - sag - 0.025 * sc, z0 + (z1 - z0) * f, 0.035 * sc, 0.045 * sc, 0.006, yaw, cols[i % cols.length], 0, Math.sin(t * 3 + i) * 0.3);
  }
}

// ---------------------------------------------------------------- vehicles

/**
 * Vehicles driving along the event's route, one behind the other (gap apart), looping round
 * (they appear at the start and leave at the end). Returns the lead's position in e.a.
 */
export function convoy(e: Ev, models: readonly Model[], gap: number, speed: number, side: number, sc: number, setSlots?: (k: Kit, i: number) => void, lights = false, offset = 0) {
  const k = e.k;
  const s = e.s;
  const n = models.length;
  const span = s.len + n * gap + 1;
  const head = ((e.t * speed + offset) % span) - 0.5;
  for (let i = 0; i < n; i++) {
    const d = head - i * gap;
    if (d < 0 || d > s.len) continue;
    along(s, d, e.b, side);
    const fade = Math.min(1, d / 0.4, (s.len - d) / 0.4) * e.pop;
    if (fade <= 0.02) continue;
    if (setSlots) setSlots(k, i);
    k.root(e.b.x, e.b.y, e.b.z, e.b.yaw, sc * fade);
    k.model(models[i], e.t);
    if (lights) flashers(k, e.b.x, e.b.y + 0.3 * sc, e.b.z, e.t, i, e.life * fade, 0.8);
    if (i === 0) {
      e.a.x = e.b.x;
      e.a.y = e.b.y;
      e.a.z = e.b.z;
      e.a.yaw = e.b.yaw;
    }
  }
}

/** Where the i-th vehicle parks on the road in front of the place (into e.b). */
export function parkSpot(e: Ev, i: number, spacing = 0.5, side = 0.15) {
  const s = e.s;
  const ca = Math.cos(s.fyaw);
  const sa = -Math.sin(s.fyaw);
  const off = (i - 0.5) * spacing;
  e.b.x = s.fx + ca * off - sa * side * (i % 2 ? -1 : 1);
  e.b.z = s.fz + sa * off + ca * side * (i % 2 ? -1 : 1);
  e.b.y = 0.06;
  e.b.yaw = s.fyaw + (i % 2 ? Math.PI : 0);
  return e.b;
}

/** Park a vehicle at slot i in front of the place (pops in at the start). */
export function parked(e: Ev, model: Model, i: number, sc: number, lights: boolean, spacing = 0.5) {
  const p = parkSpot(e, i, spacing);
  // Drive in over the first few seconds.
  const arrive = clamp((e.t - i * 0.7) / 2.5);
  const back = (1 - arrive) * (1 - arrive) * 2.5;
  const x = p.x - Math.cos(p.yaw) * back;
  const z = p.z + Math.sin(p.yaw) * back;
  const g = e.pop * clamp(arrive * 3);
  if (g <= 0.02) return;
  e.k.root(x, p.y, z, p.yaw, sc * g);
  e.k.model(model, e.t);
  if (lights) flashers(e.k, x, p.y + 0.32 * sc, z, e.t, i, e.life, 0.9);
}

/** Small cones in a ring round (cx, cz). */
export function cones(k: Kit, cx: number, y: number, cz: number, r: number, n: number, g: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    k.put(CONE, cx + Math.cos(a) * r, y + 0.03 * g, cz + Math.sin(a) * r, 0.04 * g, 0.06 * g, 0.04 * g, 0, 0xff6b00);
  }
}

/** A tree (for the cat rescue, the heatwave park...). */
export function tree(k: Kit, x: number, y: number, z: number, h: number, hex = 0x4f9a5e) {
  k.put(CYL, x, y + h * 0.3, z, h * 0.12, h * 0.6, h * 0.12, 0, 0x7a5230);
  k.put(BALL, x, y + h * 0.75, z, h * 0.75, h * 0.65, h * 0.75, 0, hex);
}

/** A notice on a stick, facing the camera (a picture from the art sheet). */
export function signpost(k: Kit, cell: string, x: number, y: number, z: number, size: number, a: number) {
  k.put(BOX, x, y + size * 0.5, z, 0.012, size, 0.012, 0, 0x868e96);
  k.card(0, cell, x, y + size + size * 0.25, z, size, size, FACE, 0, 0xffffff, a);
}

// ---------------------------------------------------------------- the view

/** The point on the ground in the middle of the view (into e.v), for things all over the city. */
export function viewCentre(e: Ev) {
  const cam = e.k.camera;
  cam.getWorldDirection(e.v);
  const d = e.v.y < -0.05 ? -cam.position.y / e.v.y : 25;
  e.v.set(cam.position.x + e.v.x * d, 0, cam.position.z + e.v.z * d);
  const lim = e.half + 2;
  e.v.x = clamp(e.v.x, -lim, lim);
  e.v.z = clamp(e.v.z, -lim, lim);
  return e.v;
}

const camUp = new THREE.Vector3();

/**
 * A point high in the view (into e.v), where a sun would hang: part of the way from the camera
 * to the middle of the view (so it's in front of the city, never behind it), up the screen.
 * Returns how far it is from the camera (size things by it).
 */
export function skyAhead(e: Ev) {
  const cam = e.k.camera;
  const c = viewCentre(e);
  const dist = Math.max(4, cam.position.distanceTo(c) * 0.5);
  cam.getWorldDirection(e.v);
  camUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
  e.v.multiplyScalar(dist).add(cam.position).addScaledVector(camUp, dist * 0.24);
  return dist;
}

const DIGIT = ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9"];
const right = new THREE.Vector3();

function glyph(k: Kit, cell: string, i: number, count: number, x: number, y: number, z: number, h: number, hex: number, a: number) {
  const w = h * 0.5;
  const o = (i - (count - 1) / 2) * w * 0.82;
  k.card(1, cell, x + right.x * o, y + right.y * o, z + right.z * o, w, h, FACE, 0, hex, a);
}

/** A clock in the sky (glowing digits facing the camera): m:ss, or just a number if colon is false. */
export function skyDigits(e: Ev, value: number, colon: boolean, x: number, y: number, z: number, h: number, hex: number, a: number) {
  const k = e.k;
  right.set(1, 0, 0).applyQuaternion(k.camera.quaternion);
  const v = Math.max(0, Math.floor(value));
  if (colon) {
    const m = Math.min(99, Math.floor(v / 60));
    const s = v % 60;
    const count = m >= 10 ? 5 : 4;
    let n = 0;
    if (m >= 10) glyph(k, DIGIT[Math.floor(m / 10)], n++, count, x, y, z, h, hex, a);
    glyph(k, DIGIT[m % 10], n++, count, x, y, z, h, hex, a);
    glyph(k, "dc", n++, count, x, y, z, h, hex, a);
    glyph(k, DIGIT[Math.floor(s / 10)], n++, count, x, y, z, h, hex, a);
    glyph(k, DIGIT[s % 10], n, count, x, y, z, h, hex, a);
  } else {
    const count = v >= 10 ? 2 : 1;
    if (v >= 10) glyph(k, DIGIT[Math.floor(v / 10) % 10], 0, count, x, y, z, h, hex, a);
    glyph(k, DIGIT[v % 10], count - 1, count, x, y, z, h, hex, a);
  }
}
