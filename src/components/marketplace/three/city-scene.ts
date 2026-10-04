import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { accentOf, readTheme } from "@/lib/store-theme";
import type { ExploreBusiness } from "@/lib/types";
import { awningTexture, roadTexture, shade, shopSignTexture } from "./textures";

// The marketplace map: a little low-poly town seen from above. Blocks of four
// plots spiral out from the middle as more businesses join, with roads between
// them; empty plots become parks. Each shop is one merged mesh (plus its sign
// and awning), so even a big town is only a few hundred draw calls.

// Each block is a street of three shopfronts facing the camera's side of the
// road, with a strip of garden behind.
const PLOT = 7;
const PLOT_D = 7.5;
const PER_BLOCK = 3;
const ROAD = 3.4;
const BW = PLOT * PER_BLOCK; // block width (x)
const BD = PLOT_D + 2.5; // block depth (z)
const PX = BW + ROAD;
const PZ = BD + ROAD;

export interface CityCallbacks {
  /** A shop was tapped. */
  onOpen: (businessId: string) => void;
  /** Called every frame with where each shop's label should sit on screen. */
  onPlace: (placements: { id: string; x: number; y: number; visible: boolean }[], zoom: number) => void;
}

interface Shop {
  business: ExploreBusiness;
  group: THREE.Group;
  anchor: THREE.Vector3;
  riseDelay: number;
}

interface Car {
  mesh: THREE.Mesh;
  axis: "x" | "z";
  fixed: number;
  dir: 1 | -1;
  speed: number;
  min: number;
  max: number;
}

/** Block positions spiralling out from the middle: (0,0), (1,0), (1,1), (0,1), (-1,1)… */
function spiral(count: number) {
  const out: [number, number][] = [[0, 0]];
  let x = 0;
  let z = 0;
  let step = 1;
  const dirs: [number, number][] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  let d = 0;
  while (out.length < count) {
    for (let rep = 0; rep < 2 && out.length < count; rep++) {
      for (let i = 0; i < step && out.length < count; i++) {
        x += dirs[d]![0];
        z += dirs[d]![1];
        out.push([x, z]);
      }
      d = (d + 1) % 4;
    }
    step++;
  }
  return out;
}

