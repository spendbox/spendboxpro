// The moving people at the sports venues: the players on the pitch or court, the boxers and
// wrestlers in the ring (and their referee), and the crowd in the stands. Built for speed: every
// player is a handful of boxes and balls, all of them drawn with two instanced meshes; the crowd
// is two more. In metres, feet at y = 0 (the caller places and scales them).

import * as THREE from "three";
import type { Rng } from "./kit";

/** One player: where they are, which way they face, and how they're moving (set every frame). */
export type Rig = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Running: legs and arms swing with this phase (radians), as much as `stride` (0..1). */
  phase: number;
  stride: number;
  /** Punches / reaching (0 = arm down, 1 = straight out in front), per arm. */
  reachL: number;
  reachR: number;
  /** Arms raised (cheering, a guard up): 0..1. */
  guard: number;
  /** Leaning forward (radians); lying flat on the back when `down` is 1. */
  lean: number;
  down: number;
};

export type AthleteLook = { shirt: number; shorts: number; skin: number; gloves?: number; shoes?: number };

const SKINS = [0x5a3825, 0x6b4430, 0x8d5a3b, 0xa86f4c, 0xc68d65, 0xe2b48f, 0x3f281b];
export const skinOf = (rnd: Rng) => SKINS[Math.floor(rnd() * SKINS.length) % SKINS.length];

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const color = new THREE.Color();

/**
 * A team of players (any number): each is 8 boxes (torso, shorts, legs, arms, shoes) and 1 to 3
 * balls (head, gloves). Call update() after moving the rigs.
 */
export function createAthletes(looks: AthleteLook[]) {
  const group = new THREE.Group();
  const BOXES = 8;
  const n = looks.length;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const ballGeo = new THREE.SphereGeometry(1, 10, 8);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const boxes = new THREE.InstancedMesh(boxGeo, mat, Math.max(1, n * BOXES));
  const balls = new THREE.InstancedMesh(ballGeo, mat, Math.max(1, n * 3));
  boxes.frustumCulled = false;
  balls.frustumCulled = false;
  group.add(boxes, balls);
  const rigs: Rig[] = looks.map(() => ({ x: 0, y: 0, z: 0, yaw: 0, phase: 0, stride: 0, reachL: 0, reachR: 0, guard: 0, lean: 0, down: 0 }));
  looks.forEach((l, i) => {
    const shoes = l.shoes ?? 0x1f1f1f;
    const cols = [l.shirt, l.shorts, l.skin, l.skin, l.skin, l.skin, shoes, shoes];
    cols.forEach((c, k) => boxes.setColorAt(i * BOXES + k, color.setHex(c)));
    balls.setColorAt(i * 3, color.setHex(l.skin));
    balls.setColorAt(i * 3 + 1, color.setHex(l.gloves ?? l.skin));
    balls.setColorAt(i * 3 + 2, color.setHex(l.gloves ?? l.skin));
  });
  // Scratch frames (no allocations per frame).
  const root = new THREE.Matrix4();
  const part = new THREE.Matrix4();
  const pivot = new THREE.Matrix4();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);

  /** Write part k of the current player: at `pivot`, offset (ox, oy, oz) after the pivot's turn, size (sx, sy, sz). */
  function put(mesh: THREE.InstancedMesh, k: number, ox: number, oy: number, oz: number, sx: number, sy: number, sz: number) {
    tmpM.compose(tmpP.set(ox, oy, oz), tmpQ.identity(), tmpS.set(sx, sy, sz));
    part.multiplyMatrices(pivot, tmpM);
    mesh.setMatrixAt(k, part);
  }
  function turn(px: number, py: number, pz: number, rx: number, rz = 0) {
    tmpE.set(rx, 0, rz, "XYZ");
    tmpM.compose(tmpP.set(px, py, pz), tmpQ.setFromEuler(tmpE), tmpS.set(1, 1, 1));
    pivot.multiplyMatrices(root, tmpM);
  }

  function update() {
    for (let i = 0; i < n; i++) {
      const r = rigs[i];
      const b = i * BOXES;
      const hasGloves = looks[i].gloves !== undefined;
      // The whole body: turned to face yaw, leaning, or lying on its back (pivot at the feet).
      const lie = r.down * (Math.PI / 2);
      tmpE.set(r.lean - lie, r.yaw, 0, "YXZ");
      root.compose(tmpP.set(r.x, r.y + r.down * 0.12, r.z), tmpQ.setFromEuler(tmpE), tmpS.set(1, 1, 1));
      const swing = Math.sin(r.phase) * 0.75 * r.stride;
      turn(0, 0, 0, 0);
      put(boxes, b, 0, 1.12, 0, 0.42, 0.52, 0.24);
      put(boxes, b + 1, 0, 0.84, 0, 0.43, 0.2, 0.25);
      balls.setMatrixAt(i * 3, tmpM.compose(tmpP.set(0, 1.52, 0), tmpQ.identity(), tmpS.set(0.13, 0.14, 0.13)).premultiply(root));
      // Legs swing from the hips; shoes go with them (one box under each foot, merged as one).
      turn(-0.11, 0.8, 0, swing);
      put(boxes, b + 2, 0, -0.4, 0, 0.15, 0.8, 0.17);
      put(boxes, b + 6, 0, -0.77, 0.05, 0.16, 0.07, 0.27);
      turn(0.11, 0.8, 0, -swing);
      put(boxes, b + 3, 0, -0.4, 0, 0.15, 0.8, 0.17);
      put(boxes, b + 7, 0, -0.77, 0.05, 0.16, 0.07, 0.27);
      // Arms: swing opposite the legs when running; reach out in front for punches / grabs.
      const armL = -swing * 0.8 - r.reachL * 1.5 - r.guard * 1.2;
      const armR = swing * 0.8 - r.reachR * 1.5 - r.guard * 1.2;
      const elbowOut = 0.12 + r.guard * 0.15;
      turn(-0.27, 1.32, 0, armL, -elbowOut);
      put(boxes, b + 4, 0, -0.28, 0, 0.11, 0.58, 0.11);
      if (hasGloves) balls.setMatrixAt(i * 3 + 1, tmpM.compose(tmpP.set(0, -0.6, 0), tmpQ.identity(), tmpS.set(0.1, 0.1, 0.1)).premultiply(pivot));
      else balls.setMatrixAt(i * 3 + 1, hide);
      turn(0.27, 1.32, 0, armR, elbowOut);
      put(boxes, b + 5, 0, -0.28, 0, 0.11, 0.58, 0.11);
      if (hasGloves) balls.setMatrixAt(i * 3 + 2, tmpM.compose(tmpP.set(0, -0.6, 0), tmpQ.identity(), tmpS.set(0.1, 0.1, 0.1)).premultiply(pivot));
      else balls.setMatrixAt(i * 3 + 2, hide);
    }
    boxes.instanceMatrix.needsUpdate = true;
    balls.instanceMatrix.needsUpdate = true;
  }
  update();
  if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
  if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
  return { group, rigs, update };
}

