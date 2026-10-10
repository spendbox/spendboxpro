// Jewellery on the body: wristwatches and neck chains. (Earrings and piercings are with the ears.)

import { BufferGeometry, CatmullRomCurve3, CircleGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, Object3D, Quaternion, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from "three";
import { CHAINS } from "./catalog.ts";
import { type Dress, neckLine } from "./clothing.ts";
import { PI } from "./math.ts";
import { type Part, ellGeo } from "./parts.ts";

type Add = (name: string, node: string, geo: BufferGeometry, mat: Part["mat"], surface?: Part["surface"]) => void;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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

/**
 * A neck chain, where a real one rests: at the back just below the neck (over the bony bump at its
 * base), at the sides on the slope from the neck to the shoulders, close to the neck, then falling
 * over the collarbones to the breastbone at the front. It follows the measured line where the neck
 * meets the body or clothes, so it fits every build and neckline.
 */
export function chain(d: Dress, index: number) {
  if (!index) return;
  const { add, T, O, lod } = d, C = CHAINS[index], r = C.r ?? 0.03;
  // The neck line round the body (measured once, at 36 angles), and the chain's height just below it.
  // It lies right on the cloth (or skin); over a suit, on the lapels.
  const clothOff = O.sl === "none" || O.swim ? 0 : 0.02, off = O.suit ? 0.1 : clothOff + 0.025, line: number[] = [];
  for (let k = 0; k <= 36; k++) line.push(neckLine(d, (k / 36) * PI * 2, clothOff)?.y ?? -1.5);
  // Where it rests at each angle: a set distance across the surface from the neck line (measured
  // along the body, so on the near-flat slope to the shoulders it stays close to the neck).
  const rest: number[] = line.map((y0, k) => {
    const th = (k / 36) * PI * 2, p0 = T.P(y0, th, clothOff);
    let y = y0;
    while (y > y0 - 0.6 && T.P(y, th, clothOff).distanceTo(p0) < 0.09 + r) y -= 0.01;
    return y;
  });
  const base = (th: number) => {
    const u = ((((th / (PI * 2)) % 1) + 1) % 1) * 36, k = Math.floor(u);
    return lerp(rest[k], rest[k + 1], u - k);
  };
  /** The chain's path round the neck, and the body's outward direction under each point. */
  const path = (drop: number) => {
    const pts: Vector3[] = [], nor: Vector3[] = [], o2 = off + r;
    for (let k = 0; k < 72; k++) {
      const th = (k / 72) * PI * 2, c = Math.cos(th), f = Math.pow(Math.max(0, c), 1.25);
      // Width at the side of the neck: just outside the neck line there.
      const y = base(th) - drop * f, side = T.P(base(PI / 2), PI / 2, o2).x, rx = side + 0.62 * drop * f * (1 - 0.5 * f);
      let a = th;
      if (c > 0) {
        // At the front the chain hangs in a U narrower than the chest: find the angle where the body is
        // tx out to the side (x grows from the middle to the side, reaching the same point as the
        // back half at the side, so the two halves meet smoothly).
        const s = Math.sin(th), q = Math.abs(s), xs = T.P(y, PI / 2, o2).x, tx = Math.min(rx * q, xs);
        let lo = 0, hi = PI / 2;
        for (let it = 0; it < 22; it++) {
          const m = (lo + hi) / 2;
          if (T.P(y, m, o2).x < tx) lo = m;
          else hi = m;
        }
        a = Math.sign(s) * (lo + hi) / 2;
      }
      const p = T.P(y, a, o2);
      if (c > 0) p.z = Math.max(p.z, T.P(y + 0.45, a, o2).z - 0.1);
      pts.push(p);
      nor.push(T.N(y, a, o2));
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
      add(`chain${i}`, "chest", new TubeGeometry(cv, Math.round((lod < 1 ? 50 : 100) * lod), C.big ? r * 0.75 : r, lod < 1 ? 4 : 5, true), C.iced ? "iced" : "chainMetal", "closed");
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
