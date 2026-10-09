// The water park (a 2×2 landmark): a big lagoon pool, a landing pool and a kids' pool, two
// slide towers with stairs, two or three twisting slides (open half-pipes you can ride down),
// loungers and umbrellas, a snack kiosk, palms, and people splashing about in rubber rings.
// The slides' paths are pure maths from the tile, so the city draws them, and the slide ride
// follows exactly the same curve.

import * as THREE from "three";
import type { Tile } from "@/lib/city/layout";
import { Kit, shadeHex } from "./kit";

type BoxFn = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry?: number, mesh?: string, tilt?: number) => void;

export type Slide = { name: string; color: number; points: THREE.Vector3[]; curve: THREE.CatmullRomCurve3; pool: { x: number; z: number; y: number } };

const SLIDE_COLORS = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xda77f2, 0xff922b];
const TOWERS = [
  { x: 1.15, z: -0.2, h: 0.85, roof: 0xff6b6b },
  { x: 0.2, z: -0.25, h: 0.6, roof: 0x4dabf7 },
];
const POOLS = {
  lagoon: { x: 0.05, z: 1.0, w: 0.95, d: 0.7 },
  landing: { x: 1.05, z: 1.05, w: 0.6, d: 0.55 },
  kids: { x: 0.62, z: 0.2, r: 0.17 },
};
const WATER_Y = 0.1;

/** The slides of the water park whose corner tile is t (city coordinates). */
export function waterparkSlides(t: Tile, parkName: string): Slide[] {
  const X = t.x;
  const Z = t.z;
  const out: Slide[] = [];
  const p = (x: number, y: number, z: number) => new THREE.Vector3(X + x, y, Z + z);
  // The Twister: one and a half turns round a helix, then down into the landing pool.
  {
    const pts = [p(1.15, TOWERS[0].h + 0.1, -0.08)];
    const cx = 1.05;
    const cz = 0.35;
    const a0 = Math.atan2(-0.43, 0.1);
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * Math.PI * 3;
      pts.push(p(cx + Math.cos(a) * 0.25, TOWERS[0].h + 0.06 - (i / n) * 0.6, cz + Math.sin(a) * 0.25));
    }
    pts.push(p(1.02, 0.2, 0.78), p(1.05, 0.13, 0.95), p(1.06, WATER_Y + 0.01, 1.08));
    out.push({ name: "The Twister", color: SLIDE_COLORS[0], points: pts, curve: new THREE.CatmullRomCurve3(pts, false, "centripetal"), pool: { x: X + 1.06, z: Z + 1.12, y: WATER_Y } });
  }
  // Wave Rider: big S-bends from the smaller tower into the lagoon.
  {
    const h = TOWERS[1].h + 0.1;
    const pts = [p(0.2, h, -0.12), p(0.36, h - 0.07, 0.04), p(0.58, h - 0.15, 0.16), p(0.64, h - 0.23, 0.36), p(0.5, h - 0.31, 0.5), p(0.33, h - 0.39, 0.6), p(0.24, 0.15, 0.73), p(0.2, WATER_Y + 0.01, 0.88)];
    out.push({ name: "Wave Rider", color: SLIDE_COLORS[1], points: pts, curve: new THREE.CatmullRomCurve3(pts, false, "centripetal"), pool: { x: X + 0.18, z: Z + 0.98, y: WATER_Y } });
  }
  // Free Fall: a steep, bumpy drop off the other side (bigger parks only).
  if (t.r[1] > 0.35) {
    const h = TOWERS[1].h + 0.1;
    const pts = [p(0.08, h, -0.28), p(-0.12, h - 0.05, -0.3), p(-0.3, h - 0.2, -0.2), p(-0.4, h - 0.28, 0.0), p(-0.42, h - 0.4, 0.22), p(-0.38, 0.17, 0.45), p(-0.3, WATER_Y + 0.01, 0.74)];
    out.push({ name: "Free Fall", color: SLIDE_COLORS[2], points: pts, curve: new THREE.CatmullRomCurve3(pts, false, "centripetal"), pool: { x: X - 0.28, z: Z + 0.86, y: WATER_Y } });
  }
  for (const s of out) s.name = `${s.name} · ${parkName}`;
  return out;
}

