// Traffic on a real place's bridges and flyovers (Third Mainland, Carter, Eko, the Lekki–Ikoyi
// Link...): the decks are drawn along their real curves above the water and the streets
// (src/lib/world/spans), off the street grid the rest of the traffic drives, so these cars run
// along each deck's own path instead, both ways, keeping right, on and off at its ramps. Only the
// decks in the part of the map being drawn get cars. Two instanced meshes.

import * as THREE from "three";
import type { RegionMap } from "@/lib/world/compile";
import { keyOf, rushHour, type World } from "./world";

type Route = { pts: { x: number; y: number; z: number }[]; at: number[]; len: number; width: number };
type DeckCar = { route: number; s: number; dir: 1 | -1; speed: number };

/** Cars per tile of deck, each way (more in the rush hour). */
const PER_TILE = 0.32;
const MAX = 260;

export function createDeckTraffic(world: World, parent: THREE.Object3D) {
  const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const topMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  let routes: Route[] = [];
  let cars: DeckCar[] = [];
  let body: THREE.InstancedMesh | null = null;
  let top: THREE.InstancedMesh | null = null;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const off = new THREE.Vector3();
  const color = new THREE.Color();

  function clear() {
    for (const m of [body, top]) {
      if (!m) continue;
      parent.remove(m);
      m.dispose();
    }
    body = top = null;
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
    body = new THREE.InstancedMesh(boxGeo, bodyMat, cars.length);
    top = new THREE.InstancedMesh(boxGeo, topMat, cars.length);
    body.castShadow = true;
    cars.forEach((_, k) => {
      body!.setColorAt(k, color.setHex(k % 9 === 0 ? 0xffd43b : palette[k % palette.length] ?? 0xe5484d));
      top!.setColorAt(k, color.setHex(0xe9f2fb));
    });
    for (const m of [body, top]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
    }
    parent.add(body, top);
  }

  function update(dt: number) {
    if (!body || !top) return;
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
      m4.compose(pos, q, scl.set(0.3, 0.09, 0.15));
      body.setMatrixAt(k, m4);
      pos.y += 0.09;
      pos.x -= fx * 0.02;
      pos.z -= fz * 0.02;
      m4.compose(pos, q, scl.set(0.16, 0.06, 0.13));
      top.setMatrixAt(k, m4);
    }
    body.instanceMatrix.needsUpdate = true;
    top.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    clear();
    boxGeo.dispose();
    bodyMat.dispose();
    topMat.dispose();
  }

  return { build, update, dispose };
}
