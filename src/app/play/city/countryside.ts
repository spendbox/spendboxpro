// The countryside round the town, made up as you ride. When you're on a train, a bus, a car or a
// boat and look out past the edge of town, the land is farmland and villages in the style of the
// country the town is in: palms and red earth in Nigeria and Ghana, savanna with acacias and
// round huts in Kenya and South Africa, hedgerows, sheep and stone cottages in Britain, big
// cornfields, red barns and silos in America. It's built in square patches round the camera from
// a handful of shared instanced shapes and refilled as you move, so it costs about the same
// however far you go, and nothing at all when you're not riding.

import * as THREE from "three";
import { hash, type CityPlan } from "@/lib/city/layout";

type Pool = { mesh: THREE.InstancedMesh; n: number };

const CHUNK = 8;
const REACH = 6;

export type CountrysideHost = {
  parent: THREE.Object3D;
  /** Height of the land at (x, z). */
  ground: (x: number, z: number) => number;
  plan: () => CityPlan | null;
  /** Half the width of the built town (the countryside starts beyond it). */
  half: () => number;
  /** How far out from the town's edge the land stays flat (farmland); hills beyond. */
  flat: () => number;
  /** Is (x, z) kept clear (the railway out of town, a landmark)? */
  reserved: (x: number, z: number) => boolean;
};

/** What the land looks like in each country (flavour id from places.ts). */
type Region = {
  fields: number[];
  hedge: number;
  tree: "palm" | "acacia" | "round" | "pine";
  walls: number[];
  roofs: number[];
  huts: boolean;
  animals: { color: number; tall?: boolean }[];
  barn: boolean;
};

const REGIONS: Record<string, Region> = {
  ng: {
    fields: [0x7fb24a, 0x9cc45a, 0xb5793f, 0x6e9e3a, 0xc9a65a],
    hedge: 0x3f7d2c,
    tree: "palm",
    walls: [0xd9b48a, 0xe8d3b0, 0xc98f5e, 0xf1e6d0],
    roofs: [0x8a8f96, 0xa0522d, 0x6b7b8c],
    huts: false,
    animals: [{ color: 0xf1f3f5 }, { color: 0x8b5a2b }],
    barn: false,
  },
  gh: {
    fields: [0x86b84f, 0xa3c45c, 0xb87a43, 0x5e9a3b],
    hedge: 0x3f7d2c,
    tree: "palm",
    walls: [0xe6c79a, 0xf1e1c4, 0xd19a66],
    roofs: [0x8a8f96, 0xb5523b],
    huts: false,
    animals: [{ color: 0xf1f3f5 }, { color: 0x6b4430 }],
    barn: false,
  },
  ke: {
    fields: [0xc9b26b, 0xb9a45c, 0x9fae5a, 0xd4c27e],
    hedge: 0x6b8e3a,
    tree: "acacia",
    walls: [0xc98f5e, 0xd9b48a],
    roofs: [0xb08d57, 0x8a6a3a],
    huts: true,
    animals: [{ color: 0xd9a441, tall: true }, { color: 0x3a3a3a }, { color: 0xf1f3f5 }],
    barn: false,
  },
  za: {
    fields: [0xc7b56f, 0xa9b562, 0x8faa52, 0xd8c785],
    hedge: 0x5f8a36,
    tree: "acacia",
    walls: [0xf1e6d0, 0xe0c9a6],
    roofs: [0x8a6a3a, 0x9c3d2e],
    huts: true,
    animals: [{ color: 0x3a3a3a }, { color: 0xd9a441, tall: true }, { color: 0xf1f3f5 }],
    barn: false,
  },
  uk: {
    fields: [0x7cb35a, 0x93c46a, 0x6aa04c, 0xd9c26a, 0xa8c66c],
    hedge: 0x3e6e2f,
    tree: "round",
    walls: [0xd8cfc0, 0xc2b6a3, 0xe9e2d4],
    roofs: [0x5c6b73, 0x7a4b3a],
    huts: false,
    animals: [{ color: 0xf8f9fa }, { color: 0xf1f3f5 }, { color: 0x343a40 }],
    barn: false,
  },
  us: {
    fields: [0xe0c35a, 0x8fbf4f, 0xd8b04a, 0x6fa846, 0xb88a4a],
    hedge: 0x4b7a32,
    tree: "pine",
    walls: [0xf1f3f5, 0xe9ecef, 0xd9c7a7],
    roofs: [0x495057, 0x7a4b3a],
    huts: false,
    animals: [{ color: 0x6b4430 }, { color: 0x212529 }, { color: 0xf1f3f5 }],
    barn: true,
  },
};

