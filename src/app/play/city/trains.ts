// The railway: a viaduct on legs above one long street (with a station part way along), and
// two trains (an engine and carriages) shuttling back and forth on it, one on each track,
// stopping at the station. Windows light up at night. The viaduct itself is drawn with the
// rest of the city (railParts, below); the trains are three instanced meshes.

import * as THREE from "three";
import type { CityPlan, Tile } from "@/lib/city/layout";
import type { VehiclePose } from "./traffic";
import { grown, keyOf, type World } from "./world";

/** Height of the top of the track. */
export const RAIL_Y = 1.1;

type PartSpec = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; color: number; tilt?: number };

/** The viaduct over one tile: deck, parapets, sleepers, rails, legs, and the station. */
export function railParts(t: Tile, plan: CityPlan, add: (mesh: string, p: PartSpec) => void) {
  const rail = plan.rail;
  if (!rail || !t.rail) return;
  const alongZ = rail.along === "z";
  // a = along the line, c = across it.
  const at = (a: number, c: number) => (alongZ ? { x: t.x + c, z: t.z + a } : { x: t.x + a, z: t.z + c });
  const ry = alongZ ? Math.PI / 2 : 0;
  const P = (mesh: string, a: number, y: number, c: number, la: number, sy: number, lc: number, color: number) =>
    add(mesh, { ...at(a, c), y, sx: la, sy, sz: lc, ry, color });
  const deck = RAIL_Y - 0.1;
  P("building", 0, deck - 0.02, 0, 1.0, 0.1, 0.5, 0xc9ccd1);
  P("ground", 0, deck + 0.075, 0, 1.0, 0.01, 0.44, 0x8a8178);
  for (const c of [-0.245, 0.245]) P("building", 0, deck + 0.08, c, 1.0, 0.07, 0.03, 0xb4b9c0);
  for (let k = 0; k < 5; k++) P("paint", -0.4 + k * 0.2, deck + 0.085, 0, 0.05, 0.012, 0.4, 0x6b4f35);
  for (const c of [-0.15, -0.05, 0.05, 0.15]) P("paint", 0, deck + 0.097, c, 1.0, 0.014, 0.014, 0xadb5bd);
  // Legs, except where a street crosses underneath (or over the river).
  const junction = t.kind === "bridge" || t.kind === "river" || (t.kind === "road" && (t.road === "cross" || t.roundabout));
  if (!junction) {
    for (const c of [-0.44, 0.44]) P("building", 0, 0.06, c, 0.09, deck - 0.04, 0.09, 0xbfc4ca);
    P("building", 0, deck - 0.1, 0, 0.12, 0.08, 0.98, 0xbfc4ca);
  }
  if (t.station) {
    // Platforms either side, a canopy on posts, and on the middle tile a stair tower and a sign.
    for (const c of [-0.33, 0.33]) {
      P("building", 0, deck - 0.02, c, 1.0, 0.13, 0.16, 0xdee2e6);
      P("paint", 0, deck + 0.111, c > 0 ? c - 0.07 : c + 0.07, 1.0, 0.004, 0.02, 0xffd43b);
      for (const a of [-0.3, 0.3]) P("trunk", a, deck + 0.11, c > 0 ? c + 0.05 : c - 0.05, 0.25, 0.42, 0.25, 0x495057);
    }
    P("building", 0, deck + 0.53, 0, 1.04, 0.035, 0.92, 0x1971c2);
    P("glass", 0, deck + 0.5, 0, 1.0, 0.03, 0.86, 0xa5d8ff);
    const along = alongZ ? t.z : t.x;
    if (along === rail.station) {
      P("building", 0, 0.06, 0.58, 0.36, deck + 0.05, 0.2, 0xb5523b);
      P("glass", 0, 0.3, 0.58, 0.37, 0.06, 0.21, 0x5d7fa3);
      P("glass", 0, 0.6, 0.58, 0.37, 0.06, 0.21, 0x5d7fa3);
      P("building", 0, deck + 0.57, 0, 0.42, 0.13, 0.04, 0xffffff);
      P("paint", 0, deck + 0.6, 0.025, 0.36, 0.07, 0.005, 0x1971c2);
      P("paint", 0, deck + 0.6, -0.025, 0.36, 0.07, 0.005, 0x1971c2);
    }
  }
}

