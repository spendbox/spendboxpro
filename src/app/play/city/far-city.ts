// The city far from the camera, kept to a strict budget so a zoomed-out or tilted view stays
// quick on any phone. Three rings round the camera:
//   near: every detail (city-view draws those tiles in full);
//   middle: one plain block per building (two by two tiles further out), about 10 triangles each;
//   far: one flat painted map of the whole region and the land round it (2 triangles), so the
//   horizon is never empty.
// Only for real places (src/lib/world): their map says what's land, water and road everywhere.
// Beyond the map (places the game doesn't have), the land is wild: low-detail forest near the
// edge, rolling hills and then mountains further out; the sea carries on as water.

import * as THREE from "three";
import { hash, roughAt, smoothNoise, type CityPlan } from "@/lib/city/layout";

/** How far out (tiles) the plain blocks reach from the middle of what's drawn. */
export const FAR_BLOCKS = 72;
/** How far round the region the painted map carries on (tiles). */
export const MAP_MARGIN = 150;
/** Beyond this (tiles), two by two tiles share one block. */
const FINE_BLOCKS = 40;
/** The most blocks ever drawn (a hard cap: about 60,000 triangles). */
const MAX_BLOCKS = 6000;
/** Pixels per tile on the painted map, at most (fewer for a big region: see MAP_PX_MAX). */
const PX_MOST = 2;
/** The widest picture every phone can draw (WebGL's smallest maximum texture size). */
const MAP_PX_MAX = 4096;

const COLORS = {
  // The same blues as the near water (./water): shallows by the shore, deep further out.
  shore: [0x4f, 0xb0, 0xe3],
  sea: [0x1a, 0x5f, 0x9e],
  lagoon: [0x24, 0x79, 0xbd],
  road: [0x8a, 0x90, 0x99],
  street: [0xb4, 0xb4, 0xac],
  town: [0xdb, 0xd4, 0xc5],
  suburb: [0xcf, 0xd8, 0xb5],
  green: [0xa8, 0xd0, 0x92],
  country: [0x86, 0xb0, 0x6c],
};

/** A unit box standing on y = 0, without its bottom face. */
function blockGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const idx = g.index!.array;
  g.setIndex([...idx.slice(0, 18), ...idx.slice(24)]);
  g.clearGroups();
  return g;
}

