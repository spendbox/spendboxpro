// The world events' drawing kit: a handful of shared, pooled, instanced things that every event
// scene draws into, every frame, "immediate mode" (begin → draw everything → end). So however
// many events are on, the extra cost stays a fixed small number of draw calls:
//
//   7 instanced primitives (box, ball, cylinder, cone, torus, and glowing box / ball),
//   2 particle clouds (additive sparks and fire; soft smoke, confetti and hail),
//   3 card layers (pictures from the art sheet, glows, and the always-on-top badges),
//   1 instanced light-beam mesh, plus a few pooled specials (domes, water, a tornado funnel,
//   lightning bolts) only while an event uses them.
//
// Nothing here allocates per frame. The kit also nudges the sky and lights (eclipse, haze,
// lightning flashes) without fighting city-view's own day/night code, and collects tap targets.

import * as THREE from "three";
import type { ArtSheet, UiSheet } from "./art";

export const BOX = 0;
export const BALL = 1;
export const CYL = 2;
export const CONE = 3;
export const TORUS = 4;
export const GBOX = 5;
export const GBALL = 6;
export type Prim = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Card facing: towards the camera, upright but turning to face it, flat on the ground, fixed. */
export const FACE = 0;
export const UPRIGHT = 1;
export const FLAT = 2;
export const FIXED = 3;

/** One piece of a model: a primitive placed, turned and sized in the model's own space. */
export type Part = {
  p: Prim;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /** A colour, or a slot (0..7) filled in by whoever draws the model (k.slot[n]). */
  c: number;
  ry: number;
  rx: number;
  rz: number;
  /** Spins about its own up axis (radians a second): rotors, wheels, lights. */
  spin: number;
  /** Blinks between c and this colour, `hz` times a second (0 = steady). */
  alt: number;
  hz: number;
  /** Swings to and fro about its own x axis (legs, arms, tails): amplitude, speed. */
  swing: number;
  swingHz: number;
  phase: number;
  local: THREE.Matrix4;
};
export type Model = Part[];

type PartOpts = Partial<Pick<Part, "ry" | "rx" | "rz" | "spin" | "alt" | "hz" | "swing" | "swingHz" | "phase">>;

/** Build a model part: P(prim, x, y, z, sx, sy, sz, colour or slot, options). */
export function P(p: Prim, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number, o: PartOpts = {}): Part {
  const part: Part = {
    p,
    x,
    y,
    z,
    sx,
    sy,
    sz,
    c,
    ry: o.ry ?? 0,
    rx: o.rx ?? 0,
    rz: o.rz ?? 0,
    spin: o.spin ?? 0,
    alt: o.alt ?? -1,
    hz: o.hz ?? 0,
    swing: o.swing ?? 0,
    swingHz: o.swingHz ?? 0,
    phase: o.phase ?? 0,
    local: new THREE.Matrix4(),
  };
  part.local.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(part.rx, part.ry, part.rz, "YXZ")),
    new THREE.Vector3(sx, sy, sz),
  );
  return part;
}

/** Slots are small numbers; real colours are big. */
const SLOTS = 8;

const POINT_VERT = /* glsl */ `
attribute vec4 aCol;
attribute float aSize;
uniform float uScale;
varying vec4 vCol;
varying float vSq;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vSq = aSize < 0.0 ? 1.0 : 0.0;
  gl_PointSize = clamp(abs(aSize) * uScale / max(0.05, -mv.z), 0.0, 220.0);
  vCol = aCol;
}`;
const POINT_FRAG = /* glsl */ `
varying vec4 vCol;
varying float vSq;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  float a = vSq > 0.5 ? step(abs(p.x), 0.95) * step(abs(p.y), 0.55) : smoothstep(1.0, 0.0, d) * (0.55 + 0.45 * smoothstep(0.5, 0.0, d));
  if (a * vCol.a < 0.01) discard;
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
  #include <colorspace_fragment>
}`;

const CARD_VERT = /* glsl */ `
attribute vec4 aUv;
attribute float aAlpha;
varying vec2 vUv;
varying float vA;
varying vec3 vC;
void main() {
  vUv = mix(aUv.xy, aUv.zw, uv);
  vA = aAlpha;
  vC = instanceColor;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const CARD_FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying float vA;
varying vec3 vC;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(t.rgb * vC, a);
  #include <colorspace_fragment>
}`;

