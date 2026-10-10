// Shoes (SHOES): sneakers, dress shoes, loafers, high heels, sandals and boots, in the leg's frame.
// Sandals and heels show the foot. Heels tip the foot down from the ankle onto the ball of the foot,
// so the avatar stands taller by the heel's height.

import { BufferGeometry, CylinderGeometry, Float32BufferAttribute } from "three";
import { limbGeo } from "./body.ts";
import type { ShoeStyle } from "./catalog.ts";
import { PI, smooth } from "./math.ts";
import type { Part } from "./parts.ts";

type ShoeOpts = {
  /** A thin slab with the same outline, a little larger (the sole). */
  sole?: boolean;
  /** How far the ball of the foot drops below the heel (high heels). */
  pitch?: number;
  /** 0..1: how much the toe narrows to a point (dress shoes, heels). */
  point?: number;
  /** Only this stretch of the length, heel (0) to toe (1): an open piece (a heel's toe cap or counter). */
  u0?: number;
  u1?: number;
  /** How low the top is towards the toe (0 = flat, 0.5 = slopes to half height). */
  slope?: number;
};

/**
 * A shoe, toe pointing +z, with the ankle at the origin over the back quarter of the foot (as in a
 * real foot). The outline is narrow at the heel and widest across the ball of the foot; the top is
 * high round the ankle and slopes down to the toe, which lifts slightly off the ground (toe spring).
 * The bottom is flat at y = 0 (before pitch).
 */
