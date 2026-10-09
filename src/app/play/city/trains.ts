// The railway: a viaduct on legs above one long street (with a station part way along), and
// two trains (an engine and carriages) shuttling back and forth on it, one on each track,
// stopping at the station. Windows light up at night. The viaduct itself is drawn with the
// rest of the city (railParts, below); the trains are three instanced meshes.

import * as THREE from "three";
import { railCentre, railRow, type CityPlan, type Tile } from "@/lib/city/layout";
import type { VehiclePose } from "./traffic";
import { grown, keyOf, type World } from "./world";

/** Height of the top of the track. */
export const RAIL_Y = 1.1;

type PartSpec = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; color: number; tilt?: number };

/**
 * Where the line is at a position along it: the point (x, z), which way it runs (dx, dz, a unit
 * vector, pointing the +along way) and the way across (nx, nz).
 */
export function railFrame(plan: CityPlan, a: number) {
  const r = plan.rail!;
  const c = railCentre(plan, a);
  const slope = (r.amp / r.wave) * Math.cos(a / r.wave + r.phase);
  const n = Math.hypot(1, slope);
  const ua = 1 / n;
  const uc = slope / n;
  // In (along, across) terms; turned into (x, z) for lines along z.
  return r.along === "z"
    ? { x: c, z: a, dx: uc, dz: ua, nx: ua, nz: -uc, slope }
    : { x: a, z: c, dx: ua, dz: uc, nx: -uc, nz: ua, slope };
}

/**
 * The viaduct for one step along the line (drawn by the tile the line passes over): the deck
 * following the curve, parapets, sleepers, rails and legs; on the station's tiles, platforms and
 * a big glass hall vaulted right over the line and the squares either side.
 */
