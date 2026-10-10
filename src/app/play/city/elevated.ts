// Things built up over the streets (see elevated() in src/lib/city/layout.ts):
//
// - The monorail: a white beam on tall pylons along one long central street, sweeping round
//   corners onto cross streets at its ends, two stations with platforms, canopies and lift
//   towers, and a sleek bullet-nosed train gliding along the top, stopping at the stations
//   (createElevatedLife). You can ride it (Explore, with the trains).
// - The flyover: an elevated road over the middle of another street (the traffic below drives
//   either side of its piers), with ramps at both ends, parapets, lamps and cars driving on it.
// - Footbridges over busy roads, in three styles: a steel truss, a glass skywalk and a white arch.
//
// The fixed parts are drawn with the rest of the city (elevatedParts, from the shared pieces);
// the moving train and cars are a few instanced meshes.

import * as THREE from "three";
import { elevated, footbridgeAt, MONO_STEP, onElevated, onMono, type CityPlan, type Elevated, type MonoLine, type Tile } from "@/lib/city/layout";
import type { VehiclePose } from "./traffic";
import { grown, keyOf, type World } from "./world";

type PartSpec = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; color: number; tilt?: number };
type Add = (mesh: string, p: PartSpec) => void;

/** Top of the monorail beam (above the railway viaduct, below the tall towers' roofs). */
export const MONO_Y = 1.5;
/** Top of the flyover's road deck. */
export const FLY_Y = 0.62;
const FLY_W = 0.36;
const WHITE = 0xf1f3f5;
const CONCRETE = 0xc9ccd1;

/** A drawing frame along a line: a = along it, c = across, from the tile's centre. */
function frame(t: Tile, along: "x" | "z", add: Add) {
  const ry = along === "x" ? 0 : Math.PI / 2;
  // With the box turned for lines along z, its own +x points to -z: tilts flip.
  const flip = along === "x" ? 1 : -1;
  return (mesh: string, a: number, c: number, y: number, sa: number, sy: number, sc: number, color: number, rise = 0) =>
    add(mesh, { x: t.x + (along === "x" ? a : c), y, z: t.z + (along === "x" ? c : a), sx: sa, sy, sz: sc, ry, color, tilt: rise * flip });
}

const alongOf = (line: Elevated, t: Tile) => (line.along === "x" ? t.x : t.z);

function monoParts(t: Tile, line: MonoLine, plan: CityPlan, add: Add) {
  const flyCross = onElevated(elevated(plan).flyover, t.x, t.z);
  // The beam, a step at a time along the route (round the curves too), with a blue stripe down
  // each side, and pylons every 2 along it where they stand in the street.
  for (const k of line.tiles.get(`${t.x},${t.z}`) ?? []) {
    const p = line.path[k];
    const q = line.path[k + 1];
    const x = (p.x + q.x) / 2;
    const z = (p.z + q.z) / 2;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const len = Math.hypot(dx, dz);
    const ry = Math.atan2(-dz, dx);
    const nx = -dz / len;
    const nz = dx / len;
    add("building", { x, y: MONO_Y - 0.14, z, sx: len + 0.03, sy: 0.14, sz: 0.14, ry, color: WHITE });
    for (const c of [-0.072, 0.072]) add("paint", { x: x + nx * c, y: MONO_Y - 0.08, z: z + nz * c, sx: len + 0.03, sy: 0.025, sz: 0.004, ry, color: 0x1c7ed6 });
    const every = Math.round(2 / MONO_STEP);
    if (k % every === 0 && t.kind === "road" && !t.rail && !flyCross) {
      add("cyl", { x: p.x, y: 0.06, z: p.z, sx: 0.12, sy: MONO_Y - 0.28, sz: 0.12, ry, color: CONCRETE });
      add("building", { x: p.x, y: MONO_Y - 0.26, z: p.z, sx: 0.26, sy: 0.12, sz: 0.2, ry, color: CONCRETE });
    }
    // Buffers at the ends.
    if (k === 0 || k === line.path.length - 2) {
      const e = k === 0 ? p : q;
      add("building", { x: e.x, y: MONO_Y - 0.14, z: e.z, sx: 0.06, sy: 0.22, sz: 0.22, ry, color: 0xe03131 });
    }
  }
  // Stations (on the straight): platforms both sides, a curved canopy, glass screens, and a lift
  // tower down to the pavement.
  if (!onElevated(line, t.x, t.z)) return;
  const P = frame(t, line.along, add);
  const a = alongOf(line, t);
  const k = line.stations.findIndex((s) => Math.abs(s - a) <= 1);
  if (k >= 0) {
    for (const c of [-0.24, 0.24]) {
      P("building", 0, c, MONO_Y - 0.1, 1.02, 0.06, 0.26, 0xdee2e6);
      P("paint", 0, c > 0 ? c - 0.11 : c + 0.11, MONO_Y - 0.039, 1.02, 0.004, 0.02, 0xffd43b);
      P("glass", 0, c * 1.55, MONO_Y - 0.04, 1.0, 0.14, 0.01, 0x9ec5fe);
      P("building", 0, c, MONO_Y + 0.3, 1.04, 0.025, 0.34, 0x1c7ed6, 0);
      if (Math.abs(line.stations[k] - a) === 0) for (const u of [-0.4, 0.4]) P("cyl", u, c * 1.5, MONO_Y - 0.04, 0.03, 0.34, 0.03, 0x495057);
    }
    // A glass roof over the track between the two canopies.
    P("glass", 0, 0, MONO_Y + 0.33, 1.04, 0.02, 0.2, 0xd0ebff);
    if (line.stations[k] === a) {
      P("building", 0, 0.46, 0.06, 0.16, MONO_Y - 0.08, 0.16, 0x1c7ed6);
      P("glass", 0, 0.46, 0.12, 0.165, MONO_Y - 0.2, 0.165, 0x9ec5fe);
    }
  }
}

