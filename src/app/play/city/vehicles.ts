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

// ---------------------------------------------------------------- everyday traffic (metres, front along +x)

/** Lights, plates and bumpers at both ends of a vehicle len long, wide wide, lights at height y. */
function ends(k: Kit, len: number, wide: number, y: number, bumper = 0x2b2b2b) {
  const fx = len / 2;
  for (const s of [-1, 1]) {
    k.box(fx + 0.01, y, s * (wide / 2 - 0.3), 0.05, 0.15, 0.34, 0xfff3bf, { layer: "glow", noAo: true });
    k.box(-fx - 0.01, y, s * (wide / 2 - 0.3), 0.05, 0.14, 0.3, 0xff4d4d, { layer: "glow", noAo: true });
  }
  k.box(fx - 0.02, 0.32, 0, 0.16, 0.24, wide + 0.04, bumper);
  k.box(-fx + 0.02, 0.32, 0, 0.16, 0.24, wide + 0.04, bumper);
  k.box(fx + 0.07, 0.36, 0, 0.02, 0.13, 0.48, WHITE, { noAo: true });
  k.box(-fx - 0.07, 0.36, 0, 0.02, 0.13, 0.48, 0xffd43b, { noAo: true });
}

/** Wing mirrors at x, half width w, height y. */
function mirrors(k: Kit, x: number, w: number, y: number, color: number) {
  for (const s of [-1, 1]) k.box(x, y, s * (w + 0.1), 0.12, 0.12, 0.18, color, { noAo: true });
}

/**
 * A car, about 4.5 m long: a saloon in its paint, a taxi (Lagos yellow with the black band and a
 * roof sign), a black jeep (suv) or a white wedding car.
 */
export function carKit(k: Kit, paint: number, style: "sedan" | "taxi" | "suv" = "sedan") {
  const suv = style === "suv";
  const taxi = style === "taxi";
  const L = 4.5;
  const W = 1.84;
  const body = suv ? 0.92 : 0.56;
  // Lower body, the bonnet and boot shaped a little lower than the middle.
  k.soft(0, 0.3, 0, L, body, W, paint, suv ? 0.2 : 0.24);
  k.soft(1.45, 0.3 + body - 0.08, 0, 1.4, 0.1, W - 0.12, paint, 0.05);
  // The cabin: glass all round, pillars and the roof in paint.
  const cy = 0.3 + body - 0.02;
  const ch = suv ? 0.72 : 0.5;
  const cl = suv ? 2.9 : 2.6;
  // The side windows, then the windscreen and the rear window sloping into them.
  const mid = cl - 0.9;
  k.soft(-0.4, cy, 0, mid, ch, W - 0.22, GLASS, 0.1);
  k.box(-0.4 + mid / 2 + 0.12, cy, 0, 0.6, ch * 1.04, W - 0.28, GLASS, { rz: suv ? 0.35 : 0.6 });
  k.box(-0.4 - mid / 2 - 0.12, cy, 0, 0.6, ch * 1.04, W - 0.28, GLASS, { rz: suv ? -0.15 : -0.55 });
  k.soft(-0.4, cy + ch - 0.05, 0, mid + 0.25, 0.09, W - 0.3, paint, 0.04);
  for (const s of [-1, 1]) {
    k.box(-0.4, cy, s * (W / 2 - 0.12), 0.1, ch, 0.03, paint, { noAo: true });
    // Door lines and handles.
    k.box(0.2, 0.42, s * (W / 2 + 0.005), 0.02, body - 0.1, 0.01, shadeHex(paint, 0.3), { noAo: true });
    k.box(-0.95, 0.42, s * (W / 2 + 0.005), 0.02, body - 0.1, 0.01, shadeHex(paint, 0.3), { noAo: true });
    k.box(-0.05, 0.3 + body * 0.72, s * (W / 2 + 0.01), 0.18, 0.04, 0.02, CHROME, { noAo: true });
    k.box(-1.2, 0.3 + body * 0.72, s * (W / 2 + 0.01), 0.18, 0.04, 0.02, CHROME, { noAo: true });
    if (taxi) k.box(0, 0.3 + body * 0.45, s * (W / 2 + 0.006), L - 0.3, 0.12, 0.01, 0x111111, { noAo: true });
  }
  // A grille.
  k.box(L / 2 + 0.005, 0.5, 0, 0.02, 0.18, 0.8, 0x1b1b1b, { noAo: true });
  mirrors(k, 0.75, W / 2, cy + 0.12, paint);
  if (taxi) k.box(-0.4, cy + ch + 0.04, 0, 0.5, 0.18, 0.24, 0x111111);
  if (suv) for (const s of [-1, 1]) k.box(-0.4, cy + ch + 0.05, s * 0.6, mid + 0.2, 0.04, 0.06, 0x495057, { noAo: true });
  ends(k, L, W, 0.3 + body * 0.62);
  for (const x of [1.45, -1.45]) for (const z of [-0.84, 0.84]) wheel(k, x, z, suv ? 0.4 : 0.34, 0.24);
}