export function regionOf(plan: CityPlan | null): Region {
  return REGIONS[plan?.city.flavor.id ?? "ng"] ?? REGIONS.ng;
}

export function createCountryside(host: CountrysideHost) {
  const group = new THREE.Group();
  host.parent.add(group);
  const lambert = (flat = false) => new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: flat });
  const pool = (geo: THREE.BufferGeometry, cap: number, flat = false, shadow = false): Pool => {
    const mesh = new THREE.InstancedMesh(geo, lambert(flat), cap);
    mesh.count = 0;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.setColorAt(0, new THREE.Color());
    group.add(mesh);
    return { mesh, n: 0 };
  };
  const box = pool(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 6000);
  const roof = pool(new THREE.CylinderGeometry(0, 1, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0), 900, true, true);
  const crown = pool(new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0), 3500, true, true);
  const trunk = pool(new THREE.CylinderGeometry(0.05, 0.07, 1, 5).translate(0, 0.5, 0), 3500);
  const cone = pool(new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0), 1200, true, true);
  const cyl = pool(new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0), 900, false, true);
  const pools = [box, roof, crown, trunk, cone, cyl];

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  const put = (p: Pool, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, color: number) => {
    if (p.n >= p.mesh.instanceMatrix.count) return;
    q.setFromAxisAngle(up, ry);
    m4.compose(v.set(x, y, z), q, s.set(sx, sy, sz));
    p.mesh.setMatrixAt(p.n, m4);
    p.mesh.setColorAt(p.n, col.setHex(color));
    p.n++;
  };

  let key = "";
  let shown = false;

  function tree(region: Region, x: number, z: number, size: number, k: number) {
    const g = host.ground(x, z);
    const leaf = [0x2f9e44, 0x37b24d, 0x40c057, 0x2b8a3e][k % 4];
    switch (region.tree) {
      case "palm":
        put(trunk, x, g, z, size * 0.9, size * 1.3, size * 0.9, 0, 0x8d6e4a);
        put(crown, x, g + size * 1.15, z, size * 0.9, size * 0.28, size * 0.9, k, 0x2f9e44);
        put(crown, x, g + size * 1.22, z, size * 0.6, size * 0.25, size * 0.6, k + 1, 0x37b24d);
        break;
      case "acacia":
        put(trunk, x, g, z, size * 0.8, size * 0.8, size * 0.8, 0, 0x6b4f35);
        put(crown, x, g + size * 0.7, z, size * 1.3, size * 0.22, size * 1.1, k, 0x6b8e23);
        break;
      case "pine":
        put(trunk, x, g, z, size * 0.7, size * 0.35, size * 0.7, 0, 0x6b4f35);
        put(cone, x, g + size * 0.2, z, size * 0.6, size * 1.1, size * 0.6, 0, 0x2b6e3a);
        break;
      default:
        put(trunk, x, g, z, size, size * 0.45, size, 0, 0x7a5a3f);
        put(crown, x, g + size * 0.3, z, size * 0.75, size * 0.85, size * 0.75, k, leaf);
    }
  }

  function house(region: Region, x: number, z: number, ry: number, k: number) {
    const g = host.ground(x, z);
    if (region.huts && k % 2 === 0) {
      // A round hut with a thatched roof.
      put(cyl, x, g, z, 0.36, 0.22, 0.36, 0, region.walls[k % region.walls.length]);
      put(cone, x, g + 0.22, z, 0.46, 0.24, 0.46, 0, 0xb08d57);
      return;
    }
    const w = 0.36 + (k % 3) * 0.06;
    put(box, x, g, z, w, 0.24, 0.3, ry, region.walls[k % region.walls.length]);
    put(roof, x, g + 0.24, z, (w + 0.06) / Math.SQRT2, 0.16, 0.36 / Math.SQRT2, ry, region.roofs[k % region.roofs.length]);
  }

  /** One square patch of countryside. */
  function chunk(region: Region, cx: number, cz: number, seed: number, half: number, flat: number) {
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const h = (k: number) => hash(cx * 7 + k, cz * 13 - k, seed + 4401);
    // How far out from the town's edge this patch is (fields only in the flat band).
    const edge = (x: number, z: number) => Math.max(Math.abs(x), Math.abs(z)) - half;
    const mid = edge(x0 + CHUNK / 2, z0 + CHUNK / 2);
    if (mid < 1.5) return;
    const farm = mid < flat - 1;
    const clear = (x: number, z: number) => edge(x, z) > 0.8 && !host.reserved(x, z);
    if (farm) {
      // A patchwork of fields (2×2 or 3×2), with tracks between them and hedges round some.
      const nx = h(1) < 0.5 ? 2 : 3;
      const nz = 2;
      const fw = CHUNK / nx;
      const fd = CHUNK / nz;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const fx = x0 + (i + 0.5) * fw;
          const fz = z0 + (j + 0.5) * fd;
          if (!clear(fx, fz)) continue;
          const g = Math.max(host.ground(fx - fw / 2, fz - fd / 2), host.ground(fx + fw / 2, fz + fd / 2), host.ground(fx, fz));
          const crop = region.fields[Math.floor(h(10 + i * 3 + j) * region.fields.length) % region.fields.length];
          put(box, fx, g, fz, fw - 0.18, 0.03, fd - 0.18, 0, crop);
          // Rows in the crop.
          const rows = 4;
          const along = h(20 + i + j) < 0.5;
          for (let r = 0; r < rows; r++) {
            const o = ((r + 0.5) / rows - 0.5) * (along ? fd - 0.4 : fw - 0.4);
            put(box, fx + (along ? 0 : o), g + 0.03, fz + (along ? o : 0), along ? fw - 0.4 : 0.06, 0.008, along ? 0.06 : fd - 0.4, 0, darken(crop));
          }
          // Hedges or a line of trees along one side.
          if (h(30 + i + j * 5) < 0.45) {
            for (let t = 0; t < 5; t++) {
              const tx = fx - fw / 2 + 0.2 + (t / 4) * (fw - 0.4);
              const tz = fz - fd / 2 + 0.1;
              if (clear(tx, tz)) put(crown, tx, host.ground(tx, tz), tz, 0.45, 0.35, 0.45, t, region.hedge);
            }
          }
          // Animals grazing in some of the greener fields.
          if (h(40 + i + j) < 0.28) {
            for (let a = 0; a < 3; a++) {
              const ax = fx + (h(50 + a) - 0.5) * (fw - 0.8);
              const az = fz + (h(60 + a) - 0.5) * (fd - 0.8);
              const kind = region.animals[(a + Math.floor(h(70) * 3)) % region.animals.length];
              const ag = host.ground(ax, az) + 0.03;
              const ry = h(80 + a) * Math.PI * 2;
              if (kind.tall) {
                // A giraffe: legs, a long neck, a head.
                put(box, ax, ag, az, 0.12, 0.2, 0.06, ry, kind.color);
                put(box, ax + Math.cos(ry) * 0.05, ag + 0.2, az - Math.sin(ry) * 0.05, 0.03, 0.26, 0.03, ry, kind.color);
                put(box, ax + Math.cos(ry) * 0.08, ag + 0.44, az - Math.sin(ry) * 0.08, 0.07, 0.04, 0.035, ry, kind.color);
              } else {
                put(box, ax, ag + 0.05, az, 0.13, 0.07, 0.06, ry, kind.color);
                put(box, ax + Math.cos(ry) * 0.08, ag + 0.08, az - Math.sin(ry) * 0.08, 0.045, 0.045, 0.045, ry, kind.color);
                for (const lx of [-0.04, 0.04]) put(box, ax + Math.cos(ry) * lx, ag, az - Math.sin(ry) * lx, 0.02, 0.05, 0.05, ry, 0x343a40);
              }
            }
          }
        }
      }
      // Dirt tracks between the fields.
      put(box, x0 + CHUNK / 2, host.ground(x0 + CHUNK / 2, z0 + CHUNK / 2) - 0.005, z0 + CHUNK / 2, CHUNK, 0.03, 0.12, 0, 0xb59b7a);
      // A farm (a house, a barn or store, and in America a silo) in about a third of patches.
      const fxm = x0 + 1.5 + h(90) * (CHUNK - 3);
      const fzm = z0 + 1.5 + h(91) * (CHUNK - 3);
      if (h(92) < 0.35 && clear(fxm, fzm) && clear(fxm + 0.8, fzm)) {
        house(region, fxm, fzm, 0, Math.floor(h(93) * 6));
        const g = host.ground(fxm + 0.8, fzm);
        if (region.barn) {
          put(box, fxm + 0.8, g, fzm, 0.5, 0.34, 0.4, 0, 0xb02a2a);
          put(roof, fxm + 0.8, g + 0.34, fzm, 0.55 / Math.SQRT2, 0.2, 0.45 / Math.SQRT2, 0, 0x495057);
          put(cyl, fxm + 1.25, g, fzm - 0.2, 0.2, 0.75, 0.2, 0, 0xdee2e6);
          put(cone, fxm + 1.25, g + 0.75, fzm - 0.2, 0.22, 0.12, 0.22, 0, 0xadb5bd);
        } else {
          put(box, fxm + 0.8, g, fzm, 0.42, 0.2, 0.32, 0, region.walls[1 % region.walls.length]);
          put(box, fxm + 0.8, g + 0.2, fzm, 0.46, 0.02, 0.36, 0, region.roofs[0]);
        }
        for (let b = 0; b < 3; b++) put(cyl, fxm - 0.3 + b * 0.16, g, fzm + 0.45, 0.12, 0.1, 0.12, 0, 0xd9b44a);
        tree(region, fxm - 0.55, fzm - 0.4, 0.8, 1);
      }
      // A village now and then: houses round a little square, a tall tree, a place of worship.
      if (h(95) < 0.1) {
        const vx = x0 + CHUNK / 2;
        const vz = z0 + CHUNK / 2;
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2 + h(96);
          const hx = vx + Math.cos(a) * 1.3;
          const hz = vz + Math.sin(a) * 1.3;
          if (clear(hx, hz)) house(region, hx, hz, -a, k);
        }
        if (clear(vx, vz)) {
          const g = host.ground(vx, vz);
          put(box, vx, g, vz, 0.3, 0.32, 0.4, 0, 0xf1ece2);
          put(cone, vx, g + 0.32, vz + 0.12, 0.12, 0.45, 0.12, 0, 0x5c6b73);
        }
      }
    }
    // Trees scattered about (more of them on the hills further out).
    const trees = farm ? 6 : 12;
    for (let k = 0; k < trees; k++) {
      const tx = x0 + h(100 + k) * CHUNK;
      const tz = z0 + h(130 + k) * CHUNK;
      if (!clear(tx, tz)) continue;
      tree(region, tx, tz, 0.7 + h(160 + k) * 0.6, k);
    }
  }

  function darken(c: number) {
    const r = ((c >> 16) & 255) * 0.82;
    const g = ((c >> 8) & 255) * 0.82;
    const b = (c & 255) * 0.82;
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }

  /**
   * Called every frame: while riding, fill the patches round the camera (only when it has moved
   * on to a new patch); otherwise keep it all hidden.
   */
  function update(camera: THREE.Vector3, riding: boolean, seed: number) {
    if (!riding) {
      if (shown) {
        group.visible = false;
        shown = false;
      }
      return;
    }
    const plan = host.plan();
    const half = host.half();
    const cx = Math.floor(camera.x / CHUNK);
    const cz = Math.floor(camera.z / CHUNK);
    const k = `${seed}|${half}|${cx}|${cz}`;
    if (!shown) {
      group.visible = true;
      shown = true;
    }
    if (k === key) return;
    key = k;
    for (const p of pools) p.n = 0;
    const region = regionOf(plan);
    const flat = host.flat();
    for (let dx = -REACH; dx <= REACH; dx++) {
      for (let dz = -REACH; dz <= REACH; dz++) chunk(region, cx + dx, cz + dz, seed, half, flat);
    }
    for (const p of pools) {
      p.mesh.count = p.n;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }

  /** The town changed (a new round, or it grew): start again next frame. */
  function reset() {
    key = "";
  }

  function dispose() {
    group.removeFromParent();
    for (const p of pools) {
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
      p.mesh.dispose();
    }
  }

  group.visible = false;
  return { update, reset, dispose };
}