/** How high the flyover's deck is at a point along it (ramps at both ends). */
export function flyHeight(line: Elevated, a: number) {
  const ramp = 2;
  const up = Math.min(1, Math.max(0, (a - (line.from - 0.5)) / ramp), Math.max(0, (line.to + 0.5 - a) / ramp));
  return 0.06 + (FLY_Y - 0.06) * up;
}

function flyoverParts(t: Tile, line: Elevated, add: Add) {
  const P = frame(t, line.along, add);
  const a = alongOf(line, t);
  const y0 = flyHeight(line, a - 0.5);
  const y1 = flyHeight(line, a + 0.5);
  const rise = Math.atan2(y1 - y0, 1);
  const len = Math.hypot(1, y1 - y0) + 0.02;
  const mid = (y0 + y1) / 2;
  // Deck, asphalt, lane line, parapets (following the slope on the ramps).
  P("building", 0, 0, mid - 0.07, len, 0.07, FLY_W, CONCRETE, rise);
  P("ground", 0, 0, mid - 0.004, len, 0.006, FLY_W - 0.04, 0x4a5058, rise);
  P("paint", 0, 0, mid + 0.002, len * 0.4, 0.003, 0.012, 0xffffff, rise);
  for (const c of [-FLY_W / 2 + 0.01, FLY_W / 2 - 0.01]) P("building", 0, c, mid - 0.004, len, 0.045, 0.02, 0xdee2e6, rise);
  // Piers in the middle of the street every other step once it's up, and lamps.
  if (y0 > 0.4 && y1 > 0.4) {
    if (a % 2 === 0) {
      P("building", 0, 0, 0.06, 0.12, FLY_Y - 0.16, 0.12, CONCRETE);
      P("building", 0, 0, FLY_Y - 0.14, 0.18, 0.07, FLY_W - 0.02, CONCRETE);
    } else {
      P("cyl", 0, FLY_W / 2 - 0.02, FLY_Y, 0.015, 0.32, 0.015, 0x495057);
      P("lamp", 0, FLY_W / 2 - 0.07, FLY_Y + 0.31, 0.07, 0.04, 0.07, 0xffffff);
    }
  }
}

