"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { KIND_LABEL, makePlan, tileAt, type CityPlan, type Tile } from "@/lib/city/layout";

// The game board, drawn as a small living 3D city with three.js.
// Every tile is a lot: a road, a building, a park... New tiles rise out of the ground
// as the city grows. Cars drive the roads, birds and clouds drift overhead.
// Lightweight on purpose: a handful of shared shapes drawn many times (instancing).

export type CityMarkers = {
  searchedEmpty: number[];
  searchedHit: number[];
  caught: number[];
  left: number[];
  me: number | null;
  sweeps: { tile: number; radius: number; count: number }[];
  pending: number | null;
};

type Props = {
  seed: number;
  tileCount: number;
  markers: CityMarkers;
  interactive: boolean;
  onTile: (tile: number) => void;
  onHover?: (info: { tile: number; label: string } | null) => void;
};

type Part = { tile: number; x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; color: number };

const SKY = 0xd7ebf7;
const GROUND = 0xd3e4c8;
const ASPHALT = 0x5b6470;
const SIDEWALK = 0xf3f1ec;
const GRASS = 0xa8d79a;
const WATER = 0x7cc4e8;

// ---------------------------------------------------------------- shapes
function geometries() {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roof = new THREE.CylinderGeometry(0, 1, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const crown = new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0);
  const trunk = new THREE.CylinderGeometry(0.05, 0.07, 1, 5).translate(0, 0.5, 0);
  const disc = new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0);
  // A bird: two wings in a V. Scaling it up and down on y makes it flap.
  const bird = new THREE.BufferGeometry();
  bird.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0.12, -0.32, 0.12, -0.05, 0, 0, -0.08, 0, 0, 0.12, 0, 0, -0.08, 0.32, 0.12, -0.05], 3),
  );
  bird.computeVertexNormals();
  return { box, roof, crown, trunk, disc, bird };
}