export function railParts(t: Tile, plan: CityPlan, add: (mesh: string, p: PartSpec) => void) {
  const rail = plan.rail;
  if (!rail || !t.rail) return;
  const a = rail.along === "z" ? t.z : t.x;
  const f = railFrame(plan, a);
  const ry = Math.atan2(-f.dz, f.dx);
  const seg = Math.hypot(1, f.slope) + 0.04;
  // A piece at (u along, c across) from the line's point, in its own turned frame.
  const P = (mesh: string, u: number, y: number, c: number, la: number, sy: number, lc: number, color: number, tilt = 0, turn = 0) =>
    add(mesh, { x: f.x + u * f.dx + c * f.nx, y, z: f.z + u * f.dz + c * f.nz, sx: la, sy, sz: lc, ry: ry + turn, color, tilt });
  const deck = RAIL_Y - 0.1;
  P("building", 0, deck - 0.02, 0, seg, 0.1, 0.5, 0xc9ccd1);
  P("ground", 0, deck + 0.075, 0, seg, 0.01, 0.44, 0x8a8178);
  for (const c of [-0.245, 0.245]) P("building", 0, deck + 0.08, c, seg, 0.07, 0.03, 0xb4b9c0);
  for (let k = 0; k < 5; k++) P("paint", -0.4 + k * 0.2, deck + 0.085, 0, 0.05, 0.012, 0.4, 0x6b4f35);
  for (const c of [-0.15, -0.05, 0.05, 0.15]) P("paint", 0, deck + 0.097, c, seg, 0.014, 0.014, 0xadb5bd);
  // Legs, except where it passes over a road (it spans those).
  const overRoad = t.kind === "road" || t.kind === "bridge";
  if (!overRoad) {
    for (const c of [-0.18, 0.18]) P("building", 0, t.kind === "river" || t.kind === "lake" ? -0.05 : 0.06, c, 0.09, deck - 0.02, 0.09, 0xbfc4ca);
    P("building", 0, deck - 0.1, 0, 0.12, 0.08, 0.5, 0xbfc4ca);
  }
  if (t.station) {
    // Platforms either side.
    for (const c of [-0.33, 0.33]) {
      P("building", 0, deck - 0.02, c, seg, 0.13, 0.16, 0xdee2e6);
      P("paint", 0, deck + 0.111, c > 0 ? c - 0.07 : c + 0.07, seg, 0.004, 0.02, 0xffd43b);
    }
    // The glass hall: a vault of glass panels on iron ribs, springing from columns on the squares
    // either side, high enough for the trains to run through underneath.
    const R = 1.38;
    const H = 0.92;
    const base = 0.78;
    const K = 9;
    // Which way a quarter-turned panel's own x runs across the line (+1 or -1).
    const sx = Math.sign(f.dz * f.nx - f.dx * f.nz) || 1;
    const pt = (k: number) => {
      const th = (k / K) * Math.PI;
      return { c: -R * Math.cos(th), y: base + H * Math.sin(th) };
    };
    for (let k = 0; k < K; k++) {
      const p1 = pt(k);
      const p2 = pt(k + 1);
      const len = Math.hypot(p2.c - p1.c, p2.y - p1.y);
      const tilt = Math.atan2(p2.y - p1.y, (p2.c - p1.c) * sx);
      // Panels run along the line (turned a quarter so their width goes across it).
      P("glass", 0, (p1.y + p2.y) / 2 - 0.01, (p1.c + p2.c) / 2, len + 0.02, 0.02, 1.0, k % 2 ? 0x9cc9ea : 0xc5e3f6, tilt, Math.PI / 2);
      // Iron ribs across the vault, four to a tile.
      for (const u of [-0.375, -0.125, 0.125, 0.375]) {
        P("building", u, (p1.y + p2.y) / 2 + 0.004, (p1.c + p2.c) / 2, len + 0.03, 0.03, 0.025, 0x3d4650, tilt, Math.PI / 2);
      }
    }
    for (const c of [-R, R]) {
      P("building", 0.48, 0.06, c, 0.06, base, 0.06, 0x495057);
      P("building", 0, base - 0.04, c, seg, 0.05, 0.08, 0x495057);
    }
    const along = rail.along === "z" ? t.z : t.x;
    if (along === rail.station) {
      // The booking hall at the front, and the station's clock.
      P("building", 0, 0.06, 0.62, 0.5, 0.42, 0.24, 0xb5523b);
      P("glass", 0, 0.2, 0.62, 0.51, 0.1, 0.25, 0x5d7fa3);
      P("building", 0, base + H + 0.02, 0, 0.18, 0.18, 0.04, 0xffffff, 0, Math.PI / 2);
      P("paint", 0, base + H + 0.05, 0, 0.12, 0.12, 0.045, 0x1971c2, 0, Math.PI / 2);
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
    const plan = world.plan;
    if (!plan?.rail) return;
    let k = 0;
    for (const tr of trains) {
      step(tr, dt);
      const L = length(tr);
      // Hide the train until the stretch of viaduct under it has risen.
      const mid = Math.round(tr.pos);
      const row = railRow(plan, mid);
      const tile = world.tileIndex.get(along === "z" ? keyOf(row, mid) : keyOf(mid, row));
      const show = tile !== undefined && grown(world, tile, now);
      for (let c = 0; c < tr.cars; c++, k++) {
        const a = tr.pos - L / 2 + CAR / 2 + c * (CAR + GAP);
        // Each carriage sits on the curve, turned along it, on its own track.
        const f = railFrame(plan, a);
        q.setFromAxisAngle(up, Math.atan2(-f.dz, f.dx));
        const cross = tr.track * 0.1;
        const x = f.x + f.nx * cross;
        const z = f.z + f.nz * cross;
        const sc = show ? 1 : 0.0001;
        const engine = c === 0;
        m4.compose(v.set(x, RAIL_Y + 0.02, z), q, s.set(CAR * sc, 0.15 * sc, 0.17 * sc));
        body.setMatrixAt(k, m4);
        // A band of windows (the engine just has its cab windows at the front).
        const wl = engine ? 0.16 : CAR - 0.1;
        const wo = engine ? -CAR / 2 + 0.1 : 0;
        m4.compose(v.set(x + f.dx * wo, RAIL_Y + 0.09, z + f.dz * wo), q, s.set(wl * sc, 0.045 * sc, 0.176 * sc));
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
    const plan = world.plan;
    if (!plan?.rail) return false;
    const f = railFrame(plan, a);
    const cross = tr.track * 0.1;
    out.x = f.x + f.nx * cross;
    out.z = f.z + f.nz * cross;
    out.y = RAIL_Y + 0.02;
    // Facing +along (a camera's yaw: 0 looks down -z).
    out.yaw = Math.atan2(-f.dx, -f.dz);
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