/** The park's fixed parts (pools, towers, stairs, loungers...), drawn with the city's shapes. */
export function waterparkParts(t: Tile, B: BoxFn, tree: (dx: number, dz: number, size: number, v: number) => void) {
  const { lagoon, landing, kids } = POOLS;
  // Pools: a white rim, blue tiles, the water.
  for (const pl of [lagoon, landing]) {
    B(pl.x, 0.06, pl.z, pl.w + 0.08, 0.05, pl.d + 0.08, 0xf8f9fa);
    B(pl.x, 0.075, pl.z, pl.w, 0.02, pl.d, 0x6fd0f2, 0, "water");
    // Deeper water down the middle.
    B(pl.x, 0.0955, pl.z, pl.w * 0.7, 0.001, pl.d * 0.6, 0x2f9fd8, 0, "paint");
    // Lane ropes in the lagoon.
    if (pl === lagoon) for (let k = 1; k < 3; k++) B(pl.x - pl.w / 2 + (k * pl.w) / 3, 0.097, pl.z, 0.012, 0.006, pl.d, 0xff6b6b, 0, "paint");
  }
  B(kids.x, 0.06, kids.z, kids.r * 2 + 0.06, 0.05, kids.r * 2 + 0.06, 0xf8f9fa, 0, "disc");
  B(kids.x, 0.075, kids.z, kids.r * 2, 0.02, kids.r * 2, 0x66d9e8, 0, "waterDisc");
  // A mushroom fountain in the kids' pool.
  B(kids.x, 0.09, kids.z, 0.03, 0.12, 0.03, 0xffd43b, 0, "cyl");
  B(kids.x, 0.2, kids.z, 0.14, 0.06, 0.14, 0xff6b6b, 0, "dome");
  // Slide towers: four legs, a platform with a canopy, and a zig-zag of stairs.
  for (const tw of TOWERS) {
    for (const [lx, lz] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) B(tw.x + lx, 0.08, tw.z + lz, 0.3, tw.h - 0.08, 0.3, 0xdee2e6, 0, "trunk");
    B(tw.x, tw.h, tw.z, 0.24, 0.025, 0.24, 0x868e96);
    for (const [rx, rz, rw, rd] of [[0, -0.12, 0.24, 0.01], [-0.12, 0, 0.01, 0.24], [0.12, 0, 0.01, 0.24]] as const) B(tw.x + rx, tw.h + 0.025, tw.z + rz, rw, 0.05, rd, 0xf1f3f5);
    for (const [px, pz] of [[-0.11, -0.11], [0.11, -0.11], [-0.11, 0.11], [0.11, 0.11]]) B(tw.x + px, tw.h, tw.z + pz, 0.012, 0.16, 0.012, 0xf1f3f5);
    B(tw.x, tw.h + 0.16, tw.z, 0.38 / Math.SQRT2, 0.12, 0.38 / Math.SQRT2, tw.roof, 0, "roof");
    const flights = Math.max(2, Math.round(tw.h / 0.22));
    for (let f = 0; f < flights; f++) {
      const y0 = 0.08 + (f * (tw.h - 0.08)) / flights;
      const y1 = 0.08 + ((f + 1) * (tw.h - 0.08)) / flights;
      const side = f % 2 ? 1 : -1;
      const len = 0.24;
      const tilt = Math.atan2(y1 - y0, len);
      B(tw.x + side * 0.03, (y0 + y1) / 2 - 0.006, tw.z - 0.17, Math.hypot(len, y1 - y0), 0.012, 0.07, 0xadb5bd, 0, "building", side * tilt);
      B(tw.x - side * 0.13, y1 - 0.006, tw.z - 0.17, 0.06, 0.012, 0.07, 0xadb5bd);
    }
  }
  // Loungers and umbrellas along the edges.
  const towel = [0x4dabf7, 0xffd43b, 0xff6b6b, 0x69db7c, 0xf783ac];
  for (let k = 0; k < 6; k++) {
    const lx = -0.38 + k * 0.17;
    B(lx, 0.08, 1.43, 0.07, 0.025, 0.12, 0xf8f9fa);
    B(lx, 0.105, 1.45, 0.06, 0.006, 0.09, towel[k % towel.length], 0, "paint");
    if (k % 2 === 0) {
      B(lx + 0.085, 0.08, 1.43, 0.012, 0.2, 0.012, 0xf1f3f5, 0, "trunk");
      B(lx + 0.085, 0.24, 1.43, 0.15, 0.06, 0.15, towel[(k + 2) % towel.length], 0, "cone");
    }
  }
  for (let k = 0; k < 4; k++) {
    const lz = 0.25 + k * 0.14;
    B(1.42, 0.08, lz, 0.12, 0.025, 0.07, 0xf8f9fa);
    B(1.44, 0.105, lz, 0.09, 0.006, 0.06, towel[(k + 1) % towel.length], 0, "paint");
  }
  // Snack kiosk with a striped roof.
  B(-0.3, 0.08, -0.36, 0.2, 0.12, 0.14, 0xf8f9fa);
  B(-0.3, 0.2, -0.36, 0.24, 0.02, 0.18, 0xff6b6b);
  B(-0.3, 0.22, -0.36, 0.24, 0.01, 0.06, 0xffffff, 0, "paint");
  // Palms (a tall trunk and a flat crown).
  for (const [px, pz, v] of [[-0.42, 0.62, 0.2], [0.62, 1.42, 0.6], [1.42, 0.9, 0.4], [-0.44, -0.08, 0.8]]) {
    B(px, 0.08, pz, 0.35, 0.45, 0.35, 0x9c7a54, 0, "trunk");
    B(px, 0.48, pz, 0.32, 0.12, 0.32, 0x4f9a5e, v * 6, "crown");
  }
  void tree;
  // Legs under the slides.
  for (const s of waterparkSlides(t, "")) {
    const L = s.curve.getLength();
    const n = Math.floor(L / 0.2);
    const pt = new THREE.Vector3();
    for (let k = 1; k < n; k++) {
      s.curve.getPointAt(k / n, pt);
      if (pt.y < 0.18) continue;
      const near = TOWERS.some((tw) => Math.hypot(pt.x - t.x - tw.x, pt.z - t.z - tw.z) < 0.15);
      if (near) continue;
      B(pt.x - t.x, 0.08, pt.z - t.z, 0.2, pt.y - 0.1, 0.2, 0xdee2e6, 0, "trunk");
    }
  }
}

