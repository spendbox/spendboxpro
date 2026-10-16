// The vehicles in the trip film (docs/TRIPS.md): your ride (the danfo with its conductor, a keke, an
// okada, a taxi or your own car) and everything else on the road (cars, danfos, BRT buses, lorries,
// kekes, okadas, a police pickup, black convoy jeeps, wedding cars with ribbons). Built facing +x,
// standing on y = 0, the kerb side (doors) towards +z. `root` is placed on the road; `body` inside
// it bounces and leans (a flat tyre).

import * as THREE from "three";
import type { Commute } from "@/lib/world/work";
import { LOD } from "@/lib/avatar3d/lod";
import { createMyAvatar } from "../city/npc3d";
import { Kit } from "../city/kit";
import type { Atlas } from "./atlas";

export type VehicleKind = Commute | "bus" | "truck" | "suv" | "police" | "wedding";

export type Vehicle = {
  kind: VehicleKind;
  root: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Mesh[];
  /** Where you stand to get in (local), and your seat. */
  door: THREE.Vector3;
  seat: { x: number; y: number; z: number; ry: number };
  /** Half its length (for spacing). */
  half: number;
  extras: { update(dt: number, moving: boolean): void; dispose(): void }[];
  /** Lights that blink (hazards, a police bar). */
  blink: THREE.Object3D[];
  dispose(): void;
};

const TYRE = 0x1b1b1b;
const GLASS = 0x22303f;

type Mats = { solid: THREE.Material; glow: THREE.Material; tex: THREE.Material };

