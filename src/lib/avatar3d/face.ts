// Head skin, nose, lips and the inside of the mouth.
// The nose and lips are not separate objects: they are raised out of one face patch (a height field
// laid over the front of the face), so they melt into the skin with no seams. The patch carries the
// mouth blend shapes (smile, open, pucker, wide).

import { type BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Vector3 } from "three";
import { LIPS, LIP_TINTS, NOSES, SKINS } from "./catalog.ts";
import { type HeadCtx, NE1, NE2, NP, facePoint, headNeck, surfNormal } from "./head-shape.ts";
import { PI, clamp01, res, resEven, smax, smooth } from "./math.ts";
import { type Part, ROOT, ellGeo, geoFrom } from "./parts.ts";

type Nose = (typeof NOSES)[number];
type Lips = (typeof LIPS)[number] & { bow?: number };

const g2 = (dx: number, dy: number) => Math.exp(-(dx * dx + dy * dy));

/** Raised height of the nose at front-view (x, y), plus how much to darken the skin (nostrils, side grooves). */
export function noseShape(N: Nose, x: number, y: number) {
  const ty = -0.19 - (N.len - 1) * 0.06, top = 0.1;
  const t = clamp01((top - y) / (top - ty)), wb = 0.055 * N.br * (0.9 + 0.5 * t);
  const bridge = N.proj * (0.012 + 0.075 * Math.pow(t, 1.3)) * Math.exp(-((x / wb) ** 2)) * smooth((y - (ty - 0.04)) / 0.06) *
    smooth((top + 0.06 - y) / 0.09);
  const bw = 0.08 * N.w + 0.045, bh = 0.046, by = (y - ty + 0.016) / bh, base = Math.exp(-(Math.pow(Math.abs(x) / bw, 3.2) + by * by));
  const rt = 0.06 * N.tip, tip = 0.05 * N.proj * N.tip * g2(x / (rt * 1.1), (y - ty + 0.004) / rt);
  const wing = (s: number) => g2((x - s * 0.084 * N.w) / 0.042, (y - ty + 0.02) / 0.032), wings = 0.012 * N.proj * (wing(1) + wing(-1));
  let h = smax(bridge, 0.07 * N.proj * base + tip + wings, 0.035);
  const nost = (s: number) => g2((x - s * 0.042 * N.w) / (0.024 * Math.sqrt(N.w)), (y - ty + 0.056) / 0.014);
  const nd = Math.max(nost(1), nost(-1));
  h = Math.max(0, h - 0.028 * N.proj * nd);
  const groove = Math.abs(x) > 0.055 && y < ty + 0.03 ? Math.exp(-(((base - 0.35) / 0.13) ** 2)) : 0;
  return { h, dark: Math.min(1, nd * 1.15) * 0.75 + groove * 0.16 };
}

/** Height of the mouth line (front-view y). */
export const MOUTH_Y = -0.47;

/** Raised height of the closed lips at (x, y), and how much lip colour shows there (0..1). */
export function lipShape(L: Lips, x: number, y: number) {
  const ax = Math.abs(x), wu = 0.17 * L.w, wl = 0.152 * L.w, bow = L.bow ? 1 : 0.5;
  const wxu = Math.exp(-Math.pow(ax / wu, 4)), wxl = Math.exp(-Math.pow(ax / wl, 4));
  const cu = MOUTH_Y + 0.028 * L.up + 0.006 * bow * (Math.exp(-(((ax - 0.035) / 0.022) ** 2)) - 0.6 * Math.exp(-((x / 0.018) ** 2)));
  const gu = Math.exp(-(((y - cu) / (0.024 * L.up)) ** 2)) * wxu;
  const gl = Math.exp(-(((y - (MOUTH_Y - 0.036 * L.low)) / (0.03 * L.low)) ** 2)) * wxl;
  const sulcus = -0.008 * Math.exp(-(((y - (MOUTH_Y - 0.115 * L.low)) / 0.03) ** 2)) * Math.exp(-Math.pow(ax / 0.16, 4));
  return { h: 0.042 * L.d * gu + 0.052 * L.d * gl + sulcus, mask: clamp01(Math.max(gu, gl) * 1.7 - 0.28) };
}

export const MOUTH_MORPHS = ["smile", "open", "pucker", "wide"] as const;
type Expr = Record<(typeof MOUTH_MORPHS)[number], number>;

