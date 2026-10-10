// Levels of detail. Every level shares one skeleton, so every move plays the same way at every level.
// All are real 3D models (sharp at any distance), just with fewer and fewer polygons:
//
//   own       your own avatar          up to 70k triangles, full detail, face moves
//   near      players close by         up to 20k triangles
//   far       players further off      about 2k triangles (at most 3.5k) in ONE mesh: built coarse,
//                                      no fingers, ears, teeth or jewellery, a simple frozen face,
//                                      colours painted on its points instead of materials
//   farthest  players far away         about 900 triangles (at most 1.5k), one mesh: body, hair and clothes only (no
//                                      face, glasses, jewellery, fingers or ears)

import { BufferAttribute, type BufferGeometry, Float32BufferAttribute, Matrix4 } from "three";
import { buildAvatar } from "./avatar.ts";
import type { MatKey, Model, Part } from "./parts.ts";
import type { Recipe } from "./recipe.ts";

export const LOD = { own: 1, near: 0.5, far: 0.17, farthest: 0.05 } as const;
/** Triangle budgets. */
export const FAR_BUDGET = 3500, FARTHEST_BUDGET = 1500;
/** At most this many avatars get the near or far level; everyone else is drawn at the farthest. */
export const MAX_DETAILED = 30;

export type Level = "own" | "near" | "far" | "farthest";

/**
 * Which level each player is drawn at, from their distance to the camera (in avatar heights): near
 * within 4, far within 18, farthest beyond. Only the nearest MAX_DETAILED get near or far.
 */
export function pickLevels(distances: number[], near = 4, far = 18): Level[] {
  const order = distances.map((d, i) => [d, i] as const).sort((a, b) => a[0] - b[0]);
  const out: Level[] = new Array(distances.length);
  order.forEach(([d, i], rank) => {
    out[i] = rank >= MAX_DETAILED || d > far ? "farthest" : d > near ? "far" : "near";
  });
  return out;
}

/** Too small to see from far away, or not wanted there: fingers, ears, teeth, jewellery, small trims. */
const FAR_DROP = /^(cornea|catchlight|caruncle|mouthCavity|teeth|tongue|nail|button|layerButton|jalabButton|beltLoop|stud|ring|hoop|drop|dropWire|chain|pendant|watch|bead|capSeam|fly|backPocket|layerPocket|iris|lids|strap\d|neckBand|hemBand|tieKnot|bowKnot|wrapKnot|hand\d_[1-9]|ear\d|hairBand|capButton|capVisorUnder|waistband|collar|layerCollar)/;
/** The farthest level also has no face (eyes, brows, the face's own surface), glasses, collars or separate strands. */
const FARTHEST_DROP = /^(sclera|brow|faceUpper|faceLower|rim|lens|temple|bridge|collar|braid|loc\d|cornrow|hairBand|capVisorUnder|capButton|swimStrap|yoke|hemBorder|frontEmbroidery|lapel\d|layerCollar|layerEdge|layerHem|placket|sash|pocket|sole|beard|mustache|goatee|stubble)/;
/** See-through materials (a faint shadow of stubble, the clear front of the eye): nothing to paint. */
const SEE_THROUGH = new Set<MatKey>(["stubble", "cornea"]);

/**
 * The far and farthest levels: one skinned mesh. Each point carries matId, an index into meta.palette (the material
 * whose colour the page paints it with), and tint (colours painted on the points, multiplied in).
 */
export function buildFar(r: Recipe, level: "far" | "farthest" = "far"): Model {
  // Also hidden: the tunic under an agbada, and (farthest) the hair under a cap or wrap.
  const m = buildAvatar(r, LOD[level]), covered = (n: string) => (n === "tunic" && r.outfit === 4) || (level === "farthest" && n === "hair0" && r.hw > 0);
  const drop = (n: string) => FAR_DROP.test(n) || (level === "farthest" && FARTHEST_DROP.test(n)) || covered(n), index = new Map(m.nodes.map((n, k) => [n.id, k]));
  // Model-space matrix of every node, for the rigid (head) parts.
  const M = new Map<string, Matrix4>();
  for (const n of m.nodes) M.set(n.id, (n.parent ? M.get(n.parent)!.clone() : new Matrix4()).multiply(new Matrix4().fromArray(n.matrix)));
  const palette: MatKey[] = [], geos: BufferGeometry[] = [];
  for (const p of m.parts) {
    if (drop(p.name) || SEE_THROUGH.has(p.mat)) continue;
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
