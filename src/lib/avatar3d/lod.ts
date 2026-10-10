// Levels of detail. Every level shares one skeleton, so every move plays the same way at every level.
//
//   own      your own avatar               up to 70k triangles, full detail, face moves
//   near     players close by              up to 20k triangles
//   far      players further off           under 5k triangles in ONE mesh (one draw call): the body
//                                          built coarse, small details dropped, the face frozen,
//                                          colours painted on its points instead of materials
//   picture  players far away (or past the  a flat picture of the avatar (two triangles), drawn from
//            30 nearest)                   the far level from 8 directions and in walking frames
//
// The far level is built here (in the worker); the picture is drawn on the page (impostor.ts).

import { BufferAttribute, type BufferGeometry, Float32BufferAttribute, Matrix4 } from "three";
import { buildAvatar } from "./avatar.ts";
import type { MatKey, Model, Part } from "./parts.ts";
import type { Recipe } from "./recipe.ts";

export const LOD = { own: 1, near: 0.5, far: 0.17 } as const;
/** Far-level triangle budget. */
export const FAR_BUDGET = 5000;
/** At most this many avatars are drawn in 3D; the rest are pictures. */
export const MAX_3D = 30;

export type Level = "own" | "near" | "far" | "picture";

/**
 * Which level each player is drawn at, from their distance to the camera (in avatar heights): near
 * within 4, far within 18, pictures beyond. Only the nearest MAX_3D players are drawn in 3D.
 */
export function pickLevels(distances: number[], near = 4, far = 18): Level[] {
  const order = distances.map((d, i) => [d, i] as const).sort((a, b) => a[0] - b[0]);
  const out: Level[] = new Array(distances.length);
  order.forEach(([d, i], rank) => {
    out[i] = rank >= MAX_3D || d > far ? "picture" : d > near ? "far" : "near";
  });
  return out;
}

/** Too small to see from far away (or only there for the face's movement). */
const DROP = /^(cornea|catchlight|caruncle|mouthCavity|teeth|tongue|nail|button|layerButton|jalabButton|beltLoop|stud|ring|hoop|drop|dropWire|chainStones|bead|capSeam|pendantGem|pendantBail|watchFace|fly|backPocket|layerPocket|iris|lids|strap\d|neckBand|hemBand|tieKnot|bowKnot|wrapKnot|chain[12]$|hand\d_[1-9])/;
/** See-through materials (a faint shadow of stubble, the clear front of the eye): nothing to paint. */
const SEE_THROUGH = new Set<MatKey>(["stubble", "cornea"]);

/**
 * The far level: one skinned mesh. Each point carries matId, an index into meta.palette (the material
 * whose colour the page paints it with), and tint (colours painted on the points, multiplied in).
 */
export function buildFar(r: Recipe): Model {
  const m = buildAvatar(r, LOD.far), index = new Map(m.nodes.map((n, k) => [n.id, k]));
  // Model-space matrix of every node, for the rigid (head) parts.
  const M = new Map<string, Matrix4>();
  for (const n of m.nodes) M.set(n.id, (n.parent ? M.get(n.parent)!.clone() : new Matrix4()).multiply(new Matrix4().fromArray(n.matrix)));
  const palette: MatKey[] = [], geos: BufferGeometry[] = [];
  for (const p of m.parts) {
    if (DROP.test(p.name) || SEE_THROUGH.has(p.mat)) continue;
    let pi = palette.indexOf(p.mat);
    if (pi < 0) pi = palette.push(p.mat) - 1;
    geos.push(asSkinned(p, M, index, pi));
  }
  const geo = merge(geos);
  return {
    nodes: m.nodes,
    parts: [{ name: "far", mat: "farVC", node: "avatar", geo, surface: "sheet", skinned: true }],
    meta: { ...m.meta, palette },
  };
}

/** A part as plain skinned geometry (rigid parts: moved into place and bound wholly to their node). */
function asSkinned(p: Part, M: Map<string, Matrix4>, index: Map<string, number>, matId: number) {
  const g = p.geo.clone(), n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!p.skinned) {
    g.applyMatrix4(M.get(p.node)!);
    const si = new Float32Array(n * 4), sw = new Float32Array(n * 4), b = index.get(p.node)!;
    for (let k = 0; k < n; k++) {
      si[k * 4] = b;
      sw[k * 4] = 1;
    }
    g.setAttribute("skinIndex", new BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new BufferAttribute(sw, 4));
  }
  g.setAttribute("matId", new Float32BufferAttribute(new Float32Array(n).fill(matId), 1));
  // Colours painted on the points (the face's skin tones and lips): kept as a tint on the material's colour.
  const tint = new Float32Array(n * 3).fill(1), col = g.attributes.color;
  if (col) for (let k = 0; k < n; k++) tint.set([col.getX(k), col.getY(k), col.getZ(k)], k * 3);
  g.setAttribute("tint", new Float32BufferAttribute(tint, 3));
  if (!g.index) g.setIndex([...Array(n).keys()]);
  return g;
}

const KEEP = ["position", "normal", "skinIndex", "skinWeight", "matId", "tint"] as const;

/** Joins geometries into one (only the attributes the far level needs). */
function merge(list: BufferGeometry[]) {
  let nv = 0, ni = 0;
  for (const g of list) {
    nv += g.attributes.position.count;
    ni += g.index!.count;
  }
  const out: Record<string, Float32Array> = {}, sizes = { position: 3, normal: 3, skinIndex: 4, skinWeight: 4, matId: 1, tint: 3 };
  for (const k of KEEP) out[k] = new Float32Array(nv * sizes[k]);
  const idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    for (const k of KEEP) out[k].set(g.attributes[k].array as ArrayLike<number>, ov * sizes[k]);
    const I = g.index!.array;
    for (let i = 0; i < I.length; i++) idx[oi + i] = I[i] + ov;
    ov += g.attributes.position.count;
    oi += I.length;
  }
  const geo = list[0].clone();
  for (const name of Object.keys(geo.attributes)) geo.deleteAttribute(name);
  geo.morphAttributes = {};
  for (const k of KEEP) geo.setAttribute(k, new BufferAttribute(out[k], sizes[k]));
  geo.setIndex(new BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}
