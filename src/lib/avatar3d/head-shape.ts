// The shape of the head and neck as a pure function of direction: every point on the skin is found
// by taking a direction u (a point on the unit sphere) and sculpting it (deform for the skull and
// face, headNeck to grow the neck out of the bottom). Everything that sits on the face (eyes, brows,
// nose, lips, ears, hair) is placed with these functions, so it all follows the chosen face shape.
//
// Head space: the head is roughly 2 units tall, centred on the origin, facing +z, with +y up.

import { Vector3 } from "three";
import { BUILDS, CHINS, FACES, FULLNESS } from "./catalog.ts";
import { PI, angleDiff, bell, clamp01, smax, smooth } from "./math.ts";
import type { Recipe } from "./recipe.ts";

type Face = (typeof FACES)[number] & { sq?: number };
type Chin = (typeof CHINS)[number] & { point?: number; drop?: number; cleft?: number };

/** Everything the head shape depends on, read once from the recipe. */
export type HeadCtx = {
  recipe: Recipe;
  lod: number;
  F: Face;
  chin: Chin;
  /** Face fullness: negative leaner, positive fuller. */
  fat: number;
  fem: boolean;
  /** Neck-base strength from the body type. */
  neck: number;
};

export function headCtx(recipe: Recipe, lod: number): HeadCtx {
  return {
    recipe,
    lod,
    F: FACES[recipe.face],
    chin: CHINS[recipe.chin],
    fat: FULLNESS[recipe.fat].f,
    fem: recipe.frame === 1,
    neck: BUILDS[recipe.build].neck ?? 0,
  };
}

export type SurfaceMap = (u: Vector3) => Vector3;

/**
 * Like Math.sign, but easing smoothly through zero. Side-to-side pushes (cheek pads, cheekbones,
 * cheek hollows) use it so they fade out at the centre line of the face; Math.sign, as the prototype
 * used, jumps there and leaves a crease down the middle of the chin and lips.
 */
const sideOf = (x: number) => x / Math.sqrt(x * x + 0.0025);

/** How softly the side of the face turns under into the jaw. */
const JAW_ROUND = 0.12;
/** How far the lower back of the skull curves in towards the neck (0 = the prototype's shape). */
const NAPE_TUCK = 0.35;

/** Skull and face: sculpts a direction on the unit sphere into a point on the skin. */
export function deform(c: HeadCtx, u: Vector3): Vector3 {
  const F = c.F;
  let x = u.x, y = u.y, z = u.z;
  // Under the jaw: flatten the bottom of the skull into a jaw plane that rises from the chin back to the jaw angle.
  const fr = smooth((z + 0.35) / 0.9);
  const jp = -0.56 - 0.3 * fr + 0.18 * Math.abs(x) * (1 - fr), jw = smooth((z + 0.3) / 0.25);
  // Rounded over a width of JAW_ROUND: the bone's edge is softened by the tissue over it. (The prototype's
  // 0.07 left an edge sharper than the mesh can follow, which showed as a jagged line along the jaw.)
  y = smax(y, -2 + (jp + 2) * jw, JAW_ROUND);
  if (y < 0) {
    const t = -y;
    x *= 1 - 0.8 * F.jaw * t * t;
    z *= 1 - F.jaw * 0.3 * t * t * (1 - bell(x / 0.35));
    y *= 1 + 0.35 * F.chin * t * t;
    if (F.sq) x *= 1 + F.sq * t * (1 - t) * 1.6;
  }
  x *= 1 + F.cheek * bell((y + 0.1) / 0.3);
  if (y > 0) x *= 1 - 0.4 * F.fore * y * y;
  x *= 1 + 0.07 * bell((y - 0.55) / 0.3);
  // Face fullness: cheek pads, softer jaw, fuller under the chin.
  const ft = c.fat;
  if (ft) {
    const ax = Math.abs(x), side = smooth((z + 0.2) / 0.5);
    x += sideOf(x) * ft * 0.075 * bell((y + 0.32) / 0.3) * side * (ft < 0 ? 0.6 : 1);
    z += ft * 0.03 * bell((ax - 0.38) / 0.18) * bell((y + 0.3) / 0.16) * smooth((z - 0.3) / 0.3);
    if (y < -0.4) x *= 1 + ft * 0.12 * smooth((-y - 0.4) / 0.4) * side;
    if (ft > 0) y -= ft * 0.07 * smooth((z + 0.1) / 0.4) * smooth((-y - 0.6) / 0.25) * (1 - smooth((z - 0.55) / 0.2));
  }
  // Profile: brow ridge, eye sockets, mouth area.
  const fz = smooth((z - 0.5) / 0.28);
  z += fz * (0.035 * bell((y - 0.3) / 0.07) * bell(x / 0.45) - 0.035 * bell((Math.abs(x) - 0.34) / 0.13) * bell((y - 0.07) / 0.09) +
    0.03 * bell((y + 0.5) / 0.18) * bell(x / 0.3));
  // Chin.
  const C = c.chin, cx = Math.exp(-Math.pow(Math.abs(x) / C.w, C.p)), low = smooth((-0.5 - y) / 0.3);
  z += smooth((z - 0.25) / 0.3) *
    (C.fwd * low * bell(x / 0.42) + C.bump * bell((y + 0.78) / 0.1) * cx - (C.cleft || 0) * 0.014 * bell(x / 0.035) * bell((y + 0.77) / 0.08));
  if (C.drop) y -= C.drop * cx * smooth((-0.66 - y) / 0.18);
  if (C.point) x *= 1 - C.point * smooth((-0.65 - y) / 0.25);
  // Cheek hollow under the cheekbone, cheekbone, temples.
  x -= sideOf(x) * 0.025 * bell((y + 0.36) / 0.13) * bell((z - 0.4) / 0.25);
  x += sideOf(x) * 0.015 * bell((y + 0.02) / 0.12) * bell((z - 0.45) / 0.25);
  x *= 1 - 0.025 * bell((y - 0.38) / 0.15) * bell((z - 0.35) / 0.3);
  // Longer skull: the back of the head extends behind the ears.
  const fzb = smooth((0.15 - z) / 0.55);
  z *= 0.9 * (1 - fzb) + (1 + 0.03 * bell((y - 0.3) / 0.8)) * fzb;
  // Nape: below the bulge of the occiput the back of the skull curves in to meet the neck at about
  // earlobe height. (The prototype's skull kept bulging down to jaw level before the neck began.)
  z *= 1 - NAPE_TUCK * smooth((-z - 0.2) / 0.5) * smooth((-y - 0.05) / 0.4);
  return new Vector3(x * F.w * 0.95, y * F.h, z * F.d * 0.96);
}