/** A stable number from a string, for variety that doesn't change between visits. */
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/** Paints every vertex of a geometry one colour (for merged, vertex-coloured meshes). */
function paint(geometry: THREE.BufferGeometry, color: string | THREE.Color) {
  // Merging needs every piece stored the same way, so make indexed shapes plain.
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const c = new THREE.Color(color);
  const count = g.attributes.position!.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return paint(g, color);
}

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export class CityScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private target = new THREE.Vector3();
  private velocity = new THREE.Vector2();
  private zoom = 1;
  private bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
  private shops: Shop[] = [];
  private cars: Car[] = [];
  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  private pinch: { dist: number; zoom: number } | null = null;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private frame = 0;
  private last = 0;
  private started = 0;
  private paused = false;
  private disposed = false;
  private reducedMotion: boolean;
  private resizeObserver: ResizeObserver;
  private disposables: { dispose: () => void }[] = [];
  private pickables: THREE.Object3D[] = [];
  private hovered: string | null = null;

  constructor(
    private container: HTMLElement,
    businesses: ExploreBusiness[],
    private callbacks: CityCallbacks,
  ) {
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.75 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);

    const sky = new THREE.Color("#dcefe4");
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 70, 150);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);

    this.scene.add(new THREE.HemisphereLight("#ffffff", "#7fa37a", 1.55));
    const sun = new THREE.DirectionalLight("#fff4e0", 1.6);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);

    this.build(businesses);
    // Few shops: start closer in.
    this.zoom = businesses.length <= 3 ? 1.35 : businesses.length <= 9 ? 1.1 : 1;
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.bindInput();
    document.addEventListener("visibilitychange", this.onVisibility);
    this.started = performance.now();
    this.loop(this.started);
  }

  // ------------------------------------------------------------------ building the town

  private build(businesses: ExploreBusiness[]) {
    const blockCount = Math.max(1, Math.ceil(businesses.length / PER_BLOCK));
    // A ring of park blocks around the shops keeps the edge from looking cut off.
    const blocks = spiral(blockCount);
    const minBx = Math.min(...blocks.map((b) => b[0]));
    const maxBx = Math.max(...blocks.map((b) => b[0]));
    const minBz = Math.min(...blocks.map((b) => b[1]));
    const maxBz = Math.max(...blocks.map((b) => b[1]));
    const hx = PX / 2;
    const hz = PZ / 2;
    this.bounds = { minX: minBx * PX - hx, maxX: maxBx * PX + hx, minZ: minBz * PZ - hz, maxZ: maxBz * PZ + hz };

    // Grass everywhere, a little lighter under the town.
    const grassMat = new THREE.MeshLambertMaterial({ color: "#9ccc86" });
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.05;
    this.scene.add(grass);
    this.track(grass.geometry, grassMat);

    // Roads along every block edge (one strip per line), plus plain squares at crossings.
    const road = roadTexture();
    const roadMat = new THREE.MeshLambertMaterial({ map: road });
    const plainRoad = new THREE.MeshLambertMaterial({ color: "#4b5150" });
    this.track(road, roadMat, plainRoad);
    const spanX = [minBx * PX - hx - ROAD / 2, maxBx * PX + hx + ROAD / 2];
    const spanZ = [minBz * PZ - hz - ROAD / 2, maxBz * PZ + hz + ROAD / 2];
    const roadLines: { axis: "x" | "z"; at: number; min: number; max: number }[] = [];
    for (let k = minBz - 1; k <= maxBz; k++) roadLines.push({ axis: "x", at: k * PZ + hz, min: spanX[0]!, max: spanX[1]! });
    for (let k = minBx - 1; k <= maxBx; k++) roadLines.push({ axis: "z", at: k * PX + hx, min: spanZ[0]!, max: spanZ[1]! });
    for (const line of roadLines) {
      const length = line.max - line.min;
      const tex = road.clone();
      tex.needsUpdate = true;
      tex.repeat.set(length / ROAD, 1);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, ROAD), mat);
      mesh.rotation.x = -Math.PI / 2;
      if (line.axis === "z") mesh.rotation.z = Math.PI / 2;
      mesh.position.set(line.axis === "x" ? (line.min + line.max) / 2 : line.at, line.axis === "x" ? 0.01 : 0.012, line.axis === "x" ? line.at : (line.min + line.max) / 2);
      this.scene.add(mesh);
      this.track(tex, mat, mesh.geometry);
    }
    const crossings: THREE.BufferGeometry[] = [];
    for (let i = minBx - 1; i <= maxBx; i++)
      for (let k = minBz - 1; k <= maxBz; k++) {
        const g = new THREE.PlaneGeometry(ROAD, ROAD);
        g.rotateX(-Math.PI / 2);
        g.translate(i * PX + hx, 0.015, k * PZ + hz);
        crossings.push(g);
      }
    const crossMesh = new THREE.Mesh(mergeGeometries(crossings), plainRoad);
    this.scene.add(crossMesh);
    this.track(crossMesh.geometry);
    crossings.forEach((g) => g.dispose());

    // Pavements (one raised slab per block) and plots.
    const pavement: THREE.BufferGeometry[] = [];
    const parks: [number, number][] = [];
    const plots: { x: number; z: number; facing: number }[] = [];
    const hedges: [number, number][] = [];
    for (const [bx, bz] of blocks) {
      const cx = bx * PX;
      const cz = bz * PZ;
      pavement.push(box(BW, 0.18, BD, cx, 0.09, cz, "#d9d6cd"));
      // Garden strip behind the shops.
      pavement.push(box(BW - 0.6, 0.06, BD - PLOT_D - 0.4, cx, 0.2, cz - BD / 2 + (BD - PLOT_D) / 2, "#8fc779"));
      for (let i = 0; i < PER_BLOCK; i++) {
        plots.push({ x: cx + (i - (PER_BLOCK - 1) / 2) * PLOT, z: cz + BD / 2 - PLOT_D / 2, facing: 0 });
        hedges.push([cx + (i - (PER_BLOCK - 1) / 2) * PLOT, cz - BD / 2 + 1.1]);
      }
    }
    const paveMesh = new THREE.Mesh(mergeGeometries(pavement), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(paveMesh);
    this.track(paveMesh.geometry, paveMesh.material as THREE.Material);
    pavement.forEach((g) => g.dispose());

    // Shops on the first plots, parks on the rest.
    const shopMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.track(shopMat);
    businesses.forEach((b, i) => {
      const plot = plots[i]!;
      this.addShop(b, plot.x, plot.z, plot.facing, shopMat, i);
    });
    for (let i = businesses.length; i < plots.length; i++) parks.push([plots[i]!.x, plots[i]!.z]);
    this.addParksAndTrees(parks, blocks, hedges);
    this.addLamps(blocks);
    this.addCars(roadLines);
  }

  private addShop(b: ExploreBusiness, x: number, z: number, facing: number, material: THREE.Material, index: number) {
    const theme = readTheme(b.store_theme);
    const accent = accentOf(theme, b.brand_color);
    const r = hash(b.id);
    const height = 2.6 + r * 1.6;
    const width = 4.6;
    const depth = 4;
    const chosenWall = (b.store_theme as { wall?: string } | null)?.wall;
    const wall = chosenWall ? (theme.wall === "#2F3A34" ? "#3b4842" : shade(theme.wall, -0.04)) : `#${new THREE.Color(accent).lerp(new THREE.Color("#ffffff"), 0.78).getHexString()}`;
    const parts: THREE.BufferGeometry[] = [
      box(PLOT - 0.6, 0.08, PLOT - 0.6, 0, 0.22, 0, "#ece8de"), // forecourt
      box(width, height, depth, 0, 0.26 + height / 2, -0.4, wall), // walls
      box(width + 0.3, 0.3, depth + 0.3, 0, 0.26 + height + 0.15, -0.4, shade(accent, -0.08)), // roof edge
      box(width - 0.2, 0.12, depth - 0.2, 0, 0.26 + height + 0.36, -0.4, "#e7e2d8"), // roof
      box(1.1, 1.75, 0.12, 0, 0.26 + 0.875, depth / 2 - 0.36, "#3a2a1f"), // door
      box(1.25, 0.12, 0.16, 0, 0.26 + 1.8, depth / 2 - 0.34, shade(accent, -0.1)), // door frame
      box(1.25, 1.05, 0.08, -1.55, 0.26 + 1.15, depth / 2 - 0.38, "#bfe3f0"), // windows
      box(1.25, 1.05, 0.08, 1.55, 0.26 + 1.15, depth / 2 - 0.38, "#bfe3f0"),
      box(1.4, 0.1, 0.25, -1.55, 0.26 + 0.6, depth / 2 - 0.3, "#ffffff"), // sills
      box(1.4, 0.1, 0.25, 1.55, 0.26 + 0.6, depth / 2 - 0.3, "#ffffff"),
      box(0.5, 0.45, 0.5, -2.75, 0.26 + 0.22, depth / 2 + 0.2, "#b86f4b"), // plant pots
      box(0.5, 0.45, 0.5, 2.75, 0.26 + 0.22, depth / 2 + 0.2, "#b86f4b"),
    ];
    // Leafy tops on the pots.
    for (const px of [-2.75, 2.75]) {
      const leaf = new THREE.IcosahedronGeometry(0.42, 0);
      leaf.translate(px, 0.26 + 0.75, depth / 2 + 0.2);
      parts.push(paint(leaf, "#4f9b4a"));
    }
    // Taller shops get an upper row of windows; some get a little chimney.
    if (height > 3.4) {
      for (const wx of [-1.4, 0, 1.4]) parts.push(box(0.9, 0.7, 0.08, wx, 0.26 + height - 0.75, depth / 2 - 0.38, "#bfe3f0"));
    }
    if (r > 0.55) parts.push(box(0.5, 0.9, 0.5, 1.4, 0.26 + height + 0.75, -1.4, shade(wall, -0.2)));
    const merged = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    const body = new THREE.Mesh(merged, material);
    body.userData.businessId = b.id;
    this.track(merged);

    // Soft shadow under the shop.
    const shadowMat = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.12, depthWrite: false });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width + 1.2, depth + 1.2), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.5, 0.27, -0.1);
    this.track(shadow.geometry, shadowMat);

    // Awning and sign (textured).
    const awningTex = awningTexture(accent);
    const awningMat = new THREE.MeshLambertMaterial({ map: awningTex, transparent: true, side: THREE.DoubleSide });
    const awning = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.2, 1.2), awningMat);
    awning.position.set(0, 0.26 + 2.25, depth / 2 - 0.05);
    awning.rotation.x = -0.75;
    awning.userData.businessId = b.id;
    const signTex = shopSignTexture(b.name, accent, b.logo_url);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), signMat);
    sign.position.set(0, 0.26 + Math.min(height - 0.55, 3.2), depth / 2 - 0.33);
    sign.userData.businessId = b.id;
    this.track(awningTex, awningMat, awning.geometry, signTex, signMat, sign.geometry);

    const group = new THREE.Group();
    group.add(body, shadow, awning, sign);
    group.position.set(x, 0, z);
    group.rotation.y = facing;
    group.scale.y = this.reducedMotion ? 1 : 0.001;
    this.scene.add(group);
    this.pickables.push(body, awning, sign);
    this.shops.push({ business: b, group, anchor: new THREE.Vector3(x, height + 1.9, z), riseDelay: index * 70 });
  }

  private addParksAndTrees(parks: [number, number][], blocks: [number, number][], gardens: [number, number][]) {
    const trunks: THREE.Matrix4[] = [];
    const leaves: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const greens = ["#4f9b4a", "#5fae55", "#3f8a3f", "#76b85e"];
    const addTree = (x: number, z: number, s: number, seed: number) => {
      trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.6 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
      leaves.push({
        m: new THREE.Matrix4().compose(new THREE.Vector3(x, 1.7 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, seed * 6, 0)), new THREE.Vector3(s, s * 1.1, s)),
        c: new THREE.Color(greens[Math.floor(seed * greens.length) % greens.length]!),
      });
    };
    const parkParts: THREE.BufferGeometry[] = [];
    parks.forEach(([x, z], i) => {
      parkParts.push(box(PLOT - 0.6, 0.1, PLOT_D - 0.6, x, 0.23, z, "#8fc779"));
      const seed = hash(`${x},${z}`);
      if (i % 3 === 0) {
        // A fountain.
        const basin = new THREE.CylinderGeometry(1.4, 1.5, 0.45, 16);
        basin.translate(x, 0.5, z);
        parkParts.push(paint(basin, "#e8e3d8"));
        const water = new THREE.CylinderGeometry(1.2, 1.2, 0.05, 16);
        water.translate(x, 0.74, z);
        parkParts.push(paint(water, "#7cc6e6"));
        const spout = new THREE.CylinderGeometry(0.15, 0.25, 1.1, 8);
        spout.translate(x, 1.1, z);
        parkParts.push(paint(spout, "#e8e3d8"));
        addTree(x - 2.3, z - 2.3, 0.9, seed);
        addTree(x + 2.3, z + 2.2, 1, seed * 0.7);
      } else {
        parkParts.push(box(1.6, 0.12, 0.5, x, 0.62, z + 1.6, "#a0683f"), box(1.6, 0.4, 0.12, x, 0.85, z + 1.85, "#a0683f"));
        for (let t = 0; t < 4; t++) addTree(x - 2 + (t % 2) * 4 + seed, z - 2 + Math.floor(t / 2) * 3.2, 0.8 + ((seed * (t + 3)) % 0.5), (seed * (t + 1)) % 1);
      }
    });
    // A couple of trees in each garden behind the shops.
    for (const [x, z] of gardens) {
      const seed = hash(`g${x},${z}`);
      addTree(x - 1.6 + seed, z, 0.75 + seed * 0.3, seed);
      if (seed > 0.4) addTree(x + 1.8, z + 0.2, 0.7, seed * 0.5);
    }
    // Trees along the outside of the town.
    const ring = new Set(blocks.map(([a, b]) => `${a},${b}`));
    for (const [bx, bz] of blocks)
      for (const [nx, nz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        if (ring.has(`${bx + nx},${bz + nz}`)) continue;
        for (let t = -2; t <= 2; t++) {
          const along = t * 3;
          const x = bx * PX + (nx ? nx * (PX / 2 + ROAD + 1.5) : along * 1.6);
          const z = bz * PZ + (nz ? nz * (PZ / 2 + ROAD + 1.5) : along * 0.7);
          addTree(x + (hash(`${x}`) - 0.5), z + (hash(`${z}`) - 0.5), 0.9 + hash(`${x}${z}`) * 0.5, hash(`${z}${x}`));
        }
      }
    if (parkParts.length) {
      const parkMesh = new THREE.Mesh(mergeGeometries(parkParts), new THREE.MeshLambertMaterial({ vertexColors: true }));
      this.scene.add(parkMesh);
      this.track(parkMesh.geometry, parkMesh.material as THREE.Material);
      parkParts.forEach((g) => g.dispose());
    }
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6);
    const leafGeo = new THREE.IcosahedronGeometry(1, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: "#8a5a36" });
    const leafMat = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trunks.length);
    const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, leaves.length);
    trunks.forEach((m, i) => trunkMesh.setMatrixAt(i, m));
    leaves.forEach((l, i) => {
      leafMesh.setMatrixAt(i, l.m);
      leafMesh.setColorAt(i, l.c);
    });
    this.scene.add(trunkMesh, leafMesh);
    this.track(trunkGeo, leafGeo, trunkMat, leafMat);
  }

  private addLamps(blocks: [number, number][]) {
    const spots: THREE.Vector3[] = [];
    for (const [bx, bz] of blocks)
      for (const [dx, dz] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ])
        spots.push(new THREE.Vector3(bx * PX + dx * (BW / 2 - 0.4), 0, bz * PZ + dz * (BD / 2 - 0.4)));
    const pole = new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6);
    pole.translate(0, 1.3, 0);
    const head = new THREE.SphereGeometry(0.22, 8, 6);
    head.translate(0, 2.7, 0);
    const poleMat = new THREE.MeshLambertMaterial({ color: "#34403a" });
    const headMat = new THREE.MeshBasicMaterial({ color: "#fff3c4" });
    const poles = new THREE.InstancedMesh(pole, poleMat, spots.length);
    const heads = new THREE.InstancedMesh(head, headMat, spots.length);
    spots.forEach((p, i) => {
      const m = new THREE.Matrix4().makeTranslation(p.x, 0.18, p.z);
      poles.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
    });
    this.scene.add(poles, heads);
    this.track(pole, head, poleMat, headMat);
  }

  private addCars(lines: { axis: "x" | "z"; at: number; min: number; max: number }[]) {
    const colors = ["#e4572e", "#2a77b5", "#f2c14e", "#ffffff", "#2a772c", "#8e5bd8"];
    const count = Math.min(10, Math.max(3, lines.length));
    const parts = (color: string) => {
      const g = mergeGeometries([
        box(1.5, 0.45, 0.8, 0, 0.42, 0, color),
        box(0.8, 0.4, 0.72, -0.1, 0.85, 0, "#dff1fa"),
        box(0.3, 0.3, 0.86, -0.55, 0.22, 0, "#222"),
        box(0.3, 0.3, 0.86, 0.5, 0.22, 0, "#222"),
      ]);
      return g;
    };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.track(mat);
    for (let i = 0; i < count; i++) {
      const line = lines[(i * 7) % lines.length]!;
      const geometry = parts(colors[i % colors.length]!);
      const mesh = new THREE.Mesh(geometry, mat);
      const dir = (i % 2 ? 1 : -1) as 1 | -1;
      const lane = dir * 0.8;
      const car: Car = { mesh, axis: line.axis, fixed: line.at + lane, dir, speed: 3 + (i % 4) * 0.8, min: line.min, max: line.max };
      const start = line.min + ((i * 13.7) % (line.max - line.min));
      if (car.axis === "x") {
        mesh.position.set(start, 0, car.fixed);
        mesh.rotation.y = dir > 0 ? 0 : Math.PI;
      } else {
        mesh.position.set(car.fixed, 0, start);
        mesh.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      this.scene.add(mesh);
      this.cars.push(car);
      this.track(geometry);
    }
  }

  private track(...items: { dispose: () => void }[]) {
    this.disposables.push(...items);
  }

  // ------------------------------------------------------------------ camera and input

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.updateCamera();
  }

  private updateCamera() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    // Show about 34 units top to bottom at zoom 1 (more on wide screens).
    const viewH = (w > h ? 34 : 40) / this.zoom;
    const viewW = viewH * (w / h);
    this.camera.left = -viewW / 2;
    this.camera.right = viewW / 2;
    this.camera.top = viewH / 2;
    this.camera.bottom = -viewH / 2;
    this.camera.position.set(this.target.x + 60, this.target.y + 66, this.target.z + 60);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  private groundPoint(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
  }

  private clampTarget() {
    const m = 6;
    this.target.x = Math.max(this.bounds.minX - m, Math.min(this.bounds.maxX + m, this.target.x));
    this.target.z = Math.max(this.bounds.minZ - m, Math.min(this.bounds.maxZ + m, this.target.z));
  }

  private setZoom(next: number, aroundX?: number, aroundY?: number) {
    const before = aroundX !== undefined ? this.groundPoint(aroundX, aroundY!) : null;
    this.zoom = Math.max(0.5, Math.min(2.4, next));
    this.updateCamera();
    if (before && aroundX !== undefined) {
      const after = this.groundPoint(aroundX, aroundY!);
      if (after) this.target.add(before.sub(after));
      this.clampTarget();
      this.updateCamera();
    }
  }

  private pick(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    return (hit?.object.userData.businessId as string | undefined) ?? null;
  }

  private bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
    el.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private onDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    this.velocity.set(0, 0);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: this.zoom };
    }
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      // Hover (mouse): pointer cursor over shops.
      if (e.pointerType === "mouse") {
        const id = this.pick(e.clientX, e.clientY);
        if (id !== this.hovered) {
          this.hovered = id;
          this.renderer.domElement.style.cursor = id ? "pointer" : "grab";
        }
      }
      return;
    }
    if (this.pointers.size === 2 && this.pinch) {
      p.x = e.clientX;
      p.y = e.clientY;
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.setZoom(this.pinch.zoom * (dist / Math.max(1, this.pinch.dist)), (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      return;
    }
    const from = this.groundPoint(p.x, p.y);
    const to = this.groundPoint(e.clientX, e.clientY);
    p.x = e.clientX;
    p.y = e.clientY;
    if (from && to) {
      const delta = from.sub(to);
      this.target.add(delta);
      this.velocity.set(delta.x, delta.z);
      this.clampTarget();
      this.updateCamera();
    }
  };

  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!p) return;
    const moved = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
    if (moved < 8 && e.type === "pointerup") {
      this.velocity.set(0, 0);
      const id = this.pick(e.clientX, e.clientY);
      if (id) this.callbacks.onOpen(id);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  };

  private onVisibility = () => {
    if (document.hidden) this.stop();
    else if (!this.paused) this.start();
  };

  // ------------------------------------------------------------------ loop

  private start() {
    if (this.frame || this.disposed) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.loop);
  }

  private stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private loop = (now: number) => {
    this.frame = 0;
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;

    // Shops rise into place the first time.
    const elapsed = now - this.started;
    for (const shop of this.shops) {
      if (shop.group.scale.y < 1) {
        const t = Math.max(0, Math.min(1, (elapsed - shop.riseDelay) / 650));
        shop.group.scale.y = Math.max(0.001, easeOutBack(t));
      }
    }
    // A little glide after letting go.
    if (this.pointers.size === 0 && this.velocity.lengthSq() > 0.00001) {
      this.target.x += this.velocity.x * 0.9;
      this.target.z += this.velocity.y * 0.9;
      this.velocity.multiplyScalar(0.9);
      this.clampTarget();
      this.updateCamera();
    }
    if (!this.reducedMotion) {
      for (const car of this.cars) {
        const pos = car.axis === "x" ? "x" : "z";
        car.mesh.position[pos] += car.dir * car.speed * dt;
        if (car.mesh.position[pos] > car.max) car.mesh.position[pos] = car.min;
        if (car.mesh.position[pos] < car.min) car.mesh.position[pos] = car.max;
      }
    }

    // Where each shop's label goes on screen.
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const v = new THREE.Vector3();
    this.callbacks.onPlace(
      this.shops.map((s) => {
        v.copy(s.anchor).project(this.camera);
        const x = ((v.x + 1) / 2) * w;
        const y = ((1 - v.y) / 2) * h;
        return { id: s.business.id, x, y, visible: x > -60 && x < w + 60 && y > -40 && y < h + 40 };
      }),
      this.zoom,
    );

    this.renderer.render(this.scene, this.camera);
    if (!this.paused && !document.hidden) this.frame = requestAnimationFrame(this.loop);
  };

  /** Stops drawing while something covers the map (a store is open). */
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.stop();
    else this.start();
  }

  /** Moves the camera to a shop. */
  focus(businessId: string) {
    const shop = this.shops.find((s) => s.business.id === businessId);
    if (!shop) return;
    this.target.set(shop.anchor.x, 0, shop.anchor.z);
    this.updateCamera();
  }

  zoomBy(factor: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.setZoom(this.zoom * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointercancel", this.onUp);
    el.removeEventListener("wheel", this.onWheel);
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    el.remove();
  }
}
