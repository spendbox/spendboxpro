// Eyes (eyeball, iris, cornea, catchlight), eyelids, brows and glasses.
// The eyelids are one skin surface per eye that wraps over the eyeball and melts into the face;
// blinking and squinting are blend shapes on it. Each eyeball sits in its own node so it can look
// around; the brows sit in one node so they can be raised and lowered.

import {
  CatmullRomCurve3, CircleGeometry, Color, Float32BufferAttribute, Matrix4, Object3D, Quaternion, SphereGeometry, TorusGeometry, TubeGeometry, Vector3,
} from "three";
import { BROWS, EYES, NOSES, SKINS } from "./catalog.ts";
import { noseShape } from "./face.ts";
import { type HeadCtx, deform, facePoint } from "./head-shape.ts";
import { PI, clamp01, res, resEven, smax, smooth } from "./math.ts";
import { type Node, type Part, ROOT, ellGeo, geoFrom, rodGeo, setMorphs } from "./parts.ts";

type Eye = (typeof EYES)[number] & { depth?: number };

/** Eyelid blend shapes, in order: fully closed, squint (lids narrow), wide (lids open further). */
export const LID_MORPHS = ["blink", "squint", "wide"] as const;

/** White of the eye, shaded darker under the upper lid and towards the back. */
function scleraGeo(r: number, lod: number) {
  const g = new SphereGeometry(r, res(22, lod), res(14, lod)), p = g.attributes.position, c: number[] = [], base = new Color("#ECE4DA");
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / r, z = p.getZ(i) / r;
    const k = Math.max(0.25, 1 - 0.42 * smooth((y + 0.1) / 0.75) - 0.35 * (1 - clamp01(z * 1.2)));
    c.push(base.r * k, base.g * k, base.b * k);
  }
  g.setAttribute("color", new Float32BufferAttribute(c, 3));
  return g;
}

/** One eye's lids: a skin surface from the lid edge out to the face, with the lash line along the edge. */
function lidGeo(c: HeadCtx, s: number, E: Eye, C: Vector3, r: number) {
  const F = c.F, N = NOSES[c.recipe.nose], skin = new Color(SKINS[c.recipe.skin].c);
  const ex = s * 0.34, ey = 0.06, K = res(14, c.lod), PHI = resEven(48, c.lod);
  const aw = r * 1.08 * E.sx, hu = r * (0.8 - 1.1 * E.a), hl = r * (0.78 - 1.1 * E.b);
  const ct = Math.cos(s * E.tilt), st = Math.sin(s * E.tilt);
  // Lid opening per blend state: open, closed, squint, wide.
  const SH = [{ hu, hl }, { hu: -0.98 * hl, hl }, { hu: hu * 0.85, hl: hl * 0.45 }, { hu: hu * 1.4, hl: hl * 1.15 }];
  type Shape = (typeof SH)[number];
  const face = (x: number, y: number) => {
    const d = deform(c, new Vector3(x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y)))).multiplyScalar(1.0035);
    d.z += noseShape(N, x, y).h;
    return d;
  };
  const lidR = (t: number) => r * 1.006 + 0.017 * (1 - Math.exp(-((t / 0.03) ** 2)));
  // ph goes around the eye opening; t goes from the lid edge (0) out to where the lid meets the face (1).
  const P = (ph: number, t: number, sh: Shape) => {
    const co = Math.cos(ph), sn = Math.sin(ph), lx = aw * co, ly = (sn >= 0 ? sh.hu : sh.hl) * sn;
    const ax = ex + (lx * ct - ly * st) / F.w, ay = ey + (lx * st + ly * ct) / F.h, ox = ex + 0.34 * co, oy = ey + 0.015 + 0.25 * sn;
    const v = face(ax + (ox - ax) * t, ay + (oy - ay) * t).sub(C), dface = v.length(), m = Math.min(dface, r * 1.006);
    return C.clone().addScaledVector(v.normalize(), smax(m + (dface - m) * smooth(t / 0.07), lidR(t), 0.02));
  };
  const T = (k: number) => Math.pow(k / K, 1.9);
  const nrm = (ph: number, t: number, sh: Shape) => {
    const a = P(ph + 0.01, t, sh).sub(P(ph - 0.01, t, sh)), t0 = Math.max(0, t - 0.01), t1 = Math.min(1, t + 0.01);
    const b = P(ph, t1, sh).sub(P(ph, t0, sh)), n = b.cross(a).normalize();
    if (n.dot(P(ph, t, sh).sub(C)) < 0) n.negate();
    return n;
  };
  const build = (sh: Shape) => {
    const pos: number[] = [], nor: number[] = [];
    for (let k = 0; k <= K; k++) {
      for (let i = 0; i <= PHI; i++) {
        const ph = (i / PHI) * PI * 2, t = T(k), p = P(ph, t, sh), n = nrm(ph, t, sh);
        pos.push(p.x, p.y, p.z);
        nor.push(n.x, n.y, n.z);
      }
    }
    // Lash strip: a thin fringe along the lid edge, longer on the upper lid.
    for (const tip of [0, 1]) {
      for (let i = 0; i <= PHI; i++) {
        const ph = (i / PHI) * PI * 2, sn = Math.sin(ph), e0 = P(ph, 0, sh), od = P(ph, 0.05, sh).sub(e0).normalize();
        const fw = e0.clone().sub(C).normalize();
        const len = sn >= 0 ? 0.002 + 0.011 * Math.pow(sn, 0.6) : 0.0005 + 0.003 * Math.pow(-sn, 0.6);
        const q = tip ? e0.clone().addScaledVector(od, len * 0.8).addScaledVector(fw, len * 0.6) : e0.clone().addScaledVector(fw, 0.0015);
        pos.push(q.x, q.y, q.z);
        nor.push(fw.x, fw.y, fw.z);
      }
    }
    return { pos, nor };
  };
  const B = SH.map(build), W = PHI + 1, cols: number[] = [], idx: number[] = [];
  const margin = skin.clone().multiplyScalar(0.5).lerp(new Color("#6B2F2A"), 0.25), lash = new Color("#0D0806");
  for (let k = 0; k <= K; k++) {
    for (let i = 0; i <= PHI; i++) {
      const up = Math.sin((i / PHI) * PI * 2) > 0;
      const col = k === 0 ? (up ? margin.clone().multiplyScalar(0.8) : margin) : k === 1 ? skin.clone().multiplyScalar(up ? 0.86 : 0.9) : skin;
      cols.push(col.r, col.g, col.b);
    }
  }
  for (let i = 0; i < 2 * W; i++) cols.push(lash.r, lash.g, lash.b);
  for (let k = 0; k < K; k++) {
    for (let i = 0; i < PHI; i++) {
      const a = k * W + i, b = a + 1, cc = a + W, d = cc + 1;
      idx.push(a, d, b, a, cc, d);
    }
  }
  const L0 = (K + 1) * W;
  for (let i = 0; i < PHI; i++) {
    const a = L0 + i, b = a + 1, cc = a + W, d = cc + 1;
    idx.push(a, d, b, a, cc, d);
  }
  const geo = geoFrom(B[0].pos, idx, B[0].nor, cols);
  setMorphs(geo, B.slice(1).map((b) => b.pos), B.slice(1).map((b) => b.nor));
  const inner = P(s > 0 ? PI : 0, 0, SH[0]);
  return { geo, inner };
}

