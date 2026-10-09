// Open water (rivers, lakes, the sea, the water under bridges and causeways) drawn as one smooth
// surface instead of a square per tile: the shoreline follows a softened outline of the water
// tiles (rounded corners, a gentle wobble), with a band of sand where the water meets the land,
// and the colour deepens from pale shallows by the shore to deep blue in the middle. One mesh,
// rebuilt with the city, a few thousand triangles: cheap on any phone.

import * as THREE from "three";
import { hash, type Tile } from "@/lib/city/layout";

/** Is this tile open water (or a road or bridge over water)? */
export function isWaterTile(t: Tile) {
  return t.kind === "river" || t.kind === "lake" || t.kind === "bridge" || (t.kind === "road" && !!t.causeway);
}

const SAND = new THREE.Color(0xe8d7a8);
const SHALLOW = new THREE.Color(0x9edcf2);
const MID = new THREE.Color(0x4fb0e3);
const DEEP = new THREE.Color(0x2479bd);
const SEA_DEEP = new THREE.Color(0x1a5f9e);

/** Where the water surface stops (0..1 of the softened field): a little in from the tile edge. */
const LEVEL = 0.6;
/** Sub-steps per tile along the shore. */
const STEPS = 4;
/** How deep (in tiles from the shore) the colour keeps darkening. */
const MAX_DEPTH = 4;

const key = (x: number, z: number) => `${x},${z}`;

/** A smooth little wobble (so shores aren't ruler-straight), the same everywhere for a seed. */
function wobble(x: number, z: number, seed: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number) => hash(a, b, seed + 7311);
  const top = h(xi, zi) + (h(xi + 1, zi) - h(xi, zi)) * sx;
  const bot = h(xi, zi + 1) + (h(xi + 1, zi + 1) - h(xi, zi + 1)) * sx;
  return top + (bot - top) * sz - 0.5;
}

