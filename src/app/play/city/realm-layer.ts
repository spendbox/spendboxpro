// The Spirit Realm on the map (docs/REALM.md): the arena's glowing ring, the troops fighting in it
// (little 3D soldiers, ghosts, angels, devils... in their army's colours), arrows, holy light and
// dragon fire, the portals troops come through, and the marker where you're about to send yours.
//
// Drawn in a pass of its own after the city, so troops are seen over the buildings (spirits walk
// through walls). Kept cheap for big battles: one instanced mesh per kind of fighter (a single draw
// each), one for the army rings, one line buffer for every shot, one for the sparks.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ARENA_R, squadAlive, type Battle } from "@/lib/realm/battle";
import { FIGHTERS, type FighterId } from "@/lib/realm/fighters";

/** What the layer draws each frame (from Spirit mode, src/app/play/realm). Battle units: the arena is ARENA_R across from its middle. */
export type RealmFrame = {
  battle: Battle;
  /** How far between the last two steps (0 to 1), for smooth movement. */
  t: number;
  /** Each army's colour (index 0: the wild spirits). */
  colours: string[];
  /** Your army's index (null: you're watching). */
  mine: number | null;
  /** Portals: troops about to come through (secs > 0) or just through (secs <= 0). */
  portals: { x: number; y: number; colour: string; secs: number }[];
  /** Where you're about to send troops, and whether it's allowed there. */
  placing: { x: number; y: number; ok: boolean } | null;
};

export type RealmSource = {
  /** The arena's middle on the map (tiles), and tiles per battle unit. */
  centre: { x: number; z: number };
  scale: number;
  frame: () => RealmFrame | null;
};

/** How tall a soldier stands (tiles). */
const FIG = 0.42;
/** At most this many of a squad are drawn. */
const SHOW_MAX = 8;
const CAP = 2600;
const MAX_SQUADS = 1600;
const MAX_SHOTS = 2400;
const MAX_SPARKS = 1600;
const MAX_PORTALS = 48;
const GOLDEN = 2.399963229728653;

/** How big each kind is drawn, compared with a soldier. */
const SIZE: Record<FighterId, number> = { soldier: 1, archer: 1, wolf: 1, ghost: 1.1, angel: 1.2, devil: 1.2, giant: 2.1, dragon: 2 };

// ---------------------------------------------------------------- the fighters, built from simple shapes