type Train = {
  /** Centre of the train along the line, which way it's going, and how long to wait. */
  pos: number;
  dir: number;
  speed: number;
  wait: number;
  /** Already stopped at the station on this run. */
  called: boolean;
  track: number;
  cars: number;
  body: number;
};

const CAR = 0.78;
const GAP = 0.06;
const MAX_SPEED = 1.5;
const ACCEL = 0.55;

export function createTrains(world: World, parent: THREE.Object3D) {
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const windowMat = new THREE.MeshLambertMaterial({ color: 0x2b3a4f, emissive: 0x0b1a2a, emissiveIntensity: 0.3 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x868e96 });
  let body: THREE.InstancedMesh | null = null;
  let windows: THREE.InstancedMesh | null = null;
  let roofs: THREE.InstancedMesh | null = null;
  let trains: Train[] = [];
  let lo = 0;
  let hi = 0;
  let station: number | null = null;
  let along: "x" | "z" = "x";
  let at = 0;
  let total = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const color = new THREE.Color();
  const DAY = new THREE.Color(0x0b1a2a);
  const NIGHT = new THREE.Color(0xffd27a);

  function clear() {
    for (const m of [body, windows, roofs]) {
      if (!m) continue;
      parent.remove(m);
      m.dispose();
    }
    body = windows = roofs = null;
    trains = [];
  }

  function build() {
    clear();
    const rail = world.plan?.rail;
    if (!rail) return;
    along = rail.along;
    at = rail.at;
    station = rail.station;
    let min = Infinity;
    let max = -Infinity;
    for (const t of world.tiles) {
      if (!t.rail) continue;
      const a = along === "z" ? t.z : t.x;
      min = Math.min(min, a);
      max = Math.max(max, a);
    }
    if (!Number.isFinite(min) || max - min < 5) return;
    lo = min - 0.4;
    hi = max + 0.4;
    const len = hi - lo;
    const cars = len > 12 ? 4 : len > 8 ? 3 : 2;
    const tl = cars * CAR + (cars - 1) * GAP;
    if (tl > len - 1) return;
    const liveries = [0xe03131, 0x1971c2, 0x2f9e44, 0xf08c00];
    const livery = liveries[Math.floor(((world.plan?.seed ?? 0) * 0.618) % 1 * liveries.length) % liveries.length] ?? liveries[0];
    trains = [
      { pos: lo + tl / 2, dir: 1, speed: 0, wait: 2, called: false, track: 1, cars, body: livery },
      { pos: hi - tl / 2, dir: -1, speed: 0, wait: 9, called: false, track: -1, cars, body: livery },
    ];
    total = trains.reduce((n, t) => n + t.cars, 0);
    body = new THREE.InstancedMesh(bodyGeo, bodyMat, total);
    windows = new THREE.InstancedMesh(bodyGeo, windowMat, total);
    roofs = new THREE.InstancedMesh(bodyGeo, roofMat, total);
    let k = 0;
    for (const tr of trains) {
      for (let c = 0; c < tr.cars; c++, k++) body.setColorAt(k, color.setHex(c === 0 ? tr.body : 0xf1f3f5));
    }
    for (const m of [body, windows, roofs]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      parent.add(m);
    }
    body.castShadow = true;
  }

  function length(tr: Train) {
    return tr.cars * CAR + (tr.cars - 1) * GAP;
  }

  function step(tr: Train, dt: number) {
    if (tr.wait > 0) {
      tr.wait -= dt;
      return;
    }
    const half = length(tr) / 2;
    const end = tr.dir > 0 ? hi - half : lo + half;
    // Where to stop next: the station (once per run), or the end of the line.
    let stop = end;
    if (station !== null && !tr.called && (station - tr.pos) * tr.dir > 0.02) stop = station;
    const dist = Math.abs(stop - tr.pos);
    const target = Math.min(MAX_SPEED, Math.sqrt(2 * ACCEL * dist));
    tr.speed = tr.speed < target ? Math.min(target, tr.speed + ACCEL * dt) : target;
    const move = Math.min(dist, Math.max(0.02 * dt, tr.speed * dt));
    tr.pos += move * tr.dir;
    if (Math.abs(stop - tr.pos) < 0.005) {
      tr.pos = stop;
      tr.speed = 0;
      if (stop === end) {
        tr.dir = -tr.dir;
        tr.called = false;
        tr.wait = 7;
      } else {
        tr.called = true;
        tr.wait = 5;
      }
    }
  }

  function update(dt: number, now: number) {
    if (!body || !windows || !roofs) return;
    color.copy(DAY).lerp(NIGHT, world.night);
    windowMat.emissive.copy(color);
    windowMat.emissiveIntensity = 0.3 + world.night * 0.9;
    q.setFromAxisAngle(up, along === "z" ? Math.PI / 2 : 0);
    let k = 0;
    for (const tr of trains) {
      step(tr, dt);
      const L = length(tr);
      // Hide the train until the stretch of viaduct under it has risen.
      const mid = Math.round(tr.pos);
      const tile = world.tileIndex.get(along === "z" ? keyOf(at, mid) : keyOf(mid, at));
      const show = tile !== undefined && grown(world, tile, now);
      for (let c = 0; c < tr.cars; c++, k++) {
        const a = tr.pos - L / 2 + CAR / 2 + c * (CAR + GAP);
        const cross = tr.track * 0.1;
        const x = along === "z" ? at + cross : a;
        const z = along === "z" ? a : at + cross;
        const sc = show ? 1 : 0.0001;
        const engine = c === 0;
        m4.compose(v.set(x, RAIL_Y + 0.02, z), q, s.set(CAR * sc, 0.15 * sc, 0.17 * sc));
        body.setMatrixAt(k, m4);
        // A band of windows (the engine just has its cab windows at the front).
        const wl = engine ? 0.16 : CAR - 0.1;
        const wa = engine ? a - CAR / 2 + 0.1 : a;
        const wx = along === "z" ? at + cross : wa;
        const wz = along === "z" ? wa : at + cross;
        m4.compose(v.set(wx, RAIL_Y + 0.09, wz), q, s.set(wl * sc, 0.045 * sc, 0.176 * sc));
        windows.setMatrixAt(k, m4);
        m4.compose(v.set(x, RAIL_Y + 0.17, z), q, s.set((CAR - 0.04) * sc, 0.025 * sc, 0.15 * sc));
        roofs.setMatrixAt(k, m4);
      }
    }
    body.instanceMatrix.needsUpdate = true;
    windows.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
  }

  /**
   * Where carriage `car` of train i is (its floor middle); yaw faces along the line (+x or +z),
   * whichever way the train is going. False if there's no such train.
   */
  function pose(i: number, out: VehiclePose, car = 1) {
    const tr = trains[i];
    if (!tr) return false;
    const L = length(tr);
    const c = Math.min(car, tr.cars - 1);
    const a = tr.pos - L / 2 + CAR / 2 + c * (CAR + GAP);
    const cross = tr.track * 0.1;
    out.x = along === "z" ? at + cross : a;
    out.z = along === "z" ? a : at + cross;
    out.y = RAIL_Y + 0.02;
    out.yaw = along === "z" ? Math.PI : -Math.PI / 2;
    out.speed = tr.speed * tr.dir;
    return true;
  }

  function dispose() {
    clear();
    bodyGeo.dispose();
    bodyMat.dispose();
    windowMat.dispose();
    roofMat.dispose();
  }

  return { build, update, pose, dispose, get count() { return trains.length; } };
}