const nodeMatrix = (o: Object3D) => {
  o.updateMatrix();
  return o.matrix.toArray();
};

export function eyes(c: HeadCtx): { nodes: Node[]; parts: Part[] } {
  const E: Eye = EYES[c.recipe.eye], er = 0.118 * E.s;
  const nodes: Node[] = [], parts: Part[] = [];
  [-1, 1].forEach((s, i) => {
    const { p, n } = facePoint(c, s * 0.34, 0.06), C = p.clone().addScaledVector(n, -(er * 0.62 + (E.depth || 0)));
    // The eye node faces almost straight ahead (slightly outward, as real eyes do).
    const o = new Object3D();
    o.position.copy(C);
    o.lookAt(C.clone().add(new Vector3(s * 0.05, 0, 1).normalize()));
    const eye = `eye${i}`, ball = `eyeball${i}`;
    nodes.push({ id: eye, parent: ROOT, matrix: nodeMatrix(o) }, { id: ball, parent: eye, matrix: new Matrix4().toArray() });
    parts.push({ name: `sclera${i}`, mat: "sclera", node: ball, geo: scleraGeo(er, c.lod), surface: "closed" });
    const cap = (r: number, w: number, h: number, theta: number) => new SphereGeometry(r, w, h, 0, PI * 2, 0, theta).rotateX(PI / 2);
    parts.push({ name: `iris${i}`, mat: "iris", node: ball, geo: cap(er * 1.004, res(28, c.lod), 6, 0.55), surface: "sheet" });
    parts.push({ name: `cornea${i}`, mat: "cornea", node: ball, geo: cap(er * 1.014, 20, 5, 0.62), surface: "sheet" });
    const cd = new Vector3(0.3, 0.36, 0.88).normalize();
    const cl = new CircleGeometry(er * 0.085, 12).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), cd));
    cl.translate(cd.x * er * 1.02, cd.y * er * 1.02, cd.z * er * 1.02);
    parts.push({ name: `catchlight${i}`, mat: "catchlight", node: eye, geo: cl, surface: "sheet" });
    const lid = lidGeo(c, s, E, C, er);
    parts.push({ name: `lids${i}`, mat: "lidVC", node: ROOT, geo: lid.geo, morphs: [...LID_MORPHS], surface: "sheet" });
    parts.push({
      name: `caruncle${i}`, mat: "caruncle", node: ROOT, surface: "closed",
      geo: ellGeo(er * 0.16, er * 0.12, er * 0.1, 10, c.lod, lid.inner.clone().lerp(C, 0.08)),
    });
  });
  return { nodes, parts };
}