/** Turn a rig to face (tx, tz) smoothly (k = how much of the way per call). */
export function faceRig(r: Rig, tx: number, tz: number, k = 0.2) {
  const want = Math.atan2(tx - r.x, tz - r.z);
  let d = want - r.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  r.yaw += d * k;
}

/** Move a rig towards (tx, tz) at up to `speed` m/s; its legs run as fast as it goes. */
export function runRig(r: Rig, tx: number, tz: number, speed: number, dt: number, face = true) {
  const dx = tx - r.x;
  const dz = tz - r.z;
  const d = Math.hypot(dx, dz);
  const step = Math.min(d, speed * dt);
  if (d > 1e-4) {
    r.x += (dx / d) * step;
    r.z += (dz / d) * step;
    if (face && d > 0.05) faceRig(r, tx, tz, Math.min(1, dt * 8));
  }
  const v = dt > 0 ? step / dt : 0;
  r.stride += (Math.min(1, v / 4) - r.stride) * Math.min(1, dt * 6);
  r.phase += v * dt * 3.2 + dt * 0.5;
}

/**
 * The crowd: people sitting in rows (one body box and one head each, in all sorts of shirts),
 * bobbing and now and then jumping up to cheer.
 */
export function createCrowd(seats: { x: number; y: number; z: number; ry: number }[], rnd: Rng) {
  const group = new THREE.Group();
  const n = seats.length;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.62, 0.3).translate(0, 0.31, 0), mat, Math.max(1, n));
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), mat, Math.max(1, n));
  bodies.frustumCulled = false;
  heads.frustumCulled = false;
  group.add(bodies, heads);
  const SHIRTS = [0xe03131, 0x1c7ed6, 0xf5a524, 0x2f9e44, 0xf1f3f5, 0x18202b, 0xae3ec9, 0xffd43b, 0x0ca678, 0xf76707];
  const team = [SHIRTS[Math.floor(rnd() * 3)], SHIRTS[3 + Math.floor(rnd() * 3)]];
  const phase = new Float32Array(n);
  seats.forEach((s, i) => {
    // Most wear one of the two teams' colours.
    const r = rnd();
    bodies.setColorAt(i, color.setHex(r < 0.35 ? team[0] : r < 0.7 ? team[1] : SHIRTS[Math.floor(rnd() * SHIRTS.length)]));
    heads.setColorAt(i, color.setHex(SKINS[Math.floor(rnd() * SKINS.length)]));
    phase[i] = rnd() * Math.PI * 2;
  });
  let last = -1;
  function update(time: number) {
    // About 15 times a second is plenty for a bob.
    const tick = Math.floor(time * 15);
    if (tick === last) return;
    last = tick;
    // A wave of cheering goes round now and then.
    const wave = (time * 0.35) % 1;
    for (let i = 0; i < n; i++) {
      const s = seats[i];
      const f = i / Math.max(1, n);
      const near = Math.abs(f - wave);
      const up = Math.max(0, 1 - Math.min(near, 1 - near) * 14) * 0.35;
      const bob = Math.max(0, Math.sin(time * 3 + phase[i])) * 0.04 + up;
      tmpM.compose(tmpP.set(s.x, s.y + bob, s.z), tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.ry), tmpS.set(1, 1 + up * 0.6, 1));
      bodies.setMatrixAt(i, tmpM);
      tmpM.compose(tmpP.set(s.x, s.y + bob + 0.62 + up * 0.37 + 0.12, s.z), tmpQ.identity(), tmpS.set(1, 1, 1));
      heads.setMatrixAt(i, tmpM);
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }
  update(0);
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  return { group, update };
}