/** A shape in one colour (vertex colours, so a whole fighter is one mesh). */
function part(g: THREE.BufferGeometry, colour: number, at: [number, number, number], rot?: [number, number, number]) {
  const geo = g.toNonIndexed();
  if (rot) geo.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
  geo.translate(at[0], at[1], at[2]);
  const c = new THREE.Color(colour);
  const n = geo.getAttribute("position").count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  geo.deleteAttribute("uv");
  return geo;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const ball = (r: number) => new THREE.SphereGeometry(r, 10, 8);
const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const cyl = (r1: number, r2: number, h: number, seg = 8) => new THREE.CylinderGeometry(r1, r2, h, seg);

/** Each fighter about 1 tall, standing on y = 0, facing +z. */
function fighterGeometry(id: FighterId): THREE.BufferGeometry {
  const skin = 0xe0b48a;
  let parts: THREE.BufferGeometry[] = [];
  switch (id) {
    case "soldier":
      parts = [
        part(box(0.14, 0.4, 0.12), 0x3a4f1f, [-0.07, 0.2, 0]),
        part(box(0.14, 0.4, 0.12), 0x3a4f1f, [0.07, 0.2, 0]),
        part(box(0.36, 0.36, 0.22), 0x4f6b2b, [0, 0.58, 0]),
        part(ball(0.13), skin, [0, 0.86, 0]),
        part(cyl(0.15, 0.15, 0.08), 0x2d3d18, [0, 0.95, 0]),
        part(box(0.03, 1.0, 0.03), 0xcfcfcf, [0.24, 0.55, 0.08]),
        part(cone(0.05, 0.12, 4), 0xeeeeee, [0.24, 1.1, 0.08]),
      ];
      break;
    case "archer":
      parts = [
        part(box(0.3, 0.42, 0.2), 0x7a5230, [0, 0.21, 0]),
        part(box(0.32, 0.32, 0.2), 0x6b4a2a, [0, 0.58, 0]),
        part(ball(0.12), 0xc98f62, [0, 0.84, 0]),
        part(cone(0.16, 0.26), 0x2f6b3a, [0, 0.98, 0]),
        part(new THREE.TorusGeometry(0.28, 0.02, 4, 12, Math.PI), 0xd9a441, [0.22, 0.6, 0.12], [0, Math.PI / 2, Math.PI / 2]),
      ];
      break;
    case "wolf":
      parts = [
        part(box(0.28, 0.24, 0.62), 0x8aa4c8, [0, 0.42, 0]),
        part(box(0.22, 0.2, 0.24), 0x9fb7d8, [0, 0.55, 0.38]),
        part(box(0.12, 0.1, 0.14), 0xb7cbe6, [0, 0.5, 0.54]),
        part(cone(0.05, 0.12, 4), 0x9fb7d8, [-0.07, 0.7, 0.36]),
        part(cone(0.05, 0.12, 4), 0x9fb7d8, [0.07, 0.7, 0.36]),
        ...[-0.1, 0.1].flatMap((x) => [-0.22, 0.22].map((z) => part(box(0.07, 0.3, 0.07), 0x6f88ad, [x, 0.15, z]))),
        part(cone(0.06, 0.3, 5), 0x8aa4c8, [0, 0.5, -0.4], [-1.9, 0, 0]),
      ];
      break;
    case "ghost":
      parts = [
        part(cyl(0.2, 0.32, 0.62, 10), 0xe8eeff, [0, 0.36, 0]),
        part(ball(0.22), 0xf2f5ff, [0, 0.72, 0]),
        part(ball(0.04), 0x20243a, [-0.08, 0.76, 0.19]),
        part(ball(0.04), 0x20243a, [0.08, 0.76, 0.19]),
      ];
      break;
    case "angel":
      parts = [
        part(cone(0.26, 0.7, 10), 0xfff1c4, [0, 0.36, 0]),
        part(ball(0.13), 0xf2c9a0, [0, 0.82, 0]),
        part(new THREE.TorusGeometry(0.13, 0.025, 4, 16), 0xffd65a, [0, 1.0, 0], [Math.PI / 2, 0, 0]),
        part(box(0.5, 0.36, 0.03), 0xffffff, [-0.28, 0.66, -0.1], [0, 0.5, 0.35]),
        part(box(0.5, 0.36, 0.03), 0xffffff, [0.28, 0.66, -0.1], [0, -0.5, -0.35]),
      ];
      break;
    case "devil":
      parts = [
        part(box(0.14, 0.4, 0.12), 0x7a1a1d, [-0.07, 0.2, 0]),
        part(box(0.14, 0.4, 0.12), 0x7a1a1d, [0.07, 0.2, 0]),
        part(box(0.38, 0.38, 0.24), 0xb3262b, [0, 0.6, 0]),
        part(ball(0.15), 0xe5484d, [0, 0.9, 0]),
        part(cone(0.04, 0.16, 5), 0x2b0a0b, [-0.09, 1.07, 0], [0, 0, 0.35]),
        part(cone(0.04, 0.16, 5), 0x2b0a0b, [0.09, 1.07, 0], [0, 0, -0.35]),
        part(box(0.03, 1.0, 0.03), 0x3b0d0f, [0.26, 0.55, 0.06]),
        part(cone(0.07, 0.14, 3), 0xff9b3d, [0.26, 1.1, 0.06]),
      ];
      break;
    case "giant":
      parts = [
        part(box(0.2, 0.36, 0.2), 0x5a4330, [-0.13, 0.18, 0]),
        part(box(0.2, 0.36, 0.2), 0x5a4330, [0.13, 0.18, 0]),
        part(ball(0.34), 0x7d6047, [0, 0.62, 0]),
        part(ball(0.15), 0xa8865f, [0, 0.98, 0.04]),
        part(box(0.12, 0.6, 0.12), 0x4a3726, [0.38, 0.5, 0.1]),
      ];
      break;
    case "dragon":
      parts = [
        part(ball(0.3), 0x7c3aed, [0, 0.46, 0]),
        part(box(0.22, 0.2, 0.32), 0x8b5cf6, [0, 0.64, 0.36]),
        part(ball(0.04), 0xffd65a, [-0.07, 0.7, 0.5]),
        part(ball(0.04), 0xffd65a, [0.07, 0.7, 0.5]),
        part(box(0.7, 0.03, 0.36), 0x5b21b6, [-0.42, 0.62, -0.02], [0, 0, 0.45]),
        part(box(0.7, 0.03, 0.36), 0x5b21b6, [0.42, 0.62, -0.02], [0, 0, -0.45]),
        part(cone(0.1, 0.5, 6), 0x7c3aed, [0, 0.42, -0.42], [-1.7, 0, 0]),
        ...[-0.14, 0.14].map((x) => part(box(0.08, 0.26, 0.1), 0x5b21b6, [x, 0.13, 0])),
      ];
      break;
  }
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

// ---------------------------------------------------------------- the layer

export function createRealmLayer() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe9e2ff, 0x3b2a5a, 2.2));
  const key = new THREE.DirectionalLight(0xfff4e0, 1.6);
  key.position.set(0.4, 1, 0.3);
  scene.add(key);
  const root = new THREE.Group();
  scene.add(root);

  // The arena: a glowing ring, a faint purple floor, and a pillar of light at the heart.
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.03, 128).rotateX(-Math.PI / 2), ringMat);
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x6d28d9, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), floorMat);
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96, 1, true).translate(0, 0.5, 0), wallMat);
  const heartMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const heart = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 14, 20, 1, true).translate(0, 7, 0), heartMat);
  const arena = new THREE.Group();
  arena.add(floor, ring, wall);
  root.add(arena, heart);

  // The fighters: one instanced mesh per kind.
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x241042, emissiveIntensity: 0.6 });
  const ghostly = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x5a66aa, emissiveIntensity: 0.5, transparent: true, opacity: 0.78, depthWrite: false });
  const kinds = FIGHTERS.map((f) => {
    const mesh = new THREE.InstancedMesh(fighterGeometry(f.id), f.id === "ghost" ? ghostly : lambert, CAP);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(mesh);
    return mesh;
  });
  // Each squad's ring on the ground, in its army's colour (yours pulse white).
  const teamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
  const team = new THREE.InstancedMesh(new THREE.RingGeometry(0.72, 1, 24).rotateX(-Math.PI / 2), teamMat, MAX_SQUADS);
  team.count = 0;
  team.frustumCulled = false;
  root.add(team);
  // Shots (arrows, holy light, fire): one line buffer.
  const shotPos = new Float32Array(MAX_SHOTS * 6);
  const shotCol = new Float32Array(MAX_SHOTS * 6);
  const shotGeo = new THREE.BufferGeometry();
  shotGeo.setAttribute("position", new THREE.BufferAttribute(shotPos, 3).setUsage(THREE.DynamicDrawUsage));
  shotGeo.setAttribute("color", new THREE.BufferAttribute(shotCol, 3).setUsage(THREE.DynamicDrawUsage));
  const shots = new THREE.LineSegments(shotGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  shots.frustumCulled = false;
  root.add(shots);
  // Sparks where blows land.
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  const sparkCol = new Float32Array(MAX_SPARKS * 3);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sparks.frustumCulled = false;
  root.add(sparks);
  // Portals: a beam and a ring, pooled.
  const portalGeo = new THREE.CylinderGeometry(0.6, 0.6, 6, 18, 1, true).translate(0, 3, 0);
  const portalRingGeo = new THREE.RingGeometry(0.8, 1.15, 32).rotateX(-Math.PI / 2);
  const portals = Array.from({ length: MAX_PORTALS }, () => {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(portalGeo, mat), new THREE.Mesh(portalRingGeo, mat));
    g.visible = false;
    root.add(g);
    return { g, mat };
  });
  // Where you're about to send troops.
  const aimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const aim = new THREE.Group();
  aim.add(new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 40).rotateX(-Math.PI / 2), aimMat), new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 8).translate(0, 2, 0), aimMat));
  aim.visible = false;
  root.add(aim);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const white = new THREE.Color(0xffffff);
  const colourCache = new Map<string, THREE.Color>();
  const colourOf = (c: string) => {
    let v = colourCache.get(c);
    if (!v) colourCache.set(c, (v = new THREE.Color(c)));
    return v;
  };
  const SHOT_COL: Partial<Record<FighterId, number>> = { archer: 0xf1e3c8, angel: 0xfff3b0, dragon: 0xff8a3d };
  const SPARK_COL = { body: 0xfff7d6, spirit: 0xc7d2fe, holy: 0xfff3b0, dark: 0xff6b3d } as const;

  let shown = false;

  /** Draw the realm for this frame (or hide it). */
  function update(time: number, src: RealmSource | null) {
    const f = src?.frame() ?? null;
    root.visible = !!(src && f);
    shown = root.visible;
    if (!src || !f) return;
    const { centre, scale } = src;
    const R = ARENA_R * scale;
    arena.position.set(centre.x, 0.03, centre.z);
    arena.scale.set(R, 2.2, R);
    ringMat.opacity = 0.7 + 0.2 * Math.sin(time * 2);
    heart.position.set(centre.x, 0, centre.z);
    heartMat.opacity = 0.22 + 0.1 * Math.sin(time * 1.3);
    const wx = (x: number) => centre.x + x * scale;
    const wz = (y: number) => centre.z + y * scale;

    const b = f.battle;
    const sq = b.squads;
    const counts = new Array<number>(kinds.length).fill(0);
    let rings = 0;
    let s2 = 0;
    let sp = 0;
    for (let i = 0; i < sq.length; i++) {
      const s = sq[i];
      if (s.hp <= 0) continue;
      const x = s.px + (s.x - s.px) * f.t;
      const y = s.py + (s.y - s.py) * f.t;
      const tgt = s.target >= 0 && s.target < sq.length && sq[s.target].hp > 0 ? sq[s.target] : null;
      const fx = tgt ? tgt.x - s.x : -s.x;
      const fy = tgt ? tgt.y - s.y : -s.y;
      q.setFromAxisAngle(up, Math.atan2(fx, fy));
      const kind = FIGHTERS[s.kind];
      const n = Math.min(SHOW_MAX, squadAlive(s));
      const size = FIG * SIZE[kind.id];
      const spread = size * (kind.id === "giant" || kind.id === "dragon" ? 0.55 : 0.75);
      const flash = s.took > 0 && Math.sin(time * 40 + i) > 0.3;
      const mesh = kinds[s.kind];
      for (let m = 0; m < n && counts[s.kind] < CAP; m++) {
        const r = spread * Math.sqrt(m);
        const a = m * GOLDEN;
        // Walking: a little bob. Hitting: a lunge. Flying kinds hover.
        const fly = kind.id === "angel" || kind.id === "dragon" || kind.id === "ghost" ? 0.25 + 0.08 * Math.sin(time * 3 + m + i) : 0;
        const bob = s.hitting ? Math.max(0, Math.sin(time * 9 + m)) * 0.06 : Math.abs(Math.sin(time * 8 + m + i)) * 0.05;
        pos.set(wx(x) + Math.cos(a) * r, 0.02 + fly + bob, wz(y) + Math.sin(a) * r);
        scl.setScalar(size * (flash ? 1.12 : 1));
        m4.compose(pos, q, scl);
        mesh.setMatrixAt(counts[s.kind]++, m4);
      }
      if (rings < MAX_SQUADS) {
        const mine = f.mine !== null && s.army === f.mine;
        const rr = spread * Math.sqrt(n) + size * 0.6;
        pos.set(wx(x), 0.04, wz(y));
        q.identity();
        scl.set(rr, 1, rr);
        m4.compose(pos, q, scl);
        team.setMatrixAt(rings, m4);
        col.copy(colourOf(f.colours[s.army] ?? "#ffffff"));
        if (mine) col.lerp(white, 0.35 + 0.35 * Math.sin(time * 5));
        team.setColorAt(rings++, col);
        q.setFromAxisAngle(up, Math.atan2(fx, fy));
      }
      if (!tgt || !s.hitting) continue;
      const tx = wx(tgt.px + (tgt.x - tgt.px) * f.t);
      const tz = wz(tgt.py + (tgt.y - tgt.py) * f.t);
      const shot = SHOT_COL[kind.id];
      if (shot !== undefined && s2 < MAX_SHOTS) {
        // A bolt flying from shooter to target, again and again.
        const k = (time * 1.6 + i * 0.37) % 1;
        const k0 = Math.max(0, k - 0.22);
        const arc = (u: number) => 0.4 + Math.sin(u * Math.PI) * (kind.id === "archer" ? 1.2 : 0.4);
        const ax = wx(x);
        const az = wz(y);
        shotPos.set([ax + (tx - ax) * k0, arc(k0) + size * 0.5, az + (tz - az) * k0, ax + (tx - ax) * k, arc(k) + size * 0.5, az + (tz - az) * k], s2 * 6);
        col.setHex(shot);
        shotCol.set([col.r * 0.4, col.g * 0.4, col.b * 0.4, col.r, col.g, col.b], s2 * 6);
        s2++;
      } else if (sp < MAX_SPARKS - 2) {
        col.setHex(SPARK_COL[kind.nature]);
        for (let p = 0; p < 2; p++) {
          const j = time * 7 + i * 1.7 + p * 2.1;
          sparkPos.set([(wx(x) + tx) / 2 + Math.sin(j) * 0.18, 0.35 + Math.abs(Math.cos(j * 1.3)) * 0.3, (wz(y) + tz) / 2 + Math.cos(j) * 0.18], sp * 3);
          sparkCol.set([col.r, col.g, col.b], sp * 3);
          sp++;
        }
      }
    }
    kinds.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
    });
    team.count = rings;
    team.instanceMatrix.needsUpdate = true;
    if (team.instanceColor) team.instanceColor.needsUpdate = true;
    shotGeo.setDrawRange(0, s2 * 2);
    shotGeo.attributes.position.needsUpdate = true;
    shotGeo.attributes.color.needsUpdate = true;
    sparkGeo.setDrawRange(0, sp);
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;

    // Portals: pulsing while troops are on their way, a burst as they come through, then gone.
    portals.forEach((p, k) => {
      const pt = f.portals[k];
      p.g.visible = !!pt;
      if (!pt) return;
      p.g.position.set(wx(pt.x), 0.05, wz(pt.y));
      p.mat.color.set(pt.colour);
      const coming = pt.secs > 0;
      p.mat.opacity = coming ? 0.35 + 0.25 * Math.sin(time * 6) : Math.max(0, 0.9 + pt.secs / 3);
      const s = coming ? 1 + 0.15 * Math.sin(time * 6) : 1.4 - pt.secs * 0.6;
      p.g.scale.set(s, coming ? 0.6 : 1.4, s);
    });
    aim.visible = !!f.placing;
    if (f.placing) {
      aim.position.set(wx(f.placing.x), 0.06, wz(f.placing.y));
      aimMat.color.set(f.placing.ok ? 0xffd43b : 0xff5c5c);
      aim.scale.setScalar(1 + 0.12 * Math.sin(time * 5));
    }
  }

  /** Draw the realm over what's already on screen (after the city). */
  function render(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    if (!shown) return;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.autoClear = auto;
  }

  function dispose() {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }

  return { update, render, dispose };
}