/** Brows: a tapered tube laid along the brow line, flattened against the skin. */
export function brows(c: HeadCtx): { nodes: Node[]; parts: Part[] } {
  const B = BROWS[c.recipe.brow], parts: Part[] = [];
  // Flattening keeps 40% of the tube's depth, so lift thick brows clear of the skin (the prototype's fixed
  // 0.012 lift let bushy brows sink into the forehead, where they flicker against it).
  const lift = Math.max(0.012, 0.4 * B.th + 0.004);
  [-1, 1].forEach((s, i) => {
    const pts: Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, x = B.x0 + (B.x1 - B.x0) * t;
      const y = B.yb + B.rise * t + B.h * (t < B.p ? Math.sin(((t / B.p) * PI) / 2) : 1 - B.drop * ((t - B.p) / (1 - B.p)) ** 2);
      const q = facePoint(c, s * x, y);
      pts.push(q.p.addScaledVector(q.n, lift));
    }
    const cv = new CatmullRomCurve3(pts), g = new TubeGeometry(cv, 24, B.th, 6, false), pa = g.attributes.position;
    const cc = new Vector3(), o = new Vector3(), nn = new Vector3();
    for (let j = 0; j <= 24; j++) {
      const t = j / 24;
      cv.getPointAt(t, cc);
      nn.copy(cc).normalize();
      const f = (1 - (1 - B.tp) * Math.pow(t, 1.2)) * (t < 0.1 ? 0.55 + (0.45 * t) / 0.1 : 1) * (t > 0.94 ? 0.6 : 1);
      for (let k = 0; k <= 6; k++) {
        const ix = j * 7 + k;
        o.fromBufferAttribute(pa, ix).sub(cc);
        const dn = o.dot(nn);
        o.addScaledVector(nn, -dn * 0.6).multiplyScalar(f);
        pa.setXYZ(ix, cc.x + o.x, cc.y + o.y, cc.z + o.z);
      }
    }
    g.computeVertexNormals();
    parts.push({ name: `brow${i}`, mat: "brow", node: "brows", geo: g, surface: "closed" });
  });
  return { nodes: [{ id: "brows", parent: ROOT, matrix: new Matrix4().toArray() }], parts };
}

/** Glasses: round or square rims, temples back to the ears, a bridge, and dark lenses for sunglasses. */
export function glasses(c: HeadCtx): Part[] {
  const kind = c.recipe.glasses;
  if (!kind) return [];
  const parts: Part[] = [];
  [-1, 1].forEach((s, i) => {
    const { p, n } = facePoint(c, s * 0.34, 0.06), fc = p.clone().addScaledVector(n, 0.1).add(new Vector3(0, -0.01, 0));
    const o = new Object3D();
    o.position.copy(fc);
    o.lookAt(fc.clone().add(new Vector3(s * 0.04, 0, 1)));
    o.updateMatrix();
    const rim = kind === 2
      ? new TorusGeometry(0.15, 0.012, 8, 4).rotateZ(PI / 4).scale(1.12, 0.82, 1)
      : new TorusGeometry(0.135, 0.011, 8, 36);
    parts.push({ name: `rim${i}`, mat: "glassesFrame", node: ROOT, geo: rim.applyMatrix4(o.matrix), surface: "closed" });
    if (kind === 3) {
      parts.push({ name: `lens${i}`, mat: "lens", node: ROOT, geo: new CircleGeometry(0.13, 30).applyMatrix4(o.matrix), surface: "sheet" });
    }
    const outer = fc.clone().add(new Vector3(s * 0.14, 0, 0)), earP = facePoint(c, s * 0.97, 0.16, -0.15).p.add(new Vector3(s * 0.03, 0, 0)); // rests on top of the ear
    parts.push({ name: `temple${i}`, mat: "glassesFrame", node: ROOT, geo: rodGeo(outer, earP, 0.01), surface: "closed" });
    if (s === 1) {
      const inR = fc.clone().add(new Vector3(-0.135, 0, 0)), ol = facePoint(c, -0.34, 0.06);
      const fl = ol.p.clone().addScaledVector(ol.n, 0.1).add(new Vector3(0.135, -0.01, 0));
      parts.push({ name: "bridge", mat: "glassesFrame", node: ROOT, geo: rodGeo(inR, fl, 0.01), surface: "closed" });
    }
  });
  return parts;
}
