// Up in the air over the town:
//
// - Helicopters: two of them on a sightseeing loop over the town's big landmarks (starting at
//   the airport's helipad when there is one), above the tallest towers, rotors spinning. You can
//   ride one (see pose(), and the cabin in rides.ts).
// - The rocket on the spaceport's launch pad. Twice an hour (at :15 and :45, the same moment for
//   everyone) it lights up, lifts off in a pillar of fire and smoke and climbs out of sight; a
//   new one is back on the pad a few minutes later.
//
// A handful of small meshes, built once per town.

import * as THREE from "three";
import type { CityPlan, Mega } from "@/lib/city/layout";
import type { VehiclePose } from "./traffic";
import { keyOf, type World } from "./world";

/** The landmark's middle (city units). */
const middle = (m: Mega) => ({ x: m.ax + (m.w - 1) / 2, z: m.az + (m.d - 1) / 2 });

const HELI_SPEED = 1.1;
const LAUNCH_MINUTES = [15, 45];
/** Seconds: lights and smoke, lift-off, then the climb. */
const IGNITE = 6;
const CLIMB = 34;
const BACK_AFTER = 300;

type Heli = { group: THREE.Group; rotor: THREE.Object3D; tail: THREE.Object3D; offset: number };

export function createAircraft(world: World, parent: THREE.Object3D) {
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, ...extra });
    mats.push(m);
    return m;
  };
  const geo = <T extends THREE.BufferGeometry>(g: T) => {
    geos.push(g);
    return g;
  };
  const box = geo(new THREE.BoxGeometry(1, 1, 1));
  const ball = geo(new THREE.SphereGeometry(0.5, 16, 12));
  const cyl = geo(new THREE.CylinderGeometry(0.5, 0.5, 1, 18));
  const cone = geo(new THREE.ConeGeometry(0.5, 1, 18));

  let helis: Heli[] = [];
  /** The helicopter someone here is riding (hidden from outside: you're in it). */
  let riding = -1;
  let curve: THREE.CatmullRomCurve3 | null = null;
  let curveLen = 1;
  let rocket: { group: THREE.Group; flame: THREE.Mesh; smoke: THREE.Mesh[]; x: number; z: number; pad: number } | null = null;
  const tmp = new THREE.Vector3();
  const tan = new THREE.Vector3();

  function mesh(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.castShadow = true;
    return o;
  }

  /** A helicopter, nose along +x, about 0.65 long with its tail. */
  function makeHeli(livery: number): Heli {
    const g = new THREE.Group();
    const body = lambert(livery);
    const dark = lambert(0x2b2f33);
    const glass = lambert(0x274c6e, { emissive: 0x0b1a2a, emissiveIntensity: 0.4 });
    g.add(mesh(ball, body, 0, 0.1, 0, 0.36, 0.2, 0.2));
    g.add(mesh(ball, glass, 0.1, 0.12, 0, 0.18, 0.15, 0.17));
    g.add(mesh(box, body, -0.27, 0.13, 0, 0.32, 0.04, 0.035));
    g.add(mesh(box, body, -0.42, 0.17, 0, 0.06, 0.1, 0.012));
    g.add(mesh(box, lambert(0xf8f9fa), -0.05, 0.1, 0.101, 0.18, 0.03, 0.002));
    g.add(mesh(box, lambert(0xf8f9fa), -0.05, 0.1, -0.101, 0.18, 0.03, 0.002));
    for (const side of [-1, 1]) {
      g.add(mesh(box, dark, 0, -0.02, side * 0.08, 0.34, 0.012, 0.012));
      for (const sx of [-0.08, 0.08]) g.add(mesh(box, dark, sx, 0.02, side * 0.07, 0.012, 0.06, 0.012));
    }
    g.add(mesh(cyl, dark, 0, 0.22, 0, 0.025, 0.06, 0.025));
    const rotor = new THREE.Group();
    rotor.position.set(0, 0.255, 0);
    rotor.add(mesh(box, dark, 0, 0, 0, 0.78, 0.006, 0.035));
    rotor.add(mesh(box, dark, 0, 0, 0, 0.035, 0.006, 0.78));
    g.add(rotor);
    const tail = new THREE.Group();
    tail.position.set(-0.43, 0.17, 0.012);
    tail.add(mesh(box, dark, 0, 0, 0, 0.012, 0.14, 0.004));
    g.add(tail);
    // A red light under it, blinking (the body colour does the rest).
    const beacon = mesh(ball, new THREE.MeshBasicMaterial({ color: 0xff3b3b }), 0, -0.005, 0, 0.03, 0.03, 0.03);
    mats.push(beacon.material as THREE.Material);
    g.add(beacon);
    parent.add(g);
    return { group: g, rotor, tail, offset: 0 };
  }

  function makeRocket(x: number, z: number) {
    const g = new THREE.Group();
    const white = lambert(0xf8f9fa);
    const black = lambert(0x212529);
    const grey = lambert(0xced4da);
    g.add(mesh(cyl, white, 0, 1.0, 0, 0.17, 1.9, 0.17));
    for (const y of [0.35, 1.2, 1.75]) g.add(mesh(cyl, black, 0, y, 0, 0.172, 0.05, 0.172));
    g.add(mesh(cone, white, 0, 2.1, 0, 0.17, 0.32, 0.17));
    g.add(mesh(cyl, grey, 0, 1.7, 0, 0.12, 0.04, 0.12));
    for (const side of [-1, 1]) {
      g.add(mesh(cyl, white, side * 0.12, 0.6, 0, 0.085, 1.1, 0.085));
      g.add(mesh(cone, white, side * 0.12, 1.24, 0, 0.085, 0.18, 0.085));
      g.add(mesh(box, black, side * 0.17, 0.12, 0, 0.06, 0.16, 0.01));
    }
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    mats.push(flameMat);
    const flame = new THREE.Mesh(cone, flameMat);
    flame.rotation.x = Math.PI;
    flame.visible = false;
    g.add(flame);
    const smokeMat = new THREE.MeshLambertMaterial({ color: 0xf1f3f5, transparent: true, opacity: 0.85, depthWrite: false });
    mats.push(smokeMat);
    const smoke: THREE.Mesh[] = [];
    for (let k = 0; k < 10; k++) {
      const s = new THREE.Mesh(ball, smokeMat);
      s.visible = false;
      parent.add(s);
      smoke.push(s);
    }
    g.position.set(x, 0.17, z);
    parent.add(g);
    return { group: g, flame, smoke };
  }

  function clear() {
    for (const h of helis) parent.remove(h.group);
    helis = [];
    curve = null;
    if (rocket) {
      parent.remove(rocket.group);
      for (const s of rocket.smoke) parent.remove(s);
      rocket = null;
    }
  }

  /** The loop the helicopters fly: over the landmarks that are in town, in order round the middle. */
  function makeRoute(plan: CityPlan) {
    let reach = 4;
    let top = 4;
    for (const t of world.tiles) {
      reach = Math.max(reach, Math.abs(t.x), Math.abs(t.z));
      top = Math.max(top, t.top);
    }
    const built = (m: Mega) => world.tileIndex.has(keyOf(m.ax, m.az)) && world.tileIndex.has(keyOf(m.ax + m.w - 1, m.az + m.d - 1));
    const sights = plan.megas.filter(built).map(middle);
    const air = plan.megas.find((m) => m.type === "intlairport" && built(m));
    // Never fewer than five points: fill in with a ring round the middle.
    const ring = Math.max(3, reach * 0.55);
    for (let k = 0; sights.length < 5 && k < 6; k++) sights.push({ x: Math.cos(k * 1.26 + 0.4) * ring, z: Math.sin(k * 1.26 + 0.4) * ring });
    sights.sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
    // Start from the airport's helipad (it's one of the sights).
    if (air) {
      const pad = { x: air.ax + (air.w - 1) / 2 - 2.4, z: air.az + (air.d - 1) / 2 + 1.45 };
      const i = sights.findIndex((s) => Math.abs(s.x - middle(air).x) < 0.01 && Math.abs(s.z - middle(air).z) < 0.01);
      if (i >= 0) sights[i] = pad;
    }
    const alt = Math.min(15, Math.max(6.5, top + 1.2));
    const pts = sights.map((p, k) => new THREE.Vector3(p.x, alt + (k % 2 ? 0.6 : 0), p.z));
    curve = new THREE.CatmullRomCurve3(pts, true, "centripetal", 0.5);
    curveLen = curve.getLength();
  }

  function build() {
    clear();
    const plan = world.plan;
    if (!plan || !world.tiles.length) return;
    makeRoute(plan);
    const liveries = [0xe03131, 0x1c7ed6, 0xf59f00, 0x2f9e44];
    for (let k = 0; k < 2; k++) {
      const h = makeHeli(liveries[(k + plan.seed) % liveries.length]);
      h.offset = k * 0.5;
      helis.push(h);
    }
    const sp = plan.megas.find((m) => m.type === "spaceport");
    if (sp && world.tileIndex.has(keyOf(sp.ax, sp.az)) && world.tileIndex.has(keyOf(sp.ax + sp.w - 1, sp.az + sp.d - 1))) {
      const c = middle(sp);
      const r = makeRocket(c.x - 0.6, c.z - 0.6);
      rocket = { ...r, x: c.x - 0.6, z: c.z - 0.6, pad: 0.17 };
    }
  }

  /** Where helicopter i is along its loop at time t (seconds), into pos and tan. */
  function heliAt(i: number, time: number) {
    if (!curve) return false;
    const h = helis[i];
    if (!h) return false;
    const u = ((time * HELI_SPEED) / curveLen + h.offset) % 1;
    curve.getPointAt(u, tmp);
    curve.getTangentAt(u, tan);
    return true;
  }

  function update(time: number, serverMs: number) {
    helis.forEach((h, i) => {
      h.group.visible = i !== riding;
      if (!heliAt(i, time)) return;
      h.group.position.copy(tmp);
      // A little bob, nose down a touch, banking into the turns.
      h.group.position.y += Math.sin(time * 1.3 + i) * 0.05;
      h.group.rotation.set(0, Math.atan2(-tan.z, tan.x), 0);
      h.group.rotateZ(-0.12);
      h.rotor.rotation.y = time * 28;
      h.tail.rotation.z = time * 40;
    });
    if (rocket) {
      // Seconds since the latest launch time (server clock), or a big number.
      const d = new Date(serverMs);
      const secOfHour = d.getUTCMinutes() * 60 + d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
      let since = Infinity;
      for (const m of LAUNCH_MINUTES) {
        const s = secOfHour - m * 60;
        if (s >= 0 && s < since) since = s;
      }
      const r = rocket;
      if (since < IGNITE + CLIMB) {
        const climb = Math.max(0, since - IGNITE);
        // Gently at first, then faster and faster.
        const y = r.pad + 0.5 * 0.35 * climb * climb;
        r.group.position.set(r.x, y, r.z);
        r.group.visible = y < 60;
        r.flame.visible = true;
        const flick = 0.85 + 0.15 * Math.sin(time * 40);
        const len = since < IGNITE ? 0.25 + since * 0.05 : 0.9;
        r.flame.scale.set(0.16 * flick, len * flick, 0.16 * flick);
        r.flame.position.set(0, -len / 2 + 0.02, 0);
        // A cloud of smoke round the pad, billowing out, then a trail behind.
        r.smoke.forEach((s, k) => {
          const a = (k / r.smoke.length) * Math.PI * 2;
          const grow = Math.min(1, since / 8);
          if (k < 6) {
            s.position.set(r.x + Math.cos(a) * (0.3 + grow * 0.6), 0.25 + grow * 0.2, r.z + Math.sin(a) * (0.3 + grow * 0.6));
            s.scale.setScalar(0.25 + grow * 0.55);
          } else {
            const back = (k - 6 + 1) * 0.9;
            s.position.set(r.x, Math.max(0.3, y - back), r.z);
            s.scale.setScalar(0.2 + (k - 5) * 0.12);
          }
          s.visible = true;
        });
        (r.smoke[0].material as THREE.MeshLambertMaterial).opacity = Math.max(0, 0.85 - Math.max(0, since - 25) * 0.05);
      } else {
        // On the pad (back again a few minutes after a launch).
        const gone = since < BACK_AFTER;
        r.group.visible = !gone;
        r.group.position.set(r.x, r.pad, r.z);
        r.flame.visible = false;
        for (const s of r.smoke) s.visible = false;
      }
    }
  }

  /** Where helicopter i is (for riding it): cabin floor middle, facing the way it flies. */
  function pose(i: number, time: number, out: VehiclePose) {
    if (!heliAt(i, time)) return false;
    out.x = tmp.x;
    out.y = tmp.y + Math.sin(time * 1.3 + i) * 0.05;
    out.z = tmp.z;
    out.yaw = Math.atan2(-tan.x, -tan.z);
    out.speed = HELI_SPEED;
    return true;
  }

  /** Riding helicopter i (or none, -1): it's hidden from outside while you're in it. */
  function setRide(i: number) {
    riding = i;
  }

  function dispose() {
    clear();
    for (const m of mats) m.dispose();
    for (const g of geos) g.dispose();
  }

  return { build, update, pose, setRide, dispose, get count() { return helis.length; } };
}
