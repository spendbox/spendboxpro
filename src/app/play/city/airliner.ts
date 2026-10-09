// Airliners crossing the sky over the town: a proper jet (rounded fuselage with a nose and a
// tapered tail, a cockpit, a row of windows and a stripe in the airline's colours, swept wings
// with two engines, a tall tail fin), red and green lights on the wingtips, a flashing beacon
// and strobes, and two vapour trails streaming out behind. Built along +x (the nose), about
// one unit long; the caller scales and moves it. One mesh for the plane, one for the trails.

import * as THREE from "three";
import { Kit, shadeHex } from "./kit";

const WHITE = 0xf8f9fa;
const GREY = 0xc7ccd3;
const DARK = 0x223040;

/** Liveries: tail fin, stripe and engines. */
export const LIVERIES: { fin: number; stripe: number; engine: number }[] = [
  { fin: 0x0b7a3e, stripe: 0x0b7a3e, engine: WHITE }, // green
  { fin: 0xc92a2a, stripe: 0xc92a2a, engine: 0xc92a2a }, // red
  { fin: 0x1c3f94, stripe: 0xe3b04b, engine: 0x1c3f94 }, // blue and gold
  { fin: 0x5f3dc4, stripe: 0x5f3dc4, engine: GREY }, // purple
  { fin: 0xf08c00, stripe: 0x18202b, engine: WHITE }, // orange
];

function trailTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 4;
  const c = canvas.getContext("2d")!;
  const g = c.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.04, "rgba(255,255,255,0.6)");
  g.addColorStop(0.3, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createAirliner(livery: (typeof LIVERIES)[number]) {
  const k = new Kit();
  k.floorY = -100;
  const N = { noAo: true };
  // Fuselage: a tube, a rounded nose, a tapered tail.
  k.cyl(-0.38, 0, 0, 0.056, 0.056, 0.74, WHITE, 18, { rz: -Math.PI / 2 });
  k.ball(0.36, 0, 0, 0.056, WHITE, { sx: 1.9, w: 16, h: 10 });
  k.cyl(-0.38, 0.004, 0, 0.012, 0.056, 0.16, WHITE, 18, { rz: Math.PI / 2 });
  // Belly a touch darker, the window line, the airline stripe, the cockpit.
  k.box(-0.01, -0.058, 0, 0.66, 0.012, 0.07, GREY, N);
  for (const s of [-1, 1]) {
    k.box(-0.02, 0.016, s * 0.054, 0.62, 0.012, 0.006, DARK, N);
    k.box(-0.02, -0.006, s * 0.054, 0.68, 0.012, 0.006, livery.stripe, N);
  }
  k.box(0.402, 0.026, 0, 0.032, 0.016, 0.084, DARK, { noAo: true, rz: -0.5 });
  // Swept wings (tips back), with an engine under each and lights on the tips.
  for (const s of [-1, 1]) {
    const sweep = 0.5;
    const span = 0.5;
    const ry = -s * sweep;
    const cx = 0.05 - Math.sin(sweep) * span * 0.5;
    const cz = s * (0.05 + Math.cos(sweep) * span * 0.5);
    k.box(cx, -0.03, cz, 0.13, 0.012, span, WHITE, { ry, rx: s * 0.06 });
    const ex = 0.07 - Math.sin(sweep) * 0.14;
    const ez = s * (0.05 + Math.cos(sweep) * 0.14);
    k.cyl(ex - 0.06, -0.06, ez, 0.024, 0.026, 0.13, livery.engine, 14, { rz: -Math.PI / 2 });
    k.cyl(ex + 0.07, -0.06, ez, 0.02, 0.02, 0.006, DARK, 14, { rz: -Math.PI / 2 });
    k.box(ex + 0.01, -0.045, ez, 0.06, 0.02, 0.008, GREY, N);
    // Tailplanes.
    k.box(-0.47 - Math.sin(0.55) * 0.06, 0.012, s * (0.012 + Math.cos(0.55) * 0.06), 0.06, 0.008, 0.13, WHITE, { ry: -s * 0.55 });
  }
  // The tail fin, leaning back, in the airline's colour.
  k.box(-0.43, 0.035, 0, 0.12, 0.15, 0.01, livery.fin, { rz: 0.62 });
  k.box(-0.405, 0.03, 0, 0.1, 0.012, 0.012, shadeHex(livery.fin, 0.15), N);
  const geo = k.take("solid")!;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = false;

  const group = new THREE.Group();
  group.add(body);

  // Lights: red on the left wingtip, green on the right, a red beacon on top, white strobes.
  const tipX = 0.05 - Math.sin(0.5) * 0.5;
  const tipZ = 0.05 + Math.cos(0.5) * 0.5;
  const lightGeo = new THREE.SphereGeometry(0.012, 6, 5);
  const red = new THREE.MeshBasicMaterial({ color: 0xff3b3b });
  const green = new THREE.MeshBasicMaterial({ color: 0x40c057 });
  const flash = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const left = new THREE.Mesh(lightGeo, red);
  left.position.set(tipX, -0.03, -tipZ);
  const right = new THREE.Mesh(lightGeo, green);
  right.position.set(tipX, -0.03, tipZ);
  const beacon = new THREE.Mesh(lightGeo, red);
  beacon.position.set(0.05, 0.062, 0);
  const strobes = [new THREE.Mesh(lightGeo, flash), new THREE.Mesh(lightGeo, flash)];
  strobes[0].position.set(tipX - 0.01, -0.03, -tipZ - 0.01);
  strobes[1].position.set(tipX - 0.01, -0.03, tipZ + 0.01);
  group.add(left, right, beacon, ...strobes);

  // Two vapour trails from the engines, fading out behind.
  const trailTex = trailTexture();
  const trailMat = new THREE.MeshBasicMaterial({ map: trailTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const LEN = 9;
  const trailGeo = new THREE.CylinderGeometry(0.06, 0.012, LEN, 10, 1, true).rotateZ(Math.PI / 2).translate(-LEN / 2, 0, 0);
  // Map the fade along the trail (u runs round a cylinder by default: use the length instead).
  const pos = trailGeo.getAttribute("position") as THREE.BufferAttribute;
  const uv = trailGeo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, -pos.getX(i) / LEN, 0.5);
  const trails = [-1, 1].map((s) => {
    const t = new THREE.Mesh(trailGeo, trailMat);
    t.position.set(0.07 - Math.sin(0.5) * 0.14 - 0.08, -0.06, s * (0.05 + Math.cos(0.5) * 0.14));
    t.renderOrder = 2;
    return t;
  });
  group.add(...trails);

  function update(time: number) {
    beacon.visible = Math.sin(time * 4.2) > 0.55;
    const strobe = time % 1.3 < 0.08 || (time % 1.3 > 0.2 && time % 1.3 < 0.26);
    strobes[0].visible = strobes[1].visible = strobe;
  }

  function dispose() {
    geo.dispose();
    mat.dispose();
    lightGeo.dispose();
    red.dispose();
    green.dispose();
    flash.dispose();
    trailGeo.dispose();
    trailMat.dispose();
    trailTex.dispose();
  }

  return { group, update, dispose };
}
