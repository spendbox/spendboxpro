// Traffic on a real place's bridges and flyovers (Third Mainland, Carter, Eko, the Lekki–Ikoyi
// Link...): the decks are drawn along their real curves above the water and the streets
// (src/lib/world/spans), off the street grid the rest of the traffic drives, so these cars run
// along each deck's own path instead, both ways, keeping right, on and off at its ramps. Only the
// decks in the part of the map being drawn get cars: saloons, taxis and danfos from the game's own
// designs (city/vehicles.ts, light versions), one instanced mesh per design and colour.

import * as THREE from "three";
import type { RegionMap } from "@/lib/world/compile";
import { keyOf, rushHour, type World } from "./world";
import { Kit } from "./kit";
import { carKit, danfoKit, lite } from "./vehicles";

type Route = { pts: { x: number; y: number; z: number }[]; at: number[]; len: number; width: number };
type DeckCar = { route: number; s: number; dir: 1 | -1; speed: number };

/** Cars per tile of deck, each way (more in the rush hour). */
const PER_TILE = 0.32;
const MAX = 260;

export function createDeckTraffic(world: World, parent: THREE.Object3D) {
  const solidMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  let routes: Route[] = [];
  let cars: DeckCar[] = [];
  type Model = { meshes: THREE.InstancedMesh[]; scale: number };
  let models: Model[] = [];
  let slots: { m: Model; i: number }[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const off = new THREE.Vector3();

  function clear() {
    for (const md of models)
      for (const m of md.meshes) {
        parent.remove(m);
        m.geometry.dispose();
        m.dispose();
      }
    models = [];
    slots = [];
  }

  /** Cars for the decks in the part of the map being drawn. */
  function build(region: RegionMap | null | undefined, palette: number[]) {
    clear();
    routes = [];
    cars = [];
    if (!region?.decks.length) return;
    const drawn = (x: number, z: number) => world.kindAt.has(keyOf(Math.round(x), Math.round(z)));
    for (const d of region.decks) {
      if (!d.pts.some((p) => drawn(p.x, p.z))) continue;
      const at = [0];
      for (let k = 1; k < d.pts.length; k++) at.push(at[k - 1] + Math.hypot(d.pts[k].x - d.pts[k - 1].x, d.pts[k].z - d.pts[k - 1].z));
      const len = at[at.length - 1];
      if (len > 0.5) routes.push({ pts: d.pts, at, len, width: d.width });
    }
    const busy = PER_TILE * (1 + rushHour() * 0.8);
    for (let r = 0; r < routes.length && cars.length < MAX; r++) {
      const each = Math.max(1, Math.round(routes[r].len * busy));
      for (let k = 0; k < each * 2 && cars.length < MAX; k++) {
        cars.push({ route: r, s: Math.random() * routes[r].len, dir: k % 2 ? 1 : -1, speed: 0.9 + Math.random() * 0.7 });
      }
    }
    if (!cars.length) return;
    // Each car's design: a taxi now and then, a danfo, else a saloon in the city's colours.
    const keyOf_ = (k: number) => (k % 9 === 0 ? "taxi" : k % 7 === 3 ? "danfo" : `car:${palette[k % palette.length] ?? 0xe5484d}`);
    const keys = cars.map((_, k) => keyOf_(k));
    const count = new Map<string, number>();
    for (const key of keys) count.set(key, (count.get(key) ?? 0) + 1);
    const byKey = new Map<string, Model & { used: number }>();
    for (const [key, n] of count) {
      const kk = new Kit();
      lite(() => {
        if (key === "taxi") carKit(kk, 0xf5c518, "taxi");
        else if (key === "danfo") danfoKit(kk);
        else carKit(kk, Number(key.slice(4)));
      });
      const meshes: THREE.InstancedMesh[] = [];
      for (const [layer, mat] of [["solid", solidMat], ["glow", glowMat]] as const) {
        const g = kk.take(layer);
        if (!g) continue;
        const m = new THREE.InstancedMesh(g, mat, n);
        m.castShadow = layer === "solid";
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        parent.add(m);
        meshes.push(m);
      }
      const md = { meshes, scale: key === "danfo" ? 0.066 : 0.068, used: 0 };
      byKey.set(key, md);
      models.push(md);
    }
    slots = keys.map((key) => {
      const md = byKey.get(key)!;
      return { m: md, i: md.used++ };
    });
  }

  function update(dt: number) {
    if (!slots.length) return;
    for (let k = 0; k < cars.length; k++) {
      const c = cars[k];
      const r = routes[c.route];
      c.s += c.dir * c.speed * dt;
      // At an end of the deck: turn round and come back the other way (jumping to the far end
      // made cars pop out of thin air where a deck joins another one).
      if (c.s > r.len) {
        c.s = 2 * r.len - c.s;
        c.dir = c.dir === 1 ? -1 : 1;
      }
      if (c.s < 0) {
        c.s = -c.s;
        c.dir = c.dir === 1 ? -1 : 1;
      }
      let i = 1;
      while (i < r.at.length - 1 && r.at[i] < c.s) i++;
      const a = r.pts[i - 1];
      const b = r.pts[i];
      const seg = Math.max(1e-6, r.at[i] - r.at[i - 1]);
      const t = Math.min(1, Math.max(0, (c.s - r.at[i - 1]) / seg));
      const fx = ((b.x - a.x) / seg) * c.dir;
      const fz = ((b.z - a.z) / seg) * c.dir;
      // Keep right: the lane on the right of the way it's going.
      const lane = r.width * 0.22;
      off.set(-fz * lane, 0, fx * lane);
      pos.set(a.x + (b.x - a.x) * t + off.x, a.y + (b.y - a.y) * t + 0.01, a.z + (b.z - a.z) * t + off.z);
      q.setFromAxisAngle(up, Math.atan2(-fz, fx));
      const sl = slots[k];
      m4.compose(pos, q, scl.setScalar(sl.m.scale));
      for (const m of sl.m.meshes) m.setMatrixAt(sl.i, m4);
    }
    for (const md of models) for (const m of md.meshes) m.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    clear();
    solidMat.dispose();
    glowMat.dispose();
  }

  return { build, update, dispose };
}