/**
 * A danfo: the yellow Lagos minibus, about 5 m long, two black stripes down each side, the
 * sliding door, windows all along, a roof rack (and something tied on it now and then).
 */
export function danfoKit(k: Kit, load = false) {
  const Y = 0xf5c518;
  const L = 4.9;
  const W = 1.92;
  k.soft(-0.2, 0.36, 0, L - 0.4, 1.78, W, Y, 0.18);
  // The sloping nose and its windscreen.
  k.soft(1.98, 0.36, 0, 0.95, 1.2, W, Y, 0.22);
  k.box(2.3, 1.2, 0, 0.32, 0.62, W - 0.24, GLASS, { noAo: true, rz: -0.35 });
  for (const s of [-1, 1]) {
    k.box(-0.15, 0.78, s * (W / 2 + 0.006), L - 0.3, 0.09, 0.012, 0x111111, { noAo: true });
    k.box(-0.15, 1.0, s * (W / 2 + 0.006), L - 0.3, 0.09, 0.012, 0x111111, { noAo: true });
    // The windows, in a row (the driver's at the front).
    for (let w = 0; w < 4; w++) k.box(-1.85 + w * 0.92, 1.18, s * (W / 2 + 0.006), 0.8, 0.52, 0.012, GLASS, { noAo: true });
    k.box(1.55, 1.18, s * (W / 2 + 0.006), 0.55, 0.5, 0.012, GLASS, { noAo: true });
  }
  // The sliding door, open a crack (kerb side), and the rear doors.
  k.box(0.72, 0.42, W / 2 + 0.012, 0.95, 1.55, 0.012, 0x2b2b2b, { noAo: true });
  k.box(-L / 2 + 0.185, 0.5, 0, 0.012, 1.45, W - 0.2, shadeHex(Y, 0.12), { noAo: true });
  k.box(-L / 2 + 0.18, 1.2, 0, 0.012, 0.45, W - 0.5, GLASS, { noAo: true });
  // The roof rack.
  k.box(-0.3, 2.16, 0, 3.6, 0.05, 1.6, 0x343a40, { noAo: true });
  for (const x of [-1.9, -0.3, 1.3]) k.box(x, 2.14, 0, 0.06, 0.16, 1.62, 0x343a40, { noAo: true });
  if (load) {
    k.soft(-0.9, 2.21, 0.1, 1.1, 0.42, 0.9, 0x8d6e63, 0.08);
    k.soft(0.4, 2.21, -0.2, 0.7, 0.3, 0.6, 0x1971c2, 0.06);
  }
  mirrors(k, 1.75, W / 2, 1.25, 0x1b1b1b);
  ends(k, L, W, 0.82);
  for (const x of [1.6, -1.5]) for (const z of [-0.9, 0.9]) wheel(k, x, z, 0.38, 0.26);
}

/** A white or coloured panel van (like a danfo, plainer), about 5.2 m long. */
export function vanKit(k: Kit, paint: number) {
  const L = 5.2;
  const W = 2.05;
  k.soft(-0.25, 0.38, 0, L - 0.5, 1.9, W, paint, 0.16);
  k.soft(2.05, 0.38, 0, 1.0, 1.3, W, paint, 0.24);
  k.box(2.38, 1.3, 0, 0.3, 0.62, W - 0.24, GLASS, { noAo: true, rz: -0.35 });
  for (const s of [-1, 1]) {
    k.box(1.6, 1.25, s * (W / 2 + 0.006), 0.6, 0.55, 0.012, GLASS, { noAo: true });
    k.box(0.9, 0.5, s * (W / 2 + 0.006), 0.02, 1.5, 0.01, shadeHex(paint, 0.3), { noAo: true });
  }
  mirrors(k, 1.8, W / 2, 1.35, 0x1b1b1b);
  ends(k, L, W, 0.85);
  for (const x of [1.75, -1.65]) for (const z of [-0.95, 0.95]) wheel(k, x, z, 0.4, 0.27);
}