/** How the skin around the mouth slides for an expression (front-view offsets, plus depth). */
function mouthWarp(L: Lips, x: number, y: number, e: Expr, upper: boolean) {
  const ax = Math.abs(x), sx = Math.sign(x), ww = 0.17 * L.w, MY = MOUTH_Y;
  const E = smooth((0.38 - ax) / 0.08) * smooth((y + 0.8) / 0.12) * smooth((0.16 - y) / 0.12);
  const wc = g2((ax - ww) / 0.1, (y - MY) / 0.09), inM = g2(x / (ww * 1.1), (y - MY) / 0.09), f = Math.exp(-Math.pow(ax / (ww * 1.02), 4));
  let ox = 0, oy = 0, dz = 0;
  ox += e.smile * (0.03 * sx * wc + 0.018 * (x / ww) * inM);
  oy += e.smile * 0.045 * wc;
  dz += e.smile * (0.032 * g2((ax - 0.25) / 0.09, (y + 0.33) / 0.08) - 0.012 * wc);
  if (upper) oy += e.open * 0.016 * f * Math.exp(-(((y - MY) / 0.07) ** 2));
  else {
    oy -= e.open * 0.11 * f * Math.exp(-(((MY - y) / 0.22) ** 2));
    dz -= e.open * 0.012 * f * Math.exp(-(((MY - y) / 0.1) ** 2));
  }
  ox -= e.open * 0.1 * x * inM;
  ox -= e.pucker * 0.4 * x * g2(x / 0.26, (y - MY) / 0.12);
  dz += e.pucker * 0.05 * g2(x / 0.16, (y - MY) / 0.08);
  ox += e.wide * 0.18 * x * g2(x / 0.3, (y - MY) / 0.1);
  return { ox: ox * E, oy: oy * E, dz: dz * E };
}

/**
 * Where the surface turns a sharp corner (throat to the underside of the chin), a normal measured
 * across the corner points the wrong way and shades as a dark crease. There, ease the normal toward
 * the mesh's own (face-averaged) normal; everywhere else keep the exact normal from the shape.
 */
function creaseNormals(geo: BufferGeometry, NA: number, NT: number) {
  const exact = geo.attributes.normal.clone();
  geo.computeVertexNormals();
  const n = geo.attributes.normal, W = NA + 1, a = new Vector3(), m = new Vector3(), s = new Vector3();
  // The grid's first and last columns are the same points (the seam), and each end row is one point (the poles): share their normals.
  const share = (ids: number[]) => {
    s.set(0, 0, 0);
    for (const i of ids) s.add(m.fromBufferAttribute(n, i));
    s.normalize();
    for (const i of ids) n.setXYZ(i, s.x, s.y, s.z);
  };
  for (let j = 0; j <= NT; j++) share([j * W, j * W + NA]);
  for (const j of [0, NT]) share(Array.from({ length: W }, (_, i) => j * W + i));
  for (let i = 0; i < n.count; i++) {
    a.fromBufferAttribute(exact, i);
    m.fromBufferAttribute(n, i);
    const w = smooth((0.9 - a.dot(m)) / 0.4);
    a.lerp(m, w).normalize();
    n.setXYZ(i, a.x, a.y, a.z);
  }
}

/** The head and neck skin, with holes where the face patch's mouth and the eyes go. */
export function headSkin(c: HeadCtx): Part {
  // Hole behind the lips (wide and deep enough that the lower lip never lies on hidden skin when the mouth
  // opens), and holes for the eyes. All of it sits under the face patch, so the hole edges never show.
  const keep = (u: Vector3) =>
    !(u.z > 0.5 && Math.abs(u.x) < 0.25 && u.y < -0.38 && u.y > -0.68) &&
    !(u.z > 0.4 && ((Math.abs(u.x) - 0.34) / 0.17) ** 2 + ((u.y - 0.06) / 0.12) ** 2 < 1);
  // Laid out around the neck axis, so the neck gets an even, dense grid for sculpting.
  const NA = resEven(68, c.lod), NT = res(58, c.lod);
  const map = (u: Vector3) => headNeck(c, u);
  const pos: number[] = [], nor: number[] = [], kp: boolean[] = [], idx: number[] = [], aCut = 0.8, vCut = 0.44;
  for (let j = 0; j <= NT; j++) {
    const v = j / NT, al = v < vCut ? (aCut * v) / vCut : aCut + ((PI - aCut) * (v - vCut)) / (1 - vCut);
    for (let i = 0; i <= NA; i++) {
      const ph = (i / NA) * PI * 2;
      const u = NP.clone().multiplyScalar(Math.cos(al)).addScaledVector(NE1, Math.cos(ph) * Math.sin(al))
        .addScaledVector(NE2, Math.sin(ph) * Math.sin(al)).normalize();
      const p = map(u), n = surfNormal(map, u);
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      kp.push(keep(u));
    }
  }
  const W = NA + 1;
  for (let j = 0; j < NT; j++) {
    for (let i = 0; i < NA; i++) {
      const a = j * W + i, b = a + 1, cc = a + W, d = cc + 1;
      if (kp[a] && kp[b] && kp[d]) idx.push(a, d, b);
      if (kp[a] && kp[d] && kp[cc]) idx.push(a, cc, d);
    }
  }
  const geo = geoFrom(pos, idx, nor);
  creaseNormals(geo, NA, NT);
  return { name: "headSkin", mat: "skin", node: ROOT, geo, surface: "closed" };
}

