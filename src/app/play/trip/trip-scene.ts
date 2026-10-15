// The trip there (docs/TRIPS.md): a few seconds of film when you go somewhere. You walk out to the
// danfo (or your car, a taxi, a keke, an okada), get in, and it drives off down a Lagos street,
// past pastel houses with water tanks, palms, hawkers' umbrellas and a billboard, to the place
// you're going, its name on a sign. On foot, you just walk there. Everything in metres; a small
// scene of plain shapes, so it plays smoothly on any phone, and all of it is freed at the end.

import * as THREE from "three";
import type { Commute } from "@/lib/world/work";
import { LOD } from "@/lib/avatar3d/lod";
import { createMyAvatar } from "../city/npc3d";
import { Kit } from "../city/kit";

/** How long each part takes (seconds). */
const T = { walk: 1.4, getIn: 0.5, drive: 2.7, arrive: 1.0 };
export const TRIP_SECONDS = T.walk + T.getIn + T.drive + T.arrive;
const WALK_ONLY_SECONDS = 3.4;

type Vehicle = { group: THREE.Group; wheels: THREE.Mesh[]; door: THREE.Vector3; seat: { x: number; y: number; z: number; ry: number }; extras: { update(dt: number): void; dispose(): void }[] };

const TYRE = 0x1b1b1b;
const GLASS = 0x22303f;

