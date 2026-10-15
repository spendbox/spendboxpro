// People out walking along the edges of the streets: little instanced figures with swinging
// legs and a bob in their step, all in different clothes. Now and then one crosses the road at
// a zebra crossing. On a real place they keep to streets with pavements: never along an
// expressway, across a wide stretch of tarmac, or on a road over water, and they cross only at
// the junctions' zebras and the crossings. Fewer people about at night, and umbrellas come out when it rains.
// Five instanced meshes in all (shirts, trousers, heads, legs, umbrellas).
// Close up (walking the streets, or zoomed right in), the few people nearest you are drawn as the
// new 3D avatars (a very light version of them), walking along, and their little figure is hidden.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LOD } from "@/lib/avatar3d/lod";
import { createMyAvatar } from "./npc3d";
import { DIRS, grown, isBridgeAt, keyOf, roadAt, roadY, signalJunction, type World } from "./world";

type Person = {
  from: [number, number];
  to: [number, number];
  t: number;
  speed: number;
  /** Which side of the street (+1 / -1), and where they are across it right now (crossing). */
  side: number;
  across: number;
  /** About to cross at the zebra on this stretch, and where along it (0 a mid-street crossing, 0.36 by a junction). */
  cross: boolean;
  crossAt: number;
  bridgeFrom: boolean;
  bridgeTo: boolean;
  phase: number;
  umbrella: boolean;
};

const SHIRTS = [0xe5484d, 0x4dabf7, 0xffd43b, 0x69db7c, 0xf783ac, 0xffffff, 0x845ef7, 0xff922b, 0x20c997, 0x343a40];
const TROUSERS = [0x343a40, 0x1c3f6e, 0x495057, 0x5c4033, 0x2b2f33, 0x7a6a58];
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a1e, 0xffdbac];
const BROLLIES = [0xe5484d, 0x1c3faa, 0xffd43b, 0x2f9e44, 0x343a40, 0xda77f2];

/** Somewhere people can walk: a street with pavements (not an expressway, wide tarmac or a causeway). */
function walkable(world: World, x: number, z: number) {
  if (!roadAt(world, x, z)) return false;
  const t = world.byIndex.get(world.tileIndex.get(keyOf(x, z)) ?? -1);
  return !!t && !t.roundabout && !t.wide && !t.express && !t.causeway;
}