/** An open half-pipe along a curve: radius r, n steps; points scaled by k about `origin`. */
function troughGeometry(curve: THREE.CatmullRomCurve3, r: number, n: number, k = 1, origin = new THREE.Vector3(), color = 0xff6b6b) {
  const M = 12;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const tg = new THREE.Vector3();
  const side = new THREE.Vector3();
  const down = new THREE.Vector3();
  const upV = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color(color);
  const stripe = new THREE.Color(shadeHex(color, -0.45));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, tg);
    side.crossVectors(tg, upV).normalize();
    down.crossVectors(side, tg).normalize().negate();
    // The bottom of the trough is the curve; the walls rise to either side.
    for (let j = 0; j <= M; j++) {
      const a = -1.45 + (j / M) * 2.9;
      const x = (p.x - origin.x) * k + (side.x * Math.sin(a) - down.x * (1 - Math.cos(a))) * r;
      const y = (p.y - origin.y) * k + (side.y * Math.sin(a) - down.y * (1 - Math.cos(a))) * r;
      const z = (p.z - origin.z) * k + (side.z * Math.sin(a) - down.z * (1 - Math.cos(a))) * r;
      pos.push(x, y, z);
      const s = j === 0 || j === M ? stripe : c;
      col.push(s.r, s.g, s.b);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      const b = a + M + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A thin ribbon of running water along the bottom of a slide. */
function waterRibbon(curve: THREE.CatmullRomCurve3, w: number, lift: number, n: number, k = 1, origin = new THREE.Vector3()) {
  const pos: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const tg = new THREE.Vector3();
  const side = new THREE.Vector3();
  const upV = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, tg);
    side.crossVectors(tg, upV).normalize().multiplyScalar(w / 2);
    for (const sgn of [-1, 1]) pos.push((p.x - origin.x) * k + side.x * sgn, (p.y - origin.y) * k + lift + side.y * sgn, (p.z - origin.z) * k + side.z * sgn);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** The moving parts of a water park: the slides themselves and people splashing in the pools. */
export function createWaterpark(t: Tile, parkName: string) {
  const group = new THREE.Group();
  const slides = waterparkSlides(t, parkName);
  const slideMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const waterMat = new THREE.MeshBasicMaterial({ color: 0xa5e3ff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const geos: THREE.BufferGeometry[] = [];
  for (const s of slides) {
    const g = troughGeometry(s.curve, 0.05, Math.ceil(s.curve.getLength() * 40), 1, undefined, s.color);
    geos.push(g);
    const m = new THREE.Mesh(g, slideMat);
    m.castShadow = true;
    group.add(m);
    const w = waterRibbon(s.curve, 0.045, 0.004, Math.ceil(s.curve.getLength() * 30));
    geos.push(w);
    group.add(new THREE.Mesh(w, waterMat));
  }
  // People in the pools: heads bobbing, some in rubber rings.
  const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a1e, 0xffdbac];
  const RINGS = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xf783ac];
  const swimmers: { x: number; z: number; ph: number; r: number; ring: boolean }[] = [];
  const add = (cx: number, cz: number, w: number, d: number, n: number) => {
    for (let k = 0; k < n; k++) swimmers.push({ x: t.x + cx + (((k * 0.618) % 1) - 0.5) * w * 0.8, z: t.z + cz + (((k * 0.382 + 0.3) % 1) - 0.5) * d * 0.8, ph: k * 1.7, r: 0.04 + (k % 3) * 0.02, ring: k % 3 !== 1 });
  };
  add(POOLS.lagoon.x, POOLS.lagoon.z, POOLS.lagoon.w, POOLS.lagoon.d, 9);
  add(POOLS.landing.x, POOLS.landing.z, POOLS.landing.w, POOLS.landing.d, 3);
  add(POOLS.kids.x, POOLS.kids.z, 0.3, 0.3, 3);
  const headGeo = new THREE.SphereGeometry(0.016, 8, 6);
  const ringGeo = new THREE.TorusGeometry(0.024, 0.009, 6, 14).rotateX(Math.PI / 2);
  const splashGeo = new THREE.RingGeometry(0.02, 0.03, 14).rotateX(-Math.PI / 2);
  const fill = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const splashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
  const heads = new THREE.InstancedMesh(headGeo, fill, swimmers.length);
  const rings = new THREE.InstancedMesh(ringGeo, fill, swimmers.length);
  const splashes = new THREE.InstancedMesh(splashGeo, splashMat, swimmers.length);
  const color = new THREE.Color();
  swimmers.forEach((s, k) => {
    heads.setColorAt(k, color.setHex(SKIN[k % SKIN.length]));
    rings.setColorAt(k, color.setHex(RINGS[k % RINGS.length]));
  });
  for (const m of [heads, rings, splashes]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    group.add(m);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  function update(time: number) {
    swimmers.forEach((s, k) => {
      const t2 = time * 0.9 + s.ph;
      const x = s.x + Math.sin(t2 * 0.3) * s.r;
      const z = s.z + Math.cos(t2 * 0.23) * s.r;
      const bob = Math.sin(t2 * 2.2) * 0.006;
      m4.compose(v.set(x, WATER_Y + 0.02 + bob, z), q, sc.set(1, 1, 1));
      heads.setMatrixAt(k, m4);
      m4.compose(v.set(x, WATER_Y + 0.005 + bob * 0.5, z), q, s.ring ? sc.set(1, 1, 1) : sc.set(0.0001, 0.0001, 0.0001));
      rings.setMatrixAt(k, m4);
      const f = (t2 * 0.7) % 1;
      m4.compose(v.set(x, WATER_Y + 0.003, z), q, sc.setScalar(0.5 + f * 2));
      splashes.setMatrixAt(k, m4);
    });
    heads.instanceMatrix.needsUpdate = rings.instanceMatrix.needsUpdate = splashes.instanceMatrix.needsUpdate = true;
    splashMat.opacity = 0.45;
  }
  return {
    group,
    slides,
    update,
    dispose() {
      for (const g of geos) g.dispose();
      for (const g of [headGeo, ringGeo, splashGeo]) g.dispose();
      for (const m of [slideMat, waterMat, fill, splashMat]) m.dispose();
      for (const m of [heads, rings, splashes]) m.dispose();
      group.removeFromParent();
    },
  };
}

export type Waterpark = ReturnType<typeof createWaterpark>;

/**
 * The slide you ride down, in metres round its start (the city view draws it over the city so
 * it stays crisp up close): the trough, the running water, the top platform, and the splash.
 */
export function createSlideRide(slide: Slide) {
  const group = new THREE.Group();
  const origin = slide.points[0].clone();
  const K = 10;
  const trough = troughGeometry(slide.curve, 0.55, Math.ceil(slide.curve.getLength() * 90), K, origin, slide.color);
  const water = waterRibbon(slide.curve, 0.5, 0.06, Math.ceil(slide.curve.getLength() * 60), K, origin);
  const troughMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true });
  const waterMat = new THREE.MeshBasicMaterial({ color: 0xc5f6fa, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(trough, troughMat), new THREE.Mesh(water, waterMat));
  // The platform at the top: boards, rails, a sign.
  const k = new Kit();
  const tg = slide.curve.getTangentAt(0).setY(0).normalize();
  const yaw = Math.atan2(tg.x, tg.z);
  k.at(0, -0.06, 0, yaw, () => {
    k.box(0, -0.1, -1.0, 2.4, 0.1, 2.0, 0x9aa1a8);
    for (const sx of [-1.15, 1.15]) {
      k.box(sx, 0, -1.0, 0.06, 1.05, 2.0, 0xf1f3f5);
      k.box(sx, 1.0, -1.0, 0.1, 0.06, 2.0, 0xffd43b);
    }
    k.box(0, 0, -2.0, 2.4, 1.05, 0.06, 0xf1f3f5);
    k.box(0, 2.6, -1.0, 2.8, 0.12, 2.4, shadeHex(slide.color, 0.1));
  });
  const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true });
  const deck = k.build({ solid: solidMat });
  group.add(deck);
  // The splash at the bottom: drops flying up and out.
  const end = slide.points[slide.points.length - 1].clone().sub(origin).multiplyScalar(K);
  const dropGeo = new THREE.SphereGeometry(0.06, 6, 5);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xe7f5ff, transparent: true, opacity: 0.9, depthWrite: false });
  const drops = new THREE.InstancedMesh(dropGeo, dropMat, 40);
  drops.frustumCulled = false;
  drops.visible = false;
  group.add(drops);
  const vel = Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2 + Math.sin(i * 7.1);
    const sp = 1.2 + ((i * 0.37) % 1) * 2.2;
    return [Math.cos(a) * sp, 2.5 + ((i * 0.61) % 1) * 3.5, Math.sin(a) * sp];
  });
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9ec5d6, 1.5);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.2);
  sun.position.set(-3, 8, 2);
  group.add(hemi, sun);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const mats: THREE.Material[] = [troughMat, waterMat, solidMat, dropMat];
  const base = new Map(mats.map((m) => [m, m.opacity]));
  let alpha = 1;
  return {
    group,
    origin,
    /** Splash drops, `t` seconds after hitting the water (negative: none). */
    splash(t: number) {
      drops.visible = t >= 0 && t < 1.6;
      if (!drops.visible) return;
      for (let i = 0; i < vel.length; i++) {
        const [vx, vy, vz] = vel[i];
        m4.compose(v.set(end.x + vx * t, end.y + vy * t - 4.9 * t * t, end.z + vz * t), q, s.setScalar(Math.max(0.0001, 1 - t / 1.6)));
        drops.setMatrixAt(i, m4);
      }
      drops.instanceMatrix.needsUpdate = true;
    },
    setNight(n: number) {
      hemi.intensity = 1.5 - 0.9 * n;
      sun.intensity = 1.2 * (1 - n) + 0.1;
    },
    setAlpha(a: number) {
      if (a === alpha) return;
      alpha = a;
      for (const m of mats) m.opacity = (base.get(m) ?? 1) * a;
      group.visible = a > 0.002;
    },
    dispose() {
      for (const g of [trough, water, dropGeo]) g.dispose();
      deck.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      drops.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

export type SlideRide = ReturnType<typeof createSlideRide>;