export function shoeGeo(len: number, wid: number, hgt: number, lod: number, o: ShoeOpts = {}) {
  const sole = !!o.sole, part = o.u0 !== undefined || o.u1 !== undefined, u0 = o.u0 ?? 0, u1 = o.u1 ?? 1;
  const NU = Math.max(o.pitch && sole ? 14 : 8, Math.round((sole ? 12 : 18) * lod * (part ? 0.6 : 1))), NA = Math.max(o.pitch && sole ? 12 : 8, Math.round((sole ? 14 : 18) * lod) & ~1), pos: number[] = [], idx: number[] = [];
  const grow = sole ? 1.04 : 1, pitch = o.pitch ?? 0, point = o.point ?? 0, slope = o.slope ?? 0.48;
  // End caps: the outline closes in a rounded curve at the heel and toe (rings bunch up there).
  const cap = (u: number) => Math.sqrt(Math.max(0, 1 - (u < 0.16 ? ((0.16 - u) / 0.16) ** 2 : u > 0.78 ? ((u - 0.78) / 0.22) ** 2 : 0)));
  for (let j = 0; j <= NU; j++) {
    const u = part ? u0 + (u1 - u0) * (j / NU) : 0.5 - 0.5 * Math.cos((PI * j) / NU), c = cap(u);
    // A heel tips the foot down from the ankle: the ball of the foot drops, the foot gets a little shorter.
    const drop = pitch * smooth((u - 0.18) / 0.55), z = (u - 0.24) * len * grow * (1 - 0.18 * (pitch / 0.85) * smooth((u - 0.18) / 0.55));
    const hw = 0.5 * wid * grow * (0.7 + 0.3 * smooth((u - 0.1) / 0.55) - (0.06 + 0.3 * point) * smooth((u - 0.8) / 0.2));
    const spring = 0.045 * len * smooth((u - 0.72) / 0.28) * (1 - pitch);
    const top = sole ? hgt : hgt * (1 - slope * smooth((u - 0.3) / 0.6));
    const bot = spring, mid = (bot + top) / 2, hh = (top - bot) / 2;
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // Squarish cross-section, flat underneath, rounded on top.
      const x = hw * Math.sign(ca) * Math.pow(Math.abs(ca), sa < 0 ? 0.35 : 0.85);
      const y = sa < 0 ? -hh * Math.pow(-sa, 0.3) : hh * Math.pow(sa, 0.8);
      // The toe and heel round over from the top: the bottom stays flat on the sole right to the tip.
      const yy = mid + y, yc = bot + (yy - bot) * Math.pow(c, 0.7);
      pos.push(x * Math.pow(c, 0.85), (sa < 0 ? Math.max(bot, yc - (1 - c) * 0.02) : yc) - drop, z);
    }
  }
  const W = NA;
  for (let j = 0; j < NU; j++) for (let i = 0; i < NA; i++) {
    const a = j * W + i, b = j * W + ((i + 1) % NA), cc = a + W, d = b + W;
    idx.push(a, b, d, a, d, cc);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Make sure it faces outward (the side of a ring at the widest part should point away from the middle).
  const P = g.attributes.position, N = g.attributes.normal, k = Math.round(NU * 0.6) * W;
  if (N.getX(k) * P.getX(k) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

type Add = (name: string, node: string, geo: BufferGeometry, mat: Part["mat"], surface?: Part["surface"]) => void;

/**
 * Shoes on one foot. ankle: the ankle's height in the leg's frame; fl: foot length; legR: the leg's
 * radius just above the ankle (for boot shafts). Returns how far the heel lifts the avatar.
 */
export function shoes(add: Add, S: ShoeStyle, node: string, ankle: number, fl: number, legR: number, lod: number) {
  const floor = ankle - 0.55, kind = S.kind ?? "sneaker";
  if (kind === "heel") {
    const H = S.heel ?? 0.85;
    // The foot, tipped onto the ball of the foot, with a pointed pump: toe box and heel counter, thin sole.
    add(`foot${node}`, node, shoeGeo(fl * 0.92, 0.82, 0.62, lod * 0.75, { pitch: H, slope: 0.55 }).translate(0, floor + 0.08, 0), "skin", "closed");
    add(`shoe${node}`, node, shoeGeo(fl * 0.95, 0.88, 0.5, lod, { pitch: H, point: 0.8, u0: 0.58, u1: 1, slope: 0.3 }).translate(0, floor + 0.06, 0), "shoeDS");
    add(`shoeBack${node}`, node, shoeGeo(fl * 0.95, 0.88, 0.62, lod, { u0: 0, u1: 0.3 }).translate(0, floor + 0.06, 0), "shoeDS");
    add(`sole${node}`, node, shoeGeo(fl * 0.95, 0.9, 0.08, lod, { sole: true, pitch: H, point: 0.8 }).translate(0, floor + 0.02, 0), "sole", "closed");
    // Stiletto heel, under the back of the heel, down to the floor.
    const z = (0.08 - 0.24) * fl * 0.95;
    add(`heel${node}`, node, new CylinderGeometry(0.07, 0.035, H + 0.02, 10).translate(0, floor - H / 2 + 0.02, z), "sole", "closed");
    return H;
  }
  if (kind === "sandal") {
    add(`foot${node}`, node, shoeGeo(fl * 0.93, 0.84, 0.62, lod, { slope: 0.55 }).translate(0, floor + 0.14, 0), "skin", "closed");
    add(`sole${node}`, node, shoeGeo(fl, 0.98, 0.16, lod, { sole: true }).translate(0, floor, 0), "sole", "closed");
    // Straps: bands over the foot across the toes and the instep (open pieces just outside the foot).
    for (const [k, u0, u1] of [[0, 0.6, 0.7], [1, 0.36, 0.44]] as const) {
      add(`strap${k}${node}`, node, shoeGeo(fl * 0.93, 0.88, 0.67, lod, { slope: 0.55, u0, u1 }).translate(0, floor + 0.13, 0), "shoeDS");
    }
    return 0;
  }
  const dressy = kind === "dress" || kind === "loafer";
  // The upper sits down inside the sole's rim, so the sole wraps it with no gap.
  add(`shoe${node}`, node, shoeGeo(fl * 0.985, dressy ? 0.9 : 0.95, dressy ? 0.92 : 1.05, lod, { point: dressy ? 0.45 : 0, slope: kind === "loafer" ? 0.58 : 0.48 }).translate(0, floor + 0.07, 0), "shoe", "closed");
  add(`sole${node}`, node, shoeGeo(fl, dressy ? 0.92 : 0.98, dressy ? 0.16 : 0.24, lod, { sole: true, point: dressy ? 0.45 : 0 }).translate(0, floor, 0), "sole", "closed");
  if (kind === "boot") {
    // Ankle boot: a shaft up round the ankle and lower shin.
    add(`bootShaft${node}`, node, limbGeo([[legR + 0.1, ankle + 1.25], [legR + 0.08, ankle + 0.4], [legR + 0.12, ankle - 0.3], [legR + 0.06, ankle - 0.5]], 16, lod), "shoeDS");
  }
  return 0;
}
