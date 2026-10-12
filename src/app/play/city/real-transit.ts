// Trains and ferries on a real map (Lagos): long train rides along the real railways (the rail
// lines from the map, joined end to end into routes, stopping at the real stations), and ferries
// crossing the lagoon between the jetties. Everything runs on the server clock, so everyone sees a
// train or a ferry in the same place; you can ride them (see pose(), and rides in city-view).

import * as THREE from "three";
import type { RegionMap } from "@/lib/world/compile";
import { toTile } from "@/lib/world/geo";
import { FERRY_ROUTES, JETTIES, pathOf, railRoutes, sample, timetable, waterWay, type Leg, type Path, type Stop } from "@/lib/world/transit";
import type { VehiclePose } from "./traffic";

/** Ride indexes for these start here (the made-up towns' trains and boats use the low numbers). */
export const REAL_BASE = 100;

const TRAIN_SPEED = 1.5; // tiles a second, flat out
const TRAIN_DWELL = 14; // seconds at each station
const TRAIN_TURN = 25; // seconds at the end of the line
const CAR_LEN = 0.85;
const CAR_GAP = 0.06;
const CARS = 5;
const FERRY_SPEED = 0.9;
const FERRY_DWELL = 20;

type Runner = { path: Path; stops: Stop[]; legs: Leg[]; period: number; offset: number; name: string; group: THREE.Group; cars: THREE.Group[]; speed: number };

const ease = (u: number) => u * u * (3 - 2 * u);

