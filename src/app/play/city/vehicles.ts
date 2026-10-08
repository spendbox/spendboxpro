// Little vehicle models: a fire engine, an ambulance and a police car (with flashing light
// bars), plus a few simple shapes used inside rooms. Each one is drawn in metres into a Kit
// (so a room, like the fire station's engine bay, can include it in its own merged meshes), or
// built as a ready-made group in CITY units (1 unit = 10 m) for the streets:
//
//   const engine = makeFireEngine();          // ~0.8 long, front pointing along +x, wheels on y = 0
//   engine.position.set(x, 0.06, z);          // 0.06 = the road surface
//   engine.rotation.y = Math.atan2(-dz, dx);  // to drive along (dx, dz), like the city's cars
//   updateVehicleLights(engine, time);        // every frame: the light bar flashes red / blue
//   disposeVehicle(engine);                   // when done (shared paints stay)
//
// Shared paints keep it cheap: each vehicle is 2–3 meshes plus its light bulbs.

import * as THREE from "three";
import { Kit, shadeHex } from "./kit";

const RED = 0xd62828;
const WHITE = 0xf8f9fa;
const TYRE = 0x1b1b1b;
const GLASS = 0x2b3a4f;
const CHROME = 0xced4da;

/** A wheel at (x, z) of radius r and width w (its middle; axle along z). */
function wheel(k: Kit, x: number, z: number, r: number, w: number) {
  k.cyl(x, r, z - w / 2, r, r, w, TYRE, 16, { rx: Math.PI / 2 });
  k.cyl(x, r, z + (z > 0 ? w / 2 : -w / 2 - 0.012), r * 0.55, r * 0.55, 0.012, CHROME, 12, { rx: Math.PI / 2, noAo: true });
}

/** A fire engine, about 8 m long, front along +x, standing on y = 0 (metres). */
export function fireEngineKit(k: Kit) {
  k.box(0, 0.42, 0, 7.4, 0.32, 2.2, 0x343a40);
  // Body with roll-up lockers, the cab at the front.
  k.soft(-1.0, 0.72, 0, 5.4, 2.05, 2.46, RED, 0.12);
  k.soft(2.5, 0.72, 0, 2.2, 2.05, 2.46, RED, 0.2);
  for (const side of [-1, 1]) {
    k.box(-0.3, 1.25, side * 1.234, 7.1, 0.16, 0.02, WHITE, { noAo: true });
    k.box(-0.3, 0.86, side * 1.234, 7.1, 0.06, 0.02, 0xffd43b, { noAo: true });
    for (let l = 0; l < 4; l++) {
      const lx = -3.3 + l * 1.25;
      k.box(lx, 1.42, side * 1.236, 1.12, 1.18, 0.012, shadeHex(RED, 0.12), { noAo: true });
      for (let s = 1; s < 8; s++) k.box(lx, 1.42 + s * 0.15, side * 1.243, 1.1, 0.012, 0.006, shadeHex(RED, 0.25), { noAo: true });
    }
    // Cab windows.
    k.box(2.55, 1.72, side * 1.236, 1.5, 0.72, 0.02, GLASS, { noAo: true });
    k.box(2.5, 1.0, side * 1.24, 0.5, 0.32, 0.01, WHITE, { noAo: true });
  }
  k.box(3.61, 1.68, 0, 0.02, 0.82, 2.1, GLASS, { noAo: true });
  k.box(3.66, 0.45, 0, 0.14, 0.32, 2.4, CHROME);
  for (const side of [-1, 1]) k.box(3.62, 0.95, side * 0.82, 0.05, 0.2, 0.36, 0xfff3bf, { layer: "glow", noAo: true });
  k.box(3.62, 1.1, 0, 0.03, 0.3, 1.0, CHROME, { noAo: true });
  // The ladder on top, a hose reel at the back.
  for (const side of [-1, 1]) k.box(-1.0, 2.86, side * 0.42, 5.8, 0.09, 0.09, 0xdee2e6, { noAo: true });
  for (let r = 0; r < 14; r++) k.box(-3.8 + r * 0.42, 2.86, 0, 0.05, 0.05, 0.84, 0xdee2e6, { noAo: true });
  k.box(-1.0, 2.77, 0, 0.3, 0.1, 0.3, 0x495057, { noAo: true });
  k.box(-3.75, 0.9, 0, 0.12, 1.6, 2.1, shadeHex(RED, 0.18));
  k.cyl(-3.85, 1.25, -0.6, 0.38, 0.38, 1.2, 0x343a40, 16, { rx: Math.PI / 2, noAo: true });
  k.box(2.5, 2.77, 0, 0.36, 0.1, 1.7, 0x343a40, { noAo: true });
  for (const x of [2.4, -1.5, -2.7]) for (const z of [-1.08, 1.08]) wheel(k, x, z, 0.52, 0.38);
}