function textTexture(lines: string[], w: number, h: number, bg: string, fg: string, font = 64) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  lines.forEach((t, i) => {
    let size = font;
    g.font = `800 ${size}px system-ui, sans-serif`;
    while (g.measureText(t).width > w * 0.9 && size > 14) g.font = `800 ${(size -= 2)}px system-ui, sans-serif`;
    g.fillText(t, w / 2, (h / (lines.length + 1)) * (i + 1));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The vehicles, built facing +x, standing on y = 0, the kerb side (doors) towards +z. */
function buildVehicle(mode: Commute, paint: number, mats: { solid: THREE.Material; glow: THREE.Material }, disposers: (() => void)[]): Vehicle | null {
  if (mode === "walk") return null;
  const k = new Kit();
  k.floorY = -10;
  const group = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 18).rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: TYRE });
  disposers.push(() => (wheelGeo.dispose(), wheelMat.dispose()));
  const wheel = (x: number, z: number, r: number, w: number) => {
    const m = new THREE.Mesh(wheelGeo, wheelMat);
    m.scale.set(r, r, w);
    m.position.set(x, r, z);
    m.castShadow = true;
    group.add(m);
    wheels.push(m);
  };
  let door = new THREE.Vector3(0, 0, 1.4);
  let seat = { x: 0, y: 0.5, z: 0, ry: 0 };
  const extras: Vehicle["extras"] = [];
  if (mode === "danfo") {
    // The yellow Lagos minibus: two black stripes, the sliding door open, a roof rack.
    k.soft(0, 0.38, 0, 4.9, 1.75, 1.92, 0xf5c518, 0.18);
    k.soft(1.95, 0.38, 0, 1.0, 1.25, 1.92, 0xf5c518, 0.25);
    for (const side of [-1, 1]) {
      k.box(-0.1, 0.78, side * 0.965, 4.7, 0.09, 0.02, 0x111111, { noAo: true });
      k.box(-0.1, 1.0, side * 0.965, 4.7, 0.09, 0.02, 0x111111, { noAo: true });
      k.box(-0.5, 1.4, side * 0.965, 3.4, 0.5, 0.02, GLASS, { noAo: true });
    }
    // The open door (a dark gap on the kerb side).
    k.box(0.75, 0.42, 0.968, 0.95, 1.55, 0.02, 0x2b2b2b, { noAo: true });
    k.box(2.3, 1.12, 0, 0.3, 0.55, 1.7, GLASS, { noAo: true });
    k.box(-0.3, 2.13, 0, 3.6, 0.06, 1.6, 0x343a40);
    for (const x of [-1.8, -0.3, 1.2]) k.box(x, 2.13, 0, 0.06, 0.18, 1.6, 0x343a40);
    k.box(2.47, 0.45, 0, 0.12, 0.22, 1.9, 0x343a40);
    for (const side of [-1, 1]) k.box(2.48, 0.85, side * 0.65, 0.04, 0.16, 0.3, 0xfff3bf, { layer: "glow", noAo: true });
    for (const x of [1.6, -1.5]) for (const z of [-0.88, 0.88]) wheel(x, z, 0.38, 0.26);
    // The board on top: where it's going.
    const sign = textTexture(["OBALENDE • CMS"], 512, 96, "#111111", "#f5c518", 56);
    const sm = new THREE.MeshBasicMaterial({ map: sign });
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.34), sm);
    sp.position.set(0.2, 2.42, 0.82);
    group.add(sp);
    disposers.push(() => (sign.dispose(), sm.dispose(), sp.geometry.dispose()));
    door = new THREE.Vector3(0.75, 0, 1.55);
    seat = { x: -0.6, y: 0.62, z: 0.2, ry: Math.PI / 2 };
    // The conductor, hanging out of the door.
    const conductor = createMyAvatar(null, LOD.near, "danfo-conductor");
    conductor.root.position.set(1.05, 0.42, 1.0);
    conductor.root.rotation.y = Math.PI / 2;
    conductor.root.scale.setScalar(0.95);
    group.add(conductor.root);
    extras.push({ update: (dt) => conductor.update(dt, "idle"), dispose: () => conductor.dispose() });
  } else if (mode === "keke") {
    // The Keke Marwa: yellow body, green canopy, one wheel at the front.
    k.soft(-0.2, 0.32, 0, 1.9, 0.75, 1.25, 0xf5c518, 0.15);
    k.soft(0.95, 0.32, 0, 0.5, 0.8, 0.8, 0xf5c518, 0.15);
    k.box(-0.2, 1.75, 0, 2.2, 0.08, 1.35, 0x2f9e44);
    for (const [x, z] of [[-1.2, -0.62], [-1.2, 0.62], [0.85, -0.5], [0.85, 0.5]]) k.box(x, 1.05, z, 0.05, 0.72, 0.05, 0x2b2b2b);
    k.box(0.92, 1.05, 0, 0.04, 0.5, 0.75, GLASS, { noAo: true });
    k.box(1.2, 0.85, 0, 0.04, 0.12, 0.2, 0xfff3bf, { layer: "glow", noAo: true });
    wheel(1.0, 0, 0.27, 0.16);
    for (const z of [-0.6, 0.6]) wheel(-0.8, z, 0.27, 0.16);
    door = new THREE.Vector3(-0.4, 0, 1.15);
    seat = { x: -0.55, y: 0.42, z: 0, ry: Math.PI / 2 };
    const driver = createMyAvatar(null, LOD.near, "keke-driver");
    driver.root.position.set(0.55, 0.42, 0);
    driver.root.rotation.y = Math.PI / 2;
    group.add(driver.root);
    extras.push({ update: (dt) => driver.update(dt, "sit", 0.45), dispose: () => driver.dispose() });
  } else if (mode === "okada") {
    // A motorbike and its rider; you ride behind.
    k.box(-0.1, 0.48, 0, 1.4, 0.22, 0.26, 0x1b1b1b);
    k.soft(0.15, 0.62, 0, 0.6, 0.3, 0.34, 0xc92a2a, 0.08);
    k.box(-0.45, 0.72, 0, 0.9, 0.12, 0.3, 0x2b2b2b);
    k.box(0.7, 0.55, 0, 0.06, 0.65, 0.06, 0x868e96, { rz: -0.35 });
    k.box(0.85, 1.12, 0, 0.06, 0.06, 0.62, 0x868e96);
    k.box(0.92, 0.95, 0, 0.06, 0.12, 0.14, 0xfff3bf, { layer: "glow", noAo: true });
    wheel(0.85, 0, 0.32, 0.1);
    wheel(-0.75, 0, 0.32, 0.1);
    door = new THREE.Vector3(-0.4, 0, 0.9);
    seat = { x: -0.42, y: 0.0, z: 0, ry: Math.PI / 2 };
    const rider = createMyAvatar(null, LOD.near, "okada-rider");
    rider.root.position.set(0.05, 0, 0);
    rider.root.rotation.y = Math.PI / 2;
    group.add(rider.root);
    extras.push({ update: (dt) => rider.update(dt, "sit", 0.74), dispose: () => rider.dispose() });
  } else {
    // A car: yours (its own colour), or a taxi (Lagos yellow, the black band, a roof sign).
    const taxi = mode === "taxi";
    const body = taxi ? 0xf5c518 : paint;
    k.soft(0, 0.3, 0, 4.5, 0.72, 1.84, body, 0.22);
    k.soft(-0.25, 0.95, 0, 2.4, 0.6, 1.62, GLASS, 0.18);
    k.soft(-0.25, 1.48, 0, 2.0, 0.08, 1.5, body, 0.04);
    for (const side of [-1, 1]) {
      if (taxi) k.box(0, 0.66, side * 0.925, 4.2, 0.12, 0.02, 0x111111, { noAo: true });
      k.box(0.1, 0.55, side * 0.93, 0.02, 0.45, 0.012, 0x495057, { noAo: true });
      k.box(2.24, 0.72, side * 0.6, 0.04, 0.14, 0.34, 0xfff3bf, { layer: "glow", noAo: true });
      k.box(-2.24, 0.72, side * 0.6, 0.04, 0.12, 0.3, 0xff6b6b, { layer: "glow", noAo: true });
    }
    if (taxi) k.box(-0.25, 1.56, 0, 0.5, 0.18, 0.24, 0x111111);
    for (const x of [1.45, -1.45]) for (const z of [-0.84, 0.84]) wheel(x, z, 0.34, 0.24);
    door = new THREE.Vector3(0.2, 0, 1.35);
    seat = { x: taxi ? -0.55 : 0.05, y: 0.36, z: taxi ? 0.38 : -0.38, ry: Math.PI / 2 };
  }
  const built = k.build({ solid: mats.solid, glow: mats.glow });
  built.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      disposers.push(() => o.geometry.dispose());
    }
  });
  group.add(built);
  return { group, wheels, door, seat, extras };
}

