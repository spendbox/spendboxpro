// The body: body-type settings, the torso shape, and the arms, legs, hands and shoes.
//
// Body space: the head sits at the top (crown +1, chin about -1.1); proportions follow the
// 7.5-heads canon: shoulders -2.1, chest -3.2, navel and elbow about -5.2, crotch and wrist -7.3,
// knee -10.6, soles about -14.75.

import {
  BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, LatheGeometry, Quaternion, SphereGeometry, SplineCurve, Vector2, Vector3,
} from "three";
import { BUILDS, BUSTS, BUTTS } from "./catalog.ts";
import { PI, bell, clamp01, smax, smooth } from "./math.ts";
import type { Recipe } from "./recipe.ts";

// ---- body-type settings ----

/** Every body-type number (see BodyType in catalog.ts), plus the chest and glute sizes. */
export type BodyParams = Required<Omit<(typeof BUILDS)[number], "id" | "n">> & { bust: number; butt: number };

const DEFAULTS = {
  sh: 1, ch: 1, chF: 1, chB: 1, rib: 1, wa: 1, waF: 1, waB: 1, hi: 1, hiF: 1, hiB: 1, belly: 0, bellyY: -5.0, pec: 0, abs: 0,
  trap: 0, slump: 0, armT: 1, armD: 1, armB: 1, armF: 1, legT: 1, calf: 1, limbL: 1, h: 1, w: 1, stance: 1, neck: 0, shirtless: 0, gl: 1,
};

/** Body-type numbers for a recipe: the body type, adjusted for the frame, chest and glute choices. */
export function bodyParams(r: Recipe): BodyParams {
  const build: Partial<BodyParams> = { ...BUILDS[r.build] };
  const B = { ...DEFAULTS, ...build, bust: 0, butt: 0 } as BodyParams;
  if (r.frame === 1) {
    B.sh *= 0.88; B.ch *= 0.95; B.wa *= 0.86; B.hi *= 1.12; B.hiB *= 1.1; B.armT *= 0.82; B.armD *= 0.85; B.armB *= 0.85;
    B.legT *= 1.04; B.calf *= 0.92; B.trap *= 0.5; B.bust = 0.21; B.pec = 0; B.abs *= 0.6;
  }
  const bust = BUSTS[r.bust] as { v?: number };
  if (bust.v !== undefined && r.bust) B.bust = bust.v;
  B.butt = BUTTS[r.butt].v * B.gl * (r.frame === 1 ? 1.25 : 1);
  return B;
}

// ---- torso ----

/**
 * Torso rings: heights, and half-widths, front and back depths at each (before body-type scaling).
 * The shoulder line (acromion, -1.82) sits about a third of a head below the chin, and the slope from
 * the neck to the shoulder is gentle, rounding over the deltoid. The hips curve out gradually from
 * the waist to their widest at the top of the thighs (the greater trochanter, just above the crotch).
 */
const TL = [-1.3, -1.4, -1.56, -1.82, -2.45, -3.1, -3.95, -4.8, -5.6, -6.35, -7.05, -7.4];
const TX = [0.4, 0.66, 1.12, 1.48, 1.52, 1.48, 1.36, 1.27, 1.34, 1.47, 1.53, 1.36];
const TZF = [0.3, 0.5, 0.62, 0.8, 0.94, 1.0, 0.93, 0.8, 0.84, 0.84, 0.62, 0.5];
const TZB = [0.36, 0.6, 0.74, 0.84, 0.92, 0.92, 0.88, 0.8, 0.84, 0.98, 0.86, 0.66];

/** Smooth (Catmull-Rom) interpolation of values V at heights L (L descending). */
export function crInterp(L: number[], V: number[], y: number) {
  let i = 0;
  while (i < L.length - 2 && y < L[i + 1]) i++;
  const t = clamp01((L[i] - y) / (L[i] - L[i + 1])), v0 = V[Math.max(0, i - 1)], v1 = V[i], v2 = V[i + 1], v3 = V[Math.min(V.length - 1, i + 2)];
  return 0.5 * (2 * v1 + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t * t + (-v0 + 3 * v1 - 3 * v2 + v3) * t * t * t);
}