/** An ambulance, about 6 m long, front along +x. */
export function ambulanceKit(k: Kit, stripe = 0xe03131) {
  k.box(0, 0.38, 0, 5.8, 0.3, 2.0, 0x343a40);
  k.soft(-0.7, 0.6, 0, 4.2, 2.2, 2.25, WHITE, 0.12);
  k.soft(2.0, 0.6, 0, 1.9, 1.55, 2.15, WHITE, 0.25);
  k.box(2.95, 1.35, 0, 0.02, 0.6, 1.8, GLASS, { noAo: true });
  for (const side of [-1, 1]) {
    k.box(-0.2, 1.05, side * 1.13, 5.3, 0.22, 0.02, stripe, { noAo: true });
    k.box(-0.2, 0.85, side * 1.13, 5.3, 0.08, 0.02, 0xffd43b, { noAo: true });
    // A red cross on each side.
    k.box(-1.1, 1.6, side * 1.13, 0.7, 0.22, 0.02, stripe, { noAo: true });
    k.box(-1.1, 1.36, side * 1.13, 0.22, 0.7, 0.02, stripe, { noAo: true });
    k.box(2.05, 1.38, side * 1.08, 1.1, 0.55, 0.02, GLASS, { noAo: true });
  }
  k.box(-2.82, 0.9, 0, 0.02, 1.4, 1.9, shadeHex(WHITE, 0.06), { noAo: true });
  k.box(2.98, 0.42, 0, 0.12, 0.28, 2.1, CHROME);
  for (const side of [-1, 1]) k.box(2.96, 0.82, side * 0.75, 0.05, 0.18, 0.32, 0xfff3bf, { layer: "glow", noAo: true });
  k.box(-0.7, 2.8, 0, 0.36, 0.1, 1.6, 0x343a40, { noAo: true });
  for (const x of [1.9, -1.9]) for (const z of [-0.98, 0.98]) wheel(k, x, z, 0.42, 0.3);
}

/** A police car, about 4.6 m long, front along +x. */
export function policeCarKit(k: Kit, band = 0x1c3faa) {
  k.soft(0, 0.3, 0, 4.6, 0.72, 1.86, WHITE, 0.2);
  k.soft(-0.25, 0.95, 0, 2.4, 0.6, 1.62, GLASS, 0.18);
  k.soft(-0.25, 1.48, 0, 2.0, 0.08, 1.5, WHITE, 0.04);
  for (const side of [-1, 1]) {
    k.box(0, 0.62, side * 0.935, 4.3, 0.2, 0.02, band, { noAo: true });
    k.box(0.2, 0.55, side * 0.94, 0.02, 0.5, 0.012, 0x868e96, { noAo: true });
  }
  for (const side of [-1, 1]) k.box(2.3, 0.72, side * 0.62, 0.04, 0.14, 0.34, 0xfff3bf, { layer: "glow", noAo: true });
  k.box(-0.25, 1.56, 0, 0.32, 0.08, 1.2, 0x343a40, { noAo: true });
  for (const x of [1.45, -1.45]) for (const z of [-0.84, 0.84]) wheel(k, x, z, 0.34, 0.24);
}

// ---------------------------------------------------------------- ready-made groups (city units)

let shared: { solid: THREE.MeshLambertMaterial; glow: THREE.MeshBasicMaterial; red: THREE.MeshBasicMaterial; blue: THREE.MeshBasicMaterial; bulb: THREE.SphereGeometry } | null = null;
function paints() {
  shared ??= {
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2d2d }),
    blue: new THREE.MeshBasicMaterial({ color: 0x2d6bff }),
    bulb: new THREE.SphereGeometry(1, 10, 8),
  };
  return shared;
}

function vehicle(draw: (k: Kit) => void, bar: { x: number; y: number; half: number }) {
  const p = paints();
  const k = new Kit();
  k.floorY = -10;
  draw(k);
  const body = k.build({ solid: p.solid, glow: p.glow });
  body.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name === "solid") o.castShadow = true;
  });
  // The light bar's bulbs: red on one side, blue on the other (they take turns).
  const lights: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    for (const dz of [0.25, 0.55]) {
      const b = new THREE.Mesh(p.bulb, side < 0 ? p.red : p.blue);
      b.scale.setScalar(0.13);
      b.position.set(bar.x, bar.y, side * dz * bar.half * 1.6);
      b.userData.side = side;
      lights.push(b);
      body.add(b);
    }
  }
  const g = new THREE.Group();
  g.add(body);
  // Metres → city units.
  body.scale.setScalar(0.1);
  g.userData.lights = lights;
  return g;
}

/** A fire engine in city units (~0.8 long), front along +x, wheels on y = 0. */
export function makeFireEngine() {
  return vehicle(fireEngineKit, { x: 2.5, y: 2.9, half: 0.8 });
}
/** An ambulance in city units (~0.6 long). */
export function makeAmbulance() {
  return vehicle((k) => ambulanceKit(k), { x: -0.7, y: 2.92, half: 0.75 });
}
/** A police car in city units (~0.46 long). */
export function makePoliceCar() {
  return vehicle((k) => policeCarKit(k), { x: -0.25, y: 1.66, half: 0.55 });
}

/** Flash a vehicle's light bar (call every frame; `on` false keeps it dark). */
export function updateVehicleLights(g: THREE.Object3D, time: number, on = true) {
  const lights = g.userData.lights as THREE.Mesh[] | undefined;
  if (!lights) return;
  const flip = Math.floor(time * 6) % 2 === 0;
  for (const b of lights) b.visible = on && (b.userData.side < 0 ? flip : !flip);
}

/** Free a vehicle made here (its own shapes; the shared paints stay). */
export function disposeVehicle(g: THREE.Object3D) {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh && o.geometry !== shared?.bulb) o.geometry.dispose();
  });
  g.removeFromParent();
}

/** Free the shared paints (when the city view goes away). */
export function disposeVehicleCaches() {
  if (!shared) return;
  shared.solid.dispose();
  shared.glow.dispose();
  shared.red.dispose();
  shared.blue.dispose();
  shared.bulb.dispose();
  shared = null;
}
