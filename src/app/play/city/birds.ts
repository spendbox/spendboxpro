// Birds over the city: pigeons circling downtown, gulls soaring over water, swallows darting
// low between houses, geese crossing in a V, now and then an eagle circling high up, and a few
// pigeons perched on rooftops that take off when the camera comes close.
//
// All of them are one instanced mesh (one draw call). The wings flap in the vertex shader, so
// a frame only moves each bird (a matrix), never rebuilds anything.

import * as THREE from "three";
import { grown, type World } from "./world";

const Kind = { Pigeon: 0, Gull: 1, Swallow: 2, Eagle: 3, Goose: 4, Perched: 5 } as const;
type Kind = (typeof Kind)[keyof typeof Kind];

type Bird = {
  kind: Kind;
  /** Stable random numbers for this bird. */
  a: number;
  b: number;
  c: number;
  /** Where it circles round (pigeons, gulls, swallows), or its perch. */
  cx: number;
  cy: number;
  cz: number;
  /** Place in a V (geese). */
  slot: number;
  /** Perched birds: 0 sitting, otherwise seconds since take-off; and whether it's coming home. */
  fly: number;
  landing: boolean;
  /** Angle the take-off loop starts at. */
  a0: number;
  tile: number;
};

/** A low-poly bird, nose along +x, wings along ±z. Wing points flap (see the shader). */
function birdGeometry() {
  const nose: [number, number, number] = [0.2, 0.01, 0];
  const tail: [number, number, number] = [-0.13, 0.015, 0];
  const top: [number, number, number] = [0.02, 0.05, 0];
  const bottom: [number, number, number] = [0.02, -0.035, 0];
  const left: [number, number, number] = [0.02, 0.005, -0.04];
  const right: [number, number, number] = [0.02, 0.005, 0.04];
  const tris: [number, number, number][][] = [
    [nose, top, right], [nose, left, top], [nose, right, bottom], [nose, bottom, left],
    [tail, right, top], [tail, top, left], [tail, bottom, right], [tail, left, bottom],
    // Tail fan
    [[-0.1, 0.015, 0], [-0.25, 0.02, 0.07], [-0.25, 0.02, -0.07]],
  ];
  for (const s of [1, -1]) {
    // Each wing: a broad inner part and a swept-back tip.
    const r0: [number, number, number] = [0.07, 0.02, 0.035 * s];
    const r1: [number, number, number] = [-0.06, 0.02, 0.035 * s];
    const m0: [number, number, number] = [0.05, 0.02, 0.2 * s];
    const m1: [number, number, number] = [-0.07, 0.02, 0.19 * s];
    const tip: [number, number, number] = [-0.08, 0.02, 0.36 * s];
    tris.push([r0, m0, r1], [r1, m0, m1], [m0, tip, m1]);
  }
  const pos: number[] = [];
  for (const t of tris) for (const p of t) pos.push(...p);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const MAX = 64;

export function createBirds(world: World, parent: THREE.Object3D) {
  const geometry = birdGeometry();
  // Per bird: flap phase, flaps per second (radians), flap size, how much it glides (0..1).
  const flap = new Float32Array(MAX * 4);
  const flapAttr = new THREE.InstancedBufferAttribute(flap, 4);
  geometry.setAttribute("aFlap", flapAttr);
  const uTime = { value: 0 };
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aFlap;\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float wingW = max(0.0, abs(position.z) - 0.035);
        float glideK = aFlap.w * smoothstep(-0.1, 0.7, sin(uTime * 0.37 + aFlap.x * 1.7));
        float beat = sin(uTime * aFlap.y + aFlap.x);
        float amp = aFlap.z * (1.0 - glideK);
        transformed.y += wingW * (beat * amp + glideK * 0.22 * aFlap.z);
        transformed.z *= 1.0 - min(0.5, wingW * abs(beat) * amp * 0.6);`,
      );
  };
  material.customProgramCacheKey = () => "city-birds";
  const mesh = new THREE.InstancedMesh(geometry, material, MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  parent.add(mesh);

  let birds: Bird[] = [];
  const prev = new Float32Array(MAX * 3);
  const yawS = new Float32Array(MAX);
  const rollS = new Float32Array(MAX);
  let fresh = true;
  const color = new THREE.Color();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, "YZX");
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const camPos = new THREE.Vector3();

  function setFlap(k: number, phase: number, freq: number, amp: number, glide: number) {
    flap[k * 4] = phase;
    flap[k * 4 + 1] = freq;
    flap[k * 4 + 2] = amp;
    flap[k * 4 + 3] = glide;
  }

  function build(seed: number) {
    const rnd = mulberry(seed * 7 + 13);
    const tiles = world.tiles;
    const R = world.radius;
    const centre = world.plan?.centres[0] ?? { x: 0, z: 0 };
    // Water to soar over: the river, lakes, the harbour, the dam, the oil rig.
    const water: { x: number; z: number }[] = [];
    for (const t of tiles) {
      if (t.kind === "river" || t.kind === "lake") water.push({ x: t.x, z: t.z });
      if (t.structure?.anchor && ["port", "oilrig", "dam"].includes(t.structure.type)) water.push({ x: t.x + 0.5, z: t.z + 0.5 });
    }
    // Roofs to perch on.
    const roofs = tiles.filter((t) => (t.kind === "house" || t.kind === "office" || t.kind === "hospital" || t.kind === "police") && !t.rail);
    const list: Bird[] = [];
    const add = (kind: Kind, cx: number, cy: number, cz: number, slot = 0, tile = -1) =>
      list.push({ kind, a: rnd(), b: rnd(), c: rnd(), cx, cy, cz, slot, fly: 0, landing: false, a0: rnd() * Math.PI * 2, tile });
    // Pigeons: one or two flocks circling downtown.
    const flocks = tiles.length > 120 ? 2 : 1;
    for (let f = 0; f < flocks; f++) {
      const fx = f ? (rnd() - 0.5) * R : Math.max(-R * 0.6, Math.min(R * 0.6, centre.x));
      const fz = f ? (rnd() - 0.5) * R : Math.max(-R * 0.6, Math.min(R * 0.6, centre.z));
      for (let k = 0; k < 8; k++) add(Kind.Pigeon, fx, 3.2 + f, fz, f);
    }
    // Gulls over the water (if there is any).
    if (water.length) {
      for (let k = 0; k < 6; k++) {
        const w = water[Math.floor(rnd() * water.length)];
        add(Kind.Gull, w.x, 1.6 + rnd() * 1.4, w.z);
      }
    }
    // Swallows darting low round the houses.
    for (let k = 0; k < 8; k++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * R * 0.7;
      add(Kind.Swallow, Math.cos(a) * d, 0.9 + rnd() * 0.8, Math.sin(a) * d);
    }
    // The eagle, high up.
    add(Kind.Eagle, (rnd() - 0.5) * R * 0.5, 9 + R * 0.25, (rnd() - 0.5) * R * 0.5);
    // Geese in a V.
    for (let k = 0; k < 9; k++) add(Kind.Goose, 0, 7.5, 0, k);
    // Perched pigeons: a few roofs, two to four birds on each.
    const perchRoofs = Math.min(4, Math.floor(roofs.length / 6));
    for (let r = 0; r < perchRoofs; r++) {
      const t = roofs[Math.floor(rnd() * roofs.length)];
      const n = 2 + Math.floor(rnd() * 3);
      const along = rnd() < 0.5;
      for (let k = 0; k < n; k++) {
        const o = (k - (n - 1) / 2) * 0.13;
        add(Kind.Perched, t.x + (along ? o : 0), t.top + 0.02, t.z + (along ? 0 : o), k, t.i);
      }
    }
    birds = list.slice(0, MAX);
    birds.forEach((b, k) => {
      const look: Record<Kind, [number, number, number, number, number]> = {
        // colour, scale (applied in update), flaps/s (radians), flap size, glide
        [Kind.Pigeon]: [[0x8d96a3, 0x7c8590, 0xa3abb5, 0x6f7781][k % 4], 0, 15 + b.a * 3, 0.9, 0.25],
        [Kind.Gull]: [0xf1f3f5, 0, 6 + b.a, 1.1, 0.85],
        [Kind.Swallow]: [0x24324d, 0, 24 + b.a * 6, 0.8, 0.35],
        [Kind.Eagle]: [0x6b4f35, 0, 4.2, 0.7, 0.95],
        [Kind.Goose]: [0x5b5148, 0, 7 + b.a * 0.4, 1.0, 0.1],
        [Kind.Perched]: [[0x8d96a3, 0x7c8590, 0xa3abb5][k % 3], 0, 16 + b.a * 3, 0, 0],
      };
      const [hex, , freq, amp, glide] = look[b.kind];
      mesh.setColorAt(k, color.setHex(hex));
      setFlap(k, b.b * 20, freq, amp, glide);
    });
    mesh.count = birds.length;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    flapAttr.needsUpdate = true;
    fresh = true;
  }

  /** Where bird k is at this moment (into v), and how big it is. Returns false to hide it. */
  function place(b: Bird, k: number, time: number, dt: number, camera: THREE.Camera, now: number): number {
    const R = world.radius;
    switch (b.kind) {
      case Kind.Pigeon: {
        // The flock wheels round together, each bird a little off the line.
        const a = time * 0.32 + b.slot * 2 + b.a * 0.7;
        const rr = 2.2 + b.slot + Math.sin(time * 0.21 + b.b * 6) * 0.6;
        v.set(b.cx + Math.cos(a) * rr + (b.b - 0.5) * 0.5, b.cy + Math.sin(time * 0.9 + b.c * 6) * 0.35, b.cz + Math.sin(a) * rr + (b.c - 0.5) * 0.5);
        return 0.75;
      }
      case Kind.Gull: {
        // Big lazy loops over the water, rising and falling.
        const a = time * (0.18 + b.a * 0.08) * (b.b < 0.5 ? 1 : -1) + b.c * 6.28;
        const rr = 1.4 + b.a * 1.8;
        v.set(b.cx + Math.cos(a) * rr, b.cy + Math.sin(time * 0.4 + b.b * 6) * 0.5, b.cz + Math.sin(a * 1.3) * rr * 0.8);
        return 1.0;
      }
      case Kind.Swallow: {
        // Quick swooping figure-eights.
        const t = time * (0.9 + b.a * 0.5) + b.b * 20;
        v.set(b.cx + Math.sin(t) * 1.6, b.cy + Math.sin(t * 2.3) * 0.35, b.cz + Math.sin(t * 2) * 0.9);
        return 0.55;
      }
      case Kind.Eagle: {
        // Rare: shows up for about a minute every few minutes, circling very slowly.
        const cycle = (time + b.a * 200) % 210;
        if (cycle > 75) return 0;
        const a = time * 0.11;
        const rr = 3.5 + R * 0.15;
        const rise = Math.min(1, cycle / 8, (75 - cycle) / 8);
        v.set(b.cx + Math.cos(a) * rr, b.cy + 6 * (1 - rise), b.cz + Math.sin(a) * rr);
        return 1.9;
      }
      case Kind.Goose: {
        // The V crosses the whole sky about every 80 seconds, on a different heading each time.
        const period = 80;
        const n = Math.floor((time + 30) / period);
        const f = ((time + 30) % period) / period;
        const head = n * 2.1 + 0.6;
        const span = R * 2 + 30;
        const along = (f - 0.5) * span;
        const row = Math.ceil(b.slot / 2);
        const side = b.slot === 0 ? 0 : b.slot % 2 ? 1 : -1;
        const back = row * 0.42;
        const lat = side * row * 0.36;
        const ch = Math.cos(head);
        const sh = Math.sin(head);
        const ax = along - back;
        v.set(ch * ax - sh * lat, b.cy + Math.sin(time * 0.5) * 0.3 + row * 0.03, sh * ax + ch * lat);
        return 1.05;
      }
      case Kind.Perched: {
        if (!world.revealed || !grown(world, b.tile, now)) return 0;
        camera.getWorldPosition(camPos);
        const near = camPos.distanceToSquared(v.set(b.cx, b.cy, b.cz)) < 49;
        if (b.fly === 0) {
          if (!near) {
            v.set(b.cx, b.cy, b.cz);
            return 0.7;
          }
          b.fly = 0.0001;
          b.landing = false;
          flap[k * 4 + 2] = 0.95;
          flapAttr.needsUpdate = true;
        }
        // Flying: loops of 8 s that start and end at the perch; land when the camera has gone.
        const LOOP = 8;
        b.fly += dt;
        const inLoop = b.fly % LOOP;
        if (inLoop < dt * 1.5 && b.fly > LOOP) b.landing = !near;
        if (b.landing && b.fly > LOOP && inLoop > LOOP - dt * 1.5) {
          b.fly = 0;
          flap[k * 4 + 2] = 0;
          flapAttr.needsUpdate = true;
          v.set(b.cx, b.cy, b.cz);
          return 0.7;
        }
        const w = (Math.PI * 2) / LOOP;
        const rr = 2.2 + b.slot * 0.3;
        const ang = b.a0 + w * b.fly;
        const cx = b.cx - Math.cos(b.a0) * rr;
        const cz = b.cz - Math.sin(b.a0) * rr;
        const lift = b.landing && b.fly > LOOP ? 0.5 + 0.5 * Math.cos((inLoop / LOOP) * Math.PI) : Math.min(1, b.fly / 1.5);
        v.set(cx + Math.cos(ang) * rr, b.cy + 1.6 * lift, cz + Math.sin(ang) * rr);
        return 0.75;
      }
    }
    return 0;
  }

  function update(time: number, dt: number, camera: THREE.Camera, now: number) {
    uTime.value = time;
    if (!birds.length) return;
    for (let k = 0; k < birds.length; k++) {
      const b = birds[k];
      const size = place(b, k, time, dt, camera, now);
      const o = k * 3;
      const dx = v.x - prev[o];
      const dy = v.y - prev[o + 1];
      const dz = v.z - prev[o + 2];
      const moved = Math.hypot(dx, dz);
      if (moved > 0.0005 && !fresh) {
        const yaw = Math.atan2(-dz, dx);
        let turn = yaw - yawS[k];
        if (turn > Math.PI) turn -= Math.PI * 2;
        if (turn < -Math.PI) turn += Math.PI * 2;
        yawS[k] += turn * Math.min(1, dt * 8);
        if (yawS[k] > Math.PI) yawS[k] -= Math.PI * 2;
        if (yawS[k] < -Math.PI) yawS[k] += Math.PI * 2;
        // Bank into turns.
        const bank = Math.max(-0.7, Math.min(0.7, (-turn / Math.max(dt, 0.001)) * 0.08));
        rollS[k] += (bank - rollS[k]) * Math.min(1, dt * 4);
      }
      const perched = b.kind === Kind.Perched && b.fly === 0;
      const pitch = perched || fresh ? 0 : Math.max(-0.5, Math.min(0.5, Math.atan2(dy, Math.max(moved, 0.001)) * 0.6));
      prev[o] = v.x;
      prev[o + 1] = v.y;
      prev[o + 2] = v.z;
      e.set(perched ? 0 : rollS[k], perched ? b.a * 6 : yawS[k], pitch);
      q.setFromEuler(e);
      if (size <= 0) s.set(0.0001, 0.0001, 0.0001);
      // Perched birds fold their wings.
      else if (perched) s.set(size, size, size * 0.3);
      else s.set(size, size, size);
      m4.compose(v, q, s);
      mesh.setMatrixAt(k, m4);
    }
    fresh = false;
    mesh.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    parent.remove(mesh);
    geometry.dispose();
    material.dispose();
    mesh.dispose();
  }

  return { build, update, dispose, mesh };
}

/** A tiny seeded random number generator (0..1). */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
