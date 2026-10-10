// Head skin, nose, lips and the inside of the mouth.
// The nose and lips are not separate objects: they are raised out of one face patch (a height field
// laid over the front of the face), so they melt into the skin with no seams. The patch carries the
// mouth blend shapes (smile, open, pucker, wide).

import { type BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Vector3 } from "three";
import { LIPS, LIP_TINTS, NOSES, SKINS } from "./catalog.ts";
import { type HeadCtx, NE1, NE2, NP, facePoint, headNeck, neckBlendFreedom, surfNormal } from "./head-shape.ts";
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
/**
 * Half-width of an average mouth (front-view x). Real mouths are about 0.8x the distance between the
 * pupils; the prototype's 0.17 was about 0.6x. 0.205 is close to real while staying a touch small,
 * which suits the stylised big-eyed look.
 */
export const MOUTH_W = 0.205;

/** Raised height of the closed lips at (x, y), and how much lip colour shows there (0..1). */
export function lipShape(L: Lips, x: number, y: number) {
  const ax = Math.abs(x), wu = MOUTH_W * L.w, wl = MOUTH_W * 0.894 * L.w, bow = L.bow ? 1 : 0.5;
  const wxu = Math.exp(-Math.pow(ax / wu, 4)), wxl = Math.exp(-Math.pow(ax / wl, 4));
  const cu = MOUTH_Y + 0.028 * L.up + 0.006 * bow * (Math.exp(-(((ax - 0.035) / 0.022) ** 2)) - 0.6 * Math.exp(-((x / 0.018) ** 2)));
  const gu = Math.exp(-(((y - cu) / (0.024 * L.up)) ** 2)) * wxu;
  const gl = Math.exp(-(((y - (MOUTH_Y - 0.036 * L.low)) / (0.03 * L.low)) ** 2)) * wxl;
  const sulcus = -0.008 * Math.exp(-(((y - (MOUTH_Y - 0.115 * L.low)) / 0.03) ** 2)) * Math.exp(-Math.pow(ax / 0.16, 4));
  return { h: 0.042 * L.d * gu + 0.052 * L.d * gl + sulcus, mask: clamp01(Math.max(gu, gl) * 1.7 - 0.28) };
}

/**
 * Front-view area the face patch covers. Its edges must lie where the face is seen square-on, never
 * on an outline (an edge on an outline shows). The prototype's bottom edge (-0.8) wrapped under the
 * chin and ended right on its outline; this one ends on the front of the chin, below the lower lip.
 */
const PATCH = { x: 0.38, yLo: -0.68, yHi: 0.16 };

export const MOUTH_MORPHS = ["smile", "open", "pucker", "wide"] as const;
type Expr = Record<(typeof MOUTH_MORPHS)[number], number>;

/** How the skin around the mouth slides for an expression (front-view offsets, plus depth). */
function mouthWarp(L: Lips, x: number, y: number, e: Expr, upper: boolean) {
  const ax = Math.abs(x), sx = Math.sign(x), ww = MOUTH_W * L.w, MY = MOUTH_Y;
  // Movement fades out towards the patch's edges, so they stay put on the skin (the bottom fades over a longer
  // distance: opening the mouth pulls the chin down, and its lowest rows must not slide off the opening).
  const E = smooth((PATCH.x - ax) / 0.08) * smooth((y - PATCH.yLo) / 0.16) * smooth((PATCH.yHi - y) / 0.12);
  const wc = g2((ax - ww) / 0.1, (y - MY) / 0.09), inM = g2(x / (ww * 1.1), (y - MY) / 0.09), f = Math.exp(-Math.pow(ax / (ww * 1.02), 4));
  let ox = 0, oy = 0, dz = 0;
  ox += e.smile * (0.03 * sx * wc + 0.018 * (x / ww) * inM);
  oy += e.smile * 0.045 * wc;
  dz += e.smile * (0.032 * g2((ax - 0.25) / 0.09, (y + 0.33) / 0.08) - 0.012 * wc);
  if (upper) oy += e.open * 0.016 * f * Math.exp(-(((y - MY) / 0.07) ** 2));
  else {
    oy -= e.open * 0.11 * f * Math.exp(-(((MY - y) / 0.22) ** 2));
    // Only the lower lip itself rolls in a little as the mouth opens (the prototype's wider pull also sank
    // the chin below it into the skin underneath).
    dz -= e.open * 0.012 * f * Math.exp(-(((MY - y) / 0.07) ** 2));
  }
  ox -= e.open * 0.1 * x * inM;
  ox -= e.pucker * 0.4 * x * g2(x / 0.26, (y - MY) / 0.12);
  dz += e.pucker * 0.05 * g2(x / 0.16, (y - MY) / 0.08);
  ox += e.wide * 0.18 * x * g2(x / 0.3, (y - MY) / 0.1);
  return { ox: ox * E, oy: oy * E, dz: dz * E };
}

