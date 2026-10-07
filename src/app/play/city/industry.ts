// Heavy industry: the power station (cooling towers with steam, a tall chimney), the dam (a
// reservoir, a concrete wall and a foaming spillway) and the oil rig out on the water (with a
// gas flare burning at the end of its boom). Their shapes are drawn with the rest of the city
// (industryParts); the steam, smoke, spray and flames are one small particle system (plumes).

import * as THREE from "three";
import type { Tile } from "@/lib/city/layout";
import { grown, type World } from "./world";

type BoxFn = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry?: number, mesh?: string, tilt?: number) => void;

const c = 0.5; // the 2×2 block's centre, from its corner tile

/** A cooling tower's shape: wide at the bottom, pinched at the waist, flaring at the top. */
export function coolingTowerGeometry() {
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 12; k++) {
    const y = k / 12;
    const r = 0.33 + 0.17 * Math.pow((y - 0.72) / 0.72, 2) + (y > 0.72 ? 0.12 * Math.pow((y - 0.72) / 0.28, 2) * 0.4 : 0);
    pts.push(new THREE.Vector2(r, y));
  }
  return new THREE.LatheGeometry(pts, 18);
}

const TOWERS = [
  { x: c - 0.52, z: c - 0.45, h: 1.45 },
  { x: c + 0.18, z: c - 0.52, h: 1.3 },
];
const CHIMNEY = { x: c + 0.8, z: c + 0.05, h: 2.9 };
const FLARE = { x: c + 0.98, y: 1.42, z: c - 0.42 };