export type Torso = {
  /** Point on the torso surface at height y and angle th round the body (0 = front), pushed out by off. */
  P(y: number, th: number, off?: number): Vector3;
  N(y: number, th: number, off?: number): Vector3;
  L: number[];
  X: number[];
  ZF: number[];
  ZB: number[];
  shY: number;
  /** Where the legs join: each thigh's centre (x = ±legX) and radius at the crotch (y = CROTCH_Y). */
  legX: number;
  legR: number;
  /** How far the buttocks push the skin out at (x, z), height y (also used on the thighs). */
  glute(y: number, x: number, z: number): number;
};

/** The crotch: the torso ends here and the thighs carry on below. */
export const CROTCH_Y = -7.4;
/** From here down the hips gradually divide into the tops of the two thighs. */
const SPLIT_Y = -6.45;
/** Front-to-back squash of the thighs (they are a little deeper side to side). */
export const THIGH_SQUASH = 0.92;

/** The torso as a function of height and angle, shaped by the body type (chest, waist, belly, muscles, bust, glutes). */
export function torsoModel(B: BodyParams): Torso {
  const t = B.trap, L = TL.slice();
  L[2] -= B.slump * 0.6;
  L[3] -= B.slump;
  L[4] -= B.slump * 0.5;
  const X = TX.map((v, i) => v * [1 + t * 0.6, 1 + t, B.sh * (1 + t * 0.3), B.sh, (B.sh + B.ch) / 2, B.ch, B.rib, B.wa, (B.wa + B.hi) / 2, B.hi, B.hi, B.hi][i]);
  const ZF = TZF.map((v, i) => v * [1 + t * 0.3, 1 + t * 0.3, 1, (1 + B.chF) / 2, B.chF, B.chF, (B.chF + B.waF) / 2, B.waF, B.waF, B.hiF, B.hiF, 1][i]);
  const ZB = TZB.map((v, i) => v * [1 + t * 0.5, 1 + t * 0.6, 1 + t * 0.4, B.chB, B.chB, B.chB, (B.chB + B.waB) / 2, B.waB, B.waB, B.hiB, B.hiB, 1][i]);
  const shY = L[3] - 0.08, del = 0.3 * B.armT * B.armD;
  // The thighs sit side by side under the hips, touching at the top as most people's do, and together
  // as wide as the hips, so the outline runs on smoothly from the hip down the thigh. (Very muscular
  // thighs may stand out a little past the hips, as they do in life.)
  const hipX = crInterp(L, X, -7.05), legX = hipX * 0.5;
  const legR = Math.min(Math.max(0.8 * (0.7 * B.legT + 0.3), legX * 1.02), hipX * 1.08 - legX);
  /**
   * Distance from the middle to the outside of the two thigh tops, along the direction (dx, dz).
   * A smooth blend of the two (not a hard join), so the crease between them is soft.
   */
  const lobes = (dx: number, dz: number) => {
    const rz = legR * THIGH_SQUASH, a = (dx * dx) / (legR * legR) + (dz * dz) / (rz * rz);
    const hit = (cx: number) => {
      const b = (-2 * dx * cx) / (legR * legR), c = (cx * cx) / (legR * legR) - 1, disc = b * b - 4 * a * c;
      return disc > 0 ? (-b + Math.sqrt(disc)) / (2 * a) : -b / (2 * a);
    };
    return smax(hit(legX), hit(-legX), 0.6);
  };
  /** The bare outline at height y and angle th (before muscles, bust and glutes), and the half-width there. */
  const outline = (y: number, th: number) => {
    const sn = Math.sin(th), cs = Math.cos(th), x0 = crInterp(L, X, y), by = y - B.bellyY;
    // Belly: a soft rounded mass, fuller below its middle than above (it settles), wrapping round to
    // the flanks (love handles) rather than standing out only at the front.
    const bl = B.belly * 0.85 * bell(by / (by > 0 ? 1.3 : 0.95));
    const zf = crInterp(L, ZF, y) + bl, zb = crInterp(L, ZB, y) + bl * 0.15;
    // Deltoid caps: the top of each shoulder is part of the torso, so the arm grows out from under it.
    const xr = x0 + bl * 0.5 + del * bell((y - shY) / 0.6) * smooth((Math.abs(sn) - 0.35) / 0.6);
    const zr = zb + (zf - zb) * smooth((cs + 0.35) / 0.7);
    let px = xr * sn, pz = zr * cs;
    // Below the hips, the outline divides into the two thigh tops, meeting the legs exactly at the crotch.
    const split = smooth((SPLIT_Y - y) / (SPLIT_Y - CROTCH_Y));
    if (split > 0) {
      const rho = Math.hypot(px, pz), dx = px / rho, dz = pz / rho, k = rho + (lobes(dx, dz) - rho) * split;
      px = dx * k;
      pz = dz * k;
    }
    return [px, pz, xr];
  };
  /**
   * How far the buttocks stand out at a point (x, z) at height y: round, fading to nothing at the
   * middle of the back (the cleft) and round towards the hips, and carrying on below the crotch onto
   * the backs of the thighs (the legs use this too), so they curve under smoothly into the thighs.
   */
  const glute = (y: number, x: number, z: number) => {
    if (!B.butt) return 0;
    const xr = crInterp(L, X, Math.max(y, CROTCH_Y)), cs = z / (Math.hypot(x, z) || 1);
    const back = smooth((-cs + 0.15) / 0.65) * smooth(Math.abs(x) / (0.3 * xr)), dy = y + 6.7;
    let d = 0;
    for (const sx of [-1, 1]) d += bell((x - sx * xr * 0.42) / (xr * 0.56));
    return B.butt * 0.95 * d * (dy > 0 ? bell(dy / 0.85) : bell(dy / 0.75)) * back;
  };
  /** The skin surface at height y and angle th. */
  const P0 = (y: number, th: number) => {
    const [px, pz, xr] = outline(y, th), [ax, az] = outline(y, th - 1e-3), [bx, bz] = outline(y, th + 1e-3);
    // Outward direction: square to the outline (which runs round towards +x as th grows).
    let nx = -(bz - az), nz = bx - ax;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    const cs = Math.cos(th);
    let d = 0;
    const front = smooth((cs - 0.1) / 0.4);
    if (B.pec) for (const sx of [-1, 1]) {
      const dy = y + 3.1;
      d += B.pec * 1.4 * bell((px - sx * xr * 0.36) / (xr * 0.38)) * (dy > 0 ? bell(dy / 0.55) : bell(dy / 0.3)) * front;
    }
    if (B.bust) {
      const bc = -3.3 - B.bust * 0.7;
      for (const sx of [-1, 1]) {
        const dy = y - bc;
        d += B.bust * 1.25 * bell((px - sx * xr * (0.4 + B.bust * 0.12)) / (xr * (0.34 + B.bust * 0.3))) *
          (dy > 0 ? bell(dy / (0.55 + B.bust * 0.55)) : bell(dy / (0.42 + B.bust * 0.4))) * front;
      }
    }
    d += glute(y, px, pz);
    if (B.abs) {
      for (const sx of [-1, 1]) for (const ay of [-3.8, -4.35, -4.9]) d += 0.06 * B.abs * bell((px - sx * 0.3) / 0.19) * bell((y - ay) / 0.2) * front;
      d -= 0.03 * B.abs * bell(px / 0.07) * smooth((-3.5 - y) / 0.3) * smooth((y + 5.3) / 0.3) * front;
    }
    return new Vector3(px + nx * d, y, pz + nz * d);
  };
  /** Outward direction of the skin (square to the surface, so layers keep their gap on slopes too). */
  const N0 = (y: number, th: number) => {
    const a = P0(y + 0.01, th).sub(P0(y - 0.01, th)), b = P0(y, th + 0.01).sub(P0(y, th - 0.01));
    return b.cross(a).normalize();
  };
  const P = (y: number, th: number, off = 0) => (off ? P0(y, th).addScaledVector(N0(y, th), off) : P0(y, th));
  const N = (y: number, th: number, off = 0) => {
    const a = P(y + 0.01, th, off).sub(P(y - 0.01, th, off)), b = P(y, th + 0.01, off).sub(P(y, th - 0.01, off));
    return b.cross(a).normalize();
  };
  return { P, N, L, X, ZF, ZB, shY, legX, legR, glute };
}