// ---------------------------------------------------------------- what stands on a tile
function partsFor(t: Tile, plan: CityPlan, add: (mesh: string, p: Omit<Part, "tile">) => void) {
  const { x, z, r } = t;
  const pal = plan.palette;
  const pick = (list: number[], v: number) => list[Math.floor(v * list.length) % list.length];
  const tree = (dx: number, dz: number, size: number, v: number) => {
    add("trunk", { x: x + dx, y: 0.08, z: z + dz, sx: size, sy: 0.35 * size, sz: size, ry: 0, color: 0x8a6a4f });
    add("crown", { x: x + dx, y: 0.08 + 0.25 * size, z: z + dz, sx: 0.6 * size, sy: 0.75 * size, sz: 0.6 * size, ry: v * 6, color: pick(pal.leaves, v) });
  };

  if (t.kind === "road") {
    add("ground", { x, y: 0, z, sx: 1, sy: 0.06, sz: 1, ry: 0, color: ASPHALT });
    if (t.road !== "cross") {
      const along = t.road === "x";
      for (const o of [-0.25, 0.25]) {
        add("paint", { x: x + (along ? o : 0), y: 0.061, z: z + (along ? 0 : o), sx: along ? 0.22 : 0.04, sy: 0.005, sz: along ? 0.04 : 0.22, ry: 0, color: 0xffffff });
      }
    } else {
      add("ground", { x, y: 0, z, sx: 0.5, sy: 0.062, sz: 0.5, ry: 0, color: 0x6a7380 });
    }
    return;
  }

  const lot = t.kind === "park" || t.kind === "trees" || t.kind === "pond" ? GRASS : SIDEWALK;
  add("ground", { x, y: 0, z, sx: 0.98, sy: 0.08, sz: 0.98, ry: 0, color: lot });

  switch (t.kind) {
    case "tower": {
      const h = t.top - 0.4;
      const w = 0.62 + r[2] * 0.18;
      const color = pick(pal.towers, r[3]);
      add("building", { x, y: 0.08, z, sx: w, sy: h * 0.72, sz: w, ry: 0, color });
      add("building", { x, y: 0.08 + h * 0.72, z, sx: w * 0.78, sy: h * 0.28, sz: w * 0.78, ry: 0, color });
      add("building", { x: x + 0.08, y: 0.08 + h, z: z - 0.06, sx: 0.18, sy: 0.18, sz: 0.14, ry: 0, color: 0xdee2e6 });
      if (r[0] > 0.55) add("trunk", { x: x - 0.1, y: 0.08 + h, z: z + 0.08, sx: 0.25, sy: 0.6, sz: 0.25, ry: 0, color: 0xadb5bd });
      // Window bands
      for (let k = 1; k < Math.min(10, Math.floor(h * 0.72 / 0.55)); k++) {
        add("glass", { x, y: 0.08 + k * 0.55, z, sx: w + 0.012, sy: 0.07, sz: w + 0.012, ry: 0, color: 0x5d7fa3 });
      }
      break;
    }
    case "office": {
      const h = t.top - 0.08;
      const w = 0.7 + r[2] * 0.15;
      const d = 0.6 + r[3] * 0.25;
      const color = pick(pal.offices, r[1]);
      add("building", { x, y: 0.08, z, sx: w, sy: h, sz: d, ry: 0, color });
      for (let k = 1; k <= Math.floor(h / 0.38); k++) {
        add("glass", { x, y: 0.08 + k * 0.38 - 0.16, z, sx: w + 0.01, sy: 0.08, sz: d + 0.01, ry: 0, color: 0x6c8eae });
      }
      add("building", { x: x - w * 0.2, y: 0.08 + h, z, sx: 0.16, sy: 0.1, sz: 0.16, ry: 0, color: 0xced4da });
      break;
    }
    case "house": {
      const w = 0.5 + r[2] * 0.12;
      const d = 0.45 + r[3] * 0.12;
      const dx = (r[1] - 0.5) * 0.12;
      add("building", { x: x + dx, y: 0.08, z, sx: w, sy: 0.38, sz: d, ry: 0, color: pick(pal.walls, r[1]) });
      add("roof", { x: x + dx, y: 0.46, z, sx: (w + 0.08) / Math.SQRT2, sy: 0.3, sz: (d + 0.08) / Math.SQRT2, ry: 0, color: pick(pal.roofs, r[3]) });
      tree(0.34 * (dx > 0 ? -1 : 1), 0.32, 0.55, r[0]);
      break;
    }
    case "park": {
      const n = 2 + Math.floor(r[1] * 3);
      for (let k = 0; k < n; k++) {
        const a = r[2] * 6.28 + (k * 6.28) / n;
        tree(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.7 + ((r[3] * (k + 1)) % 0.4), (r[0] + k * 0.37) % 1);
      }
      add("disc", { x, y: 0.08, z, sx: 0.32, sy: 0.01, sz: 0.32, ry: 0, color: 0xe9dcc3 });
      break;
    }
    case "trees":
      for (let k = 0; k < 5; k++) {
        tree((hashish(r[1], k) - 0.5) * 0.7, (hashish(r[2], k) - 0.5) * 0.7, 0.75 + hashish(r[3], k) * 0.5, hashish(r[0], k));
      }
      break;
    case "pond":
      add("water", { x, y: 0.08, z, sx: 0.82, sy: 0.02, sz: 0.72, ry: r[1], color: WATER });
      tree(0.36, -0.36, 0.6, r[2]);
      break;
    case "plaza":
      add("ground", { x, y: 0.08, z, sx: 0.8, sy: 0.02, sz: 0.8, ry: 0, color: 0xe7e1d5 });
      add("disc", { x, y: 0.1, z, sx: 0.3, sy: 0.12, sz: 0.3, ry: 0, color: 0xcfd6dd });
      add("water", { x, y: 0.22, z, sx: 0.22, sy: 0.02, sz: 0.22, ry: 0, color: WATER });
      break;
  }
}

const hashish = (v: number, k: number) => {
  const s = Math.sin(v * 9301 + k * 49297) * 233280;
  return s - Math.floor(s);
};