const AX = new Vector3(1, 0, 0), AY = new Vector3(0, 1, 0);

/**
 * Outward surface normal of a map at direction u, by finite differences.
 * (t1, t2, u) is always a right-handed frame, so the cross product already points outward for any
 * map that doesn't turn the surface inside out. (The prototype instead flipped normals that pointed
 * away from the head's centre, which wrongly flipped them on the flared lower neck, where the outward
 * direction points slightly up while the point itself is far below the centre.)
 */
export function surfNormal(map: SurfaceMap, u: Vector3): Vector3 {
  const up = Math.abs(u.y) > 0.95 ? AX : AY;
  const t1 = new Vector3().crossVectors(u, up).normalize(), t2 = new Vector3().crossVectors(u, t1).normalize(), e = 0.003;
  const p0 = map(u), p1 = map(u.clone().addScaledVector(t1, e).normalize()), p2 = map(u.clone().addScaledVector(t2, e).normalize());
  return new Vector3().subVectors(p1, p0).cross(new Vector3().subVectors(p2, p0)).normalize();
}

/** The neck leaves the head along NP; NE1/NE2 span the plane around it. */
export const NP = new Vector3(0, -0.97, -0.24).normalize();
export const NE1 = new Vector3(1, 0, 0);
export const NE2 = new Vector3().crossVectors(NP, NE1).normalize();