export function buildVehicle(kind: VehicleKind, o: { paint?: number; mats: Mats; atlas: Atlas; crew: boolean; night: boolean }): Vehicle {
  const k = new Kit();
  k.floorY = -10;
  const blinkK = new Kit();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const wheels: THREE.Mesh[] = [];
  const own: (() => void)[] = [];
  const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 16).rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: TYRE });
  own.push(() => (wheelGeo.dispose(), wheelMat.dispose()));
  const wheel = (x: number, z: number, r: number, w: number) => {
    const m = new THREE.Mesh(wheelGeo, wheelMat);
    m.scale.set(r, r, w);
    m.position.set(x, r, z);
    m.castShadow = true;
    body.add(m);
    wheels.push(m);
    // A hubcap.
    k.cyl(x, r - 0.001, z + Math.sign(z || 1) * (w / 2 + 0.005), r * 0.5, r * 0.5, 0.01, 0xadb5bd, 10, { rx: Math.PI / 2, noAo: true });
  };
  /** A driver you can just see through the glass (traffic). */
  const silhouette = (x: number, z: number, y: number) => {
    k.soft(x, y, z, 0.32, 0.5, 0.42, 0x343a40, 0.08);
    k.ball(x + 0.02, y + 0.66, z, 0.12, 0x5c3a1e);
  };
  const headlights = (x: number, zs: number[], y: number) => {
    for (const z of zs) k.box(x, y, z, 0.05, 0.15, 0.32, 0xfff3bf, { layer: "glow", noAo: true });
  };
  const tails = (x: number, zs: number[], y: number) => {
    for (const z of zs) k.box(x, y, z, 0.05, 0.13, 0.3, 0xff4d4d, { layer: "glow", noAo: true });
  };
  let door = new THREE.Vector3(0, 0, 1.4);
  let seat = { x: 0, y: 0.5, z: 0, ry: 0 };
  let half = 2.3;
  const extras: Vehicle["extras"] = [];
  const blink: THREE.Object3D[] = [];
  const person = (seed: string, x: number, y: number, z: number, ry: number, doing: string, seatH = 0.45, scale = 1) => {
    const p = createMyAvatar(null, LOD.near, seed, { skin: seed.length % 7, hairC: 0 });
    p.root.position.set(x, y, z);
    p.root.rotation.y = ry;
    p.root.scale.setScalar(scale);
    body.add(p.root);
    extras.push({ update: (dt) => p.update(dt, doing, seatH), dispose: () => p.dispose() });
  };
  const sign = (uv: keyof Atlas["uv"], x: number, y: number, z: number, w: number, h: number, ry = 0) => k.quad(x, y, z, w, h, 0xffffff, { layer: "tex", ry }, o.atlas.uv[uv]);

  if (kind === "danfo") {
    // The yellow Lagos minibus: two black stripes, the sliding door open, a roof rack.
    half = 2.5;
    k.soft(0, 0.38, 0, 4.9, 1.75, 1.92, 0xf5c518, 0.18);
    k.soft(1.95, 0.38, 0, 1.0, 1.25, 1.92, 0xf5c518, 0.25);
    for (const side of [-1, 1]) {
      k.box(-0.1, 0.78, side * 0.965, 4.7, 0.09, 0.02, 0x111111, { noAo: true });
      k.box(-0.1, 1.0, side * 0.965, 4.7, 0.09, 0.02, 0x111111, { noAo: true });
      k.box(-0.5, 1.4, side * 0.965, 3.4, 0.5, 0.02, GLASS, { noAo: true });
    }
    k.box(0.75, 0.42, 0.968, 0.95, 1.55, 0.02, 0x2b2b2b, { noAo: true });
    k.box(2.3, 1.12, 0, 0.3, 0.55, 1.7, GLASS, { noAo: true });
    k.box(-0.3, 2.13, 0, 3.6, 0.06, 1.6, 0x343a40);
    for (const x of [-1.8, -0.3, 1.2]) k.box(x, 2.13, 0, 0.06, 0.18, 1.6, 0x343a40);
    if (o.crew) k.box(-0.8, 2.19, 0.1, 1.0, 0.4, 0.8, 0x8d6e63);
    k.box(2.47, 0.45, 0, 0.12, 0.22, 1.9, 0x343a40);
    headlights(2.48, [-0.65, 0.65], 0.8);
    tails(-2.47, [-0.7, 0.7], 0.8);
    for (const x of [1.6, -1.5]) for (const z of [-0.88, 0.88]) wheel(x, z, 0.38, 0.26);
    sign("route", 0.2, 2.42, 0.82, 1.8, 0.34);
    door = new THREE.Vector3(0.75, 0, 1.55);
    seat = { x: -0.6, y: 0.62, z: 0.2, ry: Math.PI / 2 };
    if (o.crew) {
      person("danfo-conductor", 1.05, 0.42, 1.0, Math.PI / 2, "idle", 0.45, 0.95);
      person("danfo-driver", 1.55, 0.42, -0.45, Math.PI / 2, "sit", 0.62);
      person("danfo-p1", -1.3, 0.42, -0.4, Math.PI / 2, "sitTalk", 0.62);
      person("danfo-p2", 0.2, 0.42, -0.45, Math.PI / 2, "sit", 0.62);
    } else silhouette(1.55, -0.45, 0.95);
  } else if (kind === "keke") {
    half = 1.3;
    k.soft(-0.2, 0.32, 0, 1.9, 0.75, 1.25, 0xf5c518, 0.15);
    k.soft(0.95, 0.32, 0, 0.5, 0.8, 0.8, 0xf5c518, 0.15);
    k.box(-0.2, 1.75, 0, 2.2, 0.08, 1.35, 0x2f9e44);
    for (const [x, z] of [[-1.2, -0.62], [-1.2, 0.62], [0.85, -0.5], [0.85, 0.5]]) k.box(x, 1.05, z, 0.05, 0.72, 0.05, 0x2b2b2b);
    k.box(0.92, 1.05, 0, 0.04, 0.5, 0.75, GLASS, { noAo: true });
    headlights(1.2, [0], 0.85);
    tails(-1.16, [-0.5, 0.5], 0.7);
    wheel(1.0, 0, 0.27, 0.16);
    for (const z of [-0.6, 0.6]) wheel(-0.8, z, 0.27, 0.16);
    door = new THREE.Vector3(-0.4, 0, 1.15);
    seat = { x: -0.55, y: 0.42, z: 0, ry: Math.PI / 2 };
    if (o.crew) person("keke-driver", 0.55, 0.42, 0, Math.PI / 2, "sit", 0.45);
    else silhouette(0.5, 0, 0.75);
  } else if (kind === "okada") {
    half = 1.0;
    k.box(-0.1, 0.48, 0, 1.4, 0.22, 0.26, 0x1b1b1b);
    k.soft(0.15, 0.62, 0, 0.6, 0.3, 0.34, [0xc92a2a, 0x1c3faa, 0x212529][Math.floor(Math.random() * 3)], 0.08);
    k.box(-0.45, 0.72, 0, 0.9, 0.12, 0.3, 0x2b2b2b);
    k.box(0.7, 0.55, 0, 0.06, 0.65, 0.06, 0x868e96, { rz: -0.35 });
    k.box(0.85, 1.12, 0, 0.06, 0.06, 0.62, 0x868e96);
    headlights(0.92, [0], 0.95);
    wheel(0.85, 0, 0.32, 0.1);
    wheel(-0.75, 0, 0.32, 0.1);
    door = new THREE.Vector3(-0.4, 0, 0.9);
    seat = { x: -0.42, y: 0.0, z: 0, ry: Math.PI / 2 };
    if (o.crew) person("okada-rider", 0.05, 0, 0, Math.PI / 2, "sit", 0.74);
    else {
      // A rider in a bright shirt (traffic).
      k.soft(0.05, 0.85, 0, 0.36, 0.55, 0.42, [0xe03131, 0x1971c2, 0x2f9e44, 0xf59f00][Math.floor(Math.random() * 4)], 0.1);
      k.ball(0.08, 1.55, 0, 0.13, 0x5c3a1e);
      k.box(0.05, 0.62, 0, 0.5, 0.2, 0.4, 0x343a40);
    }
  } else if (kind === "bus") {
    // A BRT bus: long, blue and white.
    half = 5.5;
    k.soft(0, 0.35, 0, 11, 2.6, 2.5, 0x1864ab, 0.2);
    k.box(0, 0.35, 0, 11.02, 0.6, 2.52, 0xf8f9fa, { noAo: true });
    for (const s of [-1, 1]) k.box(-0.3, 1.45, s * 1.26, 10, 1.0, 0.02, GLASS, { noAo: true });
    k.box(5.51, 1.3, 0, 0.02, 1.3, 2.2, GLASS, { noAo: true });
    sign("brt", 0, 2.6, 1.27, 1.2, 0.5);
    headlights(5.52, [-0.9, 0.9], 0.7);
    tails(-5.52, [-1, 1], 0.8);
    for (const x of [3.8, -3.6]) for (const z of [-1.1, 1.1]) wheel(x, z, 0.5, 0.3);
    silhouette(4.7, -0.6, 1.1);
  } else if (kind === "truck") {
    // A lorry: a cab and a high wooden body.
    half = 4;
    const cab = [0x1971c2, 0xe03131, 0xf59f00, 0x2b8a3e][Math.floor(Math.random() * 4)];
    k.soft(2.9, 0.5, 0, 2.0, 2.0, 2.3, cab, 0.15);
    k.box(3.91, 1.5, 0, 0.02, 0.8, 2.0, GLASS, { noAo: true });
    k.box(-1.0, 0.7, 0, 5.8, 0.25, 2.4, 0x343a40);
    k.box(-1.0, 0.95, 0, 5.8, 2.0, 2.4, 0x8d6e63);
    for (let i = 0; i < 6; i++) k.box(-3.6 + i * 1.0, 0.95, 0, 0.04, 2.0, 2.42, 0x6b4f3a, { noAo: true });
    headlights(3.92, [-0.85, 0.85], 0.8);
    tails(-3.92, [-1, 1], 0.9);
    for (const x of [3.0, -1.8, -3.0]) for (const z of [-1.05, 1.05]) wheel(x, z, 0.5, 0.32);
    silhouette(3.0, -0.5, 1.3);
  } else if (kind === "police") {
    // A police pickup: black and blue, a light bar, POLICE on the doors.
    half = 2.6;
    k.soft(0.4, 0.35, 0, 5.1, 0.8, 1.86, 0x1c2d5a, 0.15);
    k.soft(0.9, 1.05, 0, 1.8, 0.75, 1.7, GLASS, 0.12);
    k.box(-1.3, 1.1, 0, 2.2, 0.35, 1.86, 0x1c2d5a);
    k.box(0.9, 1.82, 0, 1.6, 0.06, 1.6, 0x1c2d5a);
    for (const s of [-1, 1]) sign("police", 0.9, 0.78, s * 0.94, 1.4, 0.35, s === 1 ? 0 : Math.PI);
    headlights(2.96, [-0.6, 0.6], 0.75);
    tails(-2.16, [-0.7, 0.7], 0.85);
    for (const x of [1.9, -1.4]) for (const z of [-0.84, 0.84]) wheel(x, z, 0.38, 0.26);
    blinkK.box(0.9, 1.88, -0.4, 0.5, 0.16, 0.3, 0x4dabf7, { layer: "glow", noAo: true });
    blinkK.box(0.9, 1.88, 0.4, 0.5, 0.16, 0.3, 0xff4d4d, { layer: "glow", noAo: true });
  } else {
    // A car: yours (its own colour), a taxi (Lagos yellow, the black band, a roof sign), a black
    // convoy jeep, or a wedding car with ribbons.
    const taxi = kind === "taxi";
    const suv = kind === "suv";
    const paint = taxi ? 0xf5c518 : suv ? 0x111418 : kind === "wedding" ? 0xf8f9fa : (o.paint ?? 0x1c3faa);
    k.soft(0, 0.3, 0, 4.5, suv ? 0.95 : 0.72, 1.84, paint, 0.22);
    k.soft(-0.25, suv ? 1.22 : 0.95, 0, suv ? 2.9 : 2.4, suv ? 0.72 : 0.6, 1.62, GLASS, 0.18);
    k.soft(-0.25, suv ? 1.92 : 1.48, 0, suv ? 2.7 : 2.0, 0.08, 1.5, paint, 0.04);
    for (const side of [-1, 1]) {
      if (taxi) k.box(0, 0.66, side * 0.925, 4.2, 0.12, 0.02, 0x111111, { noAo: true });
      k.box(0.1, 0.55, side * 0.93, 0.02, 0.45, 0.012, 0x495057, { noAo: true });
    }
    headlights(2.25, [-0.6, 0.6], 0.72);
    tails(-2.25, [-0.6, 0.6], 0.72);
    if (taxi) k.box(-0.25, 1.56, 0, 0.5, 0.18, 0.24, 0x111111);
    if (kind === "wedding") {
      // Ribbons from the bonnet to the roof, a bow.
      for (const z of [-0.45, 0.45]) k.box(1.0, 1.12, z, 2.4, 0.03, 0.12, 0xf783ac, { rz: -0.35, noAo: true });
      k.ball(1.9, 1.06, 0, 0.22, 0xf783ac, { sx: 1.4 });
    }
    if (suv) {
      blinkK.box(1.2, 0.95, -0.6, 0.06, 0.08, 0.2, 0x4dabf7, { layer: "glow", noAo: true });
      blinkK.box(1.2, 0.95, 0.6, 0.06, 0.08, 0.2, 0xff4d4d, { layer: "glow", noAo: true });
    }
    for (const x of [1.45, -1.45]) for (const z of [-0.84, 0.84]) wheel(x, z, 0.34, 0.24);
    door = new THREE.Vector3(0.2, 0, 1.35);
    seat = { x: taxi ? -0.55 : 0.05, y: 0.36, z: taxi ? 0.38 : -0.38, ry: Math.PI / 2 };
    if (taxi && o.crew) person("taxi-driver", 0.15, 0.3, -0.38, Math.PI / 2, "sit", 0.42);
    else if (!o.crew) silhouette(0.1, -0.38, 0.55);
  }
  const built = k.build({ solid: o.mats.solid, glow: o.mats.glow, tex: o.mats.tex });
  built.traverse((m) => {
    if (m instanceof THREE.Mesh) {
      m.castShadow = true;
      own.push(() => m.geometry.dispose());
    }
  });
  body.add(built);
  const blinks = blinkK.build({ glow: o.mats.glow });
  blinks.traverse((m) => {
    if (m instanceof THREE.Mesh) {
      own.push(() => m.geometry.dispose());
      blink.push(m);
    }
  });
  body.add(blinks);
  // Headlight beams at night.
  if (o.night && kind !== "okada") {
    const beamGeo = new THREE.ConeGeometry(1.6, 9, 16, 1, true).rotateZ(Math.PI / 2).translate(-4.5, 0, 0);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    own.push(() => (beamGeo.dispose(), beamMat.dispose()));
    const front = kind === "bus" ? 5.5 : kind === "truck" ? 3.9 : kind === "danfo" ? 2.5 : kind === "keke" ? 1.2 : kind === "police" ? 3 : 2.25;
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(front + 9, 0.75, 0);
    beam.rotation.z = -0.06;
    body.add(beam);
  }
  return {
    kind,
    root,
    body,
    wheels,
    door,
    seat,
    half,
    extras,
    blink,
    dispose() {
      for (const e of extras) e.dispose();
      for (const d of own) d();
      root.removeFromParent();
    },
  };
}