/** A Lagos street: houses and blocks across the road, palms, umbrellas, lamps, a billboard, and the place you're going. */
function buildStreet(scene: THREE.Scene, end: number, toName: string, night: boolean, disposers: (() => void)[]) {
  const add = (m: THREE.Mesh) => {
    scene.add(m);
    disposers.push(() => m.geometry.dispose());
    return m;
  };
  const lam = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => {
    const m = new THREE.MeshLambertMaterial({ color, ...extra });
    disposers.push(() => m.dispose());
    return m;
  };
  // Ground, road, kerbs, pavement, dashes.
  const ground = add(new THREE.Mesh(new THREE.PlaneGeometry(400, 120).rotateX(-Math.PI / 2), lam(0xc9b79a)));
  ground.position.set(end / 2, -0.01, -20);
  ground.receiveShadow = true;
  const road = add(new THREE.Mesh(new THREE.PlaneGeometry(400, 8).rotateX(-Math.PI / 2), lam(0x3b3f45)));
  road.position.set(end / 2, 0, 0);
  road.receiveShadow = true;
  for (const z of [4.1, -4.1]) {
    const kerb = add(new THREE.Mesh(new THREE.BoxGeometry(400, 0.18, 0.25), lam(0xdee2e6)));
    kerb.position.set(end / 2, 0.09, z);
  }
  const pave = add(new THREE.Mesh(new THREE.PlaneGeometry(400, 3.2).rotateX(-Math.PI / 2), lam(0xb8aa94)));
  pave.position.set(end / 2, 0.02, 5.8);
  pave.receiveShadow = true;
  const dashGeo = new THREE.PlaneGeometry(2, 0.14).rotateX(-Math.PI / 2);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf8f9fa });
  disposers.push(() => (dashGeo.dispose(), dashMat.dispose()));
  for (let x = -40; x < end + 60; x += 5) {
    const d = new THREE.Mesh(dashGeo, dashMat);
    d.position.set(x, 0.015, -0.3);
    scene.add(d);
  }
  // Windows: one texture, lit at night.
  const wc = document.createElement("canvas");
  wc.width = 64;
  wc.height = 64;
  const wg = wc.getContext("2d")!;
  wg.fillStyle = "#ffffff";
  wg.fillRect(0, 0, 64, 64);
  wg.fillStyle = night ? "#ffd8a8" : "#5c6f82";
  wg.fillRect(14, 12, 36, 34);
  const winTex = new THREE.CanvasTexture(wc);
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  disposers.push(() => winTex.dispose());
  const walls = [0xf3e3c3, 0xffd8b5, 0xcfe3f5, 0xd3f0dc, 0xf1c6b0, 0xe9ecef, 0xfff3bf];
  let rnd = 7;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  disposers.push(() => boxGeo.dispose());
  const facadeMats = new Map<string, THREE.MeshLambertMaterial>();
  const facade = (color: number, w: number, h: number) => {
    const key = `${color}:${Math.round(w / 3)}:${Math.round(h / 3)}`;
    let m = facadeMats.get(key);
    if (!m) {
      const t = winTex.clone();
      t.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3)));
      t.needsUpdate = true;
      m = new THREE.MeshLambertMaterial({ color, map: t });
      facadeMats.set(key, m);
      disposers.push(() => (t.dispose(), m!.dispose()));
    }
    return m;
  };
  const roofMat = lam(0x9c4f2f);
  const tankMat = lam(0x2b2b2b);
  // Across the road: a row of houses and blocks, a few metres apart.
  for (let x = -40; x < end - 14; ) {
    const w = 6 + rand() * 7;
    const h = rand() < 0.25 ? 12 + rand() * 14 : 5 + rand() * 5;
    const d = 8 + rand() * 4;
    const b = new THREE.Mesh(boxGeo, facade(walls[Math.floor(rand() * walls.length)], w, h));
    b.scale.set(w, h, d);
    b.position.set(x + w / 2, 0, -9 - d / 2);
    b.castShadow = b.receiveShadow = true;
    scene.add(b);
    if (h < 11) {
      const r = new THREE.Mesh(boxGeo, roofMat);
      r.scale.set(w + 0.4, 0.3, d + 0.4);
      r.position.set(x + w / 2, h, -9 - d / 2);
      scene.add(r);
    }
    if (rand() < 0.7) {
      const tank = add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12), tankMat));
      tank.position.set(x + w * 0.7, h + 0.9, -10.5);
    }
    x += w + 1 + rand() * 2;
  }
  // Palms, umbrellas and street lamps along the pavements.
  const trunk = lam(0x8d6e63);
  const leaf = lam(0x2f9e44);
  const pole = lam(0x495057);
  const bulb = new THREE.MeshBasicMaterial({ color: night ? 0xffe8a8 : 0xf1f3f5 });
  disposers.push(() => bulb.dispose());
  const umbrellas = [0xe03131, 0x1971c2, 0xf59f00, 0x2f9e44, 0x7048e8];
  for (let x = -30; x < end + 30; x += 9 + rand() * 6) {
    const r = rand();
    const z = rand() < 0.5 ? -6 : 7.4;
    if (r < 0.4) {
      const t = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 5, 8), trunk));
      t.position.set(x, 2.5, z);
      for (let a = 0; a < 6; a++) {
        const l = add(new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2, 5), leaf));
        l.position.set(x + Math.cos(a) * 0.9, 4.8, z + Math.sin(a) * 0.9);
        l.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
      }
    } else if (r < 0.7) {
      const u = add(new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.6, 10), lam(umbrellas[Math.floor(rand() * umbrellas.length)])));
      u.position.set(x, 2.2, z);
      const p = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 6), pole));
      p.position.set(x, 1, z);
      const stall = add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.7), lam(0xa0522d)));
      stall.position.set(x, 0.4, z);
    } else {
      const p = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 6, 8), pole));
      p.position.set(x, 3, z);
      const b = add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), bulb));
      b.position.set(x, 6, z - Math.sign(z) * 0.4);
    }
  }
  // A billboard on the way.
  const adTex = textTexture(["NEWTOWN", "Your city. Your story."], 512, 256, "#7048e8", "#ffffff", 70);
  const adMat = new THREE.MeshBasicMaterial({ map: adTex });
  disposers.push(() => (adTex.dispose(), adMat.dispose()));
  const ad = add(new THREE.Mesh(new THREE.PlaneGeometry(8, 4), adMat));
  ad.position.set(end * 0.45, 9, -7.5);
  const adPole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 7, 8), pole));
  adPole.position.set(end * 0.45, 3.5, -7.6);
  // Where you're going: a bigger building with its name across the front.
  const dest = new THREE.Mesh(boxGeo, facade(0xffffff, 16, 16));
  dest.scale.set(16, 16, 12);
  dest.position.set(end + 4, 0, -16);
  dest.castShadow = dest.receiveShadow = true;
  scene.add(dest);
  const nameTex = textTexture([toName.toUpperCase()], 1024, 160, "#0b7285", "#ffffff", 84);
  const nameMat = new THREE.MeshBasicMaterial({ map: nameTex });
  disposers.push(() => (nameTex.dispose(), nameMat.dispose()));
  const name = add(new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), nameMat));
  name.position.set(end + 4, 12.5, -9.95);
  const canopy = add(new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 3), lam(0x0b7285)));
  canopy.position.set(end + 4, 4, -9);
}

