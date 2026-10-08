// A tiny modelling kit for the insides of buildings, rooftops and the balloon basket: boxes,
// rounded boxes, cylinders, spheres and flat pictures, all in metres, merged into a handful of
// meshes at the end (one per kind of surface), so a whole furnished room is only a few draw
// calls. Colours live in the vertices; things standing on the floor get a soft darkening near
// the ground, which makes them look grounded without real shadows.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type Rng = () => number;

/** A repeatable random number generator from a text key (same key → same numbers). */
export function rngFrom(key: string): Rng {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pickOf = <T,>(rnd: Rng, list: readonly T[]) => list[Math.floor(rnd() * list.length) % list.length];

/** Mix two hex colours (t = 0 → a, 1 → b). */
export function mixHex(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
/** Darker (t > 0) or lighter (t < 0) version of a colour. */
export const shadeHex = (c: number, t: number) => (t >= 0 ? mixHex(c, 0x000000, t) : mixHex(c, 0xffffff, -t));
export const cssHex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** Where a picture sits in the shared picture sheet (texture coordinates). */
export type UvRect = { u0: number; v0: number; u1: number; v1: number };

export type Layer = "solid" | "glow" | "tex" | "texGlow" | "glass" | "foliage";

type Opts = {
  /** Turn about the vertical axis (radians), round the piece's own centre. */
  ry?: number;
  rx?: number;
  rz?: number;
  layer?: Layer;
  /** No darkening near the floor (for things that don't stand on it). */
  noAo?: boolean;
};

/** Every shape is merged without an index (so different shapes can be merged together). */
const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
const unitBox = flat(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
const unitPlane = flat(new THREE.PlaneGeometry(1, 1));
const cylCache = new Map<string, THREE.BufferGeometry>();
const sphereCache = new Map<string, THREE.BufferGeometry>();
const icoCache = new Map<number, THREE.BufferGeometry>();
const roundCache = new Map<string, THREE.BufferGeometry>();
const torusCache = new Map<string, THREE.BufferGeometry>();

function cylGeo(rTop: number, rBot: number, segs: number, open: boolean) {
  const key = `${rTop.toFixed(4)}|${rBot.toFixed(4)}|${segs}|${open}`;
  let g = cylCache.get(key);
  if (!g) {
    // Unit height, radii as given (scaled later only in height).
    g = flat(new THREE.CylinderGeometry(rTop, rBot, 1, segs, 1, open).translate(0, 0.5, 0));
    cylCache.set(key, g);
  }
  return g;
}
function sphereGeo(w: number, h: number, part: number) {
  const key = `${w}|${h}|${part}`;
  let g = sphereCache.get(key);
  if (!g) {
    g = flat(new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI * part));
    sphereCache.set(key, g);
  }
  return g;
}
function icoGeo(detail: number) {
  let g = icoCache.get(detail);
  if (!g) {
    g = flat(new THREE.IcosahedronGeometry(1, detail));
    g.computeVertexNormals();
    icoCache.set(detail, g);
  }
  return g;
}
function roundGeo(w: number, h: number, d: number, r: number) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`;
  let g = roundCache.get(key);
  if (!g) {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    g = flat(new RoundedBoxGeometry(w, h, d, 2, Math.max(0.001, rr)).translate(0, h / 2, 0));
    roundCache.set(key, g);
  }
  return g;
}
function torusGeo(r: number, tube: number, arc: number) {
  const key = `${r}|${tube}|${arc}`;
  let g = torusCache.get(key);
  if (!g) {
    g = flat(new THREE.TorusGeometry(r, tube, 6, 24, arc));
    torusCache.set(key, g);
  }
  return g;
}

/** Free the shared base shapes (when the city view goes away). */
export function disposeKitCaches() {
  for (const c of [cylCache, sphereCache, roundCache, torusCache]) {
    for (const g of c.values()) g.dispose();
    c.clear();
  }
  for (const g of icoCache.values()) g.dispose();
  icoCache.clear();
}

const m = new THREE.Matrix4();
const local = new THREE.Matrix4();
const qq = new THREE.Quaternion();
const ee = new THREE.Euler();
const pv = new THREE.Vector3();
const sv = new THREE.Vector3();
const col = new THREE.Color();

export class Kit {
  private lists: Record<Layer, THREE.BufferGeometry[]> = { solid: [], glow: [], tex: [], texGlow: [], glass: [], foliage: [] };
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  /** Soft round shadows on the floor under things: x, z, width, depth, strength. */
  shadows: { x: number; z: number; w: number; d: number; a: number; y: number }[] = [];
  /** Height above which the floor darkening fades out (metres). */
  aoHeight = 0.35;
  /** The floor height things stand on (for the darkening). */
  floorY = 0;

  /** Draw what fn draws moved to (x, y, z) and turned by ry. */
  at(x: number, y: number, z: number, ry: number, fn: () => void) {
    const top = this.stack[this.stack.length - 1];
    const next = new THREE.Matrix4().multiplyMatrices(top, new THREE.Matrix4().compose(pv.set(x, y, z), qq.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ry), sv.set(1, 1, 1)));
    this.stack.push(next);
    try {
      fn();
    } finally {
      this.stack.pop();
    }
  }

  /** The current position of a local point in room space (for shadows, spots...). */
  world(x: number, y: number, z: number) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.stack[this.stack.length - 1]);
  }
  /** The current turn (yaw) in room space. */
  worldYaw(ry = 0) {
    const e = new THREE.Euler().setFromRotationMatrix(this.stack[this.stack.length - 1], "YXZ");
    return e.y + ry;
  }

  private push(base: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, o: Opts = {}, uv?: UvRect) {
    const g = base.clone();
    ee.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, "YXZ");
    local.compose(pv.set(x, y, z), qq.setFromEuler(ee), sv.set(sx, sy, sz));
    m.multiplyMatrices(this.stack[this.stack.length - 1], local);
    g.applyMatrix4(m);
    const layer = o.layer ?? "solid";
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const n = pos.count;
    const colors = new Float32Array(n * 3);
    col.setHex(color);
    const ao = !o.noAo && (layer === "solid" || layer === "tex" || layer === "foliage");
    for (let k = 0; k < n; k++) {
      let f = 1;
      if (ao) {
        const h = pos.getY(k) - this.floorY;
        if (h < this.aoHeight) f = 0.66 + 0.34 * Math.max(0, h / this.aoHeight);
      }
      colors[k * 3] = col.r * f;
      colors[k * 3 + 1] = col.g * f;
      colors[k * 3 + 2] = col.b * f;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    if (layer === "tex" || layer === "texGlow") {
      const r = uv ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
      const uvs = g.getAttribute("uv") as THREE.BufferAttribute;
      for (let k = 0; k < uvs.count; k++) uvs.setXY(k, r.u0 + uvs.getX(k) * (r.u1 - r.u0), r.v0 + uvs.getY(k) * (r.v1 - r.v0));
    } else g.deleteAttribute("uv");
    this.lists[layer].push(g);
    return g;
  }

  /** A box: centre (x, z), bottom at y, size w × h × d. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: number, o?: Opts) {
    this.push(unitBox, x, y, z, w, h, d, color, o);
  }
  /** A box with rounded edges (cushions, mattresses, soft things). */
  soft(x: number, y: number, z: number, w: number, h: number, d: number, color: number, r = 0.05, o?: Opts) {
    this.push(roundGeo(w, h, d, r), x, y, z, 1, 1, 1, color, o);
  }
  /** A cylinder (or cone, with different radii) standing at (x, y, z). */
  cyl(x: number, y: number, z: number, rTop: number, rBot: number, h: number, color: number, segs = 16, o?: Opts & { open?: boolean }) {
    this.push(cylGeo(rTop, rBot, segs, !!o?.open), x, y, z, 1, h, 1, color, o);
  }
  /** A sphere (or a dome: part 0.5) centred at (x, y, z), squashed by sx/sy/sz. */
  ball(x: number, y: number, z: number, r: number, color: number, o?: Opts & { sx?: number; sy?: number; sz?: number; part?: number; w?: number; h?: number }) {
    this.push(sphereGeo(o?.w ?? 12, o?.h ?? 8, o?.part ?? 1), x, y, z, r * (o?.sx ?? 1), r * (o?.sy ?? 1), r * (o?.sz ?? 1), color, o);
  }
  /** A faceted blob (leaves, bushes). */
  leafy(x: number, y: number, z: number, r: number, color: number, o?: Opts & { sx?: number; sy?: number; sz?: number; detail?: number }) {
    this.push(icoGeo(o?.detail ?? 0), x, y, z, r * (o?.sx ?? 1), r * (o?.sy ?? 1), r * (o?.sz ?? 1), color, { layer: "foliage", ...o });
  }
  ring(x: number, y: number, z: number, r: number, tube: number, color: number, o?: Opts & { arc?: number }) {
    this.push(torusGeo(r, tube, o?.arc ?? Math.PI * 2), x, y, z, 1, 1, 1, color, o);
  }
  /**
   * A flat picture facing +z (turn it with ry), centred at (x, y, z), w × h. From the shared
   * picture sheet when uv is given (layer "tex", or "texGlow" for things that light up).
   */
  quad(x: number, y: number, z: number, w: number, h: number, color: number, o?: Opts, uv?: UvRect) {
    this.push(unitPlane, x, y, z, w, h, 1, color, { noAo: true, ...o }, uv);
  }
  /** A flat thing lying on the floor (rugs, paint, mats), facing up. */
  mat(x: number, y: number, z: number, w: number, d: number, color: number, o?: Opts, uv?: UvRect) {
    this.push(unitPlane, x, y, z, w, d, 1, color, { noAo: true, rx: -Math.PI / 2, ...o }, uv);
  }
  /** A soft shadow on the floor under something (room space, at the current transform). */
  shadow(x: number, z: number, w: number, d: number, a = 0.35) {
    const p = this.world(x, this.floorY, z);
    this.shadows.push({ x: p.x, z: p.z, w, d, a, y: p.y });
  }

  /** Merge everything into meshes, one per layer, using the given materials. */
  build(mats: Partial<Record<Layer, THREE.Material>>) {
    const group = new THREE.Group();
    for (const layer of Object.keys(this.lists) as Layer[]) {
      const list = this.lists[layer];
      if (!list.length || !mats[layer]) continue;
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      if (layer === "foliage") {
        // Faceted leaves: one normal per face.
        merged.computeVertexNormals();
      }
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mats[layer]);
      mesh.name = layer;
      if (layer === "glass") mesh.renderOrder = 2;
      group.add(mesh);
    }
    this.lists = { solid: [], glow: [], tex: [], texGlow: [], glass: [], foliage: [] };
    return group;
  }
}

// ---------------------------------------------------------------- soft round shadows

let blobTex: THREE.CanvasTexture | null = null;
/** A soft dark round blob (black in the middle fading out), for shadows under furniture. */
export function blobTexture() {
  if (blobTex) return blobTex;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const c = canvas.getContext("2d")!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.5, "rgba(0,0,0,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(canvas);
  return blobTex;
}
export function disposeBlobTexture() {
  blobTex?.dispose();
  blobTex = null;
}

/** All the soft shadows of a room as one mesh. */
export function shadowMesh(list: Kit["shadows"]) {
  if (!list.length) return null;
  const geos = list.map((s) => {
    const g = unitPlane.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(pv.set(s.x, s.y + 0.004, s.z), qq.setFromEuler(ee.set(-Math.PI / 2, 0, 0)), sv.set(s.w, s.d, 1)));
    const n = g.getAttribute("position").count;
    const a = new Float32Array(n * 3).fill(s.a);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  // Darkness strength rides in the vertex colour; the material multiplies it into the alpha.
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTexture(), transparent: true, depthWrite: false, opacity: 1 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <color_vertex>", "#include <color_vertex>\n vShadowA = color.r;").replace("void main() {", "varying float vShadowA;\nvoid main() {");
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "varying float vShadowA;\nvoid main() {")
      .replace("#include <alphamap_fragment>", "#include <alphamap_fragment>\n diffuseColor.a *= vShadowA;");
  };
  mat.vertexColors = true;
  mat.customProgramCacheKey = () => "blobshadow";
  const mesh = new THREE.Mesh(merged, mat);
  mesh.renderOrder = 1;
  mesh.name = "shadows";
  return mesh;
}
