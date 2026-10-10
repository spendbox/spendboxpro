// Jewellery on the body: wristwatches and neck chains. (Earrings and piercings are with the ears.)

import { BufferGeometry, CatmullRomCurve3, CircleGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, Object3D, Quaternion, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from "three";
import type { Torso } from "./body.ts";
import { CHAINS, type Outfit } from "./catalog.ts";
import { PI } from "./math.ts";
import { type Part, ellGeo } from "./parts.ts";

type Add = (name: string, node: string, geo: BufferGeometry, mat: Part["mat"], surface?: Part["surface"]) => void;

/** Joins geometries into one (fewer draw calls for chains made of many links). */
function merge(list: BufferGeometry[]) {
  let nv = 0, ni = 0;
  for (const g of list) {
    nv += g.attributes.position.count;
    ni += g.index!.count;
  }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), I = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    P.set(g.attributes.position.array as Float32Array, ov * 3);
    N.set(g.attributes.normal.array as Float32Array, ov * 3);
    const ix = g.index!.array;
    for (let k = 0; k < ix.length; k++) I[oi + k] = ix[k] + ov;
    ov += g.attributes.position.count;
    oi += ix.length;
  }
  const m = new BufferGeometry();
  m.setAttribute("position", new Float32BufferAttribute(P, 3));
  m.setAttribute("normal", new Float32BufferAttribute(N, 3));
  m.setIndex(Array.from(I));
  return m;
}

/** A wristwatch on the wrist (in the hand node's frame). at: the arm's thickness. */
export function watch(add: Add, node: string, index: number, at: number, lod: number) {
  if (!index) return;
  const n = Math.round(20 * lod);
  add("watchBand", node, new TorusGeometry(1, 0.13, Math.max(4, Math.round(6 * lod)), n).rotateX(PI / 2).scale(0.215 * at + 0.03, 1, 0.31 * at + 0.03).translate(0, 0.42, 0), "watchBand", "closed");
  add("watchCase", node, new CylinderGeometry(0.19, 0.19, 0.08, n).rotateZ(PI / 2).translate(0.215 * at + 0.06, 0.42, 0), "watchCase", "closed");
  add("watchFace", node, new CircleGeometry(0.155, n).rotateY(PI / 2).translate(0.215 * at + 0.105, 0.42, 0), "watchFace", "sheet");
}