function footbridgeParts(t: Tile, style: 0 | 1 | 2, add: Add) {
  // The road runs along x (mask 10) or z (mask 5); the bridge goes across it.
  const roadAlong: "x" | "z" = t.mask === 10 ? "x" : "z";
  // Draw in a frame where a runs ACROSS the road (the bridge's length) and c along it.
  const P = frame(t, roadAlong === "x" ? "z" : "x", add);
  const deck = 0.5;
  const colour = style === 0 ? 0x1c7ed6 : style === 1 ? WHITE : WHITE;
  // Towers with stairs on both pavements.
  for (const side of [-1, 1]) {
    const a = side * 0.43;
    P("building", a, 0, 0.06, 0.12, deck + 0.05, 0.12, style === 1 ? 0x868e96 : colour);
    if (style === 1) P("glass", a, 0, 0.1, 0.125, deck - 0.04, 0.125, 0x9ec5fe);
    // Stairs down along the pavement.
    const n = 7;
    for (let k = 0; k < n; k++) P("building", a, 0.1 + k * 0.05, 0.06, 0.1, (deck * (n - k)) / n, 0.05, 0xced4da);
  }
  // The deck.
  P("building", 0, 0, deck, 1.0, 0.04, 0.14, style === 0 ? 0x495057 : 0xdee2e6);
  if (style === 0) {
    // A steel truss: top and bottom chords and zig-zag diagonals, in blue.
    for (const c of [-0.07, 0.07]) {
      P("building", 0, c, deck + 0.16, 0.86, 0.02, 0.02, colour);
      for (let k = 0; k < 6; k++) P("building", -0.36 + k * 0.144, c, deck + 0.04, 0.17, 0.016, 0.016, colour, k % 2 ? 0.8 : -0.8);
    }
    P("paint", 0, 0, deck + 0.18, 0.5, 0.06, 0.004, 0xffd43b);
  } else if (style === 1) {
    // A glass skywalk: a glass tube with a white frame and a flat roof.
    for (const c of [-0.075, 0.075]) P("glass", 0, c, deck + 0.04, 0.84, 0.14, 0.01, 0x9ec5fe);
    P("building", 0, 0, deck + 0.18, 0.9, 0.02, 0.17, WHITE);
    for (let k = 0; k < 5; k++) for (const c of [-0.075, 0.075]) P("building", -0.4 + k * 0.2, c, deck + 0.04, 0.012, 0.14, 0.012, WHITE);
  } else {
    // A white arch with hangers holding the deck.
    for (const c of [-0.075, 0.075]) {
      for (let k = 0; k < 8; k++) {
        const u0 = -0.42 + k * 0.105;
        const u1 = u0 + 0.105;
        const y = (u: number) => deck + 0.04 + 0.3 * (1 - (u / 0.42) ** 2);
        P("building", (u0 + u1) / 2, c, (y(u0) + y(u1)) / 2 - 0.01, 0.112, 0.022, 0.022, WHITE, Math.atan2(y(u1) - y(u0), 0.105));
        if (k > 0) P("building", u0, c, deck + 0.04, 0.006, y(u0) - deck - 0.04, 0.006, 0xadb5bd);
      }
    }
  }
}

/** The fixed parts up in the air over this tile (if any). */
export function elevatedParts(t: Tile, plan: CityPlan, add: Add) {
  const { mono, flyover } = elevated(plan);
  if (mono && onMono(mono, t.x, t.z)) monoParts(t, mono, plan, add);
  if (flyover && onElevated(flyover, t.x, t.z)) flyoverParts(t, flyover, add);
  const fb = footbridgeAt(plan, t);
  if (fb !== null) footbridgeParts(t, fb, add);
}

// ---------------------------------------------------------------- the moving parts

type Car = { pos: number; dir: number; speed: number; wait: number; called: number };

const M_CAR = 0.7;
const M_GAP = 0.04;
const M_CARS = 3;
const M_SPEED = 1.8;
const M_ACCEL = 0.6;

