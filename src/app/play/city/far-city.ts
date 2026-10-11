// The city far from the camera, kept to a strict budget so a zoomed-out or tilted view stays
// quick on any phone. Three rings round the camera:
//   near: every detail (city-view draws those tiles in full);
//   middle: one plain block per building (two by two tiles further out), about 10 triangles each;
//   far: one flat painted map of the whole region and the land round it (2 triangles), so the
//   horizon is never empty.
// Only for real places (src/lib/world): their map says what's land, water and road everywhere.

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
/** Pixels per tile on the painted map. */
const PX = 2;

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
  country: [0xb9, 0xcf, 0x9a],
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
  let mapFor: CityPlan | null = null;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  /** Paint the whole region (and the land and sea round it) onto one picture, once per region. */
  function paintMap(plan: CityPlan) {
    const region = plan.region!;
    const b = region.bounds;
    const x0 = b.x0 - MAP_MARGIN;
    const z0 = b.z0 - MAP_MARGIN;
    const W = b.x1 - b.x0 + 1 + 2 * MAP_MARGIN;
    const H = b.z1 - b.z0 + 1 + 2 * MAP_MARGIN;
    const canvas = document.createElement("canvas");
    canvas.width = W * PX;
    canvas.height = H * PX;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(canvas.width, canvas.height);
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    for (let tz = 0; tz < H; tz++) {
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
    }
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
      map.geometry.dispose();
      mapMat.map?.dispose();
      mapMat.dispose();
    },
  };
}
