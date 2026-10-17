// A park you go into, drawn as a proper amusement park (metres, centred on 0, 0, floor at y = 0):
// about 110 m across inside a ring of tall trees, under its own sky. In through the gates with
// the park's name on the arch, down the main avenue to a fountain, and round it: a big Ferris
// wheel, a roller coaster with cars that run the track, a carousel, a swing ride, a drop tower, a
// pirate ship, bumper cars, teacups, food stalls (suya, puff-puff, ice cream, popcorn, drinks),
// balloon sellers, benches, lamps and bunting, and crowds everywhere. Everything that moves in a
// real fair moves here. Shaped like an Interior, so it's drawn over the city like a room is.

import * as THREE from "three";
import { sign, Sheet } from "./interior-art";
import type { Interior, RoomItem, View } from "./interiors";
import type { Block } from "./interact";
import type { Spot } from "./figures";
import { Kit, pickOf, rngFrom } from "./kit";

const HALF = 52;
const BRIGHT = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2, 0xff922b, 0x22b8cf, 0xf06595];
const LEAVES = [0x4f8a5b, 0x5f9e6a, 0x3f7a4f, 0x6aa86f, 0x2f6b3f];

type Mover = (t: number) => void;

export function createAmusementPark(key: string, name: string): Interior {
  const rnd = rngFrom(`fair|${key}`);
  const root = new THREE.Group();
  const sheet = new Sheet(512);
  const title = (name || "Fun Park").slice(0, 26);
  const arch = sheet.paint(480, 96, (c, w, h) => sign(c, w, h, title.toUpperCase(), 0xc92a2a, 0xfff3bf, { weight: 900, sub: "FUN PARK · OPEN DAILY" }));
  const coasterSign = sheet.paint(240, 60, (c, w, h) => sign(c, w, h, "THUNDER RUN", 0x1c3faa, 0xffd43b, { weight: 900 }));
  const stallNames = ["SUYA SPOT", "PUFF-PUFF", "ICE CREAM", "POPCORN", "CHAPMAN", "CANDY FLOSS"];
  const stallSigns = stallNames.map((n, i) => sheet.paint(160, 40, (c, w, h) => sign(c, w, h, n, BRIGHT[i % BRIGHT.length], 0xffffff, { weight: 800 })));
  const tex = sheet.finish();

  const mats = {
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    tex: new THREE.MeshLambertMaterial({ vertexColors: true, map: tex }),
    texGlow: new THREE.MeshBasicMaterial({ vertexColors: true, map: tex }),
    foliage: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    glass: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }),
  };
  const spots: Spot[] = [];
  const seats: Spot[] = [];
  const items: RoomItem[] = [];
  const blocks: Block[] = [];
  const movers: Mover[] = [];
  const extraMats: THREE.Material[] = [];
  const bulbs: THREE.Mesh[] = [];

  /** Build with a fresh kit and add it (to a moving part, or the park). */
  function part(parent: THREE.Object3D, draw: (k: Kit) => void) {
    const k = new Kit();
    draw(k);
    const g = k.build(mats);
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        if (o.name === "glow") bulbs.push(o);
      }
    });
    parent.add(g);
    return g;
  }
  const block = (x: number, z: number, w: number, d: number, ry = 0) => blocks.push({ x, z, w, d, ry });
  const stand = (x: number, z: number, ry: number) => spots.push({ x, z, ry, pose: "stand", y: 0 });
  /** A few people standing round a point, chatting or looking at a ride. */
  function crowd(cx: number, cz: number, n: number, r = 1.2, look?: { x: number; z: number }) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd();
      const px = cx + Math.cos(a) * r * (0.6 + rnd() * 0.5);
      const pz = cz + Math.sin(a) * r * (0.6 + rnd() * 0.5);
      const t = look ?? { x: cx, z: cz };
      stand(px, pz, Math.atan2(t.x - px, t.z - pz));
    }
  }

  // ---------------------------------------------------------------- sky, ground, the tree ring
  // Inside the camera's reach from anywhere in the park (it draws 400 m): a bigger dome leaves a hole.
  const skyGeo = new THREE.SphereGeometry(300, 32, 16);
  const skyCol: number[] = [];
  const pos = skyGeo.getAttribute("position");
  const top = new THREE.Color(0x3d8bd9);
  const low = new THREE.Color(0xcfe8f7);
  const cc = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / 220));
    cc.copy(low).lerp(top, Math.pow(t, 0.6));
    skyCol.push(cc.r, cc.g, cc.b);
  }
  skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(skyCol, 3));
  const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  root.add(sky);

  part(root, (k) => {
    // Grass out to the hills, the fair's paving inside the fence.
    k.cyl(0, -0.06, 0, 340, 340, 0.05, 0x6fae5a, 48, { noAo: true });
    k.box(0, -0.02, 0, HALF * 2 + 4, 0.02, HALF * 2 + 4, 0x7cbc66, { noAo: true });
    // The main avenue (gates to the fountain), the cross walk, the loop round the plaza.
    k.box(0, 0, 24, 9, 0.03, 52, 0xd8c7a6, { noAo: true });
    k.box(0, 0, -6, 92, 0.03, 7, 0xd8c7a6, { noAo: true });
    k.box(-30, 0, -20, 7, 0.03, 34, 0xd8c7a6, { noAo: true });
    k.box(30, 0, -20, 7, 0.03, 34, 0xd8c7a6, { noAo: true });
    k.cyl(0, 0.005, 0, 12, 12, 0.03, 0xe4d6b8, 40, { noAo: true });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      k.box(Math.cos(a) * 11.6, 0.01, Math.sin(a) * 11.6, 1.2, 0.03, 0.5, 0xc4ab82, { ry: -a, noAo: true });
    }
    // Far hills all round (beyond the trees), so the fair sits in the country.
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rnd() * 0.2;
      const r = 170 + rnd() * 70;
      k.ball(Math.cos(a) * r, -8, Math.sin(a) * r, 28 + rnd() * 30, pickOf(rnd, [0x5c8f55, 0x4f7f4b, 0x6b9a5c]), { sy: 0.45, w: 10, h: 6, noAo: true });
    }
  });
  // A ring of tall trees round the fence (hides the town), and a white picket fence.
  part(root, (k) => {
    for (let i = 0; i < 110; i++) {
      const a = (i / 110) * Math.PI * 2;
      const side = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? HALF / Math.abs(Math.cos(a)) : HALF / Math.abs(Math.sin(a));
      for (let row = 0; row < 2; row++) {
        const r = Math.min(side, HALF * 1.42) + 3 + row * 5 + rnd() * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (z > HALF && Math.abs(x) < 8) continue;
        const h = 9 + rnd() * 8;
        k.cyl(x, 0, z, 0.35, 0.5, h * 0.45, 0x6b4f37, 6);
        k.leafy(x, h * 0.55, z, 3 + rnd() * 2, pickOf(rnd, LEAVES), { sy: 1.2, detail: 1 });
        if (rnd() < 0.5) k.leafy(x + 1, h * 0.8, z, 2.2, pickOf(rnd, LEAVES), { detail: 1 });
      }
    }
    for (const [x, z, w, d] of [[0, -HALF, HALF * 2, 0.1], [0, HALF, HALF * 2, 0.1], [-HALF, 0, 0.1, HALF * 2], [HALF, 0, 0.1, HALF * 2]] as const) {
      if (z === HALF) {
        k.box(-HALF / 2 - 3, 0.5, z, HALF - 6, 0.08, 0.06, 0xffffff);
        k.box(HALF / 2 + 3, 0.5, z, HALF - 6, 0.08, 0.06, 0xffffff);
      } else k.box(x, 0.5, z, w, 0.08, d, 0xffffff);
    }
  });

  // ---------------------------------------------------------------- the gates
  part(root, (k) => {
    for (const sx of [-6, 6]) {
      k.box(sx, 0, HALF, 2.2, 10, 2.2, 0xf8f0e3);
      for (let y = 1; y < 10; y += 2) k.box(sx, y, HALF, 2.3, 0.3, 2.3, 0xc92a2a);
      k.cyl(sx, 10, HALF, 0, 1.8, 3, 0xc92a2a, 4, { ry: Math.PI / 4 });
      k.ball(sx, 13.2, HALF, 0.35, 0xffd43b, { layer: "glow" });
    }
    k.box(0, 7.4, HALF, 10.4, 2.6, 0.6, 0xffffff, { layer: "tex" });
    k.quad(0, 8.7, HALF + 0.31, 10, 2.4, 0xffffff, { layer: "texGlow" }, arch);
    k.quad(0, 8.7, HALF - 0.31, 10, 2.4, 0xffffff, { layer: "texGlow", ry: Math.PI }, arch);
    for (let i = 0; i < 14; i++) k.ball(-5 + i * (10 / 13), 10.1, HALF, 0.16, BRIGHT[i % BRIGHT.length], { layer: "glow" });
    // Ticket booths and the turnstiles.
    for (const sx of [-12, 12]) {
      k.box(sx, 0, HALF - 1, 3, 2.6, 2.4, 0xfff3bf);
      k.box(sx, 2.6, HALF - 1, 3.4, 0.3, 2.8, 0xe03131);
      k.box(sx, 1.1, HALF - 2.21, 2, 1, 0.02, 0x4c6e91, { layer: "glass" });
    }
    for (let i = -2; i <= 2; i++) k.box(i * 1.4, 0, HALF - 2, 0.25, 1, 0.8, 0x868e96);
  });
  block(-12, HALF - 1, 3.4, 2.8);
  block(12, HALF - 1, 3.4, 2.8);
  items.push({ kind: "photo", label: "Photo by the gates", x: 0, y: 0, z: HALF - 6, r: 1.6 });
  crowd(-3, HALF - 7, 5, 1.6);
  crowd(4, HALF - 12, 4, 1.3);

  // ---------------------------------------------------------------- the fountain in the plaza
  const jets = new THREE.Group();
  part(root, (k) => {
    k.cyl(0, 0, 0, 5.2, 5.4, 0.6, 0xe9ecef, 32);
    k.cyl(0, 0.45, 0, 4.8, 4.8, 0.1, 0x4dabf7, 32, { noAo: true });
    k.cyl(0, 0.5, 0, 1.2, 1.5, 1.6, 0xdee2e6, 16);
    k.cyl(0, 2.1, 0, 2.2, 1.6, 0.3, 0xe9ecef, 20);
    k.ball(0, 2.6, 0, 0.6, 0xffd43b, { layer: "glow" });
  });
  root.add(jets);
  const jetMat = new THREE.MeshBasicMaterial({ color: 0xd0ebff, transparent: true, opacity: 0.7, depthWrite: false });
  const jetGeo = new THREE.CylinderGeometry(0.06, 0.18, 1, 8).translate(0, 0.5, 0);
  const jetList: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const j = new THREE.Mesh(jetGeo, jetMat);
    j.position.set(Math.cos(a) * 3.2, 0.5, Math.sin(a) * 3.2);
    jets.add(j);
    jetList.push(j);
  }
  movers.push((t) => jetList.forEach((j, i) => (j.scale.y = 1.6 + Math.sin(t * 2.4 + i) * 0.9)));
  block(0, 0, 11, 11);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    crowd(Math.cos(a) * 8.5, Math.sin(a) * 8.5, 3, 0.9);
  }

  // ---------------------------------------------------------------- the big wheel (north)
  {
    const W = { x: 0, z: -38, r: 16, hub: 19 };
    const base = new THREE.Group();
    base.position.set(W.x, 0, W.z);
    root.add(base);
    part(base, (k) => {
      for (const z of [-1.6, 1.6]) {
        for (const x of [-7.5, 7.5]) {
          const len = Math.hypot(x, W.hub);
          k.box(x, 0, z, 0.5, len, 0.5, 0xe9ecef, { rz: Math.atan2(x, W.hub) });
        }
      }
      k.box(0, W.hub - 0.3, 0, 0.6, 0.6, 3.6, 0x868e96);
      k.box(0, 0, 3, 12, 0.5, 4, 0x495057);
      k.box(5, 0.5, 4.2, 1.8, 2.3, 1.6, 0xff6b6b);
    });
    const wheel = new THREE.Group();
    wheel.position.y = W.hub;
    base.add(wheel);
    part(wheel, (k) => {
      for (const z of [-1, 1]) {
        k.ring(0, 0, z, W.r, 0.18, 0xf1f3f5, { rx: 0 });
        k.ring(0, 0, z, W.r * 0.55, 0.12, 0xf1f3f5);
        for (let s = 0; s < 24; s++) {
          const a = (s / 24) * Math.PI * 2;
          k.box(0, 0, z * 0.7, 0.1, W.r, 0.1, 0xdee2e6, { rz: a - Math.PI / 2 });
        }
      }
      k.cyl(0, -1.2, 0, 1.1, 1.1, 2.4, 0x868e96, 16, { rx: Math.PI / 2 });
      for (let b = 0; b < 72; b++) {
        const a = (b / 72) * Math.PI * 2;
        k.ball(Math.cos(a) * (W.r + 0.25), Math.sin(a) * (W.r + 0.25), b % 2 ? 1.1 : -1.1, 0.13, BRIGHT[b % BRIGHT.length], { layer: "glow", w: 6, h: 4 });
      }
    });
    const gondolas: THREE.Group[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * W.r, Math.sin(a) * W.r, 0);
      part(g, (k) => {
        k.box(0, -0.15, 0, 0.12, 0.3, 0.12, 0x495057);
        k.soft(0, -2.3, 0, 1.9, 1.9, 1.9, BRIGHT[i % BRIGHT.length], 0.25);
        k.box(0, -1.6, 0, 1.95, 0.7, 1.95, 0xbfe3f5, { layer: "glass" });
        k.cyl(0, -0.45, 0, 0.1, 1.2, 0.35, 0xffffff, 4, { ry: Math.PI / 4 });
      });
      wheel.add(g);
      gondolas.push(g);
    }
    movers.push((t) => {
      wheel.rotation.z = t * ((Math.PI * 2) / 80);
      for (const g of gondolas) g.rotation.z = -wheel.rotation.z;
    });
    block(W.x, W.z, 17, 7);
    items.push({ kind: "photo", label: "Photo by the big wheel", x: W.x, y: 0, z: W.z + 9, r: 1.8 });
    crowd(W.x - 4, W.z + 9, 6, 1.8, { x: W.x, z: W.z });
    crowd(W.x + 5, W.z + 10, 4, 1.4, { x: W.x, z: W.z });
  }

  // ---------------------------------------------------------------- the roller coaster (west)
  {
    const C = { x: -32, z: -22 };
    const pts: THREE.Vector3[] = [];
    const N = 14;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rx = 15 + Math.sin(a * 2) * 2;
      const rz = 11 + Math.cos(a * 3) * 2;
      const h = i === 0 ? 3 : i === 1 ? 9 : i === 2 ? 18 : i === 3 ? 6 : 4 + Math.abs(Math.sin(a * 2.5)) * 9;
      pts.push(new THREE.Vector3(C.x + Math.cos(a) * rx, h, C.z + Math.sin(a) * rz));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.4);
    const railMat = new THREE.MeshLambertMaterial({ color: 0xe03131 });
    const tieMat = new THREE.MeshLambertMaterial({ color: 0xffd43b });
    const extra: THREE.Material[] = [railMat, tieMat];
    const upV = new THREE.Vector3(0, 1, 0);
    const sideV = new THREE.Vector3();
    for (const side of [-0.55, 0.55]) {
      const railPts: THREE.Vector3[] = [];
      for (let i = 0; i < 300; i++) {
        const p = curve.getPointAt(i / 300);
        sideV.crossVectors(curve.getTangentAt(i / 300), upV).normalize();
        railPts.push(p.clone().addScaledVector(sideV, side));
      }
      const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts, true), 300, 0.12, 6, true), railMat);
      rail.castShadow = true;
      root.add(rail);
    }
    part(root, (k) => {
      for (let i = 0; i < 300; i += 3) {
        const p = curve.getPointAt(i / 300);
        const tg = curve.getTangentAt(i / 300);
        k.box(p.x, p.y - 0.1, p.z, 1.3, 0.12, 0.25, 0xffd43b, { ry: Math.atan2(tg.x, tg.z), noAo: true });
        if (i % 9 === 0 && p.y > 0.8) k.box(p.x, 0, p.z, 0.3, p.y - 0.15, 0.3, 0xadb5bd);
      }
      // The station and its sign.
      const s = curve.getPointAt(0);
      k.box(s.x, 0, s.z, 6, 2.8, 3.5, 0x1c3faa);
      k.box(s.x, 2.8, s.z, 7, 0.3, 4.5, 0xffd43b);
      k.quad(s.x, 3.8, s.z + 2.3, 5, 1.25, 0xffffff, { layer: "texGlow" }, coasterSign);
    });
    const cars: THREE.Group[] = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      part(g, (k) => {
        k.soft(0, 0.2, 0, 1.3, 0.8, 1.8, i === 0 ? 0x1c3faa : 0x4dabf7, 0.2);
        k.box(0, 1, -0.5, 1.1, 0.5, 0.15, 0x212529);
        k.ball(0, 1.3, 0.1, 0.25, 0xf1c27d);
        k.ball(0, 1.3, -0.6, 0.25, 0x8d5524);
      });
      root.add(g);
      cars.push(g);
    }
    const look = new THREE.Vector3();
    movers.push((t) => {
      const u0 = (t / 26) % 1;
      cars.forEach((g, i) => {
        // Slow up the lift hill, fast down the drop.
        let u = (u0 - i * 0.012 + 1) % 1;
        u = u < 0.15 ? u * 0.6 : 0.09 + ((u - 0.15) / 0.85) * 0.91;
        const p = curve.getPointAt(u);
        g.position.copy(p);
        look.copy(curve.getPointAt((u + 0.004) % 1));
        g.lookAt(look);
      });
    });
    blocks.push({ x: C.x, z: C.z, w: 30, d: 22, ry: 0 });
    crowd(C.x + 17, C.z + 4, 6, 1.8, { x: C.x, z: C.z });
    extraMats.push(...extra);
  }

  // ---------------------------------------------------------------- the carousel (east, by the plaza)
  {
    const P = { x: 22, z: 10 };
    const spin = new THREE.Group();
    spin.position.set(P.x, 0, P.z);
    root.add(spin);
    part(root, (k) => {
      k.cyl(P.x, 0, P.z, 7.2, 7.4, 0.5, 0xf8f0e3, 32);
      k.cyl(P.x, 0.5, P.z, 1.3, 1.3, 5.5, 0xffd43b, 16);
    });
    part(spin, (k) => {
      k.cyl(0, 5.6, 0, 7.4, 7.4, 0.6, 0xe03131, 32);
      k.cyl(0, 6.2, 0, 0.6, 7.6, 2.4, 0xffffff, 16);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        k.cyl(Math.cos(a) * 7.3, 5.2, Math.sin(a) * 7.3, 0.35, 0, 0.45, i % 2 ? 0xe03131 : 0xffffff, 3, { rx: Math.PI, noAo: true });
        k.ball(Math.cos(a) * 7.4, 5.85, Math.sin(a) * 7.4, 0.14, 0xfff3bf, { layer: "glow", w: 6, h: 4 });
      }
    });
    const horses: THREE.Group[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const h = new THREE.Group();
      const r = i % 2 ? 4.2 : 5.8;
      h.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      h.rotation.y = -a;
      part(h, (k) => {
        k.cyl(0, 0.5, 0, 0.05, 0.05, 5.1, 0xffd43b, 6);
        const col = pickOf(rnd, [0xffffff, 0x8d5a3b, 0x212529, 0xf1e3c8]);
        k.soft(0, 1.4, 0, 0.5, 0.6, 1.5, col, 0.2);
        k.soft(0, 1.9, 0.75, 0.3, 0.7, 0.35, col, 0.12, { rx: -0.4 });
        for (const lx of [-0.15, 0.15]) for (const lz of [-0.5, 0.5]) k.box(lx, 0.8, lz, 0.09, 0.65, 0.09, col);
        k.box(0, 2.05, 0, 0.6, 0.12, 0.5, BRIGHT[i % BRIGHT.length]);
      });
      spin.add(h);
      horses.push(h);
    }
    movers.push((t) => {
      spin.rotation.y = t * 0.45;
      horses.forEach((h, i) => (h.position.y = 0.4 + Math.sin(t * 2.2 + i * 1.3) * 0.35));
    });
    block(P.x, P.z, 15, 15);
    crowd(P.x - 9, P.z + 3, 5, 1.6, P);
  }

  // ---------------------------------------------------------------- the swing ride (east, north)
  {
    const P = { x: 32, z: -24 };
    part(root, (k) => {
      k.cyl(P.x, 0, P.z, 3, 3.4, 0.6, 0x495057, 20);
      k.cyl(P.x, 0.6, P.z, 0.7, 1, 13, 0xdee2e6, 14);
    });
    const top = new THREE.Group();
    top.position.set(P.x, 13.6, P.z);
    root.add(top);
    part(top, (k) => {
      k.cyl(0, 0, 0, 0.8, 6.5, 2, 0x7048e8, 24);
      k.cyl(0, 2, 0, 0, 1.2, 1.4, 0xffd43b, 12);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        k.ball(Math.cos(a) * 6.4, 0.1, Math.sin(a) * 6.4, 0.15, BRIGHT[i % BRIGHT.length], { layer: "glow", w: 6, h: 4 });
      }
    });
    const chairs: THREE.Group[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const arm = new THREE.Group();
      arm.rotation.y = a;
      const hang = new THREE.Group();
      hang.position.set(6, 0, 0);
      part(hang, (k) => {
        k.box(0, -6, 0, 0.04, 6, 0.04, 0x868e96);
        k.box(0, -6.6, 0, 0.7, 0.12, 0.7, BRIGHT[i % BRIGHT.length]);
        k.box(-0.3, -6.6, 0, 0.1, 0.8, 0.7, BRIGHT[i % BRIGHT.length]);
        k.ball(0, -6.1, 0, 0.22, i % 3 ? 0x8d5524 : 0xf1c27d);
      });
      arm.add(hang);
      top.add(arm);
      chairs.push(hang);
    }
    movers.push((t) => {
      const speed = 0.9 + Math.sin(t * 0.15) * 0.4;
      top.rotation.y = t * speed;
      top.position.y = 13.6 + Math.max(0, Math.sin(t * 0.15)) * 2;
      const tilt = 0.35 + Math.sin(t * 0.15) * 0.2;
      for (const c of chairs) c.rotation.z = tilt;
    });
    block(P.x, P.z, 8, 8);
    crowd(P.x - 8, P.z + 6, 5, 1.6, P);
  }

  // ---------------------------------------------------------------- the drop tower (north east)
  {
    const P = { x: 34, z: -44 };
    part(root, (k) => {
      k.box(P.x, 0, P.z, 3, 42, 3, 0xf1f3f5);
      for (let y = 2; y < 42; y += 3) k.box(P.x, y, P.z, 3.1, 0.25, 3.1, 0xe03131);
      k.cyl(P.x, 42, P.z, 0.4, 2.2, 3, 0xe03131, 4, { ry: Math.PI / 4 });
      k.ball(P.x, 45.3, P.z, 0.4, 0xff6b6b, { layer: "glow" });
      k.box(P.x, 0, P.z, 7, 0.6, 7, 0x495057);
    });
    const ringG = new THREE.Group();
    ringG.position.set(P.x, 0, P.z);
    root.add(ringG);
    part(ringG, (k) => {
      k.cyl(0, 0, 0, 3.4, 3.4, 1.2, 0xffd43b, 20);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        k.ball(Math.cos(a) * 3.6, 1.1, Math.sin(a) * 3.6, 0.25, i % 2 ? 0x8d5524 : 0xf1c27d);
      }
    });
    movers.push((t) => {
      // Slow up, a pause at the top, then the drop.
      const c = t % 16;
      ringG.position.y = c < 8 ? 1 + (c / 8) * 36 : c < 10 ? 37 : c < 10.9 ? 37 - ((c - 10) / 0.9) ** 2 * 36 : 1;
    });
    block(P.x, P.z, 8, 8);
  }

  // ---------------------------------------------------------------- the pirate ship (south west)
  {
    const P = { x: -24, z: 22 };
    part(root, (k) => {
      for (const z of [-2.2, 2.2]) {
        for (const x of [-4, 4]) k.box(P.x + x, 0, P.z + z, 0.5, Math.hypot(x, 11), 0.5, 0x495057, { rz: Math.atan2(x, 11) });
      }
      k.box(P.x, 10.7, P.z, 0.6, 0.6, 5, 0x868e96);
    });
    const swing = new THREE.Group();
    swing.position.set(P.x, 11, P.z);
    root.add(swing);
    part(swing, (k) => {
      for (const z of [-1.5, 1.5]) k.box(0, -8.4, z, 0.3, 8.4, 0.3, 0x868e96);
      k.soft(0, -9.6, 0, 11, 2.2, 3.6, 0x8d5a3b, 0.6);
      k.box(0, -8.4, 0, 10, 0.2, 3, 0xc29a6d);
      k.box(5.6, -9.2, 0, 1.2, 2.6, 2.6, 0x8d5a3b, { rz: -0.4 });
      k.box(-5.6, -9.2, 0, 1.2, 2.6, 2.6, 0x8d5a3b, { rz: 0.4 });
      k.box(0, -8.2, 0, 0.2, 5, 0.2, 0x6b4f37);
      k.box(0.6, -6, 0, 2.2, 2, 0.05, 0xffffff);
      k.box(0.6, -4, 0, 0.9, 0.6, 0.05, 0x212529);
      for (let i = -4; i <= 4; i++) k.ball(i, -7.9, 0, 0.24, i % 2 ? 0x8d5524 : 0xf1c27d);
    });
    movers.push((t) => (swing.rotation.z = Math.sin(t * 0.9) * 0.85));
    block(P.x, P.z, 14, 7);
    crowd(P.x + 4, P.z + 7, 5, 1.6, P);
  }

  // ---------------------------------------------------------------- bumper cars (south east)
  {
    const P = { x: 25, z: 30, w: 16, d: 11 };
    part(root, (k) => {
      k.box(P.x, 0, P.z, P.w, 0.3, P.d, 0x343a40);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.box(P.x + x * (P.w / 2 - 0.3), 0, P.z + z * (P.d / 2 - 0.3), 0.3, 4.4, 0.3, 0xffd43b);
      k.box(P.x, 4.4, P.z, P.w + 1, 0.4, P.d + 1, 0x7048e8);
      k.box(P.x, 4.8, P.z, P.w + 1.2, 0.5, P.d + 1.2, 0xffd43b);
      for (let i = 0; i < 20; i++) k.ball(P.x - P.w / 2 + (i / 19) * P.w, 4.4, P.z + P.d / 2 + 0.55, 0.13, BRIGHT[i % BRIGHT.length], { layer: "glow", w: 6, h: 4 });
      k.box(P.x, 0.3, P.z - P.d / 2, P.w, 0.4, 0.2, 0xffffff);
      k.box(P.x, 0.3, P.z + P.d / 2, P.w, 0.4, 0.2, 0xffffff);
    });
    const bumpers: { g: THREE.Group; ph: number; sp: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      part(g, (k) => {
        k.soft(0, 0.1, 0, 1.4, 0.6, 1.9, BRIGHT[i % BRIGHT.length], 0.25);
        k.cyl(0, 0.05, 0, 1.05, 1.05, 0.25, 0x212529, 16);
        k.box(0, 0.7, -0.45, 1, 0.5, 0.15, 0x212529);
        k.cyl(0, 0.7, -0.4, 0.03, 0.03, 3.4, 0x868e96, 4);
        k.ball(0, 1.1, 0, 0.24, i % 2 ? 0x8d5524 : 0xf1c27d);
      });
      g.position.y = 0.3;
      root.add(g);
      bumpers.push({ g, ph: rnd() * 10, sp: 0.4 + rnd() * 0.3 });
    }
    movers.push((t) => {
      for (const b of bumpers) {
        const a = t * b.sp + b.ph;
        const x = P.x + Math.sin(a * 1.3) * (P.w / 2 - 1.4);
        const z = P.z + Math.sin(a * 0.9 + 1) * (P.d / 2 - 1.4);
        const dx = Math.cos(a * 1.3) * 1.3;
        const dz = Math.cos(a * 0.9 + 1) * 0.9;
        b.g.position.x = x;
        b.g.position.z = z;
        b.g.rotation.y = Math.atan2(dx, dz);
      }
    });
    block(P.x, P.z, P.w + 1, P.d + 1);
    crowd(P.x - 10, P.z, 5, 1.6, P);
  }

  // ---------------------------------------------------------------- teacups (west, by the plaza)
  {
    const P = { x: -20, z: 6 };
    const plate = new THREE.Group();
    plate.position.set(P.x, 0, P.z);
    root.add(plate);
    part(plate, (k) => {
      k.cyl(0, 0, 0, 7, 7, 0.35, 0xffc9c9, 32);
      k.cyl(0, 0.35, 0, 1, 1.2, 1.4, 0xffd43b, 12);
    });
    const cups: THREE.Group[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const c = new THREE.Group();
      c.position.set(Math.cos(a) * 4.4, 0.35, Math.sin(a) * 4.4);
      part(c, (k) => {
        k.cyl(0, 0.2, 0, 1.25, 0.8, 1.1, BRIGHT[(i + 2) % BRIGHT.length], 18);
        k.cyl(0, 1.25, 0, 1.3, 1.3, 0.12, 0xffffff, 18, { open: true });
        k.cyl(0, 0, 0, 0.6, 0.6, 0.2, 0xffffff, 12);
        k.ball(0.3, 1.3, 0.2, 0.22, 0xf1c27d);
        k.ball(-0.4, 1.3, -0.1, 0.22, 0x8d5524);
      });
      plate.add(c);
      cups.push(c);
    }
    movers.push((t) => {
      plate.rotation.y = -t * 0.35;
      cups.forEach((c, i) => (c.rotation.y = t * (1.2 + i * 0.15)));
    });
    block(P.x, P.z, 14, 14);
    crowd(P.x + 2, P.z + 9, 4, 1.4, P);
  }

  // ---------------------------------------------------------------- food stalls, games, balloons
  part(root, (k) => {
    const stalls: [number, number, number][] = [
      [-9, 36, Math.PI / 2], [-9, 28, Math.PI / 2], [-9, 20, Math.PI / 2],
      [9, 36, -Math.PI / 2], [9, 28, -Math.PI / 2], [9, 20, -Math.PI / 2],
    ];
    stalls.forEach(([x, z, ry], i) => {
      k.at(x, 0, z, ry, () => {
        k.box(0, 0, 0, 3.6, 1.1, 2.2, 0xfff3bf);
        k.box(0, 1.1, 0.9, 3.6, 0.08, 0.5, 0xffffff);
        for (const sx of [-1.7, 1.7]) for (const sz of [-1, 1]) k.box(sx, 0, sz, 0.12, 2.8, 0.12, 0xdee2e6);
        // A striped awning.
        for (let s = 0; s < 6; s++) k.box(-1.5 + s * 0.6, 2.8, 0.2, 0.6, 0.12, 2.8, s % 2 ? 0xffffff : BRIGHT[i % BRIGHT.length], { rx: -0.25 });
        k.quad(0, 3.3, 1.45, 3, 0.75, 0xffffff, { layer: "texGlow" }, stallSigns[i % stallSigns.length]);
        for (let g = 0; g < 5; g++) k.ball(-1.2 + g * 0.6, 1.25, 0.6, 0.16, pickOf(rnd, [0xd9480f, 0xffd43b, 0xf8f9fa, 0xe8590c, 0xff8787]), { w: 6, h: 5 });
        k.shadow(0, 0, 4.2, 3, 0.3);
      });
      // The stall keeper behind the counter, two customers queueing in front.
      const fx = x + Math.sin(ry) * 2.6;
      const fz = z + Math.cos(ry) * 2.6;
      stand(x - Math.sin(ry) * 0.6, z - Math.cos(ry) * 0.6, ry);
      for (let q = 0; q < 2; q++) stand(fx + Math.sin(ry) * q * 0.8, fz + Math.cos(ry) * q * 0.8, ry + Math.PI);
    });
    // Balloon sellers on the avenue.
    for (const [bx, bz] of [[-3.5, 31], [3.5, 14]] as const) {
      for (let b = 0; b < 9; b++) {
        const a = b * 0.7;
        const h = 3.2 + (b % 3) * 0.5;
        k.box(bx, 1.2, bz, 0.02, h - 1.2, 0.02, 0xdee2e6, { rz: Math.cos(a) * 0.08, rx: Math.sin(a) * 0.08 });
        k.ball(bx + Math.cos(a) * 0.3, h, bz + Math.sin(a) * 0.3, 0.32, BRIGHT[b % BRIGHT.length], { sy: 1.2 });
      }
    }
  });
  for (const [x, z] of [[-9, 36], [-9, 28], [-9, 20], [9, 36], [9, 28], [9, 20]]) block(x, z, 3.6, 3.6);
  stand(-3.5, 30.4, 0);
  stand(3.5, 13.4, Math.PI);

  // Game stalls (they cost a little to play, like everything else).
  part(root, (k) => {
    for (const [x, z, col] of [[-16, -10, 0x1c7ed6], [16, -10, 0x2f9e44]] as const) {
      k.box(x, 0, z - 1, 5, 1.1, 1.2, 0xfff3bf);
      for (const sx of [-2.4, 2.4]) k.box(x + sx, 0, z - 1.5, 0.15, 3, 0.15, 0xdee2e6);
      k.box(x, 3, z - 1.2, 5.4, 0.3, 2.2, col);
      k.box(x, 0, z - 3.2, 5, 2.6, 0.2, 0xf1f3f5);
      for (let t = 0; t < 4; t++) k.cyl(x - 1.5 + t, 1.4, z - 3.05, 0.35, 0.35, 0.05, t % 2 ? 0xe03131 : 0xffffff, 16, { rx: Math.PI / 2, noAo: true });
      k.shadow(x, z - 1.5, 6, 4, 0.3);
    }
  });
  items.push({ kind: "archery", label: "Hit the target", x: -16, y: 0, z: -8, r: 1.6 });
  items.push({ kind: "darts", label: "Balloon darts", x: 16, y: 0, z: -8, r: 1.6 });
  block(-16, -11.5, 5.4, 4);
  block(16, -11.5, 5.4, 4);
  crowd(-16, -7, 3, 1.2, { x: -16, z: -11 });
  crowd(16, -7, 3, 1.2, { x: 16, z: -11 });

  // ---------------------------------------------------------------- benches, lamps, bunting, trees
  part(root, (k) => {
    const benches: [number, number, number][] = [];
    for (let z = 8; z < 46; z += 7) benches.push([-6, z, Math.PI / 2], [6, z, -Math.PI / 2]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      benches.push([Math.cos(a) * 13.5, Math.sin(a) * 13.5, Math.atan2(-Math.cos(a), -Math.sin(a))]);
    }
    for (const [x, z, ry] of benches) {
      k.at(x, 0, z, ry, () => {
        k.box(0, 0.42, 0, 1.8, 0.06, 0.5, 0x8f6b4a);
        k.box(0, 0.48, -0.25, 1.8, 0.45, 0.06, 0x8f6b4a, { rx: -0.15 });
        for (const sx of [-0.8, 0.8]) k.box(sx, 0, 0, 0.08, 0.42, 0.5, 0x2b2b2b);
        const p1 = k.world(-0.4, 0, 0.05);
        const p2 = k.world(0.4, 0, 0.05);
        const yaw = k.worldYaw(0);
        seats.push({ x: p1.x, z: p1.z, ry: yaw, pose: "sit", y: 0.45 }, { x: p2.x, z: p2.z, ry: yaw, pose: "sit", y: 0.45 });
      });
    }
    // Lamps down the avenue and round the plaza.
    const lamps: [number, number][] = [];
    for (let z = 4; z < 48; z += 6) lamps.push([-4.8, z], [4.8, z]);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      lamps.push([Math.cos(a) * 12.4, Math.sin(a) * 12.4]);
    }
    for (const [x, z] of lamps) {
      k.cyl(x, 0, z, 0.08, 0.12, 4.2, 0x2b2b2b, 8);
      k.ball(x, 4.35, z, 0.3, 0xfff3bf, { layer: "glow" });
    }
    // Bunting across the avenue, lamp to lamp: little flags hanging off a string that dips.
    for (let z = 4; z < 44; z += 6) {
      const sag = (x: number) => 4.3 - Math.cos((x / 4.8) * (Math.PI / 2)) * 0.6;
      for (let f = 0; f < 24; f++) {
        const x0 = -4.8 + (f * 9.6) / 24;
        const x1 = x0 + 9.6 / 24;
        const y0 = sag(x0);
        const y1 = sag(x1);
        k.box((x0 + x1) / 2, (y0 + y1) / 2, z, 9.6 / 24 + 0.01, 0.02, 0.02, 0xf1f3f5, { rz: Math.atan2(y1 - y0, x1 - x0), noAo: true });
      }
      for (let f = 0; f < 12; f++) {
        const x = -4.4 + f * 0.8;
        k.cyl(x, sag(x) - 0.32, z, 0.13, 0, 0.3, BRIGHT[f % BRIGHT.length], 3, { noAo: true });
      }
    }
    // Shade trees and flower beds round the rides.
    for (let i = 0; i < 40; i++) {
      const x = (rnd() - 0.5) * HALF * 1.9;
      const z = (rnd() - 0.5) * HALF * 1.9;
      if (Math.abs(x) < 8 && z > 0) continue;
      if (Math.hypot(x, z) < 16) continue;
      if (blocks.some((b) => Math.abs(x - b.x) < b.w / 2 + 2 && Math.abs(z - b.z) < b.d / 2 + 2)) continue;
      const h = 4 + rnd() * 3;
      k.cyl(x, 0, z, 0.2, 0.28, h * 0.5, 0x6b4f37, 6);
      k.leafy(x, h * 0.65, z, 1.6 + rnd(), pickOf(rnd, LEAVES), { detail: 1 });
      k.cyl(x, 0, z, 1.4, 1.4, 0.3, 0x8d5a3b, 12);
      for (let f = 0; f < 6; f++) k.ball(x + Math.cos(f) * 1.1, 0.35, z + Math.sin(f) * 1.1, 0.18, pickOf(rnd, [0xff6b6b, 0xffd43b, 0xda77f2, 0xffffff]), { w: 6, h: 4 });
      blocks.push({ x, z, w: 2.6, d: 2.6, ry: 0 });
    }
  });
  // People strolling everywhere else.
  for (let i = 0; i < 26; i++) {
    const x = (rnd() - 0.5) * HALF * 1.6;
    const z = (rnd() - 0.5) * HALF * 1.6;
    if (blocks.some((b) => Math.abs(x - b.x) < b.w / 2 + 1 && Math.abs(z - b.z) < b.d / 2 + 1)) continue;
    crowd(x, z, 2 + Math.floor(rnd() * 3), 0.7);
  }

  // ---------------------------------------------------------------- light
  const hemi = new THREE.HemisphereLight(0xfff6ea, 0x5d7a4a, 1.5);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.3);
  sun.position.set(-40, 80, 30);
  root.add(hemi, sun);

  const views: View[] = [
    { x: 0, z: HALF - 4, yaw: 0, pitch: 0.02 },
    { x: 0, z: 16, yaw: 0, pitch: 0.06 },
    { x: -12, z: -2, yaw: Math.atan2(20, 20), pitch: 0.12 },
    { x: 14, z: 0, yaw: Math.atan2(-18, 24), pitch: 0.12 },
  ];
  // Nobody stands right in front of where you look from.
  const clear = spots.filter((sp) => views.every((v) => Math.hypot(sp.x - v.x, sp.z - v.z) > 2));

  const all: THREE.Material[] = [...Object.values(mats), skyMat, jetMat, ...extraMats];
  const base = new Map(all.map((m) => [m, { o: m.opacity, t: m.transparent }]));
  let alpha = 1;
  const skyDay = new THREE.Color(1, 1, 1);
  const skyNight = new THREE.Color(0.12, 0.14, 0.3);
  return {
    group: root,
    views,
    spots: (clear.length > 10 ? clear : spots).sort(() => rnd() - 0.5),
    seats,
    items,
    blocks,
    w: HALF * 2 - 2,
    d: HALF * 2 - 2,
    setNight(n: number) {
      skyMat.color.copy(skyDay).lerp(skyNight, n);
      hemi.intensity = 1.5 - 1.0 * n;
      sun.intensity = 1.3 * (1 - n) + 0.1;
      mats.glow.color.setScalar(0.8 + 0.7 * n);
      mats.texGlow.color.setScalar(0.85 + 0.5 * n);
    },
    setAlpha(a: number) {
      if (a === alpha) return;
      alpha = a;
      for (const m of all) {
        const b = base.get(m)!;
        m.transparent = b.t || a < 0.999;
        m.opacity = b.o * a;
      }
      root.visible = a > 0.002;
    },
    update(time: number) {
      for (const mv of movers) mv(time);
      // The bulbs twinkle a little.
      const tw = 0.85 + Math.sin(time * 6) * 0.15;
      for (const b of bulbs) b.visible = tw > 0.72 || Math.random() > 0.02;
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      jetGeo.dispose();
      for (const m of all) m.dispose();
      tex.dispose();
    },
  };
}