export function createRealTransit(parent: THREE.Object3D) {
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, ...extra });
    mats.push(m);
    return m;
  };
  const box = new THREE.BoxGeometry(1, 1, 1);
  geos.push(box);
  let trains: Runner[] = [];
  let ferries: Runner[] = [];
  let builtFor: RegionMap | null = null;
  const tmp = { x: 0, y: 0, z: 0, dx: 1, dz: 0 };

  function part(g: THREE.Group, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const o = new THREE.Mesh(box, m);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.castShadow = true;
    g.add(o);
    return o;
  }

  /** A carriage along +x: body in the line's colour, a white band, dark windows, a grey roof (noses at the ends). */
  function carriage(livery: number, nose: -1 | 0 | 1) {
    const g = new THREE.Group();
    const body = lambert(livery);
    const white = lambert(0xf8f9fa);
    const glass = lambert(0x24364a, { emissive: 0x0b1a2a, emissiveIntensity: 0.5 });
    const roof = lambert(0xadb5bd);
    part(g, body, 0, 0.13, 0, CAR_LEN, 0.2, 0.24);
    part(g, white, 0, 0.09, 0, CAR_LEN * 0.98, 0.03, 0.245);
    part(g, glass, 0, 0.17, 0, CAR_LEN * 0.86, 0.07, 0.248);
    part(g, roof, 0, 0.245, 0, CAR_LEN * 0.95, 0.03, 0.2);
    if (nose) {
      const n = part(g, body, (nose * CAR_LEN) / 2 + nose * 0.06, 0.12, 0, 0.14, 0.17, 0.22);
      n.rotation.z = nose * -0.35;
      part(g, glass, (nose * CAR_LEN) / 2 + nose * 0.03, 0.19, 0, 0.06, 0.06, 0.2);
    }
    for (const sx of [-0.3, 0.3]) part(g, lambert(0x343a40), sx * CAR_LEN, 0.03, 0, 0.16, 0.05, 0.18);
    return g;
  }

  /** A lagoon ferry along +x: a white hull with a blue stripe, a cabin with windows, a flag. */
  function ferry(livery: number) {
    const g = new THREE.Group();
    part(g, lambert(0xf8f9fa), 0, 0.06, 0, 0.9, 0.12, 0.32);
    part(g, lambert(livery), 0, 0.1, 0, 0.92, 0.03, 0.325);
    const bow = part(g, lambert(0xf8f9fa), 0.5, 0.06, 0, 0.18, 0.12, 0.22);
    bow.rotation.y = Math.PI / 4;
    bow.scale.set(0.16, 0.12, 0.16);
    part(g, lambert(0xe9ecef), -0.06, 0.18, 0, 0.55, 0.14, 0.26);
    part(g, lambert(0x24364a, { emissive: 0x0b1a2a, emissiveIntensity: 0.4 }), -0.06, 0.2, 0, 0.5, 0.05, 0.265);
    part(g, lambert(livery), -0.06, 0.26, 0, 0.6, 0.02, 0.3);
    part(g, lambert(0x868e96), -0.32, 0.32, 0, 0.012, 0.16, 0.012);
    part(g, lambert(0x2f9e44), -0.29, 0.38, 0, 0.06, 0.04, 0.005);
    return g;
  }

  function clear() {
    for (const r of [...trains, ...ferries]) parent.remove(r.group);
    trains = [];
    ferries = [];
    builtFor = null;
  }

  function build(map: RegionMap | null | undefined) {
    if (map === builtFor) return;
    clear();
    if (!map) return;
    builtFor = map;
    // ---- trains
    const liveries = [0x1c7ed6, 0xe03131, 0x2f9e44, 0xf08c00];
    railRoutes(map).forEach((pts, k) => {
      const path = pathOf(pts);
      const stops: Stop[] = [];
      for (const st of map.stations) {
        let best = Infinity;
        let at = 0;
        for (let i = 0; i < pts.length; i++) {
          const d = Math.hypot(pts[i].x - st.x, pts[i].z - st.z);
          if (d < best) {
            best = d;
            at = path.at[i];
          }
        }
        if (best < 2) stops.push({ s: at, name: /station$/i.test(st.name) ? st.name.replace(/\s*station$/i, "") : st.name });
      }
      stops.sort((a, b) => a.s - b.s);
      // Lines with no stations on them (sidings, freight spurs) only if it's the longest.
      if (stops.length < 2 && k > 0) return;
      const { legs, period } = timetable(path, stops, TRAIN_SPEED, TRAIN_DWELL, TRAIN_TURN);
      const group = new THREE.Group();
      const cars = Array.from({ length: CARS }, (_, c) => carriage(liveries[k % liveries.length], c === 0 ? -1 : c === CARS - 1 ? 1 : 0));
      group.add(...cars);
      parent.add(group);
      const ends = stops.length >= 2 ? `${stops[0].name} – ${stops[stops.length - 1].name}` : `Line ${k + 1}`;
      // Two trains on each of the longest routes (half a timetable apart), one on the others.
      const n = path.len > 120 ? 2 : 1;
      for (let j = 0; j < n; j++) {
        const g = j === 0 ? group : new THREE.Group();
        const cs = j === 0 ? cars : Array.from({ length: CARS }, (_, c) => carriage(liveries[k % liveries.length], c === 0 ? -1 : c === CARS - 1 ? 1 : 0));
        if (j > 0) {
          g.add(...cs);
          parent.add(g);
        }
        trains.push({ path, stops, legs, period, offset: (j * period) / n + k * 37, name: `${map.region.name} Rail · ${ends}${n > 1 ? ` (${j === 0 ? "A" : "B"})` : ""}`, group: g, cars: cs, speed: TRAIN_SPEED });
      }
    });
    // ---- ferries
    const named = new Map(JETTIES.map((j) => [j.name, toTile(map.frame, { lat: j.lat, lon: j.lon })]));
    const colours = [0x1c7ed6, 0xf08c00, 0x2f9e44, 0xe03131, 0x7048e8];
    FERRY_ROUTES.forEach(([a, b], k) => {
      const from = named.get(a);
      const to = named.get(b);
      if (!from || !to || !map.inside(Math.round(from.x), Math.round(from.z)) || !map.inside(Math.round(to.x), Math.round(to.z))) return;
      const way = waterWay(map, from, to);
      if (!way) return;
      const path = pathOf(way.map((p) => ({ x: p.x, y: 0.02, z: p.z })));
      if (path.len < 8) return;
      const { legs, period } = timetable(path, [], FERRY_SPEED, FERRY_DWELL, FERRY_DWELL);
      const g = ferry(colours[k % colours.length]);
      parent.add(g);
      ferries.push({ path, stops: [], legs, period, offset: k * 53, name: `${a} – ${b} ferry`, group: g, cars: [g], speed: FERRY_SPEED });
    });
  }

  /** Where along its route a runner is at this moment (server seconds), and how fast it's going. */
  function where(r: Runner, sec: number) {
    const t = (((sec + r.offset) % r.period) + r.period) % r.period;
    let lo = 0;
    let hi = r.legs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (r.legs[mid].t1 <= t) lo = mid + 1;
      else hi = mid;
    }
    const leg = r.legs[lo];
    const u = (t - leg.t0) / (leg.t1 - leg.t0 || 1);
    const s = leg.s0 + (leg.s1 - leg.s0) * ease(Math.min(1, Math.max(0, u)));
    const dir = leg.s1 > leg.s0 ? 1 : leg.s1 < leg.s0 ? -1 : 0;
    const moving = dir !== 0 && u > 0.05 && u < 0.95;
    return { s, dir, speed: moving ? r.speed : 0, back: lo >= r.legs.length / 2 };
  }

  function place(r: Runner, sec: number, isTrain: boolean) {
    const w = where(r, sec);
    // Facing the way it goes (or the way it last went, while it waits).
    const facing = w.dir || (w.back ? -1 : 1);
    r.cars.forEach((car, c) => {
      const off = isTrain ? (c - (r.cars.length - 1) / 2) * (CAR_LEN + CAR_GAP) * facing : 0;
      sample(r.path, w.s - off, tmp);
      car.position.set(tmp.x, tmp.y + 0.02, tmp.z);
      car.rotation.set(0, Math.atan2(-tmp.dz * facing, tmp.dx * facing), 0);
    });
  }

  function update(serverMs: number) {
    const sec = serverMs / 1000;
    for (const r of trains) place(r, sec, true);
    for (const r of ferries) place(r, sec, false);
  }

  /** Where train or ferry i is (for riding it): the middle of a carriage or the deck, facing the way it goes. */
  function pose(kind: "train" | "boat", i: number, serverMs: number, out: VehiclePose) {
    const r = (kind === "train" ? trains : ferries)[i];
    if (!r) return false;
    const w = where(r, serverMs / 1000);
    const facing = w.dir || (w.back ? -1 : 1);
    sample(r.path, w.s, tmp);
    out.x = tmp.x;
    out.y = tmp.y + (kind === "train" ? 0.04 : 0.12);
    out.z = tmp.z;
    out.yaw = Math.atan2(-tmp.dx * facing, -tmp.dz * facing);
    out.speed = w.speed;
    return true;
  }

  /** The next stop and how far (for the ride's line: "Next: Yaba"). */
  function nextStop(i: number, serverMs: number): string | null {
    const r = trains[i];
    if (!r || !r.stops.length) return null;
    const w = where(r, serverMs / 1000);
    const facing = w.dir || (w.back ? -1 : 1);
    const ahead = r.stops.filter((s) => (facing > 0 ? s.s > w.s + 0.3 : s.s < w.s - 0.3));
    const next = facing > 0 ? ahead[0] : ahead[ahead.length - 1];
    if (w.speed === 0) {
      const here = r.stops.find((s) => Math.abs(s.s - w.s) < 0.3);
      if (here) return `At ${here.name}`;
    }
    return next ? `Next: ${next.name}` : null;
  }

  function dispose() {
    clear();
    for (const m of mats) m.dispose();
    for (const g of geos) g.dispose();
  }

  return {
    build,
    update,
    pose,
    nextStop,
    dispose,
    get trains() {
      return trains.map((t) => ({ name: t.name, km: Math.round(t.path.len / 10), stops: t.stops.length }));
    },
    get ferries() {
      return ferries.map((f) => ({ name: f.name, km: Math.round(f.path.len / 10) }));
    },
  };
}
