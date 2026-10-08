// Boats cruising up and down the river: little river buses with a coloured cabin. Each one runs
// along its side of the river and turns round smoothly at the ends of the built stretch (no
// jumping back to the start), so you can ride one: the city view asks where it is (pose).

import * as THREE from "three";
import { riverCentre } from "@/lib/city/layout";
import type { VehiclePose } from "./traffic";
import { keyOf, type World } from "./world";

type Boat = { obj: THREE.Group; pos: number; dir: number; speed: number; side: number; yaw: number; turn: number; k: number };

export function createBoats(world: World, parent: THREE.Object3D) {
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const cabinMats = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2, 0xff922b].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const hullGeo = new THREE.BoxGeometry(0.42, 0.08, 0.16).translate(0, 0.04, 0);
  const bowGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.08, 3, 1).rotateY(Math.PI / 6).scale(1.1, 1, 1).translate(0.21, 0.04, 0);
  const cabinGeo = new THREE.BoxGeometry(0.18, 0.06, 0.12).translate(-0.04, 0.11, 0);
  const roofGeo = new THREE.BoxGeometry(0.22, 0.012, 0.15).translate(-0.04, 0.146, 0);
  let boats: Boat[] = [];
  let lo = 0;
  let hi = 0;
  let ride = -1;

  function clear() {
    for (const b of boats) parent.remove(b.obj);
    boats = [];
  }

  function build() {
    clear();
    const plan = world.plan;
    if (!plan?.river) return;
    const along = plan.river.along;
    let min = Infinity;
    let max = -Infinity;
    for (const t of world.tiles) {
      if (t.kind !== "river" && t.kind !== "bridge") continue;
      const a = along === "x" ? t.x : t.z;
      min = Math.min(min, a);
      max = Math.max(max, a);
    }
    if (!Number.isFinite(min) || max - min < 3) return;
    lo = min + 0.2;
    hi = max - 0.2;
    const n = Math.min(5, 2 + Math.floor((max - min) / 8));
    for (let k = 0; k < n; k++) {
      const obj = new THREE.Group();
      const hull = new THREE.Mesh(hullGeo, hullMat);
      const bow = new THREE.Mesh(bowGeo, hullMat);
      const cabin = new THREE.Mesh(cabinGeo, cabinMats[k % cabinMats.length]);
      const roof = new THREE.Mesh(roofGeo, hullMat);
      hull.castShadow = cabin.castShadow = true;
      obj.add(hull, bow, cabin, roof);
      const dir = k % 2 ? 1 : -1;
      boats.push({ obj, pos: lo + ((k + 0.5) / n) * (hi - lo), dir, speed: 0.22 + (k % 3) * 0.05, side: 0.17, yaw: 0, turn: 0, k });
      parent.add(obj);
    }
  }

  /** Where boat b is (into out), smoothly turning round at the ends. */
  function place(b: Boat, time: number, out: VehiclePose) {
    const plan = world.plan!;
    const along = plan.river!.along;
    // Turning round: swing across the river in a half circle.
    const swing = b.turn > 0 ? 1 - b.turn / 3 : 0;
    const lane = b.side * (b.turn > 0 ? Math.cos(swing * Math.PI) : 1) * b.dir;
    const c = riverCentre(plan, b.pos) + lane;
    const ahead = 0.15 * b.dir;
    const c2 = riverCentre(plan, b.pos + ahead) + lane;
    let dx = along === "x" ? ahead : c2 - c;
    let dz = along === "x" ? c2 - c : ahead;
    if (b.turn > 0) {
      // Point round the turn: the heading rotates half a circle as it swings across.
      const a = Math.atan2(dz, dx) + Math.PI * swing;
      dx = Math.cos(a);
      dz = Math.sin(a);
    }
    out.x = along === "x" ? b.pos : c;
    out.z = along === "x" ? c : b.pos;
    out.y = 0.03 + Math.sin(time * 1.6 + b.k) * 0.006;
    out.yaw = Math.atan2(-dx, -dz);
    out.speed = b.turn > 0 ? 0.1 : b.speed;
    return Math.atan2(-dz, dx);
  }

  const tmp: VehiclePose = { x: 0, y: 0, z: 0, yaw: 0, speed: 0 };
  function update(time: number, dt: number) {
    const plan = world.plan;
    if (!plan?.river) return;
    for (const b of boats) {
      if (b.turn > 0) {
        b.turn -= dt;
        if (b.turn <= 0) {
          b.turn = 0;
          b.dir = -b.dir;
        }
      } else {
        b.pos += b.speed * b.dir * dt;
        if ((b.dir > 0 && b.pos >= hi) || (b.dir < 0 && b.pos <= lo)) {
          b.pos = Math.max(lo, Math.min(hi, b.pos));
          b.turn = 3;
        }
      }
      const yaw = place(b, time, tmp);
      b.obj.position.set(tmp.x, tmp.y, tmp.z);
      b.obj.rotation.y = yaw;
      const onWater = world.kindAt.get(keyOf(Math.round(tmp.x), Math.round(tmp.z)));
      b.obj.visible = b.k !== ride && (onWater === "river" || onWater === "bridge");
    }
  }

  function pose(k: number, time: number, out: VehiclePose) {
    const b = boats[k];
    if (!b || !world.plan?.river) return false;
    place(b, time, out);
    return true;
  }

  function setRide(k: number) {
    ride = k;
  }

  function dispose() {
    clear();
    for (const g of [hullGeo, bowGeo, cabinGeo, roofGeo]) g.dispose();
    hullMat.dispose();
    for (const m of cabinMats) m.dispose();
  }

  return { build, update, pose, setRide, dispose, get count() { return boats.length; } };
}