const BEAM_VERT = /* glsl */ `
attribute float aAlpha;
varying float vA;
varying float vY;
varying float vRim;
varying vec3 vC;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vec3 wn = normalize(mat3(m) * normal);
  vec3 vd = normalize(cameraPosition - wp.xyz);
  vRim = abs(dot(wn, vd));
  vY = uv.y;
  vA = aAlpha;
  vC = instanceColor;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BEAM_FRAG = /* glsl */ `
varying float vA;
varying float vY;
varying float vRim;
varying vec3 vC;
void main() {
  float a = vA * pow(vRim, 1.6) * (1.0 - vY * 0.75);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vC, a);
  #include <colorspace_fragment>
}`;

const DOME_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying vec3 vP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  vUv = uv;
  vP = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const DOME_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uStyle;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
varying vec3 vP;
void main() {
  float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a;
  vec3 c = uColor;
  if (uStyle < 0.5) {
    // A smoky dark bubble: thicker towards its edge.
    a = uAlpha * (0.55 + 0.45 * rim);
  } else if (uStyle < 1.5) {
    // A force field: a hex-ish grid of glowing lines, a bright rim and a slow shimmer.
    vec2 g = vec2(vUv.x * 48.0, vUv.y * 14.0 + vUv.x * 0.0);
    g.x += mod(floor(g.y), 2.0) * 0.5;
    vec2 f = abs(fract(g) - 0.5);
    float line = smoothstep(0.42, 0.5, max(f.x, f.y));
    float wave = 0.5 + 0.5 * sin(vP.y * 9.0 - uTime * 2.5);
    a = uAlpha * (0.12 + rim * 0.7 + line * (0.35 + 0.4 * wave));
    c += vec3(0.25) * line;
  } else {
    // Crackling electricity: bright streaks that race round.
    float s = sin(vUv.x * 80.0 + uTime * 9.0 + sin(vUv.y * 30.0 + uTime * 5.0) * 3.0);
    float bolt = smoothstep(0.93, 1.0, s);
    a = uAlpha * (0.1 + rim * 0.6 + bolt * 0.9);
    c += vec3(0.4) * bolt;
  }
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
  #include <colorspace_fragment>
}`;