/** A BRT bus: long, blue and white, windows all along, a door each side of the middle. About 11 m. */
export function brtBusKit(k: Kit) {
  const L = 11;
  const W = 2.5;
  k.soft(0, 0.32, 0, L, 2.7, W, 0x1864ab, 0.22);
  k.box(0, 0.32, 0, L + 0.02, 0.62, W + 0.02, WHITE, { noAo: true });
  k.box(0, 2.62, 0, L - 0.4, 0.25, W - 0.3, 0xdee2e6);
  for (const s of [-1, 1]) {
    for (let w = 0; w < 8; w++) k.box(-4.6 + w * 1.25, 1.3, s * (W / 2 + 0.006), 1.12, 0.95, 0.012, GLASS, { noAo: true });
    k.box(2.6, 0.45, s * (W / 2 + 0.008), 1.0, 1.95, 0.012, 0x22303f, { noAo: true });
    k.box(-1.2, 0.45, s * (W / 2 + 0.008), 1.0, 1.95, 0.012, 0x22303f, { noAo: true });
    k.box(0, 1.0, s * (W / 2 + 0.008), L - 0.6, 0.08, 0.012, 0xfab005, { noAo: true });
  }
  k.box(L / 2 + 0.01, 1.05, 0, 0.02, 1.45, W - 0.25, GLASS, { noAo: true });
  k.box(L / 2 + 0.015, 2.55, 0, 0.02, 0.28, 1.4, 0x111111, { noAo: true });
  k.box(L / 2 + 0.02, 2.58, 0, 0.01, 0.18, 1.2, 0xffd43b, { layer: "glow", noAo: true });
  k.box(-L / 2 - 0.01, 1.4, 0, 0.02, 0.9, W - 0.4, GLASS, { noAo: true });
  mirrors(k, L / 2 - 0.25, W / 2, 2.1, 0x1b1b1b);
  ends(k, L, W, 0.75, 0x343a40);
  for (const x of [3.8, -3.6]) for (const z of [-1.12, 1.12]) wheel(k, x, z, 0.52, 0.3);
}

/** A police pickup at the HQ and the bank: dark blue, POLICE stripe, a light bar. About 5.2 m. */
export function policePickupKit(k: Kit) {
  const P = 0x1c2d5a;
  k.soft(0.4, 0.33, 0, 5.1, 0.8, 1.86, P, 0.15);
  k.soft(0.9, 1.08, 0, 1.8, 0.75, 1.7, GLASS, 0.12);
  k.box(0.9, 1.81, 0, 1.6, 0.08, 1.6, P);
  k.box(-1.3, 1.1, 0, 2.2, 0.3, 1.86, P);
  for (const s of [-1, 1]) {
    k.box(0.4, 0.75, s * 0.94, 4.8, 0.16, 0.01, WHITE, { noAo: true });
    k.box(0.9, 1.08, s * 0.86, 0.08, 0.75, 0.02, P, { noAo: true });
  }
  k.box(0.9, 1.9, -0.4, 0.5, 0.15, 0.3, 0x4dabf7, { layer: "glow", noAo: true });
  k.box(0.9, 1.9, 0.4, 0.5, 0.15, 0.3, 0xff4d4d, { layer: "glow", noAo: true });
  mirrors(k, 1.55, 0.93, 1.25, P);
  k.box(2.96, 0.32, 0, 0.16, 0.26, 1.9, 0x2b2b2b);
  for (const s of [-1, 1]) k.box(2.97, 0.78, s * 0.62, 0.04, 0.14, 0.32, 0xfff3bf, { layer: "glow", noAo: true });
  for (const x of [1.9, -1.4]) for (const z of [-0.84, 0.84]) wheel(k, x, z, 0.38, 0.26);
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
