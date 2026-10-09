// People out walking along the edges of the streets: little instanced figures with swinging
// legs and a bob in their step, all in different clothes. Now and then one crosses the road at
// a zebra crossing. Fewer people about at night, and umbrellas come out when it rains.
// Five instanced meshes in all (shirts, trousers, heads, legs, umbrellas).

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DIRS, grown, isBridgeAt, keyOf, roadAt, roadY, signalJunction, type World } from "./world";

type Person = {
  from: [number, number];
  to: [number, number];
  t: number;
  speed: number;
  /** Which side of the street (+1 / -1), and where they are across it right now (crossing). */
  side: number;
  across: number;
  /** About to cross at the zebra on this stretch. */
  cross: boolean;
  bridgeFrom: boolean;
  bridgeTo: boolean;
  phase: number;
  umbrella: boolean;
};

const SHIRTS = [0xe5484d, 0x4dabf7, 0xffd43b, 0x69db7c, 0xf783ac, 0xffffff, 0x845ef7, 0xff922b, 0x20c997, 0x343a40];
const TROUSERS = [0x343a40, 0x1c3f6e, 0x495057, 0x5c4033, 0x2b2f33, 0x7a6a58];
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a1e, 0xffdbac];
const BROLLIES = [0xe5484d, 0x1c3faa, 0xffd43b, 0x2f9e44, 0x343a40, 0xda77f2];

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
    const roads = world.tiles.filter((t) => (t.kind === "road" || t.kind === "bridge") && !t.works && !t.roundabout);
    const n = Math.min(150, Math.floor(roads.length / 2.5));
    people = [];
    for (let k = 0; k < n; k++) {
      const t = roads[Math.floor(Math.random() * roads.length)];
      const options = DIRS.filter(([ox, oz]) => roadAt(world, t.x + ox, t.z + oz));
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
      if (roadAt(world, x + ox, z + oz) && world.byIndex.get(world.tileIndex.get(keyOf(x + ox, z + oz)) ?? -1)?.roundabout !== true) options.push([x + ox, z + oz]);
    }
    if (!options.length) return p.from;
    const ahead = options.find(([nx, nz]) => nx - x === dx && nz - z === dz);
    if (ahead && Math.random() < 0.65) return ahead;
    return options[Math.floor(Math.random() * options.length)];
  }

  function update(dt: number, now: number) {
    if (!torso || !head || !legs || !brolly) return;
    // Fewer people out at night.
    const active = Math.round(people.length * (1 - 0.7 * world.night));
    const rainy = world.rain > 0.05;
    torso.count = head.count = active;
    legs.count = active * 2;
    brolly.count = rainy ? active : 0;
    for (let k = 0; k < active; k++) {
      const p = people[k];
      let dx = p.to[0] - p.from[0];
      let dz = p.to[1] - p.from[1];
      let crossing = false;
      if (p.cross && p.t >= 0.36 && p.t <= 0.5) {
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
        // Leaving a crossing with zebras: sometimes cross over to the other pavement.
        p.cross = !!at && signalJunction(at) && Math.random() < 0.3;
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
      v.set(smooth[o], smooth[o + 1] + bob, smooth[o + 2]);
      m4.compose(v, q, show ? s.set(1, 1, 1) : zero);
      torso.setMatrixAt(k, m4);
      head.setMatrixAt(k, m4);
      if (rainy) {
        if (p.umbrella && show) brolly.setMatrixAt(k, m4);
        else brolly.setMatrixAt(k, m4.compose(v, q, zero));
      }
      const swing = Math.sin(p.phase) * 0.55;
      for (const leg of [0, 1]) {
        q2.setFromAxisAngle(xAxis, leg ? swing : -swing);
        hip.compose(v.set(smooth[o] + (leg ? 0.011 : -0.011) * Math.cos(yaw + Math.PI / 2), smooth[o + 1] + 0.064 + bob, smooth[o + 2] - (leg ? 0.011 : -0.011) * Math.sin(yaw + Math.PI / 2)), q3.copy(q).multiply(q2), show ? s.set(1, 1, 1) : zero);
        legs.setMatrixAt(k * 2 + leg, hip);
      }
    }
    torso.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    legs.instanceMatrix.needsUpdate = true;
    if (rainy) brolly.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    clear();
    for (const g of [torsoGeo, headGeo, legGeo, brollyGeo]) g.dispose();
    mat.dispose();
    brollyMat.dispose();
  }

  return { build, update, dispose };
}
