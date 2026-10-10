// Ears, earrings and piercings.
// Each ear is a sculpted relief laid out like a real ear: helix rim and crus, Y-shaped antihelix,
// concha bowl, tragus, antitragus and a soft lobe, with a closed back that meets the head.

import { Color, Quaternion, TorusGeometry, Vector3 } from "three";
import { SKINS } from "./catalog.ts";
import { type HeadCtx, deform, facePoint } from "./head-shape.ts";
import { PI, bell, res, resEven, segDist, smooth } from "./math.ts";
import { type Part, ROOT, ellGeo, geoFrom, rodGeo } from "./parts.ts";

/** Antihelix, inferior crus and helix crus as polylines in the ear's own (u, v) layout. */
const EAR_AH = [[0.06, -0.5], [-0.2, -0.44], [-0.4, -0.22], [-0.46, 0.06], [-0.38, 0.34], [-0.2, 0.56], [-0.02, 0.66]] as const;
const EAR_IC = [[-0.38, 0.34], [-0.12, 0.4], [0.2, 0.3]] as const;
const EAR_HC = [[0.58, 0.34], [0.38, 0.22], [0.14, 0.1]] as const;

function buildEar(c: HeadCtx, s: number) {
  const A = facePoint(c, s * 0.97, -0.08, -0.2), n = A.n.clone(), sc = c.fem ? 0.9 : 1;
  // eb points up the ear, ea points from the back of the ear towards the face.
  const eb = new Vector3(0, 1, -0.3).normalize();
  eb.addScaledVector(n, -eb.dot(n)).normalize();
  const ea = new Vector3().crossVectors(n, eb).multiplyScalar(s).normalize();
  const ca = 0.13 * sc, cb = 0.22 * sc;
  // Outline radius by angle: narrower towards the front-bottom (where the lobe tucks in).
  const R = (th: number) => {
    const co = Math.cos(th), sn = Math.sin(th);
    return 1 - 0.3 * smooth((co - 0.15) / 0.6) * (1 - smooth((-sn - 0.4) / 0.4));
  };
  const ab = (u: number, v: number): [number, number] => {
    let a = u * ca;
    const b = v * cb;
    if (b < 0) a *= 1 - 0.3 * Math.pow(-v, 2);
    a -= 0.035 * sc * v;
    return [a, b];
  };
  const base = (u: number, v: number) => 0.002 + 0.12 * sc * Math.pow(smooth((0.7 - u) / 1.25), 1.15) * (1 - 0.35 * smooth((-v - 0.55) / 0.3));
  // Relief height above the head at (u, v); rr is the normalised distance from the ear centre.
  const H = (u: number, v: number, rr: number) => {
    const lob = smooth((-v - 0.55) / 0.25), fr = smooth((u - 0.35) / 0.3);
    let z = base(u, v);
    z += 0.03 * sc * bell((rr - 0.9) / 0.065) * (1 - fr * 0.8) * (1 - 0.6 * lob);
    z -= 0.03 * sc * smooth((rr - 0.965) / 0.035) * (1 - 0.5 * lob);
    z += 0.022 * sc * bell(segDist(u, v, EAR_HC) / 0.07) * smooth((rr - 0.3) / 0.2);
    z += 0.026 * sc * bell(segDist(u, v, EAR_AH) / 0.085) * (1 - lob) + 0.017 * sc * bell(segDist(u, v, EAR_IC) / 0.07);
    z -= 0.06 * sc * smooth(1 - Math.hypot(u - 0.12, v + 0.1) / 0.42);
    z -= 0.025 * sc * bell(Math.hypot(u - 0.3, v + 0.08) / 0.1);
    z -= 0.02 * sc * bell(Math.hypot(u + 0.1, v - 0.5) / 0.13);
    z += 0.035 * sc * bell(Math.hypot(u - 0.58, v + 0.12) / 0.1) + 0.025 * sc * bell(Math.hypot(u - 0.08, v + 0.47) / 0.09);
    return z;
  };
  const toUV = (r: number, th: number): [number, number] => {
    const k = r * R(th);
    return [k * Math.cos(th), k * Math.sin(th)];
  };
  // Project a point onto the head surface (a few fixed-point steps of "which direction lands here").
  const surf = (q: Vector3) => {
    const qd = q.clone().normalize(), w = qd.clone();
    for (let i = 0; i < 4; i++) {
      const d = deform(c, w).normalize();
      w.add(qd.clone().sub(d)).normalize();
    }
    return deform(c, w);
  };
  const P3 = (u: number, v: number, z: number) => {
    const [a, b] = ab(u, v);
    return surf(A.p.clone().addScaledVector(ea, a).addScaledVector(eb, b)).addScaledVector(n, z);
  };
  const rrOf = (u: number, v: number) => Math.hypot(u, v) / R(Math.atan2(v, u));
  const at = (u: number, v: number, off = 0) => P3(u, v, H(u, v, rrOf(u, v)) + off);
  const rim = (th: number, off = 0) => {
    const [u, v] = toUV(0.95, th);
    return P3(u, v, H(u, v, 0.95) + off);
  };

  const NR = res(18, c.lod), NT = resEven(52, c.lod), pos: number[] = [], cols: number[] = [], idx: number[] = [];
  const skin = new Color(SKINS[c.recipe.skin].c), rimCol = new Color("#9A4A3C");
  for (const back of [0, 1]) {
    for (let j = 0; j <= NR; j++) {
      for (let i = 0; i <= NT; i++) {
        const r = j / NR, th = (i / NT) * PI * 2 - PI / 2, [u, v] = toUV(r, th);
        let z: number, col: Color;
        if (!back) {
          z = H(u, v, r);
          const dep = Math.max(0, base(u, v) - z);
          col = skin.clone().multiplyScalar(Math.max(0.45, 1 - dep * 9));
          if (r > 0.86) col.lerp(rimCol, 0.08);
        } else {
          const [ue, ve] = toUV(1, th);
          z = H(ue, ve, 1) * r * r - 0.05 * (1 - r * r) - 0.012 * r * (1 - r);
          col = skin.clone().multiplyScalar(0.92);
        }
        const p = P3(u, v, z);
        pos.push(p.x, p.y, p.z);
        cols.push(col.r, col.g, col.b);
      }
    }
  }
  const W = NT + 1, off = (NR + 1) * W;
  for (const back of [0, 1]) {
    for (let j = 0; j < NR; j++) {
      for (let i = 0; i < NT; i++) {
        const a = back * off + j * W + i, b = a + 1, cc = a + W, d = cc + 1;
        if ((back === 0) === (s > 0)) idx.push(a, b, d, a, d, cc);
        else idx.push(a, d, b, a, cc, d);
      }
    }
  }
  return { geo: geoFrom(pos, idx, undefined, cols), at, rim, ea, eb };
}