/**
 * Play the trip in `host` (a full-screen box). mode: how you go; paint: your car's colour.
 * Calls onDone once it's over (or skipped with finish()).
 */
export function createTripScene(host: HTMLElement, o: { mode: Commute; avatar: unknown; toName: string; night: boolean; paint?: number; onProgress?: (u: number) => void; onDone: () => void }) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  } catch {
    o.onDone();
    return { finish() {}, dispose() {} };
  }
  const disposers: (() => void)[] = [];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = "block";
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(o.night ? 0x1b2340 : 0x9fd3f2);
  scene.fog = new THREE.Fog(scene.background as THREE.Color, 45, 120);
  scene.add(new THREE.HemisphereLight(o.night ? 0x7b8ab8 : 0xffffff, o.night ? 0x3a2f2a : 0xb39a7a, o.night ? 1.1 : 1.8));
  const sun = new THREE.DirectionalLight(o.night ? 0xbfd2ff : 0xfff1d8, o.night ? 0.6 : 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 120 });
  scene.add(sun, sun.target);
  const cam = new THREE.PerspectiveCamera(46, 1, 0.1, 300);
  const mats = { solid: new THREE.MeshLambertMaterial({ vertexColors: true }), glow: new THREE.MeshBasicMaterial({ vertexColors: true }) };
  disposers.push(() => (mats.solid.dispose(), mats.glow.dispose()));

  const walking = o.mode === "walk";
  const total = walking ? WALK_ONLY_SECONDS : TRIP_SECONDS;
  const end = walking ? 12 : 72;
  buildStreet(scene, end, o.toName, o.night, disposers);
  const veh = buildVehicle(o.mode, o.paint ?? 0x1c3faa, mats, disposers);
  if (veh) {
    veh.group.position.set(0, 0, 1.8);
    scene.add(veh.group);
  }
  const me = createMyAvatar(o.avatar, LOD.near, "me");
  scene.add(me.root);
  const startAt = walking ? new THREE.Vector3(-2, 0.02, 6.2) : new THREE.Vector3(-4.5, 0.02, 6.4);
  me.root.position.copy(startAt);
  me.root.rotation.y = walking ? Math.PI / 2 : Math.atan2(1, -0.6);

  const size = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h);
    cam.aspect = w / h;
    // Narrow screens see a bit wider, so the bus fits.
    cam.fov = cam.aspect < 0.8 ? 58 : 46;
    cam.updateProjectionMatrix();
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(host);

  const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  /** How far the vehicle has gone (metres) by d seconds into the drive: speeds up, cruises, slows to a stop. */
  const driven = (d: number) => {
    const u = Math.max(0, Math.min(1, d / T.drive));
    const a = 0.25;
    const v = 1 / (1 - a);
    const s = u < a ? (0.5 * v * u * u) / a : u > 1 - a ? 1 - (0.5 * v * (1 - u) * (1 - u)) / a : 0.5 * v * a + v * (u - a);
    return end * s;
  };
  let t = 0;
  // The clock starts once the first frame is on screen (building the shaders can take a slow
  // phone a second or two, and the film shouldn't be half over before you see it).
  let began = 0;
  let last = 0;
  /** How far back the camera sits: further on a tall, narrow phone screen. */
  const back = () => (cam.aspect < 0.8 ? 1.2 : 1);
  let raf = 0;
  let done = false;
  const look = new THREE.Vector3();
  const camPos = new THREE.Vector3(walking ? -4 : -1.5, 2.4, 12);
  const finish = () => {
    if (done) return;
    done = true;
    o.onDone();
  };
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const real = began ? (now - last) / 1000 : 0;
    const dt = Math.min(0.05, real);
    last = now;
    /** Easing towards a target at the same pace on any phone (however few frames it draws). */
    const k = (rate: number) => 1 - Math.exp(-real * rate);
    // The real clock (a slow phone drops frames rather than playing in slow motion).
    t = began ? (now - began) / 1000 : 0;
    let doing: "walk" | "idle" | "sit" = "idle";
    if (walking) {
      // On foot: down the pavement to the place.
      const u = ease(t / (total - 0.4));
      me.root.position.set(startAt.x + u * (end + 2 - startAt.x), 0.02, 6.2);
      doing = u < 1 ? "walk" : "idle";
      look.set(me.root.position.x + 2, 1.4, 0);
      camPos.lerp(new THREE.Vector3(me.root.position.x - 3, 2.2 * back(), 10 * back()), k(5));
    } else if (veh) {
      const tw = t;
      if (tw < T.walk) {
        // Out to the door.
        const u = ease(tw / T.walk);
        const door = veh.group.position.clone().add(veh.door);
        me.root.position.lerpVectors(startAt, door, u);
        me.root.rotation.y = Math.atan2(door.x - startAt.x, door.z - startAt.z);
        doing = "walk";
        look.set(0, 1.5, 1.5);
        camPos.set(-1.5, 2.3 * back(), 10.5 * back());
      } else if (tw < T.walk + T.getIn) {
        // In through the door, and sit down.
        const u = ease((tw - T.walk) / T.getIn);
        const door = veh.group.position.clone().add(veh.door);
        const seat = veh.group.position.clone().add(new THREE.Vector3(veh.seat.x, veh.seat.y, veh.seat.z));
        me.root.position.lerpVectors(door, seat, u);
        me.root.rotation.y = veh.seat.ry;
        doing = u > 0.6 ? "sit" : "walk";
        look.set(0.3, 1.2, 1.5);
      } else {
        const d = tw - T.walk - T.getIn;
        const x = driven(Math.min(d, T.drive));
        const prevX = veh.group.position.x;
        veh.group.position.x = x;
        const speed = (x - prevX) / Math.max(0.001, dt);
        for (const w of veh.wheels) w.rotation.z -= (speed * dt) / Math.max(0.1, w.scale.x);
        // A little bounce on the road.
        veh.group.position.y = d < T.drive ? Math.abs(Math.sin(t * 9)) * 0.025 * Math.min(1, speed / 8) : 0;
        me.root.position.set(x + veh.seat.x, veh.seat.y + veh.group.position.y, 1.8 + veh.seat.z);
        doing = "sit";
        if (d < T.drive) {
          look.set(x + 1.5, 1.4, 0);
          camPos.lerp(new THREE.Vector3(x - 2.5, 2.6 * back(), 10 * back()), k(6));
        } else {
          // There: the camera turns to the building.
          look.lerp(new THREE.Vector3(end + 4, 6, -12), k(3));
          camPos.lerp(new THREE.Vector3(end - 7, 3 * back(), 13 * back()), k(2.5));
        }
      }
    }
    me.update(dt, doing, veh?.seat.y ?? 0.45);
    if (veh) for (const e of veh.extras) e.update(dt);
    cam.position.copy(camPos);
    cam.lookAt(look);
    sun.position.set(cam.position.x + 18, 30, 20);
    sun.target.position.set(cam.position.x + 4, 0, 0);
    renderer.render(scene, cam);
    if (!began) began = last = performance.now();
    o.onProgress?.(Math.min(1, t / total));
    if (t >= total) finish();
  };
  frame();
  return {
    /** Jump to the end (Skip). */
    finish,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      me.dispose();
      if (veh) for (const e of veh.extras) e.dispose();
      for (const d of disposers) d();
      scene.clear();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
