// The Ferris wheel (city tiles: 1 = 10 m): two rims joined by braces, 16 spokes a side to a big
// hub, lights round the rim, 16 gondolas that hang level as it turns, on two A-frames, with a
// boarding deck and a ticket booth at the bottom. The city view turns `wheel` and keeps each
// gondola level (rotating it back by the wheel's turn); the ride sits in gondola k.

import * as THREE from "three";

/** Its radius, the axle's height, how many gondolas, and how far each hangs below the rim (tiles). */
export const FERRIS = { r: 1.25, hub: 1.62, cabins: 16, hang: 0.12 };

const G = {
  rim: new THREE.TorusGeometry(FERRIS.r, 0.022, 6, 64),
  spoke: new THREE.BoxGeometry(0.012, FERRIS.r, 0.012),
  cabin: new THREE.BoxGeometry(0.15, 0.14, 0.15),
  hub: new THREE.CylinderGeometry(0.1, 0.1, 0.24, 16),
  brace: new THREE.CylinderGeometry(0.01, 0.01, 0.2, 5),
  cabinRoof: new THREE.ConeGeometry(0.12, 0.07, 4).rotateY(Math.PI / 4),
  cabinGlass: new THREE.BoxGeometry(0.155, 0.06, 0.155),
  bulb: new THREE.SphereGeometry(0.014, 5, 4),
  leg: new THREE.BoxGeometry(0.04, 1, 0.04),
  deck: new THREE.BoxGeometry(0.7, 0.08, 0.45),
  booth: new THREE.BoxGeometry(0.12, 0.14, 0.1).translate(0, 0.07, 0),
};
/** Shared by every wheel (kept for good: a handful of materials). */
export const FERRIS_MATS = {
  frame: new THREE.MeshLambertMaterial({ color: 0xe9ecef }),
  hub: new THREE.MeshLambertMaterial({ color: 0x868e96 }),
  deck: new THREE.MeshLambertMaterial({ color: 0x495057 }),
  glass: new THREE.MeshLambertMaterial({ color: 0xbfe3f5, transparent: true, opacity: 0.7 }),
  cabins: [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2, 0xff922b].map((c) => new THREE.MeshLambertMaterial({ color: c })),
  bulbs: [0xfff3bf, 0xffc9c9, 0xd0ebff, 0xd3f9d8].map((c) => new THREE.MeshBasicMaterial({ color: c })),
};
const M = FERRIS_MATS;

/** A new wheel standing at the origin, facing ±z. */
export function ferrisWheel() {
  // Two rims joined by braces, 16 spokes a side to a big hub,
  // lights round the rim, 16 gondolas hanging level as it turns, on two A-frames, with a
  // boarding deck and a ticket booth at the bottom.
  const obj = new THREE.Group();
  const wheel = new THREE.Group();
  const R = FERRIS.r;
  for (const z of [-0.09, 0.09]) {
    const rim = new THREE.Mesh(G.rim, M.frame);
    rim.position.z = z;
    wheel.add(rim);
    const inner = new THREE.Mesh(G.rim, M.frame);
    inner.scale.setScalar(0.5);
    inner.position.z = z;
    wheel.add(inner);
    for (let k = 0; k < FERRIS.cabins; k++) {
      const sp = new THREE.Mesh(G.spoke, M.frame);
      const a = (k / FERRIS.cabins) * Math.PI * 2 + 0.1;
      sp.position.set(Math.cos(a) * (R / 2), Math.sin(a) * (R / 2), z * 0.7);
      sp.rotation.z = a - Math.PI / 2;
      wheel.add(sp);
    }
  }
  const hub = new THREE.Mesh(G.hub, M.hub);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  const cabins: THREE.Object3D[] = [];
  for (let k = 0; k < FERRIS.cabins; k++) {
    const a = (k / FERRIS.cabins) * Math.PI * 2;
    // A brace across the rims, and a gondola hanging from it.
    const brace = new THREE.Mesh(G.brace, M.frame);
    brace.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    brace.rotation.x = Math.PI / 2;
    wheel.add(brace);
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    const mat = M.cabins[k % M.cabins.length];
    const body = new THREE.Mesh(G.cabin, mat);
    body.position.y = -FERRIS.hang;
    body.castShadow = true;
    const roof = new THREE.Mesh(G.cabinRoof, M.frame);
    roof.position.y = -FERRIS.hang + 0.105;
    const glass = new THREE.Mesh(G.cabinGlass, M.glass);
    glass.position.y = -FERRIS.hang + 0.02;
    pivot.add(body, roof, glass);
    wheel.add(pivot);
    cabins.push(pivot);
  }
  // Lights round the outer rim, both faces.
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    const bulb = new THREE.Mesh(G.bulb, M.bulbs[k % M.bulbs.length]);
    bulb.position.set(Math.cos(a) * (R + 0.03), Math.sin(a) * (R + 0.03), k % 2 ? 0.1 : -0.1);
    wheel.add(bulb);
  }
  wheel.position.y = FERRIS.hub;
  obj.add(wheel);
  // Two A-frames from the ground up to the axle, and the axle across.
  for (const z of [-0.2, 0.2]) {
    for (const x of [-0.55, 0.55]) {
      const len = Math.hypot(x, FERRIS.hub);
      const leg = new THREE.Mesh(G.leg, M.frame);
      leg.scale.y = len;
      leg.position.set(x / 2, FERRIS.hub / 2, z);
      leg.rotation.z = Math.atan2(x, FERRIS.hub);
      obj.add(leg);
    }
    const tie = new THREE.Mesh(G.leg, M.frame);
    tie.scale.y = 0.6;
    tie.position.set(0, FERRIS.hub * 0.45, z);
    tie.rotation.z = Math.PI / 2;
    obj.add(tie);
  }
  const axle = new THREE.Mesh(G.leg, M.hub);
  axle.scale.y = 0.44;
  axle.position.y = FERRIS.hub;
  axle.rotation.x = Math.PI / 2;
  obj.add(axle);
  // The boarding deck under the wheel, and a ticket booth.
  const deck = new THREE.Mesh(G.deck, M.deck);
  deck.position.set(0, 0.04, 0);
  obj.add(deck);
  const booth = new THREE.Mesh(G.booth, M.cabins[0]);
  booth.position.set(0.45, 0.06, 0.32);
  obj.add(booth);
  return { obj, wheel, cabins };
}
