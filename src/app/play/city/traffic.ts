// Traffic: cars, taxis, vans, buses, trucks and articulated lorries driving the street
// network, turning at junctions and bends (on smooth curves), queueing in the odd traffic jam
// and stopping at bus stops. Road works close a street (cars turn back before them). Five
// instanced meshes in all. A few buses and cars can be ridden: the city view asks where the
// one you're in is (pose) and you choose which way it turns at the next junction (steer).

import * as THREE from "three";
import { hash, type CityPlan, type Tile } from "@/lib/city/layout";
import { BRIDGE_TOP, DIRS, keyOf, type World } from "./world";

/** Vehicle kinds: 0 car, 1 taxi, 2 delivery van, 3 bus, 4 truck, 5 articulated lorry. */
type Car = {
  kind: number;
  /** Length, for queuing in jams. */
  len: number;
  from: [number, number];
  to: [number, number];
  /** Where the stretch before this one started (for the curve into this stretch, and trailers). */
  prev: [number, number];
  /** Where it goes after `to` (decided half way along, so it can curve round the corner). */
  next: [number, number] | null;
  t: number;
  speed: number;
  bridgeFrom: boolean;
  bridgeTo: boolean;
  /** The jam this car is queuing in (-1 none), its place, and where along the street it stops. */
  jam: number;
  slot: number;
  target: number;
  /** Seconds to wait before moving off (a queue clears one car at a time; buses at stops). */
  hold: number;
  /** A bus has already pulled in at a stop on this stretch. */
  stopped: boolean;
  /** Brake lights drawn on (1) or off (0), or -1 (not drawn yet). */
  lit: number;
  braking: boolean;
};

export type TurnDir = "left" | "right" | "straight";

/** Where a vehicle is: its middle on the road, which way the camera should face (yaw), how fast it turns. */
export type VehiclePose = { x: number; y: number; z: number; yaw: number; speed: number };

const VEH_LEN = [0.3, 0.3, 0.34, 0.62, 0.52, 0.9];
const VEH_SPEED = [1, 1.05, 0.9, 0.7, 0.75, 0.65];
const LANE = 0.14;
const QUEUE_GAP = 0.36;
const INDUSTRY = ["port", "airport", "military", "power", "oilrig", "dam", "market", "solar"];
// Chances of each kind (car, taxi, van, bus, truck, lorry) in the suburbs, downtown, near industry.
const MIX = [
  [0.7, 0.06, 0.12, 0.05, 0.05, 0.02],
  [0.5, 0.24, 0.1, 0.13, 0.02, 0.01],
  [0.28, 0.02, 0.2, 0.02, 0.28, 0.2],
];