export function industryParts(type: "power" | "dam" | "oilrig", B: BoxFn) {
  if (type === "power") {
    for (const t of TOWERS) {
      B(t.x, 0.09, t.z, 0.66, t.h, 0.66, 0xd9d6cf, 0, "cooling");
      B(t.x, 0.09 + t.h - 0.02, t.z, 0.44, 0.02, 0.44, 0x868e96, 0, "disc");
    }
    // Turbine hall, with a blue band of windows.
    B(c + 0.2, 0.09, c + 0.45, 1.0, 0.55, 0.6, 0xe9ecef);
    B(c + 0.2, 0.36, c + 0.45, 1.01, 0.1, 0.61, 0x4c6e91, 0, "glass");
    B(c + 0.2, 0.64, c + 0.45, 1.02, 0.05, 0.62, 0x868e96);
    // Red-and-white chimney.
    B(CHIMNEY.x, 0.09, CHIMNEY.z, 0.13, CHIMNEY.h, 0.13, 0xf1f3f5, 0, "cyl");
    for (let k = 0; k < 4; k++) B(CHIMNEY.x, 0.09 + CHIMNEY.h - 0.25 - k * 0.5, CHIMNEY.z, 0.14, 0.2, 0.14, 0xe03131, 0, "cyl");
    // Transformers and a pylon.
    for (let k = 0; k < 3; k++) B(c - 0.75 + k * 0.22, 0.09, c + 0.65, 0.14, 0.16, 0.12, 0x868e96);
    B(c - 0.5, 0.09, c + 0.25, 0.04, 0.9, 0.04, 0x495057);
    B(c - 0.5, 0.85, c + 0.25, 0.42, 0.03, 0.03, 0x495057);
    B(c - 0.5, 0.7, c + 0.25, 0.3, 0.03, 0.03, 0x495057);
    return;
  }
  if (type === "dam") {
    // The reservoir behind the wall, banks either side.
    B(c, 0.09, c - 0.5, 1.9, 0.42, 0.9, 0x3d86c6, 0, "water");
    B(c - 0.9, 0.09, c - 0.5, 0.2, 0.5, 0.95, 0x8cc178);
    B(c + 0.9, 0.09, c - 0.5, 0.2, 0.5, 0.95, 0x8cc178);
    // The wall with a road along the top, and a little control house.
    B(c, 0.09, c - 0.0, 1.98, 0.56, 0.16, 0xbfc4ca);
    B(c, 0.65, c - 0.0, 1.98, 0.03, 0.2, 0x868e96);
    B(c - 0.7, 0.68, c - 0.0, 0.2, 0.16, 0.16, 0xf1f3f5);
    // The spillway: a chute of white water down the face, into a channel below.
    B(c - 0.22, 0.09, c + 0.25, 0.06, 0.4, 0.5, 0xadb5bd);
    B(c + 0.22, 0.09, c + 0.25, 0.06, 0.4, 0.5, 0xadb5bd);
    B(c, 0.38, c + 0.22, 0.72, 0.025, 0.36, 0xdff1ff, Math.PI / 2, "water", 0.87);
    B(c, 0.09, c + 0.7, 0.46, 0.03, 0.62, 0x5aa9e0, 0, "water");
    return;
  }
  // The oil rig: open water, a platform on yellow legs, a derrick, a helipad, and the flare boom.
  B(c, 0.0, c, 1.98, 0.1, 1.98, 0x2f74b5, 0, "water");
  for (const [lx, lz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) B(c + lx, 0.02, c + lz, 0.12, 0.72, 0.12, 0xf2b705, 0, "cyl");
  B(c, 0.72, c, 1.2, 0.12, 1.2, 0x868e96);
  B(c - 0.3, 0.84, c + 0.3, 0.45, 0.26, 0.4, 0xf1f3f5);
  B(c - 0.3, 0.98, c + 0.3, 0.46, 0.05, 0.41, 0x4c6e91, 0, "glass");
  B(c + 0.05, 0.84, c + 0.42, 0.22, 0.2, 0.25, 0xff7a1a);
  // Derrick
  B(c - 0.22, 0.84, c - 0.22, 0.4, 0.12, 0.4, 0x495057);
  B(c - 0.22, 0.96, c - 0.22, 0.28 / Math.SQRT2, 1.0, 0.28 / Math.SQRT2, 0xced4da, 0, "roof");
  for (const y of [0.3, 0.6]) B(c - 0.22, 0.96 + y, c - 0.22, 0.28 * (1 - y) + 0.02, 0.025, 0.28 * (1 - y) + 0.02, 0xe03131);
  // Helipad
  B(c + 0.33, 0.84, c + 0.3, 0.42, 0.03, 0.42, 0x343a40, 0, "cyl");
  B(c + 0.33, 0.875, c + 0.3, 0.04, 0.004, 0.18, 0xffffff, 0, "paint");
  B(c + 0.29, 0.875, c + 0.3, 0.04, 0.004, 0.18, 0xffffff, 0, "paint");
  B(c + 0.37, 0.875, c + 0.3, 0.04, 0.004, 0.18, 0xffffff, 0, "paint");
  // Flare boom, angled up and out over the sea.
  B(c + 0.55, 0.84, FLARE.z, 0.68, 0.035, 0.035, 0x868e96, 0, "building", Math.PI / 4.4);
  // Lifeboats
  B(c - 0.62, 0.7, c - 0.1, 0.06, 0.06, 0.2, 0xff7a1a);
  B(c - 0.62, 0.7, c + 0.15, 0.06, 0.06, 0.2, 0xff7a1a);
}

type Emitter = { x: number; y: number; z: number; kind: "steam" | "smoke" | "spray" | "flare"; tile: number; size: number };

/** Where this tile's big building puffs out steam or smoke, sprays water, or burns gas. */
export function industryEmitters(t: Tile): Emitter[] {
  const st = t.structure;
  if (!st?.anchor) return [];
  if (st.type === "power") {
    return [
      ...TOWERS.map((w) => ({ x: t.x + w.x, y: 0.09 + w.h, z: t.z + w.z, kind: "steam" as const, tile: t.i, size: 1 })),
      { x: t.x + CHIMNEY.x, y: 0.09 + CHIMNEY.h, z: t.z + CHIMNEY.z, kind: "smoke", tile: t.i, size: 0.5 },
    ];
  }
  if (st.type === "dam") return [{ x: t.x + c, y: 0.12, z: t.z + c + 0.42, kind: "spray", tile: t.i, size: 0.6 }];
  if (st.type === "oilrig") return [{ x: t.x + FLARE.x, y: FLARE.y, z: t.z + FLARE.z, kind: "flare", tile: t.i, size: 1 }];
  return [];
}

const SLOTS = { steam: 9, smoke: 6, spray: 7, flare: 0 } as const;

export function createPlumes(world: World, parent: THREE.Object3D) {
  const puffGeo = new THREE.IcosahedronGeometry(0.5, 1);
  const puffMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, flatShading: true, depthWrite: false });
  const flameGeo = new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  let puffs: THREE.InstancedMesh | null = null;
  let flames: THREE.InstancedMesh | null = null;
  let emitters: Emitter[] = [];
  let slots: { e: number; k: number; n: number; r: number }[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const color = new THREE.Color();

  function clear() {
    for (const m of [puffs, flames]) {
      if (!m) continue;
      parent.remove(m);
      m.dispose();
    }
    puffs = flames = null;
  }

  function build() {
    clear();
    emitters = world.tiles.flatMap((t) => industryEmitters(t));
    slots = [];
    emitters.forEach((em, e) => {
      const n = SLOTS[em.kind];
      for (let k = 0; k < n; k++) slots.push({ e, k, n, r: Math.random() });
    });
    const flareCount = emitters.filter((e) => e.kind === "flare").length;
    if (slots.length) {
      puffs = new THREE.InstancedMesh(puffGeo, puffMat, slots.length);
      slots.forEach((sl, i) => {
        const kind = emitters[sl.e].kind;
        puffs!.setColorAt(i, color.setHex(kind === "smoke" ? 0x9aa1aa : kind === "spray" ? 0xf4fbff : 0xf8f9fa));
      });
      puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      puffs.frustumCulled = false;
      puffs.renderOrder = 4;
      parent.add(puffs);
    }
    if (flareCount) {
      // Two cones per flare: orange outside, yellow inside.
      flames = new THREE.InstancedMesh(flameGeo, flameMat, flareCount * 2);
      for (let k = 0; k < flareCount; k++) {
        flames.setColorAt(k * 2, color.setHex(0xff6a1a));
        flames.setColorAt(k * 2 + 1, color.setHex(0xffe066));
      }
      flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      flames.frustumCulled = false;
      flames.renderOrder = 5;
      parent.add(flames);
    }
  }

  function update(time: number, now: number) {
    if (puffs) {
      for (let i = 0; i < slots.length; i++) {
        const sl = slots[i];
        const em = emitters[sl.e];
        const show = grown(world, em.tile, now);
        let life: number;
        if (em.kind === "spray") {
          // Foam bubbling up and falling back where the spillway hits the channel.
          life = (time * 0.9 + sl.k / sl.n + sl.r * 0.2) % 1;
          const a = sl.r * Math.PI * 2 + sl.k;
          v.set(em.x + Math.cos(a) * 0.15 * life, em.y + Math.sin(life * Math.PI) * 0.16, em.z + Math.sin(a) * 0.1 + life * 0.15);
          const sz = em.size * 0.22 * Math.sin(life * Math.PI);
          s.setScalar(show ? Math.max(0.0001, sz) : 0.0001);
        } else {
          // Steam and smoke: rise, drift with the wind, swell, then thin away.
          const speed = em.kind === "steam" ? 0.12 : 0.16;
          life = (time * speed + sl.k / sl.n + sl.r * 0.05) % 1;
          const rise = em.kind === "steam" ? 2.4 : 2.0;
          v.set(em.x + life * 0.9 + Math.sin(sl.r * 9 + time * 0.3) * 0.08, em.y + life * rise, em.z + life * 0.35);
          const grow = em.kind === "steam" ? 0.35 + life * 0.95 : 0.12 + life * 0.55;
          const fade = Math.min(1, life * 6) * (1 - Math.pow(life, 3));
          s.setScalar(show ? Math.max(0.0001, grow * fade * em.size * (em.kind === "steam" ? 1 : 1.3)) : 0.0001);
        }
        q.identity();
        m4.compose(v, q, s);
        puffs.setMatrixAt(i, m4);
      }
      puffs.instanceMatrix.needsUpdate = true;
    }
    if (flames) {
      let k = 0;
      for (const em of emitters) {
        if (em.kind !== "flare") continue;
        const show = grown(world, em.tile, now) ? 1 : 0.0001;
        const flick = 1 + Math.sin(time * 17 + k) * 0.12 + Math.sin(time * 29) * 0.08;
        const lean = Math.sin(time * 1.3) * 0.15 + 0.25;
        q.setFromAxisAngle(v.set(0, 0, 1), -lean);
        m4.compose(v.set(em.x, em.y, em.z), q, s.set(0.16 * show, 0.42 * flick * show, 0.16 * show));
        flames.setMatrixAt(k * 2, m4);
        m4.compose(v.set(em.x, em.y, em.z), q, s.set(0.08 * show, 0.26 * flick * show, 0.08 * show));
        flames.setMatrixAt(k * 2 + 1, m4);
        k++;
      }
      flames.instanceMatrix.needsUpdate = true;
    }
  }

  function dispose() {
    clear();
    puffGeo.dispose();
    puffMat.dispose();
    flameGeo.dispose();
    flameMat.dispose();
  }

  return { build, update, dispose };
}