/** Average normals across the wrap-around seam of a grid (column 0 and column W-1 are the same points). */
function seamFix(g: BufferGeometry, rows: number, W: number) {
  const n = g.attributes.normal;
  for (let j = 0; j < rows; j++) {
    const a = j * W, b = j * W + W - 1, x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
}

/**
 * A band of the torso from height y0 down to y1, off the skin by off (a number, or a function of
 * height). drape: clothes hang straight down from the chest at the front instead of following the
 * waist in. keep(y, th): which cells to keep (for openings, V-necks, straps).
 */
export function torsoGeo(T: Torso, lod: number, y0: number, y1: number, off: number | ((y: number) => number), NY: number, NA: number,
  drape = false, keep?: (y: number, th: number) => boolean) {
  NY = Math.max(2, Math.round(NY * lod));
  NA = Math.max(12, Math.round((NA * lod) / 2) * 2);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= NY; j++) {
    const y = y0 + ((y1 - y0) * j) / NY, oy = typeof off === "function" ? off(y) : off;
    for (let i = 0; i <= NA; i++) {
      const th = (i / NA) * PI * 2, p = T.P(y, th, oy), n = T.N(y, th, oy);
      if (drape) p.copy(drapePoint(T, y, th, oy, y1, p));
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uv.push(i / NA, ((j / NY) * (y0 - y1)) / 2);
    }
  }
  const W = NA + 1;
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NA; i++) {
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      if (keep && !keep(y0 + ((y1 - y0) * (j + 0.5)) / NY, ((i + 0.5) / NA) * PI * 2)) continue;
      idx.push(a, d, b, a, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (drape) {
    g.computeVertexNormals();
    seamFix(g, NY + 1, NA + 1);
  }
  return g;
}

/**
 * A piece of cloth lying on the torso, off the skin by off, with smooth curved edges (necklines,
 * lapels, high-cut legs) where cutting the torso's grid would leave a staircase. at(u, v) gives the
 * height and angle round the body (0 = front, towards +x) of each point, for u across and v down.
 * place: where a point at (y, th) lies (default: on the torso; drapePoint for things on a loose top).
 */
export function sheetGeo(T: Torso, lod: number, NU: number, NV: number, off: number, at: (u: number, v: number) => [number, number],
  place: (y: number, th: number, off: number) => Vector3 = T.P) {
  NU = Math.max(4, Math.round(NU * lod));
  NV = Math.max(2, Math.round(NV * lod));
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= NV; j++) {
    for (let i = 0; i <= NU; i++) {
      const [y, th] = at(i / NU, j / NV), p = place(y, th, off);
      pos.push(p.x, p.y, p.z);
      uv.push(th / (PI * 2), -y / 2);
    }
  }
  const W = NU + 1;
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, d, b, a, c, d);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Face away from the body (the parameters may run either way round).
  const m = Math.round(NV / 2) * W + Math.round(NU / 2), P = g.attributes.position, N = g.attributes.normal;
  if (N.getX(m) * P.getX(m) + N.getZ(m) * P.getZ(m) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

/**
 * Where a loose top lies at height y and angle th: at the front it hangs straight down from the chest
 * (fading back to the body towards the hem at y1) instead of following the waist in. p: T.P(y, th, off).
 */
export function drapePoint(T: Torso, y: number, th: number, off: number, y1: number, p = T.P(y, th, off)) {
  if (Math.cos(th) <= 0) return p;
  const w = smooth((y - y1) / 0.5);
  let bz = p.z;
  for (let k = 0.15; k <= 1.6 && y + k < -1.6; k += 0.15) bz = Math.max(bz, T.P(y + k, th, off).z - 0.55 * k);
  return new Vector3(p.x, y, p.z + (bz - p.z) * w);
}

// ---- limbs ----

/**
 * A limb: a smooth radius profile [radius, y] turned round the y axis, with an optional squash per
 * height (oval cross-sections) and a bend at a joint (elbow).
 */
export function limbGeo(pts: [number, number][], seg: number, lod: number, bend?: { at: number; a: number } | null, squash?: (y: number) => [number, number]) {
  const sp = new SplineCurve(pts.map(([x, y]) => new Vector2(x, y))).getPoints(Math.max(10, Math.round(Math.max(20, pts.length * 3) * lod))).reverse();
  const g = new LatheGeometry(sp, Math.max(8, Math.round(seg * lod))), p = g.attributes.position, v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let sx = 1, sz = 0.92;
    if (squash) [sx, sz] = squash(v.y);
    v.x *= sx;
    v.z *= sz;
    if (bend) {
      const w = smooth((-v.y - bend.at + 0.25) / 0.5);
      if (w > 0) {
        const a = bend.a * w, dy = v.y + bend.at, c = Math.cos(a), sn = Math.sin(a);
        const ny = -bend.at + dy * c - v.z * sn, nz = dy * sn + v.z * c;
        v.y = ny;
        v.z = nz;
      }
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A finger: a tube along a curve with a radius profile and a rounded tip. */
function fingerGeo(curve: CatmullRomCurve3, rad: (t: number) => number, NR: number, NS: number, lod: number) {
  NR = Math.max(4, Math.round(NR * lod));
  NS = Math.max(5, Math.round(NS * lod));
  const pts = curve.getSpacedPoints(NS), fr = curve.computeFrenetFrames(NS, false), pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= NS; i++) {
    const r = rad(i / NS), P = pts[i], N = fr.normals[i], Bn = fr.binormals[i];
    for (let j = 0; j <= NR; j++) {
      const a = (j / NR) * PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(P.x + r * (c * N.x + s * Bn.x * 0.88), P.y + r * (c * N.y + s * Bn.y * 0.88), P.z + r * (c * N.z + s * Bn.z * 0.88));
    }
  }
  // Rounded fingertip: a few rings closing in a quarter circle beyond the end of the curve.
  const T = fr.tangents[NS], rEnd = rad(1), CAP = [0.45, 0.75, 0.93];
  for (const c of CAP) {
    const r = rEnd * Math.sqrt(1 - c * c), P = pts[NS].clone().addScaledVector(T, rEnd * c * 0.9), N = fr.normals[NS], Bn = fr.binormals[NS];
    for (let j = 0; j <= NR; j++) {
      const a = (j / NR) * PI * 2, cc = Math.cos(a), s = Math.sin(a);
      pos.push(P.x + r * (cc * N.x + s * Bn.x * 0.88), P.y + r * (cc * N.y + s * Bn.y * 0.88), P.z + r * (cc * N.z + s * Bn.z * 0.88));
    }
  }
  const rings = NS + CAP.length, tip = pts[NS].clone().addScaledVector(T, rEnd * 0.9), tipI = pos.length / 3;
  pos.push(tip.x, tip.y, tip.z);
  const W = NR + 1;
  for (let i = 0; i < rings; i++) for (let j = 0; j < NR; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  for (let j = 0; j < NR; j++) idx.push(rings * W + j, rings * W + j + 1, tipI);
  // Make sure the tube faces outward.
  const A = new Vector3().fromArray(pos, 3 * idx[0]), Bv = new Vector3().fromArray(pos, 3 * idx[1]), C = new Vector3().fromArray(pos, 3 * idx[2]);
  if (Bv.clone().sub(A).cross(C.clone().sub(A)).dot(A.clone().sub(pts[0])) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * The right hand in its own frame: wrist at the origin, fingers pointing down (-y), palm facing the
 * body (-x), thumb forward (+z). Relaxed, as a hand hangs: fingers side by side and gently curled
 * (the little finger most), the thumb resting along the index finger. k scales finger length.
 * Proportions: palm about as long as the middle finger; hand about 0.8 of the head's height.
 */
export function handGeos(k: number, fem: boolean, lod: number): { skin: BufferGeometry[]; nails: BufferGeometry[] } {
  const w = fem ? 0.9 : 1, skin: BufferGeometry[] = [], nails: BufferGeometry[] = [];
  // Palm: the same shape as the forearm at the wrist (its top tucked inside the sleeve of skin there),
  // widest across the knuckles and thinner there, rounding over into the fingers. Fleshy pads under
  // the thumb (thenar) and little finger (hypothenar); the knuckles stand out a little on the back.
  const PALM = 0.92, NU = Math.max(6, Math.round(14 * lod)), NA = Math.max(8, Math.round(16 * lod) & ~1), pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= NU; j++) {
    const t = -0.25 + (1.25 * j) / NU, y = -t * PALM, end = t > 0.8 ? Math.sqrt(Math.max(0.03, 1 - ((t - 0.8) / 0.2) ** 2)) : 1;
    // Above the wrist it narrows a little, to stay just inside the forearm.
    const tuck = 1 - 0.12 * smooth(-t / 0.15), hw = (0.27 + 0.13 * smooth(t / 0.55)) * w * tuck, th = (0.19 - 0.04 * smooth(t / 0.5) - 0.04 * smooth((t - 0.5) / 0.5)) * tuck;
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * PI * 2, zn = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.6), xn = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.8);
      let x = xn * th;
      if (x < 0) {
        x += 0.03 * (1 - zn * zn) * Math.sin(PI * clamp01((t - 0.2) / 0.7));
        x -= 0.05 * bell((zn - 0.6) / 0.35) * bell((t - 0.38) / 0.2) + 0.03 * bell((zn + 0.65) / 0.3) * bell((t - 0.55) / 0.25);
      } else {
        x += 0.02 * (1 - zn * zn) * smooth((t - 0.2) / 0.4);
        for (const fz of [0.27, 0.09, -0.09, -0.26]) x += 0.02 * bell((zn * hw - fz * w) / 0.07) * bell((t - 0.9) / 0.06);
      }
      // Rounded over at the knuckle end.
      pos.push(x * end, y - (1 - end) * 0.02, zn * hw * Math.sqrt(end));
    }
  }
  const tipI = pos.length / 3, topI = tipI + 1;
  pos.push(0, -PALM - 0.03, 0, 0, 0.25 * PALM, 0);
  for (let j = 0; j < NU; j++) for (let i = 0; i < NA; i++) {
    const a = j * NA + i, b = j * NA + ((i + 1) % NA);
    idx.push(a, b + NA, b, a, a + NA, b + NA);
  }
  for (let i = 0; i < NA; i++) {
    idx.push(NU * NA + i, tipI, NU * NA + ((i + 1) % NA));
    idx.push(topI, i, (i + 1) % NA);
  }
  const pg = new BufferGeometry();
  pg.setAttribute("position", new Float32BufferAttribute(pos, 3));
  pg.setIndex(idx);
  pg.computeVertexNormals();
  // Face outward (check the back of the hand points +x).
  {
    const P = pg.attributes.position, N = pg.attributes.normal, m = Math.round(NU / 2) * NA + Math.round(NA / 4);
    if (N.getX(m) * P.getX(m) < 0) {
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      pg.setIndex(idx);
      pg.computeVertexNormals();
    }
  }
  skin.push(pg);
  const nail = (curve: CatmullRomCurve3, r: number, len: number, side: Vector3) => {
    const tip = curve.getPointAt(0.9), tan = curve.getTangentAt(0.9).normalize();
    // The nail lies on the back of the fingertip, nearly flush with the skin.
    const back = side.clone().sub(tan.clone().multiplyScalar(side.dot(tan))).normalize();
    const g = new SphereGeometry(1, 6, 4);
    g.scale(r * 0.72, len, r * 0.2);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), tan);
    const zAxis = new Vector3(0, 0, 1).applyQuaternion(q);
    q.premultiply(new Quaternion().setFromUnitVectors(zAxis, back));
    g.applyQuaternion(q);
    const at = tip.clone().addScaledVector(back, r * 0.66);
    g.translate(at.x, at.y, at.z);
    nails.push(g);
  };
  // Fingers: [across the palm, length, base radius, curl at each of the three joints].
  const F: [number, number, number, [number, number, number]][] = [
    [0.27, 0.74, 0.094, [0.12, 0.22, 0.14]], [0.09, 0.82, 0.098, [0.16, 0.28, 0.16]],
    [-0.09, 0.77, 0.092, [0.2, 0.32, 0.18]], [-0.26, 0.6, 0.08, [0.26, 0.38, 0.2]],
  ];
  for (const [fz, fl, fr, cu] of F) {
    const kz = fz * w, base = new Vector3(0, -PALM + 0.1 + 0.07 * (Math.abs(fz - 0.05) / 0.3) ** 2, kz);
    const l = fl * k, seg = [0.45, 0.31, 0.24], pts = [base.clone().add(new Vector3(0, 0.15, 0)), base.clone()];
    const dir = new Vector3(0, -1, -fz * 0.08).normalize();
    let p = base.clone();
    for (let j = 0; j < 3; j++) {
      dir.applyAxisAngle(new Vector3(0, 0, 1), -cu[j]);
      p = p.clone().addScaledVector(dir, l * seg[j]);
      pts.push(p);
    }
    const curve = new CatmullRomCurve3(pts), r0 = fr * k * w;
    skin.push(fingerGeo(curve, (t) => r0 * (1 + 0.15 * smooth((0.12 - t) / 0.12) - 0.28 * t) * (1 + 0.05 * bell((t - 0.4) / 0.05) + 0.04 * bell((t - 0.7) / 0.05)), 7, 12, lod));
    // Nails only on your own avatar (too small to see on other players).
    if (lod < 1) continue;
    nail(curve, r0 * 0.72, l * 0.11, new Vector3(1, 0, 0));
  }
  // Thumb: from the pad at the base of the palm, forward and down, resting beside the index finger.
  const tb = new Vector3(-0.03, -0.24, 0.2 * w);
  const tp = [tb.clone().add(new Vector3(0.02, 0.14, -0.06)), tb, tb.clone().add(new Vector3(-0.06, -0.3, 0.12).multiplyScalar(k)),
    tb.clone().add(new Vector3(-0.1, -0.56, 0.17).multiplyScalar(k)), tb.clone().add(new Vector3(-0.12, -0.78, 0.14).multiplyScalar(k))];
  const tc = new CatmullRomCurve3(tp), tr = 0.112 * k * w;
  skin.push(fingerGeo(tc, (t) => tr * (1.1 - 0.38 * t) * (1 + 0.05 * bell((t - 0.6) / 0.06)), 7, 11, lod));
  if (lod >= 1) nail(tc, tr * 0.72, 0.075 * k, new Vector3(0.5, 0, 1));
  return { skin, nails };
}