export function createTraffic(world: World, parent: THREE.Object3D) {
  const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mat = (opts: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, ...opts });
  const bodyMat = mat();
  const topMat = mat();
  const extraMat = mat();
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  let cars: Car[] = [];
  let carBody: THREE.InstancedMesh | null = null;
  let carTop: THREE.InstancedMesh | null = null;
  let carLights: THREE.InstancedMesh | null = null;
  /** Truck boxes, lorry trailers, bus roofs. */
  let carExtra: THREE.InstancedMesh | null = null;
  /** Bus windows and taxi signs: they light up at night. */
  let carGlow: THREE.InstancedMesh | null = null;
  let nightDrawn = -1;
  let seedNow = -1;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tq = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const color = new THREE.Color();

  const roadAt = (x: number, z: number) => {
    const key = keyOf(x, z);
    const k = world.kindAt.get(key);
    return (k === "road" || k === "bridge") && !world.blocked.has(key);
  };
  const tileXY = (x: number, z: number) => {
    const i = world.tileIndex.get(keyOf(x, z));
    return i === undefined ? undefined : world.byIndex.get(i);
  };
  const isBridge = (x: number, z: number) => world.kindAt.get(keyOf(x, z)) === "bridge";

  // ---- jams: now and then the last few stretches before a junction jam up.
  type Jam = { stop: number; tail: number; count: number; active: boolean; period: number; on: number; offset: number };
  let jams: Jam[] = [];
  const jamSeg = new Map<number, { jam: number; i: number }>();
  const segKey = (x: number, z: number, dx: number, dz: number) => ((x + 1024) * 2048 + (z + 1024)) * 4 + (dx === 1 ? 0 : dx === -1 ? 1 : dz === 1 ? 2 : 3);
  const jamFull = (jam: Jam) => jam.tail - QUEUE_GAP < -0.85;

  // ---- the ride: which car you're in, which way you asked to turn, and junction notices.
  let ride = -1;
  let wantTurn: TurnDir | null = null;
  let onJunction: ((options: TurnDir[]) => void) | null = null;
  let announced = "";

  /** Where a car can go from the end of its stretch (never straight back, unless it has to). */
  function optionsAt(x: number, z: number, dx: number, dz: number) {
    return DIRS.filter(([ox, oz]) => {
      if ((ox === -dx && oz === -dz) || !roadAt(x + ox, z + oz)) return false;
      // Don't join a jam that's already backed right up.
      const info = jamSeg.get(segKey(x, z, ox, oz));
      return !(info && info.i === -1 && jams[info.jam].active && jamFull(jams[info.jam]));
    });
  }
  const turnOf = (dx: number, dz: number, ox: number, oz: number): TurnDir => (ox === dx && oz === dz ? "straight" : dx * oz - dz * ox > 0 ? "right" : "left");

  function nextStop(c: Car, k: number): [number, number] {
    const [x, z] = c.to;
    const dx = Math.sign(c.to[0] - c.from[0]);
    const dz = Math.sign(c.to[1] - c.from[1]);
    const options = optionsAt(x, z, dx, dz);
    if (!options.length) return c.from; // dead end (or road works): turn round
    if (k === ride && options.length > 1) {
      // Your car: the turn you asked for, if there is one; otherwise straight on if possible.
      const want = wantTurn;
      wantTurn = null;
      const pick = (want && options.find(([ox, oz]) => turnOf(dx, dz, ox, oz) === want)) || options.find(([ox, oz]) => ox === dx && oz === dz);
      if (pick && want) return [x + pick[0], z + pick[1]];
    }
    const ahead = options.find(([ox, oz]) => ox === dx && oz === dz);
    if (ahead && Math.random() < 0.6) return [x + ahead[0], z + ahead[1]];
    const o = options[Math.floor(Math.random() * options.length)];
    return [x + o[0], z + o[1]];
  }

  /** Tell the rider about the next junction ahead (once), so they can choose a way. */
  function announce(c: Car) {
    if (!onJunction) return;
    let [x, z] = c.to;
    const dx = Math.sign(c.to[0] - c.from[0]);
    const dz = Math.sign(c.to[1] - c.from[1]);
    for (let n = 0; n < 10; n++) {
      const options = optionsAt(x, z, dx, dz);
      if (options.length >= 2) {
        const key = `${x},${z},${dx},${dz}`;
        if (key !== announced) {
          announced = key;
          onJunction(options.map(([ox, oz]) => turnOf(dx, dz, ox, oz)));
        }
        return;
      }
      if (options.length !== 1 || options[0][0] !== dx || options[0][1] !== dz) return; // a bend or a dead end: no choice
      x += dx;
      z += dz;
    }
  }

  /** What sort of area a road is in: near docks and industry, downtown, or the suburbs. */
  function zoneOf(t: Tile) {
    let industry = 0;
    let town = 0;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const n = tileXY(t.x + dx, t.z + dz);
        if (!n) continue;
        if (n.kind === "tower" || n.kind === "office") town++;
        if (n.kind === "crane" || n.kind === "fuel" || (n.structure && INDUSTRY.includes(n.structure.type))) industry++;
      }
    }
    return industry >= 2 ? 2 : town >= 5 ? 1 : 0;
  }
  function pickKind(t: Tile) {
    const mix = MIX[zoneOf(t)];
    let r = Math.random();
    for (let k = 0; k < mix.length; k++) if ((r -= mix[k]) < 0) return k;
    return 0;
  }

  function newCar(t: Tile, kind: number): Car | null {
    const options = DIRS.filter(([ox, oz]) => roadAt(t.x + ox, t.z + oz));
    if (!options.length) return null;
    const [ox, oz] = options[Math.floor(Math.random() * options.length)];
    return {
      kind,
      len: VEH_LEN[kind],
      from: [t.x, t.z],
      to: [t.x + ox, t.z + oz],
      prev: [t.x - ox, t.z - oz],
      next: null,
      t: Math.random(),
      speed: (0.8 + Math.random() * 0.9) * VEH_SPEED[kind],
      bridgeFrom: t.kind === "bridge",
      bridgeTo: isBridge(t.x + ox, t.z + oz),
      jam: -1,
      slot: -1,
      target: 0,
      hold: 0,
      stopped: false,
      lit: -1,
      braking: false,
    };
  }

  function clearMeshes() {
    for (const m of [carBody, carTop, carLights, carExtra, carGlow]) {
      if (!m) continue;
      parent.remove(m);
      m.dispose();
    }
    carBody = carTop = carLights = carExtra = carGlow = null;
  }

  /** Make the traffic for the city (keeping the cars already driving when it's the same city). */
  function build(plan: CityPlan) {
    clearMeshes();
    const same = plan.seed === seedNow;
    seedNow = plan.seed;
    const roads = world.tiles.filter((t) => (t.kind === "road" || t.kind === "bridge") && !t.works);
    if (!same) {
      cars = [];
      ride = -1;
    }
    const n = Math.min(160, Math.floor(roads.length / 4));
    for (let tries = 0; cars.length < n && tries < n * 3 && roads.length; tries++) {
      const t = roads[Math.floor(Math.random() * roads.length)];
      const c = newCar(t, pickKind(t));
      if (c) cars.push(c);
    }
    // Always a few buses and cars to ride in.
    if (!same && roads.length) {
      const want = (kinds: number[], count: number, as: number) => {
        let have = cars.filter((c) => kinds.includes(c.kind)).length;
        for (const c of cars) {
          if (have >= count) break;
          if (c.kind === 2 || c.kind === 0 || c.kind === 4) {
            if (kinds.includes(c.kind)) continue;
            c.kind = as;
            c.len = VEH_LEN[as];
            c.speed = (0.8 + Math.random() * 0.9) * VEH_SPEED[as];
            have++;
          }
        }
      };
      want([3], Math.min(3, Math.floor(cars.length / 8)), 3);
      want([1], Math.min(2, Math.floor(cars.length / 10)), 1);
    }
    buildJams(plan.seed);
    const N = Math.max(1, cars.length);
    carBody = new THREE.InstancedMesh(boxGeo, bodyMat, N);
    carTop = new THREE.InstancedMesh(boxGeo, topMat, N);
    carExtra = new THREE.InstancedMesh(boxGeo, extraMat, N);
    carGlow = new THREE.InstancedMesh(boxGeo, glowMat, N);
    // Two little lamps per car: headlights in front (on at night), brake lights behind.
    carLights = new THREE.InstancedMesh(boxGeo, lightMat, N * 2);
    carBody.castShadow = true;
    carExtra.castShadow = true;
    const pal = plan.palette.car;
    const pickC = (list: number[], k: number) => list[k % list.length];
    cars.forEach((c, k) => {
      const body =
        c.kind === 0 ? pickC(pal, k) : c.kind === 1 ? 0xffd43b : c.kind === 2 ? pickC([0xffffff, 0xdee2e6, 0x1971c2, 0xe03131, 0xf08c00], k) : c.kind === 3 ? pickC([0xe03131, 0x1971c2, 0x2f9e44], plan.seed) : c.kind === 4 ? pickC([0xe03131, 0x1971c2, 0xf08c00, 0xffffff], k) : pickC([0x343a40, 0x1971c2, 0xe03131, 0xf1f3f5], k);
      carBody!.setColorAt(k, color.setHex(body));
      carTop!.setColorAt(k, color.setHex(c.kind <= 1 ? 0xe9f2fb : 0xbcd4e6));
      carExtra!.setColorAt(k, color.setHex(c.kind === 3 ? 0xf1f3f5 : c.kind === 4 ? pickC([0xf1f3f5, 0xffd43b, 0xdee2e6, 0x69db7c], k) : pickC([0xe5484d, 0x228be6, 0xfab005, 0x2f9e44, 0xf1f3f5], k)));
      carGlow!.setColorAt(k, color.setHex(0x2b3a4f));
      c.lit = -1;
    });
    carBody.count = carTop.count = carExtra.count = carGlow.count = cars.length;
    carLights.count = cars.length * 2;
    for (let k = 0; k < cars.length * 2; k++) carLights.setColorAt(k, color.setHex(0x6b1d1d));
    for (const m of [carBody, carTop, carLights, carExtra, carGlow]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
    }
    nightDrawn = -1;
    parent.add(carBody, carTop, carLights, carExtra, carGlow);
  }

  /** Pick a few streets that jam up now and then: the last few stretches before a junction. */
  function buildJams(seedV: number) {
    jams = [];
    jamSeg.clear();
    for (const c of cars) {
      c.jam = -1;
      c.slot = -1;
    }
    const roadCount = world.tiles.reduce((n, t) => n + (t.kind === "road" ? 1 : 0), 0);
    const want = Math.min(3, Math.floor(roadCount / 80));
    if (!want) return;
    const cands: { h: Tile; dx: number; dz: number; score: number }[] = [];
    for (const t of world.tiles) {
      const m = t.mask ?? 0;
      const arms = (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
      if (t.kind !== "road" || arms < 3) continue;
      DIRS.forEach(([dx, dz], d) => cands.push({ h: t, dx, dz, score: hash(t.x * 4 + d, t.z, seedV + 1401) }));
    }
    cands.sort((a, b) => a.score - b.score);
    for (const c of cands) {
      if (jams.length >= want) break;
      // Walk back from the junction along a straight street (2 to 4 stretches).
      let K = 0;
      for (let k = 1; k <= 4; k++) {
        const t = tileXY(c.h.x - c.dx * k, c.h.z - c.dz * k);
        if (!t || t.kind !== "road" || t.works || t.mask !== (c.dx !== 0 ? 10 : 5)) break;
        K = k;
      }
      if (K < 2) continue;
      const keys: number[] = [];
      for (let i = -1; i < K; i++) keys.push(segKey(c.h.x - c.dx * (K - i), c.h.z - c.dz * (K - i), c.dx, c.dz));
      if (keys.some((k) => jamSeg.has(k))) continue;
      const j = jams.length;
      keys.forEach((k, n) => jamSeg.set(k, { jam: j, i: n - 1 }));
      const r = (n: number) => hash(c.h.x, c.h.z, seedV + 1410 + n);
      const period = 45 + r(1) * 40;
      jams.push({ stop: K - 0.68, tail: 0, count: 0, active: false, period, on: 12 + r(2) * 10, offset: r(3) * period });
    }
  }

  // A car's place in the queue: one car-length behind the last.
  function joinQueue(c: Car, j: number) {
    const jam = jams[j];
    const target = jam.tail - QUEUE_GAP - Math.max(0, c.len - 0.3);
    c.jam = j;
    c.slot = jam.count++;
    c.target = target;
    jam.tail = target;
  }
  const carP = (c: Car, i: number) => i + c.t;
  function updateJams(time: number) {
    for (let j = 0; j < jams.length; j++) {
      const jam = jams[j];
      const on = (time + jam.offset) % jam.period < jam.on;
      if (on === jam.active) continue;
      jam.active = on;
      jam.tail = jam.stop + QUEUE_GAP;
      jam.count = 0;
      if (on) {
        const queued: { c: Car; p: number }[] = [];
        for (const c of cars) {
          const info = jamSeg.get(segKey(c.from[0], c.from[1], c.to[0] - c.from[0], c.to[1] - c.from[1]));
          if (info && info.jam === j && carP(c, info.i) <= jam.stop) queued.push({ c, p: carP(c, info.i) });
        }
        queued.sort((a, b) => b.p - a.p);
        for (const { c } of queued) if (!jamFull(jam)) joinQueue(c, j);
      } else {
        for (const c of cars) {
          if (c.jam !== j) continue;
          c.hold = 0.3 + c.slot * 0.3;
          c.jam = -1;
          c.slot = -1;
        }
      }
    }
  }

  // ---- where a car is: along its lane, curving round corners.
  const P = { x: 0, z: 0, fx: 1, fz: 0 };
  function bez(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, u: number) {
    const w = 1 - u;
    P.x = w * w * ax + 2 * u * w * bx + u * u * cx;
    P.z = w * w * az + 2 * u * w * bz + u * u * cz;
    let fx = 2 * w * (bx - ax) + 2 * u * (cx - bx);
    let fz = 2 * w * (bz - az) + 2 * u * (cz - bz);
    const l = Math.hypot(fx, fz) || 1;
    fx /= l;
    fz /= l;
    P.fx = fx;
    P.fz = fz;
  }
  /** The curve round corner (cx, cz) from heading d1 to heading d2, at u (0..1). */
  function corner(cx: number, cz: number, d1x: number, d1z: number, d2x: number, d2z: number, u: number) {
    const ax = cx - d1x * 0.5 - d1z * LANE;
    const az = cz - d1z * 0.5 + d1x * LANE;
    const ex = cx + d2x * 0.5 - d2z * LANE;
    const ez = cz + d2z * 0.5 + d2x * LANE;
    let bx = cx - d1z * LANE - d2z * LANE;
    let bz = cz + d1x * LANE + d2x * LANE;
    if (d1x === -d2x && d1z === -d2z) {
      // Turning round: swing out ahead a little.
      bx = cx + d1x * 0.3;
      bz = cz + d1z * 0.3;
    }
    bez(ax, az, bx, bz, ex, ez, u);
  }
  function place(c: Car) {
    const dx = c.to[0] - c.from[0];
    const dz = c.to[1] - c.from[1];
    const pdx = c.from[0] - c.prev[0];
    const pdz = c.from[1] - c.prev[1];
    if (c.t < 0.5 && (pdx !== dx || pdz !== dz) && Math.abs(pdx) + Math.abs(pdz) === 1) {
      corner(c.from[0], c.from[1], pdx, pdz, dx, dz, 0.5 + c.t);
      return;
    }
    if (c.t >= 0.5 && c.next) {
      const ndx = c.next[0] - c.to[0];
      const ndz = c.next[1] - c.to[1];
      if (ndx !== dx || ndz !== dz) {
        corner(c.to[0], c.to[1], dx, dz, ndx, ndz, c.t - 0.5);
        return;
      }
    }
    P.x = c.from[0] + dx * c.t - dz * LANE;
    P.z = c.from[1] + dz * c.t + dx * LANE;
    P.fx = dx;
    P.fz = dz;
  }
  const roadHeight = (c: Car) => {
    const onBridge = c.t < 0.5 ? c.bridgeFrom : c.bridgeTo;
    const off = Math.abs(c.t < 0.5 ? c.t : 1 - c.t);
    return onBridge ? 0.06 + (BRIDGE_TOP - 0.06) * Math.min(1, Math.max(0, (0.5 - off) / 0.3)) : 0.06;
  };

  // A point some way back along a vehicle's path (for lorry trailers), in its lane.
  const trail = { x: 0, z: 0 };
  function pathPoint(c: Car, back: number) {
    let t = c.t - back;
    let a = c.from;
    let b = c.to;
    if (t < 0) {
      t = Math.max(0, t + 1);
      a = c.prev;
      b = c.from;
    }
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    trail.x = a[0] + dx * t - dz * LANE;
    trail.z = a[1] + dz * t + dx * LANE;
  }
  const fwd = { x: 0, z: 0 };
  function box(mesh: THREE.InstancedMesh, k: number, x: number, y: number, z: number, a: number, lift: number, len: number, h: number, w: number) {
    m4.compose(v.set(x + fwd.x * a, y + lift, z + fwd.z * a), q, s.set(len, h, w));
    mesh.setMatrixAt(k, m4);
  }
  const HIDDEN = new THREE.Vector3(0.0001, 0.0001, 0.0001);
  function hide(mesh: THREE.InstancedMesh, k: number) {
    m4.compose(v.set(0, -5, 0), q, HIDDEN);
    mesh.setMatrixAt(k, m4);
  }

  const BRAKE_ON = new THREE.Color(0xff2a2a);
  const BRAKE_OFF = new THREE.Color(0x5a1a1a);
  const BRAKE_NIGHT = new THREE.Color(0xb8222b);
  const HEAD_DAY = new THREE.Color(0x9aa3ad);
  const HEAD_NIGHT = new THREE.Color(0xfff2c4);
  const BUS_DAY = new THREE.Color(0x2b3a4f);
  const BUS_NIGHT = new THREE.Color(0xffd98a);
  const TAXI_DAY = new THREE.Color(0xc9b458);
  const TAXI_NIGHT = new THREE.Color(0xfff3bf);

  function update(dt: number, time: number) {
    if (!carBody || !carTop || !carLights || !carExtra || !carGlow) return;
    updateJams(time);
    const night = world.night;
    let colorsDirty = false;
    if (Math.abs(night - nightDrawn) > 0.03) {
      nightDrawn = night;
      color.copy(HEAD_DAY).lerp(HEAD_NIGHT, night);
      for (let k = 0; k < cars.length; k++) {
        carLights.setColorAt(k * 2, color);
        cars[k].lit = -1;
      }
      for (let k = 0; k < cars.length; k++) {
        const kind = cars[k].kind;
        if (kind === 3) carGlow.setColorAt(k, color.copy(BUS_DAY).lerp(BUS_NIGHT, night));
        else if (kind === 1) carGlow.setColorAt(k, color.copy(TAXI_DAY).lerp(TAXI_NIGHT, night));
      }
      if (carGlow.instanceColor) carGlow.instanceColor.needsUpdate = true;
      colorsDirty = true;
    }
    for (let k = 0; k < cars.length; k++) {
      const c = cars[k];
      let dx = c.to[0] - c.from[0];
      let dz = c.to[1] - c.from[1];
      let move = (k === ride ? Math.min(c.speed, 1.0) : c.speed) * dt;
      let braking = false;
      if (c.hold > 0) {
        c.hold -= dt;
        move = 0;
        braking = true;
      } else if (jams.length) {
        const info = jamSeg.get(segKey(c.from[0], c.from[1], dx, dz));
        const jam = info ? jams[info.jam] : null;
        if (info && jam?.active) {
          const p = carP(c, info.i);
          if (c.jam !== info.jam && p <= jam.stop && !jamFull(jam)) joinQueue(c, info.jam);
          if (c.jam === info.jam) {
            const room = c.target - p;
            move = Math.max(0, Math.min(move * Math.min(1, Math.max(0.12, room / 0.5)), room));
            braking = room < 0.5;
          }
        }
      }
      // Buses pull in at a stop now and then, half way along a straight stretch.
      if (c.kind === 3 && !c.stopped && c.t < 0.5 && c.t + move >= 0.5 && c.jam < 0) {
        c.stopped = true;
        const here = tileXY(c.from[0], c.from[1]);
        if (here && (here.mask === 5 || here.mask === 10) && Math.random() < 0.4) {
          move = 0.5 - c.t;
          c.hold = 2 + Math.random() * 2;
        }
      }
      c.t += move;
      // Half way along, decide where to go after this stretch (so it can curve round).
      if (c.t >= 0.5 && !c.next) c.next = nextStop(c, k);
      while (c.t >= 1) {
        c.t -= 1;
        const next = c.next ?? nextStop(c, k);
        c.prev = c.from;
        c.from = c.to;
        c.to = next;
        c.next = null;
        c.stopped = false;
        c.bridgeFrom = c.bridgeTo;
        c.bridgeTo = isBridge(next[0], next[1]);
        dx = c.to[0] - c.from[0];
        dz = c.to[1] - c.from[1];
        if (c.t >= 0.5) c.next = nextStop(c, k);
        if (k === ride) announce(c);
      }
      c.braking = braking;
      place(c);
      const x = P.x;
      const z = P.z;
      const y = roadHeight(c);
      fwd.x = P.fx;
      fwd.z = P.fz;
      q.setFromAxisAngle(up, Math.atan2(-fwd.z, fwd.x));
      if (k === ride) {
        // You're inside: the city doesn't draw this one (the cabin is drawn round you).
        for (const m of [carBody, carTop, carExtra, carGlow]) hide(m, k);
        hide(carLights, k * 2);
        hide(carLights, k * 2 + 1);
        continue;
      }
      let front = 0.151;
      let rear = -0.151;
      let lampW = 0.11;
      switch (c.kind) {
        case 0:
        case 1:
          box(carBody, k, x, y, z, 0, 0, 0.3, 0.09, 0.15);
          box(carTop, k, x, y, z, -0.02, 0.09, 0.16, 0.06, 0.13);
          hide(carExtra, k);
          if (c.kind === 1) box(carGlow, k, x, y, z, -0.02, 0.15, 0.05, 0.025, 0.09);
          else hide(carGlow, k);
          break;
        case 2:
          box(carBody, k, x, y, z, -0.02, 0, 0.3, 0.15, 0.155);
          box(carTop, k, x, y, z, 0.125, 0.07, 0.05, 0.06, 0.15);
          hide(carExtra, k);
          hide(carGlow, k);
          front = 0.131;
          rear = -0.171;
          lampW = 0.12;
          break;
        case 3:
          box(carBody, k, x, y, z, 0, 0, 0.62, 0.15, 0.17);
          hide(carTop, k);
          box(carGlow, k, x, y, z, 0, 0.075, 0.6, 0.05, 0.176);
          box(carExtra, k, x, y, z, 0, 0.15, 0.58, 0.015, 0.15);
          front = 0.311;
          rear = -0.311;
          lampW = 0.13;
          break;
        case 4:
          box(carBody, k, x, y, z, 0.17, 0, 0.16, 0.15, 0.16);
          box(carTop, k, x, y, z, 0.24, 0.07, 0.03, 0.06, 0.15);
          box(carExtra, k, x, y, z, -0.09, 0.03, 0.34, 0.19, 0.17);
          hide(carGlow, k);
          front = 0.251;
          rear = -0.261;
          lampW = 0.13;
          break;
        default: {
          // Articulated lorry: the tractor here, its trailer following round corners.
          box(carBody, k, x, y, z, 0, 0, 0.18, 0.15, 0.16);
          box(carTop, k, x, y, z, 0.08, 0.07, 0.03, 0.06, 0.15);
          hide(carGlow, k);
          pathPoint(c, 0.1);
          const hx = trail.x;
          const hz = trail.z;
          pathPoint(c, 0.66);
          const tx = trail.x;
          const tz = trail.z;
          const yaw = Math.atan2(-(hz - tz), hx - tx || 0.0001);
          tq.setFromAxisAngle(up, yaw);
          m4.compose(v.set((hx + tx) / 2, y + 0.03, (hz + tz) / 2), tq, s.set(0.56, 0.19, 0.17));
          carExtra.setMatrixAt(k, m4);
          front = 0.091;
          lampW = 0.13;
          s.set(0.012, 0.03, lampW);
          m4.compose(v.set(tx - Math.cos(yaw) * 0.005, y + 0.06, tz + Math.sin(yaw) * 0.005), tq, s);
          carLights.setMatrixAt(k * 2 + 1, m4);
          rear = NaN;
        }
      }
      s.set(0.012, 0.026, lampW);
      m4.compose(v.set(x + fwd.x * front, y + 0.05, z + fwd.z * front), q, s);
      carLights.setMatrixAt(k * 2, m4);
      if (!Number.isNaN(rear)) {
        m4.compose(v.set(x + fwd.x * rear, y + 0.05, z + fwd.z * rear), q, s);
        carLights.setMatrixAt(k * 2 + 1, m4);
      }
      const lit = braking ? 1 : 0;
      if (lit !== c.lit) {
        c.lit = lit;
        carLights.setColorAt(k * 2 + 1, lit ? BRAKE_ON : color.copy(BRAKE_OFF).lerp(BRAKE_NIGHT, night));
        colorsDirty = true;
      }
    }
    for (const m of [carBody, carTop, carLights, carExtra, carGlow]) m.instanceMatrix.needsUpdate = true;
    if (colorsDirty && carLights.instanceColor) carLights.instanceColor.needsUpdate = true;
  }

  /** The vehicles you can ride: up to 3 buses and 4 taxis / cars (indexes into the traffic). */
  function rideables() {
    const buses: number[] = [];
    const taxis: number[] = [];
    const others: number[] = [];
    cars.forEach((c, k) => {
      if (c.kind === 3 && buses.length < 3) buses.push(k);
      else if (c.kind === 1 && taxis.length < 2) taxis.push(k);
      else if (c.kind === 0 && others.length < 4) others.push(k);
    });
    return { buses, cars: [...taxis, ...others].slice(0, 4) };
  }
  const isTaxi = (k: number) => cars[k]?.kind === 1;

  /** Where car k is right now (camera yaw: facing the way it drives). False if there's no such car. */
  function pose(k: number, out: VehiclePose) {
    const c = cars[k];
    if (!c) return false;
    place(c);
    out.x = P.x;
    out.z = P.z;
    out.y = roadHeight(c);
    out.yaw = Math.atan2(-P.fx, -P.fz);
    out.speed = c.hold > 0 || c.braking ? 0 : c.speed;
    return true;
  }

  /** Ride car k (or -1 for none); onJunction hears about each junction coming up. */
  function setRide(k: number, cb: ((options: TurnDir[]) => void) | null) {
    ride = k;
    onJunction = cb;
    announced = "";
    wantTurn = null;
    if (k >= 0 && cars[k]) announce(cars[k]);
  }
  /** Turn this way at the next junction. */
  function steer(dir: TurnDir | null) {
    wantTurn = dir;
  }

  function dispose() {
    clearMeshes();
    boxGeo.dispose();
    for (const m of [bodyMat, topMat, extraMat, lightMat, glowMat]) m.dispose();
  }

  return { build, update, rideables, isTaxi, pose, setRide, steer, dispose, get count() { return cars.length; } };
}

export type Traffic = ReturnType<typeof createTraffic>;