const easeOutBack = (t: number) => {
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// ---------------------------------------------------------------- component
export function CityView({ seed, tileCount, markers, interactive, onTile, onHover }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    build: (seed: number, count: number) => void;
    setMarkers: (m: CityMarkers) => void;
  } | null>(null);
  const cb = useRef({ onTile, onHover, interactive });
  useEffect(() => {
    cb.current = { onTile, onHover, interactive };
  });

  // Set up the scene once.
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 40, 110);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.2;
    controls.minDistance = 6;
    controls.maxDistance = 90;
    controls.screenSpacePanning = false;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

    scene.add(new THREE.HemisphereLight(0xeef7ff, 0xc9d3c0, 1.5));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    const base = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: GROUND }));
    base.receiveShadow = true;
    base.position.y = -0.01;
    scene.add(base);

    const geo = geometries();
    const mat = (opts: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, ...opts });
    const meshDefs: Record<string, { geometry: THREE.BufferGeometry; material: THREE.Material; shadow: boolean }> = {
      ground: { geometry: geo.box, material: mat(), shadow: false },
      paint: { geometry: geo.box, material: mat(), shadow: false },
      building: { geometry: geo.box, material: mat(), shadow: true },
      glass: { geometry: geo.box, material: mat({ emissive: 0x0b1a2a, emissiveIntensity: 0.2 }), shadow: false },
      roof: { geometry: geo.roof, material: mat({ flatShading: true }), shadow: true },
      crown: { geometry: geo.crown, material: mat({ flatShading: true }), shadow: true },
      trunk: { geometry: geo.trunk, material: mat(), shadow: true },
      disc: { geometry: geo.disc, material: mat(), shadow: false },
      water: { geometry: geo.box, material: new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 90, specular: 0xffffff }), shadow: false },
    };

    const city = new THREE.Group();
    scene.add(city);
    const moving = new THREE.Group();
    scene.add(moving);
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);

    let meshes: Record<string, THREE.InstancedMesh> = {};
    let parts: Record<string, Part[]> = {};
    let tiles: Tile[] = [];
    let currentSeed = -1;
    let born = new Map<number, number>(); // tile → time it started rising
    let growing: number[] = [];
    let tileParts = new Map<number, [string, number][]>();
    let radius = 10;
    let framed = false;
    let focus: THREE.Vector3 | null = null;
    let lastMe: number | null = null;

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const color = new THREE.Color();

    function writePart(mesh: THREE.InstancedMesh, idx: number, p: Part, g: number) {
      const gx = Math.min(1, g * 1.15);
      v.set(p.x, p.y * g, p.z);
      s.set(p.sx * gx, Math.max(0.0001, p.sy * g), p.sz * gx);
      q.setFromAxisAngle(up, p.ry);
      m4.compose(v, q, s);
      mesh.setMatrixAt(idx, m4);
    }

    // ---- cars: each drives back and forth along one road line
    type Car = { line: { axis: "x" | "z"; at: number; min: number; max: number }; pos: number; speed: number; lane: number };
    let cars: Car[] = [];
    let carBody: THREE.InstancedMesh | null = null;
    let carTop: THREE.InstancedMesh | null = null;

    function buildCars(plan: CityPlan) {
      if (carBody) moving.remove(carBody, carTop!);
      const lines = new Map<string, { axis: "x" | "z"; at: number; min: number; max: number }>();
      for (const t of tiles) {
        if (t.kind !== "road") continue;
        if (t.road === "x" || t.road === "cross") {
          const k = `x${t.z}`;
          const l = lines.get(k) ?? { axis: "x" as const, at: t.z, min: t.x, max: t.x };
          l.min = Math.min(l.min, t.x);
          l.max = Math.max(l.max, t.x);
          lines.set(k, l);
        }
        if (t.road === "z" || t.road === "cross") {
          const k = `z${t.x}`;
          const l = lines.get(k) ?? { axis: "z" as const, at: t.x, min: t.z, max: t.z };
          l.min = Math.min(l.min, t.z);
          l.max = Math.max(l.max, t.z);
          lines.set(k, l);
        }
      }
      cars = [];
      for (const l of lines.values()) {
        const len = l.max - l.min;
        if (len < 3) continue;
        const n = Math.min(4, Math.max(1, Math.round(len / 6)));
        for (let k = 0; k < n; k++) {
          const dir = (k + l.at) % 2 === 0 ? 1 : -1;
          cars.push({ line: l, pos: l.min + Math.random() * len, speed: dir * (0.8 + Math.random() * 0.9), lane: dir * 0.14 });
        }
      }
      cars = cars.slice(0, 140);
      carBody = new THREE.InstancedMesh(geo.box, mat(), Math.max(1, cars.length));
      carTop = new THREE.InstancedMesh(geo.box, mat({ color: 0xe9f2fb }), Math.max(1, cars.length));
      carBody.castShadow = true;
      cars.forEach((_, k) => carBody!.setColorAt(k, color.setHex(plan.palette.car[k % plan.palette.car.length])));
      carBody.count = carTop.count = cars.length;
      moving.add(carBody, carTop);
    }

    function updateCars(dt: number) {
      if (!carBody || !carTop) return;
      cars.forEach((c, k) => {
        c.pos += c.speed * dt;
        if (c.pos > c.line.max + 0.4) c.pos = c.line.min - 0.4;
        if (c.pos < c.line.min - 0.4) c.pos = c.line.max + 0.4;
        const alongX = c.line.axis === "x";
        const x = alongX ? c.pos : c.line.at + c.lane;
        const z = alongX ? c.line.at - c.lane : c.pos;
        q.setFromAxisAngle(up, alongX ? 0 : Math.PI / 2);
        m4.compose(v.set(x, 0.06, z), q, s.set(0.3, 0.09, 0.15));
        carBody!.setMatrixAt(k, m4);
        m4.compose(v.set(x - (alongX ? 0.02 * Math.sign(c.speed) : 0), 0.15, z - (alongX ? 0 : 0.02 * Math.sign(c.speed))), q, s.set(0.16, 0.06, 0.13));
        carTop!.setMatrixAt(k, m4);
      });
      carBody.instanceMatrix.needsUpdate = true;
      carTop.instanceMatrix.needsUpdate = true;
    }

    // ---- birds and clouds
    const BIRDS = 18;
    const birds = new THREE.InstancedMesh(geo.bird, new THREE.MeshLambertMaterial({ color: 0x3d4752, side: THREE.DoubleSide }), BIRDS);
    const birdData = Array.from({ length: BIRDS }, (_, k) => ({
      flock: k % 3,
      offset: (k % 6) * 0.5,
      phase: Math.random() * 10,
      spread: 0.6 + Math.random() * 1.2,
    }));
    moving.add(birds);

    const clouds: THREE.Group[] = [];
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, flatShading: true });
    for (let k = 0; k < 6; k++) {
      const c = new THREE.Group();
      const puffs = 3 + (k % 3);
      for (let p = 0; p < puffs; p++) {
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cloudMat);
        ball.position.set(p * 1.1 - puffs * 0.5, Math.sin(p * 2) * 0.3, (p % 2) * 0.6);
        ball.scale.setScalar(0.5 + ((p * 37) % 5) * 0.1);
        c.add(ball);
      }
      c.userData = { speed: 0.25 + (k % 4) * 0.1, z: (k / 6 - 0.5), y: 0, x: ((k * 23) % 60) / 60 - 0.5 };
      clouds.push(c);
      moving.add(c);
    }

    function updateSky(time: number, dt: number) {
      birdData.forEach((b, k) => {
        const a = time * 0.12 + b.flock * 2.1 - b.offset * 0.08;
        const R = radius * 0.6 + b.flock * 3;
        const x = Math.cos(a) * R + Math.cos(b.phase) * b.spread;
        const z = Math.sin(a) * R + Math.sin(b.phase) * b.spread;
        const y = 6 + b.flock * 1.6 + Math.sin(time * 0.8 + b.phase) * 0.4;
        q.setFromAxisAngle(up, -a);
        const flap = 0.4 + Math.abs(Math.sin(time * 9 + b.phase)) * 1.4;
        m4.compose(v.set(x, y, z), q, s.set(1, flap, 1));
        birds.setMatrixAt(k, m4);
      });
      birds.instanceMatrix.needsUpdate = true;
      // Clouds drift across, high above the city.
      const span = radius * 3 + 20;
      for (const c of clouds) {
        c.userData.x += (c.userData.speed * dt) / span;
        if (c.userData.x > 0.5) c.userData.x = -0.5;
        c.position.set(c.userData.x * span, radius * 0.9 + 9, c.userData.z * radius * 2.2);
      }
    }

    // ---- build / grow the city
    function build(newSeed: number, count: number) {
      const sameCity = newSeed === currentSeed;
      if (!sameCity) {
        born = new Map();
        framed = false;
      }
      currentSeed = newSeed;
      const plan = makePlan(newSeed);
      tiles = Array.from({ length: count }, (_, i) => tileAt(plan, i));

      const now = performance.now();
      for (const t of tiles) {
        if (!born.has(t.i)) {
          // First load: rise from the centre outwards. Later: new tiles pop up.
          const delay = sameCity ? (t.i - born.size) * 25 : Math.hypot(t.x, t.z) * 45;
          born.set(t.i, now + Math.min(delay, 2500));
        }
      }

      parts = {};
      tileParts = new Map();
      for (const t of tiles) {
        partsFor(t, plan, (mesh, p) => {
          (parts[mesh] ??= []).push({ ...p, tile: t.i });
          const list = tileParts.get(t.i) ?? [];
          list.push([mesh, parts[mesh].length - 1]);
          tileParts.set(t.i, list);
        });
      }

      for (const m of Object.values(meshes)) {
        city.remove(m);
        m.dispose();
      }
      meshes = {};
      growing = [];
      for (const [name, def] of Object.entries(meshDefs)) {
        const list = parts[name] ?? [];
        const mesh = new THREE.InstancedMesh(def.geometry, def.material, Math.max(1, list.length));
        mesh.count = list.length;
        mesh.castShadow = def.shadow;
        mesh.receiveShadow = true;
        mesh.userData.name = name;
        list.forEach((p, k) => {
          const b = born.get(p.tile)!;
          const g = now >= b + 700 ? 1 : 0;
          writePart(mesh, k, p, g);
          mesh.setColorAt(k, color.setHex(p.color));
        });
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        meshes[name] = mesh;
        city.add(mesh);
      }
      for (const t of tiles) if (now < born.get(t.i)! + 700) growing.push(t.i);

      radius = tiles.reduce((m, t) => Math.max(m, Math.abs(t.x), Math.abs(t.z)), 4) + 1.5;
      base.scale.setScalar(radius * 8 + 120);
      const sc = sun.shadow.camera;
      sc.left = sc.bottom = -radius * 1.3;
      sc.right = sc.top = radius * 1.3;
      sc.near = 1;
      sc.far = radius * 6 + 40;
      sc.updateProjectionMatrix();
      sun.position.set(-radius * 1.2, radius * 2 + 12, radius * 0.9);
      controls.maxDistance = Math.max(30, radius * 4.5);
      if (!framed) {
        framed = true;
        const d = (radius * 2.3 + 8) * Math.max(1, 0.95 / camera.aspect);
        camera.position.set(d * 0.62, d * 0.72, d * 0.62);
        controls.target.set(0, 0, 0);
        controls.update();
      }
      buildCars(plan);
      setMarkers(lastMarkers);
    }

    function updateGrowth(now: number) {
      if (!growing.length) return;
      const touched = new Set<string>();
      growing = growing.filter((tile) => {
        const b = born.get(tile)!;
        const t = Math.min(1, Math.max(0, (now - b) / 700));
        const g = t <= 0 ? 0 : easeOutBack(t);
        for (const [name, idx] of tileParts.get(tile) ?? []) {
          writePart(meshes[name], idx, parts[name][idx], g);
          touched.add(name);
        }
        return t < 1;
      });
      for (const name of touched) {
        meshes[name].instanceMatrix.needsUpdate = true;
        meshes[name].computeBoundingSphere();
      }
    }

    // ---- markers
    let lastMarkers: CityMarkers = { searchedEmpty: [], searchedHit: [], caught: [], left: [], me: null, sweeps: [], pending: null };
    const pulsers: { obj: THREE.Object3D; kind: "pulse" | "bob" | "spin"; base: number }[] = [];
    const markerGeo = {
      pinHead: new THREE.SphereGeometry(0.14, 16, 12),
      pinStick: new THREE.ConeGeometry(0.06, 0.32, 10).rotateX(Math.PI),
      ring: new THREE.TorusGeometry(0.36, 0.05, 8, 32).rotateX(Math.PI / 2),
      beam: new THREE.CylinderGeometry(0.22, 0.22, 1, 24, 1, true).translate(0, 0.5, 0),
      gem: new THREE.OctahedronGeometry(0.22),
      square: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      cross: new THREE.BoxGeometry(0.42, 0.04, 0.08),
    };
    const topOf = (tile: number) => tiles[tile]?.top ?? 0.2;
    const posOf = (tile: number) => tiles[tile] ?? { x: 0, z: 0 };

    function pin(tile: number, hex: number) {
      const g = new THREE.Group();
      const head = new THREE.Mesh(markerGeo.pinHead, new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.25 }));
      head.position.y = 0.42;
      const stick = new THREE.Mesh(markerGeo.pinStick, new THREE.MeshLambertMaterial({ color: hex }));
      stick.position.y = 0.2;
      g.add(head, stick);
      g.position.set(posOf(tile).x, topOf(tile) + 0.05, posOf(tile).z);
      return g;
    }

    function setMarkers(m: CityMarkers) {
      lastMarkers = m;
      for (const c of [...markerGroup.children]) {
        markerGroup.remove(c);
        c.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
        });
      }
      pulsers.length = 0;
      if (!tiles.length) return;
      const ok = (t: number) => t >= 0 && t < tiles.length;

      for (const t of m.searchedEmpty.filter(ok)) {
        const g = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: 0x8b95a1, transparent: true, opacity: 0.9 });
        const a = new THREE.Mesh(markerGeo.cross, mat);
        const b = new THREE.Mesh(markerGeo.cross, mat);
        a.rotation.y = Math.PI / 4;
        b.rotation.y = -Math.PI / 4;
        g.add(a, b);
        g.position.set(posOf(t).x, topOf(t) + 0.04, posOf(t).z);
        markerGroup.add(g);
      }
      for (const t of m.caught.filter(ok)) markerGroup.add(pin(t, 0xe5484d));
      for (const t of m.searchedHit.filter(ok)) markerGroup.add(pin(t, 0xe5484d));
      for (const t of m.left.filter(ok)) {
        const ring = new THREE.Mesh(markerGeo.ring, new THREE.MeshBasicMaterial({ color: 0xffb400 }));
        ring.position.set(posOf(t).x, topOf(t) + 0.15, posOf(t).z);
        markerGroup.add(ring);
        pulsers.push({ obj: ring, kind: "pulse", base: 1 });
      }
      for (const sw of m.sweeps) {
        if (!ok(sw.tile)) continue;
        const size = sw.radius * 2 + 1;
        const hex = sw.count > 0 ? 0xffb400 : 0x4dabf7;
        const sq = new THREE.Mesh(
          markerGeo.square,
          new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.18, depthWrite: false }),
        );
        sq.scale.set(size, 1, size);
        sq.position.set(posOf(sw.tile).x, 0.12, posOf(sw.tile).z);
        sq.renderOrder = 2;
        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(size, 0.01, size)),
          new THREE.LineBasicMaterial({ color: hex }),
        );
        edge.position.copy(sq.position);
        markerGroup.add(sq, edge);
      }
      if (m.me !== null && ok(m.me) && m.me !== lastMe) {
        // Glide the camera to the player's hiding spot when it is first known (or after a move).
        focus = new THREE.Vector3(posOf(m.me).x, 0, posOf(m.me).z);
      }
      lastMe = m.me;
      if (m.me !== null && ok(m.me)) {
        const g = new THREE.Group();
        const beam = new THREE.Mesh(
          markerGeo.beam,
          new THREE.MeshBasicMaterial({ color: 0x12b886, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
        );
        beam.scale.set(1.6, topOf(m.me) + 6, 1.6);
        beam.renderOrder = 3;
        const gem = new THREE.Mesh(markerGeo.gem, new THREE.MeshLambertMaterial({ color: 0x12b886, emissive: 0x12b886, emissiveIntensity: 0.4 }));
        gem.scale.setScalar(1.6);
        gem.position.y = topOf(m.me) + 1.2;
        g.add(beam, gem);
        g.position.set(posOf(m.me).x, 0, posOf(m.me).z);
        markerGroup.add(g);
        pulsers.push({ obj: gem, kind: "bob", base: gem.position.y });
      }
      if (m.pending !== null && ok(m.pending)) {
        const beam = new THREE.Mesh(
          markerGeo.beam,
          new THREE.MeshBasicMaterial({ color: 0xffb400, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
        );
        beam.scale.set(2, topOf(m.pending) + 2, 2);
        beam.position.set(posOf(m.pending).x, 0, posOf(m.pending).z);
        markerGroup.add(beam);
        pulsers.push({ obj: beam, kind: "spin", base: 1 });
      }
    }

    function updateMarkers(time: number) {
      for (const p of pulsers) {
        if (p.kind === "pulse") p.obj.scale.setScalar(1 + Math.sin(time * 4) * 0.12);
        if (p.kind === "bob") {
          p.obj.position.y = p.base + Math.sin(time * 2.5) * 0.15;
          p.obj.rotation.y = time * 1.5;
        }
        if (p.kind === "spin") ((p.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.abs(Math.sin(time * 5)) * 0.3;
      }
    }

    // ---- hover highlight and taps
    const hoverBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
      new THREE.LineBasicMaterial({ color: 0xffb400 }),
    );
    hoverBox.visible = false;
    scene.add(hoverBox);
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function tileUnder(clientX: number, clientY: number): number | null {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      const hits = ray.intersectObjects(Object.values(meshes), false);
      for (const h of hits) {
        const name = (h.object as THREE.InstancedMesh).userData.name as string;
        if (h.instanceId === undefined) continue;
        const p = parts[name]?.[h.instanceId];
        if (p) return p.tile;
      }
      return null;
    }

    function showHover(tile: number | null) {
      if (tile === null || !cb.current.interactive) {
        hoverBox.visible = false;
        cb.current.onHover?.(null);
        return;
      }
      const t = tiles[tile];
      hoverBox.visible = true;
      hoverBox.position.set(t.x, 0, t.z);
      hoverBox.scale.set(1.02, t.top + 0.1, 1.02);
      cb.current.onHover?.({ tile, label: KIND_LABEL[t.kind] });
    }

    let down: { x: number; y: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 600;
      down = null;
      if (moved > 8 || !quick || !cb.current.interactive) return;
      const tile = tileUnder(e.clientX, e.clientY);
      if (tile !== null) {
        showHover(tile);
        cb.current.onTile(tile);
      }
    };
    let hoverQueued: PointerEvent | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && !down) hoverQueued = e;
    };
    const onLeave = () => showHover(null);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    // ---- size and loop
    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const clock = new THREE.Clock();
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.1);
      const time = clock.elapsedTime;
      if (hoverQueued) {
        showHover(tileUnder(hoverQueued.clientX, hoverQueued.clientY));
        hoverQueued = null;
      }
      updateGrowth(performance.now());
      updateCars(dt);
      updateSky(time, dt);
      updateMarkers(time);
      if (focus) {
        controls.target.lerp(focus, 0.06);
        if (controls.target.distanceTo(focus) < 0.05) focus = null;
      }
      controls.update();
      const dist = camera.position.distanceTo(controls.target);
      const fog = scene.fog as THREE.Fog;
      fog.near = dist + radius * 0.8;
      fog.far = dist + radius * 4 + 30;
      renderer.render(scene, camera);
    };
    loop();

    api.current = { build, setMarkers };

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
        }
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
      api.current = null;
    };
  }, []);

  useEffect(() => {
    api.current?.build(seed, tileCount);
  }, [seed, tileCount]);

  useEffect(() => {
    api.current?.setMarkers(markers);
  }, [markers]);

  return <div ref={host} className="absolute inset-0" />;
}