export function buildWater(tiles: readonly Tile[], seed: number): THREE.Group | null {
  const water = new Map<string, Tile>();
  for (const t of tiles) if (isWaterTile(t)) water.set(key(t.x, t.z), t);
  if (!water.size) return null;

  // How far each water tile is from the shore (in tiles), for the colour.
  const depth = new Map<string, number>();
  let frontier: Tile[] = [];
  for (const t of water.values()) {
    const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !water.has(key(t.x + dx, t.z + dz)));
    if (shore) {
      depth.set(key(t.x, t.z), 1);
      frontier.push(t);
    }
  }
  for (let d = 2; d <= MAX_DEPTH && frontier.length; d++) {
    const next: Tile[] = [];
    for (const t of frontier) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = key(t.x + dx, t.z + dz);
        const n = water.get(k);
        if (n && !depth.has(k)) {
          depth.set(k, d);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  const wetAt = (x: number, z: number) => (water.has(key(x, z)) ? 1 : 0);
  const depthAt = (x: number, z: number) => (water.has(key(x, z)) ? (depth.get(key(x, z)) ?? MAX_DEPTH) : 0);
  const seaAt = (x: number, z: number) => !!water.get(key(x, z))?.sea;

  // The softened field at any point: tile centres blended (bilinear), plus a gentle wobble.
  const bilinear = (f: (x: number, z: number) => number, x: number, z: number) => {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const fx = x - x0;
    const fz = z - z0;
    const a = f(x0, z0) + (f(x0 + 1, z0) - f(x0, z0)) * fx;
    const b = f(x0, z0 + 1) + (f(x0 + 1, z0 + 1) - f(x0, z0 + 1)) * fx;
    return a + (b - a) * fz;
  };
  const field = (x: number, z: number) => bilinear(wetAt, x, z) + wobble(x * 1.7, z * 1.7, seed) * 0.22;

  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const colourAt = (x: number, z: number, out: THREE.Color) => {
    const d = bilinear(depthAt, x, z) / MAX_DEPTH;
    const deep = seaAt(Math.round(x), Math.round(z)) ? SEA_DEEP : DEEP;
    if (d < 0.35) out.copy(SHALLOW).lerp(MID, d / 0.35);
    else out.copy(MID).lerp(deep, Math.min(1, (d - 0.35) / 0.65));
    return out;
  };
  const Y = 0.004;
  const vert = (x: number, z: number) => {
    pos.push(x, Y, z);
    colourAt(x, z, c);
    col.push(c.r, c.g, c.b);
  };
  const tri = (a: [number, number], b: [number, number], d: [number, number]) => {
    // Counter-clockwise seen from above (so the faces point up).
    vert(a[0], a[1]);
    vert(d[0], d[1]);
    vert(b[0], b[1]);
  };

  // The sand under it all: a square per water tile, a touch lower.
  const sandPos: number[] = [];
  for (const t of water.values()) {
    const x0 = t.x - 0.5;
    const x1 = t.x + 0.5;
    const z0 = t.z - 0.5;
    const z1 = t.z + 0.5;
    sandPos.push(x0, 0, z0, x0, 0, z1, x1, 0, z1, x0, 0, z0, x1, 0, z1, x1, 0, z0);
  }

  for (const t of water.values()) {
    // Deep inside the water (every neighbour wet): one quad, coloured at its corners.
    let inner = true;
    for (let dx = -1; dx <= 1 && inner; dx++) for (let dz = -1; dz <= 1 && inner; dz++) inner = water.has(key(t.x + dx, t.z + dz));
    if (inner) {
      const a: [number, number] = [t.x - 0.5, t.z - 0.5];
      const b: [number, number] = [t.x + 0.5, t.z - 0.5];
      const d: [number, number] = [t.x + 0.5, t.z + 0.5];
      const e: [number, number] = [t.x - 0.5, t.z + 0.5];
      tri(a, b, d);
      tri(a, d, e);
      continue;
    }
    // By the shore: marching squares on small steps, filling where the field is over LEVEL.
    const h = 1 / STEPS;
    for (let i = 0; i < STEPS; i++) {
      for (let j = 0; j < STEPS; j++) {
        const x0 = t.x - 0.5 + i * h;
        const z0 = t.z - 0.5 + j * h;
        const corners: [number, number][] = [
          [x0, z0],
          [x0 + h, z0],
          [x0 + h, z0 + h],
          [x0, z0 + h],
        ];
        const v = corners.map(([x, z]) => field(x, z));
        const inside = v.map((f) => f >= LEVEL);
        if (!inside.some(Boolean)) continue;
        const poly: [number, number][] = [];
        for (let k = 0; k < 4; k++) {
          const n = (k + 1) % 4;
          if (inside[k]) poly.push(corners[k]);
          if (inside[k] !== inside[n]) {
            const s = (LEVEL - v[k]) / (v[n] - v[k]);
            poly.push([corners[k][0] + (corners[n][0] - corners[k][0]) * s, corners[k][1] + (corners[n][1] - corners[k][1]) * s]);
          }
        }
        for (let k = 1; k + 1 < poly.length; k++) tri(poly[0], poly[k], poly[k + 1]);
      }
    }
  }

  const group = new THREE.Group();
  const sandGeo = new THREE.BufferGeometry();
  sandGeo.setAttribute("position", new THREE.Float32BufferAttribute(sandPos, 3));
  sandGeo.computeVertexNormals();
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshLambertMaterial({ color: SAND }));
  sand.receiveShadow = true;
  group.add(sand);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const surface = new THREE.Mesh(
    geo,
    // A soft sheen, not a mirror: a big flat surface catches the sun from above otherwise.
    new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 140, specular: 0x3a5f80, emissive: 0x0b2a44, emissiveIntensity: 0.12 }),
  );
  surface.receiveShadow = true;
  surface.userData.water = true;
  group.add(surface);
  return group;
}

/** Frees a water group's geometry and materials. */
export function disposeWater(group: THREE.Group | null) {
  if (!group) return;
  group.removeFromParent();
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}