export function createPeople(world: World, parent: THREE.Object3D) {
  const torsoGeo = new THREE.CylinderGeometry(0.028, 0.034, 0.08, 6).translate(0, 0.1, 0);
  const headGeo = new THREE.SphereGeometry(0.024, 6, 5).translate(0, 0.165, 0);
  // A leg hangs from the hip (its pivot), so turning it swings it.
  const legGeo = new THREE.BoxGeometry(0.018, 0.062, 0.018).translate(0, -0.031, 0);
  const brollyGeo = mergeGeometries([
    new THREE.ConeGeometry(0.085, 0.04, 8, 1, true).translate(0, 0.245, 0),
    new THREE.CylinderGeometry(0.004, 0.004, 0.09, 4).translate(0, 0.19, 0),
  ]);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const brollyMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  let torso: THREE.InstancedMesh | null = null;
  let head: THREE.InstancedMesh | null = null;
  let legs: THREE.InstancedMesh | null = null;
  let brolly: THREE.InstancedMesh | null = null;
  let people: Person[] = [];
  let smooth = new Float32Array(0);
  const m4 = new THREE.Matrix4();
  const hip = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const q3 = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const xAxis = new THREE.Vector3(1, 0, 0);
  const zero = new THREE.Vector3(0.0001, 0.0001, 0.0001);
  const color = new THREE.Color();

  // The 3D crowd: a few avatars, each walking as whoever nearby it's given to (kept while they stay close).
  const CROWD = 8;
  const NEAR = 2.2;
  type Walker3d = ReturnType<typeof createMyAvatar>;
  const crowd: { av: Walker3d | null; who: number }[] = Array.from({ length: CROWD }, () => ({ av: null, who: -1 }));
  const held = new Map<number, number>();
  let pick = 0;
  /** Hand out the avatars to the people nearest the spot (or take them all back: null). */
  function assign(focus: { x: number; z: number } | null, active: number) {
    if (!focus) {
      for (const c of crowd) c.who = -1;
      held.clear();
      return;
    }
    const d2 = (k: number) => (smooth[k * 3] - focus.x) ** 2 + (smooth[k * 3 + 2] - focus.z) ** 2;
    for (const c of crowd)
      if (c.who >= 0 && (c.who >= active || !(d2(c.who) < NEAR * NEAR * 1.3))) {
        held.delete(c.who);
        c.who = -1;
      }
    const free = crowd.filter((c) => c.who < 0);
    if (!free.length) return;
    const near: [number, number][] = [];
    for (let k = 0; k < active; k++) {
      if (held.has(k)) continue;
      const d = d2(k);
      if (d < NEAR * NEAR) near.push([d, k]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const c of free) {
      const n = near.shift();
      if (!n) break;
      c.who = n[1];
      held.set(n[1], crowd.indexOf(c));
      if (!c.av) {
        c.av = createMyAvatar(null, LOD.farthest, `crowd:${crowd.indexOf(c)}`);
        c.av.root.scale.setScalar(0.19 / 1.72);
        parent.add(c.av.root);
      }
    }
  }

  function clear() {
    for (const m of [torso, head, legs, brolly]) {
      if (!m) continue;
      parent.remove(m);
      m.dispose();
    }
    torso = head = legs = brolly = null;
  }

  function build() {
    clear();
    for (const c of crowd) c.who = -1;
    held.clear();
    const roads = world.tiles.filter((t) => (t.kind === "road" || t.kind === "bridge") && !t.works && walkable(world, t.x, t.z));
    const n = Math.min(150, Math.floor(roads.length / 2.5));
    people = [];
    for (let k = 0; k < n; k++) {
      const t = roads[Math.floor(Math.random() * roads.length)];
      const options = DIRS.filter(([ox, oz]) => walkable(world, t.x + ox, t.z + oz));
      if (!options.length) continue;
      const [ox, oz] = options[Math.floor(Math.random() * options.length)];
      const side = Math.random() < 0.5 ? 1 : -1;
      people.push({
        from: [t.x, t.z],
        to: [t.x + ox, t.z + oz],
        t: Math.random(),
        speed: 0.16 + Math.random() * 0.14,
        side,
        across: side,
        cross: false,
        crossAt: 0.36,
        bridgeFrom: t.kind === "bridge",
        bridgeTo: isBridgeAt(world, t.x + ox, t.z + oz),
        phase: Math.random() * 10,
        umbrella: Math.random() < 0.7,
      });
    }
    smooth = new Float32Array(people.length * 3).fill(NaN);
    const N = Math.max(1, people.length);
    torso = new THREE.InstancedMesh(torsoGeo, mat, N);
    head = new THREE.InstancedMesh(headGeo, mat, N);
    legs = new THREE.InstancedMesh(legGeo, mat, N * 2);
    brolly = new THREE.InstancedMesh(brollyGeo, brollyMat, N);
    people.forEach((p, k) => {
      const r = (p.phase * 7919) % 1;
      torso!.setColorAt(k, color.setHex(SHIRTS[Math.floor(r * SHIRTS.length) % SHIRTS.length]));
      head!.setColorAt(k, color.setHex(SKIN[Math.floor(((p.phase * 104729) % 1) * SKIN.length) % SKIN.length]));
      const trouser = TROUSERS[Math.floor(((p.phase * 7907) % 1) * TROUSERS.length) % TROUSERS.length];
      legs!.setColorAt(k * 2, color.setHex(trouser));
      legs!.setColorAt(k * 2 + 1, color.setHex(trouser));
      brolly!.setColorAt(k, color.setHex(BROLLIES[k % BROLLIES.length]));
    });
    for (const m of [torso, head, legs, brolly]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = m !== legs;
      parent.add(m);
    }
    torso.count = head.count = people.length;
    legs.count = people.length * 2;
    brolly.count = 0;
  }

  function nextStop(p: Person): [number, number] {
    const [x, z] = p.to;
    const dx = Math.sign(p.to[0] - p.from[0]);
    const dz = Math.sign(p.to[1] - p.from[1]);
    const options: [number, number][] = [];
    for (const [ox, oz] of DIRS) {
      if (ox === -dx && oz === -dz) continue;
      if (walkable(world, x + ox, z + oz)) options.push([x + ox, z + oz]);
    }
    if (!options.length) return p.from;
    const ahead = options.find(([nx, nz]) => nx - x === dx && nz - z === dz);
    if (ahead && Math.random() < 0.65) return ahead;
    return options[Math.floor(Math.random() * options.length)];
  }

  /** focus: where you are, close up (the nearest people become 3D avatars); null from far away. */
  function update(dt: number, now: number, focus: { x: number; z: number } | null = null) {
    if (!torso || !head || !legs || !brolly) return;
    // Fewer people out at night.
    const active = Math.round(people.length * (1 - 0.7 * world.night));
    // Who's 3D: looked at a few times a second, not every frame.
    pick -= dt;
    if (pick <= 0 || (!focus && held.size)) {
      pick = 0.4;
      assign(focus, active);
    }
    const rainy = world.rain > 0.05;
    torso.count = head.count = active;
    legs.count = active * 2;
    brolly.count = rainy ? active : 0;
    for (let k = 0; k < active; k++) {
      const p = people[k];
      let dx = p.to[0] - p.from[0];
      let dz = p.to[1] - p.from[1];
      let crossing = false;
      if (p.cross && p.t >= p.crossAt && p.t <= p.crossAt + 0.14) {
        // At the zebra: stop going along, walk across.
        crossing = true;
        const goal = -p.side;
        const step = dt * 0.35 * (rainy ? 1.3 : 1);
        p.across += Math.sign(goal - p.across) * Math.min(step, Math.abs(goal - p.across));
        if (p.across === goal) {
          p.side = goal;
          p.cross = false;
        }
      } else {
        p.t += p.speed * dt * (rainy ? 1.3 : 1);
      }
      while (p.t >= 1) {
        p.t -= 1;
        const next = nextStop(p);
        const at = world.byIndex.get(world.tileIndex.get(keyOf(p.to[0], p.to[1])) ?? -1);
        p.from = p.to;
        p.to = next;
        p.bridgeFrom = p.bridgeTo;
        p.bridgeTo = isBridgeAt(world, next[0], next[1]);
        dx = p.to[0] - p.from[0];
        dz = p.to[1] - p.from[1];
        // Leaving a crossing with zebras: sometimes cross over to the other pavement. At a
        // crossing in the middle of a street, cross right there.
        const midCrossing = !!at && at.crossing !== undefined;
        p.cross = !!at && (signalJunction(at) || midCrossing) && Math.random() < (midCrossing ? 0.5 : 0.3);
        p.crossAt = midCrossing ? 0 : 0.36;
      }
      const lane = p.bridgeFrom || p.bridgeTo ? 0.22 : 0.43;
      const tx = p.from[0] + dx * p.t - dz * p.across * lane;
      const tz = p.from[1] + dz * p.t + dx * p.across * lane;
      const ty = roadY(p.bridgeFrom, p.bridgeTo, p.t);
      // Glide, rather than jump, when turning a corner.
      const o = k * 3;
      if (Number.isNaN(smooth[o])) {
        smooth[o] = tx;
        smooth[o + 1] = ty;
        smooth[o + 2] = tz;
      } else {
        const f = Math.min(1, dt * 5);
        smooth[o] += (tx - smooth[o]) * f;
        smooth[o + 1] += (ty - smooth[o + 1]) * f;
        smooth[o + 2] += (tz - smooth[o + 2]) * f;
      }
      const tileI = world.tileIndex.get(keyOf(p.from[0], p.from[1]));
      const show = tileI !== undefined && grown(world, tileI, now);
      p.phase += dt * (crossing ? 9 : 10);
      const bob = Math.abs(Math.sin(p.phase)) * 0.008;
      const yaw = crossing ? Math.atan2(-(dx * -p.side), -dz * -p.side) : Math.atan2(-dz, dx);
      // Figures face along +z by default; turn so they face where they're going.
      q.setFromAxisAngle(up, yaw + Math.PI / 2);
      // Drawn as a 3D avatar (once it's built): that walks here instead, and the little figure hides.
      const slot = held.get(k);
      const av = slot === undefined ? null : crowd[slot].av;
      const as3d = !!av && av.ready() && show;
      if (av) {
        av.root.visible = as3d;
        av.root.position.set(smooth[o], smooth[o + 1], smooth[o + 2]);
        av.root.quaternion.copy(q);
        if (as3d) av.update(dt * (crossing ? 0.9 : 1), "walk");
      }
      v.set(smooth[o], smooth[o + 1] + bob, smooth[o + 2]);
      m4.compose(v, q, show && !as3d ? s.set(1, 1, 1) : zero);
      torso.setMatrixAt(k, m4);
      head.setMatrixAt(k, m4);
      if (rainy) {
        if (p.umbrella && show) brolly.setMatrixAt(k, m4.compose(v, q, s.set(1, 1, 1)));
        else brolly.setMatrixAt(k, m4.compose(v, q, zero));
      }
      const swing = Math.sin(p.phase) * 0.55;
      for (let leg = 0; leg < 2; leg++) {
        q2.setFromAxisAngle(xAxis, leg ? swing : -swing);
        hip.compose(v.set(smooth[o] + (leg ? 0.011 : -0.011) * Math.cos(yaw + Math.PI / 2), smooth[o + 1] + 0.064 + bob, smooth[o + 2] - (leg ? 0.011 : -0.011) * Math.sin(yaw + Math.PI / 2)), q3.copy(q).multiply(q2), show && !as3d ? s.set(1, 1, 1) : zero);
        legs.setMatrixAt(k * 2 + leg, hip);
      }
    }
    torso.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    legs.instanceMatrix.needsUpdate = true;
    if (rainy) brolly.instanceMatrix.needsUpdate = true;
    // Avatars not given to anyone right now stay out of sight.
    for (const c of crowd) if (c.av && c.who < 0) c.av.root.visible = false;
  }

  function dispose() {
    clear();
    for (const c of crowd) {
      c.av?.dispose();
      c.av = null;
      c.who = -1;
    }
    held.clear();
    for (const g of [torsoGeo, headGeo, legGeo, brollyGeo]) g.dispose();
    mat.dispose();
    brollyMat.dispose();
  }

  return { build, update, dispose };
}