export function ears(c: HeadCtx): Part[] {
  const r = c.recipe;
  if (r.hw === 6) return []; // hijab covers the ears
  const parts: Part[] = [];
  const Z = new Vector3(0, 0, 1);
  [-1, 1].forEach((s, i) => {
    const ear = buildEar(c, s);
    parts.push({ name: `ear${i}`, mat: "earVC", node: ROOT, geo: ear.geo, surface: "sheet" });
    let k = 0;
    const jewel = (name: string, geo: Part["geo"]) => parts.push({ name: `${name}${i}_${k++}`, mat: "gold", node: ROOT, geo, surface: "closed" });
    const stud = (p: Vector3, rad: number) => jewel("stud", ellGeo(rad, rad, rad, 10, c.lod, p));
    const lobe = ear.at(0.04, -0.8, 0.012);
    if (r.ear === 1) stud(lobe, 0.024);
    if (r.ear === 2) {
      const p = lobe.clone().addScaledVector(ear.eb, -0.05);
      jewel("hoop", new TorusGeometry(0.06, 0.01, 8, 28).applyQuaternion(new Quaternion().setFromUnitVectors(Z, ear.ea)).translate(p.x, p.y, p.z));
    }
    if (r.ear === 3) {
      stud(lobe, 0.02);
      const dp = lobe.clone().addScaledVector(ear.eb, -0.1);
      jewel("drop", ellGeo(0.035, 0.05, 0.035, 14, c.lod, dp));
      jewel("dropWire", rodGeo(lobe, dp, 0.005));
    }
    const ring = (th: number) => {
      const p = ear.rim(th), tg = ear.rim(th + 0.05).sub(ear.rim(th - 0.05)).normalize();
      jewel("ring", new TorusGeometry(0.03, 0.006, 6, 20).applyQuaternion(new Quaternion().setFromUnitVectors(Z, tg)).translate(p.x, p.y, p.z));
    };
    const P = r.pierce;
    if (P === 1 || P === 5 || P === 6) {
      ring(1.95);
      if (P === 6) ring(2.3);
    }
    if (P === 2 || P === 5 || P === 6) stud(ear.at(0.6, -0.1, 0.02), 0.016);
    if (P === 3 || P === 6) stud(ear.at(-0.16, -0.72, 0.012), 0.016);
    if (P === 4 || P === 6) stud(ear.at(0.02, -0.12, 0.012), 0.017);
  });
  return parts;
}