/** Head plus neck: like deform, but directions near NP grow down into a sculpted neck. */
export function headNeck(c: HeadCtx, u: Vector3): Vector3 {
  const h = deform(c, u), al = Math.acos(Math.max(-1, Math.min(1, u.dot(NP))));
  if (al > 1.5) return h;
  const k = c.fem ? 0.86 : 1, ph = Math.atan2(u.dot(NE2), u.dot(NE1)), cs = Math.cos(ph), sn = Math.sin(ph);
  const fw = smooth((sn - 0.35) / 0.55), s = al / (1.2 - 0.25 * fw);
  if (s >= 1.2) return h;
  const s0 = 0.5 + 0.04 * fw, wd = 0.62 - 0.2 * fw, t = clamp01(s / s0);
  const masc = !c.fem, str = c.neck;
  const waist = (1 + 0.1 * Math.max(0, c.fat)) * (1.24 + 1.3 * str * Math.pow(1 - t, 1.5)) - 0.3 * smooth(t * 1.1) - 0.03 * Math.sin(PI * t);
  const lean = -0.12 + 0.05 * t, g2 = (a: number, w: number) => Math.exp(-(a / w) * (a / w));
  const fb = smooth((sn + 0.35) / 0.7), throat = 0.44 * k * (1 + 0.22 * t * t) * (1 - fb) + 0.33 * k * fb;
  const bx = 0.45 * k * cs * waist, bz = throat * sn * waist;
  // Sculpted detail, pushed out along the surface direction.
  let d = 0;
  // Sternocleidomastoid: a rope of muscle on each side, from behind the ear down and forward to the breastbone.
  const phs = 1.36 - 1.72 * Math.pow(t, 1.25), sw = 0.24 + 0.1 * t;
  const sh = (masc ? 0.045 : 0.032) * k * (1 + 0.8 * str) * Math.pow(Math.sin(PI * clamp01(t * 1.02)), 0.8);
  for (const cc of [phs, PI - phs]) {
    d += sh * g2(angleDiff(ph, cc), sw);
    d -= 0.011 * k * g2(angleDiff(ph, cc + (cc < PI / 2 ? 0.4 : -0.4)), 0.22) * clamp01(t * 1.6) * (1 - t * 0.5);
    d -= 0.008 * k * g2(angleDiff(ph, cc - (cc < PI / 2 ? 0.45 : -0.45)), 0.26) * smooth((t - 0.3) / 0.3) * (1 - smooth((t - 0.85) / 0.15));
  }
  // Throat: windpipe ridge, Adam's apple, and the notch above the breastbone.
  const fr = g2(angleDiff(ph, PI / 2), 0.2);
  d += 0.014 * fr * smooth((t - 0.05) / 0.2) * (1 - smooth((t - 0.55) / 0.2));
  d += (masc ? 0.05 : 0.014) * g2(t - 0.5, 0.08) * g2(angleDiff(ph, PI / 2), 0.24);
  d -= 0.035 * g2(t - 0.13, 0.08) * g2(angleDiff(ph, PI / 2), 0.32);
  // Back: trapezius rising from the shoulders, with a soft groove down the spine.
  d += 0.025 * k * (g2(angleDiff(ph, -PI / 2 + 0.75), 0.45) + g2(angleDiff(ph, -PI / 2 - 0.75), 0.45)) * (1 - smooth(t / 0.6));
  d -= 0.012 * g2(angleDiff(ph, -PI / 2), 0.18) * smooth((t - 0.15) / 0.2);
  const nn = Math.hypot(cs, (sn * throat) / (0.45 * k)) || 1;
  // Tuck the part hidden under the collar well inside the shirt so the two surfaces never touch.
  const tuck = 0.8 + 0.2 * smooth((t - 0.34) / 0.12);
  const neck = new Vector3(
    (bx + (d * cs) / nn) * tuck,
    -1.95 + 1.3 * t,
    lean + (bz + (d * sn * (throat / (0.45 * k))) / nn) * tuck,
  );
  // Blend into the head: outward first, then down. (Blending both at the same rate, as the prototype did,
  // made the skin just above the neck move down faster than out, folding back on itself under the chin.)
  const w = smooth((s - s0) / wd), wy = w * w;
  return new Vector3(neck.x + (h.x - neck.x) * w, neck.y + (h.y - neck.y) * wy, neck.z + (h.z - neck.z) * w);
}

/**
 * How free the skin at direction u is to be smoothed where the neck blends into the head: 0 outside
 * the blend, rising to 1 in its middle (matches the blend in headNeck).
 */
export function neckBlendFreedom(u: Vector3): number {
  const al = Math.acos(Math.max(-1, Math.min(1, u.dot(NP))));
  if (al > 1.5) return 0;
  const sn = Math.sin(Math.atan2(u.dot(NE2), u.dot(NE1)));
  const fw = smooth((sn - 0.35) / 0.55), s = al / (1.2 - 0.25 * fw), s0 = 0.5 + 0.04 * fw, wd = 0.62 - 0.2 * fw;
  const t = (s - (s0 - 0.12)) / (wd + 0.12);
  return t <= 0 || t >= 1 ? 0 : Math.sin(PI * t);
}

/** A point on the face from front-view coordinates (x, y), or from a direction (x, y, z). */
export function facePoint(c: HeadCtx, x: number, y: number, z?: number) {
  const u = z === undefined ? new Vector3(x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))) : new Vector3(x, y, z).normalize();
  const map = (v: Vector3) => deform(c, v);
  return { u, p: map(u), n: surfNormal(map, u) };
}