export function createFarCity(parent: THREE.Object3D) {
  const group = new THREE.Group();
  parent.add(group);
  const blockMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const blocks = new THREE.InstancedMesh(blockGeometry(), blockMat, MAX_BLOCKS);
  blocks.count = 0;
  blocks.frustumCulled = false;
  blocks.userData.name = "farBlocks";
  group.add(blocks);
  // Pushed back a little in depth: each near tile's own ground always draws over it.
  // Bridges and flyovers far off: one plain deck per piece (and its pier), so Third Mainland
  // Bridge still crosses the lagoon from far away.
  const MAX_DECKS = 4000;
  const decks = new THREE.InstancedMesh(blockGeometry(), new THREE.MeshLambertMaterial({ color: 0xc9ccd1 }), MAX_DECKS);
  decks.count = 0;
  decks.frustumCulled = false;
  decks.userData.name = "farDecks";
  group.add(decks);
  const mapMat = new THREE.MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  const map = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mapMat);
  map.receiveShadow = true;
  map.userData.name = "farMap";
  map.visible = false;
  group.add(map);
  // ---- the wilds beyond the map: forest trees round the camera, mountains far out.
  const MAX_TREES = 5000;
  const treeGeo = new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.62, 0);
  const pineGeo = new THREE.ConeGeometry(0.42, 1.3, 6).translate(0, 0.65, 0);
  const wildMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const trees = new THREE.InstancedMesh(treeGeo, wildMat, MAX_TREES);
  const pines = new THREE.InstancedMesh(pineGeo, wildMat, MAX_TREES);
  for (const m of [trees, pines]) {
    m.count = 0;
    m.frustumCulled = false;
    m.userData.name = "farWilds";
    group.add(m);
  }
  const MAX_PEAKS = 320;
  const peaks = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 7, 2).translate(0, 0.5, 0), wildMat, MAX_PEAKS);
  peaks.count = 0;
  peaks.frustumCulled = false;
  peaks.userData.name = "farPeaks";
  group.add(peaks);
  let peaksFor: CityPlan | null = null;
  /** Off the map at (x, z): land or water (the sea carries on out from the coast), or null on the map. */
  const wildAt = (region: NonNullable<CityPlan["region"]>, x: number, z: number): "land" | "water" | null => {
    if (region.inside(x, z)) return null;
    const b = region.bounds;
    const ex = Math.max(b.x0, Math.min(b.x1, x));
    const ez = Math.max(b.z0, Math.min(b.z1, z));
    const w = region.waterAt(ex, ez);
    if (w === 2 || (w === 1 && Math.hypot(x - ex, z - ez) < 6)) return "water";
    return "land";
  };
  /** How far (tiles) outside the map's box a point is. */
  const outBy = (region: NonNullable<CityPlan["region"]>, x: number, z: number) => {
    const b = region.bounds;
    return Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
  };
  /** Hills and mountains round the map, on land, taller the further out. Once per map. */
  function buildPeaks(plan: CityPlan) {
    const region = plan.region!;
    const b = region.bounds;
    let n = 0;
    const leaf = new THREE.Color();
    for (let k = 0; k < 6000 && n < MAX_PEAKS; k++) {
      const x = b.x0 - MAP_MARGIN + hash(k, 1, 6161) * (b.x1 - b.x0 + 2 * MAP_MARGIN);
      const z = b.z0 - MAP_MARGIN + hash(k, 2, 6161) * (b.z1 - b.z0 + 2 * MAP_MARGIN);
      const d = outBy(region, x, z);
      if (d < 22 || wildAt(region, Math.round(x), Math.round(z)) !== "land") continue;
      if (smoothNoise(x / 30, z / 30, 6262) < 0.45) continue;
      const far = Math.min(1, (d - 22) / 100);
      const h = (2 + far * 14) * (0.6 + hash(k, 3, 6161) * 0.8);
      const r = h * (1.7 + hash(k, 4, 6161) * 0.8);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(k, 5, 6161) * Math.PI);
      m4.compose(pos.set(x, -0.3, z), q, scale.set(r, h, r * (0.8 + hash(k, 6, 6161) * 0.4)));
      peaks.setMatrixAt(n, m4);
      // Green hills near, blue-grey rock on the big ones far off.
      leaf.setHex(0x5f8f4a).lerp(color.setHex(0x7d8a8f), far * 0.8).multiplyScalar(0.85 + hash(k, 7, 6161) * 0.25);
      peaks.setColorAt(n, leaf);
      n++;
    }
    q.identity();
    peaks.count = n;
    peaks.instanceMatrix.needsUpdate = true;
    if (peaks.instanceColor) peaks.instanceColor.needsUpdate = true;
  }
  /** Forest off the map round (cx, cz), near and middle rings both. */
  function buildForest(plan: CityPlan, cx: number, cz: number) {
    const region = plan.region!;
    let nt = 0;
    let np = 0;
    const R = FAR_BLOCKS;
    for (let x = cx - R; x <= cx + R; x += 2) {
      for (let z = cz - R; z <= cz + R; z += 2) {
        if (wildAt(region, x, z) !== "land") continue;
        // Clearings now and then, and none hard up against the map's edge.
        if (smoothNoise(x / 11, z / 11, 6363) < 0.32 || hash(x, z, 6364) < 0.15) continue;
        if (!wildAt(region, x + 2, z) || !wildAt(region, x - 2, z) || !wildAt(region, x, z + 2) || !wildAt(region, x, z - 2)) continue;
        const pine = hash(x, z, 6365) < 0.2;
        if ((pine ? np : nt) >= MAX_TREES) continue;
        const sz = 1.1 + hash(x, z, 6366) * 1.2;
        m4.compose(pos.set(x + (hash(x, z, 6367) - 0.5) * 1.4, -0.02, z + (hash(x, z, 6368) - 0.5) * 1.4), q, scale.set(sz * 1.5, sz, sz * 1.5));
        color.setHex(pine ? 0x2f6b3a : 0x3f8f45).multiplyScalar(0.8 + hash(x, z, 6369) * 0.35);
        if (pine) {
          pines.setMatrixAt(np, m4);
          pines.setColorAt(np++, color);
        } else {
          trees.setMatrixAt(nt, m4);
          trees.setColorAt(nt++, color);
        }
      }
    }
    trees.count = nt;
    pines.count = np;
    for (const m of [trees, pines]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
  let mapFor: CityPlan | null = null;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  /** Which painting is the latest (a new region stops an older one part way). */
  let painting = 0;

  /**
   * Paint the whole region (and the land and sea round it) onto one picture, once per region. A
   * few rows at a time between frames (all of Lagos State is about 1,800 × 380 tiles: painted at
   * once, a slow phone froze for a second or two), shown once it's done.
   */
  function paintMap(plan: CityPlan) {
    const token = ++painting;
    const region = plan.region!;
    const b = region.bounds;
    const x0 = b.x0 - MAP_MARGIN;
    const z0 = b.z0 - MAP_MARGIN;
    const W = b.x1 - b.x0 + 1 + 2 * MAP_MARGIN;
    const H = b.z1 - b.z0 + 1 + 2 * MAP_MARGIN;
    const canvas = document.createElement("canvas");
    // All of Lagos State is about 1,800 tiles across: one pixel a tile, so phones can draw it.
    const PX = Math.max(1, Math.min(PX_MOST, Math.floor(MAP_PX_MAX / Math.max(W, H))));
    canvas.width = W * PX;
    canvas.height = H * PX;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(canvas.width, canvas.height);
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    let tz = 0;
    const slice = () => {
      if (token !== painting) return;
      const until = performance.now() + 8;
      for (; tz < H && performance.now() < until; tz++) paintRow(tz);
      if (tz < H) setTimeout(slice, 0);
      else done();
    };
    const paintRow = (tz: number) => {
      for (let tx = 0; tx < W; tx++) {
        const x = x0 + tx;
        const z = z0 + tz;
        let c: number[];
        if (region.inside(x, z)) {
          const w = region.waterAt(x, z);
          if (w) {
            const byShore = !region.waterAt(x + 1, z) || !region.waterAt(x - 1, z) || !region.waterAt(x, z + 1) || !region.waterAt(x, z - 1);
            c = byShore ? COLORS.shore : w === 2 ? COLORS.sea : COLORS.lagoon;
          }
          else if (region.roadAt(x, z)) c = COLORS.road;
          else if (plan.xAt.has(x) || plan.zAt.has(z)) c = COLORS.street;
          else {
            const rough = roughAt(plan, x, z);
            c = !rough ? COLORS.street : rough.h < 0.5 ? COLORS.green : rough.h > 1.5 ? COLORS.town : COLORS.suburb;
          }
        } else {
          // Round the region: its sea carries on out from the coast; the land is countryside.
          const ex = clamp(x, b.x0, b.x1);
          const ez = clamp(z, b.z0, b.z1);
          const w = region.waterAt(ex, ez);
          c = w === 2 ? COLORS.sea : w === 1 && Math.hypot(x - ex, z - ez) < 6 ? COLORS.lagoon : COLORS.country;
        }
        // A little variation, so big areas aren't one flat colour.
        const n = 0.94 + smoothNoise(x / 9, z / 9, 77) * 0.08 + hash(x, z, 78) * 0.03;
        for (let py = 0; py < PX; py++) {
          for (let px = 0; px < PX; px++) {
            const o = ((tz * PX + py) * canvas.width + tx * PX + px) * 4;
            img.data[o] = Math.min(255, c[0] * n);
            img.data[o + 1] = Math.min(255, c[1] * n);
            img.data[o + 2] = Math.min(255, c[2] * n);
            img.data[o + 3] = 255;
          }
        }
      }
    };
    const done = () => {
      ctx.putImageData(img, 0, 0);
      mapMat.map?.dispose();
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      mapMat.map = tex;
      mapMat.needsUpdate = true;
      // Tile (x, z) covers x-0.5..x+0.5: the picture's corner is half a tile out.
      map.scale.set(W, 1, H);
      // Just above the city's plain ground disc (y -0.01), just below every tile's own ground.
      map.position.set(x0 - 0.5 + W / 2, -0.005, z0 - 0.5 + H / 2);
      map.visible = true;
    };
    slice();
  }

  return {
    /**
     * Draw the middle and far rings round (cx, cz): blocks from `inner` tiles out (the near ring
     * is drawn in full by the city view) to FAR_BLOCKS, the painted map under everything.
     */
    build(plan: CityPlan, cx: number, cz: number, inner: number) {
      if (!plan.region) return this.clear();
      if (mapFor !== plan) {
        paintMap(plan);
        mapFor = plan;
      }
      const region = plan.region;
      if (peaksFor !== plan) {
        buildPeaks(plan);
        peaksFor = plan;
      }
      buildForest(plan, cx, cz);
      let n = 0;
      const put = (x: number, z: number, size: number) => {
        // A 2×2 block takes its tallest tile's height, and sits over all four.
        let best: { h: number; color: number } | null = null;
        for (let dx = 0; dx < size; dx++) {
          for (let dz = 0; dz < size; dz++) {
            if (!region.inside(x + dx, z + dz)) continue;
            const r = roughAt(plan, x + dx, z + dz);
            if (r && (!best || r.h > best.h)) best = r;
          }
        }
        if (!best || n >= MAX_BLOCKS) return;
        const c = (size - 1) / 2;
        const foot = size === 1 ? 0.78 : 1.6;
        m4.compose(pos.set(x + c, 0, z + c), q, scale.set(foot, best.h, foot));
        blocks.setMatrixAt(n, m4);
        blocks.setColorAt(n, color.setHex(best.color));
        n++;
      };
      // Nearest first, so if the cap is ever reached it's the furthest that go. The single blocks
      // cover an even width, so the 2×2 ones round them line up with no gap.
      const lo = (c: number) => c - FINE_BLOCKS;
      const hi = (c: number) => c + FINE_BLOCKS + 1;
      for (let x = lo(cx); x <= hi(cx); x++) {
        for (let z = lo(cz); z <= hi(cz); z++) {
          if (Math.abs(x - cx) <= inner && Math.abs(z - cz) <= inner) continue;
          put(x, z, 1);
        }
      }
      const a = cx - FAR_BLOCKS;
      const c0 = cz - FAR_BLOCKS;
      for (let x = a; x < cx + FAR_BLOCKS; x += 2) {
        for (let z = c0; z < cz + FAR_BLOCKS; z += 2) {
          if (x + 1 >= lo(cx) && x <= hi(cx) && z + 1 >= lo(cz) && z <= hi(cz)) continue;
          put(x, z, 2);
        }
      }
      blocks.count = n;
      // Decks of bridges in the middle ring (the near ring draws its own in full).
      let d = 0;
      const tilt = new THREE.Quaternion();
      const zAxis = new THREE.Vector3(0, 0, 1);
      const yAxis = new THREE.Vector3(0, 1, 0);
      for (let x = cx - FAR_BLOCKS; x <= cx + FAR_BLOCKS && d < MAX_DECKS; x++) {
        for (let z = cz - FAR_BLOCKS; z <= cz + FAR_BLOCKS && d < MAX_DECKS; z++) {
          if (Math.abs(x - cx) <= inner && Math.abs(z - cz) <= inner) continue;
          for (const p of region.piecesAt(x, z) ?? []) {
            if (p.ground || d >= MAX_DECKS) continue;
            const dx = p.bx - p.ax;
            const dz = p.bz - p.az;
            const flat = Math.hypot(dx, dz);
            q.setFromAxisAngle(yAxis, -Math.atan2(dz, dx)).multiply(tilt.setFromAxisAngle(zAxis, Math.atan2(p.by - p.ay, flat)));
            m4.compose(pos.set((p.ax + p.bx) / 2, (p.ay + p.by) / 2 - 0.07, (p.az + p.bz) / 2), q, scale.set(Math.hypot(flat, p.by - p.ay) + 0.02, 0.07, p.width));
            decks.setMatrixAt(d++, m4);
            if (p.pier && d < MAX_DECKS) {
              q.identity();
              m4.compose(pos.set(p.ax, 0, p.az), q, scale.set(0.09, Math.max(0.05, p.ay - 0.08), 0.09));
              decks.setMatrixAt(d++, m4);
            }
          }
        }
      }
      decks.count = d;
      decks.instanceMatrix.needsUpdate = true;
      q.identity();
      blocks.instanceMatrix.needsUpdate = true;
      if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
      group.visible = true;
    },
    clear() {
      group.visible = false;
      blocks.count = 0;
    },
    /** How many blocks are drawn (for the budget checks). */
    get count() {
      return blocks.count;
    },
    dispose() {
      parent.remove(group);
      blocks.geometry.dispose();
      decks.geometry.dispose();
      (decks.material as THREE.Material).dispose();
      blockMat.dispose();
      treeGeo.dispose();
      pineGeo.dispose();
      peaks.geometry.dispose();
      wildMat.dispose();
      map.geometry.dispose();
      mapMat.map?.dispose();
      mapMat.dispose();
    },
  };
}