/**
 * Smooths each column of the grid (neck up into the head) inside the band where the neck blends into
 * the skull, then spaces the rows evenly along it. The blend squeezes several rows onto the top of the
 * neck; without this they fold into slivers that show as a jagged line along the jaw. The band's ends
 * stay fixed, so the face and the lower neck are untouched.
 */
/** Smoothing passes: enough to fill the groove where the jaw's underside meets the neck, as soft tissue does. */
const RELAX_STEPS = 40;

function relaxJunction(pos: number[], NA: number, NT: number, free: number[]) {
  const W = NA + 1;
  for (let i = 0; i <= NA; i++) {
    // This column's stretch of the blend: the rows with any freedom, plus one fixed row at each end.
    let j0 = -1, j1 = -1;
    for (let j = 0; j <= NT; j++) {
      if (free[j * W + i] > 0) {
        if (j0 < 0) j0 = j;
        j1 = j;
      }
    }
    if (j0 < 0) continue;
    j0 = Math.max(0, j0 - 1);
    j1 = Math.min(NT, j1 + 1);
    const ids = Array.from({ length: j1 - j0 + 1 }, (_, k) => (j0 + k) * W + i);
    if (ids.length < 4) continue;
    let col = ids.map((id) => new Vector3(pos[3 * id], pos[3 * id + 1], pos[3 * id + 2]));
    const f = ids.map((id) => free[id]);
    for (let it = 0; it < RELAX_STEPS; it++) {
      col = col.map((p, k) => (k === 0 || k === col.length - 1 ? p : p.clone().lerp(col[k - 1].clone().add(col[k + 1]).multiplyScalar(0.5), 0.5 * f[k])));
    }
    // Even spacing along the smoothed column, keeping both ends where they were.
    const len = [0];
    for (let k = 1; k < col.length; k++) len.push(len[k - 1] + col[k].distanceTo(col[k - 1]));
    const total = len[len.length - 1];
    ids.forEach((id, k) => {
      const want = (total * k) / (ids.length - 1);
      let q = 1;
      while (q < col.length - 1 && len[q] < want) q++;
      const t = len[q] - len[q - 1] > 1e-9 ? (want - len[q - 1]) / (len[q] - len[q - 1]) : 0;
      const p = col[q - 1].clone().lerp(col[q], Math.max(0, Math.min(1, t)));
      pos.splice(3 * id, 3, p.x, p.y, p.z);
    });
  }
}

/**
 * Where the surface turns a sharp corner (throat to the underside of the chin), a normal measured
 * across the corner points the wrong way and shades as a dark crease, and where relaxJunction moved
 * the skin the exact normal no longer fits (it shaded as a bright streak along the jaw). There, ease
 * the normal toward the mesh's own (face-averaged) normal; everywhere else keep the exact normal.
 */
function creaseNormals(geo: BufferGeometry, NA: number, NT: number, free: number[]) {
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
    // Also wherever relaxJunction moved the skin: the exact normal belongs to the shape before smoothing.
    const w = Math.max(smooth((0.9 - a.dot(m)) / 0.4), smooth(free[i] * 4));
    a.lerp(m, w).normalize();
    n.setXYZ(i, a.x, a.y, a.z);
  }
}

/** The face patch's area, feathered out by a small margin. */
const underPatch = (u: Vector3) =>
  u.z <= 0 ? 0 : smooth((PATCH.x + 0.08 - Math.abs(u.x)) / 0.08) * smooth((u.y - PATCH.yLo + 0.08) / 0.08) * smooth((PATCH.yHi + 0.08 - u.y) / 0.08);

/** 1 well inside the face patch's area, falling to 0 at its edges. */
const patchInterior = (u: Vector3) =>
  u.z <= 0 ? 0 : smooth((PATCH.x - Math.abs(u.x)) / 0.06) * smooth((u.y - PATCH.yLo) / 0.06) * smooth((PATCH.yHi - u.y) / 0.06);

/** The opening in the skin behind the lips (front-view x, y). The mouth cavity is sized to cover it. */
const MOUTH_HOLE = { x: 0.05 + MOUTH_W * 1.25, yLo: PATCH.yLo, yHi: -0.38 };
const inMouthHole = (u: Vector3) => u.z > 0.5 && Math.abs(u.x) < MOUTH_HOLE.x && u.y < MOUTH_HOLE.yHi && u.y > MOUTH_HOLE.yLo;