/**
 * A shoe, toe pointing +z, with the ankle at the origin over the back quarter of the foot (as in a
 * real foot). The outline is narrow at the heel and widest across the ball of the foot; the top is
 * high round the ankle and slopes down to the toe, which lifts slightly off the ground (toe spring).
 * The bottom is flat at y = 0. sole: a thin slab with the same outline, a little larger.
 */
export function shoeGeo(len: number, wid: number, hgt: number, lod: number, sole = false) {
  const NU = Math.max(8, Math.round((sole ? 12 : 18) * lod)), NA = Math.max(8, Math.round((sole ? 14 : 18) * lod) & ~1), pos: number[] = [], idx: number[] = [];
  const grow = sole ? 1.04 : 1;
  // End caps: the outline closes in a rounded curve at the heel and toe (rings bunch up there).
  const cap = (u: number) => Math.sqrt(Math.max(0, 1 - (u < 0.16 ? ((0.16 - u) / 0.16) ** 2 : u > 0.78 ? ((u - 0.78) / 0.22) ** 2 : 0)));
  for (let j = 0; j <= NU; j++) {
    const u = 0.5 - 0.5 * Math.cos((PI * j) / NU), c = cap(u), z = (u - 0.24) * len * grow;
    const hw = 0.5 * wid * grow * (0.7 + 0.3 * smooth((u - 0.1) / 0.55) - 0.06 * smooth((u - 0.85) / 0.15));
    const spring = 0.045 * len * smooth((u - 0.72) / 0.28);
    const top = sole ? hgt : hgt * (1 - 0.48 * smooth((u - 0.3) / 0.6));
    const bot = spring, mid = (bot + top) / 2, hh = (top - bot) / 2;
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // Squarish cross-section, flat underneath, rounded on top.
      const x = hw * Math.sign(ca) * Math.pow(Math.abs(ca), sa < 0 ? 0.35 : 0.85);
      const y = sa < 0 ? -hh * Math.pow(-sa, 0.3) : hh * Math.pow(sa, 0.8);
      // The toe and heel round over from the top: the bottom stays flat on the sole right to the tip.
      const yy = mid + y, yc = bot + (yy - bot) * Math.pow(c, 0.7);
      pos.push(x * Math.pow(c, 0.85), sa < 0 ? Math.max(bot, yc - (1 - c) * 0.02) : yc, z);
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

/** Mirror a geometry left-right (and fix its winding, which mirroring turns inside out). */
export function mirrorX(g: BufferGeometry) {
  g.scale(-1, 1, 1);
  const I = g.index!.array as Uint32Array | Uint16Array;
  for (let i = 0; i < I.length; i += 3) [I[i + 1], I[i + 2]] = [I[i + 2], I[i + 1]];
  g.index!.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}