const FUNNEL_VERT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vRim;
void main() {
  vUv = uv;
  vec3 p = position;
  // The funnel snakes about: each height is pushed sideways a little.
  float h = uv.y;
  p.x += sin(h * 4.0 + uTime * 1.7) * 0.18 * h;
  p.z += cos(h * 3.0 + uTime * 1.3) * 0.18 * h;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec3 wn = normalize(mat3(modelMatrix) * normal);
  vRim = abs(dot(wn, normalize(cameraPosition - wp.xyz)));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FUNNEL_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
varying float vRim;
void main() {
  float swirl = sin(vUv.x * 6.2832 * 5.0 + vUv.y * 14.0 - uTime * 7.0) * 0.5 + 0.5;
  float streak = sin(vUv.x * 6.2832 * 13.0 - vUv.y * 9.0 - uTime * 11.0) * 0.5 + 0.5;
  float a = uAlpha * (0.35 + 0.4 * swirl + 0.25 * streak) * smoothstep(0.0, 0.08, vUv.y) * (0.45 + 0.55 * vRim);
  vec3 c = uColor * (0.75 + 0.35 * swirl);
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
  #include <colorspace_fragment>
}`;

type Pool = { mesh: THREE.InstancedMesh; mat: Float32Array; col: Float32Array; n: number; max: number };
type CardLayer = { mesh: THREE.InstancedMesh; uv: THREE.InstancedBufferAttribute; alpha: THREE.InstancedBufferAttribute; n: number; max: number };
type Cloud = { pts: THREE.Points; pos: Float32Array; col: Float32Array; size: Float32Array; n: number; max: number; mat: THREE.ShaderMaterial };
type Dome = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial };
type Bolt = { mesh: THREE.Mesh; pos: Float32Array; seed: number; mat: THREE.MeshBasicMaterial };

const BOLT_PTS = 16;

/** Upload only the part of a buffer that was written this frame. */
function touch(attr: THREE.BufferAttribute, count: number) {
  attr.clearUpdateRanges();
  attr.addUpdateRange(0, count);
  attr.needsUpdate = true;
}

/** The kit's view of the city: what it needs from city-view. */
export type KitHost = {
  scene: THREE.Scene;
  parent: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
};

export class Kit {
  readonly group = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  /** Colours for model slots (set before drawing a model). */
  readonly slot = new Array<number>(SLOTS).fill(0xffffff);
  /** 0 by day, 1 at night (glows get stronger). */
  night = 0;
  private host: KitHost;
  private art: ArtSheet;
  private ui: UiSheet;
  private pools: Pool[] = [];
  private cards: CardLayer[] = [];
  private beams: CardLayer;
  private add: Cloud;
  private soft: Cloud;
  private domes: Dome[] = [];
  private domeN = 0;
  private waters: THREE.Mesh[] = [];
  private waterN = 0;
  private funnels: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial }[] = [];
  private funnelN = 0;
  private bolts: Bolt[] = [];
  private boltN = 0;
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  // Scratch (never allocate per frame).
  private m = new THREE.Matrix4();
  private R = new THREE.Matrix4();
  private L = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, "YXZ");
  private col = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);
  private zAxis = new THREE.Vector3(0, 0, 1);
  private dir = new THREE.Vector3();
  private flatQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private size = new THREE.Vector2();
  // Sky and light nudges, gathered over a frame, applied at the end.
  private atm = { dim: 1, sunDim: 1, tint: new THREE.Color(), tintAmt: 0, fog: 1, flash: 0 };
  private wrote = false;
  private base = { hemi: 0, sun: 0, bg: new THREE.Color(), fog: new THREE.Color() };
  private last = { hemi: -1, sun: -1, bg: new THREE.Color(-1, -1, -1), fog: new THREE.Color(-1, -1, -1) };
  private tmpC = new THREE.Color();
  private white = new THREE.Color(0xe8ecff);
  // Tap targets: event id, x, y, z, radius.
  hits = new Float32Array(16 * 5);
  hitN = 0;

  constructor(host: KitHost, art: ArtSheet, ui: UiSheet) {
    this.host = host;
    this.camera = host.camera;
    this.art = art;
    this.ui = ui;
    this.group.name = "world-events";
    host.parent.add(this.group);

    const geos = [
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.SphereGeometry(0.5, 14, 10),
      new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
      new THREE.ConeGeometry(0.5, 1, 12),
      new THREE.TorusGeometry(0.5, 0.12, 8, 24),
    ];
    this.geos.push(...geos);
    const lit = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.mats.push(lit, glow);
    const sizes = [2400, 1600, 900, 600, 160, 500, 700];
    const geoOf = [0, 1, 2, 3, 4, 0, 1];
    for (let p = 0; p < 7; p++) {
      const max = sizes[p];
      const mesh = new THREE.InstancedMesh(geos[geoOf[p]], p >= 5 ? glow : lit, max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = p <= 3;
      mesh.receiveShadow = p === 0;
      mesh.count = 0;
      mesh.visible = false;
      this.group.add(mesh);
      this.pools.push({ mesh, mat: mesh.instanceMatrix.array as Float32Array, col: mesh.instanceColor.array as Float32Array, n: 0, max });
    }

    // Cards: pictures from the art sheet (normal and glowing), and badges on top of everything.
    const plane = new THREE.PlaneGeometry(1, 1);
    this.geos.push(plane);
    const cardMat = (map: THREE.Texture, additive: boolean, onTop: boolean) => {
      const m = new THREE.ShaderMaterial({
        uniforms: { map: { value: map } },
        vertexShader: CARD_VERT,
        fragmentShader: CARD_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: !onTop,
        side: THREE.DoubleSide,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.mats.push(m);
      return m;
    };
    const layer = (geo: THREE.BufferGeometry, mat: THREE.Material, max: number, order: number): CardLayer => {
      const g = geo.clone();
      this.geos.push(g);
      const uv = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
      const alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
      uv.setUsage(THREE.DynamicDrawUsage);
      alpha.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute("aUv", uv);
      g.setAttribute("aAlpha", alpha);
      const mesh = new THREE.InstancedMesh(g, mat, max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      mesh.count = 0;
      mesh.visible = false;
      this.group.add(mesh);
      return { mesh, uv, alpha, n: 0, max };
    };
    this.cards.push(layer(plane, cardMat(art.texture, false, false), 900, 5));
    this.cards.push(layer(plane, cardMat(art.texture, true, false), 900, 6));
    this.cards.push(layer(plane, cardMat(ui.texture, false, true), 24, 11));

    // Light beams: a soft open cone, narrow at the lamp (y = 0), wide at the far end (y = 1).
    const beamGeo = new THREE.CylinderGeometry(1, 0.12, 1, 20, 1, true).translate(0, 0.5, 0);
    this.geos.push(beamGeo);
    const beamMat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mats.push(beamMat);
    this.beams = layer(beamGeo, beamMat, 64, 7);

    const cloud = (max: number, additive: boolean, order: number): Cloud => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(max * 3);
      const col = new Float32Array(max * 4);
      const size = new Float32Array(max);
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute("aCol", new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setDrawRange(0, 0);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 600 } },
        vertexShader: POINT_VERT,
        fragmentShader: POINT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.geos.push(geo);
      this.mats.push(mat);
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = order;
      pts.visible = false;
      this.group.add(pts);
      return { pts, pos, col, size, n: 0, max, mat };
    };
    this.soft = cloud(3200, false, 4);
    this.add = cloud(3200, true, 8);
  }

  // ------------------------------------------------------------------ frame
  begin() {
    for (const p of this.pools) p.n = 0;
    for (const c of this.cards) c.n = 0;
    this.beams.n = 0;
    this.add.n = 0;
    this.soft.n = 0;
    this.domeN = 0;
    this.waterN = 0;
    this.funnelN = 0;
    this.boltN = 0;
    this.hitN = 0;
    const a = this.atm;
    a.dim = 1;
    a.sunDim = 1;
    a.tintAmt = 0;
    a.fog = 1;
    a.flash = 0;
  }

  end(time: number) {
    for (const p of this.pools) {
      const mesh = p.mesh;
      mesh.count = p.n;
      mesh.visible = p.n > 0;
      if (!p.n) continue;
      touch(mesh.instanceMatrix, p.n * 16);
      touch(mesh.instanceColor!, p.n * 3);
    }
    for (let k = 0; k < this.cards.length; k++) this.flushCards(this.cards[k]);
    this.flushCards(this.beams);
    this.host.renderer.getDrawingBufferSize(this.size);
    const scale = this.size.y / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.flushCloud(this.add, scale);
    this.flushCloud(this.soft, scale);
    for (let k = 0; k < this.domes.length; k++) this.domes[k].mesh.visible = k < this.domeN;
    for (let k = 0; k < this.waters.length; k++) this.waters[k].visible = k < this.waterN;
    for (let k = 0; k < this.funnels.length; k++) this.funnels[k].mesh.visible = k < this.funnelN;
    for (let k = 0; k < this.bolts.length; k++) this.bolts[k].mesh.visible = k < this.boltN;
    for (const d of this.domes) d.mat.uniforms.uTime.value = time;
    for (const f of this.funnels) f.mat.uniforms.uTime.value = time;
  }

  private flushCloud(cl: Cloud, scale: number) {
    cl.pts.visible = cl.n > 0;
    cl.mat.uniforms.uScale.value = scale;
    if (!cl.n) return;
    const g = cl.pts.geometry;
    g.setDrawRange(0, cl.n);
    touch(g.attributes.position as THREE.BufferAttribute, cl.n * 3);
    touch(g.attributes.aCol as THREE.BufferAttribute, cl.n * 4);
    touch(g.attributes.aSize as THREE.BufferAttribute, cl.n);
  }

  private flushCards(c: CardLayer) {
    const mesh = c.mesh;
    mesh.count = c.n;
    mesh.visible = c.n > 0;
    if (!c.n) return;
    touch(mesh.instanceMatrix, c.n * 16);
    touch(mesh.instanceColor!, c.n * 3);
    touch(c.uv, c.n * 4);
    touch(c.alpha, c.n);
  }

  /** Hide everything (when the city's street life is hidden) and give the sky back. */
  idle() {
    this.begin();
    this.end(0);
    this.applySky();
  }

  // ------------------------------------------------------------------ primitives
  private write(p: Prim, m: THREE.Matrix4, hex: number) {
    const pool = this.pools[p];
    if (pool.n >= pool.max) return;
    m.toArray(pool.mat, pool.n * 16);
    this.col.setHex(hex);
    const o = pool.n * 3;
    pool.col[o] = this.col.r;
    pool.col[o + 1] = this.col.g;
    pool.col[o + 2] = this.col.b;
    pool.n++;
  }

  /** A primitive in world space: centre, size, turn (yaw, then pitch, then roll), colour. */
  put(p: Prim, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, hex: number, pitch = 0, roll = 0) {
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    this.e.set(pitch, yaw, roll, "YXZ");
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.write(p, this.m, hex);
  }

  /** A stick from one point to another (ropes, poles, ladders, water hoses...). */
  rod(p: Prim, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, thick: number, hex: number) {
    this.dir.set(x1 - x0, y1 - y0, z1 - z0);
    const len = this.dir.length();
    if (len < 1e-4) return;
    this.q.setFromUnitVectors(this.up, this.dir.multiplyScalar(1 / len));
    this.m.compose(this.v.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), this.q, this.s.set(thick, len, thick));
    this.write(p, this.m, hex);
  }

  /** Set where the next model parts go (rput / model): position, turn, uniform size. */
  root(x: number, y: number, z: number, yaw: number, scale: number, pitch = 0, roll = 0) {
    this.e.set(pitch, yaw, roll, "YXZ");
    this.q.setFromEuler(this.e);
    this.R.compose(this.v.set(x, y, z), this.q, this.s.set(scale, scale, scale));
  }

  /** A primitive placed in the current root's space. */
  rput(p: Prim, x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number, ry = 0, rx = 0, rz = 0) {
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    this.e.set(rx, ry, rz, "YXZ");
    this.q.setFromEuler(this.e);
    this.L.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.m.multiplyMatrices(this.R, this.L);
    this.write(p, this.m, hex);
  }

  /** Draw a whole model at the current root (see root), animated to time t. */
  model(def: Model, t: number) {
    for (let i = 0; i < def.length; i++) {
      const part = def[i];
      let hex = part.c < SLOTS ? this.slot[part.c] : part.c;
      if (part.hz > 0 && Math.floor(t * part.hz * 2 + part.phase) % 2 === 1) hex = part.alt < SLOTS ? this.slot[part.alt] : part.alt;
      if (part.spin === 0 && part.swing === 0) {
        this.m.multiplyMatrices(this.R, part.local);
      } else {
        this.e.set(part.rx + (part.swing ? Math.sin(t * part.swingHz * Math.PI * 2 + part.phase) * part.swing : 0), part.ry + part.spin * t, part.rz, "YXZ");
        this.q.setFromEuler(this.e);
        this.L.compose(this.v.set(part.x, part.y, part.z), this.q, this.s.set(part.sx, part.sy, part.sz));
        this.m.multiplyMatrices(this.R, this.L);
      }
      this.write(part.p, this.m, hex);
    }
  }

  /** Where a point in the current root's space ends up (into out). */
  local(x: number, y: number, z: number, out: THREE.Vector3) {
    return out.set(x, y, z).applyMatrix4(this.R);
  }

  // ------------------------------------------------------------------ particles
  private point(cl: Cloud, x: number, y: number, z: number, size: number, hex: number, a: number) {
    if (cl.n >= cl.max || a <= 0.003) return;
    const n = cl.n++;
    cl.pos[n * 3] = x;
    cl.pos[n * 3 + 1] = y;
    cl.pos[n * 3 + 2] = z;
    this.col.setHex(hex);
    cl.col[n * 4] = this.col.r;
    cl.col[n * 4 + 1] = this.col.g;
    cl.col[n * 4 + 2] = this.col.b;
    cl.col[n * 4 + 3] = Math.min(1, a);
    cl.size[n] = size;
  }
  /** A glowing dot (adds light): sparks, flames, fireworks, stars. */
  spark(x: number, y: number, z: number, size: number, hex: number, a: number) {
    this.point(this.add, x, y, z, size, hex, a);
  }
  /** A soft blob: smoke, dust, fog, mist, steam. */
  puff(x: number, y: number, z: number, size: number, hex: number, a: number) {
    this.point(this.soft, x, y, z, size, hex, a);
  }
  /** A little flat bit: confetti, hail, notes, leaves. */
  bit(x: number, y: number, z: number, size: number, hex: number, a: number) {
    this.point(this.soft, x, y, z, -size, hex, a);
  }

  // ------------------------------------------------------------------ cards
  private cardAt(layer: number, rect: Float32Array | readonly number[], hex: number, a: number) {
    const c = this.cards[layer];
    if (c.n >= c.max || a <= 0.003) return -1;
    const n = c.n++;
    const uv = c.uv.array as Float32Array;
    uv[n * 4] = rect[0];
    uv[n * 4 + 1] = rect[1];
    uv[n * 4 + 2] = rect[2];
    uv[n * 4 + 3] = rect[3];
    (c.alpha.array as Float32Array)[n] = a;
    this.col.setHex(hex);
    const ic = c.mesh.instanceColor!.array as Float32Array;
    ic[n * 3] = this.col.r;
    ic[n * 3 + 1] = this.col.g;
    ic[n * 3 + 2] = this.col.b;
    return n;
  }
  private orient(face: number, x: number, z: number, yaw: number, roll: number) {
    const q = this.q;
    if (face === FACE) {
      q.copy(this.camera.quaternion);
      if (roll) q.multiply(this.q2.setFromAxisAngle(this.zAxis, roll));
    } else if (face === UPRIGHT) {
      const a = Math.atan2(this.camera.position.x - x, this.camera.position.z - z);
      this.e.set(0, a, roll, "YXZ");
      q.setFromEuler(this.e);
    } else if (face === FLAT) {
      q.setFromAxisAngle(this.up, yaw).multiply(this.flatQ);
      if (roll) q.multiply(this.q2.setFromAxisAngle(this.zAxis, roll));
    } else {
      this.e.set(roll, yaw, 0, "YXZ");
      q.setFromEuler(this.e);
    }
  }

  /**
   * A picture from the art sheet. layer 0 = normal, 1 = glowing (adds light). face: FACE,
   * UPRIGHT, FLAT or FIXED (FIXED: yaw turns it, roll tips it back).
   */
  card(layer: 0 | 1, cell: string, x: number, y: number, z: number, w: number, h: number, face: number, yaw: number, hex: number, a: number, roll = 0) {
    const n = this.cardAt(layer, this.art.rect(cell), hex, a);
    if (n < 0) return;
    this.orient(face, x, z, yaw, roll);
    this.m.compose(this.v.set(x, y, z), this.q, this.s.set(w, h, 1));
    this.m.toArray(this.cards[layer].mesh.instanceMatrix.array as Float32Array, n * 16);
  }
  /** A soft round glow (adds light), facing the camera. */
  glow(x: number, y: number, z: number, size: number, hex: number, a: number) {
    this.card(1, "glow", x, y, z, size, size, FACE, 0, hex, a);
  }
  /** A picture from the badge sheet, drawn over everything, kept about the same size on screen. */
  badge(cell: number, x: number, y: number, z: number, px: number, a: number) {
    const rect = this.ui.rect(cell);
    const n = this.cardAt(2, rect, 0xffffff, a);
    if (n < 0) return;
    const d = this.camera.position.distanceTo(this.v.set(x, y, z));
    const k = Math.min(3.4, Math.max(0.42, d * 0.052)) * px;
    this.m.compose(this.v.set(x, y, z), this.camera.quaternion, this.s.set(k, k, 1));
    this.m.toArray(this.cards[2].mesh.instanceMatrix.array as Float32Array, n * 16);
  }

  // ------------------------------------------------------------------ beams
  /** A soft beam of light from (x0,y0,z0) (narrow end) to (x1,y1,z1), r = radius at the far end. */
  beam(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, hex: number, a: number) {
    const b = this.beams;
    if (b.n >= b.max || a <= 0.003) return;
    this.dir.set(x1 - x0, y1 - y0, z1 - z0);
    const len = this.dir.length();
    if (len < 1e-3) return;
    const n = b.n++;
    this.q.setFromUnitVectors(this.up, this.dir.multiplyScalar(1 / len));
    this.m.compose(this.v.set(x0, y0, z0), this.q, this.s.set(r, len, r));
    this.m.toArray(b.mesh.instanceMatrix.array as Float32Array, n * 16);
    (b.alpha.array as Float32Array)[n] = a;
    this.col.setHex(hex);
    const ic = b.mesh.instanceColor!.array as Float32Array;
    ic[n * 3] = this.col.r;
    ic[n * 3 + 1] = this.col.g;
    ic[n * 3 + 2] = this.col.b;
  }

  // ------------------------------------------------------------------ pooled specials
  /** A see-through dome: style 0 dark smoke, 1 force field, 2 crackling electricity. */
  dome(x: number, y: number, z: number, rx: number, ry: number, rz: number, hex: number, a: number, style: 0 | 1 | 2) {
    if (a <= 0.003 || this.domeN >= 4) return;
    let d = this.domes[this.domeN];
    if (!d) {
      const geo = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      this.geos.push(geo);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uTime: { value: 0 }, uStyle: { value: 0 } },
        vertexShader: DOME_VERT,
        fragmentShader: DOME_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.mats.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 3;
      this.group.add(mesh);
      d = { mesh, mat };
      this.domes.push(d);
    }
    this.domeN++;
    d.mesh.position.set(x, y, z);
    d.mesh.scale.set(rx, ry, rz);
    const u = d.mat.uniforms;
    (u.uColor.value as THREE.Color).setHex(hex);
    u.uAlpha.value = a;
    u.uStyle.value = style;
    d.mat.blending = style === 0 ? THREE.NormalBlending : THREE.AdditiveBlending;
  }

  /** A flat sheet of shiny water (floods, the harbour, a pond made for the event). */
  water(x: number, y: number, z: number, w: number, d: number, hex: number, a: number, round = false) {
    if (a <= 0.003 || this.waterN >= 3) return;
    let mesh = this.waters[this.waterN];
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshPhongMaterial({ color: 0x4f9fd8, transparent: true, opacity: 0.85, shininess: 90, specular: 0xffffff, depthWrite: false }),
      );
      mesh.userData.disc = new THREE.CircleGeometry(0.5, 40).rotateX(-Math.PI / 2);
      this.geos.push(mesh.geometry, mesh.userData.disc as THREE.BufferGeometry);
      this.mats.push(mesh.material as THREE.Material);
      mesh.userData.box = mesh.geometry;
      mesh.renderOrder = 2;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.waters.push(mesh);
    }
    this.waterN++;
    mesh.geometry = (round ? mesh.userData.disc : mesh.userData.box) as THREE.BufferGeometry;
    mesh.position.set(x, y, z);
    mesh.scale.set(w, 1, d);
    const mat = mesh.material as THREE.MeshPhongMaterial;
    mat.color.setHex(hex);
    mat.opacity = a;
  }

  /** A tornado's funnel: base at (x, y, z), h tall, r wide at the top. */
  funnel(x: number, y: number, z: number, h: number, r: number, hex: number, a: number) {
    if (a <= 0.003 || this.funnelN >= 1) return;
    let f = this.funnels[this.funnelN];
    if (!f) {
      const pts: THREE.Vector2[] = [];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16;
        pts.push(new THREE.Vector2(0.06 + Math.pow(t, 2.2) * 0.94, t));
      }
      const geo = new THREE.LatheGeometry(pts, 28);
      this.geos.push(geo);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } },
        vertexShader: FUNNEL_VERT,
        fragmentShader: FUNNEL_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.mats.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 4;
      this.group.add(mesh);
      f = { mesh, mat };
      this.funnels.push(f);
    }
    this.funnelN++;
    f.mesh.position.set(x, y, z);
    f.mesh.scale.set(r, h, r);
    (f.mat.uniforms.uColor.value as THREE.Color).setHex(hex);
    f.mat.uniforms.uAlpha.value = a;
  }

  /** A jagged lightning bolt from high above down to (x, y, z). Same seed → same shape. */
  bolt(x: number, y: number, z: number, height: number, seed: number, a: number) {
    if (a <= 0.003 || this.boltN >= 2) return;
    let b = this.bolts[this.boltN];
    if (!b) {
      const pos = new Float32Array(BOLT_PTS * 2 * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const idx: number[] = [];
      for (let k = 0; k < BOLT_PTS - 1; k++) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 2, k * 2 + 1, k * 2 + 3);
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ color: 0xf4f1ff, transparent: true, opacity: 0, fog: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      this.geos.push(geo);
      this.mats.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 9;
      this.group.add(mesh);
      b = { mesh, pos, seed: -1, mat };
      this.bolts.push(b);
    }
    this.boltN++;
    b.mat.opacity = Math.min(1, a);
    // Ribbon across the view.
    const cam = this.camera.position;
    const look = Math.atan2(z - cam.z, x - cam.x);
    const px = -Math.sin(look);
    const pz = Math.cos(look);
    const key = seed * 7 + Math.round(look * 10);
    if (b.seed === key) return;
    b.seed = key;
    let s = (seed * 2654435761) >>> 0;
    const rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let bx = x + (rnd() - 0.5) * 2;
    let bz = z + (rnd() - 0.5) * 2;
    for (let k = 0; k < BOLT_PTS; k++) {
      const f = k / (BOLT_PTS - 1);
      const yy = y + height * (1 - f);
      if (k > 0 && k < BOLT_PTS - 1) {
        bx += (rnd() - 0.5) * 0.9 * px + (x - bx) * 0.25;
        bz += (rnd() - 0.5) * 0.9 * pz + (z - bz) * 0.25;
      } else if (k === BOLT_PTS - 1) {
        bx = x;
        bz = z;
      }
      const wd = 0.09 * (1 - f * 0.5);
      const o = k * 6;
      b.pos[o] = bx - px * wd;
      b.pos[o + 1] = yy;
      b.pos[o + 2] = bz - pz * wd;
      b.pos[o + 3] = bx + px * wd;
      b.pos[o + 4] = yy;
      b.pos[o + 5] = bz + pz * wd;
    }
    (b.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    b.mesh.geometry.computeBoundingSphere();
  }

  // ------------------------------------------------------------------ the sky and lights
  /** Dim the daylight (eclipse, blackout...): 1 = untouched, 0 = dark. */
  dim(f: number, sunToo = f) {
    this.atm.dim = Math.min(this.atm.dim, f);
    this.atm.sunDim = Math.min(this.atm.sunDim, sunToo);
  }
  /** Wash the sky and fog with a colour (haze, red alert...). Strongest wins. */
  tint(hex: number, amt: number) {
    if (amt > this.atm.tintAmt) {
      this.atm.tintAmt = Math.min(1, amt);
      this.atm.tint.setHex(hex);
    }
  }
  /** Pull the fog in (1 = untouched, 0.3 = thick). */
  fog(f: number) {
    this.atm.fog = Math.min(this.atm.fog, f);
  }
  /** A flash of light over everything (lightning, explosions). */
  flash(f: number) {
    this.atm.flash = Math.max(this.atm.flash, f);
  }

  /**
   * Apply the sky nudges. City-view writes the lights and sky colour itself (every quarter of
   * a second, and during its own lightning): whenever a value isn't the one we left, that's a
   * new base to work from, so the two never fight or drift.
   */
  applySky() {
    const a = this.atm;
    const active = a.dim < 1 || a.sunDim < 1 || a.tintAmt > 0 || a.fog < 1 || a.flash > 0;
    if (!active && !this.wrote) return;
    const { hemi, sun, scene } = this.host;
    const bg = scene.background instanceof THREE.Color ? scene.background : null;
    const fog = scene.fog instanceof THREE.Fog ? scene.fog : null;
    const B = this.base;
    const W = this.last;
    if (hemi.intensity !== W.hemi) B.hemi = hemi.intensity;
    if (sun.intensity !== W.sun) B.sun = sun.intensity;
    if (bg && !bg.equals(W.bg)) B.bg.copy(bg);
    if (fog && !fog.color.equals(W.fog)) B.fog.copy(fog.color);
    hemi.intensity = B.hemi * a.dim + a.flash * 2.6;
    sun.intensity = B.sun * a.sunDim;
    const paint = (out: THREE.Color, from: THREE.Color) => {
      out.copy(from);
      if (a.tintAmt > 0) out.lerp(a.tint, a.tintAmt);
      if (a.dim < 1) out.multiplyScalar(0.25 + 0.75 * a.dim);
      if (a.flash > 0) out.lerp(this.white, Math.min(1, a.flash * 0.6));
    };
    if (bg) {
      paint(this.tmpC, B.bg);
      bg.copy(this.tmpC);
      W.bg.copy(bg);
    }
    if (fog) {
      paint(this.tmpC, B.fog);
      fog.color.copy(this.tmpC);
      W.fog.copy(fog.color);
      if (a.fog < 1) {
        fog.near *= a.fog;
        fog.far *= 0.35 + 0.65 * a.fog;
      }
    }
    W.hemi = hemi.intensity;
    W.sun = sun.intensity;
    this.wrote = active;
  }

  // ------------------------------------------------------------------ taps
  /** Something tappable this frame (a reward to grab). */
  hit(id: number, x: number, y: number, z: number, r: number) {
    if (this.hitN >= 16) return;
    const o = this.hitN++ * 5;
    this.hits[o] = id;
    this.hits[o + 1] = x;
    this.hits[o + 2] = y;
    this.hits[o + 3] = z;
    this.hits[o + 4] = r;
  }

  dispose() {
    this.host.parent.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const p of this.pools) p.mesh.dispose();
    for (const c of this.cards) c.mesh.dispose();
    this.beams.mesh.dispose();
  }
}