/** The head and neck skin, with holes where the face patch's mouth and the eyes go. */
export function headSkin(c: HeadCtx): Part {
  // Holes for the eyes, and behind the lips (so the lower lip never lies on hidden skin when the mouth
  // opens). All of it sits under the face patch and, for the mouth, in front of the mouth cavity.
  const eyeHole = (u: Vector3) => u.z > 0.4 && ((Math.abs(u.x) - 0.34) / 0.17) ** 2 + ((u.y - 0.06) / 0.12) ** 2 < 1;
  // Laid out around the neck axis, so the neck gets an even, dense grid for sculpting.
  const NA = resEven(68, c.lod), NT = res(58, c.lod);
  const map = (u: Vector3) => headNeck(c, u);
  const pos: number[] = [], nor: number[] = [], kp: boolean[] = [], mh: boolean[] = [], free: number[] = [], idx: number[] = [], aCut = 0.8, vCut = 0.44;
  const rowAngle = (j: number) => {
    const v = j / NT;
    return v < vCut ? (aCut * v) / vCut : aCut + ((PI - aCut) * (v - vCut)) / (1 - vCut);
  };
  for (let j = 0; j <= NT; j++) {
    const al = rowAngle(j);
    for (let i = 0; i <= NA; i++) {
      const ph = (i / NA) * PI * 2;
      const u = NP.clone().multiplyScalar(Math.cos(al)).addScaledVector(NE1, Math.cos(ph) * Math.sin(al))
        .addScaledVector(NE2, Math.sin(ph) * Math.sin(al)).normalize();
      // Hidden skin under the face patch sits a little deeper, tapering to nothing at the patch's edges: its
      // coarse mesh cuts across hollows (between lip and chin) and could otherwise reach the patch above it.
      const p = map(u).multiplyScalar(1 - 0.005 * patchInterior(u)), n = surfNormal(map, u);
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      kp.push(!eyeHole(u));
      mh.push(inMouthHole(u));
      // Never smooth under the face patch: it is shaped from the unsmoothed head, so the skin under it must stay put.
      free.push(neckBlendFreedom(u) * (1 - underPatch(u)));
    }
  }
  const W = NA + 1;
  for (let j = 0; j < NT; j++) {
    for (let i = 0; i < NA; i++) {
      const a = j * W + i, b = a + 1, cc = a + W, d = cc + 1;
      // A triangle goes if it touches an eye hole, but only if it lies wholly inside the mouth hole: the
      // mouth hole then comes out slightly smaller than drawn, never larger (a larger one reached past the
      // face patch's edge and the mouth cavity, and showed as see-through slits).
      if (kp[a] && kp[b] && kp[d] && !(mh[a] && mh[b] && mh[d])) idx.push(a, d, b);
      if (kp[a] && kp[d] && kp[cc] && !(mh[a] && mh[d] && mh[cc])) idx.push(a, cc, d);
    }
  }
  relaxJunction(pos, NA, NT, free);
  const geo = geoFrom(pos, idx, nor);
  creaseNormals(geo, NA, NT, free);
  return { name: "headSkin", mat: "skin", node: ROOT, geo, surface: "closed" };
}

/** Face patch (nose and lips, split at the mouth line into upper and lower halves) and the inside of the mouth. */
export function facePatch(c: HeadCtx): Part[] {
  const r = c.recipe, N = NOSES[r.nose], L: Lips = LIPS[r.lips];
  const skin = new Color(SKINS[r.skin].c), tint = LIP_TINTS[r.lipT], lipCol = skin.clone().lerp(new Color(tint.c), tint.k);
  const Z: Expr = { smile: 0, open: 0, pucker: 0, wide: 0 };
  const nx = Math.round(50 * c.lod), ny = Math.round(64 * c.lod), x0 = -PATCH.x, x1 = PATCH.x, y0 = PATCH.yLo, dy = (PATCH.yHi - PATCH.yLo) / ny;
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
  // The upper and lower halves meet on the mouth line.
  const seam = Math.round((MOUTH_Y - y0) / dy), ww = MOUTH_W * L.w;
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
  const mq = facePoint(c, 0, MOUTH_Y), mpt = mq.p, mnrm = mq.n, R = MOUTH_W * 0.765 * L.w;
  // The cavity covers the whole opening in the skin (plus a margin), so the open mouth never shows through to
  // the inside of the head. (The prototype's was sized to the lips, narrower than the opening.)
  const hc = facePoint(c, 0, (MOUTH_HOLE.yLo + MOUTH_HOLE.yHi) / 2);
  parts.push({
    name: "mouthCavity", mat: "mouthCavity", node: ROOT, surface: "sheet",
    geo: ellGeo(MOUTH_HOLE.x + 0.04, (MOUTH_HOLE.yHi - MOUTH_HOLE.yLo) / 2 + 0.04, 0.13, 16, c.lod, hc.p.clone().addScaledVector(hc.n, -0.14)),
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