/** Face patch (nose and lips, split at the mouth line into upper and lower halves) and the inside of the mouth. */
export function facePatch(c: HeadCtx): Part[] {
  const r = c.recipe, N = NOSES[r.nose], L: Lips = LIPS[r.lips];
  const skin = new Color(SKINS[r.skin].c), tint = LIP_TINTS[r.lipT], lipCol = skin.clone().lerp(new Color(tint.c), tint.k);
  const Z: Expr = { smile: 0, open: 0, pucker: 0, wide: 0 };
  const P = (x: number, y: number, e: Expr, up: boolean) => {
    const w = mouthWarp(L, x, y, e, up), X = x + w.ox, Y = y + w.oy;
    const d = headNeck(c, new Vector3(X, Y, Math.sqrt(Math.max(0, 1 - X * X - Y * Y)))).multiplyScalar(1.002);
    d.z += noseShape(N, x, y).h + lipShape(L, x, y).h + w.dz;
    return d;
  };
  const Nrm = (x: number, y: number, e: Expr, up: boolean) => {
    const k = 0.004, a = P(x + k, y, e, up).sub(P(x - k, y, e, up)), b = P(x, y + k, e, up).sub(P(x, y - k, e, up));
    return a.cross(b).normalize();
  };
  const nx = Math.round(50 * c.lod), ny = Math.round(64 * c.lod), x0 = -0.38, x1 = 0.38, y0 = -0.8, dy = 0.96 / ny;
  const seam = Math.round(22 * c.lod), ww = 0.17 * L.w;
  const parts: Part[] = [];
  for (const up of [false, true]) {
    const j0 = up ? seam : 0, j1 = up ? ny : seam, pos: number[] = [], nor: number[] = [], cols: number[] = [], idx: number[] = [];
    const mp: number[][] = MOUTH_MORPHS.map(() => []), mn: number[][] = MOUTH_MORPHS.map(() => []);
    for (let j = j0; j <= j1; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + ((x1 - x0) * i) / nx, y = y0 + dy * j, p = P(x, y, Z, up), n = Nrm(x, y, Z, up);
        pos.push(p.x, p.y, p.z);
        nor.push(n.x, n.y, n.z);
        MOUTH_MORPHS.forEach((k, m) => {
          const e = { ...Z, [k]: 1 }, q = P(x, y, e, up).sub(p), qn = Nrm(x, y, e, up).sub(n);
          mp[m].push(q.x, q.y, q.z);
          mn[m].push(qn.x, qn.y, qn.z);
        });
        const ls = lipShape(L, x, y), dark = noseShape(N, x, y).dark;
        const line = j === seam ? 0.5 * Math.exp(-Math.pow(Math.abs(x) / (ww * 1.05), 4)) : 0;
        const col = skin.clone().lerp(lipCol, ls.mask).multiplyScalar((1 - dark) * (1 - line));
        cols.push(col.r, col.g, col.b);
      }
    }
    const W = nx + 1;
    for (let j = 0; j < j1 - j0; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * W + i, b = a + 1, cc = a + W, d = cc + 1;
        idx.push(a, b, d, a, d, cc);
      }
    }
    const geo = geoFrom(pos, idx, nor, cols);
    geo.morphTargetsRelative = true;
    geo.morphAttributes.position = mp.map((a) => new Float32BufferAttribute(a, 3));
    geo.morphAttributes.normal = mn.map((a) => new Float32BufferAttribute(a, 3));
    parts.push({ name: up ? "faceUpper" : "faceLower", mat: "skinVC", node: ROOT, geo, morphs: [...MOUTH_MORPHS], surface: "closed" });
  }

  // Inside of the mouth: dark cavity, upper teeth on the head, lower teeth and tongue on the jaw.
  const mq = facePoint(c, 0, MOUTH_Y), mpt = mq.p, mnrm = mq.n, R = 0.13 * L.w;
  parts.push({
    name: "mouthCavity", mat: "mouthCavity", node: ROOT, surface: "sheet",
    geo: ellGeo(R + 0.05, 0.12, 0.13, 16, c.lod, mpt.clone().addScaledVector(mnrm, -0.14)),
  });
  const arc = (r0: number, r1: number, h: number, at: Vector3) => new CylinderGeometry(r0, r1, h, 20, 1, true, -1, 2).translate(at.x, at.y, at.z);
  parts.push({
    name: "teethUpper", mat: "teeth", node: ROOT, surface: "sheet",
    geo: arc(R, R * 0.97, 0.05, mpt.clone().add(new Vector3(0, 0.02, 0)).addScaledVector(mnrm, -(R + 0.03))),
  });
  parts.push({
    name: "teethLower", mat: "teeth", node: "jaw", surface: "sheet",
    geo: arc(R * 0.9, R * 0.88, 0.04, mpt.clone().add(new Vector3(0, -0.03, 0)).addScaledVector(mnrm, -(R * 0.9 + 0.04))),
  });
  parts.push({
    name: "tongue", mat: "tongue", node: "jaw", surface: "closed",
    geo: ellGeo(R * 0.75, 0.035, 0.09, 14, c.lod, mpt.clone().add(new Vector3(0, -0.055, 0)).addScaledVector(mnrm, -0.12)),
  });
  return parts;
}
