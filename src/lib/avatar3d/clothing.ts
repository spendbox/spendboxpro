// Clothing: the top and bottom on the torso, sleeves, skirts, robes, hood, suit details, swimwear and
// shoes, for each outfit in OUTFITS. Built over the body's torso shape so it fits every body type.

import { BufferGeometry, CatmullRomCurve3, CylinderGeometry, Float32BufferAttribute, TorusGeometry, TubeGeometry, Vector3 } from "three";
import { type BodyParams, CROTCH_Y, type Torso, crInterp, drapePoint, limbGeo, sheetGeo, torsoGeo } from "./body.ts";
import type { Outfit } from "./catalog.ts";
import { PI, bell, clamp01, smooth } from "./math.ts";
import { type Part, ellGeo } from "./parts.ts";

export type Dress = {
  T: Torso;
  B: BodyParams;
  O: Outfit;
  fem: boolean;
  lod: number;
  /** Bodybuilders go shirtless; swimwear leaves the top bare too. */
  shirtless: boolean;
  /**
   * How far the neck's skin is from the neck's centre line, at height y in the direction of the torso
   * point at angle th (body space). Lets the collar sit exactly where the neck meets the clothes.
   */
  neck: (y: number, th: number) => { centre: Vector3; dist: number } | null;
  add: (name: string, node: string, geo: BufferGeometry, mat: Part["mat"], surface?: Part["surface"]) => void;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Point on the torso surface at height y and horizontal position xs (front or back). */
function atX(T: Torso, y: number, xs: number, front: boolean, o: number) {
  let lo = front ? -PI / 2 : PI / 2, hi = front ? PI / 2 : (3 * PI) / 2;
  for (let it = 0; it < 22; it++) {
    const m = (lo + hi) / 2, px = T.P(y, m, o).x;
    if (front ? px < xs : px > xs) lo = m;
    else hi = m;
  }
  return T.P(y, (lo + hi) / 2, o);
}

/**
 * Cloth hanging from the body, open at the hem: skirts, tunics, jacket tails. Each line down the
 * cloth follows the body (off it by off) but never comes back in once it has gone out, the way
 * fabric falls from the widest part of the hips or bottom. flare(t) widens it further, t running
 * from 0 at the top to 1 at the hem. Above the height follow it lies on the body (shoulders, chest)
 * and only starts to hang below it.
 */
function hangGeo(T: Torso, lod: number, y0: number, y1: number, off: number, flare: (t: number, dx: number, dz: number) => number, NV = 16, NA = 44, follow = Infinity) {
  NV = Math.max(3, Math.round(NV * lod));
  NA = Math.max(12, Math.round((NA * lod) / 2) * 2);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  // Each line down the cloth keeps one direction round the body (from the waist, which runs smoothly
  // round), so neighbouring lines never cross; it hangs as far out as the body reaches that way.
  const dirs = Array.from({ length: NA + 1 }, (_, i) => {
    const q = T.P(-4.8, (i / NA) * PI * 2), l = Math.hypot(q.x, q.z);
    return [q.x / l, q.z / l];
  });
  const reach = new Array(NA + 1).fill(0);
  for (let j = 0; j <= NV; j++) {
    const t = j / NV, y = lerp(y0, y1, t), w = smooth((follow - y) / 0.6);
    for (let i = 0; i <= NA; i++) {
      const q = T.P(Math.max(y, CROTCH_Y), (i / NA) * PI * 2, off), [dx, dz] = dirs[i];
      reach[i] = Math.max(reach[i], q.x * dx + q.z * dz);
      const R = reach[i] + flare(t, dx, dz);
      pos.push(lerp(q.x, dx * R, w), y, lerp(q.z, dz * R, w));
      uv.push(i / NA, (y0 - y) / 2);
    }
  }
  const W = NA + 1;
  for (let j = 0; j < NV; j++) for (let i = 0; i < NA; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, d, b, a, c, d);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A flat ribbon (strap) lying on the skin along a path of [height, angle] points, half-width w. */
function ribbonGeo(T: Torso, path: [number, number][], off: number, w: number) {
  const cv = new CatmullRomCurve3(path.map(([y, th]) => T.P(y, th, off))), n = 40, pos: number[] = [], idx: number[] = [];
  const pts = cv.getSpacedPoints(n);
  for (let k = 0; k <= n; k++) {
    const p = pts[k], tan = cv.getTangentAt(k / n), out = new Vector3(p.x, 0, p.z).normalize();
    const side = new Vector3().crossVectors(tan, out).normalize().multiplyScalar(w);
    pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
    if (k < n) idx.push(2 * k, 2 * k + 1, 2 * k + 3, 2 * k, 2 * k + 3, 2 * k + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A ribbed collar exactly on the line where the neck comes out of the clothes: its top edge lies on
 * the neck's skin and its lower edge on the cloth (off: the cloth's offset from the skin), so it
 * joins the two with no gap and no ring standing off the neck.
 */
function collarGeo(d: Dress, off: number) {
  const { T, lod } = d, NA = Math.max(16, Math.round(48 * lod)), rows: Vector3[][] = [];
  for (let i = 0; i <= NA; i++) {
    const th = (i / NA) * PI * 2;
    // Walk down until the cloth comes out past the neck: that is the neck line.
    let ye = NaN, hit: ReturnType<Dress["neck"]> = null;
    for (let y = -1.3; y > -2.1; y -= 0.01) {
      const h = d.neck(y, th);
      if (!h) continue;
      const q = T.P(y, th, off);
      if (Math.hypot(q.x - h.centre.x, q.z - h.centre.z) >= h.dist) {
        ye = y;
        hit = h;
        break;
      }
    }
    if (!hit) return null;
    // Pin the crossing down precisely (a coarse step leaves the collar edge wavy).
    for (let lo = ye, hi = ye + 0.01, it = 0; it < 8; it++) {
      const m = (lo + hi) / 2, h = d.neck(m, th), q = T.P(m, th, off);
      if (h && Math.hypot(q.x - h.centre.x, q.z - h.centre.z) >= h.dist) ye = lo = m;
      else hi = m;
    }
    // Rib profile: from the skin, out and over, down onto the cloth.
    const at = (y: number, out: number) => {
      const h = d.neck(y, th) ?? hit!, q = T.P(y, th, off), dir = new Vector3(q.x - h.centre.x, 0, q.z - h.centre.z).normalize();
      const r = Math.max(h.dist, Math.hypot(q.x - h.centre.x, q.z - h.centre.z)) + out;
      return new Vector3(h.centre.x + dir.x * r, y, h.centre.z + dir.z * r);
    };
    rows.push([at(ye + 0.09, 0.004), at(ye + 0.06, 0.03), at(ye + 0.01, 0.045), at(ye - 0.04, 0.035), at(ye - 0.08, 0.008)]);
  }
  const pos: number[] = [], idx: number[] = [], NR = rows[0].length;
  for (const row of rows) for (const p of row) pos.push(p.x, p.y, p.z);
  for (let i = 0; i < NA; i++) for (let j = 0; j < NR - 1; j++) {
    const a = i * NR + j, b = a + 1, c = a + NR, e = c + 1;
    idx.push(a, b, e, a, e, c);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const P = g.attributes.position, N = g.attributes.normal, m = Math.round(NA / 4) * NR + 2;
  if (N.getX(m) * P.getX(m) + N.getZ(m) * P.getZ(m) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

/** The torso (chest node) and pelvis (body node): skin, top or bottom depending on the outfit. */
export function torsoClothes(d: Dress) {
  const { T, B, O, lod, shirtless, add } = d;
  const bareTop = shirtless || O.sl === "none", hemY = O.suit ? -6.5 : -6.2;
  add("torso", "chest", torsoGeo(T, lod, -1.3, bareTop ? -5.95 : hemY, bareTop ? 0 : (y) => 0.02 + 0.07 * smooth((-5.3 - y) / 0.9), 40, 36, !bareTop), bareTop ? "skin" : "top");
  const lowM: Part["mat"] = shirtless ? "bottom" : O.match ? "top" : "bottom";
  // The hips end exactly where the legs begin (bare skin overlaps the torso's lower edge a touch).
  add("pelvis", "body", torsoGeo(T, lod, bareTop ? -5.85 : -5.75, CROTCH_Y, bareTop ? (y) => 0.016 * smooth((y + 6.4) / 0.4) : 0, 18, 44),
    O.swim ? "skin" : O.bare ? "bottom" : lowM);
  if (!bareTop) {
    // (The cute dress has its own Peter Pan collar instead.)
    const c = collarGeo(d, 0.02);
    // Suits show the white shirt collar; the abaya's and agbada's necklines are embroidered in gold.
    if (c && !O.cute) add("collar", "chest", c, O.suit ? "shirt" : O.abaya || O.robe ? "gold" : "rib");
  } else if (B.shirtless && !O.swim) {
    // Waistband of the trousers.
    add("waistband", "body", torsoGeo(T, lod, -5.85, -6.05, 0.04, 2, 44), "bottomDark");
  }
  outfitExtras(d);
}

/** Pieces that sit on the torso: dress bodices and skirts, suit fronts, swimwear. */
function outfitExtras(d: Dress) {
  const { T, B, O, fem, lod, add } = d;
  // The bodybuilder body type always goes shirtless in shorts (as in the reference studio); only swimwear changes that.
  if (B.shirtless && !O.swim) return;
  const xr = (y: number) => crInterp(T.L, T.X, y), hipR = xr(-6.35) * 1.04;
  if (O.sl === "none" && !O.swim) {
    // Sleeveless dress top: fitted bodice from under the arms, with shoulder straps.
    const top = -2.72 - (B.bust || 0) * 0.35;
    add("bodice", "chest", torsoGeo(T, lod, top, -6.2, (y) => 0.025 + 0.06 * smooth((-5.3 - y) / 0.9), 34, 36, true), "top");
    add("bodiceEdge", "chest", torsoGeo(T, lod, top + 0.02, top - 0.16, 0.05, 2, 48), "topEdge");
    for (const sx of [-1, 1]) {
      const xs = sx * 0.92, pts: Vector3[] = [];
      for (let k = 0; k <= 6; k++) pts.push(atX(T, lerp(top + 0.08, -1.66, k / 6), xs, true, 0.06));
      pts.push(new Vector3(xs, -1.5, (pts[pts.length - 1].z + atX(T, -1.66, xs, false, 0.06).z) / 2));
      for (let k = 6; k >= 0; k--) pts.push(atX(T, lerp(top + 0.08, -1.66, k / 6), xs, false, 0.06));
      add(`strap${sx > 0 ? 1 : 0}`, "chest", new TubeGeometry(new CatmullRomCurve3(pts), Math.round(32 * lod), 0.07, Math.max(4, Math.round(6 * lod)), false), "topEdge", "closed");
    }
  }
  if (O.cute) {
    // A-line skirt from the waist to above the knee, with a sash, a bow and a little white collar.
    add("skirt", "body", hangGeo(T, lod, -4.85, -9.6, 0.05, (t) => hipR * 0.55 * Math.pow(t, 0.8)), "topDS");
    add("sash", "chest", torsoGeo(T, lod, -4.72, -5.1, 0.05, 3, 44), "sash");
    const bc = T.P(-4.9, 0, 0.08);
    for (const sx of [-1, 1]) {
      add(`bowLoop${sx > 0 ? 1 : 0}`, "chest", ellGeo(0.42, 0.26, 0.12, 14, lod).rotateZ(sx * 0.4).translate(bc.x + sx * 0.36, bc.y + 0.05, bc.z + 0.06), "sash", "closed");
    }
    add("bowKnot", "chest", ellGeo(0.13, 0.13, 0.12, 10, lod, bc.clone().add(new Vector3(0, 0, 0.1))), "sash", "closed");
    // Peter Pan collar: two rounded flaps lying on the shoulders round the neckline, meeting at the front.
    for (const sx of [-1, 1]) {
      add(`collar${sx > 0 ? 1 : 0}`, "chest", sheetGeo(T, lod, 16, 3, 0.09, (u, v) => {
        const a = lerp(0.04, PI, u), depth = 0.36 * Math.sqrt(clamp01((a - 0.04) / 0.35)) * (1 - 0.35 * smooth((a - 1.6) / 1.4));
        return [lerp(-1.4, -1.4 - depth, v), sx * a];
      }), "collarWhite");
    }
  }
  if (O.mini) {
    add("skirt", "body", hangGeo(T, lod, -5.6, -8.7, 0.06, (t) => 0.1 * t), "topDS");
  }
  if (O.suit) {
    // Blazer: white shirt V, lapels, buttons, tail over the hips (and a pencil skirt for the skirt suit).
    // Half-width (angle) of the shirt's V at each height, and the lapel's outer edge.
    const w = (y: number) => 0.42 * clamp01((y + 4.2) / 2.6) + 0.06, wl = (y: number) => w(y) + 0.16 + 0.12 * clamp01((y + 3.0) / 1.2);
    add("shirtFront", "chest", sheetGeo(T, lod, 16, 18, 0.05, (u, v) => {
      const y = lerp(-1.45, -4.2, v);
      return [y, lerp(-w(y), w(y), u)];
    }), "shirt");
    for (const sx of [-1, 1]) {
      add(`lapel${sx > 0 ? 1 : 0}`, "chest", sheetGeo(T, lod, 5, 18, 0.075, (u, v) => {
        const y = lerp(-1.5, -4.25, v);
        return [y, sx * lerp(w(y), wl(y), u)];
      }), "lapel");
    }
    if (O.tie) {
      const tw = (y: number) => 0.055 + 0.03 * clamp01((-y - 1.9) / 2.2);
      add("tie", "chest", sheetGeo(T, lod, 3, 16, 0.085, (u, v) => {
        // The tie ends in a point.
        const y = lerp(-1.62, -4.42 - 0.2 * (1 - Math.abs(2 * u - 1)), v);
        return [y, lerp(-tw(y), tw(y), u)];
      }), "tie");
      add("tieKnot", "chest", ellGeo(0.1, 0.12, 0.045, 10, lod, T.P(-1.6, 0, 0.12)), "tie", "closed");
    }
    for (const [i, y] of [-4.55, -5.2].entries()) add(`button${i}`, "chest", ellGeo(0.07, 0.07, 0.04, 8, lod, T.P(y, 0, 0.1)), "trim", "closed");
    // The jacket carries on over the hips, hanging straight from them.
    add("blazerTail", "body", hangGeo(T, lod, -6.2, -7.35, 0.11, (t) => 0.04 * t, 6), "topDS");
    if (O.pencil) {
      // Pencil skirt: fitted over the hips, narrowing towards the knee.
      add("pencilSkirt", "body", hangGeo(T, lod, -5.85, -10.3, 0.05, (t) => -hipR * 0.14 * smooth((t - 0.35) / 0.65)), "bottom");
    }
  }
  if (O.swim) {
    // Bikini (feminine frame) or swim trunks (masculine frame).
    if (fem) {
      // High-cut bikini bottom: low on the hips, cut up towards the hip bone at the sides, fuller at the back.
      add("swimBottom", "body", sheetGeo(T, lod, 48, 8, 0.065, (u, v) => {
        const th = u * PI * 2, side = Math.abs(Math.sin(th)), back = Math.cos(th) < 0;
        const bot = lerp(CROTCH_Y, -6.5, smooth(back ? (side - 0.55) / 0.45 : (side - 0.3) / 0.6));
        return [lerp(-6.12, bot, v), th];
      }), "top");
    } else add("swimBottom", "body", torsoGeo(T, lod, -6.05, CROTCH_Y, 0.05, 8, 44), "top");
    if (fem) {
      const bc = -3.3 - (B.bust || 0) * 0.7;
      // Triangle cups: each comes to a point at the top, where the strap starts.
      for (const sx of [-1, 1]) {
        add(`swimCup${sx > 0 ? 1 : 0}`, "chest", sheetGeo(T, lod, 14, 12, 0.03, (u, v) => {
          const a = sx * lerp(0.08, 0.92, u), dd = Math.abs(Math.abs(a) - 0.5), top = bc + 0.75 - dd * 1.4;
          return [lerp(top, bc - 0.6, v), a];
        }), "top");
      }
      add("swimBand", "chest", torsoGeo(T, lod, bc - 0.55, bc - 0.7, 0.03, 2, 44), "top");
      // Halter straps: up from the point of each cup, then round the base of the neck to tie at the back.
      for (const sx of [-1, 1]) {
        const path: [number, number][] = [];
        for (let k = 0; k <= 8; k++) path.push([lerp(bc + 0.7, -1.58, k / 8), sx * lerp(0.5, 0.6, k / 8)]);
        // Turning gently (easing round) so the strap bends rather than kinks.
        for (let k = 1; k <= 10; k++) path.push([lerp(-1.58, -1.45, smooth(k / 10)), sx * lerp(0.6, PI - 0.06, (k / 10) ** 1.6)]);
        add(`swimStrap${sx > 0 ? 1 : 0}`, "chest", ribbonGeo(T, path, 0.05, 0.035), "topEdgeDS");
      }
    }
  }
}

/** Sleeves (a separate layer over the arm, or the whole arm in fabric for long sleeves), and cuffs. */
export function armClothes(d: Dress, node: string, armPts: [number, number][], L1: number, bendA: number, squash: (y: number) => [number, number]) {
  const { B, O, lod, shirtless, add } = d, at = B.armT;
  const longS = O.sl !== "short" && O.sl !== "puff" && O.sl !== "none" && !shirtless;
  add(`${node}Skin`, node, limbGeo(armPts, 16, lod, { at: L1, a: bendA }, squash), longS ? "top" : "skin");
  if (!shirtless && O.sl === "puff") {
    const sv: [number, number][] = [[0.16 * at, 0.12], [0.34 * at * B.armD, -0.1], [0.62 * at * B.armD + 0.05, -0.45], [0.64 * at * B.armB + 0.05, -0.85], [0.5 * at * B.armB + 0.04, -1.2], [0.47 * at * B.armB + 0.035, -1.32]];
    add(`${node}Sleeve`, node, limbGeo(sv, 16, lod), "topDS");
  }
  if (!shirtless && O.sl === "short") {
    // The sleeve starts narrow inside the shoulder of the shirt and comes out of it, so the two are one
    // piece of cloth (an open sleeve top would show as a ridge round the shoulder).
    const sv: [number, number][] = [[0.16 * at, 0.12], [0.3 * at * B.armD, -0.12], [0.45 * at * B.armD * 1.07 + 0.035, -0.45], [0.48 * at * B.armB * 1.07 + 0.03, -1.0], [0.49 * at * B.armB * 1.08 + 0.035, -1.55]];
    add(`${node}Sleeve`, node, limbGeo(sv, 16, lod), "topDS");
  }
  if (O.sl === "flare" && !shirtless) {
    add(`${node}Flare`, node, new CylinderGeometry(0.6 * at, (O.abaya ? 1.05 : 1.5) * at, 4.2, Math.round(20 * lod), Math.round(8 * lod), true).translate(0, -2.1, 0), "topDS");
  }
  return longS;
}

/** Cuff at the wrist of a long sleeve (in the hand node's frame). */
export function cuff(d: Dress, node: string) {
  d.add(`${node}Cuff`, node, new TorusGeometry(0.3 * d.B.armT, 0.05, Math.max(4, Math.round(6 * d.lod)), Math.round(18 * d.lod)).rotateX(PI / 2).scale(0.82, 1, 1.12).translate(0, 0.25, 0), "trim", "closed");
}

/** Full-length and over-garments hung from the body: dress and tunic skirts, agbada robe, abaya, jalabiya, hood. */
export function robes(d: Dress, shX: number, floorY: number) {
  const { T, B, O, lod, shirtless, add } = d;
  if (shirtless) return;
  const hipR = crInterp(T.L, T.X, -6.35) * 1.04;
  if (O.skirt) {
    add("dressSkirt", "body", hangGeo(T, lod, -4.7, -11.2, 0.05, (t) => hipR * 0.42 * t * t + 0.15 * t, 22), "topDS");
  }
  if (O.tunic) {
    add("tunic", "body", hangGeo(T, lod, -5.9, -9.8, 0.1, (t) => 0.18 * t), "topDS");
  }
  if (O.robe) {
    // Agbada: the great outer robe. It lies on the shoulders and chest down to the armpits, then hangs
    // full and wide to the shins, just inside the arms; its huge sleeves (armClothes) carry the billow.
    add("agbada", "chest", hangGeo(T, lod, -1.95, floorY + 1.6, 0.07, (t, dx) => (0.25 + 0.45 * dx * dx) * smooth(t / 0.4) * (shX / 1.5) + 0.3 * t, 20, 40, -2.6), "topDS");
  }
  if (O.abaya || O.jalab) {
    // Full-length robe: lies on the shoulders and chest, then falls straight from the bust at the
    // front and from the hips and bottom behind, flaring towards the floor. (It starts under the
    // shoulders, over the top's own cloth, so the collar shows above it.)
    const yEnd = O.abaya ? floorY + 0.35 : floorY + 1.05, len = -1.95 - yEnd;
    add(O.abaya ? "abaya" : "jalabiya", "body", hangGeo(T, lod, -1.95, yEnd, 0.04, (t) => (O.abaya ? 0.9 * t ** 1.4 : 0.25 * t) * (len / 11), 36, 44, -2.5), "topDS");
    if (O.jalab) {
      // Button placket down the chest.
      add("placket", "chest", sheetGeo(T, lod, 2, 10, 0.05, (u, v) => [lerp(-1.75, -3.2, v), lerp(-0.035, 0.035, u)]), "trim");
      for (let b = 0; b < 4; b++) add(`jalabButton${b}`, "chest", ellGeo(0.045, 0.045, 0.025, 8, lod, T.P(-1.95 - b * 0.38, 0, 0.07)), "trim", "closed");
    }
  }
  if (O.hood) {
    // Hood lying on the shoulders behind the neck, and the front pocket.
    // The hood lies down on the upper back: a soft fold of cloth from round the neck, hanging in a U,
    // fuller in the middle, with a rolled edge.
    const bottom = (th: number) => -1.6 - 1.35 * bell((th - PI) / 0.95), top = -1.36;
    const hoodAt = (y: number, th: number, o: number) => {
      const v = clamp01((top - y) / (top - bottom(th)));
      return T.P(y, th, o + 0.16 * Math.sin(PI * Math.min(1, v * 0.95)) * smooth((Math.abs(Math.cos(th)) - 0.1) / 0.5));
    };
    add("hood", "chest", sheetGeo(T, lod, 28, 8, 0.07, (u, v) => {
      const th = lerp(0.62, 2 * PI - 0.62, u);
      return [lerp(top, bottom(th), v), th];
    }, hoodAt), "topDS");
    const rim: Vector3[] = [];
    for (let k = 0; k <= 24; k++) {
      const th = lerp(0.62, 2 * PI - 0.62, k / 24);
      rim.push(hoodAt(bottom(th), th, 0.1));
    }
    add("hoodRim", "chest", new TubeGeometry(new CatmullRomCurve3(rim), Math.round(32 * lod), 0.07, Math.max(4, Math.round(6 * lod)), false), "top", "closed");
    // Kangaroo pocket on the loose front: wider at the bottom, with slanted openings at the sides.
    const hem = -6.2, front = (y: number, th: number, o: number) => drapePoint(T, y, th, 0.02 + 0.07 * smooth((-5.3 - y) / 0.9) + o, hem);
    add("pocket", "chest", sheetGeo(T, lod, 14, 6, 0.035, (u, v) => {
      const y = lerp(-5.05, -6.0, v), half = lerp(0.42, 0.62, v) * B.wa;
      return [y, lerp(-half, half, u)];
    }, front), "topEdge");
  }
}
