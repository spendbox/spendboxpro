// Shape checks shared by the avatar tests: broken numbers, inside-out surfaces, and layers that sit
// so close to the surface underneath that they would flicker (z-fighting).

import { Box3, type BufferAttribute, type BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import type { Model, Part } from "../parts.ts";

/** Names of every attribute (including blend shapes) holding a NaN or infinity. */
export function nonFinite(m: Model): string[] {
  const bad: string[] = [];
  for (const p of m.parts) {
    const g = p.geo;
    const all: [string, BufferAttribute][] = Object.entries(g.attributes) as [string, BufferAttribute][];
    for (const [k, list] of Object.entries(g.morphAttributes)) (list as BufferAttribute[]).forEach((a, i) => all.push([`${k}[${i}]`, a]));
    for (const [name, a] of all) {
      for (let i = 0; i < a.array.length; i++) {
        if (!Number.isFinite(a.array[i])) {
          bad.push(`${p.name}.${name}`);
          break;
        }
      }
    }
    for (const n of m.nodes) if (!n.matrix.every(Number.isFinite)) bad.push(`node ${n.id}`);
  }
  return bad;
}

const v = () => new Vector3();

/** Positions with blend shape k applied at full strength (or the base shape when k is undefined). */
export function morphed(g: BufferGeometry, k?: number): BufferAttribute {
  const base = g.attributes.position as BufferAttribute;
  if (k === undefined) return base;
  const d = (g.morphAttributes.position as BufferAttribute[])[k], out = base.clone();
  for (let i = 0; i < out.array.length; i++) out.array[i] += d.array[i];
  return out;
}

/**
 * Share of triangles (ignoring slivers) whose winding agrees with their vertex normals. A triangle
 * that disagrees is lit as if facing the other way: it shows as a dark patch, or vanishes when the
 * renderer skips back faces.
 */
export function windingAgreement(g: BufferGeometry): number {
  const P = g.attributes.position as BufferAttribute, N = g.attributes.normal as BufferAttribute, I = g.index!.array;
  const a = v(), b = v(), c = v(), n = v(), vn = v(), t = v();
  let agree = 0, total = 0;
  for (let i = 0; i < I.length; i += 3) {
    a.fromBufferAttribute(P, I[i]);
    b.fromBufferAttribute(P, I[i + 1]).sub(a);
    c.fromBufferAttribute(P, I[i + 2]).sub(a);
    n.crossVectors(b, c);
    if (n.lengthSq() < 1e-14) continue;
    vn.set(0, 0, 0);
    for (let k = 0; k < 3; k++) vn.add(t.fromBufferAttribute(N, I[i + k]));
    total++;
    if (n.dot(vn) > 0) agree++;
  }
  return total ? agree / total : 1;
}

/** Signed volume around the part's own centre: positive when the surface is wound to face outward. */
export function signedVolume(g: BufferGeometry): number {
  const P = g.attributes.position as BufferAttribute, I = g.index ? g.index.array : [...Array(P.count).keys()];
  const ctr = new Box3().setFromBufferAttribute(P).getCenter(v()), a = v(), b = v(), c = v();
  let vol = 0;
  for (let i = 0; i < I.length; i += 3) {
    a.fromBufferAttribute(P, I[i]).sub(ctr);
    b.fromBufferAttribute(P, I[i + 1]).sub(ctr);
    c.fromBufferAttribute(P, I[i + 2]).sub(ctr);
    vol += a.dot(b.cross(c)) / 6;
  }
  return vol;
}

/**
 * For sampled vertices of a layer, how far each sits outside the surfaces underneath, measured along
 * the ray from `from` through the vertex. Vertices with nothing underneath (over a hole) are skipped.
 */
export function layerGaps(layer: BufferAttribute, under: Part[], from: Vector3, samples = 300): number[] {
  const meshes = under.map((p) => new Mesh(p.geo, new MeshBasicMaterial({ side: DoubleSide })));
  const ray = new Raycaster(), p = v(), dir = v(), gaps: number[] = [];
  const step = Math.max(1, Math.floor(layer.count / samples));
  for (let i = 0; i < layer.count; i += step) {
    p.fromBufferAttribute(layer, i);
    dir.subVectors(p, from);
    const dist = dir.length();
    ray.set(from, dir.normalize());
    ray.far = dist + 0.05;
    const hits = ray.intersectObjects(meshes, false);
    if (!hits.length) continue;
    // The skin layer nearest the vertex is the one that matters.
    let best = Infinity;
    for (const h of hits) if (Math.abs(dist - h.distance) < Math.abs(best)) best = dist - h.distance;
    gaps.push(best);
  }
  return gaps;
}

export const part = (m: Model, name: string) => {
  const p = m.parts.find((x) => x.name === name);
  if (!p) throw new Error(`no part named ${name}`);
  return p;
};