/** A neck chain: rests on the trapezius close to the neck, then falls onto the chest. */
export function chain(add: Add, T: Torso, index: number, O: Outfit, lod: number) {
  if (!index) return;
  const C = CHAINS[index], off = O.suit ? 0.12 : 0.07, r = C.r ?? 0.03;
  /** The chain's path round the neck, and the body's outward direction under each point. */
  const path = (drop: number) => {
    const pts: Vector3[] = [], nor: Vector3[] = [], o2 = off + r + 0.02;
    for (let k = 0; k < 72; k++) {
      const th = (k / 72) * PI * 2, c = Math.cos(th), f = Math.pow(Math.max(0, c), 1.25);
      const y = -1.48 - drop * f - 0.06 * (1 - Math.abs(c)), rx = 0.74 + 0.62 * drop * f * (1 - 0.5 * f) + 0.12 * (1 - Math.abs(c));
      // The widest point of the body at this height (angle thM): the chain passes it at the sides, so
      // the front and back halves meet there without a jump.
      let M = 0, thM = PI / 2;
      for (let a = PI / 2 - 0.5; a <= PI / 2 + 0.5; a += 0.05) {
        const x = T.P(y, a, o2).x;
        if (x > M) [M, thM] = [x, a];
      }
      const sn = Math.abs(Math.sin(th)), w = sn ** 6, tx = (w * M + (1 - w) * Math.min(rx * sn, M)) * 0.999;
      // Find the angle where the body is tx out to the side (x only grows towards thM, then shrinks).
      let lo = c >= 0 ? 0 : thM, hi = c >= 0 ? thM : PI;
      for (let it = 0; it < 22; it++) {
        const m = (lo + hi) / 2, px = T.P(y, m, o2).x;
        if (c >= 0 ? px < tx : px > tx) lo = m;
        else hi = m;
      }
      if (Math.sin(th) < 0) [lo, hi] = [-lo, -hi];
      const p = T.P(y, (lo + hi) / 2, o2);
      if (c > 0) p.z = Math.max(p.z, T.P(y + 0.45, (lo + hi) / 2, o2).z - 0.1);
      pts.push(p);
      nor.push(T.N(y, (lo + hi) / 2, o2));
    }
    const cv = new CatmullRomCurve3(pts, true);
    return Object.assign(cv, { normalAt: (t: number) => nor[Math.round(t * nor.length) % nor.length] });
  };
  const drops = C.layer ? [C.drop!, C.drop! + 0.55, C.drop! + 1.05] : [C.drop!];
  drops.forEach((dp, i) => {
    const cv = path(dp);
    if (C.big && lod >= 1) {
      // Cuban links, flat and alternating; iced: a stone on every other link.
      const n = Math.round(cv.getLength() / (r * 1.55)), L = new TorusGeometry(r * 0.95, r * 0.42, lod < 1 ? 3 : 4, lod < 1 ? 6 : 8), links: BufferGeometry[] = [], stones: BufferGeometry[] = [];
      const o = new Object3D(), SG = new SphereGeometry(r * 0.35, lod < 1 ? 4 : 5, lod < 1 ? 2 : 3);
      for (let k = 0; k < n; k++) {
        // Each link lies flat on the body (its thin side along the body's outward direction);
        // every other link is turned on edge, as in a real curb chain.
        const t = k / n, tan = cv.getTangentAt(t).normalize(), out = cv.normalAt(t).clone();
        out.addScaledVector(tan, -out.dot(tan)).normalize();
        const side = new Vector3().crossVectors(out, tan);
        o.position.copy(cv.getPointAt(t));
        o.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(tan, side, out));
        o.rotateX(k % 2 ? PI / 2 : 0);
        o.scale.set(1.25, k % 2 ? 0.8 : 1, 0.55);
        o.updateMatrix();
        links.push(L.clone().applyMatrix4(o.matrix));
        if (C.iced && k % 2 === 0) {
          o.quaternion.identity();
          o.scale.set(1, 1, 1);
          o.updateMatrix();
          stones.push(SG.clone().applyMatrix4(o.matrix));
        }
      }
      add(`chain${i}`, "chest", merge(links), "chainMetal", "closed");
      if (stones.length) add(`chainStones${i}`, "chest", merge(stones), "iced", "closed");
    } else {
      // Plain chains, and chunky ones seen from a distance: a smooth rope.
      add(`chain${i}`, "chest", new TubeGeometry(cv, Math.round(100 * lod), C.big ? r * 0.75 : r, lod < 1 ? 4 : 5, true), C.iced ? "iced" : "chainMetal", "closed");
    }
  });
  if (C.pend) {
    // Medallion with a stone, hung from a bail at the bottom of the chain, resting flat on the chest
    // (tilted to the chest's slope, so it lies on a bust rather than sinking into it).
    const p = path(C.drop!).getPointAt(0), R = 0.26, cy = p.y - 0.06 - R;
    const n = T.N(cy, 0, off), at = T.P(cy, 0, off + 0.05);
    at.z = Math.max(at.z, p.z - 0.05);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(0, n.y, Math.abs(n.z)).normalize());
    const disc = new CylinderGeometry(R, R, 0.06, Math.round(24 * lod)).rotateX(PI / 2).applyQuaternion(q).translate(at.x, at.y, at.z);
    add("pendant", "chest", disc, "medal", "closed");
    const face = new Vector3(0, 0, 0.04).applyQuaternion(q);
    add("pendantGem", "chest", ellGeo(0.1, 0.1, 0.045, 12, 1, at.clone().add(face)), "gem", "closed");
    add("pendantBail", "chest", new TorusGeometry(0.06, 0.022, 6, 12).translate(p.x, p.y - 0.03, p.z), "chainMetal", "closed");
  }
}
