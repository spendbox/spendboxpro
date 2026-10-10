// What the builders produce: plain geometry tagged with a material name and the node (moving piece)
// it hangs from. No materials, textures or scene objects, so it can be built in a Web Worker and
// sent to the page as raw arrays (see pack/unpack).

import {
  BufferAttribute, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, Vector3,
} from "three";

/** Names of the materials a part can ask for (made on the page by materials.ts). */
export type MatKey =
  | "skin" | "skinVC" | "earVC" | "lidVC" | "sclera" | "iris" | "cornea" | "catchlight" | "caruncle" | "brow"
  | "mouthCavity" | "teeth" | "tongue" | "gold" | "glassesFrame" | "lens" | "beard" | "stubble" | "hw" | "hwDark" | "hwSheen"
  | "kufi" | "hair" | "hairStrand" | "hairBody" | "hairBodyStrand" | "hairTie" | "wrap"
  | "nail" | "rib" | "top" | "topDS" | "topEdge" | "topEdgeDS" | "trim" | "bottom" | "bottomDark" | "shoe" | "sole" | "shirt" | "tie" | "lapel"
  | "sash" | "collarWhite" | "watchBand" | "watchCase" | "watchFace" | "chainMetal" | "medal" | "iced" | "gem"
  | "jeans" | "jeansDark" | "bottomPat" | "bottomPatDS" | "bottomDS" | "layer" | "layerDS" | "layerTrim" | "layerRib" | "embroid" | "shoeDS";

/** A moving piece of the avatar. Parts hang from nodes; animation moves nodes. */
export type Node = { id: string; parent: string | null; matrix: number[] };

export type Part = {
  name: string;
  mat: MatKey;
  node: string;
  geo: BufferGeometry;
  /** Names of this part's morph targets (blend shapes), in order. */
  morphs?: string[];
  /** Kind of surface, for the shape tests: "closed" shells must face outward; "sheet" is see-through/double-sided. */
  surface: "closed" | "sheet";
  /**
   * Skinned: the geometry is in the avatar's own space and moves with up to four bones per point
   * (attributes skinIndex: positions in Model.nodes, skinWeight). Otherwise it moves rigidly with its node.
   */
  skinned?: boolean;
  /** Hanging cloth that fits close round the legs (a wrapper, a pencil skirt): it follows the legs closely. */
  tight?: boolean;
};

/** meta.faceH: height scale of the chosen face (sizes the jaw drop). floorY: where the feet stand (whole avatars only). */
/** stride: how long a step the outfit allows (1, or less in a narrow long wrapper or pencil skirt). */
export type Model = { nodes: Node[]; parts: Part[]; meta: { faceH: number; floorY?: number; stride?: number } };

export const ROOT = "head";

// ---- small geometry helpers ----

/** A squashed sphere (ellipsoid) baked at a position. */
export function ellGeo(sx: number, sy: number, sz: number, seg: number, lod: number, at?: Vector3) {
  const q = Math.max(6, Math.round(Math.min(seg, 14) * (lod < 1 ? 0.6 : 1)));
  const g = new SphereGeometry(1, q, Math.max(4, Math.round(q * 0.7)));
  g.scale(sx, sy, sz);
  if (at) g.translate(at.x, at.y, at.z);
  return g;
}

const AY = new Vector3(0, 1, 0);
/** A thin rod from a to b. */
export function rodGeo(a: Vector3, b: Vector3, r: number, seg = 8) {
  const d = new Vector3().subVectors(b, a), L = d.length();
  const g = new CylinderGeometry(r, r, L, seg);
  const m = new Matrix4().compose(a.clone().addScaledVector(d, 0.5), new Quaternion().setFromUnitVectors(AY, d.normalize()), new Vector3(1, 1, 1));
  return g.applyMatrix4(m);
}

/** Builds an indexed geometry from flat arrays. */
export function geoFrom(pos: number[], idx: number[], nor?: number[], col?: number[]) {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  if (nor) g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  if (col) g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  if (!nor) g.computeVertexNormals();
  return g;
}

/** Adds relative morph targets (blend shapes) given as absolute positions/normals per state. */
export function setMorphs(g: BufferGeometry, pos: number[][], nor: number[][]) {
  const p0 = g.attributes.position.array, n0 = g.attributes.normal.array;
  g.morphTargetsRelative = true;
  g.morphAttributes.position = pos.map((a) => new Float32BufferAttribute(a.map((v, j) => v - p0[j]), 3));
  g.morphAttributes.normal = nor.map((a) => new Float32BufferAttribute(a.map((v, j) => v - n0[j]), 3));
}

export function triangleCount(m: Model) {
  return m.parts.reduce((n, p) => n + (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3, 0);
}

// ---- sending a model between the worker and the page ----

type PackedAttr = { array: Float32Array; itemSize: number };
export type PackedPart = Omit<Part, "geo"> & {
  attrs: Record<string, PackedAttr>;
  index: Uint32Array | null;
  morphPos?: Float32Array[];
  morphNor?: Float32Array[];
};
export type PackedModel = { nodes: Node[]; parts: PackedPart[]; meta: Model["meta"] };

/** Flattens a model into typed arrays. Returns the buffers so they can be transferred, not copied. */
export function pack(m: Model): { packed: PackedModel; transfer: ArrayBuffer[] } {
  const transfer: ArrayBuffer[] = [];
  const f32 = (a: BufferAttribute) => {
    const arr = new Float32Array(a.array as ArrayLike<number>);
    transfer.push(arr.buffer as ArrayBuffer);
    return arr;
  };
  const parts = m.parts.map(({ geo, ...rest }): PackedPart => {
    const attrs: Record<string, PackedAttr> = {};
    for (const [name, a] of Object.entries(geo.attributes)) attrs[name] = { array: f32(a as BufferAttribute), itemSize: a.itemSize };
    let index: Uint32Array | null = null;
    if (geo.index) {
      index = new Uint32Array(geo.index.array as ArrayLike<number>);
      transfer.push(index.buffer as ArrayBuffer);
    }
    const mp = geo.morphAttributes.position as BufferAttribute[] | undefined;
    const mn = geo.morphAttributes.normal as BufferAttribute[] | undefined;
    return { ...rest, attrs, index, morphPos: mp?.map(f32), morphNor: mn?.map(f32) };
  });
  return { packed: { nodes: m.nodes, parts, meta: m.meta }, transfer };
}

export function unpack(p: PackedModel): Model {
  const parts = p.parts.map(({ attrs, index, morphPos, morphNor, ...rest }): Part => {
    const geo = new BufferGeometry();
    for (const [name, a] of Object.entries(attrs)) geo.setAttribute(name, new BufferAttribute(a.array, a.itemSize));
    if (index) geo.setIndex(new BufferAttribute(index, 1));
    if (morphPos) {
      geo.morphTargetsRelative = true;
      geo.morphAttributes.position = morphPos.map((a) => new BufferAttribute(a, 3));
      if (morphNor) geo.morphAttributes.normal = morphNor.map((a) => new BufferAttribute(a, 3));
    }
    geo.computeBoundingSphere();
    return { ...rest, geo };
  });
  return { nodes: p.nodes, parts, meta: p.meta };
}