/** The monorail train and the cars on the flyover. */
export function createElevatedLife(world: World, parent: THREE.Object3D) {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const nose = new THREE.SphereGeometry(0.5, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const winMat = new THREE.MeshLambertMaterial({ color: 0x223349, emissive: 0x0b1a2a, emissiveIntensity: 0.3 });
  let meshes: THREE.InstancedMesh[] = [];
  let train: Car | null = null;
  let lo = 0;
  let hi = 0;
  let stations: number[] = [];
  let line: MonoLine | null = null;
  let fly: Elevated | null = null;
  let flyCars: { pos: number; dir: number; speed: number; color: number }[] = [];
  let body: THREE.InstancedMesh | null = null;
  let wins: THREE.InstancedMesh | null = null;
  let noses: THREE.InstancedMesh | null = null;
  let cars: THREE.InstancedMesh | null = null;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const color = new THREE.Color();
  const DAY = new THREE.Color(0x0b1a2a);
  const NIGHT = new THREE.Color(0xffd27a);
  const tq = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);

  function clear() {
    for (const m of meshes) {
      parent.remove(m);
      m.dispose();
    }
    meshes = [];
    body = wins = noses = cars = null;
    train = null;
    flyCars = [];
  }

  function made(geo: THREE.BufferGeometry, material: THREE.Material, n: number) {
    const m = new THREE.InstancedMesh(geo, material, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = true;
    parent.add(m);
    meshes.push(m);
    return m;
  }

  /** The stretch of a line that exists in town right now (its tiles have been added). */
  function span(l: Elevated) {
    let min = Infinity;
    let max = -Infinity;
    for (const t of world.tiles) {
      if (!onElevated(l, t.x, t.z)) continue;
      const a = l.along === "x" ? t.x : t.z;
      min = Math.min(min, a);
      max = Math.max(max, a);
    }
    return Number.isFinite(min) ? { min, max } : null;
  }

  function build() {
    clear();
    const plan = world.plan;
    if (!plan) return;
    const e = elevated(plan);
    line = e.mono;
    fly = e.flyover;
    if (line) {
      // The part of the route over tiles that are in town right now (all of it, except in a
      // huge town drawn only round the camera).
      let min = Infinity;
      let max = -Infinity;
      for (let k = 0; k < line.path.length; k++) {
        const pt = line.path[k];
        if (!world.tileIndex.has(keyOf(Math.round(pt.x), Math.round(pt.z)))) continue;
        min = Math.min(min, pt.s);
        max = Math.max(max, pt.s);
      }
      if (Number.isFinite(min) && max - min >= 6) {
        lo = min + 0.1;
        hi = max - 0.1;
        stations = line.stationS.filter((x) => x > lo + 1.2 && x < hi - 1.2);
        train = { pos: lo + (M_CARS * (M_CAR + M_GAP)) / 2, dir: 1, speed: 0, wait: 3, called: -Infinity };
        body = made(box, mat, M_CARS);
        wins = made(box, winMat, M_CARS);
        noses = made(nose, mat, 2);
        for (let c = 0; c < M_CARS; c++) body.setColorAt(c, color.setHex(0xf8f9fa));
        noses.setColorAt(0, color.setHex(0x1c7ed6));
        noses.setColorAt(1, color.setHex(0x1c7ed6));
      }
    }
    if (fly) {
      const sp = span(fly);
      if (sp && sp.max - sp.min >= 4) {
        const palette = [0xe03131, 0xf8f9fa, 0x1971c2, 0xfab005, 0x343a40, 0x2f9e44, 0xae3ec9];
        for (let k = 0; k < 8; k++) {
          flyCars.push({ pos: sp.min + ((sp.max - sp.min) * k) / 8, dir: k % 2 ? 1 : -1, speed: 0.55 + (k % 3) * 0.12, color: palette[(k + plan.seed) % palette.length] });
        }
        cars = made(box, mat, flyCars.length);
        flyCars.forEach((c, k) => cars!.setColorAt(k, color.setHex(c.color)));
        lo2 = sp.min - 0.5;
        hi2 = sp.max + 0.5;
      }
    }
  }
  let lo2 = 0;
  let hi2 = 0;

  function stepTrain(tr: Car, dt: number) {
    if (tr.wait > 0) {
      tr.wait -= dt;
      return;
    }
    const half = (M_CARS * (M_CAR + M_GAP)) / 2;
    const end = tr.dir > 0 ? hi - half : lo + half;
    // The next station on the way (each once per run), else the end of the line.
    const next = stations.filter((x) => (x - tr.pos) * tr.dir > 0.02 && (tr.dir > 0 ? x > tr.called : x < tr.called)).sort((p, r) => (p - r) * tr.dir)[0];
    const stop = next ?? end;
    const dist = Math.abs(stop - tr.pos);
    const target = Math.min(M_SPEED, Math.sqrt(2 * M_ACCEL * dist));
    tr.speed = tr.speed < target ? Math.min(target, tr.speed + M_ACCEL * dt) : target;
    tr.pos += Math.min(dist, Math.max(0.02 * dt, tr.speed * dt)) * tr.dir;
    if (Math.abs(stop - tr.pos) < 0.005) {
      tr.pos = stop;
      tr.speed = 0;
      if (stop === end) {
        tr.dir = -tr.dir;
        tr.called = tr.dir > 0 ? -Infinity : Infinity;
        tr.wait = 6;
      } else {
        tr.called = stop;
        tr.wait = 4;
      }
    }
  }

  /** Where the monorail is at distance a along its route (x, z, and the way it runs). */
  const mp = { x: 0, z: 0, dx: 1, dz: 0 };
  function monoAt(l: MonoLine, a: number) {
    const f = Math.max(0, Math.min(l.path.length - 1.001, a / MONO_STEP));
    const k = Math.floor(f);
    const p0 = l.path[k];
    const p1 = l.path[Math.min(l.path.length - 1, k + 1)];
    const t = f - k;
    mp.x = p0.x + (p1.x - p0.x) * t;
    mp.z = p0.z + (p1.z - p0.z) * t;
    mp.dx = p0.dx + (p1.dx - p0.dx) * t;
    mp.dz = p0.dz + (p1.dz - p0.dz) * t;
    const n = Math.hypot(mp.dx, mp.dz) || 1;
    mp.dx /= n;
    mp.dz /= n;
    return mp;
  }
  function monoShown(l: MonoLine, a: number, now: number) {
    const p = monoAt(l, a);
    const tile = world.tileIndex.get(keyOf(Math.round(p.x), Math.round(p.z)));
    return tile !== undefined && grown(world, tile, now);
  }

  /** A point on a line at position a (and c across it). */
  function at(l: Elevated, a: number, c: number) {
    return l.along === "x" ? { x: a, z: l.at + c } : { x: l.at + c, z: a };
  }
  const yawOf = (l: Elevated, dir: number) => (l.along === "x" ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? -Math.PI / 2 : Math.PI / 2);

  function shown(l: Elevated, a: number, now: number) {
    const p = at(l, Math.round(a), 0);
    const tile = world.tileIndex.get(keyOf(p.x, p.z));
    return tile !== undefined && grown(world, tile, now);
  }

  function update(dt: number, now: number) {
    color.copy(DAY).lerp(NIGHT, world.night);
    winMat.emissive.copy(color);
    winMat.emissiveIntensity = 0.3 + world.night * 0.9;
    if (train && line && body && wins && noses) {
      stepTrain(train, dt);
      const L = M_CARS * (M_CAR + M_GAP) - M_GAP;
      const sc = monoShown(line, train.pos, now) ? 1 : 0.0001;
      for (let c = 0; c < M_CARS; c++) {
        const a = train.pos - L / 2 + M_CAR / 2 + c * (M_CAR + M_GAP);
        // Each car turns with the curve under it.
        const p = monoAt(line, a);
        q.setFromAxisAngle(up, Math.atan2(-p.dz, p.dx));
        m4.compose(v.set(p.x, MONO_Y, p.z), q, s.set(M_CAR * sc, 0.16 * sc, 0.17 * sc));
        body.setMatrixAt(c, m4);
        m4.compose(v.set(p.x, MONO_Y + 0.075, p.z), q, s.set((M_CAR - 0.08) * sc, 0.05 * sc, 0.176 * sc));
        wins.setMatrixAt(c, m4);
      }
      // Rounded blue noses at both ends.
      for (let e = 0; e < 2; e++) {
        const a = train.pos + (e ? 1 : -1) * (L / 2);
        const p = monoAt(line, a);
        q.setFromAxisAngle(up, Math.atan2(-p.dz, p.dx) + (e ? 0 : Math.PI));
        m4.compose(v.set(p.x, MONO_Y + 0.08, p.z), q, s.set(0.3 * sc, 0.16 * sc, 0.17 * sc));
        noses.setMatrixAt(e, m4);
      }
      body.instanceMatrix.needsUpdate = wins.instanceMatrix.needsUpdate = noses.instanceMatrix.needsUpdate = true;
    }
    if (fly && cars) {
      flyCars.forEach((car, k) => {
        car.pos += car.dir * car.speed * dt;
        if (car.pos > hi2) car.pos = lo2;
        if (car.pos < lo2) car.pos = hi2;
        const p = at(fly!, car.pos, car.dir > 0 ? -0.08 : 0.08);
        const y = flyHeight(fly!, car.pos);
        const ok = y > 0.08 && shown(fly!, car.pos, now);
        const slope = (flyHeight(fly!, car.pos + 0.1) - flyHeight(fly!, car.pos - 0.1)) / 0.2;
        q.setFromAxisAngle(up, yawOf(fly!, car.dir));
        q.multiply(tq.setFromAxisAngle(zAxis, Math.atan(slope) * car.dir));
        const sc = ok ? 1 : 0.0001;
        m4.compose(v.set(p.x, y + 0.002, p.z), q, s.set(0.17 * sc, 0.07 * sc, 0.09 * sc));
        cars!.setMatrixAt(k, m4);
      });
      cars.instanceMatrix.needsUpdate = true;
    }
  }

  function dispose() {
    clear();
    box.dispose();
    nose.dispose();
    mat.dispose();
    winMat.dispose();
  }

  /**
   * Where the monorail's middle car is (its floor), facing +along the route; for riding it.
   * False if there's no monorail running.
   */
  function pose(out: VehiclePose) {
    if (!train || !line) return false;
    const p = monoAt(line, train.pos);
    out.x = p.x;
    out.z = p.z;
    out.y = MONO_Y;
    out.yaw = Math.atan2(-p.dx, -p.dz);
    out.speed = train.speed * train.dir;
    return true;
  }

  return { build, update, pose, dispose, get hasTrain() { return !!train; } };
}
